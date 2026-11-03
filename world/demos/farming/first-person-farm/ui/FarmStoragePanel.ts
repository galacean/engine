import type { FarmSnapshot, FarmingDefinitionSet } from "@galacean/engine-farming/farming/domain/index";
import type { StorageWriteInput } from "@galacean/engine-farming/farming/storage/StorageTypes";
import { storageDefinitions } from "@galacean/engine-farming/farming/storage/StorageRules";
import { FIELD_COLORS, FarmUi, type FarmUiNode } from "./FarmUi.ts";

export interface StorageUiResult {
  readonly ok: boolean;
  readonly message: string;
}

/** Inventory controls consume the same committed snapshots as world-space containers. */
export class FarmStoragePanel {
  private readonly root: FarmUiNode;
  private readonly panel: FarmUiNode;
  private readonly backdrop: FarmUiNode;
  private readonly containerPage: FarmUiNode;
  private readonly withdrawPage: FarmUiNode;
  private readonly unsubscribeResize: () => void;
  private readonly drafts = new Map<string, number>();
  private snapshot?: FarmSnapshot;
  private openState = false;
  private disposed = false;
  private busy = false;
  private page: "containers" | "withdraw" = "containers";
  private cropIndex = 0;
  private quantity = 1;
  private readonly rules;

