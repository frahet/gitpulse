const API = '';
let refreshTimer = null;
let activeStyle = 'standup';

async function fetchJSON(url) {
  const res = await fetch(API + url);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

// ---- Render helpers ----

function el(id) { return document.getElementById(id); }

function renderStatCards(stats) {
  el('stat-commits').textContent = stats.totalCommits;
  el('stat-authors').textContent = stats.totalAuthors;
  el('stat-repos').textContent = stats.totalRepos;
  el('stat-lines').textContent = `+${stats.totalInsertions}`;
  el('stat-lines-del').textContent = `-${stats.totalDeletions}`;
}

function renderSummary(summary) {
  const panel = el('summary-panel');
  if (!summary || summary.enabled === false) {
    panel.style.display = 'none';
    return;
  }
  panel.style.display = '';
  const providerLabel = summary.provider ? `${summary.provider} · ${summary.style}` : (summary.style ?? 'ai');
  el('summary-style-badge').textContent = providerLabel;

  const sourceEl = el('summary-source');
  if (summary.source === 'db') {
    sourceEl.textContent = 'cached today';
    sourceEl.className = 'summary-source source-cached';
  } else {
    sourceEl.textContent = 'just generated';
    sourceEl.className = 'summary-source source-live';
  }

  el('summary-text').textContent = summary.overall ?? '';

  const hl = el('summary-highlights');
  if (summary.highlights?.length) {
    hl.style.display = '';
    el('highlights-list').innerHTML = summary.highlights
      .map((h) => `<li>${escapeHtml(h)}</li>`)
      .join('');
  } else {
    hl.style.display = 'none';
  }
}

function renderAuthors(byAuthor) {
  const tbody = el('author-tbody');
  if (!byAuthor?.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="loading">No activity in this period.</td></tr>';
    return;
  }
  tbody.innerHTML = byAuthor.map((a) => `
    <tr>
      <td><span class="author-name">${escapeHtml(a.name)}</span><br>
          <span style="color:var(--text-muted);font-size:11px">${escapeHtml(a.email ?? '')}</span></td>
      <td class="commit-count">${a.commitCount}</td>
      <td><span class="lines-added">+${a.insertions}</span> / <span class="lines-removed">-${a.deletions}</span></td>
      <td>${(a.repos ?? []).map(r => `<span class="repo-badge">${escapeHtml(r)}</span>`).join(' ')}</td>
      <td>${a.lastActive?.slice(0, 10) ?? '—'}</td>
      <td style="color:var(--text-muted);font-size:11px;max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
        ${escapeHtml(a.recentMessages?.[0] ?? '')}
      </td>
    </tr>
  `).join('');
}

function renderTimeline(byDay) {
  const container = el('timeline');
  if (!byDay?.length) {
    container.innerHTML = '<div class="loading">No activity data.</div>';
    return;
  }
  const max = Math.max(...byDay.map((d) => d.commitCount), 1);
  container.innerHTML = byDay.map((d) => {
    const pct = Math.round((d.commitCount / max) * 100);
    return `
      <div class="timeline-row">
        <span class="timeline-date">${d.date}</span>
        <div class="timeline-bar-wrap">
          <div class="timeline-bar" style="width:${pct}%"></div>
        </div>
        <span class="timeline-count">${d.commitCount}</span>
      </div>
    `;
  }).join('');
}

function renderRepos(data) {
  const container = el('repos-container');
  const repoNames = [...new Set(data.allCommits.map((c) => c.repo))];
  container.innerHTML = repoNames.map((name) => {
    const commits = data.allCommits.filter((c) => c.repo === name).slice(0, 20);
    const repoMeta = data.repos.find((r) => r.name === name);
    return `
      <details class="panel repo-section">
        <summary>
          <span>${escapeHtml(name)}</span>
          <span class="repo-badge">${repoMeta?.branch ?? 'main'}</span>
          <span class="repo-badge">${commits.length} commits</span>
          ${repoMeta?.error ? `<span style="color:var(--red);font-size:11px">⚠ ${escapeHtml(repoMeta.error)}</span>` : ''}
        </summary>
        <ul class="commit-list">
          ${commits.map((c) => `
            <li class="commit-item">
              <span class="commit-hash">${escapeHtml(c.hash ?? '')}</span>
              <span class="commit-msg" title="${escapeHtml(c.message ?? '')}">${escapeHtml(c.message ?? '')}</span>
              <span class="commit-author">${escapeHtml(c.author ?? '')}</span>
              <span class="commit-date">${c.date?.slice(0, 10) ?? ''}</span>
            </li>
          `).join('')}
        </ul>
      </details>
    `;
  }).join('');
}

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ---- Main load ----

async function loadAll() {
  el('refresh-btn').disabled = true;
  el('last-updated').textContent = 'Loading…';

  try {
    const [activity, summary] = await Promise.all([
      fetchJSON('/api/activity'),
      fetchJSON(`/api/summary?style=${activeStyle}`).catch(() => null),
    ]);

    renderStatCards(activity.stats);
    renderSummary(summary);
    renderAuthors(activity.byAuthor);
    renderTimeline(activity.byDay);
    renderRepos(activity);

    el('last-updated').textContent = `Updated ${new Date().toLocaleTimeString()}`;
  } catch (err) {
    el('last-updated').textContent = `Error: ${err.message}`;
    console.error(err);
  } finally {
    el('refresh-btn').disabled = false;
  }
}

async function manualRefresh() {
  el('refresh-btn').disabled = true;
  el('last-updated').textContent = 'Refreshing…';
  try {
    await fetch('/api/refresh', { method: 'POST' });
  } catch (_) {}
  await loadAll();
}

// Auto-refresh every 5 minutes
function scheduleAutoRefresh() {
  if (refreshTimer) clearInterval(refreshTimer);
  refreshTimer = setInterval(loadAll, 5 * 60 * 1000);
}

// ---- Reports toolbar ----

document.querySelectorAll('.style-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.style-btn').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    activeStyle = btn.dataset.style;
  });
});

el('generate-btn').addEventListener('click', async () => {
  el('generate-btn').disabled = true;
  el('generate-btn').textContent = '…';
  try {
    // POST /api/refresh clears git cache + today's DB reports, then force=true
    // ensures we call the AI API even if a new DB entry was saved moments ago
    await fetch('/api/refresh', { method: 'POST' });
    const summary = await fetchJSON(`/api/summary?style=${activeStyle}&force=true`);
    renderSummary(summary);
    el('last-updated').textContent = `Summary updated ${new Date().toLocaleTimeString()}`;
  } catch (err) {
    el('last-updated').textContent = `Error: ${err.message}`;
  } finally {
    el('generate-btn').disabled = false;
    el('generate-btn').textContent = '↻ Generate';
  }
});

el('dl-md-btn').addEventListener('click', () => {
  window.location.href = `/api/report.md?style=${activeStyle}`;
});

el('dl-json-btn').addEventListener('click', () => {
  window.location.href = `/api/report.json?style=${activeStyle}`;
});

el('refresh-btn').addEventListener('click', manualRefresh);
loadAll();
scheduleAutoRefresh();
