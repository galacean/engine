import { HUD_REFERENCE_SHORT_SIDE, resolveSeedWorldHudScale } from "./SeedWorldHudLayout.ts";
import {
  Camera,
  Entity,
  Script,
  Sprite,
  Texture2D,
  TextureFormat,
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
const ORB_SIZE = 148;
const ORB_RIGHT_WIDE = 116;
const ORB_BOTTOM_WIDE = 64;
const ORB_RIGHT_NARROW = 64;
const ORB_BOTTOM_NARROW = 108;
const ORB_RESERVED_RIGHT = ORB_RIGHT_WIDE + ORB_SIZE + 24;
const PANEL_MIN_WIDTH = 260;
const BUTTON_GAP_WIDE = 24;
const BUTTON_GAP_NARROW = 20;
const BUTTON_RIGHT_WIDE = ORB_RIGHT_WIDE + (ORB_SIZE - ICON_SIZE) * 0.5;
const BUTTON_BOTTOM_WIDE = ORB_BOTTOM_WIDE + ORB_SIZE + BUTTON_GAP_WIDE;
const BUTTON_RIGHT_NARROW = ORB_RIGHT_NARROW + (ORB_SIZE - ICON_SIZE) * 0.5;
const BUTTON_BOTTOM_NARROW = ORB_BOTTOM_NARROW + ORB_SIZE + BUTTON_GAP_NARROW;
const CANVAS_SCALE = 3;
const CYCLE_SECONDS = 3.4;
const FRAME_INTERVAL = 1 / 30;

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

function easeInOutCubic(t: number): number {
  const x = Math.max(0, Math.min(1, t));
  return x < 0.5 ? 4 * x * x * x : 1 - ((-2 * x + 2) ** 3) / 2;
}

function cubicBezier(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const u = 1 - t;
  return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3;
}

/** Sample the organic 2-segment S-curve stroke in local icon space (0..ICON_SIZE). */
function sampleScribblePoint(t: number, cx: number, cy: number): [number, number] {
  const clamped = Math.max(0, Math.min(1, t));
  if (clamped <= 0.5) {
    const s = clamped * 2;
    return [
      cubicBezier(cx - 38, cx - 38, cx - 21, cx - 21, s),
      cubicBezier(cy + 14, cy - 8, cy - 8, cy + 7, s)
    ];
  }
  const s = (clamped - 0.5) * 2;
  return [
    cubicBezier(cx - 21, cx - 21, cx - 6, cx - 2, s),
    cubicBezier(cy + 7, cy + 24, cy + 24, cy + 12, s)
  ];
}

/** Draw one frame of the borderless animated Pen + S-curve stroke icon. */
function renderAnimatedMarkupIcon(ctx: CanvasRenderingContext2D, phaseSeconds: number): void {
  const size = ICON_SIZE;
  ctx.setTransform(CANVAS_SCALE, 0, 0, CANVAS_SCALE, 0, 0);
  ctx.clearRect(0, 0, size, size);

  const cx = size * 0.5;
  const cy = size * 0.54;
  const t = ((phaseSeconds % CYCLE_SECONDS) + CYCLE_SECONDS) % CYCLE_SECONDS;

  // Motion phases:
  // 0.00 - 0.45: calm resting pen
  // 0.45 - 0.80: pen glides cleanly to start of stroke
  // 0.80 - 1.75: pen traces the luminous S-curve stroke (0 -> 1)
  // 1.75 - 2.45: hold full pen + scribble silhouette
  // 2.45 - 3.05: stroke smoothly sweeps into pen tip (start 0 -> 1) while pen returns to rest
  // 3.05 - 3.40: calm pause
  const restTip: [number, number] = [cx - 2, cy + 12];
  const startTip = sampleScribblePoint(0, cx, cy);

  let drawStart = 0;
  let drawEnd = 0;
  let tipX = restTip[0];
  let tipY = restTip[1];
  let extraTiltDeg = 0;
  let penLift = 0;

  if (t < 0.45) {
    tipX = restTip[0];
    tipY = restTip[1];
  } else if (t < 0.8) {
    const k = easeInOutCubic((t - 0.45) / 0.35);
    tipX = restTip[0] + (startTip[0] - restTip[0]) * k;
    tipY = restTip[1] + (startTip[1] - restTip[1]) * k - Math.sin(k * Math.PI) * 8.0;
    extraTiltDeg = -6 * k;
    penLift = Math.sin(k * Math.PI) * 2.2;
  } else if (t < 1.75) {
    const k = easeInOutCubic((t - 0.8) / 0.95);
    drawStart = 0;
    drawEnd = k;
    const pt = sampleScribblePoint(k, cx, cy);
    const ptAhead = sampleScribblePoint(Math.min(1, k + 0.03), cx, cy);
    tipX = pt[0];
    tipY = pt[1];
    const dy = ptAhead[1] - pt[1];
    extraTiltDeg = -6 + k * 6 + Math.max(-5, Math.min(5, dy * 1.1));
  } else if (t < 2.45) {
    drawStart = 0;
    drawEnd = 1;
    tipX = restTip[0];
    tipY = restTip[1];
  } else if (t < 3.05) {
    const k = easeInOutCubic((t - 2.45) / 0.6);
    drawStart = k;
    drawEnd = 1;
    tipX = restTip[0];
    tipY = restTip[1];
  }

  // 1. Draw the live S-curve stroke segment [drawStart .. drawEnd]
  if (drawEnd - drawStart > 0.006) {
    const steps = 44;
    const span = drawEnd - drawStart;

    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.shadowColor = "rgba(8, 16, 30, 0.58)";
    ctx.shadowBlur = 11;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 2.6;
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 5.4;
    ctx.beginPath();
    for (let i = 0; i <= steps; i++) {
      const [px, py] = sampleScribblePoint(drawStart + (span * i) / steps, cx, cy);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();
    ctx.restore();
  }

  // 2. Draw the bold minimalist tilted stylus/pen anchored directly at its nib (tipX, tipY)
  ctx.save();
  ctx.translate(tipX, tipY - penLift);
  ctx.rotate(((36 + extraTiltDeg) * Math.PI) / 180);
  ctx.shadowColor = "rgba(8, 16, 30, 0.62)";
  ctx.shadowBlur = 12;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 2.8;
  ctx.strokeStyle = "#ffffff";
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  const halfW = 7.4;
  const collarY = -13.5;
  const topY = -50.0;

  // Outline barrel + rounded cap + crisp tapered nib ending exactly at (0, 0)
  ctx.lineWidth = 4.8;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(-halfW, collarY);
  ctx.lineTo(-halfW, topY + 5.0);
  ctx.arcTo(-halfW, topY, 0, topY, 5.0);
  ctx.arcTo(halfW, topY, halfW, topY + 5.0, 5.0);
  ctx.lineTo(halfW, collarY);
  ctx.closePath();
  ctx.stroke();

  // Subtle collar divider line
  ctx.lineWidth = 3.6;
  ctx.beginPath();
  ctx.moveTo(-halfW + 1.0, collarY - 0.5);
  ctx.lineTo(halfW - 1.0, collarY - 0.5);
  ctx.stroke();
  ctx.restore();
}

/**
 * Borderless animated Screen-Markup entry button (Pinterest Tile 3 motion iconography):
 * pure floating minimalist stylus + live S-curve stroke animation, zero circular backdrop.
 */
export class SeedWorldCameraButton {
  private readonly root: Entity;
  private readonly texture: Texture2D;
  private readonly sprite: Sprite;
  private readonly iconCanvas: HTMLCanvasElement;
  private readonly iconCtx: CanvasRenderingContext2D;
  private pressBlend = 0;
  private isPressed = false;
  private animTime = 0;
  private frameAccumulator = FRAME_INTERVAL;

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

    this.iconCanvas = document.createElement("canvas");
    this.iconCanvas.width = ICON_SIZE * CANVAS_SCALE;
    this.iconCanvas.height = ICON_SIZE * CANVAS_SCALE;
    this.iconCtx = this.iconCanvas.getContext("2d")!;
    renderAnimatedMarkupIcon(this.iconCtx, 0);

    this.texture = new Texture2D(engine, this.iconCanvas.width, this.iconCanvas.height, TextureFormat.R8G8B8A8_UNorm, false);
    this.texture.setImageSource(this.iconCanvas);
    this.sprite = new Sprite(engine, this.texture);

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
    let baseAlignRight = BUTTON_RIGHT_WIDE;

    this.root.addComponent(MarkupButtonInput).update = (deltaTime: number) => {
      const { width, height } = engine.canvas;
      if (width !== lastWidth || height !== lastHeight) {
        lastWidth = width;
        lastHeight = height;
        const uiScale = resolveSeedWorldHudScale(width, height);
        const referenceWidth = width / Math.max(1e-4, uiScale);
        const useWideLayout = referenceWidth - ORB_RESERVED_RIGHT * 2 >= PANEL_MIN_WIDTH;
        baseAlignRight = useWideLayout ? BUTTON_RIGHT_WIDE : BUTTON_RIGHT_NARROW;
        iconTransform.alignBottom = useWideLayout ? BUTTON_BOTTOM_WIDE : BUTTON_BOTTOM_NARROW;
      }
      const orbExpand = Math.max(0, Math.min(1, Number(webCanvas?.dataset.voiceOrbExpand) || 0));
      // Smoothly dissolve & hide the pen icon while long-pressing / speaking to the Voice Orb.
      const voiceHide = Math.min(1, orbExpand * 2.4);
      const voiceAlpha = 1 - voiceHide * voiceHide * (3 - 2 * voiceHide);
      iconTransform.alignRight = baseAlignRight;

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
      const scale = (1 - this.pressBlend * 0.12) * (0.86 + 0.14 * voiceAlpha);
      iconTransform.setScale(scale, scale, 1);
      iconImage.color.a = (control.disabled ? 0.42 : 1) * voiceAlpha;

      this.animTime += dt;
      this.frameAccumulator += dt;
      if (this.frameAccumulator >= FRAME_INTERVAL) {
        this.frameAccumulator %= FRAME_INTERVAL;
        renderAnimatedMarkupIcon(this.iconCtx, this.animTime);
        this.texture.setImageSource(this.iconCanvas);
      }
    };
  }

  dispose(): void {
    this.root.destroy();
    this.sprite.destroy();
    this.texture.destroy();
  }
}
