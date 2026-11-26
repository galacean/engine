import {
  Texture2D,
  Texture2DArray,
  TextureFilterMode,
  TextureFormat,
  TextureWrapMode,
  type Engine
} from "@galacean/engine";
import { restoreResource } from "@galacean/engine-project/rendering/RestorableResources";
import { retainBuildingResource } from "../resources/BuildingAssetKit";
import type { BuildingWallBakeTexture } from "./BuildingWallBakeBinding";

type Source = BuildingWallBakeTexture;
type Transform = { sx: number; sy: number; ox: number; oy: number; layer: number };
interface SharedPages {
  texture: Texture2D | Texture2DArray;
  transforms: ReadonlyMap<Source, Transform>;
  owner: Source["page"];
  leases: number;
}

const caches = new WeakMap<Engine, Map<string, SharedPages>>();
const additionalPages = new WeakMap<Source["page"], number>();
export function additionalWallBakePageCount(page: Source["page"]): number {
  return additionalPages.get(page) ?? 0;
}

const sourceIds = new WeakMap<Source, number>();
const identity: Transform = { sx: 1, sy: 1, ox: 0, oy: 0, layer: 0 };
let nextSourceId = 0;

function id(source: Source): number {
  let result = sourceIds.get(source);
  if (result === undefined) sourceIds.set(source, (result = ++nextSourceId));
  return result;
}

/** The unit fields already include an outer ring of black texels. Preserve every
 * texel, including those gutters, when packing onto rows and array layers. */
function pack(sources: readonly Source[], rowWidth: number, limit: number) {
  const tiles: { source: Source; left: number; bottom: number; layer: number }[] = [];
  let x = 0,
    y = 0,
    layer = 0,
    rowHeight = 0,
    width = 0,
    height = 0;
  for (const source of sources) {
    const { width: w, height: h } = source.placement;
    if (w > limit || h > limit) throw Error("Building wall lightmap exceeds the device texture dimensions");
    if (x + w > rowWidth) {
      x = 0;
      y += rowHeight;
      rowHeight = 0;
    }
    if (y + h > limit) {
      x = y = rowHeight = 0;
      layer++;
    }
    tiles.push({ source, left: x, bottom: y, layer });
    x += w;
    rowHeight = Math.max(rowHeight, h);
    width = Math.max(width, x);
    height = Math.max(height, y + h);
  }
  return { tiles, width, height, layers: layer + 1 };
}

function copyPages(engine: Engine, sources: Source[]): SharedPages {
  const device = engine._hardwareRenderer;
  const limit = device.capability.maxTextureSize;
  let area = 0,
    widest = 0;
  for (const { placement } of sources) {
    area += placement.width * placement.height;
    widest = Math.max(widest, placement.width);
  }
  const rowWidth = Math.min(limit, Math.max(widest, Math.ceil(Math.sqrt(area))));
  sources.sort(
    (a, b) => b.placement.height - a.placement.height || b.placement.width - a.placement.width || id(a) - id(b)
  );
  let packed = pack(sources, rowWidth, limit);
  if (packed.layers > 1 && rowWidth < limit) packed = pack(sources, limit, limit);
  const { tiles, width, height, layers } = packed;
  if (layers > 1 && layers > device.gl.getParameter(device.gl.MAX_ARRAY_TEXTURE_LAYERS)) {
    throw Error("Building wall lightmap exceeds the device array layer limit");
  }
  const texture =
    layers === 1
      ? new Texture2D(engine, width, height, TextureFormat.R16_SFloat, false, false)
      : new Texture2DArray(engine, width, height, layers, TextureFormat.R16_SFloat, false, false);
  retainBuildingResource(texture, 1);
  try {
    texture.filterMode = TextureFilterMode.Bilinear;
    texture.wrapModeU = texture.wrapModeV = TextureWrapMode.Clamp;
    const transforms = new Map<Source, Transform>();
    const uploads = tiles.map(({ source, left, bottom, layer }) => {
      const { page, placement } = source;
      const pixels = page.copyPixels(placement);
      transforms.set(source, {
        sx: page.texture.width / width,
        sy: page.texture.height / height,
        ox: (left - placement.x) / width,
        oy: (bottom - placement.y) / height,
        layer
      });
      return { pixels, left, bottom, layer, width: placement.width, height: placement.height };
    });
    const upload = () => {
      for (const { pixels, left, bottom, layer, width, height } of uploads) {
        if (texture instanceof Texture2DArray) texture.setPixelBuffer(layer, pixels, 0, left, bottom, width, height, 1);
        else texture.setPixelBuffer(pixels, 0, left, bottom, width, height);
      }
    };
    upload();
    restoreResource(texture, upload);
    const owner = sources[0].page;
    additionalPages.set(owner, additionalWallBakePageCount(owner) + 1);
    return { texture, transforms, owner, leases: 0 };
  } catch (error) {
    retainBuildingResource(texture, -1);
    texture.destroy();
    throw error;
  }
}

/** Use the scene's page directly when possible. Buildings with the same set of
 * tiles on multiple pages share one sampler view regardless of lamp order. */
export function acquireWallBakePages(engine: Engine, textures: readonly Source[]) {
  if (!textures.length) throw Error("A building wall lightmap view needs a source texture");
  const { page } = textures[0];
  if (textures.every((source) => source.page === page)) {
    return { texture: page.texture, transforms: textures.map(() => identity), release() {} };
  }

  const sources = [...new Set(textures)];
  const key = sources
    .map(id)
    .sort((a, b) => a - b)
    .join(",");
  let cache = caches.get(engine);
  if (!cache) caches.set(engine, (cache = new Map()));
  let shared = cache.get(key);
  if (!shared) cache.set(key, (shared = copyPages(engine, sources)));
  shared.leases++;
  let released = false;
  return {
    texture: shared.texture,
    transforms: textures.map((source) => shared.transforms.get(source)!),
    release() {
      if (released) return;
      released = true;
      if (--shared.leases > 0) return;
      cache.delete(key);
      additionalPages.set(shared.owner, additionalWallBakePageCount(shared.owner) - 1);
      retainBuildingResource(shared.texture, -1);
      shared.texture.destroy();
    }
  };
}
