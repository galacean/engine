import {
  BlinnPhongMaterial,
  Camera,
  DirectLight,
  Entity,
  Font,
  MeshRenderer,
  MeshTopology,
  ModelMesh,
  TextRenderer,
  Texture2D,
  TextureFilterMode,
  TextureFormat,
  UnlitMaterial,
  Vector3,
  WebGLEngine
} from "@galacean/engine";
import { initScreenshot, updateForE2E } from "./.mockForE2E";

export interface PrimitiveMeshExample {
  label: string;
  detail: string;
  mesh: ModelMesh;
  rotation?: Vector3;
  wireframe?: boolean;
  appearance?: "checker" | "solid" | "groups";
}

/**
 * Shared presentation for the primitive mesh visual regression cases.
 */
export class PrimitiveMeshGallery {
  private readonly _root: Entity;
  private readonly _camera: Camera;
  private readonly _font: Font;

  constructor(readonly engine: WebGLEngine) {
    const scene = engine.sceneManager.activeScene!;
    scene.background.solidColor.set(0.035, 0.045, 0.065, 1);
    scene.ambientLight.diffuseSolidColor.set(0.3, 0.3, 0.3, 1);
    this._root = scene.createRootEntity("Primitive features");
    const cameraEntity = this._root.createChild("Camera");
    cameraEntity.transform.setPosition(0, 0, 30);
    this._camera = cameraEntity.addComponent(Camera);
    this._camera.isOrthographic = true;
    this._camera.farClipPlane = 100;
    const light = this._root.createChild("Light");
    light.transform.setRotation(35, -35, 0);
    light.addComponent(DirectLight).color.set(0.8, 0.8, 0.8, 1);
    this._font = Font.createFromOS(engine, "AlibabaSans")!;
  }

  static async create(): Promise<PrimitiveMeshGallery> {
    await document.fonts.load('26px "AlibabaSans"');
    const engine = await WebGLEngine.create({ canvas: "canvas" });
    engine.canvas.setAutoResolution(2);
    return new PrimitiveMeshGallery(engine);
  }

  show(title: string, examples: PrimitiveMeshExample[], columns: number): void {
    const rows = Math.ceil(examples.length / columns);
    this._camera.orthographicSize = Math.max((rows * 3.3) / 2 + 1, (columns * 3.5) / 3 + 0.1);
    const checker = new BlinnPhongMaterial(this.engine);
    checker.baseTexture = this._createChecker();
    checker.specularColor.set(0.15, 0.15, 0.15, 1);
    const solid = new BlinnPhongMaterial(this.engine);
    solid.baseColor.set(0.45, 0.69, 0.85, 1);
    solid.specularColor.set(0.15, 0.15, 0.15, 1);
    const wire = new UnlitMaterial(this.engine);
    wire.baseColor.set(0.025, 0.07, 0.1, 1);
    wire.isTransparent = true;
    const groupColors = [
      [0.3, 0.65, 0.95],
      [1, 0.65, 0.25],
      [0.55, 0.85, 0.45],
      [0.95, 0.4, 0.5],
      [0.75, 0.5, 0.95],
      [0.3, 0.85, 0.8]
    ];
    const groups = groupColors.map(([r, g, b]) => {
      const material = solid.clone();
      material.baseColor.set(r, g, b, 1);
      return material;
    });

    this._createLabel(title, 0, ((rows - 1) / 2) * 3.3 + 1.85, 34);
    examples.forEach(({ label, detail, mesh, rotation, wireframe, appearance = "checker" }, index) => {
      const { min, max } = mesh.bounds;
      if (mesh.vertexCount === 0 || ![min.x, min.y, min.z, max.x, max.y, max.z].every(Number.isFinite)) {
        throw new Error(`Invalid primitive in gallery: ${label}`);
      }
      const row = Math.floor(index / columns);
      const rowColumns = Math.min(columns, examples.length - row * columns);
      const x = ((index % columns) - (rowColumns - 1) / 2) * 3.5;
      const y = ((rows - 1) / 2 - row) * 3.3;
      const pivot = this._root.createChild(label);
      pivot.transform.setPosition(x, y + 0.25, 0);
      pivot.transform.rotation = rotation ?? new Vector3(22, -28, 0);
      const scale = 1.7 / Math.max(max.x - min.x, max.y - min.y, max.z - min.z);
      pivot.transform.setScale(scale, scale, scale);
      const entity = pivot.createChild("Surface");
      entity.transform.setPosition(-(min.x + max.x) / 2, -(min.y + max.y) / 2, -(min.z + max.z) / 2);
      const renderer = entity.addComponent(MeshRenderer);
      renderer.mesh = mesh;
      renderer.setMaterials(
        mesh.subMeshes.map((_, slot) =>
          wireframe
            ? solid
            : appearance === "groups"
              ? groups[slot % groups.length]
              : appearance === "solid"
                ? solid
                : checker
        )
      );
      if (wireframe) {
        const lines = entity.createChild("Triangle edges").addComponent(MeshRenderer);
        lines.mesh = this._createWireframe(mesh);
        lines.setMaterial(wire);
      }
      this._createLabel(label, x, y - 1.1, 26);
      this._createLabel(detail, x, y - 1.45, 19);
    });
    updateForE2E(this.engine);
    initScreenshot(this.engine, this._camera, 1800, Math.max(1200, rows * 300));
  }

