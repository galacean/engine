import {
  FarmingSystem,
  FarmingAreaComponent,
  FarmingAPI,
  createFarmingResources,
  registerNativeFarming,
  createFarmingAgentPackage
} from "@galacean/engine-farming/farming/native/index";
import { FarmItemPresentation } from "@galacean/engine-farming/farming/presentation/FarmItemPresentation";
import { FarmingItemInteraction } from "@galacean/engine-farming/farming/application/FarmingItemInteraction";
import { carriedItem, type FarmItemsState } from "@galacean/engine-farming/farming/domain/FarmItems";
import { findPlayerItemDropPosition } from "@galacean/engine-farming/farming/application/FarmingItemDrop";
import { FarmGround, FARM_GROUND_ID } from "./scene/FarmGround.ts";
import { plotBounds, type GroundTarget } from "@galacean/engine-farming/farming/api/index";
import type { FarmChange } from "@galacean/engine-farming/farming/domain/FarmCommands";
import { WebGLEngine } from "@galacean/engine";
import { ShaderCompiler } from "@galacean/engine-shader-compiler";
import {
  BrowserSystemClock,
  ManualFarmClock,
  FarmingService,
  type CommandResult,
  type FarmActionId,
  type FarmActionInput,
  type FarmActionOptions,
  type FarmSnapshot,
  type FarmTimeAdvanceSummary,
  type PlotStatusView
} from "@galacean/engine-farming/farming/api/index";
import type { Sprite } from "@galacean/engine";
import { FARM_ACTION_PRESENTATION } from "./config/action-bar.ts";
import { IndexedDBFarmRepository } from "@galacean/engine-farming/farming/persistence/IndexedDBFarmRepository";
import {
  FARM_GRID,
  FARM_LAYOUT_ID,
  FARM_LAYOUT_VERSION,
  FARM_PLOTS,
  FARM_HALF_WIDTH,
  FARM_HALF_DEPTH,
  resolveFarmId
} from "./config/demo-config.ts";
import { FARM_DEFINITIONS } from "./config/demo-definitions.ts";
import { FarmInteractionController } from "./scene/FarmInteractionController.ts";
import { FarmScene, type FarmSceneDiagnostics } from "./scene/FarmScene.ts";
import { loadCropIcons } from "./ui/CropIcons.ts";
import { CropStatusOverlay } from "./ui/CropStatusOverlay.ts";
import { FarmHud } from "./ui/FarmHud.ts";
import { FarmUi, type FarmUiInspection } from "./ui/FarmUi.ts";
import type { StorageWriteInput } from "@galacean/engine-farming/farming/storage/StorageTypes";
import type { StoragePresentationSnapshot, SowingPresentationSnapshot } from "@galacean/engine-farming/farming/presentation/index";
import type { FarmingRequest } from "@galacean/engine-farming/farming/native/index";
import type { StorageUiResult } from "./ui/FarmStoragePanel.ts";

interface FarmActionAttempt {
  readonly input: FarmActionInput;
  options: FarmActionOptions & { readonly commandId: string; readonly expectedRevision?: number };
}

export interface FarmingDemoDiagnostics {
  readonly ready: boolean;
  readonly farmId: string;
  readonly clockMode: "browser" | "manual";
  readonly debugMode: boolean;
  setDebugMode(enabled: boolean): void;
  /** Optional low viewpoint is available only with the manual test clock. */
  focusPlot(plotId: string, eyeHeight?: number): boolean;
  snapshot(): FarmSnapshot;
  api: FarmingService;
  nativeApi: FarmingAPI;
  agentPackage: ReturnType<typeof createFarmingAgentPackage>;
  focusGround(x: number, z: number): void;
  editTerrain(x: number, z: number, delta: number): Promise<void>;
  resetTerrain(): Promise<void>;
  dispose(): void;
  waterDebug?(): unknown;
  statuses(): readonly PlotStatusView[];
  lastCatchUp(): FarmTimeAdvanceSummary;
  advanceTime(elapsedMs: number): Promise<boolean>;
  setTime(timeMs: number): Promise<boolean>;
  ui(id: string): FarmUiInspection | null;
  activateUi(id: string): boolean;
  hud(): ReturnType<FarmHud["inspect"]>;
  labels(): ReturnType<CropStatusOverlay["inspect"]>;
  basket: { snapshot(): FarmItemsState };
  storage(): StoragePresentationSnapshot | undefined;
  sowing(): SowingPresentationSnapshot | undefined;
  retryStorageVisual(): Promise<void>;
  scene(): Readonly<FarmSceneDiagnostics & { visibleCropLabels: number }>;
}

