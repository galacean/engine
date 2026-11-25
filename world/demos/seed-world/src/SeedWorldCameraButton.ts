import {
  HUD_REFERENCE_SHORT_SIDE,
  SEED_WORLD_VOICE_ORB_LAYOUT,
  resolveSeedWorldVoiceOrbLayout
} from "./SeedWorldHudLayout.ts";
import atlas from "../assets/markup-pen.json";
import {
  AssetType,
  Camera,
  Entity,
  Rect,
  Script,
  Sprite,
  Texture2D,
  Vector4,
  type PointerEventData
} from "@galacean/engine";
import {
  CanvasRenderMode,
  HorizontalAlignmentMode,
  Image,
  ResolutionAdaptationMode,
  UICanvas,
  UITransform,
  VerticalAlignmentMode
} from "@galacean/engine-ui";

// Borderless animated Pen + live-drawing S-curve stroke UI (Pinterest Tile 3 motion iconography):
// docked directly ABOVE the Voice Orb, horizontally centered on the orb's vertical axis in both wide & narrow HUD layouts.
const ICON_SIZE = 112;
const ORB_SIZE = SEED_WORLD_VOICE_ORB_LAYOUT.size;
const BUTTON_GAP_WIDE = 24;
const BUTTON_GAP_NARROW = 20;
const BUTTON_RIGHT_WIDE = SEED_WORLD_VOICE_ORB_LAYOUT.rightWide + (ORB_SIZE - ICON_SIZE) * 0.5;
const BUTTON_BOTTOM_WIDE = SEED_WORLD_VOICE_ORB_LAYOUT.bottomWide + ORB_SIZE + BUTTON_GAP_WIDE;
const BUTTON_RIGHT_NARROW = SEED_WORLD_VOICE_ORB_LAYOUT.rightNarrow + (ORB_SIZE - ICON_SIZE) * 0.5;
const BUTTON_BOTTOM_NARROW = SEED_WORLD_VOICE_ORB_LAYOUT.bottomNarrow + ORB_SIZE + BUTTON_GAP_NARROW;

class MarkupButtonInput extends Script {
  update?: (deltaTime: number) => void;
  activate?: () => void;
  pressed?: (value: boolean) => void;
  override onUpdate(deltaTime: number): void { this.update?.(deltaTime); }
  override onPointerDown(_event: PointerEventData): void { this.pressed?.(true); }
  override onPointerUp(_event: PointerEventData): void { this.pressed?.(false); }
  override onPointerExit(_event: PointerEventData): void { this.pressed?.(false); }
  override onPointerClick(_event: PointerEventData): void { this.activate?.(); }
}

/** Keep the control visible and usable while the animation atlas loads, including offline failures. */
function createRestingPen(camera: Camera): Texture2D {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = ICON_SIZE;
  const ctx = canvas.getContext("2d")!;
  ctx.translate(ICON_SIZE / 2 - 2, ICON_SIZE * 0.54 + 12);
  ctx.rotate(Math.PI / 5);
  ctx.strokeStyle = "#fff";
  ctx.lineCap = ctx.lineJoin = "round";
  ctx.lineWidth = 4.8;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(-7.4, -13.5);
  ctx.lineTo(-7.4, -45);
  ctx.arcTo(-7.4, -50, 0, -50, 5);
  ctx.arcTo(7.4, -50, 7.4, -45, 5);
  ctx.lineTo(7.4, -13.5);
  ctx.closePath();
  ctx.stroke();
  ctx.lineWidth = 3.6;
  ctx.beginPath();
  ctx.moveTo(-6.4, -14);
  ctx.lineTo(6.4, -14);
  ctx.stroke();
  const texture = new Texture2D(camera.engine, ICON_SIZE, ICON_SIZE, undefined, false);
  texture.setImageSource(canvas);
  return texture;
}

/**
 * Borderless animated Screen-Markup entry button (Pinterest Tile 3 motion iconography):
 * pure floating minimalist stylus + live S-curve stroke animation, zero circular backdrop.
 */
export class SeedWorldCameraButton {
  private readonly root: Entity;
  private restingPen?: Texture2D;
  private readonly sprite: Sprite;
  private pressBlend = 0;
  private isPressed = false;

