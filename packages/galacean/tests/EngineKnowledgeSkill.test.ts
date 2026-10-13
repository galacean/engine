import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const packageRoot = fileURLToPath(new URL("../", import.meta.url));
const skillRoot = resolve(packageRoot, "skills/engine-knowledge");
const recipesPath = resolve(skillRoot, "references/runtime-recipes.md");

function files(root: string, directory = root): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      return files(root, path);
    }
    return [relative(root, path).split(sep).join("/")];
  });
}

function recipeSource(heading: string): string {
  const content = readFileSync(recipesPath, "utf8");
  const sectionStart = content.indexOf(`## ${heading}`);
  expect(sectionStart).toBeGreaterThanOrEqual(0);
  const nextSection = content.indexOf("\n## ", sectionStart + 1);
  const section = content.slice(sectionStart, nextSection === -1 ? undefined : nextSection);
  const source = section.match(/```ts\r?\n([\s\S]*?)\r?\n```/)?.[1];
  expect(source).toBeDefined();
  return source!;
}

function loadRecipe<T extends object>(heading: string, engineExports: Record<string, unknown>): T {
  const javascript = ts.transpileModule(recipeSource(heading), {
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

  it("keeps the normal-map recipe free of failed-path material writes", async () => {
    class PBRMaterial {
      normalTexture: unknown;
    }
    class Texture2D {}
    const { assignNormalMap } = loadRecipe<{
      assignNormalMap: (engine: object, renderer: object, url: string) => Promise<boolean>;
    }>("Linear normal map on one renderer", {
      AssetType: { Texture: "Texture" },
      PBRMaterial,
      Texture2D
    });

    let loadCount = 0;
    let instanceCount = 0;
    let assignedMaterial: object = {};
    const renderer = {
      getMaterial: () => assignedMaterial,
      getInstanceMaterial: () => {
        instanceCount++;
        return new PBRMaterial();
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

    expect(await assignNormalMap(engine, renderer, "normal.png")).toBe(false);
    expect(loadCount).toBe(0);
    expect(instanceCount).toBe(0);

    let resolveTexture!: (texture: Texture2D) => void;
    assignedMaterial = new PBRMaterial();
    engine.resourceManager.load = () => {
      loadCount++;
      return new Promise<Texture2D>((resolve) => {
        resolveTexture = resolve;
      });
    };
    const pending = assignNormalMap(engine, renderer, "normal.png");
    const replacement = new PBRMaterial();
    assignedMaterial = replacement;
    resolveTexture(new Texture2D());

    expect(await pending).toBe(false);
    expect(renderer.getMaterial()).toBe(replacement);
    expect(instanceCount).toBe(0);
  });

  it("keeps the picking recipe scoped to pointer behavior", () => {
    class Script {}
    const { enable3DPicking } = loadRecipe<{
      enable3DPicking: (entity: object) => object;
    }>("Physics-backed screen picking", { Script });
    const originalShapeOwner = { id: "existing-collider" };
    const shape = { owner: originalShapeOwner };
    const addedComponents: unknown[] = [];
    const entity = {
      getComponent: () => null,
      addComponent: (ComponentType: new () => object) => {
        addedComponents.push(ComponentType);
        return new ComponentType();
      }
    };

    const behavior = enable3DPicking(entity);

    expect(behavior).toBeInstanceOf(Script);
    expect(addedComponents).toHaveLength(1);
    expect(shape.owner).toBe(originalShapeOwner);
  });

  it("keeps the local-bloom recipe from owning collider state or enabling a failed camera", () => {
    class Collider {
      enabled = true;
      shapes = [{}];
    }
    let supportsLocalPostProcess = true;
    class PostProcess {
      private _isGlobal = true;
      blendDistance = 0;
      destroyed = false;

      get isGlobal(): boolean {
        return this._isGlobal;
      }

      set isGlobal(value: boolean) {
        this._isGlobal = value || !supportsLocalPostProcess;
      }

      addEffect(): { intensity: { value: number } } {
        return { intensity: { value: 0 } };
      }

      destroy(): void {
        this.destroyed = true;
      }
    }
    class BloomEffect {}
    const { createLocalBloom } = loadRecipe<{
      createLocalBloom: (
        camera: { scene: object; enablePostProcess: boolean },
        entity: object,
        distance: number
      ) => PostProcess;
    }>("Collider-bounded local bloom", { BloomEffect, Collider, PostProcess });

    const scene = {};
    const collider = new Collider();
    const originalShapes = collider.shapes;
    let volume: PostProcess | null = null;
    const addedComponents: unknown[] = [];
    const entity = {
      scene,
      getComponents: (ComponentType: unknown, out: Collider[]) => {
        if (ComponentType === Collider) out.push(collider);
      },
      getComponent: (ComponentType: unknown) => (ComponentType === PostProcess ? volume : null),
      addComponent: (ComponentType: new () => PostProcess) => {
        addedComponents.push(ComponentType);
        volume = new ComponentType();
        return volume;
      }
    };
    const camera = { scene, enablePostProcess: false };

    const result = createLocalBloom(camera, entity, 2);
    expect(result).toBe(volume);
    expect(addedComponents).toEqual([PostProcess]);
    expect(collider.shapes).toBe(originalShapes);
    expect(collider.enabled).toBe(true);
    expect(camera.enablePostProcess).toBe(true);

    supportsLocalPostProcess = false;
    volume = null;
    camera.enablePostProcess = false;
    expect(() => createLocalBloom(camera, entity, 2)).toThrow("physics-enabled Scene");
    expect(volume?.destroyed).toBe(true);
    expect(camera.enablePostProcess).toBe(false);
    expect(collider.shapes).toBe(originalShapes);
    expect(collider.enabled).toBe(true);
  });
});