  private _createWireframe(mesh: ModelMesh): ModelMesh {
    const indices = mesh.getIndices()!;
    const lines: number[] = [];
    const edges = new Set<string>();
    for (let i = 0; i < indices.length; i += 3) {
      for (let edge = 0; edge < 3; edge++) {
        const a = indices[i + edge];
        const b = indices[i + ((edge + 1) % 3)];
        const key = `${Math.min(a, b)}:${Math.max(a, b)}`;
        if (!edges.has(key)) {
          edges.add(key);
          lines.push(a, b);
        }
      }
    }
    const wireframe = new ModelMesh(this.engine);
    const normals = mesh.getNormals()!;
    const { min, max } = mesh.bounds;
    const offset = Math.max(max.x - min.x, max.y - min.y, max.z - min.z) * 0.001;
    wireframe.setPositions(
      mesh.getPositions()!.map((point, index) => {
        const normal = normals[index];
        return new Vector3(point.x + normal.x * offset, point.y + normal.y * offset, point.z + normal.z * offset);
      })
    );
    wireframe.setIndices(new Uint32Array(lines));
    wireframe.addSubMesh(0, lines.length, MeshTopology.Lines);
    wireframe.bounds.min.copyFrom(mesh.bounds.min);
    wireframe.bounds.max.copyFrom(mesh.bounds.max);
    wireframe.uploadData(true);
    return wireframe;
  }

  private _createChecker(): Texture2D {
    const size = 64;
    const pixels = new Uint8Array(size * size * 4);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const dark = ((x >> 3) + (y >> 3)) % 2 === 0;
        const color = x < 2 ? [240, 82, 85] : y < 2 ? [246, 187, 62] : dark ? [40, 110, 165] : [225, 238, 248];
        const offset = (y * size + x) * 4;
        pixels.set([...color, 255], offset);
      }
    }
    const texture = new Texture2D(this.engine, size, size, TextureFormat.R8G8B8A8, true);
    texture.setPixelBuffer(pixels);
    texture.generateMipmaps();
    texture.filterMode = TextureFilterMode.Trilinear;
    return texture;
  }

  private _createLabel(text: string, x: number, y: number, fontSize: number): void {
    const entity = this._root.createChild(text);
    entity.transform.setPosition(x, y, 0);
    const renderer = entity.addComponent(TextRenderer);
    renderer.font = this._font;
    renderer.fontSize = fontSize;
    renderer.text = text;
    renderer.color.set(0.86, 0.91, 0.98, 1);
  }
}
