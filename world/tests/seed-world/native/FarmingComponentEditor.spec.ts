import { afterEach, expect, it } from "vitest";
import { nativeFixture } from "../../../../packages/farming/tests/native/native-fixtures";
import { FarmingSystem } from "@galacean/engine-farming/farming/native/FarmingSystem.ts";
import { createFarmingComponentExtension } from "@galacean/engine-runtime-editor/farming/FarmingComponentEditor.ts";
import { FARMING_API_CONTRACT } from "@galacean/engine-farming/farming/native/FarmingAPI.ts";
import { createAgentEditorFacade } from "@galacean/engine-ai-chat/ai-chat/agent-editor-facade.ts";
import { toAgentValue } from "@galacean/engine-ai-chat/ai-chat/agent-values.ts";
import { AgentJavaScriptChecker } from "@galacean/engine-ai-chat/ai-chat/agent-script-checker.ts";
import { agentTypecheckLibraries } from "@galacean/engine-ai-chat/script-checking/typecheck-libraries.ts";
import { JavaScriptAgentScriptRuntime } from "@galacean/engine-ai-chat/ai-chat/agent-script-runtime.ts";
import { executeAgentEdit } from "@galacean/engine-ai-chat/ai-chat/agent-edit-execution.ts";
import { withNativeEditingKnowledge } from "@galacean/engine-runtime-editor/runtime-editor-agent/runtime-native-knowledge.ts";
import { readFileSync } from "node:fs";
import { MemoryFarmRepository } from "@galacean/engine-farming/farming/persistence/MemoryFarmRepository.ts";

const fixtures: ReturnType<typeof nativeFixture>[] = [];
afterEach(async () => { for (const f of fixtures.splice(0)) await f.system.dispose(); });
const checker = new AgentJavaScriptChecker(agentTypecheckLibraries);
async function fixture(...args: Parameters<typeof nativeFixture>) {
  const f = nativeFixture(...args); fixtures.push(f); await f.ready;
  const identity = {scene:"Farm.scene", entityId:"farm-owner", id:"farm-system", type:"FarmingSystem"};
  let mounted = true;
  const extension = createFarmingComponentExtension({
    queryComponents: selector => mounted && (!selector?.id || selector.id === identity.id) ? [identity] : [],
    resolveComponent: value => {
      if (!mounted || Object.entries(identity).some(([key, text]) => value[key as keyof typeof value] !== text)) throw new Error("Component removed");
      return f.system;
    }
  });
  const covered = new Set<string>();
  const editor = createAgentEditorFacade(extension.definition.editorComponents!, async (name, input) => {
    if (name.includes(".methods.")) covered.add(name.split(".methods.")[1]);
    const tool = extension.tools.find(tool => tool.name === name)!;
    const result = tool.parseOutput(await tool.execute(tool.parseInput(input), {signal: new AbortController().signal}));
    return toAgentValue(result);
  });
  const [farm] = await editor.component.query({type:"FarmingSystem", scene: identity.scene});
  return {f, extension, editor, identity, farm: farm as any, covered, remove: () => {mounted = false;}};
}

