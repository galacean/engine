import type { SeedWorldRockCompilation } from "./SeedWorldRockCompiler.ts";
import type { SeedWorldSolvedRockObb } from "@galacean/engine-world-planning/runtime/SeedWorldRockAssemblySolver";

/** Exact generated-world identity guarding one immutable published rock layout. */
export interface SeedWorldPublishedRockLayoutWorld {
  /** Geology stage seed shown by the authoring UI. */
  readonly geologySeed: number;
  /** Hydrology stage seed shown by the authoring UI. */
  readonly hydrologySeed: number;
  /** Stable geology-layout identity guarding hill and canyon topology. */
  readonly layoutWorldId: number;
  /** Horizontal world extent in metres. */
  readonly worldSizeMetres: number;
  /** Final stitched Heightmap resolution used to author the transforms. */
  readonly heightResolution: number;
  /** Exact final Heightmap signature used during publication. */
  readonly heightHash: number;
}

/** Immutable artist-approved rock instances for one exact generated world. */
export interface SeedWorldPublishedRockLayout {
  /** Versioned JSON contract for the checked-in artifact. */
  readonly schema: "seed-world-published-rock-layout/v1";
  /** Provenance shown only in diagnostics. */
  readonly source: string;
  /** Exact world identity required before this layout can be selected. */
  readonly identity: SeedWorldPublishedRockLayoutWorld;
  /** Final runtime and clearance OBBs, with no procedural solve required. */
  readonly rocks: readonly SeedWorldSolvedRockObb[];
}

/** Published-or-procedural rock result consumed uniformly by presentation and runtime. */
export type SeedWorldRockLayoutResolution =
  | Readonly<{
      source: "published";
      rocks: readonly SeedWorldSolvedRockObb[];
      compilation: undefined;
    }>
  | Readonly<{
      source: "procedural";
      rocks: readonly SeedWorldSolvedRockObb[];
      compilation: SeedWorldRockCompilation;
    }>;

/**
 * Retained lookup contract for older consumers. Runtime worlds no longer substitute
 * checked-in, seed-specific rock transforms for their generated spatial plan.
 * @param _world The generated-world identity previously used by the artifact lookup.
 * @returns No implicit published layout.
 */
export function resolveSeedWorldPublishedRockLayout(
  _world: SeedWorldPublishedRockLayoutWorld
): SeedWorldPublishedRockLayout | undefined {
  return undefined;
}

/**
 * Resolves rocks through the supplied procedural compiler for every world identity.
 * @param _world Generated-world context retained for existing integrations.
 * @param compileProcedural The caller's compiler for its current terrain and parameters.
 * @returns The compiler's rocks and complete diagnostics without a seed-specific override.
 */
export async function compileSeedWorldRockLayout(
  _world: SeedWorldPublishedRockLayoutWorld,
  compileProcedural: () => Promise<SeedWorldRockCompilation>
): Promise<SeedWorldRockLayoutResolution> {
  const compilation = await compileProcedural();
  return Object.freeze({ source: "procedural", rocks: compilation.assemblies.rocks, compilation });
}
