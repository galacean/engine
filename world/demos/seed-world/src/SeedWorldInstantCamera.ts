import { destroyOwnedMesh } from "@galacean/engine-terrain/geometry/destroyOwnedMesh";
import type { ModelMesh } from "@galacean/engine";
import { warmupPhotoPresentation } from "@galacean/engine-world-planning/world/SeedWorldPhotoWarmup";
import type { PhotoImage } from "@galacean/engine-world-planning/world/SeedWorldPhotoImage";
import type { ImageResourceBudget } from "@galacean/engine-ai-chat/ai-chat/image-resources";
import { SEED_WORLD_PHOTO_CONFIG } from "@galacean/engine-world-planning/world/SeedWorldPhotoConfig";
import { alignPhotoModel, photoMaterial, PHOTO_MODEL_URL } from "@galacean/engine-world-planning/world/SeedWorldPhotoGraphics";
import {
  AssetType,
  BoundingBox,
  Camera,
  CameraClearFlags,
  Color,
  DirectLight,
  Entity,
  GLTFResource,
  MeshRenderer,
  PointLight,
  PrimitiveMesh,
  Quaternion,
  Scene,
  Texture2D,
  TextureFormat,
  UnlitMaterial,
  Vector3,
  type Engine
} from "@galacean/engine";

// Separate phases: the photograph must fully exit before it starts flying to the screen.
export const INSTANT_CAMERA_TIMING = { enter: 330, shutter: 140, eject: 800, fly: 500 } as const;

const PHOTO_HEIGHT = 1.22337079;
// Preserve the supplied paper's curvature; add only a subtle upward feed motion.
const PHOTO_EXIT_LIFT_RADIANS = (10 * Math.PI) / 180;
const MODEL_URL = new URL("../assets/instant-camera/polaroid-camera.glb", import.meta.url).href;

/** A real Engine scene composited over the world, excluded from the world's photo/ID camera. */
export class SeedWorldInstantCamera {
  private scene?: Scene;
  private camera?: Camera;
  private rig?: Entity;
  private flash?: Entity;
  private flashLight?: PointLight;
  private flashRenderer?: MeshRenderer;
  private slot?: Entity;
  private normalized?: Entity;
  private photo?: Entity;
  private photoMaterial?: UnlitMaterial;
  private backdrop?: MeshRenderer;
  private loading?: Promise<void>;
  private disposed = false;
  private yaw = -15;
  private audio?: AudioContext;
  private readonly point = new Vector3();

  constructor(
    readonly engine: Engine,
    readonly canvas: HTMLCanvasElement,
    readonly worldCamera: Camera,
    readonly budget?: ImageResourceBudget
  ) {}

  /** Called from the click handler so browsers may unlock the short synthesized shutter sound. */
  unlockAudio(): void {
    try {
      this.audio ??= new AudioContext();
      void this.audio.resume().catch(() => {});
    } catch {
      /* The visual interaction also works without audio. */
    }
  }

  prepare(): Promise<void> {
    return (this.loading ??= this.load().catch((error) => {
      this.loading = undefined;
      throw error;
    }));
  }

