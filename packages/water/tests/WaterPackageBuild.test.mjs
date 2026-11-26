import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const rootDir = fileURLToPath(new URL("../../../", import.meta.url));
const waterDir = path.join(rootDir, "packages/water");
const distDir = path.join(waterDir, "dist");
const worldRequire = createRequire(path.join(rootDir, "world/package.json"));
const { build: esbuild } = worldRequire("esbuild");
const ts = worldRequire("typescript");
const { build: viteBuild } = await import(
  pathToFileURL(path.join(path.dirname(worldRequire.resolve("vite/package.json")), "dist/node/index.js")).href
);

const ENTRIES = ["water-builtin-shaders", "water-authoring", "water-runtime", "water-presets"];

const EXPECTED_EXPORTS = {
  "water-builtin-shaders": ["WATER_BUILTIN_SHADER_NAMES", "WATER_BUILTIN_SHADER_SOURCES"],
  "water-authoring": [
    "createLakeSpatialFieldBudget",
    "WaterQualityTier",
    "resolveWaterMaterialFileLook",
    "WATER_MATERIAL_TEXTURE_SLOTS",
    "validateWaterMaterialTextureMetadata",
    "createWaterMaterialDefaults",
    "createWaterCreationPreset",
    "compileWaterConnectionGraph",
    "validateWaterShape",
    "validateWaterAuthoringSettings",
    "validateWaterWorldTransform",
    "getWaterAuthoringCapabilities",
    "validateWaterShaderCapabilities",
    "validateWaterMaterialCapabilities",
    "compileWaterShape",
    "createWaterQualitySettings",
    "patchWaterQualitySettings",
    "captureWaterTerrainSnapshot",
    "copyWaterTerrainSnapshot",
    "sampleWaterTerrainHeight",
    "validateWatercourseAuthoring",
    "encodeWaterTerrainAssets",
    "decodeWaterTerrainAssets"
  ],
  "water-runtime": [
    "registerNativeWater",
    "WaterBodyComponent",
    "WaterSystem",
    "resolveWaterTerrainAssets",
    "createWaterMaterialFile",
    "prepareWaterMaterial",
    "updateWaterMaterialParameters",
    "waterMaterialShaderSource",
    "registerWaterBuiltinShaders",
    "WATER_BUILTIN_SHADER_NAMES"
  ],
  "water-presets": ["loadWaterPreset"]
};

function createEngineStubSource(importedNames) {
  const specialExports = {
    Shader: `export class Shader {
  static _map = new Map();
  static find(name) { return this._map.get(name); }
  static create(name) { const s = { name }; this._map.set(name, s); return s; }
  static _createFromPrecompiled(data) { const s = { name: data.name }; this._map.set(data.name, s); return s; }
}`,
    Loader: `export class Loader {
  static _classes = new Map();
  static getClass(name) { return this._classes.get(name); }
  static registerClass(name, cls) { this._classes.set(name, cls); }
}`,
    ShaderMacro: `export class ShaderMacro { static getByName(name) { return { name }; } }`,
    ShaderProperty: `export class ShaderProperty { static getByName(name) { return { name }; } }`,
    ignoreClone: `export const ignoreClone = () => {};`,
    deepClone: `export const deepClone = () => {};`,
    shallowClone: `export const shallowClone = () => {};`,
    assignmentClone: `export const assignmentClone = () => {};`
  };
  return (
    [
      ...Object.entries(specialExports)
        .filter(([name]) => importedNames.has(name))
        .map(([, def]) => def),
      ...[...importedNames]
        .filter((name) => !(name in specialExports))
        .map((name) => `export class ${name} {}`)
    ].join("\n") + "\n"
  );
}

