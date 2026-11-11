import fs from "node:fs";
import path from "node:path";
import { ShaderLanguage } from "@galacean/engine-core";
import { shaderLibrary } from "@galacean/engine-shader";
import { ShaderCompiler } from "@galacean/engine-shader-compiler";
import { describe, expect, it } from "vitest";

const featureRuntimePath = path.resolve(
  __dirname,
  "../../../packages/world-planning/src/runtime/SeedWorldRockRuntime.ts"
);
const grassMaterialPath = path.resolve(
  __dirname,
  "../../../packages/terrain/src/data/seed-world/public/materials/clif-1-grass.mat"
);
const rockMaterialPaths = [
  "stylized-rock-grass.mat",
  "stylized-rock.mat",
  "stylized-rock-mud.mat",
  "clif-1-grass.mat",
  "clif-1.mat",
  "clif-1-mud.mat",
  "stylized-stone.mat"
].map((name) => path.resolve(__dirname, `../../../packages/terrain/src/data/seed-world/public/materials/${name}`));
const featureMaterialPaths = [
  path.resolve(__dirname, "../../../packages/terrain/src/data/seed-world/public/materials/stylized-rock.mat"),
  path.resolve(__dirname, "../../../packages/terrain/src/data/seed-world/public/materials/clif-1.mat")
];

const runtime = fs.readFileSync(
  path.resolve(__dirname, "../../../packages/world-planning/src/runtime/SeedWorldRockAssemblyRuntime.ts"),
  "utf8"
);
const shader = fs.readFileSync(
  path.resolve(__dirname, "../../../packages/terrain/src/world/SeedWorldRockToon.shader"),
  "utf8"
);
const shaderRegistration = fs.readFileSync(
  path.resolve(__dirname, "../../../packages/terrain/src/world/SeedWorldRockToonShader.ts"),
  "utf8"
);
const sharedShadow = fs.readFileSync(
  path.resolve(__dirname, "../../../packages/terrain/src/shaders/shared/Shadow.glsl"),
  "utf8"
);
const panel = fs.readFileSync(
  path.resolve(__dirname, "../../../world/demos/seed-world/src/SeedWorldRockMaterialPanel.ts"),
  "utf8"
);
const population = fs.readFileSync(
  path.resolve(__dirname, "../../../packages/world-planning/src/runtime/SeedWorldPopulationRuntime.ts"),
  "utf8"
);
const surfaceGrassSampler = fs.readFileSync(
  path.resolve(__dirname, "../../../packages/world-planning/src/runtime/SeedWorldRockSurfaceGrass.ts"),
  "utf8"
);
const smallRockRuntime = fs.readFileSync(
  path.resolve(__dirname, "../../../packages/world-planning/src/runtime/SeedWorldSmallRockRuntime.ts"),
  "utf8"
);
const main = fs.readFileSync(path.resolve(__dirname, "../../../world/demos/seed-world/main.ts"), "utf8");
const seedDemo = fs.readFileSync(path.resolve(__dirname, "../../../world/demos/seed-world/SeedWorldDemo.ts"), "utf8");
const debug = fs.readFileSync(
  path.resolve(__dirname, "../../../world/demos/seed-world/src/planning/spatial/runtime/PlanningSeedRuntimeDebug.ts"),
  "utf8"
);
const formationPanel = fs.readFileSync(
  path.resolve(__dirname, "../../../packages/world-planning/src/integrations/terrain/rock-formation/Panel.ts"),
  "utf8"
);
const grassShader = fs.readFileSync(
  path.resolve(__dirname, "../../../packages/terrain/src/shaders/grass/GrassForwardPass.glsl"),
  "utf8"
);
const coverageFragment = fs.readFileSync(
  path.resolve(__dirname, "../../../packages/terrain/src/shaders/shared/SurfaceGrassCoverage.glsl"),
  "utf8"
);
const attachmentFragment = fs.readFileSync(
  path.resolve(__dirname, "../../../packages/terrain/src/shaders/shared/SurfaceGrassAttachment.glsl"),
  "utf8"
);
const toonLightingFragment = fs.readFileSync(
  path.resolve(__dirname, "../../../packages/terrain/src/shaders/shared/ToonDiffuseLighting.glsl"),
  "utf8"
);
const grassAppearanceFragment = fs.readFileSync(
  path.resolve(__dirname, "../../../packages/terrain/src/shaders/shared/GrassGroundAppearance.glsl"),
  "utf8"
);
const proceduralLodDitherFragment = fs.readFileSync(
  path.resolve(__dirname, "../../../packages/terrain/src/shaders/shared/ProceduralLodDither.glsl"),
  "utf8"
);

