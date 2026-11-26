import {
  Texture2D,
  Texture2DArray,
  TextureFilterMode,
  TextureFormat,
  type Engine,
  type ShaderData
} from "@galacean/engine";
import { retainBuildingResource } from "../resources/BuildingAssetKit";
import { restoreResource } from "@galacean/engine-project/rendering/RestorableResources";
import type { WallAtlasChart } from "./BuildingWallAtlas";
import type { BuildingWallBakeBinding, BuildingWallBakeTexture } from "./BuildingWallBakeBinding";
import { acquireWallBakePages } from "./BuildingWallBakePagesView";

type Vec4 = [number, number, number, number];
type Tile = NonNullable<WallAtlasChart["tile"]>;
type Contribution = { sourceChart: number; lamp: number; uv: Vec4; bounds: Vec4; layer: number };
type Plane = { chart: WallAtlasChart; lights: Contribution[]; extended: boolean };
const black: [number, number] = [0, -1e20];
const smallPalette = 16;
const cache = new WeakMap<Engine, Map<string, SharedLayout>>();
const textureIds = new WeakMap<BuildingWallBakeTexture, number>();
let nextId = 0;

function table(engine: Engine, entries: Float32Array) {
  const limit = engine._hardwareRenderer.capability.maxTextureSize;
  const width = Math.min(256, limit, Math.max(1, entries.length / 4));
  const height = Math.ceil(entries.length / (4 * width));
  if (height > limit) throw Error("Building lamp table exceeds the device texture dimensions");
  const texels = new Float32Array(width * height * 4);
  texels.set(entries);
  const texture = new Texture2D(engine, width, height, TextureFormat.R32G32B32A32_SFloat, false, false);
  retainBuildingResource(texture, 1);
  const dispose = () => {
    retainBuildingResource(texture, -1);
    texture.destroy();
  };
  try {
    texture.filterMode = TextureFilterMode.Point;
    const upload = () => texture.setPixelBuffer(texels);
    upload();
    restoreResource(texture, upload);
    return { texture, texels, dispose };
  } catch (e) {
    dispose();
    throw e;
  }
}

function relativeFrame(origin: BuildingWallBakeBinding, lamp: BuildingWallBakeBinding) {
  const c = Math.cos(origin.yaw),
    s = Math.sin(origin.yaw);
  const x = lamp.origin[0] - origin.origin[0],
    z = lamp.origin[2] - origin.origin[2];
  return [
    c * x - s * z,
    lamp.origin[1] - origin.origin[1],
    s * x + c * z,
    Math.cos(lamp.yaw - origin.yaw),
    Math.sin(lamp.yaw - origin.yaw)
  ];
}
function registerTextureId(texture: BuildingWallBakeTexture) {
  let id = textureIds.get(texture);
  if (id === undefined) textureIds.set(texture, (id = ++nextId));
  return id;
}

