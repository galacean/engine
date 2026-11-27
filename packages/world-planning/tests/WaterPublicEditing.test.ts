import { expect, it } from "vitest";
import { openWaterEditorFixture } from "./WaterEditorFixture";
import { publicCall } from "./WaterTestClient";
import { createNativeWaterAgentPackage } from "../src/spatial/runtime/NativeWaterAgent";
import { WATER_QUERY_CONTRACTS } from "../src/spatial/runtime/WaterQueryContract";
import { mountNativeWaterPanel } from "../src/spatial/runtime/NativeWaterPanel";
import { BUILTIN_WATER_PROJECT_URL } from "@galacean/engine-water/water/native/WaterBuiltinAssets";
import { WaterBodyComponent } from "@galacean/engine-water/water/native/WaterBodyComponent";
import { createWaterCreationPreset } from "@galacean/engine-water/water/native/WaterCreationPresets";
import { WATER_MATERIAL_TEXTURE_SLOTS } from "@galacean/engine-water/water/native/WaterMaterialTextureSlots";
import { writeWaterTerrainAssets } from "../src/spatial/runtime/NativeWaterEditor";
import { WorkerAgentScriptRuntime } from "@galacean/engine-ai-chat/ai-chat/agent-worker-runtime";
import { WorkerAgentScriptChecker } from "@galacean/engine-ai-chat/ai-chat/agent-worker-checker";
import { executeAgentEdit } from "@galacean/engine-ai-chat/ai-chat/agent-edit-execution";
import { AgentToolExecutionError, type AgentTool } from "@galacean/engine-ai-chat/ai-chat/agent-types";
import { toAgentToolOutput } from "@galacean/engine-ai-chat/ai-chat/agent-values";
import { withNativeEditingKnowledge } from "@galacean/engine-runtime-editor/runtime-editor-agent/runtime-native-knowledge";
import { createSeedWorldKnowledge } from "../../../world/demos/seed-world/agent-adapter/SeedWorldKnowledge";

const knowledge = () => createSeedWorldKnowledge(WATER_QUERY_CONTRACTS.map((item) => item.name));
const fixture = async () =>
  openWaterEditorFixture(
    `water-public:${crypto.randomUUID()}`,
    await (await fetch(BUILTIN_WATER_PROJECT_URL)).json(),
    BUILTIN_WATER_PROJECT_URL
  );
