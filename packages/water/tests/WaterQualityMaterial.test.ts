import { createWaterSurfaceAppearanceV2NormalStatements } from "../src/water/runtime/surface/WaterSurfaceAppearanceV2Shader";
import { Material } from "@galacean/engine-core";
import { Color, Vector3 } from "@galacean/engine-math";
import { expect, it } from "vitest";
import {
  createWaterMaterialDefaults,
  resolveWaterMaterialFileLook,
  createWaterMaterialFile,
  resolveWaterMaterialLook,
  waterMaterialKey
} from "../src/water/native/WaterMaterial";
import { resolveWaterSurfaceAppearanceForQuality } from "../src/water/authoring/quality/WaterSurfaceAppearanceQuality";
import { resolveWaterOpaqueDownsampling } from "../src/water/authoring/quality/WaterQualityPlan";
import { createWaterQualitySettings } from "../src/water/native/WaterQualitySettings";
import { scopedLook } from "../src/water/native/WaterResources";
import { WaterSurfaceAppearanceCompiler } from "../src/water/compiler/surface/WaterSurfaceAppearanceCompiler";
import { WaterRenderContractCompiler } from "../src/water/compiler/surface/WaterRenderContractCompiler";
import { resolveWaterSurfaceAppearanceBinding } from "../src/water/runtime/surface/WaterSurfaceAppearanceBinding";
import { createRiverSurfaceAppearanceV2ShaderSource } from "../src/water/runtime/river/RiverSurfaceShader";
import { createWaterShaderModule, materializeWaterShaderModuleSource } from "../src/water/runtime/material/WaterShaderModule";
import {
  WaterFieldConsumerActivation,
  WaterFieldFallback,
  WaterFieldProviderKind,
  WaterFieldRequirement,
  WaterFieldSemantic,
  WaterFieldUnit
} from "../src/water/authoring/surface/WaterSurfaceFieldTypes";
import { WaterBodyAssetRegistry } from "../src/water/runtime/body/WaterBodyAssetRegistry";
import {
  registerRiverWaterBodyPresets,
  registerFarmlandsRiverLook,
  FARMLANDS_RIVER_LOOK_ID,
  riverQualityPlanIdForQuality
} from "../src/water/presets/river/index";
import { FARMLANDS_WAVE_RESOURCE, FARMLANDS_CAUSTICS_RESOURCE } from "../src/water/resources/river/FarmlandsWaterAssets";

it("defaults refraction to half resolution and honors full-resolution overrides", () => {
  expect(resolveWaterOpaqueDownsampling({ sceneFields: "scene-color-depth" })).toBe("2x");
  for (const kind of ["lake", "river", "ocean"] as const) {
    expect(resolveWaterOpaqueDownsampling(createWaterQualitySettings(kind))).toBe("2x");
    expect(resolveWaterOpaqueDownsampling(createWaterQualitySettings(kind, { opaqueDownsampling: "none" }))).toBe(
      "none"
    );
  }
});

async function materialFor(profile: "lake" | "river" | "ocean" = "lake") {
  const file = createWaterMaterialDefaults(profile);
  const material = Object.create(Material.prototype);
  const read = (name: string) => file.shaderData[name]?.value;
  Object.defineProperties(material, {
    shader: { value: { subShaders: [{ name: "WaterNear" }, { name: "WaterFar" }] } },
    shaderData: {
      value: {
        getInt: (name: string) => (typeof read(name) === "boolean" ? Number(read(name)) : read(name)),
        getFloat: read,
        getTexture: () => null,
        getColor: (name: string) => {
          const c = read(name) as any;
          return new Color(c.r, c.g, c.b, c.a);
        },
        getVector2: read,
        getVector3: read,
        getVector4: read,
        getProperties: () => [],
        setFloat: (name: string, value: unknown) => (file.shaderData[name].value = value),
        setVector3: (name: string, value: unknown) => (file.shaderData[name].value = value)
      }
    },
    destroy: { value: () => {} }
  });
  return material;
}

