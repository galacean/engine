import type { SeedWorldPresentationDecorationInstance, SeedWorldStoneInstance } from "@galacean/engine-world-planning/world/SeedWorldDecorations";
import type { SeedWorldFields } from "@galacean/engine-world-planning/runtime/SeedWorldFields";
import {
  compileSeedWorldFinalTreeStatistics,
  type SeedWorldFinalTreeStatistics,
  type SeedWorldPopulationInstance,
  type SeedWorldPopulationPreview
} from "@galacean/engine-world-planning/runtime/SeedWorldPopulationPlan";
import type { SeedWorldPlan } from "@galacean/engine-world-planning/world/SeedWorldPlanner";
import type { SeedWorldSolvedRockObb } from "@galacean/engine-world-planning/runtime/SeedWorldRockAssemblySolver";
import {
  compileSeedWorldRockObbClearance,
  type SeedWorldRockObbClearanceDiagnostics
} from "./SeedWorldRockObbClearance.ts";
import { compileSeedWorldRockObbDebris } from "./SeedWorldRockObbDebris.ts";

/** Downstream presentation result shared by the vector overlay and the 3D runtime. */
export interface SeedWorldPublishedRockPresentation {
  /** Formal rocks emitted directly by the first-principles planner. */
  readonly publishedRockObbs: readonly SeedWorldSolvedRockObb[];
  /** Human-scale stones generated against the complete projected final OBBs. */
  readonly rockObbDebris: readonly SeedWorldStoneInstance[];
  /** Non-mountain feature decorations plus OBB debris after final OBB clearance. */
  readonly decorations: readonly SeedWorldPresentationDecorationInstance[];
  /** Population after discrete assets and flower texels intersecting final OBBs are removed. */
  readonly population: SeedWorldPopulationPreview;
  /** Exact generated trees removed from terrain grounding and retained for Clif-surface materialization. */
  readonly rockSurfaceTreeCandidates: readonly SeedWorldPopulationInstance[];
  /** Counts emitted by the shared final-OBB clearance pass. */
  readonly clearanceDiagnostics: SeedWorldRockObbClearanceDiagnostics;
  /** Generated-versus-final exact tree evidence from the data actually submitted to rendering. */
  readonly treePopulationDiagnostics: SeedWorldFinalTreeStatistics & {
    readonly generatedTreeCount: number;
    readonly removedByFinalRockObbs: number;
  };
}

/**
 * Adapts independently authored layout decorations and solved rock OBBs into one final presentation stream.
 * This module is downstream of both planners: it does not edit layout rules or solve rock transforms.
 */
export function compileSeedWorldPublishedRockPresentation(
  plan: SeedWorldPlan,
  fields: SeedWorldFields,
  featureDecorations: readonly SeedWorldPresentationDecorationInstance[],
  population: SeedWorldPopulationPreview,
  formalRockObbs: readonly SeedWorldSolvedRockObb[] | undefined,
  referenceEyeHeightMetres: number,
  rockSurfaceTreeSourceInstances?: readonly SeedWorldPopulationInstance[]
): SeedWorldPublishedRockPresentation {
  const publishedRockObbs = formalRockObbs ?? Object.freeze([]);
  const generalDecorations = formalRockObbs
    ? featureDecorations.filter((decoration) => decoration.category !== "rock" || decoration.sourceKind !== "mountain")
    : featureDecorations;
  const rockObbDebris = compileSeedWorldRockObbDebris(
    plan,
    fields,
    publishedRockObbs,
    generalDecorations,
    population,
    referenceEyeHeightMetres
  );
  const clearance = compileSeedWorldRockObbClearance(
    fields.sizeMetres,
    Object.freeze([...generalDecorations, ...rockObbDebris]),
    population,
    publishedRockObbs,
    fields,
    rockSurfaceTreeSourceInstances
  );
  const finalTreeStatistics = compileSeedWorldFinalTreeStatistics(plan, fields, clearance.population);
  const generatedTreeCount = population.treeInstances.filter(({ category }) => category === "tree").length;
  return Object.freeze({
    publishedRockObbs,
    rockObbDebris,
    decorations: clearance.decorations,
    population: clearance.population,
    rockSurfaceTreeCandidates: clearance.rockSurfaceTreeCandidates,
    clearanceDiagnostics: clearance.diagnostics,
    treePopulationDiagnostics: Object.freeze({
      ...finalTreeStatistics,
      generatedTreeCount,
      removedByFinalRockObbs: generatedTreeCount - finalTreeStatistics.finalTreeCount
    })
  });
}
