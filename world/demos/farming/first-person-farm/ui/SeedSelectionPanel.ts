import { Sprite, TextHorizontalAlignment } from "@galacean/engine";
import type { FarmingDefinitionSet } from "@galacean/engine-farming/farming/domain/index";
import { FarmUi, FarmUiNode } from "./FarmUi.ts";
import { formatSeedDuration, SeedSelection } from "./SeedSelection.ts";

const PAPER = {
  board: "#f6eed9",
  card: "#fffbef",
  ink: "#493820",
  muted: "#79674b",
  rule: "#deceb0",
  selected: "#ffedb2",
  gold: "#b17c25",
  bag: "#dbc18c",
  fold: "#b99c66"
} as const;

/** Retained Galacean UI: card creation is independent of simulation ticks. */
export class SeedSelectionPanel {
  readonly root: FarmUiNode;
  private readonly backdrop: FarmUiNode;
  private readonly panel: FarmUiNode;
  private readonly details: FarmUiNode;
  private readonly collection: FarmUiNode;
  private readonly cards = new Map<string, FarmUiNode>();
  private readonly detailIcon: FarmUiNode;
  private readonly unsubscribeResize: () => void;
  private detailPage = false;
  private page = 0;
  private pageSize = 6;
  private busy = false;

  constructor(
    private readonly ui: FarmUi,
    private readonly definitions: FarmingDefinitionSet,
    private readonly icons: Readonly<Record<string, Sprite>>,
    readonly selection: SeedSelection,
    private readonly onConfirm: () => void,
    private readonly onCancel: () => void
  ) {
    this.root = ui.layer("seed-tray", 30).show(false);
    this.backdrop = ui.button(this.root, "seed-backdrop", "", onCancel).tint("#10180f88");
    this.panel = ui.panel(this.root, "seed-panel", PAPER.board, true);
    ui.text(this.panel, "seed-title", "选择种子", 23, PAPER.ink);
    ui.button(this.panel, "cancel-seed", "×", onCancel).tint(PAPER.board).buttonColors(PAPER.ink);
    ui.panel(this.panel, "seed-heading-rule", PAPER.rule);
    this.details = ui.group(this.panel, "seed-details");
    ui.button(this.details, "seed-back", "‹ 返回作物列表", () => {
      this.detailPage = false;
      this.layout();
      ui.focus(this.cards.get(selection.candidateId)!, true);
    })
      .tint(PAPER.board)
      .buttonColors(PAPER.ink);
    const art = ui.panel(this.details, "seed-detail-art", PAPER.card);
    this.detailIcon = ui.icon(art, "seed-detail-icon", icons[definitions.seeds[0].cropId]).tint("#ffffff");
    ui.text(this.details, "seed-detail-name", "", 21, PAPER.ink);
    ui.text(this.details, "seed-detail-time-label", "生长时间", 13, PAPER.muted);
    ui.text(this.details, "seed-detail-time", "", 15, PAPER.ink);
    ui.panel(this.details, "seed-detail-rule", PAPER.rule);
    ui.text(this.details, "seed-detail-yield-label", "收获物", 13, PAPER.muted);
    ui.text(this.details, "seed-detail-yield", "", 15, PAPER.ink);
    ui.text(this.details, "seed-detail-care", "保持土壤湿润，干燥时停止生长。", 11, PAPER.muted);
    ui.text(this.details, "seed-detail-conditions", "生长也受温度、光照和土壤条件影响。", 11, PAPER.muted);
    this.collection = ui.group(this.panel, "seed-collection");
    ui.text(this.collection, "seed-list-title", "作物列表", 14, PAPER.ink);
    ui.text(this.collection, "seed-count", `${definitions.seeds.length} 种`, 12, PAPER.muted);
    ui.button(this.collection, "seed-page-prev", "‹ 上一页", () => this.turnPage(-1))
      .tint(PAPER.card)
      .buttonColors(PAPER.ink);
    ui.button(this.collection, "seed-page-next", "下一页 ›", () => this.turnPage(1))
      .tint(PAPER.card)
      .buttonColors(PAPER.ink);
    ui.text(this.collection, "seed-page-number", "", 12, PAPER.muted).label!.horizontalAlignment =
      TextHorizontalAlignment.Center;
    definitions.seeds.forEach((seed) => {
      const crop = definitions.catalog.crops.find((item) => item.id === seed.cropId)!;
      const card = ui.button(this.collection, `seed-${seed.id}`, "", () => this.preview(seed.id)).tint(PAPER.card);
      this.cards.set(seed.id, card);
      const bag = ui.panel(card, `seed-bag-${seed.id}`, PAPER.bag);
      ui.panel(bag, `seed-fold-${seed.id}`, PAPER.fold);
      ui.icon(bag, `seed-icon-${seed.id}`, icons[seed.cropId]).tint("#ffffff");
      ui.text(card, `seed-name-${seed.id}`, crop.name, 14, PAPER.ink).label!.horizontalAlignment =
        TextHorizontalAlignment.Center;
      ui.text(
        card,
        `seed-time-${seed.id}`,
        formatSeedDuration(crop.cycle.growthTarget / crop.cycle.baseGrowthUnitsPerSecond),
        13,
        PAPER.muted
      ).label!.horizontalAlignment = TextHorizontalAlignment.Center;
      ui.panel(card, `seed-selected-${seed.id}`, PAPER.gold);
      const focus = ui.panel(card, `seed-focus-${seed.id}`, PAPER.gold).show(false);
      card.focusChanged = (focused) => focus.show(focused);
    });
    ui.panel(this.panel, "seed-footer-rule", PAPER.rule);
    ui.text(this.panel, "seed-current", "", 12, PAPER.muted);
    ui.button(this.panel, "confirm-seed", "选择", onConfirm)
      .tint(PAPER.gold)
      .buttonColors("#fffaf0", "#dfd1b9", "#ffffff");
    this.unsubscribeResize = ui.onResize(() => this.layout());
    this.layout();
    this.render();
  }

