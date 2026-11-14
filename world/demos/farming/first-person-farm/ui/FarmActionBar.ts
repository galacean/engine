import { Script, Sprite, TextHorizontalAlignment } from "@galacean/engine";
import type { ActionAvailability, FarmActionDefinition, FarmActionId } from "@galacean/engine-farming/farming/api/index";
import { FARM_BASKET_STOW_PRESENTATION, FARM_HOTBAR_PRESENTATION, type FarmHotbarActionId } from "../config/action-bar.ts";
import { FIELD_COLORS, FarmUi, FarmUiNode } from "./FarmUi.ts";

class ActionHoverDriver extends Script {
  change: ((hovered: boolean) => void) | null = null;
  override onPointerEnter(): void {
    this.change?.(true);
  }
  override onPointerExit(): void {
    this.change?.(false);
  }
  override onDisable(): void {
    this.change?.(false);
  }
}

export interface FarmActionBarState {
  readonly debugMode: boolean;
  readonly availability: readonly (Omit<ActionAvailability, "action"> & { readonly action: FarmHotbarActionId })[];
  readonly busy: boolean;
  readonly seedName: string;
  readonly seedIcon: Sprite | null;
  readonly canChangeSeed: boolean;
  readonly retryVisual: boolean;
}

interface ActionSlot {
  readonly definition: Omit<FarmActionDefinition, "id"> & { readonly id: FarmHotbarActionId };
  readonly button: FarmUiNode;
  readonly icon: FarmUiNode;
  readonly key: FarmUiNode;
  readonly focus: FarmUiNode;
  readonly hover: ActionHoverDriver;
}

/** A fixed, reusable set of nodes; this view never writes farm state. */
export class FarmActionBar {
  private readonly root: FarmUiNode;
  private readonly changeSeed: FarmUiNode;
  private readonly seedIcon: FarmUiNode;
  private readonly seedName: FarmUiNode;
  private readonly seedKey: FarmUiNode;
  private readonly retry: FarmUiNode;
  private readonly debugToggle: FarmUiNode;
  private readonly tooltip: FarmUiNode;
  private readonly tooltipText: FarmUiNode;
  private readonly slots: ActionSlot[];
  private hovered: FarmHotbarActionId | null = null;
  private state: FarmActionBarState | null = null;
  private disposed = false;

  constructor(
    private readonly ui: FarmUi,
    parent: FarmUiNode,
    definitions: readonly FarmActionDefinition[],
    icons: Readonly<Record<FarmActionId, Sprite>>,
    actions: { perform(id: FarmHotbarActionId): void; changeSeed(): void; retryVisual(): void; toggleDebug(): void }
  ) {
    // The whole tray owns pointer input, including gaps and disabled slots.
    this.root = ui.panel(parent, "farm-action-bar", "#182018f2", true);
    this.debugToggle = ui.button(this.root, "farm-debug-toggle", "Debug 关 · F2", actions.toggleDebug);
    this.changeSeed = ui.button(this.root, "change-seed", "", actions.changeSeed);
    this.seedIcon = ui.icon(this.changeSeed, "equipped-seed-icon", icons.plant).tint("#ffffff");
    this.seedName = ui.text(this.changeSeed, "change-seed-label", "选择种子", 12);
    this.seedKey = ui.text(this.changeSeed, "change-seed-key", "Q 换种", 10, FIELD_COLORS.straw);
    this.tooltip = ui.panel(this.root, "action-tooltip", "#182018f2").show(false);
    this.tooltipText = ui.text(this.tooltip, "action-tooltip-message", "", 11);
    this.tooltipText.label!.horizontalAlignment = TextHorizontalAlignment.Center;
    this.retry = ui.button(this.root, "retry-plant", "重试植株", actions.retryVisual).show(false);
    this.slots = [...definitions, FARM_BASKET_STOW_PRESENTATION]
      .sort((a, b) => FARM_HOTBAR_PRESENTATION[a.id].slot - FARM_HOTBAR_PRESENTATION[b.id].slot)
      .map((definition) => {
        const id = definition.id;
        const button = ui.button(this.root, `${id}-action`, definition.name, () => actions.perform(id));
        button.label!.horizontalAlignment = TextHorizontalAlignment.Center;
        const icon = ui.icon(button, `action-icon-${id}`, icons[id === "hide-basket" ? "delete-plot" : id]);
        const key = ui.text(
          button,
          `action-key-${id}`,
          String(FARM_HOTBAR_PRESENTATION[id].slot),
          10,
          FIELD_COLORS.straw
        );
        const focus = ui.panel(button, `action-focus-${id}`, FIELD_COLORS.leaf).show(false);
        const hover = button.entity.addComponent(ActionHoverDriver);
        hover.change = (hovered) => {
          if (hovered) this.hovered = id;
          else if (this.hovered === id) this.hovered = null;
          this.renderFocus();
        };
        button.focusChanged = () => this.renderFocus();
        return { definition, button, icon, key, focus, hover };
      });
  }

