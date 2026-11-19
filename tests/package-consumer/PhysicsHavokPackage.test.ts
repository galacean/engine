import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const repositoryRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const packageDirectories = [
  "math",
  "design",
  "core",
  "shader",
  "rhi-webgl",
  "rhi-null",
  "loader",
  "galacean",
  "physics-havok"
] as const;

let consumerDirectory = "";
let havokTarballPath = "";

beforeAll(() => {
  consumerDirectory = mkdtempSync(join(tmpdir(), "engine-physics-havok-consumer-"));
  const tarballs = join(consumerDirectory, "tarballs");
  mkdirSync(tarballs);

  const dependencies: Record<string, string> = {};
  for (const name of packageDirectories) {
    const cwd = join(repositoryRoot, "packages", name);
    const pkg = JSON.parse(readFileSync(join(cwd, "package.json"), "utf8")) as { name: string };
    execFileSync("pnpm", ["pack", "--pack-destination", tarballs], { cwd, stdio: "pipe" });
    const prefix = pkg.name.replace("@galacean/", "galacean-");
    const tarball = readdirSync(tarballs).find((file) => file.startsWith(prefix + "-") && file.endsWith(".tgz"));
    if (!tarball) {
      throw new Error(`Packed tarball not found for ${pkg.name}`);
    }
    const tarballFullPath = join(tarballs, tarball);
    dependencies[pkg.name] = `file:${tarballFullPath}`;
    if (name === "physics-havok") {
      havokTarballPath = tarballFullPath;
    }
  }

  writeFileSync(
    join(consumerDirectory, "package.json"),
    JSON.stringify({ private: true, dependencies, pnpm: { overrides: dependencies } })
  );

  const install = spawnSync("pnpm", ["install", "--offline", "--ignore-scripts"], {
    cwd: consumerDirectory,
    encoding: "utf8"
  });
  if (install.status !== 0) {
    throw new Error(`Consumer install failed:\n${install.stdout}\n${install.stderr}`);
  }
}, 120_000);

afterAll(() => {
  if (consumerDirectory) {
    rmSync(consumerDirectory, { recursive: true, force: true });
  }
});

