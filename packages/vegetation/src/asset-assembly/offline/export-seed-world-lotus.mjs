import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const demoDirectory = resolve(scriptDirectory, "..");
const defaultSourceProject = resolve(scriptDirectory, "../../../../../../../Grasslands-Stylized-Nature-Viewer");
const defaultUnityEditor = "/Applications/Unity/Hub/Editor/2021.3.45f1/Unity.app/Contents/MacOS/Unity";
const defaultBlender = "/Applications/Blender.app/Contents/MacOS/Blender";
const sourceProject = resolve(
  readArgument("--source-project") ?? process.env.SEED_WORLD_LOTUS_UNITY_PROJECT ?? defaultSourceProject
);
const unityEditor = resolve(readArgument("--unity-editor") ?? process.env.UNITY_EDITOR_PATH ?? defaultUnityEditor);
const blender = resolve(readArgument("--blender") ?? process.env.BLENDER_PATH ?? defaultBlender);
const blenderOptimizer = join(scriptDirectory, "blender/optimize-seed-world-lotus.py");
const outputDirectory = resolve(
  readArgument("--output") ?? resolve(dirname(fileURLToPath(import.meta.resolve("@galacean/engine-terrain/data/seed-world/project.json"))), "source/grasslands-stylized-nature-lotus")
);
const sourcePackageRoot = join(sourceProject, "Assets/Raygeas/Grasslands - Stylized Nature/Assets");
const terminalScreenRelativeHeightByVariant = Object.freeze({
  lotus: 0.0881426733642406,
  "lotus-group-1": 0.07563221273170065,
  "lotus-group-2": 0.07563220758488405
});
const sourceAssets = Object.freeze({
  models: ["Lotus.fbx", "Lotus_Group_1.fbx", "Lotus_Group_2.fbx"].map((fileName) =>
    join(sourcePackageRoot, "Models/Vegetation", fileName)
  ),
  prefabs: ["Lotus.prefab", "Lotus_Group_1.prefab", "Lotus_Group_2.prefab"].map((fileName) =>
    join(sourcePackageRoot, "Prefabs/Vegetation", fileName)
  ),
  textures: ["Lotus_Albedo.png", "Lotus_Normal.png"].map((fileName) =>
    join(sourcePackageRoot, "Textures/Vegetation", fileName)
  )
});

const temporaryProject = await mkdtemp(join(tmpdir(), "seed-world-lotus-export-"));
const temporaryExport = join(temporaryProject, "Export");
try {
  await prepareTemporaryUnityProject(temporaryProject);
  await runUnityExporter(temporaryProject, temporaryExport);
  const unityMetadata = JSON.parse(await readFile(join(temporaryExport, "unity-export.json"), "utf8"));
  await optimizeLotusModels(unityMetadata, temporaryExport);
  validateUnityMetadata(unityMetadata);
  await publishSourceClosure(unityMetadata, temporaryExport);
  process.stdout.write(`Exported ${unityMetadata.variants.length} licensed lotus variants to ${outputDirectory}\n`);
} finally {
  await rm(temporaryProject, { recursive: true, force: true });
}

async function prepareTemporaryUnityProject(projectDirectory) {
  await Promise.all([
    mkdir(join(projectDirectory, "Assets/Editor"), { recursive: true }),
    mkdir(join(projectDirectory, "Assets/LotusSource/Models/Vegetation"), { recursive: true }),
    mkdir(join(projectDirectory, "Assets/LotusSource/Prefabs/Vegetation"), { recursive: true }),
    mkdir(join(projectDirectory, "Packages"), { recursive: true }),
    mkdir(join(projectDirectory, "ProjectSettings"), { recursive: true })
  ]);
  await Promise.all([
    cp(
      join(scriptDirectory, "unity/SeedWorldLotusGlbExporter.cs"),
      join(projectDirectory, "Assets/Editor/SeedWorldLotusGlbExporter.cs")
    ),
    writeFile(join(projectDirectory, "Packages/manifest.json"), `${JSON.stringify({ dependencies: {} }, null, 2)}\n`),
    writeFile(
      join(projectDirectory, "ProjectSettings/ProjectVersion.txt"),
      "m_EditorVersion: 2021.3.45f1\nm_EditorVersionWithRevision: 2021.3.45f1\n"
    )
  ]);
  for (const source of sourceAssets.models) {
    await copyAssetWithMeta(source, join(projectDirectory, "Assets/LotusSource/Models/Vegetation", basename(source)));
  }
  for (const source of sourceAssets.prefabs) {
    await copyAssetWithMeta(source, join(projectDirectory, "Assets/LotusSource/Prefabs/Vegetation", basename(source)));
  }
}

async function copyAssetWithMeta(source, destination) {
  await Promise.all([cp(source, destination), cp(`${source}.meta`, `${destination}.meta`)]);
}

