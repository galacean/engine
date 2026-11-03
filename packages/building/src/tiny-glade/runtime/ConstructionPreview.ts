import { constructionWindowCutWall, wallWindowCutBuffer } from "./ConstructionWallWindowCuts";
import { retainWallUnits, retainWallDraws, type RetainedWallUnits } from "./ConstructionWallLod";
import { wallRoofJointSupport } from "./ConstructionWallRoofJoint";
import { clipPlasterSupport, type ConstructionPlasterDomain } from "./ConstructionPlasterSupport";
import { plasterFinishTop } from "./PlasterFinishPolicy";
import { usesStonePaving, stonePavingPlacement, type StonePavingPlacement } from "./StonePavingPlacement";
import { generateConstructionRoofUnits, roofLogicalPlacements } from "./ConstructionRoof";
import { constructionHorizontalWoodWall } from "./ConstructionWoodWall";
import {
  constructionLodAppearance,
  constructionLodSurfaceCells,
  type ConstructionLodAppearance
} from "./ConstructionLodAppearance";
import { compileWallMasonryInFrame } from "./ConstructionWallFrame";
import { nativeWallCells, arrangedWallCells, arrangedSurfaceCells } from "./ConstructionArrangement";
import { constructionWallOutlinePoint } from "./ConstructionWallEnvelope";
import { encodeCompleteConstructionDormerBins } from "./DormerBins";
import { woodArchFrameGeometry, woodArchPillarGeometry } from "./ConstructionWoodArchGeometry";
import type { ConstructionWoodArchPart, ConstructionWoodArchPillar } from "./ConstructionWoodArchRender";
import type { WallConnectionWipHole } from "./WallConnectionTypes";
import { constructionArchGroups, constructionArchInstanceGroups } from "./ConstructionArchGroups";
import type { ConstructionJunctionGroup } from "./ConstructionJunctionLayout";
import {
  decorationFrameBounds,
  decorationFrameGeometry,
  type ConstructionDecorationFrame
} from "./ConstructionDecorationFrames";
import { settledRoofCells, settledRoofGroups } from "./ConstructionSettledRoof";
import { decorationStoneBounds } from "./DecorationStoneBounds";
import { buildConstructionRoofSpire, constructionRoofSpirePlacement } from "./ConstructionRoofSpire";
import { clipRoofUnitFace } from "./ConstructionRoofUnitClip";
import { SurfaceProjector } from "./SurfaceProjector.js";
import type { ConstructionDecorationAppearance, ConstructionDecorationStone } from "./ConstructionDecorations";
import { buildConstructionFloors } from "./ConstructionFloors";
import {
  constructionSurfaceFrame,
  projectConstructionSurface,
  type ConstructionSurfaceRegion
} from "./ConstructionSurfaceFrame";
import { constructionPlasterParts, type ConstructionPlasterMetadata } from "./ConstructionPlaster";
import { masonryTintRoles, whiteMasonryVertexColors } from "./MasonryAppearance";
import { constructionJunctionGroups } from "./ConstructionJunctionLayout";
import { isFlatRoofHeight } from "./RoofMode";
import {
  constructionContactSource,
  publishConstructionOwners,
  generateConstructionContacts
} from "./ConstructionContacts";
import type { CompiledConstruction, ConstructionUnitAssets } from "./ConstructionCompiler";
import type { MasonryDocument, MaterialUnit, MasonryOverride } from "./MasonryDocument";
import { constructionRoof } from "./ConstructionSource";
import type { TerrainHeight } from "./PublishedWallProfile";
import { buildRoofContext, buildRoofMaterialContext } from "./RecoveredRoofContext";
import { buildConstructionFlatRoof } from "./ConstructionFlatRoof";
import { buildConstructionFoundation } from "./ConstructionFoundation";
import { wallSurfaceGeometry } from "./ConstructionArrangement";
import { enclosureCells } from "./ConstructionEnclosure";
import {
  type ConstructionDecorationPart,
  compileConstructionDecorations,
  assertConstructionDecorationInstallations
} from "./ConstructionDecorations";
import { resolvedArrangement } from "./MasonryDocument";
import { contains } from "./PlacementDocument.js";
import {
  surfaceBoundary,
  surfaceMaskTriangles,
  surfaceTriangleMapper,
  subtractSurfacePolygon,
  intersectSurfacePolygon,
  effectiveSurfaceRegions,
  trackSurfaceClipping,
  type SurfaceClippingStats,
  type SurfaceBoundary
} from "./SurfacePolygon";
/** Published support geometry, independent of render materials and paint partitions. */
export interface ConstructionSurfacePart {
  owner: string;
  positions: number[];
  indices: number[];
  /** Effective polygons in their original clipping charts. Render-only meshes omit these. */
  regions?: ConstructionSurfaceRegion[];
}
export interface ConstructionPreviewPart extends ConstructionSurfacePart {
  /** A retained material unit must never receive a second placement grid. */
  placement?: "unit";
  lodAppearance?: ConstructionLodAppearance;
  plaster?: ConstructionPlasterMetadata;
  stonePaving?: StonePavingPlacement;
  /** Resident backing clearance behind this coarse facade. */
  supportInset?: number;
  material: MaterialUnit | "wall";
  uvs: number[][];
  bindingId?: string;
  /** Scene attachment identity, independent of the host used for lighting. */
  pickId?: string;
  geometryId?: string;
  color?: number[];
  emissive?: number;
  decoration?: boolean;
  /** Original finial shares this geometry with the resident decoration batch. */
  roofSpire?: boolean;
  appearance?: ConstructionDecorationAppearance;
  colors?: number[];
  neutralColors?: number[];
  tintRoles?: number[];
  normals?: number[];
  emission?: number[];
  junction?: boolean;
  /** Attachment roof surface; resident draws own the settled roof units. */
  dormer?: boolean;
}
export const wallPalette = [
  [0.772549, 0.631373, 0.458824],
  [0.72549, 0.623529, 0.4],
  [0.352941, 0.333333, 0.270588],
  [0.596078, 0.572549, 0.458824],
  [0.458824, 0.431373, 0.352941]
];
export const roofPalette = [
  [0.588235, 0.411765, 0.258824],
  [0.372549, 0.337255, 0.231373],
  [0.294118, 0.4, 0.45098],
  [0.352941, 0.517647, 0.427451],
  [0.239216, 0.32549, 0.207843],
  [0.345098, 0.32549, 0.278431],
  [0.376471, 0.458824, 0.286275],
  [0.470588, 0.458824, 0.4],
  [0.462745, 0.411765, 0.231373],
  [0.32549, 0.447059, 0.45098],
  [0.4, 0.396078, 0.470588],
  [0.458824, 0.294118, 0.180392],
  [0.239216, 0.286275, 0.278431]
];
export const woodPalette = [
  [0.513725, 0.466667, 0.317647],
  [0.352941, 0.317647, 0.207843],
  [0.32549, 0.427451, 0.458824],
  [0.470588, 0.317647, 0.239216],
  [0.709804, 0.67451, 0.533333],
  [0.270588, 0.352941, 0.258824],
  [0.384314, 0.458824, 0.376471],
  [0.286275, 0.286275, 0.239216],
  [0.32549, 0.309804, 0.384314],
  [0.596078, 0.415686, 0.396078],
  [0.592157, 0.513725, 0.219608]
];
/** Original brick fragment shader color IDs select layers, not modulo palette size.
 * Palette averages remain a distance approximation of the original texture. */
