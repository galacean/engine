import { Camera, type Entity, MathUtil, Sprite, Texture2D, TextureFormat } from "@galacean/engine";
import {
  CanvasRenderMode,
  Image,
  registerGUI,
  ResolutionAdaptationMode,
  UICanvas,
  UIGroup,
  UITransform
} from "@galacean/engine-ui";
import { SeedWorldLiquidGlassUiMaterial } from "@galacean/engine-modify/rendering/LiquidGlassPostProcessPass";

registerGUI();

const ENTER_DURATION_SECONDS = 0.09;
const EXIT_DURATION_SECONDS = 0.14;

export interface FreeControlJoystickViewportBounds {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

export interface FreeControlJoystickVisualState {
  readonly visible: boolean;
  readonly originX: number;
  readonly originY: number;
  readonly knobOffsetX: number;
  readonly knobOffsetY: number;
  readonly directionDegrees: number;
  readonly directionStrength: number;
}

/** Galacean UI presentation owned by one mobile FreeControl. */
export class FreeControlJoystickUi {
  private readonly _owner: Entity;
  private _canvasRoot: Entity | null = null;
  private _controlRoot: Entity | null = null;
  private _canvas: UICanvas | null = null;
  private _group: UIGroup | null = null;
  private _controlTransform: UITransform | null = null;
  private _knobTransform: UITransform | null = null;
  private _baseGlass: SeedWorldLiquidGlassUiMaterial | null = null;
  private _knobGlass: SeedWorldLiquidGlassUiMaterial | null = null;
  private _whiteTexture: Texture2D | null = null;
  private readonly _sprites: Sprite[] = [];
  private _visibility = 0;
  private _visibilityTarget = 0;
  private _originX = 0;
  private _originY = 0;
  private _knobOffsetX = 0;
  private _knobOffsetY = 0;
  private _directionDegrees = 0;
  private _directionStrength = 0;

  constructor(owner: Entity) {
    this._owner = owner;
  }

  get entity(): Entity | null {
    return this._controlRoot;
  }

  get state(): FreeControlJoystickVisualState {
    return {
      visible: this._visibilityTarget > 0,
      originX: this._originX,
      originY: this._originY,
      knobOffsetX: this._knobOffsetX,
      knobOffsetY: this._knobOffsetY,
      directionDegrees: this._directionDegrees,
      directionStrength: this._directionStrength
    };
  }

  show(
    originX: number,
    originY: number,
    radius: number,
    knobRadius: number,
    bounds: FreeControlJoystickViewportBounds
  ): void {
    this._originX = originX;
    this._originY = originY;
    this._visibilityTarget = 1;
    if (!this._ensureCreated()) return;

    const canvasRoot = this._canvasRoot!;
    const canvas = this._canvas!;
    const controlTransform = this._controlTransform!;
    canvas.referenceResolution.set(bounds.width, bounds.height);
    canvasRoot.isActive = true;
    controlTransform.setPosition(
      originX - bounds.left - bounds.width * 0.5,
      bounds.height * 0.5 - (originY - bounds.top),
      0
    );
    controlTransform.size.set(radius * 2, radius * 2);
    this._knobTransform!.size.set(knobRadius * 2, knobRadius * 2);
    const scaleX = this._owner.engine.canvas.width / Math.max(bounds.width, 1);
    const scaleY = this._owner.engine.canvas.height / Math.max(bounds.height, 1);
    const baseWidth = radius * 2 * scaleX;
    const baseHeight = radius * 2 * scaleY;
    this._baseGlass!.setLayout(baseWidth, baseHeight, Math.min(baseWidth, baseHeight) * 0.5);
    const knobWidth = knobRadius * 2 * scaleX;
    const knobHeight = knobRadius * 2 * scaleY;
    this._knobGlass!.setLayout(knobWidth, knobHeight, Math.min(knobWidth, knobHeight) * 0.5);
    this.setKnob(0, 0, radius, knobRadius);
    this._applyVisibility();
  }

  hide(immediate = false): void {
    this._visibilityTarget = 0;
    this._knobOffsetX = 0;
    this._knobOffsetY = 0;
    this._directionStrength = 0;
    if (this._knobTransform) this._knobTransform.setPosition(0, 0, 0);
    if (immediate) {
      this._visibility = 0;
      this._applyVisibility();
    }
  }

