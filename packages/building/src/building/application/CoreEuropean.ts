// Application layer: friendly European parameters → a core draft plus its render plan.
//
// COMPAT(online-parity): this file reproduces the online European wall and fence
// byte for byte while both paths coexist. Every marked line exists only for that
// and is deleted with the online path. See ../MIGRATION.md.
import { authorPartKey, type BuildingCoreDraft, type BuildingUnit, type LaidUnit } from "../core";
import { normalizeProfileFootprint, normalizeProfileHeight, normalizeProfileRoof } from "../runtime/ProfileParameters";
import { unitFootprintScale, type MaterialFootprint } from "../runtime/MaterialFootprint";
import { isFlatRoofHeight } from "../runtime/RoofMode";
import { floorLevels } from "../partTypes/House";
import type { UnitPlacementBinding } from "../runtime/UnitPlacement";
import type { CoreRenderPlan, CoreStripDraw } from "../render/CoreRenderInput";

export interface CoreStripParameters {
  id: string;
  seed?: number;
  length?: number;
  depth?: number;
  height?: number;
  center?: [number, number];
  rotation?: number;
  footprint?: MaterialFootprint;
}
export interface CoreBuilding {
  readonly draft: BuildingCoreDraft;
  readonly render: CoreRenderPlan;
}

const CUBE = { min: [-0.5, -0.5, -0.5], max: [0.5, 0.5, 0.5] } as const;
const DEFAULT_FOOTPRINT: MaterialFootprint = { width: 0.5, height: 0.4375, depth: 0.1 };
/** Joint left between neighbouring bricks, in metres. */
const MORTAR = 0.012;
// COMPAT(online-parity): the online insetMaterialSpan caps a joint at a fifth of the span.
const MORTAR_LIMIT = 0.2;
// COMPAT(online-parity): the online path keeps arbitrarily thin end pieces, so the
// range barely limits shrinking. A real brick range would reject slivers.
const SLIVER = 0.001;

function strip(p: CoreStripParameters, depth: number, unit: UnitPlacementBinding["unit_id"], rule: string) {
  const footprint = p.footprint ?? DEFAULT_FOOTPRINT;
  // COMPAT(online-parity): the online normalizers round to Float32; reuse them for equal bytes.
  const rectangle = normalizeProfileFootprint({
    rectangle: { center: p.center ?? [0, 0], size: [p.length ?? 8, p.depth ?? depth], rotation: p.rotation ?? 0 }
  }).rectangle!;
  const surface = p.id + "-surface";
  // COMPAT(online-parity): binding, owner palette and geometry record reproduce the
  // online placement document and palette slot shapes.
  const binding: UnitPlacementBinding = {
    id: surface + "/placement",
    geometry_id: surface,
    rule: { type: rule as UnitPlacementBinding["rule"]["type"] },
    unit_id: unit,
    footprint,
    seed: "source"
  };
  const seed = p.seed ?? 17;
  return {
    footprint,
    rectangle,
    height: normalizeProfileHeight(p.height ?? 1.5),
    scale: unitFootprintScale(footprint),
    surface,
    binding,
    group: { id: p.id, seed },
    owner: {
      id: p.id,
      slot: 0,
      seed,
      palette: { wallColor: 0, woodColor: 0, roofColor: normalizeProfileRoof({}).color }
    },
    geometry: { id: surface, type: "strip" as const, source: { type: "enclosure", building_id: p.id } }
  };
}

/** A free-standing brick wall in staggered rows. */
export function buildCoreWall(p: CoreStripParameters): CoreBuilding {
  const s = strip(p, 0.45, "brick", "staggered_rows");
  const brick: BuildingUnit = {
    source: "brick",
    bounds: CUBE,
    scale: [s.footprint.width, s.footprint.height, s.rectangle.size[1] * s.scale.depth],
    range: { min: [SLIVER, SLIVER, 1], max: [1, 1, 1] }
  };
  const rows = Math.max(1, Math.ceil(s.height / s.footprint.height));
  const length = s.rectangle.size[0];
  const draw: CoreStripDraw = {
    owner: p.id,
    binding: s.binding,
    geometry: s.geometry,
    role: "enclosure",
    parts: [
      {
        key: authorPartKey(s.surface),
        // COMPAT(online-parity): online cell ids and its row-based anchor v.
        name: (unit: LaidUnit) => {
          const [, r, c] = unit.key.split(":").map(Number);
          const [u] = unit.params!.uv as number[];
          return { id: `${p.id}/row-${r}/${c}`, anchor_uv: [u / length, (r + 0.5) / rows], order: [] };
        }
      }
    ]
  };
  return {
    draft: {
      groups: [s.group],
      parts: [
        {
          id: s.surface,
          group: p.id,
          type: "wall",
          geometry: { generator: "strip", params: { rectangle: s.rectangle, height: s.height } },
          algorithm: {
            type: "surfaceGrid",
            params: { elements: ["face"], stagger: 0.5, trim: true, gap: [MORTAR, MORTAR], gapLimit: MORTAR_LIMIT }
          },
          unit: brick
        }
      ]
    },
    render: { owners: [s.owner], strips: [draw] }
  };
}

