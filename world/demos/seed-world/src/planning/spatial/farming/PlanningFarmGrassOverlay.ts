import { Scene, Texture2D, TextureFilterMode, TextureFormat, TextureWrapMode, Vector4 } from "@galacean/engine";
import { restoreResource } from "@galacean/engine-modify/rendering/RestorableResources";

import { SEED_WORLD_GRASS_COVERAGE_RANGE } from "@galacean/engine-world-planning/runtime/SeedWorldGrassAppearance";

export interface FarmGrassTile {
  readonly x: number;
  readonly z: number;
  readonly resolution: number;
  /** Published tile identity is the dirty token. Replace the tile after baking; do not mutate its pixels. */
  readonly pixels: Uint8Array;
  /** Committed coverage while this tile previews a new plot; absent means both channels agree. */
  readonly beforePixels?: Uint8Array;
}

/** Sparse atlas of the exact ground masks. Empty space costs a page-table texel, not a high-resolution mask. */
function pageDomain(tiles: readonly Pick<FarmGrassTile, "x" | "z">[], size: number, maximum = Infinity) {
  const x = Math.min(...tiles.map((tile) => tile.x));
  const z = Math.min(...tiles.map((tile) => tile.z));
  const width = Math.round((Math.max(...tiles.map((tile) => tile.x)) - x) / size) + 1;
  const height = Math.round((Math.max(...tiles.map((tile) => tile.z)) - z) / size) + 1;
  if (width > maximum || height > maximum)
    throw new RangeError(`Farm page table ${width}x${height} exceeds device texture limit ${maximum}`);
  return { x, z, width, height };
}

export function packFarmGrassTiles(
  tiles: readonly FarmGrassTile[],
  size: number,
  slots?: readonly number[],
  maximum = Infinity
) {
  const resolution = tiles[0].resolution;
  const slotCount = slots ? Math.max(...slots) + 1 : tiles.length;
  const columns = Math.ceil(Math.sqrt(slotCount));
  const rows = Math.ceil(slotCount / columns);
  const { x, z, width, height } = pageDomain(tiles, size, maximum);
  const pages = new Uint8Array(width * height * 4);
  tiles.forEach((tile, index) => {
    const slot = slots?.[index] ?? index;
    const offset = (Math.round((tile.z - z) / size) * width + Math.round((tile.x - x) / size)) * 4;
    // Zero is an unmapped page. Two bytes permit more than 255 resident chunks.
    pages[offset] = (slot + 1) % 256;
    pages[offset + 1] = Math.floor((slot + 1) / 256);
  });
  return { resolution, columns, rows, x, z, width, height, pages };
}

/** Bound both dimensions before allocating. Two page-code bytes reserve zero for unmapped cells. */
export function planFarmGrassAtlas(resolution: number, slots: number, previousCapacity: number, maximum: number) {
  if (!Number.isInteger(maximum) || maximum < 1 || !Number.isInteger(resolution) || resolution < 2)
    throw new RangeError("Invalid farm atlas texture dimensions");
  const maximumColumns = Math.floor(maximum / resolution);
  const maximumSlots = Math.min(65535, maximumColumns * maximumColumns);
  if (slots > maximumSlots || slots < 1)
    throw new RangeError(
      `Farm atlas needs ${slots} tiles of ${resolution}x${resolution}; device texture limit ${maximum} fits ${maximumSlots}`
    );
  const capacity = Math.min(maximumSlots, Math.max(previousCapacity, 2 ** Math.ceil(Math.log2(Math.max(4, slots)))));
  const columns = Math.min(maximumColumns, 2 ** Math.ceil(Math.log2(Math.sqrt(capacity))));
  return { capacity, columns, width: columns * resolution, height: Math.ceil(capacity / columns) * resolution };
}

const owners = new WeakMap<Scene, PlanningFarmGrassOverlay>();
const macro = "SCENE_FARM_GROUND_APPEARANCE";

/** Scene binding reaches both existing and subsequently streamed grass without rebuilding vegetation. */
export class PlanningFarmGrassOverlay {
  private atlas?: Texture2D;
  private pages?: Texture2D;
  private color?: Texture2D;
  private disposed = false;
  private residents = new Map<string, { tile: FarmGrassTile; slot: number }>();
  private freeSlots: number[] = [];
  private nextSlot = 0;
  private columns = 0;
  private capacity = 0;
  private size = 0;
  private layout?: ReturnType<typeof packFarmGrassTiles>;
  private readonly maximumTextureSize: number;
  private revealProgress = 1;

