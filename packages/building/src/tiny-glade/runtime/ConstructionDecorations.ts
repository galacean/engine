import { generatedDecorationSeed, resolveDecorationConfig } from "./ConstructionDecorationConfig";
import {
  constructionWallEnvelope,
  constructionWallMount,
  type ConstructionWallEnvelope
} from "./ConstructionWallEnvelope";
import type { DecorationWindowCut } from "./DecorationWindowCutBuffer";
import { recoveredArrowWallPlacement } from "./RecoveredArrowWallPlacement";
import { createGothicRoofDecorationCompiler } from "./ConstructionGothicRoofDecorations";
import { compileConstructionStoneHalf } from "./ConstructionStoneHalfDecorations";
import { compileConstructionHalfCottage } from "./ConstructionHalfCottageDecorations";
import { createPitchedDecorationContext, type PitchedDecorationContext } from "./ConstructionPitchedDecorationContext";
import { createCottageRoofDecorationCompiler } from "./ConstructionCottageRoofDecorations";
import {
  compileFlatRoofDecoration,
  type DecorationRoofOpening,
  type RoofDecorationOccupancy
} from "./ConstructionRoofDecorations";
import {
  recoveredCottageWallPlacement,
  recoveredCottageWallCut,
  recoveredCottageDoorPlacement
} from "./RecoveredCottageWallPlacement";
import { cottageXzProjectiveRotation } from "./RecoveredCottageRoofSampler";
import { requireDecorationCollision } from "./ConstructionDecorationCollisions";
import type { ConstructionUnitAssets } from "./ConstructionCompiler";
import { roofBasis } from "./ConstructionRoof";
import { sub, mul } from "./RecoveredRoofMath";
import { recoveredGothicWallPlacement } from "./RecoveredGothicWallPlacement";
import { constructionDecorationAssembly } from "./ConstructionDecorationAssembly";
import type { ConstructionBuilding } from "./ConstructionSource";
import type { PublishedWallProfile } from "./PublishedWallProfile";
import type { WallConnectionShape, WallConnectionWipHole } from "./WallConnectionTypes";
import { shapeCurve } from "./RecoveredWallConnectionHoles";
import {
  constructionDecorationDefinition,
  type DecorationIntent,
  type DecorationHost,
  type ConstructionDecorationIssue,
  decorationConstraintFact
} from "./ConstructionDecorationCatalog";
import { decorationAssemblyGeometry } from "./ConstructionDecorationGeometry";
import {
  cottageDecorationWallHole,
  cottageDoorWallHole,
  arrowDecorationWallHoles,
  gothicDecorationWallHoles
} from "./RecoveredDecorationWallHoles";
import { isFlatRoofHeight } from "./RoofMode";
import { constructionDecorationFrame, type ConstructionDecorationFrame } from "./ConstructionDecorationFrames";
import type { DecorationStoneInstance } from "./DecorationStoneInstance";
import { compileConstructionCornerDecoration } from "./ConstructionCornerDecorations";
import { compileConstructionStoneArch } from "./ConstructionStoneArch";
import { compileConstructionWoodArch } from "./ConstructionWoodArch";
import type { ConstructionWoodArchPillar, ConstructionWoodArchPart } from "./ConstructionWoodArchRender";
import type { WoodArchOpening } from "./RecoveredWoodArchCutouts";
import type { WallInstance } from "./WallTypes";
import { ClosedWallSpanError } from "./RecoveredWallSpace";
import { CottageRoofSpanError } from "./RecoveredCottageDormerRoof";

/** Stable wall attachment, independent of render slots and material instances.
 * u is normalized wall arclength; bottom is metres above the published wall base.
 * Original assets/blueprint separation follows retained decorator loaders and
 * transform cache. This placement policy is the host adapter, not native replay.
 */
export interface ConstructionDecorationSpec {
  id: string;
  kind: DecorationIntent;
  /** Omitted type requests the host default. Explicit choices never fall back. */
  type?: string;
  host?: DecorationHost;
  /** Required on walls. Roof attachments instead use uv. */
  u?: number;
  uv?: [number, number];
  rank?: 1 | 2 | 3;
  /** Wall geometry variation, independent of Scene identity. Generated specs may
   * omit it until their initial owner/local-ID variation is accepted. */
  seed?: number;
  woodColor?: number;
  /** Omitted/wood preserves timber. wall uses the host-owned native frame material. */
  frameMaterial?: "wood" | "wall";
  bottom: number;
  width: number;
  height: number;
  enabled?: boolean;
  lightIntensity?: number;
  /** Original lantern palette, 0..4. Independent of timber color. */
  lightColor?: number;
}
/** Transient producer input; authoring keeps omitted defaults omitted. */
export type ResolvedConstructionDecorationSpec = ConstructionDecorationSpec &
  Required<Pick<ConstructionDecorationSpec, "type" | "host" | "rank">>;

