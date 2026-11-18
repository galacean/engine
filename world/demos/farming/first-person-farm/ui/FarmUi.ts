import {
  AssetType,
  Color,
  Entity,
  Font,
  OverflowMode,
  PointerButton,
  Script,
  Sprite,
  SpriteDrawMode,
  TextHorizontalAlignment,
  TextVerticalAlignment,
  Texture2D,
  TextureFormat,
  WebGLEngine
} from "@galacean/engine";
import {
  Button,
  CanvasRenderMode,
  Image,
  ResolutionAdaptationMode,
  Text,
  UICanvas,
  UITransform
} from "@galacean/engine-ui";

export const FIELD_COLORS = {
  board: "#20291f",
  raised: "#283226",
  ink: "#182018",
  paper: "#f4efdf",
  muted: "#acae9b",
  straw: "#d8c994",
  leaf: "#c1d77b",
  growing: "#93ae5e",
  dry: "#d49a55",
  mature: "#f2d779"
} as const;

export interface FarmUiInspection {
  id: string;
  instanceId: number;
  spriteId: number | null;
  visible: boolean;
  enabled: boolean;
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  textUpdates: number;
}

/** Demo-only UI construction; game state remains in FarmingService. Coordinates are CSS pixels. */
export class FarmUiNode {
  readonly transform: UITransform;
  image?: Image;
  label?: Text;
  captionTransform?: UITransform;
  button?: Button;
  activate?: () => void;
  focusChanged?: (focused: boolean) => void;
  textUpdates = 0;
  x = 0;
  y = 0;
  width = 0;
  height = 0;
  private background = "";
  private foreground = "";
  private enabledForeground: string = FIELD_COLORS.paper;
  private disabledForeground: string = FIELD_COLORS.muted;
  private focusedForeground: string = FIELD_COLORS.leaf;
  private focused = false;
  private textScale = 1;
  private captionBox = { x: 0, y: 0, width: 0, height: 0 };

  constructor(
    readonly entity: Entity,
    readonly parent: FarmUiNode | null
  ) {
    this.transform = entity.transform as UITransform;
    this.transform.pivot.set(0, 1);
  }

  rect(x: number, y: number, width: number, height: number): this {
    if (this.x !== x || this.y !== y) this.transform.setPosition(x, -y, 0);
    if (this.width !== width || this.height !== height) {
      const scale = this.label && !this.image ? this.textScale : 1;
      this.transform.size.set(width * scale, height * scale);
    }
    if (this.captionTransform && (this.width !== width || this.height !== height)) {
      this.captionRect(width / 2, height / 2, Math.max(0, width - 16), height);
    }
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
    return this;
  }

  captionRect(x: number, y: number, width: number, height: number): this {
    this.captionBox = { x, y, width, height };
    this.captionTransform?.setPosition(x, -y, 0);
    this.captionTransform?.size.set(width * this.textScale, height * this.textScale);
    return this;
  }

  setTextScale(scale: number): void {
    this.textScale = scale;
    const transform = this.captionTransform ?? this.transform;
    transform.setScale(1 / scale, 1 / scale, 1);
    if (this.captionTransform) {
      const box = this.captionBox;
      transform.size.set(box.width * scale, box.height * scale);
    } else {
      transform.size.set(this.width * scale, this.height * scale);
    }
  }

  text(value: string): this {
    if (this.label && this.label.text !== value) {
      this.label.text = value;
      this.textUpdates++;
    }
    return this;
  }

  tint(value: string): this {
    if (this.image && this.background !== value) {
      this.image.color.copyFrom(fieldColor(value, true));
      this.background = value;
    }
    return this;
  }

  textColor(value: string): this {
    if (this.label && this.foreground !== value) {
      this.label.color.copyFrom(fieldColor(value));
      this.foreground = value;
    }
    return this;
  }

  show(visible: boolean): this {
    if (this.entity.isActive !== visible) this.entity.isActive = visible;
    return this;
  }

  enable(enabled: boolean): this {
    if (this.button) this.button.interactive = enabled;
    this.updateButtonColor();
    return this;
  }

  buttonColors(normal: string, disabled: string = normal, focused: string = normal): this {
    this.enabledForeground = normal;
    this.disabledForeground = disabled;
    this.focusedForeground = focused;
    this.updateButtonColor();
    return this;
  }