test("dist/water-*.{js,d.mts} satisfy syntax, zero-glob, zero-relative-URL, and external-import guards", async () => {
  const allowedNative = /^@galacean\/engine(?:-(?:shader|shader-compiler|ui|physics-physx|design))?$/;

  for (const name of ENTRIES) {
    const jsPath = path.join(distDir, `${name}.js`);
    const dtsPath = path.join(distDir, `${name}.d.mts`);
    const [jsCode, dtsCode] = await Promise.all([readFile(jsPath, "utf8"), readFile(dtsPath, "utf8")]);

    execFileSync(process.execPath, ["--check", jsPath], { stdio: "pipe" });

    assert.doesNotMatch(jsCode, /import\.meta\.glob\b/, `${name}.js must not contain import.meta.glob`);
    assert.doesNotMatch(jsCode, /new URL\(\s*["']\.\//, `${name}.js must not contain relative new URL('./...')`);

    const jsImports = [
      ...[...jsCode.matchAll(/\bimport\s+(?:[^"'`]+?\s+from\s+)?["']([^"']+)["']/g)].map((m) => m[1]),
      ...[...jsCode.matchAll(/\bimport\(\s*["']([^"']+)["']\s*\)/g)].map((m) => m[1])
    ];
    if (name === "water-builtin-shaders" || name === "water-presets") {
      assert.deepEqual(jsImports, [], `${name}.js must have zero external imports`);
    } else {
      for (const spec of jsImports) {
        assert.match(spec, allowedNative, `${name}.js imported disallowed specifier '${spec}'`);
      }
    }

    assert.doesNotMatch(dtsCode, /\bfrom\s+["']\.\.?\//, `${name}.d.mts must not contain relative imports`);
    assert.doesNotMatch(dtsCode, /\bimport\(\s*["']\.\.?\//, `${name}.d.mts must not contain relative import() types`);
    assert.ok(!dtsCode.includes("packages/water/src"), `${name}.d.mts must not leak packages/water/src paths`);
  }
});

test("all 4 Water package entries load in Node ESM with exact exports and working authoring/preset logic", async () => {
  const loadModule = new Function("spec", "return import(spec);");
  const nodeEntries = ["water-builtin-shaders", "water-presets", "water-authoring"];
  const loaded = await Promise.all(
    nodeEntries.map((name) => loadModule(pathToFileURL(path.join(distDir, `${name}.js`)).href))
  );
  const byName = Object.fromEntries(nodeEntries.map((name, idx) => [name, loaded[idx]]));

  // Verify water-runtime.js against the built local Engine.
  const localEngineEntry = path.join(rootDir, "packages/galacean/dist/module.js");
  let runtimeMod;
  const runtimeTmpDir = await realpath(await mkdtemp(path.join(tmpdir(), "water-runtime-node-esm-")));
  try {
    let hasLocalEngine = false;
    try {
      await readFile(localEngineEntry, "utf8");
      hasLocalEngine = true;
    } catch {}
    const runtimeBundle = await esbuild({
      entryPoints: [path.join(distDir, "water-runtime.js")],
      bundle: true,
      write: false,
      format: "esm",
      platform: "browser",
      target: "es2022",
      plugins: [
        {
          name: "resolve-local-engine",
          setup(api) {
            api.onResolve({ filter: /^@galacean\/engine$/ }, () => ({
              path: hasLocalEngine ? pathToFileURL(localEngineEntry).href : pathToFileURL(path.join(runtimeTmpDir, "engine-stub.mjs")).href,
              external: true
            }));
          }
        }
      ]
    });
    const code = runtimeBundle.outputFiles[0].text;
    if (!hasLocalEngine) {
      const importedNames = new Set();
      for (const match of code.matchAll(/import\s*\{([^}]+)\}\s*from\s*["'][^"']+engine-stub\.mjs["']/g)) {
        for (const spec of match[1].split(",")) {
          const name = spec.trim().split(/\s+as\s+/)[0]?.trim();
          if (name) importedNames.add(name);
        }
      }
      await writeFile(path.join(runtimeTmpDir, "engine-stub.mjs"), createEngineStubSource(importedNames), "utf8");
    }
    const runtimeFile = path.join(runtimeTmpDir, "water-runtime.mjs");
    await writeFile(runtimeFile, code, "utf8");
    runtimeMod = await loadModule(pathToFileURL(runtimeFile).href);
    runtimeMod.registerNativeWater();
    byName["water-runtime"] = runtimeMod;
  } finally {
    await rm(runtimeTmpDir, { recursive: true, force: true });
  }

  for (const name of ENTRIES) {
    const mod = byName[name];
    for (const exportName of EXPECTED_EXPORTS[name]) {
      assert.ok(exportName in mod, `Missing export '${exportName}' in ${name}.js`);
    }
  }

  // Verify zero-dependency builtin shaders contract.
  const { WATER_BUILTIN_SHADER_NAMES, WATER_BUILTIN_SHADER_SOURCES } = byName["water-builtin-shaders"];
  assert.deepEqual(WATER_BUILTIN_SHADER_NAMES, {
    lake: "Water/Lake.v1",
    river: "Water/River.v1",
    ocean: "Water/Ocean.v1"
  });
  for (const profile of ["lake", "river", "ocean"]) {
    assert.equal(typeof WATER_BUILTIN_SHADER_SOURCES[profile], "string");
    assert.ok(WATER_BUILTIN_SHADER_SOURCES[profile].includes(`Shader "${WATER_BUILTIN_SHADER_NAMES[profile]}"`));
  }

  // Verify zero-dependency presets loader, structuredClone isolation, and unknown profile rejection.
  const { loadWaterPreset } = byName["water-presets"];
  for (const profile of ["lake", "river", "ocean"]) {
    const first = await loadWaterPreset(profile);
    const second = await loadWaterPreset(profile);
    assert.equal(first.material.shader, WATER_BUILTIN_SHADER_NAMES[profile]);
    assert.equal(first.material.shaderRef, undefined);
    first.material.name = "mutated";
    assert.notEqual(second.material.name, "mutated");
  }
  await assert.rejects(() => loadWaterPreset("unknown"), /Unknown Water preset/);
  await assert.rejects(() => loadWaterPreset("toString"), /Unknown Water preset/);

  // Verify CPU-only authoring exports execute cleanly in Node.
  const authoring = byName["water-authoring"];
  const { shape, terrain } = authoring.createWaterCreationPreset("lake");
  assert.ok(authoring.compileWaterShape(shape, terrain, "node-lake-test"));
  const encoded = authoring.encodeWaterTerrainAssets(terrain);
  const decoded = authoring.decodeWaterTerrainAssets(encoded.description, encoded.heights);
  assert.equal(decoded.snapshot.columns, terrain.columns);
  assert.equal(authoring.sampleWaterTerrainHeight(decoded.snapshot, 0, 0), -2);
  for (const profile of ["lake", "river", "ocean"]) {
    const defaults = authoring.createWaterMaterialDefaults(profile);
    assert.ok(authoring.resolveWaterMaterialFileLook(defaults).appearance.appearance);
  }
});

test("water-runtime.js evaluates cleanly from an opaque blob:null/...#preview.js URL without Vite", async () => {
  const dir = await realpath(await mkdtemp(path.join(tmpdir(), "water-pkg-blob-preview-")));
  try {
    const engineStub = path.join(dir, "engine-stub.mjs");
    const entry = path.join(dir, "water-runtime-preview.mjs");
    const blobUrl = "blob:null/00000000-0000-0000-0000-000000000000#preview.js";

    const bundled = await esbuild({
      entryPoints: [path.join(distDir, "water-runtime.js")],
      bundle: true,
      write: false,
      format: "esm",
      platform: "browser",
      target: "es2022",
      define: { "import.meta.url": JSON.stringify(blobUrl) },
      plugins: [
        {
          name: "stub-engine",
          setup(api) {
            api.onResolve({ filter: /^@galacean\/engine/ }, () => ({
              path: pathToFileURL(engineStub).href,
              external: true
            }));
          }
        }
      ]
    });

    const code = bundled.outputFiles[0].text;
    const importedNames = new Set();
    for (const match of code.matchAll(/import\s*\{([^}]+)\}\s*from\s*["'][^"']+engine-stub\.mjs["']/g)) {
      for (const spec of match[1].split(",")) {
        const name = spec.trim().split(/\s+as\s+/)[0]?.trim();
        if (name) importedNames.add(name);
      }
    }
    await writeFile(engineStub, createEngineStubSource(importedNames), "utf8");
    await writeFile(entry, code, "utf8");

    execFileSync(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        `const mod = await import(${JSON.stringify(pathToFileURL(entry).href)});
         mod.registerNativeWater();
         if (typeof mod.WaterSystem !== "function" || typeof mod.WaterBodyComponent !== "function") {
           throw new Error("Missing Water runtime classes");
         }`
      ],
      { stdio: "pipe" }
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("Vite builds a standalone exported project importing dist/water-runtime.js without extra worker files", async () => {
  const dir = await realpath(await mkdtemp(path.join(tmpdir(), "water-pkg-vite-build-")));
  try {
    await mkdir(path.join(dir, "src"), { recursive: true });
    await writeFile(
      path.join(dir, "src/main.js"),
      `export * from ${JSON.stringify(path.join(distDir, "water-runtime.js"))};\n`,
      "utf8"
    );
    await writeFile(path.join(dir, "index.html"), '<script type="module" src="/src/main.js"></script>\n', "utf8");

    const buildOutput = await viteBuild({
      configFile: false,
      root: dir,
      logLevel: "silent",
      build: {
        write: false,
        rollupOptions: {
          external: (id) => id.startsWith("@galacean/")
        }
      }
    });
    const chunks = Array.isArray(buildOutput) ? buildOutput.flatMap((o) => o.output) : buildOutput.output;
    const jsChunks = chunks.filter((item) => item.type === "chunk");
    assert.ok(jsChunks.length >= 1, "Expected Vite build to emit main JS chunk");
    for (const chunk of jsChunks) {
      assert.doesNotMatch(chunk.code, /import\.meta\.glob\b/);
      assert.doesNotMatch(chunk.code, /new URL\(\s*["']\.\//);
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("all 4 dist/water-*.d.mts typecheck cleanly under Bundler and NodeNext using only @galacean/engine types", async () => {
  const engineDtsCandidates = [
    path.join(rootDir, "packages/galacean/types/index.d.ts"),
    path.join(rootDir, "packages/galacean/src/index.ts")
  ];
  let engineTypes = engineDtsCandidates[1];
  for (const candidate of engineDtsCandidates) {
    try {
      await readFile(candidate, "utf8");
      engineTypes = candidate;
      break;
    } catch {}
  }

  const consumerPath = path.join(rootDir, "world/__water_package_dts_consumer__.ts");
  const consumerCode = `
import { WATER_BUILTIN_SHADER_NAMES, WATER_BUILTIN_SHADER_SOURCES } from "@galacean/engine-water/water-builtin-shaders";
import {
  createLakeSpatialFieldBudget,
  type HeightfieldWaterDescriptorV1,
  WaterQualityTier,
  resolveWaterMaterialFileLook,
  type WaterMaterialFile,
  WATER_MATERIAL_TEXTURE_SLOTS,
  validateWaterMaterialTextureMetadata,
  type WaterMaterialTextureSlot,
  type WaterMaterialTextureMetadata,
  createWaterMaterialDefaults,
  createWaterCreationPreset,
  compileWaterConnectionGraph,
  type WaterConnectionAuthoringBody,
  validateWaterShape,
  validateWaterAuthoringSettings,
  validateWaterWorldTransform,
  getWaterAuthoringCapabilities,
  validateWaterShaderCapabilities,
  validateWaterMaterialCapabilities,
  compileWaterShape,
  type WaterShapeAuthoring,
  type WaterShorePoint,
  createWaterQualitySettings,
  patchWaterQualitySettings,
  type WaterQualitySettings,
  type WaterQualityInput,
  captureWaterTerrainSnapshot,
  copyWaterTerrainSnapshot,
  sampleWaterTerrainHeight,
  type WaterTerrainSnapshot,
  validateWatercourseAuthoring,
  type WatercourseAuthoring,
  encodeWaterTerrainAssets,
  decodeWaterTerrainAssets,
  type WaterTerrainDescription
} from "@galacean/engine-water/water-authoring";
import {
  registerNativeWater,
  WaterBodyComponent,
  type WaterBodyAuthoringInput,
  WaterSystem,
  resolveWaterTerrainAssets,
  type WaterTerrainInput,
  createWaterMaterialFile,
  prepareWaterMaterial,
  updateWaterMaterialParameters,
  waterMaterialShaderSource,
  registerWaterBuiltinShaders,
  WATER_BUILTIN_SHADER_NAMES as RUNTIME_SHADER_NAMES
} from "@galacean/engine-water/water-runtime";
import {
  loadWaterPreset,
  type WaterPresetAssets,
  type WaterMaterialPreset
} from "@galacean/engine-water/water-presets";

export const values = [
  WATER_BUILTIN_SHADER_NAMES,
  WATER_BUILTIN_SHADER_SOURCES,
  createLakeSpatialFieldBudget,
  WaterQualityTier,
  resolveWaterMaterialFileLook,
  WATER_MATERIAL_TEXTURE_SLOTS,
  validateWaterMaterialTextureMetadata,
  createWaterMaterialDefaults,
  createWaterCreationPreset,
  compileWaterConnectionGraph,
  validateWaterShape,
  validateWaterAuthoringSettings,
  validateWaterWorldTransform,
  getWaterAuthoringCapabilities,
  validateWaterShaderCapabilities,
  validateWaterMaterialCapabilities,
  compileWaterShape,
  createWaterQualitySettings,
  patchWaterQualitySettings,
  captureWaterTerrainSnapshot,
  copyWaterTerrainSnapshot,
  sampleWaterTerrainHeight,
  validateWatercourseAuthoring,
  encodeWaterTerrainAssets,
  decodeWaterTerrainAssets,
  registerNativeWater,
  WaterBodyComponent,
  WaterSystem,
  resolveWaterTerrainAssets,
  createWaterMaterialFile,
  prepareWaterMaterial,
  updateWaterMaterialParameters,
  waterMaterialShaderSource,
  registerWaterBuiltinShaders,
  RUNTIME_SHADER_NAMES,
  loadWaterPreset
];

export type Types = [
  HeightfieldWaterDescriptorV1,
  WaterMaterialFile,
  WaterMaterialTextureSlot,
  WaterMaterialTextureMetadata,
  WaterConnectionAuthoringBody,
  WaterShapeAuthoring,
  WaterShorePoint,
  WaterQualitySettings,
  WaterQualityInput,
  WaterTerrainSnapshot,
  WatercourseAuthoring,
  WaterTerrainDescription,
  WaterBodyAuthoringInput,
  WaterTerrainInput,
  WaterPresetAssets,
  WaterMaterialPreset
];
`;

  for (const mode of [ts.ModuleResolutionKind.Bundler, ts.ModuleResolutionKind.NodeNext]) {
    const options = {
      target: ts.ScriptTarget.ES2022,
      module: mode === ts.ModuleResolutionKind.NodeNext ? ts.ModuleKind.NodeNext : ts.ModuleKind.ESNext,
      moduleResolution: mode,
      strict: true,
      verbatimModuleSyntax: true,
      skipLibCheck: false,
      noEmit: true,
      paths: { "@galacean/engine": [engineTypes] }
    };
    const host = ts.createCompilerHost(options);
    const origRead = host.readFile.bind(host);
    const origExists = host.fileExists.bind(host);
    host.readFile = (f) => (f === consumerPath ? consumerCode : origRead(f));
    host.fileExists = (f) => f === consumerPath || origExists(f);
    const program = ts.createProgram([consumerPath], options, host);
    const diagnostics = ts
      .getPreEmitDiagnostics(program)
      .filter((d) => !d.file || d.file.fileName === consumerPath || d.file.fileName.startsWith(distDir));
    assert.equal(
      diagnostics.length,
      0,
      `Expected 0 TypeScript diagnostics under ${ts.ModuleResolutionKind[mode]}, got:\n${diagnostics
        .map((d) => `${d.file?.fileName ?? "global"}: ${ts.flattenDiagnosticMessageText(d.messageText, " ")}`)
        .join("\n")}`
    );
  }
});

test("water:watch starts, builds all 4 entries, and exits cleanly", async () => {
  await new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(process.execPath, [path.join(rootDir, "world/scripts/build-water.js"), "--watch"], {
      cwd: path.join(rootDir, "world"),
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      rejectPromise(new Error(`water:watch timed out.\nstdout:\n${stdout}\nstderr:\n${stderr}`));
    }, 30000);

    const checkReady = () => {
      if (stdout.includes("[water:build] Built 4 entries") && stdout.includes("[water:watch] Watching Water sources")) {
        clearTimeout(timer);
        child.kill("SIGTERM");
        resolvePromise();
      }
    };
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
      checkReady();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      rejectPromise(err);
    });
    child.on("exit", (code, signal) => {
      if (signal === "SIGTERM") return;
      clearTimeout(timer);
      rejectPromise(new Error(`water:watch exited prematurely code=${code} signal=${signal}\n${stderr}`));
    });
  });
});