  private async load(): Promise<void> {
    const [resource, photoResource] = await Promise.all([
      this.engine.resourceManager.load<GLTFResource>({ type: AssetType.GLTF, url: MODEL_URL }),
      this.engine.resourceManager.load<GLTFResource>({
        type: AssetType.GLTF,
        url: PHOTO_MODEL_URL,
        params: { keepMeshData: true }
      })
    ]);
    if (this.disposed) return;
    const scene = (this.scene = new Scene(this.engine, "Instant camera presentation"));
    scene.isActive = false;
    scene.ambientLight.diffuseSolidColor = new Color(0.22, 0.24, 0.27, 1);
    const view = scene.createRootEntity("Presentation view");
    const camera = (this.camera = view.addComponent(Camera));
    camera.isOrthographic = true;
    camera.orthographicSize = 1.5;
    camera.nearClipPlane = 0.01;
    camera.farClipPlane = 20;
    camera.clearFlags = CameraClearFlags.Depth;
    view.transform.setPosition(0, 0, 6);
    view.transform.lookAt(new Vector3());
    for (const [name, x, y, z, intensity] of [
      ["Key", -3, 4, 5, 0.9],
      ["Fill", 4, 1, 2, 0.35]
    ] as const) {
      const light = scene.createRootEntity(name);
      light.transform.setPosition(x, y, z);
      light.transform.lookAt(new Vector3());
      light.addComponent(DirectLight).color = new Color(intensity, intensity, intensity, 1);
    }
    const rig = (this.rig = scene.createRootEntity("Polaroid by Boxroom 3D"));
    const normalized = (this.normalized = rig.createChild("Normalized camera"));
    const model = resource.instantiateSceneRoot();
    normalized.addChild(model);
    const renderers = model.getComponentsIncludeChildren(MeshRenderer, []);
    const bounds = new BoundingBox(
      new Vector3(Infinity, Infinity, Infinity),
      new Vector3(-Infinity, -Infinity, -Infinity)
    );
    for (const renderer of renderers) {
      BoundingBox.merge(bounds, renderer.bounds, bounds);
      renderer.castShadows = false;
    }
    const center = bounds.getCenter(new Vector3()),
      extent = bounds.getExtent(new Vector3());
    const scale = 1.75 / Math.max(extent.x * 2, extent.y * 2, extent.z * 2);
    normalized.transform.setScale(scale, scale, scale);
    normalized.transform.setPosition(-center.x * scale, -center.y * scale, -center.z * scale);
    // Anchors are in the original model's coordinate system, alongside its front film slot.
    this.slot = normalized.createChild("Film exit");
    this.slot.transform.setPosition(0, 1.04, 2.8);
    const flash = (this.flash = normalized.createChild("Shutter flash"));
    flash.transform.setPosition(-1.72, 3.16, 1.23);
    const lamp = this.flashLight = flash.addComponent(PointLight);
    lamp.color = new Color(0, 0, 0, 1);
    lamp.distance = 3;
    const glow = (this.flashRenderer = flash.addComponent(MeshRenderer));
    glow.mesh = PrimitiveMesh.createSphere(this.engine, 0.13, 12);
    const material = new UnlitMaterial(this.engine);
    material.baseColor = new Color(1, 0.97, 0.88, 1);
    glow.setMaterial(material);
    glow.enabled = false;
    const photo = (this.photo = normalized.createChild("Photo by Edoardo Galati"));
    const photoModel = photoResource.instantiateSceneRoot();
    photo.addChild(photoModel);
    const face = alignPhotoModel(photoModel);
    const ink = (this.photoMaterial = photoMaterial(this.engine));
    face.setMaterial(ink);
    photo.isActive = false;
    const backdrop = scene.createRootEntity("Photograph backdrop");
    backdrop.transform.setPosition(0, 0, -4);
    this.backdrop = backdrop.addComponent(MeshRenderer);
    this.backdrop.mesh = PrimitiveMesh.createCuboid(this.engine, 1, 1, 0.001);
    const shade = new UnlitMaterial(this.engine);
    shade.isTransparent = true;
    shade.baseColor = new Color(0.0052, 0.0086, 0.0097, 0);
    this.backdrop.setMaterial(shade);
    backdrop.isActive = false;
    const placeholder = new Texture2D(this.engine, 1, 1, TextureFormat.R8G8B8A8, false, true);
    placeholder.setPixelBuffer(new Uint8Array([255, 255, 255, 255]));
    ink.baseTexture = placeholder;
    this.engine.sceneManager.addScene(scene);
    scene.isActive = true;
    try {
      await warmupPhotoPresentation(camera, () => {
        photo.isActive = backdrop.isActive = true;
        glow.enabled = true;
        camera.render();
      }, () => this.disposed, this.budget);
    } finally {
      if (!scene.destroyed) this.hide();
      placeholder.destroy(true);
    }
  }

