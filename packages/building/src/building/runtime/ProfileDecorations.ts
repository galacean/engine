import type { PlannedProfiledDormerRoof } from "./ProfiledDormerSupport";
import type { PlannedCottageDormerRoof } from "./CottageDormerSupport";
import { generatedDecorationSeed, resolveDecorationConfig } from "./ConstructionDecorationConfig.ts";
import { constructionWallMount } from "./ConstructionWallEnvelope.ts";
import { recoveredArrowWallPlacement } from "./RecoveredArrowWallPlacement.ts";
import { createGothicRoofDecorationPlanner } from "./ConstructionGothicRoofDecorations.ts";
import { planConstructionStoneHalf } from "./ConstructionStoneHalfDecorations.ts";
import { planConstructionHalfCottage } from "./ConstructionHalfCottageDecorations.ts";
import {
  createPitchedDecorationContext,
  type PitchedDecorationContext
} from "./ConstructionPitchedDecorationContext.ts";
import { createCottageRoofDecorationPlanner } from "./ConstructionCottageRoofDecorations.ts";
import { planFlatRoofDecoration, type RoofDecorationOccupancy } from "./ConstructionRoofDecorations.ts";
import {
  recoveredCottageWallPlacement,
  recoveredCottageWallCut,
  recoveredCottageDoorPlacement
} from "./RecoveredCottageWallPlacement.ts";
import { cottageXzProjectiveRotation } from "./RecoveredCottageRoofSampler.ts";
import { requireDecorationCollision } from "./ConstructionDecorationCollisions";
import type { BuildingUnitAssets } from "./BuildingUnitAssets";
import { roofBasis } from "./ConstructionRoof.ts";
import { sub, mul } from "./RecoveredRoofMath.ts";
import { recoveredGothicWallPlacement } from "./RecoveredGothicWallPlacement.ts";
import { constructionDecorationAssembly } from "./ConstructionDecorationAssembly.ts";
import type { DecorationSurfaceOwner } from "./DecorationSurfaceOwner";
import type { PublishedWallProfile } from "./PublishedWallProfile.ts";
import type { WallConnectionShape, WallConnectionWipHole } from "./WallConnectionTypes.ts";
import { shapeCurve } from "./RecoveredWallConnectionHoles.ts";
import { constructionDecorationDefinition, decorationConstraintFact } from "./ConstructionDecorationCatalog.ts";
import type { PlannedDecorationAssembly } from "./DecorationAssemblyPlacement";
import {
  cottageDecorationWallHole,
  cottageDoorWallHole,
  arrowDecorationWallHoles,
  gothicDecorationWallHoles
} from "./RecoveredDecorationWallHoles.ts";
import { isFlatRoofHeight } from "./RoofMode.ts";
import { planConstructionCornerDecoration } from "./ConstructionCornerDecorations.ts";
import { planConstructionStoneArch } from "./ConstructionStoneArch.ts";
import { planConstructionWoodArch } from "./ConstructionWoodArch.ts";
import { ClosedWallSpanError } from "./RecoveredWallSpace.ts";
import { CottageRoofSpanError } from "./RecoveredCottageDormerRoof.ts";
import type {
  ConstructionDecorationSpec,
  ResolvedConstructionDecorationSpec,
  CompiledConstructionDecorations
} from "./ConstructionDecorations";

const cyclicDistance = (a: number, b: number, length: number) =>
  Math.abs(((a - b + length * 1.5) % length) - length * 0.5);

export type PlannedProfileArch = {
  decorationId: string;
  colorId: number;
} & (
  | { kind: "stone"; plan: ReturnType<typeof planConstructionStoneArch> }
  | { kind: "wood"; plan: ReturnType<typeof planConstructionWoodArch> }
);
export type PlannedProfileDecorations = CompiledConstructionDecorations & {
  arches: PlannedProfileArch[];
  mounts: PlannedDecorationAssembly[];
  dormerRoofs: (PlannedCottageDormerRoof | PlannedProfiledDormerRoof)[];
};