  constructor(
    private readonly ui: FarmUi,
    private readonly definitions: FarmingDefinitionSet,
    private readonly write: (input: StorageWriteInput) => Promise<StorageUiResult>,
    private readonly onOpenChange: (open: boolean) => void,
    private readonly canOpen: () => boolean
  ) {
    this.rules = storageDefinitions(definitions);
    this.root = ui.layer("farm-storage", 30).show(false);
    this.backdrop = ui.button(this.root, "storage-backdrop", "", () => this.close()).tint("#18201888");
    this.panel = ui.panel(this.root, "storage-panel", FIELD_COLORS.ink, true);
    ui.text(this.panel, "storage-title", "农场仓储", 24).rect(20, 18, 230, 34);
    ui.button(this.panel, "storage-close", "×", () => this.close());
    ui.button(this.panel, "storage-tab-containers", "容器数量", () => this.selectPage("containers"));
    ui.button(this.panel, "storage-tab-withdraw", "取出作物", () => this.selectPage("withdraw"));
    this.containerPage = ui.group(this.panel, "storage-containers");
    this.rules.containers.forEach((type, index) => {
      const row = ui.group(this.containerPage, `storage-row-${type.id}`).rect(0, index * 92, 0, 88);
      ui.text(row, `storage-name-${type.id}`, type.name, 16).rect(0, 0, 68, 26);
      ui.text(row, `storage-current-${type.id}`, "", 12, FIELD_COLORS.muted);
      ui.button(row, `storage-minus-${type.id}`, "−", () => this.changeCount(type.id, -1));
      ui.text(row, `storage-draft-${type.id}`, "", 18, FIELD_COLORS.straw);
      ui.button(row, `storage-plus-${type.id}`, "+", () => this.changeCount(type.id, 1));
      ui.button(
        row,
        `storage-apply-${type.id}`,
        "应用",
        () =>
          void this.submit({
            type: "set-container-count",
            typeId: type.id,
            count: this.drafts.get(type.id) ?? 0
          })
      );
    });
    ui.text(
      this.containerPage,
      "storage-count-note",
      "马车可继续存货，满载后不自动增车。\n篮子满载自动增补，空闲回收到保留数量。",
      12,
      FIELD_COLORS.muted
    );
    this.withdrawPage = ui.group(this.panel, "storage-withdraw").show(false);
    ui.button(this.withdrawPage, "storage-crop-prev", "‹", () => this.changeCrop(-1));
    ui.text(this.withdrawPage, "storage-crop", "", 18, FIELD_COLORS.straw);
    ui.button(this.withdrawPage, "storage-crop-next", "›", () => this.changeCrop(1));
    ui.text(this.withdrawPage, "storage-available", "", 13, FIELD_COLORS.muted);
    ui.button(this.withdrawPage, "storage-quantity-minus", "−", () => {
      this.quantity = Math.max(1, this.quantity - 1);
      this.render();
    });
    ui.text(this.withdrawPage, "storage-quantity", "1", 20, FIELD_COLORS.straw);
    ui.button(this.withdrawPage, "storage-quantity-plus", "+", () => {
      this.quantity++;
      this.render();
    });
    ui.button(this.withdrawPage, "storage-quantity-all", "全部", () => {
      this.quantity = Math.max(1, this.available());
      this.render();
    });
    ui.button(
      this.withdrawPage,
      "storage-withdraw-submit",
      "取出",
      () =>
        void this.submit({
          type: "withdraw-inventory",
          itemId: this.crop().harvest.itemId,
          quantity: this.quantity
        })
    );
    ui.text(this.withdrawPage, "storage-withdraw-note", "取出后扣除仓库库存，容器同步更新。", 12, FIELD_COLORS.muted);
    ui.text(this.panel, "storage-message", "", 12, FIELD_COLORS.straw);
    this.unsubscribeResize = ui.onResize(() => this.layout());
    this.layout();
  }
  get isOpen(): boolean {
    return this.openState;
  }
  open(): void {
    if (this.openState || !this.canOpen() || !this.snapshot) return;
    this.syncDrafts();
    this.node("storage-message").text("");
    this.openState = true;
    this.root.show(true);
    this.ui.setModal(this.root);
    this.ui.focus(this.node("storage-close"), true);
    this.onOpenChange(true);
    this.render();
  }
  close(): void {
    if (!this.openState || this.busy) return;
    this.openState = false;
    this.root.show(false);
    this.ui.setModal(null);
    this.onOpenChange(false);
    this.ui.focus(this.ui.nodes.get("warehouse-manage")!);
  }
  setState(snapshot: FarmSnapshot): void {
    this.snapshot = snapshot;
    if (!this.openState) this.syncDrafts();
    this.render();
  }
  setBusy(busy: boolean): void {
    this.busy = busy;
    this.render();
  }
  inspect() {
    return {
      open: this.openState,
      page: this.page,
      busy: this.busy,
      cropId: this.crop().id,
      quantity: this.quantity,
      drafts: Object.fromEntries(this.drafts),
      available: this.available()
    };
  }
  dispose(): void {
    this.disposed = true;
    this.unsubscribeResize();
    this.ui.remove(this.root);
  }
  private node(id: string): FarmUiNode {
    return this.ui.nodes.get(id)!;
  }
  private crop() {
    return this.definitions.catalog.crops[this.cropIndex];
  }
  private available(): number {
    return this.snapshot?.inventory[this.crop().harvest.itemId] ?? 0;
  }
  private syncDrafts(): void {
    for (const type of this.rules.containers)
      this.drafts.set(type.id, this.snapshot?.storage.containers.filter((c) => c.typeId === type.id).length ?? 0);
  }
  private changeCount(typeId: string, delta: number): void {
    this.drafts.set(typeId, Math.max(0, (this.drafts.get(typeId) ?? 0) + delta));
    this.render();
  }
  private changeCrop(delta: number): void {
    this.cropIndex =
      (this.cropIndex + delta + this.definitions.catalog.crops.length) % this.definitions.catalog.crops.length;
    this.quantity = 1;
    this.render();
  }
  private selectPage(page: "containers" | "withdraw"): void {
    this.page = page;
    this.render();
  }
  private async submit(input: StorageWriteInput): Promise<void> {
    if (this.busy) return;
    this.setBusy(true);
    this.node("storage-message").text("正在保存…");
    try {
      const result = await this.write(input);
      if (this.disposed) return;
      if (result.ok) this.syncDrafts();
      this.node("storage-message").text(result.message);
    } catch (error) {
      if (!this.disposed)
        this.node("storage-message").text(error instanceof Error ? error.message : "操作失败，请重试");
    } finally {
      if (!this.disposed) this.setBusy(false);
    }
  }
  private render(): void {
    this.containerPage.show(this.page === "containers");
    this.withdrawPage.show(this.page === "withdraw");
    this.node("storage-tab-containers")
      .tint(this.page === "containers" ? FIELD_COLORS.leaf : FIELD_COLORS.ink)
      .buttonColors(this.page === "containers" ? FIELD_COLORS.ink : FIELD_COLORS.paper);
    this.node("storage-tab-withdraw")
      .tint(this.page === "withdraw" ? FIELD_COLORS.leaf : FIELD_COLORS.ink)
      .buttonColors(this.page === "withdraw" ? FIELD_COLORS.ink : FIELD_COLORS.paper);
    for (const [id, node] of this.ui.nodes) if (id.startsWith("storage-") && node.button) node.enable(!this.busy);
    for (const type of this.rules.containers) {
      const count = this.snapshot?.storage.containers.filter((c) => c.typeId === type.id).length ?? 0;
      this.node(`storage-current-${type.id}`).text(
        `当前 ${count} · 保留 ${this.snapshot?.storage.retainedCounts[type.id] ?? 0}`
      );
      this.node(`storage-draft-${type.id}`).text(String(this.drafts.get(type.id) ?? 0));
      this.node(`storage-minus-${type.id}`).enable(!this.busy && (this.drafts.get(type.id) ?? 0) > 0);
    }
    this.node("storage-crop").text(this.crop().name);
    this.node("storage-available").text(`仓库现有 ${this.available()} ${this.rules.crops[this.crop().id].unit}`);
    this.node("storage-quantity").text(String(this.quantity));
    this.node("storage-withdraw-submit").enable(!this.busy && this.available() >= this.quantity);
    this.node("storage-quantity-minus").enable(!this.busy && this.quantity > 1);
    this.node("storage-quantity-plus").enable(!this.busy && this.quantity < this.available());
    this.node("storage-quantity-all").enable(!this.busy && this.available() > 0);
  }
  private layout(): void {
    const width = Math.min(560, this.ui.width - 24),
      height = Math.min(442, this.ui.height - 24),
      bodyWidth = width - 40;
    this.backdrop.rect(0, 0, this.ui.width, this.ui.height);
    this.panel.rect((this.ui.width - width) / 2, (this.ui.height - height) / 2, width, height);
    this.node("storage-close").rect(width - 58, 16, 40, 40);
    this.node("storage-tab-containers").rect(20, 66, bodyWidth / 2 - 4, 38);
    this.node("storage-tab-withdraw").rect(24 + bodyWidth / 2, 66, bodyWidth / 2 - 4, 38);
    this.containerPage.rect(20, 120, bodyWidth, 230);
    this.withdrawPage.rect(20, 120, bodyWidth, 230);
    for (const type of this.rules.containers) {
      this.node(`storage-current-${type.id}`).rect(70, 0, bodyWidth - 70, 26);
      this.node(`storage-minus-${type.id}`).rect(0, 32, 40, 36);
      this.node(`storage-draft-${type.id}`).rect(48, 34, 50, 32);
      this.node(`storage-plus-${type.id}`).rect(104, 32, 40, 36);
      this.node(`storage-apply-${type.id}`).rect(bodyWidth - 94, 32, 94, 36);
    }
    this.node("storage-count-note")
      .rect(0, 188, bodyWidth, 46)
      .show(height >= 410);
    this.node("storage-crop-prev").rect(0, 0, 40, 40);
    this.node("storage-crop").rect(56, 4, bodyWidth - 112, 32);
    this.node("storage-crop-next").rect(bodyWidth - 40, 0, 40, 40);
    this.node("storage-available").rect(0, 52, bodyWidth, 30);
    this.node("storage-quantity-minus").rect(0, 100, 40, 40);
    this.node("storage-quantity").rect(48, 104, 50, 32);
    this.node("storage-quantity-plus").rect(104, 100, 40, 40);
    this.node("storage-quantity-all").rect(160, 100, 56, 40);
    this.node("storage-withdraw-submit").rect(0, 162, bodyWidth, 42);
    this.node("storage-withdraw-note")
      .rect(0, 216, bodyWidth, 36)
      .show(height >= 430);
    this.node("storage-message").rect(20, height - 58, bodyWidth, 48);
  }
}
