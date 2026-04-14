import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import staticFiles from '@fastify/static';
import basicAuth from '@fastify/basic-auth';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

import { loadConfig } from './config/loader.js';
import { collectAll } from './git/collector.js';
import { parseRepoData } from './git/parser.js';
import { generateSummary, clearCache } from './ai/summarizer.js';
import { buildMarkdownReport, buildJsonReport } from './reports/generator.js';
import { saveReport, listReports, getReport, getTodaysReport, clearTodaysReports, saveRepoContext, getRepoContext, listRepoContexts } from './storage/db.js';
import { readRepoInfo } from './git/context-reader.js';
import { generateRepoContext } from './ai/context-generator.js';
import { sendSlackNotification } from './notifications/slack.js';
import { sendEmailNotification } from './notifications/email.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// --- Load config ---
let config;
try {
  config = loadConfig();
} catch (err) {
  console.error(`[gitpulse] Config error: ${err.message}`);
  process.exit(1);
}

// --- In-memory data cache (separate from AI cache) ---
let dataCache = null;
let dataCacheAt = null;
const DATA_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// Builds a { repoName: contextString } map from DB + manual config entries
function buildRepoContexts() {
  const map = {};
  for (const repo of config.repos) {
    if (repo.context && repo.context !== 'auto') {
      // Manual context set directly in config
      map[repo.name] = repo.context;
    } else {
      // Try DB (covers both 'auto'-generated and any previously saved)
      const stored = getRepoContext(repo.name);
      if (stored) map[repo.name] = stored.context;
    }
  }
  return map;
}

async function getActivityData() {
  if (dataCache && Date.now() - dataCacheAt < DATA_CACHE_TTL_MS) {
    return dataCache;
  }
  const raw = await collectAll(config);
  dataCache = parseRepoData(raw);
  dataCacheAt = Date.now();
  return dataCache;
}

// --- Fastify setup ---
const app = Fastify({ logger: false });

await app.register(cors, { origin: true });

// Serve public/ as static files
await app.register(staticFiles, {
  root: join(__dirname, '..', 'public'),
  prefix: '/',
});

// Optional basic auth
if (config.auth.enabled) {
  await app.register(basicAuth, {
    validate(username, password, _req, _reply, done) {
      if (username === config.auth.username && password === config.auth.password) {
        done();
      } else {
        done(new Error('Unauthorized'));
      }
    },
    authenticate: true,
  });
  app.addHook('onRequest', app.basicAuth);
}

// --- Routes ---

app.get('/api/health', async () => ({
  status: 'ok',
  version: '1.1.0',
  uptime: process.uptime(),
}));

app.get('/api/repos', async () => ({
  repos: config.repos.map((r) => ({ name: r.name, branch: r.branch })),
}));

app.get('/api/activity', async (_req, reply) => {
  try {
    const data = await getActivityData();
    return reply.send(data);
  } catch (err) {
    reply.status(500).send({ error: err.message });
  }
});

app.get('/api/activity/:repo', async (req, reply) => {
  try {
    const data = await getActivityData();
    const repoName = req.params.repo;
    const repoData = data.repos.find((r) => r.name.toLowerCase() === repoName.toLowerCase());
    if (!repoData) {
      return reply.status(404).send({ error: `Repo "${repoName}" not found` });
    }
    const commits = data.allCommits.filter((c) => c.repo.toLowerCase() === repoName.toLowerCase());
    return reply.send({ ...repoData, commits });
  } catch (err) {
    reply.status(500).send({ error: err.message });
  }
});

const VALID_STYLES = ['standup', 'management', 'technical'];

app.get('/api/summary', async (req, reply) => {
  try {
    const styleParam = req.query.style;
    const style = VALID_STYLES.includes(styleParam) ? styleParam : (config.ai.summary_style ?? 'standup');
    const force = req.query.force === 'true';

    // Serve from DB if we already generated one today for this style
    if (!force) {
      const cached = getTodaysReport(style);
      if (cached?.summary) {
        return reply.send({ ...cached.summary, source: 'db' });
      }
    }

    if (!config.ai.enabled) {
      return reply.send({ enabled: false, message: 'AI summaries are disabled' });
    }

    const data = await getActivityData();
    const repoContexts = buildRepoContexts();
    const summary = await generateSummary(data, config.ai, style, repoContexts);
    if (!summary) {
      return reply.send({ enabled: false, message: 'AI summary could not be generated' });
    }

    try {
      saveReport({
        style: summary.style,
        provider: summary.provider,
        model: summary.model,
        stats: data.stats,
        summary,
        fullData: { stats: data.stats, byAuthor: data.byAuthor, byDay: data.byDay, hotFiles: data.hotFiles },
      });
    } catch (_) { /* non-fatal */ }

    return reply.send({ ...summary, source: 'live' });
  } catch (err) {
    reply.status(500).send({ error: err.message });
  }
});

app.get('/api/history', async (req, reply) => {
  try {
    const limit = Math.min(parseInt(req.query.limit ?? '50', 10), 200);
    return reply.send({ reports: listReports(limit) });
  } catch (err) {
    reply.status(500).send({ error: err.message });
  }
});