async function runUnityExporter(projectDirectory, exportDirectory) {
  await mkdir(exportDirectory, { recursive: true });
  const logPath = join(projectDirectory, "lotus-export.log");
  const arguments_ = [
    "-batchmode",
    "-nographics",
    "-projectPath",
    projectDirectory,
    "-executeMethod",
    "SeedWorldLotusGlbExporter.Export",
    "-lotusOutputPath",
    exportDirectory,
    "-logFile",
    logPath
  ];
  const exitCode = await new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(unityEditor, arguments_, { stdio: "inherit" });
    child.once("error", rejectPromise);
    child.once("exit", (code, signal) => {
      if (signal) rejectPromise(new Error(`Unity lotus exporter terminated by ${signal}`));
      else resolvePromise(code ?? 1);
    });
  });
  if (exitCode !== 0) {
    const log = await readFile(logPath, "utf8").catch(() => "Unity did not produce an Editor log.");
    throw new Error(`Unity lotus exporter failed with exit code ${exitCode}:\n${log.slice(-12_000)}`);
  }
}

async function optimizeLotusModels(unityMetadata, exportDirectory) {
  for (const variant of unityMetadata.variants) {
    for (let lodIndex = 0; lodIndex < variant.lods.length; lodIndex++) {
      const lod = variant.lods[lodIndex];
      const modelPath = join(exportDirectory, lod.fileName);
      const sourceVertices = lod.vertices;
      const sourceTriangles = lod.triangles;
      const reduceFlowers = variant.id === "lotus-group-2" && lodIndex === 1;
      if (!reduceFlowers) continue;
      const arguments_ = [
        "--background",
        "--factory-startup",
        "--python",
        blenderOptimizer,
        "--",
        "--input",
        modelPath,
        "--output",
        modelPath,
        "--flower-petal-stride",
        "2"
      ];
      const exitCode = await new Promise((resolvePromise, rejectPromise) => {
        const child = spawn(blender, arguments_, { stdio: "inherit" });
        child.once("error", rejectPromise);
        child.once("exit", (code, signal) => {
          if (signal) rejectPromise(new Error(`Blender lotus optimizer terminated by ${signal}`));
          else resolvePromise(code ?? 1);
        });
      });
      if (exitCode !== 0) throw new Error(`Blender lotus optimizer failed with exit code ${exitCode}`);
      Object.assign(lod, inspectLotusGlb(await readFile(modelPath)), {
        optimization: {
          tool: "Blender CLI",
          sourceVertices,
          sourceTriangles,
          methods: [
            {
              method: "intact-petal-stride",
              flowerHeads: 4,
              sourcePetalsPerHead: 24,
              keptPetalsPerHead: 12
            }
          ]
        }
      });
    }
  }
}

function inspectLotusGlb(buffer) {
  if (buffer.toString("ascii", 0, 4) !== "glTF") throw new Error("Blender lotus optimizer returned invalid GLB");
  const jsonLength = buffer.readUInt32LE(12);
  const document = JSON.parse(buffer.toString("utf8", 20, 20 + jsonLength).trim());
  const primitives = document.meshes?.[0]?.primitives;
  if (!Array.isArray(primitives) || primitives.length === 0) {
    throw new Error("Blender lotus optimizer returned no mesh primitives");
  }
  const positionAccessors = new Set();
  let triangles = 0;
  const minimum = [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY];
  const maximum = [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY];
  for (const primitive of primitives) {
    const positionAccessorIndex = primitive.attributes?.POSITION;
    const indexAccessor = document.accessors?.[primitive.indices];
    const positionAccessor = document.accessors?.[positionAccessorIndex];
    if (
      (primitive.mode !== undefined && primitive.mode !== 4) ||
      !indexAccessor ||
      indexAccessor.count % 3 !== 0 ||
      !positionAccessor ||
      !Array.isArray(positionAccessor.min) ||
      !Array.isArray(positionAccessor.max)
    ) {
      throw new Error("Blender lotus optimizer returned invalid indexed triangle geometry");
    }
    positionAccessors.add(positionAccessorIndex);
    triangles += indexAccessor.count / 3;
    for (let axis = 0; axis < 3; axis++) {
      minimum[axis] = Math.min(minimum[axis], positionAccessor.min[axis]);
      maximum[axis] = Math.max(maximum[axis], positionAccessor.max[axis]);
    }
  }
  return {
    vertices: [...positionAccessors].reduce((sum, accessorIndex) => sum + document.accessors[accessorIndex].count, 0),
    triangles,
    primitiveCount: primitives.length,
    bounds: { minimum, maximum }
  };
}

