import { JavaScriptAgentScriptRuntime } from "@galacean/engine-ai-chat/ai-chat/agent-script-runtime.ts";
import { AgentToolExecutionError, type AgentScriptToolBinding, type AgentValue } from "@galacean/engine-ai-chat/ai-chat/agent-types.ts";
import { toAgentValue } from "@galacean/engine-ai-chat/ai-chat/agent-values.ts";
import { createFarmingAgentPackage } from "../../src/farming/native/FarmingAgent";
import type { FarmingAPI } from "../../src/farming/native/FarmingAPI";
import type { FarmingRequest } from "../../src/farming/native/FarmingAPIContract";

export interface FarmingInstructionCase {
  readonly id: string;
  readonly request: string;
  readonly allowedOperations: readonly string[];
  readonly replay: string;
  readonly expectedError?: string;
  readonly expectedCallError?: string;
}
/** Same natural-language corpus for deterministic development and later real-model acceptance. */
export const FARMING_INSTRUCTION_CASES: readonly FarmingInstructionCase[] = [
  {
    id: "discover",
    request: "找到唯一种植区域，读取实际可用的种子、空地和操作能力。",
    allowedOperations: ["list", "getCatalog", "capabilities", "queryPlots"],
    replay: `const a=await callFarming({operation:'list',input:{}}); if(a.value.length!==1) throw new Error('ambiguous'); const farmId=a.value[0].farmId; await callFarming({operation:'getCatalog',input:{farmId}}); await callFarming({operation:'capabilities',input:{farmId}}); const p=await callFarming({operation:'queryPlots',input:{farmId,query:{occupied:false}}}); if(!p.value.length)throw new Error('no empty plot'); return {status:'applied',farmId};`
  },
  {
    id: "plant",
    request: "在指定空耕地播种 berry，并从目录取得 seedId，验证实际生成的作物实例。",
    allowedOperations: ["getCatalog", "plant", "getPlot", "verify"],
    replay: `const c=await callFarming({operation:'getCatalog',input:{farmId}}); const seed=c.value.seeds.find(s=>s.cropId==='berry'); if(!seed)throw new Error('seed missing'); const r=await callFarming({operation:'plant',input:{farmId,plotId,seedId:seed.id}}); await callFarming({operation:'verify',input:{farmId,commandId:r.value.receipt.commandId}}); const p=await callFarming({operation:'getPlot',input:{farmId,plotId}}); if(p.value.crop.cropId!=='berry'||!p.value.crop.instanceId)throw new Error('wrong crop'); return {status:'applied'};`
  },
  {
    id: "diagnose",
    request: "检查干燥作物为何成长缓慢，报告真实的限制因素，不修改状态。",
    allowedOperations: ["getPlot"],
    replay: `const p=await callFarming({operation:'getPlot',input:{farmId,plotId}}); if(p.value.crop.pausedReason!==null||p.value.crop.limitingFactorId!=='soilMoisture'||p.value.crop.growthCoefficientPermille!==200)throw new Error('missing diagnosis'); return {status:'applied',factor:p.value.crop.limitingFactorId,speed:p.value.crop.growthCoefficientPermille};`
  },
  {
    id: "irrigate",
    request: "给作物浇水，验证实际水量分配和土壤含水率；不宣称立即成熟。",
    allowedOperations: ["irrigate", "getFieldValues", "verify", "getPlot"],
    replay: `const r=await callFarming({operation:'irrigate',input:{farmId,plotId}}); const w=r.value.receipt.changes.find(c=>c.kind==='soil-irrigated').water; if(Math.abs(w.input-w.absorbed-w.distributed-w.lost)>1e-6)throw new Error('water not conserved'); const f=await callFarming({operation:'getFieldValues',input:{farmId,fieldId:'soilMoisture',plotIds:[plotId]}}); await callFarming({operation:'verify',input:{farmId,commandId:r.value.receipt.commandId}}); return {status:'applied',water:w,field:f.value};`
  },
  {
    id: "immature",
    request: "尝试收获尚未成熟的作物，应明确失败且不能增加库存。",
    allowedOperations: ["getPlot", "harvest"],
    expectedError: "CROP_NOT_MATURE",
    replay: `const p=await callFarming({operation:'getPlot',input:{farmId,plotId}}); return await callFarming({operation:'harvest',input:{farmId,plotId,cropInstanceId:p.value.crop.instanceId}});`
  },
  {
    id: "harvest",
    request: "收获成熟作物，验证地块腾空、产物进入持久篮子以及重复请求不重复产出。",
    allowedOperations: ["getPlot", "getItemTotals", "harvest", "verify"],
    replay: `const before=await callFarming({operation:'getItemTotals',input:{farmId}}); const p=await callFarming({operation:'getPlot',input:{farmId,plotId}}); if(!p.value.crop.mature)throw new Error('not mature'); const request={operation:'harvest',input:{farmId,plotId,cropInstanceId:p.value.crop.instanceId},options:{commandId:'instruction-harvest',expectedRevision:p.context.revision}}; const r=await callFarming(request); const replay=await callFarming(request); if(!replay.value.receipt.replayed)throw new Error('not replayed'); const c=r.value.receipt.changes.find(c=>c.kind==='crop-harvested'); const after=await callFarming({operation:'getItemTotals',input:{farmId}}); if((after.value.pending[c.itemId]||0)-(before.value.pending[c.itemId]||0)!==c.quantity)throw new Error('wrong yield'); const empty=await callFarming({operation:'getPlot',input:{farmId,plotId}}); if(empty.value.crop!==null)throw new Error('occupied after harvest'); await callFarming({operation:'verify',input:{farmId,commandId:r.value.receipt.commandId}}); return {status:'applied',quantity:c.quantity};`
  },
  {
    id: "hoe",
    request: "重新锄地移除作物，不产生收获。",
    allowedOperations: ["getPlot", "getInventory", "hoe"],
    replay: `const before=await callFarming({operation:'getInventory',input:{farmId}}); const p=await callFarming({operation:'getPlot',input:{farmId,plotId}}); await callFarming({operation:'hoe',input:{farmId,target:{groundId:p.value.groundId,cellX:p.value.cellX,cellZ:p.value.cellZ},expectedCropInstanceId:p.value.occupantId}}); const after=await callFarming({operation:'getInventory',input:{farmId}}); const empty=await callFarming({operation:'getPlot',input:{farmId,plotId}}); if(empty.value.crop!==null||JSON.stringify(before.value)!==JSON.stringify(after.value))throw new Error('hoe yielded'); return {status:'applied'};`
  },
  {
    id: "delete-occupied",
    request: "没有允许移除作物时，删除占用耕地应被拒绝。",
    allowedOperations: ["deletePlot"],
    expectedError: "PLOT_OCCUPIED",
    replay: `return await callFarming({operation:'deletePlot',input:{farmId,plotId}});`
  },
  {
    id: "delete-cascade",
    request: "明确删除耕地及作物，不产生收获。",
    allowedOperations: ["deletePlot", "getPlot", "getInventory"],
    replay: `const before=await callFarming({operation:'getInventory',input:{farmId}}); await callFarming({operation:'deletePlot',input:{farmId,plotId,cascadeCrop:true}}); const p=await callFarming({operation:'getPlot',input:{farmId,plotId}}); const after=await callFarming({operation:'getInventory',input:{farmId}}); if(p.value!==null||JSON.stringify(before.value)!==JSON.stringify(after.value))throw new Error('delete yielded'); return {status:'applied'};`
  },
  {
    id: "conflict",
    request: "使用过期版本播种应明确失败，不新增作物。",
    allowedOperations: ["plant", "getPlot"],
    expectedError: "VERSION_CONFLICT",
    replay: `return await callFarming({operation:'plant',input:{farmId,plotId,seedId:'berry-seed'},options:{commandId:'stale',expectedRevision:0}});`
  },
  {
    id: "basket-not-carried",
    request: "未携带篮子时卸货应明确拒绝，不虚构库存变化。",
    allowedOperations: ["unloadBasket"],
    expectedError: "ITEM_CHANGED",
    replay: `return await callFarming({operation:'unloadBasket',input:{farmId,basketId:'missing-basket'}});`
  },
  {
    id: "target",
    request: "对宿主当前选中的耕地检查真实占用与可用操作。",
    allowedOperations: ["getTarget", "getPlot", "getAvailableActions"],
    replay: `const t=await callFarming({operation:'getTarget',input:{farmId}});if(t.value.plotId!==plotId)throw new Error('wrong target');const p=await callFarming({operation:'getPlot',input:{farmId,plotId:t.value.plotId}});const a=await callFarming({operation:'getAvailableActions',input:{farmId,target:t.value.plotId}});if(!p.value||!a.value.length)throw new Error('missing target evidence');return {status:'applied'};`
  },
  {
    id: "conflict-requery",
    request: "过期版本操作失败后重新查询，使用新命令播种并验证。",
    allowedOperations: ["plant", "getPlot", "verify"],
    expectedCallError: "VERSION_CONFLICT",
    replay: `try{await callFarming({operation:'plant',input:{farmId,plotId,seedId:'berry-seed'},options:{commandId:'old-version',expectedRevision:0}});throw new Error('conflict missing');}catch(e){if(e.result?.error?.code!=='VERSION_CONFLICT')throw e;}const p=await callFarming({operation:'getPlot',input:{farmId,plotId}});if(p.value.crop)throw new Error('unexpected occupant');const r=await callFarming({operation:'plant',input:{farmId,plotId,seedId:'berry-seed'},options:{commandId:'new-version',expectedRevision:p.context.revision}});await callFarming({operation:'verify',input:{farmId,commandId:r.value.receipt.commandId}});const actual=await callFarming({operation:'getPlot',input:{farmId,plotId}});if(actual.value.crop.cropId!=='berry')throw new Error('not planted');return {status:'applied'};`
  },
  {
    id: "storage-retry",
    request: "存储失败时保留完整请求重试，不重复播种。",
    allowedOperations: ["plant", "getPlot", "verify"],
    expectedCallError: "STORAGE_FAILURE",
    replay: `let retry;try{await callFarming({operation:'plant',input:{farmId,plotId,seedId:'berry-seed'},options:{commandId:'storage-instruction'}});throw new Error('failure missing');}catch(e){if(e.result?.error?.code!=='STORAGE_FAILURE'||!e.result.error.retryable)throw e;retry=e.result.error.details.retryRequest;}const r=await callFarming(retry);const replay=await callFarming(retry);if(!replay.value.receipt.replayed)throw new Error('duplicate write');await callFarming({operation:'verify',input:{farmId,commandId:r.value.receipt.commandId}});const p=await callFarming({operation:'getPlot',input:{farmId,plotId}});if(p.value.crop.cropId!=='berry')throw new Error('wrong crop');return {status:'applied'};`
  },
  {
    id: "basket-place",
    request: "放下装有收获物的篮子，持久内容不能丢失。",
    allowedOperations: ["getCarry", "getItemTotals", "placeItem"],
    replay: `const before=await callFarming({operation:'getItemTotals',input:{farmId}});const carry=await callFarming({operation:'getCarry',input:{farmId}});if(!carry.value.item)throw new Error('missing basket');await callFarming({operation:'placeItem',input:{farmId,expectedItemId:carry.value.item.id,groundId:carry.value.item.groundId,position:[20,0,20]}});const after=await callFarming({operation:'getItemTotals',input:{farmId}});const current=await callFarming({operation:'getCarry',input:{farmId}});if(current.value.carried!==null||JSON.stringify(before.value)!==JSON.stringify(after.value))throw new Error('place lost contents');return {status:'applied'};`
  }
];