app.get('/api/history/:id', async (req, reply) => {
  try {
    const report = getReport(parseInt(req.params.id, 10));
    if (!report) return reply.status(404).send({ error: 'Report not found' });
    return reply.send(report);
  } catch (err) {
    reply.status(500).send({ error: err.message });
  }
});

app.get('/api/report.md', async (req, reply) => {
  try {
    const styleParam = req.query.style;
    const style = VALID_STYLES.includes(styleParam) ? styleParam : null;
    const data = await getActivityData();
    const summary = await generateSummary(data, config.ai, style);
    const md = buildMarkdownReport(data, summary, config);
    reply.header('Content-Type', 'text/markdown; charset=utf-8');
    reply.header('Content-Disposition', 'attachment; filename="gitpulse-report.md"');
    return reply.send(md);
  } catch (err) {
    reply.status(500).send({ error: err.message });
  }
});

app.get('/api/report.json', async (req, reply) => {
  try {
    const styleParam = req.query.style;
    const style = VALID_STYLES.includes(styleParam) ? styleParam : null;
    const data = await getActivityData();
    const summary = await generateSummary(data, config.ai, style);
    return reply.send(buildJsonReport(data, summary, config));
  } catch (err) {
    reply.status(500).send({ error: err.message });
  }
});

app.post('/api/refresh', async (_req, reply) => {
  dataCache = null;
  dataCacheAt = null;
  clearCache();
  clearTodaysReports(); // force next /api/summary call to regenerate via AI
  try {
    const data = await getActivityData();
    return reply.send({ ok: true, stats: data.stats, refreshedAt: new Date().toISOString() });
  } catch (err) {
    reply.status(500).send({ error: err.message });
  }
});

app.get('/api/contexts', async (_req, reply) => {
  try {
    return reply.send({ contexts: listRepoContexts() });
  } catch (err) {
    reply.status(500).send({ error: err.message });
  }
});

// POST /api/init — generates AI context for every repo with context: "auto" in config.
// Skips repos with manual context strings. Safe to re-run (upserts).
app.post('/api/init', async (_req, reply) => {
  if (!config.ai.enabled) {
    return reply.status(400).send({ error: 'AI is disabled. Set ai.enabled: true in config.' });
  }

  const autoRepos = config.repos.filter((r) => r.context === 'auto');
  if (!autoRepos.length) {
    return reply.send({ message: 'No repos have context: auto. Add context: auto to repos in config.', results: [] });
  }

  const results = [];

  for (const repo of autoRepos) {
    try {
      console.log(`[gitpulse] init: reading ${repo.name}...`);
      const info = await readRepoInfo(repo);
      const context = await generateRepoContext(info, config.ai);
      saveRepoContext({ repo: repo.name, context, source: 'auto', model: config.ai.model });
      console.log(`[gitpulse] init: ${repo.name} → "${context}"`);
      results.push({ repo: repo.name, context, status: 'ok' });
    } catch (err) {
      console.error(`[gitpulse] init: ${repo.name} failed — ${err.message}`);
      results.push({ repo: repo.name, error: err.message, status: 'error' });
    }
  }

  return reply.send({ results });
});

// --- Cron scheduler ---
import cron from 'node-cron';

async function runScheduledReport() {
  console.log('[gitpulse] Running scheduled report...');
  try {
    dataCache = null;
    dataCacheAt = null;
    clearCache();
    const data = await getActivityData();
    const style = config.ai.summary_style;
    const repoContexts = buildRepoContexts();
    const summary = config.ai.enabled ? await generateSummary(data, config.ai, style, repoContexts) : null;
    const md = buildMarkdownReport(data, summary, config);

    if (summary) {
      try { saveReport({ style, provider: summary.provider, model: summary.model, stats: data.stats, summary, fullData: data }); } catch (_) {}
    }

    const notifConfig = config.notifications;

    if (notifConfig?.slack?.enabled && summary) {
      try {
        await sendSlackNotification(summary, data.stats, notifConfig.slack);
        console.log('[gitpulse] Slack notification sent');
      } catch (err) {
        console.error(`[gitpulse] Slack notification failed: ${err.message}`);
      }
    }

    if (notifConfig?.email?.enabled) {
      try {
        await sendEmailNotification(summary, data.stats, md, notifConfig.email);
        console.log('[gitpulse] Email notification sent');
      } catch (err) {
        console.error(`[gitpulse] Email notification failed: ${err.message}`);
      }
    }
  } catch (err) {
    console.error(`[gitpulse] Scheduled report failed: ${err.message}`);
  }
}

if (config.reports.schedule) {
  cron.schedule(config.reports.schedule, runScheduledReport);
  console.log(`[gitpulse] Scheduled report: ${config.reports.schedule}`);
}

// --- Start ---
const port = config.port;
try {
  await app.listen({ port, host: '0.0.0.0' });
  console.log(`[gitpulse] Running on http://0.0.0.0:${port}`);
  console.log(`[gitpulse] Monitoring ${config.repos.length} repo(s)`);
  console.log(`[gitpulse] AI summaries: ${config.ai.enabled ? `enabled (${config.ai.summary_style})` : 'disabled'}`);
} catch (err) {
  console.error(`[gitpulse] Failed to start: ${err.message}`);
  process.exit(1);
}
