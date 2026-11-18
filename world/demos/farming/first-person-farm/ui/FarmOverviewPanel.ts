import { Script, Sprite } from "@galacean/engine";
import type {
  CropStatusView,
  FarmSnapshot,
  FarmingDefinitionSet,
  PlotStatusView
} from "@galacean/engine-farming/farming/domain/index";
import { FarmUi, FarmUiNode } from "./FarmUi.ts";
import { buildPlantingOverview, clampOverviewOffset, plantingState, type PlantingGroup } from "./PlantingOverviewModel.ts";
import { ProgressRingAtlas } from "./ProgressRingAtlas.ts";

const PAPER = {
  board: "#f6eed9",
  ink: "#493820",
  muted: "#817157",
  rule: "#dfd3b8",
  green: "#7e9956",
  track: "#e0d8c2",
  gold: "#b7812e",
  amber: "#b87837"
};
const CELL = 72,
  STEP = 80;

class OverviewHover extends Script {
  enter: (() => void) | null = null;
  leave: (() => void) | null = null;
  override onPointerEnter(): void {
    this.enter?.();
  }
  override onPointerExit(): void {
    this.leave?.();
  }
}
interface CropCell {
  readonly root: FarmUiNode;
  readonly track: FarmUiNode;
  readonly ring: FarmUiNode;
  readonly icon: FarmUiNode;
  readonly badge: FarmUiNode;
  readonly harvest: FarmUiNode;
  readonly pause: FarmUiNode;
  status: CropStatusView;
}
interface CropRow {
  readonly root: FarmUiNode;
  readonly icon: FarmUiNode;
  readonly name: FarmUiNode;
  readonly count: FarmUiNode;
  readonly previous: FarmUiNode;
  readonly next: FarmUiNode;
  readonly range: FarmUiNode;
  readonly rule: FarmUiNode;
  readonly cells: Map<string, CropCell>;
}

/** A virtual list of living crop instances. No terrain geometry participates in layout. */
export class FarmOverviewPanel {
  private readonly root: FarmUiNode;
  private readonly panel: FarmUiNode;
  private readonly backdrop: FarmUiNode;
  private readonly count: FarmUiNode;
  private readonly closeButton: FarmUiNode;
  private readonly previous: FarmUiNode;
  private readonly next: FarmUiNode;
  private readonly empty: FarmUiNode;
  private readonly hint: FarmUiNode;
  private readonly rings: ProgressRingAtlas;
  private readonly rows = new Map<string, CropRow>();
  private readonly offsets = new Map<string, number>();
  private readonly abort = new AbortController();
  private readonly unsubscribeResize: () => void;
  private groups: PlantingGroup[] = [];
  private openState = false;
  private rowOffset = 0;
  private rowCapacity = 1;
  private columnCapacity = 1;
  private compact = false;
  private rowHeight = 108;
  private sequenceX = 170;
  private bodyY = 122;
  private activeCropId: string | null = null;
  private hintedInstanceId: string | null = null;
  private gesture: { x: number; y: number; cropId: string; axis: "x" | "y" | null } | null = null;