  constructor(private readonly scene: Scene) {
    const canvas = (scene.engine.canvas as unknown as { _webCanvas: HTMLCanvasElement | OffscreenCanvas })._webCanvas;
    const context = canvas.getContext("webgl2") as WebGL2RenderingContext | null;
    if (!context) throw new Error("Farm ground appearance requires WebGL2");
    this.maximumTextureSize = Number(context.getParameter(context.MAX_TEXTURE_SIZE));
  }

  /** Let the land owner reject an unsupported footprint before changing its meshes or masks. */
  validateLayout(tiles: readonly Pick<FarmGrassTile, "x" | "z">[], size: number, resolution: number): void {
    if (!tiles.length) return;
    const reset = !this.layout || this.size !== size || this.layout.resolution !== resolution;
    planFarmGrassAtlas(
      resolution,
      reset ? tiles.length : Math.max(this.nextSlot, tiles.length),
      reset ? 0 : this.capacity,
      this.maximumTextureSize
    );
    pageDomain(tiles, size, this.maximumTextureSize);
  }

  setColor(texture: Texture2D): void {
    if (this.disposed) return;
    this.color = texture;
    this.bind();
  }

  beginReveal(): void {
    this.seek(0);
  }

  /** Only the common reveal progress changes during tool playback. */
  seek(progress: number): void {
    if (this.disposed) return;
    this.revealProgress = progress;
    if (owners.get(this.scene) === this) this.scene.shaderData.setFloat("scene_FarmWorkReveal", progress);
  }

  update(tiles: readonly FarmGrassTile[], size: number): void {
    if (this.disposed) return;
    if (!tiles.length) {
      this.clearBinding();
      this.releaseMasks();
      return;
    }
    const resolution = tiles[0].resolution;
    this.validateLayout(tiles, size, resolution);
    let pageDirty = !this.layout || this.size !== size || this.layout.resolution !== resolution;
    const nextResidents = pageDirty
      ? new Map<string, { tile: FarmGrassTile; slot: number }>()
      : new Map(this.residents);
    const freeSlots = pageDirty ? [] : this.freeSlots.slice();
    let nextSlot = pageDirty ? 0 : this.nextSlot;
    const previousCapacity = pageDirty ? 0 : this.capacity;
    const key = (tile: FarmGrassTile) => `${tile.x},${tile.z}`;
    const retained = new Set(tiles.map(key));
    for (const [id, resident] of nextResidents) {
      if (retained.has(id)) continue;
      freeSlots.push(resident.slot);
      nextResidents.delete(id);
      pageDirty = true;
    }
    const dirty: { tile: FarmGrassTile; slot: number }[] = [];
    for (const tile of tiles) {
      const id = key(tile),
        previous = nextResidents.get(id);
      if (previous?.tile === tile) continue;
      const slot = previous?.slot ?? freeSlots.pop() ?? nextSlot++;
      const resident = { tile, slot };
      nextResidents.set(id, resident);
      dirty.push(resident);
      if (!previous) pageDirty = true;
    }
    if (!pageDirty && !dirty.length) return;
    const residents = [...nextResidents.values()];
    const p = pageDirty
      ? packFarmGrassTiles(
          residents.map((r) => r.tile),
          size,
          residents.map((r) => r.slot),
          this.maximumTextureSize
        )
      : this.layout!;
    // Stable slots plus geometric growth: local edits upload only dirty masks. Removing chunks
    // frees slots without moving surviving tiles or shrinking/reallocating their atlas.
    const plan = planFarmGrassAtlas(resolution, nextSlot, previousCapacity, this.maximumTextureSize);
    const { width: atlasWidth, height: atlasHeight, columns } = plan;
    let atlas: Texture2D | undefined, pages: Texture2D | undefined;
    try {
      atlas = this.texture(this.atlas, atlasWidth, atlasHeight, TextureFormat.R8G8, TextureFilterMode.Bilinear);
      pages = this.texture(this.pages, p.width, p.height, TextureFormat.R8G8B8A8, TextureFilterMode.Point);
      // Vertex-centred masks contain their own shared boundary samples, so bilinear reads never cross tile slots.
      this.uploadTiles(atlas, atlas === this.atlas ? dirty : residents, columns, resolution);
      if (pageDirty || pages !== this.pages) pages.setPixelBuffer(p.pages);
    } catch (error) {
      if (atlas !== this.atlas) atlas?.destroy(true);
      if (pages !== this.pages) pages?.destroy(true);
      throw error;
    }
    const oldAtlas = this.atlas,
      oldPages = this.pages;
    this.atlas = atlas;
    this.pages = pages;
    this.residents = nextResidents;
    this.freeSlots = freeSlots;
    this.nextSlot = nextSlot;
    this.capacity = plan.capacity;
    this.columns = columns;
    this.size = size;
    this.layout = p;
    if (oldAtlas !== atlas)
      restoreResource(atlas, () => {
        if (this.atlas === atlas && this.layout)
          this.uploadTiles(atlas, this.residents.values(), this.columns, this.layout.resolution);
      });
    if (oldPages !== pages)
      restoreResource(pages, () => {
        if (this.pages === pages && this.layout) pages.setPixelBuffer(this.layout.pages);
      });
    this.scene.shaderData.setVector4("scene_FarmGroundDomain", new Vector4(p.x, p.z, size, p.resolution));
    this.scene.shaderData.setVector4(
      "scene_FarmGroundAtlasSize",
      new Vector4(atlasWidth, atlasHeight, this.columns, 4)
    );
    this.scene.shaderData.setVector4(
      "scene_FarmGroundPageSize",
      new Vector4(p.width, p.height, SEED_WORLD_GRASS_COVERAGE_RANGE.minimum, SEED_WORLD_GRASS_COVERAGE_RANGE.maximum)
    );
    this.bind();
    if (oldAtlas !== atlas) oldAtlas?.destroy(true);
    if (oldPages !== pages) oldPages?.destroy(true);
  }

