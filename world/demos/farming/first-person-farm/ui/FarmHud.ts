import type { GroundTarget } from "@galacean/engine-farming/farming/domain/FarmingGround";
import { Sprite } from "@galacean/engine";
import type { FarmActionId, FarmActionInput, FarmingService, FarmingDebugMode } from "@galacean/engine-farming/farming/api/index";
import { CROP_GROWTH_FACTOR_ORDER } from "@galacean/engine-farming/farming/domain/GrowthFactors";
import type {
  CropGrowthFactorId,
  FarmSnapshot,
  FarmingDefinitionSet,
  PlotStatusView
} from "@galacean/engine-farming/farming/domain/index";
import { FARM_ACTION_PRESENTATION, type FarmHotbarActionId } from "../config/action-bar.ts";
import { FarmActionBar } from "./FarmActionBar.ts";
import { isFarmTextInput } from "./FarmUi.ts";
import { FarmOverviewPanel } from "./FarmOverviewPanel.ts";
import { FarmStoragePanel, type StorageUiResult } from "./FarmStoragePanel.ts";
import type { StorageWriteInput } from "@galacean/engine-farming/farming/storage/StorageTypes";
import { FIELD_COLORS, FarmUi, FarmUiNode } from "./FarmUi.ts";
import { SeedSelection } from "./SeedSelection.ts";
import { SeedSelectionPanel } from "./SeedSelectionPanel.ts";

export interface FarmHudActions {
  readonly api: Pick<FarmingService, "getActionDefinitions" | "getAvailableActions" | "getPlot">;
  readonly toggleBasket: () => void;
  readonly hideBasket: () => void;
  readonly execute: (input: FarmActionInput) => void;
  readonly retryVisual: (plotId: string) => void;
  readonly seedPreview: (plotId: string | null, seedId: string | null) => void;
  readonly modalState: (open: boolean, lockedPlotId: string | null) => void;
  readonly storageWrite: (input: StorageWriteInput) => Promise<StorageUiResult>;
}
type SaveState = "loading" | "saved" | "saving" | "error";

export class FarmHud {
  private readonly abort = new AbortController();
  private overview?: FarmOverviewPanel;
  private storagePanel?: FarmStoragePanel;
  private readonly actionBar: FarmActionBar;
  private readonly root: FarmUiNode;
  private readonly selection: SeedSelection;
  private seedPicker?: SeedSelectionPanel;
  private warehouse?: FarmUiNode;
  private diagnostics?: FarmUiNode;
  private readonly factorFills = new Map<CropGrowthFactorId, FarmUiNode>();
  private toast?: FarmUiNode;
  private readonly crosshair: FarmUiNode;
  private debugRoot?: FarmUiNode;
  private toastLayer?: FarmUiNode;
  private readonly unsubscribeDebug: () => void;
  private saveState: SaveState = "loading";
  private saveDetail?: string;
  private inventoryPage = 0;
  private inventoryPageSize = 4;
  private readonly inventory = new Map<string, FarmUiNode>();
  private readonly unsubscribeResize: () => void;
  private snapshot: FarmSnapshot | null = null;
  private statuses = new Map<string, PlotStatusView>();
  private targetPlotId: string | null = null;
  private targetGround: GroundTarget | null = null;
  private lockedPlotId: string | null = null;
  private readonly assetStates = new Map<string, string>();
  private busy = false;
  private toastTimer: number | null = null;
  private primaryAction: FarmActionId | null = null;

