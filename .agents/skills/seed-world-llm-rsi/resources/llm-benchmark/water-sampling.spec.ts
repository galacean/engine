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

    const initialWaterId = bodyId();
    expect(await sampleLakeCenter(true)).toMatchObject({ water: true, id: initialWaterId });

    async function applyEdit(transactionId: string, name: string, input: unknown) {
      const edit = editor.beginEdit(transactionId, signal);
      const tool = edit.tools.find((tool) => tool.name === name)!;
      await tool.execute(tool.parseInput(input), { signal });
      await edit.prepare(signal);
      await edit.commit();
      await edit.activate?.(signal);
      await edit.complete?.();
    }

    await applyEdit("remove-lake", "component.remove", target);
    const afterRemoval = await sampleLakeCenter(false);
    await applyEdit("undo-remove-lake", "history.undo", { transactionIds: ["remove-lake"] });
    const restoredWaterId = bodyId();
    expect(restoredWaterId).not.toBe(initialWaterId);
    expect(await sampleLakeCenter(true)).toMatchObject({ water: true, id: restoredWaterId });
    expect(await sampleLakeCenter(false)).toMatchObject({ water: true, id: restoredWaterId });
    expect(afterRemoval).toMatchObject({ water: false });
  } finally {
    await fixture.dispose();
  }
});