declare global {
  interface Window {
    farmingDemo?: FarmingDemoDiagnostics;
  }
}

let disposed = false;
let engine: WebGLEngine | null = null;
let scene: FarmScene | null = null;
let interaction: FarmInteractionController | null = null;
let cropStatusOverlay: CropStatusOverlay | null = null;
let hud: FarmHud | null = null;
let releaseDebugPanels: (() => void) | null = null;
let farmUi: FarmUi | null = null;
let service: FarmingService | null = null;
let farmingSystem: FarmingSystem | null = null;
let farmingArea: FarmingAreaComponent | null = null;
let nativeApi: FarmingAPI | null = null;
let repository: IndexedDBFarmRepository | null = null;
let itemInteraction: FarmingItemInteraction | null = null;
let retryAction: FarmActionAttempt | null = null;
let retryStorage: { input: string; request: FarmingRequest<"setContainerCount" | "withdrawInventory"> } | null = null;
let actionPending = false;
let irrigationCommandId: string | null = null;
let ground: FarmGround | null = null;
const events = new AbortController();

window.addEventListener("pagehide", dispose, { once: true });
void main().catch((error) => {
  const message = error instanceof Error ? error.message : "农场初始化失败";
  document.getElementById("loading-message")!.textContent = message;
  document.getElementById("loading")!.removeAttribute("hidden");
  hud?.setSaveState("error", "加载失败");
  console.error(error);
});