  constructor(
    private readonly ui: FarmUi,
    private readonly definitions: FarmingDefinitionSet,
    private readonly icons: Readonly<Record<string, Sprite>>,
    private readonly harvestIcon: Sprite,
    private readonly onOpenChange: (open: boolean) => void,
    private readonly canOpen: () => boolean
  ) {
    this.rings = new ProgressRingAtlas(ui.engine);
    this.root = ui.layer("farm-overview", 30).show(false);
    this.backdrop = ui.button(this.root, "overview-backdrop", "", () => this.close()).tint("#18201888");
    this.panel = ui.panel(this.root, "overview-panel", PAPER.board, true);
    ui.text(this.panel, "overview-title", "种植总览", 24, PAPER.ink).rect(24, 22, 240, 32);
    this.count = ui.text(this.panel, "overview-count", "", 13, PAPER.muted);
    this.closeButton = ui
      .button(this.panel, "overview-close", "×", () => this.close())
      .tint(PAPER.board)
      .buttonColors(PAPER.ink);
    ui.panel(this.panel, "overview-heading-rule", PAPER.rule);
    ui.text(this.panel, "overview-order", "按种植顺序排列 · 新种植在右侧", 11, PAPER.muted);
    this.empty = ui.text(
      this.panel,
      "overview-empty",
      "还没有种植作物\n播下种子后，就能在这里看到生长进度。",
      15,
      PAPER.muted
    );
    this.hint = ui.text(this.panel, "overview-hint", "圆环表示生长进度 · 篮子表示可采摘", 11, PAPER.muted);
    this.previous = ui
      .button(this.panel, "overview-up", "↑", () => this.scrollRows(-1))
      .tint(PAPER.rule)
      .buttonColors(PAPER.ink, PAPER.muted);
    this.next = ui
      .button(this.panel, "overview-down", "↓", () => this.scrollRows(1))
      .tint(PAPER.rule)
      .buttonColors(PAPER.ink, PAPER.muted);
    const options = { signal: this.abort.signal };
    ui.canvasElement.addEventListener(
      "wheel",
      (event) => {
        if (!this.openState) return;
        event.preventDefault();
        const row = this.rowAt(event.clientX, event.clientY);
        if (row && (event.shiftKey || Math.abs(event.deltaX) > Math.abs(event.deltaY))) {
          this.scrollColumns(row, Math.sign(event.deltaX || event.deltaY));
        } else if (event.deltaY) this.scrollRows(Math.sign(event.deltaY));
      },
      { ...options, passive: false }
    );
    ui.canvasElement.addEventListener(
      "pointerdown",
      (event) => {
        if (!this.openState || event.button !== 0) return;
        const cropId = this.rowAt(event.clientX, event.clientY);
        if (cropId) this.gesture = { x: event.clientX, y: event.clientY, cropId, axis: null };
      },
      options
    );
    ui.canvasElement.addEventListener(
      "pointermove",
      (event) => {
        const gesture = this.gesture;
        if (!gesture) return;
        const dx = event.clientX - gesture.x,
          dy = event.clientY - gesture.y;
        if (!gesture.axis && Math.max(Math.abs(dx), Math.abs(dy)) > 8)
          gesture.axis = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
        if (gesture.axis === "x" && Math.abs(dx) >= 40) {
          this.scrollColumns(gesture.cropId, -Math.sign(dx));
          gesture.x = event.clientX;
        } else if (gesture.axis === "y" && Math.abs(dy) >= 48) {
          this.scrollRows(-Math.sign(dy));
          gesture.y = event.clientY;
        }
      },
      options
    );
    const endGesture = () => {
      this.gesture = null;
    };
    window.addEventListener("pointerup", endGesture, options);
    window.addEventListener("pointercancel", endGesture, options);
    window.addEventListener("blur", endGesture, options);
    window.addEventListener(
      "keydown",
      (event) => {
        if (!this.openState) return;
        if (["ArrowDown", "ArrowUp", "PageDown", "PageUp"].includes(event.code)) {
          event.preventDefault();
          this.scrollRows(event.code.endsWith("Down") ? 1 : -1);
        } else if (["ArrowLeft", "ArrowRight"].includes(event.code) && this.activeCropId) {
          event.preventDefault();
          this.scrollColumns(this.activeCropId, event.code === "ArrowRight" ? 1 : -1);
        }
      },
      options
    );
    this.unsubscribeResize = ui.onResize(() => this.layout());
    this.layout();
  }

