// Application layer: friendly European parameters → core drafts.
import { type BuildingCoreDraft, type BuildingPartDef, type BuildingUnit } from "../core";
import { normalizeProfileFootprint, normalizeProfileHeight, normalizeProfileRoof } from "../runtime/ProfileParameters";
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
  /** Wall laying: our masonry (default) or regular grid courses. */
  walls?: "masonry" | "grid";
  /** Course rule of grid walls. Default: staggered rows. */
  wallRule?: "staggered_rows" | "overlap_rows" | "parallel_rows" | "horizontal_rows";
  /** Unit the roof is laid with: tiles (default), or planks or bricks, as on a flat deck. */
  roofUnit?: "roof_tile" | "wooden_plank" | "brick";
  /** Prefabs mounted on the walls: windows, doors and wall lamps. `u` is a fraction of the
   * perimeter, `bottom` the height above the wall's base, `width` and `height` the
   * installation size; the type defaults by kind. */
  attachments?: readonly CoreWallAttachment[];
  /** Floor bands between storeys. Default: none. */
  floors?: { enabled?: boolean; interval?: number };
  /** A plaster finish over the walls: its wear (0..1, how much masonry shows at the edges)
   * and palette entry. Default: none. */
  plaster?: { enabled?: boolean; wear?: number; color?: number };
  /** Palette entries of the wall and wood materials. Default: 0. The roof color is `roof.color`. */
  wallColor?: number;
  woodColor?: number;
}
export interface CoreWallAttachment {
  id: string;
  kind: "window" | "door" | "wall-lamp" | "lantern";
  type?: string;
  rank?: 1 | 2 | 3;
  u: number;
  bottom: number;
  width: number;
  height: number;
  seed?: number;
  woodColor?: number;
  lightColor?: number;
  lightIntensity?: number;
}
/** The part type of each attachment kind. */
const WALL_PART_TYPES: Readonly<Record<CoreWallAttachment["kind"], (typeof WALL_MOUNTS)[number]>> = {
  window: "window",
  door: "door",
  "wall-lamp": "lamp",
  lantern: "lamp"
};
const DEFAULT_WALL_TYPES: Readonly<Record<CoreWallAttachment["kind"], string>> = {
  window: "window-cottage",
  door: "door-cottage",
  "wall-lamp": "wall-lantern",
  lantern: "wall-lantern"
};
/** A wall prefab as a part: a mount on the walls and the building prefab, scaled to the
 * installation size. The prefab's bounds, opening and members come from the asset layer at
 * design time, so the draft names the prefab only. */
function wallAttachmentPart(house: CoreHouseParameters, a: CoreWallAttachment): BuildingPartDef {
  const prefab = `${a.type ?? DEFAULT_WALL_TYPES[a.kind]}/${a.rank ?? 1}`;
  return {
    id: `${house.id}/${a.id}`,
    group: house.id,
    type: WALL_PART_TYPES[a.kind],
    geometry: {
      generator: "houseWallMount",
      params: { prefab, u: a.u, bottom: a.bottom, width: a.width, height: a.height }
    },
    algorithm: {
      type: "mountPrefab",
      params: {
        width: a.width,
        height: a.height,
        unitParams: {
          kind: a.kind,
          u: a.u,
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
    p.circle ? { circle: p.circle } : { rectangle: p.rectangle ?? { center: [0, 0], size: [8, 6], rotation: 0 } }
  );
  const unit = p.footprint ?? DEFAULT_FOOTPRINT;
  const seed = p.seed ?? 17;
  const grid = p.walls === "grid";
  const brick: BuildingUnit = {
    source: "brick",
    bounds: CUBE,
    scale: [unit.width, unit.height, unit.depth],
    range: grid
      ? // Grid courses cut bricks at the ends, the ground and the roof joint; overlap rows
        // grow 15% taller than the course.
        { min: [0.05, 0.05, 1], max: [1, 1.15, 1] }
      : // Masonry bricks vary with the joint and course jitter, and run 0.56 m deep through
        // the wall against a 0.1 m nominal unit depth.
        { min: [0.05, 0.05, 1], max: [2.5, 1.8, 8] }
  };
  // Masonry scales against the brick prototype; one course seed for the whole house, so the
  // walls continue each other's courses.
  const courses = grid
    ? { type: "gridCourses", params: { rule: p.wallRule ?? "staggered_rows", footprint: unit } }
    : { type: "masonryCourses", params: { courseSeed: seed } };
  // Every part reads the house, the brick and the courses from the group, so the draft
  // stores each of them once.
  const shared = {
    house: {
      footprint,
      height: normalizeProfileHeight(p.height ?? 4),
      roof: normalizeProfileRoof(p.roof ?? {}),
      wallUnit: unit,
      ...(p.floors?.interval !== undefined && { floorInterval: p.floors.interval })
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
          geometry: { generator: "housePlaster", params: { $shared: "house" } },
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
          geometry: { generator: "houseFloorBands", params: { $shared: "house" } },
          algorithm: { type: "beltCourses" },
          unit: { $shared: "brick" }
        }
      : undefined;
  // A rectangle has one wall per side; the corners between them derive the corner stones.
  // A circle, or the grid courses kept for comparison with the online path, has one wall.
  const sides = grid || p.circle ? [undefined] : [0, 1, 2, 3];
  const walls = sides.map((side) => ({
    id: side === undefined ? p.id + "-wall" : `${p.id}-wall-${side}`,
    group: p.id,
    type: "wall",
    geometry:
      side === undefined
        ? { generator: "houseWall", params: { $shared: "house" } }
        : { generator: "houseWallSide", params: { $shared: "house", side } },
    algorithm: { $shared: "courses" },
    unit: { $shared: "brick" }
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
            geometry: { generator: "houseRoofSlope", params: { $shared: "house", side } },
            algorithm: { $shared: "roofTiles" },
            unit: { $shared: "tile" }
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
              geometry: { generator: "houseRoofCone", params: { $shared: "house" } },
              algorithm: { $shared: "roofTiles" },
              unit: { $shared: "tile" }
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
              geometry: { generator: "houseRoofDeck", params: { $shared: "house" } },
              algorithm: { type: "deckRows", params: { cell: [unit.width, (unit.height * 0.4) / 0.4375] } },
              unit: { $shared: "tile" }
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
                    geometry: { generator: "houseParapet", params: { $shared: "house" } },
                    algorithm: { type: "masonryCourses", params: { crenels: {} } },
                    unit: { $shared: "brick" }
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
  const mounted = (p.attachments ?? []).map((a) => wallAttachmentPart(p, a));
  const onWalls = [...(floors ? [floors] : []), ...(plaster ? [plaster] : []), ...mounted];
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
            scale: [unit.width, unit.height, unit.depth],
            // Measured over 324 roofs: tiles narrow toward a hip top and run 1.1–2 units long;
            // eave closures can be short. Tiles keep their depth.
            range: { min: [0.1, 0.2, 1], max: [1.001, 2.2, 1] }
          },
          roofTiles: { type: p.circle ? "ringTiles" : "roofTiles" }
        }
      }
    ],
    parts: [...walls, ...roofs.map((r) => r.part), ...(spire ? [spire.part] : []), ...onWalls],
    connections: [
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
      }))
    ]
  };
}