  constructor(
    private readonly ui: FarmUi,
    private readonly icons: Readonly<Record<FarmActionId, Sprite>>,
    private readonly cropIcons: Readonly<Record<string, Sprite>>,
    private readonly definitions: FarmingDefinitionSet,
    private readonly actions: FarmHudActions,
    private readonly debug: FarmingDebugMode
  ) {
    let storage: Storage | undefined;
    try {
      storage = window.localStorage;
    } catch {
      /* Session selection remains available. */
    }
    this.selection = new SeedSelection(definitions, storage);
    const entryUrl = new URL(window.location.href);
    if (this.selection.consumeSeedRequest(entryUrl))
      window.history.replaceState(window.history.state, "", entryUrl.href);
    this.root = ui.layer("farm-hud", 10);
    this.crosshair = ui.group(this.root, "crosshair");
    ui.panel(this.crosshair, "crosshair-left", FIELD_COLORS.paper).rect(-12, 0, 7, 1);
    ui.panel(this.crosshair, "crosshair-right", FIELD_COLORS.paper).rect(5, 0, 7, 1);
    ui.panel(this.crosshair, "crosshair-top", FIELD_COLORS.paper).rect(0, -12, 1, 7);
    ui.panel(this.crosshair, "crosshair-bottom", FIELD_COLORS.paper).rect(0, 5, 1, 7);
    this.actionBar = new FarmActionBar(ui, this.root, actions.api.getActionDefinitions(), icons, {
      perform: (id) => this.performAction(id),
      changeSeed: () => {
        if (this.targetPlotId) this.openSeedTray(this.targetPlotId);
      },
      toggleDebug: () => this.debug.setEnabled(!this.debug.enabled),
      retryVisual: () => {
        if (!this.busy && this.targetPlotId) actions.retryVisual(this.targetPlotId);
      }
    });
    window.addEventListener("keydown", (event) => this.onKey(event), { signal: this.abort.signal });
    this.unsubscribeResize = ui.onResize(() => this.layout());
    this.layout();
    this.unsubscribeDebug = debug.subscribe(() => this.applyDebugMode());
    this.applyDebugMode();
  }