export function constructionBrickColor(id: number) {
  const layer = constructionBrickLayer(id);
  return wallPalette[layer].map((c) => {
    if (id !== 1 && id !== 5) return c;
    const linear = c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    const powered = linear ** 1.1;
    return powered <= 0.0031308 ? powered * 12.92 : 1.055 * powered ** (1 / 2.4) - 0.055;
  });
}
export function constructionBrickLayer(id: number) {
  return [0, 1, 2, 3, 0, 1, 3, 2, 3, 3, 0, 4, 0][id] ?? 0;
}
/** Borrowed only within one compilation. Both charts retain their source ownership;
 * preview reads them and emits independent position/UV arrays. Never cache across edits. */
export interface ConstructionPreviewRoofContexts {
  author: ReturnType<typeof buildRoofContext>;
  material: ReturnType<typeof buildRoofMaterialContext>;
}
/** Same support charts, openings, author overrides and colors at every distance. */
export function constructionPreview(
  document: MasonryDocument,
  terrain: TerrainHeight,
  compiled?: Pick<
    CompiledConstruction,
    "owners" | "contactHoles" | "decorations" | "connections" | "merlons" | "spires" | "woodPillar"
  >,
  options: {
    /** Required for asset-backed geometry, including structure queries on compiled results. */
    assets?: ConstructionUnitAssets;
    includeStructure?: boolean;
    /** Build only for the distance renderer, not structure queries or resident uploads. */
    includeAppearance?: boolean;
    /** Preserve native attachment IDs and shader payloads for Scene-bound rendering. */
    retainDecorationParts?: boolean;
    /** Authored Scene attachments must all be accepted; generation previews may filter proposals. */
    requireAllDecorations?: boolean;
    clippingStats?: SurfaceClippingStats;
    preparedRoofs?: ReadonlyMap<string, ConstructionPreviewRoofContexts>;
  } = {}
) {
  const owners =
    compiled?.owners ??
    publishConstructionOwners(
      constructionContactSource(document.construction, document.bindings),
      terrain,
      document.bindings
    );
  const contacts =
    compiled ??
    generateConstructionContacts(owners, terrain, document.construction.environment.type === "host_terrain");

  const retainedWallUnits: RetainedWallUnits[] = [];
  const skinSources: ConstructionPreviewPart[] = [];
  const skinDomains = new Map<string, ConstructionPlasterDomain>();
  const parts: ConstructionPreviewPart[] = [],
    bounds = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
  const stones: ConstructionDecorationStone[] = [];
  const decorationParts: ConstructionDecorationPart[] = [];
  const woodArchFrames: ConstructionWoodArchPart[] = [],
    woodArchPillars: ConstructionWoodArchPillar[] = [];
  const archGroups: ConstructionJunctionGroup[] = [];
  const frames: ConstructionDecorationFrame[] = [];
  const roofAttachments: Uint8Array[] = [];
  // Capture in generation order by owner, before render batching or paint tessellation.
  // Worker/render-only consumers do not need this additional CPU representation.
  const structure = new Map<string, ConstructionSurfacePart>();
  const structuralPart = (owner: string) => {
    let p = structure.get(owner);
    if (!p) {
      p = { owner, positions: [], indices: [], regions: [] };
      structure.set(owner, p);
    }
    return p;
  };
  const appendPolygon = (p: ConstructionSurfacePart, vertices: number[][]) => {
    const base = p.positions.length / 3;
    p.positions.push(...vertices.flat());
    for (let i = 1; i < vertices.length - 1; i++) p.indices.push(base, base + i, base + i + 1);
  };
  const appendStructure = (
    owner: string,
    vertices: number[][],
    frame = constructionSurfaceFrame(vertices[0], vertices[1], vertices[2]),
    boundary: SurfaceBoundary = surfaceBoundary(frame ? vertices.map((p) => projectConstructionSurface(frame, p)) : [])
  ) => {
    const target = structuralPart(owner),
      base = target.positions.length / 3;
    appendPolygon(target, vertices);
    target.regions!.push({ indices: vertices.map((_, i) => base + i), boundary, frame });
  };
  const capturePart = (source: ConstructionSurfacePart) => {
    if (!options.includeStructure || !source.indices.length) return;
    const target = structuralPart(source.owner),
      base = target.positions.length / 3;
    // Whole-owner batches grow with building size; do not turn them into call arguments.
    for (const coordinate of source.positions) target.positions.push(coordinate);
    for (const index of source.indices) target.indices.push(index + base);
    // Imported decoration/Gothic meshes contain original triangles, not clipped fans.
    for (let i = 0; i < source.indices.length; i += 3) {
      const indices = source.indices.slice(i, i + 3),
        vertices = indices.map((k) => source.positions.slice(k * 3, k * 3 + 3)),
        frame = constructionSurfaceFrame(vertices[0], vertices[1], vertices[2]);
      target.regions!.push({
        indices: indices.map((k) => k + base),
        frame,
        boundary: surfaceBoundary(frame ? vertices.map((p) => projectConstructionSurface(frame, p)) : [])
      });
    }
  };
  const part = (
    owner: string,
    material: ConstructionPreviewPart["material"],
    bindingId?: string,
    color?: number[],
    geometryId?: string,
    dormer = false,
    placement?: "unit",
    lodAppearance?: ConstructionLodAppearance,
    stonePaving?: StonePavingPlacement,
    pickId?: string
  ) => {
    let p = parts.find(
      (p) =>
        p.owner === owner &&
        p.material === material &&
        p.bindingId === bindingId &&
        p.geometryId === geometryId &&
        !!p.dormer === dormer &&
        p.placement === placement &&
        p.lodAppearance === lodAppearance &&
        p.stonePaving === stonePaving &&
        p.pickId === pickId &&
        !p.decoration
    );
    if (!p) {
      p = {
        owner,
        material,
        placement,
        lodAppearance,
        stonePaving,
        ...(pickId ? { pickId } : {}),
        positions: [],
        uvs: [],
        indices: [],
        bindingId,
        geometryId,
        ...(dormer ? { dormer: true } : {}),
        color
      };
      parts.push(p);
    }
    return p;
  };
  const polygon = (p: ConstructionPreviewPart, v: number[][], uv: number[][], capture = true) => {
    appendPolygon(p, v);
    p.uvs.push(...uv);
    if (capture && options.includeStructure) appendStructure(p.owner, v);
  };
  const colorForOwner = (owner: string, m: ConstructionPreviewPart["material"]) => {
    const b = document.construction.buildings.find((b) => b.id === owner)!;
    return m === "wooden_plank"
      ? woodPalette[b.wood_color ?? 0]
      : m === "roof_tile"
        ? roofPalette[b.roof.color]
        : constructionBrickColor(b.wall_color ?? 0);
  };
  const surface = (
    owner: string,
    g: any,
    material: ConstructionPreviewPart["material"],
    bindingId: string | undefined,
    color: number[],
    cutters: number[][][] = [],
    usage: "both" | "render" | "structure" = "both",
    fittingRecesses: number[][][] = [],
    appearance: {
      placement?: "unit";
      /** Optional backing domain in this surface's own chart. */
      supports?: readonly SurfaceBoundary[];
      /** Capture effective visible regions without creating another render mesh. */
      capture?: (boundary: SurfaceBoundary, triangle: number[]) => void;
      stonePaving?: StonePavingPlacement;
      lodAppearance?: ConstructionLodAppearance;
      forMaterial?: (material: ConstructionPreviewPart["material"]) => ConstructionLodAppearance;
    } = {}
  ) => {
    const edits = document.overrides.filter((o) => o.binding_id === bindingId);
    // Hidden masks commute with material painting. Compute visible coverage once
    // for both structure and rendering; only paint partitions depend on edit order.
    const hiddenMasks = edits
      .filter((e) => e.effect.hidden)
      .map((e) => {
        const polygon = surfaceBoundary(e.region.polygon).points;
        const first = polygon.reduce(
          (best, p, i) =>
            p[0] < polygon[best][0] || (p[0] === polygon[best][0] && p[1] < polygon[best][1]) ? i : best,
          0
        );
        return [...polygon.slice(first), ...polygon.slice(0, first)];
      })
      .sort((a, b) => {
        const x = JSON.stringify(a),
          y = JSON.stringify(b);
        return x < y ? -1 : x > y ? 1 : 0;
      })
      .flatMap(surfaceMaskTriangles);
    const cuts = [...cutters.map(surfaceBoundary).filter((p) => p.points.length), ...hiddenMasks];
    const recesses = fittingRecesses.map(surfaceBoundary).filter((p) => p.points.length);
    const paints = (usage === "structure" || appearance.capture ? [] : edits)
      .filter((e) => !e.effect.hidden && e.effect.unit_id)
      .map((e) => ({
        material: e.effect.unit_id!,
        triangles: surfaceMaskTriangles(e.region.polygon)
      }));
    for (const tri of g.triangles as number[][]) {
      const uv = tri.map((i) => g.uv[i] as number[]),
        world = tri.map((i) => g.vertices[i] as number[]);
      if (options.clippingStats) options.clippingStats.facets++;
      const sourceBoundary = surfaceBoundary(uv);
      let support = appearance.supports ? clipPlasterSupport(sourceBoundary, appearance.supports) : [sourceBoundary];
      for (const cutter of cuts) {
        support = support.flatMap((p) => subtractSurfacePolygon(p, cutter));
        trackSurfaceClipping(options.clippingStats, support);
        if (!support.length) break;
      }
      support = effectiveSurfaceRegions(support);
      if (!support.length) continue;
      // Installation recesses hide wall fragments behind an attached component.
      // They are material-specific rendering details, not through-openings.
      let visible = usage === "structure" ? [] : support;
      for (const recess of recesses) {
        visible = visible.flatMap((p) => subtractSurfacePolygon(p, recess));
        trackSurfaceClipping(options.clippingStats, visible);
      }
      const effective = recesses.length ? effectiveSurfaceRegions(visible) : visible;
      const skinDomain = skinDomains.get(owner);
      const isSkin =
        skinDomain && usage !== "structure" && (g.id === owner + "-wall" || g.id === owner + "-parapet-skin");
      // Keep exactly the same effective geometry for finish support and erosion.
      // Painting may split the backing draw, but cannot tessellate/reseed skin.
      let pieces = effective.map((uv) => ({ uv, material }));
      for (const paint of paints)
        for (const cutter of paint.triangles) {
          pieces = pieces.flatMap((p) => {
            const inside = intersectSurfacePolygon(p.uv, cutter);
            if (!inside.points.length) return [p];
            return [
              ...subtractSurfacePolygon(p.uv, cutter).map((uv) => ({ ...p, uv })),
              { uv: inside, material: paint.material }
            ];
          });
          if (options.clippingStats)
            trackSurfaceClipping(
              options.clippingStats,
              pieces.map((p) => p.uv)
            );
        }
      const [a, b, c] = uv,
        det = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
      if (Math.abs(det) < 1e-12) continue;
      const lift = (p: number[]) => {
        const u = ((p[0] - a[0]) * (c[1] - a[1]) - (p[1] - a[1]) * (c[0] - a[0])) / det,
          v = ((b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0])) / det;
        return world[0].map((x, i) => x + u * (world[1][i] - x) + v * (world[2][i] - x));
      };
      if (isSkin) {
        const permitted = skinDomain.permission
          ? effectiveSurfaceRegions(effective.map((region) => intersectSurfacePolygon(region, skinDomain.permission!)))
          : effective;
        skinDomain.regions.push(...permitted);
        if (permitted.length) {
          let skin = skinSources.find((p) => p.owner === owner && p.geometryId === g.id);
          if (!skin) {
            skin = { owner, geometryId: g.id, bindingId, material, positions: [], indices: [], uvs: [] };
            skinSources.push(skin);
          }
          for (const boundary of permitted) {
            const points = det < 0 ? boundary.points.slice().reverse() : boundary.points;
            polygon(skin, points.map(lift), points, false);
          }
        }
      }
      if (options.includeStructure && usage !== "render") {
        // The support chart owns this plane. All native-hole and author-mask
        // fragments inherit it, including very thin pieces on round walls/roofs.
        const frame = constructionSurfaceFrame(world[0], world[1], world[2], uv);
        for (const boundary of support)
          if (boundary.points.length) appendStructure(owner, boundary.points.map(lift), frame, boundary);
      }
      for (const p of pieces)
        if (p.uv.points.length) {
          if (appearance.capture) {
            appearance.capture(p.uv, tri);
            continue;
          }
          // Clipping uses CCW UV polygons, but a reflected chart must retain
          // its source face's world winding. Reverse paired vertices and UVs
          // only for rendering; structural boundaries stay canonical in UV.
          const points = det < 0 ? p.uv.points.slice().reverse() : p.uv.points;
          polygon(
            part(
              owner,
              p.material,
              bindingId,
              p.material === material ? color : colorForOwner(owner, p.material),
              g.id,
              false,
              appearance.placement,
              appearance.forMaterial?.(p.material) ??
                (p.material === "brick" && appearance.stonePaving ? undefined : appearance.lodAppearance),
              p.material === "brick" ? appearance.stonePaving : undefined
            ),
            points.map(lift),
            points,
            false
          );
        }
    }
  };
  for (const b of document.construction.buildings) {
    const binding = document.bindings.find((v) => v.geometry_id === b.id + (b.kind ? "-surface" : "-roof"))!;
    const colorFor = (m: ConstructionPreviewPart["material"]) =>
      m === "wooden_plank"
        ? woodPalette[(b.wood_color ?? 0) % woodPalette.length]
        : m === "roof_tile"
          ? roofPalette[b.roof.color % roofPalette.length]
          : constructionBrickColor(b.wall_color ?? 0);
    if (b.kind) {
      const edits = document.overrides.filter((o) => o.binding_id === binding.id);
      for (const cell of enclosureCells(b, terrain, binding)) {
        let material = binding.unit_id,
          hidden = false;
        for (const e of edits)
          if (contains(e.region.polygon, cell.anchor_uv)) {
            material = e.effect.unit_id ?? material;
            hidden ||= e.effect.hidden === true;
          }
        if (hidden) continue;
        const axes = [cell.tangent, cell.bitangent, cell.normal],
          point = (x: number, y: number, z: number) =>
            cell.center.map(
              (v: number, i: number) => v + [x, y, z].reduce((n, k, j) => n + (k * cell.size[j] * axes[j][i]) / 2, 0)
            );
        const v = [
          point(-1, -1, -1),
          point(1, -1, -1),
          point(1, 1, -1),
          point(-1, 1, -1),
          point(-1, -1, 1),
          point(1, -1, 1),
          point(1, 1, 1),
          point(-1, 1, 1)
        ];
        for (const face of [
          [0, 3, 2, 1],
          [4, 5, 6, 7],
          [0, 4, 7, 3],
          [1, 2, 6, 5],
          [3, 7, 6, 2],
          [0, 1, 5, 4]
        ])
          polygon(
            part(b.id, material, binding.id, colorFor(material), binding.geometry_id, false, "unit"),
            face.map((i) => v[i]),
            [
              [0, 0],
              [cell.size[0], 0],
              [cell.size[0], cell.size[1]],
              [0, cell.size[1]]
            ]
          );
      }
      continue;
    }
    const owner = owners.find((o) => o.building.id === b.id)!;
    const shape = owner.shape,
      wall = document.bindings.find((v) => v.geometry_id === b.id + "-wall");
    let profile = owner.profile;
    const reserved = contacts.contactHoles.get(owner.nativeId) ?? [];
    const decorations =
      compiled?.decorations.find((d) => d.owner === b.id) ??
      compileConstructionDecorations(owner.building, shape, profile, b.decorations ?? [], reserved, {
        wallSlot: owner.slot,
        assets: options.assets,
        seed: Number(owner.seed),
        wallEnvelope: owner.wallEnvelope,
        roofBinding: document.bindings.find((binding) => binding.geometry_id === b.id + "-roof")
      });
    if (options.requireAllDecorations) assertConstructionDecorationInstallations(b, decorations);
    if (!compiled) for (const opening of decorations.roofOpenings) roofAttachments.push(opening.raw48);
    if (decorations.wallProfile) {
      profile = { ...profile, ...decorations.wallProfile };
      // Published owners are borrowed in the compiled path. Standalone preview
      // owns its freshly published owners and must return the same cut profile.
      if (!compiled) owner.profile = profile;
    }
    for (const group of constructionArchGroups({ ...owner, profile }, decorations, document.bindings))
      archGroups.push(group);
    // Unbound walls still have their native arch trim. Retain its original
    // records, just as the detailed package does, without inventing a surface binding.
    if (!wall)
      for (const [pickId, units] of constructionArchInstanceGroups(decorations)) {
        retainedWallUnits.push({
          ownerId: b.id,
          pickId,
          slot: owner.slot,
          material: "brick",
          cells: nativeWallCells(b.id + "-wall", units, profile),
          brickRecords: units.map((unit) => unit.packed64)
        });
      }
    for (const frame of decorations.woodArchFrames ?? []) woodArchFrames.push(frame);
    for (const pillar of decorations.woodArchPillars ?? []) woodArchPillars.push(pillar);
    for (const stone of decorations.stones) stones.push(stone);
    for (const frame of decorations.frames) frames.push(frame);
    if (options.includeStructure) {
      for (const frame of decorations.frames)
        capturePart(decorationFrameGeometry(options.assets?.stoneGeometry, frame));
      for (const frame of decorations.woodArchFrames ?? []) capturePart(woodArchFrameGeometry(frame));
      for (const pillar of decorations.woodArchPillars ?? [])
        capturePart(woodArchPillarGeometry(pillar, compiled ? compiled.woodPillar : options.assets?.woodPillar));
    }
    const supportHoles = [...reserved, ...decorations.holes.filter((h) => !h.decorationRecess)];
    const fittingHoles = decorations.holes.filter((h) => h.decorationRecess);
    const holePolygons = (holes: readonly WallConnectionWipHole[]) =>
      holes.flatMap((h) =>
        [-profile.projected.length, 0, profile.projected.length].map((shift) => [
          [h.centerU + shift - h.width / 2, h.centerY - h.height / 2 - profile.minGround],
          [h.centerU + shift + h.width / 2, h.centerY - h.height / 2 - profile.minGround],
          [h.centerU + shift + h.width / 2, h.centerY + h.height / 2 - profile.minGround],
          [h.centerU + shift - h.width / 2, h.centerY + h.height / 2 - profile.minGround]
        ])
      );
    const wallGeometry = wallSurfaceGeometry(b.id + "-wall", profile, owner.wallRoofJoint);
    if (b.plaster?.enabled) {
      const top =
        plasterFinishTop(profile.topY, isFlatRoofHeight(b.roof.height), b.roof.flat_rim !== 0) - profile.minGround;
      const bottom = wallGeometry.uv.reduce((min, uv) => Math.min(min, uv[1]), Infinity);
      skinDomains.set(b.id, {
        wallLength: wallGeometry.width,
        permission: Number.isFinite(top)
          ? surfaceBoundary(
              top > bottom
                ? [
                    [0, bottom],
                    [wallGeometry.width, bottom],
                    [wallGeometry.width, top],
                    [0, top]
                  ]
                : []
            )
          : undefined,
        regions: []
      });
    }
    wallGeometry.vertices = wallGeometry.vertices.map((p) =>
      constructionWallOutlinePoint(shape, p, owner.wallEnvelope.nominalOuter)
    );
    surface(
      b.id,
      wallGeometry,
      wall?.unit_id ?? "wall",
      wall?.id,
      colorFor(wall?.unit_id ?? "wall"),
      holePolygons(supportHoles),
      "both",
      holePolygons(fittingHoles),
      {
        supports: owner.wallRoofJoint
          ? wallRoofJointSupport(owner.wallRoofJoint, profile, shape, owner.wallEnvelope)
          : undefined,
        ...(options.includeAppearance && wall
          ? (() => {
              const images = new Map<string, ConstructionLodAppearance>();
              const retainedMaterials = new Set<string>();
              let nativeRecords: Map<string, Uint8Array> | undefined;
              let defaultCells: ReturnType<typeof nativeWallCells> | undefined;
              const wallCells = () => {
                if (defaultCells) return defaultCells;
                if (resolvedArrangement(wall) === "staggered_rows") {
                  const native = compileWallMasonryInFrame(
                    b.id,
                    owner.wallSeed,
                    owner.slot,
                    shape,
                    profile,
                    b.height,
                    [...reserved, ...decorations.holes],
                    document.construction.environment.type === "host_terrain",
                    owner.unitScale
                  );
                  nativeRecords = new Map(native.instances.map((i) => [i.id, i.packed64]));
                  return (defaultCells = nativeWallCells(wall.geometry_id, native.instances, profile));
                }
                return (defaultCells = arrangedWallCells(
                  wall,
                  profile,
                  [...reserved, ...decorations.holes],
                  owner.wallEnvelope.nominalOuter,
                  owner.wallRoofJoint
                ));
              };
              let wood: ReturnType<typeof constructionHorizontalWoodWall> | undefined;
              let cutWood: ReturnType<typeof constructionWindowCutWall> | undefined;
              return {
                forMaterial: (material: ConstructionPreviewPart["material"]) => {
                  const nativeWood =
                    material === "wooden_plank" &&
                    resolvedArrangement(wall) === "horizontal_rows" &&
                    shape.type === "rectangle";
                  if (nativeWood && !wood)
                    wood = constructionHorizontalWoodWall(
                      options.assets?.windowCuts,
                      { ...owner, profile },
                      wall,
                      [...reserved, ...decorations.holes],
                      decorations.windowCuts,
                      decorations.archOpenings
                    );
                  const cut = material === "wooden_plank" && !nativeWood && decorations.windowCuts.length > 0;
                  if (cut && !cutWood)
                    cutWood = constructionWindowCutWall(
                      { ...owner, profile },
                      wall,
                      [...reserved, ...decorations.holes],
                      decorations.windowCuts,
                      document.construction.environment.type === "host_terrain"
                    );
                  const cells = nativeWood ? wood!.cells : cut ? cutWood! : wallCells();
                  const key = nativeWood ? "wood" : cut ? "wood-cut" : "default";
                  let image = images.get(key);
                  if (!image) {
                    image = constructionLodAppearance(wallGeometry.uv, cells, profile.projected.length);
                    images.set(key, image);
                  }
                  if (material !== "wall" && !retainedMaterials.has(material)) {
                    retainedMaterials.add(material);
                    const retained = retainWallUnits(owner, wall, document.overrides, cells, material, nativeRecords);
                    if (retained) {
                      if (nativeWood) retainedWallUnits.push(...retainWallDraws(retained, wood!.groups));
                      else {
                        if (cut)
                          retained.windowCuts = wallWindowCutBuffer(
                            options.assets?.windowCuts,
                            retained.cells,
                            decorations.windowCuts,
                            profile.control.length
                          );
                        retainedWallUnits.push(retained);
                      }
                    }
                  }
                  return image;
                }
              };
            })()
          : {})
      }
    );
    if (wall && b.floors?.enabled) {
      const bands = buildConstructionFloors({
        id: wall.geometry_id,
        binding: wall,
        shape,
        profile,
        baseY: profile.minGround,
        wallHeight: b.height,
        settings: b.floors,
        holes: [...reserved, ...decorations.holes]
      });
      surface(
        b.id,
        { ...bands.geometry, id: wall.geometry_id + "-bands" },
        wall.unit_id,
        wall.id,
        colorFor(wall.unit_id),
        [],
        fittingHoles.length ? "render" : "both",
        [],
        options.includeAppearance && bands.geometry.uv.length
          ? { lodAppearance: constructionLodAppearance(bands.geometry.uv, bands.cells, profile.projected.length) }
          : {}
      );
      if (options.includeStructure && fittingHoles.length) {
        const supportBands = buildConstructionFloors({
          id: wall.geometry_id,
          binding: wall,
          shape,
          profile,
          baseY: profile.minGround,
          wallHeight: b.height,
          settings: b.floors,
          holes: supportHoles
        });
        surface(
          b.id,
          { ...supportBands.geometry, id: wall.geometry_id + "-bands" },
          wall.unit_id,
          wall.id,
          colorFor(wall.unit_id),
          [],
          "structure"
        );
      }
    }
    if (b.foundation) {
      const fb = document.bindings.find((v) => v.geometry_id === b.id + "-foundation");
      const f = buildConstructionFoundation({
        id: b.id + "-foundation",
        shape,
        wallEnvelope: owner.wallEnvelope,
        height: b.foundation.height,
        mode: b.foundation.mode,
        seed: !fb || fb.seed === "source" ? b.seed : fb.seed,
        contact: profile.foundationContact,
        neighbors: owners
          .filter((n) => n !== owner && !n.building.kind)
          .map((n) => ({
            shape: n.shape,
            bottomY: n.profile.minGround,
            topY: n.profile.maxY
          })),
        terrain,
        material: fb?.unit_id ?? "brick",
        footprint: fb?.footprint,
        rule: fb
          ? (resolvedArrangement(fb) as
              | "grid"
              | "staggered_rows"
              | "horizontal_rows"
              | "parallel_rows"
              | "overlap_rows")
          : "staggered_rows"
      });
      surface(
        b.id,
        f.geometry,
        fb?.unit_id ?? "brick",
        fb?.id,
        colorFor(fb?.unit_id ?? "brick"),
        [],
        "both",
        [],
        options.includeAppearance && f.geometry.uv.length && f.cells.length
          ? { lodAppearance: constructionLodAppearance(f.geometry.uv, f.cells) }
          : {}
      );
    }
    if (isFlatRoofHeight(b.roof.height)) {
      const rule = resolvedArrangement(binding),
        flat = buildConstructionFlatRoof({
          id: binding.geometry_id,
          shape,
          wallEnvelope: owner.wallEnvelope,
          topY: profile.topY - 0.69,
          courseOriginY: profile.minGround,
          material: binding.unit_id,
          footprint: binding.footprint,
          rule: rule === "posts_and_rails" ? "parallel_rows" : rule,
          rim: b.roof.flat_rim === 0,
          boundaryRule: binding.rule.boundary,
          seed: binding.seed === "source" ? b.seed : binding.seed,
          holes: reserved,
          roofOpenings: decorations.roofOpenings
        });
      surface(
        b.id,
        flat.deckGeometry,
        binding.unit_id,
        binding.id,
        colorFor(binding.unit_id),
        flat.deckGeometry.holes.map((h) => h.polygon),
        "both",
        [],
        {
          ...(usesStonePaving(binding)
            ? {
                stonePaving: stonePavingPlacement(
                  binding,
                  shape.type === "circle" ? shape.radius * 2 : shape.width,
                  shape.type === "circle" ? shape.radius * 2 : shape.depth,
                  b.wall_color ?? 0
                )
              }
            : {}),
          ...(options.includeAppearance
            ? { lodAppearance: constructionLodAppearance(flat.deckGeometry.uv, flat.cells) }
            : {})
        }
      );
      surface(b.id, flat.rimGeometry, binding.unit_id, binding.id, colorFor(binding.unit_id), [], "structure");
      surface(b.id, flat.rimVisualGeometry, binding.unit_id, binding.id, colorFor(binding.unit_id), [], "render", [], {
        placement: "unit"
      });
      // Coverage and erosion both use retained exterior faces of the rim.
      // Clip roof edits in their source chart before recharting.
      if (b.roof.flat_rim === 0 && b.plaster?.enabled) {
        const backing: SurfaceBoundary[] = [];
        const finish = flat.finishSupport;
        const charts = new Map<number[], ReturnType<typeof surfaceTriangleMapper>>();
        surface(b.id, finish.geometry, binding.unit_id, binding.id, colorFor(binding.unit_id), [], "render", [], {
          capture: (boundary, triangle) => {
            let chart = charts.get(triangle);
            if (!chart) {
              chart = surfaceTriangleMapper(
                triangle.map((i) => finish.geometry.uv[i]),
                triangle.map((i) => [finish.wallUV[i][0], finish.wallUV[i][1] - profile.minGround])
              );
              charts.set(triangle, chart);
            }
            backing.push(chart(boundary));
          }
        });
        // Candidate coverage joins the actual body surface. Finish policy
        // clips the crown; retained exterior faces clip gaps and cut bricks.
        const lower = wallGeometry.vertices.reduce((max, p) => Math.max(max, p[1]), -Infinity),
          upper = profile.topY;
        const skin = {
          ...wallGeometry,
          id: b.id + "-parapet-skin",
          vertices: wallGeometry.vertices.map((p, i) => [p[0], i % 4 < 2 ? lower : upper, p[2]]),
          uv: wallGeometry.uv.map((p, i) => [p[0], (i % 4 < 2 ? lower : upper) - profile.minGround])
        };
        const start = parts.length;
        surface(
          b.id,
          skin,
          wall?.unit_id ?? "wall",
          wall?.id,
          colorFor(wall?.unit_id ?? "wall"),
          holePolygons(supportHoles),
          "render",
          holePolygons(fittingHoles),
          { supports: backing }
        );
        parts.splice(start);
      }
    } else {
      const prepared = options.preparedRoofs?.get(b.id);
      const roof = owner.roof,
        authorChart = prepared?.author ?? buildRoofContext({ id: b.id, ...roof, renderSlot: owner.slot }),
        context =
          prepared?.material ??
          buildRoofMaterialContext(
            {
              id: b.id,
              ...roof,
              renderSlot: owner.slot,
              holes: [...decorations.roofOpenings]
            },
            authorChart
          );
      if (!prepared) {
        context.geometry.id = binding.geometry_id;
        authorChart.geometry.id = binding.geometry_id;
      }
      surface(
        b.id,
        context.geometry,
        binding.unit_id,
        binding.id,
        colorFor(binding.unit_id),
        context.geometry.holes.map((h: { polygon: number[][] }) => h.polygon),
        "both",
        [],
        options.includeAppearance
          ? {
              lodAppearance: (() => {
                if (resolvedArrangement(binding) !== "overlap_rows") {
                  return constructionLodAppearance(
                    context.geometry.uv,
                    constructionLodSurfaceCells(context.geometry, arrangedSurfaceCells(binding, context.geometry))
                  );
                }
                const seed = binding.seed === "source" ? 0n : BigInt(binding.seed);
                const raw = generateConstructionRoofUnits(
                  roof.surface,
                  roof.footprint,
                  seed,
                  binding.footprint,
                  owner.slot
                );
                const plan = roofLogicalPlacements(authorChart.geometry, roof.surface.base_height, raw);
                return constructionLodAppearance(
                  context.geometry.uv,
                  constructionLodSurfaceCells(authorChart.geometry, plan.cells)
                );
              })()
            }
          : {}
      );
      const edits = document.overrides.filter((o) => o.binding_id === binding.id);
      // Visible-roof clipping and native author anchors use distinct geometry.
      // Each projector is scoped to this generation; no cross-edit cache.
      const spirePlacement = constructionRoofSpirePlacement(b, profile.topY);
      if (spirePlacement) {
        let hidden = false;
        if (context.geometry.holes.length || edits.some((o) => o.effect.hidden === true)) {
          const roofProjector = new SurfaceProjector(context.geometry);
          const [anchor] = roofProjector.anchor(spirePlacement.origin);
          hidden =
            context.geometry.holes.some((h: { polygon: number[][] }) => contains(h.polygon, anchor)) ||
            edits.some((o) => o.effect.hidden === true && contains(o.region.polygon, anchor));
        }
        if (!hidden) {
          const spire = compiled
            ? compiled.spires.find((part) => part.ownerId === b.id)
            : buildConstructionRoofSpire(b, profile.topY, options.assets?.roofSpire);
          if (!spire) throw Error("Missing compiled roof spire for " + b.id);
          const previewSpire: ConstructionPreviewPart = {
            owner: b.id,
            material: "wall",
            decoration: true,
            roofSpire: true,
            bindingId: binding.id,
            geometryId: binding.geometry_id,
            positions: spire.positions,
            normals: spire.normals,
            colors: spire.colors,
            emission: spire.emission,
            indices: spire.indices,
            uvs: spire.uvs!,
            color: [1, 1, 1]
          };
          capturePart(previewSpire);
          parts.push(previewSpire);
        }
      }
      const roofUnits = options.retainDecorationParts
        ? settledRoofGroups(decorations.roofUnits).map(({ decorationId, units }) => ({ pickId: decorationId, units }))
        : [{ pickId: undefined, units: decorations.roofUnits }];
      for (const group of roofUnits)
        for (const cell of settledRoofCells(group.units, authorChart.geometry)) {
          let material = binding.unit_id,
            hidden = false;
          for (const edit of edits)
            if (contains(edit.region.polygon, cell.anchor_uv)) {
              material = edit.effect.unit_id ?? material;
              hidden ||= edit.effect.hidden === true;
            }
          if (hidden) continue;
          // Two triangles per settled unit preserve the arch and the same editable
          // cells; bevels and thickness are handled only by the detailed LOD.
          const vertices = [
            [-1, -1],
            [1, -1],
            [1, 1],
            [-1, 1]
          ].map(([x, y]) =>
            cell.center.map(
              (c, k) => c + (x * cell.size[0] * cell.tangent[k]) / 2 + (y * cell.size[1] * cell.bitangent[k]) / 2
            )
          );
          const face = clipRoofUnitFace(
            vertices,
            [
              [0, 0],
              [cell.size[0], 0],
              [cell.size[0], cell.size[1]],
              [0, cell.size[1]]
            ],
            cell.clip_plane
          );
          if (face.vertices.length)
            polygon(
              part(
                b.id,
                material,
                binding.id,
                colorFor(material),
                binding.geometry_id,
                true,
                "unit",
                undefined,
                undefined,
                group.pickId
              ),
              face.vertices,
              face.uvs
            );
        }
    }
    if (options.retainDecorationParts) {
      decorationParts.push(...decorations.parts);
      for (const p of decorations.parts) {
        capturePart({ owner: p.ownerId, positions: p.positions, indices: p.indices });
        for (let i = 0; i < p.positions.length; i++) {
          const axis = i % 3,
            margin = axis === 1 ? 0 : 0.03;
          bounds.min[axis] = Math.min(bounds.min[axis], p.positions[i] - margin);
          bounds.max[axis] = Math.max(bounds.max[axis], p.positions[i] + margin);
        }
      }
    } else if (decorations.parts.length) {
      // One draw per owner, preserving the original per-vertex frame/glass colors,
      // transformed normals and emission just as the resident decoration batch.
      const batch: ConstructionPreviewPart = {
        owner: b.id,
        material: "wall",
        positions: [],
        indices: [],
        uvs: [],
        decoration: true,
        appearance: { materialUVs: [], kinds: [], colorIds: [], centers: [] },
        colors: [],
        neutralColors: [],
        tintRoles: [],
        normals: [],
        emission: [],
        color: [1, 1, 1],
        emissive: 0
      };
      for (const p of decorations.parts) {
        const offset = batch.positions.length / 3;
        batch.positions.push(...p.positions);
        batch.indices.push(...p.indices.map((i) => i + offset));
        batch.uvs.push(...(p.uvs ?? Array.from({ length: p.positions.length / 3 }, () => [0, 0])));
        batch.appearance!.materialUVs.push(
          ...(p.appearance?.materialUVs ?? Array.from({ length: p.positions.length / 3 }, () => [0, 0]))
        );
        batch.appearance!.kinds.push(...(p.appearance?.kinds ?? Array(p.positions.length / 3).fill(0)));
        batch.appearance!.colorIds.push(...(p.appearance?.colorIds ?? Array(p.positions.length / 3).fill(0)));
        batch.appearance!.centers.push(...(p.appearance?.centers ?? Array(p.positions.length).fill(0)));
        batch.colors!.push(...p.colors);
        batch.neutralColors!.push(...(p.tintRole ? whiteMasonryVertexColors(p.colors, p.tintMask) : p.colors));
        batch.tintRoles!.push(
          ...Array.from({ length: p.positions.length / 3 }, (_, i) =>
            p.tintRole && p.tintMask?.[i] !== false ? masonryTintRoles.indexOf(p.tintRole) : -1
          )
        );
        batch.normals!.push(...p.normals);
        batch.emission!.push(...p.emission);
      }
      capturePart(batch);
      parts.push(batch);
    }
  }
  const junctionParts = new Map<string, ConstructionPreviewPart>();
  for (const group of [...constructionJunctionGroups(owners, contacts, document.bindings), ...archGroups]) {
    const edits = document.overrides.filter((o) => o.binding_id === group.binding.id);
    for (const cell of group.cells) {
      let material = group.binding.unit_id,
        hidden = false;
      for (const edit of edits)
        if (contains(edit.region.polygon, cell.anchor_uv)) {
          material = edit.effect.unit_id ?? material;
          hidden ||= edit.effect.hidden === true;
        }
      if (hidden) continue;
      const axes = [cell.tangent, cell.bitangent, cell.normal];
      const vertices = [-1, 1].flatMap((z) =>
        [-1, 1].flatMap((y) =>
          [-1, 1].map((x) =>
            cell.center.map((p, k) => p + [x, y, z].reduce((sum, v, j) => sum + (v * cell.size[j] * axes[j][k]) / 2, 0))
          )
        )
      );
      const key = JSON.stringify([group.ownerId, group.binding.id, material, group.decorationId]);
      let previewPart = junctionParts.get(key);
      if (!previewPart) {
        previewPart = {
          owner: group.ownerId,
          ...(group.decorationId ? { pickId: group.decorationId } : {}),
          material,
          bindingId: group.binding.id,
          geometryId: group.binding.geometry_id,
          positions: [],
          uvs: [],
          indices: [],
          color: colorForOwner(group.ownerId, material),
          junction: true,
          placement: "unit"
        };
        junctionParts.set(key, previewPart);
        parts.push(previewPart);
      }
      for (const face of [
        [0, 2, 3, 1],
        [4, 5, 7, 6],
        [0, 4, 6, 2],
        [1, 3, 7, 5],
        [2, 6, 7, 3],
        [0, 1, 5, 4]
      ])
        polygon(
          previewPart,
          face.map((i) => vertices[i]),
          [
            [0, 0],
            [cell.size[0], 0],
            [cell.size[0], cell.size[1]],
            [0, cell.size[1]]
          ]
        );
    }
  }
  if (roofAttachments.length) encodeCompleteConstructionDormerBins(roofAttachments);
  // Curved beams use the producer's conservative sphere; pillar bounds include
  // their embedded endpoint, which can extend below the published wall shell.
  for (const { frame } of woodArchFrames)
    for (let axis = 0; axis < 3; axis++) {
      bounds.min[axis] = Math.min(bounds.min[axis], frame.centerRadius[axis] - frame.centerRadius[3]);
      bounds.max[axis] = Math.max(bounds.max[axis], frame.centerRadius[axis] + frame.centerRadius[3]);
    }
  for (const pillar of woodArchPillars) {
    const matrix = new Float32Array(pillar.bytes, 0, 12);
    for (let axis = 0; axis < 3; axis++) {
      const radius = Math.abs(matrix[axis]) + Math.abs(matrix[axis + 3]) + Math.abs(matrix[axis + 6]) + 0.03;
      bounds.min[axis] = Math.min(bounds.min[axis], matrix[9 + axis] - radius);
      bounds.max[axis] = Math.max(bounds.max[axis], matrix[9 + axis] + radius);
    }
  }
  for (const stone of stones) {
    const stoneBounds = decorationStoneBounds(options.assets?.stoneGeometry, stone);
    for (let axis = 0; axis < 3; axis++) {
      bounds.min[axis] = Math.min(bounds.min[axis], stoneBounds.min[axis]);
      bounds.max[axis] = Math.max(bounds.max[axis], stoneBounds.max[axis]);
    }
  }
  for (const frame of frames) {
    const frameBounds = decorationFrameBounds(options.assets?.stoneGeometry, frame);
    for (let axis = 0; axis < 3; axis++) {
      bounds.min[axis] = Math.min(bounds.min[axis], frameBounds.min[axis]);
      bounds.max[axis] = Math.max(bounds.max[axis], frameBounds.max[axis]);
    }
  }
  for (const overlay of constructionPlasterParts(document, skinSources, skinDomains)) parts.push(overlay);
  // The coarse facade and structural query share the pre-clipping envelope.
  // Resident backing alone is inset, leaving room for native bevel/noise.
  for (const p of parts) {
    if (p.plaster || p.decoration || p.junction || p.geometryId !== p.owner + "-wall") continue;
    const owner = owners.find((o) => o.building.id === p.owner);
    if (owner && !owner.building.kind) p.supportInset = 0.04 + 0.02 * owner.wallEnvelope.depthScale;
  }
  // Retained volumes participate in the same owned bounds as other coarse
  // geometry. Their original shader applies the shared +/- .03m XZ warp.
  for (const batch of retainedWallUnits)
    for (const cell of batch.cells) {
      for (let axis = 0; axis < 3; axis++) {
        const extent =
          (Math.abs(cell.size[0] * cell.tangent[axis]) +
            Math.abs(cell.size[1] * cell.bitangent[axis]) +
            Math.abs(cell.size[2] * cell.normal[axis])) /
          2;
        const warp = axis === 1 ? 0 : 0.03;
        bounds.min[axis] = Math.min(bounds.min[axis], cell.center[axis] - extent - warp);
        bounds.max[axis] = Math.max(bounds.max[axis], cell.center[axis] + extent + warp);
      }
    }
  for (const p of parts)
    for (let i = 0; i < p.positions.length; i++) {
      const a = i % 3;
      const warp = (p.plaster || p.appearance) && a !== 1 ? 0.03 : 0;
      bounds.min[a] = Math.min(bounds.min[a], p.positions[i] - warp);
      bounds.max[a] = Math.max(bounds.max[a], p.positions[i] + warp);
    }
  return {
    parts,
    decorationParts,
    retainedWallUnits,
    archGroups,
    bounds,
    stones,
    frames,
    woodArchFrames,
    woodArchPillars,
    owners,
    ...(options.includeStructure ? { structuralParts: [...structure.values()] } : {})
  };
}
