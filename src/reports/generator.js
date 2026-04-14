/**
 * Build Markdown and JSON report outputs from parsed data + AI summary.
 */
export function buildMarkdownReport(parsedData, summary, config) {
  const { stats, byAuthor, byDay, repos } = parsedData;
  const now = new Date().toISOString();
  const period = config.reports.lookback_days;

  const lines = [
    `# GitPulse Report`,
    `Generated: ${now}  |  Period: last ${period} days`,
    '',
    '## Overview',
    `| Metric | Value |`,
    `|--------|-------|`,
    `| Total commits | ${stats.totalCommits} |`,
    `| Active authors | ${stats.totalAuthors} |`,
    `| Repos | ${stats.totalRepos} |`,
    `| Lines added | +${stats.totalInsertions} |`,
    `| Lines removed | -${stats.totalDeletions} |`,
    '',
  ];

  if (summary?.overall) {
    lines.push('## AI Summary', '', summary.overall, '');
    if (summary.highlights?.length) {
      lines.push('### Highlights', ...summary.highlights.map((h) => `- ${h}`), '');
    }
  }

  lines.push('## Activity by Author', '');
  for (const a of byAuthor) {
    lines.push(
      `### ${a.name}`,
      `- Commits: ${a.commitCount}`,
      `- Lines: +${a.insertions} / -${a.deletions}`,
      `- Repos: ${a.repos.join(', ')}`,
      `- Last active: ${a.lastActive?.slice(0, 10) ?? 'unknown'}`,
      ''
    );
    if (a.recentMessages?.length) {
      lines.push('Recent commits:', ...a.recentMessages.map((m) => `- ${m}`), '');
    }
  }

  lines.push('## Activity by Day', '');
  for (const d of byDay) {
    lines.push(`**${d.date}** — ${d.commitCount} commits (+${d.insertions}/-${d.deletions}) by ${d.authors.join(', ')}`);
  }

  lines.push('', '---', `*GitPulse — https://github.com/frahet/gitpulse*`);

  return lines.join('\n');
}

export function buildJsonReport(parsedData, summary, config) {
  return {
    meta: {
      generated_at: new Date().toISOString(),
      lookback_days: config.reports.lookback_days,
      version: '0.1.0',
    },
    stats: parsedData.stats,
    repos: parsedData.repos,
    by_author: parsedData.byAuthor,
    by_day: parsedData.byDay,
    ai_summary: summary ?? null,
  };
}