function buildLayout(engine: Engine, lamps: readonly BuildingWallBakeBinding[], frames: number[][]) {
  const pages = acquireWallBakePages(
    engine,
    lamps.map((lamp) => lamp.texture)
  );
  try {
    const planes: Plane[] = [];
    for (const [index, lamp] of lamps.entries()) {
      const [x, y, z, c, s] = frames[index];
      const { sx, sy, ox, oy, layer } = pages.transforms[index];
      for (const [sourceChart, face] of lamp.texture.charts.entries()) {
        const nx = c * face.nx + s * face.nz,
          nz = c * face.nz - s * face.nx;
        const plane = face.plane + nx * x + nz * z;
        const shift = nz * x - nx * z;
        const start = face.start + shift,
          end = face.end + shift;
        let receiver = planes.find(
          ({ chart }) =>
            Math.abs(chart.nx - nx) < 1e-5 && Math.abs(chart.nz - nz) < 1e-5 && Math.abs(chart.plane - plane) < 0.001
        );
        if (!receiver) {
          receiver = { chart: { nx, nz, plane, start, end }, lights: [], extended: false };
          planes.push(receiver);
        }
        const { chart } = receiver;
        chart.start = Math.min(chart.start, start);
        chart.end = Math.max(chart.end, end);
        receiver.extended ||= lamp.texture.planar;
        const tile = face.tile;
        if (!tile) continue;
        const du = tile.du * sx,
          dv = tile.dv * sy;
        const offsetU = ox + (tile.offsetU - shift * tile.du) * sx;
        const offsetV = oy + (tile.offsetV - y * tile.dv) * sy;
        const bounds: Vec4 = [
          ox + tile.bounds[0] * sx,
          oy + tile.bounds[1] * sy,
          ox + tile.bounds[2] * sx,
          oy + tile.bounds[3] * sy
        ];
        if (!lamp.texture.planar && !face.curved) {
          bounds[0] = Math.max(bounds[0], start * du + offsetU);
          bounds[2] = Math.min(bounds[2], end * du + offsetU);
        }
        if (bounds[2] <= bounds[0]) continue;
        const previous = receiver.lights.find(
          (item) =>
            item.lamp === index &&
            item.uv[2] === offsetU &&
            item.uv[3] === offsetV &&
            item.bounds[2] >= bounds[0] &&
            bounds[2] >= item.bounds[0]
        );
        if (previous) {
          previous.bounds[0] = Math.min(previous.bounds[0], bounds[0]);
          previous.bounds[2] = Math.max(previous.bounds[2], bounds[2]);
        } else receiver.lights.push({ sourceChart, lamp: index, uv: [du, dv, offsetU, offsetV], bounds, layer });
      }
    }
    // A chart's number is constant over a triangle. Its fractional U and V are
    // continuous receiving-plane coordinates, independent of the base material UV.
    const records: number[] = Array((planes.length + 1) * 4).fill(0);
    const overlap = planes.some((plane) => plane.lights.length > 1);
    // Keep enough mantissa bits for sub-texel interpolation of the fractional U.
    const direct = !overlap && lamps.length <= smallPalette && pages.texture instanceof Texture2D;
    const single = planes.map((plane) => (plane.lights.length === 1 ? plane.lights[0] : undefined));
    const charts = planes.map(({ chart, lights, extended }, i) => {
      if (!lights.length) return chart;
      if (direct) {
        const {
          lamp,
          uv: [du, dv, offsetU, offsetV],
          bounds: b
        } = lights[0];
        const tag = lamp + 1;
        const tile: Tile = {
          du,
          dv,
          offsetU: tag + offsetU,
          offsetV,
          bounds: [tag + b[0], b[1], tag + b[2], b[3]],
          darkUV: [0, 0]
        };
        return { ...chart, extended, tile };
      }
      const id = i + 1;
      const bounds: Vec4 = [Infinity, Infinity, -Infinity, -Infinity];
      for (const {
        uv: [du, dv, ox, oy],
        bounds: b
      } of lights) {
        bounds[0] = Math.min(bounds[0], (b[0] - ox) / du);
        bounds[1] = Math.min(bounds[1], (b[1] - oy) / dv);
        bounds[2] = Math.max(bounds[2], (b[2] - ox) / du);
        bounds[3] = Math.max(bounds[3], (b[3] - oy) / dv);
      }
      const du = 0.5 / (bounds[2] - bounds[0]),
        dv = 1 / (bounds[3] - bounds[1]);
      const offsetU = id + 0.25 - bounds[0] * du,
        offsetV = -bounds[1] * dv;
      const tile: Tile = {
        du,
        dv,
        offsetU,
        offsetV,
        bounds: [id + 0.25, 0, id + 0.75, 1],
        darkUV: [id + 0.125, -0.25]
      };
      records[id * 4] = records.length / 4;
      records[id * 4 + 1] = lights.length;
      for (const {
        uv: [su, sv, ou, ov],
        bounds: b,
        lamp,
        layer
      } of lights) {
        // Use the fractional U to preserve precision in shader arithmetic.
        records.push(
          su / du,
          sv / dv,
          ou - ((offsetU - id) * su) / du,
          ov - (offsetV * sv) / dv,
          ...b,
          lamp,
          layer,
          0,
          0
        );
      }
      return { ...chart, extended, tile };
    });
    const geometry = direct ? undefined : table(engine, Float32Array.from(records));
    return { pages, charts, overlap, direct, single, geometry, refs: 0 };
  } catch (e) {
    pages.release();
    throw e;
  }
}
type SharedLayout = ReturnType<typeof buildLayout>;