function bindings(tools: AgentTool[]) {
  return tools.map((tool) => ({
    name: tool.name,
    effect: tool.effect,
    async invoke(input: unknown, signal: AbortSignal) {
      try {
        const value = await tool.execute(tool.parseInput(input), { signal });
        return { ok: true as const, value: toAgentToolOutput(tool.parseOutput(value)) };
      } catch (error) {
        return {
          ok: false as const,
          error: {
            code: error instanceof AgentToolExecutionError ? error.code : "TOOL_EXECUTION_FAILED",
            message: String(error),
            executed: error instanceof AgentToolExecutionError ? error.executed : true
          }
        };
      }
    }
  }));
}
it("uses the real checked Worker for public Source edits and generated Water read APIs", async () => {
  const current = await fixture(),
    checker = new WorkerAgentScriptChecker(),
    runtime = new WorkerAgentScriptRuntime();
  const reads = createNativeWaterAgentPackage(
    { project: current.project, editor: current.native, system: () => current.system },
    knowledge()
  );
  const declarations = withNativeEditingKnowledge(knowledge()).modules;
  try {
    await current.water.execute(async () => {});
    expect(reads.tools.every((tool) => tool.effect === "read")).toBe(true);
    expect(reads.tools.some((tool) => tool.name === "water.author")).toBe(false);
    const run = (source: string) =>
      executeAgentEdit(
        runtime,
        checker,
        {
          id: crypto.randomUUID(),
          source,
          toolBindings: bindings([...current.native.tools, ...reads.tools]),
          signal: new AbortController().signal,
          maxToolCalls: 40,
          timeoutMs: 120000
        },
        declarations,
        (signal) => {
          const transaction = current.native.beginEdit(crypto.randomUUID(), signal);
          return { transaction, toolBindings: bindings(transaction.tools) };
        }
      );
    const result = await run(`
      const scene=${JSON.stringify(current.project.projectPackage.project.scene)};
      const existing=(await editor.component.query({scene,type:"WaterBodyComponent"})).items[0];
      const original=await editor.component.read({scene,id:existing.id});
      const entity=await editor.entity.create({scene,name:"Worker Water"});
      const added=await editor.component.add({scene,entityId:entity.id,type:"WaterBodyComponent",props:original.props});
      const record=await editor.component.read({scene,id:added.id});
      const input=record.props?.authoring;
      if(!input || typeof input!=="object" || Array.isArray(input)) throw Error("Missing authoring");
      await editor.component.update({scene,id:added.id,props:{authoring:{...input,priority:0,visible:false}}});
      const updated=await editor.component.read({scene,id:added.id});
      return {id:added.id,authoring:updated.props?.authoring};
    `);
    expect(result.ok, JSON.stringify(result)).toBe(true);
    const target = current.editor.projection
      .queryComponents({ type: "WaterBodyComponent" })
      .find((identity) => current.editor.projection.readEntity(identity.entityId).name === "Worker Water")!;
    expect(target).toBeDefined();
    const body = current.editor.projection.component(target.id) as WaterBodyComponent;
    expect(body.authoring).toMatchObject({ priority: 0, visible: false });
    const targetInput = JSON.stringify({ scene: target.scene, id: target.id });
    const verified = await run(`const target=${targetInput};
      const capabilities=await tools.water.capabilities({target});
      const verified=await tools.water.verify({target});
      const sample=await tools.water.sample({target,x:4,z:4});
      const drops=await tools.water.sampleDrops({target,x:4,y:0,z:4});
      const diagnostics=await tools.water.diagnostics({target});
      return {capabilities,verified,sample,drops,diagnostics};`);
    expect(verified.ok, JSON.stringify(verified)).toBe(true);
    const before = current.project.publicationRevision;
    const rejected = await run(`const target=${targetInput}; const record=await editor.component.read(target);
      const input=record.props?.authoring;
      if(!input || typeof input!=="object" || Array.isArray(input)) throw Error("Missing authoring");
      await editor.component.update({...target,props:{authoring:{...input,priority:Infinity}}});`);
    expect(rejected.ok).toBe(false);
    expect(current.project.publicationRevision).toBe(before);
    expect((await run(`return await tools.water.verify({target:${targetInput},expectedRevision:999999});`)).ok).toBe(
      false
    );
    expect(
      (
        await run(
          `return await tools.water.diagnostics({target:{scene:"Wrong.scene",id:${JSON.stringify(target.id)}}});`
        )
      ).ok
    ).toBe(false);
    expect((await run(`return await tools.water.author({operation:"list"});`)).ok).toBe(false);
    expect((await run(`await editor.component.update({...${targetInput},props:{enabled:false}});`)).ok).toBe(true);
    const disabled = await run(`return await tools.water.verify({target:${targetInput}});`);
    expect(disabled.ok, JSON.stringify(disabled)).toBe(true);
    if (disabled.ok) expect(disabled.output).toMatchObject({ enabled: false, active: false });
    expect((await run(`await editor.component.update({...${targetInput},props:{enabled:true}});`)).ok).toBe(true);
    const published = current.system.sample(4, 4, body.waterId);
    const shape = (current.editor.projection.component(target.id) as WaterBodyComponent).authoring!.shape;
    const failed = await current.water.change({
      operation: "update",
      id: target.id,
      patch: { shape: { ...shape, basin: { depthM: 3, bankWidthM: 1, carve: true } } as typeof shape }
    });
    expect(failed.runtimeError).toContain("cannot carve a lake basin");
    expect(current.system.sample(4, 4, body.waterId).surfaceElevationMetres).toBe(published.surfaceElevationMetres);
    const diagnostics = await run(`return await tools.water.diagnostics({target:${targetInput}});`);
    expect(diagnostics.ok, JSON.stringify(diagnostics)).toBe(true);
    if (diagnostics.ok)
      expect(diagnostics.output).toMatchObject({ bodies: [{ published: true, lastError: expect.any(String) }] });
    expect((await run(`return await tools.water.verify({target:${targetInput}});`)).ok).toBe(false);
    expect((await current.water.history("undo")).runtimeError).toBeUndefined();
    await current.water.execute((edit) => publicCall(edit, "component.remove", { scene: target.scene, id: target.id }));
    expect((await run(`return await tools.water.verify({target:${targetInput}});`)).ok).toBe(false);
  } finally {
    checker.dispose();
    await current.close();
  }
});

