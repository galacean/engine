import { destroyOwnedMesh } from "@galacean/engine-project/geometry/destroyOwnedMesh";
import markupViewportSource from "./MarkupViewport.shader?raw";
import markupStrokeFieldSource from "./MarkupStrokeField.shader?raw";
import { destroyPhotoResources } from "./SeedWorldPhotoResources";
import { warmupPhotoPresentation } from "./SeedWorldPhotoWarmup";
import { warmupSeedWorldRendererVariants } from "./SeedWorldShaderWarmup";
import { buildStrokeCapsuleSegments, smoothPolyline, type CapsuleSegmentVertexData } from "./SeedWorldStrokeSmoothing";
import type { PhotoImage } from "./SeedWorldPhotoImage";
import { encodeImage, type ImageResourceBudget } from "@galacean/engine-ai-chat/ai-chat/image-resources";
import {
  AssetType,
  AudioClip,
  AudioManager,
  AudioSource,
  BackgroundMode,
  BaseMaterial,
  Camera,
  CameraClearFlags,
  Color,
  Entity,
  Font,
  Layer,
  Material,
  MeshRenderer,
  ModelMesh,
  PrimitiveMesh,
  RenderFace,
  RenderTarget,
  Scene,
  Script,
  Shader,
  TextRenderer,
  Texture2D,
  TextureFilterMode,
  TextureFormat,
  TextureWrapMode,
  UnlitMaterial,
  Vector2,
  Vector3,
  Vector4,
  type Engine
} from "@galacean/engine";
import type { AgentViewImage } from "@galacean/engine-ai-chat/ai-chat/agent-types";
import type { ViewAnnotation, ViewPoint } from "./SeedWorldViewSnapshot";

export const PHOTO_WORKSPACE_LAYER = Layer.Layer25;
const WORKSPACE_UNIT_SCALE = 0.001;

let cachedShutterWavDataUrl: string | undefined;

/** Synthesize a deterministic, crisp 95ms mechanical camera shutter click as a 16-bit mono PCM WAV data URL. */
function getShutterWavDataUrl(): string {
  if (cachedShutterWavDataUrl) return cachedShutterWavDataUrl;
  const sampleRate = 22050;
  const durationSeconds = 0.095;
  const numSamples = Math.floor(sampleRate * durationSeconds);
  const dataSize = numSamples * 2;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  const writeAscii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) bytes[offset + i] = text.charCodeAt(i);
  };
  writeAscii(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeAscii(8, "WAVE");
  writeAscii(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeAscii(36, "data");
  view.setUint32(40, dataSize, true);

  let seed = 0x51a7f3c9;
  let prevNoise = 0;
  const fadeOutSamples = Math.max(1, Math.floor(sampleRate * 0.003));
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const rawNoise = (seed / 0xffffffff) * 2 - 1;
    const hpNoise = rawNoise - prevNoise * 0.45;
    prevNoise = rawNoise;

    // Stage 1 (0ms): crisp shutter release snap.
    let sample =
      hpNoise * Math.exp(-t / 0.0085) * 0.68 + Math.sin(2 * Math.PI * 2450 * t) * Math.exp(-t / 0.0045) * 0.24;
    // Stage 2 (26ms): gentle shutter curtain close click.
    if (t >= 0.026) {
      const dt = t - 0.026;
      sample +=
        hpNoise * Math.exp(-dt / 0.011) * 0.38 + Math.sin(2 * Math.PI * 1350 * dt) * Math.exp(-dt / 0.007) * 0.2;
    }
    const tail = numSamples - i;
    if (tail < fadeOutSamples) sample *= tail / fadeOutSamples;
    const clamped = Math.max(-1, Math.min(1, sample));
    view.setInt16(44 + i * 2, Math.round(clamped * 32767), true);
  }

  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
  cachedShutterWavDataUrl = `data:audio/wav;base64,${btoa(binary)}`;
  return cachedShutterWavDataUrl;
}

function tagWorkspaceHierarchy(entity: Entity, layer: Layer): void {
  const stack: Entity[] = [entity];
  while (stack.length > 0) {
    const current = stack.pop()!;
    current.layer = layer;
    for (let i = 0; i < current.children.length; i++) stack.push(current.children[i]);
  }
  for (const renderer of entity.getComponentsIncludeChildren(MeshRenderer, [])) {
    renderer.castShadows = false;
    renderer.receiveShadows = false;
  }
}

export function inkColor(hex: string): Color {
  const value = parseInt(hex.slice(1), 16);
  return new Color(
    Color.gammaToLinearSpace(((value >> 16) & 255) / 255),
    Color.gammaToLinearSpace(((value >> 8) & 255) / 255),
    Color.gammaToLinearSpace((value & 255) / 255),
    1
  );
}

