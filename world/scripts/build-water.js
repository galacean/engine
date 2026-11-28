import { build, context } from "esbuild";
import fs from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const packagesDir = fileURLToPath(new URL("../../packages/", import.meta.url));
const rootDir = resolve(packagesDir, "..");
const waterPackageDir = join(packagesDir, "water");
const waterSrcDir = join(waterPackageDir, "src/water");
const outDir = join(waterPackageDir, "dist");

const REWRITE_TO_ENGINE_ENTRY = /^@galacean\/engine-(?:core|math|loader|rhi-webgl)$/;
const ALLOWED_EXTERNAL_NATIVE = /^@galacean\/engine(?:-(?:shader|shader-compiler|ui|physics-physx|design))?$/;
const WORKER_FACTORIES = new Map([
  [
    join(waterSrcDir, "runtime/heightfield/HeightfieldWaterCompileWorkerFactory.ts"),
    {
      exportName: "createHeightfieldWaterCompileWorker",
      workerEntry: join(waterSrcDir, "compiler/heightfield/HeightfieldWaterCompileWorker.ts")
    }
  ],
  [
    join(waterSrcDir, "runtime/river/RiverCompileWorkerFactory.ts"),
    {
      exportName: "createRiverCompileWorker",
      workerEntry: join(waterSrcDir, "compiler/river/RiverCompileWorker.ts")
    }
  ]
]);
const BUILTIN_ASSETS_PATH = join(waterSrcDir, "native/WaterBuiltinAssets.ts");

const ENTRY_SPECS = {
  "water-builtin-shaders": {
    "native/WaterBuiltinShaderNames": ["WATER_BUILTIN_SHADER_NAMES"],
    "native/WaterBuiltinShaderSources": ["WATER_BUILTIN_SHADER_SOURCES"]
  },
  "water-authoring": {
    "presets/lake/LakeWaterLook": ["createLakeSpatialFieldBudget"],
    "authoring/heightfield/HeightfieldWaterDescriptor": ["type HeightfieldWaterDescriptorV1"],
    "authoring/wave/enums/WaterQualityTier": ["WaterQualityTier"],
    "native/WaterMaterialFile": [
      "resolveWaterMaterialFileLook",
      "type WaterMaterialFile",
      "WATER_MATERIAL_TEXTURE_SLOTS",
      "validateWaterMaterialTextureMetadata",
      "type WaterMaterialTextureSlot",
      "type WaterMaterialTextureMetadata",
      "createWaterMaterialDefaults"
    ],
    "native/WaterCreationPresets": ["createWaterCreationPreset"],
    "native/WaterConnectionAuthoring": ["compileWaterConnectionGraph", "type WaterConnectionAuthoringBody"],
    "native/WaterAuthoring": [
      "validateWaterShape",
      "validateWaterAuthoringSettings",
      "validateWaterWorldTransform",
      "getWaterAuthoringCapabilities",
      "validateWaterShaderCapabilities",
      "validateWaterMaterialCapabilities",
      "compileWaterShape",
      "type WaterShapeAuthoring",
      "type WaterShorePoint"
    ],
    "native/WaterQualitySettings": [
      "createWaterQualitySettings",
      "patchWaterQualitySettings",
      "type WaterQualitySettings",
      "type WaterQualityInput"
    ],
    "authoring/terrain/WaterTerrainSnapshot": [
      "captureWaterTerrainSnapshot",
      "copyWaterTerrainSnapshot",
      "sampleWaterTerrainHeight",
      "type WaterTerrainSnapshot"
    ],
    "authoring/river/Watercourse": ["validateWatercourseAuthoring", "type WatercourseAuthoring"],
    "native/WaterTerrainAssets": [
      "encodeWaterTerrainAssets",
      "decodeWaterTerrainAssets",
      "type WaterTerrainDescription"
    ]
  },
  "water-runtime": {
    "native/registerNativeWater": ["registerNativeWater"],
    "native/WaterBodyComponent": ["WaterBodyComponent", "type WaterBodyAuthoringInput"],
    "native/WaterSystem": ["WaterSystem"],
    "native/WaterTerrainAssets": ["resolveWaterTerrainAssets", "type WaterTerrainInput"],
    "native/WaterMaterial": [
      "createWaterMaterialFile",
      "prepareWaterMaterial",
      "updateWaterMaterialParameters",
      "waterMaterialShaderSource"
    ],
    "native/WaterBuiltinShaders": ["registerWaterBuiltinShaders", "WATER_BUILTIN_SHADER_NAMES"]
  }
};

function renderEntrySource(spec) {
  return Object.entries(spec)
    .map(([subpath, names]) => `export { ${names.join(", ")} } from ${JSON.stringify(join(waterSrcDir, `${subpath}.ts`))};\n`)
    .join("");
}