/** Appearance coordinates are original model UVs, never wall editing coordinates.
 * kinds use ConstructionDecorationMaterial; colors belong to that material.
 * centers are unwarped scene-space window origins for native interior parallax. */
export interface ConstructionDecorationAppearance {
  materialUVs: number[][];
  kinds: number[];
  colorIds: number[];
  centers: number[];
}
export interface ConstructionDecorationPart {
  /** Native source unit whose material owns this part. */
  assetUnit?: string;
  /** Editable attachment identity, independent of its material parts and draw owner. */
  decorationId?: string;
  tintRole?: import("./MasonryAppearance").MasonryTintRole;
  /** Original glass mesh contains opaque lattice vertices as well as panes. */
  tintMask?: boolean[];
  id: string;
  ownerId: string;
  kind: string;
  positions: number[];
  normals: number[];
  colors: number[];
  emission: number[];
  indices: number[];
  uvs?: number[][];
  appearance?: ConstructionDecorationAppearance;
  /** Native scene emitter, distinct from the scaled shader filament. */
  lightPosition?: [number, number, number];
}
export interface CompiledConstructionDecorations {
  /** Ground-open structural openings publish one lower boundary for all consumers. */
  wallProfile?: PublishedWallProfile;
  archInstances?: (WallInstance & { decorationId: string })[];
  archOpenings?: WoodArchOpening[];
  woodArchFrames?: ConstructionWoodArchPart[];
  woodArchPillars?: ConstructionWoodArchPillar[];
  roofUnits: import("./ConstructionSettledRoof").SettledRoofUnit[];
  holes: WallConnectionWipHole[];
  /** Stable attachment identity plus its producer-owned SDF pose. These are
   * geometry intents; the selected material determines whether to consume them. */
  windowCuts: { id: string; cut: DecorationWindowCut }[];
  roofOpenings: DecorationRoofOpening[];
  parts: ConstructionDecorationPart[];
  stones: ConstructionDecorationStone[];
  frames: ConstructionDecorationFrame[];
  diagnostics: ConstructionDecorationIssue[];
  resolved: { id: string; type: string; host: DecorationHost; rank: number; frameMaterial?: "wood" | "wall" }[];
}
/** Acceptance belongs to the producer, before tessellation, visibility or GPU allocation.
 * Structural arches are valid even when a surface edit hides their trim. */
export function assertConstructionDecorationInstallations(
  building: ConstructionBuilding,
  result: CompiledConstructionDecorations
): void {
  if (building.decorations_enabled === false) return;
  const accepted = new Set(
    [
      ...result.parts,
      ...result.stones,
      ...result.frames,
      ...(result.archInstances ?? []),
      ...(result.woodArchFrames ?? []),
      ...(result.woodArchPillars ?? [])
    ].map((part) => part.decorationId)
  );
  for (const spec of building.decorations ?? []) {
    if (spec.enabled === false) continue;
    const issue = result.diagnostics.find((issue) => issue.id === spec.id);
    if (!issue && accepted.has(spec.id)) continue;
    throw Error(
      `Decoration '${spec.id}' could not be placed on its host surface: ${issue?.reason ?? "no accepted geometry"}`
    );
  }
}

