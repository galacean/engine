// Application layer: friendly European parameters → core drafts.
import { deriveSeed, Random, type BuildingCoreDraft, type BuildingPartDef, type BuildingUnit } from "../core";
import { normalizeProfileFootprint, normalizeProfileHeight, normalizeProfileRoof } from "../runtime/ProfileParameters";
import { profileShape } from "../runtime/ProfileGeometry";
import { unitFootprintScale, type MaterialFootprint } from "../runtime/MaterialFootprint";
import { isFlatRoofHeight } from "../runtime/RoofMode";
import { floorLevels } from "../partTypes/House";
import type { WALL_MOUNTS } from "../partTypes/Openings";

/** A free-standing wall or fence: its centerline on the ground and its size. */
export interface CoreStripParameters {
  id: string;
  seed?: number;
  length?: number;
  depth?: number;
  height?: number;
  center?: [number, number];
  rotation?: number;
  footprint?: MaterialFootprint;
  /** Palette entry of the bricks or the timber. Default: 0. */
  color?: number;
}

const CUBE = { min: [-0.5, -0.5, -0.5], max: [0.5, 0.5, 0.5] } as const;
const DEFAULT_FOOTPRINT: MaterialFootprint = { width: 0.5, height: 0.4375, depth: 0.1 };
/** Joint left between neighbouring bricks, in metres. */
const MORTAR = 0.012;

const stripRectangle = (p: CoreStripParameters, depth: number) => ({
  center: p.center ?? ([0, 0] as [number, number]),
  size: [p.length ?? 8, p.depth ?? depth] as [number, number],
  rotation: p.rotation ?? 0
});

/** A free-standing brick wall in staggered rows. */
export function buildCoreWall(p: CoreStripParameters): BuildingCoreDraft {
  const footprint = p.footprint ?? DEFAULT_FOOTPRINT,
    rectangle = stripRectangle(p, 0.45);
  const brick: BuildingUnit = {
    source: "brick",
    bounds: CUBE,
    scale: [footprint.width, footprint.height, rectangle.size[1]],
    // Bricks at the ends are cut to fit the wall's length.
    range: { min: [0.05, 0.05, 1], max: [1, 1, 1] }
  };
  return {
    groups: [{ id: p.id, seed: p.seed ?? 17, shared: { appearance: { wall: p.color ?? 0 } } }],
    parts: [
      {
        id: `${p.id}-wall`,
        group: p.id,
        type: "freeWall",
        geometry: { generator: "strip", params: { rectangle, height: p.height ?? 1.5 } },
        algorithm: {
          type: "surfaceGrid",
          params: { elements: ["face"], stagger: 0.5, trim: true, gap: [MORTAR, MORTAR] }
        },
        unit: brick
      }
    ]
  };
}

/** A timber fence: posts on every span boundary and two rails per span. */
export function buildCoreFence(p: CoreStripParameters): BuildingCoreDraft {
  const footprint = p.footprint ?? DEFAULT_FOOTPRINT,
    scale = unitFootprintScale(footprint),
    rectangle = stripRectangle(p, 0.15),
    height = p.height ?? 1.5;
  const depth = rectangle.size[1];
  const maxSpacing = 1.6 * scale.width;
  const post = Math.min(0.16, depth);
  const geometry = { generator: "fence", params: { rectangle, height, maxSpacing, levels: [0.35, 0.78] } };
  return {
    groups: [{ id: p.id, seed: p.seed ?? 17, shared: { appearance: { wood: p.color ?? 0 } } }],
    parts: [
      {
        id: `${p.id}-posts`,
        group: p.id,
        type: "fencePost",
        geometry,
        algorithm: { type: "placeAtPoints" },
        unit: {
          source: "wooden_plank",
          bounds: CUBE,
          pivot: [0.5, 0, 0.5],
          scale: [post * scale.width, height, post * scale.depth]
        }
      },
      {
        id: `${p.id}-rails`,
        group: p.id,
        type: "fenceRail",
        geometry,
        algorithm: {
          type: "alongCurves",
          params: { elements: ["level:0", "level:1"], perSegment: true, stretch: true }
        },
        unit: {
          source: "wooden_plank",
          bounds: CUBE,
          scale: [maxSpacing, 0.11 * scale.height, Math.min(0.1, depth) * scale.depth],
          // A rail spans two posts; on a slope it is longer than its horizontal span.
          range: { min: [0.05, 1, 1], max: [2, 1, 1] }
        }
      }
    ]
  };
}