it("executes every farming operation through a source-identity component proxy", async () => {
  const {f, farm, covered} = await fixture();
  f.area.coordinator.presentation = {
    prepare: async () => true,
    getTarget: () => ({ plotId: "native/a", ground: null })
  };
  const farmId = (await farm.list()).value[0].farmId;
  expect((await farm.get({farmId})).value.farmId).toBe("native-farm");
  expect((await farm.capabilities({farmId})).value.operations).toContain("plant");
  expect((await farm.capabilities()).value).toMatchObject({ scope: {kind: "system", farmId: null}, interactionHostBound: null, targetQueryAvailable: null });
  expect((await farm.capabilities({farmId})).value).toMatchObject({ scope: {kind: "farm", farmId}, interactionHostBound: true, targetQueryAvailable: true, presentation: true });
  expect((await farm.getDiagnostics({farmId})).value.scope).toEqual({kind: "farm", farmId});
  expect((await farm.getDiagnostics({farmId})).ok).toBe(true);
  expect((await farm.getCatalog({farmId})).value.seeds.some((seed: any) => seed.id === "berry-seed")).toBe(true);
  expect((await farm.getTarget({farmId})).value.plotId).toBe("native/a");
  expect((await farm.queryPlots({farmId})).value).toHaveLength(1);
  expect((await farm.getEnvironment({farmId})).ok).toBe(true);
  const plot = (await farm.getPlot({farmId,plotId:"native/a"})).value;
  const target = {groundId:plot.groundId, cellX:plot.cellX, cellZ:plot.cellZ};
  expect((await farm.inspectCultivation({farmId,target})).value.canCultivate).toBe(true);
  expect((await farm.getAvailableActions({farmId,target:"native/a"})).value.length).toBeGreaterThan(0);
  await farm.updatePlot({farmId,plotId:"native/a",patch:{label:"代理试验田"}});
  expect(f.area.service.getPlot("native/a")!.label).toBe("代理试验田");
  await farm.generateItems({farmId,itemType:"harvest-basket",count:1,groundId:target.groundId,position:[20,0,20]});
  const [emptyBasket] = (await farm.queryItems({farmId,query:{type:"harvest-basket"}})).value;
  await farm.pickupItem({farmId,itemId:emptyBasket.id,dropPosition:[22,0,20]});
  await expect(farm.useCarriedItem({farmId,target})).rejects.toThrow("当前携带物不能操作此目标");
  expect(f.area.service.getSnapshot().plots[0].soil.preparation).toBe("leveled");
  await farm.updatePlot({farmId,plotId:"native/a",patch:{preparation:"leveled"}});
  expect(farm.rake).toBeUndefined();
  expect(f.area.service.getSnapshot().plots.find(plot => plot.plotId === "native/a")!.soil.preparation).toBe("leveled");
  await farm.plant({farmId,plotId:"native/a",seedId:"berry-seed"}, {commandId:"matrix-plant"});
  await farm.irrigate({farmId,plotId:"native/a"});
  expect((await farm.getFieldValues({farmId,fieldId:"soilMoisture",plotIds:["native/a"]})).ok).toBe(true);
  // One watering starts at 80%. The linear 20–100% moisture curve needs 15s to mature.
  f.clock.advanceBy(15000);
  await f.area.service.checkpoint();
  const mature = (await farm.getPlot({farmId,plotId:"native/a"})).value.crop;
  expect(mature.mature).toBe(true);
  const damaged = await farm.damageCrop({farmId,plotId:"native/a",cropInstanceId:mature.instanceId,damagePermille:100,source:"storm"});
  expect(damaged).toMatchObject({ok:true,value:{damage:{actualDamagePermille:100,healthPermille:900}}});
  expect(f.area.service.getPlot("native/a")!.crop!.healthPermille).toBe(900);
  const harvested = await farm.harvest({farmId,plotId:"native/a",cropInstanceId:mature.instanceId}, {commandId:"matrix-harvest"});
  expect(harvested.value.receipt.ok).toBe(true);
  expect((await farm.getPlot({farmId,plotId:"native/a"})).value.crop).toBeNull();
  const totals = (await farm.getItemTotals({farmId})).value;
  expect(totals.stored).toEqual({});
  expect(totals.pending["berry-fruit"]).toBeGreaterThan(0);
  const basket = (await farm.getCarry({farmId})).value.item;
  expect(basket.type).toBe("harvest-basket");
  await expect(farm.consumeBasket({farmId,basketId:basket.id,cropId:"berry",itemId:"berry-fruit",quantity:1}))
    .rejects.toMatchObject({code:"ITEM_CHANGED"});
  expect((await farm.getItemTotals({farmId})).value).toEqual(totals);
  await farm.placeItem({farmId,expectedItemId:basket.id,groundId:basket.groundId,position:[24,0,20]});
  expect((await farm.getCarry({farmId})).value.carried).toBeNull();
  expect((await farm.getItemTotals({farmId})).value).toEqual(totals);
  await farm.pickupItem({farmId,itemId:basket.id,dropPosition:[26,0,20]});
  await farm.unloadBasket({farmId,basketId:basket.id});
  expect((await farm.getItemTotals({farmId})).value.pending).toEqual({});
  const inventory = (await farm.getInventory({farmId})).value;
  expect(inventory["berry-fruit"]).toBeGreaterThan(0);
  expect((await farm.getContainers({farmId})).value.some((container: any) => container.quantity > 0)).toBe(true);
  await farm.setContainerCount({farmId,typeId:"basket",count:3});
  expect(f.area.service.getContainers({typeId:"basket"})).toHaveLength(3);
  await farm.withdrawInventory({farmId,itemId:"berry-fruit",quantity:inventory["berry-fruit"]});
  expect(f.area.service.getInventory()).toEqual({});
  expect((await farm.verify({farmId,commandId:"matrix-harvest"})).value.receipt.commandId).toBe("matrix-harvest");
  f.clock.advanceBy(600000);
  await f.area.service.checkpoint();
  await farm.hoe({farmId,target,expectedCropInstanceId:null});
  expect(f.area.service.getPlot("native/a")).toBeNull();
  const created = await farm.createPlot({farmId,target:{...target,cellX:target.cellX+3}});
  const newId = created.value.receipt.changes.find((change:any) => change.kind === "plot-created").plotId;
  expect(f.area.service.getPlot(newId)).not.toBeNull();
  await farm.deletePlot({farmId,plotId:newId});
  expect(f.area.service.getPlot(newId)).toBeNull();
  expect([...covered].sort()).toEqual(Object.keys(FARMING_API_CONTRACT).sort());
});