async function main(): Promise<void> {
  const parameters = new URLSearchParams(window.location.search);
  const farmId = resolveFarmId(window.location.search);
  const manualClock =
    parameters.get("clock") === "manual" ? new ManualFarmClock(readManualClockStart(parameters)) : null;
  const clock = manualClock ?? new BrowserSystemClock();
  ground = new FarmGround([
    ...[-(FARM_HALF_WIDTH + 0.7), FARM_HALF_WIDTH + 0.7].flatMap((x) =>
      [-(FARM_HALF_DEPTH + 0.7), 0, FARM_HALF_DEPTH + 0.7].map((z) => ({
        bounds: { minimumX: x - 0.06, maximumX: x + 0.06, minimumZ: z - 0.06, maximumZ: z + 0.06 }
      }))
    ),
    {
      bounds: {
        minimumX: FARM_HALF_WIDTH + 0.45,
        maximumX: FARM_HALF_WIDTH + 1.75,
        minimumZ: FARM_HALF_DEPTH - 0.1,
        maximumZ: FARM_HALF_DEPTH + 0.9
      }
    }
  ]);
  repository = new IndexedDBFarmRepository();
  engine = await WebGLEngine.create({ canvas: "canvas", shaderCompiler: new ShaderCompiler() });
  if (disposed) {
    engine.destroy();
    return;
  }
  registerNativeFarming();
  const nativeScene = engine.sceneManager.activeScene!;
  farmingSystem = nativeScene.createRootEntity("Farming System").addComponent(FarmingSystem);
  farmingSystem.debugMode = parameters.get("debug") === "1";
  farmingSystem.configureRuntime(() => ({
    repository: repository!,
    groundProvider: ground!,
    getViewerPosition: () => scene?.camera.entity.transform.worldPosition,
    clock,
    autoAdvance: !manualClock
  }));
  const resources = createFarmingResources(engine, FARM_DEFINITIONS);
  farmingArea = nativeScene.createRootEntity("种植区域").addComponent(FarmingAreaComponent);
  try {
    await farmingArea.configure({
      farmId,
      layoutId: FARM_LAYOUT_ID,
      layoutVersion: FARM_LAYOUT_VERSION,
      grid: FARM_GRID,
      plots: FARM_PLOTS,
      ...resources
    });
  } finally {
    resources.catalog.destroy();
    resources.rules.destroy();
  }
  if (disposed) return;
  service = farmingArea.service;
  nativeApi = new FarmingAPI(farmingSystem);
  farmUi = new FarmUi(engine, document.getElementById("canvas") as HTMLCanvasElement);
  engine.canvas.setAutoResolution();
  scene = new FarmScene(
    engine,
    FARM_DEFINITIONS,
    (plotId, state, message) => { if (!disposed) hud?.reportAssetState(plotId, state, message); },
    ground
  );
  if (farmingArea.sowingPresenter)
    farmingArea.sowingPresenter.surface = (plotId) => scene?.getSowingSurface(plotId) ?? null;
  scene.items = new FarmItemPresentation(scene.camera.entity.parent!, scene.camera, service);
  const actionIcons = Object.fromEntries(
    await Promise.all(
      service
        .getActionDefinitions()
        .map(async ({ id }) => [id, await farmUi!.loadIcon(FARM_ACTION_PRESENTATION[id].iconUrl)] as const)
    )
  ) as Record<FarmActionId, Sprite>;
  const cropIcons = await loadCropIcons(farmUi);
  if (disposed) return;
  hud = new FarmHud(
    farmUi,
    actionIcons,
    cropIcons,
    FARM_DEFINITIONS,
    {
      api: service,
      storageWrite: executeStorage,
      toggleBasket: () => void toggleCarryBasket(),
      hideBasket: () => void placeCurrentItem(),
      execute: (input) => void executeAction(input),
      retryVisual: (plotId) => {
        scene?.retryCropVisual(plotId);
      },
      seedPreview: (plotId) => scene?.setPlantingPreview(plotId),
      modalState: (open, plotId) => {
        cropStatusOverlay?.setSuppressed(open);
        interaction?.lockPlot(open ? plotId : null);
        interaction?.setPaused(open);
        const selected = open ? plotId : (interaction?.currentTarget.plotId ?? null);
        scene?.setSelectedPlot(selected);
        cropStatusOverlay?.setSelectedPlot(selected);
      }
    },
    farmingSystem.debug
  );
  const canvas = document.getElementById("canvas") as HTMLCanvasElement;
  cropStatusOverlay = new CropStatusOverlay(
    scene.camera,
    farmUi,
    cropIcons,
    (plotId, worldPoint) => scene!.isCropLabelVisible(plotId, worldPoint),
    (plotId) => scene!.getPlotPosition(plotId)
  );
  interaction = new FarmInteractionController(
    scene.camera,
    canvas,
    (ray, maximumDistance) => scene!.resolveInteractionTarget(ray, maximumDistance),
    (target) => {
      scene?.setSelectedPlot(target.plotId);
      cropStatusOverlay?.setSelectedPlot(target.plotId);
      hud?.setTarget(target.plotId, target.ground ?? null);
      if (!target.plotId && target.ground) scene?.showGroundTarget(target.ground);
    },
    (clientX, clientY) => farmUi!.isPointerOverUi(clientX, clientY),
    (x, z) => ground!.capture().sample(FARM_GROUND_ID, x, z)?.position[1] ?? null,
    (plotId) => scene!.getPlotPosition(plotId)
  );
  farmingArea.coordinator.presentation = {
    getTarget: () => ({
      plotId: interaction?.currentTarget.plotId ?? null,
      ground: interaction?.currentTarget.ground ?? null
    }),
    prepare: async (input, signal) => {
      actionPending = true;
      const soilWork = input.type === "hoe";
      if (!soilWork) {
        interaction?.lockPlot("plotId" in input ? input.plotId : null);
        interaction?.setPaused(true);
      }
      hud?.setBusy(true);
      hud?.setSaveState("saving");
      if (signal.aborted || disposed) return false;
      scene!.items?.setUsing(true);
      if (soilWork) {
        const target = input.target;
        return target ? scene!.playSoilWork(target, input.type) : false;
      }
      return scene!.items!.prepareUse(input.type === "irrigate" ? 1.1 : 0.4, signal);
    },
    itemCommitted: async (input, _receipt, signal) => {
      if (input.type === "pickup-item" || input.type === "place-item") await scene!.items!.waitForMotion(signal);
    },
    begin: (input, commandId) => {
      irrigationCommandId = input.type === "irrigate" ? commandId : null;
    },
    cancel: () => {
      scene?.cancelSoilWork();
      scene?.items?.setUsing(false);
    },
    finish: () => {
      scene?.finishSoilWork();
      scene?.items?.setUsing(false);
      actionPending = false;
      irrigationCommandId = null;
      if (!disposed) {
        interaction?.lockPlot(null);
        interaction?.setPaused(false);
        hud?.setBusy(false);
        hud?.setSaveState("saved");
      }
    }
  };
  service.subscribe(({ snapshot, changes, source }) => {
    syncPresentation(snapshot, source === "external", changes);
    if (
      irrigationCommandId !== null &&
      snapshot.recentReceipts.at(-1)?.commandId === irrigationCommandId &&
      source === "local" &&
      changes.some((change) => change.kind === "soil-irrigated")
    ) {
      const irrigation = changes.find((change) => change.kind === "soil-irrigated");
      if (irrigation && "plotId" in irrigation)
        scene?.flashIrrigation(
          irrigation.plotId,
          changes.flatMap((c) => (c.kind === "soil-moisture-changed" || c.kind === "soil-irrigated" ? [c.plotId] : []))
        );
    }
    if (source === "external") hud?.showToast("已同步另一页面的农场进度");
  });
  service.subscribeErrors(({ operation, error }) => {
    const message = error instanceof Error ? error.message : "未知错误";
    console.error(`Farming ${operation} failed.`, error);
    if (operation === "listener") {
      hud?.showToast(`界面同步失败：${message}`, "error");
    } else {
      hud?.setSaveState("error", `保存失败 · ${message}`);
    }
  });
  syncPresentation(service.getSnapshot());
  hud.setSaveState("saved");
  hud.setLoading(false);
  showCatchUpSummary(service.getLastCatchUpSummary());
  engine.run();
  window.addEventListener(
    "keydown",
    (event) => {
      if (event.code === "Escape" && actionPending) farmingArea?.coordinator.cancel();
    },
    { signal: events.signal }
  );
  let terrainDebugRoot: ReturnType<FarmUi["layer"]> | undefined;
  const layoutDebugPanels = () => {
    const warehouse = farmUi?.inspect("warehouse");
    farmUi?.nodes
      .get("terrain-debug-panel")
      ?.rect(Math.max(18, farmUi.width - 214), warehouse ? warehouse.y + warehouse.height + 12 : 284, 180, 136);
  };
  const updateDebugPanels = (enabled: boolean) => {
    if (terrainDebugRoot) {
      farmUi!.remove(terrainDebugRoot);
      terrainDebugRoot = undefined;
    }
    const url = new URL(window.location.href);
    if (enabled) url.searchParams.set("debug", "1");
    else url.searchParams.delete("debug");
    window.history.replaceState(window.history.state, "", url.href);
    if (!enabled) return;
    terrainDebugRoot = farmUi!.layer("terrain-debug", 15);
    const panel = farmUi!.panel(terrainDebugRoot, "terrain-debug-panel");
    farmUi!.text(panel, "terrain-debug-title", "地形跟随检查", 14).rect(10, 8, 160, 22);
    for (const [index, delta] of [0.25, -0.25, 0].entries())
      farmUi!
        .button(
          panel,
          `terrain-debug-${index}`,
          index === 2 ? "恢复地形" : delta > 0 ? "抬升目标地形" : "降低目标地形",
          () => {
            const target = interaction?.currentTarget.ground;
            if (!target) return;
            const bounds = plotBounds(FARM_GRID, target),
              x = (bounds.minimumX + bounds.maximumX) / 2,
              z = (bounds.minimumZ + bounds.maximumZ) / 2;
            if (delta) ground!.changeHeight(x, z, delta);
            else ground!.reset();
          }
        )
        .rect(10, 34 + index * 32, 160, 28);
    layoutDebugPanels();
  };
  itemInteraction = new FarmingItemInteraction({
    canvas,
    camera: scene.camera,
    service,
    coordinator: farmingArea.coordinator,
    isStorageContainerVisible: (id) => farmingArea?.storagePresenter?.isContainerVisible(id) ?? false,
    ground,
    definitions: FARM_DEFINITIONS,
    presentation: {
      items: scene.items!,
      setTarget: (target) => {
        scene?.setSelectedPlot(target.plotId);
        if (!target.plotId && target.ground) scene?.showGroundTarget(target.ground);
        hud?.setTarget(target.plotId, target.ground);
      }
    },
    isEnabled: () => !disposed,
    result: (receipt) => {
      if (!receipt.ok) console.warn(receipt.error?.message);
    }
  });
  const unsubscribeDebug = farmingSystem.debug.subscribe(updateDebugPanels);
  const unsubscribeDebugResize = farmUi.onResize(layoutDebugPanels);
  updateDebugPanels(farmingSystem.debugMode);
  releaseDebugPanels = () => {
    unsubscribeDebug();
    unsubscribeDebugResize();
    if (terrainDebugRoot) farmUi?.remove(terrainDebugRoot);
  };

  window.farmingDemo = {
    basket: { snapshot: () => service!.getSnapshot().items },
    ready: true,
    get debugMode() {
      return farmingSystem!.debugMode;
    },
    setDebugMode: (enabled) => {
      farmingSystem!.debugMode = enabled;
    },
    farmId,
    clockMode: manualClock ? "manual" : "browser",
    api: service,
    nativeApi,
    storage: () => farmingArea?.storagePresenter?.snapshot(),
    sowing: () => farmingArea?.sowingPresenter?.snapshot(),
    retryStorageVisual: () => farmingArea?.storagePresenter?.prepare() ?? Promise.resolve(),
    agentPackage: createFarmingAgentPackage(nativeApi),
    waterDebug: () =>
      farmingSystem!.debugMode
        ? {
            revision: service!.getSnapshot().revision,
            plots: service!.getSnapshot().plots.map((p) => ({
              id: p.plotId,
              moisture: p.soil.moistureUnits,
              connections: p.ground.waterMask,
              preparation: p.soil.preparation
            })),
            lastInput: service!
              .getSnapshot()
              .recentReceipts.flatMap((r) => r.changes)
              .filter((c) => c.kind === "soil-irrigated")
              .at(-1)
          }
        : undefined,
    focusGround: (x, z) => interaction!.focusGround(x, z),
    async editTerrain(x, z, delta) {
      ground!.changeHeight(x, z, delta);
      await service!.checkpoint();
    },
    async resetTerrain() {
      ground!.reset();
      await service!.checkpoint();
    },
    dispose,
    focusPlot(plotId, eyeHeight) {
      const focused = interaction?.focusPlot(plotId, manualClock ? eyeHeight : undefined) ?? false;
      if (focused) {
        scene?.setSelectedPlot(plotId);
        cropStatusOverlay?.setSelectedPlot(plotId);
        hud?.setTarget(plotId);
      }
      return focused;
    },
    snapshot: () => service!.getSnapshot(),
    statuses: () => service!.getFarmStatus(),
    lastCatchUp: () => service!.getLastCatchUpSummary(),
    async advanceTime(elapsedMs) {
      if (!manualClock || !service) return false;
      manualClock.advanceBy(elapsedMs);
      await service.checkpoint(manualClock.nowMs());
      return true;
    },
    async setTime(timeMs) {
      if (!manualClock || !service) return false;
      manualClock.set(timeMs);
      await service.checkpoint(manualClock.nowMs());
      return true;
    },
    ui: (id) => farmUi!.inspect(id),
    activateUi: (id) => farmUi!.activate(id),
    hud: () => hud!.inspect(),
    labels: () => cropStatusOverlay!.inspect(),
    scene: () =>
      Object.freeze({
        ...scene!.getDiagnostics(),
        visibleCropLabels: cropStatusOverlay!.getVisibleCount()
      })
  };
}