  setFocused(focused: boolean): void {
    this.focused = focused;
    this.updateButtonColor();
    this.focusChanged?.(focused);
  }

  private updateButtonColor(): void {
    this.textColor(
      !this.button?.interactive
        ? this.disabledForeground
        : this.focused
          ? this.focusedForeground
          : this.enabledForeground
    );
  }

  inspect(): FarmUiInspection {
    let x = this.x,
      y = this.y;
    for (let parent = this.parent; parent; parent = parent.parent) {
      x += parent.x;
      y += parent.y;
    }
    return {
      id: this.entity.name,
      instanceId: this.entity.instanceId,
      spriteId: this.image?.sprite?.instanceId ?? null,
      visible: this.entity.isActiveInHierarchy,
      enabled: this.button?.interactive ?? true,
      text: this.label?.text ?? "",
      x,
      y,
      width: this.width,
      height: this.height,
      textUpdates: this.textUpdates
    };
  }
}

class UiFrameDriver extends Script {
  tick: (() => void) | null = null;
  override onLateUpdate(): void {
    this.tick?.();
  }
}

export class FarmUi {
  readonly nodes = new Map<string, FarmUiNode>();
  readonly font: Font;
  private readonly texture: Texture2D;
  private readonly sprite: Sprite;
  private readonly iconSprites: Sprite[] = [];
  private readonly layers: { canvas: UICanvas; node: FarmUiNode }[] = [];
  private readonly resizeListeners = new Set<() => void>();
  private readonly textSizes = new Map<FarmUiNode, number>();
  private pixelRatio = 1;
  private readonly abort = new AbortController();
  private readonly driver: UiFrameDriver;
  private focused: FarmUiNode | null = null;
  private keyboardFocus = false;
  private modal: FarmUiNode | null = null;
  width = 0;
  height = 0;

  constructor(
    readonly engine: WebGLEngine,
    readonly canvasElement: HTMLCanvasElement
  ) {
    this.font = Font.createFromOS(engine, '"PingFang SC", "Microsoft YaHei", sans-serif')!;
    this.texture = new Texture2D(engine, 16, 16, TextureFormat.R8G8B8A8, false);
    const pixels = new Uint8Array(16 * 16 * 4).fill(255);
    for (let y = 0; y < 16; y++)
      for (let x = 0; x < 16; x++) {
        const dx = Math.max(4 - (x + 0.5), 0, x + 0.5 - 12);
        const dy = Math.max(4 - (y + 0.5), 0, y + 0.5 - 12);
        pixels[(y * 16 + x) * 4 + 3] = Math.round(Math.min(1, Math.max(0, 4.5 - Math.hypot(dx, dy))) * 255);
      }
    this.texture.setPixelBuffer(pixels);
    this.sprite = new Sprite(engine, this.texture);
    this.sprite.border.set(0.25, 0.25, 0.25, 0.25);
    this.driver = engine.sceneManager.activeScene!.createRootEntity("farm-ui-driver").addComponent(UiFrameDriver);
    this.driver.tick = () => {
      this.resize();
    };
    this.resize();
    canvasElement.tabIndex = 0;
    window.addEventListener("keydown", (event) => this.onKey(event), { signal: this.abort.signal });
  }

  layer(id: string, order: number): FarmUiNode {
    const entity = this.engine.sceneManager.activeScene!.createRootEntity(id + "-canvas");
    const canvas = entity.addComponent(UICanvas);
    canvas.renderMode = CanvasRenderMode.ScreenSpaceOverlay;
    canvas.sortOrder = order;
    canvas.resolutionAdaptationMode = ResolutionAdaptationMode.BothAdaptation;
    canvas.referenceResolution.set(this.width, this.height);
    const node = new FarmUiNode(entity.createChild(id), null);
    node.transform.setPosition(-this.width / 2, this.height / 2, 0);
    this.layers.push({ canvas, node });
    this.nodes.set(id, node);
    return node;
  }

  group(parent: FarmUiNode, id: string): FarmUiNode {
    const node = new FarmUiNode(parent.entity.createChild(id), parent);
    this.nodes.set(id, node);
    return node;
  }