/** Rounded ink is actual engine triangle geometry, both on the paper and in exported attachments. */
export function strokeMesh(
  engine: Engine,
  marks: readonly Pick<ViewAnnotation, "points" | "width">[],
  project: (x: number, y: number) => Vector3,
  separateMarks = false
): ModelMesh {
  const positions: Vector3[] = [],
    indices: number[] = [];
  const ranges: { start: number; count: number }[] = [];
  const triangle = (a: number, b: number, c: number) => indices.push(a, b, c);
  for (const mark of marks) {
    const startIndex = indices.length;
    const radius = mark.width / 2;
    // Freehand export paths (separateMarks = true) get spline smoothing; geometric UI icons stay crisp.
    const markPoints =
      separateMarks && mark.points.length > 2
        ? smoothPolyline(mark.points, Math.max(1.5, mark.width * 0.65))
        : mark.points;
    const vertex = (x: number, y: number) => {
      const point = project(x, y);
      // Later strokes remain on top even when materials are batched by color.
      if (separateMarks) point.z += ranges.length * 0.0001;
      return point;
    };
    for (let i = 0; i < markPoints.length; i++) {
      const p = markPoints[i],
        base = positions.length;
      positions.push(vertex(p.x, p.y));
      for (let j = 0; j < 10; j++) {
        const a = (j * Math.PI) / 5;
        positions.push(vertex(p.x + Math.cos(a) * radius, p.y + Math.sin(a) * radius));
        triangle(base, base + 1 + j, base + 1 + ((j + 1) % 10));
      }
      if (!i) continue;
      const prev = markPoints[i - 1],
        dx = p.x - prev.x,
        dy = p.y - prev.y,
        length = Math.hypot(dx, dy);
      if (!length) continue;
      const nx = (-dy / length) * radius,
        ny = (dx / length) * radius,
        start = positions.length;
      positions.push(
        vertex(prev.x + nx, prev.y + ny),
        vertex(prev.x - nx, prev.y - ny),
        vertex(p.x + nx, p.y + ny),
        vertex(p.x - nx, p.y - ny)
      );
      triangle(start, start + 1, start + 2);
      triangle(start + 2, start + 1, start + 3);
    }
    ranges.push({ start: startIndex, count: indices.length - startIndex });
  }
  const mesh = new ModelMesh(engine, "Freehand ink triangles");
  if (!positions.length) positions.push(new Vector3());
  mesh.setPositions(positions);
  mesh.setIndices(new Uint32Array(indices));
  if (separateMarks) for (const range of ranges) mesh.addSubMesh(range.start, range.count);
  else mesh.addSubMesh(0, indices.length);
  mesh.bounds.min.set(-100000, -100000, -100000);
  mesh.bounds.max.set(100000, 100000, 100000);
  mesh.uploadData(true);
  return mesh;
}
export function flatMaterial(engine: Engine, color: Color): UnlitMaterial {
  const material = new UnlitMaterial(engine);
  material.renderFace = RenderFace.Double;
  material.baseColor = color;
  return material;
}

/** Build a unit quad mesh with exact [0, 1] UVs (top-left origin); corners & borders run in shader SDF. */
function unitViewportQuadMesh(engine: Engine): ModelMesh {
  const mesh = new ModelMesh(engine, "Markup viewport");
  mesh.setPositions([
    new Vector3(-0.5, 0.5, 0),
    new Vector3(0.5, 0.5, 0),
    new Vector3(-0.5, -0.5, 0),
    new Vector3(0.5, -0.5, 0)
  ]);
  mesh.setUVs([new Vector2(0, 0), new Vector2(1, 0), new Vector2(0, 1), new Vector2(1, 1)]);
  mesh.setIndices(new Uint16Array([0, 2, 1, 1, 2, 3]));
  mesh.addSubMesh(0, 6);
  mesh.bounds.min.set(-0.5, -0.5, -1);
  mesh.bounds.max.set(0.5, 0.5, 1);
  mesh.uploadData(true);
  return mesh;
}

class PhotoFrame extends Script {
  tick?: (dt: number) => void;
  onUpdate(dt: number): void {
    this.tick?.(dt);
  }
}

