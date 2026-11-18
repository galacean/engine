import { expect, it } from "vitest";
import { Color, SphericalHarmonics3, Vector3 } from "@galacean/engine";
import type { Scene } from "@galacean/engine";
import { TerrainAtmosphericFog } from "@galacean/engine-environment/terrain/lighting/TerrainAtmosphericFog";
import { TerrainLightingRuntime } from "@galacean/engine-world-planning/integrations/terrain/lighting/TerrainLightingRuntime";

it("switches fog color shader variants without letting sky updates overwrite custom color", () => {
  const macros = new Set<string>();
  const scene = {
    shaderData: {
      enableMacro: (name: string) => macros.add(name),
      disableMacro: (name: string) => macros.delete(name),
      setColor() {},
      setFloatArray() {}
    },
    fogColor: new Color(),
    background: { solidColor: new Color() }
  } as unknown as Scene;
  const fog = new TerrainAtmosphericFog(scene);
  expect(macros.has("SCENE_FOG_DIRECTIONAL_SKY")).toBe(true);
  fog.setAppearance({ skyDriven: false, cameraDepth: true, color: [0.2, 0.3, 0.4] });
  const sky = new SphericalHarmonics3();
  sky.coefficients.fill(1);
  fog.update(sky);
  expect([scene.fogColor.r, scene.fogColor.g, scene.fogColor.b]).toEqual([0.2, 0.3, 0.4]);
  expect(macros.has("SCENE_FOG_DIRECTIONAL_SKY")).toBe(false);
  expect(macros.has("SCENE_FOG_CAMERA_DEPTH")).toBe(true);
  fog.setAppearance({ skyDriven: true });
  fog.update(sky);
  expect(scene.fogColor.r).not.toBe(0.2);
  fog.destroy();
  expect(macros.size).toBe(0);
});

it("retains four authored cascade splits when only shadow distance changes", () => {
  const scene = { shadowFourCascadeSplits: new Vector3() };
  const runtime = Object.assign(Object.create(TerrainLightingRuntime.prototype), {
    _scene: scene,
    _destroyed: false,
    _shadowCascadeTuning: { distance: 300, distribution: 15 }
  }) as TerrainLightingRuntime;
  runtime.setShadowCascadeTuning({ count: 4, splits: [1 / 15, 3 / 15, 7 / 15] });
  runtime.setShadowCascadeTuning({ distance: 400 });
  expect(runtime.getShadowCascadeTuning().count).toBe(4);
  expect(scene.shadowFourCascadeSplits.x).toBeCloseTo(1 / 15);
  expect(scene.shadowFourCascadeSplits.z).toBeCloseTo(7 / 15);
});