  private uploadTiles(
    texture: Texture2D,
    residents: Iterable<{ tile: FarmGrassTile; slot: number }>,
    columns: number,
    resolution: number
  ): void {
    for (const { tile, slot } of residents) {
      const pixels = new Uint8Array(tile.pixels.length * 2);
      for (let i = 0; i < tile.pixels.length; i++) {
        pixels[i * 2] = tile.beforePixels?.[i] ?? tile.pixels[i];
        pixels[i * 2 + 1] = tile.pixels[i];
      }
      texture.setPixelBuffer(
        pixels,
        0,
        (slot % columns) * resolution,
        Math.floor(slot / columns) * resolution,
        resolution,
        resolution
      );
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.clearBinding();
    this.releaseMasks();
    // The albedo is borrowed from the farm material/resource cache.
    this.color = undefined;
  }

  private bind(): void {
    if (!this.atlas || !this.pages || !this.color) return;
    owners.set(this.scene, this);
    const data = this.scene.shaderData;
    data.setTexture("scene_FarmGroundCoverage", this.atlas);
    data.setTexture("scene_FarmGroundPages", this.pages);
    data.setTexture("scene_FarmGroundColor", this.color);
    data.setFloat("scene_FarmWorkReveal", this.revealProgress);
    data.enableMacro(macro);
  }

  private clearBinding(): void {
    if (owners.get(this.scene) !== this) return;
    owners.delete(this.scene);
    const data = this.scene.shaderData;
    data.disableMacro(macro);
    data.setTexture("scene_FarmGroundCoverage", null!);
    data.setTexture("scene_FarmGroundPages", null!);
    data.setTexture("scene_FarmGroundColor", null!);
  }

  private releaseMasks(): void {
    this.atlas?.destroy(true);
    this.pages?.destroy(true);
    this.atlas = this.pages = undefined;
    this.resetSlots();
  }

  private resetSlots(): void {
    this.residents.clear();
    this.freeSlots.length = 0;
    this.nextSlot = this.columns = this.capacity = this.size = 0;
    this.layout = undefined;
  }

  private texture(
    old: Texture2D | undefined,
    width: number,
    height: number,
    format: TextureFormat,
    filter: TextureFilterMode
  ) {
    if (old?.width === width && old.height === height) return old;
    const texture = new Texture2D(this.scene.engine, width, height, format, false, false);
    texture.filterMode = filter;
    texture.wrapModeU = texture.wrapModeV = TextureWrapMode.Clamp;
    return texture;
  }
}
