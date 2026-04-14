import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { parseRepoData } from '../src/git/parser.js';

function makeCommit(overrides = {}) {
  return {
    hash: 'abc12345',
    fullHash: 'abc123456789',
    author: 'Alice',
    email: 'alice@example.com',
    date: '2024-01-15T10:00:00Z',
    message: 'fix: something',
    filesChanged: 1,
    insertions: 10,
    deletions: 5,
    files: [{ path: 'src/index.js', insertions: 10, deletions: 5 }],
    diff: null,
    repo: 'my-app',
    ...overrides,
  };
}

function makeRepo(overrides = {}) {
  return {
    name: 'my-app',
    path: '/repos/my-app',
    branch: 'main',
    commits: [],
    branches: [],
    error: null,
    ...overrides,
  };
}

describe('parseRepoData', () => {
  test('returns correct shape', () => {
    const repos = [makeRepo({ commits: [makeCommit()] })];
    const result = parseRepoData(repos);

    assert.ok(Array.isArray(result.repos));
    assert.ok(Array.isArray(result.allCommits));
    assert.ok(Array.isArray(result.byAuthor));
    assert.ok(Array.isArray(result.byDay));
    assert.ok(Array.isArray(result.hotFiles));
    assert.ok(typeof result.stats === 'object');
    assert.ok(typeof result.collectedAt === 'string');
  });

  test('allCommits flattens across repos', () => {
    const repos = [
      makeRepo({ name: 'repo-a', commits: [makeCommit({ repo: 'repo-a' }), makeCommit({ repo: 'repo-a', hash: 'bbb' })] }),
      makeRepo({ name: 'repo-b', commits: [makeCommit({ repo: 'repo-b', hash: 'ccc' })] }),
    ];
    const result = parseRepoData(repos);
    assert.equal(result.allCommits.length, 3);
  });

  test('stats totalCommits matches allCommits length', () => {
    const commits = [makeCommit(), makeCommit({ hash: 'def' }), makeCommit({ hash: 'ghi' })];
    const repos = [makeRepo({ commits })];
    const result = parseRepoData(repos);
    assert.equal(result.stats.totalCommits, 3);
  });

  test('stats totalRepos matches repo array length', () => {
    const repos = [makeRepo({ name: 'a' }), makeRepo({ name: 'b' })];
    const result = parseRepoData(repos);
    assert.equal(result.stats.totalRepos, 2);
  });

  test('stats totalInsertions and totalDeletions are summed', () => {
    const commits = [
      makeCommit({ insertions: 10, deletions: 5 }),
      makeCommit({ insertions: 20, deletions: 3, hash: 'xyz' }),
    ];
    const repos = [makeRepo({ commits })];
    const result = parseRepoData(repos);
    assert.equal(result.stats.totalInsertions, 30);
    assert.equal(result.stats.totalDeletions, 8);
  });

  test('stats totalAuthors counts unique by email', () => {
    const commits = [
      makeCommit({ author: 'Alice', email: 'alice@example.com' }),
      makeCommit({ author: 'Alice Again', email: 'alice@example.com', hash: 'x1' }),
      makeCommit({ author: 'Bob', email: 'bob@example.com', hash: 'x2' }),
    ];
    const repos = [makeRepo({ commits })];
    const result = parseRepoData(repos);
    assert.equal(result.stats.totalAuthors, 2);
  });

  test('stats topAuthor is the one with most commits', () => {
    const commits = [
      makeCommit({ author: 'Alice', email: 'alice@example.com' }),
      makeCommit({ author: 'Alice', email: 'alice@example.com', hash: 'a2' }),
      makeCommit({ author: 'Bob', email: 'bob@example.com', hash: 'b1' }),
    ];
    const repos = [makeRepo({ commits })];
    const result = parseRepoData(repos);
    assert.equal(result.stats.topAuthor.name, 'Alice');
    assert.equal(result.stats.topAuthor.commits, 2);
  });

  test('byAuthor groups commits by email', () => {
    const commits = [
      makeCommit({ author: 'Alice', email: 'alice@example.com', insertions: 5 }),
      makeCommit({ author: 'Alice', email: 'alice@example.com', insertions: 15, hash: 'a2' }),
      makeCommit({ author: 'Bob', email: 'bob@example.com', insertions: 7, hash: 'b1' }),
    ];
    const repos = [makeRepo({ commits })];
    const result = parseRepoData(repos);

    assert.equal(result.byAuthor.length, 2);
    const alice = result.byAuthor.find((a) => a.email === 'alice@example.com');
    assert.ok(alice);
    assert.equal(alice.commitCount, 2);
    assert.equal(alice.insertions, 20);
  });

  test('byAuthor is sorted by commitCount descending', () => {
    const commits = [
      makeCommit({ author: 'Bob', email: 'bob@example.com', hash: 'b1' }),
      makeCommit({ author: 'Alice', email: 'alice@example.com', hash: 'a1' }),
      makeCommit({ author: 'Alice', email: 'alice@example.com', hash: 'a2' }),
    ];
    const repos = [makeRepo({ commits })];
    const result = parseRepoData(repos);
    assert.equal(result.byAuthor[0].email, 'alice@example.com');
  });

  test('byDay groups commits by date prefix', () => {
    const commits = [
      makeCommit({ date: '2024-01-15T10:00:00Z', hash: 'd1' }),
      makeCommit({ date: '2024-01-15T14:00:00Z', hash: 'd2' }),
      makeCommit({ date: '2024-01-16T09:00:00Z', hash: 'd3' }),
    ];
    const repos = [makeRepo({ commits })];
    const result = parseRepoData(repos);

    assert.equal(result.byDay.length, 2);
    const day15 = result.byDay.find((d) => d.date === '2024-01-15');
    assert.ok(day15);
    assert.equal(day15.commitCount, 2);
  });

  test('byDay is sorted chronologically', () => {
    const commits = [
      makeCommit({ date: '2024-01-20T10:00:00Z', hash: 'z1' }),
      makeCommit({ date: '2024-01-10T10:00:00Z', hash: 'z2' }),
    ];
    const repos = [makeRepo({ commits })];
    const result = parseRepoData(repos);
    assert.ok(result.byDay[0].date < result.byDay[1].date);
  });

  test('hotFiles aggregates file touches', () => {
    const commits = [
      makeCommit({ hash: 'h1', files: [{ path: 'src/index.js', insertions: 5, deletions: 2 }] }),
      makeCommit({ hash: 'h2', files: [{ path: 'src/index.js', insertions: 3, deletions: 1 }, { path: 'src/utils.js', insertions: 10, deletions: 0 }] }),
    ];
    const repos = [makeRepo({ commits })];
    const result = parseRepoData(repos);

    const indexFile = result.hotFiles.find((f) => f.path === 'src/index.js');
    assert.ok(indexFile);
    assert.equal(indexFile.commitCount, 2);
    assert.equal(indexFile.insertions, 8);
    assert.equal(indexFile.deletions, 3);
  });

  test('hotFiles sorted by commitCount descending', () => {
    const commits = [
      makeCommit({ hash: 'h1', files: [{ path: 'rare.js', insertions: 1, deletions: 0 }] }),
      makeCommit({ hash: 'h2', files: [{ path: 'hot.js', insertions: 1, deletions: 0 }] }),
      makeCommit({ hash: 'h3', files: [{ path: 'hot.js', insertions: 1, deletions: 0 }] }),
    ];
    const repos = [makeRepo({ commits })];
    const result = parseRepoData(repos);
    assert.equal(result.hotFiles[0].path, 'hot.js');
  });

  test('stats errors lists repos with errors', () => {
    const repos = [
      makeRepo({ name: 'ok-repo', commits: [makeCommit()] }),
      makeRepo({ name: 'broken-repo', commits: [], error: 'not a git repo' }),
    ];
    const result = parseRepoData(repos);
    assert.equal(result.stats.errors.length, 1);
    assert.equal(result.stats.errors[0].repo, 'broken-repo');
  });

  test('handles empty repos array gracefully', () => {
    const result = parseRepoData([]);
    assert.equal(result.allCommits.length, 0);
    assert.equal(result.stats.totalCommits, 0);
    assert.equal(result.stats.totalAuthors, 0);
    assert.equal(result.stats.topAuthor, null);
  });

  test('handles commits with no files', () => {
    const commits = [makeCommit({ files: [] })];
    const repos = [makeRepo({ commits })];
    const result = parseRepoData(repos);
    assert.equal(result.hotFiles.length, 0);
    assert.equal(result.stats.totalCommits, 1);
  });
});
