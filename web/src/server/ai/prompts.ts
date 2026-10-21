import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

export interface Prompt {
  name: string;
  version: string;
  system: string;
  user: string;
}

const cache = new Map<string, Prompt>();
const DIR = path.resolve(process.env.PROMPTS_DIR ?? "prompts");

export function loadPrompt(name: string): Prompt {
  const hit = cache.get(name);
  if (hit) return hit;

  const raw = readFileSync(path.join(DIR, `${name}.md`), "utf8");
  const front = raw.match(/^---\n([\s\S]*?)\n---\n/);
  if (!front) throw new Error(`Prompt ${name}.md has no front matter`);
  const version = front[1].match(/^version:\s*(.+)$/m)?.[1].trim();
  if (!version) throw new Error(`Prompt ${name}.md has no version`);

  const body = raw.slice(front[0].length);
  const system = body.match(/^# System\n([\s\S]*?)(?=^# User\n)/m)?.[1].trim();
  const user = body.match(/^# User\n([\s\S]*)$/m)?.[1].trim();
  if (!system || !user) throw new Error(`Prompt ${name}.md needs "# System" and "# User" sections`);

  const prompt = { name, version, system, user };
  cache.set(name, prompt);
  return prompt;
}

export function render(template: string, vars: Record<string, string>) {
  for (const key of Object.keys(vars)) {
    if (!template.includes(`{{${key}}}`)) throw new Error(`Prompt has no {{${key}}} slot`);
  }
  return template.replace(/\{\{([a-z_]+)\}\}/g, (match, key: string) => (key in vars ? vars[key] : match));
}

export function buildPromptVariants() {
  return readdirSync(DIR)
    .filter((f) => /^build-product.*\.md$/.test(f))
    .map((f) => f.replace(/\.md$/, ""))
    .sort()
    .map((name) => ({ name, version: loadPrompt(name).version }));
}
