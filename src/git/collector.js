import { simpleGit } from 'simple-git';

/**
 * Collect raw git data for a single repo within the lookback window.
 * Returns { name, path, branch, commits, branches, error }
 */
export async function collectRepo(repoConfig, lookbackDays) {
  const { name, path, branch } = repoConfig;
  const since = new Date();
  since.setDate(since.getDate() - lookbackDays);
  const sinceISO = since.toISOString();

  try {
    const git = simpleGit(path);

    // Verify this is a git repo
    await git.status();

    // Use --numstat for machine-readable insertions/deletions per commit
    // Format: one header line + blank line + numstat lines per commit
    const raw = await git.raw([
      'log',
      `--since=${sinceISO}`,
      '--format=COMMIT %H|%an|%ae|%aI|%s',
      '--numstat',
    ]);

    const commits = parseNumstatLog(raw, name);

    // Collect active branches
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
        return {
          ref: line.slice(0, pipeIdx).trim(),
          lastCommit: line.slice(pipeIdx + 1).trim(),
        };
      })
      .slice(0, 20);

    return { name, path, branch, commits, branches, error: null };
  } catch (err) {
    return { name, path, branch, commits: [], branches: [], error: err.message };
  }
}

/**
 * Parse `git log --format='COMMIT ...' --numstat` output.
 *
 * Each commit block:
 *   COMMIT hash|author|email|date|subject
 *   (blank line)
 *   3\t1\tsrc/foo.js
 *   10\t0\tsrc/bar.ts
 *   (blank line before next COMMIT)
 */
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
        author: parts[1]?.trim() ?? '',
        email: parts[2]?.trim() ?? '',
        date: parts[3]?.trim() ?? '',
        message: parts.slice(4).join('|').trim(),
        filesChanged: 0,
        insertions: 0,
        deletions: 0,
        repo: repoName,
      };
    } else if (current && line.match(/^\d+\t\d+\t/)) {
      const [ins, del] = line.split('\t');
      const insNum = parseInt(ins, 10);
      const delNum = parseInt(del, 10);
      if (!isNaN(insNum)) current.insertions += insNum;
      if (!isNaN(delNum)) current.deletions += delNum;
      current.filesChanged++;
    }
  }

  if (current) commits.push(current);
  return commits;
}

/**
 * Collect all configured repos in parallel.
 */
export async function collectAll(config) {
  const results = await Promise.all(
    config.repos.map((repo) => collectRepo(repo, config.reports.lookback_days))
  );
  return results;
}
