import { z } from "zod";
import {
  FARM_ITEM_TYPES,
  FARM_ITEM_CAPABILITIES,
  HARVEST_BASKET_CAPACITY,
  basketUsed,
  carriedItem,
  type FarmItemInput
} from "../domain/FarmItems";
import { resolveCarriedAction } from "../domain/ResolveCarriedAction";
import { cropHealthStatus } from "../domain/FarmQueries";
import { storageDefinitions } from "../storage/StorageRules";
import type { FarmActionInput } from "../domain/FarmActions";
import type { CommandResult } from "../domain/FarmCommands";
import type { CoordinatedFarmingAction } from "../application/FarmingActionCoordinator";
import { cancellable, stableRequest } from "../application/FarmingActionCoordinator";
import { boundAttempt, type FarmingWriteInput } from "../application/FarmingCommandBinding";
import { FarmingInitializationError } from "../application/FarmingInitializationError";
import { farmingDefinitions } from "./FarmingResources";
import type { FarmingAreaComponent } from "./FarmingAreaComponent";
import type { FarmingSystem } from "./FarmingSystem";
import {
  FARMING_API_CONTRACT,
  type FarmingCommands,
  type FarmingRequest,
  type FarmingOutputs,
  type FarmingResult,
  type FarmingContext,
  type FarmingAreaInfo,
  type FarmingCapabilities,
  type FarmingAPIErrorCode
} from "./FarmingAPIContract";
export { FARMING_API_CONTRACT } from "./FarmingAPIContract";
export type * from "./FarmingAPIContract";

export {
  farmingInputSchemas,
  farmingMutationNames,
  farmingWriteOptionsSchema,
  isFarmingReadOperation
} from "./FarmingAPIContract";
import { farmingInputSchemas, farmingMutationNames, farmingWriteOptionsSchema } from "./FarmingAPIContract";

const unsupported = [
  "pest control",
  "growth/rule editing",
  "plant morphology editing",
  "near-water supply rule editing",
  "atomic batch actions"
];