it.each(["lake", "river", "ocean"] as const)(
  "edits and clears every %s texture slot without changing other slots",
  async (kind) => {
    const current = await fixture();
    try {
      await current.water.execute(async () => {});
      const existing = current.editor.projection.queryComponents({ type: "WaterBodyComponent" })[0];
      let id = existing.id;
      if (kind !== "lake") {
        await current.water.execute((edit) => publicCall(edit, "component.remove", { scene: existing.scene, id }));
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
        id = created.value;
      }
      const path = `Water/Materials/${kind}.mat`;
      const original = JSON.parse(current.project.projectPackage.contents[path] as string);
      const authorBefore = current.editor.projection.readComponent(current.editor.projection.queryComponents({ id })[0])
        .props!.authoring;
      const parameters = structuredClone(original);
      parameters.shaderData.material_Water_optics_profile_roughness.value = 0;
      parameters.shaderData.material_Water_appearance_appearance_refraction_enabled.value = false;
      expect(
        (
          await current.water.execute((edit) =>
            publicCall(edit, "asset.update", { path, content: JSON.stringify(parameters) })
          )
        ).runtimeError
      ).toBeUndefined();
      const updatedMaterial = JSON.parse(current.project.projectPackage.contents[path] as string);
      expect(updatedMaterial.shaderData.material_Water_optics_profile_roughness.value).toBe(0);
      expect(updatedMaterial.shaderData.material_Water_appearance_appearance_refraction_enabled.value).toBe(false);
      expect(
        current.editor.projection.readComponent(current.editor.projection.queryComponents({ id })[0]).props!.authoring
      ).toEqual(authorBefore);
      for (const { slot } of WATER_MATERIAL_TEXTURE_SLOTS[kind]) {
        const next = structuredClone(original);
        next.shaderData[slot].value = null;
        expect(
          (
            await current.water.execute((edit) =>
              publicCall(edit, "asset.update", { path, content: JSON.stringify(next) })
            )
          ).runtimeError
        ).toBeUndefined();
        const saved = JSON.parse(current.project.projectPackage.contents[path] as string);
        expect(saved).toEqual(next);
        const body = () => current.editor.projection.component(id) as WaterBodyComponent;
        expect(body().authoring!.material.shaderData.getTexture(slot)).toBeNull();
        expect(
          (
            await current.water.execute((edit) =>
              publicCall(edit, "asset.update", { path, content: JSON.stringify(original) })
            )
          ).runtimeError
        ).toBeUndefined();
        expect(body().authoring!.material.shaderData.getTexture(slot)).toBeDefined();
      }
      if (kind !== "lake") {
        const next = structuredClone(original),
          slots = WATER_MATERIAL_TEXTURE_SLOTS[kind];
        next.shaderData[slots[slots.length - 1].slot].value = next.shaderData[slots[0].slot].value;
        const before = current.project.publicationRevision;
        await expect(
          current.water.execute((edit) => publicCall(edit, "asset.update", { path, content: JSON.stringify(next) }))
        ).rejects.toThrow("color space");
        expect(current.project.publicationRevision).toBe(before);
      }
    } finally {
      await current.close();
    }
  }
);

it("makes the native panel use the same public transactions, slot metadata and history", async () => {
  const current = await fixture();
  let panel: ReturnType<typeof mountNativeWaterPanel> | undefined;
  try {
    await current.water.execute(async () => {});
    panel = mountNativeWaterPanel(current.project, current.native);
    const element = document.querySelector<HTMLDetailsElement>("#native-water-editor")!;
    element.open = true;
    const sourceId = current.editor.projection.queryComponents({ type: "WaterBodyComponent" })[0].id;
    const body = () => current.editor.projection.component(sourceId) as WaterBodyComponent;
    const changed = async (selector: string) => {
      element.querySelector("output")!.textContent = "";
      element.querySelector<HTMLButtonElement>(selector)!.click();
      const start = performance.now();
      while (!element.querySelector("output")!.textContent && performance.now() - start < 30000)
        await new Promise((resolve) => setTimeout(resolve, 20));
      expect(element.querySelector("output")!.textContent).toContain("运行已更新");
    };
    element.querySelector<HTMLInputElement>("[data-visible]")!.checked = false;
    await changed("[data-apply]");
    expect(body().authoring!.visible).toBe(false);
    await changed("[data-undo]");
    expect(body().authoring!.visible).toBe(true);
    const slots = element.querySelector<HTMLSelectElement>("[data-slot]")!;
    expect(slots.options.length).toBe(2);
    const other = body().authoring!.material.shaderData.getTexture(slots.options[1].value);
    element.querySelector<HTMLInputElement>("[data-texture]")!.value = "";
    await changed("[data-texture-reference]");
    expect(body().authoring!.material.shaderData.getTexture(slots.value)).toBeNull();
    expect(body().authoring!.material.shaderData.getTexture(slots.options[1].value)).toBe(other);
    await changed("[data-undo]");
    expect(body().authoring!.material.shaderData.getTexture(slots.value)).toBeDefined();
  } finally {
    await panel?.stop();
    panel?.destroy();
    await current.close();
  }
});