/** A flight of steps: its foot on the ground, the direction it climbs and its steps. */
export interface CoreStepsParameters {
  id: string;
  seed?: number;
  width: number;
  rise: number;
  run: number;
  count: number;
  position?: [number, number, number];
  rotation?: number;
  color?: number;
}
/** A flight of solid brick steps. */
export function buildCoreSteps(p: CoreStepsParameters): BuildingCoreDraft {
  return {
    groups: [{ id: p.id, seed: p.seed ?? 17, shared: { appearance: { wall: p.color ?? 0 } } }],
    parts: [
      {
        id: `${p.id}-steps`,
        group: p.id,
        type: "steps",
        geometry: {
          generator: "stepFlight",
          params: {
            position: p.position ?? [0, 0, 0],
            rotation: p.rotation ?? 0,
            width: p.width,
            rise: p.rise,
            run: p.run,
            count: p.count
          }
        },
        algorithm: { type: "stepBlocks", params: { width: p.width, rise: p.rise, run: p.run, count: p.count } },
        // A block takes the size of its step.
        unit: { source: "brick", bounds: CUBE, range: { min: [0, 0, 0], max: [1e6, 1e6, 1e6] } }
      }
    ]
  };
}

export interface CoreHouseParameters {
  id: string;
  seed?: number;
  height?: number;
  rectangle?: { center: [number, number]; size: [number, number]; rotation?: number };
  circle?: { center: [number, number]; radius: number; phase?: number };
  roof?: Record<string, unknown>;
  footprint?: MaterialFootprint;
  /** Wall laying: our masonry (default), regular grid courses, or timber: horizontal boards. */
  walls?: "masonry" | "grid" | "timber";
  /** Unit of grid courses. Default: brick. */
  wallUnit?: "brick" | "wooden_plank";
  /** Course rule of grid walls. Default: staggered rows. */
  wallRule?: "staggered_rows" | "overlap_rows" | "parallel_rows" | "horizontal_rows";
  /** Unit the roof is laid with: tiles (default), or planks or bricks, as on a flat deck. */
  roofUnit?: "roof_tile" | "wooden_plank" | "brick";
  /** How a flat roof is paved: irregular stone or rows of the roof unit. Default: stone on a
   * masonry house with no `roofUnit` of its own, otherwise rows. */
  roofPaving?: "stone" | "rows";
  /** Prefabs mounted on the walls: windows, doors and wall lamps. `u` is a fraction of the
   * perimeter, `bottom` the height above the wall's base, `width` and `height` the
   * installation size; the type defaults by kind. */
  attachments?: readonly CoreWallAttachment[];
  /** Prefabs that sit on the roof, such as dormers. `uv` addresses the footprint's oriented
   * bounding rectangle: u across its width, v from its +z edge to its −z edge. `bottom` raises
   * the prefab above the roof surface; `width` and `height` are the installation size. */
  roofAttachments?: readonly CoreRoofAttachment[];
  /** Floor bands between storeys. Default: none. */
  floors?: { enabled?: boolean; interval?: number };
  /** A plaster finish over the walls: its wear (0..1, how much masonry shows at the edges)
   * and palette entry. Default: none. */
  plaster?: { enabled?: boolean; wear?: number; color?: number };
  /** Palette entries of the wall and wood materials. Default: 0. The roof color is `roof.color`. */
  wallColor?: number;
  woodColor?: number;
  /** The base the house stands on: its height above the ground under the house's center,
   * solid down to the ground or on pillars ("auto" is pillars), and how it is laid. Default:
   * none, the walls stand on the ground. */
  foundation?: CoreFoundation;
}
export interface CoreFoundation {
  height: number;
  mode?: "auto" | "pillars" | "solid";
  /** Default: brick. */
  unit?: "brick" | "wooden_plank";
  /** Default: parallel rows of planks, staggered rows of bricks. */
  rule?: "staggered_rows" | "overlap_rows" | "parallel_rows" | "horizontal_rows";
  footprint?: MaterialFootprint;
  /** A plaster finish over the base's faces, as on the walls. Default: none. */
  plaster?: { enabled?: boolean; wear?: number; color?: number };
}
export interface CoreWallAttachment {
  id: string;
  /** An opening is a ground-open arch: `bottom` is 0, `width` its span between the piers. */
  kind: "window" | "door" | "wall-lamp" | "lantern" | "opening";
  type?: string;
  rank?: 1 | 2 | 3;
  u: number;
  bottom: number;
  width: number;
  height: number;
  seed?: number;
  /** "wall" draws the frame in the stone of the wall. Default: wood. */
  frameMaterial?: "wood" | "wall";
  /** Shutters on a rank 2 Cottage eave dormer. Default: chosen by the seed. */
  shutters?: boolean;
  woodColor?: number;
  lightColor?: number;
  lightIntensity?: number;
}
export interface CoreRoofAttachment {
  id: string;
  /** A dormer stands on a pitched roof; a hatch or a roof lantern on a flat roof's deck. */
  type: "dormer-gothic" | "dormer-cottage" | "hatch-cottage" | "hatch-gothic" | "roof-lantern";
  rank?: 1 | 2 | 3;
  uv: [number, number];
  bottom?: number;
  /** Installation size; for a Cottage dormer, of its whole row of bodies. Default: the
   * prefab's own. */
  width?: number;
  height?: number;
  frameMaterial?: "wood" | "wall";
  woodColor?: number;
  lightColor?: number;
  lightIntensity?: number;
}
/** Each roof prefab: its part type, how it stands on the roof, and what the renderer draws it as.
 * A dormer finds its roof part from its plan position; a deck prefab stands on the deck and
 * faces the nearest edge (a hatch) or the house's front (a lantern). */
