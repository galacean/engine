import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const packageRoot = fileURLToPath(new URL("../", import.meta.url));
const skillRoot = resolve(packageRoot, "skills/engine-knowledge");

function markdownFiles(root: string, directory = root): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      return markdownFiles(root, path);
    }
    return entry.name.endsWith(".md") ? [relative(root, path).split(sep).join("/")] : [];
  });
}

describe("engine-knowledge Skill contract", () => {
  it("keeps one versioned entry point instead of a hand-maintained API catalog", () => {
    const skill = readFileSync(resolve(skillRoot, "SKILL.md"), "utf8");
    const frontmatter = skill.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);

    expect(frontmatter).not.toBeNull();
    expect(frontmatter?.[1]).toMatch(/^name: engine-knowledge$/m);
    expect(frontmatter?.[1]).toMatch(/^description: .+$/m);
    expect(markdownFiles(skillRoot)).toEqual(["SKILL.md"]);
  });

  it("does not mirror host protocols, retired backends, or API examples", () => {
    const content = readFileSync(resolve(skillRoot, "SKILL.md"), "utf8");
    const forbiddenPatterns = [
      /\bSBX\b/i,
      /\bEditor API\b/i,
      /\bCLI\b/,
      /\bBuilder\b/,
      /\bOSS\b/,
      /\b(?:editor_api|engine_api|script_write|script_edit|project_build|galacean-cli|galacean_exec)\b/i,
      /\bsource-v2\b/i,
      /\/skills\//i,
      /\/oss\//i,
      /\b(?:physics-lite|LitePhysics)\b/i
    ];

    for (const pattern of forbiddenPatterns) {
      expect(content).not.toMatch(pattern);
    }
    expect(content).not.toContain("references/");
    expect(content).not.toContain("```");
  });

  it("ships the complete Skill in the npm tarball", () => {
    const packageJson = JSON.parse(readFileSync(resolve(packageRoot, "package.json"), "utf8")) as {
      files?: string[];
    };
    expect(packageJson.files).toContain("skills/**/*");

    const npm = process.platform === "win32" ? "npm.cmd" : "npm";
    const output = execFileSync(npm, ["pack", "--dry-run", "--json", packageRoot], {
      encoding: "utf8"
    });
    const packed = JSON.parse(output) as Array<{ files: Array<{ path: string }> }>;
    const skillFiles = packed[0].files
      .map((file) => file.path)
      .filter((path) => path.startsWith("skills/"))
      .sort();

    expect(skillFiles).toEqual(["skills/engine-knowledge/SKILL.md"]);
  });
});
