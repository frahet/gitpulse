import { generateText } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { openai } from '@ai-sdk/openai';
import { google } from '@ai-sdk/google';
import { mistral } from '@ai-sdk/mistral';

const SUPPORTED_PROVIDERS = {
  anthropic: (model) => anthropic(model),
  openai:    (model) => openai(model),
  google:    (model) => google(model),
  mistral:   (model) => mistral(model),
};

// Generates a 1-2 sentence context description for a repo from its README,
// package.json, and root file listing. Used by POST /api/init.
export async function generateRepoContext(repoInfo, aiConfig) {
  const { name, readme, packageJson, rootFiles } = repoInfo;
  const { provider, model } = aiConfig;

  const factory = SUPPORTED_PROVIDERS[provider];
  if (!factory) throw new Error(`Unknown AI provider "${provider}"`);

  const sections = [];

  if (readme) {
    // Only use the first ~800 chars — enough to get the project description
    sections.push(`README (first section):\n${readme.slice(0, 800)}`);
  }

  if (packageJson) {
    try {
      const pkg = JSON.parse(packageJson);
      const relevant = {
        name: pkg.name,
        description: pkg.description,
        dependencies: pkg.dependencies ? Object.keys(pkg.dependencies).slice(0, 20) : undefined,
        devDependencies: pkg.devDependencies ? Object.keys(pkg.devDependencies).slice(0, 10) : undefined,
        scripts: pkg.scripts ? Object.keys(pkg.scripts) : undefined,
      };
      sections.push(`package.json (key fields):\n${JSON.stringify(relevant, null, 2)}`);
    } catch { /* not a valid JSON, skip */ }
  }

  if (rootFiles?.length) {
    sections.push(`Root directory contents:\n${rootFiles.join(', ')}`);
  }

  if (!sections.length) {
    return `Repository: ${name}`;
  }

  const prompt = `You are generating a short context description for a git analytics tool.

Based on the following information about the repository "${name}", write a single concise sentence (max 25 words) that describes:
- What the project does or is for
- The main technology stack
- Any key domain terms a developer would use

${sections.join('\n\n')}

Respond with ONLY the context sentence. No explanation, no quotes, no punctuation at the end.`;

  const { text } = await generateText({
    model: factory(model),
    prompt,
    maxTokens: 80,
  });

  return text.trim().replace(/\.$/, '');
}
