import { Gitlab } from '@gitbeaker/rest';

export async function collectGitlabRepo(repoConfig, lookbackDays) {
  const { name, host, projectId, branch, token } = repoConfig;

  const since = new Date();
  since.setDate(since.getDate() - lookbackDays);

  try {
    const gl = new Gitlab({
      host: host ?? 'https://gitlab.com',
      token: token ?? process.env.GITLAB_TOKEN,
    });

    // Fetch commits since lookback date
    const rawCommits = await gl.Commits.all(projectId, {
      refName: branch ?? 'main',
      since: since.toISOString(),
      perPage: 100,
    });

    const commits = await Promise.all(
      rawCommits.slice(0, 100).map(async (c, i) => {
        let insertions = 0, deletions = 0, files = [], diff = null;

        if (i < 5) {
          try {
            const diffData = await gl.Commits.showDiff(projectId, c.id);
            for (const d of diffData) {
              const addCount = (d.diff.match(/^\+/gm) ?? []).length;
              const delCount = (d.diff.match(/^-/gm) ?? []).length;
              insertions += addCount;
              deletions += delCount;
              files.push({ path: d.new_path, insertions: addCount, deletions: delCount });
            }
            const patchLines = diffData
              .filter((d) => d.diff)
              .flatMap((d) => [`--- ${d.new_path}`, d.diff])
              .slice(0, 80);
            diff = patchLines.join('\n') || null;
          } catch (_) {}
        }

        return {
          hash: c.id.slice(0, 8),
          fullHash: c.id,
          author: c.author_name ?? 'unknown',
          email: c.author_email ?? '',
          date: c.authored_date ?? '',
          message: c.title ?? '',
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
    const rawBranches = await gl.Branches.all(projectId, { perPage: 20 });
    const branches = rawBranches.map((b) => ({
      ref: b.name,
      lastCommit: b.commit?.id?.slice(0, 8) ?? '',
    }));

    return { name, projectId, branch, commits, branches, error: null };
  } catch (err) {
    return { name, projectId, branch, commits: [], branches: [], error: err.message };
  }
}
