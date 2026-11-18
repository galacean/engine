import { expect, it } from "vitest";
import { WaterBodyComponent } from "@galacean/engine-water/water/native/index";
import { BUILTIN_WATER_PROJECT_URL } from "@galacean/engine-water/water/native/WaterBuiltinAssets";
import { RuntimeSceneEdit } from "@galacean/engine-runtime-editor/runtime-editor/scene/runtime-scene-edit";
import { openWaterEditorFixture } from "./WaterEditorFixture";

it("keeps local shape, published queries and Quality independent through placement and activation changes", async () => {
  const manifest = await (await fetch(BUILTIN_WATER_PROJECT_URL)).json();
  const id = `water-placement:${crypto.randomUUID()}`;
  let current = await openWaterEditorFixture(id, manifest, BUILTIN_WATER_PROJECT_URL);
  try {
    expect((await current.water.execute(async () => {})).runtimeError).toBeUndefined();
    const identity = current.editor.projection.queryComponents({ type: "WaterBodyComponent" })[0];
    const body = () => current.editor.projection.component(identity.id) as WaterBodyComponent;
    const shape = body().authoring!.shape,
      bed = body().configuration!.asset,
      material = body().authoring!.material,
      quality = body().configuration!.quality;
    expect(
      (
        await current.water.execute((edit) =>
          edit.run(({ draft, edited }) => {
            new RuntimeSceneEdit(draft, manifest.scene).update(identity.entityId, {
              position: [20, 2, 10],
              rotation: [0, 90, 0]
            });
            edited();
          })
        )
      ).runtimeError
    ).toBeUndefined();
    expect(body().authoring!.shape).toEqual(shape);
    expect(body().configuration!.asset.contentHash).toBe(bed.contentHash);
    expect(current.system.sample(24, 6, body().waterId)).toMatchObject({ water: true, surfaceElevationMetres: 2.5 });
    expect(current.system.sample(4, 4, body().waterId)).toMatchObject({ water: false });
    expect(
      (
        await current.water.change({
          operation: "update",
          id: identity.id,
          patch: {
            quality: {
              query: "off",
              reflectionBudget: { screenSpace: false },
              spatialField: { maximumDepthError: 0 }
            }
          }
        })
      ).runtimeError
    ).toBeUndefined();
    expect(body().configuration!.asset.contentHash).toBe(bed.contentHash);
    expect(body().authoring!.shape).toEqual(shape);
    expect(body().authoring!.material).toBe(material);
    expect(body().authoring!.quality).toMatchObject({
      query: "off",
      reflectionBudget: { screenSpace: false },
      spatialField: { maximumDepthError: 0 }
    });
    expect(quality.destroyed).toBe(true);
    expect(current.system.sample(24, 6, body().waterId)).toMatchObject({ water: false });
    expect((await current.water.history("undo")).runtimeError).toBeUndefined();
    expect(current.system.sample(24, 6, body().waterId)).toMatchObject({ water: true });
    expect(body().authoring!.quality.query).toBe("dense");
    expect((await current.water.history("redo")).runtimeError).toBeUndefined();
    expect(current.system.sample(24, 6, body().waterId)).toMatchObject({ water: false });
    expect((await current.water.history("undo")).runtimeError).toBeUndefined();
    const revision = current.project.publicationRevision;
    await expect(
      current.water.change({
        operation: "update",
        id: identity.id,
        patch: { quality: { spatialField: { maximumAtlasPixels: -1 } } }
      })
    ).rejects.toThrow("non-negative");
    await expect(
      current.water.change({
        operation: "update",
        id: identity.id,
        patch: { quality: { $ref: "Water/unused.water" } as never }
      })
    ).rejects.toThrow("Unknown Water Quality");
    await expect(
      current.water.change({
        operation: "update",
        id: identity.id,
        patch: { quality: { surfaceEffectBudget: { caustics: null as never } } }
      })
    ).rejects.toThrow("must be boolean");
    expect(current.project.publicationRevision).toBe(revision);
    expect(
      (await current.water.change({ operation: "setEnabled", id: identity.id, enabled: false })).runtimeError
    ).toBeUndefined();
    expect(current.system.sample(24, 6, body().waterId)).toMatchObject({ water: false });
    expect((await current.water.history("undo")).runtimeError).toBeUndefined();
    expect(
      (
        await current.water.change({
          operation: "update",
          id: identity.id,
          patch: {
            quality: { query: "off", surfaceEffectBudget: { caustics: false }, spatialField: { maximumDepthError: 0 } }
          }
        })
      ).runtimeError
    ).toBeUndefined();
    const saved = current.editor.projection.readComponent(identity).props!.authoring;
    await current.close();
    current = await openWaterEditorFixture(id, manifest, BUILTIN_WATER_PROJECT_URL);
    expect((await current.water.execute(async () => {})).runtimeError).toBeUndefined();
    const reopened = current.editor.projection.component(identity.id) as WaterBodyComponent;
    expect(reopened.authoring!.quality).toMatchObject({
      query: "off",
      surfaceEffectBudget: { caustics: false },
      spatialField: { maximumDepthError: 0 }
    });
    expect(current.editor.projection.readComponent(identity).props!.authoring).toEqual(saved);
    expect(current.system.sample(24, 6, reopened.waterId)).toMatchObject({ water: false });
    expect(
      (await current.water.change({ operation: "update", id: identity.id, patch: { quality: { query: "sparse" } } }))
        .runtimeError
    ).toBeUndefined();
    expect(current.system.sample(24, 6, reopened.waterId)).toMatchObject({ water: true });
    expect(current.system.sample(24, 6, body().waterId)).toMatchObject({ water: true });
    const invalid = await current.water.execute((edit) =>
      edit.run(({ draft, edited }) => {
        new RuntimeSceneEdit(draft, manifest.scene).update(identity.entityId, { scale: [2, 1, 1] });
        edited();
      })
    );
    expect(invalid.runtimeError).toContain("scale");
    expect(current.system.sample(24, 6, body().waterId)).toMatchObject({ water: true });
    expect((await current.water.history("undo")).runtimeError).toBeUndefined();
  } finally {
    await current.close();
  }
});
