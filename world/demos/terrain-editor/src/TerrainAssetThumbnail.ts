import {
  AssetType,
  BackgroundMode,
  BoundingBox,
  Camera,
  Color,
  DirectLight,
  type Entity,
  type GLTFResource,
  Layer,
  MeshRenderer,
  PrimitiveMesh,
  RenderTarget,
  Renderer,
  Texture2D,
  TextureFormat,
  UnlitMaterial,
  Vector3,
  WebGLEngine
} from "@galacean/engine";
import type {
  TerrainProjectResolvedGeometry,
  TerrainProjectResolvedRenderer
} from "@galacean/engine-terrain/terrain/project/TerrainProjectAsset";

const MINIMUM_THUMBNAIL_SIZE = 64;
const MAXIMUM_THUMBNAIL_SIZE = 512;

/** Canvas-captured preview for one user-selected editor asset. */
export interface TerrainAssetThumbnail {
  /** Original browser file name. */
  readonly name: string;
  /** Asset capability inferred from the uploaded file. */
  readonly kind: "model" | "texture";
  /** PNG screenshot bytes generated from the preview canvas. */
  readonly image: Blob;
}

/** Optional renderer selection used when one glTF stores several authored LOD meshes. */
export interface TerrainAssetThumbnailRenderOptions {
  /** Exact `meshes[group][primitive]` keys that represent the Prefab's first authored renderer level. */
  readonly meshKeys?: readonly string[];
}

/**
 * Produces the opaque texture-card image shared by Terrain asset palettes.
 * @param source Encoded image data selected from a Project resource.
 * @param size Square output size in physical pixels.
 * @returns PNG thumbnail bytes with an opaque alpha channel.
 * @throws If the image cannot be decoded or the browser cannot encode the result.
 */
export async function renderOpaqueTerrainTextureThumbnail(source: Blob, size = 160): Promise<Blob> {
  requireThumbnailSize(size);
  const bitmap = await createImageBitmap(source, { premultiplyAlpha: "none" });
  try {
    const canvas = createThumbnailCanvas(size);
    const context = requireCanvasContext(canvas);
    context.drawImage(bitmap, 0, 0, size, size);
    const pixels = context.getImageData(0, 0, size, size);
    for (let offset = 3; offset < pixels.data.length; offset += 4) pixels.data[offset] = 255;
    context.putImageData(pixels, 0, 0);
    return canvasToPng(canvas);
  } finally {
    bitmap.close();
  }
}

/**
 * Renders a Project-loaded texture through the engine before capturing an opaque PNG thumbnail.
 * @param engine Engine that owns the loaded texture and active Project Scene.
 * @param texture Texture resolved by the standard Project resource pipeline.
 * @param size Square output size in physical pixels.
 * @returns PNG thumbnail bytes produced from the sampled GPU texture.
 * @throws If the texture belongs to another engine or the render target cannot be read.
 */
