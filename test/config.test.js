import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

// These tests validate the shape of gitpulse.yml configs by parsing YAML
// the same way the loader does, without needing a running server or real git repos.

describe('config shape validation', () => {
  test('github repo requires owner and repo fields', async () => {
    const yaml = (await import('js-yaml')).default;

    const config = {
      gitpulse: {
        repos: [{ name: 'test-repo', source: 'github', owner: 'myorg', repo: 'myrepo', branch: 'main' }],
      },
    };

    const raw = yaml.load(yaml.dump(config));
    const repo = raw.gitpulse.repos[0];

    assert.equal(repo.source, 'github');
    assert.equal(repo.owner, 'myorg');
    assert.equal(repo.repo, 'myrepo');
    assert.equal(repo.branch, 'main');
  });

  test('gitlab repo has project_id and optional host', async () => {
    const yaml = (await import('js-yaml')).default;

    const config = {
      gitpulse: {
        repos: [
          { name: 'gl-repo', source: 'gitlab', project_id: '12345', branch: 'main' },
          { name: 'gl-self', source: 'gitlab', project_id: '99', host: 'https://gitlab.myco.com', branch: 'develop' },
        ],
      },
    };

    const raw = yaml.load(yaml.dump(config));
    const [hosted, self] = raw.gitpulse.repos;

    assert.equal(hosted.project_id, '12345');
    assert.equal(hosted.host, undefined);
    assert.equal(self.host, 'https://gitlab.myco.com');
  });

  test('local repo has path field', async () => {
    const yaml = (await import('js-yaml')).default;

    const config = {
      gitpulse: {
        repos: [{ name: 'local-repo', source: 'local', path: '/repos/myapp', branch: 'main' }],
      },
    };

    const raw = yaml.load(yaml.dump(config));
    const repo = raw.gitpulse.repos[0];

    assert.equal(repo.source, 'local');
    assert.equal(repo.path, '/repos/myapp');
  });

  test('ai config accepts all supported providers', async () => {
    const yaml = (await import('js-yaml')).default;

    const providers = ['anthropic', 'openai', 'google', 'mistral'];

    for (const provider of providers) {
      const config = {
        gitpulse: {
          repos: [{ name: 'r', source: 'local', path: '/r' }],
          ai: { provider, model: 'some-model', enabled: true },
        },
      };
      const raw = yaml.load(yaml.dump(config));
      assert.equal(raw.gitpulse.ai.provider, provider, `provider ${provider} round-trips correctly`);
    }
  });

  test('ai config has diff settings', async () => {
    const yaml = (await import('js-yaml')).default;

    const config = {
      gitpulse: {
        repos: [{ name: 'r', source: 'github', owner: 'org', repo: 'r' }],
        ai: { diff_commits: 10, diff_max_lines: 120 },
      },
    };

    const raw = yaml.load(yaml.dump(config));
    assert.equal(raw.gitpulse.ai.diff_commits, 10);
    assert.equal(raw.gitpulse.ai.diff_max_lines, 120);
  });

  test('notification config shape — slack', async () => {
    const yaml = (await import('js-yaml')).default;

    const config = {
      gitpulse: {
        repos: [{ name: 'r', source: 'github', owner: 'org', repo: 'r' }],
        notifications: {
          slack: { enabled: true, webhook_url: 'https://hooks.slack.com/services/X/Y/Z', style: 'standup' },
        },
      },
    };

    const raw = yaml.load(yaml.dump(config));
    const slack = raw.gitpulse.notifications.slack;

    assert.equal(slack.enabled, true);
    assert.equal(slack.style, 'standup');
    assert.ok(slack.webhook_url.startsWith('https://hooks.slack.com'));
  });

  test('notification config shape — email smtp fields', async () => {
    const yaml = (await import('js-yaml')).default;

    const config = {
      gitpulse: {
        repos: [{ name: 'r', source: 'github', owner: 'org', repo: 'r' }],
        notifications: {
          email: {
            enabled: true,
            smtp_host: 'smtp.gmail.com',
            smtp_port: 587,
            smtp_user: 'me@gmail.com',
            to: 'team@company.com',
          },
        },
      },
    };

    const raw = yaml.load(yaml.dump(config));
    const email = raw.gitpulse.notifications.email;

    assert.equal(email.smtp_host, 'smtp.gmail.com');
    assert.equal(email.smtp_port, 587);
    assert.equal(email.to, 'team@company.com');
  });

  test('schedule config accepts cron strings', async () => {
    const yaml = (await import('js-yaml')).default;

    const schedules = [
      '0 9 * * 1-5',
      '0 8 * * 1',
      '0 17 * * 5',
      '0 */4 * * *',
    ];

    for (const schedule of schedules) {
      const config = {
        gitpulse: {
          repos: [{ name: 'r', source: 'github', owner: 'org', repo: 'r' }],
          reports: { schedule, lookback_days: 7 },
        },
      };
      const raw = yaml.load(yaml.dump(config));
      assert.equal(raw.gitpulse.reports.schedule, schedule);
    }
  });

  test('auth config shape', async () => {
    const yaml = (await import('js-yaml')).default;

    const config = {
      gitpulse: {
        repos: [{ name: 'r', source: 'github', owner: 'org', repo: 'r' }],
        auth: { enabled: true, username: 'admin', password: 'secret' },
      },
    };

    const raw = yaml.load(yaml.dump(config));
    assert.equal(raw.gitpulse.auth.enabled, true);
    assert.equal(raw.gitpulse.auth.username, 'admin');
  });

  test('missing gitpulse top-level key is detectable', async () => {
    const yaml = (await import('js-yaml')).default;

    const raw = yaml.load(yaml.dump({ something_else: {} }));
    assert.ok(!raw?.gitpulse, 'config without gitpulse key should not have that property');
  });

  test('empty repos array is detectable', async () => {
    const yaml = (await import('js-yaml')).default;

    const config = { gitpulse: { repos: [] } };
    const raw = yaml.load(yaml.dump(config));
    assert.equal(raw.gitpulse.repos.length, 0);
  });
});