  async enter(signal: AbortSignal): Promise<void> {
    await this.prepare();
    signal.throwIfAborted();
    if (this.disposed) throw new DOMException("Camera disposed", "AbortError");
    const rig = this.rig!,
      scene = this.scene!;
    const aspect = this.canvas.clientWidth / Math.max(1, this.canvas.clientHeight);
    const scale = Math.min(1, aspect * 1.1);
    this.yaw = aspect < 0.8 ? 0 : -15;
    rig.transform.setScale(scale, scale, scale);
    this.engine.sceneManager.addScene(scene);
    scene.isActive = true;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    await cameraMotion(reduced ? 0 : INSTANT_CAMERA_TIMING.enter, signal, (t) => {
      const ease = 1 - Math.pow(1 - t, 3);
      rig.transform.setPosition(aspect < 0.8 ? 0 : -Math.min(aspect * 0.42, 0.75), -2.7 + 2.9 * ease, 0);
      rig.transform.setRotation(22 + 18 * (1 - ease), this.yaw - 12 * (1 - ease), -5 + 10 * (1 - ease));
    });
  }

  /** CSS viewport origin of the actual film slot, for presentation diagnostics. */
  photoOrigin(): { x: number; y: number; width: number; angle: number } {
    const rect = this.canvas.getBoundingClientRect();
    this.camera!.worldToScreenPoint(this.slot!.transform.worldPosition, this.point);
    return {
      x: rect.left + (this.point.x * rect.width) / this.engine.canvas.width,
      y: rect.top + (this.point.y * rect.height) / this.engine.canvas.height,
      width: Math.min(rect.width * 0.22, rect.height * 0.28),
      angle: -8
    };
  }

