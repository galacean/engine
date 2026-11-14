import { SeedWorldLiquidGlassUiMaterial } from "@galacean/engine-modify/rendering/LiquidGlassPostProcessPass";
import { destroyOwnedMesh } from "@galacean/engine-terrain/geometry/destroyOwnedMesh";
import { destroyPhotoResources } from "./SeedWorldPhotoResources";
import { warmupPhotoPresentation } from "./SeedWorldPhotoWarmup";
import type { PhotoImage } from "./SeedWorldPhotoImage";
import { encodeImage, type ImageResourceBudget } from "@galacean/engine-ai-chat/ai-chat/image-resources";
import {
  AssetType,
  BaseMaterial,
  BoundingBox,
  Camera,
  CameraClearFlags,
  Color,
  DirectLight,
  Entity,
  Font,
  GLTFResource,
  Matrix,
  MeshRenderer,
  ModelMesh,
  PrimitiveMesh,
  RenderFace,
  RenderTarget,
  Scene,
  Script,
  TextRenderer,
  Texture2D,
  TextureFormat,
  TextureWrapMode,
  Vector2,
  Vector3,
  type Engine
} from "@galacean/engine";
import {
  DEFAULT_PHOTO_INK,
  PHOTO_TOOLBAR,
  PHOTO_PALETTE,
  PHOTO_INK_COLORS,
  photoDetailLayout
} from "./SeedWorldPhotoPalette";
import type { AgentViewImage } from "@galacean/engine-ai-chat/ai-chat/agent-types";
import type { ViewAnnotation, ViewPoint } from "./SeedWorldViewSnapshot";