function syncPresentation(snapshot: FarmSnapshot, snap = false, changes: readonly FarmChange[] = []): void {
  if (!service) return;
  const statuses = service.getFarmStatus();
  scene?.sync(snapshot, snap, changes, statuses);
  cropStatusOverlay?.setStatuses(statuses);
  hud?.setState(snapshot, statuses);
}

async function placeCurrentItem(): Promise<void> {
  if (!service || !scene || !ground || !nativeApi) return;
  const snapshot = service.getSnapshot(),
    carry = snapshot.items.carried;
  if (!carry) return;
  const held = carriedItem(snapshot.items),
    id = carry.itemId;
  const eye = scene.camera.entity.transform.worldPosition,
    forward = scene.camera.entity.transform.worldForward;
  const groundId = held?.groundId ?? snapshot.storage.layout.groundId;
  const origin = [eye.x + forward.x * 1.4, eye.y, eye.z + forward.z * 1.4] as const;
  const position = held
    ? findPlayerItemDropPosition(snapshot, FARM_DEFINITIONS, ground.capture(), held,
        [eye.x, eye.y, eye.z], [forward.x, forward.y, forward.z])
    : origin;
  if (position)
    await nativeApi.execute({
      operation: "placeItem",
      input: {
        farmId: snapshot.farmId,
        expectedItemId: id,
        groundId,
        position
      }
    });
}
async function toggleCarryBasket(): Promise<void> {
  if (!service || !scene || !nativeApi) return;
  const snapshot = service.getSnapshot();
  if (snapshot.items.carried) return placeCurrentItem();
  const basket = snapshot.items.instances.find((item) => item.type === "harvest-basket");
  const eye = scene.camera.entity.transform.worldPosition;
  if (basket)
    await nativeApi.execute({
      operation: "pickupItem",
      input: {
        farmId: snapshot.farmId,
        itemId: basket.id,
        dropPosition: [eye.x, eye.y, eye.z]
      }
    });
}

