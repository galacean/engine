import type { PlanPoint } from "../semantic-study/IslandPlanModel";
import type { LayoutRule } from "./layout/LayoutRules";
import type { WorldTemplateArtDirection, WorldTemplatePalette } from "./WorldTemplateArtDirection";
import sakuraPearl from "./world-templates/sakura-pearl.json";

type PaletteRangeKey = "ground" | "road" | "stone";
type PetalEffect = Omit<NonNullable<WorldTemplateArtDirection["petals"]>, "textureUrl"> & { texture: string };

interface WorldTemplateConfig {
  palette?: Partial<WorldTemplatePalette> & {
    ranges?: Partial<Record<PaletteRangeKey, readonly [string, string]>>;
  };
  spawn?: {
    position: PlanPoint;
    subject?: {
      id: string;
      asset: string;
      position: PlanPoint;
      size: [number, number, number];
      footprint: [number, number];
      groundingFootprint: [number, number];
      assetGroundY: number;
      assetYawDegrees: number;
      leaf: { materials: string[]; color: string; intensity: number; textureBlend: number };
      bark?: { material: string; color: string; intensity: number };
    };
  };
  spawnPoi?: {
    sizeWeight?: readonly [number, number];
    landscape?: Record<string, readonly [number, number]>;
    layout?: {
      [K in keyof LayoutRule]?: NonNullable<LayoutRule[K]> extends number ? readonly [number, number] : LayoutRule[K];
    } & {
      elementProfile?: string;
    };
  };
  petals?: PetalEffect;
}

function pair<T>(values: readonly T[]): [T, T] {
  if (values.length !== 2) throw new Error("模板配置需要两个值");
  return [values[0], values[1]];
}

type RawPalette = Omit<NonNullable<WorldTemplateConfig["palette"]>, "grass" | "ranges"> & {
  grass?: readonly string[];
  ranges?: Partial<Record<PaletteRangeKey, readonly string[]>>;
};
type Spawn = NonNullable<WorldTemplateConfig["spawn"]>;
type Subject = NonNullable<Spawn["subject"]>;
type PetalVectorKey = "center" | "extent" | "windMps";
type PetalRangeKey = "sizeM" | "fallSpeedMps" | "spinDegreesPerSecond";
type RawPetalEffect = Omit<PetalEffect, PetalVectorKey | PetalRangeKey> &
  Record<PetalVectorKey | PetalRangeKey, readonly number[]>;
type RawWorldTemplateConfig = {
  palette?: RawPalette;
  spawn?: Omit<Spawn, "subject"> & {
    subject?: Omit<Subject, "size" | "footprint" | "groundingFootprint"> & {
      size: readonly number[];
      footprint: readonly number[];
      groundingFootprint: readonly number[];
    };
  };
  spawnPoi?: {
    sizeWeight?: readonly number[];
    landscape?: Record<string, readonly number[]>;
    layout?: Record<string, string | boolean | readonly number[]>;
  };
  petals?: RawPetalEffect;
};

function readPalette(palette: RawPalette): NonNullable<WorldTemplateConfig["palette"]> {
  const { grass, ranges: rawRanges, ...colors } = palette;
  const ranges = Object.fromEntries(Object.entries(rawRanges ?? {}).map(([key, range]) => [key, pair(range)]));
  return { ...colors, ...(grass && { grass: pair(grass) }), ranges };
}

function readSubject(subject: NonNullable<NonNullable<RawWorldTemplateConfig["spawn"]>["subject"]>): Subject {
  const [width, height, depth] = subject.size;
  if (subject.size.length !== 3) throw new Error("模板主体尺寸需要宽、高、深");
  return {
    ...subject,
    size: [width, height, depth],
    footprint: pair(subject.footprint),
    groundingFootprint: pair(subject.groundingFootprint)
  };
}

function readPetals(petals: RawPetalEffect): PetalEffect {
  const vector = (values: readonly number[]): [number, number, number] => {
    if (values.length !== 3) throw new Error("花瓣粒子向量需要三个值");
    return [values[0], values[1], values[2]];
  };
  return {
    ...petals,
    center: vector(petals.center),
    extent: vector(petals.extent),
    windMps: vector(petals.windMps),
    sizeM: pair(petals.sizeM),
    fallSpeedMps: pair(petals.fallSpeedMps),
    spinDegreesPerSecond: pair(petals.spinDegreesPerSecond)
  };
}

// A spawn POI override is attached to an explicit spawn rather than changing an arbitrary default POI.
function readWorldTemplateConfig({
  palette,
  spawn,
  spawnPoi,
  petals,
  ...unknown
}: RawWorldTemplateConfig): WorldTemplateConfig {
  const unsupported = Object.keys(unknown);
  if (unsupported.length) throw new Error(`未知模板功能：${unsupported.join("、")}`);
  const layout =
    spawnPoi?.layout &&
    Object.fromEntries(
      Object.entries(spawnPoi.layout).map(([key, value]) => [key, typeof value === "object" ? pair(value) : value])
    );
  const sizeWeight = spawnPoi?.sizeWeight && pair(spawnPoi.sizeWeight);
  const landscape =
    spawnPoi?.landscape &&
    Object.fromEntries(Object.entries(spawnPoi.landscape).map(([key, range]) => [key, pair(range)]));
  const hasSpawnPoi =
    sizeWeight || (layout && Object.keys(layout).length > 0) || (landscape && Object.keys(landscape).length > 0);
  if (hasSpawnPoi && !spawn) throw new Error("模板配置出生点 POI 时须提供出生点位置");
  return {
    ...(palette && { palette: readPalette(palette) }),
    ...(spawn && {
      spawn: { position: spawn.position, ...(spawn.subject && { subject: readSubject(spawn.subject) }) }
    }),
    ...(hasSpawnPoi && {
      spawnPoi: {
        ...(sizeWeight && { sizeWeight }),
        ...(layout && { layout }),
        ...(landscape && { landscape })
      }
    }),
    ...(petals && { petals: readPetals(petals) })
  };
}

/** Template authoring presets. Assets are bound by the renderer using their catalog keys. */
export const WORLD_TEMPLATE_CONFIGS: Readonly<Partial<Record<string, WorldTemplateConfig>>> = {
  "sakura-pearl": readWorldTemplateConfig(sakuraPearl)
};

export const TEMPLATE_SPAWN_POI_ID = "poi-template-spawn";