/** JSON API shared by application code and the system-owned Agent package. */
export class FarmingAPI {
  constructor(readonly system: FarmingSystem) {}
  getDiagnostics(
    input: FarmingCommands["getDiagnostics"] = {}
  ): Promise<FarmingResult<FarmingOutputs["getDiagnostics"]>> {
    return this.execute({ operation: "getDiagnostics", input });
  }
  async execute<K extends keyof FarmingCommands>(
    request: FarmingRequest<K>,
    signal?: AbortSignal
  ): Promise<FarmingResult<FarmingOutputs[K]>> {
    let area: FarmingAreaComponent | undefined;
    try {
      signal?.throwIfAborted();
      this.system.assertScene();
      if (this.system.destroyed || this.system.isDisposed) throw new Error("DESTROYED: FarmingSystem 已销毁");
      if (!request || typeof request !== "object" || !Object.hasOwn(farmingInputSchemas, request.operation))
        throw new Error("NOT_SUPPORTED: 未知种植操作");
      if (Object.keys(request).some((k) => !["operation", "input", "options"].includes(k)))
        throw new Error("INVALID_ARGUMENT: 未知请求字段");
      const schema = farmingInputSchemas[request.operation];
      const parsed = schema.safeParse(request.input);
      if (!parsed.success)
        throw new Error(
          `INVALID_ARGUMENT: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`
        );
      const command = { ...request, input: parsed.data } as FarmingRequest;
      const mutation = (farmingMutationNames as readonly string[]).includes(command.operation);
      if (!mutation && request.options !== undefined) throw new Error("INVALID_ARGUMENT: 查询和演出控制不接受写入选项");
      const options = farmingWriteOptionsSchema.parse(request.options ?? {});
      const farmId = "farmId" in command.input ? command.input.farmId : undefined;
      if (farmId && command.operation !== "getDiagnostics") area = this.system.getArea(farmId);
      let value: unknown;
      if (command.operation === "getDiagnostics") value = this.system.getDiagnostics(command.input.farmId);
      else if (command.operation === "list") value = this.system.areas.map(describe);
      else if (command.operation === "get") value = describe(area!);
      else if (command.operation === "capabilities") value = capabilities(area, this.system);
      else if (command.operation === "getCatalog") {
        const config = area!.configuration!;
        const definitions = farmingDefinitions(config.catalog, config.rules);
        value = {
          storage: storageDefinitions(definitions),
          seeds: definitions.seeds,
          crops: definitions.catalog.crops.map(({ id, name, cycle, harvest, growthFactors }) => ({
            id,
            name,
            cycle,
            harvest,
            growthFactors
          }))
        };
      } else {
        const ready = area!.canRetryInitialization ? area!.retryInitialization() : area!.ready;
        if (signal) await cancellable(ready, signal);
        else await ready;
        if (!area!.initialized) throw new Error("NOT_INITIALIZED: 区域尚未完成初始化");
        const service = area!.service,
          coordinator = area!.coordinator;
        if (
          mutation &&
          (!area!.enabled ||
            !area!.entity.isActiveInHierarchy ||
            !this.system.enabled ||
            !this.system.entity.isActiveInHierarchy)
        )
          throw new Error("NOT_ACTIVE: 当前区域已禁用");
        switch (command.operation) {
          case "queryItems": {
            const state = service.getSnapshot().items,
              q = command.input.query;
            const held = carriedItem(state)?.id;
            value = state.instances
              .filter(
                (item) =>
                  (!q?.itemId || item.id === q.itemId) &&
                  (!q?.type || item.type === q.type) &&
                  (!q?.bounds ||
                    (item.position[0] >= q.bounds.minimumX &&
                      item.position[0] <= q.bounds.maximumX &&
                      item.position[2] >= q.bounds.minimumZ &&
                      item.position[2] <= q.bounds.maximumZ))
              )
              .map((item) => ({ ...item, carried: item.id === held }));
            break;
          }
          case "getCarry": {
            const state = service.getSnapshot().items,
              item = carriedItem(state),
              used = item ? basketUsed(item) : 0;
            value = {
              carried: state.carried,
              item: item ?? null,
              capacity: HARVEST_BASKET_CAPACITY,
              used,
              remaining: HARVEST_BASKET_CAPACITY - used,
              capabilities: item ? [FARM_ITEM_CAPABILITIES[item.type].action] : state.carried ? ["plant"] : []
            };
            break;
          }
          case "getItemTotals": {
            const snapshot = service.getSnapshot(),
              pending: Record<string, number> = {},
              total = { ...snapshot.inventory };
            for (const item of snapshot.items.instances)
              for (const entry of item.contents) {
                pending[entry.itemId] = (pending[entry.itemId] ?? 0) + entry.quantity;
                total[entry.itemId] = (total[entry.itemId] ?? 0) + entry.quantity;
              }
            value = { stored: snapshot.inventory, pending, total };
            break;
          }
          case "generateItems":
          case "pickupItem":
          case "placeItem":
          case "unloadBasket": {
            const { farmId: _farmId, ...input } = command.input;
            const types = {
              generateItems: "spawn-item",
              pickupItem: "pickup-item",
              placeItem: "place-item",
              unloadBasket: "unload-basket"
            } as const;
            const itemInput = { ...input, type: types[command.operation] } as FarmItemInput;
            const result = await coordinator.executeItem(itemInput, options, signal);
            const retryRequest = { ...command, options: result.attempt.options };
            if (!result.receipt.ok)
              return failure(area!, result.receipt, undefined, retryRequest) as FarmingResult<FarmingOutputs[K]>;
            value = { ...result, request: retryRequest };
            break;
          }
          case "useCarriedItem": {
            const commandId = options.commandId ?? crypto.randomUUID();
            const prior = service.getCommandBinding(commandId);
            const intent = resolveCarriedAction(service.getSnapshot(), command.input.target);
            if (!intent && !prior) throw new Error("TOOL_REQUIRED: 当前携带物不能操作此目标");
            const binding = stableRequest({ ...command, options: { ...options, commandId } });
            const result = await coordinator.execute(
              intent?.input ?? { type: "irrigate", plotId: "replay" },
              { ...intent?.options, ...options, commandId },
              signal,
              binding,
              undefined,
              true
            );
            const retryRequest = { ...command, options: { ...options, commandId } };
            if (!result.receipt.ok)
              return failure(area!, result.receipt, result, retryRequest) as FarmingResult<FarmingOutputs[K]>;
            value = { ...result, request: retryRequest };
            break;
          }
          case "getEnvironment":
            value = service.getEnvironment();
            break;
          case "getTarget":
            if (!coordinator.presentation?.getTarget) throw new Error("NOT_SUPPORTED: 宿主未绑定目标查询");
            value = coordinator.presentation.getTarget();
            break;
          case "queryPlots":
            value = service.queryPlots(command.input.query);
            break;
          case "getPlot":
            value = service.getPlot(command.input.plotId);
            break;
          case "inspectCultivation":
            value = service.inspectCultivation(command.input.target);
            break;
          case "getAvailableActions":
            value = service.getAvailableActions(command.input.target);
            break;
          case "getFieldValues":
            value = service.getFieldValues(command.input.fieldId, command.input.plotIds);
            break;
          case "getContainers":
            value = service.getContainers(command.input.query);
            break;
          case "getInventory":
            value = service.getInventory();
            break;
          case "verify": {
            const snapshot = service.getSnapshot();
            if (command.input.minimumRevision !== undefined && snapshot.revision < command.input.minimumRevision)
              throw new Error("VERSION_CONFLICT: 当前版本早于要求的下限");
            const receipt = snapshot.recentReceipts.find((r) => r.commandId === command.input.commandId) ?? null;
            if (command.input.commandId && !receipt) throw new Error("NOT_FOUND: 回执不存在或已过保留窗口");
            value = {
              context: context(area!),
              receipt,
              inventory: snapshot.inventory,
              plotCount: snapshot.plots.length,
              cropCount: Object.keys(snapshot.crops).length
            };
            break;
          }
          case "damageCrop":
          case "setContainerCount":
          case "withdrawInventory":
          case "consumeBasket":
          case "createPlot":
          case "updatePlot": {
            const s = service.getSnapshot();
            const commandId = options.commandId ?? crypto.randomUUID();
            const input: FarmingWriteInput =
              command.operation === "consumeBasket"
                ? {
                    type: "consume-basket",
                    basketId: command.input.basketId,
                    cropId: command.input.cropId,
                    itemId: command.input.itemId,
                    quantity: command.input.quantity
                  }
                : command.operation === "damageCrop"
                  ? {
                      type: "damage-crop",
                      plotId: command.input.plotId,
                      cropInstanceId: command.input.cropInstanceId,
                      damagePermille: command.input.damagePermille,
                      source: command.input.source
                    }
                  : command.operation === "createPlot"
                    ? { type: "create-plot", target: command.input.target }
                    : command.operation === "updatePlot"
                      ? { type: "update-plot", plotId: command.input.plotId, patch: command.input.patch }
                      : command.operation === "setContainerCount"
                        ? { type: "set-container-count", typeId: command.input.typeId, count: command.input.count }
                        : {
                            type: "withdraw-inventory",
                            itemId: command.input.itemId,
                            quantity: command.input.quantity,
                            ...(command.input.containerId === undefined
                              ? {}
                              : { containerId: command.input.containerId })
                          };
            const original = stableRequest({ input, options: { ...options, commandId } });
            const prior = service.getCommandBinding(commandId);
            const attempt = prior
              ? boundAttempt(prior, input, { ...options, commandId })
              : { input, options: { ...options, commandId, expectedRevision: options.expectedRevision ?? s.revision } };
            const retryRequest = {
              ...command,
              options: attempt.options
            };
            const receipt = await service.execute(
              {
                farmId: area!.farmId,
                commandId,
                expectedRevision: retryRequest.options!.expectedRevision!,
                expectedGroundRevision: retryRequest.options?.expectedGroundRevision,
                ...attempt.input
              },
              signal,
              prior?.requestSignature ?? original
            );
            if (!receipt.ok)
              return failure(area!, receipt, undefined, retryRequest) as FarmingResult<FarmingOutputs[K]>;
            const committedBinding = service.getCommandBinding(commandId);
            const healthChange = receipt.changes.find((c) => c.kind === "crop-health-changed");
            value = {
              ...(command.operation === "damageCrop"
                ? {
                    damage: {
                      previousHealthPermille:
                        healthChange?.kind === "crop-health-changed" ? healthChange.previousHealthPermille : 0,
                      healthPermille: healthChange?.kind === "crop-health-changed" ? healthChange.healthPermille : 0,
                      actualDamagePermille:
                        healthChange?.kind === "crop-health-changed"
                          ? healthChange.previousHealthPermille - healthChange.healthPermille
                          : 0,
                      healthStatus: cropHealthStatus(
                        healthChange?.kind === "crop-health-changed" ? healthChange.healthPermille : 0
                      ),
                      source: command.input.source
                    }
                  }
                : {}),
              receipt,
              request: {
                ...command,
                options: committedBinding
                  ? boundAttempt(committedBinding, input, { ...options, commandId }).options
                  : attempt.options
              }
            };
            break;
          }
          case "deletePlot":
          case "plant":
          case "irrigate":
          case "harvest":
          case "hoe": {
            const { farmId: _farmId, ...input } = command.input;
            const action = {
              ...input,
              type: command.operation === "deletePlot" ? "delete-plot" : command.operation
            } as FarmActionInput;
            const commandId = options.commandId ?? crypto.randomUUID();
            const result = await coordinator.executeAssisted(action, { ...options, commandId }, signal);
            const retryRequest = { ...command, options: { ...options, commandId } };
            if (!result.receipt.ok)
              return failure(area!, result.receipt, result, retryRequest) as FarmingResult<FarmingOutputs[K]>;
            value = { ...result, request: retryRequest };
            break;
          }
        }
      }
      return json({ ok: true, ...(area?.initialized ? { context: context(area) } : {}), value }) as FarmingResult<
        FarmingOutputs[K]
      >;
    } catch (error) {
      const message = String(error instanceof Error ? error.message : error);
      const match = /^([A-Z_]+):\s*(.*)$/s.exec(message);
      if (area?.initialized) area.service.reportFailure(match?.[2] ?? message);
      const code = signal?.aborted
        ? "CANCELLED"
        : error instanceof z.ZodError
          ? "INVALID_ARGUMENT"
          : (match?.[1] ?? "EXECUTION_FAILED");
      return json({
        ok: false,
        ...(area?.initialized ? { context: context(area) } : {}),
        error: {
          code: code as FarmingAPIErrorCode,
          message: match?.[2] ?? message,
          executed: false,
          retryable: error instanceof FarmingInitializationError && error.retryable
        }
      });
    }
  }
}
function json<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}
function context(area: FarmingAreaComponent): FarmingContext {
  const s = area.service.getSnapshot();
  return {
    farmId: s.farmId,
    revision: s.revision,
    groundRevision: area.service.getGroundRevision(),
    simulatedTimeMs: s.simulation.simulatedTimeMs
  };
}
function describe(area: FarmingAreaComponent): FarmingAreaInfo {
  const config = area.configuration!,
    snapshot = area.snapshot;
  return {
    farmId: area.farmId,
    name: area.entity.name,
    enabled: area.enabled,
    active: area.enabled && area.entity.isActiveInHierarchy,
    initialized: area.initialized,
    revision: snapshot?.revision ?? null,
    simulatedTimeMs: snapshot?.simulation.simulatedTimeMs ?? null,
    groundRevision: area.initialized ? area.service.getGroundRevision() : null,
    plotCount: snapshot?.plots.length ?? config.plots?.length ?? 0,
    cropCount: Object.keys(snapshot?.crops ?? {}).length,
    resources: { catalog: config.catalog.contentHash, rules: config.rules.contentHash },
    error: area.lastError ?? null
  };
}
function capabilities(area: FarmingAreaComponent | undefined, system: FarmingSystem): FarmingCapabilities {
  const unavailableOperations: (keyof FarmingCommands)[] = [];
  const presentation = area?.initialized ? area.coordinator.presentation : undefined;
  if (!presentation?.getTarget) unavailableOperations.push("getTarget");
  if (
    !system.enabled ||
    !system.entity.isActiveInHierarchy ||
    (area && (!area.initialized || !area.enabled || !area.entity.isActiveInHierarchy))
  )
    unavailableOperations.push(...farmingMutationNames);
  return {
    operations: (Object.keys(FARMING_API_CONTRACT) as (keyof FarmingCommands)[]).filter(
      (k) => !unavailableOperations.includes(k)
    ),
    unavailableOperations,
    unsupported,
    editablePlotFields: ["label", "preparation"],
    presentation: Boolean(presentation)
  };
}
function failure(
  area: FarmingAreaComponent,
  receipt: CommandResult,
  result?: CoordinatedFarmingAction,
  retryRequest?: FarmingRequest<import("./FarmingAPIContract").FarmingMutation>
): FarmingResult<never> {
  return json({
    ok: false,
    ...(area.initialized ? { context: context(area) } : {}),
    error: {
      code: receipt.error!.code,
      message: receipt.error!.message,
      executed: receipt.changes.length > 0,
      retryable: receipt.error!.code === "STORAGE_FAILURE",
      details: {
        ...(receipt.error?.capacity === undefined
          ? {}
          : { capacity: receipt.error.capacity, used: receipt.error.used, required: receipt.error.required }),
        commandId: receipt.commandId,
        revision: receipt.revision,
        replayed: receipt.replayed,
        changes: receipt.changes,
        ...(result ? { attempt: result.attempt } : {}),
        ...(retryRequest ? { retryRequest } : {})
      }
    }
  });
}