export function planProfileDecorations(
  building: DecorationSurfaceOwner,
  shape: WallConnectionShape,
  profile: PublishedWallProfile,
  specs: readonly ConstructionDecorationSpec[] = [],
  excludedHoles: readonly WallConnectionWipHole[] = [],
  owner: {
    wallSlot: number;
    seed: number;
    roofBinding?: import("./UnitPlacement").UnitPlacementBinding;
    assets?: BuildingUnitAssets;
  } = {
    wallSlot: 0,
    seed: building.seed ?? 0
  }
): PlannedProfileDecorations {
  const result: PlannedProfileDecorations = {
    arches: [],
    mounts: [],
    dormerRoofs: [],
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
  const envelope = building.wallEnvelope;
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
  let gothicRoof: ReturnType<typeof createGothicRoofDecorationPlanner> | undefined;
  let cottageRoof: ReturnType<typeof createCottageRoofDecorationPlanner> | undefined;
  let pitchedContext: PitchedDecorationContext | undefined;
  const pitched = () => (pitchedContext ??= createPitchedDecorationContext(building.roof, owner.assets));
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
    const resolved = resolveDecorationConfig(requested, isFlatRoofHeight(building.roof.surface.height_parameter));
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
    const seed = d.seed ?? generatedDecorationSeed(owner.seed, d.variationKey ?? d.id);
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
        if (isFlatRoofHeight(building.roof.surface.height_parameter)) {
          result.diagnostics.push({
            id: d.id,
            code: "UNSUPPORTED_ATTACHMENT",
            reason: "A full dormer requires a pitched roof"
          });
        } else if (typeId === "dormer-gothic") {
          gothicRoof ??= createGothicRoofDecorationPlanner(building, owner.wallSlot, owner.roofBinding, pitched());
          const planned = gothicRoof(d, result);
          if (planned) {
            result.mounts.push(planned.mount);
            result.dormerRoofs.push(planned.roof);
          }
        } else {
          cottageRoof ??= createCottageRoofDecorationPlanner(building, owner.wallSlot, owner.roofBinding, pitched());
          const planned = attachmentPlacement(d.id, () => cottageRoof!(d, result));
          if (planned) {
            result.mounts.push(planned.mount);
            result.dormerRoofs.push(planned.roof);
          }
        }
        continue;
      }
      if (!isFlatRoofHeight(building.roof.surface.height_parameter)) {
        result.diagnostics.push({ id: d.id, code: "UNSUPPORTED_ATTACHMENT", reason: `${typeId} requires a flat roof` });
        continue;
      }
      const mount = planFlatRoofDecoration(
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
      if (mount) result.mounts.push(mount);
      continue;
    }
    if (typeId === "window-cottage-corner") {
      const corner = planConstructionCornerDecoration(
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
      if (corner) result.mounts.push(corner);
      continue;
    }
    const kind = type.purpose === "light" ? "wall-lamp" : type.purpose;
    const wallU = d.u!;
    const woodenArch = typeId === "opening-arch" && building.wallMaterial === 1;
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
    let arch: ReturnType<typeof planConstructionStoneArch> | ReturnType<typeof planConstructionWoodArch> | undefined;
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
          ...(building.variationKey !== undefined || d.variationKey !== undefined
            ? { variationKey: `${building.variationKey ?? building.id}/decoration/${d.variationKey ?? d.id}` }
            : {}),
          centerU: wallU,
          width: d.width,
          apexY: bottom + d.height,
          scale: d.height,
          seed,
          slot: owner.wallSlot,
          depthScale: envelope.depthScale
        };
        arch = woodenArch
          ? planConstructionWoodArch(result.wallProfile ?? profile, { ...input, topY: bottom + d.height })
          : planConstructionStoneArch(result.wallProfile ?? profile, input);
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
      result.arches.push({
        decorationId: d.id,
        colorId: d.woodColor ?? building.woodColor ?? 0,
        ...(woodenArch
          ? { kind: "wood" as const, plan: arch as ReturnType<typeof planConstructionWoodArch> }
          : { kind: "stone" as const, plan: arch as ReturnType<typeof planConstructionStoneArch> })
      });
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
      if (isFlatRoofHeight(building.roof.surface.height_parameter)) {
        result.diagnostics.push({
          id: d.id,
          code: "UNSUPPORTED_ATTACHMENT",
          reason: "An eave window requires a pitched roof"
        });
        continue;
      }
      const planned = attachmentPlacement(d.id, () =>
        (stoneHalf ? planConstructionStoneHalf : planConstructionHalfCottage)(
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
      );
      if (planned) {
        result.mounts.push(planned.mount);
        result.dormerRoofs.push(planned.roof);
        occupied.push({ id: d.id, u, bottom, width: d.width, height: d.height });
      }
      continue;
    }
    const stones: CompiledConstructionDecorations["stones"] = [];
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
          wooden: building.wallMaterial === 1,
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
        stones.push({
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
          wooden: building.wallMaterial === 1,
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
    result.mounts.push({
      decorationId: d.id,
      mount: {
        origin,
        axes,
        ...(glassOrigin ? { glassOrigin } : {}),
        stones,
        chart: {
          kind: "wall",
          u: wallU,
          centerX: cx,
          scaleX: sx,
          length: curve.length,
          minimumY: profile.minGround,
          height: profile.topY - profile.minGround
        }
      },
      placement: {
        building: { id: building.id, woodColor: building.woodColor },
        spec: d,
        assembly,
        kind,
        ...(frameAttributes ? { frameAttributes: { ...frameAttributes, seed, wallSlot: owner.wallSlot } } : {})
      }
    });
    occupied.push({ id: d.id, u, bottom, width: d.width, height: d.height });
  }
  return result;
}
