import { expect, it } from "vitest";
import { WaterBodyComponent } from "@galacean/engine-water/water/native/index";
import { BUILTIN_WATER_PROJECT_URL } from "@galacean/engine-water/water/native/WaterBuiltinAssets";
import { writeWaterTerrainAssets } from "../src/spatial/runtime/NativeWaterEditor";
import { openWaterEditorFixture } from "./WaterEditorFixture";
import { lake, terrain } from "../../water/tests/WaterFixtures";

it("updates shared native terrain atomically, rejects mismatches, undoes and reopens both consumers", async () => {
  const manifest = await (await fetch(BUILTIN_WATER_PROJECT_URL)).json();
  const id = `native-height-pair:${crypto.randomUUID()}`;
  let current = await openWaterEditorFixture(id, manifest, BUILTIN_WATER_PROJECT_URL);
  const descriptionPath = "Water/Terrain/manual-bed.json",
    heightPath = "Water/Terrain/manual-bed.bin";
  try {
    expect((await current.water.execute(async () => {})).runtimeError).toBeUndefined();
    const created = await current.water.change({
      operation: "create",
      name: "Shared bed lake",
      input: {
        shape: lake,
        terrain: { mode: "asset", description: { $ref: descriptionPath }, heights: { $ref: heightPath } },
        material: { $ref: "Water/Materials/lake.mat" }
      }
    });
    expect(created.runtimeError).toBeUndefined();
    const bodies = () =>
      current.editor.projection
        .queryComponents({ type: "WaterBodyComponent" })
        .map((identity) => current.editor.projection.component(identity.id) as WaterBodyComponent);
    const depths = () => bodies().map((body) => current.system.sample(4, 4, body.waterId));
    expect(bodies()).toHaveLength(2);
    const first = bodies().map((body) => body._terrainSnapshot());
    expect(first[0]).toBe(first[1]);
    const changed = await current.water.execute((edit) =>
      writeWaterTerrainAssets(edit, descriptionPath, { ...terrain, heights: terrain.heights.map(() => -2) })
    );
    expect(changed.runtimeError).toBeUndefined();
    for (const sample of depths()) expect(sample).toMatchObject({ water: true, depth: { value: 2.5 } });
    expect(bodies()[0]._terrainSnapshot()).toBe(bodies()[1]._terrainSnapshot());
    const revision = current.project.publicationRevision;
    await expect(
      current.water.execute((edit) =>
        edit.run(
          ({ draft, edited }) => {
            const bytes = draft.read(heightPath) as Uint8Array;
            new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).setFloat64(0, -3, true);
            draft.update(heightPath, bytes);
            edited();
          },
          true,
          [heightPath]
        )
      )
    ).rejects.toThrow("checksum");
    expect(current.project.publicationRevision).toBe(revision);
    for (const path of [descriptionPath, heightPath])
      await expect(
        current.water.execute((edit) =>
          edit.run(({ draft, edited }) => {
            draft.delete(path);
            edited();
          })
        )
      ).rejects.toThrow();
    expect((await current.water.history("undo")).runtimeError).toBeUndefined();
    for (const sample of depths()) expect(sample).toMatchObject({ water: true, depth: { value: 1.5 } });
    expect((await current.water.history("redo")).runtimeError).toBeUndefined();
    for (const sample of depths()) expect(sample).toMatchObject({ water: true, depth: { value: 2.5 } });
    await current.close();
    current = await openWaterEditorFixture(id, manifest, BUILTIN_WATER_PROJECT_URL);
    expect((await current.water.execute(async () => {})).runtimeError).toBeUndefined();
    expect(bodies()).toHaveLength(2);
    for (const sample of depths()) expect(sample).toMatchObject({ water: true, depth: { value: 2.5 } });
  } finally {
    await current.close();
  }
});
