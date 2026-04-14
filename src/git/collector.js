import { simpleGit } from 'simple-git';

export async function collectRepo(repoConfig, lookbackDays, diffCommits = 5, diffMaxLines = 80) {
  const { name, path, branch } = repoConfig;
  const since = new Date();
  since.setDate(since.getDate() - lookbackDays);
  const sinceISO = since.toISOString();

  try {
    const git = simpleGit(path);
    await git.status();

    // Commits with numstat — gets file paths + insertion/deletion counts
    const raw = await git.raw([
      'log',
      `--since=${sinceISO}`,
      '--format=COMMIT %H|%an|%ae|%aI|%s',
      '--numstat',
    ]);

    const commits = parseNumstatLog(raw, name);

    // Collect actual diffs for N most recent commits
    for (const commit of commits.slice(0, diffCommits)) {
      try {
        const diffRaw = await git.raw(['show', '--unified=3', '--no-color', commit.fullHash]);
        commit.diff = truncateDiff(diffRaw, diffMaxLines);
      } catch (_) {
        commit.diff = null;
      }
    }

    // Active branches
    const branchRaw = await git.raw([
      'branch', '-a',
      '--sort=-committerdate',
      '--format=%(refname:short)|%(committerdate:iso)',
    ]);
    const branches = branchRaw
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const pipeIdx = line.indexOf('|');
        return { ref: line.slice(0, pipeIdx).trim(), lastCommit: line.slice(pipeIdx + 1).trim() };
      })
      .slice(0, 20);

    return { name, path, branch, commits, branches, error: null };
  } catch (err) {
    return { name, path, branch, commits: [], branches: [], error: err.message };
  }
}

function parseNumstatLog(raw, repoName) {
  const commits = [];
  const lines = raw.split('\n');
  let current = null;

  for (const line of lines) {
    if (line.startsWith('COMMIT ')) {
      if (current) commits.push(current);
      const parts = line.slice(7).split('|');
      current = {
        hash: parts[0]?.trim().slice(0, 8),
        fullHash: parts[0]?.trim(),
        author: parts[1]?.trim() ?? '',
        email: parts[2]?.trim() ?? '',
        date: parts[3]?.trim() ?? '',
        message: parts.slice(4).join('|').trim(),
        filesChanged: 0,
        insertions: 0,
        deletions: 0,
        files: [],
        diff: null,
        repo: repoName,
      };
    } else if (current && line.match(/^\d+\t\d+\t/)) {
      const [ins, del, ...fileParts] = line.split('\t');
      const filePath = fileParts.join('\t').trim();
      const insNum = parseInt(ins, 10);
      const delNum = parseInt(del, 10);
      if (!isNaN(insNum)) current.insertions += insNum;
      if (!isNaN(delNum)) current.deletions += delNum;
      current.filesChanged++;
      if (filePath) current.files.push({ path: filePath, insertions: insNum, deletions: delNum });
    }
  }

  if (current) commits.push(current);
  return commits;
}

function truncateDiff(diffText, maxLines) {
  const lines = diffText.split('\n');
  if (lines.length <= maxLines) return diffText;
  return lines.slice(0, maxLines).join('\n') + `\n... (truncated, ${lines.length - maxLines} more lines)`;
}

export async function collectAll(config) {
  const { collectGithubRepo } = await import('./github.js');

  const results = await Promise.all(
    config.repos.map((repo) => {
      if (repo.source === 'github') {
        return collectGithubRepo(repo, config.reports.lookback_days);
      }
      return collectRepo(repo, config.reports.lookback_days, config.ai.diff_commits, config.ai.diff_max_lines);
    })
  );
  return results;
}