  setState(snapshot: FarmSnapshot, statuses: readonly PlotStatusView[]): void {
    const anchor = this.groups[this.rowOffset]?.cropId;
    const next = buildPlantingOverview(snapshot, statuses, this.definitions);
    for (const previous of this.groups) {
      const first = previous.crops[this.offsets.get(previous.cropId) ?? 0]?.instanceId;
      const index = next
        .find((group) => group.cropId === previous.cropId)
        ?.crops.findIndex((crop) => crop.instanceId === first);
      if (index !== undefined && index >= 0) this.offsets.set(previous.cropId, index);
    }
    const typeCountChanged = this.groups.length !== next.length;
    this.groups = next;
    const anchorIndex = next.findIndex((group) => group.cropId === anchor);
    if (anchorIndex >= 0) this.rowOffset = anchorIndex;
    for (const id of this.offsets.keys()) if (!next.some((group) => group.cropId === id)) this.offsets.delete(id);
    if (this.openState) {
      if (typeCountChanged) this.layout();
      else this.render();
    }
  }
  open(): void {
    if (this.openState || !this.canOpen()) return;
    this.openState = true;
    this.root.show(true);
    this.layout();
    this.ui.setModal(this.root);
    this.ui.focus(this.closeButton, true);
    this.onOpenChange(true);
  }
  close(): void {
    if (!this.openState) return;
    this.openState = false;
    this.gesture = null;
    this.hintedInstanceId = null;
    this.hint.text("圆环表示生长进度 · 篮子表示可采摘");
    this.root.show(false);
    this.ui.setModal(null);
    this.ui.focus(this.ui.nodes.get("farm-overview-open") ?? null);
    this.onOpenChange(false);
  }
  get isOpen(): boolean {
    return this.openState;
  }
  inspect() {
    return {
      open: this.openState,
      total: this.groups.reduce((sum, group) => sum + group.crops.length, 0),
      rowOffset: this.rowOffset,
      rowCapacity: this.rowCapacity,
      columnCapacity: this.columnCapacity,
      renderedCells: [...this.rows.values()].reduce((sum, row) => sum + row.cells.size, 0),
      groups: this.groups.map((group) => ({
        cropId: group.cropId,
        count: group.crops.length,
        matureCount: group.matureCount,
        instanceIds: group.crops.map((crop) => crop.instanceId),
        offset: this.offsets.get(group.cropId) ?? 0,
        visible: this.rows.has(group.cropId),
        entries: [...(this.rows.get(group.cropId)?.cells.values() ?? [])].map((cell) => ({
          instanceId: cell.status.instanceId,
          nodeId: cell.root.entity.instanceId,
          progress: cell.status.growthPermille,
          state: plantingState(cell.status),
          ringVisible: cell.track.entity.isActiveInHierarchy,
          harvestVisible: cell.harvest.entity.isActiveInHierarchy,
          iconSpriteId: cell.icon.image!.sprite!.instanceId
        }))
      }))
    };
  }
  dispose(): void {
    this.abort.abort();
    this.unsubscribeResize();
    this.ui.remove(this.root);
    this.rows.clear();
    this.rings.dispose();
  }