const ROOF_PREFABS: Readonly<
  Record<CoreRoofAttachment["type"], { type: string; generator: string; facing?: "edge" | "front"; kind: string }>
> = {
  "dormer-gothic": { type: "dormer", generator: "houseRoofMount", kind: "window" },
  "dormer-cottage": { type: "shedDormer", generator: "houseShedDormer", kind: "window" },
  "hatch-cottage": { type: "hatch", generator: "houseDeckMount", facing: "edge", kind: "hatch" },
  "hatch-gothic": { type: "hatch", generator: "houseDeckMount", facing: "edge", kind: "hatch" },
  "roof-lantern": { type: "roofLamp", generator: "houseDeckMount", facing: "front", kind: "lantern" }
};
/** The part type of each attachment kind. */
const WALL_PART_TYPES: Readonly<Record<Exclude<CoreWallAttachment["kind"], "opening">, (typeof WALL_MOUNTS)[number]>> =
  {
    window: "window",
    door: "door",
    "wall-lamp": "lamp",
    lantern: "lamp"
  };
const DEFAULT_WALL_TYPES: Readonly<Record<Exclude<CoreWallAttachment["kind"], "opening">, string>> = {
  window: "window-cottage",
  door: "door-cottage",
  "wall-lamp": "wall-lantern",
  lantern: "wall-lantern"
};
/** A ground-open arch: stone voussoirs on piers in a masonry wall, a level timber frame in a
 * timber wall. Its stones take the wall's brick. */
function archPart(house: CoreHouseParameters, a: CoreWallAttachment): BuildingPartDef {
  if (a.bottom !== 0) throw Error(`The arch "${a.id}" stands on the ground: its bottom must be 0`);
  const timber = house.walls === "timber" || house.wallUnit === "wooden_plank";
  return {
    id: `${house.id}/${a.id}`,
    group: house.id,
    type: timber ? "woodArch" : "arch",
    geometry: {
      generator: "houseArch",
      params: { u: a.u, width: a.width, height: a.height, ...(timber && { lintel: true }) }
    },
    ...(timber
      ? {
          algorithm: {
            type: "placeAtPoints",
            params: { unitParams: { ...(a.woodColor !== undefined && { woodColor: a.woodColor }) } }
          },
          unit: { source: "wooden_plank", bounds: CUBE, scale: [0.43, 0.25, 0.675] }
        }
      : {
          algorithm: {
            type: "archStones",
            params: { depthScale: unitFootprintScale(house.footprint ?? DEFAULT_FOOTPRINT).depth }
          },
          unit: {
            source: "brick",
            bounds: CUBE,
            scale: [0.56, 0.42, 0.7],
            range: { min: [0.05, 0.05, 0.5], max: [3, 5, 3] }
          }
        })
  };
}
/** Wall prefabs that break through the eave and carry a small roof out of it. */
const EAVE_TYPES = new Set(["dormer-cottage-half", "dormer-gothic-half", "dormer-arrow-slit-half"]);
/** A Cottage eave dormer's shed, by rank: its side overhang and front reach at the eave, and how
 * much higher its back stands as a fraction of the roof's height (as online). A rank 2 window
 * may have shutters, chosen by the seed unless stated; the eave is cut 0.7 m wider for them. */
