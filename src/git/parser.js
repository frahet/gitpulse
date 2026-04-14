/**
 * Normalize raw collected repo data into a unified analytics structure.
 */
export function parseRepoData(repoDataArray) {
  const allCommits = repoDataArray.flatMap((r) => r.commits);

  const byAuthor = groupByAuthor(allCommits);
  const byDay = groupByDay(allCommits);
  const stats = summarizeStats(allCommits, repoDataArray);

  return {
    repos: repoDataArray.map((r) => ({
      name: r.name,
      branch: r.branch,
      commitCount: r.commits.length,
      branches: r.branches,
      error: r.error,
    })),
    allCommits,
    byAuthor,
    byDay,
    stats,
    collectedAt: new Date().toISOString(),
  };
}

function groupByAuthor(commits) {
  const map = new Map();

  for (const c of commits) {
    const key = c.email || c.author;
    if (!map.has(key)) {
      map.set(key, {
        name: c.author,
        email: c.email,
        commitCount: 0,
        insertions: 0,
        deletions: 0,
        repos: new Set(),
        lastActive: null,
        recentMessages: [],
      });
    }
    const entry = map.get(key);
    entry.commitCount++;
    entry.insertions += c.insertions;
    entry.deletions += c.deletions;
    entry.repos.add(c.repo);
    if (!entry.lastActive || c.date > entry.lastActive) {
      entry.lastActive = c.date;
    }
    if (entry.recentMessages.length < 5) {
      entry.recentMessages.push(c.message);
    }
  }

  return Array.from(map.values())
    .map((a) => ({ ...a, repos: Array.from(a.repos) }))
    .sort((a, b) => b.commitCount - a.commitCount);
}

function groupByDay(commits) {
  const map = new Map();

  for (const c of commits) {
    const day = c.date?.slice(0, 10) ?? 'unknown';
    if (!map.has(day)) {
      map.set(day, { date: day, commitCount: 0, insertions: 0, deletions: 0, authors: new Set() });
    }
    const entry = map.get(day);
    entry.commitCount++;
    entry.insertions += c.insertions;
    entry.deletions += c.deletions;
    entry.authors.add(c.author);
  }

  return Array.from(map.values())
    .map((d) => ({ ...d, authors: Array.from(d.authors) }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

function summarizeStats(commits, repoDataArray) {
  const authors = new Set(commits.map((c) => c.email || c.author));
  const totalInsertions = commits.reduce((s, c) => s + c.insertions, 0);
  const totalDeletions = commits.reduce((s, c) => s + c.deletions, 0);

  const mostActiveAuthor = commits.reduce((acc, c) => {
    acc[c.author] = (acc[c.author] ?? 0) + 1;
    return acc;
  }, {});

  const topAuthor = Object.entries(mostActiveAuthor).sort((a, b) => b[1] - a[1])[0];

  const errors = repoDataArray.filter((r) => r.error).map((r) => ({ repo: r.name, error: r.error }));

  return {
    totalCommits: commits.length,
    totalAuthors: authors.size,
    totalRepos: repoDataArray.length,
    totalInsertions,
    totalDeletions,
    topAuthor: topAuthor ? { name: topAuthor[0], commits: topAuthor[1] } : null,
    errors,
  };
}
