// Application layer: the European building style that scripts, the initial village and the
// Agent tool call. The parameters keep the names of the style's public API; each generator
// returns a core draft, a plain JSON value that describes the building on its own.
import type { BuildingCoreDraft } from "../core";
import type { MaterialFootprint } from "../runtime/MaterialFootprint";
import { normalizeProfileFoundation, normalizeProfileRoof } from "../runtime/ProfileParameters";
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
  "window-arrow-slit",
  "dormer-cottage-half",
  "dormer-gothic-half",
  "dormer-arrow-slit-half",
  "window-cottage-corner"
]);
const unavailable = (what: string) => Error(`${what} is not available in the building system yet`);
/** A size the caller gave must be a positive finite number. */
function positive(name: string, value: number | undefined) {
  if (value !== undefined && !(Number.isFinite(value) && value > 0))
    throw Error(`${name} must be a positive finite number, not ${value}`);
}

/** Building prefabs of the asset kit that sit on roofs. */
const ROOF_PREFABS = new Set(["dormer-gothic", "dormer-cottage", "hatch-cottage", "hatch-gothic", "roof-lantern"]);
const onRoof = (a: EuropeanAttachment) => a.host === "roof" || a.uv !== undefined;
/** The prefab of a roof attachment that names only its kind: on a flat roof a window or hatch
 * is a hatch and a lamp is a roof lantern; on a pitched roof a window is a cottage dormer. */
function roofType(a: EuropeanAttachment, flat: boolean): string | undefined {
  if (a.type) return a.type;
  if (a.kind === "wall-lamp" || a.kind === "lantern") return flat ? "roof-lantern" : undefined;
  if (a.kind === "hatch") return flat ? "hatch-cottage" : undefined;
  if (a.kind === "window") return flat ? "hatch-cottage" : "dormer-cottage";
}
/** Prefabs whose frame has a stone alternative. */
const STONE_FRAMES = new Set([
  "window-gothic",
  "window-arrow-slit",
  "dormer-gothic",
  "dormer-gothic-half",
  "dormer-arrow-slit-half"
]);
function checkFrame(a: EuropeanAttachment, type: string) {
  if (a.frameMaterial === "wall" && !STONE_FRAMES.has(type))
    throw Error(`The attachment type "${type}" has no frame of wall material ("${a.id}")`);
}
function roofAttachment(a: EuropeanAttachment, flat: boolean): CoreRoofAttachment | undefined {
  if (a.enabled === false || !onRoof(a)) return;
  const type = roofType(a, flat);
  if (!type) throw Error(`A roof attachment of kind "${a.kind}" needs a flat roof ("${a.id}")`);
  if (!ROOF_PREFABS.has(type)) throw unavailable(`The roof attachment type "${type}" ("${a.id}")`);
  checkFrame(a, type);
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
    ...(a.frameMaterial === "wall" && { frameMaterial: "wall" as const }),
    ...(a.woodColor !== undefined && { woodColor: a.woodColor }),
    ...(a.lightColor !== undefined && { lightColor: a.lightColor }),
    ...(a.lightIntensity !== undefined && { lightIntensity: a.lightIntensity })
  };
}
function wallAttachment(a: EuropeanAttachment): CoreWallAttachment | undefined {
  if (a.enabled === false || onRoof(a)) return;
  if (a.kind === "hatch") throw unavailable(`An attachment of kind "${a.kind}" ("${a.id}")`);
  if (a.kind === "opening" && a.type && a.type !== "opening-arch")
    throw unavailable(`The opening type "${a.type}" ("${a.id}")`);
  if (a.kind !== "opening" && a.type && !WALL_PREFABS.has(a.type))
    throw unavailable(`The attachment type "${a.type}" ("${a.id}")`);
  checkFrame(a, a.type ?? (a.kind === "window" ? "window-cottage" : a.kind));
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
    ...(a.frameMaterial === "wall" && { frameMaterial: "wall" as const }),
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
  // A timber structure is laid with horizontal boards unless the wall style says otherwise.
  const timber = p.wallStructure === "timber";
  const wallUnit = p.wall?.unit ?? (timber ? "wooden_plank" : "brick");
  if (wallUnit === "roof_tile") throw unavailable("A wall of roof_tile");
  if (timber && wallUnit !== "wooden_plank") throw Error("A timber wall is laid with wooden_plank");
  if (p.wallStructure === "masonry" && wallUnit === "wooden_plank")
    throw Error("A masonry wall is not laid with wooden_plank");
  // "auto" lets the material choose: boards on a timber structure, parallel rows of planks.
  const authored = p.wall?.algorithm?.type;
  const rule =
    authored === undefined || authored === "auto"
      ? timber
        ? "horizontal_rows"
        : authored && wallUnit === "wooden_plank"
          ? "parallel_rows"
          : authored
      : authored;
  if (rule && rule !== "staggered_rows" && rule !== "auto" && !GRID_RULES.includes(rule as never))
    throw Error(`Unknown wall course rule "${rule}"`);
  // Planks in horizontal rows are boards; planks in other rules, and bricks in grid rules, are
  // grid courses.
  const boards = wallUnit === "wooden_plank" && rule === "horizontal_rows";
  const grid = boards
    ? undefined
    : wallUnit === "wooden_plank"
      ? ((GRID_RULES.find((r) => r === rule) ?? "staggered_rows") as CoreHouseParameters["wallRule"])
      : GRID_RULES.find((r) => r === rule);
  const roofUnit = p.roofStyle?.unit;
  const foundation = p.foundation && normalizeProfileFoundation(p.foundation);
  const foundationUnit = p.foundationStyle?.unit,
    foundationRule = p.foundationStyle?.algorithm?.type;
  if (foundationUnit === "roof_tile") throw unavailable("A foundation of roof_tile");
  if (
    foundationRule &&
    foundationRule !== "auto" &&
    foundationRule !== "staggered_rows" &&
    !GRID_RULES.includes(foundationRule as never)
  )
    throw Error(`Unknown foundation course rule "${foundationRule}"`);
  return {
    id: p.id,
    ...(p.seed !== undefined && { seed: p.seed }),
    ...(p.height !== undefined && { height: p.height }),
    ...(p.rectangle && { rectangle: { ...p.rectangle, rotation: p.rectangle.rotation ?? 0 } }),
    ...(p.circle && { circle: p.circle }),
    ...(p.roof && { roof: p.roof }),
    ...(p.wall?.footprint && { footprint: p.wall.footprint }),
    ...(boards && { walls: "timber" as const }),
    ...(grid && {
      walls: "grid" as const,
      wallRule: grid,
      ...(wallUnit === "wooden_plank" && { wallUnit: "wooden_plank" as const })
    }),
    ...(roofUnit && { roofUnit }),
    ...(p.floors && { floors: p.floors }),
    ...(p.plaster && { plaster: p.plaster }),
    ...(p.wallColor !== undefined && { wallColor: p.wallColor }),
    ...(p.woodColor !== undefined && { woodColor: p.woodColor }),
    ...(foundation &&
      foundation.height > 0 && {
        foundation: {
          height: foundation.height,
          ...(foundation.mode && { mode: foundation.mode }),
          ...(foundationUnit && { unit: foundationUnit }),
          ...(foundationRule &&
            foundationRule !== "auto" && {
              rule: foundationRule as NonNullable<CoreHouseParameters["foundation"]>["rule"]
            }),
          ...(p.foundationStyle?.footprint && { footprint: p.foundationStyle.footprint })
        }
      }),
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
