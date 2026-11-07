import { toAgentValue } from "@galacean/engine-ai-chat/ai-chat/agent-values.ts";
import { createAgentEditorFacade } from "@galacean/engine-ai-chat/ai-chat/agent-editor-facade.ts";
import { nativeFixture } from "./native-fixtures";
import { afterEach, expect, it } from "vitest";
import { createFarmingAgentPackage } from "../../src/farming/native/FarmingAgent";
import { FARMING_API_CONTRACT } from "../../src/farming/native/FarmingAPI";
import { AgentJavaScriptChecker } from "@galacean/engine-ai-chat/ai-chat/agent-script-checker.ts";
import { agentTypecheckLibraries } from "@galacean/engine-ai-chat/script-checking/typecheck-libraries.ts";
import { JavaScriptAgentScriptRuntime } from "@galacean/engine-ai-chat/ai-chat/agent-script-runtime.ts";
import { executeAgentEdit } from "@galacean/engine-ai-chat/ai-chat/agent-edit-execution.ts";
import { readFileSync } from "node:fs";

const fixtures: ReturnType<typeof nativeFixture>[] = [];
afterEach(async () => { for (const f of fixtures.splice(0)) await f.system.dispose(); });
const checker = new AgentJavaScriptChecker(agentTypecheckLibraries);
it("typechecks published operation examples against the actual Editor proxy declarations", async () => {
  const f = nativeFixture(); fixtures.push(f); await f.ready;
  const pkg = createFarmingAgentPackage(f.api);
  const document = readFileSync(new URL("../../src/skills/farming/references/overview.md", import.meta.url), "utf8");
  const examples = [...document.matchAll(/```js\n([\s\S]*?)```/g)].map(match => match[1]);
  expect(examples).toHaveLength(2);
  // Bind the helper's receiver to the real query return type so untyped JS parameters cannot hide contract drift.
  const plant = `
    const [farm] = await editor.component.query({type:"FarmingAreaComponent"});
    ${examples[0].replace("plantCrop(farm, plotId, cropId)", "plantCrop(plotId, cropId)")}
    return await plantCrop("selected-plot", "selected-crop");
  `;
  for (const source of [plant, examples[1]]) expect(checker.check(source, pkg.definition.scriptApi.modules)).toBeUndefined();
});
it("exposes every farm-scoped operation as a typed identity-bound method", async () => {
  const f = nativeFixture(); fixtures.push(f); await f.ready;
  const pkg = createFarmingAgentPackage(f.api);
  const methods = pkg.definition.editorComponents![0].methods;
  expect(Object.keys(methods).sort()).toEqual(Object.keys(FARMING_API_CONTRACT).filter(name => name !== "list").map(name => name === "get" ? "read" : name).sort());
  const source = `
    const [farm] = await editor.component.query({type: "FarmingAreaComponent", farmId: "native-farm"});
    const before = await farm.read();
    await farm.plant({plotId:"native/a", seedId:"berry-seed"}, {commandId:"proxy-plant"});
    const plot = await farm.getPlot({plotId:"native/a"});
    const receipt = await farm.verify({commandId:"proxy-plant"});
    return { farm, crop:plot.value?.crop?.cropId, revision:receipt.value.context.revision, previous: before.value.revision };
  `;
  const result = await executeAgentEdit(new JavaScriptAgentScriptRuntime(), {
    check: async (source, modules) => checker.check(source, modules)
  }, {
    id: "farming-proxy", source, editorComponents: pkg.definition.editorComponents,
    signal: new AbortController().signal, maxToolCalls: 10, timeoutMs: 10000,
    toolBindings: pkg.tools.map(tool => ({name:tool.name, effect:tool.effect, describeCommand:tool.describeCommand,
      invoke: async (input, signal) => ({ ok: true as const, value: toAgentValue(tool.parseOutput(await tool.execute(tool.parseInput(input), { signal }))) }) }))
  }, pkg.definition.scriptApi.modules);
  expect(result).toMatchObject({ok:true, output:{farm:{farmId:"native-farm"},crop:"berry",revision:3,previous:0},receipt:{commands:[{commandId:"proxy-plant",ok:true,revision:3}]}});
});
it("rejects engine-style synchronous access, wrong arguments and missing harvest identity before execution", async () => {
  const f = nativeFixture(); fixtures.push(f); await f.ready;
  const pkg = createFarmingAgentPackage(f.api);
  for (const statement of [
    `const farms = editor.component.query({type:"FarmingAreaComponent"}); return await farms.read();`,
    `const [farm] = await editor.component.query({type:"FarmingAreaComponent"}); return await farm.harvest({plotId:"p"});`,
    `const [farm] = await editor.component.query({type:"FarmingAreaComponent"}); return await farm.irrigate({farmId:"other", plotId:"p"});`
  ]) {
    expect(checker.check(`${statement}`, pkg.definition.scriptApi.modules)).toBeDefined();
  }
});