function eaveShed(house: CoreHouseParameters, a: CoreWallAttachment) {
  const rank = a.rank ?? 1;
  const shutters =
    rank === 2 && (a.shutters ?? new Random(deriveSeed(house.seed ?? 17, a.id, "shutters")).next() < 0.5);
  return {
    prefab: `dormer-cottage-half${shutters ? "-shutters" : ""}/${rank}`,
    params: {
      overhang: 0.1,
      expand: [0.1, 0.05, 0.3][rank - 1],
      pitch: [0.1, 0.15, 0.2][rank - 1]
    }
  };
}
/** A wall prefab as a part: a mount on the walls and the building prefab, scaled to the
 * installation size. The prefab's bounds, occupied space and members come from the asset layer
 * at design time, so the draft names the prefab only. */
function wallAttachmentPart(house: CoreHouseParameters, a: CoreWallAttachment): BuildingPartDef {
  if (a.kind === "opening") return archPart(house, a);
  const eave = a.type !== undefined && EAVE_TYPES.has(a.type);
  const shed = a.type === "dormer-cottage-half" ? eaveShed(house, a) : undefined;
  const kind = a.kind;
  const corner = a.type === "window-cottage-corner";
  const prefab = shed?.prefab ?? `${a.type ?? DEFAULT_WALL_TYPES[kind]}/${a.rank ?? 1}`;
  return {
    id: `${house.id}/${a.id}`,
    group: house.id,
    type: eave ? "eaveDormer" : WALL_PART_TYPES[kind],
    geometry: {
      generator: eave ? "houseEaveMount" : corner ? "houseCornerMount" : "houseWallMount",
      params: { prefab, u: a.u, bottom: a.bottom, width: a.width, height: a.height, ...shed?.params }
    },
    algorithm: {
      type: "mountPrefab",
      params: {
        width: a.width,
        height: a.height,
        ...(corner && { evenPlan: true, anchor: "origin" }),
        unitParams: {
          kind: a.kind,
          u: a.u,
          ...(a.frameMaterial === "wall" && { frameMaterial: "wall" }),
          ...(a.woodColor !== undefined && { woodColor: a.woodColor }),
          ...(a.lightColor !== undefined && { lightColor: a.lightColor }),
          ...(a.lightIntensity !== undefined && { lightIntensity: a.lightIntensity })
        }
      }
    },
    // Resized about the middle of its back; the stretch covers any installation size.
    unit: { source: { prefab }, pivot: [0.5, 0.5, 0], range: { min: [0.01, 0.01, 0.01], max: [100, 100, 100] } }
  };
}

/** A roof prefab as a part: a mount on the roof under the plan point that `uv` addresses,
 * and the building prefab, scaled to the installation size. */