export async function renderTerrainProjectTextureThumbnail(
  engine: WebGLEngine,
  texture: Texture2D,
  size = 160
): Promise<Blob> {
  requireThumbnailSize(size);
  if (texture.engine !== engine) throw new Error("Project texture thumbnail requires a texture owned by its engine");
  const scene = engine.sceneManager.activeScene!;
  const sceneCameras: Camera[] = [];
  for (const entity of scene.rootEntities) entity.getComponentsIncludeChildren(Camera, sceneCameras);
  const sceneCameraMasks = sceneCameras.map((camera) => camera.cullingMask);
  for (const camera of sceneCameras) camera.cullingMask = (camera.cullingMask & ~Layer.Layer31) as Layer;

  const root = scene.createRootEntity("Texture thumbnail capture");
  root.layer = Layer.Layer31;
  const renderer = root.addComponent(MeshRenderer);
  const mesh = PrimitiveMesh.createPlane(engine, 2, 2);
  const material = new UnlitMaterial(engine);
  material.baseTexture = texture;
  renderer.mesh = mesh;
  renderer.setMaterial(material);

  const cameraEntity = scene.createRootEntity("Texture thumbnail camera");
  cameraEntity.layer = Layer.Layer31;
  const camera = cameraEntity.addComponent(Camera);
  camera.cullingMask = Layer.Layer31;
  camera.isOrthographic = true;
  camera.orthographicSize = 1;
  cameraEntity.transform.setPosition(0, 1, 0);
  cameraEntity.transform.lookAt(new Vector3(), new Vector3(0, 0, -1));

  const colorTexture = new Texture2D(engine, size, size, TextureFormat.R8G8B8A8, false);
  const renderTarget = new RenderTarget(engine, size, size, colorTexture, TextureFormat.Depth, 1);
  const previousBackgroundMode = scene.background.mode;
  const previousBackgroundColor = scene.background.solidColor.clone();
  camera.renderTarget = renderTarget;
  let output: HTMLCanvasElement;
  try {
    scene.background.mode = BackgroundMode.SolidColor;
    scene.background.solidColor = new Color(0, 0, 0, 1);
    camera.render();
    camera.render();
    const pixels = new Uint8ClampedArray(size * size * 4);
    colorTexture.getPixelBuffer(0, 0, size, size, 0, pixels);
    for (let offset = 3; offset < pixels.length; offset += 4) pixels[offset] = 255;
    output = createThumbnailCanvas(size);
    requireCanvasContext(output).putImageData(new ImageData(pixels, size, size), 0, 0);
  } finally {
    camera.renderTarget = null;
    scene.background.mode = previousBackgroundMode;
    scene.background.solidColor = previousBackgroundColor;
    for (let index = 0; index < sceneCameras.length; index++) sceneCameras[index].cullingMask = sceneCameraMasks[index];
    renderTarget.destroy();
    colorTexture.destroy();
    cameraEntity.destroy();
    root.destroy();
    material.destroy();
    mesh.destroy();
  }
  return canvasToPng(output);
}

/**
 * Generates isolated canvas screenshots for uploaded texture and binary glTF assets.
 */
export class TerrainAssetThumbnailRenderer {
  private _modelContextPromise: Promise<ModelThumbnailContext> | null = null;
  private _modelQueue: Promise<void> = Promise.resolve();
  private _destroyed = false;

  /**
   * Renders one asset without attaching its temporary canvas or Scene to the editor preview.
   * @param file Uploaded `.glb`, PNG, JPEG, or WebP file.
   * @param size Square thumbnail size in physical pixels.
   * @param options Optional exact mesh selection for Project Prefabs that share one multi-LOD glTF.
   * @returns A PNG screenshot and stable asset capability.
   * @throws If the file type is unsupported, the model has no renderers, or canvas capture fails.
   */
  async render(
    file: File,
    size = 160,
    options: TerrainAssetThumbnailRenderOptions = {}
  ): Promise<TerrainAssetThumbnail> {
    if (this._destroyed) throw new Error("Asset thumbnail renderer has been destroyed");
    requireThumbnailSize(size);
    if (file.type.startsWith("image/") || /\.(?:png|jpe?g|webp)$/i.test(file.name)) {
      return { name: file.name, kind: "texture", image: await renderTextureThumbnail(file, size) };
    }
    if (/\.glb$/i.test(file.name)) {
      const task = this._modelQueue.then(async () => ({
        name: file.name,
        kind: "model" as const,
        image: await this._renderModelThumbnail(file, size, options.meshKeys)
      }));
      this._modelQueue = task.then(
        () => undefined,
        () => undefined
      );
      return task;
    }
    throw new Error(`Unsupported thumbnail asset "${file.name}"`);
  }

  /** Releases the shared offscreen model renderer after queued captures settle. */
  async destroy(): Promise<void> {
    if (this._destroyed) return;
    this._destroyed = true;
    await this._modelQueue;
    const contextPromise = this._modelContextPromise;
    this._modelContextPromise = null;
    if (contextPromise) (await contextPromise).engine.destroy();
  }

  private async _renderModelThumbnail(file: File, size: number, meshKeys?: readonly string[]): Promise<Blob> {
    const context = await (this._modelContextPromise ??= createModelThumbnailContext());
    return renderModelThumbnail(context, file, size, meshKeys);
  }
}

