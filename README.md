# GitPulse

Self-hosted Git analytics and AI reporting. Point it at your repos, run the container, open the dashboard.

AI summaries via Anthropic, OpenAI, Google Gemini, or Mistral — your choice.

---

## Quick start

#### Docker (recommended)

```bash
# 1. Copy example files
cp gitpulse.yml gitpulse.local.yml   # local override — gitignored
cp .env.example .env

# 2. Edit gitpulse.local.yml — set your repos, AI provider, etc.
# 3. Edit .env — add your API key

# 4. Run
CONFIG_PATH=./gitpulse.local.yml docker compose up
```

Open <http://localhost:3000>

#### Bare Node.js

```bash
npm install
cp gitpulse.yml gitpulse.local.yml
cp .env.example .env
# edit both files
CONFIG_PATH=./gitpulse.local.yml node src/index.js
```

Requires Node.js 20+.

---

## Minimal config

```yaml
# gitpulse.local.yml
gitpulse:
  repos:
    - name: "my-app"
      source: "github"
      owner: "your-org"
      repo: "your-repo"
      branch: "main"

  ai:
    enabled: true
    provider: "anthropic"     # anthropic | openai | google | mistral
    model: "claude-sonnet-4-6"
```

```env
# .env
ANTHROPIC_API_KEY=sk-ant-...
GITHUB_TOKEN=ghp_...
```

---

## Repo sources

| Source | How it works | Needs |
| --- | --- | --- |
| `github` | GitHub REST API — no volume mount | `GITHUB_TOKEN` |
| `gitlab` | GitLab API — works with gitlab.com or self-hosted | `GITLAB_TOKEN` |
| `local` | Reads git history directly from disk | Volume mount (Docker) or absolute path |

```yaml
repos:
  # GitHub
  - name: "web"
    source: "github"
    owner: "your-org"
    repo: "web-app"
    branch: "main"

  # GitLab (self-hosted)
  - name: "backend"
    source: "gitlab"
    project_id: "42"
    host: "https://gitlab.yourcompany.com"
    branch: "main"

  # Local path
  - name: "infra"
    source: "local"
    path: "/repos/infra"
    branch: "main"
```

Mix and match sources in the same config.

---

## AI providers

```yaml
ai:
  provider: "anthropic"
  model: "claude-sonnet-4-6"
```

| Provider | Key in `.env` | Example models |
| --- | --- | --- |
| `anthropic` | `ANTHROPIC_API_KEY` | `claude-sonnet-4-6`, `claude-opus-4-6` |
| `openai` | `OPENAI_API_KEY` | `gpt-4o`, `gpt-4o-mini` |
| `google` | `GOOGLE_GENERATIVE_AI_API_KEY` | `gemini-2.0-flash`, `gemini-2.5-pro` |
| `mistral` | `MISTRAL_API_KEY` | `mistral-large-latest`, `mistral-small-latest` |

---

## Summary styles

Three styles, switchable from the dashboard at any time:

| Style | Best for |
| --- | --- |
| `standup` | Daily standups — bullet points per person |
| `management` | Stakeholders — plain English, outcome-focused |
| `technical` | Developers — file paths, PR-like language |

```yaml
ai:
  summary_style: "standup"
```

---

## Notifications

```yaml
notifications:
  slack:
    enabled: true
    webhook_url: "https://hooks.slack.com/services/..."
    style: "standup"

  email:
    enabled: true
    smtp_host: "smtp.gmail.com"
    smtp_port: 587
    smtp_user: "you@gmail.com"
    smtp_pass: null    # set SMTP_PASS in .env
    to: "team@yourcompany.com"
```

Reports fire automatically on your cron schedule.

---

## Schedule

```yaml
reports:
  schedule: "0 9 * * 1-5"   # weekdays at 9am
  lookback_days: 7
```

Set `schedule: null` to disable automatic reports and generate on demand from the dashboard.

---

## Auth

```yaml
auth:
  enabled: true
  username: "admin"
  password: "your-password"
```

---

## API endpoints

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/api/health` | Health check |
| `GET` | `/api/repos` | Configured repos and status |
| `GET` | `/api/activity` | All commits across all repos |
| `GET` | `/api/activity/:repo` | Commits for a single repo |
| `GET` | `/api/summary?style=standup` | AI summary (cached per style) |
| `GET` | `/api/report.md?style=standup` | Download Markdown report |
| `GET` | `/api/report.json?style=standup` | Download JSON report |
| `POST` | `/api/refresh` | Force refresh git data + regenerate summary |
| `GET` | `/api/history` | List saved reports |
| `GET` | `/api/history/:id` | Fetch a saved report |

---

## Full configuration reference

See [CONFIGURATION.md](CONFIGURATION.md) for complete documentation including:

- Per-repo token overrides
- All AI provider models
- AI project context (improves summary quality significantly)
- Diff reading settings
- All SMTP providers (SendGrid, Mailgun, SES, self-hosted)
- Docker volume setup for local repos
- Reverse proxy setup
- All environment variables

---

## Development

```bash
npm run dev    # start with auto-restart on file changes
npm test       # run tests
```

---

## License

MIT
