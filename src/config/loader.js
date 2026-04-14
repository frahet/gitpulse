import { readFileSync } from 'fs';
import { resolve } from 'path';
import yaml from 'js-yaml';

const CONFIG_PATH = process.env.CONFIG_PATH || resolve(process.cwd(), 'gitpulse.yml');

function validateConfig(raw) {
  const cfg = raw?.gitpulse;
  if (!cfg) throw new Error('gitpulse.yml must have a top-level "gitpulse:" key');

  if (!Array.isArray(cfg.repos) || cfg.repos.length === 0) {
    throw new Error('gitpulse.repos must be a non-empty array');
  }

  for (const repo of cfg.repos) {
    if (!repo.name) throw new Error(`Every repo entry must have a "name" field`);
    const source = repo.source ?? 'local';
    if (source === 'local' && !repo.path) throw new Error(`Repo "${repo.name}" is missing a "path" field`);
    if (source === 'github' && (!repo.owner || !repo.repo)) throw new Error(`Repo "${repo.name}" needs "owner" and "repo" fields for source: github`);
    if (source === 'gitlab' && !repo.project_id) throw new Error(`Repo "${repo.name}" needs a "project_id" field for source: gitlab`);
  }

  return {
    port: cfg.port ?? 3000,
    repos: cfg.repos.map((r) => ({
      name: r.name,
      source: r.source ?? 'local',
      // local
      path: r.path ?? null,
      // github
      owner: r.owner ?? null,
      repo: r.repo ?? null,
      // gitlab
      projectId: r.project_id ?? null,
      host: r.host ?? null,
      // shared
      branch: r.branch ?? 'main',
      token: r.token ?? null,
    })),
    ai: {
      provider: cfg.ai?.provider ?? 'anthropic',
      model: cfg.ai?.model ?? 'claude-sonnet-4-6',
      enabled: cfg.ai?.enabled ?? false,
      summary_style: cfg.ai?.summary_style ?? 'standup',
      context: cfg.ai?.context ?? null,
      diff_commits: cfg.ai?.diff_commits ?? 5,
      diff_max_lines: cfg.ai?.diff_max_lines ?? 80,
    },
    notifications: {
      slack: {
        enabled: cfg.notifications?.slack?.enabled ?? false,
        webhook_url: cfg.notifications?.slack?.webhook_url ?? null,
        style: cfg.notifications?.slack?.style ?? 'standup',
      },
      email: {
        enabled: cfg.notifications?.email?.enabled ?? false,
        smtp_host: cfg.notifications?.email?.smtp_host ?? null,
        smtp_port: cfg.notifications?.email?.smtp_port ?? 587,
        smtp_user: cfg.notifications?.email?.smtp_user ?? null,
        smtp_pass: cfg.notifications?.email?.smtp_pass ?? null,
        to: cfg.notifications?.email?.to ?? null,
      },
    },
    reports: {
      schedule: cfg.reports?.schedule ?? '0 6 * * 1-5',
      lookback_days: cfg.reports?.lookback_days ?? 7,
      output_formats: cfg.reports?.output_formats ?? ['html', 'json'],
    },
    auth: {
      enabled: cfg.auth?.enabled ?? false,
      username: cfg.auth?.username ?? 'admin',
      password: cfg.auth?.password ?? 'changeme',
    },
  };
}

export function loadConfig() {
  let raw;
  try {
    const content = readFileSync(CONFIG_PATH, 'utf8');
    raw = yaml.load(content);
  } catch (err) {
    if (err.code === 'ENOENT') {
      throw new Error(`Config file not found at ${CONFIG_PATH}. Create gitpulse.yml or set CONFIG_PATH.`);
    }
    throw new Error(`Failed to parse gitpulse.yml: ${err.message}`);
  }
  return validateConfig(raw);
}