  setState(state: FarmActionBarState): void {
    this.state = state;
    this.debugToggle.text(`Debug ${state.debugMode ? "开" : "关"} · F2`);
    this.changeSeed.enable(state.canChangeSeed && !state.busy);
    this.seedName.text(state.seedName).textColor(state.canChangeSeed ? FIELD_COLORS.paper : FIELD_COLORS.muted);
    this.seedIcon.show(Boolean(state.seedIcon));
    if (state.seedIcon) this.seedIcon.image!.sprite = state.seedIcon;
    this.retry.show(state.retryVisual).enable(!state.busy);
    for (const slot of this.slots) {
      const enabled =
        !state.busy && Boolean(state.availability.find((entry) => entry.action === slot.definition.id)?.enabled);
      slot.button.enable(enabled).tint(enabled ? FIELD_COLORS.raised : FIELD_COLORS.board);
      slot.icon.tint(enabled ? FIELD_COLORS.paper : "#acae9b88");
      slot.key.textColor(enabled ? FIELD_COLORS.straw : FIELD_COLORS.muted);
    }
    this.renderFocus();
  }

  actionForKey(code: string): FarmHotbarActionId | null {
    return (
      this.slots.find(({ definition }) => {
        const slot = FARM_HOTBAR_PRESENTATION[definition.id].slot;
        return code === `Digit${slot}` || code === `Numpad${slot}`;
      })?.definition.id ?? null
    );
  }

  focusAction(id: FarmHotbarActionId): void {
    const slot = this.slots.find((slot) => slot.definition.id === id);
    if (slot) this.ui.focus(slot.button, true);
  }

  layout(): void {
    const compact = this.ui.width <= 600;
    const padding = compact ? 6 : 8;
    const seedWidth = compact ? 72 : 124;
    const slotGap = compact ? 4 : 6;
    const slotWidth = compact
      ? Math.min(
          44,
          (this.ui.width - 16 - padding * 2 - seedWidth - 8 - (this.slots.length - 1) * slotGap) / this.slots.length
        )
      : 52;
    const slotHeight = compact ? 52 : 56;
    const actionsWidth = this.slots.length * slotWidth + (this.slots.length - 1) * slotGap;
    const width = padding * 2 + seedWidth + 8 + actionsWidth;
    const height = padding * 2 + slotHeight;
    const safeBottom =
      parseFloat(getComputedStyle(this.ui.canvasElement).getPropertyValue("--farm-safe-area-bottom")) || 0;
    this.root.rect((this.ui.width - width) / 2, this.ui.height - height - 44 - safeBottom, width, height);
    this.debugToggle.rect(width - 108, height + 8, 108, 28);
    this.retry.rect(width - 96, -34, 96, 28);
    this.changeSeed.rect(padding, padding, seedWidth, slotHeight);
    this.seedIcon.rect(8, 8, 20, 20).show(!compact && Boolean(this.state?.seedIcon));
    this.seedName.rect(compact ? 5 : 32, 8, seedWidth - (compact ? 10 : 38), 18);
    this.seedKey.rect(compact ? 5 : 32, 29, seedWidth - (compact ? 10 : 38), 16);
    const startX = padding + seedWidth + 8;
    this.slots.forEach((slot, index) => {
      slot.button
        .rect(startX + index * (slotWidth + slotGap), padding, slotWidth, slotHeight)
        .captionRect(slotWidth / 2, slotHeight - 12, slotWidth - 8, 18);
      slot.icon.rect((slotWidth - 24) / 2, 6, 24, 24);
      slot.key.rect(4, 1, 12, 14);
      slot.focus.rect(7, slotHeight - 3, slotWidth - 14, 2);
    });
    this.tooltipText.rect(6, 0, 156, 28);
    this.renderFocus();
  }

  inspect() {
    return {
      busy: this.state?.busy ?? false,
      actions: this.slots.map(({ definition, button }) => ({
        ...button.inspect(),
        action: definition.id,
        reason: this.state?.availability.find((entry) => entry.action === definition.id)?.reason
      }))
    };
  }

  dispose(): void {
    this.disposed = true;
    for (const slot of this.slots) {
      slot.hover.change = null;
      slot.button.focusChanged = undefined;
    }
    this.ui.remove(this.root);
  }

  private renderFocus(): void {
    if (this.disposed || !this.state || !this.slots) return;
    const focused = this.slots.find((slot) => this.ui.isKeyboardFocused(slot.button))?.definition.id;
    const active = this.hovered ?? focused;
    for (const slot of this.slots) slot.focus.show(!this.state.busy && slot.definition.id === active);
    const availability = this.state.availability.find((entry) => entry.action === active);
    const reason = !this.state.busy && !availability?.enabled ? availability?.reason : undefined;
    this.tooltip.show(Boolean(reason));
    if (reason) {
      const slot = this.slots.find((slot) => slot.definition.id === active)!;
      this.tooltip.rect(
        Math.max(0, Math.min(this.root.width - 168, slot.button.x + slot.button.width / 2 - 84)),
        this.state.retryVisual ? -68 : -34,
        168,
        28
      );
      this.tooltipText.text(reason);
    }
  }
}
