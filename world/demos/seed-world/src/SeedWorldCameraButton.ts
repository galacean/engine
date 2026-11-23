import { HUD_REFERENCE_SHORT_SIDE, resolveSeedWorldHudScale } from "./SeedWorldHudLayout.ts";
import {
  Camera,
  CameraClearFlags,
  Entity,
  Layer,
  Script,
  Sprite,
  Texture2D,
  TextureFormat,
  Vector3,
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
import { SeedWorldLiquidGlassUiMaterial } from "@galacean/engine-modify/rendering/LiquidGlassPostProcessPass";

// Upper-right VisionOS-style spatial frosted-glass button (720-unit reference short side):
// clean symmetric rounded capsule with undistorted 3D perspective (narrow FOV avoids corner shear).
const PILL_WIDTH = 66;
const PILL_HEIGHT = 66;
const BUTTON_RIGHT = 28;
const BUTTON_TOP = 90;
const PERSPECTIVE_FOV_DEG = 28;
const CAMERA_Z = 9.5;
const CAMERA_BUTTON_3D_LAYER = Layer.Layer26;

function setLayerRecursive(entity: Entity, layer: Layer): void {
  const stack: Entity[] = [entity];
  while (stack.length > 0) {
    const current = stack.pop()!;
    current.layer = layer;
    for (let i = 0; i < current.children.length; i++) stack.push(current.children[i]);
  }
}

class CameraButtonInput extends Script {
  update?: (deltaTime: number) => void;
  activate?: () => void;
  pressed?: (value: boolean) => void;
  override onUpdate(deltaTime: number): void { this.update?.(deltaTime); }
  override onPointerDown(_event: PointerEventData): void { this.pressed?.(true); }
  override onPointerUp(_event: PointerEventData): void { this.pressed?.(false); }
  override onPointerExit(_event: PointerEventData): void { this.pressed?.(false); }
  override onPointerClick(_event: PointerEventData): void { this.activate?.(); }
}

function makeCanvasTexture(engine: Camera["engine"], canvas: HTMLCanvasElement): { texture: Texture2D; sprite: Sprite } {
  const texture = new Texture2D(engine, canvas.width, canvas.height, TextureFormat.R8G8B8A8_UNorm, false);
  texture.setImageSource(canvas);
  return { texture, sprite: new Sprite(engine, texture) };
}

/** High-DPI VisionOS frosted pill border + specular sheen + subtle dark glass contrast tint. */
function createGlassShellCanvas(width: number, height: number, scale: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = width * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(scale, scale);
  const pad = 3;
  const w = width - pad * 2;
  const h = height - pad * 2;
  const r = h * 0.5;

  // Subtle dark-cool translucent tint so white glyph & specular rim pop crisply even against bright sky
  const fillGrad = ctx.createLinearGradient(pad, pad, pad + w, pad + h);
  fillGrad.addColorStop(0, "rgba(255, 255, 255, 0.22)");
  fillGrad.addColorStop(0.45, "rgba(200, 220, 240, 0.10)");
  fillGrad.addColorStop(1, "rgba(22, 32, 48, 0.24)");
  ctx.fillStyle = fillGrad;
  ctx.beginPath();
  ctx.roundRect(pad, pad, w, h, r);
  ctx.fill();

  // Top-left inner specular glass sheen strictly clipped inside the circle/capsule path
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(pad + 1.5, pad + 1.5, w - 3, h - 3, Math.max(0, r - 1.5));
  ctx.clip();
  const sheenGrad = ctx.createLinearGradient(pad, pad, pad, pad + h * 0.55);
  sheenGrad.addColorStop(0, "rgba(255, 255, 255, 0.34)");
  sheenGrad.addColorStop(1, "rgba(255, 255, 255, 0.0)");
  ctx.fillStyle = sheenGrad;
  ctx.fillRect(pad, pad, w, h * 0.55);
  ctx.restore();

  // Signature VisionOS crisp directional specular rim (brightest top-left, soft bottom-right)
  const rimGrad = ctx.createLinearGradient(pad, pad, pad + w, pad + h);
  rimGrad.addColorStop(0, "rgba(255, 255, 255, 0.96)");
  rimGrad.addColorStop(0.35, "rgba(235, 248, 255, 0.68)");
  rimGrad.addColorStop(0.75, "rgba(210, 232, 255, 0.42)");
  rimGrad.addColorStop(1, "rgba(255, 255, 255, 0.78)");
  ctx.strokeStyle = rimGrad;
  ctx.lineWidth = 1.9;
  ctx.beginPath();
  ctx.roundRect(pad + 0.9, pad + 0.9, w - 1.8, h - 1.8, r);
  ctx.stroke();

  return canvas;
}

/** Back 3D slab edge rim to create tangible glass-pane thickness under perspective yaw. */
function createGlassDepthEdgeCanvas(width: number, height: number, scale: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = width * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(scale, scale);
  const pad = 3;
  const w = width - pad * 2;
  const h = height - pad * 2;
  const r = h * 0.5;

  // Soft translucent depth shadow + glass back bevel
  ctx.fillStyle = "rgba(12, 20, 34, 0.24)";
  ctx.beginPath();
  ctx.roundRect(pad, pad, w, h, r);
  ctx.fill();

  ctx.strokeStyle = "rgba(210, 236, 255, 0.48)";
  ctx.lineWidth = 2.0;
  ctx.beginPath();
  ctx.roundRect(pad + 0.9, pad + 0.9, w - 1.8, h - 1.8, r);
  ctx.stroke();

  return canvas;
}

/** Crisp floating pure-white camera glyph (zero text) rendered on a separate forward Z-layer. */
function createForegroundContentCanvas(width: number, height: number, scale: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = width * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(scale, scale);

  // Subtle depth shadow cast onto the frosted glass behind
  ctx.shadowColor = "rgba(10, 20, 36, 0.42)";
  ctx.shadowBlur = 6;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 1.8;

  // Centered crisp minimalist camera icon
  const cw = 32;
  const ch = 22.5;
  const ix = (width - cw) * 0.5;
  const iy = (height - ch) * 0.5 - 1;
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.roundRect(ix, iy + 4.5, cw, ch - 2, 5.2);
  ctx.roundRect(ix + 8.5, iy + 0.8, 15, 7.5, 3);
  ctx.fill();

  // Hollow circular lens cutout + subtle glossy center dot
  ctx.save();
  ctx.shadowColor = "transparent";
  ctx.globalCompositeOperation = "destination-out";
  ctx.beginPath();
  ctx.arc(width * 0.5, iy + 14.8, 6.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.fillStyle = "rgba(225, 248, 255, 0.96)";
  ctx.beginPath();
  ctx.arc(width * 0.5, iy + 14.8, 2.8, 0, Math.PI * 2);
  ctx.fill();

  // Tiny flash accent dot on top-right of camera body
  ctx.fillStyle = "rgba(255, 255, 255, 0.92)";
  ctx.beginPath();
  ctx.arc(ix + cw - 5.2, iy + 8.6, 1.35, 0, Math.PI * 2);
  ctx.fill();

  return canvas;
}

/**
 * VisionOS-inspired 3D Spatial Glass Capsule UI button:
 * bold perspective foreshortening, multi-layer 3D glass thickness, live frosted refraction,
 * crisp specular rim, floating foreground camera icon + label, and real camera-turn parallax.
 */
export class SeedWorldCameraButton {
  private readonly worldCamera: Camera;
  private readonly root: Entity;
  private readonly camEntity: Entity;
  private readonly rig3d: Entity;
  private readonly bodyGlass: SeedWorldLiquidGlassUiMaterial;
  private readonly textures: Texture2D[] = [];
  private readonly sprites: Sprite[] = [];
  private readonly worldForward = new Vector3();
  private readonly prevWorldForward = new Vector3();
  private hasPrevForward = false;
  private parallaxYaw = 0;
  private parallaxPitch = 0;
  private pressBlend = 0;
  private isPressed = false;
  private time = 0;

  constructor(camera: Camera, control: HTMLButtonElement) {
    const engine = camera.engine;
    const scene = camera.scene!;
    this.worldCamera = camera;
    camera.cullingMask = (camera.cullingMask & ~CAMERA_BUTTON_3D_LAYER) as Layer;

    // 1. ScreenSpaceOverlay hit target synced to the upper-right capsule bounds.
    this.root = scene.createRootEntity("Screenshot button UI");
    const hitCanvas = this.root.addComponent(UICanvas);
    hitCanvas.renderMode = CanvasRenderMode.ScreenSpaceOverlay;
    hitCanvas.camera = camera;
    hitCanvas.referenceResolution.set(HUD_REFERENCE_SHORT_SIDE, HUD_REFERENCE_SHORT_SIDE);
    hitCanvas.resolutionAdaptationMode = ResolutionAdaptationMode.ExpandAdaptation;
    hitCanvas.sortOrder = 32_100;

    const target = this.root.createChild("Camera capture");
    const hit = target.addComponent(Image);
    hit.color.a = 0;
    const hitTransform = target.transform as UITransform;
    hitTransform.size.set(PILL_WIDTH, PILL_HEIGHT);
    hitTransform.horizontalAlignment = HorizontalAlignmentMode.Right;
    hitTransform.verticalAlignment = VerticalAlignmentMode.Top;
    hitTransform.alignRight = BUTTON_RIGHT;
    hitTransform.alignTop = BUTTON_TOP;

    // 2. Generate crisp 4x Retina textures for the frosted glass pill, 3D slab edge, and floating icon.
    const white = new Texture2D(engine, 1, 1, TextureFormat.R8G8B8A8_UNorm, false);
    white.setPixelBuffer(new Uint8Array([255, 255, 255, 255]));
    const whiteSprite = new Sprite(engine, white);
    this.textures.push(white);
    this.sprites.push(whiteSprite);

    const depthAsset = makeCanvasTexture(engine, createGlassDepthEdgeCanvas(PILL_WIDTH, PILL_HEIGHT, 4));
    const shellAsset = makeCanvasTexture(engine, createGlassShellCanvas(PILL_WIDTH, PILL_HEIGHT, 4));
    const fgAsset = makeCanvasTexture(engine, createForegroundContentCanvas(PILL_WIDTH, PILL_HEIGHT, 4));
    this.textures.push(depthAsset.texture, shellAsset.texture, fgAsset.texture);
    this.sprites.push(depthAsset.sprite, shellAsset.sprite, fgAsset.sprite);

    // 3. Layer-isolated 3D perspective camera in the single main Scene (zero extra Scene).
    const camEntity = (this.camEntity = scene.createRootEntity("Camera 3D UI view"));
    camEntity.layer = CAMERA_BUTTON_3D_LAYER;
    const uiCam = camEntity.addComponent(Camera);
    uiCam.isOrthographic = false;
    uiCam.fieldOfView = PERSPECTIVE_FOV_DEG;
    uiCam.nearClipPlane = 0.1;
    uiCam.farClipPlane = 30;
    uiCam.priority = 10;
    uiCam.cullingMask = CAMERA_BUTTON_3D_LAYER;
    uiCam.clearFlags = CameraClearFlags.Depth;
    uiCam.enableHDR = false;
    uiCam.enablePostProcess = false;
    camEntity.transform.setPosition(0, 0, CAMERA_Z);
    camEntity.transform.lookAt(new Vector3());

    this.rig3d = scene.createRootEntity("Spatial 3D glass capsule");
    const canvas3d = this.rig3d.addComponent(UICanvas);
    canvas3d.renderMode = CanvasRenderMode.WorldSpace;
    canvas3d.camera = uiCam;
    (this.rig3d.transform as UITransform).size.set(PILL_WIDTH, PILL_HEIGHT);

    // Layer 1 (z = -6): Physical 3D glass slab back bevel / depth edge
    const depthEntity = this.rig3d.createChild("3D glass depth bevel");
    const depthImage = depthEntity.addComponent(Image);
    depthImage.sprite = depthAsset.sprite;
    depthImage.raycastEnabled = false;
    (depthEntity.transform as UITransform).size.set(PILL_WIDTH, PILL_HEIGHT);
    depthEntity.transform.setPosition(0, 0, -6.5);

    // Layer 2 (z = 0): Real-time frosted liquid-glass pill refracting the live 3D world behind it
    const glassEntity = this.rig3d.createChild("3D frosted glass core");
    const glassImage = glassEntity.addComponent(Image);
    glassImage.sprite = whiteSprite;
    glassImage.raycastEnabled = false;
    (glassEntity.transform as UITransform).size.set(PILL_WIDTH - 6, PILL_HEIGHT - 6);
    glassEntity.transform.setPosition(0, 0, 0);
    this.bodyGlass = new SeedWorldLiquidGlassUiMaterial(camera);
    this.bodyGlass.setFullLensRefraction(1);
    this.bodyGlass.setRoughness(0.56);
    this.bodyGlass.setFrostScale(0.26);
    this.bodyGlass.setLensIor(1.12);
    this.bodyGlass.setLensThickness(0.65);
    this.bodyGlass.setChromaticAberration(0.28);
    this.bodyGlass.setLensFresnel(0.85);
    this.bodyGlass.setWhiteTint(0.06);
    this.bodyGlass.setOpacity(0.92);
    glassImage.setMaterial(this.bodyGlass.material);

    // Layer 3 (z = +1.2): VisionOS crisp directional white specular rim + top glass sheen
    const shellEntity = this.rig3d.createChild("3D glass specular rim");
    const shellImage = shellEntity.addComponent(Image);
    shellImage.sprite = shellAsset.sprite;
    shellImage.raycastEnabled = false;
    (shellEntity.transform as UITransform).size.set(PILL_WIDTH, PILL_HEIGHT);
    shellEntity.transform.setPosition(0, 0, 1.2);

    // Layer 4 (z = +6.5): Floating pure-white camera icon + "拍照" with tangible 3D parallax separation
    const fgEntity = this.rig3d.createChild("3D floating camera glyph");
    const fgImage = fgEntity.addComponent(Image);
    fgImage.sprite = fgAsset.sprite;
    fgImage.raycastEnabled = false;
    (fgEntity.transform as UITransform).size.set(PILL_WIDTH, PILL_HEIGHT);
    fgEntity.transform.setPosition(0, 0, 6.5);

    setLayerRecursive(this.rig3d, CAMERA_BUTTON_3D_LAYER);

    const input = target.addComponent(CameraButtonInput);
    input.activate = () => { if (!control.disabled && !control.hidden) control.click(); };
    input.pressed = value => {
      this.isPressed = value && !control.disabled;
    };

    const webCanvas = (engine.canvas as { _webCanvas?: HTMLCanvasElement })._webCanvas;
    const frustumHalfHeight = Math.tan((PERSPECTIVE_FOV_DEG * Math.PI) / 360) * CAMERA_Z;

    this.root.addComponent(CameraButtonInput).update = (deltaTime: number) => {
      const dt = Number.isFinite(deltaTime) ? Math.min(Math.max(deltaTime, 0), 0.1) : 0;
      const photoPhase = webCanvas?.dataset.photoPhase;
      const photoActive = Boolean(photoPhase && photoPhase !== "idle");
      const visible = !control.hidden && control.style.display !== "none" && !photoActive;
      target.isActive = visible;
      this.camEntity.isActive = visible;
      this.rig3d.isActive = visible;
      if (!visible) {
        this.isPressed = false;
        this.pressBlend = 0;
        return;
      }

      const pressTarget = this.isPressed ? 1 : 0;
      this.pressBlend += (pressTarget - this.pressBlend) * (1 - Math.exp(-16 * dt));
      this.time += dt;

      // Living 3D spatial inertia tracking world camera rotation
      this.worldForward.copyFrom(camera.entity.transform.worldForward);
      if (this.hasPrevForward) {
        const dx = this.worldForward.x - this.prevWorldForward.x;
        const dy = this.worldForward.y - this.prevWorldForward.y;
        this.parallaxYaw = Math.max(-14, Math.min(14, this.parallaxYaw + dx * 68));
        this.parallaxPitch = Math.max(-10, Math.min(10, this.parallaxPitch + dy * 55));
      }
      this.prevWorldForward.copyFrom(this.worldForward);
      this.hasPrevForward = true;
      const decay = Math.exp(-6.5 * dt);
      this.parallaxYaw *= decay;
      this.parallaxPitch *= decay;

      const scaleFactor = 1 - this.pressBlend * 0.08;
      const disabledFactor = control.disabled ? 0.42 : 1;
      depthImage.color.a = disabledFactor;
      shellImage.color.a = disabledFactor;
      fgImage.color.a = disabledFactor;
      this.bodyGlass.setOpacity(0.92 * disabledFactor);
      this.bodyGlass.setRimHighlight(this.pressBlend * 0.3);

      const cw = Math.max(1, engine.canvas.width);
      const ch = Math.max(1, engine.canvas.height);
      const hudScale = resolveSeedWorldHudScale(cw, ch);
      const refW = cw / hudScale;
      const refH = ch / hudScale;
      const aspect = cw / ch;

      const glassW = (PILL_WIDTH - 6) * hudScale * scaleFactor;
      const glassH = (PILL_HEIGHT - 6) * hudScale * scaleFactor;
      this.bodyGlass.setLayout(glassW, glassH, glassH * 0.5);

      // Project upper-right HUD slot center accurately onto z = 0 plane of the 60-deg perspective camera
      const centerRight = BUTTON_RIGHT + PILL_WIDTH * 0.5;
      const centerTop = BUTTON_TOP + PILL_HEIGHT * 0.5;
      const ndcX = 1 - (2 * centerRight) / refW;
      const ndcY = 1 - (2 * centerTop) / refH;
      const worldPerHud = (frustumHalfHeight * 2) / refH;
      const hoverBob = Math.sin(this.time * 1.9) * 0.015;
      const rigScale = worldPerHud * scaleFactor;

      this.rig3d.transform.setPosition(
        ndcX * frustumHalfHeight * aspect,
        ndcY * frustumHalfHeight + hoverBob,
        -this.pressBlend * 0.22
      );
      this.rig3d.transform.setScale(rigScale, rigScale, rigScale);

      // Subtle, distortion-free 3D spatial angle (narrow FOV + gentle yaw avoids diagonal corner stretch!)
      const yaw = -14 + Math.sin(this.time * 1.1) * 3.5 + this.parallaxYaw * 0.7 + this.pressBlend * 6;
      const pitch = 5 + Math.cos(this.time * 0.9) * 2.0 + this.parallaxPitch * 0.7 + this.pressBlend * 8;
      const roll = 0;
      this.rig3d.transform.setRotation(pitch, yaw, roll);
    };
  }

  dispose(): void {
    if (!this.worldCamera.destroyed) {
      this.worldCamera.cullingMask = (this.worldCamera.cullingMask | CAMERA_BUTTON_3D_LAYER) as Layer;
    }
    this.root.destroy();
    this.camEntity.destroy();
    this.rig3d.destroy();
    this.bodyGlass.destroy();
    for (const sprite of this.sprites) sprite.destroy();
    for (const texture of this.textures) texture.destroy();
  }
}