describe("@galacean/engine-physics-havok published package consumer", () => {
  it("packs all required dist bundles, TypeScript declarations, and Havok WASM assets", () => {
    const listing = execFileSync("tar", ["-tzf", havokTarballPath], { encoding: "utf8" })
      .split(/\r?\n/)
      .filter(Boolean);

    const requiredEntries = [
      "package/package.json",
      "package/dist/main.js",
      "package/dist/module.js",
      "package/dist/browser.js",
      "package/dist/browser.min.js",
      "package/types/index.d.ts",
      "package/libs/HavokPhysics_umd.js",
      "package/libs/HavokPhysics.wasm",
      "package/libs/LICENSE"
    ];

    for (const entry of requiredEntries) {
      expect(listing, `missing ${entry} in tarball`).toContain(entry);
    }

    const indexDts = readFileSync(
      join(consumerDirectory, "node_modules", "@galacean", "engine-physics-havok", "types", "index.d.ts"),
      "utf8"
    );
    expect(indexDts).not.toContain("__buildVersion");
    expect(indexDts).not.toContain("HavokModule");
  });

  it("loads cleanly via CJS require and ESM import and steps HeadlessEngine in Node with havokFactory + wasmBinary", () => {
    for (const mode of ["require", "import"] as const) {
      const script =
        mode === "require"
          ? `
            const { readFileSync } = require("node:fs");
            const { dirname, join } = require("node:path");
            const { BoxCollider, HitResult, Ray, Rigidbody, Vector3 } = require("@galacean/engine");
            const { HeadlessEngine } = require("@galacean/engine-rhi-null");
            const { HavokPhysics, version } = require("@galacean/engine-physics-havok");

            if (typeof version !== "string" || version.length === 0 || version === "__buildVersion") {
              throw new Error("Invalid CJS version: " + String(version));
            }
            const pkgDir = dirname(require.resolve("@galacean/engine-physics-havok/package.json"));
            const rawHavokFactory = require(join(pkgDir, "libs", "HavokPhysics_umd.js"));
            const wasmBinary = readFileSync(join(pkgDir, "libs", "HavokPhysics.wasm"));

            const physics = new HavokPhysics({
              havokFactory: (arg) => rawHavokFactory({ ...(arg || {}), wasmBinary })
            });

            HeadlessEngine.create({ physics }).then((engine) => {
              const scene = engine.sceneManager.activeScene;
              const floor = scene.createRootEntity("floor");
              floor.addComponent(BoxCollider).size = new Vector3(10, 1, 10);

              const box = scene.createRootEntity("box");
              box.transform.setPosition(0, 5, 0);
              box.addComponent(BoxCollider).size = new Vector3(1, 1, 1);
              box.addComponent(Rigidbody);

              const hit = new HitResult();
              if (!scene.physics.raycast(new Ray(new Vector3(0, 10, 0), new Vector3(0, -1, 0)), 20, hit)) {
                throw new Error("Expected raycast hit in Node HeadlessEngine");
              }

              for (let i = 0; i < 120; i++) {
                scene.physics._update(1 / 60);
              }
              const y = box.transform.position.y;
              if (!(y < 2 && y > 0.5)) {
                throw new Error("Unexpected settled box y=" + y);
              }
              engine.destroy();
              physics.destroy();
            }).catch((error) => {
              console.error(error);
              process.exitCode = 1;
            });
          `
          : `
            import { readFileSync } from "node:fs";
            import { createRequire } from "node:module";
            import { dirname, join } from "node:path";
            import { BoxCollider, HitResult, Ray, Rigidbody, Vector3 } from "@galacean/engine";
            import { HeadlessEngine } from "@galacean/engine-rhi-null";
            import { HavokPhysics, version } from "@galacean/engine-physics-havok";

            if (typeof version !== "string" || version.length === 0 || version === "__buildVersion") {
              throw new Error("Invalid ESM version: " + String(version));
            }
            const req = createRequire(import.meta.url);
            const pkgDir = dirname(req.resolve("@galacean/engine-physics-havok/package.json"));
            const rawHavokFactory = req(join(pkgDir, "libs", "HavokPhysics_umd.js"));
            const wasmBinary = readFileSync(join(pkgDir, "libs", "HavokPhysics.wasm"));

            const physics = new HavokPhysics({
              havokFactory: (arg) => rawHavokFactory({ ...(arg || {}), wasmBinary })
            });

            const engine = await HeadlessEngine.create({ physics });
            const scene = engine.sceneManager.activeScene;
            const floor = scene.createRootEntity("floor");
            floor.addComponent(BoxCollider).size = new Vector3(10, 1, 10);

            const box = scene.createRootEntity("box");
            box.transform.setPosition(0, 5, 0);
            box.addComponent(BoxCollider).size = new Vector3(1, 1, 1);
            box.addComponent(Rigidbody);

            const hit = new HitResult();
            if (!scene.physics.raycast(new Ray(new Vector3(0, 10, 0), new Vector3(0, -1, 0)), 20, hit)) {
              throw new Error("Expected raycast hit in Node HeadlessEngine");
            }

            for (let i = 0; i < 120; i++) {
              scene.physics._update(1 / 60);
            }
            const y = box.transform.position.y;
            if (!(y < 2 && y > 0.5)) {
              throw new Error("Unexpected settled box y=" + y);
            }
            engine.destroy();
            physics.destroy();
          `;

      const probe = spawnSync(process.execPath, [...(mode === "import" ? ["--input-type=module"] : []), "-e", script], {
        cwd: consumerDirectory,
        encoding: "utf8"
      });
      expect(probe.status, `[${mode}] stdout:\n${probe.stdout}\nstderr:\n${probe.stderr}`).toBe(0);
    }
  });

  it("typechecks strictly under Node16, Bundler, and Node10 moduleResolution", () => {
    const source = join(consumerDirectory, "consumer.ts");
    writeFileSync(
      source,
      [
        'import { BoxCollider, Rigidbody, WebGLEngine } from "@galacean/engine";',
        'import { HeadlessEngine } from "@galacean/engine-rhi-null";',
        'import { HavokPhysics, version, type HavokRuntimeOptions } from "@galacean/engine-physics-havok";',
        "",
        "const buildVersion: string = version;",
        "const defaultPhysics = new HavokPhysics();",
        "const urlOptions: HavokRuntimeOptions = { jsUrl: '/HavokPhysics_umd.js', wasmUrl: '/HavokPhysics.wasm' };",
        "const factoryOptions: HavokRuntimeOptions = { havokFactory: async (_arg) => ({}) };",
        "const instanceOptions: HavokRuntimeOptions = { havokInstance: {} };",
        "",
        "async function run(canvas: HTMLCanvasElement) {",
        "  void buildVersion;",
        "  const urlPhysics = new HavokPhysics(urlOptions);",
        "  const factoryPhysics = new HavokPhysics(factoryOptions);",
        "  const instancePhysics = new HavokPhysics(instanceOptions);",
        "  const webgl = await WebGLEngine.create({ canvas, physics: defaultPhysics });",
        "  const headless = await HeadlessEngine.create({ physics: factoryPhysics });",
        "  const entity = headless.sceneManager.activeScene!.createRootEntity();",
        "  entity.addComponent(BoxCollider);",
        "  entity.addComponent(Rigidbody);",
        "  webgl.destroy();",
        "  headless.destroy();",
        "  urlPhysics.destroy();",
        "  instancePhysics.destroy();",
        "  defaultPhysics.destroy();",
        "}",
        "void run;"
      ].join("\n")
    );

    for (const resolution of ["Node16", "Bundler", "Node10"] as const) {
      const config: ts.CompilerOptions = {
        noEmit: true,
        strict: true,
        skipLibCheck: true,
        target: ts.ScriptTarget.ES2022,
        module: resolution === "Node16" ? ts.ModuleKind.Node16 : ts.ModuleKind.ESNext,
        moduleResolution: ts.ModuleResolutionKind[resolution]
      };
      const program = ts.createProgram([source], config);
      const diagnostics = ts
        .getPreEmitDiagnostics(program)
        .map((error) => ts.flattenDiagnosticMessageText(error.messageText, "\n"));
      expect(diagnostics, `diagnostics for ${resolution}`).toEqual([]);
    }
  });
});
