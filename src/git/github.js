import { Octokit } from '@octokit/rest';

export async function collectGithubRepo(repoConfig, lookbackDays) {
  const { name, owner, repo, branch, token } = repoConfig;

  const since = new Date();
  since.setDate(since.getDate() - lookbackDays);

  try {
    const octokit = new Octokit({ auth: token ?? process.env.GITHUB_TOKEN });

    // Fetch commits since lookback date
    const { data: rawCommits } = await octokit.repos.listCommits({
      owner,
      repo,
      sha: branch ?? 'main',
      since: since.toISOString(),
      per_page: 100,
    });

    // Fetch stat details for each commit (parallel, capped at 20 to avoid rate limits)
    const commits = await Promise.all(
      rawCommits.slice(0, 100).map(async (c, i) => {
        let insertions = 0, deletions = 0, files = [], diff = null;

        // Only fetch full diff for first N commits
        if (i < 5) {
          try {
            const { data: detail } = await octokit.repos.getCommit({ owner, repo, ref: c.sha });
            insertions = detail.stats?.additions ?? 0;
            deletions = detail.stats?.deletions ?? 0;
            files = (detail.files ?? []).map((f) => ({
              path: f.filename,
              insertions: f.additions,
              deletions: f.deletions,
            }));
            // Collect patch as diff
            const patchLines = (detail.files ?? [])
              .filter((f) => f.patch)
              .flatMap((f) => [`--- ${f.filename}`, f.patch])
              .slice(0, 80);
            diff = patchLines.join('\n') || null;
          } catch (_) {}
        }

        return {
          hash: c.sha.slice(0, 8),
          fullHash: c.sha,
          author: c.commit.author?.name ?? c.author?.login ?? 'unknown',
          email: c.commit.author?.email ?? '',
          date: c.commit.author?.date ?? '',
          message: c.commit.message?.split('\n')[0] ?? '',
          filesChanged: files.length,
          insertions,
          deletions,
          files,
          diff,
          repo: name,
        };
      })
    );

    // Fetch branches
    const { data: rawBranches } = await octokit.repos.listBranches({ owner, repo, per_page: 20 });
    const branches = rawBranches.map((b) => ({ ref: b.name, lastCommit: b.commit.sha.slice(0, 8) }));

    return { name, owner, repo, branch, commits, branches, error: null };
  } catch (err) {
    return { name, owner, repo, branch, commits: [], branches: [], error: err.message };
  }
}
