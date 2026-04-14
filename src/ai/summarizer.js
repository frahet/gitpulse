import { generateText } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { openai } from '@ai-sdk/openai';
import { google } from '@ai-sdk/google';
import { mistral } from '@ai-sdk/mistral';

// Per-style cache: Map<"provider/model/style", { data, expiresAt }>
const summaryCache = new Map();
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

const STYLE_INSTRUCTIONS = {
  management:
    'Write in plain English with no technical jargon. Focus on what got done, who did it, and what value it delivers. No file paths, no code terms.',
  technical:
    'Be detailed and precise. Include file paths, component names, and use PR-like language (feat, fix, refactor). Developers are the audience.',
  standup:
    'Format as concise bullet points per person. Each person: what they did, what is in progress. Keep it tight — this is a daily standup.',
};

const SUPPORTED_PROVIDERS = {
  anthropic: (model) => anthropic(model),
  openai:    (model) => openai(model),
  google:    (model) => google(model),
  mistral:   (model) => mistral(model),
};

function getModel(provider, model) {
  const factory = SUPPORTED_PROVIDERS[provider];
  if (!factory) {
    const valid = Object.keys(SUPPORTED_PROVIDERS).join(', ');
    throw new Error(`Unknown AI provider "${provider}". Supported: ${valid}`);
  }
  return factory(model);
}

export async function generateSummary(parsedData, aiConfig, styleOverride = null, repoContexts = {}) {
  if (!aiConfig.enabled) return null;

  const { provider, model } = aiConfig;
  const style = styleOverride ?? aiConfig.summary_style ?? 'standup';
  const cacheKey = `${provider}/${model}/${style}`;

  const cached = summaryCache.get(cacheKey);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.data;
  }

  const styleInstruction = STYLE_INSTRUCTIONS[style] ?? STYLE_INSTRUCTIONS.standup;
  const prompt = buildPrompt(parsedData, styleInstruction, repoContexts);

  // Build context block: global fallback + per-repo overrides
  const contextLines = [];
  if (aiConfig.context) contextLines.push(`GLOBAL PROJECT CONTEXT: ${aiConfig.context}`);
  for (const [repo, ctx] of Object.entries(repoContexts)) {
    if (ctx) contextLines.push(`REPO "${repo}": ${ctx}`);
  }

  const systemPrompt = [
    'You are an engineering analytics assistant. You receive structured git activity data and produce clear, useful summaries. Be factual — only report what the data shows.',
    contextLines.length ? contextLines.join('\n') : null,
  ].filter(Boolean).join('\n\n');

  const { text } = await generateText({
    model: getModel(provider, model),
    system: systemPrompt,
    prompt,
    maxTokens: 1024,
  });

  const highlights = extractHighlights(text);

  const result = {
    overall: text,
    by_author: parsedData.byAuthor.map((a) => ({
      name: a.name,
      commits: a.commitCount,
      summary: extractAuthorSummary(text, a.name),
    })),
    highlights,
    style,
    provider,
    model,
    generated_at: new Date().toISOString(),
  };

  summaryCache.set(cacheKey, { data: result, expiresAt: Date.now() + CACHE_TTL_MS });
  return result;
}

export function clearCache() {
  summaryCache.clear();
}

function buildPrompt(parsedData, styleInstruction, repoContexts = {}) {
  const { stats, byAuthor, byDay, repos, hotFiles, allCommits } = parsedData;

  const repoLines = repos.map((r) => {
    const ctx = repoContexts[r.name];
    return `  - ${r.name}: ${r.commitCount} commits${ctx ? ` (${ctx})` : ''}`;
  }).join('\n');

  const authorLines = byAuthor
    .map((a) => `  - ${a.name} (${a.commitCount} commits, +${a.insertions}/-${a.deletions} lines): ${a.recentMessages.slice(0, 3).join('; ')}`)
    .join('\n');

  const dayLines = byDay
    .map((d) => `  ${d.date}: ${d.commitCount} commits by ${d.authors.join(', ')}`)
    .join('\n');

  const hotFileLines = (hotFiles ?? []).slice(0, 10)
    .map((f) => `  - ${f.path} (${f.commitCount} commits, +${f.insertions}/-${f.deletions})`)
    .join('\n');

  // Include actual diffs for recent commits that have them
  const diffSections = allCommits
    .filter((c) => c.diff)
    .slice(0, 5)
    .map((c) => `=== ${c.hash} by ${c.author}: ${c.message} ===\n${c.diff}`)
    .join('\n\n');

  return `
Here is the git activity data for the reporting period:

OVERVIEW
- Total commits: ${stats.totalCommits}
- Active authors: ${stats.totalAuthors}
- Repos covered: ${stats.totalRepos}
- Net lines: +${stats.totalInsertions}/-${stats.totalDeletions}

REPOS
${repoLines}

AUTHORS
${authorLines}

ACTIVITY BY DAY
${dayLines}

${hotFileLines ? `MOST CHANGED FILES\n${hotFileLines}` : ''}

${diffSections ? `RECENT COMMIT DIFFS (actual code changes)\n${diffSections}` : ''}

SUMMARY STYLE: ${styleInstruction}

Write the summary now. Return plain text (no markdown headers). Then on a new line write "HIGHLIGHTS:" followed by 3-5 bullet points of the most notable things.
`.trim();
}

function extractAuthorSummary(fullText, authorName) {
  const lines = fullText.split('\n');
  const idx = lines.findIndex((l) => l.toLowerCase().includes(authorName.toLowerCase()));
  if (idx === -1) return '';
  return lines.slice(idx, idx + 3).join(' ').trim();
}

function extractHighlights(text) {
  const hlIdx = text.indexOf('HIGHLIGHTS:');
  if (hlIdx === -1) return [];
  return text
    .slice(hlIdx + 11)
    .split('\n')
    .map((l) => l.replace(/^[-•*]\s*/, '').trim())
    .filter(Boolean)
    .slice(0, 5);
}