  open(): void {
    this.selection.begin();
    this.page = Math.floor(
      this.definitions.seeds.findIndex((seed) => seed.id === this.selection.candidateId) / this.pageSize
    );
    this.detailPage = false;
    this.root.show(true);
    this.ui.setModal(this.root);
    this.render();
    this.layout();
    this.ui.focus(this.cards.get(this.selection.candidateId)!, true);
  }

  close(): void {
    this.root.show(false);
    this.ui.setModal(null);
  }

  preview(id: string): void {
    if (this.busy || !this.selection.preview(id)) return;
    this.page = Math.floor(this.definitions.seeds.findIndex((seed) => seed.id === id) / this.pageSize);
    this.detailPage = true;
    this.render();
    this.layout();
    if (this.ui.width < 650) this.ui.focus(this.node("seed-back"), true);
  }

  setBusy(busy: boolean): void {
    this.busy = busy;
    this.render();
  }

  inspect() {
    return { candidateSeedId: this.selection.candidateId, detailsVisible: this.details.entity.isActiveInHierarchy };
  }

  dispose(): void {
    this.unsubscribeResize();
    this.ui.remove(this.root);
  }

  private turnPage(delta: number): void {
    if (this.busy) return;
    const pages = Math.ceil(this.cards.size / this.pageSize);
    this.page = Math.max(0, Math.min(pages - 1, this.page + delta));
    this.layout();
  }

  private node(id: string): FarmUiNode {
    return this.ui.nodes.get(id)!;
  }

  private render(): void {
    const seed = this.definitions.seeds.find((item) => item.id === this.selection.candidateId)!;
    const crop = this.definitions.catalog.crops.find((item) => item.id === seed.cropId)!;
    if (this.detailIcon.image!.sprite !== this.icons[crop.id]) this.detailIcon.image!.sprite = this.icons[crop.id];
    this.node("seed-detail-name").text(crop.name);
    this.node("seed-detail-time").text(
      formatSeedDuration(crop.cycle.growthTarget / crop.cycle.baseGrowthUnitsPerSecond)
    );
    if (crop.growthFactors) {
      const temperature = crop.growthFactors.airTemperature;
      this.node("seed-detail-care").text("水分越足成长越快；干燥也能缓慢成长");
      this.node("seed-detail-conditions").text(
        `适宜温度 ${temperature.optimalMinimum}–${temperature.optimalMaximum}°C`
      );
    }
    this.node("seed-detail-yield").text(`${crop.harvest.itemName} × ${crop.harvest.quantity}`);
    const equipped = this.definitions.seeds.find((item) => item.id === this.selection.selectedId);
    this.node("seed-current").text(equipped ? `当前：${equipped.name}` : "点击作物查看详情");
    for (const [id, card] of this.cards) {
      const selected = id === seed.id;
      card.tint(selected ? PAPER.selected : PAPER.card).enable(!this.busy);
      this.node(`seed-selected-${id}`).show(selected);
    }
    this.node("confirm-seed").enable(!this.busy);
    this.node("cancel-seed").enable(!this.busy);
    this.node("seed-back").enable(!this.busy);
    this.backdrop.enable(!this.busy);
  }

