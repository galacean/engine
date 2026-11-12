import { resolveHoeIntent } from "../domain/ResolveCarriedAction";
import type { FarmingService } from "./FarmingService";
import type { FarmActionInput, FarmActionOptions } from "../domain/FarmActions";
import type { CommandResult } from "../domain/FarmCommands";
import type { FarmSnapshot } from "../domain/FarmState";
import type { GroundTarget } from "../domain/FarmingGround";
import { boundAttempt, stableRequest } from "./FarmingCommandBinding";
import type { FarmItemInput } from "../domain/FarmItems";
export { stableRequest } from "./FarmingCommandBinding";

/** Host capabilities, not a dependency on a camera, HUD or demo class. */
export interface FarmingPresentationPort {
  /** interrupt cancels the entire attempt, including a service write waiting in the queue. */
  prepare(input: FarmActionInput, signal: AbortSignal, interrupt?: () => void): Promise<boolean>;
  canCommit?(input: FarmActionInput): boolean;
  begin?(input: FarmActionInput, commandId: string): void;
  committed?(input: FarmActionInput, receipt: CommandResult): void;
  finish?(input: FarmActionInput): void;
  cancel?(): void;
  itemCommitted?(input: FarmItemInput, receipt: CommandResult, signal: AbortSignal): Promise<void>;
  getTarget?(): { plotId: string | null; ground: GroundTarget | null };
}
export interface FarmingActionAttempt {
  readonly input: FarmActionInput;
  readonly options: FarmActionOptions & { readonly commandId: string; readonly expectedRevision: number };
}
export interface CoordinatedFarmingAction {
  readonly receipt: CommandResult;
  readonly attempt: FarmingActionAttempt;
  readonly presentation: { readonly status: "none" | "started" | "cancelled" | "failed"; readonly error?: string };
}
export interface CoordinatedItemAction {
  readonly receipt: CommandResult;
  readonly attempt: {
    readonly input: FarmItemInput;
    readonly options: FarmActionOptions & { readonly commandId: string; readonly expectedRevision: number };
  };
  readonly presentation: CoordinatedFarmingAction["presentation"];
}

/** One interactive action at a time. The service remains the sole mutation authority. */
export class FarmingActionCoordinator {
  private active?: {
    key: string;
    input: FarmActionInput | FarmItemInput;
    controller: AbortController;
    task: Promise<CoordinatedFarmingAction | CoordinatedItemAction>;
  };
  private reservation?: symbol;
  private assistedTask?: Promise<CoordinatedFarmingAction>;
  private assistedKey?: string;
  private disposed = false;
  private readonly lifetime = new AbortController();
  constructor(
    readonly service: FarmingService,
    public presentation?: FarmingPresentationPort
  ) {}

