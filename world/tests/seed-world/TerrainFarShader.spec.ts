import fs from "node:fs";
import { Shader } from "@galacean/engine";
import { ShaderCompiler } from "@galacean/engine-shader-compiler";
import { describe, expect, it } from "vitest";
import { ShaderMacroProcessor } from "../../../packages/core/src/shader/ShaderMacroProcessor";
import { HeadlessEngine } from "../../../packages/rhi-null/src/HeadlessEngine";
import { PLANNING_FARM_SOIL_SHADER } from "../../demos/seed-world/src/planning/spatial/farming/PlanningFarmSoilShader";

const terrain = JSON.parse(
  fs.readFileSync(
    new URL("../../../packages/terrain/src/data/seed-world/public/Shader/Terrain.shaderc", import.meta.url),
    "utf8"
  )
);
const forward = terrain.subShaders[0].passes.find((pass) => pass.name === "Forward");
const grass = JSON.parse(
  fs.readFileSync(
    new URL("../../../packages/terrain/src/data/seed-world/public/Shader/Grass.shaderc", import.meta.url),
    "utf8"
  )
);
const grassForward = grass.subShaders[0].passes.find((pass) => pass.name === "Forward");

describe("Terrain near/far production shader variants", () => {
  it.each(["Terrain", "Surface", "Vegetation", "Billboard"])("ships the engine point and spot falloff in %s", (name) => {
    const asset = JSON.parse(
      fs.readFileSync(
        new URL(`../../../packages/terrain/src/data/seed-world/public/Shader/${name}.shaderc`, import.meta.url),
        "utf8"
      )
    );
    const pass = asset.subShaders[0].passes.find((entry) => entry.name === "Forward");
    const macros = new Map([
      ["GRAPHICS_API_WEBGL2", ""],
      ["SCENE_POINT_LIGHT_COUNT", "1"],
      ["SCENE_SPOT_LIGHT_COUNT", "1"]
    ]);
    const source = ShaderMacroProcessor.evaluate(pass.fragmentShaderInstructions, macros).replace(/\s+/g, "");
    expect(source).toContain("getDistanceAttenuation(distanceSq,pointLight.distance)");
    expect(source).toContain("getDistanceAttenuation(distanceSq,spotLight.distance)");
    expect(source).toContain("if(cutoffDistance>0.0)");
  });

  it("keeps per-pixel baked slopes on distant sand without sampling the micro normal", () => {
    const macros = new Map([
      ["GRAPHICS_API_WEBGL2", ""],
      ["SCENE_FOG_MODE", "1"],
      ["MATERIAL_TERRAIN_LAYERS", ""],
      ["MATERIAL_TERRAIN_SAND_RIPPLE", ""],
      ["MATERIAL_TERRAIN_MICRO_NORMAL", ""],
      ["MATERIAL_TERRAIN_FAR", ""]
    ]);
    const farSand = ShaderMacroProcessor.evaluate(forward.fragmentShaderInstructions, macros);
    expect(farSand).toMatch(/bakedNormal\s*=\s*terrainProjectGeometryNormalAt\s*\(\s*worldXZ/);
    expect(farSand).not.toContain("material_TerrainMicroNormal");
    expect(farSand).not.toContain("material_TerrainSandRippleParams");
  });
  it("restricts sand glints to the near sunlit forward variant with sand micro detail", () => {
    const macros = new Map([
      ["GRAPHICS_API_WEBGL2", ""],
      ["MATERIAL_TERRAIN_LAYERS", ""],
      ["SCENE_DIRECT_LIGHT_COUNT", "1"]
    ]);
    const source = () => ShaderMacroProcessor.evaluate(forward.fragmentShaderInstructions, macros);
    expect(source()).not.toContain("material_TerrainSandGlintStrength");
    macros.set("MATERIAL_TERRAIN_MICRO_NORMAL", "");
    const microNormalSamples = /textureGrad\s*\(\s*material_TerrainMicroNormal\b/g;
    expect(source().match(microNormalSamples)).toHaveLength(1);
    macros.set("MATERIAL_TERRAIN_SAND_GLINTS", "");
    expect(source()).toContain("material_TerrainSandGlintStrength");
    expect(source()).toContain("material_TerrainSandGlintRoughness");
    expect(source().match(microNormalSamples)).toHaveLength(1);
    for (const pass of terrain.subShaders[0].passes.filter((pass) => pass.name !== "Forward")) {
      expect(ShaderMacroProcessor.evaluate(pass.fragmentShaderInstructions, macros)).not.toContain(
        "material_TerrainSandGlintStrength"
      );
    }
    macros.delete("MATERIAL_TERRAIN_MICRO_NORMAL");
    expect(source()).not.toContain("material_TerrainSandGlintStrength");
    macros.set("MATERIAL_TERRAIN_MICRO_NORMAL", "");
    macros.set("MATERIAL_TERRAIN_FAR", "");
    expect(source()).not.toContain("material_TerrainSandGlintStrength");
  });

  it.each(["Forward", "SSRReceiver"])(
    "uses the same opt-in puddle edge in %s",
    (name) => {
      const pass = terrain.subShaders[0].passes.find((entry) => entry.name === name);
      const macros = new Map([["GRAPHICS_API_WEBGL2", ""], ["MATERIAL_TERRAIN_LAYERS", ""]]);
      const native = ShaderMacroProcessor.evaluate(pass.fragmentShaderInstructions, macros);
      macros.set("MATERIAL_TERRAIN_FEATHERED_PUDDLES", "");
      const feathered = ShaderMacroProcessor.evaluate(pass.fragmentShaderInstructions, macros);
      expect(native).toContain("return step ( 0.5 , standingWaterShare )");
      expect(feathered).toContain("float shorelineWidth = 0.09");
      expect(feathered).toContain("return clamp ( standingWaterShare , 0.0 , 1.0 )");
      expect(feathered).not.toContain("return step ( 0.5 , standingWaterShare )");
    }
  );

  it.each(["Forward", "SSRReceiver"])("binds the textured single alphamap in %s", (name) => {
    const pass = terrain.subShaders[0].passes.find((entry) => entry.name === name);
    const macros = new Map([
      ["GRAPHICS_API_WEBGL2", ""],
      ["MATERIAL_TERRAIN_LAYERS", ""],
      ["MATERIAL_TERRAIN_SINGLE_ALPHAMAP", ""],
      ["MATERIAL_TERRAIN_LAYER_DIFFUSE_TEXTURES", ""],
      ["MATERIAL_TERRAIN_LAYER_NORMAL_TEXTURES", ""]
    ]);
    const source = ShaderMacroProcessor.evaluate(pass.fragmentShaderInstructions, macros);
    expect(source).toMatch(/uniform vec4 material_TerrainFirstLayerIndices\s*;/);
    expect(source).toMatch(/vec4 layerIndices\s*=\s*material_TerrainFirstLayerIndices\s*;/);
  });

  it("skips diffuse ground color and moisture evaluation in Terrain SSRReceiver", () => {
    const pass = terrain.subShaders[0].passes.find((entry) => entry.name === "SSRReceiver");
    const macros = new Map([
      ["GRAPHICS_API_WEBGL2", ""],
      ["MATERIAL_TERRAIN_LAYERS", ""],
      ["MATERIAL_TERRAIN_GRASS_SHADING", ""]
    ]);
    const source = ShaderMacroProcessor.evaluate(pass.fragmentShaderInstructions, macros);
    expect(source).toContain("evaluateTerrainLayerWaterFilm");
    expect(source).toContain("evaluateTerrainFallbackWaterFilm");
    expect(source).not.toContain("evaluateTerrainLayerSurface");
    expect(source).not.toContain("terrainProjectGroundColor");
  });

  it("keeps both far-terrain SSR outputs defined on the path past the conditional discard", () => {
    const pass = terrain.subShaders[0].passes.find((entry) => entry.name === "SSRReceiver");
    const macros = new Map([
      ["GRAPHICS_API_WEBGL2", ""],
      ["MATERIAL_TERRAIN_LAYERS", ""],
      ["MATERIAL_TERRAIN_FAR", ""]
    ]);
    const source = ShaderMacroProcessor.evaluate(pass.fragmentShaderInstructions, macros);
    // The compiler lowers the ShaderLab struct to two fragment outputs in this pass.
    const body = source.slice(source.indexOf("void TerrainSSRReceiverFragment"), source.indexOf("void main()"));
    expect(body).toMatch(/output_color\s*=\s*vec4\s*\(\s*0\.0\s*\)/);
    expect(body).toMatch(/output_color_1\s*=\s*vec4\s*\(\s*0\.0\s*\)/);
    expect(body).toMatch(/if\s*\(\s*!\s*\(\s*varyings\.terrainValid\s*>\s*2\.0\s*\)\s*\)\s*\{\s*discard\s*;\s*\}/);
    expect(body).toMatch(/return\s*;/);
    expect(body).not.toContain("evaluateTerrainLayerWaterFilm");
  });

  it.each(["untextured", "soil", "multiple-regions"])(
    "preserves layer data and removes distant detail samplers (%s)",
    (layout) => {
      const macros = new Map([
        ["GRAPHICS_API_WEBGL2", ""],
        ["SCENE_FOG_MODE", "1"],
        ["MATERIAL_TERRAIN_LAYERS", ""],
        ["MATERIAL_TERRAIN_GRASS_SHADING", ""]
      ]);
      if (layout !== "multiple-regions") {
        macros.set("MATERIAL_TERRAIN_SINGLE_REGION", "");
        macros.set("MATERIAL_TERRAIN_SINGLE_ALPHAMAP", "");
        macros.set(
          layout === "soil" ? "MATERIAL_TERRAIN_SINGLE_DIFFUSE_SINGLE_MAP" : "MATERIAL_TERRAIN_UNTEXTURED_SINGLE_MAP",
          ""
        );
      }
      if (layout === "soil") {
        macros.set("MATERIAL_TERRAIN_LAYER_SINGLE_DIFFUSE", "");
        macros.set("MATERIAL_TERRAIN_LAYER_DIFFUSE_TEXTURES", "");
      }
      macros.set("MATERIAL_TERRAIN_DETAIL_TRANSITION", "");
      const near = ShaderMacroProcessor.evaluate(forward.fragmentShaderInstructions, macros);
      macros.delete("MATERIAL_TERRAIN_DETAIL_TRANSITION");
      macros.set("MATERIAL_TERRAIN_FAR", "");
      const far = ShaderMacroProcessor.evaluate(forward.fragmentShaderInstructions, macros);
      for (const sampler of [
        "material_TerrainPuddleAtlas",
        "scene_SurfaceRippleNormalAtlas",
        "scene_SurfaceWaterNormal",
        "camera_SurfaceReliefBakedNormal"
      ]) {
        expect(near).toContain(sampler);
        expect(far).not.toContain(sampler);
      }
      for (const shader of [near, far]) {
        expect(shader).toContain("terrainProjectResolveLayerGroups");
        expect(shader).toContain("terrainProjectEvaluateLayerGroup");
        expect(shader).toContain("terrainProjectGroundColor");
        expect(shader).toContain("layerBlend.snowResponse");
        expect(shader).toContain("scene_SurfaceSnowColor");
        expect(shader).not.toContain("terrainProjectEvaluateSeedFixedLayerBlend");
        if (layout === "soil") expect(shader).toContain("material_TerrainLayerSingleDiffuse");
      }
      expect(near).toContain("material_TerrainFarLod");
      expect(far).not.toContain("material_TerrainFarLod");
      // Distant wet sheen must reuse the substrate lighting, not restore a second water lobe.
      expect(far).toContain("terrainProjectApplyFarWetSheen");
      expect(far).not.toContain("terrainProjectApplyWaterFilmLighting");
      expect(far).not.toContain("terrainProjectEvaluateSurfaceWaterFilm");
      expect(near).toContain("1.0 - detailVisibility");
    }
  );

  it("keeps ground shadow PCF for near ground and skips far and pick variants", () => {
    const baseMacros = new Map([
      ["GRAPHICS_API_WEBGL2", ""],
      ["SCENE_DIRECT_LIGHT_COUNT", "1"],
      ["SCENE_SHADOW_TYPE", "3"],
      ["SCENE_SHADOW_CASCADED_COUNT", "2"],
      ["RENDERER_IS_RECEIVE_SHADOWS", ""],
      ["MATERIAL_TERRAIN_LAYERS", ""]
    ]);
    const near = ShaderMacroProcessor.evaluate(forward.fragmentShaderInstructions, baseMacros);
    expect(near).toContain("sampleTerrainProjectGroundShadowMap");
    expect(near).toContain("terrainProjectGroundShadowGradient");

    const farMacros = new Map(baseMacros);
    farMacros.set("MATERIAL_TERRAIN_FAR", "");
    const far = ShaderMacroProcessor.evaluate(forward.fragmentShaderInstructions, farMacros);
    expect(far).not.toContain("sampleTerrainProjectGroundShadowMap");
    expect(far).not.toContain("terrainProjectGroundShadowGradient");
    expect(far).toContain("sampleTerrainProjectShadow");

    const pickMacros = new Map(baseMacros);
    pickMacros.set("RENDERER_WORLD_PICK", "");
    const pick = ShaderMacroProcessor.evaluate(forward.fragmentShaderInstructions, pickMacros);
    expect(pick).not.toContain("sampleTerrainProjectGroundShadowMap");
    expect(pick).not.toContain("terrainProjectGroundShadowGradient");

    const grassMacros = new Map([
      ["GRAPHICS_API_WEBGL2", ""],
      ["SCENE_DIRECT_LIGHT_COUNT", "1"],
      ["SCENE_SHADOW_TYPE", "3"],
      ["SCENE_SHADOW_CASCADED_COUNT", "2"],
      ["RENDERER_IS_RECEIVE_SHADOWS", ""]
    ]);
    const grassDefault = ShaderMacroProcessor.evaluate(grassForward.fragmentShaderInstructions, grassMacros);
    expect(grassDefault).not.toContain("sampleTerrainProjectGroundShadowMap");

    grassMacros.set("MATERIAL_FARM_GROUND_SURFACE", "");
    const grassGround = ShaderMacroProcessor.evaluate(grassForward.fragmentShaderInstructions, grassMacros);
    expect(grassGround).toContain("sampleTerrainProjectGroundShadowMap");
    expect(grassGround).toContain("terrainProjectGroundShadowGradient");

    grassMacros.set("RENDERER_WORLD_PICK", "");
    const grassGroundPick = ShaderMacroProcessor.evaluate(grassForward.fragmentShaderInstructions, grassMacros);
    expect(grassGroundPick).not.toContain("sampleTerrainProjectGroundShadowMap");
  });

  it("keeps the precompiled grass pick ID controlled by the draw's instancing flag", () => {
    const macros = new Map([
      ["GRAPHICS_API_WEBGL2", ""],
      ["RENDERER_SEED_WORLD_DETAIL_COMPACT", ""],
      ["RENDERER_WORLD_PICK", ""]
    ]);
    const source = ShaderMacroProcessor.evaluate(grassForward.vertexShaderInstructions, macros);
    expect(source).toContain("uniform float renderer_WorldPickInstanced;");
    expect(source).toMatch(/gl_InstanceID\s*\)\s*\*\s*renderer_WorldPickInstanced/);
  });

  it("early-outs culled grass instances in vertex and preserves full climate wind normal for rain/snow", () => {
    const macros = new Map([
      ["GRAPHICS_API_WEBGL2", ""],
      ["RENDERER_SEED_WORLD_DETAIL_COMPACT", ""],
      ["RENDERER_TERRAIN_SINGLE_DIFFUSE_SINGLE_MAP", ""]
    ]);
    const vs = ShaderMacroProcessor.evaluate(grassForward.vertexShaderInstructions, macros);
    expect(vs).toContain("grassCulledVaryings");
    expect(vs).toContain("terrainProjectGroundWindDirectionalNormal");
    expect(vs).toContain("terrainProjectGroundWindCarrierNormal");
    expect(vs).toContain("scene_SurfaceClimate");

    const fs = ShaderMacroProcessor.evaluate(grassForward.fragmentShaderInstructions, macros);
    expect(fs).toContain("terrainProjectApplySurfaceClimate");
    expect(fs).toContain("evaluateTerrainProjectLightingWithShadow");
  });

  it("activates packed varyings (<= 4 vec4s / 13 floats), fragment matte dry lighting + 1-tap shadow, and disables vertex cloud/fog/shadow hoisting across single-map, multi-alphamap, and match-ground grass", () => {
    const prodBase: [string, string][] = [
      ["GRAPHICS_API_WEBGL2", ""],
      ["RENDERER_HAS_UV", ""],
      ["RENDERER_HAS_NORMAL", ""],
      ["RENDERER_SEED_WORLD_DETAIL_COMPACT", ""],
      ["RENDERER_IS_RECEIVE_SHADOWS", ""],
      ["SCENE_DIRECT_LIGHT_COUNT", "1"],
      ["SCENE_SHADOW_TYPE", "3"],
      ["SCENE_SHADOW_CASCADED_COUNT", "2"],
      ["SCENE_FOG_MODE", "2"],
      ["SCENE_FOG_DIRECTIONAL_SKY", ""],
      ["SCENE_USE_SH", ""],
      ["SCENE_USE_REALTIME_SH", ""],
      ["SCENE_USE_SPECULAR_ENV", ""],
      ["SCENE_VOLUMETRIC_CLOUD_SHADOW", ""],
      ["CAMERA_ENABLE_SSR", ""],
      ["SCENE_SURFACE_CLIMATE_DRY", ""]
    ];

    const packedCases: Array<[string, [string, string][]]> = [
      [
        "single-map",
        [
          ...prodBase,
          ["RENDERER_TERRAIN_LAYERS", ""],
          ["RENDERER_TERRAIN_SINGLE_REGION", ""],
          ["RENDERER_TERRAIN_SINGLE_ALPHAMAP", ""],
          ["RENDERER_TERRAIN_SINGLE_DIFFUSE_SINGLE_MAP", ""],
          ["RENDERER_TERRAIN_GRASS_SHADING", ""]
        ]
      ],
      [
        "multi-alphamap",
        [
          ...prodBase,
          ["RENDERER_TERRAIN_LAYERS", ""],
          ["RENDERER_TERRAIN_LAYER_DIFFUSE_TEXTURES", ""],
          ["RENDERER_TERRAIN_LAYER_NORMAL_TEXTURES", ""],
          ["RENDERER_TERRAIN_LAYER_MASK_TEXTURES", ""],
          ["RENDERER_TERRAIN_GRASS_SHADING", ""]
        ]
      ],
      [
        "match-ground-1",
        [
          ...prodBase,
          ["RENDERER_GRASS_MATCH_GROUND", "1"],
          ["RENDERER_TERRAIN_LAYERS", ""],
          ["RENDERER_TERRAIN_UNTEXTURED_SINGLE_MAP", ""],
          ["RENDERER_TERRAIN_GRASS_SHADING", ""]
        ]
      ]
    ];

    const widthForType = (typeName: string): number => {
      if (typeName === "float") return 1;
      if (typeName === "vec2") return 2;
      if (typeName === "vec3") return 3;
      if (typeName === "vec4") return 4;
      throw new Error(`Unexpected varying type: ${typeName}`);
    };

    for (const [label, entries] of packedCases) {
      const macros = new Map(entries);
      const vs = ShaderMacroProcessor.evaluate(grassForward.vertexShaderInstructions, macros);
      const fs = ShaderMacroProcessor.evaluate(grassForward.fragmentShaderInstructions, macros);
      const vsBody = vs.slice(vs.indexOf("Varyings GrassVertex"));
      const matteFn = fs.slice(fs.indexOf("vec3 evaluateMatteGrassLighting"), fs.indexOf("void GrassFragment"));
      const fsBody = fs.slice(fs.indexOf("void GrassFragment"));

      expect(vs, `${label} vs should evaluate root surface in vertex`).toContain("terrainProjectGrassRootSurface");
      // FSMatteOnly: NO vertex hoisting of cloud shadow, fog, or multi-cascade shadow coordinates
      expect(vsBody, `${label} vs must not hoist cloud shadow`).not.toContain("sampleVolumetricCloudShadow");
      expect(vsBody, `${label} vs must not hoist fog radiance`).not.toContain("getFogSkyRadiance");
      expect(vsBody, `${label} vs must not hoist fog visibility`).not.toContain("getSceneFogVisibility");
      expect(vsBody, `${label} vs must not hoist cascade index`).not.toContain("computeCascadeIndex");
      expect(vsBody, `${label} vs must not hoist shadow matrix`).not.toContain("getShadowMatrix");
      expect(vsBody, `${label} vs must not hoist shadow fade`).not.toContain("getShadowFade");
      expect(vs, `${label} vs must not declare hoisted fogData`).not.toContain("fogData");
      expect(vs, `${label} vs must not declare hoisted shadowCoordFade`).not.toContain("shadowCoordFade");
      expect(vs, `${label} vs must not declare hoisted cloudShadow`).not.toContain("cloudShadow");

      // Packed user varyings stay <= 4 vec4 VPC slots / 13 floats (positionCS is dead-stripped in matte FS)
      const outDecls = [...vs.matchAll(/\bout\s+(float|vec[234])\s+(\w+)\s*;/g)]
        .map((m) => ({ type: m[1], name: m[2], floats: widthForType(m[1]) }))
        .filter((d) => d.name !== "positionCS");
      const totalFloats = outDecls.reduce((sum, d) => sum + d.floats, 0);
      expect(outDecls.map((d) => `${d.type} ${d.name}`), `${label} packed VS varyings`).toEqual([
        "vec3 positionWS",
        "vec4 rootGroundBase",
        "vec3 shadingNormalWS",
        "vec3 positionVS"
      ]);
      expect(outDecls.length, `${label} active varying slots must be <= 4 vec4s`).toBeLessThanOrEqual(4);
      expect(totalFloats, `${label} active varying floats must be <= 13`).toBeLessThanOrEqual(13);
      expect(matteFn, `${label} matte lighting must not read positionCS`).not.toContain("positionCS");
      expect(fsBody, `${label} matte fragment must not read positionCS`).not.toContain("positionCS");

      expect(vs, `${label} vs must be derivative-free`).not.toMatch(/\bdFd[xy]\s*\(/);
      expect(vs, `${label} vs must avoid continue for Safari 16.1`).not.toMatch(/\bcontinue\s*;/);

      expect(fsBody, `${label} fs should use matte dry lighting`).toContain("evaluateMatteGrassLighting");
      expect(fsBody, `${label} fs should evaluate shadow coord in fragment`).toContain("getShadowCoord");
      expect(fsBody, `${label} fs should evaluate shadow fade in fragment`).toContain("getShadowFade");
      expect(fsBody, `${label} fs should evaluate cloud shadow in fragment`).toContain("sampleVolumetricCloudShadow");
      expect(fsBody, `${label} fs should evaluate fog in fragment using positionVS`).toMatch(
        /\bfog\s*\(\s*vec4\s*\(\s*color\s*,\s*1\.0\s*\)\s*,\s*input_\s*\.\s*positionVS\s*\)/
      );
      expect(fsBody, `${label} fs must not read hoisted fogData`).not.toContain("fogData");
      expect(fsBody, `${label} fs must not read hoisted shadowCoordFade`).not.toContain("shadowCoordFade");
      expect(fsBody, `${label} fs should not run full PBR/SSR lighting`).not.toContain(
        "evaluateTerrainProjectLightingWithShadow"
      );
      expect(fsBody, `${label} fs should not use 9-tap soft shadow filter`).not.toContain("sampleTerrainProjectShadow");
      expect(fsBody, `${label} fs should not evaluate ground layers per pixel`).not.toContain(
        "terrainProjectGroundSurface"
      );
      expect(fsBody, `${label} fs should do only 1 hardware bilinear shadow fetch`).toContain(
        "textureLod ( scene_ShadowMap , grassShadowCoord , 0.0 )"
      );
      const texCalls = fsBody.match(/\btexture(Lod|Grad|2D)?\s*\(/g) ?? [];
      expect(texCalls, `${label} fs should have exactly 1 direct shadow texture fetch`).toHaveLength(1);
    }

    // Multi-alphamap grass vertex skips unused normal/mask texture fetches
    const multiVs = ShaderMacroProcessor.evaluate(
      grassForward.vertexShaderInstructions,
      new Map(packedCases[1][1])
    );
    expect(multiVs).not.toContain("renderer_TerrainLayerNormalTextures");
    expect(multiVs).not.toContain("renderer_TerrainLayerMaskTextures");

    // Match-ground == 1 blends root ground color with blade match color in vertex
    const match1Vs = ShaderMacroProcessor.evaluate(
      grassForward.vertexShaderInstructions,
      new Map(packedCases[2][1])
    );
    expect(match1Vs).toContain("terrainProjectGrassBladeAppearanceWeight");

    // Match-ground == 0 keeps explicit opt-out from terrain surface packed path
    const match0Fs = ShaderMacroProcessor.evaluate(
      grassForward.fragmentShaderInstructions,
      new Map([
        ...prodBase,
        ["RENDERER_GRASS_MATCH_GROUND", "0"],
        ["RENDERER_TERRAIN_LAYERS", ""],
        ["RENDERER_TERRAIN_UNTEXTURED_SINGLE_MAP", ""]
      ])
    );
    const match0Body = match0Fs.slice(match0Fs.indexOf("void GrassFragment"));
    expect(match0Body).not.toContain("evaluateMatteGrassLighting");
    expect(match0Body).toContain("evaluateTerrainProjectLightingWithShadow");

    // SCENE_OIL_PAINT_STYLE must bypass TERRAIN_PROJECT_GRASS_MATTE_LIGHTING so dry oil-paint grass
    // still evaluates applyOilPaintBrushSurface via evaluateTerrainProjectLightingWithShadow.
    const oilPaintDryFs = ShaderMacroProcessor.evaluate(
      grassForward.fragmentShaderInstructions,
      new Map([...packedCases[0][1], ["SCENE_OIL_PAINT_STYLE", ""]])
    );
    const oilPaintDryBody = oilPaintDryFs.slice(oilPaintDryFs.indexOf("void GrassFragment"));
    expect(oilPaintDryBody).not.toContain("evaluateMatteGrassLighting");
    expect(oilPaintDryBody).toContain("evaluateTerrainProjectLightingWithShadow");
    expect(oilPaintDryFs).toContain("applyOilPaintBrushSurface");

    // Edge cases: 1-cascade shadow, rock appearance + match-ground=1, and point/spot/probe dry matte
    const cascade1Macros = new Map(
      packedCases[0][1].map(([k, v]) => (k === "SCENE_SHADOW_CASCADED_COUNT" ? [k, "1"] : [k, v]))
    );
    const cascade1Vs = ShaderMacroProcessor.evaluate(grassForward.vertexShaderInstructions, cascade1Macros);
    const cascade1Fs = ShaderMacroProcessor.evaluate(grassForward.fragmentShaderInstructions, cascade1Macros);
    const cascade1FsBody = cascade1Fs.slice(cascade1Fs.indexOf("void GrassFragment"));
    expect(cascade1Vs).not.toContain("shadowFade");
    expect(cascade1FsBody).toContain("input_.shadowCoord");
    expect(cascade1FsBody).toContain("getShadowFade");
    expect(cascade1FsBody).toContain("textureLod ( scene_ShadowMap , grassShadowCoord , 0.0 )");
    expect(cascade1FsBody).toContain("evaluateMatteGrassLighting");

    const rockMatch1Macros = new Map([
      ...packedCases[2][1],
      ["RENDERER_GRASS_ROCK_APPEARANCE", ""]
    ]);
    const rockMatch1Body = ShaderMacroProcessor.evaluate(
      grassForward.fragmentShaderInstructions,
      rockMatch1Macros
    );
    expect(rockMatch1Body.slice(rockMatch1Body.indexOf("void GrassFragment"))).not.toContain("ground . tangentNormal");

    const pointLightMacros = new Map([
      ...packedCases[0][1],
      ["SCENE_POINT_LIGHT_COUNT", "2"],
      ["SCENE_SPOT_LIGHT_COUNT", "1"],
      ["SCENE_USE_PROBE_VOLUME", ""],
      ["SCENE_PROBE_VOLUME_PER_VERTEX", ""]
    ]);
    const pointLightFs = ShaderMacroProcessor.evaluate(grassForward.fragmentShaderInstructions, pointLightMacros);
    expect(pointLightFs).toContain("getPointLight");
    expect(pointLightFs).toContain("getSpotLight");
    expect(pointLightFs).toContain("sampleProbeVolume");
    const matteGrass = pointLightFs
      .slice(pointLightFs.indexOf("vec3 evaluateMatteGrassLighting"), pointLightFs.indexOf("void GrassFragment"))
      .replace(/\s+/g, "");
    expect(matteGrass).toContain("getDistanceAttenuation(distanceSq,pointLight.distance)");
    expect(matteGrass).toContain("getDistanceAttenuation(distanceSq,spotLight.distance)");
    expect(matteGrass).toContain("dot(pointLight.color,pointLight.color)>0.0");
  });

  it("retains volumetric cloud shadow attenuation on dry grass when directional shadows are disabled (P1-6)", () => {
    const macros = new Map([
      ["GRAPHICS_API_WEBGL2", ""],
      ["RENDERER_HAS_UV", ""],
      ["RENDERER_HAS_NORMAL", ""],
      ["RENDERER_SEED_WORLD_DETAIL_COMPACT", ""],
      ["SCENE_DIRECT_LIGHT_COUNT", "1"],
      ["SCENE_VOLUMETRIC_CLOUD_SHADOW", ""],
      ["SCENE_SURFACE_CLIMATE_DRY", ""],
      ["RENDERER_TERRAIN_LAYERS", ""],
      ["RENDERER_TERRAIN_SINGLE_REGION", ""],
      ["RENDERER_TERRAIN_SINGLE_ALPHAMAP", ""],
      ["RENDERER_TERRAIN_SINGLE_DIFFUSE_SINGLE_MAP", ""],
      ["RENDERER_TERRAIN_GRASS_SHADING", ""]
    ]);
    const vs = ShaderMacroProcessor.evaluate(grassForward.vertexShaderInstructions, macros);
    const fs = ShaderMacroProcessor.evaluate(grassForward.fragmentShaderInstructions, macros);
    const vsBody = vs.slice(vs.indexOf("Varyings GrassVertex"));
    const matteFn = fs.slice(fs.indexOf("vec3 evaluateMatteGrassLighting"), fs.indexOf("void GrassFragment"));
    const fsBody = fs.slice(fs.indexOf("void GrassFragment"));

    expect(vsBody).not.toContain("sampleVolumetricCloudShadow");
    expect(fsBody).toMatch(/shadowAttenuation\s*\*=\s*sampleVolumetricCloudShadow\s*\(\s*input_\s*\.\s*positionWS\s*\)/);
    expect(matteFn).toMatch(/directionalLight\s*\.\s*color\s*\*=\s*shadowAttenuation/);
  });

  it("keeps active vertex samplers <= 16 across the full GrassVertex macro matrix and omits unused metadata on single-map (P1-5)", () => {
    const collectReachableSamplers = (glsl: string): { declared: string[]; active: string[]; reachableFns: Set<string> } => {
      const declRegex = /\buniform\s+(?:(?:lowp|mediump|highp)\s+)?sampler\w+\s+(\w+)\s*;/g;
      const declared: string[] = [];
      let m: RegExpExecArray | null;
      while ((m = declRegex.exec(glsl)) !== null) {
        declared.push(m[1]);
      }
      const uniqueDeclared = [...new Set(declared)];

      // Parse top-level GLSL function definitions (supporting overloads by concatenating bodies per name).
      const fnBodies = new Map<string, string[]>();
      const fnHeaderRegex = /\b(?:void|bool|int|uint|float|vec[234]|ivec[234]|uvec[234]|mat[234]|[A-Z]\w*)\s+(\w+)\s*\([^;{}]*\)\s*\{/g;
      while ((m = fnHeaderRegex.exec(glsl)) !== null) {
        const name = m[1];
        if (name === "if" || name === "for" || name === "while" || name === "switch") continue;
        let depth = 1;
        let idx = fnHeaderRegex.lastIndex;
        const start = idx;
        while (idx < glsl.length && depth > 0) {
          const ch = glsl[idx++];
          if (ch === "{") depth++;
          else if (ch === "}") depth--;
        }
        const body = glsl.slice(start, idx - 1);
        const list = fnBodies.get(name) ?? [];
        list.push(body);
        fnBodies.set(name, list);
        fnHeaderRegex.lastIndex = idx;
      }

      // BFS call graph from main() to collect all functions reachable from the vertex entry point.
      const reachableFns = new Set<string>(["main"]);
      const queue = ["main"];
      const callRegex = /\b(\w+)\s*\(/g;
      while (queue.length > 0) {
        const fn = queue.shift()!;
        for (const body of fnBodies.get(fn) ?? []) {
          callRegex.lastIndex = 0;
          let call: RegExpExecArray | null;
          while ((call = callRegex.exec(body)) !== null) {
            const target = call[1];
            if (fnBodies.has(target) && !reachableFns.has(target)) {
              reachableFns.add(target);
              queue.push(target);
            }
          }
        }
      }

      const reachableSource = [...reachableFns].flatMap((fn) => fnBodies.get(fn) ?? []).join("\n");
      const active = uniqueDeclared.filter((name) => new RegExp(`\\b${name}\\b`).test(reachableSource));
      return { declared: uniqueDeclared, active, reachableFns };
    };

    const fullFeatureBase: [string, string][] = [
      ["GRAPHICS_API_WEBGL2", ""],
      ["RENDERER_HAS_UV", ""],
      ["RENDERER_HAS_NORMAL", ""],
      ["RENDERER_SEED_WORLD_DETAIL_COMPACT", ""],
      ["RENDERER_IS_RECEIVE_SHADOWS", ""],
      ["SCENE_DIRECT_LIGHT_COUNT", "1"],
      ["SCENE_SHADOW_TYPE", "3"],
      ["SCENE_SHADOW_CASCADED_COUNT", "2"],
      ["SCENE_FOG_MODE", "2"],
      ["SCENE_FOG_DIRECTIONAL_SKY", ""],
      ["SCENE_USE_SH", ""],
      ["SCENE_USE_SPECULAR_ENV", ""],
      ["SCENE_FARM_GROUND_APPEARANCE", ""],
      ["SCENE_VOLUMETRIC_CLOUD_SHADOW", ""],
      ["SCENE_USE_PROBE_VOLUME", ""],
      ["SCENE_PROBE_VOLUME_PER_VERTEX", ""],
      ["SCENE_SURFACE_CLIMATE_DRY", ""]
    ];

    const matrix: Array<[string, [string, string][], boolean]> = [
      [
        "multi-alphamap + farm + cloud + probe-per-vertex",
        [
          ...fullFeatureBase,
          ["RENDERER_TERRAIN_LAYERS", ""],
          ["RENDERER_TERRAIN_LAYER_DIFFUSE_TEXTURES", ""],
          ["RENDERER_TERRAIN_LAYER_NORMAL_TEXTURES", ""],
          ["RENDERER_TERRAIN_LAYER_MASK_TEXTURES", ""],
          ["RENDERER_TERRAIN_GRASS_SHADING", ""]
        ],
        true
      ],
      [
        "single-map + single-diffuse + farm + cloud + probe-per-vertex",
        [
          ...fullFeatureBase,
          ["RENDERER_TERRAIN_LAYERS", ""],
          ["RENDERER_TERRAIN_SINGLE_REGION", ""],
          ["RENDERER_TERRAIN_SINGLE_ALPHAMAP", ""],
          ["RENDERER_TERRAIN_SINGLE_DIFFUSE_SINGLE_MAP", ""],
          ["RENDERER_TERRAIN_LAYER_SINGLE_DIFFUSE", ""],
          ["RENDERER_TERRAIN_GRASS_SHADING", ""]
        ],
        true
      ],
      [
        "rock-grass-ground + height-field + farm + cloud + probe-per-vertex",
        [
          ...fullFeatureBase,
          ["RENDERER_ROCK_GRASS_GROUND", ""],
          ["MATERIAL_TERRAIN_HEIGHT_FIELD", ""],
          ["RENDERER_TERRAIN_LAYERS", ""],
          ["RENDERER_TERRAIN_SINGLE_ALPHAMAP", ""],
          ["RENDERER_TERRAIN_UNTEXTURED_SINGLE_MAP", ""],
          ["RENDERER_TERRAIN_GRASS_SHADING", ""]
        ],
        true
      ],
      [
        "non-terrain match-ground-0 + cloud + probe-per-vertex",
        [
          ...fullFeatureBase,
          ["RENDERER_GRASS_MATCH_GROUND", "0"]
        ],
        false
      ]
    ];

    for (const [label, entries, expectsDeferredProbe] of matrix) {
      const macros = new Map(entries);
      const vs = ShaderMacroProcessor.evaluate(grassForward.vertexShaderInstructions, macros);
      const fs = ShaderMacroProcessor.evaluate(grassForward.fragmentShaderInstructions, macros);
      const { active, reachableFns } = collectReachableSamplers(vs);
      expect(active.length, `${label} active VS samplers (${active.join(", ")}) must be <= 16`).toBeLessThanOrEqual(
        16
      );
      if (expectsDeferredProbe) {
        expect(reachableFns.has("sampleProbeVolume"), `${label} should defer sampleProbeVolume off VS`).toBe(false);
      }
      // ProbeVolume must still be sampled in fragment when deferred off VS.
      expect(fs, `${label} fs should still evaluate probe volume`).toContain("sampleProbeVolume");
    }

    // Single-map variants must omit unused AlphamapMetadata and LayerMetadata sampler declarations.
    const singleMapVs = ShaderMacroProcessor.evaluate(
      grassForward.vertexShaderInstructions,
      new Map(matrix[1][1])
    );
    expect(singleMapVs).not.toContain("TerrainAlphamapMetadata");
    expect(singleMapVs).not.toContain("TerrainLayerMetadata");
  });

  it("specializes FarmGround varyings and prunes surface climate calls under SCENE_SURFACE_CLIMATE_DRY", async () => {
    const farmDryMacros = new Map<string, string>([
      ["GRAPHICS_API_WEBGL2", ""],
      ["MATERIAL_GRASS_GROUND_SURFACE", ""],
      ["MATERIAL_FARM_GROUND_SURFACE", ""],
      ["SCENE_SURFACE_CLIMATE_DRY", ""]
    ]);
    const farmDryVs = ShaderMacroProcessor.evaluate(grassForward.vertexShaderInstructions, farmDryMacros);
    const farmDryFs = ShaderMacroProcessor.evaluate(grassForward.fragmentShaderInstructions, farmDryMacros);
    const varyingsBlock = farmDryVs.match(/struct Varyings\s*\{[^}]*\}/)?.[0] ?? "";
    expect(varyingsBlock).toContain("terrainNormalWS");
    expect(varyingsBlock).toContain("positionWS");
    expect(varyingsBlock).not.toContain("windCarrierNormalWS");
    expect(varyingsBlock).not.toContain("windBentNormalWS");
    expect(varyingsBlock).not.toContain("rootPositionWS");
    expect(varyingsBlock).not.toContain("grassColor");
    expect(farmDryFs).not.toMatch(/terrainProjectApplySurfaceClimate\s*\(\s*surfaceData/);

    const farmWetMacros = new Map(farmDryMacros);
    farmWetMacros.delete("SCENE_SURFACE_CLIMATE_DRY");
    const farmWetFs = ShaderMacroProcessor.evaluate(grassForward.fragmentShaderInstructions, farmWetMacros);
    expect(farmWetFs).toMatch(/terrainProjectApplySurfaceClimate\s*\(\s*surfaceData/);

    const engine = await HeadlessEngine.create({
      shaderCompiler: new ShaderCompiler(),
      glTFLoader: { meshOpt: { workerCount: 0 } }
    });
    const soilShader = Shader.create(
      PLANNING_FARM_SOIL_SHADER.replace("Farming/PlannerSoilSnow", "Farming/PlannerSoilSnowTest")
    );
    try {
      const soilForward = soilShader.subShaders[0].passes.find((pass) => pass.name === "Forward Pass")!;
      const soilDryFs = ShaderMacroProcessor.evaluate(
        soilForward._fragmentShaderInstructions,
        new Map<string, string>([
          ["GRAPHICS_API_WEBGL2", ""],
          ["FARM_SOIL_BATCH", ""],
          ["RENDERER_ENABLE_VERTEXCOLOR", ""],
          ["SCENE_SURFACE_CLIMATE_DRY", ""]
        ])
      );
      expect(soilDryFs).not.toMatch(/terrainProjectApplySurfaceClimate\s*\(\s*surfaceData/);
      expect(soilDryFs).not.toContain("soil_Row0");

      const soilWetFs = ShaderMacroProcessor.evaluate(
        soilForward._fragmentShaderInstructions,
        new Map<string, string>([
          ["GRAPHICS_API_WEBGL2", ""],
          ["FARM_SOIL_BATCH", ""],
          ["RENDERER_ENABLE_VERTEXCOLOR", ""]
        ])
      );
      expect(soilWetFs).toMatch(/terrainProjectApplySurfaceClimate\s*\(\s*surfaceData/);
    } finally {
      soilShader.destroy();
      engine.destroy();
    }
  });
});