export const PAPER_HEIGHT = 1.22337079;
export const PHOTO_MODEL_URL = new URL("../assets/instant-camera/polaroid-photo.glb", import.meta.url).href;
const PIN_URL = new URL("../assets/instant-camera/thumbtack.glb", import.meta.url).href;
import { UnlitMaterial } from "@galacean/engine";

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
    const vertex = (x: number, y: number) => {
      const point = project(x, y);
      // Later strokes remain on top even when materials are batched by color.
      if (separateMarks) point.z += ranges.length * 0.0001;
      return point;
    };
    for (let i = 0; i < mark.points.length; i++) {
      const p = mark.points[i],
        base = positions.length;
      positions.push(vertex(p.x, p.y));
      for (let j = 0; j < 10; j++) {
        const a = (j * Math.PI) / 5;
        positions.push(vertex(p.x + Math.cos(a) * radius, p.y + Math.sin(a) * radius));
        triangle(base, base + 1 + j, base + 1 + ((j + 1) % 10));
      }
      if (!i) continue;
      const prev = mark.points[i - 1],
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

class PhotoFrame extends Script {
  tick?: (dt: number) => void;
  onUpdate(dt: number): void {
    this.tick?.(dt);
  }
}

export class PhotoGraphics {
  readonly scene: Scene;
  readonly camera: Camera;
  readonly font: Font;
  readonly backdrop: MeshRenderer;
  readonly toolbar: Entity;
  readonly palette: Entity;
  private readonly paletteIndicator: MeshRenderer;
  private readonly paletteSelection: MeshRenderer;
  readonly status: TextRenderer;
  readonly icons: MeshRenderer[] = [];
  private paper!: GLTFResource;
  private pin!: GLTFResource;
  private loading?: Promise<void>;
  private disposed = false;
  private readonly resources: Array<ModelMesh | BaseMaterial> = [];
  private readonly glassPanels: {
    glass: SeedWorldLiquidGlassUiMaterial;
    width: number;
    height: number;
    radius: number;
  }[] = [];
  constructor(
    readonly engine: Engine,
    readonly canvas: HTMLCanvasElement,
    private readonly worldCamera: Camera,
    tick: (dt: number) => void,
    readonly budget?: ImageResourceBudget
  ) {
    this.scene = new Scene(engine, "Photo workspace (excluded from world capture)");
    this.scene.ambientLight.diffuseSolidColor = new Color(0.65, 0.65, 0.65, 1);
    const view = this.scene.createRootEntity("Photo workspace view");
    this.camera = view.addComponent(Camera);
    this.camera.isOrthographic = true;
    this.camera.nearClipPlane = 0.1;
    this.camera.farClipPlane = 4000;
    this.camera.clearFlags = CameraClearFlags.Depth;
    this.camera.enableHDR = this.camera.enablePostProcess = false;
    view.addComponent(PhotoFrame).tick = tick;
    this.font = Font.createFromOS(engine, '"PingFang SC", "Microsoft YaHei", sans-serif')!;
    const light = this.scene.createRootEntity("Photo key light");
    light.transform.setPosition(-300, 400, 1000);
    light.transform.lookAt(new Vector3());
    light.addComponent(DirectLight).color = new Color(0.8, 0.8, 0.8, 1);
    this.backdrop = this.quad("Editing backdrop", new Color(0.0052, 0.0086, 0.0097, 0));
    (this.backdrop.getMaterial() as UnlitMaterial).isTransparent = true;
    this.backdrop.entity.isActive = false;
    this.toolbar = this.scene.createRootEntity("Photo toolbar");
    this.glassPanel("Toolbar glass", PHOTO_TOOLBAR.width, PHOTO_TOOLBAR.height, 26, this.toolbar, 26, -126, 0);
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
      [],
      [
        [
          [4, 12],
          [9, 17],
          [20, 6]
        ]
      ]
    ];
    icons.forEach((paths, index) => {
      const entity = this.toolbar.createChild(["Discard", "Undo", "Redo", "Palette", "Confirm"][index]);
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
    this.status = this.text("Photo status", "", 13);
    this.engine.sceneManager.addScene(this.scene);
    this.resize();
  }
  prepare(): Promise<void> {
    return (this.loading ??= Promise.all([
      this.engine.resourceManager.load<GLTFResource>({
        type: AssetType.GLTF,
        url: PHOTO_MODEL_URL,
        params: { keepMeshData: true }
      }),
      this.engine.resourceManager.load<GLTFResource>({ type: AssetType.GLTF, url: PIN_URL })
    ]).then(async ([paper, pin]) => {
      if (this.disposed) throw new DOMException("Photo workspace disposed", "AbortError");
      this.paper = paper;
      this.pin = pin;
      const texture = new Texture2D(this.engine, 1, 1, TextureFormat.R8G8B8A8, false, true);
      texture.setPixelBuffer(new Uint8Array([255, 255, 255, 255]));
      let surface: PhotoSurface | undefined;
      try {
        surface = new PhotoSurface(this, paper, pin, {
          texture,
          width: 1,
          height: 1,
          export: async () => {
            throw new Error("Warmup image cannot be exported");
          },
          dispose() {}
        });
        surface.caption.text = "SEED WORLD · 0123456789/";
        await warmupPhotoPresentation(
          this.camera,
          () => {
            this.toolbar.isActive = this.palette.isActive = true;
            this.camera.render();
            surface!.setOpacity(0.5);
            this.camera.render();
          },
          () => this.disposed,
          this.budget
        );
      } finally {
        surface?.dispose();
        texture.destroy(true);
        if (!this.disposed) this.toolbar.isActive = this.palette.isActive = false;
      }
    }));
  }
  resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    this.camera.orthographicSize = rect.height / 2;
    this.camera.entity.transform.setPosition(rect.width / 2, -rect.height / 2, 2000);
    this.backdrop.entity.transform.setPosition(rect.width / 2, -rect.height / 2, 100);
    this.backdrop.entity.transform.setScale(rect.width, rect.height, 1);
    const { toolbar, palette, scale } = photoDetailLayout(rect.width, rect.height);
    this.toolbar.transform.setPosition(toolbar.x, -toolbar.y, 500);
    this.toolbar.transform.setScale(scale, scale, 1);
    this.palette.transform.setPosition((palette.x - toolbar.x) / scale, -(palette.y - toolbar.y) / scale, 5);
    this.status.entity.transform.setPosition(rect.width / 2, -rect.height + 36, 500);
    const pixelScale = this.engine.canvas.width / Math.max(1, rect.width);
    for (const { glass, width, height, radius } of this.glassPanels)
      glass.setLayout(width * pixelScale * scale, height * pixelScale * scale, radius * pixelScale * scale);
  }
  private glassPanel(
    name: string,
    width: number,
    height: number,
    radius: number,
    parent: Entity,
    x: number,
    y: number,
    z: number
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
    this.glassPanels.push({ glass, width, height, radius });
  }
  text(name: string, value: string, size: number, parent?: Entity): TextRenderer {
    const entity = parent ? parent.createChild(name) : this.scene.createRootEntity(name);
    const text = entity.addComponent(TextRenderer);
    text.font = this.font;
    text.fontSize = size;
    text.text = value;
    entity.transform.setScale(100, 100, 100);
    return text;
  }
  quad(name: string, color: Color, parent?: Entity): MeshRenderer {
    const entity = parent ? parent.createChild(name) : this.scene.createRootEntity(name);
    const renderer = entity.addComponent(MeshRenderer),
      mesh = PrimitiveMesh.createCuboid(this.engine, 1, 1, 0.001);
    const material = flatMaterial(this.engine, color);
    renderer.mesh = mesh;
    renderer.setMaterial(material);
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
    const surface = new PhotoSurface(this, this.paper, this.pin, image);
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
    this.engine.sceneManager.removeScene(this.scene);
    const ambient = this.scene.ambientLight;
    this.scene.destroy();
    ambient.destroy(true);
    for (const { glass } of this.glassPanels) glass.destroy();
    this.resources.forEach((resource) =>
      resource instanceof ModelMesh ? destroyOwnedMesh(resource) : resource.destroy(true)
    );
  }
}

/** One real sheet and one real thumbtack per attachment. Only their transforms change between states. */
export class PhotoSurface {
  readonly root: Entity;
  readonly pin: Entity;
  readonly material: UnlitMaterial;
  readonly texture: Texture2D;
  readonly ink: MeshRenderer;
  readonly caption: TextRenderer;
  private readonly inkMaterial: UnlitMaterial;
  private readonly inkMaterials = new Map<string, UnlitMaterial>();
  private readonly paperMaterials: BaseMaterial[] = [];
  private readonly fading: {
    material: BaseMaterial;
    color: Color;
    alpha: number;
    transparent: boolean;
    face: RenderFace;
  }[] = [];
  private opacity = 1;
  private triangles: { p: Vector3[]; uv: Vector2[] }[] = [];
  private disposed = false;
  constructor(
    private readonly graphics: PhotoGraphics,
    paper: GLTFResource,
    pinResource: GLTFResource,
    readonly image: PhotoImage
  ) {
    const { engine, scene } = graphics;
    const cleanup: (() => void)[] = [];
    try {
      this.root = scene.createRootEntity("Photograph");
      cleanup.push(() => this.root.destroy());
      const model = paper.instantiateSceneRoot();
      this.root.addChild(model);
      const face = alignPhotoModel(model);
      this.material = photoMaterial(engine);
      cleanup.push(() => this.material.destroy(true));
      face.setMaterial(this.material);
      this.texture = image.texture;
      this.material.baseTexture = this.texture;
      // GLTF instances share materials. Clone the paper only, so fading one photo cannot dim its siblings.
      for (const renderer of model.getComponentsIncludeChildren(MeshRenderer, [])) {
        renderer.getMaterials().forEach((source, index) => {
          if (source === this.material || !(source instanceof BaseMaterial)) return;
          const material = source.clone() as BaseMaterial;
          renderer.setMaterial(index, material);
          this.paperMaterials.push(material);
        });
      }
      const mesh = face.mesh as ModelMesh,
        positions = mesh.getPositions()!,
        uv = mesh.getUVs()!,
        indices = mesh.getIndices()!;
      const matrix = face.entity.transform.worldMatrix;
      for (let i = 0; i < indices.length; i += 3) {
        const p: Vector3[] = [],
          tex: Vector2[] = [];
        for (let j = 0; j < 3; j++) {
          const k = indices[i + j],
            v = new Vector3();
          Vector3.transformCoordinate(positions[k], matrix, v);
          p.push(v);
          tex.push(new Vector2((uv[k].x - 0.581698) / 0.277616024, (0.347292 - uv[k].y) / 0.300857));
        }
        this.triangles.push({ p, uv: tex });
      }
      this.ink = this.root.createChild("Freehand annotation mesh").addComponent(MeshRenderer);
      this.inkMaterial = flatMaterial(engine, inkColor(DEFAULT_PHOTO_INK));
      this.inkMaterials.set(DEFAULT_PHOTO_INK, this.inkMaterial);
      this.ink.setMaterial(this.inkMaterial);
      this.caption = graphics.text("Photo watermark", "SEED WORLD", 16, this.root);
      this.caption.color = new Color(0.06, 0.09, 0.08, 1);
      for (const material of [...this.paperMaterials, this.material, this.inkMaterial]) {
        const color = material.shaderData.getColor("material_BaseColor");
        this.fading.push({
          material,
          color,
          alpha: color.a,
          transparent: material.isTransparent,
          face: material.renderFace
        });
      }
      this.caption.entity.transform.setPosition(0, -0.52, 0.03);
      this.caption.entity.transform.setScale(0.1, 0.1, 0.1);
      this.pin = scene.createRootEntity("Thumbtack: needle into paper");
      cleanup.push(() => this.pin.destroy());
      const pivot = this.pin.createChild("Needle tip pivot"),
        pinModel = pinResource.instantiateSceneRoot();
      pivot.addChild(pinModel);
      const bounds = new BoundingBox(
        new Vector3(Infinity, Infinity, Infinity),
        new Vector3(-Infinity, -Infinity, -Infinity)
      );
      for (const renderer of pinModel.getComponentsIncludeChildren(MeshRenderer, [])) {
        BoundingBox.merge(bounds, renderer.bounds, bounds);
        renderer.castShadows = false;
      }
      const center = bounds.getCenter(new Vector3()),
        extent = bounds.getExtent(new Vector3());
      const scale = 1 / (extent.y * 2);
      pinModel.transform.setScale(scale, scale, scale);
      pinModel.transform.setPosition(-center.x * scale, -bounds.min.y * scale, -center.z * scale);
      pivot.transform.setRotation(78, 12, -8);
      this.root.isActive = this.pin.isActive = false;
    } catch (error) {
      for (const dispose of cleanup.reverse()) dispose();
      for (const material of this.paperMaterials) material.destroy(true);
      for (const material of this.inkMaterials.values()) material.destroy(true);
      throw error;
    }
  }
  setOpacity(value: number): void {
    value = Math.max(0, Math.min(1, value));
    if (this.opacity === value) return;
    this.opacity = value;
    for (const { material, color, alpha, transparent, face } of this.fading) {
      material.isTransparent = transparent || value < 0.999;
      // Do not reveal the rear printed lettering through the fading front of the paper.
      if (this.paperMaterials.includes(material)) material.renderFace = value < 0.999 ? RenderFace.Front : face;
      color.a = alpha * value;
    }
    this.caption.color.a = value;
  }
  /** UV barycentrics keep ink on the supplied curved paper, rather than on a floating flat overlay. */
  point(x: number, y: number): Vector3 {
    const u = Math.max(0, Math.min(1, x / this.image.width)),
      v = Math.max(0, Math.min(1, y / this.image.height));
    for (const { p, uv } of this.triangles) {
      const [a, b, c] = uv,
        den = (b.y - c.y) * (a.x - c.x) + (c.x - b.x) * (a.y - c.y);
      const wa = ((b.y - c.y) * (u - c.x) + (c.x - b.x) * (v - c.y)) / den;
      const wb = ((c.y - a.y) * (u - c.x) + (a.x - c.x) * (v - c.y)) / den,
        wc = 1 - wa - wb;
      if (wa >= -0.0001 && wb >= -0.0001 && wc >= -0.0001)
        return new Vector3(
          p[0].x * wa + p[1].x * wb + p[2].x * wc,
          p[0].y * wa + p[1].y * wb + p[2].y * wc,
          p[0].z * wa + p[1].z * wb + p[2].z * wc + 0.002
        );
    }
    throw new Error("Photo UV is outside the source model surface");
  }
  /** Orthographic screen-to-paper hit test using actual normalized mesh triangles. */
  imagePoint(localX: number, localY: number): ViewPoint | undefined {
    for (const { p, uv } of this.triangles) {
      const [a, b, c] = p,
        den = (b.y - c.y) * (a.x - c.x) + (c.x - b.x) * (a.y - c.y);
      const wa = ((b.y - c.y) * (localX - c.x) + (c.x - b.x) * (localY - c.y)) / den;
      const wb = ((c.y - a.y) * (localX - c.x) + (a.x - c.x) * (localY - c.y)) / den,
        wc = 1 - wa - wb;
      if (wa >= 0 && wb >= 0 && wc >= 0)
        return {
          x: (uv[0].x * wa + uv[1].x * wb + uv[2].x * wc) * this.image.width,
          y: (uv[0].y * wa + uv[1].y * wb + uv[2].y * wc) * this.image.height
        };
    }
  }
  private materialsFor(marks: readonly ViewAnnotation[]): UnlitMaterial[] {
    return marks.map((mark) => {
      let material = this.inkMaterials.get(mark.color);
      if (!material) {
        material = flatMaterial(this.graphics.engine, inkColor(mark.color));
        this.inkMaterials.set(mark.color, material);
        this.fading.push({
          material,
          color: material.baseColor,
          alpha: 1,
          transparent: false,
          face: material.renderFace
        });
      }
      return material;
    });
  }
  paint(marks: readonly ViewAnnotation[]): void {
    const old = this.ink.mesh;
    this.ink.mesh = strokeMesh(this.graphics.engine, marks, (x, y) => this.point(x, y), true);
    this.ink.setMaterials(this.materialsFor(marks));
    destroyOwnedMesh(old as ModelMesh | undefined);
    this.ink.entity.isActive = marks.length > 0;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    const mesh = this.ink.mesh;
    this.root.destroy();
    this.pin.destroy();
    destroyOwnedMesh(mesh as ModelMesh | undefined);
    for (const material of this.inkMaterials.values()) material.destroy(true);
    this.material.destroy(true);
    for (const material of this.paperMaterials) material.destroy(true);
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
    pixelsTexture = new Texture2D(engine, width, height, TextureFormat.R8G8B8A8, false);
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
