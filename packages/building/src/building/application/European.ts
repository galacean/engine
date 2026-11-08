// Application layer: the European building style that scripts, the initial village and the
// Agent tool call. The parameters keep the names of the style's public API; each generator
// returns a core draft, a plain JSON value that describes the building on its own.
import type { BuildingCoreDraft } from "../core";
import type { MaterialFootprint } from "../runtime/MaterialFootprint";
import { normalizeProfileRoof } from "../runtime/ProfileParameters";
import { isFlatRoofHeight } from "../runtime/RoofMode";
import {
  buildCoreFence,
  buildCoreHouses,
  buildCoreSteps,
  buildCoreWall,
  type CoreHouseParameters,
  type CoreRoofAttachment,
  type CoreStepsParameters,
  type CoreStripParameters,
  type CoreWallAttachment
} from "./CoreEuropean";

/** How a surface is laid: its unit, its course rule and the unit's footprint. */
export interface EuropeanSurfaceStyle {
  unit?: "brick" | "roof_tile" | "wooden_plank";
  algorithm?: { type?: string };
  footprint?: MaterialFootprint;
}
/** One prefab on a wall. The type defaults by kind; `u` is a fraction of the perimeter. */
export interface EuropeanAttachment {
  id: string;
  kind: "window" | "door" | "wall-lamp" | "lantern" | "opening" | "hatch";
  type?: string;
  host?: "wall" | "roof";
  rank?: 1 | 2 | 3;
  u?: number;
  uv?: [number, number];
  bottom?: number;
  /** Installation size. A roof prefab defaults to its own size. */
  width?: number;
  height?: number;
  frameMaterial?: "wood" | "wall";
  enabled?: boolean;
  seed?: number;
  woodColor?: number;
  lightColor?: number;
  lightIntensity?: number;
}
export interface EuropeanHouseParameters {
  id: string;
  seed?: number;
  height?: number;
  rectangle?: { center: [number, number]; size: [number, number]; rotation?: number };
  circle?: { center: [number, number]; radius: number; phase?: number };
  roof?: Record<string, unknown>;
  wallColor?: number;
  woodColor?: number;
  wall?: EuropeanSurfaceStyle;
  wallStructure?: "masonry" | "timber";
  roofStyle?: EuropeanSurfaceStyle;
  foundation?: { height?: number; mode?: string };
  foundationStyle?: EuropeanSurfaceStyle;
  plaster?: { enabled?: boolean; wear?: number; color?: number };
  floors?: { enabled?: boolean; interval?: number };
  attachments?: EuropeanAttachment[];
}
export interface EuropeanStripParameters {
  id: string;
  seed?: number;
  length?: number;
  depth?: number;
  height?: number;
  center?: [number, number];
  rotation?: number;
  style?: EuropeanSurfaceStyle;
}

/** Building prefabs of the asset kit that mount on walls. */
const WALL_PREFABS = new Set([
  "window-cottage",
  "door-cottage",
  "wall-lantern",
  "window-gothic",
  "door-gothic",
  "window-arrow-slit"
]);
const unavailable = (what: string) => Error(`${what} is not available in the building system yet`);
/** A size the caller gave must be a positive finite number. */
function positive(name: string, value: number | undefined) {
  if (value !== undefined && !(Number.isFinite(value) && value > 0))
    throw Error(`${name} must be a positive finite number, not ${value}`);
}

/** Building prefabs of the asset kit that sit on roofs. */
const ROOF_PREFABS = new Set(["dormer-gothic", "hatch-cottage", "hatch-gothic", "roof-lantern"]);
const onRoof = (a: EuropeanAttachment) => a.host === "roof" || a.uv !== undefined;
/** The prefab of a roof attachment that names only its kind: on a flat roof a window or hatch
 * is a hatch and a lamp is a roof lantern; on a pitched roof a window is a cottage dormer. */