export interface ConstructionDecorationStone {
  id: string;
  decorationId: string;
  ownerId: string;
  template: string;
  instance: DecorationStoneInstance;
  geometryScale?: readonly [number, number, number];
}
export function parseConstructionDecorations(input: unknown): ConstructionDecorationSpec[] {
  if (!Array.isArray(input)) throw Error("decorations must be an array");
  const ids = new Set<string>();
  return input.map((raw) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw Error("Invalid decoration");
    const d = raw as Record<string, unknown>;
    for (const key of Object.keys(d))
      if (
        ![
          "id",
          "kind",
          "type",
          "host",
          "uv",
          "rank",
          "seed",
          "woodColor",
          "frameMaterial",
          "u",
          "bottom",
          "width",
          "height",
          "enabled",
          "lightIntensity",
          "lightColor"
        ].includes(key)
      )
        throw Error("Unknown decoration field " + key);
    if (typeof d.id !== "string" || !d.id || ids.has(d.id)) throw Error("Duplicate/empty decoration id");
    ids.add(d.id);
    if (!["door", "window", "wall-lamp", "lantern", "opening", "hatch"].includes(d.kind as string))
      throw Error("Unknown decoration kind");
    if (d.type !== undefined && (typeof d.type !== "string" || !constructionDecorationDefinition(d.type)))
      throw Error("Unknown decoration type " + String(d.type));
    if (d.host !== undefined && d.host !== "wall" && d.host !== "roof") throw Error("Unknown decoration host");
    if (d.rank !== undefined && ![1, 2, 3].includes(d.rank as number)) throw Error("Decoration rank must be 1, 2 or 3");
    if (
      d.seed !== undefined &&
      (!Number.isInteger(d.seed) || (d.seed as number) < 0 || (d.seed as number) > 0xffffffff)
    )
      throw Error("Decoration seed must be a uint32");
    if (d.seed !== undefined && d.host === "roof")
      throw Error("Decoration seed requires a wall host; native roof attachments own their seed");
    if (
      d.woodColor !== undefined &&
      (!Number.isInteger(d.woodColor) || (d.woodColor as number) < 0 || (d.woodColor as number) > 10)
    )
      throw Error("Decoration woodColor must be an integer in [0,10]");
    if (d.frameMaterial !== undefined && d.frameMaterial !== "wood" && d.frameMaterial !== "wall")
      throw Error("Decoration frameMaterial must be wood or wall");
    for (const k of ["bottom", "width", "height"])
      if (typeof d[k] !== "number" || !Number.isFinite(d[k])) throw Error("Finite decoration " + k + " required");
    if (d.u !== undefined && (typeof d.u !== "number" || !Number.isFinite(d.u) || d.u < 0 || d.u >= 1))
      throw Error("Decoration u must be in [0,1)");
    if (
      d.uv !== undefined &&
      (!Array.isArray(d.uv) ||
        d.uv.length !== 2 ||
        !d.uv.every((v) => typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1))
    )
      throw Error("Decoration roof uv must contain two finite values in [0,1]");
    if ((d.host ?? "wall") === "wall" && d.u === undefined) throw Error("Wall decoration requires u");
    if (d.host === "roof" && d.uv === undefined) throw Error("Roof decoration requires uv");
    if ((d.width as number) <= 0 || (d.height as number) <= 0 || (d.bottom as number) < 0)
      throw Error("Positive decoration size and nonnegative bottom required");
    if (d.enabled !== undefined && typeof d.enabled !== "boolean") throw Error("Invalid decoration enabled");
    if (
      d.lightIntensity !== undefined &&
      (typeof d.lightIntensity !== "number" || !Number.isFinite(d.lightIntensity) || d.lightIntensity < 0)
    )
      throw Error("Nonnegative finite light intensity required");
    if (
      d.lightColor !== undefined &&
      (!Number.isInteger(d.lightColor) || (d.lightColor as number) < 0 || (d.lightColor as number) > 4)
    )
      throw Error("Lantern lightColor must be an integer in [0,4]");
    return structuredClone(d) as unknown as ConstructionDecorationSpec;
  });
}

/** Resolve omitted variant/type defaults into the accepted decoration config.
 * Purpose is part of the component contract, so a roof "window" without a type
 * on a flat roof is stored as a hatch rather than remaining an ambiguous wish. */
export function normalizeConstructionDecorations(input: unknown, flatRoof: boolean): ConstructionDecorationSpec[] {
  return parseConstructionDecorations(input).map((spec) => {
    const resolved = resolveDecorationConfig(spec, flatRoof);
    const typeId = resolved.type;
    const type = typeId === undefined ? undefined : constructionDecorationDefinition(typeId);
    if (!type) return spec;
    return {
      ...spec,
      type: typeId,
      kind: resolved.kind
    };
  });
}

/** Defaults are derived only once into authored specs. IDs are face/slot based,
 * so material, height and LOD changes do not re-seed unrelated decorations. */
export function defaultConstructionDecorations(
  building: ConstructionBuilding,
  profile?: PublishedWallProfile
): ConstructionDecorationSpec[] {
  if (building.kind) return [];
  const circle = building.circle;
  const widths = circle
    ? [
        (Math.PI * circle.radius) / 2,
        (Math.PI * circle.radius) / 2,
        (Math.PI * circle.radius) / 2,
        (Math.PI * circle.radius) / 2
      ]
    : [
        building.rectangle!.size[1],
        building.rectangle!.size[0],
        building.rectangle!.size[1],
        building.rectangle!.size[0]
      ];
  const perimeter = widths.reduce((a, b) => a + b, 0);
  const specs: ConstructionDecorationSpec[] = [];

  let start = 0;
  for (let face = 0; face < 4; face++) {
    const length = widths[face];
    const u = (start + length * 0.5) / perimeter;
    const coordinate = profile?.projected.coord(u);
    const usable =
      coordinate && profile
        ? (profile.top[coordinate[0]] - profile.bottom[coordinate[0]]) * (1 - coordinate[1]) +
          (profile.top[coordinate[0] + 1] - profile.bottom[coordinate[0] + 1]) * coordinate[1]
        : building.height - 0.46;
    if (face === 1 && length > 1.35 && usable > 1.65) {
      const width = Math.min(1.25, length * 0.45),
        height = Math.min(2.25, usable * 0.82);
      specs.push({ id: "entrance", kind: "door", u, bottom: 0, width, height });
      if (length > 2.6)
        specs.push({
          id: "entrance-lamp",
          kind: "wall-lamp",
          u: (start + length * 0.5 + width * 0.5 + 0.38) / perimeter,
          bottom: Math.min(1.65, usable - 0.8),
          width: 0.44,
          height: 0.9,
          lightIntensity: 1.4
        });
    } else if (length > 1.1 && usable > 1.5) {
      const count = Math.max(1, Math.floor((length - 0.5) / 3));
      for (let slot = 0; slot < count; slot++) {
        const height = Math.min(1.35, usable * 0.47),
          bottom = Math.min(0.85, usable - height - 0.15);
        specs.push({
          id: `window-${face}-${slot}`,
          kind: "window",
          u: (start + (length * (slot + 0.5)) / count) / perimeter,
          bottom,
          width: Math.min(0.9, (length * 0.5) / count),
          height,
          lightIntensity: 0.12
        });
      }
    }
    start += length;
  }
  return specs;
}
const cyclicDistance = (a: number, b: number, length: number) =>
  Math.abs(((a - b + length * 1.5) % length) - length * 0.5);

