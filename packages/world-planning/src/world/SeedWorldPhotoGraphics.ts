import { SeedWorldLiquidGlassUiMaterial } from "@galacean/engine-modify/rendering/LiquidGlassPostProcessPass";
import { destroyOwnedMesh } from "@galacean/engine-modify/geometry/destroyOwnedMesh";
import markupViewportSource from "./MarkupViewport.shader?raw";
import markupStrokeFieldSource from "./MarkupStrokeField.shader?raw";
import { destroyPhotoResources } from "./SeedWorldPhotoResources";
import { warmupPhotoPresentation } from "./SeedWorldPhotoWarmup";
import { warmupSeedWorldRendererVariants } from "./SeedWorldShaderWarmup";
import { buildStrokeCapsuleSegments, smoothPolyline, type CapsuleSegmentVertexData } from "./SeedWorldStrokeSmoothing";
import type { PhotoImage } from "./SeedWorldPhotoImage";
import { encodeImage, type ImageResourceBudget } from "@galacean/engine-ai-chat/ai-chat/image-resources";
import {
  BackgroundMode,
  BaseMaterial,
  Camera,
  CameraClearFlags,
  Color,
  Entity,
  Font,
  Layer,
  Material,
  Matrix,
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
  Vector2,
  Vector3,
  Vector4,
  type Engine
} from "@galacean/engine";
import {
  DEFAULT_PHOTO_INK,
  PHOTO_BADGE,
  PHOTO_TOOLBAR,
  PHOTO_INK_COLORS,
  photoDetailLayout
} from "./SeedWorldPhotoPalette";
import type { AgentViewImage } from "@galacean/engine-ai-chat/ai-chat/agent-types";
import type { ViewAnnotation, ViewPoint } from "./SeedWorldViewSnapshot";

export const PAPER_HEIGHT = 1.22337079;
export const PHOTO_WORKSPACE_LAYER = Layer.Layer25;
const WORKSPACE_UNIT_SCALE = 0.001;
export const PHOTO_MODEL_URL = new URL("../assets/instant-camera/polaroid-photo.glb", import.meta.url).href;
import { UnlitMaterial } from "@galacean/engine";

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

