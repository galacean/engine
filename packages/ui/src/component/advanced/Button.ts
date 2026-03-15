import { Entity, ignoreClone, PointerEventData, Signal } from "@galacean/engine";
import { UIInteractive } from "../interactive/UIInteractive";

export class Button extends UIInteractive {
  /** Signal emitted when the button is clicked */
  @ignoreClone
  readonly onClick = new Signal<[PointerEventData]>();

  override onPointerClick(event: PointerEventData): void {
    if (!this._getGlobalInteractive()) return;
    this.onClick.invoke(event);
  }

  override onDestroy(): void {
    super.onDestroy();
    this.onClick.removeAll();
  }

  // @ts-ignore
  override _cloneTo(target: Button, srcRoot: Entity, targetRoot: Entity): void {
    super._cloneTo(target, srcRoot, targetRoot);
    this.onClick._cloneTo(target.onClick, srcRoot, targetRoot);
  }

  /**
   * Add a listening function for click.
   * @deprecated Use `onClick.on(listener, context)` instead.
   */
  addClicked(listener: (event: PointerEventData) => void): void {
    this.onClick.on(listener);
  }

  /**
   * Remove a listening function of click.
   * @deprecated Use `onClick.off(listener, context)` instead.
   */
  removeClicked(listener: (event: PointerEventData) => void): void {
    this.onClick.off(listener);
  }
}
