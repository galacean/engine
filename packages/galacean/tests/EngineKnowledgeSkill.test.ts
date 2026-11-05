import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
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

function recipeSource(reference: string, heading: string): string {
  const content = readFileSync(resolve(skillRoot, "references", reference), "utf8");
  const sectionStart = content.indexOf(`## ${heading}`);
  expect(sectionStart).toBeGreaterThanOrEqual(0);
  const nextSection = content.indexOf("\n## ", sectionStart + 1);
  const section = content.slice(sectionStart, nextSection === -1 ? undefined : nextSection);
  const source = section.match(/```ts\r?\n([\s\S]*?)\r?\n```/)?.[1];
  expect(source).toBeDefined();
  return source!;
}

function loadRecipe<T extends object>(reference: string, heading: string, engineExports: Record<string, unknown>): T {
  const javascript = ts.transpileModule(recipeSource(reference, heading), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020
    }
  }).outputText;
  const moduleExports: Record<string, unknown> = {};
  const requireEngine = (specifier: string): Record<string, unknown> => {
    if (specifier !== "@galacean/engine") {
      throw new Error(`Unexpected recipe dependency: ${specifier}`);
    }
    return engineExports;
  };
  const evaluate = new Function("require", "exports", `${javascript}\nreturn exports;`) as (
    require: typeof requireEngine,
    exports: Record<string, unknown>
  ) => T;
  return evaluate(requireEngine, moduleExports);
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
      expect(content.match(/^```/gm)?.length ?? 0).toBe(
        [...content.matchAll(/```[^\r\n]*\r?\n[\s\S]*?\r?\n```/g)].length * 2
      );
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

  it("applies runtime normal maps only to the Script's current live renderer", async () => {
    class Script {
      destroyed = false;

      constructor(
        readonly engine: object,
        readonly entity: object
      ) {}
    }
    class MeshRenderer {}
    class PBRMaterial {
      normalTexture: unknown;
    }
    class Texture2D {}
    const { NormalMapController } = loadRecipe<{
      NormalMapController: new (
        engine: object,
        entity: object
      ) => { destroyed: boolean; setNormalMap: (url: string) => Promise<boolean> };
    }>("rendering-and-color.md", "Linear normal map on one renderer", {
      AssetType: { Texture: "Texture" },
      MeshRenderer,
      PBRMaterial,
      Script,
      Texture2D
    });

    let loadCount = 0;
    let instanceCount = 0;
    let assignedMaterial: object = {};
    const renderer = {
      destroyed: false,
      getMaterial: () => assignedMaterial,
      getInstanceMaterial: () => {
        instanceCount++;
        const material = new PBRMaterial();
        assignedMaterial = material;
        return material;
      }
    };
    const engine = {
      resourceManager: {
        load: () => {
          loadCount++;
          return Promise.resolve(new Texture2D());
        }
      }
    };
    const controller = new NormalMapController(engine, { getComponent: () => renderer });

    expect(await controller.setNormalMap("normal.png")).toBe(false);
    expect(loadCount).toBe(0);
    expect(instanceCount).toBe(0);

    let resolveTexture!: (texture: Texture2D) => void;
    engine.resourceManager.load = () => {
      loadCount++;
      return new Promise<Texture2D>((resolve) => {
        resolveTexture = resolve;
      });
    };
    for (const invalidate of [
      () => {
        assignedMaterial = new PBRMaterial();
      },
      () => {
        controller.destroyed = true;
      },
      () => {
        renderer.destroyed = true;
      }
    ]) {
      assignedMaterial = new PBRMaterial();
      controller.destroyed = false;
      renderer.destroyed = false;
      const pending = controller.setNormalMap("normal.png");
      invalidate();
      const currentMaterial = assignedMaterial;
      resolveTexture(new Texture2D());

      expect(await pending).toBe(false);
      expect(renderer.getMaterial()).toBe(currentMaterial);
      expect(instanceCount).toBe(0);
    }

    controller.destroyed = false;
    renderer.destroyed = false;
    const pending = controller.setNormalMap("normal.png");
    const texture = new Texture2D();
    resolveTexture(texture);

    expect(await pending).toBe(true);
    expect(instanceCount).toBe(1);
    expect((renderer.getMaterial() as PBRMaterial).normalTexture).toBe(texture);
  });
});
