import {
  Texture2D,
  TextureFormat,
  TextureFilterMode,
  TextureWrapMode,
  type Engine,
  type MeshRenderer
} from "@galacean/engine";
import { Vector4 } from "@galacean/engine";

export interface SelectionIdentity {
  resolve(index: number): string | undefined;
}
interface ArrayIdentity extends SelectionIdentity {
  ids: readonly (string | undefined)[];
  start: number;
}
const EMPTY_IDS: readonly string[] = [];
function resolveArrayIdentity(this: ArrayIdentity, index: number): string | undefined {
  return this.ids[this.start + index];
}

const active = new WeakMap<Engine, WorldSelection>();
interface Binding {
  renderer: MeshRenderer;
  pixels: Uint8Array;
  texture: Texture2D;
  height: number;
  layout: Vector4;
}

/** One selection owner per world engine. Draw producers publish the same identity order used by picking. */
export class WorldSelection {
  private readonly bindings = new Map<MeshRenderer, Binding>();
  private readonly touched = new Set<MeshRenderer>();
  private readonly renderers: MeshRenderer[] = [];
  private readonly arrayIdentity: ArrayIdentity = { ids: EMPTY_IDS, start: 0, resolve: resolveArrayIdentity };
  private id?: string;
  private startedAt = 0;
  private readonly appearance = new Vector4();
  private appearanceFrame = -1;
  private appearanceWidth = 0;
  private appearanceHeight = 0;
  private region?: { texture: Texture2D; layout: Vector4 };
  get hasSelection(): boolean {
    return this.id !== undefined;
  }
  constructor(private readonly engine: Engine) {
    active.set(engine, this);
  }
  select(id?: string): boolean {
    if (this.id === id) return false;
    this.clear();
    this.id = id;
    this.startedAt = this.engine.time.actualElapsedTime;
    this.appearanceFrame = -1;
    return true;
  }
  /** Rasterize once per selection; normal terrain fragments sample this world-space mask. */
  setRegion(polygons: readonly (readonly (readonly { x: number; z: number }[])[])[]): void {
    if (this.region) {
      for (const renderer of this.renderers)
        if (
          !renderer.destroyed &&
          renderer.shaderData.getTexture("renderer_WorldSelectionTexture") === this.region.texture
        ) {
          renderer.shaderData.setFloat("renderer_WorldSelectionMode", 0);
          renderer.shaderData.setTexture("renderer_WorldSelectionTexture", null!);
        }
      this.region.texture.destroy();
      this.region = undefined;
    }
    const points = polygons.flat(2);
    if (!points.length) return;
    let minX = Infinity,
      minZ = Infinity,
      maxX = -Infinity,
      maxZ = -Infinity;
    for (const point of points) {
      minX = Math.min(minX, point.x);
      minZ = Math.min(minZ, point.z);
      maxX = Math.max(maxX, point.x);
      maxZ = Math.max(maxZ, point.z);
    }
    if (maxX <= minX || maxZ <= minZ) return;
    const width = Math.max(2, Math.min(2048, Math.ceil((maxX - minX) * 4)));
    const height = Math.max(2, Math.min(2048, Math.ceil((maxZ - minZ) * 4)));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d")!;
    context.fillStyle = "white";
    for (const rings of polygons) {
      context.beginPath();
      for (const ring of rings) {
        for (let i = 0; i < ring.length; i++) {
          const point = ring[i]!;
          const x = ((point.x - minX) / (maxX - minX)) * width,
            y = ((point.z - minZ) / (maxZ - minZ)) * height;
          if (i === 0) context.moveTo(x, y);
          else context.lineTo(x, y);
        }
        context.closePath();
      }
      context.fill("evenodd");
    }
    const texture = new Texture2D(this.engine, width, height, TextureFormat.R8G8B8A8, false, false);
    texture.filterMode = TextureFilterMode.Bilinear;
    texture.wrapModeU = texture.wrapModeV = TextureWrapMode.Clamp;
    try {
      texture.setPixelBuffer(context.getImageData(0, 0, width, height).data);
      this.region = { texture, layout: new Vector4(minX, minZ, 1 / (maxX - minX), 1 / (maxZ - minZ)) };
    } catch (error) {
      texture.destroy();
      throw error;
    }
  }
  private touch(renderer: MeshRenderer): void {
    if (!this.touched.has(renderer)) {
      this.touched.add(renderer);
      this.renderers.push(renderer);
    }
  }
  private updateAppearance(renderer: MeshRenderer): void {
    const frame = this.engine.time.frameCount,
      width = this.engine.canvas.width,
      height = this.engine.canvas.height;
    if (frame !== this.appearanceFrame || width !== this.appearanceWidth || height !== this.appearanceHeight) {
      this.appearanceFrame = frame;
      this.appearanceWidth = width;
      this.appearanceHeight = height;
      const age = Math.max(0, this.engine.time.actualElapsedTime - this.startedAt);
      this.appearance.set((age % 2.4) / 2.4, 1 / Math.max(1, width), 1 / Math.max(1, height), Math.min(1, age / 0.2));
    }
    renderer.shaderData.setVector4("renderer_WorldSelectionAppearance", this.appearance);
  }
  applyRegion(renderer: MeshRenderer): void {
    if (!this.region) return;
    this.updateAppearance(renderer);
    this.touch(renderer);
    renderer.shaderData.setFloat("renderer_WorldSelectionMode", 3);
    renderer.shaderData.setTexture("renderer_WorldSelectionTexture", this.region.texture);
    renderer.shaderData.setVector4("renderer_WorldSelectionLayout", this.region.layout);
  }
  applyIds(renderer: MeshRenderer, count: number, ids: readonly (string | undefined)[], start = 0): void {
    this.arrayIdentity.ids = ids;
    this.arrayIdentity.start = start;
    try {
      this.apply(renderer, count, this.arrayIdentity);
    } finally {
      this.arrayIdentity.ids = EMPTY_IDS;
    }
  }
  apply(renderer: MeshRenderer, count: number, source: SelectionIdentity): void {
    if (!this.id) return;
    let selected = 0;
    for (let i = 0; i < count; i++) if (source.resolve(i) === this.id) selected++;
    renderer.shaderData.setFloat("renderer_WorldSelectionMode", selected === 0 ? 0 : selected === count ? 1 : 2);
    if (selected) {
      this.updateAppearance(renderer);
      this.touch(renderer);
    }
    if (!selected || selected === count) return;
    const width = 256,
      requiredHeight = Math.max(1, Math.ceil(count / width));
    let binding = this.bindings.get(renderer);
    const height =
      binding && binding.height >= requiredHeight ? binding.height : 2 ** Math.ceil(Math.log2(requiredHeight));
    const pixels = binding?.height === height ? binding.pixels : new Uint8Array(width * height * 4);
    let dirty = !binding || binding.height !== height;
    for (let i = 0; i < count; i++) {
      const value = source.resolve(i) === this.id ? 255 : 0;
      if (pixels[i * 4] !== value) {
        pixels[i * 4] = value;
        dirty = true;
      }
    }
    if (!binding || binding.height !== height) {
      binding?.texture.destroy();
      const texture = new Texture2D(this.engine, width, height, TextureFormat.R8G8B8A8, false, false);
      texture.filterMode = TextureFilterMode.Point;
      texture.wrapModeU = texture.wrapModeV = TextureWrapMode.Clamp;
      binding = { renderer, pixels, texture, height, layout: new Vector4(width, height, 0, 0) };
      this.bindings.set(renderer, binding);
    }
    if (dirty) binding.texture.setPixelBuffer(pixels);
    renderer.shaderData.setTexture("renderer_WorldSelectionTexture", binding.texture);
    renderer.shaderData.setVector4("renderer_WorldSelectionLayout", binding.layout);
  }
  sweep(): void {
    for (let i = this.renderers.length - 1; i >= 0; i--) {
      const renderer = this.renderers[i]!;
      if (!renderer.destroyed) continue;
      this.bindings.get(renderer)?.texture.destroy();
      this.bindings.delete(renderer);
      this.touched.delete(renderer);
      this.renderers[i] = this.renderers[this.renderers.length - 1]!;
      this.renderers.pop();
    }
  }
  clear(): void {
    for (const renderer of this.renderers)
      if (!renderer.destroyed) {
        renderer.shaderData.setFloat("renderer_WorldSelectionMode", 0);
        renderer.shaderData.setTexture("renderer_WorldSelectionTexture", null!);
      }
    this.id = undefined;
    this.region?.texture.destroy();
    this.region = undefined;
  }
  dispose(): void {
    this.clear();
    for (const binding of this.bindings.values()) binding.texture.destroy();
    this.bindings.clear();
    this.touched.clear();
    this.renderers.length = 0;
    if (active.get(this.engine) === this) active.delete(this.engine);
  }
}

export function updateWorldSelectionBatch(
  renderer: MeshRenderer,
  count: number,
  ids: readonly (string | undefined)[],
  start = 0
): void {
  active.get(renderer.engine)?.applyIds(renderer, count, ids, start);
}
