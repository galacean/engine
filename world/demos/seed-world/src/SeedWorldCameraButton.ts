import { HUD_REFERENCE_SHORT_SIDE, resolveSeedWorldHudScale } from "./SeedWorldHudLayout.ts";
import { Camera, Script, Sprite, Texture2D, TextureFormat, type Entity, type PointerEventData } from "@galacean/engine";
import { CanvasRenderMode, HorizontalAlignmentMode, Image, ResolutionAdaptationMode, UICanvas, UITransform, VerticalAlignmentMode } from "@galacean/engine-ui";
import { SeedWorldLiquidGlassUiMaterial } from "@galacean/engine-modify/rendering/LiquidGlassPostProcessPass";

class CameraButtonInput extends Script {
  update?: () => void;
  activate?: () => void;
  pressed?: (value: boolean) => void;
  override onUpdate(): void { this.update?.(); }
  override onPointerDown(_event: PointerEventData): void { this.pressed?.(true); }
  override onPointerUp(_event: PointerEventData): void { this.pressed?.(false); }
  override onPointerExit(_event: PointerEventData): void { this.pressed?.(false); }
  override onPointerClick(_event: PointerEventData): void { this.activate?.(); }
}

/** Engine UI silhouette and the same live scene-refraction material as the joystick. */
export class SeedWorldCameraButton {
  private readonly root: Entity;
  private readonly glass: SeedWorldLiquidGlassUiMaterial;
  private readonly bodyGlass: SeedWorldLiquidGlassUiMaterial;
  private readonly textures: Texture2D[] = [];
  private readonly sprites: Sprite[] = [];
  constructor(camera: Camera, control: HTMLButtonElement) {
    const engine = camera.engine;
    this.root = camera.scene!.createRootEntity("Screenshot button UI");
    const canvas = this.root.addComponent(UICanvas);
    canvas.renderMode = CanvasRenderMode.ScreenSpaceOverlay;
    canvas.camera = camera;
    canvas.referenceResolution.set(HUD_REFERENCE_SHORT_SIDE, HUD_REFERENCE_SHORT_SIDE);
    canvas.resolutionAdaptationMode = ResolutionAdaptationMode.ExpandAdaptation;
    canvas.sortOrder = 32_100;
    const target = this.root.createChild("Camera capture");
    const hit = target.addComponent(Image);
    hit.color.a = 0;
    const transform = target.transform as UITransform;
    transform.size.set(60, 60);
    transform.horizontalAlignment = HorizontalAlignmentMode.Right;
    transform.verticalAlignment = VerticalAlignmentMode.Bottom;
    transform.alignRight = transform.alignBottom = 18;

    // A static icon asset; drawing and interaction are Engine UI, not DOM/CSS.
    const pixels = document.createElement("canvas");
    pixels.width = pixels.height = 128;
    const ctx = pixels.getContext("2d")!;
    ctx.scale(2, 2);
    ctx.fillStyle = "white";
    ctx.beginPath();
    ctx.roundRect(4, 16, 56, 42, 10);
    ctx.roundRect(19, 10, 26, 20, 7);
    ctx.fill();
    ctx.globalCompositeOperation = "destination-out";
    ctx.beginPath(); ctx.arc(32, 36, 14, 0, Math.PI * 2); ctx.fill();
    const bodyTexture = new Texture2D(engine, 128, 128, TextureFormat.R8G8B8A8, false);
    bodyTexture.setImageSource(pixels);
    const bodySprite = new Sprite(engine, bodyTexture);
    this.textures.push(bodyTexture); this.sprites.push(bodySprite);
    const body = target.createChild("Frosted glass camera silhouette").addComponent(Image);
    body.sprite = bodySprite;
    body.raycastEnabled = false;
    (body.entity.transform as UITransform).size.set(56, 56);
    this.bodyGlass = new SeedWorldLiquidGlassUiMaterial(camera);
    this.bodyGlass.setCoverageTexture(bodyTexture);
    this.bodyGlass.setRoughness(1);
    this.bodyGlass.setWhiteTint(0.48);
    this.bodyGlass.setInteriorRefractionStrength(0);
    body.setMaterial(this.bodyGlass.material);

    const white = new Texture2D(engine, 1, 1, TextureFormat.R8G8B8A8, false);
    white.setPixelBuffer(new Uint8Array([255, 255, 255, 255]));
    const whiteSprite = new Sprite(engine, white);
    this.textures.push(white); this.sprites.push(whiteSprite);
    const lens = target.createChild("Liquid glass lens").addComponent(Image);
    lens.sprite = whiteSprite; lens.raycastEnabled = false;
    (lens.entity.transform as UITransform).size.set(24, 24);
    lens.entity.transform.setPosition(0, -3.5, 0);
    this.glass = new SeedWorldLiquidGlassUiMaterial(camera);
    this.glass.setRoughness(0.18);
    this.glass.setInteriorRefractionStrength(0.35);
    lens.setMaterial(this.glass.material);

    const input = target.addComponent(CameraButtonInput);
    input.activate = () => { if (!control.disabled && !control.hidden) control.click(); };
    input.pressed = value => {
      const scale = value && !control.disabled ? 0.93 : 1;
      target.transform.setScale(scale, scale, 1);
      this.glass.setRimHighlight(value ? 0.3 : 0);
    };
    // This controller stays active while the child button is hidden during capture.
    this.root.addComponent(CameraButtonInput).update = () => {
      target.isActive = !control.hidden && control.style.display !== "none";
      body.color.a = control.disabled ? 0.4 : 0.96;
      this.glass.setOpacity(control.disabled ? 0.4 : 1);
      const diameter = 24 * resolveSeedWorldHudScale(engine.canvas.width, engine.canvas.height);
      this.glass.setLayout(diameter, diameter, diameter / 2);
      const bodySize = diameter * 56 / 24;
      this.bodyGlass.setLayout(bodySize, bodySize, bodySize * 0.12);
    };
  }
  dispose(): void {
    this.root.destroy(); this.glass.destroy(); this.bodyGlass.destroy();
    for (const sprite of this.sprites) sprite.destroy();
    for (const texture of this.textures) texture.destroy();
  }
}
