const MOVEMENT_KEYS = new Set(["KeyW", "KeyA", "KeyS", "KeyD", "KeyQ", "KeyE"]);

/** Keyboard ownership belongs to the focused Water canvas, never to tuning inputs. */
export class ShowcaseKeyboardInput {
  private readonly _held = new Set<string>();
  private readonly _previousTabIndex: string | null;
  private readonly _window: Window;

  constructor(private readonly _canvas: HTMLCanvasElement) {
    this._window = _canvas.ownerDocument.defaultView!;
    this._previousTabIndex = _canvas.getAttribute("tabindex");
    _canvas.tabIndex = 0;
    _canvas.addEventListener("pointerdown", this._focusCanvas);
    _canvas.addEventListener("blur", this.clear);
    this._window.addEventListener("keydown", this._keyDown);
    this._window.addEventListener("keyup", this._keyUp);
    this._window.addEventListener("blur", this.clear);
    _canvas.ownerDocument.addEventListener("visibilitychange", this.clear);
  }

  get right(): number {
    return Number(this._held.has("KeyD")) - Number(this._held.has("KeyA"));
  }

  get forward(): number {
    return Number(this._held.has("KeyW")) - Number(this._held.has("KeyS"));
  }

  get up(): number {
    return Number(this._held.has("KeyE")) - Number(this._held.has("KeyQ"));
  }

  readonly clear = (): void => {
    this._held.clear();
  };

  destroy(): void {
    this.clear();
    this._canvas.removeEventListener("pointerdown", this._focusCanvas);
    this._canvas.removeEventListener("blur", this.clear);
    this._window.removeEventListener("keydown", this._keyDown);
    this._window.removeEventListener("keyup", this._keyUp);
    this._window.removeEventListener("blur", this.clear);
    this._canvas.ownerDocument.removeEventListener("visibilitychange", this.clear);
    if (this._previousTabIndex === null) this._canvas.removeAttribute("tabindex");
    else this._canvas.setAttribute("tabindex", this._previousTabIndex);
  }

  private readonly _focusCanvas = (): void => {
    this._canvas.focus({ preventScroll: true });
  };

  private readonly _keyDown = (event: KeyboardEvent): void => {
    if (event.metaKey || event.ctrlKey || event.altKey) {
      this.clear();
      return;
    }
    if (this._canvas.ownerDocument.activeElement !== this._canvas || !MOVEMENT_KEYS.has(event.code)) return;
    event.preventDefault();
    this._held.add(event.code);
  };

  private readonly _keyUp = (event: KeyboardEvent): void => {
    this._held.delete(event.code);
  };
}