function resolveWorkspacePackageSource(specifier) {
  const match = /^@galacean\/engine-([^/]+)(?:\/(.*))?$/.exec(specifier);
  if (!match) return null;
  const [, pkgName, subpath] = match;
  const base = join(packagesDir, pkgName, "src", subpath ?? "index");
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, join(base, "index.ts")]) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  }
  return null;
}

function createPackagedWaterBuiltinAssetsModule() {
  return `import { builtinWaterTextureDescriptor } from "./WaterBuiltinTextureIdentity";
export { builtinWaterTextureDescriptor } from "./WaterBuiltinTextureIdentity";
import { Texture2D } from "@galacean/engine";
import { digestSha256Hex } from "../resources/sha256";

export const BUILTIN_WATER_PROJECT_URL = "";
export const builtinWaterDefaultFiles = [];

const resolvers = new WeakMap();
const converted = new WeakMap();

export function configureWaterBuiltinAssets(engine, resolveAsset) {
  if (converted.has(engine)) throw new Error("Water built-in assets cannot change after their first load.");
  resolvers.set(engine, resolveAsset);
}

async function textures(engine, pathForError) {
  let loading = converted.get(engine);
  if (loading) return loading;
  const resolveAsset = resolvers.get(engine);
  if (!resolveAsset) {
    throw new Error(\`Water built-in asset '\${pathForError}' is unavailable in packaged mode without configureWaterBuiltinAssets().\`);
  }
  loading = fetch(resolveAsset("conversion.json"))
    .then(async (response) => {
      if (!response.ok) throw new Error(\`Water asset conversion manifest: HTTP \${response.status}.\`);
      return response.json();
    })
    .catch((error) => {
      converted.delete(engine);
      throw error;
    });
  converted.set(engine, loading);
  return loading;
}

export async function loadBuiltinWaterTexture(engine, path, signal) {
  const asset = (await textures(engine, path)).find((entry) => entry.target === path);
  if (!asset || !["Texture", "KTX2"].includes(asset.type)) throw new Error(\`Missing native Water texture '\${path}'.\`);
  if (asset.sha256 !== builtinWaterTextureDescriptor(path).contentHash) {
    throw new Error(\`Native Water texture '\${path}' does not match the packaged conversion identity.\`);
  }
  const resolveAsset = resolvers.get(engine);
  if (!resolveAsset) {
    throw new Error(\`Water built-in asset '\${path}' is unavailable in packaged mode without configureWaterBuiltinAssets().\`);
  }
  const url = resolveAsset(path);
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(\`Native Water texture '\${path}' failed its source hash check.\`);
  const bytes = await response.arrayBuffer();
  if ((await digestSha256Hex(bytes)) !== asset.sha256) {
    throw new Error(\`Native Water texture '\${path}' failed its source hash check.\`);
  }
  signal?.throwIfAborted();
  const blobUrl = url.startsWith("blob:")
    ? undefined
    : URL.createObjectURL(new Blob([bytes], { type: "application/octet-stream" }));
  let texture;
  try {
    texture = await engine.resourceManager.load({
      url: blobUrl ?? url,
      type: asset.type,
      params: asset.params
    });
  } catch (error) {
    if (blobUrl) URL.revokeObjectURL(blobUrl);
    throw error;
  }
  texture._addReferCount(1);
  if (blobUrl) {
    const originalDestroy = texture.destroy.bind(texture);
    texture.destroy = (force) => {
      try {
        return originalDestroy(force);
      } finally {
        if (texture.destroyed) URL.revokeObjectURL(blobUrl);
      }
    };
  }
  try {
    signal?.throwIfAborted();
    if (
      texture.destroyed ||
      texture.width !== asset.width ||
      texture.height !== asset.height ||
      texture.isSRGBColorSpace !== asset.params.isSRGBColorSpace
    ) {
      throw new Error(\`Native Water texture '\${path}' has incompatible dimensions or color space.\`);
    }
    return texture;
  } catch (error) {
    texture._addReferCount(-1);
    texture.destroy();
    throw error;
  }
}

export function builtinWaterTextureFactory(engine, descriptor, path) {
  return {
    descriptor,
    load: async ({ signal }) => ({ texture: await loadBuiltinWaterTexture(engine, path, signal) }),
    destroy: (resource) => {
      const texture = resource.texture;
      texture._addReferCount(-1);
      texture.destroy();
    }
  };
}
`;
}