  setKnob(x: number, y: number, radius: number, knobRadius: number): void {
    this._knobOffsetX = x;
    this._knobOffsetY = y;
    const maximumDistance = Math.max(1, radius - knobRadius);
    const distance = Math.hypot(x, y);
    this._directionStrength = Math.min(1, distance / maximumDistance);
    const directionDegrees = distance > 1 ? Math.atan2(-y, x) * (180 / Math.PI) : 0;
    this._directionDegrees = Math.abs(directionDegrees) <= Number.EPSILON ? 0 : directionDegrees;
    if (!this._knobTransform) return;
    this._knobTransform.setPosition(x, -y, 0);
  }

  update(deltaTime: number): void {
    if (!this._canvasRoot) return;
    const duration = this._visibilityTarget > this._visibility ? ENTER_DURATION_SECONDS : EXIT_DURATION_SECONDS;
    const step = duration > 0 ? Math.max(0, deltaTime) / duration : 1;
    this._visibility = MathUtil.clamp(
      this._visibility + Math.sign(this._visibilityTarget - this._visibility) * step,
      0,
      1
    );
    if (Math.abs(this._visibilityTarget - this._visibility) <= 1e-4) this._visibility = this._visibilityTarget;
    this._applyVisibility();
  }

  destroy(): void {
    this._canvasRoot?.destroy();
    this._baseGlass?.destroy();
    this._baseGlass = null;
    this._knobGlass?.destroy();
    this._knobGlass = null;
    this._canvasRoot = null;
    this._controlRoot = null;
    this._canvas = null;
    this._group = null;
    this._controlTransform = null;
    this._knobTransform = null;
    for (const sprite of this._sprites) sprite.destroy();
    this._sprites.length = 0;
    this._whiteTexture?.destroy();
    this._whiteTexture = null;
  }

  private _ensureCreated(): boolean {
    if (this._canvasRoot) return true;
    const scene = this._owner.scene;
    if (!scene) return false;
    const camera = this._owner.getComponent(Camera);
    if (!camera) return false;

    const whiteTexture = (this._whiteTexture = new Texture2D(
      this._owner.engine,
      1,
      1,
      TextureFormat.R8G8B8A8,
      false,
      false
    ));
    whiteTexture.setPixelBuffer(new Uint8Array([255, 255, 255, 255]));
    const whiteSprite = new Sprite(this._owner.engine, whiteTexture);
    this._sprites.push(whiteSprite);
    const baseGlass = (this._baseGlass = new SeedWorldLiquidGlassUiMaterial(camera));
    const knobGlass = (this._knobGlass = new SeedWorldLiquidGlassUiMaterial(camera));
    baseGlass.setInteriorRefractionStrength(0);
    knobGlass.setRoughness(0.7);
    knobGlass.setInteriorRefractionStrength(0);

    const canvasRoot = (this._canvasRoot = scene.createRootEntity("World FreeControl UI"));
    const canvas = (this._canvas = canvasRoot.addComponent(UICanvas));
    canvas.renderMode = CanvasRenderMode.ScreenSpaceOverlay;
    canvas.resolutionAdaptationMode = ResolutionAdaptationMode.BothAdaptation;
    canvas.sortOrder = 32_000;

    const controlRoot = (this._controlRoot = canvasRoot.createChild("Dynamic movement joystick"));
    const baseImage = controlRoot.addComponent(Image);
    baseImage.sprite = whiteSprite;
    baseImage.raycastEnabled = false;
    baseImage.setMaterial(baseGlass.material);
    this._controlTransform = controlRoot.transform as UITransform;
    const group = (this._group = controlRoot.addComponent(UIGroup));
    group.alpha = 0;
    group.interactive = false;

    const knobEntity = controlRoot.createChild("Thumb knob");
    const knobImage = knobEntity.addComponent(Image);
    knobImage.sprite = whiteSprite;
    knobImage.raycastEnabled = false;
    knobImage.setMaterial(knobGlass.material);
    this._knobTransform = knobEntity.transform as UITransform;

    canvasRoot.isActive = false;
    return true;
  }

  private _applyVisibility(): void {
    const canvasRoot = this._canvasRoot;
    const group = this._group;
    const transform = this._controlTransform;
    if (!canvasRoot || !group || !transform) return;
    const eased = 1 - Math.pow(1 - this._visibility, 3);
    group.alpha = eased;
    const scale = 0.9 + eased * 0.1;
    transform.setScale(scale, scale, 1);
    if (this._visibility <= 0 && this._visibilityTarget <= 0) canvasRoot.isActive = false;
  }
}