/** A timber fence: posts on every span boundary and two rails per span. */
export function buildCoreFence(p: CoreStripParameters): CoreBuilding {
  const s = strip(p, 0.15, "wooden_plank", "posts_and_rails");
  const depth = s.rectangle.size[1],
    length = s.rectangle.size[0];
  const maxSpacing = 1.6 * s.scale.width;
  const spans = Math.max(1, Math.ceil(length / maxSpacing));
  const post = Math.min(0.16, depth);
  const levels = [0.35, 0.78];
  const posts = s.surface + "#posts",
    rails = s.surface + "#rails";
  const geometry = {
    generator: "fence",
    params: { rectangle: s.rectangle, height: s.height, maxSpacing, levels }
  };
  // COMPAT(online-parity): posts and rails are two core parts; the online path draws
  // them as one group, posts first, then rails interleaved by span.
  const draw: CoreStripDraw = {
    owner: p.id,
    binding: s.binding,
    geometry: s.geometry,
    role: "enclosure",
    parts: [
      {
        key: authorPartKey(posts),
        name: (unit) => {
          const i = Number(unit.key.split(":")[1]);
          return { id: `${p.id}/post-${i}`, anchor_uv: [i / spans, 0.5], order: [i] };
        }
      },
      {
        key: authorPartKey(rails),
        name: (unit) => {
          const [, j, i] = unit.key.split(":").map(Number);
          return { id: `${p.id}/rail-${i}/${j}`, anchor_uv: [(i + 0.5) / spans, levels[j]], order: [i, j] };
        }
      }
    ]
  };
  return {
    draft: {
      groups: [s.group],
      parts: [
        {
          id: posts,
          group: p.id,
          type: "fencePost",
          geometry,
          algorithm: { type: "placeAtPoints" },
          unit: {
            source: "wooden_plank",
            bounds: CUBE,
            pivot: [0.5, 0, 0.5],
            scale: [post * s.scale.width, s.height, post * s.scale.depth]
          }
        },
        {
          id: rails,
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
            scale: [maxSpacing, 0.11 * s.scale.height, Math.min(0.1, depth) * s.scale.depth],
            // On a slope a rail is longer than its horizontal span.
            range: { min: [SLIVER, 1, 1], max: [2, 1, 1] }
          }
        }
      ]
    },
    render: { owners: [s.owner], strips: [draw] }
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
  /** Floor bands between storeys. Default: none. */
  floors?: { enabled?: boolean; interval?: number };
  /** Palette entries of the wall and wood materials. Default: 0. The roof color is `roof.color`. */
  wallColor?: number;
  woodColor?: number;
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
      ? // COMPAT(online-parity): the online arranged courses keep arbitrarily thin pieces
        // at the roof joint and the ground; overlap rows grow 15% taller than the course.
        { min: [SLIVER, SLIVER, 1], max: [1, 1.15, 1] }
      : // Masonry bricks vary with the joint and course jitter, and run 0.56 m deep through
        // the wall against a 0.1 m nominal unit depth.
        { min: [0.05, 0.05, 1], max: [2.5, 1.8, 8] }
  };
  // Masonry scales against the brick prototype; one course seed for the whole house, so the
  // walls continue each other's courses.
  const courses = grid
    ? { type: "gridCourses", params: { rule: "staggered_rows", footprint: unit } }
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
            source: "roof_tile",
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
    parts: [...walls, ...roofs.map((r) => r.part), ...(spire ? [spire.part] : []), ...(floors ? [floors] : [])],
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
      ...(floors
        ? [
            {
              kind: "attach" as const,
              id: floors.id + "/on-wall",
              guest: floors.id,
              hosts: walls.map((w) => ({ part: w.id }))
            }
          ]
        : [])
    ]
  };
}
