import {
  Texture2D,
  TextureFilterMode,
  TextureFormat,
  TextureWrapMode,
  Vector3,
  type Engine,
  type ShaderData
} from "@galacean/engine";
import { retainBuildingResource } from "../resources/BuildingAssetKit";
import { restoreResource } from "@galacean/engine-project/rendering/RestorableResources";
import type { BuildingWallBakeAtlas, BuildingWallBakeInput } from "./BuildingWallBakeInput";
import type { BuildingLampMaterial } from "./BuildingLampMaterial";
export { combineBuildingWallBakes } from "./BuildingWallBakeLayout";
import { additionalWallBakePageCount } from "./BuildingWallBakePagesView";
import type { WallAtlasChart } from "./BuildingWallAtlas";
import type { ConstructionPreviewPart } from "./ConstructionPreview";
export { createWallUvProjector, type WallUvProjection } from "./BuildingWallBakeUV";

export interface BuildingWallBakeTexture {
  /** Computation time reported by the original unit-field bake. */
  readonly bakeMs: number;
  readonly page: BuildingWallLightmapPage;
  readonly placement: { x: number; y: number; width: number; height: number };
  readonly charts: readonly WallAtlasChart[];
  readonly planar: boolean;
  readonly unbounded: boolean;
  readonly blackUV: [number, number];
  /** All wall charts sampling the same tile share this black-bordered standalone texture. */
  isolatedChart(index: number): BuildingWallBakeTexture;
  bind(data: ShaderData): void;
  dispose(): void;
}
export interface BuildingWallBakeBinding extends Pick<BuildingWallBakeInput, "origin" | "yaw"> {
  readonly texture: BuildingWallBakeTexture;
  readonly material?: BuildingLampMaterial;
  readonly disposeCombined?: () => void;
  readonly singleReceiver?: (chart: number) => { binding: BuildingWallBakeBinding; sourceChart: number } | undefined;
}
export function bindBuildingWall(data: ShaderData, wall: BuildingWallBakeBinding) {
  wall.texture.bind(data);
  if (wall.material) data.setVector3("renderer_WallBakeTint", wall.material.hdr);
}
export type BuildingWallBakeBindings = ReadonlyMap<string, BuildingWallBakeBinding>;
export const isWallBakeSurface = (p: ConstructionPreviewPart) => p.supportInset !== undefined || !!p.plaster;

const BORDER = 2;
const PAGE_SIZE = 512;
const WHITE = new Vector3(1, 1, 1);

type WallLightmapUpload = Pick<BuildingWallBakeAtlas, "width" | "height" | "pixels"> & {
  x: number;
  y: number;
};

export class BuildingWallLightmapPage {
  readonly texture: Texture2D;
  readonly blackUV: [number, number];
  private x: number;
  private y: number;
  private rowHeight = 0;
  private ended = false;
  private readonly released: { x: number; y: number; width: number; height: number }[] = [];
  private readonly isolated = new Set<BuildingWallBakeTexture>();
  private readonly uploads = new Set<WallLightmapUpload>();

  constructor(
    engine: Engine,
    private readonly width: number,
    private readonly height: number,
    private readonly dedicated = false
  ) {
    this.x = this.y = dedicated ? 0 : BORDER;
    this.blackUV = [0.5 / width, 0.5 / height];
    const texture = (this.texture = new Texture2D(engine, width, height, TextureFormat.R16_SFloat, false, false));
    retainBuildingResource(texture, 1);
    try {
      texture.filterMode = TextureFilterMode.Bilinear;
      texture.wrapModeU = texture.wrapModeV = TextureWrapMode.Clamp;
      const black = new Uint16Array(1);
      const upload = () => {
        texture.setPixelBuffer(black, 0, 0, 0, 1, 1);
        for (const t of this.uploads) texture.setPixelBuffer(t.pixels, 0, t.x, t.y, t.width, t.height);
      };
      upload();
      restoreResource(texture, upload);
    } catch (error) {
      this.dispose();
      throw error;
    }
  }

