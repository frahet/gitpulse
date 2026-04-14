import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

// Reads lightweight repo info (README, package.json, root listing) for context generation.
// Returns { name, readme, packageJson, rootFiles } — all fields optional/null if unavailable.

export async function readRepoInfo(repoConfig) {
  const { source } = repoConfig;
  if (source === 'github') return readGithubInfo(repoConfig);
  if (source === 'gitlab') return readGitlabInfo(repoConfig);
  return readLocalInfo(repoConfig);
}

// ---- Local ----

function readLocalInfo(repoConfig) {
  const { name, path } = repoConfig;
  const read = (file) => {
    try { return readFileSync(join(path, file), 'utf8').slice(0, 3000); } catch { return null; }
  };
  const listRoot = () => {
    try { return readdirSync(path).filter((f) => !f.startsWith('.')).slice(0, 40); } catch { return []; }
  };

  return {
    name,
    readme: read('README.md') ?? read('readme.md') ?? read('README'),
    packageJson: read('package.json'),
    rootFiles: listRoot(),
  };
}

// ---- GitHub ----

async function readGithubInfo(repoConfig) {
  const { name, owner, repo, branch = 'main', token } = repoConfig;
  const ghToken = token ?? process.env.GITHUB_TOKEN;
  const { Octokit } = await import('@octokit/rest');
  const octokit = new Octokit({ auth: ghToken });

  const fetchFile = async (path) => {
    try {
      const { data } = await octokit.repos.getContent({ owner, repo, path, ref: branch });
      if (data.type !== 'file') return null;
      return Buffer.from(data.content, 'base64').toString('utf8').slice(0, 3000);
    } catch { return null; }
  };

  const listRoot = async () => {
    try {
      const { data } = await octokit.repos.getContent({ owner, repo, path: '', ref: branch });
      return Array.isArray(data) ? data.map((f) => f.name).slice(0, 40) : [];
    } catch { return []; }
  };

  const [readme, packageJson, rootFiles] = await Promise.all([
    fetchFile('README.md').then((r) => r ?? fetchFile('readme.md')),
    fetchFile('package.json'),
    listRoot(),
  ]);

  return { name, readme, packageJson, rootFiles };
}

// ---- GitLab ----

async function readGitlabInfo(repoConfig) {
  const { name, projectId, host, branch = 'main', token } = repoConfig;
  const glToken = token ?? process.env.GITLAB_TOKEN;
  const { Gitlab } = await import('@gitbeaker/rest');
  const gl = new Gitlab({ host: host ?? 'https://gitlab.com', token: glToken });

  const fetchFile = async (filePath) => {
    try {
      const file = await gl.RepositoryFiles.show(projectId, filePath, branch);
      return Buffer.from(file.content, 'base64').toString('utf8').slice(0, 3000);
    } catch { return null; }
  };

  const listRoot = async () => {
    try {
      const tree = await gl.Repositories.tree(projectId, { ref: branch, per_page: 40 });
      return tree.map((f) => f.name);
    } catch { return []; }
  };

  const [readme, packageJson, rootFiles] = await Promise.all([
    fetchFile('README.md').then((r) => r ?? fetchFile('readme.md')),
    fetchFile('package.json'),
    listRoot(),
  ]);

  return { name, readme, packageJson, rootFiles };
}