  setState(snapshot: FarmSnapshot, statuses: readonly PlotStatusView[]): void {
    this.snapshot = snapshot;
    this.statuses = new Map(statuses.map((status) => [status.plotId, status]));
    if (this.debug.enabled) {
      this.overview?.setState(snapshot, statuses);
      this.storagePanel?.setState(snapshot);
    }
    this.renderInventory();
    this.renderActions();
  }
  setTarget(plotId: string | null, ground: GroundTarget | null = null): void {
    if (this.lockedPlotId || this.overview?.isOpen || this.storagePanel?.isOpen) return;
    this.targetPlotId = plotId;
    this.targetGround = ground ?? (plotId ? this.actions.api.getPlot(plotId) : null);
    this.renderActions();
  }
  setBusy(busy: boolean): void {
    this.busy = busy;
    this.renderActions();
    this.seedPicker?.setBusy(this.busy);
    this.storagePanel?.setBusy(this.busy);
  }
  setSaveState(state: SaveState, detail?: string): void {
    this.saveState = state;
    this.saveDetail = detail;
    this.ui.nodes
      .get("save-state")
      ?.text(detail ?? { loading: "加载农场", saving: "保存中", saved: "已保存", error: "保存失败" }[state]);
  }
  setLoading(loading: boolean, message = "正在整理农场…"): void {
    document.getElementById("loading")!.toggleAttribute("hidden", !loading);
    document.getElementById("loading-message")!.textContent = message;
  }
  closeSeedTray(): void {
    if (!this.lockedPlotId || this.busy) return;
    this.actions.seedPreview(null, null);
    this.lockedPlotId = null;
    this.seedPicker?.close();
    this.modalChanged(false, null);
    this.renderActions();
    this.actionBar.focusAction("plant");
  }
  showToast(message: string, tone: "normal" | "success" | "error" = "normal", durationMs = 2600): void {
    if (!this.debug.enabled || !this.toast) return;
    this.node("toast-message").text(message);
    this.toast.tint(tone === "error" ? "#633728" : tone === "success" ? "#35442b" : FIELD_COLORS.ink).show(true);
    if (this.toastTimer !== null) window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => this.toast?.show(false), durationMs);
  }
  reportAssetState(plotId: string, state: string, message?: string): void {
    const states = this.assetStates;
    if (states.get(plotId) === state) return;
    states.set(plotId, state);
    this.renderActions();
    if (state === "error" && message)
      this.showToast(`作物加载失败：${message}`, "error");
  }
  inspect() {
    return {
      debugMode: this.debug.enabled,
      overview: this.overview?.inspect() ?? { open: false },
      storage: this.storagePanel?.inspect() ?? { open: false },
      seedTrayOpen: this.lockedPlotId !== null,
      selectedSeedId: this.selection.selectedId,
      candidateSeedId: this.selection.candidateId,
      detailsVisible: false,
      ...this.seedPicker?.inspect(),
      targetPlotId: this.targetPlotId,
      primaryAction: this.primaryAction,
      busy: this.busy,
      hotbar: this.actionBar.inspect(),
      assetState: this.targetPlotId ? (this.assetStates.get(this.targetPlotId) ?? "empty") : "empty",
    };
  }
  dispose(): void {
    this.actions.seedPreview(null, null);
    this.abort.abort();
    this.unsubscribeResize();
    this.actionBar.dispose();
    this.unsubscribeDebug();
    this.removeDebugPanels();
  }

  private applyDebugMode(): void {
    if (this.debug.enabled) {
      if (!this.debugRoot) this.createDebugPanels();
      if (this.snapshot) {
        this.overview?.setState(this.snapshot, [...this.statuses.values()]);
        this.storagePanel?.setState(this.snapshot);
        this.renderInventory();
      }
      this.seedPicker?.setBusy(this.busy);
      this.storagePanel?.setBusy(this.busy);
      this.setSaveState(this.saveState, this.saveDetail);
    } else {
      this.removeDebugPanels();
      if (!this.selection.selectedId) this.selection.confirm();
    }
    this.layout();
    this.renderActions();
  }

  private removeDebugPanels(): void {
    if (!this.debugRoot) return;
    this.actions.seedPreview(null, null);
    this.lockedPlotId = null;
    this.ui.setModal(null);
    this.modalChanged(false, null);
    this.overview?.dispose();
    this.storagePanel?.dispose();
    this.seedPicker?.dispose();
    this.overview = undefined;
    this.storagePanel = undefined;
    this.seedPicker = undefined;
    this.ui.remove(this.debugRoot);
    if (this.toastLayer) this.ui.remove(this.toastLayer);
    this.debugRoot = undefined;
    this.toastLayer = undefined;
    this.warehouse = undefined;
    this.diagnostics = undefined;
    this.toast = undefined;
    this.inventory.clear();
    this.factorFills.clear();
    if (this.toastTimer !== null) window.clearTimeout(this.toastTimer);
    this.toastTimer = null;
  }

  private createDebugPanels(): void {
    const ui = this.ui,
      icons = this.icons,
      cropIcons = this.cropIcons,
      definitions = this.definitions,
      actions = this.actions;
    this.debugRoot = ui.group(this.root, "farm-debug-panels");
    ui.button(this.debugRoot, "farm-overview-open", "种植总览  M", () => this.overview?.open())
      .rect(18, 18, 154, 48)
      .show(true);
    ui.button(this.debugRoot, "harvest-basket-toggle", "篮子  B", () => this.toggleBasket()).rect(184, 18, 154, 48);
    this.warehouse = ui.panel(this.debugRoot, "warehouse").show(true);
    const warehouse = this.warehouse;
    ui.text(warehouse, "warehouse-eyebrow", "HARVEST STORE", 10, FIELD_COLORS.straw).rect(14, 9, 190, 20);
    ui.text(warehouse, "warehouse-title", "收获物", 18).rect(14, 29, 190, 26);
    [...new Map(definitions.catalog.crops.map((crop) => [crop.harvest.itemId, crop.harvest.itemName]))].forEach(
      ([id, name], index) => {
        const crop = definitions.catalog.crops.find((crop) => crop.harvest.itemId === id)!;
        ui.icon(warehouse, `inventory-icon-${id}`, cropIcons[crop.id]).tint("#ffffff");
        ui.text(warehouse, `item-${id}`, name, 13).rect(14, 67 + index * 33, 130, 24);
        this.inventory.set(
          id,
          ui.text(warehouse, `inventory-${id}`, "0 / 0", 14, FIELD_COLORS.straw).rect(158, 67 + index * 33, 58, 24)
        );
      }
    );
    ui.text(warehouse, "warehouse-note", "仓库 / 篮中待卸货", 10, FIELD_COLORS.muted).rect(
      14,
      70 + this.inventory.size * 33,
      210,
      20
    );
    ui.button(warehouse, "warehouse-prev", "‹", () => {
      this.inventoryPage--;
      this.layout();
    });
    ui.button(warehouse, "warehouse-next", "›", () => {
      this.inventoryPage++;
      this.layout();
    });
    ui.text(warehouse, "warehouse-page", "", 11, FIELD_COLORS.muted);
    ui.button(warehouse, "warehouse-manage", "管理仓储", () => this.storagePanel?.open());
    this.diagnostics = ui.panel(this.debugRoot, "crop-diagnostics").show(false);
    const diagnostics = this.diagnostics;
    ui.text(diagnostics, "diagnostics-eyebrow", "LIVE CROP DIAGNOSIS", 9, FIELD_COLORS.straw);
    ui.text(diagnostics, "diagnostics-title", "作物实时诊断", 17);
    ui.text(diagnostics, "diagnostics-summary", "", 10, FIELD_COLORS.muted);
    CROP_GROWTH_FACTOR_ORDER.forEach((id) => {
      ui.text(diagnostics, `diagnostics-${id}-label`, "", 10, FIELD_COLORS.muted);
      const track = ui.panel(diagnostics, `diagnostics-${id}-track`, "#3b4638");
      this.factorFills.set(id, ui.panel(track, `diagnostics-${id}-fill`, FIELD_COLORS.growing));
      ui.text(diagnostics, `diagnostics-${id}-value`, "", 10);
    });
    ui.panel(diagnostics, "diagnostics-health-track", "#3b4638");
    ui.panel(this.node("diagnostics-health-track"), "diagnostics-health-fill", FIELD_COLORS.leaf);
    ui.text(diagnostics, "diagnostics-health-label", "健康度", 10, FIELD_COLORS.muted);
    ui.text(diagnostics, "diagnostics-health-value", "", 10);
    ui.text(diagnostics, "diagnostics-yield", "", 11, FIELD_COLORS.straw);
    ui.text(
      this.debugRoot,
      "movement-help",
      `WASD 行走   按住左键环顾   M 总览   B 篮子   Tab 切换按钮`,
      11,
      FIELD_COLORS.paper
    );
    ui.text(this.debugRoot, "save-state", "加载农场", 11, FIELD_COLORS.straw);
    this.seedPicker = new SeedSelectionPanel(
      ui,
      definitions,
      cropIcons,
      this.selection,
      () => this.confirmSeed(),
      () => this.closeSeedTray()
    );
    this.toastLayer = ui.layer("toast-layer", 40);
    this.toast = ui.panel(this.toastLayer, "toast", FIELD_COLORS.ink).show(false);
    ui.text(this.toast, "toast-message", "", 13);
    this.overview = new FarmOverviewPanel(
      ui,
      definitions,
      cropIcons,
      icons.harvest,
      (open) => this.modalChanged(open, null),
      () => !this.busy && !this.lockedPlotId && !this.storagePanel?.isOpen
    );
    this.storagePanel = new FarmStoragePanel(
      ui,
      definitions,
      actions.storageWrite,
      (open) => this.modalChanged(open, null),
      () => !this.busy && !this.lockedPlotId && !this.overview?.isOpen
    );
  }

  private renderInventory(): void {
    if (!this.snapshot) return;
    const pending = new Map<string, number>();
    for (const item of this.snapshot.items.instances)
      for (const entry of item.contents) pending.set(entry.itemId, (pending.get(entry.itemId) ?? 0) + entry.quantity);
    for (const [id, label] of this.inventory)
      label.text(`${this.snapshot.inventory[id] ?? 0} / ${pending.get(id) ?? 0}`);
  }

  private node(id: string): FarmUiNode {
    return this.ui.nodes.get(id)!;
  }
  private modalChanged(open: boolean, plotId: string | null): void {
    this.root.show(!open);
    this.actions.modalState(open, plotId);
  }
  private performAction(id: FarmHotbarActionId): void {
    if (this.busy || this.overview?.isOpen || this.storagePanel?.isOpen || this.lockedPlotId || !this.snapshot) return;
    if (id === "hide-basket") {
      this.actions.hideBasket();
      return;
    }
    const plotId = this.targetPlotId;
    if (!plotId && !(id === "hoe" && this.targetGround)) {
      this.showToast("请看向附近土地");
      return;
    }
    const available = this.actions.api
      .getAvailableActions(plotId ?? this.targetGround!)
      .find((action) => action.action === id);
    if (!available?.enabled) {
      this.showToast(available?.reason ?? "操作不可用");
      return;
    }
    if (id === "plant" && !this.selection.selectedId) {
      this.openSeedTray(plotId!);
      return;
    }
    const input = FARM_ACTION_PRESENTATION[id].input({
      plotId: plotId ?? "",
      ground: this.targetGround ?? undefined,
      seedId: this.selection.selectedId,
      cropInstanceId: this.statuses.get(plotId ?? "")?.crop?.instanceId ?? null
    });
    if (input) this.actions.execute(input);
  }
  private confirmSeed(): void {
    if (this.busy || !this.lockedPlotId) return;
    this.selection.confirm();
    this.closeSeedTray();
  }
  private openSeedTray(plotId: string): void {
    if (
      this.busy ||
      this.overview?.isOpen ||
      this.storagePanel?.isOpen ||
      !this.actions.api.getAvailableActions(plotId).some((action) => action.action === "plant" && action.enabled) ||
      !this.actions.api.getPlot(plotId)
    )
      return;
    if (!this.debug.enabled) {
      const index = this.definitions.seeds.findIndex((seed) => seed.id === this.selection.selectedId);
      this.selection.preview(this.definitions.seeds[(index + 1) % this.definitions.seeds.length].id);
      this.selection.confirm();
      this.renderActions();
      return;
    }
    this.lockedPlotId = plotId;
    this.seedPicker?.open();
    this.modalChanged(true, plotId);
    this.actions.seedPreview(plotId, this.selection.candidateId);
  }
  private renderActions(): void {
    const plotId = this.targetPlotId;
    const status = plotId ? this.statuses.get(plotId) : undefined;
    const availability =
      plotId || this.targetGround
        ? this.actions.api.getAvailableActions(plotId ?? this.targetGround!)
        : this.actions.api
            .getActionDefinitions()
            .map(({ id }) => ({ action: id, enabled: false, reason: "请看向附近土地" }));
    const recommended =
      !plotId && this.targetGround ? "hoe" : !status?.crop ? "plant" : status.crop.mature ? "harvest" : "irrigate";
    this.primaryAction = availability.some((action) => action.action === recommended && action.enabled)
      ? recommended
      : null;
    this.renderDiagnostics(status);
    const seed = this.definitions.seeds.find((seed) => seed.id === this.selection.selectedId);
    this.actionBar.setState({
      availability: [...availability, { action: "hide-basket", enabled: true }],
      busy: this.busy,
      debugMode: this.debug.enabled,
      seedName: seed?.name ?? "选择种子",
      seedIcon: seed ? this.cropIcons[seed.cropId] : null,
      canChangeSeed: availability.some((action) => action.action === "plant" && action.enabled),
      retryVisual: Boolean(plotId && this.assetStates.get(plotId) === "error")
    });
  }
  private renderDiagnostics(status?: PlotStatusView): void {
    if (!this.debug.enabled) return;
    const crop = status?.crop;
    this.diagnostics?.show(Boolean(crop));
    if (!crop) return;
    this.node("diagnostics-title").text(`${crop.cropName} · ${crop.stageName}`);
    const limiting = crop.factors.find((factor) => factor.id === crop.limitingFactorId);
    this.node("diagnostics-summary").text(
      crop.pausedReason === "ground-unavailable"
        ? "地形不可用 · 生长已暂停"
        : crop.pausedReason === "growth-paused"
          ? "作物生长倍数为 0 · 生长已暂停"
          : crop.mature
            ? "已经成熟，可以收获"
            : limiting
              ? `限制因素：${limiting.name} · 当前速度 ${Math.round((crop.growthCoefficientPermille * crop.growthMultiplier) / 10)}%`
              : `当前速度 ${Math.round((crop.growthCoefficientPermille * crop.growthMultiplier) / 10)}%`
    );
    for (const factor of crop.factors) {
      const percent = Math.round(factor.coefficientPermille / 10);
      this.node(`diagnostics-${factor.id}-label`).text(factor.name);
      this.node(`diagnostics-${factor.id}-value`).text(`${formatFactorValue(factor.value, factor.unit)} · ${percent}%`);
      this.factorFills
        .get(factor.id)!
        .tint(
          percent === 0
            ? FIELD_COLORS.dry
            : factor.id === crop.limitingFactorId
              ? FIELD_COLORS.straw
              : FIELD_COLORS.growing
        )
        .rect(0, 0, percent, 6);
    }
    const healthPercent = Math.round(crop.healthPermille / 10);
    this.node("diagnostics-health-fill")
      .tint(healthPercent < 50 ? FIELD_COLORS.dry : FIELD_COLORS.leaf)
      .rect(0, 0, healthPercent, 6);
    this.node("diagnostics-health-value").text(`${healthPercent}%`);
    this.node("diagnostics-yield").text(
      `预计产量 ${crop.expectedHarvestQuantity} / ${crop.maximumHarvestQuantity} · 成熟度 ${Math.round(crop.growthPermille / 10)}%`
    );
  }
  private onKey(event: KeyboardEvent): void {
    if (isFarmTextInput(event) || event.repeat) return;
    if (event.code === "F2") {
      event.preventDefault();
      this.debug.setEnabled(!this.debug.enabled);
      return;
    }
    if (event.code === "Escape") {
      if (this.storagePanel?.isOpen) this.storagePanel?.close();
      else if (this.overview?.isOpen) this.overview?.close();
      else this.closeSeedTray();
      return;
    }
    if (event.code === "KeyB" && !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey) {
      event.preventDefault();
      this.toggleBasket();
      return;
    }
    if (this.debug.enabled && event.code === "KeyM") {
      event.preventDefault();
      if (this.busy || this.lockedPlotId || this.storagePanel?.isOpen) return;
      this.overview?.isOpen ? this.overview?.close() : this.overview?.open();
      return;
    }
    if (this.busy || this.overview?.isOpen || this.storagePanel?.isOpen) return;
    if (this.lockedPlotId) {
      const seedIndex = /^(?:Digit|Numpad)([1-9])$/.exec(event.code);
      if (seedIndex) {
        event.preventDefault();
        const seed = this.definitions.seeds[Number(seedIndex[1]) - 1];
        if (seed) this.seedPicker?.preview(seed.id);
      } else if (event.code === "KeyQ") {
        event.preventDefault();
        this.closeSeedTray();
      } else if (event.code === "KeyE") {
        event.preventDefault();
        this.confirmSeed();
      }
      return;
    }
    const action = this.actionBar.actionForKey(event.code);
    if (action) {
      if (action === "hide-basket" && (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey)) return;
      event.preventDefault();
      this.performAction(action);
    } else if (event.code === "KeyQ") {
      event.preventDefault();
      if (this.targetPlotId) this.openSeedTray(this.targetPlotId);
    } else if (event.code === "KeyE") {
      event.preventDefault();
      if (this.primaryAction) this.performAction(this.primaryAction);
    }
  }
  private toggleBasket(): void {
    if (this.busy || this.overview?.isOpen || this.storagePanel?.isOpen || this.lockedPlotId) return;
    this.actions.toggleBasket();
  }
  private layout(): void {
    const { width, height } = this.ui;
    this.crosshair.rect(width / 2, height / 2, 0, 0);
    this.actionBar.layout();
    if (!this.debug.enabled || !this.warehouse || !this.diagnostics || !this.toast) return;
    const compact = width <= 600;
    const warehouseWidth = compact ? 194 : 272;
    const rowHeight = compact ? 24 : 33;
    const pageSize = compact ? 2 : 4;
    if (this.inventoryPageSize !== pageSize)
      this.inventoryPage = Math.floor((this.inventoryPage * this.inventoryPageSize) / pageSize);
    this.inventoryPageSize = pageSize;
    const pages = Math.ceil(this.inventory.size / pageSize);
    this.inventoryPage = Math.max(0, Math.min(pages - 1, this.inventoryPage));
    const rows = Math.min(this.inventory.size, pageSize);
    const startY = compact ? 46 : 67;
    const footerY = startY + rows * rowHeight + 6;
    this.warehouse.rect(width - warehouseWidth - 12, 18, warehouseWidth, footerY + 100);
    this.node("warehouse-manage").rect(10, footerY + 40, warehouseWidth - 20, 32);
    this.node("warehouse-eyebrow").show(!compact);
    this.node("warehouse-title").rect(14, compact ? 12 : 29, warehouseWidth - 28, 26);
    this.node("warehouse-note").show(true).rect(10, footerY + 78, warehouseWidth - 20, 18);
    this.node("warehouse-prev")
      .rect(10, footerY, 36, 32)
      .enable(this.inventoryPage > 0);
    this.node("warehouse-next")
      .rect(warehouseWidth - 46, footerY, 36, 32)
      .enable(this.inventoryPage < pages - 1);
    this.node("warehouse-page")
      .rect(warehouseWidth / 2 - 20, footerY + 4, 46, 24)
      .text(`${this.inventoryPage + 1} / ${pages}`);
    [...this.inventory].forEach(([id, amount], absoluteIndex) => {
      const index = absoluteIndex - this.inventoryPage * pageSize;
      const visible = index >= 0 && index < pageSize;
      this.node(`inventory-icon-${id}`)
        .show(visible)
        .rect(12, startY + index * rowHeight, 24, 24);
      this.node(`item-${id}`)
        .show(visible)
        .rect(42, startY + index * rowHeight, warehouseWidth - 132, 24);
      amount.show(visible).rect(warehouseWidth - 84, startY + index * rowHeight, 74, 24);
    });
    this.node("movement-help")
      .rect(18, height - 43, Math.max(0, width - 170), 28)
      .show(width > 900);
    this.node("save-state").rect(18, height - 70, 116, 28);
    const diagnosticsWidth = width <= 600 ? 248 : 286;
    this.diagnostics.rect(18, 78, diagnosticsWidth, 270);
    this.node("diagnostics-eyebrow").rect(14, 8, diagnosticsWidth - 28, 18);
    this.node("diagnostics-title").rect(14, 25, diagnosticsWidth - 28, 24);
    this.node("diagnostics-summary").rect(14, 48, diagnosticsWidth - 28, 20);
    CROP_GROWTH_FACTOR_ORDER.forEach((id, index) => {
      const y = 75 + index * 25;
      this.node(`diagnostics-${id}-label`).rect(14, y, 76, 18);
      this.node(`diagnostics-${id}-track`).rect(91, y + 6, 100, 6);
      this.node(`diagnostics-${id}-value`).rect(198, y, diagnosticsWidth - 210, 18);
    });
    this.node("diagnostics-health-label").rect(14, 228, 76, 18);
    this.node("diagnostics-health-track").rect(91, 234, 100, 6);
    this.node("diagnostics-health-value").rect(198, 228, 56, 18);
    this.node("diagnostics-yield").rect(14, 248, diagnosticsWidth - 28, 18);
    const toastWidth = Math.min(520, width - 24);
    this.toast.rect((width - toastWidth) / 2, 18, toastWidth, 45);
    this.node("toast-message").rect(12, 6, toastWidth - 24, 33);
  }
}

function formatFactorValue(value: number, unit: string): string {
  const formatted = Number.isInteger(value) ? String(value) : value.toFixed(1);
  return unit === "pH" ? formatted : `${formatted}${unit}`;
}