/** Use the source model's UV basis, retaining its geometry, front/back and white border. */
export function alignPhotoModel(model: Entity): MeshRenderer {
  model.findByName("Sketchfab_model")!.transform.localMatrix = new Matrix(
    0.0298394402,
    0.0268802237,
    -0.0270753508,
    0,
    -0.0364202821,
    0.0303085626,
    -0.0100482498,
    0,
    0.0113659183,
    0.026549159,
    0.0388840751,
    0,
    0.0654004818,
    -1.0822054144,
    0.1900346723,
    1
  );
  model.findByName("photo.obj.cleaner.gles")!.transform.setPosition(0, 0, 0);
  for (const renderer of model.getComponentsIncludeChildren(MeshRenderer, [])) renderer.castShadows = false;
  return model.findByName("Object_3")!.getComponent(MeshRenderer)!;
}
export function photoMaterial(engine: Engine): UnlitMaterial {
  const ink = new UnlitMaterial(engine);
  ink.renderFace = RenderFace.Double;
  ink.tilingOffset.set(1 / 0.277616024, -1 / 0.300857, -0.581698 / 0.277616024, 0.347292 / 0.300857);
  return ink;
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

/** Build a pixel-exact rounded-rectangle mesh with exact [0, 1] UVs (top-left origin). */
function roundedViewportMesh(engine: Engine, width: number, height: number, radius: number): ModelMesh {
  const mesh = new ModelMesh(engine, "Markup viewport");
  const hw = Math.max(0.5, width * 0.5);
  const hh = Math.max(0.5, height * 0.5);
  const r = Math.max(0, Math.min(radius, hw, hh));
  if (r < 0.5) {
    mesh.setPositions([
      new Vector3(-hw, hh, 0),
      new Vector3(hw, hh, 0),
      new Vector3(-hw, -hh, 0),
      new Vector3(hw, -hh, 0)
    ]);
    mesh.setUVs([new Vector2(0, 0), new Vector2(1, 0), new Vector2(0, 1), new Vector2(1, 1)]);
    mesh.setIndices(new Uint16Array([0, 2, 1, 1, 2, 3]));
    mesh.addSubMesh(0, 6);
  } else {
    const segs = 12;
    const positions: Vector3[] = [new Vector3(0, 0, 0)];
    const uvs: Vector2[] = [new Vector2(0.5, 0.5)];
    const corners: readonly [number, number][] = [
      [hw - r, hh - r],
      [-hw + r, hh - r],
      [-hw + r, -hh + r],
      [hw - r, -hh + r]
    ];
    for (let c = 0; c < 4; c++) {
      for (let j = 0; j <= segs; j++) {
        const angle = (c * Math.PI) / 2 + ((j / segs) * Math.PI) / 2;
        const x = corners[c][0] + r * Math.cos(angle);
        const y = corners[c][1] + r * Math.sin(angle);
        positions.push(new Vector3(x, y, 0));
        uvs.push(new Vector2((x + hw) / (hw * 2), (hh - y) / (hh * 2)));
      }
    }
    const indices: number[] = [];
    for (let i = 1; i < positions.length; i++) {
      indices.push(0, i, i + 1 === positions.length ? 1 : i + 1);
    }
    mesh.setPositions(positions);
    mesh.setUVs(uvs);
    mesh.setIndices(new Uint16Array(indices));
    mesh.addSubMesh(0, indices.length);
  }
  mesh.bounds.min.set(-hw, -hh, -1);
  mesh.bounds.max.set(hw, hh, 1);
  mesh.uploadData(true);
  return mesh;
}

/** Build a pixel-exact closed rounded-rectangle luminous border ring (no elliptical stretch). */
function roundedFrameRingMesh(
  engine: Engine,
  width: number,
  height: number,
  radius: number,
  thickness: number
): ModelMesh {
  const mesh = new ModelMesh(engine, "Markup luminous frame");
  const hw = Math.max(1, width * 0.5);
  const hh = Math.max(1, height * 0.5);
  const r = Math.max(0.5, Math.min(radius, hw - 0.5, hh - 0.5));
  const halfT = Math.max(0.4, thickness * 0.5);
  const segs = 12;
  const corners: readonly [number, number][] = [
    [hw - r, hh - r],
    [-hw + r, hh - r],
    [-hw + r, -hh + r],
    [hw - r, -hh + r]
  ];
  const positions: Vector3[] = [];
  for (let c = 0; c < 4; c++) {
    for (let j = 0; j <= segs; j++) {
      const angle = (c * Math.PI) / 2 + ((j / segs) * Math.PI) / 2;
      const nx = Math.cos(angle);
      const ny = Math.sin(angle);
      const cx = corners[c][0];
      const cy = corners[c][1];
      const rIn = Math.max(0, r - halfT);
      const rOut = r + halfT;
      positions.push(new Vector3(cx + rIn * nx, cy + rIn * ny, 0));
      positions.push(new Vector3(cx + rOut * nx, cy + rOut * ny, 0));
    }
  }
  const ringPoints = positions.length / 2;
  const indices: number[] = [];
  for (let i = 0; i < ringPoints; i++) {
    const next = (i + 1) % ringPoints;
    const i0 = i * 2;
    const i1 = i0 + 1;
    const n0 = next * 2;
    const n1 = n0 + 1;
    indices.push(i0, i1, n1, i0, n1, n0);
  }
  mesh.setPositions(positions);
  mesh.setIndices(new Uint16Array(indices));
  mesh.addSubMesh(0, indices.length);
  mesh.bounds.min.set(-hw - halfT, -hh - halfT, -1);
  mesh.bounds.max.set(hw + halfT, hh + halfT, 1);
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
  readonly toolbar: Entity;
  readonly palette: Entity;
  readonly badge: Entity;
  private readonly badgeLabel: TextRenderer;
  private readonly paletteIndicator: MeshRenderer;
  private readonly paletteSelection: MeshRenderer;
  readonly status: TextRenderer;
  readonly closeButtonTexture: Texture2D;
  readonly emptyStrokeMaskTexture: Texture2D;
  readonly icons: MeshRenderer[] = [];
  private readonly strokeFieldScene: Scene;
  private readonly strokeFieldCamera: Camera;
  private readonly strokeFieldRenderer: MeshRenderer;
  private readonly strokeFieldMaterial: Material;
  private loading?: Promise<void>;
  private disposed = false;
  warmingUp = false;
  private readonly resources: Array<ModelMesh | BaseMaterial | Texture2D> = [];
  private readonly glassPanels: {
    glass: SeedWorldLiquidGlassUiMaterial;
    width: number;
    height: number;
    radius: number;
    scaledByToolbar: boolean;
  }[] = [];
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
    this.toolbar = this.workspaceRoot.createChild("Photo toolbar");
    this.glassPanel(
      "Toolbar glass",
      PHOTO_TOOLBAR.width,
      PHOTO_TOOLBAR.height,
      26,
      this.toolbar,
      26,
      -PHOTO_TOOLBAR.height / 2,
      0
    );
    // Icons use the same engine triangle stroke renderer as freehand marks; no SVG/DOM drawing.
    // Sample a cubic curve densely so the 24px return arrow has no visible elbow segments.
    // Mirror the same path for redo to keep both icons geometrically identical.
    const returnArc = Array.from({ length: 33 }, (_, i) => {
      const t = i / 32,
        u = 1 - t;
      return [
        3 * u ** 3 + 3 * 16 * u ** 2 * t + 3 * 21 * u * t ** 2 + 21 * t ** 3,
        10 * u ** 3 + 3 * 10 * u ** 2 * t + 3 * 10 * u * t ** 2 + 20 * t ** 3
      ];
    });
    const undoPaths = [
      [
        [9, 4],
        [3, 10],
        [9, 16]
      ],
      returnArc
    ];
    const icons = [
      [
        [
          [3, 6],
          [21, 6]
        ],
        [
          [9, 6],
          [9, 3],
          [15, 3],
          [15, 6]
        ],
        [
          [5, 6],
          [6, 21],
          [18, 21],
          [19, 6]
        ],
        [
          [10, 10],
          [10, 17]
        ],
        [
          [14, 10],
          [14, 17]
        ]
      ],
      undoPaths,
      undoPaths.map((path) => path.map(([x, y]) => [24 - x, y])),
      []
    ];
    icons.forEach((paths, index) => {
      const entity = this.toolbar.createChild(["Discard", "Undo", "Redo", "Palette"][index]);
      entity.transform.setPosition(14, -(index * PHOTO_TOOLBAR.step + 18), 3);
      const renderer = entity.addComponent(MeshRenderer);
      const mesh = strokeMesh(
        engine,
        paths.map((points) => ({ width: 1.9, points: points.map(([x, y]) => ({ x, y })) })),
        (x, y) => new Vector3(x, -y, 0)
      );
      const material = flatMaterial(engine, new Color(1, 1, 1, 1));
      material.isTransparent = true;
      renderer.mesh = mesh;
      renderer.setMaterial(material);
      this.icons.push(renderer);
      this.resources.push(mesh, material);
    });
    this.rounded("Ink ring", 24, 24, 12, new Color(1, 1, 1, 0.85), this.toolbar, 26, -174, 3);
    this.paletteIndicator = this.rounded(
      "Current ink",
      17,
      17,
      8.5,
      inkColor(DEFAULT_PHOTO_INK),
      this.toolbar,
      26,
      -174,
      4
    );
    this.palette = this.toolbar.createChild("Ink palette");
    this.glassPanel("Palette glass", 248, 192, 26, this.palette, 124, -96, 1);
    PHOTO_INK_COLORS.forEach((hex, i) =>
      this.rounded(
        "Ink " + hex,
        24,
        24,
        12,
        inkColor(hex),
        this.palette,
        26 + (i % 8) * 28,
        -(26 + Math.floor(i / 8) * 28),
        2
      )
    );
    this.paletteSelection = this.rounded("Selected ink", 9, 9, 4.5, new Color(1, 1, 1, 1), this.palette, 0, 0, 3);
    this.setInkColor(DEFAULT_PHOTO_INK);
    this.palette.isActive = false;
    this.toolbar.isActive = false;
    this.badge = this.workspaceRoot.createChild("Markup summary badge");
    this.glassPanel(
      "Badge glass",
      PHOTO_BADGE.width,
      PHOTO_BADGE.height,
      PHOTO_BADGE.radius,
      this.badge,
      0,
      0,
      0,
      false
    );
    const badgeRimEntity = this.badge.createChild("Badge luminous rim");
    const badgeRimRenderer = badgeRimEntity.addComponent(MeshRenderer);
    const badgeRimMesh = roundedFrameRingMesh(engine, PHOTO_BADGE.width, PHOTO_BADGE.height, PHOTO_BADGE.radius, 1.1);
    const badgeRimMaterial = flatMaterial(engine, new Color(1.0, 1.0, 1.0, 0.24));
    badgeRimMaterial.isTransparent = true;
    badgeRimRenderer.mesh = badgeRimMesh;
    badgeRimRenderer.setMaterial(badgeRimMaterial);
    badgeRimEntity.transform.setPosition(0, 0, 1);
    this.resources.push(badgeRimMesh, badgeRimMaterial);
    this.rounded("Badge dot", 7, 7, 3.5, inkColor(DEFAULT_PHOTO_INK), this.badge, -44, 0, 2);
    this.badgeLabel = this.text("Badge label", "已标记 1 处", 13, this.badge);
    this.badgeLabel.color = new Color(1, 1, 1, 0.96);
    this.badgeLabel.entity.transform.setPosition(8, 0, 2);
    this.badge.isActive = false;
    this.status = this.text("Photo status", "", 13);
    tagWorkspaceHierarchy(this.workspaceRoot, PHOTO_WORKSPACE_LAYER);
    this.resize();
  }
  setBadge(count: number, x: number, y: number, visible: boolean): void {
    const active = visible && count > 0;
    this.badge.isActive = active;
    if (!active) return;
    this.badge.transform.setPosition(x, -y, 500);
    this.badgeLabel.text = `已标记 ${count} 处`;
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
        this.warmingUp = true;
        await warmupPhotoPresentation(
          this.camera,
          () => {
            this.toolbar.isActive = this.palette.isActive = this.badge.isActive = true;
            try {
              this.camera.render();
              surface!.setOpacity(0.5);
              this.camera.render();
            } finally {
              this.toolbar.isActive = this.palette.isActive = this.badge.isActive = false;
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
        if (!this.disposed) this.toolbar.isActive = this.palette.isActive = this.badge.isActive = false;
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
    const { toolbar, palette, scale } = photoDetailLayout(rect.width, rect.height);
    this.toolbar.transform.setPosition(toolbar.x, -toolbar.y, 500);
    this.toolbar.transform.setScale(scale, scale, 1);
    this.palette.transform.setPosition((palette.x - toolbar.x) / scale, -(palette.y - toolbar.y) / scale, 5);
    this.status.entity.transform.setPosition(rect.width / 2, -rect.height + 36, 500);
    const pixelScale = this.engine.canvas.width / Math.max(1, rect.width);
    for (const { glass, width, height, radius, scaledByToolbar } of this.glassPanels) {
      const s = scaledByToolbar ? scale : 1;
      glass.setLayout(width * pixelScale * s, height * pixelScale * s, radius * pixelScale * s);
    }
  }
  private glassPanel(
    name: string,
    width: number,
    height: number,
    radius: number,
    parent: Entity,
    x: number,
    y: number,
    z: number,
    scaledByToolbar = true
  ): void {
    const entity = parent.createChild(name),
      renderer = entity.addComponent(MeshRenderer);
    const mesh = new ModelMesh(this.engine, name);
    mesh.setPositions([
      new Vector3(-width / 2, height / 2, 0),
      new Vector3(width / 2, height / 2, 0),
      new Vector3(-width / 2, -height / 2, 0),
      new Vector3(width / 2, -height / 2, 0)
    ]);
    mesh.setUVs([new Vector2(0, 0), new Vector2(1, 0), new Vector2(0, 1), new Vector2(1, 1)]);
    // A dark, neutral transmission keeps white controls legible even over bright skies.
    mesh.setColors(Array.from({ length: 4 }, () => new Color(0.22, 0.25, 0.28, 1)));
    mesh.setIndices(new Uint16Array([0, 2, 1, 1, 2, 3]));
    mesh.addSubMesh(0, 6);
    mesh.bounds.min.set(-width / 2, -height / 2, -0.01);
    mesh.bounds.max.set(width / 2, height / 2, 0.01);
    mesh.uploadData(true);
    const glass = new SeedWorldLiquidGlassUiMaterial(this.worldCamera);
    // Frost the existing scene texture; no additional scene render or blur target.
    glass.setRoughness(0.85);
    glass.setWhiteTint(0.12);
    glass.setInteriorRefractionStrength(0);
    renderer.mesh = mesh;
    renderer.setMaterial(glass.material);
    entity.transform.setPosition(x, y, z);
    this.resources.push(mesh);
    this.glassPanels.push({ glass, width, height, radius, scaledByToolbar });
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
  setInkColor(hex: string): void {
    (this.paletteIndicator.getMaterial() as UnlitMaterial).baseColor = inkColor(hex);
    const index = PHOTO_INK_COLORS.indexOf(hex);
    this.paletteSelection.entity.isActive = index >= 0;
    if (index >= 0) {
      this.paletteSelection.entity.transform.setPosition(26 + (index % 8) * 28, -(26 + Math.floor(index / 8) * 28), 3);
      const color = inkColor(hex);
      (this.paletteSelection.getMaterial() as UnlitMaterial).baseColor = new Color(
        color.r + color.g + color.b > 1.5 ? 0.02 : 1,
        color.r + color.g + color.b > 1.5 ? 0.02 : 1,
        color.r + color.g + color.b > 1.5 ? 0.02 : 1,
        1
      );
    }
  }
  rounded(
    name: string,
    width: number,
    height: number,
    radius: number,
    color: Color,
    parent: Entity,
    x: number,
    y: number,
    z: number
  ): MeshRenderer {
    const entity = parent.createChild(name),
      renderer = entity.addComponent(MeshRenderer);
    const mesh = new ModelMesh(this.engine, name);
    const positions = [new Vector3()],
      indices: number[] = [];
    const corners = [
      [width / 2 - radius, height / 2 - radius],
      [-width / 2 + radius, height / 2 - radius],
      [-width / 2 + radius, -height / 2 + radius],
      [width / 2 - radius, -height / 2 + radius]
    ];
    for (let c = 0; c < 4; c++)
      for (let j = 0; j <= 10; j++) {
        const angle = (c * Math.PI) / 2 + ((j / 10) * Math.PI) / 2;
        positions.push(
          new Vector3(corners[c][0] + radius * Math.cos(angle), corners[c][1] + radius * Math.sin(angle), 0)
        );
      }
    for (let i = 1; i < positions.length; i++) indices.push(0, i, i + 1 === positions.length ? 1 : i + 1);
    mesh.setPositions(positions);
    mesh.setIndices(new Uint16Array(indices));
    mesh.addSubMesh(0, indices.length);
    mesh.bounds.min.set(-width / 2, -height / 2, -0.01);
    mesh.bounds.max.set(width / 2, height / 2, 0.01);
    mesh.uploadData(true);
    const material = flatMaterial(this.engine, color);
    material.isTransparent = true;
    renderer.mesh = mesh;
    renderer.setMaterial(material);
    entity.transform.setPosition(x, y, z);
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
    for (const { glass } of this.glassPanels) glass.destroy();
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
  /** Retained for debug trace compatibility; active strokes render into an offscreen BlendOperation.Max SDF field. */
  readonly ink: MeshRenderer;
  private readonly viewportRenderer: MeshRenderer;
  private readonly viewportMesh: ModelMesh;
  private readonly closeRenderer: MeshRenderer;
  private readonly closeMaterial: UnlitMaterial;
  private readonly viewportRect = new Vector4(2, 2, 0, 0);
  private readonly markupParams = new Vector4(1, 1, 0, 0);
  private readonly brushParams = new Vector4(0, 0, 0, 0);
  private strokeMaskTexture?: Texture2D;
  private strokeMaskTarget?: RenderTarget;
  private strokeMaskRelease?: () => void;
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
      this.viewportMesh = roundedViewportMesh(engine, 1, 1, 0);
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

      this.ink = this.root.createChild("Freehand annotation mesh").addComponent(MeshRenderer);
      this.ink.entity.transform.setPosition(0, 0, 3.5);
      this.ink.entity.isActive = false;

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
  private ensureStrokeMaskTarget(): RenderTarget {
    if (this.strokeMaskTarget && this.strokeMaskTexture) return this.strokeMaskTarget;
    const { width, height } = strokeMaskDimensions(this.image.width, this.image.height);
    const release = this.graphics.budget?.reserve("display", width * height * 4);
    let texture: Texture2D | undefined;
    try {
      texture = new Texture2D(this.graphics.engine, width, height, TextureFormat.R8G8B8A8_UNorm, false, false);
      texture.isGCIgnored = true;
      texture.wrapModeU = TextureWrapMode.Clamp;
      texture.wrapModeV = TextureWrapMode.Clamp;
      texture.filterMode = TextureFilterMode.Bilinear;
      const target = new RenderTarget(this.graphics.engine, width, height, texture, null, 1);
      this.strokeMaskTexture = texture;
      this.strokeMaskTarget = target;
      this.strokeMaskRelease = release;
      return target;
    } catch (error) {
      texture?.destroy(true);
      release?.();
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
  /** Pure GPU SDF glowing highlight onboarding circle (zero mesh rebuilds, zero jaggies). */
  setHintLoop(progress: number, alpha: number): void {
    this.markupParams.z = Math.max(0, Math.min(1, progress));
    this.markupParams.w = Math.max(0, Math.min(1, alpha));
    this.material.shaderData.setVector4("material_MarkupParams", this.markupParams);
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
    this.ink.entity.isActive = false;
    if (!marks.length) {
      this.brushParams.y = 0;
      this.material.shaderData.setTexture("material_StrokeMaskTexture", this.graphics.emptyStrokeMaskTexture);
      this.material.shaderData.setVector4("material_BrushParams", this.brushParams);
      return;
    }
    const segments = buildStrokeCapsuleSegments(marks, this.image.width, this.image.height, options);
    if (!segments.length) {
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
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    const mesh = this.ink.destroyed ? undefined : this.ink.mesh;
    this.root.destroy();
    destroyOwnedMesh(mesh as ModelMesh | undefined);
    destroyOwnedMesh(this.viewportMesh);
    const strokeMaskRelease = this.strokeMaskRelease;
    this.strokeMaskRelease = undefined;
    destroyPhotoResources([this.strokeMaskTarget, this.strokeMaskTexture], strokeMaskRelease);
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