  get allocatedPageCount(): number {
    let pages = 1 + additionalWallBakePageCount(this);
    for (const tile of this.isolated) pages += tile.page.allocatedPageCount;
    return pages;
  }

  /** Retain exact half-float texels when a multi-page lightmap must be repacked. */
  copyPixels({ x, y }: BuildingWallBakeTexture["placement"]): Uint16Array {
    for (const upload of this.uploads) {
      if (upload.x === x && upload.y === y) return upload.pixels.slice();
    }
    throw Error("Released building wall lightmap");
  }

  bind(data: ShaderData) {
    data.enableMacro("RENDERER_MASONRY_WALL_BAKE");
    data.disableMacro("RENDERER_MASONRY_WALL_LAYOUT");
    data.disableMacro("RENDERER_MASONRY_WALL_DIRECT");
    data.disableMacro("RENDERER_MASONRY_WALL_OVERLAP");
    data.disableMacro("RENDERER_MASONRY_WALL_ARRAY");
    data.disableMacro("RENDERER_MASONRY_WALL_LARGE_PALETTE");
    data.setVector3("renderer_WallBakeTint", WHITE);
    data.setTexture("renderer_WallBakeAtlas", this.texture);
  }

  add(atlas: BuildingWallBakeAtlas): BuildingWallBakeTexture | undefined {
    if (this.ended) return;
    const { width, height, pixels } = atlas;
    const border = this.dedicated ? 0 : BORDER;
    const slotIndex = this.released.findIndex((r) => width <= r.width && height <= r.height);
    const slot = this.released[slotIndex];
    let { x, y, rowHeight } = this;
    if (slot) {
      x = slot.x;
      y = slot.y;
    } else {
      if (x + width + border > this.width) {
        x = border;
        y += rowHeight + border;
        rowHeight = 0;
      }
      if (x + width + border > this.width || y + height + border > this.height) return;
    }
    // Commit the slot only after the sub-image upload succeeds.
    this.texture.setPixelBuffer(pixels, 0, x, y, width, height);
    const upload = { x, y, width, height, pixels };
    this.uploads.add(upload);
    if (slot) this.released.splice(slotIndex, 1);
    else {
      this.x = x + width + border;
      this.y = y;
      this.rowHeight = Math.max(rowHeight, height);
    }

    // Fold fixed page transform into chart coefficients once. Existing UVs never move on insertion.
    const sx = width / this.width,
      sy = height / this.height,
      ox = x / this.width,
      oy = y / this.height;
    const charts = atlas.charts.map((chart) => transformChart(chart, sx, sy, ox, oy));
    // darkUV is the centre of the unique black corner texel of each packed tile.
    // Different facades can point at the very same pixels with different projections.
    const tileOrigins = atlas.charts.map(({ tile }) =>
      tile ? Math.floor(tile.darkUV[1] * height) * width + Math.floor(tile.darkUV[0] * width) : -1
    );
    const isolated = new Map<number, BuildingWallBakeTexture>();
    return {
      page: this,
      bakeMs: atlas.bakeMs,
      placement: { x, y, width, height },
      charts,
      planar: atlas.planar,
      unbounded:
        this.dedicated &&
        width === this.width &&
        height === this.height &&
        new Set(tileOrigins.filter((id) => id >= 0)).size === 1,
      blackUV: this.blackUV,
      isolatedChart: (index) => {
        if (this.ended || !this.uploads.has(upload)) throw Error("Released building lightmap");
        const origin = tileOrigins[index];
        if (origin === undefined || origin < 0) throw Error("Cannot crop an unlit wall chart");
        let texture = isolated.get(origin);
        if (!texture) {
          texture = createBuildingWallBakeTexture(this.texture.engine, cropAtlasTile(atlas, index, tileOrigins));
          isolated.set(origin, texture);
          this.isolated.add(texture);
        }
        return texture;
      },
      bind: (data) => this.bind(data),
      dispose: () => {
        for (const child of isolated.values()) {
          if (this.isolated.delete(child)) child.dispose();
        }
        isolated.clear();
        if (this.uploads.delete(upload) && !this.ended) this.released.push(slot ?? { x, y, width, height });
      }
    };
  }