export function compileConstructionDecorations(
  building: ConstructionBuilding,
  shape: WallConnectionShape,
  profile: PublishedWallProfile,
  specs: readonly ConstructionDecorationSpec[] = building.decorations ?? [],
  excludedHoles: readonly WallConnectionWipHole[] = [],
  owner: {
    wallSlot: number;
    seed: number;
    wallEnvelope?: ConstructionWallEnvelope;
    roofBinding?: import("./MasonryDocument").MasonryBinding;
    assets?: ConstructionUnitAssets;
  } = {
    wallSlot: 0,
    seed: building.seed ?? 0
  }
): CompiledConstructionDecorations {
  const result: CompiledConstructionDecorations = {
    holes: [],
    windowCuts: [],
    roofOpenings: [],
    roofUnits: [],
    parts: [],
    stones: [],
    frames: [],
    diagnostics: [],
    resolved: []
  };
  if (building.decorations_enabled === false) return result;
  const envelope = owner.wallEnvelope ?? constructionWallEnvelope(building);
  const roofOccupied: RoofDecorationOccupancy[] = [];
  const attachmentPlacement = <T>(id: string, generate: () => T): T | undefined => {
    try {
      return generate();
    } catch (error) {
      if (!(error instanceof ClosedWallSpanError) && !(error instanceof CottageRoofSpanError)) throw error;
      result.diagnostics.push({
        id,
        code: "INSUFFICIENT_SPACE",
        reason: error.message,
        constraints: [
          decorationConstraintFact({
            metric: error instanceof ClosedWallSpanError ? "wall_attachment_span" : "roof_attachment_span",
            measured: error.span,
            limit: error.length,
            relation: "<",
            unit: "m"
          })
        ]
      });
      return undefined;
    }
  };
  let gothicRoof: ReturnType<typeof createGothicRoofDecorationCompiler> | undefined;
  let cottageRoof: ReturnType<typeof createCottageRoofDecorationCompiler> | undefined;
  let pitchedContext: PitchedDecorationContext | undefined;
  const pitched = () =>
    (pitchedContext ??= createPitchedDecorationContext(building, profile.topY, envelope, owner.assets));
  const curve = shapeCurve(shape, 0.5);
  const occupied: { id: string; u: number; bottom: number; width: number; height: number }[] = [];
  const heightAt = (u: number, values: readonly number[]) => {
    const [index, t] = profile.projected.coord(u);
    return values[index] * (1 - t) + values[index + 1] * t;
  };
  const minimumWallTop = (center: number, width: number) => {
    const span = width / curve.length;
    if (span >= 1) return profile.top.reduce((min, y) => Math.min(min, y), Infinity);
    const start = center - span * 0.5,
      end = center + span * 0.5;
    const wrap = (u: number) => u - Math.floor(u);
    let top = Math.min(heightAt(wrap(start), profile.top), heightAt(wrap(end), profile.top));
    // The published contour is piecewise linear. Its extrema are at the span
    // endpoints or contour knots, including when an attachment crosses u=0.
    for (let turn = Math.floor(start); turn <= Math.floor(end); turn++) {
      for (let i = 0; i < profile.projected.knots.length; i++) {
        const u = profile.projected.knots[i] + turn;
        if (u > start && u < end) top = Math.min(top, profile.top[i]);
      }
    }
    return top;
  };
  for (const requested of specs) {
    if (requested.enabled === false) continue;
    const resolved = resolveDecorationConfig(requested, isFlatRoofHeight(building.roof.height));
    const { host, type: typeId, rank } = resolved;
    const type = typeId === undefined ? undefined : constructionDecorationDefinition(typeId);
    // Resolve once for every producer without persisting derived defaults into authoring.
    if (typeId === undefined || !type || !type.hosts.includes(host) || !type.ranks.includes(rank)) {
      result.diagnostics.push({
        id: requested.id,
        code: "UNSUPPORTED_ATTACHMENT",
        reason: `Decoration ${typeId ?? requested.kind} does not support ${host} rank ${rank}`
      });
      continue;
    }
    const d: ResolvedConstructionDecorationSpec = { ...resolved, type: typeId };
    const seed = d.seed ?? generatedDecorationSeed(owner.seed, d.id);
    if (d.frameMaterial !== undefined && !type.frameMaterials.includes(d.frameMaterial)) {
      result.diagnostics.push({
        id: d.id,
        code: "UNSUPPORTED_ATTACHMENT",
        reason: `${typeId} does not support frameMaterial ${d.frameMaterial}`
      });
      continue;
    }
    result.resolved.push({
      id: d.id,
      type: typeId,
      host,
      rank,
      ...(type.frameMaterials.length ? { frameMaterial: d.frameMaterial ?? "wood" } : {})
    });
    // Pending native families are explicit failures until their producer is wired;
    // never report success while substituting the current cottage/window mesh.
    const assembly = constructionDecorationAssembly(owner.assets?.decorations, typeId, rank);
    if (!type.implemented || (!assembly && typeId !== "opening-arch")) {
      result.diagnostics.push({
        id: d.id,
        code: "UNIMPLEMENTED_TYPE",
        reason: `Decoration producer is not connected: ${typeId} rank ${rank}`
      });
      continue;
    }
    if (typeId === "opening-arch" && d.bottom !== 0) {
      result.diagnostics.push({
        id: d.id,
        code: "UNSUPPORTED_ATTACHMENT",
        reason: "A ground-open arch requires bottom=0; a raised opening needs a different cut producer"
      });
      continue;
    }
    if (host === "roof") {
      if (typeId === "dormer-cottage" || typeId === "dormer-gothic") {
        if (isFlatRoofHeight(building.roof.height)) {
          result.diagnostics.push({
            id: d.id,
            code: "UNSUPPORTED_ATTACHMENT",
            reason: "A full dormer requires a pitched roof"
          });
        } else if (typeId === "dormer-gothic") {
          gothicRoof ??= createGothicRoofDecorationCompiler(building, owner.wallSlot, owner.roofBinding, pitched());
          gothicRoof(d, result);
        } else {
          cottageRoof ??= createCottageRoofDecorationCompiler(
            building,
            profile.topY,
            owner.wallSlot,
            owner.roofBinding,
            pitched()
          );
          attachmentPlacement(d.id, () => cottageRoof!(d, result));
        }
        continue;
      }
      if (!isFlatRoofHeight(building.roof.height)) {
        result.diagnostics.push({ id: d.id, code: "UNSUPPORTED_ATTACHMENT", reason: `${typeId} requires a flat roof` });
        continue;
      }
      compileFlatRoofDecoration(
        building,
        shape,
        profile.maxY,
        d,
        assembly!,
        typeId,
        roofOccupied,
        result,
        owner.wallSlot
      );
      continue;
    }
    if (typeId === "window-cottage-corner") {
      compileConstructionCornerDecoration(
        owner.assets?.decorationCollisions,
        owner.assets?.decorations,
        building,
        shape,
        profile,
        d,
        assembly!,
        excludedHoles,
        occupied,
        result,
        envelope.mountOffset
      );
      continue;
    }
    const kind = type.purpose === "light" ? "wall-lamp" : type.purpose;
    const wallU = d.u!;
    const woodenArch = typeId === "opening-arch" && building.material === 1;
    const archCrown = woodenArch ? 0.25 : 0.21;
    const installationWidth = typeId === "opening-arch" ? d.width + (woodenArch ? 0.43 : 0.72) : d.width;
    const u = wallU * curve.length,
      [x, z] = curve.sample(wallU),
      [tx, tz] = curve.tangent(wallU);
    const nx = -tz,
      nz = tx,
      bottom = heightAt(wallU, profile.bottom) + d.bottom;
    // Ordinary attachments must fit across their entire installation interval.
    // Arches and eave windows have dedicated shaped-clearance producers below.
    const top = typeId === "opening-arch" ? heightAt(wallU, profile.top) : minimumWallTop(wallU, installationWidth);
    const stoneHalf = typeId === "dormer-gothic-half" || typeId === "dormer-arrow-slit-half";
    if (!stoneHalf && typeId !== "dormer-cottage-half" && bottom + d.height > top + 0.02) {
      result.diagnostics.push({
        id: d.id,
        code: "INSUFFICIENT_SPACE",
        reason: "Decoration exceeds host wall height",
        constraints: [
          decorationConstraintFact({
            metric: "wall_top_world_y",
            measured: bottom + d.height,
            limit: top + 0.02,
            relation: "<=",
            unit: "m"
          })
        ]
      });
      continue;
    }
    let arch:
      | ReturnType<typeof compileConstructionStoneArch>
      | ReturnType<typeof compileConstructionWoodArch>
      | undefined;
    if (typeId === "opening-arch") {
      if (d.width >= profile.control.length) {
        result.diagnostics.push({
          id: d.id,
          code: "INSUFFICIENT_SPACE",
          reason: "Arch interval must be smaller than the closed wall perimeter"
        });
        continue;
      }
      try {
        const input = {
          id: `${building.id}/decoration/${d.id}`,
          centerU: wallU,
          width: d.width,
          apexY: bottom + d.height,
          scale: d.height,
          seed,
          slot: owner.wallSlot,
          depthScale: envelope.depthScale
        };
        arch = woodenArch
          ? compileConstructionWoodArch(result.wallProfile ?? profile, { ...input, topY: bottom + d.height })
          : compileConstructionStoneArch(result.wallProfile ?? profile, input);
      } catch (error) {
        if (!(error instanceof RangeError)) throw error;
        result.diagnostics.push({ id: d.id, code: "INSUFFICIENT_SPACE", reason: error.message });
        continue;
      }
      // Reject a wall-top clamp instead of silently accepting a different shape.
      const cut = arch.cut;
      if (
        arch.range.wallTop.some((y, i) =>
          woodenArch
            ? Math.fround(bottom + d.height) > Math.fround(y - archCrown)
            : y < cut.points[i][1] + cut.heights[i] + archCrown
        )
      ) {
        result.diagnostics.push({
          id: d.id,
          code: "INSUFFICIENT_SPACE",
          reason: "Host wall has no clearance for the arch frame or crown"
        });
        continue;
      }
    }
    let installationBottom = bottom;
    const installationTop = bottom + d.height + (arch ? archCrown : 0);
    if (arch) for (const point of arch.range.points) installationBottom = Math.min(installationBottom, point[1]);
    if (
      excludedHoles.some(
        (h) =>
          cyclicDistance(u, h.centerU, curve.length) < (installationWidth + h.width) * 0.5 &&
          installationTop > h.centerY - h.height * 0.5 &&
          installationBottom < h.centerY + h.height * 0.5
      )
    ) {
      result.diagnostics.push({
        id: d.id,
        code: "HOST_REMOVED",
        reason: "Host wall is removed by an intersecting building"
      });
      continue;
    }
    if (shape.type === "rectangle") {
      const corners = curve.knots.slice(0, -1).map((k) => k * curve.length);
      if (corners.some((k) => cyclicDistance(u, k, curve.length) < installationWidth * 0.5 + 0.04)) {
        result.diagnostics.push({ id: d.id, code: "CROSSES_CORNER", reason: "Decoration crosses wall corner" });
        continue;
      }
    }
    const overlaps = occupied.filter(
      (p) =>
        cyclicDistance(u, p.u, curve.length) < (installationWidth + p.width) * 0.5 &&
        installationTop > p.bottom &&
        installationBottom < p.bottom + p.height
    );
    if (overlaps.length) {
      result.diagnostics.push({
        id: d.id,
        code: "OVERLAP",
        reason: "Decoration overlaps an existing attachment",
        relatedIds: overlaps.map((p) => p.id)
      });
      continue;
    }
    if (arch) {
      result.wallProfile = arch.profile;
      (result.archOpenings ??= []).push({ points: arch.cut.points, heights: arch.cut.heights });
      if ("instances" in arch) {
        for (const instance of arch.instances) (result.archInstances ??= []).push({ ...instance, decorationId: d.id });
      } else {
        for (const part of arch.frames)
          (result.woodArchFrames ??= []).push({
            ...part,
            ownerId: building.id,
            decorationId: d.id,
            colorId: d.woodColor ?? building.wood_color ?? 0
          });
        for (const pillar of arch.pillars)
          (result.woodArchPillars ??= []).push({
            ...pillar,
            ownerId: building.id,
            decorationId: d.id,
            colorId: d.woodColor ?? building.wood_color ?? 0
          });
      }
      occupied.push({
        id: d.id,
        u,
        bottom: installationBottom,
        width: installationWidth,
        height: installationTop - installationBottom
      });
      continue;
    }
    if (!assembly) throw Error("Missing decoration assembly after producer dispatch");
    const mountCurve = constructionWallMount(curve, wallU, envelope.mountOffset);
    const [mountX, mountZ] = mountCurve.sample(wallU);
    const centerY = bottom + d.height * 0.5;
    const bounds = assembly!.bounds;
    const sx = d.width / (bounds.max[0] - bounds.min[0]),
      sy = d.height / (bounds.max[1] - bounds.min[1]),
      // Gothic placement is relative to a fixed-thickness host wall. Width and
      // height resize its aperture, not its inset/projection through that wall.
      sz =
        stoneHalf || typeId === "window-gothic" || typeId === "door-gothic" || typeId === "window-arrow-slit"
          ? 1
          : Math.min(sx, sy);
    const cx = (bounds.min[0] + bounds.max[0]) * 0.5,
      cy = (bounds.min[1] + bounds.max[1]) * 0.5;
    const pivotU = u - cx * sx,
      pivotY = centerY - cy * sy;
    if (typeId === "dormer-cottage-half" || stoneHalf) {
      if (isFlatRoofHeight(building.roof.height)) {
        result.diagnostics.push({
          id: d.id,
          code: "UNSUPPORTED_ATTACHMENT",
          reason: "An eave window requires a pitched roof"
        });
        continue;
      }
      if (
        attachmentPlacement(d.id, () =>
          (stoneHalf ? compileConstructionStoneHalf : compileConstructionHalfCottage)(
            building,
            shape,
            profile,
            d,
            { curve, mountCurve, pivotU, pivotY, scale: [sx, sy, sz], seed },
            pitched(),
            owner.wallSlot,
            owner.roofBinding,
            result
          )
        )
      )
        occupied.push({ id: d.id, u, bottom, width: d.width, height: d.height });
      continue;
    }
    let origin = [mountX - tx * cx * sx + nx * 0.27, pivotY, mountZ - tz * cx * sx + nz * 0.27];
    let glassOrigin: number[] | undefined;
    let frameAttributes: { wallRange: readonly [number, number]; meshSizeX: number; woodenWall: boolean } | undefined;
    let axes: [number[], number[], number[]] = [
      [tx * sx, 0, tz * sx],
      [0, sy, 0],
      [nx * sz, 0, nz * sz]
    ];
    if (typeId === "window-gothic" || typeId === "door-gothic") {
      // Authored variation is independent of Scene identity and dense GPU slots.
      const placement = attachmentPlacement(d.id, () =>
        recoveredGothicWallPlacement(owner.assets?.decorationCollisions, owner.assets?.decorations, {
          kind: typeId === "door-gothic" ? "door" : "window",
          rank,
          curve: mountCurve,
          wallX: pivotU,
          pivotY,
          closed: true,
          circleRadius: shape.type === "circle" ? shape.radius : undefined,
          wooden: building.material === 1,
          halfTimber: false,
          // Our lower-body height has already raised profile.bottom. It is not
          // Tiny Glade's separate stone foundation covering a wooden wall.
          foundationHeight: 0,
          baseY: profile.minGround,
          bottomSamples: profile.bottom,
          wallMaxY: profile.maxY,
          wallSlot: owner.wallSlot,
          seed,
          sourceScale: [sx, sy, sz]
        })
      );
      if (!placement) continue;
      result.windowCuts.push({ id: d.id, cut: placement.windowCut });
      origin = placement.frameOrigin;
      frameAttributes = {
        wallRange: placement.instance.wallRange,
        meshSizeX: placement.meshSizeX,
        // Frame material byte 0x104 is zero; 0x105 is a separate wall-cut flag.
        woodenWall: false
      };
      const [gnx, gnz] = placement.normalXZ;
      axes = [
        [gnz * sx, 0, -gnx * sx],
        [0, sy, 0],
        [gnx * sz, 0, gnz * sz]
      ];
      if (placement.visibleHat)
        result.stones.push({
          id: building.id + "/" + d.id + "/hat",
          decorationId: d.id,
          ownerId: building.id,
          template: placement.template,
          instance: placement.instance,
          geometryScale: [sx, sy, sz]
        });
      result.holes.push(
        ...gothicDecorationWallHoles(rank, pivotU, pivotY, sx, sy, typeId === "door-gothic" ? "door" : "window").map(
          (h) => ({ ...h, decorationId: d.id })
        )
      );
    }
    if (typeId === "window-arrow-slit") {
      const placement = attachmentPlacement(d.id, () =>
        recoveredArrowWallPlacement(owner.assets?.decorationCollisions, {
          rank,
          curve: mountCurve,
          wallX: pivotU,
          pivotY,
          closed: true,
          circleRadius: shape.type === "circle" ? shape.radius : undefined,
          wooden: building.material === 1,
          wallMaxY: profile.maxY,
          wallSlot: owner.wallSlot,
          seed,
          sourceScale: [sx, sy, sz]
        })
      );
      if (!placement) continue;
      result.windowCuts.push({ id: d.id, cut: placement.windowCut });
      origin = placement.origin;
      const [anx, anz] = placement.normalXZ,
        [asx, asy, asz] = placement.scale;
      axes = [
        [anz * asx, 0, -anx * asx],
        [0, asy, 0],
        [anx * asz, 0, anz * asz]
      ];
      // Original arrow body stores zero at BrickColor::is_wooden, even on wood
      // walls. Only its half-dormer stone cap takes the host wooden flag.
      frameAttributes = { wallRange: placement.instance.wallRange, meshSizeX: placement.meshSizeX, woodenWall: false };
    }
    if (typeId === "window-cottage") {
      const collision = requireDecorationCollision(
        owner.assets?.decorationCollisions,
        `window_cottage_${rank}x1_collision`
      );
      const collisionWidth = mul(sub(collision.max[0], collision.min[0]), sx);
      if (shape.type === "circle" && collisionWidth >= curve.length) {
        result.diagnostics.push({
          id: d.id,
          code: "INSUFFICIENT_SPACE",
          reason: "Window collision span covers the entire closed wall"
        });
        continue;
      }
      const placement = recoveredCottageWallPlacement(
        shape.type === "rectangle"
          ? {
              kind: "rectangle",
              cached: {
                position: [mountX - tx * cx * sx, pivotY, mountZ - tz * cx * sx],
                quaternion: cottageXzProjectiveRotation([nx, 0, nz]),
                scale: [sx, sy, sz]
              }
            }
          : {
              kind: "curve",
              curve: mountCurve,
              closed: true,
              wallX: pivotU,
              pivotY,
              collisionWidth
            }
      );
      result.windowCuts.push({
        id: d.id,
        cut: recoveredCottageWallCut(placement.frame, rank, [pivotU, pivotY], true, [sx, sy])
      });
      origin = placement.frame.position;
      glassOrigin = placement.glass!.position;
      // Native circle poses rebuild unit scale. Author resizing is our explicit
      // extension; scale the mesh and sampled collision width, not the .14/.07 offsets.
      axes = roofBasis(placement.frame.quaternion).map((axis, i) => axis.map((v) => v * [sx, sy, sz][i])) as [
        number[],
        number[],
        number[]
      ];
      result.holes.push({
        ...cottageDecorationWallHole(
          owner.assets?.decorationCollisions,
          rank,
          shape.type === "circle",
          pivotU,
          pivotY,
          sx,
          sy
        ),
        decorationId: d.id
      });
    } else if (typeId === "window-arrow-slit") {
      result.holes.push(
        ...arrowDecorationWallHoles(rank, pivotU, pivotY, sx, sy).map((h) => ({ ...h, decorationId: d.id }))
      );
    } else if (typeId === "door-cottage") {
      const collision = requireDecorationCollision(
        owner.assets?.decorationCollisions,
        `balcony_door_rank${rank}_collision`
      );
      const collisionWidth = mul(sub(collision.max[0], collision.min[0]), sx);
      if (collisionWidth >= curve.length) {
        result.diagnostics.push({
          id: d.id,
          code: "INSUFFICIENT_SPACE",
          reason: "Door collision span covers the entire closed wall"
        });
        continue;
      }
      const placement = recoveredCottageDoorPlacement(
        { kind: "curve", curve: mountCurve, closed: true, wallX: pivotU, pivotY, collisionWidth },
        rank,
        [sx, sy, sz]
      );
      origin = placement.frame.position;
      axes = roofBasis(placement.frame.quaternion).map((axis, i) => axis.map((v) => v * placement.frame.scale[i])) as [
        number[],
        number[],
        number[]
      ];
      result.windowCuts.push({ id: d.id, cut: placement.windowCut });
      result.holes.push({
        ...cottageDoorWallHole(owner.assets?.decorationCollisions, rank, pivotU, pivotY, sx, sy),
        decorationId: d.id
      });
    }
    const wallFrames = d.frameMaterial === "wall" ? assembly.parts.filter((part) => part.binding.role === "frame") : [];
    if (wallFrames.length && !frameAttributes) throw Error("Missing native frame attributes for " + typeId);
    for (const wallFrame of wallFrames)
      result.frames.push(
        constructionDecorationFrame({
          id: building.id + "/" + d.id + "/" + wallFrame.suffix,
          ownerId: building.id,
          decorationId: d.id,
          mesh: wallFrame.name,
          binding: wallFrame.binding,
          origin,
          axes,
          ...frameAttributes!,
          seed,
          wallSlot: owner.wallSlot
        })
      );
    const parts = assembly.parts
      .filter((part) => !wallFrames.includes(part))
      .flatMap((part) =>
        decorationAssemblyGeometry(building, d, { bounds: assembly.bounds, parts: [part] }, kind, {
          origin: part.binding.role === "glass" && glassOrigin ? glassOrigin : origin,
          axes,
          editUV: (source, world) => [
            wallU + ((source[0] - cx) * sx) / curve.length,
            (world[1] - profile.minGround) / Math.max(0.01, profile.topY - profile.minGround)
          ]
        })
      );
    for (const part of parts) result.parts.push(part);
    occupied.push({ id: d.id, u, bottom, width: d.width, height: d.height });
  }
  return result;
}
