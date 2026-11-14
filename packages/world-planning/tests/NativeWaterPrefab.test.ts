import { expect, it } from "vitest";
import { WaterBodyComponent } from "@galacean/engine-water/water/native/index";
import { BUILTIN_WATER_PROJECT_URL } from "@galacean/engine-water/water/native/WaterBuiltinAssets";
import { RuntimeSceneEdit } from "@galacean/engine-runtime-editor/runtime-editor/scene/runtime-scene-edit";
import type { WaterSourceAuthoring } from "@galacean/engine-world-planning/spatial/runtime/NativeWaterEditor";
import { openWaterEditorFixture } from "./WaterEditorFixture";

it("keeps nested Prefab overrides, reverts and inline water in Source across reopening", async () => {
  const manifest = await (await fetch(BUILTIN_WATER_PROJECT_URL)).json(),
    id = `water-prefab:${crypto.randomUUID()}`;
  let current = await openWaterEditorFixture(id, manifest, BUILTIN_WATER_PROJECT_URL);
  try {
    expect((await current.water.execute(async () => {})).runtimeError).toBeUndefined();
    const first = current.editor.projection.queryComponents({ type: "WaterBodyComponent" })[0];
    const input = current.editor.projection.readComponent(first).props!.authoring as unknown as WaterSourceAuthoring;
    const created = await current.water.execute((edit) =>
      edit.run(({ draft, edited }) => {
        draft.create(
          { virtualPath: "Water/nested.prefab", path: "Water/nested.prefab", type: "Prefab" },
          JSON.stringify({
            asset: { version: "2.0" },
            root: "root",
            entities: [
              { id: "root", children: ["nested"] },
              { id: "nested", instance: { asset: { $ref: "Water/Presets/lake.prefab" } } }
            ],
            components: []
          })
        );
        const scene = new RuntimeSceneEdit(draft, manifest.scene);
        const roots = [
          scene.create({ name: "Nested A", prefab: "Water/nested.prefab" }).id,
          scene.create({ name: "Nested B", prefab: "Water/nested.prefab" }).id
        ];
        const inline = scene.create({ name: "Inline lake", parentEntityId: roots[0], position: [12, 0, 0] });
        const body = scene.addComponent(inline.id, {
          type: "WaterBodyComponent",
          props: { authoring: input as unknown as GalaceanSourceValueRecord }
        });
        edited();
        return { roots, inline: body.id };
      })
    );
    expect(created.runtimeError).toBeUndefined();
    const nested = created.value.roots.map(
      (root) =>
        current.editor.projection
          .queryComponents({ type: "WaterBodyComponent" })
          .find((identity) => identity.id.includes(root) && identity.id !== created.value.inline)!.id
    );
    const body = (id: string) => current.editor.projection.component(id) as WaterBodyComponent;
    expect(new Set(current.system.bodies.map((body) => body.waterId)).size).toBe(4);
    expect(
      (
        await current.water.change({
          operation: "update",
          id: first.id,
          patch: { priority: 23, quality: { query: "off" } }
        })
      ).runtimeError
    ).toBeUndefined();
    expect(
      (
        await current.water.change({
          operation: "update",
          id: nested[0],
          patch: { priority: 23, quality: { query: "off" } }
        })
      ).runtimeError
    ).toBeUndefined();
    const template = await current.water.execute((edit) =>
      edit.run(({ draft, edited }) => {
        const path = "Water/Presets/lake.prefab",
          prefab = JSON.parse(draft.read(path) as string);
        const authoring = prefab.components.find((component: { id: string }) => component.id === "lake-body").props
          .authoring;
        authoring.priority = 17;
        authoring.shape.shoreline[0].x = 1.5;
        authoring.quality.spatialField.maximumHorizontalError = 2;
        authoring.quality.reflectionBudget.screenSpace = false;
        draft.create(
          { virtualPath: "Water/Materials/template.mat", path: "Water/Materials/template.mat", type: "Material" },
          draft.read(authoring.material.$ref)!
        );
        authoring.material = { $ref: "Water/Materials/template.mat" };
        draft.update(path, JSON.stringify(prefab));
        edited();
      })
    );
    expect(template.runtimeError).toBeUndefined();
    expect(
      [first.id, ...nested].map((id) => {
        const authoring = current.editor.projection.readComponent(current.editor.projection.queryComponents({ id })[0])
          .props!.authoring as unknown as WaterSourceAuthoring;
        return {
          priority: authoring.priority,
          x: authoring.shape.kind === "lake" && authoring.shape.shoreline[0].x,
          material: authoring.material.$ref
        };
      })
    ).toEqual([23, 23, 17].map((priority) => ({ priority, x: 1.5, material: "Water/Materials/template.mat" })));
    expect(nested.map((id) => body(id).authoring!.priority)).toEqual([23, 17]);
    expect([first.id, ...nested].map((id) => body(id).authoring!.quality)).toEqual(
      ["off", "off", "dense"].map((query) =>
        expect.objectContaining({
          query,
          reflectionBudget: { environment: true, screenSpace: false },
          spatialField: expect.objectContaining({ maximumHorizontalError: 2, maximumDepthError: 0 })
        })
      )
    );
    expect(
      (
        await current.water.execute((edit) =>
          edit.run(({ draft, edited }) => {
            new RuntimeSceneEdit(draft, manifest.scene).revertComponent(nested[0], ["authoring"]);
            edited();
          })
        )
      ).runtimeError
    ).toBeUndefined();
    expect(body(nested[0]).authoring!.priority).toBe(17);
    expect(body(nested[0]).authoring!.quality.query).toBe("dense");
    expect((await current.water.history("undo")).runtimeError).toBeUndefined();
    expect(body(nested[0]).authoring!.priority).toBe(23);
    expect(body(nested[0]).authoring!.quality.query).toBe("off");
    expect((await current.water.history("redo")).runtimeError).toBeUndefined();
    const waterId = body(created.value.inline).waterId;
    expect(current.system.sample(16, 4, waterId)).toMatchObject({ water: true });
    const source = JSON.parse(current.project.projectPackage.contents[manifest.scene] as string);
    expect(source.components).toEqual([]);
    expect(source.entities.filter((entity: { instance?: unknown }) => entity.instance)).toHaveLength(3);
    expect(
      source.entities.find((entity: { id: string }) => entity.id === created.value.roots[0]).instance.overrides
        .addedEntities
    ).toHaveLength(1);
    await current.close();
    current = await openWaterEditorFixture(id, manifest, BUILTIN_WATER_PROJECT_URL);
    expect((await current.water.execute(async () => {})).runtimeError).toBeUndefined();
    expect(nested.map((id) => body(id).authoring!.priority)).toEqual([17, 17]);
    expect(body(first.id).authoring!.quality.query).toBe("off");
    expect(nested.map((id) => body(id).authoring!.quality.spatialField.maximumHorizontalError)).toEqual([2, 2]);
    expect(body(created.value.inline).waterId).toBe(waterId);
    expect(current.system.sample(16, 4, waterId)).toMatchObject({ water: true });
  } finally {
    await current.close();
  }
});