  execute(
    input: FarmActionInput,
    options: FarmActionOptions = {},
    signal?: AbortSignal,
    requestBinding?: string,
    owner?: symbol,
    allowClockSettlement = false
  ): Promise<CoordinatedFarmingAction> {
    const commandId = options.commandId ?? crypto.randomUUID();
    const request = requestBinding ?? stableRequest({ input, options: { ...options, commandId } });
    if (this.active?.key === request) return this.active.task as Promise<CoordinatedFarmingAction>;
    const prior = this.service.getCommandBinding(commandId);
    const observed = this.service.getSnapshot();
    const observedIntent = interactionVersion(observed, input);
    const validAtStart = options.expectedRevision === undefined || options.expectedRevision === observed.revision;
    const boundInput =
      input.type === "hoe" && input.expectedCropInstanceId === undefined
        ? {
            ...input,
            expectedCropInstanceId:
              this.service
                .queryPlots()
                .find(
                  (p) =>
                    p.groundId === input.target.groundId &&
                    p.cellX === input.target.cellX &&
                    p.cellZ === input.target.cellZ
                )?.occupantId ?? null
          }
        : structuredClone(input);
    let attempt: FarmingActionAttempt = {
      input: boundInput,
      options: {
        ...options,
        commandId,
        expectedRevision: options.expectedRevision ?? this.service.getSnapshot().revision
      }
    };
    let mismatch = false;
    if (prior) {
      try {
        if (requestBinding) {
          if (prior.requestSignature !== requestBinding) throw new Error("Different request");
          const {
            farmId: _farmId,
            commandId: boundId,
            expectedRevision,
            expectedGroundRevision,
            expectedCarriedItemId,
            ...bound
          } = prior.command;
          void _farmId;
          attempt = {
            input: bound as FarmActionInput,
            options: { commandId: boundId, expectedRevision, expectedGroundRevision, expectedCarriedItemId }
          };
        } else attempt = boundAttempt(prior, input, { ...options, commandId }) as FarmingActionAttempt;
      } catch {
        mismatch = true;
      }
    }
    const failure = (
      code: "BUSY" | "CANCELLED" | "DESTROYED" | "INVALID_COMMAND",
      message: string
    ): CoordinatedFarmingAction => {
      this.service.reportFailure(message);
      return {
        receipt: {
          ok: false,
          commandId,
          revision: this.service.getSnapshot().revision,
          replayed: false,
          changes: [],
          error: { code, message }
        },
        attempt,
        presentation: { status: "cancelled" }
      };
    };
    if (this.disposed) return Promise.resolve(failure("DESTROYED", "种植区域已销毁"));
    if (this.active || (this.reservation && this.reservation !== owner))
      return Promise.resolve(failure("BUSY", "当前区域正在执行操作"));
    if (mismatch) return Promise.resolve(failure("INVALID_COMMAND", "命令 ID 已用于不同请求"));
    const controller = new AbortController();
    const combined = AbortSignal.any([controller.signal, this.lifetime.signal, ...(signal ? [signal] : [])]);
    const active = {
      key: request,
      input: boundInput,
      controller,
      task: undefined as unknown as Promise<CoordinatedFarmingAction>
    };
    this.active = active;
    const cancel = () => this.presentation?.cancel?.();
    combined.addEventListener("abort", cancel, { once: true });
    let onlyClockChanges = true;
    const releaseChanges = allowClockSettlement
      ? this.service.subscribe((change) => {
          if (change.source !== "clock") onlyClockChanges = false;
        })
      : () => {};
    active.task = Promise.resolve().then(async () => {
      let receipt: CommandResult | undefined;
      try {
        combined.throwIfAborted();
        const replay = this.service.getSnapshot().recentReceipts.some((r) => r.commandId === commandId);
        if (!prior && input.type === "hoe" && options.expectedGroundRevision === undefined)
          attempt = {
            ...attempt,
            options: { ...attempt.options, expectedGroundRevision: this.service.getGroundRevision() }
          };
        const target = attempt.input.type === "hoe" ? attempt.input.target : attempt.input.plotId;
        const unavailable =
          this.service.getAvailableActions(target).find((action) => action.action === attempt.input.type)?.enabled ===
          false;
        if (this.presentation && !replay && !unavailable) {
          const prepared = await cancellable(
            this.presentation.prepare(attempt.input, combined, () => controller.abort()),
            combined
          );
          if (!prepared) return failure("CANCELLED", "操作准备已取消");
        }
        combined.throwIfAborted();
        // Non-interactive automatic requests retain their existing preparation policy.
        // Interactive clock settlement must wait until earlier service writes complete.
        if (!prior && !replay && !allowClockSettlement && options.expectedRevision === undefined)
          attempt = {
            ...attempt,
            options: { ...attempt.options, expectedRevision: this.service.getSnapshot().revision }
          };
        const canCommit = this.presentation?.canCommit?.(attempt.input);
        combined.throwIfAborted();
        if (canCommit === false) return failure("CANCELLED", "已离开当前工具的操作范围");
        this.presentation?.begin?.(attempt.input, commandId);
        receipt = await this.service.executeAction(
          attempt.input,
          attempt.options,
          combined,
          prior?.requestSignature ?? request,
          !prior && !replay && allowClockSettlement && validAtStart
            ? (snapshot) => onlyClockChanges && observedIntent === interactionVersion(snapshot, input)
            : undefined
        );
        if (receipt.ok) {
          const committedBinding = this.service.getCommandBinding(commandId);
          if (committedBinding)
            attempt = requestBinding
              ? {
                  ...attempt,
                  options: { ...attempt.options, expectedRevision: committedBinding.command.expectedRevision }
                }
              : (boundAttempt(committedBinding, input, { ...options, commandId }) as FarmingActionAttempt);
        }
        if (receipt.ok && !receipt.replayed) this.presentation?.committed?.(attempt.input, receipt);
        return {
          receipt,
          attempt,
          presentation: {
            status: combined.aborted ? "cancelled" : this.presentation && !receipt.replayed ? "started" : "none"
          }
        } as CoordinatedFarmingAction;
      } catch (error) {
        if (receipt?.ok) return { receipt, attempt, presentation: { status: "failed", error: String(error) } };
        if (combined.aborted) return failure("CANCELLED", "操作已取消");
        throw error;
      } finally {
        releaseChanges();
        combined.removeEventListener("abort", cancel);
        try {
          this.presentation?.finish?.(attempt.input);
        } catch (error) {
          console.error("Farming presentation cleanup failed", error);
        } finally {
          if (this.active === active) this.active = undefined;
        }
      }
    });
    return active.task;
  }
  cancel(): void {
    this.active?.controller.abort();
  }
  /** Item lifecycle writes share the same lock, cancellation and persisted bindings as soil actions. */
  executeItem(
    input: FarmItemInput,
    options: FarmActionOptions = {},
    signal?: AbortSignal,
    owner?: symbol
  ): Promise<CoordinatedItemAction> {
    const commandId = options.commandId ?? crypto.randomUUID();
    const request = stableRequest({ input, options: { ...options, commandId } });
    if (this.active?.key === request) return this.active.task as Promise<CoordinatedItemAction>;
    let attempt: CoordinatedItemAction["attempt"] = {
      input: structuredClone(input),
      options: {
        ...options,
        commandId,
        expectedRevision: options.expectedRevision ?? this.service.getSnapshot().revision
      }
    };
    const failure = (
      code: "BUSY" | "DESTROYED" | "INVALID_COMMAND" | "CANCELLED",
      message: string
    ): CoordinatedItemAction => {
      this.service.reportFailure(message);
      return {
        receipt: {
          ok: false,
          commandId,
          revision: this.service.getSnapshot().revision,
          replayed: false,
          changes: [],
          error: { code, message }
        },
        attempt,
        presentation: { status: "cancelled" }
      };
    };
    if (this.disposed) return Promise.resolve(failure("DESTROYED", "种植区域已销毁"));
    if (this.active || (this.reservation && this.reservation !== owner))
      return Promise.resolve(failure("BUSY", "当前区域正在执行操作"));
    const prior = this.service.getCommandBinding(commandId);
    if (prior) {
      try {
        attempt = boundAttempt(prior, input, { ...options, commandId }) as CoordinatedItemAction["attempt"];
      } catch {
        return Promise.resolve(failure("INVALID_COMMAND", "命令 ID 已用于不同请求"));
      }
    }
    const controller = new AbortController();
    const combined = AbortSignal.any([controller.signal, this.lifetime.signal, ...(signal ? [signal] : [])]);
    const task = Promise.resolve().then(async (): Promise<CoordinatedItemAction> => {
      if (combined.aborted) return failure("CANCELLED", "操作已取消");
      try {
        const receipt = await this.service.execute(
          {
            ...attempt.input,
            ...attempt.options,
            farmId: this.service.getSnapshot().farmId
          },
          combined,
          prior?.requestSignature ?? request
        );
        let presentation: CoordinatedItemAction["presentation"] = { status: "none" };
        if (receipt.ok && !receipt.replayed && this.presentation?.itemCommitted) {
          try {
            await cancellable(this.presentation.itemCommitted(attempt.input, receipt, combined), combined);
            presentation = { status: combined.aborted ? "cancelled" : "started" };
          } catch (error) {
            presentation = combined.aborted ? { status: "cancelled" } : { status: "failed", error: String(error) };
          }
        }
        return { receipt, attempt, presentation };
      } finally {
        if (this.active?.task === task) this.active = undefined;
      }
    });
    this.active = { key: request, input, controller, task };
    return task;
  }
  /** AI player assistance owns the whole tool-acquisition/action sequence, without a distance gate. */
  executeAssisted(
    input: FarmActionInput,
    options: FarmActionOptions = {},
    signal?: AbortSignal
  ): Promise<CoordinatedFarmingAction> {
    const commandId = options.commandId ?? crypto.randomUUID();
    const original = stableRequest({ input, options: { ...options, commandId } });
    if (this.assistedTask && this.assistedKey === original) return this.assistedTask;
    const before = this.service.getSnapshot();
    const attempt: FarmingActionAttempt = {
      input,
      options: { ...options, commandId, expectedRevision: options.expectedRevision ?? before.revision }
    };
    const failed = (
      code: import("../domain/FarmCommands").FarmingErrorCode,
      message: string,
      receipt?: CommandResult
    ): CoordinatedFarmingAction => {
      if (!receipt) this.service.reportFailure(message);
      return {
        attempt,
        presentation: { status: "none" },
        receipt: receipt
          ? { ...receipt, commandId }
          : {
              ok: false,
              commandId,
              revision: this.service.getSnapshot().revision,
              replayed: false,
              changes: [],
              error: { code, message }
            }
      };
    };
    if (this.disposed) return Promise.resolve(failed("DESTROYED", "种植区域已销毁"));
    if (this.reservation || this.active) return Promise.resolve(failed("BUSY", "当前区域正在执行操作"));
    const prior = this.service.getCommandBinding(commandId);
    if (prior && prior.requestSignature !== original)
      return Promise.resolve(failed("INVALID_COMMAND", "命令 ID 已用于不同请求"));
    if (!prior && options.expectedRevision !== undefined && options.expectedRevision !== before.revision)
      return Promise.resolve(failed("VERSION_CONFLICT", "农场状态已变化"));
    if (
      !prior &&
      options.expectedGroundRevision !== undefined &&
      options.expectedGroundRevision !== this.service.getGroundRevision()
    )
      return Promise.resolve(failed("GROUND_CHANGED", "地形已变化，请重新查询"));
    const observedPlot =
      input.type === "hoe"
        ? before.plots.find(
            (plot) =>
              plot.groundId === input.target.groundId &&
              plot.cellX === input.target.cellX &&
              plot.cellZ === input.target.cellZ
          )
        : undefined;
    if (
      !prior &&
      input.type === "hoe" &&
      input.expectedCropInstanceId !== undefined &&
      input.expectedCropInstanceId !== (observedPlot?.occupantId ?? null)
    )
      return Promise.resolve(failed("CROP_INSTANCE_CHANGED", "目标作物已变化"));
    const resolved = input.type === "hoe" ? resolveHoeIntent(before, input.target).input : input;
    const owner = Symbol("farm-assisted-action");
    this.reservation = owner;
    const task = Promise.resolve().then(async () => {
      try {
        if (prior) return await this.execute(input, options, signal, original, owner);
        const tools: Partial<Record<FarmActionInput["type"], import("../domain/FarmItems").FarmItemType>> = {
          hoe: "hoe",
          irrigate: "watering-can",
          harvest: "harvest-basket",
          plant: "seed-bag"
        };
        const type = tools[input.type];
        if (!type) return await this.execute(input, options, signal, original, owner);
        const place = this.service.getActionItemOrigin(input);
        if (!place) return failed("PLOT_NOT_FOUND", "操作目标没有可用地面");
        const state = this.service.getSnapshot().items;
        const carry = state.carried;
        const held = carry ? state.instances.find((item) => item.id === carry.itemId) : undefined;
        const matches =
          input.type === "plant" ? held?.type === "seed-bag" && held.seedId === input.seedId : held?.type === type;
        if (!matches) {
          const generated = await this.executeItem(
            {
              type: "spawn-item",
              itemType: type,
              count: 1,
              ...place,
              ...(input.type === "plant" ? { seedId: input.seedId } : {})
            },
            { commandId: `${commandId}/tool` },
            signal,
            owner
          );
          if (!generated.receipt.ok)
            return failed(generated.receipt.error!.code, generated.receipt.error!.message, generated.receipt);
          const item = generated.receipt.changes.find(
            (change) => change.kind === "item-created" || change.kind === "item-reused"
          );
          if (!item || !("itemId" in item)) return failed("ITEM_NOT_FOUND", "召回道具未返回实例");
          const picked = await this.executeItem(
            { type: "pickup-item", itemId: item.itemId, dropPosition: place.position },
            { commandId: `${commandId}/pickup` },
            signal,
            owner
          );
          if (!picked.receipt.ok)
            return failed(picked.receipt.error!.code, picked.receipt.error!.message, picked.receipt);
        }
        const current = this.service.getSnapshot();
        if (input.type === "hoe") {
          const now = current.plots.find(
            (plot) =>
              plot.groundId === input.target.groundId &&
              plot.cellX === input.target.cellX &&
              plot.cellZ === input.target.cellZ
          );
          if (now?.occupantId !== observedPlot?.occupantId || !!now !== !!observedPlot)
            return failed("VERSION_CONFLICT", "道具准备期间地块已变化，请重新确认意图");
        }
        const currentCarry = current.items.carried;
        const itemId = currentCarry && currentCarry.itemId;
        return await this.execute(
          resolved,
          {
            ...options,
            commandId,
            expectedRevision: current.revision,
            ...(itemId ? { expectedCarriedItemId: itemId } : {})
          },
          signal,
          original,
          owner,
          options.expectedRevision === undefined
        );
      } finally {
        if (this.reservation === owner) this.reservation = undefined;
        if (this.assistedTask === task) this.assistedTask = undefined;
      }
    });
    this.assistedTask = task;
    this.assistedKey = original;
    return task;
  }
  async dispose(): Promise<void> {
    this.disposed = true;
    this.lifetime.abort();
    this.cancel();
    await this.active?.task.catch(() => {});
    await this.assistedTask?.catch(() => {});
    this.presentation = undefined;
  }
}

export function cancellable<T>(task: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(signal.reason);
  return new Promise((resolve, reject) => {
    const cancel = () => reject(signal.reason);
    signal.addEventListener("abort", cancel, { once: true });
    task.then(resolve, reject).finally(() => signal.removeEventListener("abort", cancel));
  });
}

/** Simulation may advance values, but it may never change the captured interaction intent. */
function interactionVersion(snapshot: FarmSnapshot, input: FarmActionInput): string {
  const plot =
    input.type === "hoe"
      ? snapshot.plots.find(
          (p) =>
            p.groundId === input.target.groundId && p.cellX === input.target.cellX && p.cellZ === input.target.cellZ
        )
      : snapshot.plots.find((p) => p.plotId === input.plotId);
  return stableRequest({
    plot: plot && {
      id: plot.plotId,
      occupantId: plot.occupantId,
      preparation: plot.soil.preparation
    },
    carry: snapshot.items.carried
  });
}