export class PhotoGraphics {
  readonly scene: Scene;
  readonly workspaceRoot: Entity;
  readonly camera: Camera;
  readonly font: Font;
  readonly backdrop: MeshRenderer;
  readonly status: TextRenderer;
  readonly closeButtonTexture: Texture2D;
  readonly emptyStrokeMaskTexture: Texture2D;
  private readonly shutterAudio: AudioSource;
  private shutterClipLoading?: Promise<AudioClip | undefined>;
  private readonly strokeFieldScene: Scene;
  private readonly strokeFieldCamera: Camera;
  private readonly strokeFieldRenderer: MeshRenderer;
  private readonly strokeFieldMaterial: Material;
  private loading?: Promise<void>;
  private disposed = false;
  warmingUp = false;
  private readonly resources: Array<ModelMesh | BaseMaterial | Texture2D> = [];
  constructor(
    readonly engine: Engine,
    readonly canvas: HTMLCanvasElement,
    private readonly worldCamera: Camera,
    tick: (dt: number) => void,
    readonly budget?: ImageResourceBudget
  ) {
    this.scene = worldCamera.scene!;
    this.worldCamera.cullingMask = (this.worldCamera.cullingMask & ~PHOTO_WORKSPACE_LAYER) as Layer;
    this.workspaceRoot = this.scene.createRootEntity("Photo workspace");
    this.workspaceRoot.layer = PHOTO_WORKSPACE_LAYER;
    this.workspaceRoot.transform.setScale(WORKSPACE_UNIT_SCALE, WORKSPACE_UNIT_SCALE, WORKSPACE_UNIT_SCALE);
    const view = this.scene.createRootEntity("Photo workspace view");
    view.layer = PHOTO_WORKSPACE_LAYER;
    this.camera = view.addComponent(Camera);
    this.camera.isOrthographic = true;
    this.camera.nearClipPlane = 0.01;
    this.camera.farClipPlane = 4;
    this.camera.priority = 20;
    this.camera.cullingMask = PHOTO_WORKSPACE_LAYER;
    this.camera.clearFlags = CameraClearFlags.Depth;
    this.camera.enableHDR = this.camera.enablePostProcess = false;
    view.addComponent(PhotoFrame).tick = tick;
    this.font = Font.createFromOS(engine, '"PingFang SC", "Microsoft YaHei", sans-serif')!;
    this.closeButtonTexture = createCloseButtonTexture(engine);
    this.emptyStrokeMaskTexture = createEmptyStrokeMaskTexture(engine);
    this.resources.push(this.closeButtonTexture, this.emptyStrokeMaskTexture);

    // Non-spatial UI shutter sound driven by Galacean Engine's AudioSource + AudioManager.
    const shutterEntity = this.workspaceRoot.createChild("Photo shutter audio");
    this.shutterAudio = shutterEntity.addComponent(AudioSource);
    this.shutterAudio.playOnEnabled = false;
    this.shutterAudio.loop = false;
    this.shutterAudio.spatial = false;
    this.shutterAudio.volume = 0.24;

    // Dedicated offscreen scene for BlendOperation.Max capsule SDF accumulation (isolated from main scene background/lights).
    this.strokeFieldScene = new Scene(engine, "Photo stroke field");
    this.strokeFieldScene.background.mode = BackgroundMode.SolidColor;
    this.strokeFieldScene.background.solidColor.set(0, 0, 0, 0);
    const strokeCamEntity = this.strokeFieldScene.createRootEntity("Stroke field camera");
    this.strokeFieldCamera = strokeCamEntity.addComponent(Camera);
    this.strokeFieldCamera.isOrthographic = true;
    this.strokeFieldCamera.nearClipPlane = 0.1;
    this.strokeFieldCamera.farClipPlane = 50;
    this.strokeFieldCamera.clearFlags = CameraClearFlags.Color;
    this.strokeFieldCamera.enableHDR = this.strokeFieldCamera.enablePostProcess = false;
    this.strokeFieldCamera.enableFrustumCulling = false;
    this.strokeFieldCamera.enabled = false;
    this.strokeFieldRenderer = this.strokeFieldScene
      .createRootEntity("Stroke field capsules")
      .addComponent(MeshRenderer);
    this.strokeFieldRenderer.castShadows = false;
    this.strokeFieldRenderer.receiveShadows = false;
    this.strokeFieldMaterial = new Material(engine, ensureMarkupStrokeFieldShader());
    this.strokeFieldRenderer.setMaterial(this.strokeFieldMaterial);

    this.backdrop = this.quad("Editing backdrop", new Color(0.0052, 0.0086, 0.0097, 0));
    (this.backdrop.getMaterial() as UnlitMaterial).isTransparent = true;
    this.backdrop.entity.isActive = false;
    this.status = this.text("Photo status", "", 13);
    tagWorkspaceHierarchy(this.workspaceRoot, PHOTO_WORKSPACE_LAYER);
    this.resize();
  }
  private ensureShutterClip(): Promise<AudioClip | undefined> {
    if (this.disposed || this.shutterAudio.destroyed) return Promise.resolve(undefined);
    if (this.shutterAudio.clip) return Promise.resolve(this.shutterAudio.clip);
    if (!this.engine.resourceManager?.load) return Promise.resolve(undefined);
    if (this.shutterClipLoading) return this.shutterClipLoading;
    let loadPromise: PromiseLike<AudioClip>;
    try {
      loadPromise = this.engine.resourceManager.load<AudioClip>({
        url: getShutterWavDataUrl(),
        type: AssetType.Audio
      });
    } catch {
      return Promise.resolve(undefined);
    }
    const task: Promise<AudioClip | undefined> = Promise.resolve(loadPromise).then(
      (clip) => {
        if (this.shutterClipLoading === task) this.shutterClipLoading = undefined;
        if (!clip || this.disposed || this.shutterAudio.destroyed) return undefined;
        this.shutterAudio.clip = clip;
        return clip;
      },
      () => {
        if (this.shutterClipLoading === task) this.shutterClipLoading = undefined;
        return undefined;
      }
    );
    this.shutterClipLoading = task;
    return task;
  }
  /** Play a crisp shutter click via the Engine AudioSource component; safe to call inside a user click gesture. */
  playShutter(): void {
    if (this.disposed || this.shutterAudio.destroyed) return;
    if (this.shutterAudio.clip) {
      this.shutterAudio.stop();
      this.shutterAudio.play(0);
      return;
    }
    // Capture the active user gesture immediately so iOS Safari unlocks audio while the clip decodes.
    void AudioManager.resume().catch(() => {});
    void this.ensureShutterClip().then((clip) => {
      if (!clip || this.disposed || this.shutterAudio.destroyed) return;
      this.shutterAudio.stop();
      this.shutterAudio.play(0);
    });
  }
  tagWorkspaceEntity(entity: Entity): void {
    tagWorkspaceHierarchy(entity, PHOTO_WORKSPACE_LAYER);
  }
  renderStrokeField(target: RenderTarget, imageWidth: number, imageHeight: number, mesh: ModelMesh): void {
    if (this.disposed) return;
    const width = Math.max(1, imageWidth);
    const height = Math.max(1, imageHeight);
    this.strokeFieldCamera.orthographicSize = height * 0.5;
    this.strokeFieldCamera.aspectRatio = width / height;
    this.strokeFieldCamera.entity.transform.setPosition(width * 0.5, -height * 0.5, 10);
    this.strokeFieldCamera.renderTarget = target;
    this.strokeFieldRenderer.mesh = mesh;
    this.engine.sceneManager.addScene(this.strokeFieldScene);
    try {
      this.strokeFieldCamera.render();
    } finally {
      this.engine.sceneManager.removeScene(this.strokeFieldScene);
      this.strokeFieldCamera.renderTarget = null;
      this.strokeFieldRenderer.mesh = null!;
    }
  }
  prepare(): Promise<void> {
    return (this.loading ??= (async () => {
      if (this.disposed) throw new DOMException("Photo workspace disposed", "AbortError");
      void this.ensureShutterClip();
      const texture = new Texture2D(this.engine, 1, 1, TextureFormat.R8G8B8A8_UNorm, false, true);
      texture.setPixelBuffer(new Uint8Array([255, 255, 255, 255]));
      let surface: PhotoSurface | undefined;
      let strokeWarmupMesh: ModelMesh | undefined;
      let strokeWarmupTex: Texture2D | undefined;
      let strokeWarmupTarget: RenderTarget | undefined;
      try {
        surface = new PhotoSurface(this, {
          texture,
          width: 1,
          height: 1,
          export: async () => {
            throw new Error("Warmup image cannot be exported");
          },
          dispose() {}
        });
        surface.setFrameLayout(64, 64, 12, 0);
        surface.setCloseOpacity(1);
        this.warmingUp = true;
        await warmupPhotoPresentation(
          this.camera,
          () => {
            surface!.root.isActive = true;
            this.backdrop.entity.isActive = true;
            try {
              this.camera.render();
              surface!.setOpacity(0.5);
              this.camera.render();
            } finally {
              surface!.root.isActive = false;
              this.backdrop.entity.isActive = false;
            }
          },
          () => this.disposed,
          this.budget,
          [this.workspaceRoot]
        );
        if (this.disposed) throw new DOMException("Photo workspace disposed", "AbortError");
        // Precompile and draw the offscreen BlendOperation.Max stroke field shader so first paint has zero stalls.
        strokeWarmupMesh = buildStrokeFieldMesh(this.engine, [
          {
            ax: 16,
            ay: 32,
            bx: 48,
            by: 32,
            radiusStart: 6,
            radiusEnd: 6,
            tipStart: 0,
            tipEnd: 1,
            arcStart: 0,
            arcEnd: 1
          }
        ]);
        strokeWarmupTex = new Texture2D(this.engine, 64, 64, TextureFormat.R8G8B8A8_UNorm, false, false);
        strokeWarmupTarget = new RenderTarget(this.engine, 64, 64, strokeWarmupTex, null, 1);
        this.strokeFieldCamera.orthographicSize = 32;
        this.strokeFieldCamera.aspectRatio = 1;
        this.strokeFieldCamera.entity.transform.setPosition(32, -32, 10);
        this.strokeFieldCamera.renderTarget = strokeWarmupTarget;
        this.strokeFieldRenderer.mesh = strokeWarmupMesh;
        await warmupSeedWorldRendererVariants(
          this.engine,
          this.strokeFieldScene,
          this.strokeFieldCamera,
          this.strokeFieldScene.rootEntities,
          { strict: true }
        );
        if (this.disposed) throw new DOMException("Photo workspace disposed", "AbortError");
        this.renderStrokeField(strokeWarmupTarget, 64, 64, strokeWarmupMesh);
      } catch (error) {
        if (this.disposed) throw new DOMException("Photo workspace disposed", "AbortError");
        throw error;
      } finally {
        this.warmingUp = false;
        if (!this.disposed && !this.strokeFieldCamera.destroyed) {
          this.strokeFieldCamera.renderTarget = null;
        }
        if (!this.disposed && !this.strokeFieldRenderer.destroyed) {
          this.strokeFieldRenderer.mesh = null!;
        }
        destroyOwnedMesh(strokeWarmupMesh);
        destroyPhotoResources([strokeWarmupTarget, strokeWarmupTex]);
        surface?.dispose();
        texture.destroy(true);
        if (!this.disposed) this.backdrop.entity.isActive = false;
      }
    })());
  }
  resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    this.camera.orthographicSize = (rect.height / 2) * WORKSPACE_UNIT_SCALE;
    this.camera.entity.transform.setPosition(
      (rect.width / 2) * WORKSPACE_UNIT_SCALE,
      (-rect.height / 2) * WORKSPACE_UNIT_SCALE,
      2000 * WORKSPACE_UNIT_SCALE
    );
    this.backdrop.entity.transform.setPosition(rect.width / 2, -rect.height / 2, 100);
    this.backdrop.entity.transform.setScale(rect.width, rect.height, 1);
    this.status.entity.transform.setPosition(rect.width / 2, -rect.height + 36, 500);
  }
  text(name: string, value: string, size: number, parent?: Entity): TextRenderer {
    const entity = (parent ?? this.workspaceRoot).createChild(name);
    entity.layer = PHOTO_WORKSPACE_LAYER;
    const text = entity.addComponent(TextRenderer);
    text.font = this.font;
    text.fontSize = size;
    text.text = value;
    entity.transform.setScale(100, 100, 100);
    return text;
  }
  quad(name: string, color: Color, parent?: Entity): MeshRenderer {
    const entity = (parent ?? this.workspaceRoot).createChild(name);
    entity.layer = PHOTO_WORKSPACE_LAYER;
    const renderer = entity.addComponent(MeshRenderer),
      mesh = PrimitiveMesh.createCuboid(this.engine, 1, 1, 0.001);
    const material = flatMaterial(this.engine, color);
    renderer.mesh = mesh;
    renderer.setMaterial(material);
    renderer.castShadows = false;
    renderer.receiveShadows = false;
    this.resources.push(mesh, material);
    return renderer;
  }
  async create(image: PhotoImage): Promise<PhotoSurface> {
    await this.prepare();
    if (this.disposed) throw new DOMException("Photo workspace disposed", "AbortError");
    const surface = new PhotoSurface(this, image);
    try {
      return surface;
    } catch (error) {
      surface.dispose();
      throw error;
    }
  }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (!this.shutterAudio.destroyed) {
      this.shutterAudio.stop();
      this.shutterAudio.clip = null;
    }
    this.shutterClipLoading = undefined;
    if (!this.worldCamera.destroyed) {
      this.worldCamera.cullingMask = (this.worldCamera.cullingMask | PHOTO_WORKSPACE_LAYER) as Layer;
    }
    if (!this.strokeFieldCamera.destroyed) {
      this.strokeFieldCamera.renderTarget = null;
    }
    if (!this.strokeFieldRenderer.destroyed) {
      this.strokeFieldRenderer.mesh = null!;
    }
    this.engine.sceneManager.removeScene(this.strokeFieldScene);
    this.strokeFieldScene.ambientLight.destroy(true);
    this.strokeFieldScene.destroy();
    this.strokeFieldMaterial.destroy(true);
    this.workspaceRoot.destroy();
    this.camera.entity.destroy();
    this.resources.forEach((resource) =>
      resource instanceof ModelMesh ? destroyOwnedMesh(resource) : resource.destroy(true)
    );
  }
}