it("checks public examples and rejects obsolete region identity and missing command targets", async () => {
  const {extension} = await fixture();
  const document = readFileSync(new URL("../../../../packages/farming/src/skills/farming/SKILL.md", import.meta.url), "utf8");
  expect((extension.definition.scriptApi as any).skills?.find((skill: any) => skill.name === "farming")?.content.trim()).toBe(document.trim());
  const examples = [...document.matchAll(/```js\n([\s\S]*?)```/g)].map(match => match[1]);
  expect(examples.length).toBeGreaterThan(0);
  const modules = withNativeEditingKnowledge(extension.definition.scriptApi).modules;
  for (const source of examples) expect(checker.check(source, modules)).toBeUndefined();
  for (const source of [
    'await editor.component.query({type:"FarmingSystem",farmId:"native-farm"});',
    'const [system]=await editor.component.query({type:"FarmingSystem"}); await system.plant({plotId:"native/a",seedId:"berry-seed"});'
  ]) expect(checker.check(source, modules)).toBeDefined();
});

it("invalidates a deleted component proxy and does not expose a fabricated singleton", async () => {
  const {farm, editor, identity, remove, f} = await fixture();
  expect(farm).toEqual(identity);
  await f.area.dispose();
  expect((await farm.list()).value).toEqual([]);
  expect((await farm.getDiagnostics()).ok).toBe(true);
  remove();
  expect(await editor.component.query({type:"FarmingSystem"})).toEqual([]);
  await expect(farm.list()).rejects.toThrow("Component removed");
});

it("retains command receipts and saved effects when a later script step fails", async () => {
  const {f, extension} = await fixture();
  const source = `
    const [system] = await editor.component.query({type:"FarmingSystem"});
    const farms = (await system.list()).value;
    await system.plant({farmId:farms[0].farmId,plotId:"native/a",seedId:"berry-seed"},{commandId:"component-plant"});
    throw new Error("later failure");
  `;
  const result = await executeAgentEdit(new JavaScriptAgentScriptRuntime(), {
    check: async (source, modules) => checker.check(source, modules)
  }, {
    id:"farming-component",source,editorComponents:extension.definition.editorComponents,
    signal:new AbortController().signal,maxToolCalls:10,timeoutMs:10000,
    toolBindings:extension.tools.map(tool=>({name:tool.name,effect:tool.effect,describeCommand:tool.describeCommand,
      invoke:async(input,signal)=>({ok:true as const,value:toAgentValue(tool.parseOutput(await tool.execute(tool.parseInput(input),{signal})))})}))
  },extension.definition.scriptApi.modules);
  expect(result.receipt).toMatchObject({status:"interrupted",commands:[{scopeId:"native-farm",commandId:"component-plant",ok:true,revision:3}]});
  expect(f.area.service.getPlot("native/a")?.crop?.cropId).toBe("berry");
});

