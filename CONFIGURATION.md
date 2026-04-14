# GitPulse — Configuration Guide

All configuration lives in `gitpulse.yml`. Sensitive values (API keys, passwords) go in `.env` — never in the yml file.

---

## Quick start

```bash
cp .env.example .env
cp gitpulse.yml gitpulse.local.yml   # local override, gitignored
# edit gitpulse.local.yml
CONFIG_PATH=./gitpulse.local.yml node src/index.js
```

Or with Docker:
```bash
docker compose up
```

---

## Repo sources

GitPulse supports three repo sources. Mix and match in the same config.

### GitHub (recommended)

No volume mount needed. Uses the GitHub REST API.

```yaml
repos:
  - name: "my-app"
    source: "github"
    owner: "myorg"        # GitHub org or username
    repo: "my-app"        # repo name
    branch: "main"
    token: "ghp_..."      # optional here — or set GITHUB_TOKEN in .env
```

**Getting a GitHub token:**
1. Go to https://github.com/settings/tokens → "Generate new token (classic)"
2. Select scope: `repo` (read access to private repos) or just `public_repo` for public
3. Copy token → paste into `.env` as `GITHUB_TOKEN=ghp_...`

> **Fine-grained tokens** also work. Give it `Contents: Read-only` permission on the repos you want.

---

### GitLab

Works with gitlab.com or any self-hosted GitLab instance.

```yaml
repos:
  - name: "backend"
    source: "gitlab"
    project_id: "12345678"          # GitLab project → Settings → General → Project ID
    branch: "main"
    host: "https://gitlab.com"      # omit for gitlab.com; set for self-hosted
    token: "glpat-..."              # optional — or set GITLAB_TOKEN in .env
```

**Getting a GitLab token:**
1. Go to https://gitlab.com/-/user_settings/personal_access_tokens
2. Create token with scope: `read_api`
3. Copy token → paste into `.env` as `GITLAB_TOKEN=glpat-...`

**Finding your project ID:**
Go to your GitLab project → Settings → General → look for "Project ID" at the top.

**Self-hosted GitLab:**
```yaml
repos:
  - name: "internal-api"
    source: "gitlab"
    project_id: "42"
    host: "https://gitlab.mycompany.com"
    token: "glpat-..."
```

---

### Local (Docker volume or absolute path)

```yaml
repos:
  - name: "legacy-app"
    source: "local"
    path: "/repos/legacy-app"    # inside container (Docker) or absolute path (bare Node)
    branch: "main"
```

When using Docker, mount your repos folder:
```yaml
# docker-compose.yml
volumes:
  - /Users/you/projects:/repos:ro
```

---

## AI providers

Set `provider` and `model` in the `ai:` block. Set the matching key in `.env`.

### Anthropic (Claude)

```yaml
ai:
  provider: "anthropic"
  model: "claude-sonnet-4-6"      # fast, smart, cheap
  # model: "claude-opus-4-6"      # most capable
  # model: "claude-haiku-4-5-20251001"  # fastest, cheapest
```

```env
ANTHROPIC_API_KEY=sk-ant-...
```

Get a key: https://console.anthropic.com → API Keys

---

### OpenAI

```yaml
ai:
  provider: "openai"
  model: "gpt-4o"
  # model: "gpt-4o-mini"    # cheaper
  # model: "o3-mini"        # reasoning model
```

```env
OPENAI_API_KEY=sk-...
```

Get a key: https://platform.openai.com/api-keys

---

### Google Gemini

```yaml
ai:
  provider: "google"
  model: "gemini-2.0-flash"
  # model: "gemini-2.5-pro"
```

```env
GOOGLE_GENERATIVE_AI_API_KEY=...
```

Get a key: https://aistudio.google.com/app/apikey

---

### Mistral

```yaml
ai:
  provider: "mistral"
  model: "mistral-large-latest"
  # model: "mistral-small-latest"
```

```env
MISTRAL_API_KEY=...
```

Get a key: https://console.mistral.ai

---

## AI context

Tell the AI what your project is so summaries are accurate instead of generic.

```yaml
ai:
  context: >
    Multi-tenant SaaS platform for managing construction projects.
    Frontend: Next.js (app/). Backend: Fastify API (api/).
    Payments via Stripe. Auth via Clerk. Postgres database.
    'jobs' = construction projects. 'quotes' = cost estimates.
```

Without context: *"changes were made to authentication code"*
With context: *"Clerk auth integration was updated to handle multi-tenant session isolation"*

---

## Diff reading

Controls how deeply the AI reads actual code changes vs just commit messages.

```yaml
ai:
  diff_commits: 5       # read diffs for 5 most recent commits per repo
  diff_max_lines: 80    # truncate each diff at 80 lines
```

Set `diff_commits: 0` to disable (faster, cheaper, summaries based on commit messages only).
Increase `diff_max_lines` for larger, more detailed analysis (uses more tokens).

---

## Summary styles

Three built-in styles, switchable from the dashboard or API:

| Style | Best for | Output |
|-------|----------|--------|
| `standup` | Daily standups | Bullet points per person: what they did, what's in progress |
| `management` | Stakeholders, reports | Plain English, no jargon, focuses on outcomes and value |
| `technical` | Code review, PR context | File paths, component names, PR-like language |

```yaml
ai:
  summary_style: "standup"    # default style on load
```

All styles are available on-demand from the dashboard — no restart needed.

---

## Notifications

### Slack

```yaml
notifications:
  slack:
    enabled: true
    webhook_url: "https://hooks.slack.com/services/T.../B.../..."
    style: "standup"
```

