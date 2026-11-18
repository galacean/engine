import type { SeedWorldDecorationInstance, SeedWorldPresentationDecorationInstance } from "@galacean/engine-world-planning/world/SeedWorldDecorations";
import { seedWorldFieldTransferables, type SeedWorldFields } from "@galacean/engine-world-planning/runtime/SeedWorldFields";
import type {
  SeedWorldHydrologyBakeStyle,
  SeedWorldHydrologyCoverageMask,
  SeedWorldHydrologyWaterBody
} from "@galacean/engine-world-planning/runtime/SeedWorldHydrologyBake";
import type { SeedWorldHydrologyCompilerDiagnostics } from "./SeedWorldHydrologyCompiler.ts";
import type { SeedWorldPlan } from "@galacean/engine-world-planning/world/SeedWorldPlanner";
import type { SeedWorldPopulationPreview } from "@galacean/engine-world-planning/runtime/SeedWorldPopulationPlan";
import type { SeedWorldRiverCurve, SeedWorldRiverCurveSample } from "@galacean/engine-world-planning/runtime/SeedWorldRiverCurves";
import type { SeedWorldSurfaceMaterialIntent } from "@galacean/engine-world-planning/runtime/SeedWorldSurfaceIntent";
import type { SeedWorldTerrainGenerationSettings } from "@galacean/engine-terrain/world/SeedWorldTerrainGenerationSettings";

/** Compact Lake metrics published for the 2D authoring preview without cloning raster fields. */
export interface SeedWorldHydrologyBodyPreview {
  readonly id: string;
  readonly areaSquareMetres: number;
  readonly waterLevelMetres: number;
}

/** Exact canonical feature data returned before slower population compilation finishes. */
export interface SeedWorldLayoutFeaturePreview {
  readonly plan: SeedWorldPlan;
  readonly rootSeed: number;
  readonly sizeMetres: number;
  readonly riverCurves: readonly SeedWorldRiverCurve[];
  readonly riverCurveSamples: readonly (readonly SeedWorldRiverCurveSample[])[];
  readonly hydrologyGeometryHash: number;
  readonly hydrologyCoverage: SeedWorldHydrologyCoverageMask;
  readonly hydrologyBodies: readonly SeedWorldHydrologyBodyPreview[];
  readonly hydrologyStyle: SeedWorldHydrologyBakeStyle;
}

/** Worker-baked hydrology data consumed literally by Water and diagnostics. */
export interface SeedWorldCompiledHydrology {
  readonly geometryHash: number;
  readonly bakeHash: number;
  readonly style: SeedWorldHydrologyBakeStyle;
  readonly waterBodies: readonly SeedWorldHydrologyWaterBody[];
  readonly diagnostics: SeedWorldHydrologyCompilerDiagnostics;
}

/** Common render-facing result compiled off the UI thread from one Plan. */
export interface SeedWorldPresentationCompileResult {
  readonly plan: SeedWorldPlan;
  readonly terrainSettings: SeedWorldTerrainGenerationSettings;
  readonly fields: SeedWorldFields;
  readonly terrainNormalSamples: Uint8Array;
  readonly surfaceColorSamples: Uint8Array;
  readonly decorations: readonly SeedWorldDecorationInstance[];
  readonly featureDecorations: readonly SeedWorldPresentationDecorationInstance[];
  /** Natural Population compiled from the Root-Seed operations before local vegetation Authoring. */
  readonly rootPopulationPreview: SeedWorldPopulationPreview;
  /** Current Population publication including every persisted local vegetation operation. */
  readonly populationPreview: SeedWorldPopulationPreview;
  readonly surfaceIntent: SeedWorldSurfaceMaterialIntent;
  readonly debugTimingsMilliseconds?: Readonly<Record<string, number>>;
}

/** Render-facing rasters whose ownership moves from the Field Worker to the main thread. */
export function seedWorldPresentationRasterTransferables(
  result: Pick<SeedWorldPresentationCompileResult, "terrainNormalSamples" | "surfaceColorSamples">
): Transferable[] {
  return [result.terrainNormalSamples.buffer, result.surfaceColorSamples.buffer];
}

/** Planned-Hydrology 2D compile result retained by the vector authoring preview. */
export interface SeedWorldCompileResult extends SeedWorldPresentationCompileResult {
  readonly hydrology: SeedWorldCompiledHydrology;
}

/** Main-thread Hydrology output consumed literally by the presentation Worker. */
export interface SeedWorldAuthoritativePresentationSourceV2 {
  readonly schemaVersion: 2;
  readonly artifactContentHash: string;
  readonly terrainSourceHash: string;
  readonly plannedHydrologyGeometryHash: number;
  readonly plannedHydrologyBakeHash: number;
  readonly plannedFields: SeedWorldFields;
  readonly plannedHydrologyWaterBodies: readonly SeedWorldHydrologyWaterBody[];
  readonly lakeShorePlacementBodies: readonly SeedWorldLakeShorePlacementBodyV1[];
  readonly hfinalSamples: Uint16Array;
}

/** Transfer list shared by the authoritative Worker handoff and the presentation Worker request. */
export function seedWorldAuthoritativePresentationSourceTransferablesV2(
  source: Readonly<SeedWorldAuthoritativePresentationSourceV2>
): Transferable[] {
  return [
    source.hfinalSamples.buffer,
    ...seedWorldFieldTransferables(source.plannedFields),
    ...source.plannedHydrologyWaterBodies.flatMap((body) => [
      body.wetMask.buffer,
      body.coverage.buffer,
      body.signedDistanceMetres.buffer
    ]),
    ...source.lakeShorePlacementBodies.map((body) => body.eligibleMask.buffer)
  ];
}

/** Compact Artifact authority projected onto one planned Hydrology body's local raster. */
export interface SeedWorldLakeShorePlacementBodyV1 {
  readonly schemaVersion: 1;
  readonly basinId: string;
  readonly bodySourceHash: string;
  readonly waterLevelMetres: number;
  readonly resolution: number;
  readonly eligibleMask: Uint8Array;
}