function roofAttachmentPart(house: CoreHouseParameters, a: CoreRoofAttachment): BuildingPartDef {
  if (!(a.uv.length === 2 && a.uv.every((v) => Number.isFinite(v) && v >= 0 && v <= 1)))
    throw Error(`Roof attachment "${a.id}" needs uv in [0, 1]`);
  const rank = a.rank ?? 1;
  // A Cottage dormer repeats its single body: rank bodies side by side under one shed roof,
  // whose back rises by a tenth of the roof's height or more for wider sheds (as online).
  const shed = a.type === "dormer-cottage";
  const prefab = `${a.type}/${shed ? 1 : rank}`;
  const shape = profileShape(
    normalizeProfileFootprint(
      house.circle ? { circle: house.circle } : { rectangle: house.rectangle ?? DEFAULT_RECTANGLE }
    )
  );
  const [width, depth] = shape.type === "circle" ? [2 * shape.radius, 2 * shape.radius] : [shape.width, shape.depth];
  const [c, s] = shape.type === "circle" ? [Math.cos(shape.phase ?? 0), Math.sin(shape.phase ?? 0)] : shape.orientation;
  const lx = (a.uv[0] - 0.5) * width,
    lz = (0.5 - a.uv[1]) * depth;
  const at: [number, number] = [shape.center[0] + c * lx - s * lz, shape.center[1] + s * lx + c * lz];
  const kind = ROOF_PREFABS[a.type];
  if (!kind) throw Error(`Unknown roof attachment type "${a.type}"`);
  return {
    id: `${house.id}/${a.id}`,
    group: house.id,
    type: kind.type,
    geometry: {
      generator: kind.generator,
      params: {
        prefab,
        at,
        bottom: a.bottom ?? 0,
        ...(a.width !== undefined && { width: a.width }),
        ...(a.height !== undefined && { height: a.height }),
        ...(kind.facing && { facing: kind.facing }),
        ...(shed && {
          count: rank,
          spacing: [0, 0.75, 0.7333][rank - 1],
          overhang: 0.1,
          pitch: [0.1, 0.15, 0.2][rank - 1]
        })
      }
    },
    algorithm: {
      type: "mountPrefab",
      params: {
        ...(a.width !== undefined && { width: a.width }),
        ...(a.height !== undefined && { height: a.height }),
        anchor: "origin",
        ...(shed && rank > 1 && { row: { count: rank, spacing: [0, 0.75, 0.7333][rank - 1] } }),
        unitParams: {
          kind: kind.kind,
          host: "roof",
          ...(a.frameMaterial === "wall" && { frameMaterial: "wall" }),
          ...(a.woodColor !== undefined && { woodColor: a.woodColor }),
          ...(a.lightColor !== undefined && { lightColor: a.lightColor }),
          ...(a.lightIntensity !== undefined && { lightIntensity: a.lightIntensity })
        }
      }
    },
    unit: { source: { prefab }, pivot: [0.5, 0.5, 0], range: { min: [0.01, 0.01, 0.01], max: [100, 100, 100] } }
  };
}
/** The foundation as a part: a solid skirt in level courses hung from the base's top, or a
 * slab on pillars whose faces each carry their own courses, 0.1 m deep and 0.02 m proud. */
function foundationPart(house: CoreHouseParameters, f: CoreFoundation): BuildingPartDef {
  const source = f.unit ?? "brick",
    rule = f.rule ?? (source === "wooden_plank" ? "parallel_rows" : "staggered_rows"),
    footprint = f.footprint ?? DEFAULT_FOOTPRINT,
    scale = unitFootprintScale(footprint);
  const solid = f.mode === "solid";
  const pitch = (rule === "parallel_rows" ? 0.22 : rule === "horizontal_rows" ? 1.4 : 0.5) * scale.width;
  return {
    id: house.id + "-foundation",
    group: house.id,
    type: "foundation",
    geometry: { generator: solid ? "houseFoundation" : "housePillarFoundation", params: { "@shared": "house" } },
    algorithm: {
      type: "foundationCourses",
      params: {
        footprint,
        rule,
        ...(!solid && { courses: "stacked", depth: 0.1 * scale.depth, proud: 0.02 })
      }
    },
    // A course is cut at the ends of each face and at the ground; parallel rows run the
    // height of their face.
    unit: {
      source,
      bounds: CUBE,
      scale: [pitch, 0.25 * scale.height, 0.1 * scale.depth],
      range: { min: [0.01, 0.01, 0.1], max: [1, rule === "parallel_rows" ? 1000 : 1.15, 10] }
    }
  };
}
const DEFAULT_RECTANGLE = { center: [0, 0] as [number, number], size: [8, 6] as [number, number], rotation: 0 };