it("validates request schemas before executing commands", async () => {
  const {farm, f, extension} = await fixture();
  expect(Object.keys(extension.definition.editorComponents![0].methods).sort()).toEqual(Object.keys(FARMING_API_CONTRACT).sort());
  await expect(farm.plant({plotId:"native/a",seedId:"berry-seed"})).rejects.toThrow();
  await expect(farm.get({farmId:"native-farm"},{commandId:"invalid"})).rejects.toThrow();
  await expect(farm.plant({farmId:"native-farm",plotId:"native/a",seedId:"berry-seed",unknown:1})).rejects.toThrow();
  expect(f.area.service.getSnapshot().revision).toBe(0);
});

it("accepts a replacement after the old Engine component is destroyed but before onDestroy", async () => {
  const {f} = await fixture();
  Object.assign(f.system, {destroyed:true});
  const replacement = f.root("replacement").addComponent(FarmingSystem);
  try {
    expect(replacement.isDisposed).toBe(false);
    expect(f.system.isDisposed).toBe(true);
    expect(() => replacement.configureRuntime(() => ({} as never))).not.toThrow();
  } finally { await replacement.dispose(); }
});


it("exposes complete per-method return dependencies within the real read budget", async () => {
  const { createAgentProjectFiles } = await import("@galacean/engine-ai-chat/ai-chat/agent-project-files.ts");
  const { readAgentFile } = await import("@galacean/engine-ai-chat/ai-chat/agent-file-read.ts");
  const {extension} = await fixture();
  const files = createAgentProjectFiles(extension.definition.scriptApi);
  for (const method of ["getPlot", "queryPlots", "irrigate", "verify", "capabilities"]) {
    const {result} = await readAgentFile(files, {file_path: `declare/editor/farming/methods/${method}.md`, offset: 1, limit: 400});
    if (!("lines" in result)) throw new Error("Expected readable method contract");
    expect(result.next, method).toBeNull();
    const text = result.lines.map(line => line.text).join("\n");
    expect(text).toContain(`system.${method}`);
    expect(text).toContain("type Input =");
    expect(text).toContain("type Value =");
    expect(text).not.toContain("typeof farmingOperations");
    if (method === "getPlot" || method === "queryPlots") {
      expect(text).toContain("interface PlotState");
      expect(text).toContain("readonly soil: SoilState");
    }
  }
});


const skillRoot = new URL("../../../../packages/farming/src/skills/farming/", import.meta.url);
const jsBlocks = (file: string) => [...readFileSync(new URL(file, skillRoot), "utf8").matchAll(/```js\n([\s\S]*?)```/g)].map(match => match[1]);
const runScript = (extension: any, source: string) => executeAgentEdit(new JavaScriptAgentScriptRuntime(), {
  check: async (code: string, modules: any) => checker.check(code, modules)
}, {
  id: "doc-example", source, editorComponents: extension.definition.editorComponents,
  signal: new AbortController().signal, maxToolCalls: 40, timeoutMs: 10000,
  toolBindings: extension.tools.map((tool: any) => ({ name: tool.name, effect: tool.effect, describeCommand: tool.describeCommand,
    invoke: async (input: any, signal: any) => {
      try {
        return { ok: true as const, value: toAgentValue(tool.parseOutput(await tool.execute(tool.parseInput(input), { signal }))) };
      } catch (error: any) {
        return { ok: false as const, error: { code: error.code ?? "EXECUTION_FAILED", message: String(error), executed: error.executed, retryable: error.retryable, details: toAgentValue(error.details ?? null) } };
      }
    } }))
} as any, withNativeEditingKnowledge(extension.definition.scriptApi).modules);