const MARKUP_VIEWPORT_SHADER_NAME = "SeedWorld/MarkupViewportV1";
const MARKUP_STROKE_FIELD_SHADER_NAME = "SeedWorld/MarkupStrokeFieldV1";
const STROKE_MASK_MAX_DIM = 1024;
const STROKE_GLOW_PADDING_SCALE = 6.85;
const CLOSE_BUTTON_SIZE = 34;
const CLOSE_BUTTON_INSET = 14;
const CLOSE_BUTTON_HIT_RADIUS = 26;

function smoothstep01(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / Math.max(1e-5, edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/** Generate an organic hand-drawn circular hint polyline in image pixels (near-circular on both landscape & portrait). */
function buildOnboardingHintPoints(imageWidth: number, imageHeight: number, progress: number): ViewPoint[] {
  const p = Math.max(0, Math.min(1, progress));
  const shortSide = Math.max(1, Math.min(imageWidth, imageHeight));
  const baseRadius = Math.max(24, shortSide * 0.25);
  const rx = baseRadius * 1.05;
  const ry = baseRadius * 0.96;
  const cx = imageWidth * 0.5;
  const cy = imageHeight * 0.48;
  // Gentle -8 deg tilt matching a natural right-handed freehand circle.
  const cosT = 0.990268;
  const sinT = 0.139173;
  const startAngle = 2.15;
  const totalArc = Math.PI * 2 * 1.04;
  const drawnArc = p * totalArc;
  const steps = Math.max(1, Math.ceil(p * 64));
  const points: ViewPoint[] = [];
  for (let i = 0; i <= steps; i++) {
    const ang = (i / steps) * drawnArc;
    const theta = startAngle - ang;
    const wobble = 1.0 + 0.032 * Math.sin(theta * 2.0 + 0.65) + 0.016 * Math.cos(theta * 3.0 - 0.3);
    const qx = Math.cos(theta) * rx * wobble;
    const qy = Math.sin(theta) * ry * wobble;
    // Rotate by -8 deg in +Y-up space, then map to image pixels (+Y down).
    const relX = qx * cosT + qy * sinT;
    const relY = -qx * sinT + qy * cosT;
    points.push({ x: cx + relX, y: cy - relY });
  }
  return points;
}

export interface PhotoStrokePaintOptions {
  readonly activeStrokeIndex?: number;
}

function createEmptyStrokeMaskTexture(engine: Engine): Texture2D {
  const texture = new Texture2D(engine, 1, 1, TextureFormat.R8G8B8A8_UNorm, false, false);
  texture.isGCIgnored = true;
  texture.wrapModeU = TextureWrapMode.Clamp;
  texture.wrapModeV = TextureWrapMode.Clamp;
  texture.filterMode = TextureFilterMode.Bilinear;
  texture.setPixelBuffer(new Uint8Array([0, 0, 0, 0]));
  return texture;
}

function strokeMaskDimensions(imageWidth: number, imageHeight: number): { width: number; height: number } {
  const w = Math.max(1, Math.round(imageWidth));
  const h = Math.max(1, Math.round(imageHeight));
  const maxDim = Math.max(w, h);
  if (maxDim <= STROKE_MASK_MAX_DIM) {
    return { width: Math.max(16, w), height: Math.max(16, h) };
  }
  const ratio = STROKE_MASK_MAX_DIM / maxDim;
  return {
    width: Math.max(16, Math.round(w * ratio)),
    height: Math.max(16, Math.round(h * ratio))
  };
}

/** Build quad-expanded tapered capsule geometry for the GPU BlendOperation.Max SDF field pass. */
function buildStrokeFieldMesh(engine: Engine, segments: readonly CapsuleSegmentVertexData[]): ModelMesh {
  const mesh = new ModelMesh(engine, "Markup stroke SDF capsules");
  const positions: Vector3[] = [];
  const uv0: Vector2[] = [];
  const uv1: Vector2[] = [];
  const colors: Color[] = [];
  const indices: number[] = [];

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const dx = seg.bx - seg.ax;
    const dy = seg.by - seg.ay;
    const len = Math.hypot(dx, dy);
    const tx = len > 1e-4 ? dx / len : 1;
    const ty = len > 1e-4 ? dy / len : 0;
    const nx = -ty;
    const ny = tx;

    const r0 = Math.max(0.5, seg.radiusStart);
    const r1 = Math.max(0.5, seg.radiusEnd);
    const invR0 = 1 / r0;
    const pad = Math.max(r0, r1) * STROKE_GLOW_PADDING_SCALE;
    const segInfo = new Vector2(len * invR0, r1 * invR0);
    const meta = new Color(seg.tipStart, seg.tipEnd, 0, (seg.arcStart + seg.arcEnd) * 0.5);

    const base = positions.length;
    const corners: readonly [number, number][] = [
      [-pad, -pad],
      [len + pad, -pad],
      [-pad, pad],
      [len + pad, pad]
    ];
    for (let c = 0; c < 4; c++) {
      const [u, v] = corners[c];
      const px = seg.ax + u * tx + v * nx;
      const py = seg.ay + u * ty + v * ny;
      positions.push(new Vector3(px, -py, 0));
      uv0.push(new Vector2(u * invR0, v * invR0));
      uv1.push(segInfo);
      colors.push(meta);
    }
    indices.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
  }

  if (!positions.length) {
    positions.push(new Vector3());
    uv0.push(new Vector2());
    uv1.push(new Vector2());
    colors.push(new Color(0, 0, 0, 0));
  }
  mesh.setPositions(positions);
  mesh.setUVs(uv0, 0);
  mesh.setUVs(uv1, 1);
  mesh.setColors(colors);
  mesh.setIndices(positions.length > 65535 ? new Uint32Array(indices) : new Uint16Array(indices));
  mesh.addSubMesh(0, indices.length);
  mesh.bounds.min.set(-100000, -100000, -1);
  mesh.bounds.max.set(100000, 100000, 1);
  mesh.uploadData(true);
  return mesh;
}

function createCloseButtonTexture(engine: Engine): Texture2D {
  const size = 128;
  const texture = new Texture2D(engine, size, size, TextureFormat.R8G8B8A8_UNorm, false, true);
  if (typeof document !== "undefined") {
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      const c = size * 0.5;
      const radius = size * 0.42;
      ctx.clearRect(0, 0, size, size);

      // Soft translucent frosted dark circle with subtle depth shadow
      ctx.save();
      ctx.shadowColor = "rgba(0, 0, 0, 0.34)";
      ctx.shadowBlur = 10;
      ctx.shadowOffsetY = 2;
      ctx.beginPath();
      ctx.arc(c, c, radius, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(16, 20, 28, 0.54)";
      ctx.fill();
      ctx.restore();

      // Ultra-thin frosted white hairline rim
      ctx.beginPath();
      ctx.arc(c, c, radius - 1.5, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(255, 255, 255, 0.38)";
      ctx.lineWidth = 3;
      ctx.stroke();

      // Crisp centered white × with rounded stroke caps
      const arm = size * 0.145;
      ctx.beginPath();
      ctx.moveTo(c - arm, c - arm);
      ctx.lineTo(c + arm, c + arm);
      ctx.moveTo(c + arm, c - arm);
      ctx.lineTo(c - arm, c + arm);
      ctx.strokeStyle = "rgba(255, 255, 255, 0.96)";
      ctx.lineWidth = 7.2;
      ctx.lineCap = "round";
      ctx.stroke();

      texture.setImageSource(canvas);
      return texture;
    }
  }
  texture.setPixelBuffer(new Uint8Array(size * size * 4));
  return texture;
}

function ensureMarkupViewportShader(): Shader {
  return Shader.find(MARKUP_VIEWPORT_SHADER_NAME) ?? Shader.create(markupViewportSource);
}

function ensureMarkupStrokeFieldShader(): Shader {
  return Shader.find(MARKUP_STROKE_FIELD_SHADER_NAME) ?? Shader.create(markupStrokeFieldSource);
}

/** Procedural frozen-viewport markup canvas driven by a single static quad + GPU SDF & Apple Intelligence brush shader. */
export class PhotoSurface {
  readonly root: Entity;
  readonly material: Material;
  readonly texture: Texture2D;
  private readonly viewportRenderer: MeshRenderer;
  private readonly viewportMesh: ModelMesh;
  private readonly closeRenderer: MeshRenderer;
  private readonly closeMaterial: UnlitMaterial;
  private readonly viewportRect = new Vector4(2, 2, 0, 0);
  private readonly markupParams = new Vector4(1, 1, 0, 0);
  private readonly brushParams = new Vector4(0, 0, 0, 0);
  private strokeMaskTexture?: Texture2D;
  private strokeMaskTarget?: RenderTarget;
  private _hasUserMarks = false;
  private hintRenderedProgress = -1;
  private hintRenderedTipEnergy = -1;
  layoutWidth = 1;
  layoutHeight = 1;
  private opacity = 1;
  private rimOpacity = 1;
  private closeOpacity = 0;
  private disposed = false;
  constructor(
    private readonly graphics: PhotoGraphics,
    readonly image: PhotoImage
  ) {
    const { engine } = graphics;
    const cleanup: (() => void)[] = [];
    try {
      this.root = graphics.workspaceRoot.createChild("Screen markup viewport");
      cleanup.push(() => this.root.destroy());

      // Single unit quad uploaded ONCE; rounded corners, hairline border, onboarding circle and Apple Intelligence strokes run in GPU shader.
      this.viewportMesh = unitViewportQuadMesh(engine);
      cleanup.push(() => destroyOwnedMesh(this.viewportMesh));
      this.viewportRenderer = this.root.createChild("Frozen viewport image").addComponent(MeshRenderer);
      this.material = new Material(engine, ensureMarkupViewportShader());
      cleanup.push(() => this.material.destroy(true));
      this.texture = image.texture;
      this.material.shaderData.setTexture("material_BaseTexture", this.texture);
      this.material.shaderData.setTexture("material_StrokeMaskTexture", graphics.emptyStrokeMaskTexture);
      this.material.shaderData.setVector4("material_ViewportRect", this.viewportRect);
      this.material.shaderData.setVector4("material_MarkupParams", this.markupParams);
      this.material.shaderData.setVector4("material_BrushParams", this.brushParams);
      this.viewportRenderer.mesh = this.viewportMesh;
      this.viewportRenderer.setMaterial(this.material);

      // Sleek top-left circular × delete button rendered cleanly above viewport & strokes (z = +4.5).
      this.closeRenderer = this.root.createChild("Markup delete button").addComponent(MeshRenderer);
      this.closeMaterial = new UnlitMaterial(engine);
      cleanup.push(() => this.closeMaterial.destroy(true));
      this.closeMaterial.renderFace = RenderFace.Double;
      this.closeMaterial.isTransparent = true;
      this.closeMaterial.baseTexture = graphics.closeButtonTexture;
      this.closeMaterial.baseColor.set(1, 1, 1, 0);
      this.closeRenderer.mesh = this.viewportMesh;
      this.closeRenderer.setMaterial(this.closeMaterial);
      this.closeRenderer.entity.transform.setScale(CLOSE_BUTTON_SIZE, CLOSE_BUTTON_SIZE, 1);
      this.closeRenderer.entity.isActive = false;

      graphics.tagWorkspaceEntity(this.root);
      this.root.isActive = false;
    } catch (error) {
      for (const dispose of cleanup.reverse()) dispose();
      throw error;
    }
  }
  /** Whether the stroke mask contains user marks, including an in-progress stroke. */
  get hasUserMarks(): boolean {
    return this._hasUserMarks;
  }

  private ensureStrokeMaskTarget(): RenderTarget {
    if (this.strokeMaskTarget && this.strokeMaskTexture) return this.strokeMaskTarget;
    // Bounded UI render cache (at most maxPhotos live surfaces, <= 1024px each); intentionally decoupled
    // from ImageResourceBudget so synchronous freehand drawing never stalls or fails on image-budget accounting.
    const { width, height } = strokeMaskDimensions(this.image.width, this.image.height);
    let texture: Texture2D | undefined;
    try {
      texture = new Texture2D(this.graphics.engine, width, height, TextureFormat.R8G8B8A8_UNorm, false, false);
      texture.isGCIgnored = true;
      texture.wrapModeU = TextureWrapMode.Clamp;
      texture.wrapModeV = TextureWrapMode.Clamp;
      texture.filterMode = TextureFilterMode.Bilinear;
      const target = new RenderTarget(this.graphics.engine, width, height, texture, null, 1);
      // The camera unbinds between strokes; the surface owns both resources until dispose().
      target.isGCIgnored = true;
      this.strokeMaskTexture = texture;
      this.strokeMaskTarget = target;
      return target;
    } catch (error) {
      texture?.destroy(true);
      throw error;
    }
  }
  private closeCenter(): { x: number; y: number } {
    return {
      x: -this.layoutWidth * 0.5 + CLOSE_BUTTON_INSET + CLOSE_BUTTON_SIZE * 0.5,
      y: this.layoutHeight * 0.5 - CLOSE_BUTTON_INSET - CLOSE_BUTTON_SIZE * 0.5
    };
  }
  /** Zero-allocation uniform update for silky 60/120fps animated corner radius & 4-edge inset transitions. */
  setFrameLayout(width: number, height: number, cornerRadius: number, borderInset: number): void {
    const w = Math.max(2, width);
    const h = Math.max(2, height);
    const r = Math.max(0, cornerRadius);
    const inset = Math.max(0, borderInset);
    this.layoutWidth = w;
    this.layoutHeight = h;
    this.viewportRenderer.entity.transform.setScale(w, h, 1);
    const closePos = this.closeCenter();
    this.closeRenderer.entity.transform.setPosition(closePos.x, closePos.y, 4.5);
    this.viewportRect.set(w, h, r, inset);
    this.material.shaderData.setVector4("material_ViewportRect", this.viewportRect);
  }
  setRimOpacity(value: number): void {
    this.rimOpacity = Math.max(0, Math.min(1, value));
    this.markupParams.y = this.rimOpacity;
    this.material.shaderData.setVector4("material_MarkupParams", this.markupParams);
  }
  setCloseOpacity(value: number): void {
    this.closeOpacity = Math.max(0, Math.min(1, value));
    const effective = this.closeOpacity * this.opacity;
    this.closeMaterial.baseColor.a = effective;
    this.closeRenderer.entity.isActive = effective > 0.01;
  }
  isCloseButtonHit(localX: number, localY: number): boolean {
    if (this.closeOpacity < 0.25) return false;
    const center = this.closeCenter();
    return Math.hypot(localX - center.x, localY - center.y) <= CLOSE_BUTTON_HIT_RADIUS;
  }
  /** Render the onboarding hint circle through the exact same BlendOperation.Max SDF brush pipeline as freehand strokes. */
  setHintLoop(progress: number, alpha: number): void {
    if (this.disposed) return;
    const p = Math.max(0, Math.min(1, progress));
    const a = Math.max(0, Math.min(1, alpha));
    if (this.hasUserMarks) {
      this.hintRenderedProgress = -1;
      this.hintRenderedTipEnergy = -1;
      return;
    }
    if (p <= 0.005 || a <= 0.002) {
      this.hintRenderedProgress = -1;
      this.hintRenderedTipEnergy = -1;
      this.brushParams.y = 0;
      this.material.shaderData.setTexture("material_StrokeMaskTexture", this.graphics.emptyStrokeMaskTexture);
      this.material.shaderData.setVector4("material_BrushParams", this.brushParams);
      return;
    }
    const tipEnergy = p < 1 ? (1 - smoothstep01(0.84, 1.0, p)) * smoothstep01(0.0, 0.06, p) : 0;
    const needsBake =
      this.hintRenderedProgress < 0 ||
      (p < 1 ? Math.abs(p - this.hintRenderedProgress) >= 0.004 : this.hintRenderedProgress < 1) ||
      Math.abs(tipEnergy - this.hintRenderedTipEnergy) >= 0.02;
    if (needsBake) {
      const points = buildOnboardingHintPoints(this.image.width, this.image.height, p);
      const scale = this.image.width / Math.max(16, this.layoutWidth);
      const segments = buildStrokeCapsuleSegments(
        [{ points, width: 3 * scale }],
        this.image.width,
        this.image.height,
        tipEnergy > 0.005 ? { activeStrokeIndex: 0, activeTipEnergy: tipEnergy } : {}
      );
      if (segments.length) {
        const target = this.ensureStrokeMaskTarget();
        const fieldMesh = buildStrokeFieldMesh(this.graphics.engine, segments);
        try {
          this.graphics.renderStrokeField(target, this.image.width, this.image.height, fieldMesh);
        } finally {
          destroyOwnedMesh(fieldMesh);
        }
        this.hintRenderedProgress = p;
        this.hintRenderedTipEnergy = tipEnergy;
      }
    }
    if (this.strokeMaskTexture && this.hintRenderedProgress > 0) {
      this.material.shaderData.setTexture("material_StrokeMaskTexture", this.strokeMaskTexture);
      this.brushParams.y = a;
      this.material.shaderData.setVector4("material_BrushParams", this.brushParams);
    }
  }
  /** Zero-allocation time advance for continuous Apple Intelligence iridescent flow and sparkle shimmer. */
  setBrushTime(timeSeconds: number): void {
    if (this.disposed) return;
    this.brushParams.x = Number.isFinite(timeSeconds) ? timeSeconds % 3600 : 0;
    this.material.shaderData.setVector4("material_BrushParams", this.brushParams);
  }
  setOpacity(value: number): void {
    value = Math.max(0, Math.min(1, value));
    if (this.opacity === value) return;
    this.opacity = value;
    this.markupParams.x = value;
    this.material.shaderData.setVector4("material_MarkupParams", this.markupParams);
    const closeAlpha = this.closeOpacity * value;
    this.closeMaterial.baseColor.a = closeAlpha;
    this.closeRenderer.entity.isActive = closeAlpha > 0.01;
  }
  /** Map image pixels (top-left origin) directly onto the pixel-exact viewport canvas. */
  point(x: number, y: number): Vector3 {
    const u = Math.max(0, Math.min(1, x / this.image.width));
    const v = Math.max(0, Math.min(1, y / this.image.height));
    return new Vector3((u - 0.5) * this.layoutWidth, (0.5 - v) * this.layoutHeight, 0);
  }
  /** Exact O(1) hit test in pixel coordinates relative to viewport center. */
  imagePoint(localX: number, localY: number): ViewPoint | undefined {
    const hw = this.layoutWidth * 0.5;
    const hh = this.layoutHeight * 0.5;
    if (Math.abs(localX) > hw || Math.abs(localY) > hh) return undefined;
    return {
      x: (localX / this.layoutWidth + 0.5) * this.image.width,
      y: (0.5 - localY / this.layoutHeight) * this.image.height
    };
  }
  paint(marks: readonly ViewAnnotation[], options?: PhotoStrokePaintOptions): void {
    if (this.disposed) return;
    this.hintRenderedProgress = -1;
    this.hintRenderedTipEnergy = -1;
    if (!marks.length) {
      this._hasUserMarks = false;
      this.brushParams.y = 0;
      this.material.shaderData.setTexture("material_StrokeMaskTexture", this.graphics.emptyStrokeMaskTexture);
      this.material.shaderData.setVector4("material_BrushParams", this.brushParams);
      return;
    }
    const segments = buildStrokeCapsuleSegments(marks, this.image.width, this.image.height, options);
    if (!segments.length) {
      this._hasUserMarks = false;
      this.brushParams.y = 0;
      this.material.shaderData.setTexture("material_StrokeMaskTexture", this.graphics.emptyStrokeMaskTexture);
      this.material.shaderData.setVector4("material_BrushParams", this.brushParams);
      return;
    }
    const target = this.ensureStrokeMaskTarget();
    const fieldMesh = buildStrokeFieldMesh(this.graphics.engine, segments);
    try {
      this.graphics.renderStrokeField(target, this.image.width, this.image.height, fieldMesh);
    } finally {
      destroyOwnedMesh(fieldMesh);
    }
    this.material.shaderData.setTexture("material_StrokeMaskTexture", this.strokeMaskTexture!);
    this.brushParams.y = 1;
    this.material.shaderData.setVector4("material_BrushParams", this.brushParams);
    this._hasUserMarks = true;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this._hasUserMarks = false;
    this.root.destroy();
    destroyOwnedMesh(this.viewportMesh);
    destroyPhotoResources([this.strokeMaskTarget, this.strokeMaskTexture]);
    this.strokeMaskTarget = undefined;
    this.strokeMaskTexture = undefined;
    this.closeMaterial.destroy(true);
    this.material.destroy(true);
  }
}

/** Export an immutable submission version, independently of UI lifetime and edits. */
export async function exportPhotoImage(
  image: PhotoImage,
  marks: readonly ViewAnnotation[],
  budget?: ImageResourceBudget,
  signal?: AbortSignal
): Promise<AgentViewImage> {
  signal?.throwIfAborted();
  const engine = image.texture.engine,
    { width, height } = image;
  const release = budget?.reserve("temporary", width * height * 24);
  const cleanup: (() => void)[] = [];
  let scene: Scene | undefined;
  let target: RenderTarget | undefined, pixelsTexture: Texture2D | undefined;
  try {
    scene = new Scene(engine, "Photo attachment export");
    cleanup.push(() => scene!.ambientLight.destroy(true));
    const view = scene.createRootEntity("Export view"),
      camera = view.addComponent(Camera);
    camera.isOrthographic = true;
    camera.orthographicSize = height / 2;
    camera.aspectRatio = width / height;
    camera.enableHDR = camera.enablePostProcess = false;
    view.transform.setPosition(width / 2, -height / 2, 10);
    pixelsTexture = new Texture2D(engine, width, height, TextureFormat.R8G8B8A8_UNorm, false);
    target = new RenderTarget(engine, width, height, pixelsTexture, TextureFormat.Depth24Stencil8, 1);
    camera.renderTarget = target;
    const imageMesh = new ModelMesh(engine);
    cleanup.push(() => destroyOwnedMesh(imageMesh));
    imageMesh.setPositions([
      new Vector3(0, 0, 0),
      new Vector3(width, 0, 0),
      new Vector3(0, -height, 0),
      new Vector3(width, -height, 0)
    ]);
    imageMesh.setUVs([new Vector2(0, 0), new Vector2(1, 0), new Vector2(0, 1), new Vector2(1, 1)]);
    imageMesh.setIndices(new Uint16Array([0, 2, 1, 1, 2, 3]));
    imageMesh.addSubMesh(0, 6);
    imageMesh.bounds.min.set(0, -height, -1);
    imageMesh.bounds.max.set(width, 0, 1);
    imageMesh.uploadData(true);
    const imageRenderer = scene.createRootEntity("Original image").addComponent(MeshRenderer),
      material = flatMaterial(engine, new Color(1, 1, 1, 1));
    cleanup.push(() => material.destroy(true));
    material.baseTexture = image.texture;
    imageRenderer.mesh = imageMesh;
    imageRenderer.setMaterial(material);
    const inkMesh = strokeMesh(engine, marks, (x, y) => new Vector3(x, -y, 1), true),
      ink = scene.createRootEntity("Annotations").addComponent(MeshRenderer);
    cleanup.push(() => destroyOwnedMesh(inkMesh));
    ink.mesh = inkMesh;
    const materials = marks.map((mark) => flatMaterial(engine, inkColor(mark.color)));
    cleanup.push(() => materials.forEach((material) => material.destroy(true)));
    ink.setMaterials(materials);
    // Export has its own scene, target and material variants. Capture/UI warmup
    // cannot prepare these. Await native asynchronous linking before the draw.
    await warmupSeedWorldRendererVariants(engine, scene, camera, scene.rootEntities, { strict: true, signal });
    signal?.throwIfAborted();
    engine.sceneManager.addScene(scene);
    try {
      camera.render();
    } finally {
      engine.sceneManager.removeScene(scene);
    }
    const data = new Uint8Array(width * height * 4);
    await pixelsTexture.getPixelBufferAsync(data, signal);
    signal?.throwIfAborted();
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d")!,
      frame = context.createImageData(width, height);
    frame.data.set(data);
    context.putImageData(frame, 0, 0);
    try {
      const encoded = await encodeImage(canvas);
      signal?.throwIfAborted();
      return encoded;
    } finally {
      canvas.width = canvas.height = 0;
    }
  } finally {
    if (scene) {
      engine.sceneManager.removeScene(scene);
      scene.destroy();
    }
    for (const dispose of cleanup.reverse()) dispose();
    destroyPhotoResources([target, pixelsTexture], release);
  }
}