/** Share the immutable chart/atlas layout; only the per-instance HDR palette changes on editing. */
export function combineBuildingWallBakes(
  engine: Engine,
  lamps: readonly BuildingWallBakeBinding[]
): BuildingWallBakeBinding {
  if (!lamps.length) throw Error("A wall lightmap needs at least one emitter");
  const first = lamps[0];
  if (lamps.length === 1) return first;
  const frames = lamps.map((lamp) => relativeFrame(first, lamp));
  const key = JSON.stringify(
    lamps.map((lamp, i) => [registerTextureId(lamp.texture), ...frames[i].map((n) => Math.round(n * 1e5))])
  );
  let layouts = cache.get(engine);
  if (!layouts) cache.set(engine, (layouts = new Map()));
  let layout = layouts.get(key);
  if (!layout) layouts.set(key, (layout = buildLayout(engine, lamps, frames)));
  const shared = layout;
  shared.refs++;
  const palette = new Float32Array(4 * Math.max(lamps.length, smallPalette));
  const write = (index: number) => {
    const lamp = lamps[index],
      hdr = lamp.material?.hdr;
    palette.set(hdr ? [hdr.x, hdr.y, hdr.z, 0] : [1, 1, 1, 0], 4 * index);
  };
  const subscriptions: (() => void)[] = [];
  let large: ReturnType<typeof table> | undefined;
  let disposed = false;
  const release = () => {
    if (disposed) return;
    disposed = true;
    for (const unsubscribe of subscriptions) unsubscribe();
    large?.dispose();
    if (--shared.refs === 0) {
      layouts.delete(key);
      shared.geometry?.dispose();
      shared.pages.release();
    }
  };
  try {
    lamps.forEach((_, i) => write(i));
    if (lamps.length > smallPalette) large = table(engine, palette);
    lamps.forEach((lamp, i) => {
      if (lamp.material)
        subscriptions.push(
          lamp.material.subscribe(() => {
            write(i);
            if (large) {
              const rgba = palette.subarray(i * 4, i * 4 + 4);
              large.texels.set(rgba, 4 * i);
              large.texture.setPixelBuffer(rgba, 0, i % large.texture.width, Math.floor(i / large.texture.width), 1, 1);
            }
          })
        );
    });
    const bind = (data: ShaderData, chart: number) => {
      data.enableMacro("RENDERER_MASONRY_WALL_BAKE");
      data.enableMacro("RENDERER_MASONRY_WALL_LAYOUT");
      if (shared.overlap) data.enableMacro("RENDERER_MASONRY_WALL_OVERLAP");
      else data.disableMacro("RENDERER_MASONRY_WALL_OVERLAP");
      const image = shared.pages.texture;
      if (image instanceof Texture2DArray) {
        data.enableMacro("RENDERER_MASONRY_WALL_ARRAY");
        data.setTexture("renderer_WallBakeLayers", image);
      } else {
        data.disableMacro("RENDERER_MASONRY_WALL_ARRAY");
        data.setTexture("renderer_WallBakeAtlas", image);
      }
      if (shared.geometry) {
        data.disableMacro("RENDERER_MASONRY_WALL_DIRECT");
        data.setTexture("renderer_WallBakeRecords", shared.geometry.texture);
      } else data.enableMacro("RENDERER_MASONRY_WALL_DIRECT");
      data.setInt("renderer_WallBakeChart", chart);
      if (large) {
        data.enableMacro("RENDERER_MASONRY_WALL_LARGE_PALETTE");
        data.setTexture("renderer_WallBakePalette", large.texture);
      } else {
        data.disableMacro("RENDERER_MASONRY_WALL_LARGE_PALETTE");
        data.setFloatArray("renderer_WallBakeColors", palette);
      }
    };
    const isolated = new Map<number, BuildingWallBakeTexture>();
    const texture: BuildingWallBakeTexture = {
      ...first.texture,
      charts: shared.charts,
      blackUV: shared.direct ? [0, 0] : black,
      planar: false,
      unbounded: false,
      bind: (data) => bind(data, 0),
      isolatedChart(index) {
        let result = isolated.get(index);
        if (!result) {
          result = {
            ...texture,
            unbounded: true,
            charts: shared.charts.map((chart, i) => (i === index ? chart : { ...chart, tile: undefined })),
            bind: (data) => bind(data, index + 1)
          };
          isolated.set(index, result);
        }
        return result;
      },
      dispose: release
    };
    return {
      ...first,
      texture,
      disposeCombined: release,
      singleReceiver(index) {
        const source = shared.single[index];
        return source && { binding: lamps[source.lamp], sourceChart: source.sourceChart };
      }
    };
  } catch (e) {
    release();
    throw e;
  }
}
