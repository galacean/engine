import { createWaterQualitySettings } from "@galacean/engine-water/water/native/WaterQualitySettings";
import { expect, it } from "vitest";
import { page } from "@vitest/browser/context";
import { Vector3 } from "@galacean/engine";
import { WaterBodyComponent, WaterLookResource } from "@galacean/engine-water/water/native/index";
import { BUILTIN_WATER_PROJECT_URL } from "@galacean/engine-water/water/native/WaterBuiltinAssets";
import { WaterBodyAssetRegistry } from "@galacean/engine-water/water/runtime/body/WaterBodyAssetRegistry";
import {
  registerLakeWaterLook,
  LAKE_WATER_LOOK_PRESET_ID
} from "@galacean/engine-water/water/presets/lake/LakeWaterLook";
import {
  registerRiverWaterBodyPresets,
  registerFarmlandsRiverLook,
  FARMLANDS_RIVER_LOOK_ID
} from "@galacean/engine-water/water/presets/river/index";
import { registerOceanLook } from "@galacean/engine-water/water/authoring/ocean/OceanAuthoring";
import { OCEAN_LOOK_ID } from "@galacean/engine-water/water/presets/ocean/index";
import type { WaterShapeAuthoring } from "@galacean/engine-water/water/native/WaterAuthoring";
import { openWaterEditorFixture } from "./WaterEditorFixture";
import { writeWaterAsset } from "@galacean/engine-world-planning/spatial/runtime/NativeWaterEditor";
import { ledgeTerrain } from "../../water/tests/WaterFixtures";

it.each(["lake", "river", "river-drops", "ocean"] as const)(
  "renders the converted native %s exactly like the original preset at a fixed time",
  async (kind) => {
    const manifest = await (await fetch(BUILTIN_WATER_PROJECT_URL)).json();
    const current = await openWaterEditorFixture(
      `water-pixels:${crypto.randomUUID()}`,
      manifest,
      BUILTIN_WATER_PROJECT_URL
    );
    current.engine.time.timeScale = 0;
    current.engine.canvas.setResolution(256, 256);
    let originalLook: WaterLookResource | undefined;
    try {
      expect((await current.water.execute(async () => {})).runtimeError).toBeUndefined();
      let identity = current.editor.projection.queryComponents({ type: "WaterBodyComponent" })[0];
      if (kind !== "lake") {
        expect((await current.water.change({ operation: "remove", id: identity.id })).runtimeError).toBeUndefined();
        const drops = kind === "river-drops";
        if (drops) {
          await current.water.execute((edit) =>
            writeWaterAsset(edit, "Water/Terrain/ledge.water", { version: 1, kind: "terrain", data: ledgeTerrain })
          );
          current.system.camera!.entity.transform.setPosition(10, 6, 10);
          current.system.camera!.entity.transform.lookAt(new Vector3(4, 0, 4));
        }
        const shape: WaterShapeAuthoring =
          kind !== "ocean"
            ? {
                kind: "river",
                speed: 0,
                course: {
                  id: "render-river",
                  points: [
                    { id: "head", x: 1, z: 4, elevation: drops ? 1 : 0, width: 4, depth: 1 },
                    { id: "tail", x: 7, z: 4, elevation: drops ? -1 : 0, width: 4, depth: 1 }
                  ],
                  ...(drops ? { sections: [{ id: "ledge", from: "head", to: "tail", form: "waterfall" }] } : {})
                }
              }
            : {
                kind,
                waterLevel: 0.25,
                layout: {
                  schemaVersion: 1,
                  kind: "ocean-surface-layout",
                  centerXZ: [4, 4],
                  size: 12,
                  surfaceTopology: "finite",
                  finitePatchGridSize: 4
                }
              };
        const created = await current.water.change({
          operation: "create",
          name: kind,
          input: {
            shape,
            terrain: { $ref: `Water/Terrain/${drops ? "ledge" : "manual-bed"}.water` },
            material: { $ref: `Water/Materials/${kind}.mat` },
            quality: createWaterQualitySettings(drops ? "river" : (kind as "river" | "ocean"))
          }
        });
        expect(created.runtimeError).toBeUndefined();
        identity = current.editor.projection.queryComponents({ id: created.value })[0];
      }
      const body = current.editor.projection.component(identity.id) as WaterBodyComponent,
        native = body.configuration!;
      const gl = current.canvas.getContext("webgl2")!;
      const render = () => {
        current.engine.update();
        expect(gl.getParameter(gl.FRAMEBUFFER_BINDING)).toBeNull();
        const pixels = new Uint8Array(256 * 256 * 4);
        gl.readPixels(0, 0, 256, 256, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
        expect(gl.getError()).toBe(0);
        return pixels;
      };
      const converted = render();
      await page.screenshot({ element: current.canvas, path: `/tmp/water-migration-${kind}-native.png` });
      const presets = new WaterBodyAssetRegistry();
      registerLakeWaterLook(presets);
      registerRiverWaterBodyPresets(presets);
      registerFarmlandsRiverLook(presets);
      registerOceanLook(presets);
      const lookId =
        kind === "lake" ? LAKE_WATER_LOOK_PRESET_ID : kind === "ocean" ? OCEAN_LOOK_ID : FARMLANDS_RIVER_LOOK_ID;
      originalLook = new WaterLookResource(current.engine, presets.getLookAuthoringSnapshot(lookId)!);
      await (
        await current.system.prepareBatch([
          { body, configuration: { ...native, look: originalLook, material: undefined } }
        ])
      ).commit().retiredCleanup;
      const original = render();
      await page.screenshot({ element: current.canvas, path: `/tmp/water-migration-${kind}-original.png` });
      let maximumDelta = 0;
      for (let index = 0; index < converted.length; index++)
        maximumDelta = Math.max(maximumDelta, Math.abs(converted[index] - original[index]));
      expect(maximumDelta).toBe(0);
      await (await current.system.prepareBatch([{ body, configuration: { ...native, visible: false } }])).commit()
        .retiredCleanup;
      const empty = render();
      let waterPixels = 0;
      for (let index = 0; index < converted.length; index += 4)
        if (
          converted[index] !== empty[index] ||
          converted[index + 1] !== empty[index + 1] ||
          converted[index + 2] !== empty[index + 2]
        )
          waterPixels++;
      expect(waterPixels).toBeGreaterThan(1000);
    } finally {
      await current.close();
      originalLook?.destroy();
    }
  }
);