async function executeAction(input: FarmActionInput): Promise<void> {
  if (actionPending || !service || !interaction || !hud) return;
  const target = input.type === "hoe" ? input.target : service.getPlot(input.plotId);
  if (
    !target ||
    (input.type === "hoe" ? !interaction.canActOnGround(input.target) : !interaction.canActOn(input.plotId))
  ) {
    hud.showToast("目标已变化，请重新看向土地", "error");
    return;
  }
  const retrying = Boolean(retryAction && JSON.stringify(retryAction.input) === JSON.stringify(input));
  const attempt: FarmActionAttempt =
    retrying && retryAction
      ? retryAction
      : {
          input: { ...input },
          options: { commandId: createCommandId() }
        };
  retryAction = null;
  try {
    const coordinated = await farmingArea!.coordinator.executeAssisted(attempt.input, attempt.options);
    const result = coordinated.receipt;
    if (disposed) return;
    if (result.ok) {
      hud.setSaveState("saved");
      hud.showToast(actionSuccessMessage(result), "success");
    } else {
      if (result.error?.code === "STORAGE_FAILURE") retryAction = coordinated.attempt;
      hud.setSaveState(result.error?.code === "STORAGE_FAILURE" ? "error" : "saved");
      hud.showToast(result.error?.message ?? "操作失败", "error");
    }
  } catch (error) {
    if (!disposed) {
      hud?.setSaveState("error");
      hud?.showToast(error instanceof Error ? error.message : "操作失败", "error");
    }
  }
}

