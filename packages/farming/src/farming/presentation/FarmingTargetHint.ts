import {
  Color,
  Entity,
  Font,
  Material,
  Rect,
  Script,
  Shader,
  Sprite,
  Texture2D,
  TextureFilterMode,
  TextureWrapMode,
  Vector3,
  type Camera
} from "@galacean/engine";
import { CanvasRenderMode, Image, ResolutionAdaptationMode, Text, UICanvas, UITransform } from "@galacean/engine-ui";
import { restoreResource } from "@galacean/engine-modify/rendering/RestorableResources";
import { FARM_ACTION_CUES, type FarmSelectionAction } from "./FarmingSelectionTexture";
import { FARM_ACTION_INTERRUPT_PROGRESS } from "../config/FarmingActionConfig";
import { FARM_TARGET_HINT_SHADER } from "./FarmingTargetHintShader";

class TargetHintRenderDriver extends Script {
  project: ((camera: Camera) => void) | null = null;
  override onBeginRender(camera: Camera): void {
    this.project?.(camera);
  }
}

/** Native Galacean UI, projected after camera controllers and independent of render-buffer scale. */
export class FarmingTargetHint {
  private readonly root: Entity;
  private readonly anchor: Entity;
  private readonly ui: UICanvas;
  private readonly label: Text;
  private readonly shadow: Text;
  private readonly icon: Image;
  private readonly material: Material;
  private readonly texture: Texture2D;
  private readonly sprites: Sprite[] = [];
  private readonly driver: TargetHintRenderDriver;
  private readonly observer?: ResizeObserver;
  private readonly point = new Vector3();
  private readonly projected = new Vector3();
  private readonly progressTint = new Color();
  private action: FarmSelectionAction = null;
  private progress: number | null = null;
  private width: number;
  private height: number;
  private textScale = 0;
  private disposed = false;

  static create(camera: Camera, occluded?: (point: Vector3) => boolean): FarmingTargetHint {
    return new FarmingTargetHint(camera, occluded);
  }

  private constructor(
    private readonly camera: Camera,
    private readonly occluded?: (point: Vector3) => boolean
  ) {
    const engine = camera.engine;
    const host = (engine.canvas as { _webCanvas?: HTMLCanvasElement })._webCanvas;
    this.width = host?.clientWidth ?? engine.canvas.width;
    this.height = host?.clientHeight ?? engine.canvas.height;
    this.root = camera.entity.scene!.createRootEntity("farming-target-hint");
    this.ui = this.root.addComponent(UICanvas);
    this.ui.renderMode = CanvasRenderMode.ScreenSpaceOverlay;
    this.ui.resolutionAdaptationMode = ResolutionAdaptationMode.BothAdaptation;
    this.ui.sortOrder = 15;
    this.anchor = this.root.createChild("target-anchor");
    this.anchor.isActive = false;

    // Rasterize the existing line icons once into a native Sprite atlas. This scratch canvas
    // is never mounted: all visible images/text and hit testing belong to Galacean UI.
    const actions = Object.keys(FARM_ACTION_CUES) as NonNullable<FarmSelectionAction>[];
    const size = 64;
    const scratch =
      typeof OffscreenCanvas !== "undefined"
        ? new OffscreenCanvas(size * actions.length, size)
        : document.createElement("canvas");
    scratch.width = size * actions.length;
    scratch.height = size;
    const ctx = scratch.getContext("2d") as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
    ctx.strokeStyle = "white";
    ctx.lineWidth = 1.7;
    ctx.lineCap = ctx.lineJoin = "round";
    actions.forEach((action, i) => {
      ctx.setTransform(size / 24, 0, 0, size / 24, size * i, 0);
      ctx.stroke(new Path2D(FARM_ACTION_CUES[action].path));
    });
    const pixels = new Uint8Array(ctx.getImageData(0, 0, scratch.width, size).data);
    this.texture = new Texture2D(engine, scratch.width, size, undefined, false);
    this.texture.filterMode = TextureFilterMode.Bilinear;
    this.texture.wrapModeU = this.texture.wrapModeV = TextureWrapMode.Clamp;
    const upload = () => this.texture.setPixelBuffer(pixels);
    upload();
    restoreResource(this.texture, upload);
    actions.forEach((_, i) =>
      this.sprites.push(new Sprite(engine, this.texture, new Rect(i / actions.length, 0, 1 / actions.length, 1)))
    );
    // The analytic shader needs a full-UV quad but does not sample its texture.
    const fullSprite = new Sprite(engine, this.texture);
    this.sprites.push(fullSprite);
    const mark = this.image("target-dot-and-progress", fullSprite, 24, 24);
    this.material = new Material(engine, Shader.find("Farming/TargetHint") ?? Shader.create(FARM_TARGET_HINT_SHADER));
    mark.setMaterial(this.material);
    this.material.shaderData.setFloat("material_Progress", -1);
    this.setProgressTint(null);
    this.icon = this.image("action-icon", this.sprites[0], 16, 16);
    const font = Font.createFromOS(engine, '"PingFang SC", "Microsoft YaHei", sans-serif')!;
    this.shadow = this.text("action-label-shadow", font);
    this.shadow.color.set(24 / 255, 32 / 255, 24 / 255, 0.9);
    this.label = this.text("action-label", font);
    this.driver = camera.entity.addComponent(TargetHintRenderDriver);
    this.driver.project = (renderCamera) => {
      if (renderCamera === camera) this.project();
    };
    if (host && typeof ResizeObserver !== "undefined" && typeof host.clientWidth === "number") {
      this.observer = new ResizeObserver(([entry]) => {
        this.width = entry.contentRect.width;
        this.height = entry.contentRect.height;
      });
      this.observer.observe(host);
    }
  }