it("executes all farming operations through the Editor facade and verifies farming state", async () => {
  const f = nativeFixture(); fixtures.push(f); await f.ready;
  f.area.coordinator.presentation = {
    prepare: async () => true,
    getTarget: () => ({ plotId: "native/a", ground: null })
  };
  const pkg = createFarmingAgentPackage(f.api);
  const covered = new Set<string>();
  const editor = createAgentEditorFacade(pkg.definition.editorComponents!, async (name, input) => {
    covered.add(name === "farming.component.query" ? "list" : name.slice("farming.component.".length));
    const tool = pkg.tools.find(tool => tool.name === name)!;
    const output = toAgentValue(tool.parseOutput(await tool.execute(tool.parseInput(input), {signal:new AbortController().signal})));
    return output;
  });
  const [ref] = await editor.component.query({type:"FarmingAreaComponent", farmId:"native-farm"});
  const farm = ref as any;
  expect((await farm.read()).value.farmId).toBe("native-farm");
  expect((await farm.capabilities()).value.operations).toContain("plant");
  expect((await farm.getDiagnostics()).ok).toBe(true);
  expect((await farm.getCatalog()).value.seeds.some((seed: any) => seed.id === "berry-seed")).toBe(true);
  expect((await farm.getTarget()).value.plotId).toBe("native/a");
  expect((await farm.queryPlots({})).value).toHaveLength(1);
  expect((await farm.getEnvironment()).ok).toBe(true);
  const plot = (await farm.getPlot({plotId:"native/a"})).value;
  const target = {groundId:plot.groundId, cellX:plot.cellX, cellZ:plot.cellZ};
  expect((await farm.inspectCultivation({target})).value.canCultivate).toBe(true);
  expect((await farm.getAvailableActions({target:"native/a"})).value.length).toBeGreaterThan(0);
  await farm.updatePlot({plotId:"native/a",patch:{label:"代理试验田"}});
  expect(f.area.service.getPlot("native/a")!.label).toBe("代理试验田");
  await farm.generateItems({itemType:"harvest-basket",count:1,groundId:target.groundId,position:[20,0,20]});
  const [emptyBasket] = (await farm.queryItems({query:{type:"harvest-basket"}})).value;
  await farm.pickupItem({itemId:emptyBasket.id,dropPosition:[22,0,20]});
  await expect(farm.useCarriedItem({target})).rejects.toThrow("当前携带物不能操作此目标");
  expect(f.area.service.getSnapshot().plots[0].soil.preparation).toBe("leveled");
  await farm.updatePlot({plotId:"native/a",patch:{preparation:"leveled"}});
  expect(farm.rake).toBeUndefined();
  expect(f.area.service.getSnapshot().plots.find(plot => plot.plotId === "native/a")!.soil.preparation).toBe("leveled");
  await farm.plant({plotId:"native/a",seedId:"berry-seed"}, {commandId:"matrix-plant"});
  await farm.irrigate({plotId:"native/a"});
  expect((await farm.getFieldValues({fieldId:"soilMoisture",plotIds:["native/a"]})).ok).toBe(true);
  // One watering starts at 80%. The linear 20–100% moisture curve needs 15s to mature.
  f.clock.advanceBy(15000);
  await f.area.service.checkpoint();
  const mature = (await farm.getPlot({plotId:"native/a"})).value.crop;
  expect(mature.mature).toBe(true);
  const damaged = await farm.damageCrop({plotId:"native/a",cropInstanceId:mature.instanceId,damagePermille:100,source:"storm"});
  expect(damaged).toMatchObject({ok:true,value:{damage:{actualDamagePermille:100,healthPermille:900}}});
  expect(f.area.service.getPlot("native/a")!.crop!.healthPermille).toBe(900);
  const harvested = await farm.harvest({plotId:"native/a",cropInstanceId:mature.instanceId}, {commandId:"matrix-harvest"});
  expect(harvested.value.receipt.ok).toBe(true);
  expect((await farm.getPlot({plotId:"native/a"})).value.crop).toBeNull();
  const totals = (await farm.getItemTotals()).value;
  expect(totals.stored).toEqual({});
  expect(totals.pending["berry-fruit"]).toBeGreaterThan(0);
  const basket = (await farm.getCarry()).value.item;
  expect(basket.type).toBe("harvest-basket");
  await expect(farm.consumeBasket({basketId:basket.id,cropId:"berry",itemId:"berry-fruit",quantity:1}))
    .rejects.toMatchObject({code:"ITEM_CHANGED"});
  expect((await farm.getItemTotals({})).value).toEqual(totals);
  await farm.placeItem({expectedItemId:basket.id,groundId:basket.groundId,position:[24,0,20]});
  expect((await farm.getCarry()).value.carried).toBeNull();
  expect((await farm.getItemTotals()).value).toEqual(totals);
  await farm.pickupItem({itemId:basket.id,dropPosition:[26,0,20]});
  await farm.unloadBasket({basketId:basket.id});
  expect((await farm.getItemTotals()).value.pending).toEqual({});
  const inventory = (await farm.getInventory()).value;
  expect(inventory["berry-fruit"]).toBeGreaterThan(0);
  expect((await farm.getContainers({})).value.some((container: any) => container.quantity > 0)).toBe(true);
  await farm.setContainerCount({typeId:"basket",count:3});
  expect(f.area.service.getContainers({typeId:"basket"})).toHaveLength(3);
  await farm.withdrawInventory({itemId:"berry-fruit",quantity:inventory["berry-fruit"]});
  expect(f.area.service.getInventory()).toEqual({});
  expect((await farm.verify({commandId:"matrix-harvest"})).value.receipt.commandId).toBe("matrix-harvest");
  f.clock.advanceBy(600000);
  await f.area.service.checkpoint();
  await farm.hoe({target,expectedCropInstanceId:null});
  expect(f.area.service.getPlot("native/a")).toBeNull();
  const created = await farm.createPlot({target:{...target,cellX:target.cellX+3}});
  const newId = created.value.receipt.changes.find((change:any) => change.kind === "plot-created").plotId;
  expect(f.area.service.getPlot(newId)).not.toBeNull();
  await farm.deletePlot({plotId:newId});
  expect(f.area.service.getPlot(newId)).toBeNull();
  expect([...covered].sort()).toEqual(Object.keys(FARMING_API_CONTRACT).sort());
});


it("keeps system diagnostics discoverable without an initialized area and exposes no legacy execute tool",async()=>{
  const f=nativeFixture();fixtures.push(f);await f.ready;await f.area.dispose();
  const pkg=createFarmingAgentPackage(f.api);
  expect(pkg.tools.some(tool=>tool.name==="farming.execute")).toBe(false);
  const source='const [system]=await editor.component.query({type:"FarmingSystem"});return await system.getDiagnostics();';
  expect(checker.check(source,pkg.definition.scriptApi.modules)).toBeUndefined();
  const editor=createAgentEditorFacade(pkg.definition.editorComponents!,async(name,input)=>{
    const tool=pkg.tools.find(tool=>tool.name===name)!;
    return toAgentValue(await tool.execute(tool.parseInput(input),{signal:new AbortController().signal}));
  });
  expect(await editor.component.query({type:"FarmingAreaComponent"})).toEqual([]);
  const [system]=await editor.component.query({type:"FarmingSystem"});
  expect((await (system as any).getDiagnostics()).ok).toBe(true);
});