function actionSuccessMessage(result: CommandResult): string {
  if (result.changes.some((change) => change.kind === "plot-deleted"))
    return result.changes.some((change) => change.kind === "crop-removed")
      ? "土地已还原，作物已移除，不产生收获物"
      : "土地已还原，可以重新开垦";
  if (result.changes.some((change) => change.kind === "crop-removed" && change.reason === "hoe"))
    return "作物已锄除，土地已松土，可以重新播种";
  const harvested = result.changes.find((change) => change.kind === "crop-harvested");
  if (harvested?.kind === "crop-harvested") {
    const crop = FARM_DEFINITIONS.catalog.crops.find((crop) => crop.id === harvested.cropId);
    return `${crop?.name ?? "作物"} +${harvested.quantity}，已放入收获篮`;
  }
  const irrigated = result.changes.find((change) => change.kind === "soil-irrigated");
  if (irrigated?.kind === "soil-irrigated") {
    if (irrigated.water.distributed > 0) return "浇水完成 · 余水已渗入周围耕地";
    if (irrigated.water.lost > 0) return "浇水完成 · 连通耕地已饱和，余水流失";
    return `浇水完成 · 含水率 ${Number(irrigated.previousMoistureUnits.toFixed(1))}% → ${Number(irrigated.moistureUnits.toFixed(1))}%`;
  }
  const planted = result.changes.find((change) => change.kind === "crop-planted");
  if (planted?.kind === "crop-planted") {
    const crop = FARM_DEFINITIONS.catalog.crops.find((crop) => crop.id === planted.cropId);
    return `${crop?.name ?? "作物"}已播种 · 等待土壤与时间生长`;
  }
  const land = result.changes.find((c) => c.kind === "plot-created" || c.kind === "plot-updated");
  return land ? (land.kind === "plot-created" ? "已开垦新耕地，可以播种" : "土地整备完成") : "操作完成";
}