/** Several houses in one draft, so that houses that touch connect: one group per house. */
export function buildCoreHouses(houses: readonly CoreHouseParameters[]): BuildingCoreDraft {
  const drafts = houses.map((h) => buildCoreHouse(h));
  return {
    groups: drafts.flatMap((d) => d.groups),
    parts: drafts.flatMap((d) => d.parts),
    connections: drafts.flatMap((d) => d.connections ?? [])
  };
}
/** A house group: walls and a roof that share the footprint, wall height and roof. */
export function buildCoreHouse(p: CoreHouseParameters): BuildingCoreDraft {
  const footprint = normalizeProfileFootprint(
    p.circle ? { circle: p.circle } : { rectangle: p.rectangle ?? DEFAULT_RECTANGLE }
  );
  const unit = p.footprint ?? DEFAULT_FOOTPRINT;
  const seed = p.seed ?? 17;
  if (p.foundation && !(Number.isFinite(p.foundation.height) && p.foundation.height >= 0))
    throw Error("A foundation height must be a finite number of metres, 0 or more");
  const raised = (p.foundation?.height ?? 0) > 0;
  const grid = p.walls === "grid",
    timber = p.walls === "timber";
  if (p.wallUnit && !grid) throw Error("A wall unit is chosen for grid courses only");
  const rule = p.wallRule ?? "staggered_rows";
  const scale = unitFootprintScale(unit);
  const brick: BuildingUnit = timber
    ? {
        // A board: its thickness across x, its length along y and its height up z, in metres.
        source: "wooden_plank",
        bounds: CUBE,
        scale: [0.32 * scale.depth, 5 * scale.width, 0.3944 * scale.height],
        range: { min: [0.5, 0.001, 0.1], max: [1.5, 1, 3] }
      }
    : {
        source: grid ? (p.wallUnit ?? "brick") : "brick",
        bounds: CUBE,
        scale: [unit.width, unit.height, unit.depth],
        range: grid
          ? // Grid courses cut units at the ends, the ground and the roof joint. Overlap rows grow
            // 15% taller than the course; horizontal rows are 1.4 by 0.3944 m against the
            // reference unit, and parallel rows run the wall's height.
            {
              min: [0.05, 0.05, 1],
              max: rule === "horizontal_rows" ? [2.8, 0.91, 1] : rule === "parallel_rows" ? [1, 1000, 1] : [1, 1.15, 1]
            }
          : // Masonry bricks vary with the joint and course jitter, and run 0.56 m deep through
            // the wall against a 0.1 m nominal unit depth.
            { min: [0.05, 0.05, 1], max: [2.5, 1.8, 8] }
      };
  const merlon: BuildingUnit = {
    source: "brick",
    bounds: CUBE,
    scale: [unit.width, unit.height, unit.depth],
    range: { min: [0.05, 0.05, 1], max: [2.5, 1.8, 8] }
  };
  // Masonry scales against the brick prototype; one course seed for the whole house, so the
  // walls continue each other's courses.
  const courses = timber
    ? { type: "boardCourses", params: { footprint: unit } }
    : grid
      ? { type: "gridCourses", params: { rule, footprint: unit } }
      : { type: "masonryCourses", params: { courseSeed: seed } };
  // Every part reads the house, the brick and the courses from the group, so the draft
  // stores each of them once.
  const shared = {
    house: {
      footprint,
      height: normalizeProfileHeight(p.height ?? 4),
      roof: normalizeProfileRoof(p.roof ?? {}),
      wallUnit: unit,
      ...(p.floors?.interval !== undefined && { floorInterval: p.floors.interval }),
      ...(raised && {
        foundation: { height: p.foundation!.height, ...(p.foundation!.mode && { mode: p.foundation!.mode }) }
      })
    },
    brick,
    courses
  };
  // The finish covers the walls as one continuous unit; it wears off at its edges.
  const plaster =
    p.plaster && p.plaster.enabled !== false
      ? {
          id: p.id + "-plaster",
          group: p.id,
          type: "plaster",
          geometry: { generator: "housePlaster", params: { "@shared": "house" } },
          algorithm: {
            type: "coverSurfaces",
            params: { unitParams: { wear: p.plaster.wear ?? 0.3, color: p.plaster.color ?? 0 } }
          },
          unit: { source: "plaster" }
        }
      : undefined;
  // Floor bands run around the house between storeys, laid with the wall's brick.
  const floors =
    p.floors && p.floors.enabled !== false && floorLevels(shared.house.height, p.floors.interval ?? 3.5).length
      ? {
          id: p.id + "-floors",
          group: p.id,
          type: "floorBand",
          geometry: { generator: "houseFloorBands", params: { "@shared": "house" } },
          // On a timber wall a band is one row of boards standing 0.06 m proud of the wall's.
          algorithm: timber
            ? { type: "boardCourses", params: { footprint: unit, out: 0.185 * scale.depth, overshoot: 0 } }
            : { type: "beltCourses" },
          unit: { "@shared": "brick" }
        }
      : undefined;
  // A rectangle has one wall per side; the corners between them derive the corner stones.
  // A circle, grid courses or a timber house has one wall: boards and grid courses break at
  // the corners themselves.
  const sides = grid || timber || p.circle ? [undefined] : [0, 1, 2, 3];
  const walls = sides.map((side) => ({
    id: side === undefined ? p.id + "-wall" : `${p.id}-wall-${side}`,
    group: p.id,
    type: "wall",
    geometry:
      side === undefined
        ? { generator: "houseWall", params: { "@shared": "house" } }
        : { generator: "houseWallSide", params: { "@shared": "house", side } },
    algorithm: { "@shared": "courses" },
    unit: { "@shared": "brick" }
  }));
  const roofParams = shared.house.roof;
  // A pitched roof over a rectangle has one part per slope; the joins between slopes derive
  // the hip and ridge caps. Other roofs keep one roof part.
  const pitched = !isFlatRoofHeight(roofParams.height);
  const slopes = !p.circle && pitched;
  // A slope sits on the wall below it; a single roof part, or a roof over one wall, sits
  // on every wall.
  const under = (side: number) => (walls.length === 4 ? [walls[side]] : walls).map((w) => ({ part: w.id }));
  const roofs = slopes
    ? [0, 1, 2, 3]
        // A gable roof has no slope over the gable walls.
        .filter((side) => roofParams.ridge_length !== 1 || (side + roofParams.ridge_direction) % 2 === 1)
        .map((side) => ({
          part: {
            id: `${p.id}-roof-${side}`,
            group: p.id,
            type: "roof",
            geometry: { generator: "houseRoofSlope", params: { "@shared": "house", side } },
            algorithm: { "@shared": "roofTiles" },
            unit: { "@shared": "tile" }
          },
          hosts: under(side)
        }))
    : pitched
      ? // A round roof is one cone over the round wall.
        [
          {
            part: {
              id: p.id + "-roof",
              group: p.id,
              type: "roof",
              geometry: { generator: "houseRoofCone", params: { "@shared": "house" } },
              algorithm: { "@shared": "roofTiles" },
              unit: { "@shared": "tile" }
            },
            hosts: walls.map((w) => ({ part: w.id }))
          }
        ]
      : // A flat roof is a paved deck at the wall top, with a parapet around it unless the
        // roof has no rim.
        [
          {
            part: {
              id: p.id + "-roof",
              group: p.id,
              type: "roofDeck",
              geometry: { generator: "houseRoofDeck", params: { "@shared": "house" } },
              // A masonry house paves its flat roof in irregular stone, unless told otherwise.
              ...((p.roofPaving ?? (!p.roofUnit && brick.source === "brick" ? "stone" : "rows")) === "stone"
                ? {
                    algorithm: {
                      type: "coverSurfaces",
                      params: {
                        unitParams: { footprint: { width: unit.width, height: unit.height, depth: unit.depth } }
                      }
                    },
                    unit: { source: "stone_floor" }
                  }
                : {
                    algorithm: { type: "deckRows", params: { cell: [unit.width, (unit.height * 0.4) / 0.4375] } },
                    unit: { "@shared": "tile" }
                  })
            },
            hosts: walls.map((w) => ({ part: w.id }))
          },
          ...(roofParams.flat_rim === 0
            ? [
                {
                  part: {
                    id: p.id + "-parapet",
                    group: p.id,
                    type: "parapet",
                    geometry: { generator: "houseParapet", params: { "@shared": "house" } },
                    // Timber has no masonry: the stones are solid, in the roof's colours.
                    algorithm: { type: "parapetCourses", ...(timber && { params: { roofColor: true } }) },
                    unit: timber ? merlon : { "@shared": "brick" }
                  },
                  hosts: walls.map((w) => ({ part: w.id }))
                }
              ]
            : [])
        ];
  // A round roof, or a pyramid roof whose ridge shrinks to a square cap, ends in a spire.
  const size = p.rectangle?.size ?? [8, 6];
  const cap = (1 - roofParams.ridge_length) * 0.1 + roofParams.ridge_length * size[roofParams.ridge_direction];
  const spire =
    pitched && (p.circle || Math.max(cap / 0.1, 0.1 / cap) < 1.01)
      ? {
          part: {
            id: p.id + "-spire",
            group: p.id,
            type: "spire",
            geometry: { generator: "roofApex" },
            algorithm: {
              type: "placeAtPoints",
              // The spire mesh follows the roof profile at its collar.
              params: { unitParams: { radius: 0.25, profile: roofParams.profile } }
            },
            unit: { source: "roofSpire" }
          },
          hosts: roofs.map((r) => ({ part: r.part.id }))
        }
      : undefined;
  const foundation = raised ? foundationPart(p, p.foundation!) : undefined;
  const baseFinish =
    foundation && p.foundation!.plaster && p.foundation!.plaster.enabled !== false ? p.foundation!.plaster : undefined;
  const basePlaster: BuildingPartDef | undefined =
    foundation && baseFinish
      ? {
          id: foundation.id + "-plaster",
          group: p.id,
          type: "plaster",
          geometry: { generator: "surfaceFinish", params: { proud: 0.05 } },
          algorithm: {
            type: "coverSurfaces",
            // The walls stand on the base: its plaster is whole where they meet it.
            params: { unitParams: { wear: baseFinish.wear ?? 0.3, color: baseFinish.color ?? 0, wholeAtTop: true } }
          },
          unit: { source: "plaster" }
        }
      : undefined;
  const mounted = (p.attachments ?? []).map((a) => wallAttachmentPart(p, a));
  for (const a of p.roofAttachments ?? []) {
    const onDeck = ROOF_PREFABS[a.type]?.generator === "houseDeckMount";
    if (onDeck && pitched) throw Error(`A ${a.type} needs a flat roof`);
    if (!onDeck && !pitched) throw Error("A dormer needs a pitched roof");
  }
  const onRoof = (p.roofAttachments ?? []).map((a) => roofAttachmentPart(p, a));
  const tiles = { row: 0.3, column: 0.32 };
  const eaves = mounted.filter((part) => part.type === "eaveDormer");
  if (eaves.length && !pitched) throw Error("An eave dormer needs a pitched roof");
  const onWalls = [
    ...(floors ? [floors] : []),
    ...(plaster ? [plaster] : []),
    ...mounted.filter((part) => part.type !== "eaveDormer")
  ];
  return {
    groups: [
      {
        id: p.id,
        seed,
        shared: {
          ...shared,
          // Palette entries the renderer colors the house with.
          appearance: { wall: p.wallColor ?? 0, roof: roofParams.color, wood: p.woodColor ?? 0 },
          tile: {
            source: p.roofUnit ?? "roof_tile",
            bounds: CUBE,
            // The wall's unit size has no say over the roof's tiles.
            scale: [DEFAULT_FOOTPRINT.width, DEFAULT_FOOTPRINT.height, DEFAULT_FOOTPRINT.depth],
            // Measured over 324 roofs: tiles narrow toward a hip top and run 1.1–2 units long;
            // eave closures can be short. Tiles keep their depth.
            range: { min: [0.1, 0.2, 1], max: [1.001, 2.2, 1] }
          },
          roofTiles: { type: p.circle ? "ringTiles" : "roofTiles" }
        }
      }
    ],
    parts: [
      ...(foundation ? [foundation] : []),
      ...(basePlaster ? [basePlaster] : []),
      ...walls,
      ...roofs.map((r) => r.part),
      ...(spire ? [spire.part] : []),
      ...onWalls,
      ...eaves,
      ...onRoof
    ],
    connections: [
      ...(foundation && basePlaster
        ? [
            {
              kind: "attach" as const,
              id: basePlaster.id + "/on-base",
              guest: basePlaster.id,
              hosts: [{ part: foundation.id }]
            }
          ]
        : []),
      ...roofs.map(({ part, hosts }) => ({
        kind: "attach" as const,
        id: part.id + "/on-wall",
        guest: part.id,
        hosts
      })),
      ...(spire
        ? [{ kind: "attach" as const, id: spire.part.id + "/on-roof", guest: spire.part.id, hosts: spire.hosts }]
        : []),
      // Floor bands and the finish follow every wall.
      ...onWalls.map((part) => ({
        kind: "attach" as const,
        id: part.id + "/on-wall",
        guest: part.id,
        hosts: walls.map((w) => ({ part: w.id }))
      })),
      // An eave dormer opens a wall and the roof part behind it: walls first.
      ...eaves.map((part) => ({
        kind: "attach" as const,
        id: part.id + "/on-house",
        guest: part.id,
        hosts: [...walls.map((w) => ({ part: w.id })), ...roofs.map((r) => ({ part: r.part.id }))],
        params: { tiles }
      })),
      // A dormer sits on whichever roof part is under it; a deck prefab stands on the deck.
      ...onRoof.map((part) => ({
        kind: "attach" as const,
        id: part.id + "/on-roof",
        guest: part.id,
        hosts: roofs
          .filter((r) => part.type === "dormer" || part.type === "shedDormer" || r.part.type === "roofDeck")
          .map((r) => ({ part: r.part.id })),
        ...(part.type === "dormer" && { params: { tiles } })
      }))
    ]
  };
}