interface SerializedMaterial {
  readonly shaderData: Readonly<Record<string, { readonly value: unknown }>>;
  readonly macros: readonly { readonly name: string }[];
}

interface ShaderPrecompiler {
  _setIncludeMap(includeMap: Record<string, string>): void;
  _precompile(source: string, language: ShaderLanguage, basePath: string): unknown;
}

describe("Authored Clif asset material", () => {
  it("reserves coverage-enabled rock families for mountain assemblies", () => {
    const featureRuntime = fs.readFileSync(featureRuntimePath, "utf8");

    expect(featureRuntime).toContain("sourceLibrary.featureRockFamily");
    expect(featureRuntime).not.toContain("sourceLibrary.largeRockSurfaceFamilies");
  });

  it("reuses the preloaded Clif-1 catalog instead of maintaining a second runtime loader", () => {
    expect(runtime).toContain("sourceLibrary.largeRockSurfaceFamilies.grass?.variants");
    expect(runtime).toContain('candidate.id.includes("/rock-clif-1/")');
    expect(runtime).toContain("source.lods[0]!.prefab.instantiate()");
    expect(runtime).not.toContain("AssetType.GLTF");
    expect(runtime).not.toContain("resourceManager.load");
    expect(runtime).not.toContain("rock-clif-2");
    expect(runtime).not.toContain("rock-clif-3");
  });

  it("keeps Clif-1 top coverage authored in the generated material", () => {
    const material = JSON.parse(fs.readFileSync(grassMaterialPath, "utf8")) as SerializedMaterial;
    const macros = material.macros.map((macro) => macro.name);

    expect(material.shaderData).not.toHaveProperty("material_BaseTexture");
    expect(material.shaderData.material_CoverageBaseTexture.value).toMatchObject({
      url: "AssetAssembly/Cartoon/Textures/terrain-grass-2.png"
    });
    expect(material.shaderData.material_CoverageTiling.value).toBe(0.5);
    expect(material.shaderData.material_CoverageBalance.value).toBe(-2);
    expect(material.shaderData.material_CoverageOffset.value).toBe(1.2);
    expect(material.shaderData.material_CoverageNormalScale.value).toBe(0);
    expect(macros).toContain("MATERIAL_ENABLE_COVERAGE");
    expect(macros).toContain("MATERIAL_COVERAGE_USE_LOCAL_NORMAL");
    expect(macros).not.toContain("MATERIAL_HAS_NORMALTEXTURE");
  });

  it("binds no base or normal textures in any rock material", () => {
    for (const materialPath of rockMaterialPaths) {
      const material = JSON.parse(fs.readFileSync(materialPath, "utf8")) as SerializedMaterial;
      const macros = material.macros.map((macro) => macro.name);

      expect(material.shaderData, materialPath).not.toHaveProperty("material_BaseTexture");
      expect(material.shaderData, materialPath).not.toHaveProperty("material_NormalTexture");
      expect(material.shaderData, materialPath).not.toHaveProperty("material_CoverageNormalTexture");
      expect(macros, materialPath).not.toContain("MATERIAL_HAS_BASETEXTURE");
      expect(macros, materialPath).not.toContain("MATERIAL_HAS_NORMALTEXTURE");
    }
  });

  it("authors every non-mountain parent-rock material without top coverage", () => {
    for (const materialPath of featureMaterialPaths) {
      const material = JSON.parse(fs.readFileSync(materialPath, "utf8")) as SerializedMaterial;
      expect(material.macros.map((macro) => macro.name)).not.toContain("MATERIAL_ENABLE_COVERAGE");
      expect(material.shaderData).not.toHaveProperty("material_CoverageBaseTexture");
    }
  });
});

