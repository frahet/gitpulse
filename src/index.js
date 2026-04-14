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
  version: '0.1.0',
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

app.get('/api/summary', async (_req, reply) => {
  try {
    const data = await getActivityData();
    const summary = await generateSummary(data, config.ai);
    if (!summary) {
      return reply.send({ enabled: false, message: 'AI summaries are disabled or ANTHROPIC_API_KEY not set' });
    }
    return reply.send(summary);
  } catch (err) {
    reply.status(500).send({ error: err.message });
  }
});

app.get('/api/report.md', async (_req, reply) => {
  try {
    const data = await getActivityData();
    const summary = await generateSummary(data, config.ai);
    const md = buildMarkdownReport(data, summary, config);
    reply.header('Content-Type', 'text/markdown; charset=utf-8');
    reply.header('Content-Disposition', 'attachment; filename="gitpulse-report.md"');
    return reply.send(md);
  } catch (err) {
    reply.status(500).send({ error: err.message });
  }
});

app.get('/api/report.json', async (_req, reply) => {
  try {
    const data = await getActivityData();
    const summary = await generateSummary(data, config.ai);
    return reply.send(buildJsonReport(data, summary, config));
  } catch (err) {
    reply.status(500).send({ error: err.message });
  }
});

app.post('/api/refresh', async (_req, reply) => {
  dataCache = null;
  dataCacheAt = null;
  clearCache();
  try {
    const data = await getActivityData();
    return reply.send({ ok: true, stats: data.stats, refreshedAt: new Date().toISOString() });
  } catch (err) {
    reply.status(500).send({ error: err.message });
  }
});

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