it.each(["SKILL.md", "references/operations.md", "references/saves-and-assets.md"])("%s examples typecheck against the published surface", async file => {
  const {extension} = await fixture();
  const modules = withNativeEditingKnowledge(extension.definition.scriptApi).modules;
  const results = jsBlocks(file).map((source, index) => {
    const prefix = file.endsWith("operations.md") && index === 0 ? 'const system = (await editor.component.query({type:"FarmingSystem"}))[0]; const farmId = "f"; const plotId = "p"; const cropId = "c";\n' : "";
    return { index, error: checker.check(prefix + source, modules) };
  });
  expect(results.filter(result => result.error)).toEqual([]);
});

it("operations.md plant and harvest examples run on the published surface", async () => {
  const {extension, f} = await fixture();
  const [plant, harvest] = jsBlocks("references/operations.md");
  const head = 'const system = (await editor.component.query({type:"FarmingSystem"}))[0]; const farmId = (await system.list()).value[0].farmId; const plotId = "native/a"; const cropId = (await system.getCatalog({farmId})).value.seeds[0].cropId;\n';
  const planted: any = await runScript(extension, head + plant);
  expect(planted.receipt.status).toBe("completed");
  expect(f.area.service.getPlot("native/a")!.crop).toBeTruthy();
  const irrigated: any = await runScript(extension, head + 'await system.irrigate({farmId, plotId});');
  expect(irrigated.receipt.status).toBe("completed");
  f.clock.advanceBy(15000);
  await f.area.service.checkpoint();
  const reaped: any = await runScript(extension, harvest);
  expect(reaped.receipt.status).toBe("completed");
  expect(f.area.service.getPlot("native/a")!.crop ?? null).toBeNull();
});

async function matureFixture(plotIds: string[], overrides: Record<string, unknown> = {}) {
  const context = await fixture("native-farm", overrides as any, {plots: plotIds.map(id => ({id, label: id}))});
  const {f} = context;
  for (const plotId of plotIds) {
    await f.api.execute({operation: "plant", input: {farmId: f.area.farmId, plotId, seedId: "berry-seed"}} as any);
    await f.api.execute({operation: "irrigate", input: {farmId: f.area.farmId, plotId}} as any);
  }
  f.clock.advanceBy(15000);
  await f.area.service.checkpoint();
  return context;
}

it("operations.md harvest example finishes nine mature crops in bounded batches", async () => {
  const plotIds = Array.from({length: 9}, (_, i) => `native/${i}`);
  const {extension, f} = await matureFixture(plotIds);
  const harvest = jsBlocks("references/operations.md")[1];
  const harvested = new Set<string>();
  for (let i = 0; i < 5; i++) {
    const run: any = await runScript(extension, harvest);
    expect(run.receipt.status).toBe("completed");
    const output = run.result?.output ?? run.output ?? run.result;
    expect(output.remainingPlotIds).toHaveLength(Math.max(0, 9 - 2 * (i + 1)));
    for (const result of output.results) {
      expect(result.ok).toBe(true);
      expect(harvested.has(result.plotId)).toBe(false);
      harvested.add(result.plotId);
    }
  }
  expect(harvested.size).toBe(9);
  expect(f.area.service.queryPlots().every(plot => plot.crop === null)).toBe(true);
});

it("operations.md harvest example stops on a storage error and keeps the remaining targets", async () => {
  const repository = new MemoryFarmRepository();
  const plotIds = ["native/a", "native/b", "native/c"];
  const {extension, f} = await matureFixture(plotIds, {repository});
  repository.failNextTransaction = true;
  const run: any = await runScript(extension, jsBlocks("references/operations.md")[1]);
  const output = run.result?.output ?? run.output ?? run.result;
  expect(output.results).toHaveLength(1);
  expect(output.results[0].ok).toBe(false);
  expect(output.remainingPlotIds).toEqual(plotIds);
  expect(f.area.service.getSnapshot().inventory).toEqual({});
});