  panel(parent: FarmUiNode, id: string, color: string = FIELD_COLORS.board, blocking = false): FarmUiNode {
    const node = this.group(parent, id);
    node.image = node.entity.addComponent(Image);
    node.image.sprite = this.sprite;
    node.image.drawMode = SpriteDrawMode.Sliced;
    node.image.raycastEnabled = blocking;
    return node.tint(color);
  }

  async loadIcon(url: string): Promise<Sprite> {
    const texture = await this.engine.resourceManager.load<Texture2D>({ url, type: AssetType.Texture });
    const sprite = new Sprite(this.engine, texture);
    this.iconSprites.push(sprite);
    return sprite;
  }

  icon(parent: FarmUiNode, id: string, sprite: Sprite): FarmUiNode {
    const node = this.group(parent, id);
    node.image = node.entity.addComponent(Image);
    node.image.sprite = sprite;
    node.image.raycastEnabled = false;
    return node.tint(FIELD_COLORS.paper);
  }

  text(parent: FarmUiNode, id: string, value: string, size = 13, color: string = FIELD_COLORS.paper): FarmUiNode {
    const node = this.group(parent, id);
    node.label = node.entity.addComponent(Text);
    node.label.font = this.font;
    this.textSizes.set(node, size);
    node.setTextScale(this.pixelRatio);
    node.label.fontSize = size * this.pixelRatio;
    node.label.color.copyFrom(fieldColor(color));
    node.label.horizontalAlignment = TextHorizontalAlignment.Left;
    node.label.verticalAlignment = TextVerticalAlignment.Center;
    node.label.overflowMode = OverflowMode.Truncate;
    node.label.raycastEnabled = false;
    return node.text(value);
  }

  button(parent: FarmUiNode, id: string, value: string, activate: () => void): FarmUiNode {
    const node = this.panel(parent, id, FIELD_COLORS.raised, true);
    node.button = node.entity.addComponent(Button);
    // Keep caption layout independent of the button hit area.
    const caption = node.entity.createChild(id + "-caption");
    node.captionTransform = caption.transform as UITransform;
    node.captionTransform.pivot.set(0.5, 0.5);
    node.label = caption.addComponent(Text);
    node.label.font = this.font;
    this.textSizes.set(node, 13);
    node.setTextScale(this.pixelRatio);
    node.label.fontSize = 13 * this.pixelRatio;
    node.label.color.copyFrom(fieldColor(FIELD_COLORS.paper));
    node.label.verticalAlignment = TextVerticalAlignment.Center;
    node.label.raycastEnabled = false;
    node.label.overflowMode = OverflowMode.Overflow;
    node.activate = () => {
      if (node.entity.isActiveInHierarchy && node.button!.interactive) activate();
    };
    node.button.onClick.on((event) => {
      if (event.pointer.button !== PointerButton.Primary) return;
      this.focus(node);
      node.activate?.();
    });
    return node.text(value);
  }

  onResize(listener: () => void): () => void {
    this.resizeListeners.add(listener);
    return () => this.resizeListeners.delete(listener);
  }
  setModal(node: FarmUiNode | null): void {
    this.modal = node;
    this.focus(null);
  }
  isKeyboardFocused(node: FarmUiNode): boolean {
    return this.focused === node && this.keyboardFocus;
  }
  focus(node: FarmUiNode | null, keyboard = false): void {
    const previous = this.focused;
    // Focus callbacks must observe the new owner, including the previous node's blur callback.
    this.focused = node;
    this.keyboardFocus = keyboard;
    previous?.setFocused(false);
    node?.setFocused(true);
  }
  inspect(id: string): FarmUiInspection | null {
    return this.nodes.get(id)?.inspect() ?? null;
  }

  activate(id: string): boolean {
    const node = this.nodes.get(id);
    if (!node?.activate || !node.entity.isActiveInHierarchy || !node.button?.interactive) return false;
    node.activate();
    return true;
  }

