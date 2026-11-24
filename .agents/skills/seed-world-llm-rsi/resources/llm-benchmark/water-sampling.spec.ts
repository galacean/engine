import { expect, it } from "vitest";
import { WaterBodyComponent } from "@galacean/engine-water/water/native/index";
import { createHeadlessSeedWorldFixture } from "./seed-world-headless-fixture";

it("samples the restored lake using its current runtime water ID", async () => {
  const fixture = await createHeadlessSeedWorldFixture({ caseId: "47_water_capabilities_and_drops" });
  try {
    const signal = new AbortController().signal;
    const editor = fixture.nativeEditor;
    const [identity] = editor.projection.queryComponents({ type: "WaterBodyComponent" });
    const target = { scene: identity.scene, id: identity.id };
    const bodyId = () => (editor.projection.resolveComponent(identity) as WaterBodyComponent).waterId;
    const sample = fixture.configuration.tools.find((tool) => tool.name === "water.sample")!;
    const sampleLakeCenter = (targeted: boolean) =>
      sample.execute(sample.parseInput({ x: 4, z: 4, ...(targeted ? { target } : {}) }), { signal });

    const spatialSearch = fixture.configuration.tools.find((tool) => tool.name === "spatial.search")!;
    const waterSearch = (water: boolean, constraints = {}) =>
      spatialSearch.execute(spatialSearch.parseInput({
        constraints: { water, ...constraints }, sort: "nearest", limit: 1
      }), { signal });
    const spatialCheck = fixture.configuration.tools.find((tool) => tool.name === "spatial.check")!;
    const checkLakeCenter = () =>
      spatialCheck.execute(spatialCheck.parseInput({ positions: [{ x: 4, z: 4 }] }), { signal });

    const initialWaterId = bodyId();
    expect(await sampleLakeCenter(true)).toMatchObject({ water: true, id: initialWaterId });
    expect(await waterSearch(true)).toMatchObject({ status: "matched", items: [{ surface: { water: true } }] });
    expect(await waterSearch(true, { minimumElevationMetres: 30 })).toMatchObject({ status: "no_match", items: [] });

    async function applyEdit(transactionId: string, name: string, input: unknown) {
      const edit = editor.beginEdit(transactionId, signal);
      const tool = edit.tools.find((tool) => tool.name === name)!;
      await tool.execute(tool.parseInput(input), { signal });
      await edit.prepare(signal);
      await edit.commit();
      await edit.activate?.(signal);
      await edit.complete?.();
    }

    await applyEdit("disable-lake", "component.update", { ...target, props: { enabled: false } });
    expect(await sampleLakeCenter(false)).toMatchObject({ water: false });
    expect(await checkLakeCenter()).toMatchObject({ items: [{ surface: { water: false } }] });
    expect(await waterSearch(true)).toMatchObject({ status: "no_match", items: [] });
    await applyEdit("undo-disable-lake", "history.undo", { transactionIds: ["disable-lake"] });

    await applyEdit("remove-lake", "component.remove", target);
    expect(await sampleLakeCenter(false)).toMatchObject({ water: false });
    expect(await checkLakeCenter()).toMatchObject({ items: [{ surface: { water: false } }] });
    expect(await waterSearch(true)).toMatchObject({ status: "no_match", items: [] });
    await applyEdit("undo-remove-lake", "history.undo", { transactionIds: ["remove-lake"] });
    const restoredWaterId = bodyId();
    expect(restoredWaterId).not.toBe(initialWaterId);
    expect(await sampleLakeCenter(true)).toMatchObject({ water: true, id: restoredWaterId });
    expect(await sampleLakeCenter(false)).toMatchObject({ water: true, id: restoredWaterId });
    expect(await checkLakeCenter()).toMatchObject({ items: [{ surface: { water: true } }] });
    expect(await waterSearch(true)).toMatchObject({ status: "matched", items: [{ surface: { water: true } }] });
    expect(await waterSearch(false)).toMatchObject({ status: "matched", items: [{ surface: { water: false } }] });
  } finally {
    await fixture.dispose();
  }
});