/**
 * Renders one standard Project prototype using its loader-resolved meshes, materials, textures, and Shader bindings.
 * @param engine Loaded Project engine owning every resolved graphics resource.
 * @param geometry Exact Prefab renderer bindings resolved by the Terrain Project loader.
 * @param size Square thumbnail size in physical pixels.
 * @returns A PNG screenshot rendered on an isolated camera layer.
 * @throws If geometry is empty, bounds are invalid, or GPU readback fails.
 */
export async function renderTerrainProjectGeometryThumbnail(
  engine: WebGLEngine,
  geometry: TerrainProjectResolvedGeometry,
  size = 160
): Promise<Blob> {
  requireThumbnailSize(size);
  const scene = engine.sceneManager.activeScene!;
  const sceneLights: DirectLight[] = [];
  const sceneCameras: Camera[] = [];
  for (const entity of scene.rootEntities) entity.getComponentsIncludeChildren(DirectLight, sceneLights);
  for (const entity of scene.rootEntities) entity.getComponentsIncludeChildren(Camera, sceneCameras);
  const sceneLightMasks = sceneLights.map((light) => light.cullingMask);
  const sceneCameraMasks = sceneCameras.map((camera) => camera.cullingMask);
  for (const light of sceneLights) light.cullingMask = (light.cullingMask & ~Layer.Layer31) as Layer;
  for (const camera of sceneCameras) camera.cullingMask = (camera.cullingMask & ~Layer.Layer31) as Layer;
  const root = scene.createRootEntity("Asset thumbnail capture");
  root.layer = Layer.Layer31;
  const contentRoot = root.createChild("Model");
  const bindings = geometry.kind === "lod-group" ? (geometry.lodGroup.lods[0]?.renderers ?? []) : geometry.renderers;
  const renderers = bindings.map((binding, index) => {
    const entity = contentRoot.createChild(`Renderer ${index}`);
    entity.transform.localMatrix = binding.localMatrix.clone();
    const renderer = entity.addComponent(MeshRenderer);
    renderer.mesh = binding.mesh;
    renderer.setMaterial(binding.material);
    renderer.castShadows = binding.castShadows;
    renderer.receiveShadows = binding.receiveShadows;
    renderer.enableVertexColor = binding.enableVertexColor;
    return renderer;
  });
  const lightEntity = root.createChild("Key light");
  const light = lightEntity.addComponent(DirectLight);
  light.cullingMask = Layer.Layer31;
  light.color = new Color(1.05, 1.02, 0.96, 1);
  const cameraEntity = root.createChild("Camera");
  const camera = cameraEntity.addComponent(Camera);
  camera.cullingMask = Layer.Layer31;
  camera.fieldOfView = 35;
  camera.nearClipPlane = 0.01;

  const colorTexture = new Texture2D(engine, size, size, undefined, false);
  const renderTarget = new RenderTarget(engine, size, size, colorTexture, TextureFormat.Depth, 1);
  const previousBackgroundMode = scene.background.mode;
  const previousBackgroundColor = scene.background.solidColor.clone();
  let output: HTMLCanvasElement;
  try {
    const bounds = mergeResolvedRendererBounds(bindings);
    const center = bounds.getCenter(new Vector3());
    const extent = bounds.getExtent(new Vector3());
    const radius = Math.max(extent.length(), 0.01);
    camera.farClipPlane = radius * 20;
    cameraEntity.transform.setPosition(center.x + radius * 1.15, center.y + radius * 0.75, center.z + radius * 2.2);
    cameraEntity.transform.lookAt(center);
    lightEntity.transform.setPosition(center.x - radius, center.y + radius * 2, center.z + radius * 1.5);
    lightEntity.transform.lookAt(center);
    scene.background.mode = BackgroundMode.SolidColor;
    scene.background.solidColor = new Color(0.025, 0.035, 0.045, 1);
    camera.renderTarget = renderTarget;
    camera.render();
    camera.render();
    const pixels = new Uint8ClampedArray(size * size * 4);
    colorTexture.getPixelBuffer(0, 0, size, size, 0, pixels);
    output = createThumbnailCanvas(size);
    requireCanvasContext(output).putImageData(new ImageData(pixels, size, size), 0, 0);
  } finally {
    camera.renderTarget = null;
    scene.background.mode = previousBackgroundMode;
    scene.background.solidColor = previousBackgroundColor;
    for (let index = 0; index < sceneLights.length; index++) sceneLights[index].cullingMask = sceneLightMasks[index];
    for (let index = 0; index < sceneCameras.length; index++) sceneCameras[index].cullingMask = sceneCameraMasks[index];
    renderTarget.destroy();
    colorTexture.destroy();
    root.destroy();
  }
  return canvasToPng(output);
}