  /** Resolve UI ownership before a DOM pointer starts a world-camera drag. */
  isPointerOverUi(clientX: number, clientY: number): boolean {
    const bounds = this.canvasElement.getBoundingClientRect();
    const x = ((clientX - bounds.left) * this.width) / bounds.width;
    const y = ((clientY - bounds.top) * this.height) / bounds.height;
    for (const node of this.nodes.values()) {
      if (!node.image?.raycastEnabled || !node.entity.isActiveInHierarchy) continue;
      let left = node.x,
        top = node.y;
      for (let parent = node.parent; parent; parent = parent.parent) {
        left += parent.x;
        top += parent.y;
      }
      if (x >= left && x <= left + node.width && y >= top && y <= top + node.height) return true;
    }
    return false;
  }

  remove(node: FarmUiNode): void {
    if (this.modal && (this.modal === node || isDescendant(this.modal, node))) this.modal = null;
    if (this.focused && (this.focused === node || isDescendant(this.focused, node))) this.focus(null);
    for (const [id, candidate] of this.nodes) {
      if (candidate === node || isDescendant(candidate, node)) {
        if (candidate.label) this.textSizes.delete(candidate);
        this.nodes.delete(id);
      }
    }
    const layerIndex = this.layers.findIndex((layer) => layer.node === node);
    if (layerIndex >= 0) this.layers.splice(layerIndex, 1)[0].canvas.entity.destroy();
    else node.entity.destroy();
  }

  dispose(): void {
    this.abort.abort();
    this.resizeListeners.clear();
    this.driver.entity.destroy();
    for (const { canvas } of this.layers) canvas.entity.destroy();
    this.nodes.clear();
    this.textSizes.clear();
    for (const sprite of this.iconSprites) sprite.destroy();
    this.iconSprites.length = 0;
    this.sprite.destroy();
    this.texture.destroy();
    // OS fonts are engine-cached resources and can also be used by other renderers.
  }

  private resize(): void {
    const width = Math.max(1, this.canvasElement.clientWidth),
      height = Math.max(1, this.canvasElement.clientHeight);
    const pixelRatio = Math.min(2, Math.max(1, this.engine.canvas.width / width));
    if (width === this.width && height === this.height && pixelRatio === this.pixelRatio) return;
    this.pixelRatio = pixelRatio;
    for (const [node, size] of this.textSizes) {
      node.label!.fontSize = size * pixelRatio;
      node.setTextScale(pixelRatio);
    }
    this.width = width;
    this.height = height;
    for (const { canvas, node } of this.layers) {
      canvas.referenceResolution.set(width, height);
      node.transform.setPosition(-width / 2, height / 2, 0);
    }
    for (const listener of this.resizeListeners) listener();
  }

  private onKey(event: KeyboardEvent): void {
    if (isFarmTextInput(event)) return;
    if (event.code === "Tab") {
      const buttons = [...this.nodes.values()].filter(
        (node) =>
          node.button?.interactive && node.entity.isActiveInHierarchy && (!this.modal || isDescendant(node, this.modal))
      );
      if (!buttons.length) return;
      event.preventDefault();
      const index = this.focused ? buttons.indexOf(this.focused) : -1;
      this.focus(buttons[(index + (event.shiftKey ? -1 : 1) + buttons.length) % buttons.length], true);
    } else if ((event.code === "Enter" || event.code === "Space") && this.focused && !event.repeat) {
      event.preventDefault();
      this.focused.activate?.();
    }
  }
}

/** Keep game shortcuts out of text entry, IME composition and browser shortcuts. */
export function isFarmTextInput(event: KeyboardEvent): boolean {
  const target = event.target;
  return (
    event.isComposing ||
    event.keyCode === 229 ||
    event.ctrlKey ||
    event.metaKey ||
    event.altKey ||
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
}

function isDescendant(node: FarmUiNode, parent: FarmUiNode): boolean {
  for (let current = node.parent; current; current = current.parent) if (current === parent) return true;
  return false;
}

export function fieldColor(hex: string, linear = false): Color {
  const value = hex.replace("#", "");
  const color = new Color(
    parseInt(value.slice(0, 2), 16) / 255,
    parseInt(value.slice(2, 4), 16) / 255,
    parseInt(value.slice(4, 6), 16) / 255,
    value.length === 8 ? parseInt(value.slice(6, 8), 16) / 255 : 1
  );
  // UIDefault applies output SRGB correction; the text shader outputs its vertex color directly.
  return linear ? color.toLinear(color) : color;
}
