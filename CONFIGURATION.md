# GitPulse — Configuration Guide

All configuration lives in `gitpulse.yml`. Sensitive values (API keys, passwords) go in `.env` — never in the yml file.

---

## Table of contents

- [Quick start](#quick-start)
- [Repo sources](#repo-sources)
  - [GitHub](#github-recommended)
  - [GitLab](#gitlab)
  - [Local](#local-docker-volume-or-absolute-path)
  - [Mixing sources](#mixing-sources)
- [AI providers](#ai-providers)
  - [Anthropic (Claude)](#anthropic-claude)
  - [OpenAI](#openai)
  - [Google Gemini](#google-gemini)
  - [Mistral](#mistral)
- [AI context](#ai-context)
- [Diff reading](#diff-reading)
- [Summary styles](#summary-styles)
- [Notifications](#notifications)
  - [Slack](#slack)
  - [Email](#email)
- [Schedule](#schedule)
- [Auth](#auth)
- [Docker](#docker)
- [API reference](#api-reference)
- [Environment variables](#environment-variables-reference)
- [Full example configs](#full-example-configs)

---

## Quick start

#### Bare Node.js

```bash
cp .env.example .env
# edit .env — add your API key at minimum

node src/index.js
# open http://localhost:3000
```

#### Local override (keep personal config out of git)

```bash
cp gitpulse.yml gitpulse.local.yml   # gitignored
# edit gitpulse.local.yml with real paths/tokens
CONFIG_PATH=./gitpulse.local.yml node src/index.js
```

#### Docker

```bash
docker compose up
```

#### Dev mode (auto-restart on file changes)

```bash
npm run dev
```

---

## Repo sources

GitPulse supports three repo sources. Mix and match in the same config — see [Mixing sources](#mixing-sources) below.

### GitHub (recommended)

No volume mount needed. Uses the GitHub REST API. Works with both public and private repos.

```yaml
repos:
  - name: "my-app"
    source: "github"
    owner: "my-org"      # GitHub org or username
    repo: "my-app"       # repo name (not the full URL)
    branch: "main"
    token: "ghp_..."     # optional here — or set GITHUB_TOKEN in .env
```

**Getting a GitHub token:**

1. Go to <https://github.com/settings/tokens> → "Generate new token (classic)"
2. Select scope: `repo` (private repos) or `public_repo` (public only)
3. Copy the token → paste into `.env` as `GITHUB_TOKEN=ghp_...`

> **Fine-grained tokens** also work. Give it `Contents: Read-only` and `Metadata: Read-only` on the repos you need.

**Multiple GitHub repos from the same org:**

```yaml
repos:
  - name: "web"
    source: "github"
    owner: "my-org"
    repo: "web-app"
    branch: "main"
  - name: "api"
    source: "github"
    owner: "my-org"
    repo: "backend"
    branch: "main"
  - name: "mobile"
    source: "github"
    owner: "my-org"
    repo: "mobile-app"
    branch: "develop"
```

**Personal repos (not org):**

```yaml
repos:
  - name: "my-side-project"
    source: "github"
    owner: "your-github-username"
    repo: "side-project"
    branch: "main"
```

---

### GitLab

Works with gitlab.com or any self-hosted GitLab instance.

```yaml
repos:
  - name: "backend"
    source: "gitlab"
    project_id: "12345678"       # GitLab project → Settings → General → Project ID
    branch: "main"
    host: "https://gitlab.com"   # omit for gitlab.com; required for self-hosted
    token: "glpat-..."           # optional — or set GITLAB_TOKEN in .env
```

**Getting a GitLab token:**

1. Go to <https://gitlab.com/-/user_settings/personal_access_tokens>
2. Create a token with scope: `read_api`
3. Copy the token → paste into `.env` as `GITLAB_TOKEN=glpat-...`

**Finding your project ID:**
Go to your GitLab project → Settings → General → look for "Project ID" near the top.

**Self-hosted GitLab:**

```yaml
repos:
  - name: "internal-api"
    source: "gitlab"
    project_id: "42"
    host: "https://gitlab.yourcompany.com"
    token: "glpat-..."           # or set GITLAB_TOKEN in .env
```

**Per-repo tokens** — useful when repos belong to different users or orgs:

```yaml
repos:
  - name: "client-a-app"
    source: "gitlab"
    project_id: "111"
    token: "glpat-client-a-token"
  - name: "client-b-app"
    source: "gitlab"
    project_id: "222"
    token: "glpat-client-b-token"
```

---

### Local (Docker volume or absolute path)

Use this when your repos live on the same machine as GitPulse. No API token needed.

```yaml
repos:
  - name: "my-app"
    source: "local"
    path: "/repos/my-app"   # absolute path inside container (Docker) or on the host (bare Node)
    branch: "main"
```

**Bare Node.js** — use the absolute path on your machine:

```yaml
repos:
  - name: "my-app"
    source: "local"
    path: "/Users/you/projects/my-app"
    branch: "main"
```

**Docker** — mount your projects folder, then reference the container path:

```yaml
# docker-compose.yml
volumes:
  - /Users/you/projects:/repos:ro   # host path : container path
```

```yaml
# gitpulse.yml
repos:
  - name: "my-app"
    source: "local"
    path: "/repos/my-app"    # container path
```

**Multiple local repos:**

```yaml
repos:
  - name: "frontend"
    source: "local"
    path: "/repos/frontend"
    branch: "main"
  - name: "backend"
    source: "local"
    path: "/repos/backend"
    branch: "develop"
  - name: "infra"
    source: "local"
    path: "/repos/infra"
    branch: "main"
```

---

### Mixing sources

You can combine GitHub, GitLab, and local repos in the same config — GitPulse collects them all and produces a unified report.

```yaml
repos:
  # Main product on GitHub
  - name: "web-app"
    source: "github"
    owner: "my-org"
    repo: "web-app"
    branch: "main"

  # Legacy service on self-hosted GitLab
  - name: "legacy-api"
    source: "gitlab"
    project_id: "7"
    host: "https://gitlab.internal.yourcompany.com"
    branch: "master"

  # Local monorepo mounted as a volume
  - name: "infra-scripts"
    source: "local"
    path: "/repos/infra"
    branch: "main"
```

---

## AI providers

Set `provider` and `model` under the `ai:` block. Add the matching API key to `.env`.

### Anthropic (Claude)

```yaml
ai:
  provider: "anthropic"
  model: "claude-sonnet-4-6"        # fast, smart, cost-effective — good default
  # model: "claude-opus-4-6"        # most capable, best for complex codebases
  # model: "claude-haiku-4-5-20251001"  # fastest and cheapest
```

```env
ANTHROPIC_API_KEY=sk-ant-...
```

Get a key: <https://console.anthropic.com> → API Keys

---

### OpenAI

```yaml
ai:
  provider: "openai"
  model: "gpt-4o"          # strong all-round model
  # model: "gpt-4o-mini"   # cheaper, still good for summaries
  # model: "o3-mini"       # reasoning model — slower but thorough
```

```env
OPENAI_API_KEY=sk-...
```

Get a key: <https://platform.openai.com/api-keys>

---

### Google Gemini

```yaml
ai:
  provider: "google"
  model: "gemini-2.0-flash"   # fast and cheap
  # model: "gemini-2.5-pro"   # most capable Gemini model
```

```env
GOOGLE_GENERATIVE_AI_API_KEY=...
```

Get a key: <https://aistudio.google.com/app/apikey>

---

### Mistral

```yaml
ai:
  provider: "mistral"
  model: "mistral-large-latest"   # most capable
  # model: "mistral-small-latest" # cheaper option
```

```env
MISTRAL_API_KEY=...
```

Get a key: <https://console.mistral.ai>

---

## AI context

The most impactful setting for summary quality. Tell the AI what your project actually is so it can interpret changes meaningfully instead of describing them generically.

```yaml
ai:
  context: >
    Describe your project here. The more specific, the better the summaries.
```

**Without context:**
> _"Changes were made to the authentication module and several database queries were updated."_

**With context:**
> _"The JWT refresh flow was updated to handle token rotation for mobile clients. The user_sessions table now stores device fingerprints to support concurrent sessions per user."_

---

**Examples for different project types:**

#### Web SaaS

```yaml
ai:
  context: >
    B2B SaaS for project management. Next.js frontend (app/), Node/Fastify API (api/).
    Postgres database, Redis for caching. Auth via Clerk. Payments via Stripe.
    Key models: Workspace, Project, Task, Member. Multi-tenant — data is always scoped to workspace_id.
```

#### Mobile app

```yaml
ai:
  context: >
    React Native app for food delivery (iOS + Android). Expo managed workflow.
    API is a Python/FastAPI backend. Real-time order tracking via WebSockets.
    Key flows: browse menu → cart → checkout → live tracking → order history.
```

#### Open source library

```yaml
ai:
  context: >
    TypeScript utility library published to npm as @myorg/utils.
    Zero dependencies. Targets Node 18+ and modern browsers.
    Modules: date, string, array, object, validation.
    Breaking changes need a major semver bump and CHANGELOG entry.
```

#### Monorepo

```yaml
ai:
  context: >
    Turborepo monorepo. Packages: ui (shared React components), config (ESLint/TS configs).
    Apps: web (Next.js), docs (Docusaurus), admin (Vite + React).
    Shared types live in packages/types. API contracts defined in packages/api-client.
```

#### DevOps / infrastructure

```yaml
ai:
  context: >
    Terraform + Helm charts for our Kubernetes platform on AWS EKS.
    Environments: dev, staging, prod — all changes go through staging first.
    Key services: ingress (Nginx), observability (Grafana/Loki/Tempo), auth (Keycloak).
    Prod changes require a PR approval and a manual terraform plan review.
```

---

## Diff reading

Controls whether the AI reads actual code diffs or just commit messages.

```yaml
ai:
  diff_commits: 5     # read full diffs for this many recent commits per repo
  diff_max_lines: 80  # truncate each diff at this many lines
```

| Setting | Effect |
| --- | --- |
| `diff_commits: 0` | Disable diff reading — faster, cheaper, summaries based on commit messages only |
| `diff_commits: 5` | Good default — reads real code for recent commits |
| `diff_commits: 20` | Thorough — covers more history but uses more tokens |
| `diff_max_lines: 40` | Cheaper — only reads the top of each diff |
| `diff_max_lines: 200` | More context per diff — better for large changesets |

**Tip:** Start with the defaults. If summaries feel too shallow, increase `diff_commits`. If costs are a concern, set `diff_commits: 0` and rely on commit messages.

---

## Summary styles

Three built-in styles, switchable from the dashboard or via the API at any time — no restart needed.

| Style | Best for | Output |
| --- | --- | --- |
| `standup` | Daily standups | Bullet points per person: what they did, what's in progress |
| `management` | Stakeholders, reports | Plain English, no jargon, focuses on outcomes and value |
| `technical` | Code review, PR context | File paths, component names, PR-like language |

```yaml
ai:
  summary_style: "standup"   # default style shown on page load
```

**Standup example output:**
> - **Alice** — fixed session timeout bug in auth middleware; updated user profile API to return avatar URL
> - **Bob** — in progress: payment webhook retry logic; deployed billing service to staging

**Management example output:**
> The team focused on stability this week. The login experience was improved for users who stay logged in for extended periods. Work is underway on making payments more reliable when external services are temporarily unavailable.

**Technical example output:**
> `auth/middleware.ts` — fixed off-by-one in JWT expiry check (line 84). `api/users.ts` — added `avatar_url` to `GET /users/:id` response schema. `services/billing/` — WIP: exponential backoff for Stripe webhook retries.

---

## Notifications

### Slack

```yaml
notifications:
  slack:
    enabled: true
    webhook_url: "https://hooks.slack.com/services/T.../B.../..."
    style: "standup"   # standup | management | technical
```

**Setting up a Slack webhook:**

1. Go to <https://api.slack.com/apps> → Create New App → "From scratch"
2. Add feature: "Incoming Webhooks" → Activate
3. "Add New Webhook to Workspace" → choose your channel
4. Copy the webhook URL → paste into `webhook_url`

The report fires automatically on your [cron schedule](#schedule). The Slack message includes a stats summary (commits, authors, insertions/deletions) followed by the AI narrative.

---

### Email

GitPulse works with any SMTP provider. Common setups below.

#### Gmail (App Password)

```yaml
notifications:
  email:
    enabled: true
    smtp_host: "smtp.gmail.com"
    smtp_port: 587
    smtp_user: "your-address@gmail.com"
    smtp_pass: null    # set SMTP_PASS in .env
    to: "team@yourcompany.com"
```

```env
SMTP_PASS=xxxx-xxxx-xxxx-xxxx   # App Password, NOT your Gmail login password
```

> Gmail requires an App Password when 2FA is enabled. Create one at <https://myaccount.google.com/apppasswords>

#### SendGrid

```yaml
notifications:
  email:
    enabled: true
    smtp_host: "smtp.sendgrid.net"
    smtp_port: 587
    smtp_user: "apikey"         # literal string "apikey" — this is correct
    smtp_pass: null             # set SMTP_PASS=SG.xxx in .env
    to: "team@yourcompany.com"
```

```env
SMTP_PASS=SG.your-sendgrid-api-key
```

Get a key: <https://app.sendgrid.com/settings/api_keys>

#### Mailgun

```yaml
notifications:
  email:
    enabled: true
    smtp_host: "smtp.mailgun.org"
    smtp_port: 587
    smtp_user: "postmaster@mg.yourdomain.com"
    smtp_pass: null   # set SMTP_PASS in .env
    to: "team@yourcompany.com"
```

#### Amazon SES

```yaml
notifications:
  email:
    enabled: true
    smtp_host: "email-smtp.us-east-1.amazonaws.com"   # region-specific
    smtp_port: 587
    smtp_user: "your-ses-smtp-username"
    smtp_pass: null   # set SMTP_PASS in .env
    to: "team@yourcompany.com"
```

> SES requires SMTP credentials generated from the SES console, not your AWS access key. Your sending domain must be verified first.

#### Self-hosted (Postfix, Mailcow, etc.)

```yaml
notifications:
  email:
    enabled: true
    smtp_host: "mail.yourcompany.com"
    smtp_port: 587
    smtp_user: "gitpulse@yourcompany.com"
    smtp_pass: null   # set SMTP_PASS in .env
    to: "team@yourcompany.com"
```

**Multiple recipients** — comma-separate:

```yaml
to: "alice@yourcompany.com, bob@yourcompany.com, manager@yourcompany.com"
```

---

## Schedule

Standard cron syntax. Runs in the server's local timezone.

```yaml
reports:
  schedule: "0 9 * * 1-5"   # weekdays at 9am — good default
  lookback_days: 7           # how far back to look for commits
```

Set `schedule: null` to disable automatic reports (generate on demand from the dashboard instead).

**Common schedules:**

```yaml
schedule: "0 9 * * 1-5"    # weekdays at 9am — daily standup prep
schedule: "0 8 * * 1"      # every Monday at 8am — weekly kickoff
schedule: "0 17 * * 5"     # every Friday at 5pm — end-of-week summary
schedule: "0 7 * * *"      # every day at 7am — daily digest
schedule: "0 */4 * * *"    # every 4 hours — high-cadence teams
```

**Cron syntax reference:**

```text
┌─ minute   (0-59)
│  ┌─ hour  (0-23)
│  │  ┌─ day of month  (1-31)
│  │  │  ┌─ month  (1-12)
│  │  │  │  ┌─ day of week  (0=Sun, 1=Mon ... 6=Sat)
│  │  │  │  │
0  9  *  *  1-5    →  weekdays at 9:00am
0  8  *  *  1      →  every Monday at 8:00am
0  17 *  *  5      →  every Friday at 5:00pm
0  7  *  *  *      →  every day at 7:00am
0  */4 * *  *      →  every 4 hours
```

**`lookback_days` examples:**

```yaml
lookback_days: 1    # yesterday's commits only — for daily digests
lookback_days: 7    # last 7 days — good default for weekly reports
lookback_days: 30   # last month — for monthly executive reports
```

---

## Auth

Protect the dashboard and all API endpoints with HTTP Basic Auth.

```yaml
auth:
  enabled: true
  username: "admin"
  password: "your-strong-password-here"
```

When `enabled: false` (the default), the dashboard is publicly accessible — fine for local use, not recommended for internet-facing deployments.

> There is no token or session — every request sends credentials. Use HTTPS in front of GitPulse (via a reverse proxy like Nginx, Caddy, or Cloudflare Tunnel) if it is accessible from the internet.

---

## Docker

#### Minimal setup with GitHub repos

```yaml
# docker-compose.yml
services:
  gitpulse:
    build: .
    ports:
      - "3000:3000"
    volumes:
      - ./gitpulse.yml:/app/gitpulse.yml:ro
      - ./data:/app/data          # persist SQLite report history
    env_file:
      - .env
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost:3000/api/health"]
      interval: 30s
      timeout: 5s
      retries: 3
```

#### With local repos mounted

```yaml
volumes:
  - ./gitpulse.yml:/app/gitpulse.yml:ro
  - /path/to/your/projects:/repos:ro   # mount read-only
  - ./data:/app/data
```

Then reference the container path in `gitpulse.yml`:

```yaml
repos:
  - name: "my-app"
    source: "local"
    path: "/repos/my-app"
```

#### Behind a reverse proxy (Nginx example)

```nginx
server {
    listen 80;
    server_name gitpulse.yourcompany.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

Use Certbot or Caddy to add HTTPS. With Caddy:

```
gitpulse.yourcompany.com {
    reverse_proxy localhost:3000
}
```

#### Custom port

```yaml
gitpulse:
  port: 8080
```

```yaml
# docker-compose.yml
ports:
  - "8080:8080"
```

---

## API reference

GitPulse exposes a REST API used by the dashboard. You can also hit these directly.

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/api/health` | Health check — returns `{ status: "ok" }` |
| `GET` | `/api/repos` | List configured repos and their status |
| `GET` | `/api/activity` | All commits across all repos (from cache) |
| `GET` | `/api/activity/:repo` | Commits for a single repo |
| `GET` | `/api/summary?style=standup` | Get AI summary (cached per style) |
| `GET` | `/api/report.md?style=standup` | Download report as Markdown |
| `GET` | `/api/report.json?style=standup` | Download report as JSON |
| `POST` | `/api/refresh` | Force-refresh git data and regenerate summary |
| `GET` | `/api/history` | List saved reports (SQLite) |
| `GET` | `/api/history/:id` | Fetch a specific saved report |

**Examples:**

```bash
# Health check
curl http://localhost:3000/api/health

# Force refresh and get summary
curl -X POST http://localhost:3000/api/refresh
curl "http://localhost:3000/api/summary?style=technical"

# Download a markdown report
curl "http://localhost:3000/api/report.md?style=management" -o report.md

# With basic auth enabled
curl -u admin:yourpassword http://localhost:3000/api/summary
```

---

## Environment variables reference

| Variable | Required | Description |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | If using Anthropic | Claude API key |
| `OPENAI_API_KEY` | If using OpenAI | OpenAI API key |
| `GOOGLE_GENERATIVE_AI_API_KEY` | If using Google | Gemini API key |
| `MISTRAL_API_KEY` | If using Mistral | Mistral API key |
| `GITHUB_TOKEN` | If using GitHub repos | Personal access token (`repo` or `public_repo` scope) |
| `GITLAB_TOKEN` | If using GitLab repos | Personal access token (`read_api` scope) |
| `SMTP_PASS` | If email enabled | SMTP password (or SendGrid/SES key) |
| `CONFIG_PATH` | No | Override config file path (default: `./gitpulse.yml`) |
| `DB_PATH` | No | Override SQLite database path (default: `./data/gitpulse.db`) |

---

## Full example configs

### Minimal — single GitHub repo, Anthropic AI

```yaml
gitpulse:
  repos:
    - name: "my-app"
      source: "github"
      owner: "your-org"
      repo: "your-repo"
      branch: "main"

  ai:
    enabled: true
    provider: "anthropic"
    model: "claude-sonnet-4-6"
```

```env
ANTHROPIC_API_KEY=sk-ant-...
GITHUB_TOKEN=ghp_...
```

---

### Team setup — multiple repos, Slack notifications, weekly report

```yaml
gitpulse:
  port: 3000

  repos:
    - name: "web"
      source: "github"
      owner: "your-org"
      repo: "web-app"
      branch: "main"
    - name: "api"
      source: "github"
      owner: "your-org"
      repo: "backend"
      branch: "main"
    - name: "mobile"
      source: "github"
      owner: "your-org"
      repo: "mobile"
      branch: "develop"

  ai:
    enabled: true
    provider: "anthropic"
    model: "claude-sonnet-4-6"
    summary_style: "standup"
    context: >
      E-commerce platform. Web: Next.js storefront. API: Node/Fastify + Postgres.
      Mobile: React Native. Key flows: product browse, cart, checkout, order tracking.
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
      enabled: false
```

```env
ANTHROPIC_API_KEY=sk-ant-...
GITHUB_TOKEN=ghp_...
```

---

### Mixed sources — GitHub + GitLab + local, OpenAI, email reports

```yaml
gitpulse:
  port: 3000

  repos:
    - name: "frontend"
      source: "github"
      owner: "your-org"
      repo: "frontend"
      branch: "main"
    - name: "backend"
      source: "gitlab"
      project_id: "12345678"
      branch: "main"
    - name: "infra"
      source: "local"
      path: "/repos/infra"
      branch: "main"

  ai:
    enabled: true
    provider: "openai"
    model: "gpt-4o"
    summary_style: "management"
    context: >
      Internal tooling platform for a logistics company.
      Frontend: React SPA. Backend: Python/FastAPI on GitLab.
      Infrastructure: Terraform + Ansible in a local repo.
    diff_commits: 3
    diff_max_lines: 60

  reports:
    schedule: "0 8 * * 1"   # Monday 8am
    lookback_days: 7
    output_formats: [html, markdown, json]

  auth:
    enabled: true
    username: "admin"
    password: "changeme"

  notifications:
    slack:
      enabled: false
    email:
      enabled: true
      smtp_host: "smtp.sendgrid.net"
      smtp_port: 587
      smtp_user: "apikey"
      smtp_pass: null   # set SMTP_PASS in .env
      to: "engineering@yourcompany.com, cto@yourcompany.com"
```

```env
OPENAI_API_KEY=sk-...
GITHUB_TOKEN=ghp_...
GITLAB_TOKEN=glpat-...
SMTP_PASS=SG.your-sendgrid-key
```

---

### Solo developer — local repos, cheap AI, no notifications

```yaml
gitpulse:
  repos:
    - name: "project-a"
      source: "local"
      path: "/Users/you/projects/project-a"
      branch: "main"
    - name: "project-b"
      source: "local"
      path: "/Users/you/projects/project-b"
      branch: "main"

  ai:
    enabled: true
    provider: "anthropic"
    model: "claude-haiku-4-5-20251001"   # cheapest model
    summary_style: "technical"
    diff_commits: 10
    diff_max_lines: 100

  reports:
    schedule: null   # generate on demand from dashboard
    lookback_days: 14

  auth:
    enabled: false   # local only — no auth needed
```

```env
ANTHROPIC_API_KEY=sk-ant-...
```