  async shutter(signal: AbortSignal): Promise<void> {
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!reduced) { this.flashLight!.color.set(8, 7.6, 6.8, 1); this.flashRenderer!.enabled = true; }
    this.playClick();
    await cameraMotion(reduced ? 0 : INSTANT_CAMERA_TIMING.shutter, signal, (t) => {
      this.rig!.transform.setRotation(22 + Math.sin(t * Math.PI) * 3, this.yaw, -5);
      if (t > 0.45) { this.flashLight!.color.set(0, 0, 0, 1); this.flashRenderer!.enabled = false; }
    });
    this.flashLight!.color.set(0, 0, 0, 1); this.flashRenderer!.enabled = false;
  }

  private playClick(): void {
    const audio = this.audio;
    if (!audio || audio.state !== "running") return;
    const buffer = audio.createBuffer(1, Math.floor(audio.sampleRate * 0.1), audio.sampleRate);
    const samples = buffer.getChannelData(0);
    for (let i = 0; i < samples.length; i++)
      samples[i] = (Math.random() * 2 - 1) * Math.exp(-i / (audio.sampleRate * 0.014));
    const source = audio.createBufferSource(),
      gain = audio.createGain();
    source.buffer = buffer;
    gain.gain.value = 0.12;
    source.connect(gain).connect(audio.destination);
    source.onended = () => {
      source.disconnect();
      gain.disconnect();
    };
    source.start();
  }

  /** First physically eject the whole model, then fly and flatten it into the annotation frame. */
  async print(
    image: PhotoImage,
    target: () => DOMRect,
    signal: AbortSignal,
    phase: (value: "eject" | "fly") => void,
    flightProgress: (progress: number) => void
  ): Promise<void> {
    signal.throwIfAborted();
    const photo = this.photo!;
    this.photoMaterial!.baseTexture = image.texture;
    this.normalized!.addChild(photo);
    // The sheet is initially inside the body. Its leading edge travels out of the real slot.
    const width = 4.1;
    const heightScale = (width * 0.875) / ((0.903223 * image.width) / image.height);
    const length = PHOTO_HEIGHT * heightScale;
    photo.transform.setScale(width, heightScale, width);
    photo.transform.setRotation(-90, 0, 0);
    photo.isActive = true;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    phase("eject");
    await cameraMotion(reduced ? 0 : INSTANT_CAMERA_TIMING.eject, signal, (t) => {
      const angle = PHOTO_EXIT_LIFT_RADIANS * t;
      const feed = length * (t - 0.5);
      // Pivot around the point passing through the slot, rather than lifting the entire sheet away.
      photo.transform.setPosition(0, 1.04 + feed * Math.sin(angle), 2.8 + feed * Math.cos(angle));
      photo.transform.setRotation(-90 - (angle * 180) / Math.PI, 0, 0);
    });
    // Detach only after the trailing edge has cleared the slot; preserve its world transform.
    const position = new Vector3(),
      rotation = new Quaternion(),
      scale = new Vector3();
    photo.transform.worldMatrix.decompose(position, rotation, scale);
    this.scene!.addRootEntity(photo);
    const identity = new Quaternion(),
      current = new Quaternion();
    this.backdrop!.entity.isActive = true;
    const rigStart = this.rig!.transform.position.clone();
    phase("fly");
    await cameraMotion(reduced ? 0 : INSTANT_CAMERA_TIMING.fly, signal, (t) => {
      const ease = t * t * (3 - 2 * t);
      const viewport = this.canvas.getBoundingClientRect(),
        rect = target();
      const unit = 3 / viewport.height;
      const x = (rect.left + rect.width / 2 - viewport.left - viewport.width / 2) * unit;
      const y = -(rect.top + rect.height / 2 - viewport.top - viewport.height / 2) * unit;
      photo.transform.setPosition(
        position.x + (x - position.x) * ease,
        position.y + (y - position.y) * ease,
        position.z + (3 - position.z) * ease
      );
      Quaternion.slerp(rotation, identity, ease, current);
      photo.transform.rotationQuaternion = current;
      photo.transform.setScale(
        scale.x + (rect.width * unit - scale.x) * ease,
        scale.y + ((rect.height * unit) / PHOTO_HEIGHT - scale.y) * ease,
        scale.z * (1 - ease) + rect.width * unit * 0.12 * ease
      );
      this.rig!.transform.setPosition(rigStart.x, rigStart.y - 2.8 * ease, rigStart.z);
      this.backdrop!.entity.transform.setScale((viewport.width / viewport.height) * 3, 3, 1);
      (this.backdrop!.getMaterial() as UnlitMaterial).baseColor.a = SEED_WORLD_PHOTO_CONFIG.backdropOpacity * ease;
      flightProgress(ease);
    });
  }

  hide(): void {
    if (this.scene) {
      this.scene.isActive = false;
      this.engine.sceneManager.removeScene(this.scene);
    }
    if (this.flashLight) this.flashLight.color.set(0, 0, 0, 1);
    if (this.flashRenderer) this.flashRenderer.enabled = false;
    if (this.photo) this.photo.isActive = false;
    if (this.backdrop) this.backdrop.entity.isActive = false;
    if (this.photoMaterial) this.photoMaterial.baseTexture = null!;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.hide();
    const flashMesh = this.flashRenderer?.mesh,
      flashMaterial = this.flashRenderer?.getMaterial();
    const backdropMesh = this.backdrop?.mesh,
      backdropMaterial = this.backdrop?.getMaterial();
    const ambient = this.scene?.ambientLight;
    this.scene?.destroy();
    ambient?.destroy(true);
    destroyOwnedMesh(flashMesh as ModelMesh | undefined);
    flashMaterial?.destroy(true);
    this.photoMaterial?.destroy(true);
    destroyOwnedMesh(backdropMesh as ModelMesh | undefined);
    backdropMaterial?.destroy(true);
    this.scene = undefined;
    void this.audio?.close().catch(() => {});
  }
}

/** Abortable animation: closing the photo must never leave a late frame or capture running. */
export function cameraMotion(duration: number, signal: AbortSignal, update: (progress: number) => void): Promise<void> {
  signal.throwIfAborted();
  if (!duration) {
    update(1);
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    let frame = 0;
    const start = performance.now();
    const abort = () => {
      cancelAnimationFrame(frame);
      reject(signal.reason);
    };
    signal.addEventListener("abort", abort, { once: true });
    const tick = () => {
      try {
        const progress = Math.min(1, (performance.now() - start) / duration);
        update(progress);
        if (progress < 1) frame = requestAnimationFrame(tick);
        else {
          signal.removeEventListener("abort", abort);
          resolve();
        }
      } catch (error) {
        signal.removeEventListener("abort", abort);
        reject(error);
      }
    };
    try {
      update(0);
    } catch (error) {
      signal.removeEventListener("abort", abort);
      reject(error);
      return;
    }
    frame = requestAnimationFrame(tick);
  });
}