it.each(["low", "medium", "high"] as const)("native lake fits %s binding budgets", async (surfaceShading) => {
  const material = await materialFor();
  const look = scopedLook(undefined, material, { surfaceShading });
  const compiled = WaterSurfaceAppearanceCompiler.compile(look.appearance.appearance);
  expect(compiled.valid).toBe(true);
  const result = resolveWaterSurfaceAppearanceBinding(
    {
      appearance: compiled.data!,
      textureBindings: compiled.data!.textureReferences.map((ref) => ({
        layerId: ref.layerId,
        assetId: ref.textureAssetId,
        contentHash: ref.textureContentHash,
        ownership: "borrowed" as const,
        texture: { destroyed: false, width: 64, height: 64 } as any
      }))
    },
    true,
    surfaceShading === "low" ? 1 : surfaceShading === "medium" ? 2 : 3,
    surfaceShading === "low" ? 1 : 2
  );
  expect(result.readback.fallbackReason).not.toBe("surface-appearance-detail-layer-budget-exceeded");
  expect(result.readback.fallbackReason).not.toBe("surface-appearance-pattern-octave-budget-exceeded");
  expect(result.readback.active).toBe(true);
  const normalShader = createWaterSurfaceAppearanceV2NormalStatements(compiled.data!);
  expect(/texture2D\s*\(\s*material_AppearanceV2Detail1Texture/.test(normalShader)).toBe(surfaceShading !== "low");
  expect(result.readback.normalLayerCount).toBe(surfaceShading === "low" ? 1 : 2);
  expect(compiled.data!.maximumPatternOctaves).toBe(surfaceShading === "low" ? 1 : surfaceShading === "medium" ? 2 : 3);
  material.destroy();
});

it.each([1, 2, 3])("decodes Vector3 octave weights for count %s", async (count) => {
  const material = await materialFor();
  const prefix = "material_Water_appearance_appearance_boundaryEffects_1_pattern_octaves_";
  material.shaderData.setFloat(prefix + "count", count);
  material.shaderData.setVector3(prefix + "weights", new Vector3(0.5, 0.25, 0.125));
  const appearance = resolveWaterMaterialLook(material).appearance.appearance;
  expect(appearance.boundaryEffects[1].pattern!.octaves.weights).toHaveLength(count);
  expect(WaterSurfaceAppearanceCompiler.compile(appearance).valid).toBe(true);
  material.destroy();
});

it.each(["lake", "river", "ocean"] as const)(
  "preserves %s authoring and isolates shared material quality",
  async (profile) => {
    const material = await materialFor(profile);
    const original = resolveWaterMaterialLook(material);
    const key = waterMaterialKey(material);
    const high = scopedLook(undefined, material, { surfaceShading: "high" });
    const low = scopedLook(undefined, material, { surfaceShading: "low" });
    expect(low.look.id).not.toBe(high.look.id);
    expect(high.appearance.appearance).toEqual({
      ...original.appearance.appearance,
      id: high.appearance.appearance.id
    });
    expect(low.appearance.appearance.depthResponse).toEqual(original.appearance.appearance.depthResponse);
    expect(low.appearance.appearance.refraction).toEqual(original.appearance.appearance.refraction);
    expect(low.appearance.appearance.composition).toBe(original.appearance.appearance.composition);
    expect(scopedLook(undefined, material, { surfaceShading: "high" })).toEqual(high);
    expect(resolveWaterMaterialLook(material)).toEqual(original);
    expect(waterMaterialKey(material)).toBe(key);
  }
);

it.each([1, 2, 3] as const)("round trips count %s through fixed Vector3 file storage", (count) => {
  const look = resolveWaterMaterialFileLook(createWaterMaterialDefaults("lake"));
  const appearance = structuredClone(look.appearance.appearance);
  const effect = appearance.boundaryEffects[1];
  const edited = {
    ...look,
    appearance: {
      ...look.appearance,
      appearance: {
        ...appearance,
        boundaryEffects: appearance.boundaryEffects.map((value, index) =>
          index === 1
            ? {
                ...effect,
                pattern: { ...effect.pattern!, octaves: { count, weights: [0.5, 0.25, 0.125].slice(0, count) } }
              }
            : value
        )
      }
    }
  };
  const file = createWaterMaterialFile(edited as typeof look, "lake");
  expect(file.shaderData[prefix + "weights"].type).toBe("Vector3");
  expect(resolveWaterMaterialFileLook(file).appearance.appearance.boundaryEffects[1].pattern!.octaves.weights).toEqual(
    [0.5, 0.25, 0.125].slice(0, count)
  );
});

const prefix = "material_Water_appearance_appearance_boundaryEffects_1_pattern_octaves_";
it.each([0, 4, 1.5, NaN, Infinity])("rejects illegal count %s before quality derivation", (count) => {
  const file = createWaterMaterialDefaults("lake");
  file.shaderData[prefix + "count"].value = count;
  expect(() => resolveWaterMaterialFileLook(file)).toThrow();
});
it.each([
  { x: -1, y: 0, z: 0 },
  { x: NaN, y: 1, z: 0 },
  { x: Infinity, y: 0, z: 0 },
  { x: 0, y: 0, z: 0 }
])("rejects illegal weights %j", (weights) => {
  const file = createWaterMaterialDefaults("lake");
  file.shaderData[prefix + "weights"].value = weights;
  expect(() => resolveWaterMaterialFileLook(file)).toThrow();
});

it("keeps a valid low-tier approximation when authored energy is only in discarded octaves", () => {
  const file = createWaterMaterialDefaults("lake");
  file.shaderData[prefix + "weights"].value = { x: 0, y: 0, z: 1 };
  const authored = resolveWaterMaterialFileLook(file).appearance.appearance;
  const before = structuredClone(authored);
  for (const surfaceShading of ["low", "medium", "high"] as const) {
    const derived = resolveWaterSurfaceAppearanceForQuality(authored, { surfaceShading });
    expect(WaterSurfaceAppearanceCompiler.compile(derived).valid).toBe(true);
    expect(derived.boundaryEffects[1].pattern!.octaves.weights).toEqual(
      surfaceShading === "low" ? [1] : surfaceShading === "medium" ? [1, 0] : [0, 0, 1]
    );
  }
  expect(authored).toEqual(before);
});

it("rejects invalid authoring even when low quality would discard it", () => {
  const authored = structuredClone(
    resolveWaterMaterialFileLook(createWaterMaterialDefaults("lake")).appearance.appearance
  );
  const invalid = {
    ...authored,
    detailLayers: authored.detailLayers.map((layer, index) => (index === 1 ? { ...layer, strength: -1 } : layer))
  };
  expect(() => resolveWaterSurfaceAppearanceForQuality(invalid, { surfaceShading: "low" })).toThrow();
});

it("F2: declares sceneDepthDelta in River SSRReceiver when boundary roughness uses SceneEyeDepth", () => {
  const registry = new WaterBodyAssetRegistry();
  registerRiverWaterBodyPresets(registry);
  registerFarmlandsRiverLook(registry);
  const riverLook = registry.getLookAuthoringSnapshot(FARMLANDS_RIVER_LOOK_ID);
  const patchedAppearance = structuredClone(riverLook.appearance.appearance);
  patchedAppearance.boundaryEffects = [
    {
      ...patchedAppearance.boundaryEffects[0],
      field: WaterFieldSemantic.SceneEyeDepth,
      outputs: { roughness: 0.35 }
    }
  ];
  const fieldDependencies = {
    ...riverLook.appearance.fieldDependencies,
    bindings: [
      ...riverLook.appearance.fieldDependencies.bindings,
      {
        consumerId: "test-boundary-roughness-eye-depth",
        semantic: WaterFieldSemantic.SceneEyeDepth,
        providers: [WaterFieldProviderKind.CameraDepth, WaterFieldProviderKind.Derived],
        activation: WaterFieldConsumerActivation.Always,
        requirement: WaterFieldRequirement.Optional,
        fallback: WaterFieldFallback.UseNextProvider,
        unit: WaterFieldUnit.Meter
      }
    ]
  };
  const contract = WaterRenderContractCompiler.compile({
    sourceId: riverLook.look.id,
    look: { ...riverLook.look, riverDrops: undefined },
    appearance: patchedAppearance,
    fieldDependencies,
    optics: { id: riverLook.optics.id, profile: riverLook.optics.profile },
    reflectionIntent: riverLook.reflectionPolicy,
    qualityPlan: registry.getQualityPlan(riverQualityPlanIdForQuality("high")),
    renderState: riverLook.renderState,
    resources: [FARMLANDS_WAVE_RESOURCE, FARMLANDS_CAUSTICS_RESOURCE]
  });
  expect(contract.diagnostics).toEqual([]);
  expect(contract.valid).toBe(true);
  const rawSource = createRiverSurfaceAppearanceV2ShaderSource(contract.data!, false);
  const shaderName = rawSource.match(/Shader\s+"([^"]+)"/)![1];
  const source = materializeWaterShaderModuleSource(createWaterShaderModule(shaderName, rawSource, {}, []));
  const receiverIndex = source.indexOf('Pass "SSRReceiver"');
  expect(receiverIndex).toBeGreaterThan(-1);
  const receiverSource = source.slice(receiverIndex);
  expect(receiverSource).toContain("float sceneDepthDelta =");
});