async function publishSourceClosure(unityMetadata, temporaryExportDirectory) {
  const modelsDirectory = join(outputDirectory, "models");
  const texturesDirectory = join(outputDirectory, "textures");
  await Promise.all([mkdir(modelsDirectory, { recursive: true }), mkdir(texturesDirectory, { recursive: true })]);
  for (const variant of unityMetadata.variants) {
    for (const lod of variant.lods) {
      await cp(join(temporaryExportDirectory, lod.fileName), join(modelsDirectory, lod.fileName));
    }
  }
  for (const texture of sourceAssets.textures) {
    await cp(texture, join(texturesDirectory, basename(texture).toLowerCase().replace("lotus_", "lotus-")));
  }
  const hashedSources = await Promise.all(
    [...sourceAssets.models, ...sourceAssets.prefabs, ...sourceAssets.textures].map(async (path) => ({
      path: path.slice(sourceProject.length + 1),
      sha256: await sha256File(path)
    }))
  );
  const sourcePackageSha256 = sha256Text(hashedSources.map(({ path, sha256 }) => `${path}\0${sha256}`).join("\n"));
  const catalog = {
    version: 1,
    sourcePackageSha256,
    licenseEvidence: {
      package: "Grasslands - Stylized Nature",
      publisher: "Raygeas",
      source: "Unity Asset Store purchase",
      writtenAuthorization: true,
      authorizationScope:
        "Reuse of the purchased lotus meshes, textures, and translated material semantics in Seed World",
      evidenceLocation: "Private written authorization retained by the asset owner; not committed to this repository",
      assertedByAssetOwnerOn: "2026-08-28"
    },
    sourceFiles: hashedSources,
    textures: {
      albedo: { fileName: "lotus-albedo.png", colorSpace: "sRGB", alphaMode: "MASK" },
      normal: { fileName: "lotus-normal.png", colorSpace: "linear", normalEncoding: "Unity tangent-space" }
    },
    materials: {
      leaf: {
        unityMaterialGuid: "06faa6b01cd8cad40b2e5412a7e62792",
        alphaCutoff: 0.4,
        smoothness: 0.6,
        normalScale: 1,
        windForce: 0.07,
        windWavesScale: 0.15,
        mainColorSrgb: [0.33599997, 0.546, 0.18899998],
        secondColorSrgb: [0.8679245, 0.80137265, 0]
      },
      flower: {
        unityMaterialGuid: "c9f8e665fb68adb419db423d55753d5c",
        alphaCutoff: 0.5,
        smoothness: 0.4,
        normalScale: 0.7,
        windForce: 0.07,
        windWavesScale: 0.15,
        mainColorSrgb: [0.7921569, 0.2923059, 0.36250973],
        secondColorSrgb: [1, 0.5896226, 0.6960168]
      }
    },
    variants: unityMetadata.variants.map((variant) => {
      const { prefabPath: _temporaryPrefabPath, ...publishedVariant } = variant;
      return {
        ...publishedVariant,
        sourcePrefabPath: originalPrefabPath(variant.id),
        placement: {
          axis: "glTF-y-up",
          pivot: "Unity Prefab root at canonical water surface",
          nodeTransform: "baked renderer-to-prefab-root"
        },
        lods: variant.lods.map((lod, lodIndex) => ({
          ...lod,
          screenRelativeHeight:
            lodIndex === 0 ? lod.screenRelativeHeight : terminalScreenRelativeHeightByVariant[variant.id],
          castShadows: true,
          sha256: null
        }))
      };
    })
  };
  for (const variant of catalog.variants) {
    for (const lod of variant.lods) lod.sha256 = await sha256File(join(modelsDirectory, lod.fileName));
  }
  await writeFile(join(outputDirectory, "catalog.json"), `${JSON.stringify(catalog, null, 2)}\n`);
}

function originalPrefabPath(id) {
  const fileName =
    id === "lotus" ? "Lotus.prefab" : id === "lotus-group-1" ? "Lotus_Group_1.prefab" : "Lotus_Group_2.prefab";
  return `Assets/Raygeas/Grasslands - Stylized Nature/Assets/Prefabs/Vegetation/${fileName}`;
}

function validateUnityMetadata(value) {
  if (
    value?.schemaVersion !== 1 ||
    !Array.isArray(value.variants) ||
    value.variants.length !== 3 ||
    value.variants.some(
      (variant) =>
        !Array.isArray(variant.localReferencePoint) ||
        variant.localReferencePoint.length !== 3 ||
        !Number.isFinite(variant.size) ||
        variant.size <= 0 ||
        !Array.isArray(variant.lods) ||
        variant.lods.length !== 2 ||
        variant.lods.some(
          (lod, index) =>
            typeof lod.fileName !== "string" ||
            !Number.isFinite(lod.screenRelativeHeight) ||
            lod.screenRelativeHeight < 0 ||
            lod.screenRelativeHeight > 1 ||
            (index > 0 && lod.screenRelativeHeight >= variant.lods[index - 1].screenRelativeHeight) ||
            !Number.isInteger(lod.vertices) ||
            lod.vertices <= 0 ||
            !Number.isInteger(lod.triangles) ||
            lod.triangles <= 0 ||
            !Number.isInteger(lod.primitiveCount) ||
            lod.primitiveCount <= 0
        )
    )
  ) {
    throw new Error("Unity lotus exporter returned an invalid metadata contract");
  }
}

async function sha256File(path) {
  return createHash("sha256")
    .update(await readFile(path))
    .digest("hex");
}

function sha256Text(value) {
  return createHash("sha256").update(value).digest("hex");
}

function readArgument(name) {
  const index = process.argv.indexOf(name);
  if (index < 0) return undefined;
  const value = process.argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`Missing value for ${name}`);
  return value;
}
