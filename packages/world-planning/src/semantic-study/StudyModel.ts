import type { V2CompileResult, V2Point, V2Point3, WorldRecipe } from "../spatial/V2Model.ts";

/** Authored polygonal mass whose positive-height footprint is covered by upright whitebox columns. */
export interface StudyMass {
  /** Stable group identity, distinct from every native recipe feature. */
  id: string;
  label: string;
  /** Simple, possibly concave world-XZ polygon in metres, without a repeated closing vertex. */
  outline: V2Point[];
  /** Explicit terrain voids, each a simple polygon strictly inside outline; colour-overlay gaps are not inferred. */
  holes?: V2Point[][];
  /** Height multiplier in metres; zero removes the mass without modifying its outline. */
  height: number;
  /** Absolute world-space bottom elevation of every column, in metres. */
  baseY: number;
  /** Footprint sampling grid in metres; aligned equal-height cells merge into larger whiteboxes. */
  cellSize: number;
  /** Non-negative height multipliers sampled uniformly from minimum to maximum world X; omission means one. */
  profile?: number[];
}

/** One authored observation, independent of movement or physical passage. */
export interface StudyViewpoint {
  id: string;
  label: string;
  /** Observer position in world metres. */
  position: V2Point3;
  /** Point toward which this observer is looking, in world metres. */
  target: V2Point3;
}

/** Numeric field assignment driven by one semantic control. */
export interface StudyBinding {
  /** Existing field path from StudyDefinition; numbers address array elements. */
  path: (string | number)[];
  /** Applied value is controlValue * scale + offset; omission means one. */
  scale?: number;
  /** Constant in the bound field's units; omission means zero. */
  offset?: number;
}

/** A small semantic control whose changes update actual definition fields together. */
export interface StudyControl {
  id: string;
  label: string;
  unit?: string;
  /** UI range; explicit finite values outside it are preserved for negative controls. */
  min: number;
  max: number;
  step: number;
  /** First binding supplies the displayed value; all bindings are applied atomically. */
  bindings: StudyBinding[];
}

/** Common immutable-by-convention input for baseline, modification, negative control, and restoration. */
export interface StudyDefinition {
  id: string;
  title: string;
  prompt: string;
  /** Reference image path or URL retained as source context; geometry comes from masses and recipe. */
  image?: string;
  recipe: WorldRecipe;
  masses: StudyMass[];
  viewpoints: StudyViewpoint[];
  controls: StudyControl[];
}

/** Actual conversion measurements for one polygonal mass. */
export interface StudyMassStats {
  id: string;
  columnCount: number;
  /** Number of occupied source cells before footprint-preserving neighbour compaction. */
  sourceColumnCount?: number;
  /** Authored solid area in square metres: outer polygon minus explicit, non-overlapping holes. */
  polygonArea: number;
  /** Total authored hole area in square metres, before conservative grid exclusion. */
  holeArea: number;
  /** Candidate columns omitted because their footprint overlaps an explicit hole. */
  holeSkippedCells: number;
  /** Upper bound on hole expansion due to omitted boundary cells, in metres. */
  maximumHoleExpansion: number;
  /** Sum of non-overlapping column footprints in square metres; may exceed polygon area at its boundary. */
  columnFootprintArea: number;
  /** Maximum possible horizontal boundary expansion of a cell, in metres. */
  maximumBoundaryExpansion: number;
}

/** Native compilation result plus the concrete recipe submitted to the existing compiler. */
export interface StudyCompileResult extends V2CompileResult {
  /** Independent recipe copy containing all authored native fields and generated mass columns. */
  recipe: WorldRecipe;
  /** Completed mass conversion measurements; failure reports may contain only the completed prefix. */
  massStats: StudyMassStats[];
}