describe("Authored texture-free cartoon Clif material", () => {
  it("keeps the authored assembly material self-contained while Seed uses its procedural path", () => {
    expect(runtime).toContain("const shader = registerSeedWorldRockToonShader()");
    expect(shaderRegistration).toContain(
      "Shader.find(SEED_WORLD_ROCK_TOON_SHADER_NAME) ?? Shader.create(toonRockShaderSource)"
    );
    expect(main).not.toContain("registerSeedWorldRockToonShader");
    expect(runtime).toContain('material: createToonRockMaterial(engine, shader, "rock-clif-1")');
    expect(runtime).toContain("renderer.setMaterial(material)");
    expect(runtime).toContain("renderer.castShadows = true");
    expect(runtime).toContain("renderer.receiveShadows = true");
    expect(runtime).toContain("rockTexturesLoaded: false");
    expect(runtime).not.toMatch(/Texture2D|AssetType\.(KTX2|Texture)|\.ktx2|\.png|cliffTextureUrl|loadTexture/);
    expect(runtime).not.toMatch(/"original"|no-base-texture|setMaterialMode|surfaceTemplateMaterial/);
    expect(`${main}\n${seedDemo}`).not.toContain("instantiateSeedWorldRockAssemblies");
    expect(seedDemo).toContain("new RockFormationClient(");
    expect(seedDemo).toContain("await rockFormations.prepare(");
    expect(seedDemo).toContain("await prepareRockTextures(");
    expect(seedDemo).toContain("await createPlanningSeedSolids(");
  });

  it("binds authored-asset stones to toon while gating mountain Clif terrain work", () => {
    expect(runtime).toContain("bindSeedWorldRockToonMaterial(engine, instance, true)");
    expect(fs.readFileSync(featureRuntimePath, "utf8")).toContain(
      "bindSeedWorldRockToonMaterial(engine, entity, false)"
    );
    expect(smallRockRuntime).toContain("bindSeedWorldRockToonMaterial(engine, entity, false)");
    expect(runtime).toContain("renderer.shaderData.enableMacro(SURFACE_GRASS_COVERAGE_MACRO)");
    expect(runtime).toContain("renderer.shaderData.disableMacro(SURFACE_GRASS_COVERAGE_MACRO)");
    expect(population).toContain("renderer.shaderData.enableMacro(SURFACE_GRASS_ATTACHMENT_MACRO)");
  });

  it("keeps authored toon rock faces texture-free with shared shadows and fog", () => {
    expect(shader).toContain('Shader "Terrain/SeedWorldRockToon"');
    expect(shader).toContain('Pass "ShadowCaster"');
    expect(shader).toContain("terrainProjectShadowClipPosition(applyTerrainProjectShadowBias(positionWS, normalWS))");
    expect(shader).toContain("sampleTerrainProjectShadow(varyings)");
    expect(toonLightingFragment).toContain("terrainProjectToonEnvironmentDiffuse");
    expect(toonLightingFragment).toContain("directDiffuse += lightColor * diffuse");
    expect(toonLightingFragment).toContain("result.directDiffuse = directDiffuse");
    expect(toonLightingFragment).toContain("result.environmentDiffuse = terrainProjectToonEnvironmentDiffuse(normal)");
    expect(toonLightingFragment).toContain("lighting.directDiffuse + lighting.environmentDiffuse");
    expect(toonLightingFragment).toContain("scene_EnvMapLight.diffuseIntensity");
    expect(toonLightingFragment).not.toMatch(/availableLight\s*\/|smoothstep\(0\.0, 0\.08, result\.energy\)/);
    expect(shader).toContain("color = fog(color, varyings.positionVS)");
    expect(shader).toContain("terrainProjectApplyToonDiffusePalette(");
    expect(`${shader}\n${runtime}\n${panel}`).not.toMatch(/shadow.?block|阴影色块|色块尺寸/i);
    expect(shader).toContain('#ifdef RENDERER_SURFACE_GRASS_COVERAGE\n        #include "shared/Lighting.glsl"');
    expect(shader).toContain("terrainProjectFinalLighting(");
    expect(shader).not.toMatch(/\b(?:sampler2D|samplerCube)\s+material_/);
    expect(shader).not.toMatch(/\bmaterial_\w*(?:Texture|Sampler)\b/);
    expect(runtime).toContain("0.46207699965440707");
    expect(runtime).toContain("0.4793201831008268, 0.6172065624196511, 0.5394794890121072");
    expect(runtime).toContain("0.7835377915261935, 0.6795424696330938, 0.5394794890121072");
    expect(runtime).toContain("shadowStep: 0.31");
    expect(runtime).toContain("highlightStep: 0.43");
    expect(runtime).toContain("bandFeatherEnabled: true");
    expect(runtime).toContain("feather: 0.25");
    expect(runtime).toContain("toonBandsEnabled: true");
    expect(runtime).toContain("toonBandStrength: 1");
    expect(runtime).toContain("lightScale: 1");
  });

  it("receives Scene-owned cloud shadows through the shared direct-shadow contract", () => {
    expect(sharedShadow).toContain('#include "ShaderLibrary/Lighting/VolumetricCloudShadow.glsl"');
    expect(sharedShadow).toContain("return attenuation * sampleVolumetricCloudShadow(varyings.positionWS);");
    expect(shader).toContain("float shadowAttenuation = sampleTerrainProjectShadow(varyings);");
    expect(shader).not.toContain("sampleVolumetricCloudShadow(");
    expect(runtime).not.toContain("ShaderFactory");
  });

  it("keeps surface grass as two macro-gated reusable GLSL fragments without new resource requests", () => {
    expect(shader).toContain('#include "shared/SurfaceGrassCoverage.glsl"');
    expect(grassShader).toContain('#include "shared/SurfaceGrassAttachment.glsl"');
    expect(coverageFragment).toContain("#ifdef RENDERER_SURFACE_GRASS_COVERAGE");
    expect(attachmentFragment).toContain(
      "#if defined(RENDERER_SURFACE_GRASS_ATTACHMENT) && defined(RENDERER_SEED_WORLD_DETAIL_COMPACT)"
    );
    expect(coverageFragment).toContain('#include "shared/GrassColorField.glsl"');
    expect(coverageFragment).not.toContain("terrain/TerrainHeight.glsl");
    expect(grassShader).not.toContain('#include "shared/SurfaceGrassCoverage.glsl"');
    expect(coverageFragment).not.toMatch(/\bcontact\b|SurfaceGrassContactWidth|terrainProjectSurfaceGrassGroundAt/);
    expect(coverageFragment).toContain("if (normalWS.y < minimumSlope) return result;");
    expect(coverageFragment).toContain("float coverageStart = min(minimumSlope + transitionOffset");
    expect(coverageFragment).toContain("result.coverage = smoothstep(");
    expect(shader).not.toMatch(/surfaceGrassGround|TerrainProjectSurfaceGrassGroundReference/);
    expect(shader).toContain("terrainProjectBuildGrassGroundSurface(");
    expect(shader).toMatch(/surfaceNormalWS,\s+surfaceNormalWS,/);
    // Colour-field endpoints are already seasonal: the substrate must not apply the season twice.
    expect(grassAppearanceFragment).not.toContain("terrainProjectTerrainGrassSeasonColor(");
    expect(grassAppearanceFragment).toMatch(/mix\(\s*nearLinearColor,\s*farLinearColor,/);
    expect(grassAppearanceFragment).toContain("terrainProjectApplySurfaceClimate(");
    expect(grassShader).not.toContain("attachedRootColor");
    expect(grassShader).not.toContain("terrainProjectEvaluateSurfaceGrassLighting");
    expect(population).not.toContain("applyRockSurfaceGrassLighting");
    expect(population).not.toContain("RENDERER_SURFACE_GRASS_LIGHT_SCALE");
    expect(runtime).not.toContain("cloneToonStyle(toonStyle)\n      );");
    expect(runtime).not.toMatch(
      /material_Terrain(?:Height|Normal)Atlas|material_TerrainRegion|MATERIAL_TERRAIN_SINGLE_REGION/
    );
    expect(population).toContain("if (!geometryChanged && !treeCandidatesChanged)");
    expect(runtime).toContain("for (const material of toonMaterials) applyToonStyleToMaterial(material, toonStyle);");
    expect(`${coverageFragment}\n${attachmentFragment}\n${population}`).not.toMatch(
      /resourceManager\.load|AssetType\.(?:KTX2|Texture)|new Texture2D/
    );
    expect(population).toContain("createRockSurfaceGrassDensity(");
    expect(population).toContain("seedWorldTerrestrialGrassDensityMultiplier(");
    expect(population).toContain("_prepareRockSurfaceGrassWindow(cameraPosition)");
    expect(population).toContain("compiler.compilePatch(");
    expect(population).toContain("this._detailTransformPool");
    expect(population).toContain("_rockSurfaceGrassBatchPool");
    expect(population).toContain("reuseRockSurfaceGrassBatch(");
    expect(surfaceGrassSampler).toContain("density.sampleDensityPerSquareMetre(positionX, positionZ)");
    expect(surfaceGrassSampler).toContain("const grassSweptRadiusMetres = readGrassSweptRadius(grassSource)");
    expect(surfaceGrassSampler).toContain("const acceptedRockTriangleCache = new WeakMap");
    expect(surfaceGrassSampler).toContain("cached.rotationX === rotationX");
    expect(surfaceGrassSampler).not.toContain("rotationQuaternion.join");
    expect(surfaceGrassSampler).not.toContain("[...localMatrix.elements].join");
    expect(surfaceGrassSampler).toContain("boundaryEdges: Object.freeze(");
    expect(surfaceGrassSampler).toContain(
      "surfacePointHasClearance(source.boundaryEdges, localX, localY, localZ, localClearance)"
    );
    expect(surfaceGrassSampler).toContain("const crossX = source.rotationY * vectorZ - source.rotationZ * vectorY");
    expect(surfaceGrassSampler).toContain("const patchesByX = new Map<number, Map<number, MutableSurfacePatch>>();");
    expect(surfaceGrassSampler).toContain("maximumCandidateCount");
    expect(surfaceGrassSampler).not.toContain("values: number[]");
    expect(surfaceGrassSampler).not.toContain("new Float32Array(patch.values)");
    expect(surfaceGrassSampler).not.toContain("const key = `${patchX}:${patchZ}`");
    expect(surfaceGrassSampler).not.toContain("interface SurfaceCandidate");
    expect(surfaceGrassSampler).not.toContain("const candidates: SurfaceCandidate[]");
    expect(surfaceGrassSampler).not.toContain("const local = sampleTriangle(");
    expect(surfaceGrassSampler).not.toContain("const scale = sampleGrassScale(");
    expect(surfaceGrassSampler).not.toContain("segmentsByCell");
    expect(surfaceGrassSampler).not.toContain("collectSurfaceBoundary");
    expect(surfaceGrassSampler).toContain("Math.hypot(local[0], local[1], local[2])");
    expect(surfaceGrassSampler).not.toContain("SeedWorldRockSurfaceGrassBounds");
    expect(surfaceGrassSampler).not.toContain("rockMayIntersectBounds");
    expect(surfaceGrassSampler).toContain("const triangleBoundsScratch = new Float64Array(9)");
    expect(surfaceGrassSampler).not.toContain("Math.hypot(...rock.obbSizeMetres)");
    expect(surfaceGrassSampler).not.toContain("BARYCENTRIC_INSET");
    expect(population).toMatch(/createSeedWorldRockSurfaceGrassCompiler\(\s*rockSource,\s*grassSource,/);
    expect(population).toContain("this._rockSurfaceGrassStyle.edgeInsetScale !== nextStyle.edgeInsetScale");
    expect(surfaceGrassSampler).not.toContain("const candidates = new Map");
    expect(surfaceGrassSampler).not.toContain("MAXIMUM_INSTANCES_PER_ROCK");
    expect(population).not.toContain("ROCK_SURFACE_GRASS_DENSITY_PER_SQUARE_METRE");
  });

  it("retains the authored toon panel and mounts procedural controls in the Seed Rock category", () => {
    expect(panel).toContain('host.folder("Rock Art / 岩石美术", true)');
    expect(panel).toContain('folder.addFolder("Wall Palette / 岩壁色阶")');
    expect(panel).toContain('folder.addFolder("Light Bands / 光照分级")');
    expect(panel).toContain('folder.addFolder("Top Grass / 岩顶草")');
    for (const key of [
      "shadowColor",
      "baseColor",
      "highlightColor",
      "shadowStep",
      "highlightStep",
      "bandFeatherEnabled",
      "feather",
      "topGrassToonBandsEnabled",
      "topGrassToonBandStrength",
      "topSlope",
      "topSoftness",
      "transitionIrregularity",
      "edgeInsetScale",
      "grassLightScale"
    ]) {
      expect(panel).toContain(`"${key}"`);
    }
    expect(panel).not.toMatch(/contactWidthMetres|Contact m|接地宽度/);
    expect(panel).not.toMatch(/setMode|materialMode|original|no-base-texture|cartoonIntensity|nightEnvironment/);
    expect(debug).toContain("new RockFormationPanel(session.inspector.rockFolderHost");
    expect(formationPanel).toContain('host.folder("Rock formation / 岩石形态", false)');
    expect(formationPanel).toContain('"Shared material / 共用材质"');
    expect(shader).toContain("material_SurfaceGrassLightScale");
    expect(runtime).toContain('setFloat("material_SurfaceGrassLightScale", style.lightScale)');
    expect(toonLightingFragment).toContain("#ifdef MATERIAL_TOON_BAND_FEATHER");
    expect(toonLightingFragment).toContain("return step(threshold, value)");
    expect(runtime).toContain("material.shaderData.disableMacro(TOON_BAND_FEATHER_MACRO)");
    expect(panel).toContain('name("Toon bands / 顶部色块")');
    expect(panel).toContain('name("Band strength / 色块强度")');
    expect(panel).toContain('name("Grass inset / 草区内缩")');
    expect(shader).toContain("#ifdef MATERIAL_ROCK_TOP_GRASS_TOON_BANDS");
    expect(shader).toContain("terrainProjectApplyToonLightBandsToLitColor(");
    expect(shader).toContain("material_SurfaceGrassToonBandStrength");
    expect(toonLightingFragment).toContain("#ifdef MATERIAL_ROCK_TOP_GRASS_TOON_BANDS");
    expect(toonLightingFragment).toContain("clamp(strength, 0.0, 1.0)");
    expect(runtime).toContain("material.shaderData.enableMacro(ROCK_TOP_GRASS_TOON_BANDS_MACRO)");
    expect(runtime).toContain("material.shaderData.disableMacro(ROCK_TOP_GRASS_TOON_BANDS_MACRO)");
    expect(runtime).toContain('setFloat("material_SurfaceGrassToonBandStrength", style.toonBandStrength)');
    expect(shader).not.toContain("material_RockDebugView");
    expect(shader).toContain("#ifdef MATERIAL_ROCK_DEBUG_VIEW");
    expect(panel).toContain("document.body.dataset.rockTexturesLoaded = String(diagnostics.rockTexturesLoaded)");
  });

  it("precompiles the toon shader and its WebGL2-only optional surface branches", () => {
    const compiler = new ShaderCompiler() as unknown as ShaderPrecompiler;
    compiler._setIncludeMap({
      ...Object.fromEntries(shaderLibrary.map(({ path, source }) => [path, source])),
      "SeedWorldRockToon/Shadow.glsl": sharedShadow,
      "shared/Shadow.glsl": sharedShadow,
      "shared/ToonDiffuseLighting.glsl": toonLightingFragment,
      "shared/SurfaceGrassCoverage.glsl": coverageFragment,
      "shared/ProceduralLodDither.glsl": proceduralLodDitherFragment,
      "shared/Lighting.glsl": fs.readFileSync(
        path.resolve(__dirname, "../../../packages/terrain/src/shaders/shared/Lighting.glsl"),
        "utf8"
      ),
      "shared/GrassGroundAppearance.glsl": grassAppearanceFragment,
      "shared/SceneSeason.glsl": fs.readFileSync(
        path.resolve(__dirname, "../../../packages/terrain/src/shaders/shared/SceneSeason.glsl"),
        "utf8"
      ),
      "shared/SurfaceClimate.glsl": fs.readFileSync(
        path.resolve(__dirname, "../../../packages/terrain/src/shaders/shared/SurfaceClimate.glsl"),
        "utf8"
      ),
      "shared/TerrainSurfaceData.glsl": fs.readFileSync(
        path.resolve(__dirname, "../../../packages/terrain/src/shaders/shared/TerrainSurfaceData.glsl"),
        "utf8"
      ),
      "shared/GrassColorField.glsl": fs.readFileSync(
        path.resolve(__dirname, "../../../packages/terrain/src/shaders/shared/GrassColorField.glsl"),
        "utf8"
      )
    });
    expect(() => compiler._precompile(shader, ShaderLanguage.GLSLES300, "")).not.toThrow();
  });
});
