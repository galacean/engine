import { createWaterQualitySettings } from "@galacean/engine-water/water/native/WaterQualitySettings";
import { expect, it } from "vitest";
import { MeshRenderer } from "@galacean/engine";
import { WaterBodyComponent } from "@galacean/engine-water/water/native/index";
import { BUILTIN_WATER_PROJECT_URL } from "@galacean/engine-water/water/native/WaterBuiltinAssets";
import { waterMaterialTextures, resolveWaterMaterialLook } from "@galacean/engine-water/water/native/WaterMaterial";
import {
  editWaterSource,
  writeWaterTerrainAssets
} from "@galacean/engine-world-planning/spatial/runtime/NativeWaterEditor";
import { openWaterEditorFixture } from "./WaterEditorFixture";
import { ledgeTerrain } from "../../water/tests/WaterFixtures";

it("loads drop appearance on demand and preserves its native Material through history and reopening", async () => {
  const manifest = await (await fetch(BUILTIN_WATER_PROJECT_URL)).json(),
    id = `water-drops:${crypto.randomUUID()}`;
  let current = await openWaterEditorFixture(id, manifest, BUILTIN_WATER_PROJECT_URL);
  try {
    const shape = {
      kind: "river" as const,
      speed: 1,
      course: {
        id: "drop-course",
        points: [
          { id: "head", x: 2, z: 4, elevation: 0, width: 1, depth: 1 },
          { id: "tail", x: 6, z: 4, elevation: 0, width: 1, depth: 1 }
        ]
      }
    };
    const created = await current.water.change({
      operation: "create",
      name: "River",
      input: {
        shape,
        terrain: {
          mode: "asset",
          description: { $ref: "Water/Terrain/manual-bed.json" },
          heights: { $ref: "Water/Terrain/manual-bed.bin" }
        },
        material: { $ref: "Water/Materials/river.mat" },
        quality: createWaterQualitySettings("river")
      }
    });
    expect(created.runtimeError).toBeUndefined();
    const body = () => current.editor.projection.component(created.value) as WaterBodyComponent;
    expect(waterMaterialTextures(body().authoring!.material!)).toHaveLength(2);
    const drop = await current.water.execute(async (edit) => {
      await writeWaterTerrainAssets(edit, "Water/Terrain/ledge.json", ledgeTerrain);
      await editWaterSource(edit, manifest.scene, {
        operation: "update",
        id: created.value,
        patch: {
          terrain: {
            mode: "asset",
            description: { $ref: "Water/Terrain/ledge.json" },
            heights: { $ref: "Water/Terrain/ledge.bin" }
          },
          shape: {
            ...shape,
            course: {
              ...shape.course,
              points: shape.course.points.map((point, index) => ({ ...point, elevation: index ? -1 : 1 })),
              sections: [{ id: "ledge", from: "head", to: "tail", form: "waterfall" }]
            }
          },
          material: { $ref: "Water/Materials/river-drops.mat" }
        }
      });
    });
    expect(drop.runtimeError).toBeUndefined();
    expect(body().configuration!.asset.riverDrops).toHaveLength(1);
    const bed = body().configuration!.asset;
    const changed = await current.water.execute((edit) =>
      edit.run(({ draft, edited }) => {
        const path = "Water/Materials/river-drops.mat",
          material = JSON.parse(draft.read(path) as string);
        material.shaderData.material_Water_look_riverDrops_speed.value = 0;
        material.shaderData.material_Water_look_riverDrops_opacity.value = 0.5;
        material.shaderData.material_Water_reflectionPolicy_policy_preferred.value = 2;
        material.shaderData.material_WaterReflectionFallback0.value = -1;
        material.shaderData.material_WaterReflectionFallback1.value = -1;
        draft.update(path, JSON.stringify(material));
        edited();
      })
    );
    expect(changed.runtimeError).toBeUndefined();
    expect(body().configuration!.asset).toBe(bed);
    expect(resolveWaterMaterialLook(body().authoring!.material).reflectionPolicy.policy).toMatchObject({
      preferred: "analytic",
      fallbacks: []
    });
    let rendered: { speed: number; opacity: number } | undefined;
    const renderers: MeshRenderer[] = [];
    for (const root of body().entity.scene!.rootEntities) root.getComponentsIncludeChildren(MeshRenderer, renderers);
    for (const renderer of renderers) {
      const data = renderer.getMaterial()?.shaderData;
      if (data?.getVector4("material_DropEffects"))
        rendered = {
          speed: data.getVector4("material_DropEffects").x,
          opacity: data.getVector4("material_DropResponse").x
        };
    }
    expect(rendered).toEqual({ speed: 0, opacity: 0.5 });
    expect((await current.water.history("undo")).runtimeError).toBeUndefined();
    expect(resolveWaterMaterialLook(body().authoring!.material).look.riverDrops!.speed).toBe(1);
    expect((await current.water.history("redo")).runtimeError).toBeUndefined();
    await current.close();
    current = await openWaterEditorFixture(id, manifest, BUILTIN_WATER_PROJECT_URL);
    expect((await current.water.execute(async () => {})).runtimeError).toBeUndefined();
    expect(resolveWaterMaterialLook(body().authoring!.material).look.riverDrops).toMatchObject({
      speed: 0,
      opacity: 0.5
    });
    expect(body().configuration!.asset.riverDrops).toHaveLength(1);
    expect(resolveWaterMaterialLook(body().authoring!.material).reflectionPolicy.policy.preferred).toBe("analytic");
  } finally {
    await current.close();
  }
});