export async function replayFarmingInstruction(
  api: FarmingAPI,
  test: FarmingInstructionCase,
  scope: { farmId: string; plotId: string; plotIds?: readonly string[] },
  maxToolCalls = 20
) {
  const pkg = createFarmingAgentPackage(api);
  const calls: { operation: string; ok: boolean; error?: string }[] = [];
  const bindings: AgentScriptToolBinding[] = pkg.tools.map(tool => ({
    name: tool.name,
    effect: tool.effect,
    invoke: async (input, signal) => {
      const raw = input as any;
      const request = (tool.name === "farming.component.query"
        ? { operation: "list", input: {} }
        : { operation: tool.name.slice("farming.component.".length), input: { ...raw.input, ...raw.identity }, options: raw.options }) as FarmingRequest;
      const operation = request.operation;
      if (operation !== "list" && !test.allowedOperations.includes(operation))
        throw new Error(`Unexpected instruction operation: ${operation}`);
      if ("farmId" in request.input && request.input.farmId !== undefined && request.input.farmId !== scope.farmId)
        throw new Error("Instruction escaped its assigned region");
      if ("plotId" in request.input && !(scope.plotIds ?? [scope.plotId]).includes(request.input.plotId))
        throw new Error("Instruction escaped its assigned plot");
      if (
        "plotIds" in request.input &&
        request.input.plotIds.some((id) => !(scope.plotIds ?? [scope.plotId]).includes(id))
      )
        throw new Error("Instruction queried unrelated plot fields");
      if ("target" in request.input) {
        const target = request.input.target;
        const observed = api.system.getArea(scope.farmId).service.getPlot(scope.plotId)!;
        if (
          typeof target === "string"
            ? target !== scope.plotId
            : target.groundId !== observed.groundId ||
              target.cellX !== observed.cellX ||
              target.cellZ !== observed.cellZ
        )
          throw new Error("Instruction escaped its assigned cultivation grid");
      }
      try {
        const result = tool.parseOutput(await tool.execute(tool.parseInput(input), { signal })) as AgentValue;
        calls.push({ operation, ok: true });
        return { ok: true, value: result };
      } catch (error) {
        const code = error instanceof AgentToolExecutionError ? error.code : "EXECUTION_FAILED";
        calls.push({ operation, ok: false, error: code });
        return {
          ok: false,
          error: {
            code,
            message: String(error),
            ...(error instanceof AgentToolExecutionError
              ? { executed: error.executed, retryable: error.retryable, details: toAgentValue(error.details ?? null) }
              : {})
          }
        };
      }
    }
  }));
  const result = await new JavaScriptAgentScriptRuntime().execute({
    id: test.id,
    source: `
      const references=new Map();
      async function callFarming(request){
        if(request.operation==='list')return {value:await editor.component.query({type:'FarmingAreaComponent'})};
        const {farmId,...input}=request.input;
        if(!references.has(farmId))references.set(farmId,(await editor.component.query({type:'FarmingAreaComponent',farmId}))[0]);
        const farm=references.get(farmId);
        return await farm[request.operation==='get'?'read':request.operation](input,request.options);
      }
      const farmId=${JSON.stringify(scope.farmId)},plotId=${JSON.stringify(scope.plotId)};return await(async()=>{${test.replay}})();`,
    toolBindings: bindings,
    editorComponents: pkg.definition.editorComponents,
    signal: new AbortController().signal,
    maxToolCalls,
    timeoutMs: 10000
  });
  if (test.expectedError ? result.ok || result.error.code !== test.expectedError : !result.ok)
    throw new Error(`Instruction ${test.id} failed: ${JSON.stringify(result)}`);
  if (test.expectedCallError && !calls.some((call) => !call.ok && call.error === test.expectedCallError))
    throw new Error(`Instruction ${test.id} omitted expected failure evidence`);
  return { id: test.id, passed: true, calls, result };
}