  private image(name: string, sprite: Sprite, width: number, height: number): Image {
    const entity = this.anchor.createChild(name);
    const image = entity.addComponent(Image);
    image.sprite = sprite;
    image.raycastEnabled = false;
    new Color(238 / 255, 233 / 255, 217 / 255, 1).toLinear(image.color);
    (entity.transform as UITransform).size.set(width, height);
    return image;
  }

  private text(name: string, font: Font): Text {
    const text = this.anchor.createChild(name).addComponent(Text);
    text.font = font;
    text.raycastEnabled = false;
    text.color.set(238 / 255, 233 / 255, 217 / 255, 1);
    return text;
  }

  show(x: number, y: number, z: number, action: NonNullable<FarmSelectionAction>): void {
    if (this.disposed) return;
    this.point.set(x, y + 0.025, z);
    if (this.action !== action) {
      this.action = action;
      this.label.text = this.shadow.text = FARM_ACTION_CUES[action].label;
      this.icon.sprite = this.sprites[Object.keys(FARM_ACTION_CUES).indexOf(action)];
      const textWidth = this.label.text.length * 12;
      this.icon.entity.transform.setPosition(-(textWidth + 5) / 2, -21, 0);
      this.label.entity.transform.setPosition(10.5, -21, 0);
      this.shadow.entity.transform.setPosition(10.5, -22, 0);
    }
  }

  setProgress(progress: number | null): void {
    if (this.disposed) return;
    const value = progress !== null && Number.isFinite(progress) && progress >= 0 && progress < 1 ? progress : null;
    if (value === this.progress) return;
    this.progress = value;
    this.material.shaderData.setFloat("material_Progress", value ?? -1);
    this.setProgressTint(value);
  }

  private setProgressTint(progress: number | null): void {
    if (progress === null || progress < FARM_ACTION_INTERRUPT_PROGRESS)
      this.progressTint.set(238 / 255, 233 / 255, 217 / 255, 1);
    else {
      const t = (progress - FARM_ACTION_INTERRUPT_PROGRESS) / (1 - FARM_ACTION_INTERRUPT_PROGRESS);
      this.progressTint.set((114 - 45 * t) / 255, (223 - 39 * t) / 255, (145 - 38 * t) / 255, 1);
    }
    this.progressTint.toLinear(this.progressTint);
    this.material.shaderData.setColor("material_ProgressColor", this.progressTint);
  }

  /** Keep hidden state current even when the camera does not render; never project here. */
  update(): void {
    if (!this.disposed && !this.available()) this.anchor.isActive = false;
  }

  private available(): boolean {
    return (
      this.action !== null &&
      this.camera.enabled &&
      this.camera.entity.isActiveInHierarchy &&
      this.width > 0 &&
      this.height > 0
    );
  }

  /** The camera render callback is the sole owner of projection and occlusion queries. */
  private project(): void {
    if (this.disposed) return;
    if (!this.available()) {
      this.anchor.isActive = false;
      return;
    }
    this.camera.worldToViewportPoint(this.point, this.projected);
    const { x, y, z } = this.projected;
    const { width, height } = this;
    const visible =
      Number.isFinite(x) &&
      Number.isFinite(y) &&
      Number.isFinite(z) &&
      z > this.camera.nearClipPlane &&
      x >= 0 &&
      y >= 0 &&
      x <= 1 &&
      y <= 1 &&
      !this.occluded?.(this.point);
    this.anchor.isActive = visible;
    if (!visible) return;
    const resolution = this.ui.referenceResolution;
    if (resolution.x !== width || resolution.y !== height) resolution.set(width, height);
    const viewport = this.camera.viewport;
    const screenX = (viewport.x + x * viewport.z - 0.5) * width;
    const screenY = (0.5 - viewport.y - y * viewport.w) * height;
    const position = this.anchor.transform.position;
    if (position.x !== screenX || position.y !== screenY) this.anchor.transform.setPosition(screenX, screenY, 0);
    const scale = Math.max(1, this.camera.engine.canvas.height / height);
    if (scale !== this.textScale) {
      this.textScale = scale;
      for (const text of [this.label, this.shadow]) {
        text.fontSize = 12 * scale;
        (text.entity.transform as UITransform).size.set(84 * scale, 18 * scale);
        text.entity.transform.setScale(1 / scale, 1 / scale, 1);
      }
    }
  }

  hide(): void {
    if (!this.disposed) {
      this.action = null;
      this.anchor.isActive = false;
      this.setProgress(null);
    }
  }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.observer?.disconnect();
    this.driver.project = null;
    this.driver.destroy();
    this.root.destroy();
    this.material.destroy();
    for (const sprite of this.sprites) sprite.destroy();
    this.texture.destroy(true);
    // Font.createFromOS returns a shared engine font; the hint does not own it.
  }
}