  constructor(camera: Camera, control: HTMLButtonElement) {
    const engine = camera.engine;
    const scene = camera.scene!;

    this.root = scene.createRootEntity("Screen markup button UI");
    const uiCanvas = this.root.addComponent(UICanvas);
    uiCanvas.renderMode = CanvasRenderMode.ScreenSpaceOverlay;
    uiCanvas.camera = camera;
    uiCanvas.referenceResolution.set(HUD_REFERENCE_SHORT_SIDE, HUD_REFERENCE_SHORT_SIDE);
    uiCanvas.resolutionAdaptationMode = ResolutionAdaptationMode.ExpandAdaptation;
    uiCanvas.sortOrder = 32_100;

    this.restingPen = createRestingPen(camera);
    this.sprite = new Sprite(engine, this.restingPen);

    const target = this.root.createChild("Screen markup trigger");
    const iconImage = target.addComponent(Image);
    iconImage.sprite = this.sprite;
    iconImage.color.set(1, 1, 1, 1);

    const iconTransform = target.transform as UITransform;
    iconTransform.size.set(ICON_SIZE, ICON_SIZE);
    iconTransform.horizontalAlignment = HorizontalAlignmentMode.Right;
    iconTransform.verticalAlignment = VerticalAlignmentMode.Bottom;
    iconTransform.alignRight = BUTTON_RIGHT_WIDE;
    iconTransform.alignBottom = BUTTON_BOTTOM_WIDE;

    const input = target.addComponent(MarkupButtonInput);
    input.activate = () => { if (!control.disabled && !control.hidden) control.click(); };
    input.pressed = value => {
      this.isPressed = value && !control.disabled;
    };

    const webCanvas = (engine.canvas as { _webCanvas?: HTMLCanvasElement })._webCanvas;
    let lastWidth = -1;
    let lastHeight = -1;

    const region = new Rect(0, 0, 1 / atlas.columns, 1 / atlas.rows);
    let tile = 0;
    let time = 0;
    let atlasReady = false;
    engine.resourceManager.load<Texture2D>({
      url: new URL("../assets/markup-pen.webp", import.meta.url).href,
      type: AssetType.Texture,
      params: { mipmap: false }
    }).then(texture => {
      if (this.sprite.destroyed) return;
      this.sprite.texture = texture;
      const [left, top, right, bottom] = atlas.trim;
      this.sprite.atlasRegionOffset = new Vector4(left, top, right, bottom);
      this.sprite.atlasRegion = region;
      this.restingPen?.destroy();
      this.restingPen = undefined;
      atlasReady = true;
    }).catch(() => { /* The resting pen remains interactive. */ });

    this.root.addComponent(MarkupButtonInput).update = (deltaTime: number) => {
      const { width, height } = engine.canvas;
      if (width !== lastWidth || height !== lastHeight) {
        lastWidth = width;
        lastHeight = height;
        const { useWideLayout } = resolveSeedWorldVoiceOrbLayout(width, height);
        iconTransform.alignRight = useWideLayout ? BUTTON_RIGHT_WIDE : BUTTON_RIGHT_NARROW;
        iconTransform.alignBottom = useWideLayout ? BUTTON_BOTTOM_WIDE : BUTTON_BOTTOM_NARROW;
      }
      const orbExpand = Math.max(0, Math.min(1, Number(webCanvas?.dataset.voiceOrbExpand) || 0));
      // Smoothly dissolve & hide the pen icon while long-pressing / speaking to the Voice Orb.
      const voiceHide = Math.min(1, orbExpand * 2.4);
      const voiceAlpha = 1 - voiceHide * voiceHide * (3 - 2 * voiceHide);

      const dt = Number.isFinite(deltaTime) ? Math.min(Math.max(deltaTime, 0), 0.1) : 0;
      const photoPhase = webCanvas?.dataset.photoPhase;
      const photoActive = Boolean(photoPhase && photoPhase !== "idle");
      const visible = !control.hidden && control.style.display !== "none" && !photoActive && voiceAlpha > 0.02;
      target.isActive = visible;
      if (!visible) {
        this.isPressed = false;
        this.pressBlend = 0;
        return;
      }

      const pressTarget = this.isPressed ? 1 : 0;
      this.pressBlend += (pressTarget - this.pressBlend) * (1 - Math.exp(-16 * dt));
      if (Math.abs(pressTarget - this.pressBlend) < 0.001) this.pressBlend = pressTarget;
      const scale = (1 - this.pressBlend * 0.12) * (0.86 + 0.14 * voiceAlpha);
      if (iconTransform.scale.x !== scale) iconTransform.setScale(scale, scale, 1);
      const opacity = (control.disabled ? 0.42 : 1) * voiceAlpha;
      if (iconImage.color.a !== opacity) iconImage.color.a = opacity;

      if (atlasReady) {
        time = (time + dt) % (atlas.frames.length / atlas.fps);
        const next = atlas.frames[Math.floor(time * atlas.fps)];
        if (next !== tile) {
          tile = next;
          region.x = (tile % atlas.columns) / atlas.columns;
          region.y = Math.floor(tile / atlas.columns) / atlas.rows;
          this.sprite.atlasRegion = region;
        }
      }
    };
  }

  dispose(): void {
    this.root.destroy();
    this.sprite.destroy();
    this.restingPen?.destroy();
  }
}