function createResolutionPlugin({ selfContained }) {
  return {
    name: selfContained ? "water-self-contained-resolve" : "water-package-resolve",
    setup(api) {
      api.onResolve({ filter: /\?raw$/ }, ({ path: rawPath, resolveDir }) => ({
        path: resolve(resolveDir, rawPath.slice(0, -4)),
        namespace: "water-raw-text"
      }));
      api.onLoad({ filter: /.*/, namespace: "water-raw-text" }, async ({ path: filePath }) => ({
        contents: await readFile(filePath, "utf8"),
        loader: "text",
        watchFiles: [filePath]
      }));

      api.onResolve({ filter: /^@galacean\/engine/ }, ({ path: specifier }) => {
        if (selfContained) {
          if (specifier === "@galacean/engine") {
            return { path: join(packagesDir, "galacean/src/index.ts") };
          }
          const resolved = resolveWorkspacePackageSource(specifier);
          if (resolved) return { path: resolved };
          throw new Error(`Cannot resolve self-contained Water dependency '${specifier}'.`);
        }
        if (specifier === "@galacean/engine" || REWRITE_TO_ENGINE_ENTRY.test(specifier)) {
          return { path: "@galacean/engine", external: true };
        }
        if (ALLOWED_EXTERNAL_NATIVE.test(specifier)) {
          return { path: specifier, external: true };
        }
        const resolved = resolveWorkspacePackageSource(specifier);
        if (resolved) return { path: resolved };
        throw new Error(`Cannot resolve Water dependency '${specifier}'.`);
      });
    }
  };
}

async function bundleInlineWorker(workerEntry, exportName) {
  const result = await build({
    absWorkingDir: rootDir,
    entryPoints: [workerEntry],
    bundle: true,
    format: "iife",
    platform: "browser",
    target: "es2022",
    write: false,
    metafile: true,
    minifyWhitespace: true,
    legalComments: "none",
    loader: { ".glsl": "text", ".shader": "text", ".shaderc": "text", ".base64": "text" },
    plugins: [createResolutionPlugin({ selfContained: true })]
  });
  const outputs = Object.values(result.metafile.outputs);
  const externalImports = outputs.flatMap((output) => output.imports);
  if (externalImports.length > 0) {
    throw new Error(
      `Water worker '${workerEntry}' must be self-contained (found external imports: ${externalImports.map((i) => i.path).join(", ")}).`
    );
  }
  const workerCode = result.outputFiles[0].text;
  const watchFiles = Object.keys(result.metafile.inputs).map((input) => resolve(rootDir, input.replace(/^[^:]+:/, "")));
  return {
    watchFiles,
    contents: [
      `const workerSource = ${JSON.stringify(workerCode)};`,
      `let workerUrl;`,
      `export function ${exportName}() {`,
      `  if (!workerUrl) {`,
      `    workerUrl = URL.createObjectURL(new Blob([workerSource], { type: "text/javascript" }));`,
      `  }`,
      `  return new Worker(workerUrl);`,
      `}`
    ].join("\n")
  };
}

async function buildAndValidatePresets() {
  const evalCode = [
    `export { WATER_BUILTIN_SHADER_NAMES } from ${JSON.stringify(join(waterSrcDir, "native/WaterBuiltinShaderNames.ts"))};`,
    `export { WATER_BUILTIN_SHADER_SOURCES } from ${JSON.stringify(join(waterSrcDir, "native/WaterBuiltinShaderSources.ts"))};`,
    `export { WATER_MATERIAL_TEXTURE_SLOTS, createWaterMaterialDefaults } from ${JSON.stringify(join(waterSrcDir, "native/WaterMaterialFile.ts"))};`
  ].join("\n");

  const evalBundle = await build({
    absWorkingDir: rootDir,
    stdin: { contents: evalCode, resolveDir: waterSrcDir, loader: "ts" },
    bundle: true,
    format: "esm",
    platform: "node",
    target: "es2022",
    write: false,
    metafile: true,
    loader: { ".glsl": "text", ".shader": "text", ".shaderc": "text", ".base64": "text" },
    plugins: [createResolutionPlugin({ selfContained: true })]
  });

  const dataUrl = `data:text/javascript;base64,${Buffer.from(evalBundle.outputFiles[0].contents).toString("base64")}`;
  const {
    WATER_BUILTIN_SHADER_NAMES,
    WATER_BUILTIN_SHADER_SOURCES,
    WATER_MATERIAL_TEXTURE_SLOTS,
    createWaterMaterialDefaults
  } = await import(dataUrl);

  const presets = {};
  for (const preset of ["lake", "river", "ocean"]) {
    const material = createWaterMaterialDefaults(preset);
    const name = WATER_BUILTIN_SHADER_NAMES[preset];
    const source = WATER_BUILTIN_SHADER_SOURCES[preset];
    const slots = WATER_MATERIAL_TEXTURE_SLOTS[preset];
    if (
      material.shader !== name ||
      material.shaderRef ||
      !slots?.length ||
      slots.some(
        ({ slot }) => material.shaderData[slot]?.type !== "Texture" || material.shaderData[slot]?.value !== null
      ) ||
      Object.entries(material.shaderData).some(
        ([propName, entry]) => entry.type.startsWith("Texture") && !slots.some(({ slot }) => slot === propName)
      )
    ) {
      throw new Error(`Water preset '${preset}' requires the Engine builtin Shader contract with empty Texture slots.`);
    }
    if (
      source.match(/\bShader\s+"([^"\n]+)"/)?.[1] !== name ||
      slots.some(({ slot }) => !source.includes(slot)) ||
      /material_WaterRiverDrops/.test(source)
    ) {
      throw new Error(`Water authoring Shader '${preset}' does not match its builtin contract.`);
    }
    presets[preset] = { material };
  }

  return [
    `const presets = Object.freeze(${JSON.stringify(presets)});`,
    `export async function loadWaterPreset(profile) {`,
    `  if (!Object.hasOwn(presets, profile)) throw new Error("Unknown Water preset");`,
    `  return structuredClone(presets[profile]);`,
    `}`,
    ""
  ].join("\n");
}