interface ModelThumbnailContext {
  readonly engine: WebGLEngine;
  readonly contentRoot: Entity;
  readonly lightEntity: Entity;
  readonly cameraEntity: Entity;
  readonly camera: Camera;
}

async function renderTextureThumbnail(file: File, size: number): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  try {
    const canvas = createThumbnailCanvas(size);
    const context = requireCanvasContext(canvas);
    drawCheckerboard(context, size);
    const scale = Math.min(size / bitmap.width, size / bitmap.height);
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    context.drawImage(bitmap, Math.round((size - width) * 0.5), Math.round((size - height) * 0.5), width, height);
    return canvasToPng(canvas);
  } finally {
    bitmap.close();
  }
}

async function createModelThumbnailContext(): Promise<ModelThumbnailContext> {
  const engine = await WebGLEngine.create({ canvas: createThumbnailCanvas(160) });
  const scene = engine.sceneManager.activeScene!;
  scene.background.solidColor = new Color(0.025, 0.035, 0.045, 1);
  const root = scene.createRootEntity("Asset thumbnails");
  const contentRoot = root.createChild("Model");
  const lightEntity = root.createChild("Key light");
  const light = lightEntity.addComponent(DirectLight);
  light.color = new Color(1.05, 1.02, 0.96, 1);
  const cameraEntity = root.createChild("Camera");
  const camera = cameraEntity.addComponent(Camera);
  camera.fieldOfView = 35;
  camera.nearClipPlane = 0.01;
  return {
    engine,
    contentRoot,
    lightEntity,
    cameraEntity,
    camera
  };
}

async function renderModelThumbnail(
  context: ModelThumbnailContext,
  file: File,
  size: number,
  meshKeys?: readonly string[]
): Promise<Blob> {
  const { engine, contentRoot, lightEntity, cameraEntity, camera } = context;
  const modelUrl = URL.createObjectURL(file);
  let model: Entity | null = null;
  try {
    const resource = await engine.resourceManager.load<GLTFResource>({ type: AssetType.GLTF, url: modelUrl });
    model = resource.instantiateSceneRoot();
    contentRoot.addChild(model);
    const renderers = selectPreviewRenderers(resource, model, meshKeys);
    return renderProjectModelThumbnail(context, renderers, size);
  } finally {
    model?.destroy();
    engine.resourceManager.gc();
    URL.revokeObjectURL(modelUrl);
  }
}

async function renderProjectModelThumbnail(
  context: ModelThumbnailContext,
  renderers: readonly Renderer[],
  size: number
): Promise<Blob> {
  const { engine, lightEntity, cameraEntity, camera } = context;
  const bounds = mergeRendererBounds(renderers);
  const center = bounds.getCenter(new Vector3());
  const extent = bounds.getExtent(new Vector3());
  const radius = Math.max(extent.length(), 0.01);
  camera.farClipPlane = radius * 20;
  cameraEntity.transform.setPosition(center.x + radius * 1.15, center.y + radius * 0.75, center.z + radius * 2.2);
  cameraEntity.transform.lookAt(center);
  lightEntity.transform.setPosition(center.x - radius, center.y + radius * 2, center.z + radius * 1.5);
  lightEntity.transform.lookAt(center);

  const colorTexture = new Texture2D(engine, size, size, undefined, false);
  const renderTarget = new RenderTarget(engine, size, size, colorTexture, TextureFormat.Depth, 1);
  camera.renderTarget = renderTarget;
  try {
    engine.update();
    engine.update();
    const pixels = new Uint8ClampedArray(size * size * 4);
    colorTexture.getPixelBuffer(0, 0, size, size, 0, pixels);
    const output = createThumbnailCanvas(size);
    requireCanvasContext(output).putImageData(new ImageData(pixels, size, size), 0, 0);
    return await canvasToPng(output);
  } finally {
    camera.renderTarget = null;
    renderTarget.destroy();
    colorTexture.destroy();
  }
}