function roofType(a: EuropeanAttachment, flat: boolean): string | undefined {
  if (a.type) return a.type;
  if (a.kind === "wall-lamp" || a.kind === "lantern") return flat ? "roof-lantern" : undefined;
  if (a.kind === "hatch") return flat ? "hatch-cottage" : undefined;
  if (a.kind === "window") return flat ? "hatch-cottage" : "dormer-cottage";
}
function roofAttachment(a: EuropeanAttachment, flat: boolean): CoreRoofAttachment | undefined {
  if (a.enabled === false || !onRoof(a)) return;
  const type = roofType(a, flat);
  if (!type) throw Error(`A roof attachment of kind "${a.kind}" needs a flat roof ("${a.id}")`);
  if (!ROOF_PREFABS.has(type)) throw unavailable(`The roof attachment type "${type}" ("${a.id}")`);
  if (a.frameMaterial === "wall") throw unavailable(`A frame of wall material ("${a.id}")`);
  if (!a.uv) throw Error(`Roof attachment "${a.id}" needs uv`);
  positive("attachment width", a.width);
  positive("attachment height", a.height);
  return {
    id: a.id,
    type: type as CoreRoofAttachment["type"],
    ...(a.rank && { rank: a.rank }),
    uv: a.uv,
    ...(a.bottom !== undefined && { bottom: a.bottom }),
    ...(a.width !== undefined && { width: a.width }),
    ...(a.height !== undefined && { height: a.height }),
    ...(a.woodColor !== undefined && { woodColor: a.woodColor }),
    ...(a.lightColor !== undefined && { lightColor: a.lightColor }),
    ...(a.lightIntensity !== undefined && { lightIntensity: a.lightIntensity })
  };
}
function wallAttachment(a: EuropeanAttachment): CoreWallAttachment | undefined {
  if (a.enabled === false || onRoof(a)) return;
  if (a.kind === "opening" || a.kind === "hatch") throw unavailable(`An attachment of kind "${a.kind}" ("${a.id}")`);
  if (a.type && !WALL_PREFABS.has(a.type)) throw unavailable(`The attachment type "${a.type}" ("${a.id}")`);
  if (a.frameMaterial === "wall") throw unavailable(`A frame of wall material ("${a.id}")`);
  if (a.u === undefined) throw Error(`Wall attachment "${a.id}" needs u`);
  if (a.width === undefined || a.height === undefined || a.bottom === undefined)
    throw Error(`Wall attachment "${a.id}" needs bottom, width and height`);
  return {
    id: a.id,
    kind: a.kind,
    ...(a.type && { type: a.type }),
    ...(a.rank && { rank: a.rank }),
    u: a.u,
    bottom: a.bottom,
    width: a.width,
    height: a.height,
    ...(a.woodColor !== undefined && { woodColor: a.woodColor }),
    ...(a.lightColor !== undefined && { lightColor: a.lightColor }),
    ...(a.lightIntensity !== undefined && { lightIntensity: a.lightIntensity })
  };
}
const GRID_RULES = ["overlap_rows", "parallel_rows", "horizontal_rows"] as const;
function house(p: EuropeanHouseParameters): CoreHouseParameters {
  if (!p?.id) throw Error("A house needs an id");
  positive("height", p.height);
  positive("rectangle width", p.rectangle?.size[0]);
  positive("rectangle depth", p.rectangle?.size[1]);
  positive("circle radius", p.circle?.radius);
  if (p.wallStructure === "timber") throw unavailable("A timber wall");
  if ((p.foundation?.height ?? 0) > 0) throw unavailable("A raised foundation");
  if (p.wall?.unit && p.wall.unit !== "brick") throw unavailable(`A wall of ${p.wall.unit}`);
  const rule = p.wall?.algorithm?.type;
  if (rule && rule !== "staggered_rows" && rule !== "auto" && !GRID_RULES.includes(rule as never))
    throw Error(`Unknown wall course rule "${rule}"`);
  const grid = GRID_RULES.find((r) => r === rule);
  const roofUnit = p.roofStyle?.unit;
  return {
    id: p.id,
    ...(p.seed !== undefined && { seed: p.seed }),
    ...(p.height !== undefined && { height: p.height }),
    ...(p.rectangle && { rectangle: { ...p.rectangle, rotation: p.rectangle.rotation ?? 0 } }),
    ...(p.circle && { circle: p.circle }),
    ...(p.roof && { roof: p.roof }),
    ...(p.wall?.footprint && { footprint: p.wall.footprint }),
    ...(grid && { walls: "grid" as const, wallRule: grid }),
    ...(roofUnit && { roofUnit }),
    ...(p.floors && { floors: p.floors }),
    ...(p.plaster && { plaster: p.plaster }),
    ...(p.wallColor !== undefined && { wallColor: p.wallColor }),
    ...(p.woodColor !== undefined && { woodColor: p.woodColor }),
    attachments: (p.attachments ?? []).flatMap((a) => wallAttachment(a) ?? []),
    roofAttachments: (p.attachments ?? []).flatMap(
      (a) => roofAttachment(a, isFlatRoofHeight(normalizeProfileRoof(p.roof ?? {}).height)) ?? []
    )
  };
}
function strip(p: EuropeanStripParameters): CoreStripParameters {
  if (!p?.id) throw Error("A wall or fence needs an id");
  positive("length", p.length);
  positive("depth", p.depth);
  positive("height", p.height);
  return {
    id: p.id,
    ...(p.seed !== undefined && { seed: p.seed }),
    ...(p.length !== undefined && { length: p.length }),
    ...(p.depth !== undefined && { depth: p.depth }),
    ...(p.height !== undefined && { height: p.height }),
    ...(p.center && { center: p.center }),
    ...(p.rotation !== undefined && { rotation: p.rotation }),
    ...(p.style?.footprint && { footprint: p.style.footprint })
  };
}

/** Houses: walls, a roof, and what is mounted on the walls. Houses passed together connect
 * where they touch. */
export function buildHouses(input: EuropeanHouseParameters | readonly EuropeanHouseParameters[]): BuildingCoreDraft {
  return buildCoreHouses((Array.isArray(input) ? input : [input]).map(house));
}
/** A round tower: a house on a circle of radius 2.5, 10 m high, unless stated. */
export function buildTower(p: EuropeanHouseParameters): BuildingCoreDraft {
  return buildHouses({
    ...p,
    height: p.height ?? 10,
    ...(p.rectangle || p.circle ? {} : { circle: { center: [0, 0], radius: 2.5, phase: 0 } })
  });
}
/** A free-standing brick wall. */
export function buildWall(p: EuropeanStripParameters): BuildingCoreDraft {
  return buildCoreWall(strip(p));
}
/** A timber fence. */
export function buildFence(p: EuropeanStripParameters): BuildingCoreDraft {
  return buildCoreFence(strip(p));
}
/** A flight of steps. */
export function buildSteps(p: CoreStepsParameters): BuildingCoreDraft {
  if (!p?.id) throw Error("Steps need an id");
  if (!(Number.isInteger(p.count) && p.count >= 1 && p.count <= 1000))
    throw Error("Steps need a whole count from 1 to 1000");
  if (![p.width, p.rise, p.run].every((n) => Number.isFinite(n) && n > 0))
    throw Error("Steps need a positive finite width, rise and run");
  return buildCoreSteps(p);
}
export const European = Object.freeze({ buildHouses, buildTower, buildWall, buildFence, buildSteps });