function assertJsGuards(outputsByName, metafileOutputs) {
  for (const [name, code] of Object.entries(outputsByName)) {
    if (/import\.meta\.glob\b/.test(code)) {
      throw new Error(`Guard failed: ${name}.js must not contain import.meta.glob.`);
    }
    if (/new URL\(\s*["']\.\//.test(code)) {
      throw new Error(`Guard failed: ${name}.js must not contain relative new URL('./...').`);
    }
    const meta = metafileOutputs.get(`${name}.js`);
    const imports = meta ? meta.imports.map((entry) => entry.path) : [];
    const staticImports = [...code.matchAll(/\bimport\s+(?:[^"'`]+?\s+from\s+)?["']([^"']+)["']/g)].map((m) => m[1]);
    const dynamicImports = [...code.matchAll(/\bimport\(\s*["']([^"']+)["']\s*\)/g)].map((m) => m[1]);
    const allImports = [...new Set([...imports, ...staticImports, ...dynamicImports])];

    if (name === "water-builtin-shaders" || name === "water-presets") {
      if (allImports.length > 0) {
        throw new Error(`Guard failed: ${name}.js must have zero external imports (found: ${allImports.join(", ")}).`);
      }
    } else {
      for (const spec of allImports) {
        if (!ALLOWED_EXTERNAL_NATIVE.test(spec)) {
          throw new Error(
            `Guard failed: ${name}.js has disallowed external import '${spec}' (only @galacean/engine and public native packages are allowed).`
          );
        }
      }
    }
  }
}

let cachedTsProgram;

function mapExternalTypePackage(specifier) {
  if (specifier === "@galacean/engine" || REWRITE_TO_ENGINE_ENTRY.test(specifier)) return "@galacean/engine";
  if (ALLOWED_EXTERNAL_NATIVE.test(specifier)) return specifier;
  throw new Error(`Disallowed external package '${specifier}' leaked into Water declaration output.`);
}

function resolveLocalDts(fromFile, specifier, emitted) {
  const base = specifier.startsWith("/") ? specifier : resolve(dirname(fromFile), specifier);
  const candidates = [base.replace(/\.ts$/, ".d.ts"), `${base}.d.ts`, join(base, "index.d.ts")];
  return candidates.find((candidate) => emitted.has(candidate)) ?? null;
}

function collectIdentifiers(node, out) {
  if (ts.isIdentifier(node)) {
    out.add(node.text);
    return;
  }
  ts.forEachChild(node, (child) => collectIdentifiers(child, out));
}

function getDeclaredNames(node) {
  if (
    ts.isInterfaceDeclaration(node) ||
    ts.isTypeAliasDeclaration(node) ||
    ts.isClassDeclaration(node) ||
    ts.isEnumDeclaration(node) ||
    ts.isFunctionDeclaration(node) ||
    ts.isModuleDeclaration(node)
  ) {
    return node.name && ts.isIdentifier(node.name) ? [node.name.text] : [];
  }
  if (ts.isVariableStatement(node)) {
    const names = [];
    for (const decl of node.declarationList.declarations) {
      if (ts.isIdentifier(decl.name)) names.push(decl.name.text);
    }
    return names;
  }
  return [];
}

function stripExportModifier(text) {
  return text
    .replace(/^((?:\/\*\*[\s\S]*?\*\/\s*|\/\/[^\n]*\n\s*)*)export\s+declare\s+/, "$1declare ")
    .replace(/^((?:\/\*\*[\s\S]*?\*\/\s*|\/\/[^\n]*\n\s*)*)export\s+(interface|type)\s+/, "$1$2 ")
    .replace(/^((?:\/\*\*[\s\S]*?\*\/\s*|\/\/[^\n]*\n\s*)*)export\s+(abstract\s+class|class|function|const|let|var|enum)\s+/, "$1declare $2 ");
}

function bundleEntryDts(entryName, entryDtsPath, emitted) {
  const visited = new Set();
  const orderedFiles = [];
  const externalImports = new Map(); // pkg -> Map<localName, importedName>
  const localAliases = []; // { local, target }
  const entryExports = []; // { local, exported, isType }

  const addExternalImport = (pkg, importedName, localName = importedName) => {
    let map = externalImports.get(pkg);
    if (!map) {
      map = new Map();
      externalImports.set(pkg, map);
    }
    const existing = map.get(localName);
    if (existing && existing !== importedName) {
      throw new Error(`External type import collision in ${entryName}.d.mts for '${localName}' from '${pkg}'.`);
    }
    map.set(localName, importedName);
  };

  function visitFile(filePath) {
    if (visited.has(filePath)) return;
    visited.add(filePath);
    const text = emitted.get(filePath);
    if (!text) throw new Error(`Missing emitted declaration file '${filePath}' for ${entryName}.d.mts.`);
    const sf = ts.createSourceFile(filePath, text, ts.ScriptTarget.ESNext, true);

    // Discover inline import("...").Member type nodes anywhere in the file.
    const inlineDeps = [];
    const scanInline = (node) => {
      if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument) && ts.isStringLiteral(node.argument.literal)) {
        const spec = node.argument.literal.text;
        const qualifier = node.qualifier ? node.qualifier.getText(sf) : null;
        if (spec.startsWith("@galacean/")) {
          if (!qualifier) throw new Error(`Unsupported bare import("${spec}") in ${filePath}.`);
          const rootName = qualifier.split(".")[0];
          addExternalImport(mapExternalTypePackage(spec), rootName, rootName);
        } else {
          const target = resolveLocalDts(filePath, spec, emitted);
          if (!target) throw new Error(`Unresolved inline import("${spec}") in ${filePath}.`);
          inlineDeps.push(target);
        }
      }
      ts.forEachChild(node, scanInline);
    };
    scanInline(sf);

    for (const stmt of sf.statements) {
      if (ts.isImportDeclaration(stmt) && ts.isStringLiteral(stmt.moduleSpecifier)) {
        const spec = stmt.moduleSpecifier.text;
        if (spec.startsWith("@galacean/")) {
          const pkg = mapExternalTypePackage(spec);
          const bindings = stmt.importClause?.namedBindings;
          if (bindings && ts.isNamedImports(bindings)) {
            for (const el of bindings.elements) {
              addExternalImport(pkg, el.propertyName ? el.propertyName.text : el.name.text, el.name.text);
            }
          } else {
            throw new Error(`Unsupported external import form '${stmt.getText(sf)}' in ${filePath}.`);
          }
        } else {
          const target = resolveLocalDts(filePath, spec, emitted);
          if (!target) throw new Error(`Unresolved local import '${spec}' in ${filePath}.`);
          visitFile(target);
          const bindings = stmt.importClause?.namedBindings;
          if (bindings && ts.isNamedImports(bindings)) {
            for (const el of bindings.elements) {
              if (el.propertyName && el.propertyName.text !== el.name.text) {
                localAliases.push({ local: el.name.text, target: el.propertyName.text });
              }
            }
          }
        }
      } else if (ts.isExportDeclaration(stmt) && stmt.moduleSpecifier && ts.isStringLiteral(stmt.moduleSpecifier)) {
        const spec = stmt.moduleSpecifier.text;
        if (spec.startsWith("@galacean/")) {
          throw new Error(`Unexpected external re-export '${spec}' in ${filePath}.`);
        }
        const target = resolveLocalDts(filePath, spec, emitted);
        if (!target) throw new Error(`Unresolved local re-export '${spec}' in ${filePath}.`);
        visitFile(target);
        if (filePath === entryDtsPath && stmt.exportClause && ts.isNamedExports(stmt.exportClause)) {
          for (const el of stmt.exportClause.elements) {
            entryExports.push({
              local: el.propertyName ? el.propertyName.text : el.name.text,
              exported: el.name.text,
              isType: stmt.isTypeOnly || el.isTypeOnly
            });
          }
        }
      }
    }

    for (const dep of inlineDeps) visitFile(dep);
    if (filePath !== entryDtsPath) orderedFiles.push(filePath);
  }

  visitFile(entryDtsPath);

  // Collect all declarations in topological order with inline import(...) rewrites applied.
  const declarations = []; // { names, refs, text, filePath }
  const ownerByName = new Map();

  for (const filePath of orderedFiles) {
    const rawText = emitted.get(filePath);
    const sf = ts.createSourceFile(filePath, rawText, ts.ScriptTarget.ESNext, true);

    for (const stmt of sf.statements) {
      if (ts.isImportDeclaration(stmt) || ts.isExportDeclaration(stmt)) continue;
      const names = getDeclaredNames(stmt);
      if (names.length === 0) continue;

      for (const name of names) {
        const prev = ownerByName.get(name);
        if (prev && prev !== filePath) {
          throw new Error(
            `Declaration name collision for '${name}' in ${entryName}.d.mts between ${prev} and ${filePath}.`
          );
        }
        ownerByName.set(name, filePath);
      }

      // Apply AST-accurate replacement for inline import("...").Qualifier nodes within this statement.
      const fullStart = stmt.getFullStart();
      const end = stmt.getEnd();
      const replacements = [];
      const findInline = (node) => {
        if (ts.isImportTypeNode(node) && node.qualifier) {
          const qualifier = node.qualifier.getText(sf);
          const typeArgs = node.typeArguments
            ? `<${node.typeArguments.map((arg) => arg.getText(sf)).join(", ")}>`
            : "";
          replacements.push({ start: node.getStart(sf), end: node.getEnd(), text: `${qualifier}${typeArgs}` });
          return;
        }
        ts.forEachChild(node, findInline);
      };
      findInline(stmt);
      replacements.sort((a, b) => b.start - a.start);
      let stmtText = rawText.slice(fullStart, end);
      for (const rep of replacements) {
        stmtText = stmtText.slice(0, rep.start - fullStart) + rep.text + stmtText.slice(rep.end - fullStart);
      }
      stmtText = stripExportModifier(stmtText.trimStart());

      const refs = new Set();
      const rewrittenSf = ts.createSourceFile("stmt.d.ts", stmtText, ts.ScriptTarget.ESNext, true);
      collectIdentifiers(rewrittenSf, refs);
      declarations.push({ names, refs, text: stmtText, filePath });
    }
  }

  for (const alias of localAliases) {
    if (!ownerByName.has(alias.local)) {
      declarations.push({
        names: [alias.local],
        refs: new Set([alias.target]),
        text: `type ${alias.local} = ${alias.target};`,
        filePath: "<alias>"
      });
    }
  }

  // Prune unreachable declarations starting from the exact public entry exports.
  const declsByName = new Map();
  for (const decl of declarations) {
    for (const name of decl.names) {
      let list = declsByName.get(name);
      if (!list) {
        list = [];
        declsByName.set(name, list);
      }
      list.push(decl);
    }
  }

  const neededNames = new Set(entryExports.map((e) => e.local));
  const keptDecls = new Set();
  const queue = [...neededNames];
  while (queue.length > 0) {
    const name = queue.pop();
    const defs = declsByName.get(name);
    if (!defs) continue;
    for (const decl of defs) {
      if (keptDecls.has(decl)) continue;
      keptDecls.add(decl);
      for (const ref of decl.refs) {
        if (!neededNames.has(ref)) {
          neededNames.add(ref);
          queue.push(ref);
        }
      }
    }
  }

  // Emit deduplicated external imports only for referenced symbols.
  const importLines = [];
  for (const [pkg, map] of [...externalImports.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const used = [...map.entries()]
      .filter(([local]) => neededNames.has(local))
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([local, imported]) => (local === imported ? local : `${imported} as ${local}`));
    if (used.length > 0) {
      importLines.push(`import { ${used.join(", ")} } from ${JSON.stringify(pkg)};`);
    }
  }

  const bodyLines = declarations.filter((decl) => keptDecls.has(decl)).map((decl) => decl.text);
  const exportItems = entryExports.map(({ local, exported, isType }) => {
    const prefix = isType ? "type " : "";
    return local === exported ? `${prefix}${local}` : `${prefix}${local} as ${exported}`;
  });

  const sections = [];
  if (importLines.length > 0) sections.push(importLines.join("\n"));
  if (bodyLines.length > 0) sections.push(bodyLines.join("\n\n"));
  sections.push(`export { ${exportItems.join(", ")} };`);
  return `${sections.join("\n\n")}\n`;
}

function generateWaterPresetDts() {
  return [
    `export interface WaterPresetAssets {`,
    `  material: {`,
    `    name: string;`,
    `    shader: string;`,
    `    screenSpaceReflectionIntensity?: number;`,
    `    screenSpaceReflectionBilateral?: boolean;`,
    `    macros: { name: string; value?: string }[];`,
    `    shaderData: Record<string, { type: string; value: unknown }>;`,
    `  };`,
    `}`,
    ``,
    `export type WaterMaterialPreset = "lake" | "river" | "ocean";`,
    ``,
    `export declare function loadWaterPreset(profile: WaterMaterialPreset): Promise<WaterPresetAssets>;`,
    ""
  ].join("\n");
}

function generateAllDeclarations() {
  const paths = {
    "@galacean/engine": [join(packagesDir, "galacean/src/index.ts")]
  };
  for (const dir of fs.readdirSync(packagesDir)) {
    const manifestPath = join(packagesDir, dir, "package.json");
    if (!fs.existsSync(manifestPath) || dir === "galacean") continue;
    const { name } = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    paths[name] = [join(packagesDir, dir, "src/index.ts")];
    paths[`${name}/*`] = [join(packagesDir, dir, "src/*")];
  }

  const virtualEntries = new Map();
  for (const [name, spec] of Object.entries(ENTRY_SPECS)) {
    virtualEntries.set(join(outDir, `${name}.ts`), renderEntrySource(spec));
  }
  const virtualRawDts = join(outDir, "__water_raw_ambient__.d.ts");
  virtualEntries.set(
    virtualRawDts,
    [
      `declare module "*?raw" { const content: string; export default content; }`,
      `declare module "*.glsl" { const content: string; export default content; }`,
      `declare module "*.shader" { const content: string; export default content; }`
    ].join("\n")
  );

  const compilerOptions = {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    experimentalDecorators: true,
    skipLibCheck: true,
    declaration: true,
    emitDeclarationOnly: true,
    allowImportingTsExtensions: true,
    resolveJsonModule: true,
    baseUrl: rootDir,
    paths
  };

  const host = ts.createCompilerHost(compilerOptions);
  const origReadFile = host.readFile.bind(host);
  const origFileExists = host.fileExists.bind(host);
  const origGetSourceFile = host.getSourceFile.bind(host);
  host.readFile = (fileName) => virtualEntries.get(fileName) ?? origReadFile(fileName);
  host.fileExists = (fileName) => virtualEntries.has(fileName) || origFileExists(fileName);
  host.getSourceFile = (fileName, languageVersion, onError, shouldCreateNewSourceFile) => {
    const virtual = virtualEntries.get(fileName);
    if (virtual !== undefined) return ts.createSourceFile(fileName, virtual, languageVersion, true);
    return origGetSourceFile(fileName, languageVersion, onError, shouldCreateNewSourceFile);
  };

  const emitted = new Map();
  host.writeFile = (fileName, data) => {
    if (fileName.startsWith(waterPackageDir)) emitted.set(fileName, data);
  };

  const program = ts.createProgram([...virtualEntries.keys()], compilerOptions, host, cachedTsProgram);
  cachedTsProgram = program;

  for (const sf of program.getSourceFiles()) {
    if (sf.fileName.startsWith(waterPackageDir) && !sf.isDeclarationFile) {
      const result = program.emit(sf, undefined, undefined, true);
      if (result.emitSkipped && result.diagnostics.length > 0) {
        const message = result.diagnostics.map((d) => ts.flattenDiagnosticMessageText(d.messageText, "\n")).join("\n");
        throw new Error(`Failed to emit declarations for ${sf.fileName}:\n${message}`);
      }
    }
  }

  const declarations = {
    "water-presets": generateWaterPresetDts()
  };
  for (const name of Object.keys(ENTRY_SPECS)) {
    declarations[name] = bundleEntryDts(name, join(outDir, `${name}.d.ts`), emitted);
  }

  // Guard every emitted .d.mts file before writing to disk.
  for (const [name, dts] of Object.entries(declarations)) {
    if (/from\s+["']\.\.?\//.test(dts) || /import\(\s*["']\.\.?\//.test(dts)) {
      throw new Error(`Guard failed: ${name}.d.mts must not contain relative imports.`);
    }
    if (dts.includes("packages/water/src")) {
      throw new Error(`Guard failed: ${name}.d.mts must not reference packages/water/src.`);
    }
    const externalSpecs = [...dts.matchAll(/\bfrom\s+["']([^"']+)["']/g)].map((m) => m[1]);
    if (name === "water-builtin-shaders" || name === "water-presets") {
      if (externalSpecs.length > 0) {
        throw new Error(`Guard failed: ${name}.d.mts must have zero external imports (found: ${externalSpecs.join(", ")}).`);
      }
    } else {
      for (const spec of externalSpecs) {
        if (!ALLOWED_EXTERNAL_NATIVE.test(spec)) {
          throw new Error(`Guard failed: ${name}.d.mts has disallowed external import '${spec}'.`);
        }
      }
    }
  }

  return declarations;
}

const isWatch = process.argv.includes("--watch");

const waterBuildPlugin = {
  name: "water-package-build",
  setup(api) {
    // Virtual entry points so we keep zero generated source files in packages/water/src.
    api.onResolve({ filter: /^water-entry:/ }, ({ path: spec }) => ({
      path: spec.slice("water-entry:".length),
      namespace: "water-virtual-entry"
    }));
    api.onLoad({ filter: /.*/, namespace: "water-virtual-entry" }, ({ path: entryName }) => ({
      contents: renderEntrySource(ENTRY_SPECS[entryName]),
      loader: "ts",
      resolveDir: waterSrcDir
    }));

    // Replace WaterBuiltinAssets.ts cleanly for packaged builds without touching Engine demos.
    api.onLoad({ filter: /WaterBuiltinAssets\.ts$/ }, ({ path: filePath }) => {
      if (resolve(filePath) !== BUILTIN_ASSETS_PATH) return;
      return {
        contents: createPackagedWaterBuiltinAssetsModule(),
        loader: "js",
        resolveDir: dirname(filePath),
        watchFiles: [filePath]
      };
    });

    // Replace Worker factory modules with self-contained inline Blob-URL workers.
    const builtWorkers = new Set();
    api.onStart(() => {
      builtWorkers.clear();
    });
    api.onLoad({ filter: /(HeightfieldWaterCompileWorkerFactory|RiverCompileWorkerFactory)\.ts$/ }, async ({ path: filePath }) => {
      const resolvedPath = resolve(filePath);
      const workerSpec = WORKER_FACTORIES.get(resolvedPath);
      if (!workerSpec) return;
      builtWorkers.add(resolvedPath);
      const { contents, watchFiles } = await bundleInlineWorker(workerSpec.workerEntry, workerSpec.exportName);
      return {
        contents,
        loader: "js",
        resolveDir: dirname(filePath),
        watchFiles: [filePath, ...watchFiles]
      };
    });

    api.onEnd(async (result) => {
      if (result.errors.length > 0) return;
      try {
        // Ensure every declared Water compile worker remains 100% self-contained even if tree-shaken by an entry.
        for (const [factoryPath, workerSpec] of WORKER_FACTORIES.entries()) {
          if (!builtWorkers.has(factoryPath)) {
            await bundleInlineWorker(workerSpec.workerEntry, workerSpec.exportName);
          }
        }
        const jsOutputs = {};
        const metaOutputs = new Map();
        for (const outputFile of result.outputFiles ?? []) {
          const baseName = outputFile.path.slice(outDir.length + 1);
          if (baseName.endsWith(".js")) {
            jsOutputs[baseName.slice(0, -3)] = outputFile.text;
          }
        }
        for (const [relPath, meta] of Object.entries(result.metafile?.outputs ?? {})) {
          const absPath = resolve(rootDir, relPath);
          if (absPath.startsWith(outDir + "/")) {
            metaOutputs.set(absPath.slice(outDir.length + 1), meta);
          }
        }

        jsOutputs["water-presets"] = await buildAndValidatePresets();
        assertJsGuards(jsOutputs, metaOutputs);
        const dtsOutputs = generateAllDeclarations();

        await mkdir(outDir, { recursive: true });
        for (const [name, code] of Object.entries(jsOutputs)) {
          await writeFile(join(outDir, `${name}.js`), code, "utf8");
        }
        for (const [name, dts] of Object.entries(dtsOutputs)) {
          await writeFile(join(outDir, `${name}.d.mts`), dts, "utf8");
        }
        console.log(
          `[water:build] Built ${Object.keys(jsOutputs).length} entries into packages/water/dist/ (${Object.keys(jsOutputs).join(", ")})`
        );
      } catch (error) {
        console.error("[water:build] Failed:", error);
        if (!isWatch) throw error;
      }
    });
  }
};

const buildOptions = {
  absWorkingDir: rootDir,
  entryPoints: {
    "water-builtin-shaders": "water-entry:water-builtin-shaders",
    "water-authoring": "water-entry:water-authoring",
    "water-runtime": "water-entry:water-runtime"
  },
  outdir: outDir,
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
  write: false,
  metafile: true,
  minifyWhitespace: true,
  legalComments: "none",
  loader: { ".glsl": "text", ".shader": "text", ".shaderc": "text", ".base64": "text" },
  plugins: [createResolutionPlugin({ selfContained: false }), waterBuildPlugin]
};

if (isWatch) {
  const compiler = await context(buildOptions);
  await compiler.watch();
  console.log("[water:watch] Watching Water sources...");
} else {
  await rm(outDir, { recursive: true, force: true });
  await build(buildOptions);
}
