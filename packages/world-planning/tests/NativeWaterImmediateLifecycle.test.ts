import { expect, it } from "vitest";
import { MeshRenderer } from "@galacean/engine";
import { WaterBodyComponent } from "@galacean/engine-water/water/native/index";
import { BUILTIN_WATER_PROJECT_URL } from "@galacean/engine-water/water/native/WaterBuiltinAssets";
import { openWaterEditorFixture } from "./WaterEditorFixture";
import { createWaterCreationPreset } from "@galacean/engine-water/water/native/index";
import { writeWaterTerrainAssets } from "@galacean/engine-world-planning/spatial/runtime/NativeWaterEditor";

it.each(["lake", "river", "ocean"] as const)(
  "withdraws disabled and deleted %s synchronously before asynchronous cleanup",
  async (kind) => {
    const manifest = await (await fetch(BUILTIN_WATER_PROJECT_URL)).json();
    const current = await openWaterEditorFixture(
      `water-immediate:${crypto.randomUUID()}`,
      manifest,
      BUILTIN_WATER_PROJECT_URL
    );
    try {
      await current.water.execute(async () => {});
      let identity = current.editor.projection.queryComponents({ type: "WaterBodyComponent" })[0];
      if (kind !== "lake") {
        await current.water.change({ operation: "remove", id: identity.id });
        const preset = createWaterCreationPreset(kind);
        await current.water.execute((edit) =>
          writeWaterTerrainAssets(edit, "Water/Terrain/manual-bed.json", preset.terrain)
        );
        const created = await current.water.change({
          operation: "create",
          name: kind,
          input: {
            shape: preset.shape,
            terrain: {
              mode: "asset",
              description: { $ref: "Water/Terrain/manual-bed.json" },
              heights: { $ref: "Water/Terrain/manual-bed.bin" }
            },
            material: { $ref: `Water/Materials/${kind}.mat` }
          }
        });
        expect(created.runtimeError).toBeUndefined();
        identity = current.editor.projection.queryComponents({ id: created.value })[0];
      }
      const body = current.editor.projection.component(identity.id) as WaterBodyComponent;
      const renderEntity = () => {
        const renderers: MeshRenderer[] = [];
        for (const root of current.engine.sceneManager.activeScene.rootEntities)
          root.getComponentsIncludeChildren(MeshRenderer, renderers);
        return renderers.find((renderer) => current.system.resolveRenderOwner(renderer.entity) === body)?.entity;
      };
      const originalRenderEntity = renderEntity();
      expect(originalRenderEntity).toBeDefined();
      expect(current.system.resolveRenderOwner(body.entity)).toBeUndefined();
      const sample = () => current.system.sample(kind === "lake" ? 4 : 0, kind === "lake" ? 4 : 0);
      expect(sample().water).toBe(true);
      body.enabled = false;
      expect(current.system.resolveRenderOwner(originalRenderEntity!)).toBeUndefined();
      expect(sample().water).toBe(false);
      expect(current.system.activeRuntimeHost?.getBodyHandle(body.waterId)?.visible).toBe(false);
      await body.ready;
      body.enabled = true;
      await body.ready;
      expect(sample().water).toBe(true);
      const restoredRenderEntity = renderEntity();
      expect(restoredRenderEntity).toBeDefined();
      expect(current.system.resolveRenderOwner(originalRenderEntity!)).toBeUndefined();
      body.entity.destroy();
      expect(current.system.resolveRenderOwner(restoredRenderEntity!)).toBeUndefined();
      expect(sample().water).toBe(false);
      await body.dispose();
    } finally {
      await current.close();
    }
  }
);