  private layout(): void {
    const width = Math.min(900, this.ui.width - 24);
    this.compact = width < 620;
    this.rowHeight = this.compact ? 144 : 108;
    const height = Math.min(
      690,
      this.ui.height - 24,
      Math.max(320, this.bodyY + 56 + this.groups.length * this.rowHeight)
    );
    this.sequenceX = this.compact ? 0 : 176;
    this.rowCapacity = Math.max(1, Math.floor((height - this.bodyY - 56) / this.rowHeight));
    this.columnCapacity = Math.max(1, Math.floor((width - 48 - this.sequenceX - 56) / STEP));
    this.backdrop.rect(0, 0, this.ui.width, this.ui.height);
    this.panel.rect((this.ui.width - width) / 2, (this.ui.height - height) / 2, width, height);
    this.closeButton.rect(width - 60, 18, 40, 40);
    this.count.rect(24, 64, width - 48, 22);
    this.ui.nodes.get("overview-heading-rule")!.rect(24, 94, width - 48, 1);
    this.ui.nodes.get("overview-order")!.rect(24, 102, width - 48, 18);
    this.empty.rect(24, 150, width - 48, 74).show(!this.groups.length);
    this.hint.rect(24, height - 39, width - 132, 22);
    this.previous.rect(width - 94, height - 44, 30, 30);
    this.next.rect(width - 58, height - 44, 30, 30);
    if (this.openState) this.render();
  }
  private scrollRows(delta: number): void {
    this.rowOffset = clampOverviewOffset(this.rowOffset + delta, this.groups.length, this.rowCapacity);
    this.render();
  }
  private scrollColumns(cropId: string, delta: number): void {
    const group = this.groups.find((group) => group.cropId === cropId);
    if (!group) return;
    this.activeCropId = cropId;
    this.offsets.set(
      cropId,
      clampOverviewOffset((this.offsets.get(cropId) ?? 0) + delta, group.crops.length, this.columnCapacity)
    );
    this.render();
  }
  private rowAt(clientX: number, clientY: number): string | undefined {
    const bounds = this.ui.canvasElement.getBoundingClientRect();
    const x = clientX - bounds.left - this.panel.x,
      y = clientY - bounds.top - this.panel.y - this.bodyY;
    if (x < 24 || x > this.panel.width - 24 || y < 0 || y >= this.rowCapacity * this.rowHeight) return;
    return this.groups[this.rowOffset + Math.floor(y / this.rowHeight)]?.cropId;
  }
  private showHint(crop: CropStatusView): void {
    this.activeCropId = crop.cropId;
    this.hintedInstanceId = crop.instanceId;
    this.hint.text(`${crop.cropName} · ${plantingState(crop)}`);
  }
  private render(): void {
    this.rowOffset = clampOverviewOffset(this.rowOffset, this.groups.length, this.rowCapacity);
    const visible = this.groups.slice(this.rowOffset, this.rowOffset + this.rowCapacity);
    for (const [id, row] of this.rows)
      if (!visible.some((group) => group.cropId === id)) {
        this.ui.remove(row.root);
        this.rows.delete(id);
      }
    if (this.hintedInstanceId) {
      const hinted = this.groups
        .flatMap((group) => group.crops)
        .find((crop) => crop.instanceId === this.hintedInstanceId);
      if (hinted) this.showHint(hinted);
      else {
        this.hintedInstanceId = null;
        this.hint.text("圆环表示生长进度 · 篮子表示可采摘");
      }
    }
    const total = this.groups.reduce((sum, group) => sum + group.crops.length, 0);
    const mature = this.groups.reduce((sum, group) => sum + group.matureCount, 0);
    this.count.text(`${this.groups.length} 种作物 · ${total} 株 · ${mature} 株可采摘`);
    this.empty.show(!total);
    this.previous.show(this.groups.length > this.rowCapacity).enable(this.rowOffset > 0);
    this.next
      .show(this.groups.length > this.rowCapacity)
      .enable(this.rowOffset + this.rowCapacity < this.groups.length);
    visible.forEach((group, index) => this.renderRow(group, index));
  }
  private renderRow(group: PlantingGroup, index: number): void {
    let row = this.rows.get(group.cropId);
    if (!row) {
      const root = this.ui.group(this.panel, `overview-row-${group.cropId}`);
      const previous = this.ui
        .button(root, `overview-prev-${group.cropId}`, "‹", () => this.scrollColumns(group.cropId, -1))
        .tint(PAPER.board)
        .buttonColors(PAPER.ink, PAPER.muted);
      const next = this.ui
        .button(root, `overview-next-${group.cropId}`, "›", () => this.scrollColumns(group.cropId, 1))
        .tint(PAPER.board)
        .buttonColors(PAPER.ink, PAPER.muted);
      row = {
        root,
        previous,
        next,
        icon: this.ui.icon(root, `overview-type-icon-${group.cropId}`, this.icons[group.cropId]).tint("#ffffff"),
        name: this.ui.text(root, `overview-name-${group.cropId}`, group.name, 17, PAPER.ink),
        count: this.ui.text(root, `overview-total-${group.cropId}`, "", 11, PAPER.muted),
        range: this.ui.text(root, `overview-range-${group.cropId}`, "", 10, PAPER.muted),
        rule: this.ui.panel(root, `overview-rule-${group.cropId}`, PAPER.rule),
        cells: new Map()
      };
      this.rows.set(group.cropId, row);
      previous.focusChanged = next.focusChanged = (focused) => {
        if (focused) this.activeCropId = group.cropId;
      };
    }
    const width = this.panel.width - 48,
      sequenceY = this.compact ? 45 : 6;
    row.root.rect(24, this.bodyY + index * this.rowHeight, width, this.rowHeight);
    row.icon.rect(0, this.compact ? 3 : 20, 32, 32);
    row.name.rect(42, this.compact ? 1 : 18, 126, 22);
    row.count
      .text(`${group.crops.length} 株 · ${group.matureCount} 株可采摘`)
      .rect(42, this.compact ? 25 : 45, 132, 17);
    row.rule.rect(0, this.rowHeight - 1, width, 1);
    const offset = clampOverviewOffset(this.offsets.get(group.cropId) ?? 0, group.crops.length, this.columnCapacity);
    this.offsets.set(group.cropId, offset);
    const overflow = group.crops.length > this.columnCapacity;
    row.previous
      .rect(this.sequenceX, sequenceY + 20, 24, 32)
      .show(overflow)
      .enable(offset > 0);
    row.next
      .rect(width - 24, sequenceY + 20, 24, 32)
      .show(overflow)
      .enable(offset + this.columnCapacity < group.crops.length);
    row.range
      .text(`${offset + 1}–${Math.min(group.crops.length, offset + this.columnCapacity)} / ${group.crops.length}`)
      .rect(this.sequenceX + 28, sequenceY + 76, width - this.sequenceX - 56, 16)
      .show(overflow);
    const crops = group.crops.slice(offset, offset + this.columnCapacity);
    for (const [id, cell] of row.cells)
      if (!crops.some((crop) => crop.instanceId === id)) {
        this.ui.remove(cell.root);
        row.cells.delete(id);
      }
    crops.forEach((crop, column) => {
      let cell = row!.cells.get(crop.instanceId);
      if (!cell) {
        const root = this.ui
          .button(row!.root, `overview-instance-${crop.instanceId}`, "", () => this.showHint(cell!.status))
          .tint(PAPER.board);
        cell = {
          root,
          status: crop,
          track: this.ui
            .icon(root, `overview-track-${crop.instanceId}`, this.rings.sprites[100])
            .rect(0, 0, CELL, CELL)
            .tint(PAPER.track),
          ring: this.ui.icon(root, `overview-ring-${crop.instanceId}`, this.rings.sprites[0]).rect(0, 0, CELL, CELL),
          icon: this.ui
            .icon(root, `overview-icon-${crop.instanceId}`, this.icons[group.cropId])
            .rect(16, 16, 40, 40)
            .tint("#ffffff"),
          badge: this.ui.panel(root, `overview-badge-${crop.instanceId}`, PAPER.gold).rect(48, 46, 24, 24),
          harvest: this.ui
            .icon(root, `overview-harvest-${crop.instanceId}`, this.harvestIcon)
            .rect(50, 48, 20, 20)
            .tint("#ffffff"),
          pause: this.ui.text(root, `overview-pause-${crop.instanceId}`, "Ⅱ", 12, "#fffaf0").rect(54, 51, 16, 16)
        };
        root.focusChanged = (focused) => {
          root.tint(focused ? "#ece0bf" : PAPER.board);
          if (focused) this.showHint(cell!.status);
        };
        const hover = root.entity.addComponent(OverviewHover);
        hover.enter = () => this.showHint(cell!.status);
        hover.leave = () => {
          if (!this.ui.isKeyboardFocused(root)) {
            this.hintedInstanceId = null;
            this.hint.text("圆环表示生长进度 · 篮子表示可采摘");
          }
        };
        row!.cells.set(crop.instanceId, cell);
      }
      cell.status = crop;
      cell.root.rect(this.sequenceX + 28 + column * STEP, sequenceY, CELL, CELL);
      cell.track.show(!crop.mature);
      const percent = Math.floor(crop.growthPermille / 10);
      const sprite = this.rings.sprites[Math.min(100, percent)];
      if (cell.ring.image!.sprite !== sprite) cell.ring.image!.sprite = sprite;
      cell.ring.show(!crop.mature && percent > 0).tint(crop.pausedReason ? PAPER.amber : PAPER.green);
      cell.harvest.show(crop.mature);
      cell.badge.show(crop.mature || Boolean(crop.pausedReason)).tint(crop.mature ? PAPER.gold : PAPER.amber);
      cell.pause.show(!crop.mature && Boolean(crop.pausedReason));
    });
  }
}