**Setting up a Slack webhook:**
1. Go to https://api.slack.com/apps → Create New App → "From scratch"
2. Add feature: "Incoming Webhooks" → Activate
3. "Add New Webhook to Workspace" → choose channel
4. Copy the webhook URL → paste into `webhook_url`

The report fires automatically on your cron schedule.

---

### Email

GitPulse works with any SMTP server. Common setups:

**Gmail (App Password)**
```yaml
notifications:
  email:
    enabled: true
    smtp_host: "smtp.gmail.com"
    smtp_port: 587
    smtp_user: "you@gmail.com"
    smtp_pass: null       # set SMTP_PASS in .env
    to: "team@company.com"
```
```env
SMTP_PASS=xxxx-xxxx-xxxx-xxxx   # Gmail App Password, not your account password
```
> Gmail requires an App Password if 2FA is on. Create one at https://myaccount.google.com/apppasswords

**SendGrid**
```yaml
notifications:
  email:
    enabled: true
    smtp_host: "smtp.sendgrid.net"
    smtp_port: 587
    smtp_user: "apikey"
    smtp_pass: null   # set SMTP_PASS=SG.xxx in .env
    to: "team@company.com"
```

**Mailgun**
```yaml
notifications:
  email:
    enabled: true
    smtp_host: "smtp.mailgun.org"
    smtp_port: 587
    smtp_user: "postmaster@mg.yourdomain.com"
    smtp_pass: null   # set SMTP_PASS in .env
    to: "team@company.com"
```

**Multiple recipients** — comma-separate:
```yaml
to: "alice@company.com, bob@company.com, reports@company.com"
```

---

## Schedule

Standard cron syntax. Runs in the server's local timezone.

```yaml
reports:
  schedule: "0 9 * * 1-5"    # weekdays at 9am
  # schedule: "0 8 * * 1"    # Monday 8am only
  # schedule: "0 17 * * 5"   # Friday 5pm
  # schedule: null            # disable scheduled reports
  lookback_days: 7
```

Cron cheatsheet:
```
┌─ minute (0-59)
│  ┌─ hour (0-23)
│  │  ┌─ day of month (1-31)
│  │  │  ┌─ month (1-12)
│  │  │  │  ┌─ day of week (0=Sun, 1=Mon ... 6=Sat)
│  │  │  │  │
0  9  *  *  1-5    →  weekdays at 9:00am
0  8  *  *  1      →  every Monday at 8:00am
0  17 *  *  5      →  every Friday at 5:00pm
0  */4 * *  *      →  every 4 hours
```

---

## Auth

Basic auth to protect the dashboard and API.

```yaml
auth:
  enabled: true
  username: "admin"
  password: "strong-password-here"
```

> Keep the password in `.env` if you prefer: set `password: "${DASHBOARD_PASSWORD}"` — GitPulse resolves env var references in string fields.

---

## Docker

Full example `docker-compose.yml` with GitHub repos (no volume mount needed):

```yaml
services:
  gitpulse:
    build: .
    ports:
      - "3000:3000"
    volumes:
      - ./gitpulse.yml:/app/gitpulse.yml:ro
      - ./data:/app/data                  # persist SQLite report history
    env_file:
      - .env
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost:3000/api/health"]
      interval: 30s
      timeout: 5s
      retries: 3
```

With local repos mounted:
```yaml
volumes:
  - ./gitpulse.yml:/app/gitpulse.yml:ro
  - /Users/you/projects:/repos:ro
  - ./data:/app/data
```

---

## Environment variables reference

| Variable | Required | Description |
|----------|----------|-------------|
| `ANTHROPIC_API_KEY` | If using Anthropic | Claude API key |
| `OPENAI_API_KEY` | If using OpenAI | OpenAI API key |
| `GOOGLE_GENERATIVE_AI_API_KEY` | If using Google | Gemini API key |
| `MISTRAL_API_KEY` | If using Mistral | Mistral API key |
| `GITHUB_TOKEN` | If using GitHub repos | Personal access token |
| `GITLAB_TOKEN` | If using GitLab repos | Personal access token |
| `SMTP_PASS` | If email enabled | SMTP password |
| `CONFIG_PATH` | No | Override config file location |
| `DB_PATH` | No | Override SQLite database path |

---

## Full example config

```yaml
gitpulse:
  port: 3000

  repos:
    - name: "frontend"
      source: "github"
      owner: "acme-corp"
      repo: "web-app"
      branch: "main"
    - name: "api"
      source: "github"
      owner: "acme-corp"
      repo: "backend-api"
      branch: "develop"
    - name: "mobile"
      source: "gitlab"
      project_id: "98765432"
      branch: "main"

  ai:
    enabled: true
    provider: "anthropic"
    model: "claude-sonnet-4-6"
    summary_style: "standup"
    context: >
      B2B SaaS for construction project management.
      Frontend: Next.js. API: Node/Fastify. Mobile: React Native.
      Key concepts: jobs (projects), quotes (estimates), subs (subcontractors).
    diff_commits: 5
    diff_max_lines: 80

  reports:
    schedule: "0 9 * * 1-5"
    lookback_days: 7
    output_formats: [html, markdown, json]

  auth:
    enabled: true
    username: "admin"
    password: "changeme"

  notifications:
    slack:
      enabled: true
      webhook_url: "https://hooks.slack.com/services/..."
      style: "standup"
    email:
      enabled: true
      smtp_host: "smtp.gmail.com"
      smtp_port: 587
      smtp_user: "reports@acme.com"
      to: "team@acme.com"
```

`.env`:
```env
ANTHROPIC_API_KEY=sk-ant-...
GITHUB_TOKEN=ghp_...
GITLAB_TOKEN=glpat-...
SMTP_PASS=xxxx-xxxx-xxxx-xxxx
```
