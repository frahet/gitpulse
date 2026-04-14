import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// In-memory cache: { data, expiresAt }
let cache = null;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

const STYLE_INSTRUCTIONS = {
  management:
    'Write in plain English with no technical jargon. Focus on what got done, who did it, and what value it delivers. No file paths, no code terms.',
  technical:
    'Be detailed and precise. Include file paths, component names, and use PR-like language (feat, fix, refactor). Developers are the audience.',
  standup:
    'Format as concise bullet points per person. Each person: what they did, what is in progress. Keep it tight — this is a daily standup.',
};

export async function generateSummary(parsedData, aiConfig) {
  if (!aiConfig.enabled) return null;
  if (!process.env.ANTHROPIC_API_KEY) return null;

  // Return cached result if still valid
  if (cache && Date.now() < cache.expiresAt) {
    return cache.data;
  }

  const style = aiConfig.summary_style ?? 'standup';
  const styleInstruction = STYLE_INSTRUCTIONS[style] ?? STYLE_INSTRUCTIONS.standup;

  const prompt = buildPrompt(parsedData, styleInstruction);

  const response = await client.messages.create({
    model: aiConfig.model,
    max_tokens: 1024,
    system: [
      {
        type: 'text',
        text: 'You are an engineering analytics assistant. You receive structured git activity data and produce clear, useful summaries. Be factual — only report what the data shows.',
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [{ role: 'user', content: prompt }],
  });

  const text = response.content[0]?.text ?? '';

  const byAuthor = parsedData.byAuthor.map((a) => ({
    name: a.name,
    commits: a.commitCount,
    summary: extractAuthorSummary(text, a.name),
  }));

  const highlights = extractHighlights(text);

  const result = {
    overall: text,
    by_author: byAuthor,
    highlights,
    style,
    generated_at: new Date().toISOString(),
  };

  cache = { data: result, expiresAt: Date.now() + CACHE_TTL_MS };
  return result;
}

export function clearCache() {
  cache = null;
}

function buildPrompt(parsedData, styleInstruction) {
  const { stats, byAuthor, byDay, repos } = parsedData;

  const authorLines = byAuthor
    .map(
      (a) =>
        `  - ${a.name} (${a.commitCount} commits, +${a.insertions}/-${a.deletions} lines): ${a.recentMessages.slice(0, 3).join('; ')}`
    )
    .join('\n');

  const dayLines = byDay
    .map((d) => `  ${d.date}: ${d.commitCount} commits by ${d.authors.join(', ')}`)
    .join('\n');

  const repoLines = repos.map((r) => `  - ${r.name}: ${r.commitCount} commits`).join('\n');

  return `
Here is the git activity data for the past ${stats.totalCommits > 0 ? 'reporting period' : '0 days'}:

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

SUMMARY STYLE: ${styleInstruction}

Write the summary now. Return a plain-text summary (no markdown headers). Then on a new line write "HIGHLIGHTS:" followed by 3-5 bullet points of the most notable things.
`.trim();
}

function extractAuthorSummary(fullText, authorName) {
  const lines = fullText.split('\n');
  const idx = lines.findIndex((l) => l.toLowerCase().includes(authorName.toLowerCase()));
  if (idx === -1) return '';
  return lines
    .slice(idx, idx + 3)
    .join(' ')
    .trim();
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
