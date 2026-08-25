import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createProgram,
  formatDiagnosticsWithColorAndContext,
  getPreEmitDiagnostics,
  ModuleKind,
  ModuleResolutionKind,
  ScriptTarget
} from "typescript";
import { describe, expect, it } from "vitest";

const packageRoot = fileURLToPath(new URL("../", import.meta.url));
const skillRoot = resolve(packageRoot, "skills/engine-knowledge");

function files(root: string, directory = root): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      return files(root, path);
    }
    return [relative(root, path).split(sep).join("/")];
  });
}

describe("engine-knowledge Skill contract", () => {
  it("keeps one versioned entry point with focused progressive references", () => {
    const skillPath = resolve(skillRoot, "SKILL.md");
    const skill = readFileSync(skillPath, "utf8");
    const frontmatter = skill.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);

    expect(frontmatter).not.toBeNull();
    expect(frontmatter?.[1]).toMatch(/^name: engine-knowledge$/m);
    expect(frontmatter?.[1]).toMatch(/^description: .+$/m);

    const markdownFiles = files(skillRoot)
      .filter((path) => path.endsWith(".md"))
      .sort();
    const markdownSet = new Set(markdownFiles);
    const reachable = new Set<string>();
    const pending = ["SKILL.md"];
    while (pending.length > 0) {
      const source = pending.pop()!;
      if (reachable.has(source)) {
        continue;
      }
      reachable.add(source);
      const sourcePath = resolve(skillRoot, source);
      const content = readFileSync(sourcePath, "utf8");
      expect(content.length).toBeGreaterThan(0);
      for (const match of content.matchAll(/\]\(([^)#]+\.md)(?:#[^)]+)?\)/g)) {
        if (/^[a-z][a-z\d+.-]*:/i.test(match[1])) {
          continue;
        }
        const target = relative(skillRoot, resolve(dirname(sourcePath), match[1]))
          .split(sep)
          .join("/");
        expect(target === ".." || target.startsWith("../")).toBe(false);
        expect(markdownSet.has(target)).toBe(true);
        pending.push(target);
      }
    }

    expect([...reachable].sort()).toEqual(markdownFiles);
  });

  it("type-checks every retained runtime recipe against the packaged declarations", () => {
    const examples = files(skillRoot)
      .filter((path) => path.endsWith(".md"))
      .flatMap((path) => {
        const content = readFileSync(resolve(skillRoot, path), "utf8");
        const codeBlocks = [...content.matchAll(/```([^\r\n]*)\r?\n([\s\S]*?)\r?\n```/g)];
        expect(content.match(/^```/gm)?.length ?? 0).toBe(codeBlocks.length * 2);
        return codeBlocks.filter((match) => match[1] === "ts").map((match) => match[2]);
      });
    expect(examples.length).toBeGreaterThan(0);

    const temporaryRoot = mkdtempSync(join(tmpdir(), "engine-knowledge-recipes-"));
    try {
      const files = examples.map((example, index) => {
        const path = resolve(temporaryRoot, `recipe-${index + 1}.ts`);
        writeFileSync(path, example);
        return path;
      });
      const program = createProgram(files, {
        allowSyntheticDefaultImports: true,
        baseUrl: packageRoot,
        module: ModuleKind.ESNext,
        moduleResolution: ModuleResolutionKind.Node10,
        noEmit: true,
        paths: { "@galacean/engine": ["types/index.d.ts"] },
        skipLibCheck: true,
        strict: true,
        target: ScriptTarget.ESNext
      });
      const diagnostics = getPreEmitDiagnostics(program);
      if (diagnostics.length > 0) {
        throw new Error(
          formatDiagnosticsWithColorAndContext(diagnostics, {
            getCanonicalFileName: (fileName) => fileName,
            getCurrentDirectory: () => packageRoot,
            getNewLine: () => "\n"
          })
        );
      }
    } finally {
      rmSync(temporaryRoot, { recursive: true, force: true });
    }
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

    expect(skillFiles).toEqual(
      files(skillRoot)
        .map((path) => `skills/engine-knowledge/${path}`)
        .sort()
    );
  });
});
