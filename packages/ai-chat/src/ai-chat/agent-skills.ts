import type { AgentSkill } from "./agent-types";

export const agentSkillPath = (name: string) => `skills/${name}.md`;

/** Deliberately small frontmatter contract: plain, single-line name and description. */
export function parseAgentSkill(content: string): AgentSkill {
  const header = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(content);
  if (!header) throw new Error("Skill requires Markdown frontmatter");
  const fields = new Map<string, string>();
  for (const line of header[1].split(/\r?\n/)) {
    if (!line.trim()) continue;
    const field = /^(name|description):\s*(.+)$/.exec(line);
    if (!field || fields.has(field[1])) throw new Error("Skill frontmatter requires unique name and description");
    fields.set(field[1], field[2].trim());
  }
  const name = fields.get("name") ?? "",
    description = fields.get("description") ?? "";
  if (
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name) ||
    name.length > 64 ||
    !description ||
    !content.slice(header[0].length).trim()
  )
    throw new Error("Invalid Skill name, description or body");
  return { name, description, content };
}

/** Flat read-only workflow files; reference material is owned by editor/ or engine/. */
export function agentSkillFiles(skills: readonly AgentSkill[]): Map<string, string> {
  const files = new Map<string, string>();
  for (const skill of skills) {
    const parsed = parseAgentSkill(skill.content);
    if (parsed.name !== skill.name || parsed.description !== skill.description)
      throw new Error("Skill metadata differs from frontmatter");
    const path = agentSkillPath(skill.name);
    if (files.has(path)) throw new Error(`Duplicate skill: '${skill.name}'`);
    files.set(path, skill.content);
  }
  return files;
}
