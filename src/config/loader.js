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
    if (!repo.path) throw new Error(`Repo "${repo.name}" is missing a "path" field`);
  }

  return {
    port: cfg.port ?? 3000,
    repos: cfg.repos.map((r) => ({
      name: r.name,
      path: r.path,
      branch: r.branch ?? 'main',
    })),
    ai: {
      provider: cfg.ai?.provider ?? 'anthropic',
      model: cfg.ai?.model ?? 'claude-sonnet-4-6',
      enabled: cfg.ai?.enabled ?? false,
      summary_style: cfg.ai?.summary_style ?? 'standup',
    },
    reports: {
      schedule: cfg.reports?.schedule ?? '0 9 * * 1-5',
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