  dispose() {
    if (this.ended) return;
    this.ended = true;
    for (const tile of this.isolated) tile.dispose();
    this.isolated.clear();
    this.uploads.clear();
    this.released.length = 0;
    retainBuildingResource(this.texture, -1);
    this.texture.destroy();
  }
}

/** Stable shelf allocation. Released slots can be filled without moving any live tile. */
export class BuildingWallLightmapPages {
  private readonly pages: BuildingWallLightmapPage[] = [];
  private ended = false;
  constructor(private readonly engine: Engine) {}
  get pageCount(): number {
    return this.pages.reduce((count, page) => count + page.allocatedPageCount, 0);
  }

  add(atlas: BuildingWallBakeAtlas): BuildingWallBakeTexture {
    if (this.ended) throw Error("Building lightmap pages have been disposed");
    for (const page of this.pages) {
      const texture = page.add(atlas);
      if (texture) return texture;
    }
    const large = atlas.width + 2 * BORDER > PAGE_SIZE || atlas.height + 2 * BORDER > PAGE_SIZE;
    const page = new BuildingWallLightmapPage(
      this.engine,
      large ? atlas.width : PAGE_SIZE,
      large ? atlas.height : PAGE_SIZE,
      large
    );
    try {
      const texture = page.add(atlas)!;
      this.pages.push(page);
      return texture;
    } catch (error) {
      page.dispose();
      throw error;
    }
  }

  dispose() {
    this.ended = true;
    for (const page of this.pages) page.dispose();
    this.pages.length = 0;
  }
}

function transformChart(chart: WallAtlasChart, sx: number, sy: number, ox: number, oy: number): WallAtlasChart {
  const t = chart.tile;
  if (!t) return chart;
  return {
    ...chart,
    tile: {
      du: t.du * sx,
      dv: t.dv * sy,
      offsetU: ox + t.offsetU * sx,
      offsetV: oy + t.offsetV * sy,
      darkUV: [ox + t.darkUV[0] * sx, oy + t.darkUV[1] * sy],
      bounds: [ox + t.bounds[0] * sx, oy + t.bounds[1] * sy, ox + t.bounds[2] * sx, oy + t.bounds[3] * sy]
    }
  };
}

/** Keep the inner dilated gutter and the outer black edge used by hardware Clamp.
 * Each wall keeps its geometry and its projection into this tile, including when a
 * different wall requested the same crop first. Unrelated faces still select black. */
function cropAtlasTile(atlas: BuildingWallBakeAtlas, index: number, tileOrigins: number[]): BuildingWallBakeAtlas {
  const t = atlas.charts[index].tile!;
  const origin = tileOrigins[index];
  const left = origin % atlas.width,
    bottom = Math.floor(origin / atlas.width);
  const x1 = Math.ceil(t.bounds[2] * atlas.width - 0.5 - 1e-8);
  const y1 = Math.ceil(t.bounds[3] * atlas.height - 0.5 - 1e-8);
  const width = x1 - left + 3,
    height = y1 - bottom + 3;
  const pixels = new Uint16Array(width * height);
  for (let row = 1; row < height - 1; row++) {
    const start = (bottom + row) * atlas.width + left + 1;
    pixels.set(atlas.pixels.subarray(start, start + width - 2), row * width + 1);
  }
  return {
    ...atlas,
    width,
    height,
    pixels,
    charts: atlas.charts.map((chart, i) =>
      tileOrigins[i] === origin
        ? transformChart(chart, atlas.width / width, atlas.height / height, -left / width, -bottom / height)
        : { ...chart, tile: undefined }
    )
  };
}

function createBuildingWallBakeTexture(engine: Engine, atlas: BuildingWallBakeAtlas): BuildingWallBakeTexture {
  const page = new BuildingWallLightmapPage(engine, atlas.width, atlas.height, true);
  try {
    return { ...page.add(atlas)!, dispose: () => page.dispose() };
  } catch (error) {
    page.dispose();
    throw error;
  }
}