  private layout(): void {
    const { width, height } = this.ui;
    const compact = width < 650;
    const panelWidth = Math.min(820, width - 24);
    const panelHeight = Math.min(compact ? 652 : 524, height - 24);
    const padding = compact ? 16 : 24;
    const bodyY = 72;
    const footerY = panelHeight - 70;
    const bodyHeight = footerY - bodyY - 16;
    this.backdrop.rect(0, 0, width, height);
    this.panel.rect((width - panelWidth) / 2, (height - panelHeight) / 2, panelWidth, panelHeight);
    this.node("seed-title").rect(padding, 18, panelWidth - 96, 34);
    this.node("cancel-seed").rect(panelWidth - 58, 14, 44, 44);
    this.node("seed-heading-rule").rect(padding, 62, panelWidth - padding * 2, 1);
    const detailWidth = compact ? panelWidth - padding * 2 : Math.floor(panelWidth * 0.33);
    const listX = compact ? padding : padding + detailWidth + 24;
    const listWidth = compact ? panelWidth - padding * 2 : panelWidth - listX - padding;
    this.details.rect(padding, bodyY, detailWidth, bodyHeight).show(!compact || this.detailPage);
    this.collection.rect(listX, bodyY, listWidth, bodyHeight).show(!compact || !this.detailPage);
    this.node("seed-back").rect(0, 0, detailWidth, 36).show(compact);
    const artY = compact ? 42 : 0;
    const artHeight = Math.max(48, Math.min(compact ? 190 : 150, bodyHeight - artY - 174));
    this.node("seed-detail-art").rect(0, artY, detailWidth, artHeight);
    const iconSize = Math.min(artHeight - 12, 132);
    this.detailIcon.rect((detailWidth - iconSize) / 2, (artHeight - iconSize) / 2, iconSize, iconSize);
    const infoY = artY + artHeight + 10;
    this.node("seed-detail-name").rect(0, infoY, detailWidth, 32);
    this.node("seed-detail-time-label").rect(0, infoY + 45, 90, 22);
    this.node("seed-detail-time").rect(96, infoY + 45, detailWidth - 96, 22);
    this.node("seed-detail-rule").rect(0, infoY + 77, detailWidth, 1);
    this.node("seed-detail-yield-label").rect(0, infoY + 88, 90, 22);
    this.node("seed-detail-yield").rect(96, infoY + 88, detailWidth - 96, 22);
    this.node("seed-detail-care").rect(0, infoY + 127, detailWidth, 20);
    this.node("seed-detail-conditions")
      .rect(0, infoY + 149, detailWidth, 20)
      .show(bodyHeight >= artY + artHeight + 176);
    this.node("seed-list-title").rect(0, 0, listWidth - 60, 24);
    this.node("seed-count").rect(listWidth - 40, 0, 40, 24);
    const columns = compact ? 2 : 3;
    const rows = Math.max(1, Math.min(2, Math.floor((bodyHeight - 80) / 126)));
    const newPageSize = columns * rows;
    if (this.pageSize !== newPageSize) this.page = Math.floor((this.page * this.pageSize) / newPageSize);
    this.pageSize = newPageSize;
    const pages = Math.ceil(this.cards.size / this.pageSize);
    this.page = Math.min(this.page, pages - 1);
    this.node("seed-page-prev")
      .rect(0, bodyHeight - 36, 96, 36)
      .enable(!this.busy && this.page > 0);
    this.node("seed-page-next")
      .rect(listWidth - 96, bodyHeight - 36, 96, 36)
      .enable(!this.busy && this.page < pages - 1);
    this.node("seed-page-number")
      .rect(100, bodyHeight - 36, listWidth - 200, 36)
      .text(`${this.page + 1} / ${pages}`);
    const gap = 12;
    const cardWidth = (listWidth - gap * (columns - 1)) / columns;
    const cardHeight = (bodyHeight - 80 - gap * (rows - 1)) / rows;
    [...this.cards].forEach(([id, card], absoluteIndex) => {
      const index = absoluteIndex - this.page * this.pageSize;
      card.show(index >= 0 && index < this.pageSize);
      if (index < 0 || index >= this.pageSize) return;
      card.rect(
        (index % columns) * (cardWidth + gap),
        36 + Math.floor(index / columns) * (cardHeight + gap),
        cardWidth,
        cardHeight
      );
      const bagHeight = Math.max(28, Math.min(90, cardHeight - 66));
      const bagWidth = bagHeight * 0.86;
      this.node(`seed-bag-${id}`).rect((cardWidth - bagWidth) / 2, 8, bagWidth, bagHeight);
      this.node(`seed-fold-${id}`).rect(0, 0, bagWidth, Math.min(10, bagHeight * 0.14));
      const size = bagHeight - 14;
      this.node(`seed-icon-${id}`).rect((bagWidth - size) / 2, 12, size, size);
      this.node(`seed-name-${id}`).rect(4, cardHeight - 50, cardWidth - 8, 22);
      this.node(`seed-time-${id}`).rect(4, cardHeight - 27, cardWidth - 8, 20);
      this.node(`seed-selected-${id}`).rect(8, cardHeight - 3, cardWidth - 16, 3);
      this.node(`seed-focus-${id}`).rect(8, 0, cardWidth - 16, 3);
    });
    this.node("seed-footer-rule").rect(padding, footerY, panelWidth - padding * 2, 1);
    const confirmVisible = !compact || this.detailPage;
    this.node("seed-current").rect(
      padding,
      footerY + 17,
      confirmVisible ? panelWidth - padding * 2 - 138 : panelWidth - padding * 2,
      32
    );
    this.node("confirm-seed")
      .rect(panelWidth - padding - 124, footerY + 13, 124, 44)
      .show(confirmVisible);
  }
}
