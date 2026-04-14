# GitPulse ⚡

Self-hosted Git analytics and AI reporting. Mount your repos, run the container, open the dashboard. Works like Grafana — `docker run` and it just works.

Built with Fastify + Vanilla JS. AI summaries powered by Claude.

---

## Quick start

```bash
# 1. Copy and edit the config
cp gitpulse.yml.example gitpulse.yml
# edit gitpulse.yml — set your repo paths and preferences

# 2. Set your Anthropic key (only needed if ai.enabled: true)
export ANTHROPIC_API_KEY=sk-ant-...

# 3. Run
docker compose up
```

Open http://localhost:3000

---

## gitpulse.yml reference

```yaml
gitpulse:
  port: 3000

  repos:
    - name: "My App"
      path: "/repos/myapp"     # local path — mount via Docker volume
      branch: "main"

  ai:
    provider: "anthropic"
    model: "claude-sonnet-4-20250514"
    enabled: true
    summary_style: "standup"   # management | technical | standup

  reports:
    schedule: "0 9 * * 1-5"   # cron: weekdays at 9am
    lookback_days: 7
    output_formats:
      - html
      - markdown
      - json

  auth:
    enabled: false             # set true to require login
    username: "admin"
    password: "changeme"
```

### Summary styles

| Style | Audience | Format |
|-------|----------|--------|
| `management` | Non-technical stakeholders | Plain English, no jargon, focuses on outcomes |
| `technical` | Developers | Detailed, includes file paths, PR-like language |
| `standup` | Team | Bullet points per person — what they did, what's in progress |

---

## API endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Server health + uptime |
| GET | `/api/repos` | Configured repos list |
| GET | `/api/activity` | Full parsed git data (all repos) |
| GET | `/api/activity/:repo` | Data for a single repo |
| GET | `/api/summary` | AI-generated summary (cached 1hr) |
| GET | `/api/report.md` | Markdown report download |
| GET | `/api/report.json` | Full JSON report download |
| POST | `/api/refresh` | Clear cache and re-fetch everything |

---

## Docker volume setup

Mount your repos read-only into `/repos/` inside the container:

```yaml
# docker-compose.yml
volumes:
  - ./gitpulse.yml:/app/gitpulse.yml:ro
  - /Users/you/projects:/repos:ro
```

Then reference them in `gitpulse.yml`:
```yaml
repos:
  - name: "myapp"
    path: "/repos/myapp"
```

---

## Running without Docker

```bash
npm install
cp .env.example .env   # add ANTHROPIC_API_KEY
node src/index.js
```

Requires Node.js 20+.

---

## Contributing

1. Fork the repo
2. Create a feature branch
3. Keep it simple — no build step, no bundler
4. Open a PR

---

## License

MIT