function selectPreviewRenderers(
  resource: GLTFResource,
  model: Entity,
  meshKeys?: readonly string[]
): readonly Renderer[] {
  const renderers: MeshRenderer[] = [];
  model.getComponentsIncludeChildren(MeshRenderer, renderers);
  if (!meshKeys?.length) return renderers;
  const selectedMeshes = new Set<unknown>(
    [...new Set(meshKeys)].map((key) => {
      const match = /^meshes\[(\d+)\]\[(\d+)\]$/.exec(key);
      if (!match) throw new Error(`Asset thumbnail mesh key ${JSON.stringify(key)} is invalid`);
      const mesh = resource.meshes?.[Number(match[1])]?.[Number(match[2])];
      if (!mesh) throw new Error(`Asset thumbnail mesh key ${JSON.stringify(key)} does not exist`);
      return mesh;
    })
  );
  const selected = renderers.filter((renderer) => selectedMeshes.has(renderer.mesh));
  for (const renderer of renderers) renderer.enabled = selected.includes(renderer);
  if (selected.length === 0) throw new Error("Prefab thumbnail renderer selection does not exist in its glTF Scene");
  return selected;
}

function mergeRendererBounds(renderers: readonly Renderer[]): BoundingBox {
  if (renderers.length === 0) throw new Error("Uploaded model contains no renderable geometry");
  const bounds = new BoundingBox(
    new Vector3(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY),
    new Vector3(Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY)
  );
  for (const renderer of renderers) BoundingBox.merge(renderer.bounds, bounds, bounds);
  const extent = bounds.getExtent(new Vector3());
  if (!Number.isFinite(extent.length()) || extent.length() <= 0) {
    throw new Error("Uploaded model has invalid render bounds");
  }
  return bounds;
}

function mergeResolvedRendererBounds(bindings: readonly TerrainProjectResolvedRenderer[]): BoundingBox {
  if (bindings.length === 0) throw new Error("Project prototype contains no renderable geometry");
  const bounds = new BoundingBox(
    new Vector3(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY),
    new Vector3(Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY)
  );
  const transformed = new BoundingBox(new Vector3(), new Vector3());
  for (const binding of bindings) {
    BoundingBox.transform(binding.mesh.bounds, binding.localMatrix, transformed);
    BoundingBox.merge(transformed, bounds, bounds);
  }
  const extent = bounds.getExtent(new Vector3());
  if (!Number.isFinite(extent.length()) || extent.length() <= 0) {
    throw new Error("Project prototype has invalid render bounds");
  }
  return bounds;
}

function createThumbnailCanvas(size: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  return canvas;
}

function requireCanvasContext(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Asset thumbnail canvas 2D context is unavailable");
  return context;
}

function drawCheckerboard(context: CanvasRenderingContext2D, size: number): void {
  const cell = Math.max(8, Math.round(size / 10));
  for (let y = 0; y < size; y += cell) {
    for (let x = 0; x < size; x += cell) {
      context.fillStyle = (x / cell + y / cell) % 2 === 0 ? "#121a22" : "#24313d";
      context.fillRect(x, y, cell, cell);
    }
  }
}

function canvasToPng(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Asset thumbnail canvas produced no PNG data"));
    }, "image/png");
  });
}

function requireThumbnailSize(size: number): void {
  if (!Number.isInteger(size) || size < MINIMUM_THUMBNAIL_SIZE || size > MAXIMUM_THUMBNAIL_SIZE) {
    throw new Error(`Asset thumbnail size must be an integer in [${MINIMUM_THUMBNAIL_SIZE},${MAXIMUM_THUMBNAIL_SIZE}]`);
  }
}