async function executeStorage(input: StorageWriteInput): Promise<StorageUiResult> {
  if (!service || !nativeApi || actionPending || disposed) return { ok: false, message: "请等待当前操作完成" };
  const key = JSON.stringify(input);
  const request: FarmingRequest<"setContainerCount" | "withdrawInventory"> =
    retryStorage?.input === key
      ? retryStorage.request
      : input.type === "set-container-count"
        ? {
            operation: "setContainerCount",
            input: { farmId: service.getSnapshot().farmId, typeId: input.typeId, count: input.count },
            options: { commandId: createCommandId() }
          }
        : {
            operation: "withdrawInventory",
            input: { farmId: service.getSnapshot().farmId, itemId: input.itemId, quantity: input.quantity },
            options: { commandId: createCommandId() }
          };
  actionPending = true;
  hud?.setBusy(true);
  hud?.setSaveState("saving");
  try {
    const result = await nativeApi.execute(request);
    if (!result.ok) {
      const retryRequest = result.error.details?.retryRequest;
      retryStorage =
        result.error.code === "STORAGE_FAILURE" &&
        retryRequest &&
        (retryRequest.operation === "setContainerCount" || retryRequest.operation === "withdrawInventory")
          ? { input: key, request: retryRequest }
          : null;
      hud?.setSaveState(result.error.code === "STORAGE_FAILURE" ? "error" : "saved");
      return { ok: false, message: result.error.message };
    }
    retryStorage = null;
    hud?.setSaveState("saved");
    return {
      ok: true,
      message: input.type === "set-container-count" ? "容器数量已保存" : `已取出 ${input.quantity}，仓库已更新`
    };
  } finally {
    actionPending = false;
    if (!disposed) hud?.setBusy(false);
  }
}

function createCommandId(): string {
  return (
    globalThis.crypto?.randomUUID?.() ?? `command-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`
  );
}

function readManualClockStart(parameters: URLSearchParams): number {
  const value = Number(parameters.get("clockStart") ?? 1_000_000);
  return Number.isFinite(value) && value >= 0 ? value : 1_000_000;
}

function showCatchUpSummary(summary: FarmTimeAdvanceSummary): void {
  if (!hud || summary.elapsedSystemTimeMs < 1_000 || !summary.changes.length) return;
  const stageChanges = summary.changes.filter((change) => change.kind === "crop-stage-changed").length;
  const driedPlots = summary.changes.filter(
    (change) =>
      change.kind === "soil-moisture-changed" && change.moistureUnits <= FARM_DEFINITIONS.soilProfile.wiltingPointUnits
  ).length;
  const details = [
    stageChanges ? `${stageChanges} 株进入新阶段` : "",
    driedPlots ? `${driedPlots} 块土壤已干燥` : ""
  ].filter(Boolean);
  hud.showToast(
    `离开 ${formatElapsed(summary.elapsedSystemTimeMs)}${details.length ? ` · ${details.join(" · ")}` : ""}`,
    "normal",
    4_500
  );
}

function formatElapsed(milliseconds: number): string {
  const seconds = Math.floor(milliseconds / 1_000);
  if (seconds < 60) return `${seconds} 秒`;
  return `${Math.floor(seconds / 60)} 分 ${seconds % 60} 秒`;
}

function dispose(): void {
  if (disposed) return;
  disposed = true;
  events.abort();
  window.farmingDemo = undefined;
  interaction?.dispose();
  cropStatusOverlay?.dispose();
  hud?.dispose();
  releaseDebugPanels?.();
  releaseDebugPanels = null;
  farmUi?.dispose();
  itemInteraction?.dispose();
  itemInteraction = null;
  const oldScene = scene,
    oldRepository = repository,
    oldEngine = engine,
    oldService = service;
  const cleanup = farmingSystem?.dispose() ?? Promise.resolve();
  void cleanup
    .then(async () => {
      oldService?.dispose();
      await oldService?.whenIdle();
    })
    .finally(() => {
      oldScene?.dispose();
      oldRepository?.dispose();
      oldEngine?.destroy();
    });
  interaction = null;
  cropStatusOverlay = null;
  hud = null;
  farmUi = null;
  scene = null;
  service = null;
  repository = null;
  engine = null;
  farmingArea = null;
  farmingSystem = null;
  nativeApi = null;
}
