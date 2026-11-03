import {
  validateProceduralTreeStructureParameters,
  freezeValidatedTreeStructure,
  PROCEDURAL_TREE_LOD_COUNT
} from "./ProceduralTreeStructureValidation";
export {
  validateProceduralTreeStructureParameters,
  PROCEDURAL_TREE_LOD_COUNT
} from "./ProceduralTreeStructureValidation";
import {
  Buffer,
  BufferBindFlag,
  BufferUsage,
  Color,
  type Engine,
  MeshTopology,
  ModelMesh,
  Vector2,
  Vector3,
  Vector4,
  VertexElement,
  VertexElementFormat
} from "@galacean/engine";
import {
  DEFAULT_TREE_LEAF_COUNT_TUNING,
  PROCEDURAL_TREE_LEAF_COUNT_MAX,
  PROCEDURAL_TREE_LOD_LEAF_COUNTS,
  proceduralTreeLeafCounts,
  type TreeLeafCountTuning
} from "./ProceduralTreeLeafCount";
import {
  DEFAULT_TREE_BILLBOARD_TUNING,
  DEFAULT_TREE_LEAF_CARD_TUNING,
  type TreeBillboardTuning,
  type TreeLeafCardTuning
} from "./AssetAssemblyPresetFactory";
import { attachProceduralTreeCanopyOpticalDepthByLod } from "./ProceduralTreeCanopyOcclusion";
import { freezeImmutableData } from "@galacean/engine-terrain/terrain/ImmutableData";
import {
  buildPlantShapeGeometry,
  evaluatePlantNormalField,
  plantRectangleShape,
  type PlantNormalField,
  type PlantShape,
  type PlantGeometryResolution
} from "./ProceduralPlantGeometry";

export { PROCEDURAL_TREE_LOD_LEAF_COUNTS } from "./ProceduralTreeLeafCount";

/** Sapling-style density exposed by the demo. The LOD0 startup budget resolves to 250 visible leaf cards. */
export const PROCEDURAL_TREE_LEAF_DENSITY = 25;
/** Generator contract version; v24 shapes child root rings inside their supporting woody tube. */
export const PROCEDURAL_TREE_ALGORITHM = "sapling-compatible-v24" as const;

export type Point = readonly [x: number, y: number, z: number];
// Existing trees are the rectangular member of the shared plant surface family.
const TREE_LEAF_SURFACE = buildPlantShapeGeometry(plantRectangleShape(2, 1), {
  subdivisionsPerSpan: 1,
  widthSegments: 1,
  radialSegments: 3
});
/** Three weighted directional modes used by a generator level's azimuth distribution. */
export type ProceduralTreeModeTuple = readonly [first: number, second: number, third: number];

interface ModelMeshVertexElementInternals {
  _addVertexElement(element: VertexElement): void;
}

export interface ProceduralTreeSource {
  readonly id: string;
  readonly label: string;
  readonly size: number;
  readonly proceduralProfile: SaplingTreeParameters["profile"];
  /** Optional source identity retained when the runtime asset id is namespaced for Population Tokens. */
  readonly proceduralGeometryIdentity?: string;
  /** Complete converted structure; bypasses stochastic skeleton and leaf placement. */
  readonly structureParameters?: ProceduralTreeStructureParameters;
}

export interface ProceduralTreeMeshData {
  readonly positions: readonly Point[];
  readonly normals: readonly Point[];
  readonly uvs: readonly (readonly [u: number, v: number])[];
  readonly uv1s?: readonly (readonly [x: number, y: number])[];
  /** Standard packed UV channel carrying the canonical leaf-frame index in X. */
  readonly uv2s?: readonly (readonly [leafFrameIndex: number, reserved: number])[];
  readonly colors?: readonly (readonly [r: number, g: number, b: number, a: number])[];
  readonly tangents?: readonly (readonly [x: number, y: number, z: number, w: number])[];
  readonly leafPivots?: readonly Point[];
  readonly leafUps?: readonly Point[];
  readonly leafShapePositions?: readonly Point[];
  readonly leafShapeNormals?: readonly Point[];
  readonly leafLocals?: readonly (readonly [x: number, y: number])[];
  /** Stable generator identities in card order; one ID owns each four-vertex leaf quad. */
  readonly leafCardIds?: readonly string[];
  /** Canonical leaf-frame texture row in vertex order; all four vertices of one card share one index. */
  readonly leafCardIndices?: readonly number[];
  /** Root of the primary-branch subtree used by per-instance GPU branch-length deformation. */
  readonly treeVariationRoots?: readonly Point[];
  /** Rooted subtree path distance and total span; packed into existing attribute W lanes. */
  readonly treeDissolvePaths?: readonly (readonly [distance: number, span: number])[];
  /** Tube centerline at each woody vertex, allowing length changes without changing branch radius. */
  readonly treeVariationCenters?: readonly Point[];
  /**
   * Packed per-vertex procedural data. X stores twice the branch influence plus stem progress; Y stores the numeric stem ID
   * plus the leaf visibility rank; Z stores the primary-subtree visibility rank. Integer/fractional lanes let the
   * GPU stem editor reuse the existing vertex stream without adding another attribute.
   */
  readonly treeVariationData?: readonly (readonly [branchInfluence: number, leafRank: number, branchRank: number])[];
  readonly indices: Uint16Array;
  readonly bounds: readonly [minimum: Point, maximum: Point];
  readonly triangleCount: number;
}

export interface ProceduralTreeLodData {
  readonly trunk: ProceduralTreeMeshData;
  readonly crown: ProceduralTreeMeshData;
  readonly branchCounts: readonly [trunks: number, branches: number, twigs: number];
  readonly branchTipContinuations: readonly [primary: number, twigs: number];
  readonly leafCount: number;
  /** Editable final state for every selected card, keyed by stable generator identity. */
  readonly leafCards: readonly ProceduralTreeLeafCardState[];
  /** Uniform linear card-size scale; lower-detail LODs may enlarge retained cards to preserve crown coverage. */
  readonly foliageScale: number;
  /** Sum of generated leaf-card areas before the shared alpha mask is applied. */
  readonly leafCardCoverageArea: number;
  readonly terminalStemCount: number;
  readonly leafClusterCount: number;
  readonly leafVariantCounts: readonly [number, number, number, number, number];
  readonly tipLeafCount: number;
  readonly maxTipLeafAttachmentError: number;
  readonly maxBranchAttachmentError: number;
  readonly leafBranchProgressQuantiles: readonly [number, number, number];
  readonly leavesPerBranchQuantiles: readonly [number, number, number];
  readonly terminalLeafRatio: number;
  readonly leafBearingBranchRatio: number;
  readonly trunkTriangleCount: number;
  readonly leafTriangleCount: number;
  readonly triangleCount: number;
  /** Tube tessellation selected after applying the LOD triangle ceiling. */
  readonly radialSegments: readonly [trunks: number, branches: number, twigs: number];
  readonly curveSegments: readonly [trunks: number, branches: number, twigs: number];
}

export interface ProceduralTreeGeometry {
  readonly algorithm: typeof PROCEDURAL_TREE_ALGORITHM;
  readonly density: typeof PROCEDURAL_TREE_LEAF_DENSITY;
  readonly sapling: SaplingTreeParameters;
  /** Aggregate skeleton diagnostics used by parameter inversion; never contains per-branch coordinates. */
  readonly structure: ProceduralTreeStructureMetrics;
  /** Lazily derived editing handles for the authoritative final branch curves. */
  readonly stemNodes: readonly ProceduralTreeStemNodeSnapshot[];
  /** Offline reconstruction lookup, evaluated only on explicit access; runtime renderers do not consume it. */
  readonly gpuStemRecords: readonly ProceduralTreeGpuStemRecord[];
  /** Actual generated height used to convert persisted percentage controls into GPU-local metres. */
  readonly generatedHeight: number;
  /** Immutable CPU authoring lookup; render vertices consume only the resolved GPU frame records. */
  readonly leafNodeContext: ProceduralTreeLeafNodeContext;
  /** Canonical GPU leaf frames derived from the final structure. */
  readonly leafGpuFrames: readonly ProceduralTreeLeafGpuFrame[];
  readonly leafNormalField?: PlantNormalField;
  /** Actual vertical height of the lowest primary-branch root divided by the generated trunk's vertical height. */
  readonly firstPrimaryBranchHeightRatio: number;
  readonly lods: ProceduralTreeLodTuple<ProceduralTreeLodData>;
}

export type ProceduralTreeLodTuple<T> = readonly [lod0: T, lod1: T, lod2: T, lod3: T];
export type ProceduralTreeSourceLodIndex = 0 | 1 | 2 | 3;

const ALL_PROCEDURAL_TREE_SOURCE_LOD_INDICES = Object.freeze([0, 1, 2, 3] as const);

export interface ProceduralTreeStructureLevelMetrics {
  readonly count: number;
  /** Support-range endpoints are topology constraints; interior quantiles alone can hide a load-bearing outlier. */
  readonly minimumRootHeightRatio: number;
  readonly maximumRootHeightRatio: number;
  readonly rootHeightRatioQuantiles: readonly [number, number, number, number, number];
  readonly pathLengthRatioQuantiles: readonly [number, number, number, number, number];
  readonly rootRadiusRatioQuantiles: readonly [number, number, number, number, number];
  readonly upAngleDegreesQuantiles: readonly [number, number, number, number, number];
  readonly endpointHeightRatioQuantiles: readonly [number, number, number, number, number];
  readonly endpointRadiusRatioQuantiles: readonly [number, number, number, number, number];
}

export interface ProceduralTreeStructureMetrics {
  readonly trunk: {
    readonly verticalHeight: number;
    readonly pathLength: number;
    readonly curveToHeightRatio: number;
    readonly baseRadius: number;
    readonly tipRadius: number;
  };
  readonly primaryBranches: ProceduralTreeStructureLevelMetrics;
  readonly secondaryBranches: ProceduralTreeStructureLevelMetrics;
}

export interface ProceduralTreeLodMeshes {
  readonly trunk: ModelMesh;
  readonly crown: ModelMesh;
  readonly branchCounts: readonly [trunks: number, branches: number, twigs: number];
  readonly leafCount: number;
  readonly leafCardIds: readonly string[];
  readonly leafCards: readonly ProceduralTreeLeafCardState[];
  /** Shared canonical frame table indexed by the crown's LEAF_CARD_INDEX attribute. */
  readonly leafGpuFrames: readonly ProceduralTreeLeafGpuFrame[];
  readonly leafNormalField?: PlantNormalField;
  readonly leafNodeContext: ProceduralTreeLeafNodeContext;
  /** Dimension scale plus the source-LOD lane selected from the shared GPU frame table. */
  readonly leafGpuFrameScale: readonly [
    widthScale: number,
    heightScale: number,
    additiveHalfExtent: number,
    sourceLodIndex: ProceduralTreeSourceLodIndex
  ];
  /** Shared runtime-generated primary/secondary skeleton used by the Node Editing surface. */
  readonly stemNodes: readonly ProceduralTreeStemNodeSnapshot[];
  readonly gpuStemRecords: readonly ProceduralTreeGpuStemRecord[];
  readonly generatedHeight: number;
  readonly foliageScale: number;
  readonly leafCardCoverageArea: number;
  readonly trunkTriangleCount: number;
  readonly leafTriangleCount: number;
  readonly triangleCount: number;
}

type SaplingVector = readonly [level0: number, level1: number, level2: number, level3: number];
/** Seven samples at parent progress 0, .1, .25, .5, .75, .9, and 1. */
export type ProceduralTreeParentCurve = readonly [number, number, number, number, number, number, number];
const PROCEDURAL_TREE_SPINE_PATH_HARMONICS = 4;
const PROCEDURAL_TREE_SPINE_PATH_COEFFICIENTS_PER_AXIS = 1 + PROCEDURAL_TREE_SPINE_PATH_HARMONICS * 2;
export type ProceduralTreeGenerationMode = "proportional" | "steps" | "interval" | "bifurcation";
export type ProceduralTreeSameLevelMode = "tip-continuation" | "distributed-branching";
export type SaplingLeafDistribution = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;
export type SaplingLeafPhyllotaxy = "opposite-decussate" | "alternate-spiral";
const PROCEDURAL_TREE_LENGTH_CURVE_MIN_PERCENT = 0.01;
const PROCEDURAL_TREE_LENGTH_CURVE_MAX_PERCENT = 200;

/** Final editable card state relative to a sampled supporting stem. */
export interface ProceduralTreeLeafCardState {
  readonly leafId: string;
  /** Stable `stem-v1/<level>/<ordinal>` identity of the supporting branch. */
  readonly stemId: string;
  readonly progressPercent: number;
  /** Offset from the sampled stem point in parent-local `[Right, Along, Out]` axes. */
  readonly positionOffsetPercentOfHeight: Point;
  /** Final card axes in tree-local coordinates; together they preserve all Up/Right/Out adjustments. */
  readonly right: Point;
  readonly up: Point;
  readonly widthPercentOfHeight: number;
  readonly heightPercentOfHeight: number;
}

/** Sparse Node Editing state applied after procedural placement and LOD selection. */
export type ProceduralTreeLeafNodeEdit = ProceduralTreeLeafCardState;

/** One canonical data-texture record expanded into four card vertices entirely by the GPU. */
export interface ProceduralTreeLeafGpuFrame {
  readonly leafId: string;
  readonly pivot: Point;
  readonly right: Point;
  readonly up: Point;
  /** Crown-smoothed lighting normal, independent from the physical card plane. */
  readonly normal: Point;
  /** Sign that maps cross(normal, right) onto the authored leaf-up hemisphere. */
  readonly tangentHandedness: 1 | -1;
  /** Unscaled botanical dimensions; per-LOD foliage scale remains renderer-owned. */
  readonly width: number;
  readonly height: number;
  /** LOD0 cosine-weighted ambient optical depth, retained as the default diagnostics channel. */
  readonly canopyOpticalDepth: number;
  /** LOD0 optical-depth field area-averaged into each lower-LOD proxy partition. */
  readonly canopyOpticalDepthByLod: ProceduralTreeLodTuple<number>;
  /** Per-LOD area-weighted first normal moment; direction is the mean and length is concentration. */
  readonly canopyNormalMomentByLod: ProceduralTreeLodTuple<Point>;
}

export interface ProceduralTreeLeafStemPath {
  readonly stemId: string;
  readonly points: readonly Point[];
}

/** Immutable mapping needed to compile persisted authoring records into GPU leaf-frame texels. */
export interface ProceduralTreeLeafNodeContext {
  readonly treeHeight: number;
  /** Generated root plane used as the origin height for the continuous crown-normal field. */
  readonly treeRootHeight: number;
  /** Generator-owned blend from outward card normals to the continuous crown-normal field. */
  readonly leafNormalCrownBlend: number;
  readonly stems: readonly ProceduralTreeLeafStemPath[];
  readonly baseCards: readonly ProceduralTreeLeafCardState[];
  readonly baseFrames: readonly ProceduralTreeLeafGpuFrame[];
  readonly leafCardIdsByLod: ProceduralTreeLodTuple<readonly string[]>;
}

/** Maximum control density accepted for one manually edited branch Path. */
export const PROCEDURAL_TREE_STEM_PATH_CONTROL_MAX = 64;
/** Upper safety bound for one sparse manual Node Editing layer. */
export const PROCEDURAL_TREE_STEM_NODE_EDIT_MAX = 4096;

/**
 * Complete editable replacement for one generated trunk, primary, or secondary stem.
 *
 * `directionInParentFrame` uses `[Right, Along, Out]` axes sampled from the parent Path at the attachment point.
 * `pathControlPointsPercentOfLength` uses `[Right, Forward, Out]` axes around that direction. A non-zero first
 * control is the editable graft/root offset from the sampled parent attachment; the Path is otherwise scale-free.
 * `radiusProfilePercentOfStart` owns one radius at every Path control, so no hidden taper curve is needed.
 */
export interface ProceduralTreeStemNodeEdit {
  readonly stemId: string;
  /** Parent Path for child stems; the single root trunk is parentless. */
  readonly parentStemId: string | null;
  readonly attachmentProgressPercent: number;
  readonly directionInParentFrame: Point;
  readonly lengthPercentOfHeight: number;
  readonly startRadiusPercentOfHeight: number;
  readonly endRadiusPercentOfStart: number;
  readonly pathControlPointsPercentOfLength: readonly Point[];
  readonly radiusProfilePercentOfStart: readonly number[];
  /** Polygon sides of this tube; topology changes trigger a local procedural remesh. */
  readonly radialSegments: number;
  /** Linear subdivisions for each adjacent Path-control pair. */
  readonly axialSubdivisions: readonly number[];
  /** Whether the final radius collapses to the Path tip. */
  readonly tipCap: boolean;
  /** Root translation used only by a parentless trunk. Omitted legacy records resolve to the generated root. */
  readonly rootPositionPercentOfHeight?: Point;
}

/** Transient generated branch data published for selection and exact round-trip editing. */
export interface ProceduralTreeStemNodeSnapshot extends ProceduralTreeStemNodeEdit {
  readonly level: 0 | 1 | 2;
  readonly points: readonly Point[];
  readonly radii: readonly number[];
}

/** One parent-linked procedural Path row consumed by the WebGL2 vertex-stage stem evaluator. */
export interface ProceduralTreeGpuStemRecord {
  readonly stemId: string;
  readonly numericId: number;
  readonly level: 0 | 1 | 2;
  readonly parentStemId: string | null;
  readonly attachmentProgressPercent: number;
  readonly directionInParentFrame: Point;
  readonly lengthPercentOfHeight: number;
  readonly startRadiusPercentOfHeight: number;
  readonly endRadiusPercentOfStart: number;
  readonly pathControlPointsPercentOfLength: readonly Point[];
  readonly radiusProfilePercentOfStart: readonly number[];
  readonly radialSegments: number;
  readonly axialSubdivisions: readonly number[];
  readonly tipCap: boolean;
  /** Used only by a parentless trunk Path; child roots are evaluated from their parent on GPU. */
  readonly rootPosition: Point;
}

const PROCEDURAL_TREE_STEM_ID_PATTERN = /^stem-v1\/(0|1|2)\/(0|[1-9]\d*)$/u;

/** Stable within one algorithm/recipe/seed topology; the algorithm binding rejects stale persisted handles. */
export function proceduralTreeStemId(level: 0 | 1 | 2, numericId: number): string {
  if (!Number.isSafeInteger(numericId) || numericId < 0) {
    throw new RangeError(`Procedural tree numeric stem ID is invalid: ${numericId}`);
  }
  return `stem-v1/${level}/${numericId}`;
}

/** Rejects incomplete topology records, invalid Paths, cycles later resolved by the generated skeleton, and NaNs. */
export function validateProceduralTreeStemNodeEdits(edits: readonly ProceduralTreeStemNodeEdit[]): void {
  if (!Array.isArray(edits)) throw new TypeError("Procedural tree stem-node edits must be an array");
  if (edits.length > PROCEDURAL_TREE_STEM_NODE_EDIT_MAX) {
    throw new RangeError(`Procedural tree stem-node edits cannot exceed ${PROCEDURAL_TREE_STEM_NODE_EDIT_MAX}`);
  }
  const stemIds = new Set<string>();
  edits.forEach((edit, index) => {
    if (!edit || typeof edit !== "object" || Array.isArray(edit)) {
      throw new TypeError(`Stem-node edit ${index} must be an object`);
    }
    const keys = Object.keys(edit).sort();
    const requiredKeys = [
      "attachmentProgressPercent",
      "axialSubdivisions",
      "directionInParentFrame",
      "endRadiusPercentOfStart",
      "lengthPercentOfHeight",
      "parentStemId",
      "pathControlPointsPercentOfLength",
      "radiusProfilePercentOfStart",
      "radialSegments",
      "startRadiusPercentOfHeight",
      "stemId",
      "tipCap"
    ];
    const allowedKeys = [...requiredKeys, "rootPositionPercentOfHeight"].sort();
    if (requiredKeys.some((key) => !keys.includes(key)) || keys.some((key) => !allowedKeys.includes(key))) {
      throw new TypeError(`Stem-node edit ${index} contains unsupported or missing fields`);
    }
    if (typeof edit.stemId !== "string" || !PROCEDURAL_TREE_STEM_ID_PATTERN.test(edit.stemId)) {
      throw new RangeError(`Stem-node edit ${index} has invalid stem ID ${String(edit.stemId)}`);
    }
    if (stemIds.has(edit.stemId)) throw new RangeError(`Stem-node edit ID is duplicated: ${edit.stemId}`);
    stemIds.add(edit.stemId);
    const level = Number(PROCEDURAL_TREE_STEM_ID_PATTERN.exec(edit.stemId)?.[1]);
    if (
      (level === 0 && edit.parentStemId !== null) ||
      (level !== 0 &&
        (typeof edit.parentStemId !== "string" || !PROCEDURAL_TREE_STEM_ID_PATTERN.test(edit.parentStemId)))
    ) {
      throw new RangeError(`Stem-node edit ${edit.stemId} has invalid parent stem ID ${String(edit.parentStemId)}`);
    }
    if (edit.parentStemId === edit.stemId) {
      throw new RangeError(`Stem-node edit parent graph contains a cycle at ${edit.stemId}`);
    }
    if (edit.rootPositionPercentOfHeight !== undefined) {
      validateStemNodeVector(`${edit.stemId} root position`, edit.rootPositionPercentOfHeight);
    }
    validateFiniteNumber(`Stem-node edit ${edit.stemId} attachment progress`, edit.attachmentProgressPercent);
    if (edit.attachmentProgressPercent < 0 || edit.attachmentProgressPercent > 100) {
      throw new RangeError(`Stem-node edit ${edit.stemId} attachment progress must be within 0..100%`);
    }
    validateStemNodeVector(`${edit.stemId} direction`, edit.directionInParentFrame);
    if (Math.abs(length(edit.directionInParentFrame) - 1) > 1e-4) {
      throw new RangeError(`Stem-node edit ${edit.stemId} direction must be normalized`);
    }
    validateFiniteNumber(`Stem-node edit ${edit.stemId} length`, edit.lengthPercentOfHeight);
    validateFiniteNumber(`Stem-node edit ${edit.stemId} start radius`, edit.startRadiusPercentOfHeight);
    validateFiniteNumber(`Stem-node edit ${edit.stemId} end radius`, edit.endRadiusPercentOfStart);
    if (edit.lengthPercentOfHeight <= 0 || edit.startRadiusPercentOfHeight <= 0 || edit.endRadiusPercentOfStart <= 0) {
      throw new RangeError(`Stem-node edit ${edit.stemId} length and radii must be positive`);
    }
    if (
      !Array.isArray(edit.pathControlPointsPercentOfLength) ||
      edit.pathControlPointsPercentOfLength.length < 2 ||
      edit.pathControlPointsPercentOfLength.length > PROCEDURAL_TREE_STEM_PATH_CONTROL_MAX
    ) {
      throw new RangeError(
        `Stem-node edit ${edit.stemId} Path requires 2..${PROCEDURAL_TREE_STEM_PATH_CONTROL_MAX} controls`
      );
    }
    edit.pathControlPointsPercentOfLength.forEach((point: Point, pointIndex: number) =>
      validateStemNodeVector(`${edit.stemId} Path control ${pointIndex}`, point)
    );
    if (
      !Array.isArray(edit.radiusProfilePercentOfStart) ||
      edit.radiusProfilePercentOfStart.length !== edit.pathControlPointsPercentOfLength.length
    ) {
      throw new RangeError(`Stem-node edit ${edit.stemId} radius profile must match its Path controls`);
    }
    edit.radiusProfilePercentOfStart.forEach((radius: number, pointIndex: number) => {
      validateFiniteNumber(`Stem-node edit ${edit.stemId} radius profile ${pointIndex}`, radius);
      if (radius <= 0) {
        throw new RangeError(`Stem-node edit ${edit.stemId} radius profile must remain positive`);
      }
    });
    if (!Number.isSafeInteger(edit.radialSegments) || edit.radialSegments < 3 || edit.radialSegments > 32) {
      throw new RangeError(`Stem-node edit ${edit.stemId} radial segments must be an integer within 3..32`);
    }
    if (
      !Array.isArray(edit.axialSubdivisions) ||
      edit.axialSubdivisions.length !== edit.pathControlPointsPercentOfLength.length - 1 ||
      edit.axialSubdivisions.some((count: number) => !Number.isSafeInteger(count) || count < 1 || count > 64)
    ) {
      throw new RangeError(
        `Stem-node edit ${edit.stemId} axial subdivisions must provide one integer within 1..64 per Path segment`
      );
    }
    if (typeof edit.tipCap !== "boolean") {
      throw new TypeError(`Stem-node edit ${edit.stemId} tip cap must be boolean`);
    }
    if (polylineLength(edit.pathControlPointsPercentOfLength) <= Number.EPSILON) {
      throw new RangeError(`Stem-node edit ${edit.stemId} Path cannot have zero length`);
    }
  });
}

function validateStemNodeVector(label: string, value: Point): void {
  if (!Array.isArray(value) || value.length !== 3) throw new RangeError(`${label} requires three axes`);
  value.forEach((component, axis) => validateFiniteNumber(`${label} axis ${axis}`, component));
}

const PROCEDURAL_TREE_LEAF_CARD_ID_PATTERN = /^leaf-v1\/(0|[1-9]\d*)\/(0|[1-9]\d*)$/u;

/** Stable identity derived only from the canonical supporting stem and its emission ordinal. */
export function proceduralTreeLeafCardId(stemId: number, emissionOrdinal: number): string {
  if (!Number.isSafeInteger(stemId) || stemId < 0) throw new RangeError(`Leaf stem ID is invalid: ${stemId}`);
  if (!Number.isSafeInteger(emissionOrdinal) || emissionOrdinal < 0) {
    throw new RangeError(`Leaf emission ordinal is invalid: ${emissionOrdinal}`);
  }
  return `leaf-v1/${stemId}/${emissionOrdinal}`;
}

/** Applies one SpeedTree-style local Up/Right/Out orientation adjustment to a persistable card state. */
export function rotateProceduralTreeLeafNodeOrientation(
  state: ProceduralTreeLeafNodeEdit,
  adjustment: "up" | "right" | "out",
  degrees: number
): ProceduralTreeLeafNodeEdit {
  validateProceduralTreeLeafNodeEdits([state]);
  validateFiniteNumber("Leaf-node orientation adjustment", degrees);
  let right = state.right;
  let up = state.up;
  const radians = degreesToRadians(degrees);
  switch (adjustment) {
    case "up":
      up = rotateAroundAxis(up, right, radians);
      break;
    case "right":
      right = rotateAroundAxis(right, up, radians);
      break;
    case "out": {
      const out = normalize(cross(right, up));
      right = rotateAroundAxis(right, out, radians);
      up = rotateAroundAxis(up, out, radians);
      break;
    }
    default:
      throw new RangeError(`Leaf-node orientation adjustment is unsupported: ${String(adjustment)}`);
  }
  right = normalize(right);
  up = normalize(reject(up, right));
  return {
    ...state,
    positionOffsetPercentOfHeight: [...state.positionOffsetPercentOfHeight],
    right,
    up
  };
}

/** Rejects ambiguous IDs, invalid editable fields, and dimensions that collapse or invert a card. */
export function validateProceduralTreeLeafNodeEdits(edits: readonly ProceduralTreeLeafNodeEdit[]): void {
  if (!Array.isArray(edits)) throw new TypeError("Procedural tree leaf-node edits must be an array");
  if (edits.length > PROCEDURAL_TREE_LEAF_COUNT_MAX) {
    throw new RangeError(`Procedural tree leaf-node edits cannot exceed ${PROCEDURAL_TREE_LEAF_COUNT_MAX}`);
  }
  const leafIds = new Set<string>();
  edits.forEach((edit, index) => {
    if (!edit || typeof edit !== "object" || Array.isArray(edit)) {
      throw new TypeError(`Leaf-node edit ${index} must be an object`);
    }
    const keys = Object.keys(edit).sort();
    const expectedKeys = [
      "heightPercentOfHeight",
      "leafId",
      "positionOffsetPercentOfHeight",
      "progressPercent",
      "right",
      "stemId",
      "up",
      "widthPercentOfHeight"
    ];
    if (keys.length !== expectedKeys.length || keys.some((key, keyIndex) => key !== expectedKeys[keyIndex])) {
      throw new TypeError(`Leaf-node edit ${index} contains unsupported or missing fields`);
    }
    if (typeof edit.leafId !== "string" || !PROCEDURAL_TREE_LEAF_CARD_ID_PATTERN.test(edit.leafId)) {
      throw new RangeError(`Leaf-node edit ${index} has invalid leaf ID ${String(edit.leafId)}`);
    }
    if (leafIds.has(edit.leafId)) throw new RangeError(`Leaf-node edit ID is duplicated: ${edit.leafId}`);
    leafIds.add(edit.leafId);
    if (typeof edit.stemId !== "string" || !PROCEDURAL_TREE_STEM_ID_PATTERN.test(edit.stemId)) {
      throw new RangeError(`Leaf-node edit ${edit.leafId} has invalid stem ID ${edit.stemId}`);
    }
    validateTuningNumber(`Leaf-node edit ${edit.leafId} progress`, edit.progressPercent, 0, 100);
    if (!Array.isArray(edit.positionOffsetPercentOfHeight) || edit.positionOffsetPercentOfHeight.length !== 3) {
      throw new RangeError(`Leaf-node edit ${edit.leafId} position requires three local axes`);
    }
    edit.positionOffsetPercentOfHeight.forEach((value: number, axis: number) =>
      validateFiniteNumber(`Leaf-node edit ${edit.leafId} position axis ${axis}`, value)
    );
    for (const [name, vector] of [
      ["Right", edit.right],
      ["Up", edit.up]
    ] as const) {
      if (!Array.isArray(vector) || vector.length !== 3) {
        throw new RangeError(`Leaf-node edit ${edit.leafId} ${name} requires three axes`);
      }
      vector.forEach((value: number, axis: number) =>
        validateFiniteNumber(`Leaf-node edit ${edit.leafId} ${name} axis ${axis}`, value)
      );
      if (Math.abs(Math.hypot(...vector) - 1) > 1e-4) {
        throw new RangeError(`Leaf-node edit ${edit.leafId} ${name} must be normalized`);
      }
    }
    if (Math.abs(dot(edit.right, edit.up)) > 1e-4) {
      throw new RangeError(`Leaf-node edit ${edit.leafId} Right and Up must be orthogonal`);
    }
    validatePositiveFiniteNumber(`Leaf-node edit ${edit.leafId} width percent of height`, edit.widthPercentOfHeight);
    validatePositiveFiniteNumber(`Leaf-node edit ${edit.leafId} height percent of height`, edit.heightPercentOfHeight);
  });
}

/** Scales an authored height profile when its artist-facing mean changes, retaining the species silhouette. */
export function rescaleProceduralTreeLengthCurve(
  curve: ProceduralTreeParentCurve | undefined,
  previousMeanPercent: number,
  nextMeanPercent: number
): ProceduralTreeParentCurve | undefined {
  if (!curve) return undefined;
  if (!Number.isFinite(previousMeanPercent) || previousMeanPercent <= 0) {
    throw new RangeError(`Previous tree-length mean must be positive; received ${previousMeanPercent}`);
  }
  if (!Number.isFinite(nextMeanPercent) || nextMeanPercent <= 0) {
    throw new RangeError(`Next tree-length mean must be positive; received ${nextMeanPercent}`);
  }
  const scale = nextMeanPercent / previousMeanPercent;
  const scaledValue = (value: number): number =>
    Math.min(
      PROCEDURAL_TREE_LENGTH_CURVE_MAX_PERCENT,
      Math.max(PROCEDURAL_TREE_LENGTH_CURVE_MIN_PERCENT, value * scale)
    );
  return [
    scaledValue(curve[0]),
    scaledValue(curve[1]),
    scaledValue(curve[2]),
    scaledValue(curve[3]),
    scaledValue(curve[4]),
    scaledValue(curve[5]),
    scaledValue(curve[6])
  ];
}

/** Final card dimensions baked into LEAF_LOCAL and consumed by the matching collision selection. */
export interface ProceduralTreeFoliageGeometryTuning {
  readonly widthScale: number;
  readonly heightScale: number;
  readonly additiveHalfExtent: number;
  /** Per-LOD card-size scales. Lower-detail recipes may enlarge retained cards to preserve projected crown coverage. */
  readonly lodScales?: ProceduralTreeLodTuple<number>;
}

/** Hard per-LOD ceilings. Tube tessellation is reduced without changing the botanical hierarchy or leaf-card count. */
export interface ProceduralTreeTriangleBudgetTuning {
  readonly maxTrianglesPerLod: ProceduralTreeLodTuple<number>;
  /** Preferred complexity targets. Hard limits remain authoritative when a target is unreachable. */
  readonly preferredTrianglesPerLod?: ProceduralTreeLodTuple<number>;
}

export const DEFAULT_PROCEDURAL_TREE_TRIANGLE_BUDGET: ProceduralTreeTriangleBudgetTuning = {
  maxTrianglesPerLod: [
    Number.MAX_SAFE_INTEGER,
    Number.MAX_SAFE_INTEGER,
    Number.MAX_SAFE_INTEGER,
    Number.MAX_SAFE_INTEGER
  ]
};

export function createProceduralTreeFoliageGeometryTuning(
  leafCard: TreeLeafCardTuning = DEFAULT_TREE_LEAF_CARD_TUNING,
  billboard: TreeBillboardTuning = DEFAULT_TREE_BILLBOARD_TUNING
): ProceduralTreeFoliageGeometryTuning {
  return {
    widthScale: leafCard.widthPercent / 100,
    heightScale: leafCard.lengthPercent / 100,
    additiveHalfExtent: (billboard.billboardSize / 100) * billboard.billboardsScale
  };
}

/** Artist-facing random-distribution controls mapped one-to-one onto the runtime Sapling hierarchy. */
export interface ProceduralTreeDistributionTuning {
  readonly geometrySeed: number;
  /** Optional independent generator streams. Omitted values are deterministically derived from geometrySeed. */
  readonly trunkSeed?: number;
  readonly branchSeed?: number;
  readonly twigSeed?: number;
  readonly leafSeed?: number;
  /** SpeedTree-style late-noise streams stay independent from topology/shape randomization. */
  readonly trunkLateNoiseSeed?: number;
  readonly branchLateNoiseSeed?: number;
  readonly twigLateNoiseSeed?: number;
  readonly trunkCount: number;
  /** Trunk centerline length relative to the requested whole-tree envelope height. */
  readonly trunkLengthPercentOfHeight?: number;
  readonly treeHeightVariationPercent: number;
  /** Ground-to-first-primary-branch height as a percentage of the generated trunk's vertical height. */
  readonly trunkClearHeightPercentOfHeight: number;
  /** Root-trunk radius as a percentage of the generated tree height. */
  readonly trunkRadiusPercentOfHeight: number;
  /** Final centerline-tip radius relative to the unflared trunk base radius. */
  readonly trunkTipRadiusPercentOfBase?: number;
  readonly trunkRootFlare?: number;
  readonly trunkRadiusVariationPercent: number;
  /** Longitudinal samples retained before LOD-specific adaptive simplification. */
  readonly trunkCurveSegments?: number;
  readonly trunkCurveVariationDegrees: number;
  /** SpeedTree-style post-shape coherent spine noise amplitude. */
  readonly trunkLateNoiseAmountDegrees?: number;
  /** Number of coherent direction changes along the finished trunk spine. */
  readonly trunkLateNoiseTurbulence?: number;
  /** Fraction of late-noise displacement smoothed back toward the shaped spine. */
  readonly trunkLateNoiseSmoothPercent?: number;
  /** Seven-knot SpeedTree-style profile scaling late noise from root to tip. */
  readonly trunkLateNoiseByHeightCurve?: ProceduralTreeParentCurve;
  /** Fixed four-harmonic SpeedTree-style Path deformation in two local spine axes. */
  readonly trunkPathHarmonicsPercentOfLength?: readonly number[];
  readonly trunkSplitAngleDegrees: number;
  readonly trunkSplitAngleVariationDegrees: number;
  readonly trunkRotateDegrees: number;
  readonly trunkRotateVariationDegrees: number;
  readonly branchCount: number;
  /** SpeedTree-style child placement rule used for primary branches. */
  readonly branchGenerationMode?: ProceduralTreeGenerationMode;
  /** Minimum parent-spine bend eligible for bifurcation placement. */
  readonly branchBifurcationThresholdDegrees?: number;
  /** Minimum axial separation between bifurcation nodes. */
  readonly branchBifurcationSpacingPercentOfParent?: number;
  /** Blend from ordinary radial orientation to the side opposite the parent bend. */
  readonly branchBifurcationBalancePercent?: number;
  /** Blend from the authored down angle toward a ground-parallel branch. */
  readonly branchBifurcationAlignPercent?: number;
  /** Blend bifurcation bend nodes toward the authored attachment distribution. */
  readonly branchBifurcationDistributionBlendPercent?: number;
  /** Inverse-CDF branch-root heights as percentages of whole-tree height. */
  readonly branchRootHeightDistributionCurve?: ProceduralTreeParentCurve;
  /** Blend parent-relative branch placement toward the global-height distribution. */
  readonly branchRootHeightDistributionBlendPercent?: number;
  /** Number of primary branches emitted at each crown level; one preserves spiral placement. */
  readonly branchWhorlSize?: number;
  /** Number of primary-branch crown levels. */
  readonly branchWhorlCount?: number;
  /** Exact finite node counts for successive primary-branch whorls. */
  readonly branchWhorlSizes?: readonly number[];
  /** Parent-relative centers for successive primary-branch whorls. */
  readonly branchWhorlAttachmentProgressPercent?: readonly number[];
  /** Vertical spread of a primary-branch whorl as a percentage of its parent path. */
  readonly branchWhorlSpreadPercentOfParent?: number;
  /** Primary-whorl phase in degrees, sampled by root height. */
  readonly branchWhorlPhaseByHeightCurve?: ProceduralTreeParentCurve;
  /** SpeedTree-style Extend Parent nodes as a percentage of the primary budget. */
  readonly branchExtensionPercent?: number;
  /** Whether same-order primary nodes continue at the tip or branch recursively along the parent axis. */
  readonly branchSameLevelMode?: ProceduralTreeSameLevelMode;
  /** Inverse-CDF attachment positions used only by recursive same-order primary branches. */
  readonly branchSameLevelAttachmentProgressCurve?: ProceduralTreeParentCurve;
  /** Blend recursive primary bifurcation nodes toward their own attachment distribution. */
  readonly branchSameLevelBifurcationDistributionBlendPercent?: number;
  /** Inverse-CDF root heights used only by recursive same-order primary branches. */
  readonly branchSameLevelRootHeightDistributionCurve?: ProceduralTreeParentCurve;
  /** Global-height blend used only by recursive same-order primary branches. */
  readonly branchSameLevelRootHeightDistributionBlendPercent?: number;
  /** Usable-arclength exponent used only when choosing parents for recursive primary branches. */
  readonly branchSameLevelParentLengthWeightPower?: number;
  /** Capacity floor used only when choosing parents for recursive primary branches. */
  readonly branchSameLevelParentLengthWeightFloorPercent?: number;
  /** Relative recursive-primary branching capacity sampled by parent root height. */
  readonly branchSameLevelParentCapacityByHeightCurve?: ProceduralTreeParentCurve;
  /** Guaranteed primary children per eligible trunk before capacity-weighted allocation. */
  readonly branchMinimumChildrenPerParent?: number;
  /** Exponent applied to usable parent arclength when distributing primary children. */
  readonly branchParentLengthWeightPower?: number;
  /** Minimum parent capacity retained before length weighting. */
  readonly branchParentLengthWeightFloorPercent?: number;
  /** Relative primary-child capacity sampled by parent root height. */
  readonly branchParentCapacityByHeightCurve?: ProceduralTreeParentCurve;
  /** Length of an Extend Parent node relative to the branch segment it continues. */
  readonly branchExtensionLengthPercentOfParent?: number;
  readonly branchExtensionLengthVariationPercent?: number;
  /** Inverse-CDF parent positions, expressed as percentages at the seven parent-curve knots. */
  readonly branchAttachmentProgressCurve?: ProceduralTreeParentCurve;
  /** Absolute branch path length as a percentage of whole-tree height, sampled by root height. */
  readonly branchLengthByHeightCurve?: ProceduralTreeParentCurve;
  /** Residual branch-length scale by ordered child rank after applying the height trend. */
  readonly branchLengthScaleByDistributionCurve?: ProceduralTreeParentCurve;
  /** Branch down angle in degrees, sampled by root height. */
  readonly branchDownAngleByHeightCurve?: ProceduralTreeParentCurve;
  /** Residual branch down-angle offset in degrees by ordered child rank. */
  readonly branchDownAngleOffsetByDistributionCurve?: ProceduralTreeParentCurve;
  /** Mean primary-branch length as a percentage of its parent stem length. */
  readonly branchLengthPercentOfParent: number;
  /** Hard primary-branch length ceiling as a percentage of generated tree height. */
  readonly branchMaximumLengthPercentOfHeight: number;
  readonly branchLengthVariationPercent: number;
  readonly branchCurveSegments?: number;
  readonly branchRadiusScalePercent?: number;
  /** SpeedTree-style absolute child radius as a percentage of tree height, sampled by root height. */
  readonly branchRadiusByHeightCurve?: ProceduralTreeParentCurve;
  /** Residual branch-root radius scale by ordered child rank after applying the height trend. */
  readonly branchRadiusScaleByDistributionCurve?: ProceduralTreeParentCurve;
  /** Residual branch bend/noise amplitude by ordered child rank. */
  readonly branchShapeVariationScaleByDistributionCurve?: ProceduralTreeParentCurve;
  /** SpeedTree radius-profile endpoint as a percentage of the branch root radius. */
  readonly branchTipRadiusPercentOfStart?: number;
  /** Radius retained at the end of a primary stem that receives an Extend Parent node. */
  readonly branchExtensionRadiusRetentionPercent?: number;
  /** Maximum child-root radius relative to the sampled parent radius; values above 100% model a junction collar. */
  readonly branchParentRadiusLimitPercent?: number;
  /** Deterministic signed bend accumulated along a primary branch. */
  readonly branchCurveDegrees?: number;
  readonly branchCurveBackDegrees?: number;
  readonly branchCurveVariationDegrees: number;
  readonly branchLateNoiseAmountDegrees?: number;
  readonly branchLateNoiseTurbulence?: number;
  readonly branchLateNoiseSmoothPercent?: number;
  readonly branchLateNoiseByHeightCurve?: ProceduralTreeParentCurve;
  readonly branchPathHarmonicsPercentOfLength?: readonly number[];
  /** Signed vertical attraction applied along each primary branch. Positive values bend tips upward. */
  readonly branchAttractionUp: number;
  /** Radial attraction toward the outside of the crown. */
  readonly branchAttractionOut?: number;
  readonly branchAttractionOutByDistributionCurve?: ProceduralTreeParentCurve;
  readonly branchRotateDegrees: number;
  readonly branchRotateVariationDegrees: number;
  /** Optional measured primary-branch azimuth modes and normalized selection weights. */
  readonly branchAzimuthModesDegrees?: ProceduralTreeModeTuple;
  readonly branchAzimuthModeWeights?: ProceduralTreeModeTuple;
  readonly branchDownAngleDegrees: number;
  readonly branchDownAngleVariationDegrees: number;
  readonly twigCount: number;
  readonly twigGenerationMode?: ProceduralTreeGenerationMode;
  readonly twigBifurcationThresholdDegrees?: number;
  readonly twigBifurcationSpacingPercentOfParent?: number;
  readonly twigBifurcationBalancePercent?: number;
  readonly twigBifurcationAlignPercent?: number;
  /** Blend twig bifurcation bend nodes toward the authored attachment distribution. */
  readonly twigBifurcationDistributionBlendPercent?: number;
  /** Inverse-CDF twig-root heights as percentages of whole-tree height. */
  readonly twigRootHeightDistributionCurve?: ProceduralTreeParentCurve;
  /** Blend parent-relative twig placement toward the global-height distribution. */
  readonly twigRootHeightDistributionBlendPercent?: number;
  /** SpeedTree-style Extend Parent nodes as a percentage of the twig budget. */
  readonly twigExtensionPercent?: number;
  /** Whether same-order twig nodes continue at the tip or branch recursively along the parent axis. */
  readonly twigSameLevelMode?: ProceduralTreeSameLevelMode;
  /** Inverse-CDF attachment positions used only by recursive same-order twigs. */
  readonly twigSameLevelAttachmentProgressCurve?: ProceduralTreeParentCurve;
  /** Blend recursive twig bifurcation nodes toward their own attachment distribution. */
  readonly twigSameLevelBifurcationDistributionBlendPercent?: number;
  /** Inverse-CDF root heights used only by recursive same-order twigs. */
  readonly twigSameLevelRootHeightDistributionCurve?: ProceduralTreeParentCurve;
  /** Global-height blend used only by recursive same-order twigs. */
  readonly twigSameLevelRootHeightDistributionBlendPercent?: number;
  /** Usable-arclength exponent used only when choosing parents for recursive twigs. */
  readonly twigSameLevelParentLengthWeightPower?: number;
  /** Capacity floor used only when choosing parents for recursive twigs. */
  readonly twigSameLevelParentLengthWeightFloorPercent?: number;
  /** Relative recursive-twig branching capacity sampled by parent root height. */
  readonly twigSameLevelParentCapacityByHeightCurve?: ProceduralTreeParentCurve;
  /** Guaranteed direct twigs per eligible primary branch before capacity-weighted allocation. */
  readonly twigMinimumChildrenPerParent?: number;
  /** Exponent applied to usable parent arclength when distributing direct twigs. */
  readonly twigParentLengthWeightPower?: number;
  /** Minimum parent capacity retained before length weighting. */
  readonly twigParentLengthWeightFloorPercent?: number;
  /** Relative direct-twig capacity sampled by parent root height. */
  readonly twigParentCapacityByHeightCurve?: ProceduralTreeParentCurve;
  /** Length of an Extend Parent node relative to the twig segment it continues. */
  readonly twigExtensionLengthPercentOfParent?: number;
  readonly twigExtensionLengthVariationPercent?: number;
  readonly twigAttachmentProgressCurve?: ProceduralTreeParentCurve;
  readonly twigLengthByHeightCurve?: ProceduralTreeParentCurve;
  readonly twigLengthScaleByDistributionCurve?: ProceduralTreeParentCurve;
  readonly twigDownAngleByHeightCurve?: ProceduralTreeParentCurve;
  readonly twigDownAngleOffsetByDistributionCurve?: ProceduralTreeParentCurve;
  /** Mean twig length as a percentage of its parent branch length. */
  readonly twigLengthPercentOfParent: number;
  /** Hard twig length ceiling as a percentage of generated tree height. */
  readonly twigMaximumLengthPercentOfHeight: number;
  readonly twigLengthVariationPercent: number;
  readonly twigCurveSegments?: number;
  readonly twigRadiusScalePercent?: number;
  readonly twigRadiusByHeightCurve?: ProceduralTreeParentCurve;
  readonly twigRadiusScaleByDistributionCurve?: ProceduralTreeParentCurve;
  readonly twigShapeVariationScaleByDistributionCurve?: ProceduralTreeParentCurve;
  readonly twigTipRadiusPercentOfStart?: number;
  /** Radius retained at the end of a twig that receives another Extend Parent node. */
  readonly twigExtensionRadiusRetentionPercent?: number;
  readonly twigParentRadiusLimitPercent?: number;
  /** Deterministic signed bend accumulated along a twig. */
  readonly twigCurveDegrees?: number;
  readonly twigCurveBackDegrees?: number;
  readonly twigCurveVariationDegrees: number;
  readonly twigLateNoiseAmountDegrees?: number;
  readonly twigLateNoiseTurbulence?: number;
  readonly twigLateNoiseSmoothPercent?: number;
  readonly twigLateNoiseByHeightCurve?: ProceduralTreeParentCurve;
  readonly twigPathHarmonicsPercentOfLength?: readonly number[];
  /** Signed vertical attraction applied along each twig. Positive values bend tips upward. */
  readonly twigAttractionUp: number;
  readonly twigAttractionOut?: number;
  readonly twigAttractionOutByDistributionCurve?: ProceduralTreeParentCurve;
  /** Furthest parent-relative point at which twigs may originate. */
  readonly twigAttachmentEndPercentOfParent: number;
  readonly twigRotateDegrees: number;
  readonly twigRotateVariationDegrees: number;
  /** Child azimuth in the parent-local frame, sampled by root height. */
  readonly twigAzimuthByHeightCurve?: ProceduralTreeParentCurve;
  /** Weighted parent-local phyllotaxy modes for multimodal child orientation. */
  readonly twigAzimuthModesDegrees?: readonly [number, number, number];
  readonly twigAzimuthModeWeights?: readonly [number, number, number];
  readonly twigDownAngleDegrees: number;
  readonly twigDownAngleVariationDegrees: number;
  readonly leafDistribution: SaplingLeafDistribution;
  /** SpeedTree-style per-generator Count/First/terminal controls in canonical stem order. */
  readonly leafCountByStem?: readonly number[];
  readonly leafFirstProgressPercentByStem?: readonly number[];
  readonly leafTerminalFractionPercentByStem?: readonly number[];
  readonly leafProgressExponentByStem?: readonly number[];
  /** Relative leaf emission density for trunk, primary branches, and twigs. */
  readonly leafDensityScaleByLevel?: readonly [trunk: number, branches: number, twigs: number];
  /** Blend from equal per-stem frequency to length-proportional frequency. */
  readonly leafLengthInfluencePercent?: number;
  /** Blend from uniform per-stem emission to the selected crown-shape frequency. */
  readonly leafDistributionInfluencePercent?: number;
  /** Share of cards emitted at the terminal node of each leaf-bearing stem. */
  readonly leafTerminalFractionPercent?: number;
  /** Terminal-card share independently resolved for trunk, primary branches, and twigs. */
  readonly leafTerminalFractionPercentByLevel?: readonly [trunk: number, branches: number, twigs: number];
  /** Power-law bias of non-terminal cards along the exposed stem interval. */
  readonly leafProgressExponent?: number;
  readonly leafProgressExponentByLevel?: readonly [trunk: number, branches: number, twigs: number];
  /** Relative leaf candidate density sampled by whole-tree height. */
  readonly leafDensityByHeightCurve?: ProceduralTreeParentCurve;
  /** Higher-resolution SpeedTree-style crown density profile sampled over normalized whole-tree height. */
  readonly leafDensityByHeightProfile?: readonly number[];
  readonly leafDownAngleDegrees: number;
  readonly leafDownAngleVariationDegrees: number;
  readonly leafRotateDegrees: number;
  readonly leafRotateVariationDegrees: number;
  /** Blends terminal-cluster sampling toward maximum center separation without moving leaves off their stems. */
  readonly leafSpacingPercent: number;
  /** Base leaf-card height as a percentage of whole-tree height. */
  readonly leafScalePercentOfHeight?: number;
  /** Leaf-card width divided by height. */
  readonly leafAspectRatio?: number;
  /** Linear size change from cluster root to tip. Positive values shrink toward the tip. */
  readonly leafScaleTaperPercent?: number;
  readonly leafScaleVariationPercent: number;
  /** Blends authored species leaf-size variants; zero produces uniform cards. */
  readonly leafVariantSizeBlendPercent?: number;
  /** Moves the leaf-card root away from its stem along the petiole direction. */
  readonly leafAnchorOffsetPercentOfHeight?: number;
  readonly leafAnchorOffsetVariationPercent?: number;
  /** SpeedTree-style First boundary along every leaf-bearing terminal stem. */
  readonly leafStartProgressPercentOfStem?: number;
  /** SpeedTree-style First boundary independently resolved for trunk, primary branches, and twigs. */
  readonly leafStartProgressPercentByLevel?: readonly [trunk: number, branches: number, twigs: number];
  /** Symmetric per-stem variation of the First boundary, independently resolved by stem level. */
  readonly leafStartProgressVariationPercentByLevel?: readonly [trunk: number, branches: number, twigs: number];
  /** Lower First boundary for a skewed per-stem emission range. */
  readonly leafStartProgressMinimumPercentByLevel?: readonly [trunk: number, branches: number, twigs: number];
  /** Upper First boundary for a skewed per-stem emission range. */
  readonly leafStartProgressMaximumPercentByLevel?: readonly [trunk: number, branches: number, twigs: number];
  /** Power-law shape of the per-stem First range; values below one concentrate near Last. */
  readonly leafStartProgressDistributionExponentByLevel?: readonly [trunk: number, branches: number, twigs: number];
  /** Leaf-card roll around its petiole direction. */
  readonly leafRollDegrees?: number;
  /** Blends the card-plane normal toward the procedural crown-outward direction. */
  readonly leafNormalCrownBlendPercent?: number;
  /** Periodic and elliptical crown-envelope controls applied to branch length. */
  readonly crownLobeCount?: number;
  readonly crownLobeDepthPercent?: number;
  readonly crownLobePhaseDegrees?: number;
  readonly crownAsymmetryXPercent?: number;
  readonly crownAsymmetryZPercent?: number;
  /** Pruning envelope ceiling shared by all woody generators. */
  readonly crownMaximumHeightPercentOfHeight?: number;
}

/** Runtime subset of Blender Sapling's parameter model, expressed in the same units and level order. */
export interface SaplingTreeParameters {
  readonly profile: "small-maple" | "white-birch";
  readonly levels: 3;
  readonly shape: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
  readonly shapeSecondary: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;
  readonly customShape: SaplingVector;
  readonly baseSize: number;
  readonly baseSizeScale: number;
  /** Game-facing clear-trunk constraint applied to level-one attachment points. */
  readonly trunkClearHeightRatio: number;
  readonly length: SaplingVector;
  /** Per-level hard length ceiling expressed as a generated-tree-height ratio. */
  readonly maximumLengthRatio: SaplingVector;
  readonly lengthVariation: SaplingVector;
  readonly branches: SaplingVector;
  readonly curveResolution: SaplingVector;
  readonly curve: SaplingVector;
  readonly curveVariation: SaplingVector;
  readonly curveBack: SaplingVector;
  readonly lateNoiseAmount: SaplingVector;
  readonly lateNoiseTurbulence: SaplingVector;
  readonly lateNoiseSmooth: SaplingVector;
  readonly lateNoiseProfile: readonly [
    ProceduralTreeParentCurve | undefined,
    ProceduralTreeParentCurve | undefined,
    ProceduralTreeParentCurve | undefined,
    ProceduralTreeParentCurve | undefined
  ];
  readonly spinePathHarmonics: readonly [
    readonly number[] | undefined,
    readonly number[] | undefined,
    readonly number[] | undefined,
    readonly number[] | undefined
  ];
  readonly downAngle: SaplingVector;
  readonly downAngleVariation: SaplingVector;
  readonly rotate: SaplingVector;
  readonly rotateVariation: SaplingVector;
  readonly attractUp: SaplingVector;
  readonly attractOut: SaplingVector;
  readonly baseSplits: number;
  readonly segmentSplits: SaplingVector;
  readonly splitAngle: SaplingVector;
  readonly splitAngleVariation: SaplingVector;
  readonly splitHeight: number;
  readonly ratio: number;
  readonly ratioPower: number;
  readonly rootFlare: number;
  readonly taper: SaplingVector;
  readonly scaleVariation: number;
  readonly scaleVariation0: number;
  /** Game-specific cap; Sapling's branch values still determine relative placement and allocation. */
  readonly runtimeBranchBudget: readonly [trunks: number, branches: number, twigs: number];
  /** Blender Sapling's maximum number of leaves generated by each terminal stem. */
  readonly leaves: number;
  readonly leafPhyllotaxy: SaplingLeafPhyllotaxy;
  readonly leafDistribution: SaplingLeafDistribution;
  readonly leafCountByStem?: readonly number[];
  readonly leafFirstProgressByStem?: readonly number[];
  readonly leafTerminalFractionByStem?: readonly number[];
  readonly leafProgressExponentByStem?: readonly number[];
  readonly leafDownAngle: number;
  readonly leafDownAngleVariation: number;
  readonly leafRotate: number;
  readonly leafRotateVariation: number;
  readonly leafScale: number;
  readonly leafScaleX: number;
  readonly leafScaleTaper: number;
  readonly leafScaleVariation: number;
  readonly horizontalLeaves: boolean;
  readonly leafAngle: number;
  /** Fraction of final card clearance enforced during the collision-aware cluster sample. */
  readonly leafSpacing: number;
  /** Geometry-roll influence of the cluster's crown-outward direction. */
  readonly leafOutwardOrientation: number;
  /** Shading-normal influence of the cluster's crown-outward direction. */
  readonly parentPuffiness: number;
  /** Symmetric per-card albedo variation around the authored leaf color. */
  readonly leafToneVariation: number;
  readonly leafVariants: readonly [LeafVariant, LeafVariant, LeafVariant, LeafVariant, LeafVariant];
  /** Furthest parent-relative point at which level-two stems may originate. */
  readonly twigAttachmentEndRatio: number;
  /** SpeedTree-style generator controls resolved from the finite inversion recipe. */
  readonly trunkLengthRatio?: number;
  readonly trunkTipRadiusRatio?: number;
  readonly branchWhorlSize?: number;
  readonly branchWhorlCount?: number;
  readonly branchWhorlSizes?: readonly number[];
  readonly branchWhorlAttachmentProgress?: readonly number[];
  readonly branchWhorlSpread?: number;
  readonly branchWhorlPhaseByHeightCurve?: ProceduralTreeParentCurve;
  readonly branchGenerationMode?: ProceduralTreeGenerationMode;
  readonly twigGenerationMode?: ProceduralTreeGenerationMode;
  readonly branchBifurcationThreshold?: number;
  readonly branchBifurcationSpacing?: number;
  readonly branchBifurcationBalance?: number;
  readonly branchBifurcationAlign?: number;
  readonly branchBifurcationDistributionBlend?: number;
  readonly branchSameLevelBifurcationDistributionBlend?: number;
  readonly branchRootHeightDistributionCurve?: ProceduralTreeParentCurve;
  readonly branchRootHeightDistributionBlend?: number;
  readonly branchSameLevelRootHeightDistributionCurve?: ProceduralTreeParentCurve;
  readonly branchSameLevelRootHeightDistributionBlend?: number;
  readonly twigBifurcationThreshold?: number;
  readonly twigBifurcationSpacing?: number;
  readonly twigBifurcationBalance?: number;
  readonly twigBifurcationAlign?: number;
  readonly twigBifurcationDistributionBlend?: number;
  readonly twigSameLevelBifurcationDistributionBlend?: number;
  readonly twigRootHeightDistributionCurve?: ProceduralTreeParentCurve;
  readonly twigRootHeightDistributionBlend?: number;
  readonly twigSameLevelRootHeightDistributionCurve?: ProceduralTreeParentCurve;
  readonly twigSameLevelRootHeightDistributionBlend?: number;
  readonly branchAzimuthModesDegrees?: ProceduralTreeModeTuple;
  readonly branchAzimuthModeWeights?: ProceduralTreeModeTuple;
  readonly branchExtensionFraction?: number;
  readonly twigExtensionFraction?: number;
  readonly branchSameLevelMode?: ProceduralTreeSameLevelMode;
  readonly twigSameLevelMode?: ProceduralTreeSameLevelMode;
  readonly minimumChildrenPerParent?: SaplingVector;
  readonly parentLengthWeightPower?: SaplingVector;
  readonly parentLengthWeightFloor?: SaplingVector;
  readonly sameLevelParentLengthWeightPower?: SaplingVector;
  readonly sameLevelParentLengthWeightFloor?: SaplingVector;
  readonly branchParentCapacityByHeightCurve?: ProceduralTreeParentCurve;
  readonly twigParentCapacityByHeightCurve?: ProceduralTreeParentCurve;
  readonly branchSameLevelParentCapacityByHeightCurve?: ProceduralTreeParentCurve;
  readonly twigSameLevelParentCapacityByHeightCurve?: ProceduralTreeParentCurve;
  readonly extensionLengthRatio?: SaplingVector;
  readonly extensionLengthVariation?: SaplingVector;
  readonly branchAttachmentProgressCurve?: ProceduralTreeParentCurve;
  readonly twigAttachmentProgressCurve?: ProceduralTreeParentCurve;
  readonly branchSameLevelAttachmentProgressCurve?: ProceduralTreeParentCurve;
  readonly twigSameLevelAttachmentProgressCurve?: ProceduralTreeParentCurve;
  readonly branchLengthByHeightCurve?: ProceduralTreeParentCurve;
  readonly branchLengthScaleByDistributionCurve?: ProceduralTreeParentCurve;
  readonly twigLengthByHeightCurve?: ProceduralTreeParentCurve;
  readonly twigLengthScaleByDistributionCurve?: ProceduralTreeParentCurve;
  readonly branchDownAngleByHeightCurve?: ProceduralTreeParentCurve;
  readonly branchDownAngleOffsetByDistributionCurve?: ProceduralTreeParentCurve;
  readonly twigDownAngleByHeightCurve?: ProceduralTreeParentCurve;
  readonly twigDownAngleOffsetByDistributionCurve?: ProceduralTreeParentCurve;
  readonly branchShapeVariationScaleByDistributionCurve?: ProceduralTreeParentCurve;
  readonly twigShapeVariationScaleByDistributionCurve?: ProceduralTreeParentCurve;
  readonly branchAttractionOutByDistributionCurve?: ProceduralTreeParentCurve;
  readonly twigAttractionOutByDistributionCurve?: ProceduralTreeParentCurve;
  readonly twigAzimuthByHeightCurve?: ProceduralTreeParentCurve;
  readonly twigAzimuthModesDegrees?: readonly [number, number, number];
  readonly twigAzimuthModeWeights?: readonly [number, number, number];
  readonly leafDensityByHeightCurve?: ProceduralTreeParentCurve;
  readonly leafDensityByHeightProfile?: readonly number[];
  readonly leafDensityScaleByLevel?: readonly [trunk: number, branches: number, twigs: number];
  readonly leafLengthInfluence?: number;
  readonly leafDistributionInfluence?: number;
  readonly leafTerminalFraction?: number;
  readonly leafTerminalFractionByLevel?: readonly [trunk: number, branches: number, twigs: number];
  readonly leafProgressExponent?: number;
  readonly leafProgressExponentByLevel?: readonly [trunk: number, branches: number, twigs: number];
  readonly childRadiusScale?: SaplingVector;
  readonly childParentRadiusLimit?: SaplingVector;
  readonly childRadiusByHeightCurve?: readonly [
    undefined,
    ProceduralTreeParentCurve | undefined,
    ProceduralTreeParentCurve | undefined,
    undefined
  ];
  readonly childRadiusScaleByDistributionCurve?: readonly [
    undefined,
    ProceduralTreeParentCurve | undefined,
    ProceduralTreeParentCurve | undefined,
    undefined
  ];
  readonly extensionRadiusRetention?: SaplingVector;
  readonly childTipRadiusRatio?: SaplingVector;
  readonly leafVariantSizeBlend?: number;
  readonly leafAnchorOffsetRatio?: number;
  readonly leafAnchorOffsetVariation?: number;
  readonly leafStartProgress?: number;
  readonly leafStartProgressByLevel?: readonly [trunk: number, branches: number, twigs: number];
  readonly leafStartProgressVariationByLevel?: readonly [trunk: number, branches: number, twigs: number];
  readonly leafStartProgressMinimumByLevel?: readonly [trunk: number, branches: number, twigs: number];
  readonly leafStartProgressMaximumByLevel?: readonly [trunk: number, branches: number, twigs: number];
  readonly leafStartProgressDistributionExponentByLevel?: readonly [trunk: number, branches: number, twigs: number];
  readonly crownLobeCount?: number;
  readonly crownLobeDepth?: number;
  readonly crownLobePhase?: number;
  readonly crownAsymmetryX?: number;
  readonly crownAsymmetryZ?: number;
  readonly crownMaximumHeightRatio?: number;
}

interface BranchPath {
  readonly level: 0 | 1 | 2;
  readonly id: number;
  readonly stableId: string;
  readonly parentId: number | null;
  /** Exact retained stem whose tube supports this stem's root; differs from parentId for same-level extensions. */
  readonly supportStemId: number | null;
  readonly length: number;
  readonly attachmentProgress: number;
  readonly points: readonly Point[];
  readonly radii: readonly number[];
  readonly radialSegments?: number;
  readonly axialSubdivisions?: readonly number[];
  readonly tipCap?: boolean;
}

interface SaplingStem extends BranchPath {
  readonly startRadius: number;
  readonly endRadius: number;
  readonly azimuth: number;
}

interface LeafVariant {
  readonly weight: number;
  readonly widthScale: number;
  readonly heightScale: number;
  readonly fold: number;
  readonly curl: number;
  readonly droop: number;
  readonly toneOffset: number;
}

interface LeafCluster {
  readonly id: number;
  readonly stemId: number;
  readonly center: Point;
  readonly outward: Point;
  readonly leaves: readonly LeafAnchor[];
}

interface LeafAnchor {
  readonly surfaceIdsByLod?: ProceduralTreeLodTuple<string>;
  readonly id: string;
  readonly clusterId: number;
  readonly stemId: number;
  readonly progress: number;
  readonly isTip: boolean;
  /** Sapling child point at the root edge of the leaf, not the card center. */
  readonly attachment: Point;
  /** Exact botanical attachment on the supporting stem, before an optional petiole offset. */
  readonly stemAttachment: Point;
  readonly clusterCenter: Point;
  readonly clusterOutward: Point;
  readonly right: Point;
  readonly up: Point;
  readonly normal: Point;
  readonly tangentHandedness: 1 | -1;
  readonly width: number;
  readonly height: number;
  readonly collisionCenter: Point;
  readonly collisionHalfWidth: number;
  readonly collisionHalfHeight: number;
  /** Relative selection density evaluated at the final card center height. */
  readonly densityWeight: number;
  readonly variantIndex: 0 | 1 | 2 | 3 | 4;
  readonly variant: LeafVariant;
  readonly tone: number;
}

/** Final leaf pose and appearance; normals, envelopes and vertex data are derived by the builder. */
export type ProceduralTreeStructureLeaf = Pick<
  LeafAnchor,
  | "id"
  | "clusterId"
  | "stemId"
  | "progress"
  | "attachment"
  | "stemAttachment"
  | "clusterOutward"
  | "right"
  | "up"
  | "width"
  | "height"
  | "variantIndex"
  | "tone"
> & { readonly isTip?: boolean; readonly surfaceIdsByLod?: ProceduralTreeLodTuple<string> };

/** Final plant structure in tree-local metres at referenceSize. Contains no mesh or GPU buffers. */
export interface ProceduralTreeStructureParameters {
  readonly version: 1;
  readonly referenceSize: number;
  readonly height: number;
  readonly verticalHeight: number;
  readonly stems: readonly SaplingStem[];
  readonly selectionStemIds: readonly number[];
  /** Stable full-detail attachment graph, independent of each mesh LOD selection. */
  readonly canonicalStemIds?: readonly number[];
  readonly leafBearingStemIds: readonly number[];
  readonly leafClusterCount: number;
  readonly leaves: readonly ProceduralTreeStructureLeaf[];
  /** Authored nested LOD membership, independent of the discarded stochastic layout. */
  readonly leafIdsByLod: ProceduralTreeLodTuple<readonly string[]>;
  /** Requested counts may exceed collision-pruned membership. */
  readonly leafCountTargets?: ProceduralTreeLodTuple<number>;
  /** Editor readback only; the builder consumes the final fold angles in leafSurfaces. */
  readonly leafFoldAdjustmentDegrees?: number;
  /** Plant-local authored shading field at referenceSize; independent of folded geometry. */
  readonly leafNormalField?: PlantNormalField;
  /** Shared parametric surfaces. Absent leaf bindings use the canonical rectangular surface. */
  readonly leafSurfaces?: Readonly<
    Record<
      string,
      {
        readonly shape: Extract<PlantShape, { kind: "surface" }>;
        readonly resolution: PlantGeometryResolution;
      }
    >
  >;
}

/** Changes the final surface curves, keeping fitted differences between sections and sides. */
export function editProceduralTreeLeafFold(
  parameters: ProceduralTreeStructureParameters,
  adjustmentDegrees: number
): ProceduralTreeStructureParameters {
  validateProceduralTreeStructureParameters(parameters);
  if (!Number.isFinite(adjustmentDegrees) || Math.abs(adjustmentDegrees) > 90)
    throw new RangeError("Leaf fold adjustment must be within -90..90 degrees");
  const previous = parameters.leafFoldAdjustmentDegrees ?? 0;
  if (adjustmentDegrees === previous || parameters.leaves.length === 0) return parameters;
  const previousRadians = (previous * Math.PI) / 180;
  const nextRadians = (adjustmentDegrees * Math.PI) / 180;
  const surfaces = { ...parameters.leafSurfaces };
  let defaultId = "rectangle";
  while (Object.prototype.hasOwnProperty.call(surfaces, defaultId)) defaultId += "-default";
  const needsDefault = parameters.leaves.some((leaf) => !leaf.surfaceIdsByLod);
  if (needsDefault)
    surfaces[defaultId] = {
      shape: plantRectangleShape(2, 1),
      resolution: { subdivisionsPerSpan: 1, widthSegments: 1, radialSegments: 3 }
    };
  const leaves = parameters.leaves.map((leaf) =>
    leaf.surfaceIdsByLod
      ? leaf
      : {
          ...leaf,
          surfaceIdsByLod: [defaultId, defaultId, defaultId, defaultId] as const
        }
  );
  const leafSurfaces = Object.fromEntries(
    Object.entries(surfaces).map(([id, surface]) => [
      id,
      {
        ...surface,
        shape: {
          ...surface.shape,
          sections: surface.shape.sections.map((section) => ({
            ...section,
            leftFold: section.leftFold - previousRadians + nextRadians,
            rightFold: section.rightFold - previousRadians + nextRadians
          }))
        }
      }
    ])
  );
  return freezeImmutableData({ ...parameters, leaves, leafSurfaces, leafFoldAdjustmentDegrees: adjustmentDegrees });
}

/** Counts the actual surface topology owned by each authored LOD, before branch tessellation. */
export function treeStructureLeafTriangleCounts(
  parameters: ProceduralTreeStructureParameters
): ProceduralTreeLodTuple<number> {
  const surfaces = new Map(
    Object.entries(parameters.leafSurfaces ?? {}).map(([id, surface]) => [
      id,
      buildPlantShapeGeometry(surface.shape, surface.resolution).triangleCount
    ])
  );
  const leaves = new Map(parameters.leaves.map((leaf) => [leaf.id, leaf]));
  return parameters.leafIdsByLod.map((ids, lod) =>
    ids.reduce((total, id) => {
      const surfaceId = leaves.get(id)!.surfaceIdsByLod?.[lod];
      return total + (surfaceId === undefined ? TREE_LEAF_SURFACE.triangleCount : surfaces.get(surfaceId)!);
    }, 0)
  ) as unknown as ProceduralTreeLodTuple<number>;
}

/** Resolves editing into one new final structure before the mesh builder runs. */
export function editProceduralTreeStructureParameters(
  parameters: ProceduralTreeStructureParameters,
  stems: readonly ProceduralTreeStemNodeEdit[] = [],
  leaves: readonly ProceduralTreeLeafNodeEdit[] = []
): ProceduralTreeStructureParameters {
  validateProceduralTreeStemNodeEdits(stems);
  validateProceduralTreeLeafNodeEdits(leaves);
  validateProceduralTreeStructureParameters(parameters);
  freezeImmutableData(parameters);
  if (stems.length === 0 && leaves.length === 0) return parameters;
  const skeleton = materializeTreeStructureSkeleton(parameters, parameters.referenceSize, stems);
  const pathsChanged = skeleton.branches.some((stem, index) => stem.points !== parameters.stems[index].points);
  if (!pathsChanged && leaves.length === 0) {
    return freezeImmutableData({ ...parameters, stems: skeleton.branches });
  }
  const anchored = materializeTreeStructureLeaves(
    parameters,
    skeleton.branches,
    parameters.referenceSize,
    pathsChanged
  );
  assertLeafNodeEditTargets(anchored, skeleton.branches, leaves);
  const finalLeaves = applyProceduralTreeLeafNodeEditsToAnchors(anchored, skeleton.branches, parameters.height, leaves);
  const editedLeafIds = new Set(leaves.map((leaf) => leaf.leafId));
  return freezeImmutableData({
    ...parameters,
    stems: skeleton.branches,
    leaves: finalLeaves.map((leaf, index) =>
      !pathsChanged && !editedLeafIds.has(leaf.id)
        ? parameters.leaves[index]
        : {
            ...treeStructureLeafParameters(leaf),
            ...(parameters.leaves[index].isTip === undefined ? {} : { isTip: leaf.isTip })
          }
    )
  });
}

/** Editable parent-relative parameters, derived from the final curve rather than a generated base tree. */
export function treeStructureStemNodes(
  parameters: ProceduralTreeStructureParameters
): readonly ProceduralTreeStemNodeEdit[] {
  validateProceduralTreeStructureParameters(parameters);
  freezeImmutableData(parameters);
  return treeDerivation(parameters, "stem-editing-view", () => {
    const ids = new Set(parameters.selectionStemIds);
    const stableIds = new Set(parameters.stems.filter((stem) => ids.has(stem.id)).map((stem) => stem.stableId));
    return freezeImmutableData(
      createProceduralTreeStemNodeSnapshots(parameters.stems, parameters.height)
        .filter((stem) => stableIds.has(stem.stemId))
        .map(({ points: _points, radii: _radii, level: _level, ...record }) => record)
    );
  });
}

const generatedStructureCache = new Map<string, ProceduralTreeStructureParameters>();

/** Generates editable structure parameters only. Mesh construction consumes this same contract as imports. */
export function generateProceduralTreeStructureParameters(
  source: ProceduralTreeSource,
  leafCountTuning: TreeLeafCountTuning = DEFAULT_TREE_LEAF_COUNT_TUNING,
  distribution: ProceduralTreeDistributionTuning = createDefaultProceduralTreeDistributionTuning(source),
  detachedFoliageTuning: ProceduralTreeFoliageGeometryTuning = createProceduralTreeFoliageGeometryTuning()
): ProceduralTreeStructureParameters {
  validateProceduralTreeDistributionTuning(distribution);
  validateProceduralTreeFoliageGeometryTuning(detachedFoliageTuning);
  const cacheKey = JSON.stringify([
    source.proceduralGeometryIdentity ?? source.id,
    source.proceduralProfile,
    source.size,
    leafCountTuning,
    distribution,
    detachedFoliageTuning
  ]);
  const cached = generatedStructureCache.get(cacheKey);
  if (cached) return cached;
  const leafCounts = proceduralTreeLeafCounts(leafCountTuning);
  const resolvedLeafScales = detachedFoliageTuning.lodScales ?? [1, 1, 1, 1];
  const geometryIdentity = source.proceduralGeometryIdentity ?? source.id;
  const baseSeed = hashString(geometryIdentity);
  const seedOffset = (distribution.geometrySeed ^ baseSeed) >>> 0;
  const sapling = applyProceduralTreeDistributionTuning(resolveSaplingTreeParameters(source), distribution);
  const skeleton = createSaplingSkeleton(source.size, sapling, {
    trunk: createRandom(resolveGeneratorSeed(distribution.trunkSeed, seedOffset, baseSeed, "trunk")),
    branch: createRandom(resolveGeneratorSeed(distribution.branchSeed, seedOffset, baseSeed, "branch")),
    twig: createRandom(resolveGeneratorSeed(distribution.twigSeed, seedOffset, baseSeed, "twig")),
    trunkLateNoise: createRandom(
      resolveGeneratorSeed(distribution.trunkLateNoiseSeed, seedOffset, baseSeed, "trunk-late-noise")
    ),
    branchLateNoise: createRandom(
      resolveGeneratorSeed(distribution.branchLateNoiseSeed, seedOffset, baseSeed, "branch-late-noise")
    ),
    twigLateNoise: createRandom(
      resolveGeneratorSeed(distribution.twigLateNoiseSeed, seedOffset, baseSeed, "twig-late-noise")
    )
  });
  const selected = selectLodBranches(skeleton.branches, sapling.runtimeBranchBudget).branches;
  const leafBearing = sapling.leafCountByStem
    ? selected.filter((stem) => (sapling.leafCountByStem![stem.id] ?? 0) > 0)
    : sapling.leafDensityScaleByLevel
      ? selected.filter((stem) => sapling.leafDensityScaleByLevel![stem.level] > 0)
      : selectedTerminalStems(selected);
  const clusters = createSaplingLeafClustersForBudget(
    leafBearing,
    skeleton.height,
    sapling,
    Math.max(...leafCounts),
    resolveGeneratorSeed(distribution.leafSeed, seedOffset, baseSeed, `leaves:${geometryIdentity}:${source.size}`),
    detachedFoliageTuning,
    resolvedLeafScales[0]
  );
  const leaves = leafClusterLeaves(clusters);
  let previous: readonly LeafAnchor[] = leaves;
  const leafIdsByLod = leafCounts.map((count, lodIndex) => {
    const candidates = withLeafCollisionScale(
      previous,
      skeleton.height,
      sapling,
      detachedFoliageTuning,
      resolvedLeafScales[lodIndex]
    );
    previous = selectLodLeaves(
      candidates,
      Math.min(count, candidates.length),
      distribution.leafSpacingPercent / 100,
      selected
    );
    return previous.map((leaf) => leaf.id);
  }) as unknown as ProceduralTreeLodTuple<readonly string[]>;
  const parameters: ProceduralTreeStructureParameters = {
    version: 1,
    referenceSize: source.size,
    height: skeleton.height,
    verticalHeight: skeleton.verticalHeight,
    stems: skeleton.branches,
    selectionStemIds: skeleton.branches.map((stem) => stem.id),
    canonicalStemIds: selected.map((stem) => stem.id),
    leafBearingStemIds: leafBearing.map((stem) => stem.id),
    leafClusterCount: clusters.length,
    leaves: leaves.map((leaf) => ({ ...treeStructureLeafParameters(leaf), isTip: leaf.isTip })),
    leafIdsByLod,
    leafCountTargets: leafCounts
  };
  freezeImmutableData(parameters);
  generatedStructureCache.set(cacheKey, parameters);
  if (generatedStructureCache.size > MAX_GEOMETRY_CACHE_ENTRIES) {
    generatedStructureCache.delete(generatedStructureCache.keys().next().value!);
  }
  return parameters;
}

// Structure parameters are immutable values. Edits return a new object and receive a new cache identity.
const structureCacheIds = new WeakMap<object, number>();
let nextStructureCacheId = 0;
function treeStructureCacheId(parameters: object | undefined): number {
  if (!parameters) return 0;
  let id = structureCacheIds.get(parameters);
  if (id === undefined) {
    id = ++nextStructureCacheId;
    structureCacheIds.set(parameters, id);
  }
  return id;
}
const geometryCache = new Map<string, ProceduralTreeGeometry>();
const derivationCache = new WeakMap<object, Map<string, unknown>>();
const MAX_GEOMETRY_CACHE_ENTRIES = 64;

/** Dependency-owned, bounded derived results. Unchanged structures survive unrelated edits. */
function treeDerivation<T>(owner: object, key: string, build: () => T): T {
  let cache = derivationCache.get(owner);
  if (!cache) {
    cache = new Map();
    derivationCache.set(owner, cache);
  }
  if (cache.has(key)) return cache.get(key) as T;
  const result = build();
  cache.set(key, result);
  if (cache.size > MAX_GEOMETRY_CACHE_ENTRIES) cache.delete(cache.keys().next().value!);
  return result;
}

function once<T>(build: () => T): () => T {
  let pending: (() => T) | undefined = build;
  let value: T;
  return () => {
    if (pending) {
      value = pending();
      // A completed calculation only needs its result, not its captured inputs.
      pending = undefined;
    }
    return value;
  };
}

/** Array indices retain the ordinary LOD contract, but unrequested meshes are never constructed. */
function lazyTreeLods<T>(build: (index: number) => T): ProceduralTreeLodTuple<T> {
  const values: T[] = new Array(PROCEDURAL_TREE_LOD_COUNT);
  for (let index = 0; index < PROCEDURAL_TREE_LOD_COUNT; index++) {
    Object.defineProperty(values, index, { enumerable: true, get: once(() => build(index)) });
  }
  return values as unknown as ProceduralTreeLodTuple<T>;
}
const MINIMUM_TUBE_RADIAL_SEGMENTS = 3;
const MINIMUM_TUBE_CURVE_SEGMENTS = 1;
/** Terminal primary-branch retention; the measured recipe resolves this fraction to four structural limbs. */
const TERMINAL_PRIMARY_BRANCH_RETENTION = 0.13;

/** Builds deterministic branch tubes and alpha-card payloads without loading tree geometry from GLB. */
export function generateProceduralTreeGeometry(
  source: ProceduralTreeSource,
  leafCountTuning: TreeLeafCountTuning = DEFAULT_TREE_LEAF_COUNT_TUNING,
  distributionTuning: ProceduralTreeDistributionTuning = createDefaultProceduralTreeDistributionTuning(source),
  foliageTuning: ProceduralTreeFoliageGeometryTuning = createProceduralTreeFoliageGeometryTuning(),
  triangleBudgetTuning: ProceduralTreeTriangleBudgetTuning = DEFAULT_PROCEDURAL_TREE_TRIANGLE_BUDGET
): ProceduralTreeGeometry {
  const geometry = buildProceduralTreeGeometry(
    {
      ...source,
      structureParameters:
        source.structureParameters ??
        generateProceduralTreeStructureParameters(source, leafCountTuning, distributionTuning, foliageTuning)
    },
    leafCountTuning,
    distributionTuning,
    foliageTuning,
    triangleBudgetTuning,
    true
  );
  // The complete-geometry API keeps eager validation of all four mesh budgets.
  geometry.lods.forEach(() => {});
  return geometry;
}

/** The sole mesh builder accepts a complete structure, never node edits or generation rules as a substitute. */
export function buildProceduralTreeGeometry(
  source: ProceduralTreeSource & { readonly structureParameters: ProceduralTreeStructureParameters },
  leafCountTuning: TreeLeafCountTuning,
  distributionTuning: ProceduralTreeDistributionTuning,
  foliageTuning: ProceduralTreeFoliageGeometryTuning,
  triangleBudgetTuning: ProceduralTreeTriangleBudgetTuning,
  cacheResult = true
): ProceduralTreeGeometry {
  // Runtime recipes also own materials and their Engine. Lazy cache entries must
  // capture only geometry inputs, never the source recipe itself.
  const { structureParameters, size } = source;
  freezeValidatedTreeStructure(structureParameters);
  const leafCounts = proceduralTreeLeafCounts(leafCountTuning);
  if (leafCounts.some((count, lodIndex) => lodIndex > 0 && count > leafCounts[lodIndex - 1])) {
    throw new RangeError("Procedural tree leaf counts must be non-increasing from LOD0 through LOD3");
  }
  validateProceduralTreeDistributionTuning(distributionTuning);
  validateProceduralTreeFoliageGeometryTuning(foliageTuning);
  validateProceduralTreeTriangleBudgetTuning(triangleBudgetTuning);
  const distribution = detachDistributionTuning(distributionTuning);
  const detachedFoliageTuning = { ...foliageTuning };
  const resolvedLeafScales = detachedFoliageTuning.lodScales ?? ([1, 1, 1, 1] as const);
  const triangleLimits = [...triangleBudgetTuning.maxTrianglesPerLod] as [number, number, number, number];
  const preferredTriangleCounts = triangleBudgetTuning.preferredTrianglesPerLod ?? triangleLimits;
  const geometryIdentity = source.proceduralGeometryIdentity ?? source.id;
  const cacheKey = `${treeStructureCacheId(structureParameters)}:${geometryIdentity}:${size}:leaves:${leafCounts.join(":")}:distribution:${distributionCacheKey(distribution)}:foliage:${detachedFoliageTuning.widthScale}:${detachedFoliageTuning.heightScale}:${detachedFoliageTuning.additiveHalfExtent}:${resolvedLeafScales.join(":")}:triangles:${triangleLimits.join(":")}:preferred:${preferredTriangleCounts.join(":")}`;
  const cached = cacheResult ? geometryCache.get(cacheKey) : undefined;
  if (cached) {
    return cached;
  }

  const sapling = applyProceduralTreeDistributionTuning(resolveSaplingTreeParameters(source), distribution);
  const leafNormalField = structureParameters.leafNormalField && {
    ...structureParameters.leafNormalField,
    origin: scale(structureParameters.leafNormalField.origin, size / structureParameters.referenceSize)
  };
  const skeleton = treeDerivation(
    structureParameters.stems,
    `skeleton:${size}:${structureParameters.referenceSize}:${structureParameters.height}:${structureParameters.verticalHeight}`,
    () => materializeTreeStructureSkeleton(structureParameters, size, [])
  );
  const [trunkCount, branchCount, twigCount] = sapling.runtimeBranchBudget;
  const branchBudgets = [
    [trunkCount, branchCount, twigCount],
    [trunkCount, Math.ceil(branchCount * 0.6), Math.ceil(twigCount * 0.44)],
    [trunkCount, Math.ceil(branchCount * 0.34), 0],
    [trunkCount, Math.ceil(branchCount * TERMINAL_PRIMARY_BRANCH_RETENTION), 0]
  ] as const;
  const radialSegments = [
    [8, 6, 4],
    [6, 5, 3],
    [5, 3, 0],
    [MINIMUM_TUBE_RADIAL_SEGMENTS, MINIMUM_TUBE_RADIAL_SEGMENTS, 0]
  ] as const;
  const trunkCurveSegments = distribution.trunkCurveSegments ?? 8;
  const branchCurveSegments = distribution.branchCurveSegments ?? 6;
  const twigCurveSegments = distribution.twigCurveSegments ?? 4;
  const curveSegmentBudgets = [
    [trunkCurveSegments, branchCurveSegments, twigCurveSegments],
    [
      Math.ceil(trunkCurveSegments * 0.75),
      Math.ceil(branchCurveSegments * (2 / 3)),
      Math.ceil(twigCurveSegments * 0.75)
    ],
    [Math.ceil(trunkCurveSegments * 0.625), Math.ceil(branchCurveSegments * 0.5), 0],
    [MINIMUM_TUBE_CURVE_SEGMENTS, MINIMUM_TUBE_CURVE_SEGMENTS, 0]
  ] as const;
  const selectionCandidates = treeDerivation(
    skeleton.branches,
    `selection:${structureParameters.selectionStemIds.join(":")}`,
    () => {
      const ids = new Set(structureParameters.selectionStemIds);
      return skeleton.branches.filter((branch) => ids.has(branch.id));
    }
  );
  const stemByNumericId = new Map(skeleton.branches.map((stem) => [stem.id, stem]));
  const canonicalSelection = {
    branches: structureParameters.canonicalStemIds
      ? treeDerivation(skeleton.branches, `canonical:${structureParameters.canonicalStemIds.join(":")}`, () =>
          structureParameters.canonicalStemIds!.map((id) => stemByNumericId.get(id)!)
        )
      : selectionCandidates
  };
  const canonicalLeafBearingStems = canonicalSelection.branches.filter((stem) =>
    structureParameters.leafBearingStemIds.includes(stem.id)
  );
  const treeRootHeight = Math.min(
    ...canonicalSelection.branches.filter((branch) => branch.level === 0).map((branch) => branch.points[0][1])
  );
  const canonicalLeaves = treeDerivation(
    structureParameters.leaves,
    `leaves:${size / structureParameters.referenceSize}:${treeRootHeight}:${sapling.parentPuffiness}`,
    () =>
      applyProceduralTreeCrownShadingNormals(
        materializeTreeStructureLeaves(structureParameters, skeleton.branches, size, false),
        treeRootHeight,
        sapling.parentPuffiness
      )
  );
  const canonicalStemById = new Map(canonicalSelection.branches.map((stem) => [stem.id, stem]));
  const canonicalLeafIndexById = new Map(canonicalLeaves.map((leaf, leafIndex) => [leaf.id, leafIndex]));
  let previousLodBaseLeaves: readonly LeafAnchor[] = canonicalLeaves;
  // Nested membership is needed by canopy proxies, independently of which meshes are requested.
  const leavesByLod = leafCounts.map((leafCount, lodIndex) => {
    const foliageScale = resolvedLeafScales[lodIndex];
    const authoredLodIds = structureParameters.leafIdsByLod[lodIndex];
    const candidateIds = new Set(previousLodBaseLeaves.map((leaf) => leaf.id));
    const useAuthored =
      leafCount === (structureParameters.leafCountTargets?.[lodIndex] ?? authoredLodIds.length) &&
      authoredLodIds.every((id) => candidateIds.has(id));
    const selectedBaseLeaves = useAuthored
      ? treeDerivation(canonicalLeaves, `membership:${JSON.stringify(authoredLodIds)}`, () => {
          const ids = new Set(authoredLodIds);
          return canonicalLeaves.filter((leaf) => ids.has(leaf.id));
        })
      : selectLodLeaves(
          withLeafCollisionScale(previousLodBaseLeaves, skeleton.height, sapling, detachedFoliageTuning, foliageScale),
          Math.min(leafCount, previousLodBaseLeaves.length),
          distribution.leafSpacingPercent / 100,
          canonicalSelection.branches
        );
    previousLodBaseLeaves = selectedBaseLeaves;
    return treeDerivation(
      selectedBaseLeaves,
      `envelopes:${skeleton.height}:${JSON.stringify(sapling.leafDensityByHeightProfile)}:${JSON.stringify(detachedFoliageTuning)}:${foliageScale}`,
      () => withLeafCollisionScale(selectedBaseLeaves, skeleton.height, sapling, detachedFoliageTuning, foliageScale)
    );
  });
  const lods = lazyTreeLods((lodIndex): ProceduralTreeLodData => {
    const selected = treeDerivation(selectionCandidates, `branches:${branchBudgets[lodIndex].join(":")}`, () =>
      selectLodBranches(selectionCandidates, branchBudgets[lodIndex])
    );
    const foliageScale = resolvedLeafScales[lodIndex];
    const selectedLeaves = leavesByLod[lodIndex];
    const leafCardCoverageArea = totalLeafCardCoverageArea(selectedLeaves, detachedFoliageTuning, foliageScale);
    const maxTipLeafAttachmentError = selectedLeaves.reduce((maximum, leaf) => {
      if (!leaf.isTip) return maximum;
      const stem = canonicalStemById.get(leaf.stemId);
      if (!stem) throw new Error(`Procedural tree tip leaf references missing stem ${leaf.stemId}`);
      return Math.max(maximum, Math.sqrt(squaredDistance(leaf.stemAttachment, stem.points[stem.points.length - 1])));
    }, 0);
    let crown = treeDerivation(
      selectedLeaves,
      `mesh:${treeStructureCacheId(canonicalSelection.branches)}:${treeStructureCacheId(canonicalLeaves)}:${size}:${treeStructureCacheId(structureParameters.leafSurfaces)}:${treeStructureCacheId(structureParameters.leafNormalField)}:${structureParameters.referenceSize}:${lodIndex}`,
      () =>
        createLeafMesh(
          selectedLeaves,
          canonicalSelection.branches,
          foliageScale,
          size,
          detachedFoliageTuning,
          canonicalLeafIndexById,
          structureParameters.leafSurfaces,
          lodIndex,
          leafNormalField
        )
    );
    const meshResolution = resolveBranchMeshResolution(
      selected.branches,
      radialSegments[lodIndex],
      curveSegmentBudgets[lodIndex],
      crown.triangleCount,
      triangleLimits[lodIndex],
      preferredTriangleCounts[lodIndex]
    );
    const generatedTrunk = treeDerivation(
      selected.branches,
      `mesh:${meshResolution.radialSegments.join(":")}:${meshResolution.curveSegments.join(":")}:${lodIndex === 0}`,
      () =>
        createBranchMesh(selected.branches, meshResolution.radialSegments, meshResolution.curveSegments, lodIndex === 0)
    );
    if (generatedTrunk.triangleCount + crown.triangleCount > triangleLimits[lodIndex]) {
      throw new RangeError(
        `Procedural tree LOD${lodIndex} generated ${generatedTrunk.triangleCount + crown.triangleCount} triangles, exceeding its ${triangleLimits[lodIndex]} hard ceiling`
      );
    }
    const baseCrown = crown;
    const dissolveMeshes = treeDerivation(
      generatedTrunk,
      `dissolve:${treeStructureCacheId(baseCrown)}:${treeStructureCacheId(canonicalSelection.branches)}`,
      () => attachTreeDissolvePaths(generatedTrunk, baseCrown, canonicalSelection.branches)
    );
    const trunk = dissolveMeshes.trunk;
    crown = dissolveMeshes.crown;
    const leafVariantCounts = countLeafVariants(selectedLeaves);
    const getGeometricLeafAssociations = once(() =>
      selectedLeaves.map((leaf) =>
        canonicalSelection.branches.reduce(
          (best, branch, branchIndex) => {
            const association = closestProgressOnBranch(leaf.collisionCenter, branch);
            return association.distance < best.distance ? { ...association, branchIndex } : best;
          },
          { distance: Number.POSITIVE_INFINITY, progress: 0, branchIndex: 0 }
        )
      )
    );
    const getProgressQuantiles = once(() =>
      fiveQuantiles(getGeometricLeafAssociations().map((association) => association.progress))
    );
    const getLeafCountByBranch = once(() => {
      const counts = canonicalSelection.branches.map(() => 0);
      for (const association of getGeometricLeafAssociations()) counts[association.branchIndex]++;
      return counts;
    });
    const getBranchCountQuantiles = once(() => fiveQuantiles(getLeafCountByBranch()));
    const getLeafCards = once(() => createLeafCardStates(selectedLeaves, canonicalSelection.branches, skeleton.height));
    return {
      trunk,
      crown,
      branchCounts: selected.counts,
      branchTipContinuations: [
        selected.branches.filter((branch) => branch.level === 1 && isStemTip(branch.attachmentProgress)).length,
        selected.branches.filter((branch) => branch.level === 2 && isStemTip(branch.attachmentProgress)).length
      ],
      leafCount: selectedLeaves.length,
      get leafCards() {
        return getLeafCards();
      },
      foliageScale,
      leafCardCoverageArea,
      terminalStemCount: canonicalLeafBearingStems.length,
      leafClusterCount: structureParameters.leafClusterCount,
      leafVariantCounts,
      tipLeafCount: selectedLeaves.filter((leaf) => leaf.isTip).length,
      maxTipLeafAttachmentError,
      maxBranchAttachmentError: maximumBranchAttachmentError(selected.branches),
      get leafBranchProgressQuantiles() {
        const q = getProgressQuantiles();
        return [q[0], q[2], q[4]] as const;
      },
      get leavesPerBranchQuantiles() {
        const q = getBranchCountQuantiles();
        return [q[0], q[2], q[4]] as const;
      },
      get terminalLeafRatio() {
        return (
          getGeometricLeafAssociations().filter((association) => association.progress >= 0.75).length /
          Math.max(selectedLeaves.length, 1)
        );
      },
      get leafBearingBranchRatio() {
        const counts = getLeafCountByBranch();
        return counts.filter((count) => count > 0).length / Math.max(counts.length, 1);
      },
      trunkTriangleCount: trunk.triangleCount,
      leafTriangleCount: crown.triangleCount,
      triangleCount: trunk.triangleCount + crown.triangleCount,
      radialSegments: resolvedMeshRadialSegments(selected.branches, meshResolution.radialSegments, lodIndex === 0),
      curveSegments: resolvedMeshCurveSegments(selected.branches, meshResolution.curveSegments, lodIndex === 0)
    };
  });
  const leafCardIdsByLod = leavesByLod.map((leaves) =>
    leaves.map((leaf) => leaf.id)
  ) as unknown as ProceduralTreeLodTuple<readonly string[]>;
  const getBaseLeafFrames = once(() =>
    treeDerivation(canonicalLeaves, `canopy:${JSON.stringify(leafCardIdsByLod)}`, () =>
      attachProceduralTreeCanopyOpticalDepthByLod(
        canonicalLeaves.map((leaf) => ({
          leafId: leaf.id,
          pivot: [...leaf.attachment] as Point,
          right: [...leaf.right] as Point,
          up: [...leaf.up] as Point,
          normal: [...leaf.normal] as Point,
          tangentHandedness: leaf.tangentHandedness,
          width: leaf.width,
          height: leaf.height
        })),
        leafCardIdsByLod
      )
    )
  );
  const getLeafNodeContext = once(
    (): ProceduralTreeLeafNodeContext => ({
      treeHeight: skeleton.height,
      treeRootHeight,
      leafNormalCrownBlend: sapling.parentPuffiness,
      stems: canonicalSelection.branches.map((stem) => ({
        stemId: stem.stableId,
        points: stem.points.map((point) => [...point])
      })),
      baseCards: createLeafCardStates(canonicalLeaves, canonicalSelection.branches, skeleton.height),
      baseFrames: getBaseLeafFrames(),
      leafCardIdsByLod
    })
  );
  const getStructure = once(() =>
    summarizeSaplingStructure(selectionCandidates, skeleton.height, skeleton.verticalHeight)
  );
  const getStemNodes = once(() =>
    treeDerivation(skeleton.branches, `editing:${skeleton.height}`, () =>
      createProceduralTreeStemNodeSnapshots(skeleton.branches, skeleton.height)
    )
  );
  const getGpuStemRecords = once(() =>
    treeDerivation(skeleton.branches, `offline-gpu-stems:${skeleton.height}`, () =>
      createProceduralTreeGpuStemRecords(skeleton.branches, skeleton.height)
    )
  );
  const geometry: ProceduralTreeGeometry = {
    algorithm: PROCEDURAL_TREE_ALGORITHM,
    density: PROCEDURAL_TREE_LEAF_DENSITY,
    sapling,
    get structure() {
      return getStructure();
    },
    get stemNodes() {
      return getStemNodes();
    },
    get gpuStemRecords() {
      return getGpuStemRecords();
    },
    generatedHeight: skeleton.height,
    leafNormalField,
    get leafNodeContext() {
      return getLeafNodeContext();
    },
    get leafGpuFrames() {
      return getBaseLeafFrames();
    },
    firstPrimaryBranchHeightRatio: resolveFirstPrimaryBranchHeightRatio(selectionCandidates, skeleton.verticalHeight),
    lods
  };
  if (cacheResult) {
    geometryCache.set(cacheKey, geometry);
    if (geometryCache.size > MAX_GEOMETRY_CACHE_ENTRIES) {
      const oldestKey = geometryCache.keys().next().value as string | undefined;
      if (oldestKey !== undefined) {
        geometryCache.delete(oldestKey);
      }
    }
  }
  return geometry;
}

function materializeTreeStructureSkeleton(
  parameters: ProceduralTreeStructureParameters,
  size: number,
  edits: readonly ProceduralTreeStemNodeEdit[]
): { branches: readonly SaplingStem[]; height: number; verticalHeight: number } {
  const factor = size / parameters.referenceSize;
  const stems =
    factor === 1
      ? parameters.stems
      : parameters.stems.map((stem) => ({
          ...stem,
          length: stem.length * factor,
          points: stem.points.map((point) => scale(point, factor)),
          radii: stem.radii.map((radius) => radius * factor),
          startRadius: stem.startRadius * factor,
          endRadius: stem.endRadius * factor
        }));
  const height = parameters.height * factor;
  if (edits.length === 0) return { branches: stems, height, verticalHeight: parameters.verticalHeight * factor };
  const current = new Map(createProceduralTreeStemNodeSnapshots(stems, height).map((stem) => [stem.stemId, stem]));
  const pathFields = (record: ProceduralTreeStemNodeEdit) => [
    record.parentStemId,
    record.attachmentProgressPercent,
    record.directionInParentFrame,
    record.lengthPercentOfHeight,
    record.pathControlPointsPercentOfLength,
    record.rootPositionPercentOfHeight
  ];
  const pathEdits = edits.filter((edit) => {
    const previous = current.get(edit.stemId);
    if (!previous) throw new Error(`Tree structure has no stem ${edit.stemId}`);
    return JSON.stringify(pathFields(edit)) !== JSON.stringify(pathFields(previous));
  });
  const paths = pathEdits.length ? applyProceduralTreeStemNodeEdits(stems, height, pathEdits) : stems;
  const byId = new Map(edits.map((edit) => [edit.stemId, edit]));
  const branches = paths.map((stem) => {
    const edit = byId.get(stem.stableId);
    if (!edit) return stem;
    const startRadius = height * (edit.startRadiusPercentOfHeight / 100);
    return {
      ...stem,
      startRadius,
      endRadius: startRadius * (edit.endRadiusPercentOfStart / 100),
      radii: createStemNodeRadiusProfile(edit, stem.points.length, startRadius),
      radialSegments: edit.radialSegments,
      axialSubdivisions: [...edit.axialSubdivisions],
      tipCap: edit.tipCap
    };
  });
  return { branches, height, verticalHeight: parameters.verticalHeight * factor };
}

function treeStructureLeafParameters(leaf: LeafAnchor): ProceduralTreeStructureLeaf {
  const {
    id,
    clusterId,
    stemId,
    progress,
    attachment,
    stemAttachment,
    clusterOutward,
    right,
    up,
    width,
    height,
    variantIndex,
    tone,
    surfaceIdsByLod
  } = leaf;
  return {
    id,
    clusterId,
    stemId,
    progress,
    attachment,
    stemAttachment,
    clusterOutward,
    right,
    up,
    width,
    height,
    variantIndex,
    tone,
    ...(surfaceIdsByLod ? { surfaceIdsByLod } : {})
  };
}

/** Parent-relative editing view of the authoritative final leaf poses. */
export function treeStructureLeafNodes(
  parameters: ProceduralTreeStructureParameters
): readonly ProceduralTreeLeafCardState[] {
  validateProceduralTreeStructureParameters(parameters);
  freezeImmutableData(parameters);
  return treeDerivation(parameters, "leaf-editing-view", () =>
    freezeImmutableData(
      createLeafCardStates(
        materializeTreeStructureLeaves(parameters, parameters.stems, parameters.referenceSize, false),
        parameters.stems,
        parameters.height
      )
    )
  );
}

function materializeTreeStructureLeaves(
  parameters: ProceduralTreeStructureParameters,
  stems: readonly SaplingStem[],
  size: number,
  stemsEdited: boolean
): readonly LeafAnchor[] {
  const factor = size / parameters.referenceSize;
  const leaves = parameters.leaves.map(
    (leaf): LeafAnchor => ({
      ...leaf,
      attachment: factor === 1 ? leaf.attachment : scale(leaf.attachment, factor),
      stemAttachment: factor === 1 ? leaf.stemAttachment : scale(leaf.stemAttachment, factor),
      width: leaf.width * factor,
      height: leaf.height * factor,
      isTip: leaf.isTip ?? isStemTip(leaf.progress),
      clusterCenter: leaf.attachment,
      normal: normalize(cross(leaf.right, leaf.up)),
      tangentHandedness: 1,
      collisionCenter: leaf.attachment,
      collisionHalfWidth: (leaf.width * factor) / 2,
      collisionHalfHeight: (leaf.height * factor) / 2,
      densityWeight: 1,
      variant: { weight: 1, widthScale: 1, heightScale: 1, fold: 0, curl: 0, droop: 0, toneOffset: 0 }
    })
  );
  return stemsEdited
    ? applyProceduralTreeLeafNodeEditsToAnchors(
        leaves,
        stems,
        parameters.height * factor,
        treeStructureLeafNodes(parameters)
      )
    : leaves;
}

function summarizeSaplingStructure(
  branches: readonly SaplingStem[],
  treeHeight: number,
  verticalHeight: number
): ProceduralTreeStructureMetrics {
  const trunk = branches.find((branch) => branch.level === 0);
  if (!trunk) throw new Error("Procedural tree skeleton requires a trunk");
  const levelMetrics = (level: 1 | 2): ProceduralTreeStructureLevelMetrics => {
    const selected = branches.filter((branch) => branch.level === level);
    const rootHeightRatios = selected.map((branch) => branch.points[0][1] / Math.max(treeHeight, Number.EPSILON));
    return {
      count: selected.length,
      minimumRootHeightRatio: rootHeightRatios.length > 0 ? Math.min(...rootHeightRatios) : 0,
      maximumRootHeightRatio: rootHeightRatios.length > 0 ? Math.max(...rootHeightRatios) : 0,
      rootHeightRatioQuantiles: fiveQuantiles(rootHeightRatios),
      pathLengthRatioQuantiles: fiveQuantiles(
        selected.map((branch) => polylineLength(branch.points) / Math.max(treeHeight, Number.EPSILON))
      ),
      rootRadiusRatioQuantiles: fiveQuantiles(
        selected.map((branch) => branch.startRadius / Math.max(treeHeight, Number.EPSILON))
      ),
      upAngleDegreesQuantiles: fiveQuantiles(
        selected.map((branch) => {
          const chord = subtract(branch.points[branch.points.length - 1], branch.points[0]);
          return (Math.acos(clamp(chord[1] / Math.max(length(chord), Number.EPSILON), -1, 1)) * 180) / Math.PI;
        })
      ),
      endpointHeightRatioQuantiles: fiveQuantiles(
        selected.map((branch) => branch.points[branch.points.length - 1][1] / Math.max(treeHeight, Number.EPSILON))
      ),
      endpointRadiusRatioQuantiles: fiveQuantiles(
        selected.map((branch) => {
          const endpoint = branch.points[branch.points.length - 1];
          return Math.hypot(endpoint[0], endpoint[2]) / Math.max(treeHeight, Number.EPSILON);
        })
      )
    };
  };
  const trunkLength = polylineLength(trunk.points);
  return {
    trunk: {
      verticalHeight,
      pathLength: trunkLength,
      curveToHeightRatio: trunkLength / Math.max(verticalHeight, Number.EPSILON),
      baseRadius: trunk.radii[0],
      tipRadius: trunk.radii[trunk.radii.length - 1]
    },
    primaryBranches: levelMetrics(1),
    secondaryBranches: levelMetrics(2)
  };
}

function fiveQuantiles(values: readonly number[]): [number, number, number, number, number] {
  return [0.1, 0.25, 0.5, 0.75, 0.9].map((probability) => numericQuantile(values, probability)) as [
    number,
    number,
    number,
    number,
    number
  ];
}

function numericQuantile(values: readonly number[], probability: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const position = (sorted.length - 1) * probability;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
}

/** Uploads one generated tree family as four independently disposable ModelMesh pairs. */
export function createProceduralTreeMeshes(
  engine: Engine,
  source: ProceduralTreeSource,
  leafCountTuning: TreeLeafCountTuning = DEFAULT_TREE_LEAF_COUNT_TUNING,
  distributionTuning: ProceduralTreeDistributionTuning = createDefaultProceduralTreeDistributionTuning(source),
  foliageTuning: ProceduralTreeFoliageGeometryTuning = createProceduralTreeFoliageGeometryTuning(),
  triangleBudgetTuning: ProceduralTreeTriangleBudgetTuning = DEFAULT_PROCEDURAL_TREE_TRIANGLE_BUDGET
): ProceduralTreeLodTuple<ProceduralTreeLodMeshes> {
  const geometry = generateProceduralTreeGeometry(
    source,
    leafCountTuning,
    distributionTuning,
    foliageTuning,
    triangleBudgetTuning
  );
  return uploadProceduralTreeMeshesForLods(
    engine,
    source,
    ALL_PROCEDURAL_TREE_SOURCE_LOD_INDICES,
    foliageTuning,
    geometry
  ) as unknown as ProceduralTreeLodTuple<ProceduralTreeLodMeshes>;
}

/** Uploads only the ordered source LOD meshes consumed by a runtime profile */
export function createProceduralTreeMeshesForLods(
  engine: Engine,
  source: ProceduralTreeSource,
  sourceLodIndices: readonly ProceduralTreeSourceLodIndex[],
  leafCountTuning: TreeLeafCountTuning = DEFAULT_TREE_LEAF_COUNT_TUNING,
  distributionTuning: ProceduralTreeDistributionTuning = createDefaultProceduralTreeDistributionTuning(source),
  foliageTuning: ProceduralTreeFoliageGeometryTuning = createProceduralTreeFoliageGeometryTuning(),
  triangleBudgetTuning: ProceduralTreeTriangleBudgetTuning = DEFAULT_PROCEDURAL_TREE_TRIANGLE_BUDGET
): readonly ProceduralTreeLodMeshes[] {
  validateProceduralTreeSourceLodIndices(sourceLodIndices);
  // Cached families construct LOD meshes lazily; only selected indices allocate mesh data.
  const geometry = buildProceduralTreeGeometry(
    {
      ...source,
      structureParameters:
        source.structureParameters ??
        generateProceduralTreeStructureParameters(source, leafCountTuning, distributionTuning, foliageTuning)
    },
    leafCountTuning,
    distributionTuning,
    foliageTuning,
    triangleBudgetTuning,
    true
  );
  return uploadProceduralTreeMeshesForLods(engine, source, sourceLodIndices, foliageTuning, geometry);
}

function uploadProceduralTreeMeshesForLods(
  engine: Engine,
  source: ProceduralTreeSource,
  sourceLodIndices: readonly ProceduralTreeSourceLodIndex[],
  foliageTuning: ProceduralTreeFoliageGeometryTuning,
  geometry: ProceduralTreeGeometry
): readonly ProceduralTreeLodMeshes[] {
  return sourceLodIndices.map((sourceLodIndex) => {
    const lod = geometry.lods[sourceLodIndex];
    return {
      trunk: uploadMesh(engine, `${source.label} procedural trunk source LOD${sourceLodIndex}`, lod.trunk),
      crown: uploadMesh(engine, `${source.label} procedural leaf cards source LOD${sourceLodIndex}`, lod.crown),
      branchCounts: lod.branchCounts,
      leafCount: lod.leafCount,
      leafCardIds: lod.crown.leafCardIds ?? [],
      get leafCards() {
        return lod.leafCards;
      },
      leafGpuFrames: geometry.leafGpuFrames,
      leafNormalField: geometry.leafNormalField,
      get leafNodeContext() {
        return geometry.leafNodeContext;
      },
      leafGpuFrameScale: [
        foliageTuning.widthScale * lod.foliageScale,
        foliageTuning.heightScale * lod.foliageScale,
        foliageTuning.additiveHalfExtent,
        sourceLodIndex
      ],
      get stemNodes() {
        return geometry.stemNodes;
      },
      get gpuStemRecords() {
        return geometry.gpuStemRecords;
      },
      generatedHeight: geometry.generatedHeight,
      foliageScale: lod.foliageScale,
      leafCardCoverageArea: lod.leafCardCoverageArea,
      trunkTriangleCount: lod.trunkTriangleCount,
      leafTriangleCount: lod.leafTriangleCount,
      triangleCount: lod.triangleCount
    };
  });
}

function validateProceduralTreeSourceLodIndices(indices: readonly ProceduralTreeSourceLodIndex[]): void {
  if (indices.length === 0) {
    throw new RangeError("Procedural tree mesh selection requires at least one source LOD");
  }
  indices.forEach((index, position) => {
    if (!Number.isInteger(index) || index < 0 || index >= PROCEDURAL_TREE_LOD_COUNT) {
      throw new RangeError(`Procedural tree source LOD index ${index} is invalid`);
    }
    if (position > 0 && index <= indices[position - 1]!) {
      throw new RangeError("Procedural tree source LOD indices must be strictly increasing");
    }
  });
}

/** Resolves the catalog-selected Sapling preset without inferring species from asset IDs. */
export function resolveSaplingTreeParameters(source: ProceduralTreeSource): SaplingTreeParameters {
  switch (source.proceduralProfile) {
    case "small-maple":
      return SMALL_MAPLE_SAPLING;
    case "white-birch":
      return WHITE_BIRCH_SAPLING;
  }
}

/** Resolves the exact preset values shown when the current tree's distribution controls are reset. */
export function createDefaultProceduralTreeDistributionTuning(
  source: ProceduralTreeSource
): ProceduralTreeDistributionTuning {
  const parameters = resolveSaplingTreeParameters(source);
  return {
    geometrySeed: hashString(source.id),
    trunkCount: parameters.baseSplits + 1,
    treeHeightVariationPercent: parameters.scaleVariation * 100,
    trunkClearHeightPercentOfHeight: Number((parameters.trunkClearHeightRatio * 100).toFixed(6)),
    trunkRadiusPercentOfHeight: parameters.ratio * 100,
    trunkRadiusVariationPercent: parameters.scaleVariation0 * 100,
    trunkCurveVariationDegrees: parameters.curveVariation[0],
    trunkLateNoiseAmountDegrees: parameters.lateNoiseAmount[0],
    trunkLateNoiseTurbulence: parameters.lateNoiseTurbulence[0],
    trunkLateNoiseSmoothPercent: parameters.lateNoiseSmooth[0] * 100,
    trunkSplitAngleDegrees: parameters.splitAngle[0],
    trunkSplitAngleVariationDegrees: parameters.splitAngleVariation[0],
    trunkRotateDegrees: parameters.rotate[0],
    trunkRotateVariationDegrees: parameters.rotateVariation[0],
    branchCount: parameters.runtimeBranchBudget[1],
    branchLengthPercentOfParent: parameters.length[1] * 100,
    branchMaximumLengthPercentOfHeight: parameters.maximumLengthRatio[1] * 100,
    branchLengthVariationPercent: parameters.lengthVariation[1] * 100,
    branchCurveVariationDegrees: parameters.curveVariation[1],
    branchLateNoiseAmountDegrees: parameters.lateNoiseAmount[1],
    branchLateNoiseTurbulence: parameters.lateNoiseTurbulence[1],
    branchLateNoiseSmoothPercent: parameters.lateNoiseSmooth[1] * 100,
    branchAttractionUp: parameters.attractUp[1],
    branchAttractionOut: parameters.attractOut[1],
    branchMinimumChildrenPerParent: parameters.minimumChildrenPerParent?.[1] ?? 1,
    branchParentLengthWeightPower: parameters.parentLengthWeightPower?.[1] ?? 1,
    branchParentLengthWeightFloorPercent: (parameters.parentLengthWeightFloor?.[1] ?? 0.1) * 100,
    branchSameLevelParentLengthWeightPower:
      parameters.sameLevelParentLengthWeightPower?.[1] ?? parameters.parentLengthWeightPower?.[1] ?? 1,
    branchSameLevelParentLengthWeightFloorPercent:
      (parameters.sameLevelParentLengthWeightFloor?.[1] ?? parameters.parentLengthWeightFloor?.[1] ?? 0.1) * 100,
    branchRotateDegrees: parameters.rotate[1],
    branchRotateVariationDegrees: parameters.rotateVariation[1],
    branchDownAngleDegrees: parameters.downAngle[1],
    branchDownAngleVariationDegrees: parameters.downAngleVariation[1],
    twigCount: parameters.runtimeBranchBudget[2],
    twigLengthPercentOfParent: parameters.length[2] * 100,
    twigMaximumLengthPercentOfHeight: parameters.maximumLengthRatio[2] * 100,
    twigLengthVariationPercent: parameters.lengthVariation[2] * 100,
    twigCurveVariationDegrees: parameters.curveVariation[2],
    twigLateNoiseAmountDegrees: parameters.lateNoiseAmount[2],
    twigLateNoiseTurbulence: parameters.lateNoiseTurbulence[2],
    twigLateNoiseSmoothPercent: parameters.lateNoiseSmooth[2] * 100,
    twigAttractionUp: parameters.attractUp[2],
    twigAttractionOut: parameters.attractOut[2],
    twigMinimumChildrenPerParent: parameters.minimumChildrenPerParent?.[2] ?? 1,
    twigParentLengthWeightPower: parameters.parentLengthWeightPower?.[2] ?? 1,
    twigParentLengthWeightFloorPercent: (parameters.parentLengthWeightFloor?.[2] ?? 0.1) * 100,
    twigSameLevelParentLengthWeightPower:
      parameters.sameLevelParentLengthWeightPower?.[2] ?? parameters.parentLengthWeightPower?.[2] ?? 1,
    twigSameLevelParentLengthWeightFloorPercent:
      (parameters.sameLevelParentLengthWeightFloor?.[2] ?? parameters.parentLengthWeightFloor?.[2] ?? 0.1) * 100,
    twigAttachmentEndPercentOfParent: parameters.twigAttachmentEndRatio * 100,
    twigRotateDegrees: parameters.rotate[2],
    twigRotateVariationDegrees: parameters.rotateVariation[2],
    twigDownAngleDegrees: parameters.downAngle[2],
    twigDownAngleVariationDegrees: parameters.downAngleVariation[2],
    leafDistribution: parameters.leafDistribution,
    leafDownAngleDegrees: parameters.leafDownAngle,
    leafDownAngleVariationDegrees: parameters.leafDownAngleVariation,
    leafRotateDegrees: parameters.leafRotate,
    leafRotateVariationDegrees: parameters.leafRotateVariation,
    leafSpacingPercent: parameters.leafSpacing * 100,
    leafScaleVariationPercent: parameters.leafScaleVariation * 100,
    leafNormalCrownBlendPercent: parameters.parentPuffiness * 100
  };
}

/** Rejects values that would create invalid dimensions, unsupported shapes, or unsafe runtime budgets. */
export function validateProceduralTreeDistributionTuning(tuning: ProceduralTreeDistributionTuning): void {
  const tuningRecord = tuning as unknown as Record<string, unknown>;
  const forbiddenAuthoredReplayFields = ["branchAuthoredStems", "twigAuthoredStems", "leafAuthoredCards"].filter(
    (field) => tuningRecord[field] !== undefined
  );
  if (forbiddenAuthoredReplayFields.length > 0) {
    throw new RangeError(
      `Procedural tree recipes cannot contain baked Authored replay data: ${forbiddenAuthoredReplayFields.join(", ")}`
    );
  }
  validateTuningNumber("Geometry seed", tuning.geometrySeed, 0, 0xffffffff, true);
  validateOptionalSeed("Trunk seed", tuning.trunkSeed);
  validateOptionalSeed("Branch seed", tuning.branchSeed);
  validateOptionalSeed("Twig seed", tuning.twigSeed);
  validateOptionalSeed("Leaf seed", tuning.leafSeed);
  validateOptionalSeed("Trunk late-noise seed", tuning.trunkLateNoiseSeed);
  validateOptionalSeed("Branch late-noise seed", tuning.branchLateNoiseSeed);
  validateOptionalSeed("Twig late-noise seed", tuning.twigLateNoiseSeed);
  validateTuningNumber("Trunk count", tuning.trunkCount, 1, 8, true);
  validateOptionalTuningNumber("Trunk length percent of height", tuning.trunkLengthPercentOfHeight, 10, 120);
  validateTuningNumber("Tree height variation", tuning.treeHeightVariationPercent, 0, 100);
  validateTuningNumber("Trunk clear height percent of height", tuning.trunkClearHeightPercentOfHeight, 0, 95);
  validateTuningNumber("Trunk radius percent of height", tuning.trunkRadiusPercentOfHeight, 0.02, 100);
  validateOptionalTuningNumber("Trunk tip radius percent of base", tuning.trunkTipRadiusPercentOfBase, 0.01, 100);
  validateOptionalTuningNumber("Trunk root flare", tuning.trunkRootFlare, 0.1, 10);
  validateTuningNumber("Trunk radius variation", tuning.trunkRadiusVariationPercent, 0, 100);
  validateOptionalTuningNumber("Trunk curve segments", tuning.trunkCurveSegments, 1, 64, true);
  validateTuningNumber("Trunk curve variation", tuning.trunkCurveVariationDegrees, 0, 360);
  validateOptionalTuningNumber("Trunk late-noise amount", tuning.trunkLateNoiseAmountDegrees, 0, 360);
  validateOptionalTuningNumber("Trunk late-noise turbulence", tuning.trunkLateNoiseTurbulence, 0, 16);
  validateOptionalTuningNumber("Trunk late-noise smooth", tuning.trunkLateNoiseSmoothPercent, 0, 100);
  validateOptionalParentCurve("Trunk late-noise profile", tuning.trunkLateNoiseByHeightCurve, 0, 400);
  validateOptionalSpinePath("Trunk spine path", tuning.trunkPathHarmonicsPercentOfLength);
  validateTuningNumber("Trunk split angle", tuning.trunkSplitAngleDegrees, 0, 180);
  validateTuningNumber("Trunk split-angle variation", tuning.trunkSplitAngleVariationDegrees, 0, 180);
  validateTuningNumber("Trunk rotation", tuning.trunkRotateDegrees, -360, 360);
  validateTuningNumber("Trunk rotation variation", tuning.trunkRotateVariationDegrees, 0, 180);
  validateTuningNumber("Branch count", tuning.branchCount, 0, 512, true);
  validateOptionalGenerationMode("Branch generation", tuning.branchGenerationMode);
  validateOptionalTuningNumber("Branch bifurcation threshold", tuning.branchBifurcationThresholdDegrees, 0, 180);
  validateOptionalTuningNumber("Branch bifurcation spacing", tuning.branchBifurcationSpacingPercentOfParent, 0, 100);
  validateOptionalTuningNumber("Branch bifurcation balance", tuning.branchBifurcationBalancePercent, 0, 100);
  validateOptionalTuningNumber("Branch bifurcation align", tuning.branchBifurcationAlignPercent, 0, 100);
  validateOptionalTuningNumber(
    "Branch bifurcation distribution blend",
    tuning.branchBifurcationDistributionBlendPercent,
    0,
    100
  );
  validateOptionalParentCurve(
    "Branch root-height distribution",
    tuning.branchRootHeightDistributionCurve,
    0,
    100,
    true
  );
  validateOptionalTuningNumber(
    "Branch root-height distribution blend",
    tuning.branchRootHeightDistributionBlendPercent,
    0,
    100
  );
  validateOptionalTuningNumber("Branch whorl size", tuning.branchWhorlSize, 1, 16, true);
  validateOptionalTuningNumber("Branch whorl count", tuning.branchWhorlCount, 1, 64, true);
  if (tuning.branchWhorlSizes || tuning.branchWhorlAttachmentProgressPercent) {
    if (
      !tuning.branchWhorlSizes ||
      !tuning.branchWhorlAttachmentProgressPercent ||
      tuning.branchWhorlSizes.length !== tuning.branchWhorlAttachmentProgressPercent.length ||
      tuning.branchWhorlSizes.length < 1 ||
      tuning.branchWhorlSizes.length > 64
    ) {
      throw new RangeError("Branch whorl nodes require equally sized count and attachment arrays");
    }
    tuning.branchWhorlSizes.forEach((value, index) =>
      validateTuningNumber(`Branch whorl ${index} size`, value, 1, 32, true)
    );
    tuning.branchWhorlAttachmentProgressPercent.forEach((value, index) =>
      validateTuningNumber(`Branch whorl ${index} attachment`, value, 0, 100)
    );
  }
  validateOptionalTuningNumber("Branch whorl spread", tuning.branchWhorlSpreadPercentOfParent, 0, 50);
  validateOptionalParentCurve("Branch whorl phase by height", tuning.branchWhorlPhaseByHeightCurve, -720, 720);
  validateOptionalTuningNumber("Branch extension percent", tuning.branchExtensionPercent, 0, 100);
  validateOptionalSameLevelMode("Branch same-level", tuning.branchSameLevelMode);
  validateOptionalParentCurve(
    "Branch same-level attachment progress",
    tuning.branchSameLevelAttachmentProgressCurve,
    0,
    100,
    true
  );
  validateOptionalTuningNumber(
    "Branch same-level bifurcation distribution blend",
    tuning.branchSameLevelBifurcationDistributionBlendPercent,
    0,
    100
  );
  validateOptionalParentCurve(
    "Branch same-level root-height distribution",
    tuning.branchSameLevelRootHeightDistributionCurve,
    0,
    100,
    true
  );
  validateOptionalTuningNumber(
    "Branch same-level root-height distribution blend",
    tuning.branchSameLevelRootHeightDistributionBlendPercent,
    0,
    100
  );
  validateOptionalTuningNumber(
    "Branch same-level parent-length weight power",
    tuning.branchSameLevelParentLengthWeightPower,
    0,
    12
  );
  validateOptionalTuningNumber(
    "Branch same-level parent-length weight floor",
    tuning.branchSameLevelParentLengthWeightFloorPercent,
    0,
    100
  );
  validateOptionalParentCurve(
    "Branch same-level parent capacity by height",
    tuning.branchSameLevelParentCapacityByHeightCurve,
    0,
    400
  );
  validateOptionalTuningNumber(
    "Branch minimum children per parent",
    tuning.branchMinimumChildrenPerParent,
    0,
    512,
    true
  );
  validateOptionalTuningNumber("Branch parent-length weight power", tuning.branchParentLengthWeightPower, 0, 8);
  validateOptionalTuningNumber(
    "Branch parent-length weight floor",
    tuning.branchParentLengthWeightFloorPercent,
    0,
    100
  );
  validateOptionalParentCurve("Branch parent capacity by height", tuning.branchParentCapacityByHeightCurve, 0, 400);
  validateOptionalTuningNumber(
    "Branch extension length percent of parent",
    tuning.branchExtensionLengthPercentOfParent,
    0.01,
    200
  );
  validateOptionalTuningNumber(
    "Branch extension length variation",
    tuning.branchExtensionLengthVariationPercent,
    0,
    100
  );
  validateOptionalParentCurve("Branch attachment progress", tuning.branchAttachmentProgressCurve, 0, 100, true);
  validateOptionalParentCurve(
    "Branch length by height",
    tuning.branchLengthByHeightCurve,
    PROCEDURAL_TREE_LENGTH_CURVE_MIN_PERCENT,
    PROCEDURAL_TREE_LENGTH_CURVE_MAX_PERCENT
  );
  validateOptionalParentCurve(
    "Branch length scale by distribution",
    tuning.branchLengthScaleByDistributionCurve,
    0,
    400
  );
  validateOptionalParentCurve("Branch down angle by height", tuning.branchDownAngleByHeightCurve, -180, 180);
  validateOptionalParentCurve(
    "Branch down-angle offset by distribution",
    tuning.branchDownAngleOffsetByDistributionCurve,
    -180,
    180
  );
  validateTuningNumber("Branch length percent of parent", tuning.branchLengthPercentOfParent, 0.01, 200);
  validateTuningNumber("Branch maximum length percent of height", tuning.branchMaximumLengthPercentOfHeight, 0.01, 200);
  validateTuningNumber("Branch length variation", tuning.branchLengthVariationPercent, 0, 100);
  validateOptionalTuningNumber("Branch radius scale", tuning.branchRadiusScalePercent, 1, 2000);
  validateOptionalParentCurve("Branch absolute radius by height", tuning.branchRadiusByHeightCurve, 0, 100);
  validateOptionalParentCurve(
    "Branch radius scale by distribution",
    tuning.branchRadiusScaleByDistributionCurve,
    0,
    400
  );
  validateOptionalParentCurve(
    "Branch shape variation scale by distribution",
    tuning.branchShapeVariationScaleByDistributionCurve,
    0,
    400
  );
  validateOptionalTuningNumber("Branch tip radius", tuning.branchTipRadiusPercentOfStart, 0, 100);
  validateOptionalTuningNumber(
    "Branch extension radius retention",
    tuning.branchExtensionRadiusRetentionPercent,
    0,
    100
  );
  validateOptionalTuningNumber("Branch parent-radius limit", tuning.branchParentRadiusLimitPercent, 1, 400);
  validateOptionalTuningNumber("Branch deterministic curve", tuning.branchCurveDegrees, -360, 360);
  validateOptionalTuningNumber("Branch curve back", tuning.branchCurveBackDegrees, -360, 360);
  validateTuningNumber("Branch curve variation", tuning.branchCurveVariationDegrees, 0, 360);
  validateOptionalTuningNumber("Branch curve segments", tuning.branchCurveSegments, 1, 64, true);
  validateOptionalTuningNumber("Branch late-noise amount", tuning.branchLateNoiseAmountDegrees, 0, 360);
  validateOptionalTuningNumber("Branch late-noise turbulence", tuning.branchLateNoiseTurbulence, 0, 16);
  validateOptionalTuningNumber("Branch late-noise smooth", tuning.branchLateNoiseSmoothPercent, 0, 100);
  validateOptionalParentCurve("Branch late-noise profile", tuning.branchLateNoiseByHeightCurve, 0, 400);
  validateOptionalSpinePath("Branch spine path", tuning.branchPathHarmonicsPercentOfLength);
  validateTuningNumber("Branch upward attraction", tuning.branchAttractionUp, -5, 5);
  validateOptionalTuningNumber("Branch outward attraction", tuning.branchAttractionOut, -5, 5);
  validateOptionalParentCurve(
    "Branch outward attraction by distribution",
    tuning.branchAttractionOutByDistributionCurve,
    -5,
    5
  );
  validateTuningNumber("Branch rotation", tuning.branchRotateDegrees, -360, 360);
  validateTuningNumber("Branch rotation variation", tuning.branchRotateVariationDegrees, 0, 180);
  validateOptionalModeTuple("Branch azimuth", tuning.branchAzimuthModesDegrees, tuning.branchAzimuthModeWeights);
  validateTuningNumber("Branch down angle", tuning.branchDownAngleDegrees, -180, 180);
  validateTuningNumber("Branch down-angle variation", tuning.branchDownAngleVariationDegrees, -180, 180);
  validateTuningNumber("Twig count", tuning.twigCount, 0, 512, true);
  validateOptionalGenerationMode("Twig generation", tuning.twigGenerationMode);
  validateOptionalTuningNumber("Twig bifurcation threshold", tuning.twigBifurcationThresholdDegrees, 0, 180);
  validateOptionalTuningNumber("Twig bifurcation spacing", tuning.twigBifurcationSpacingPercentOfParent, 0, 100);
  validateOptionalTuningNumber("Twig bifurcation balance", tuning.twigBifurcationBalancePercent, 0, 100);
  validateOptionalTuningNumber("Twig bifurcation align", tuning.twigBifurcationAlignPercent, 0, 100);
  validateOptionalTuningNumber(
    "Twig bifurcation distribution blend",
    tuning.twigBifurcationDistributionBlendPercent,
    0,
    100
  );
  validateOptionalParentCurve("Twig root-height distribution", tuning.twigRootHeightDistributionCurve, 0, 100, true);
  validateOptionalTuningNumber(
    "Twig root-height distribution blend",
    tuning.twigRootHeightDistributionBlendPercent,
    0,
    100
  );
  validateOptionalTuningNumber("Twig extension percent", tuning.twigExtensionPercent, 0, 100);
  validateOptionalSameLevelMode("Twig same-level", tuning.twigSameLevelMode);
  validateOptionalParentCurve(
    "Twig same-level attachment progress",
    tuning.twigSameLevelAttachmentProgressCurve,
    0,
    100,
    true
  );
  validateOptionalTuningNumber(
    "Twig same-level bifurcation distribution blend",
    tuning.twigSameLevelBifurcationDistributionBlendPercent,
    0,
    100
  );
  validateOptionalParentCurve(
    "Twig same-level root-height distribution",
    tuning.twigSameLevelRootHeightDistributionCurve,
    0,
    100,
    true
  );
  validateOptionalTuningNumber(
    "Twig same-level root-height distribution blend",
    tuning.twigSameLevelRootHeightDistributionBlendPercent,
    0,
    100
  );
  validateOptionalTuningNumber(
    "Twig same-level parent-length weight power",
    tuning.twigSameLevelParentLengthWeightPower,
    0,
    12
  );
  validateOptionalTuningNumber(
    "Twig same-level parent-length weight floor",
    tuning.twigSameLevelParentLengthWeightFloorPercent,
    0,
    100
  );
  validateOptionalParentCurve(
    "Twig same-level parent capacity by height",
    tuning.twigSameLevelParentCapacityByHeightCurve,
    0,
    400
  );
  validateOptionalTuningNumber("Twig minimum children per parent", tuning.twigMinimumChildrenPerParent, 0, 512, true);
  validateOptionalTuningNumber("Twig parent-length weight power", tuning.twigParentLengthWeightPower, 0, 8);
  validateOptionalTuningNumber("Twig parent-length weight floor", tuning.twigParentLengthWeightFloorPercent, 0, 100);
  validateOptionalParentCurve("Twig parent capacity by height", tuning.twigParentCapacityByHeightCurve, 0, 400);
  validateOptionalTuningNumber(
    "Twig extension length percent of parent",
    tuning.twigExtensionLengthPercentOfParent,
    0.01,
    200
  );
  validateOptionalTuningNumber("Twig extension length variation", tuning.twigExtensionLengthVariationPercent, 0, 100);
  validateOptionalParentCurve("Twig attachment progress", tuning.twigAttachmentProgressCurve, 0, 100, true);
  validateOptionalParentCurve(
    "Twig length by height",
    tuning.twigLengthByHeightCurve,
    PROCEDURAL_TREE_LENGTH_CURVE_MIN_PERCENT,
    PROCEDURAL_TREE_LENGTH_CURVE_MAX_PERCENT
  );
  validateOptionalParentCurve("Twig length scale by distribution", tuning.twigLengthScaleByDistributionCurve, 0, 400);
  validateOptionalParentCurve("Twig down angle by height", tuning.twigDownAngleByHeightCurve, -180, 180);
  validateOptionalParentCurve(
    "Twig down-angle offset by distribution",
    tuning.twigDownAngleOffsetByDistributionCurve,
    -180,
    180
  );
  validateTuningNumber("Twig length percent of parent", tuning.twigLengthPercentOfParent, 0.01, 200);
  validateTuningNumber("Twig maximum length percent of height", tuning.twigMaximumLengthPercentOfHeight, 0.01, 200);
  validateTuningNumber("Twig length variation", tuning.twigLengthVariationPercent, 0, 100);
  validateOptionalTuningNumber("Twig radius scale", tuning.twigRadiusScalePercent, 1, 2000);
  validateOptionalParentCurve("Twig absolute radius by height", tuning.twigRadiusByHeightCurve, 0, 100);
  validateOptionalParentCurve("Twig radius scale by distribution", tuning.twigRadiusScaleByDistributionCurve, 0, 400);
  validateOptionalParentCurve(
    "Twig shape variation scale by distribution",
    tuning.twigShapeVariationScaleByDistributionCurve,
    0,
    400
  );
  validateOptionalTuningNumber("Twig tip radius", tuning.twigTipRadiusPercentOfStart, 0, 100);
  validateOptionalTuningNumber("Twig extension radius retention", tuning.twigExtensionRadiusRetentionPercent, 0, 100);
  validateOptionalTuningNumber("Twig parent-radius limit", tuning.twigParentRadiusLimitPercent, 1, 400);
  validateOptionalTuningNumber("Twig deterministic curve", tuning.twigCurveDegrees, -360, 360);
  validateOptionalTuningNumber("Twig curve back", tuning.twigCurveBackDegrees, -360, 360);
  validateTuningNumber("Twig curve variation", tuning.twigCurveVariationDegrees, 0, 360);
  validateOptionalTuningNumber("Twig curve segments", tuning.twigCurveSegments, 1, 64, true);
  validateOptionalTuningNumber("Twig late-noise amount", tuning.twigLateNoiseAmountDegrees, 0, 360);
  validateOptionalTuningNumber("Twig late-noise turbulence", tuning.twigLateNoiseTurbulence, 0, 16);
  validateOptionalTuningNumber("Twig late-noise smooth", tuning.twigLateNoiseSmoothPercent, 0, 100);
  validateOptionalParentCurve("Twig late-noise profile", tuning.twigLateNoiseByHeightCurve, 0, 400);
  validateOptionalSpinePath("Twig spine path", tuning.twigPathHarmonicsPercentOfLength);
  validateTuningNumber("Twig upward attraction", tuning.twigAttractionUp, -5, 5);
  validateOptionalTuningNumber("Twig outward attraction", tuning.twigAttractionOut, -5, 5);
  validateOptionalParentCurve(
    "Twig outward attraction by distribution",
    tuning.twigAttractionOutByDistributionCurve,
    -5,
    5
  );
  validateTuningNumber("Twig attachment end percent", tuning.twigAttachmentEndPercentOfParent, 0, 100);
  validateTuningNumber("Twig rotation", tuning.twigRotateDegrees, -360, 360);
  validateTuningNumber("Twig rotation variation", tuning.twigRotateVariationDegrees, 0, 180);
  validateOptionalParentCurve("Twig local azimuth by height", tuning.twigAzimuthByHeightCurve, -720, 720);
  if (tuning.twigAzimuthModesDegrees || tuning.twigAzimuthModeWeights) {
    if (tuning.twigAzimuthModesDegrees?.length !== 3 || tuning.twigAzimuthModeWeights?.length !== 3) {
      throw new RangeError("Twig azimuth modes require exactly three angles and three weights");
    }
    tuning.twigAzimuthModesDegrees.forEach((value, index) =>
      validateTuningNumber(`Twig azimuth mode ${index}`, value, -360, 360)
    );
    tuning.twigAzimuthModeWeights.forEach((value, index) =>
      validateTuningNumber(`Twig azimuth mode weight ${index}`, value, 0, 1)
    );
    if (tuning.twigAzimuthModeWeights.reduce((sum, value) => sum + value, 0) <= 0) {
      throw new RangeError("Twig azimuth mode weights require a positive sum");
    }
  }
  validateTuningNumber("Twig down angle", tuning.twigDownAngleDegrees, -180, 180);
  validateTuningNumber("Twig down-angle variation", tuning.twigDownAngleVariationDegrees, -180, 180);
  validateTuningNumber("Leaf distribution", tuning.leafDistribution, 0, 7, true);
  if (tuning.leafCountByStem || tuning.leafFirstProgressPercentByStem || tuning.leafTerminalFractionPercentByStem) {
    const stemCount = tuning.trunkCount + tuning.branchCount + tuning.twigCount;
    if (
      tuning.leafCountByStem?.length !== stemCount ||
      tuning.leafFirstProgressPercentByStem?.length !== stemCount ||
      tuning.leafTerminalFractionPercentByStem?.length !== stemCount
    ) {
      throw new RangeError(`Per-stem leaf controls require exactly ${stemCount} Count/First/terminal values`);
    }
    tuning.leafCountByStem!.forEach((value, index) =>
      validateTuningNumber(`Leaf count stem ${index}`, value, 0, 4096, true)
    );
    tuning.leafFirstProgressPercentByStem!.forEach((value, index) =>
      validateTuningNumber(`Leaf First stem ${index}`, value, 0, 100)
    );
    tuning.leafTerminalFractionPercentByStem!.forEach((value, index) =>
      validateTuningNumber(`Leaf terminal fraction stem ${index}`, value, 0, 100)
    );
    if (tuning.leafCountByStem!.reduce((sum, value) => sum + value, 0) <= 0) {
      throw new RangeError("Per-stem leaf controls require at least one card");
    }
  }
  if (tuning.leafProgressExponentByStem) {
    const stemCount = tuning.trunkCount + tuning.branchCount + tuning.twigCount;
    if (tuning.leafProgressExponentByStem.length !== stemCount) {
      throw new RangeError(`Per-stem leaf progress exponents require exactly ${stemCount} values`);
    }
    tuning.leafProgressExponentByStem.forEach((value, index) =>
      validateTuningNumber(`Leaf progress exponent stem ${index}`, value, 0.05, 4)
    );
  }
  if (tuning.leafDensityScaleByLevel) {
    if (tuning.leafDensityScaleByLevel.length !== 3) {
      throw new RangeError("Leaf density by level requires exactly three values");
    }
    tuning.leafDensityScaleByLevel.forEach((value, level) =>
      validateTuningNumber(`Leaf density level ${level}`, value, 0, 20)
    );
  }
  validateOptionalParentCurve("Leaf density by height", tuning.leafDensityByHeightCurve, 0.01, 10);
  if (tuning.leafDensityByHeightProfile) {
    if (tuning.leafDensityByHeightProfile.length < 4 || tuning.leafDensityByHeightProfile.length > 64) {
      throw new RangeError("Leaf density height profile requires between four and 64 values");
    }
    tuning.leafDensityByHeightProfile.forEach((value, index) =>
      validateTuningNumber(`Leaf density height profile ${index}`, value, 0.01, 10)
    );
  }
  validateOptionalTuningNumber("Leaf length influence", tuning.leafLengthInfluencePercent, 0, 100);
  validateOptionalTuningNumber("Leaf distribution influence", tuning.leafDistributionInfluencePercent, 0, 100);
  validateOptionalTuningNumber("Leaf terminal fraction", tuning.leafTerminalFractionPercent, 0, 100);
  validateLevelTuple("Leaf terminal fraction by level", tuning.leafTerminalFractionPercentByLevel, 0, 100);
  validateOptionalTuningNumber("Leaf progress exponent", tuning.leafProgressExponent, 0.05, 4);
  validateLevelTuple("Leaf progress exponent by level", tuning.leafProgressExponentByLevel, 0.05, 4);
  validateTuningNumber("Leaf down angle", tuning.leafDownAngleDegrees, -180, 180);
  validateTuningNumber("Leaf down-angle variation", tuning.leafDownAngleVariationDegrees, -180, 180);
  validateTuningNumber("Leaf rotation", tuning.leafRotateDegrees, -360, 360);
  validateTuningNumber("Leaf rotation variation", tuning.leafRotateVariationDegrees, 0, 180);
  validateTuningNumber("Leaf spacing", tuning.leafSpacingPercent, 0, 100);
  validateOptionalTuningNumber("Leaf scale percent of height", tuning.leafScalePercentOfHeight, 0.01, 50);
  validateOptionalTuningNumber("Leaf aspect ratio", tuning.leafAspectRatio, 0.01, 20);
  validateOptionalTuningNumber("Leaf scale taper", tuning.leafScaleTaperPercent, -100, 100);
  validateTuningNumber("Leaf scale variation", tuning.leafScaleVariationPercent, 0, 100);
  validateOptionalTuningNumber("Leaf variant size blend", tuning.leafVariantSizeBlendPercent, 0, 100);
  validateOptionalTuningNumber("Leaf anchor offset percent of height", tuning.leafAnchorOffsetPercentOfHeight, 0, 20);
  validateOptionalTuningNumber("Leaf anchor offset variation", tuning.leafAnchorOffsetVariationPercent, 0, 100);
  validateOptionalTuningNumber("Leaf start progress", tuning.leafStartProgressPercentOfStem, 0, 100);
  if (tuning.leafStartProgressPercentByLevel) {
    if (tuning.leafStartProgressPercentByLevel.length !== 3) {
      throw new RangeError("Leaf start progress by level requires exactly three values");
    }
    tuning.leafStartProgressPercentByLevel.forEach((value, level) =>
      validateTuningNumber(`Leaf start progress level ${level}`, value, 0, 100)
    );
  }
  validateLevelTuple("Leaf start progress variation by level", tuning.leafStartProgressVariationPercentByLevel, 0, 100);
  validateLevelTuple("Leaf start progress minimum by level", tuning.leafStartProgressMinimumPercentByLevel, 0, 100);
  validateLevelTuple("Leaf start progress maximum by level", tuning.leafStartProgressMaximumPercentByLevel, 0, 100);
  validateLevelTuple(
    "Leaf start progress distribution exponent by level",
    tuning.leafStartProgressDistributionExponentByLevel,
    0.05,
    4
  );
  if (tuning.leafStartProgressMinimumPercentByLevel && tuning.leafStartProgressMaximumPercentByLevel) {
    tuning.leafStartProgressMinimumPercentByLevel.forEach((minimum, level) => {
      if (minimum > tuning.leafStartProgressMaximumPercentByLevel![level]) {
        throw new RangeError(`Leaf start progress minimum exceeds maximum at level ${level}`);
      }
    });
  }
  validateOptionalTuningNumber("Leaf roll", tuning.leafRollDegrees, -180, 180);
  validateOptionalTuningNumber("Leaf normal crown blend", tuning.leafNormalCrownBlendPercent, 0, 100);
  validateOptionalTuningNumber("Crown lobe count", tuning.crownLobeCount, 0, 12, true);
  validateOptionalTuningNumber("Crown lobe depth", tuning.crownLobeDepthPercent, 0, 95);
  validateOptionalTuningNumber("Crown lobe phase", tuning.crownLobePhaseDegrees, -360, 360);
  validateOptionalTuningNumber("Crown X asymmetry", tuning.crownAsymmetryXPercent, -95, 200);
  validateOptionalTuningNumber("Crown Z asymmetry", tuning.crownAsymmetryZPercent, -95, 200);
  validateOptionalTuningNumber("Crown maximum height", tuning.crownMaximumHeightPercentOfHeight, 1, 150);
}

function validateProceduralTreeFoliageGeometryTuning(tuning: ProceduralTreeFoliageGeometryTuning): void {
  validateTuningNumber("Leaf width scale", tuning.widthScale, 0.01, 3);
  validateTuningNumber("Leaf height scale", tuning.heightScale, 0.01, 3);
  validateTuningNumber("Leaf additive half extent", tuning.additiveHalfExtent, 0, 10);
  if (tuning.lodScales) {
    if (tuning.lodScales.length !== PROCEDURAL_TREE_LOD_COUNT) {
      throw new RangeError("Leaf LOD scales require exactly four values");
    }
    tuning.lodScales.forEach((value, lodIndex) => validateTuningNumber(`Leaf LOD${lodIndex} scale`, value, 0.01, 10));
  }
}

function validateProceduralTreeTriangleBudgetTuning(tuning: ProceduralTreeTriangleBudgetTuning): void {
  if (tuning.maxTrianglesPerLod.length !== PROCEDURAL_TREE_LOD_COUNT) {
    throw new RangeError("Procedural tree triangle budget requires exactly four LOD ceilings");
  }
  tuning.maxTrianglesPerLod.forEach((limit, lodIndex) =>
    validateTuningNumber(`LOD${lodIndex} triangle ceiling`, limit, 0, Number.MAX_SAFE_INTEGER, true)
  );
  if (tuning.preferredTrianglesPerLod) {
    if (tuning.preferredTrianglesPerLod.length !== PROCEDURAL_TREE_LOD_COUNT) {
      throw new RangeError("Procedural tree preferred triangle targets require exactly four values");
    }
    tuning.preferredTrianglesPerLod.forEach((target, lodIndex) => {
      validateTuningNumber(`LOD${lodIndex} preferred triangle target`, target, 0, Number.MAX_SAFE_INTEGER, true);
      if (target > tuning.maxTrianglesPerLod[lodIndex]) {
        throw new RangeError(`LOD${lodIndex} preferred triangle target cannot exceed its hard ceiling`);
      }
    });
  }
}

function applyProceduralTreeDistributionTuning(
  parameters: SaplingTreeParameters,
  tuning: ProceduralTreeDistributionTuning
): SaplingTreeParameters {
  return {
    ...parameters,
    trunkLengthRatio: (tuning.trunkLengthPercentOfHeight ?? 100) / 100,
    trunkTipRadiusRatio: (tuning.trunkTipRadiusPercentOfBase ?? 0) / 100 || undefined,
    rootFlare: tuning.trunkRootFlare ?? parameters.rootFlare,
    curveResolution: [
      tuning.trunkCurveSegments ?? parameters.curveResolution[0],
      tuning.branchCurveSegments ?? parameters.curveResolution[1],
      tuning.twigCurveSegments ?? parameters.curveResolution[2],
      parameters.curveResolution[3]
    ],
    branchWhorlSize: tuning.branchWhorlSize ?? 1,
    branchWhorlCount: tuning.branchWhorlCount,
    branchWhorlSizes: tuning.branchWhorlSizes,
    branchWhorlAttachmentProgress: tuning.branchWhorlAttachmentProgressPercent?.map((value) => value / 100),
    branchWhorlSpread: (tuning.branchWhorlSpreadPercentOfParent ?? 0) / 100,
    branchWhorlPhaseByHeightCurve: tuning.branchWhorlPhaseByHeightCurve,
    branchGenerationMode: tuning.branchGenerationMode,
    twigGenerationMode: tuning.twigGenerationMode,
    branchSameLevelMode: tuning.branchSameLevelMode,
    twigSameLevelMode: tuning.twigSameLevelMode,
    branchBifurcationThreshold: degreesToRadians(tuning.branchBifurcationThresholdDegrees ?? 0),
    branchBifurcationSpacing: (tuning.branchBifurcationSpacingPercentOfParent ?? 0) / 100,
    branchBifurcationBalance: (tuning.branchBifurcationBalancePercent ?? 100) / 100,
    branchBifurcationAlign: (tuning.branchBifurcationAlignPercent ?? 0) / 100,
    branchBifurcationDistributionBlend: (tuning.branchBifurcationDistributionBlendPercent ?? 0) / 100,
    branchSameLevelBifurcationDistributionBlend:
      (tuning.branchSameLevelBifurcationDistributionBlendPercent ??
        tuning.branchBifurcationDistributionBlendPercent ??
        0) / 100,
    branchRootHeightDistributionCurve: tuning.branchRootHeightDistributionCurve,
    branchRootHeightDistributionBlend: (tuning.branchRootHeightDistributionBlendPercent ?? 0) / 100,
    branchSameLevelRootHeightDistributionCurve:
      tuning.branchSameLevelRootHeightDistributionCurve ?? tuning.branchRootHeightDistributionCurve,
    branchSameLevelRootHeightDistributionBlend:
      (tuning.branchSameLevelRootHeightDistributionBlendPercent ??
        tuning.branchRootHeightDistributionBlendPercent ??
        0) / 100,
    twigBifurcationThreshold: degreesToRadians(tuning.twigBifurcationThresholdDegrees ?? 0),
    twigBifurcationSpacing: (tuning.twigBifurcationSpacingPercentOfParent ?? 0) / 100,
    twigBifurcationBalance: (tuning.twigBifurcationBalancePercent ?? 100) / 100,
    twigBifurcationAlign: (tuning.twigBifurcationAlignPercent ?? 0) / 100,
    twigBifurcationDistributionBlend: (tuning.twigBifurcationDistributionBlendPercent ?? 0) / 100,
    twigSameLevelBifurcationDistributionBlend:
      (tuning.twigSameLevelBifurcationDistributionBlendPercent ?? tuning.twigBifurcationDistributionBlendPercent ?? 0) /
      100,
    twigRootHeightDistributionCurve: tuning.twigRootHeightDistributionCurve,
    twigRootHeightDistributionBlend: (tuning.twigRootHeightDistributionBlendPercent ?? 0) / 100,
    twigSameLevelRootHeightDistributionCurve:
      tuning.twigSameLevelRootHeightDistributionCurve ?? tuning.twigRootHeightDistributionCurve,
    twigSameLevelRootHeightDistributionBlend:
      (tuning.twigSameLevelRootHeightDistributionBlendPercent ?? tuning.twigRootHeightDistributionBlendPercent ?? 0) /
      100,
    branchAzimuthModesDegrees: tuning.branchAzimuthModesDegrees,
    branchAzimuthModeWeights: tuning.branchAzimuthModeWeights,
    branchExtensionFraction:
      tuning.branchExtensionPercent === undefined ? undefined : tuning.branchExtensionPercent / 100,
    twigExtensionFraction: tuning.twigExtensionPercent === undefined ? undefined : tuning.twigExtensionPercent / 100,
    minimumChildrenPerParent: [
      0,
      tuning.branchMinimumChildrenPerParent ?? 1,
      tuning.twigMinimumChildrenPerParent ?? 1,
      0
    ],
    parentLengthWeightPower: [1, tuning.branchParentLengthWeightPower ?? 1, tuning.twigParentLengthWeightPower ?? 1, 1],
    parentLengthWeightFloor: [
      0,
      (tuning.branchParentLengthWeightFloorPercent ?? 10) / 100,
      (tuning.twigParentLengthWeightFloorPercent ?? 10) / 100,
      0
    ],
    sameLevelParentLengthWeightPower: [
      1,
      tuning.branchSameLevelParentLengthWeightPower ?? tuning.branchParentLengthWeightPower ?? 1,
      tuning.twigSameLevelParentLengthWeightPower ?? tuning.twigParentLengthWeightPower ?? 1,
      1
    ],
    sameLevelParentLengthWeightFloor: [
      0,
      (tuning.branchSameLevelParentLengthWeightFloorPercent ?? tuning.branchParentLengthWeightFloorPercent ?? 10) / 100,
      (tuning.twigSameLevelParentLengthWeightFloorPercent ?? tuning.twigParentLengthWeightFloorPercent ?? 10) / 100,
      0
    ],
    branchParentCapacityByHeightCurve: tuning.branchParentCapacityByHeightCurve,
    twigParentCapacityByHeightCurve: tuning.twigParentCapacityByHeightCurve,
    branchSameLevelParentCapacityByHeightCurve:
      tuning.branchSameLevelParentCapacityByHeightCurve ?? tuning.branchParentCapacityByHeightCurve,
    twigSameLevelParentCapacityByHeightCurve:
      tuning.twigSameLevelParentCapacityByHeightCurve ?? tuning.twigParentCapacityByHeightCurve,
    extensionLengthRatio: [
      0,
      (tuning.branchExtensionLengthPercentOfParent ?? 0) / 100,
      (tuning.twigExtensionLengthPercentOfParent ?? 0) / 100,
      0
    ],
    extensionLengthVariation: [
      0,
      (tuning.branchExtensionLengthVariationPercent ?? 0) / 100,
      (tuning.twigExtensionLengthVariationPercent ?? 0) / 100,
      0
    ],
    branchAttachmentProgressCurve: tuning.branchAttachmentProgressCurve,
    twigAttachmentProgressCurve: tuning.twigAttachmentProgressCurve,
    branchSameLevelAttachmentProgressCurve:
      tuning.branchSameLevelAttachmentProgressCurve ?? tuning.branchAttachmentProgressCurve,
    twigSameLevelAttachmentProgressCurve:
      tuning.twigSameLevelAttachmentProgressCurve ?? tuning.twigAttachmentProgressCurve,
    branchLengthByHeightCurve: tuning.branchLengthByHeightCurve,
    branchLengthScaleByDistributionCurve: tuning.branchLengthScaleByDistributionCurve,
    twigLengthByHeightCurve: tuning.twigLengthByHeightCurve,
    twigLengthScaleByDistributionCurve: tuning.twigLengthScaleByDistributionCurve,
    branchDownAngleByHeightCurve: tuning.branchDownAngleByHeightCurve,
    branchDownAngleOffsetByDistributionCurve: tuning.branchDownAngleOffsetByDistributionCurve,
    twigDownAngleByHeightCurve: tuning.twigDownAngleByHeightCurve,
    twigDownAngleOffsetByDistributionCurve: tuning.twigDownAngleOffsetByDistributionCurve,
    branchShapeVariationScaleByDistributionCurve: tuning.branchShapeVariationScaleByDistributionCurve,
    twigShapeVariationScaleByDistributionCurve: tuning.twigShapeVariationScaleByDistributionCurve,
    branchAttractionOutByDistributionCurve: tuning.branchAttractionOutByDistributionCurve,
    twigAttractionOutByDistributionCurve: tuning.twigAttractionOutByDistributionCurve,
    twigAzimuthByHeightCurve: tuning.twigAzimuthByHeightCurve,
    twigAzimuthModesDegrees: tuning.twigAzimuthModesDegrees,
    twigAzimuthModeWeights: tuning.twigAzimuthModeWeights,
    leafDensityByHeightCurve: tuning.leafDensityByHeightCurve,
    leafDensityByHeightProfile: tuning.leafDensityByHeightProfile,
    leafDensityScaleByLevel: tuning.leafDensityScaleByLevel,
    leafCountByStem: tuning.leafCountByStem,
    leafFirstProgressByStem: tuning.leafFirstProgressPercentByStem?.map((value) => value / 100),
    leafTerminalFractionByStem: tuning.leafTerminalFractionPercentByStem?.map((value) => value / 100),
    leafProgressExponentByStem: tuning.leafProgressExponentByStem,
    leafLengthInfluence: (tuning.leafLengthInfluencePercent ?? 90) / 100,
    leafDistributionInfluence: (tuning.leafDistributionInfluencePercent ?? 100) / 100,
    leafTerminalFraction:
      tuning.leafTerminalFractionPercent === undefined ? undefined : tuning.leafTerminalFractionPercent / 100,
    leafTerminalFractionByLevel: tuning.leafTerminalFractionPercentByLevel?.map((value) => value / 100) as
      | [number, number, number]
      | undefined,
    leafProgressExponent: tuning.leafProgressExponent ?? 1,
    leafProgressExponentByLevel: tuning.leafProgressExponentByLevel,
    childRadiusScale: [
      1,
      (tuning.branchRadiusScalePercent ?? 100) / 100,
      (tuning.twigRadiusScalePercent ?? 100) / 100,
      1
    ],
    childParentRadiusLimit: [
      1,
      (tuning.branchParentRadiusLimitPercent ?? 100) / 100,
      (tuning.twigParentRadiusLimitPercent ?? 100) / 100,
      1
    ],
    childRadiusByHeightCurve: [undefined, tuning.branchRadiusByHeightCurve, tuning.twigRadiusByHeightCurve, undefined],
    childRadiusScaleByDistributionCurve: [
      undefined,
      tuning.branchRadiusScaleByDistributionCurve,
      tuning.twigRadiusScaleByDistributionCurve,
      undefined
    ],
    extensionRadiusRetention: [
      1,
      (tuning.branchExtensionRadiusRetentionPercent ?? 100) / 100,
      (tuning.twigExtensionRadiusRetentionPercent ?? 100) / 100,
      1
    ],
    childTipRadiusRatio: [
      0,
      (tuning.branchTipRadiusPercentOfStart ?? 0) / 100,
      (tuning.twigTipRadiusPercentOfStart ?? 0) / 100,
      0
    ],
    leafScale: (tuning.leafScalePercentOfHeight ?? parameters.leafScale * 100) / 100,
    leafScaleX: tuning.leafAspectRatio ?? parameters.leafScaleX,
    leafScaleTaper: (tuning.leafScaleTaperPercent ?? parameters.leafScaleTaper * 100) / 100,
    leafVariantSizeBlend: (tuning.leafVariantSizeBlendPercent ?? 100) / 100,
    leafAnchorOffsetRatio: (tuning.leafAnchorOffsetPercentOfHeight ?? 0) / 100,
    leafAnchorOffsetVariation: (tuning.leafAnchorOffsetVariationPercent ?? 0) / 100,
    leafStartProgress:
      tuning.leafStartProgressPercentOfStem === undefined ? undefined : tuning.leafStartProgressPercentOfStem / 100,
    leafStartProgressByLevel: tuning.leafStartProgressPercentByLevel?.map((value) => value / 100) as
      | [number, number, number]
      | undefined,
    leafStartProgressVariationByLevel: tuning.leafStartProgressVariationPercentByLevel?.map((value) => value / 100) as
      | [number, number, number]
      | undefined,
    leafStartProgressMinimumByLevel: tuning.leafStartProgressMinimumPercentByLevel?.map((value) => value / 100) as
      | [number, number, number]
      | undefined,
    leafStartProgressMaximumByLevel: tuning.leafStartProgressMaximumPercentByLevel?.map((value) => value / 100) as
      | [number, number, number]
      | undefined,
    leafStartProgressDistributionExponentByLevel: tuning.leafStartProgressDistributionExponentByLevel,
    leafAngle: tuning.leafRollDegrees ?? parameters.leafAngle,
    parentPuffiness: (tuning.leafNormalCrownBlendPercent ?? parameters.parentPuffiness * 100) / 100,
    crownLobeCount: tuning.crownLobeCount ?? 0,
    crownLobeDepth: (tuning.crownLobeDepthPercent ?? 0) / 100,
    crownLobePhase: degreesToRadians(tuning.crownLobePhaseDegrees ?? 0),
    crownAsymmetryX: (tuning.crownAsymmetryXPercent ?? 0) / 100,
    crownAsymmetryZ: (tuning.crownAsymmetryZPercent ?? 0) / 100,
    crownMaximumHeightRatio: (tuning.crownMaximumHeightPercentOfHeight ?? 150) / 100,
    length: [
      parameters.length[0],
      tuning.branchLengthPercentOfParent / 100,
      tuning.twigLengthPercentOfParent / 100,
      parameters.length[3]
    ],
    maximumLengthRatio: [
      parameters.maximumLengthRatio[0],
      tuning.branchMaximumLengthPercentOfHeight / 100,
      tuning.twigMaximumLengthPercentOfHeight / 100,
      parameters.maximumLengthRatio[3]
    ],
    lengthVariation: [
      parameters.lengthVariation[0],
      tuning.branchLengthVariationPercent / 100,
      tuning.twigLengthVariationPercent / 100,
      parameters.lengthVariation[3]
    ],
    curveVariation: [
      tuning.trunkCurveVariationDegrees,
      tuning.branchCurveVariationDegrees,
      tuning.twigCurveVariationDegrees,
      parameters.curveVariation[3]
    ],
    curve: [
      parameters.curve[0],
      tuning.branchCurveDegrees ?? parameters.curve[1],
      tuning.twigCurveDegrees ?? parameters.curve[2],
      parameters.curve[3]
    ],
    curveBack: [
      parameters.curveBack[0],
      tuning.branchCurveBackDegrees ?? parameters.curveBack[1],
      tuning.twigCurveBackDegrees ?? parameters.curveBack[2],
      parameters.curveBack[3]
    ],
    lateNoiseAmount: [
      tuning.trunkLateNoiseAmountDegrees ?? parameters.lateNoiseAmount[0],
      tuning.branchLateNoiseAmountDegrees ?? parameters.lateNoiseAmount[1],
      tuning.twigLateNoiseAmountDegrees ?? parameters.lateNoiseAmount[2],
      parameters.lateNoiseAmount[3]
    ],
    lateNoiseTurbulence: [
      tuning.trunkLateNoiseTurbulence ?? parameters.lateNoiseTurbulence[0],
      tuning.branchLateNoiseTurbulence ?? parameters.lateNoiseTurbulence[1],
      tuning.twigLateNoiseTurbulence ?? parameters.lateNoiseTurbulence[2],
      parameters.lateNoiseTurbulence[3]
    ],
    lateNoiseSmooth: [
      (tuning.trunkLateNoiseSmoothPercent ?? parameters.lateNoiseSmooth[0] * 100) / 100,
      (tuning.branchLateNoiseSmoothPercent ?? parameters.lateNoiseSmooth[1] * 100) / 100,
      (tuning.twigLateNoiseSmoothPercent ?? parameters.lateNoiseSmooth[2] * 100) / 100,
      parameters.lateNoiseSmooth[3]
    ],
    lateNoiseProfile: [
      tuning.trunkLateNoiseByHeightCurve ?? parameters.lateNoiseProfile[0],
      tuning.branchLateNoiseByHeightCurve ?? parameters.lateNoiseProfile[1],
      tuning.twigLateNoiseByHeightCurve ?? parameters.lateNoiseProfile[2],
      parameters.lateNoiseProfile[3]
    ],
    spinePathHarmonics: [
      tuning.trunkPathHarmonicsPercentOfLength ?? parameters.spinePathHarmonics[0],
      tuning.branchPathHarmonicsPercentOfLength ?? parameters.spinePathHarmonics[1],
      tuning.twigPathHarmonicsPercentOfLength ?? parameters.spinePathHarmonics[2],
      parameters.spinePathHarmonics[3]
    ],
    attractUp: [parameters.attractUp[0], tuning.branchAttractionUp, tuning.twigAttractionUp, parameters.attractUp[3]],
    attractOut: [
      parameters.attractOut[0],
      tuning.branchAttractionOut ?? parameters.attractOut[1],
      tuning.twigAttractionOut ?? parameters.attractOut[2],
      parameters.attractOut[3]
    ],
    twigAttachmentEndRatio: tuning.twigAttachmentEndPercentOfParent / 100,
    downAngle: [
      parameters.downAngle[0],
      tuning.branchDownAngleDegrees,
      tuning.twigDownAngleDegrees,
      parameters.downAngle[3]
    ],
    downAngleVariation: [
      parameters.downAngleVariation[0],
      tuning.branchDownAngleVariationDegrees,
      tuning.twigDownAngleVariationDegrees,
      parameters.downAngleVariation[3]
    ],
    rotate: [tuning.trunkRotateDegrees, tuning.branchRotateDegrees, tuning.twigRotateDegrees, parameters.rotate[3]],
    rotateVariation: [
      tuning.trunkRotateVariationDegrees,
      tuning.branchRotateVariationDegrees,
      tuning.twigRotateVariationDegrees,
      parameters.rotateVariation[3]
    ],
    baseSplits: tuning.trunkCount - 1,
    trunkClearHeightRatio: tuning.trunkClearHeightPercentOfHeight / 100,
    splitAngle: [
      tuning.trunkSplitAngleDegrees,
      parameters.splitAngle[1],
      parameters.splitAngle[2],
      parameters.splitAngle[3]
    ],
    splitAngleVariation: [
      tuning.trunkSplitAngleVariationDegrees,
      parameters.splitAngleVariation[1],
      parameters.splitAngleVariation[2],
      parameters.splitAngleVariation[3]
    ],
    ratio: tuning.trunkRadiusPercentOfHeight / 100,
    scaleVariation: tuning.treeHeightVariationPercent / 100,
    scaleVariation0: tuning.trunkRadiusVariationPercent / 100,
    runtimeBranchBudget: [tuning.trunkCount, tuning.branchCount, tuning.twigCount],
    leafDistribution: tuning.leafDistribution,
    leafDownAngle: tuning.leafDownAngleDegrees,
    leafDownAngleVariation: tuning.leafDownAngleVariationDegrees,
    leafRotate: tuning.leafRotateDegrees,
    leafRotateVariation: tuning.leafRotateVariationDegrees,
    leafScaleVariation: tuning.leafScaleVariationPercent / 100
  };
}

function detachDistributionTuning(tuning: ProceduralTreeDistributionTuning): ProceduralTreeDistributionTuning {
  return { ...tuning };
}

function distributionCacheKey(tuning: ProceduralTreeDistributionTuning): string {
  return [
    tuning.geometrySeed,
    tuning.trunkSeed,
    tuning.branchSeed,
    tuning.twigSeed,
    tuning.leafSeed,
    tuning.trunkLateNoiseSeed,
    tuning.branchLateNoiseSeed,
    tuning.twigLateNoiseSeed,
    tuning.trunkCount,
    tuning.trunkLengthPercentOfHeight,
    tuning.treeHeightVariationPercent,
    tuning.trunkClearHeightPercentOfHeight,
    tuning.trunkRadiusPercentOfHeight,
    tuning.trunkTipRadiusPercentOfBase,
    tuning.trunkRootFlare,
    tuning.trunkRadiusVariationPercent,
    tuning.trunkCurveSegments,
    tuning.trunkCurveVariationDegrees,
    tuning.trunkLateNoiseAmountDegrees,
    tuning.trunkLateNoiseTurbulence,
    tuning.trunkLateNoiseSmoothPercent,
    tuning.trunkLateNoiseByHeightCurve?.join(","),
    tuning.trunkPathHarmonicsPercentOfLength?.join(","),
    tuning.trunkSplitAngleDegrees,
    tuning.trunkSplitAngleVariationDegrees,
    tuning.trunkRotateDegrees,
    tuning.trunkRotateVariationDegrees,
    tuning.branchCount,
    tuning.branchGenerationMode,
    tuning.branchBifurcationThresholdDegrees,
    tuning.branchBifurcationSpacingPercentOfParent,
    tuning.branchBifurcationBalancePercent,
    tuning.branchBifurcationAlignPercent,
    tuning.branchBifurcationDistributionBlendPercent,
    tuning.branchSameLevelBifurcationDistributionBlendPercent,
    tuning.branchRootHeightDistributionCurve?.join(","),
    tuning.branchRootHeightDistributionBlendPercent,
    tuning.branchSameLevelRootHeightDistributionCurve?.join(","),
    tuning.branchSameLevelRootHeightDistributionBlendPercent,
    tuning.branchWhorlSize,
    tuning.branchWhorlCount,
    tuning.branchWhorlSizes?.join(","),
    tuning.branchWhorlAttachmentProgressPercent?.join(","),
    tuning.branchWhorlSpreadPercentOfParent,
    tuning.branchWhorlPhaseByHeightCurve?.join(","),
    tuning.branchExtensionPercent,
    tuning.branchSameLevelMode,
    tuning.branchSameLevelAttachmentProgressCurve?.join(","),
    tuning.branchSameLevelParentLengthWeightPower,
    tuning.branchSameLevelParentLengthWeightFloorPercent,
    tuning.branchSameLevelParentCapacityByHeightCurve?.join(","),
    tuning.branchMinimumChildrenPerParent,
    tuning.branchParentLengthWeightPower,
    tuning.branchParentLengthWeightFloorPercent,
    tuning.branchParentCapacityByHeightCurve?.join(","),
    tuning.branchExtensionLengthPercentOfParent,
    tuning.branchExtensionLengthVariationPercent,
    tuning.branchAttachmentProgressCurve?.join(","),
    tuning.branchLengthByHeightCurve?.join(","),
    tuning.branchLengthScaleByDistributionCurve?.join(","),
    tuning.branchDownAngleByHeightCurve?.join(","),
    tuning.branchDownAngleOffsetByDistributionCurve?.join(","),
    tuning.branchLengthPercentOfParent,
    tuning.branchMaximumLengthPercentOfHeight,
    tuning.branchLengthVariationPercent,
    tuning.branchCurveSegments,
    tuning.branchRadiusScalePercent,
    tuning.branchRadiusByHeightCurve?.join(","),
    tuning.branchRadiusScaleByDistributionCurve?.join(","),
    tuning.branchShapeVariationScaleByDistributionCurve?.join(","),
    tuning.branchTipRadiusPercentOfStart,
    tuning.branchExtensionRadiusRetentionPercent,
    tuning.branchParentRadiusLimitPercent,
    tuning.branchCurveDegrees,
    tuning.branchCurveBackDegrees,
    tuning.branchCurveVariationDegrees,
    tuning.branchLateNoiseAmountDegrees,
    tuning.branchLateNoiseTurbulence,
    tuning.branchLateNoiseSmoothPercent,
    tuning.branchLateNoiseByHeightCurve?.join(","),
    tuning.branchPathHarmonicsPercentOfLength?.join(","),
    tuning.branchAttractionUp,
    tuning.branchAttractionOut,
    tuning.branchAttractionOutByDistributionCurve?.join(","),
    tuning.branchRotateDegrees,
    tuning.branchRotateVariationDegrees,
    tuning.branchAzimuthModesDegrees?.join(","),
    tuning.branchAzimuthModeWeights?.join(","),
    tuning.branchDownAngleDegrees,
    tuning.branchDownAngleVariationDegrees,
    tuning.twigCount,
    tuning.twigGenerationMode,
    tuning.twigBifurcationThresholdDegrees,
    tuning.twigBifurcationSpacingPercentOfParent,
    tuning.twigBifurcationBalancePercent,
    tuning.twigBifurcationAlignPercent,
    tuning.twigBifurcationDistributionBlendPercent,
    tuning.twigSameLevelBifurcationDistributionBlendPercent,
    tuning.twigRootHeightDistributionCurve?.join(","),
    tuning.twigRootHeightDistributionBlendPercent,
    tuning.twigSameLevelRootHeightDistributionCurve?.join(","),
    tuning.twigSameLevelRootHeightDistributionBlendPercent,
    tuning.twigExtensionPercent,
    tuning.twigSameLevelMode,
    tuning.twigSameLevelAttachmentProgressCurve?.join(","),
    tuning.twigSameLevelParentLengthWeightPower,
    tuning.twigSameLevelParentLengthWeightFloorPercent,
    tuning.twigSameLevelParentCapacityByHeightCurve?.join(","),
    tuning.twigMinimumChildrenPerParent,
    tuning.twigParentLengthWeightPower,
    tuning.twigParentLengthWeightFloorPercent,
    tuning.twigParentCapacityByHeightCurve?.join(","),
    tuning.twigExtensionLengthPercentOfParent,
    tuning.twigExtensionLengthVariationPercent,
    tuning.twigAttachmentProgressCurve?.join(","),
    tuning.twigLengthByHeightCurve?.join(","),
    tuning.twigLengthScaleByDistributionCurve?.join(","),
    tuning.twigDownAngleByHeightCurve?.join(","),
    tuning.twigDownAngleOffsetByDistributionCurve?.join(","),
    tuning.twigLengthPercentOfParent,
    tuning.twigMaximumLengthPercentOfHeight,
    tuning.twigLengthVariationPercent,
    tuning.twigCurveSegments,
    tuning.twigRadiusScalePercent,
    tuning.twigRadiusByHeightCurve?.join(","),
    tuning.twigRadiusScaleByDistributionCurve?.join(","),
    tuning.twigShapeVariationScaleByDistributionCurve?.join(","),
    tuning.twigTipRadiusPercentOfStart,
    tuning.twigExtensionRadiusRetentionPercent,
    tuning.twigParentRadiusLimitPercent,
    tuning.twigCurveDegrees,
    tuning.twigCurveBackDegrees,
    tuning.twigCurveVariationDegrees,
    tuning.twigLateNoiseAmountDegrees,
    tuning.twigLateNoiseTurbulence,
    tuning.twigLateNoiseSmoothPercent,
    tuning.twigLateNoiseByHeightCurve?.join(","),
    tuning.twigPathHarmonicsPercentOfLength?.join(","),
    tuning.twigAttractionUp,
    tuning.twigAttractionOut,
    tuning.twigAttractionOutByDistributionCurve?.join(","),
    tuning.twigAttachmentEndPercentOfParent,
    tuning.twigRotateDegrees,
    tuning.twigRotateVariationDegrees,
    tuning.twigAzimuthByHeightCurve?.join(","),
    tuning.twigAzimuthModesDegrees?.join(","),
    tuning.twigAzimuthModeWeights?.join(","),
    tuning.twigDownAngleDegrees,
    tuning.twigDownAngleVariationDegrees,
    tuning.leafDistribution,
    tuning.leafCountByStem?.join(","),
    tuning.leafFirstProgressPercentByStem?.join(","),
    tuning.leafTerminalFractionPercentByStem?.join(","),
    tuning.leafProgressExponentByStem?.join(","),
    tuning.leafDensityScaleByLevel?.join(","),
    tuning.leafDensityByHeightCurve?.join(","),
    tuning.leafDensityByHeightProfile?.join(","),
    tuning.leafLengthInfluencePercent,
    tuning.leafDistributionInfluencePercent,
    tuning.leafTerminalFractionPercent,
    tuning.leafTerminalFractionPercentByLevel?.join(","),
    tuning.leafProgressExponent,
    tuning.leafProgressExponentByLevel?.join(","),
    tuning.leafDownAngleDegrees,
    tuning.leafDownAngleVariationDegrees,
    tuning.leafRotateDegrees,
    tuning.leafRotateVariationDegrees,
    tuning.leafSpacingPercent,
    tuning.leafScalePercentOfHeight,
    tuning.leafAspectRatio,
    tuning.leafScaleTaperPercent,
    tuning.leafScaleVariationPercent,
    tuning.leafVariantSizeBlendPercent,
    tuning.leafAnchorOffsetPercentOfHeight,
    tuning.leafAnchorOffsetVariationPercent,
    tuning.leafStartProgressPercentOfStem,
    tuning.leafStartProgressPercentByLevel?.join(","),
    tuning.leafStartProgressVariationPercentByLevel?.join(","),
    tuning.leafStartProgressMinimumPercentByLevel?.join(","),
    tuning.leafStartProgressMaximumPercentByLevel?.join(","),
    tuning.leafStartProgressDistributionExponentByLevel?.join(","),
    tuning.leafRollDegrees,
    tuning.leafNormalCrownBlendPercent,
    tuning.crownLobeCount,
    tuning.crownLobeDepthPercent,
    tuning.crownLobePhaseDegrees,
    tuning.crownAsymmetryXPercent,
    tuning.crownAsymmetryZPercent,
    tuning.crownMaximumHeightPercentOfHeight
  ].join(":");
}

function validateTuningNumber(label: string, value: number, minimum: number, maximum: number, integer = false): void {
  if (!Number.isFinite(value) || (integer && !Number.isInteger(value)) || value < minimum || value > maximum) {
    throw new RangeError(
      `${label} must be ${integer ? "an integer " : ""}between ${minimum} and ${maximum}; received ${value}`
    );
  }
}

function validateFiniteNumber(label: string, value: number): void {
  if (!Number.isFinite(value)) throw new RangeError(`${label} must be finite; received ${value}`);
}

function validatePositiveFiniteNumber(label: string, value: number): void {
  validateFiniteNumber(label, value);
  if (value <= 0) throw new RangeError(`${label} must be positive; received ${value}`);
}

function validateOptionalTuningNumber(
  label: string,
  value: number | undefined,
  minimum: number,
  maximum: number,
  integer = false
): void {
  if (value !== undefined) validateTuningNumber(label, value, minimum, maximum, integer);
}

function validateLevelTuple(
  label: string,
  values: readonly [number, number, number] | undefined,
  minimum: number,
  maximum: number
): void {
  if (!values) return;
  if (values.length !== 3) throw new RangeError(`${label} requires exactly three values`);
  values.forEach((value, level) => validateTuningNumber(`${label} level ${level}`, value, minimum, maximum));
}

function validateOptionalModeTuple(
  label: string,
  modes: ProceduralTreeModeTuple | undefined,
  weights: ProceduralTreeModeTuple | undefined
): void {
  if (!modes && !weights) return;
  if (!modes || !weights || modes.length !== 3 || weights.length !== 3) {
    throw new RangeError(`${label} modes require exactly three angles and three weights`);
  }
  modes.forEach((value, index) => validateTuningNumber(`${label} mode ${index}`, value, -360, 360));
  weights.forEach((value, index) => validateTuningNumber(`${label} mode weight ${index}`, value, 0, 1));
  if (weights.reduce((sum, value) => sum + value, 0) <= 0) {
    throw new RangeError(`${label} mode weights require a positive sum`);
  }
}

function validateOptionalSeed(label: string, value: number | undefined): void {
  validateOptionalTuningNumber(label, value, 0, 0xffffffff, true);
}

function validateOptionalGenerationMode(label: string, value: ProceduralTreeGenerationMode | undefined): void {
  if (value === undefined) return;
  if (!["proportional", "steps", "interval", "bifurcation"].includes(value)) {
    throw new RangeError(`${label} mode is unsupported: ${value}`);
  }
}

function validateOptionalSameLevelMode(label: string, value: ProceduralTreeSameLevelMode | undefined): void {
  if (value === undefined) return;
  if (!["tip-continuation", "distributed-branching"].includes(value)) {
    throw new RangeError(`${label} mode is unsupported: ${value}`);
  }
}

function validateOptionalParentCurve(
  label: string,
  curve: ProceduralTreeParentCurve | undefined,
  minimum: number,
  maximum: number,
  monotonic = false
): void {
  if (!curve) return;
  if (curve.length !== 7) throw new RangeError(`${label} curve requires exactly seven values`);
  curve.forEach((value, index) => validateTuningNumber(`${label} curve knot ${index}`, value, minimum, maximum));
  if (monotonic && curve.some((value, index) => index > 0 && value < curve[index - 1])) {
    throw new RangeError(`${label} curve must be monotonic`);
  }
}

function validateOptionalSpinePath(label: string, coefficients: readonly number[] | undefined): void {
  if (!coefficients) return;
  const requiredLength = PROCEDURAL_TREE_SPINE_PATH_COEFFICIENTS_PER_AXIS * 2;
  if (coefficients.length !== requiredLength) {
    throw new RangeError(`${label} requires exactly ${requiredLength} harmonic coefficients`);
  }
  coefficients.forEach((value, index) => validateTuningNumber(`${label} coefficient ${index}`, value, -200, 200));
}

const MAPLE_LEAF_VARIANTS: SaplingTreeParameters["leafVariants"] = [
  { weight: 0.26, widthScale: 1, heightScale: 1, fold: 0.04, curl: 0, droop: 0.02, toneOffset: -0.04 },
  { weight: 0.22, widthScale: 1.08, heightScale: 1.02, fold: 0.08, curl: 0.02, droop: 0.03, toneOffset: 0.03 },
  { weight: 0.18, widthScale: 0.9, heightScale: 1.08, fold: 0.06, curl: -0.02, droop: 0.06, toneOffset: -0.01 },
  { weight: 0.18, widthScale: 1, heightScale: 0.95, fold: 0.14, curl: 0.04, droop: 0.04, toneOffset: 0.06 },
  { weight: 0.16, widthScale: 0.96, heightScale: 1.04, fold: 0.05, curl: 0.08, droop: 0.12, toneOffset: -0.07 }
];

const BIRCH_LEAF_VARIANTS: SaplingTreeParameters["leafVariants"] = [
  { weight: 0.28, widthScale: 1, heightScale: 1, fold: 0.03, curl: 0.01, droop: 0.04, toneOffset: -0.03 },
  { weight: 0.22, widthScale: 0.92, heightScale: 1.08, fold: 0.06, curl: 0.03, droop: 0.08, toneOffset: 0.04 },
  { weight: 0.2, widthScale: 1.08, heightScale: 0.94, fold: 0.04, curl: -0.02, droop: 0.06, toneOffset: -0.01 },
  { weight: 0.16, widthScale: 0.88, heightScale: 1.02, fold: 0.1, curl: 0.05, droop: 0.12, toneOffset: 0.06 },
  { weight: 0.14, widthScale: 1.02, heightScale: 0.9, fold: 0.05, curl: 0.09, droop: 0.16, toneOffset: -0.06 }
];

const SMALL_MAPLE_SAPLING: SaplingTreeParameters = {
  profile: "small-maple",
  levels: 3,
  shape: 7,
  shapeSecondary: 7,
  customShape: [0.5, 1, 0.3, 0.5],
  baseSize: 0.28,
  baseSizeScale: 0.25,
  trunkClearHeightRatio: 0.28,
  length: [1, 0.46, 0.45, 0.45],
  maximumLengthRatio: [2, 2, 2, 2],
  lengthVariation: [0, 0.03, 0.15, 0],
  branches: [0, 110, 18, 10],
  curveResolution: [8, 5, 3, 1],
  curve: [0, 30, 0, 0],
  curveVariation: [10, 35, 35, 0],
  curveBack: [0, -30, -20, 0],
  lateNoiseAmount: [0, 0, 0, 0],
  lateNoiseTurbulence: [0, 0, 0, 0],
  lateNoiseSmooth: [0, 0, 0, 0],
  lateNoiseProfile: [undefined, undefined, undefined, undefined],
  spinePathHarmonics: [undefined, undefined, undefined, undefined],
  downAngle: [90, 48, 45, 45],
  downAngleVariation: [0, 48, 10, 10],
  rotate: [99.5, 137.5, 137.5, 137.5],
  rotateVariation: [15, 0, 0, 0],
  attractUp: [-0.5, -0.7, 0, 0],
  attractOut: [0, 0.4, 0.5, 0],
  baseSplits: 1,
  segmentSplits: [0.45, 0.5, 0.8, 0],
  splitAngle: [8, 18, 18, 0],
  splitAngleVariation: [2, 5, 5, 0],
  splitHeight: 0.2,
  ratio: 0.02,
  ratioPower: 1.2,
  rootFlare: 1,
  taper: [1, 1, 1, 1],
  scaleVariation: 0.08,
  scaleVariation0: 0.2,
  runtimeBranchBudget: [2, 30, 64],
  leaves: PROCEDURAL_TREE_LEAF_DENSITY,
  leafPhyllotaxy: "opposite-decussate",
  leafDistribution: 6,
  leafDownAngle: 45,
  leafDownAngleVariation: 10,
  leafRotate: 90,
  leafRotateVariation: 3,
  leafScale: 0.043,
  leafScaleX: 0.65,
  leafScaleTaper: 0.35,
  leafScaleVariation: 0.2,
  horizontalLeaves: true,
  leafAngle: -35,
  leafSpacing: 0.1,
  leafOutwardOrientation: 0.35,
  // Generated foliage uses one continuous crown field by default; physical card roll stays geometry-only.
  parentPuffiness: 1,
  leafToneVariation: 0.1,
  leafVariants: MAPLE_LEAF_VARIANTS,
  twigAttachmentEndRatio: 1
};

const WHITE_BIRCH_SAPLING: SaplingTreeParameters = {
  profile: "white-birch",
  levels: 3,
  shape: 8,
  shapeSecondary: 7,
  customShape: [0.7, 1, 0.3, 0.59],
  baseSize: 0.35,
  baseSizeScale: 0.8,
  trunkClearHeightRatio: 0.35,
  length: [1, 0.33, 0.375, 0.45],
  maximumLengthRatio: [2, 2, 2, 2],
  lengthVariation: [0.05, 0.2, 0.35, 0],
  branches: [0, 60, 30, 10],
  curveResolution: [10, 8, 3, 1],
  curve: [0, -30, -25, 0],
  curveVariation: [100, 80, 80, 0],
  curveBack: [0, -5, 0, 0],
  lateNoiseAmount: [0, 0, 0, 0],
  lateNoiseTurbulence: [0, 0, 0, 0],
  lateNoiseSmooth: [0, 0, 0, 0],
  lateNoiseProfile: [undefined, undefined, undefined, undefined],
  spinePathHarmonics: [undefined, undefined, undefined, undefined],
  downAngle: [90, 60, 50, 45],
  downAngleVariation: [0, 25, 30, 10],
  rotate: [137.5, 137.5, 137.5, 137.5],
  rotateVariation: [0, 0, 0, 0],
  attractUp: [0, -1, -0.65, 0],
  attractOut: [0, 0.2, 0.25, 0],
  baseSplits: 2,
  segmentSplits: [0.35, 0.35, 0.35, 0],
  splitAngle: [12, 18, 16, 0],
  splitAngleVariation: [2, 2, 0, 0],
  splitHeight: 0.55,
  ratio: 0.02,
  ratioPower: 1.4,
  rootFlare: 1.15,
  taper: [1, 1, 1, 1],
  scaleVariation: 0.08,
  scaleVariation0: 0.1,
  runtimeBranchBudget: [3, 28, 60],
  leaves: PROCEDURAL_TREE_LEAF_DENSITY,
  leafPhyllotaxy: "alternate-spiral",
  leafDistribution: 6,
  leafDownAngle: 45,
  leafDownAngleVariation: 10,
  leafRotate: 137.5,
  leafRotateVariation: 4,
  leafScale: 0.036,
  leafScaleX: 0.5,
  leafScaleTaper: 0.2,
  leafScaleVariation: 0.25,
  horizontalLeaves: true,
  leafAngle: -45,
  leafSpacing: 0.18,
  leafOutwardOrientation: 0.3,
  // Generated foliage uses one continuous crown field by default; physical card roll stays geometry-only.
  parentPuffiness: 1,
  leafToneVariation: 0.12,
  leafVariants: BIRCH_LEAF_VARIANTS,
  twigAttachmentEndRatio: 1
};

const PARENT_CURVE_KNOTS = [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1] as const;

function sampleParentCurve(curve: ProceduralTreeParentCurve, progress: number): number {
  const value = clamp01(progress);
  for (let index = 0; index < PARENT_CURVE_KNOTS.length - 1; index++) {
    const left = PARENT_CURVE_KNOTS[index];
    const right = PARENT_CURVE_KNOTS[index + 1];
    if (value > right) continue;
    const local = (value - left) / Math.max(right - left, Number.EPSILON);
    return curve[index] + (curve[index + 1] - curve[index]) * local;
  }
  return curve[curve.length - 1];
}

function sampleNormalizedProfile(profile: readonly number[], progress: number): number {
  const scaled = clamp01(progress) * (profile.length - 1);
  const lower = Math.floor(scaled);
  const upper = Math.ceil(scaled);
  const weight = scaled - lower;
  return profile[lower] * (1 - weight) + profile[upper] * weight;
}

function crownEnvelopeScale(parameters: SaplingTreeParameters, radial: Point, azimuth: number): number {
  const lobeCount = parameters.crownLobeCount ?? 0;
  const lobeDepth = parameters.crownLobeDepth ?? 0;
  const lobe = lobeCount > 0 ? 1 + lobeDepth * Math.cos(azimuth * lobeCount + (parameters.crownLobePhase ?? 0)) : 1;
  const horizontalLength = Math.max(Math.hypot(radial[0], radial[2]), Number.EPSILON);
  const x = radial[0] / horizontalLength;
  const z = radial[2] / horizontalLength;
  const elliptical = Math.hypot(
    x * (1 + (parameters.crownAsymmetryX ?? 0)),
    z * (1 + (parameters.crownAsymmetryZ ?? 0))
  );
  return Math.max(0.05, lobe * elliptical);
}

interface SaplingRandomStreams {
  readonly trunk: () => number;
  readonly branch: () => number;
  readonly twig: () => number;
  readonly trunkLateNoise: () => number;
  readonly branchLateNoise: () => number;
  readonly twigLateNoise: () => number;
}

function createSaplingSkeleton(
  requestedHeight: number,
  parameters: SaplingTreeParameters,
  random: SaplingRandomStreams
): { readonly branches: readonly SaplingStem[]; readonly height: number; readonly verticalHeight: number } {
  const height = requestedHeight * (1 + signedVariation(random.trunk, parameters.scaleVariation));
  const trunkLength = height * (parameters.trunkLengthRatio ?? 1);
  const minimumRadius = height * 0.0002;
  const taper = findSaplingTaper(parameters);
  const stems: SaplingStem[] = [];
  let nextId = 0;
  const trunkRadius = height * parameters.ratio * (1 + signedVariation(random.trunk, parameters.scaleVariation0));
  const trunkEndRadius = parameters.trunkTipRadiusRatio
    ? Math.max(minimumRadius, trunkRadius * parameters.trunkTipRadiusRatio)
    : saplingEndRadius(trunkRadius, taper[0], parameters.ratioPower, minimumRadius);
  const trunkPath = growSaplingPath(
    [0, 0, 0],
    [0, 1, 0],
    trunkLength,
    Math.round(parameters.curveResolution[0]),
    0,
    0,
    parameters,
    random.trunk,
    random.trunkLateNoise
  );
  const mainTrunk: SaplingStem = {
    level: 0,
    id: nextId++,
    stableId: proceduralTreeStemId(0, 0),
    parentId: null,
    supportStemId: null,
    length: trunkLength,
    attachmentProgress: 0,
    points: trunkPath,
    radii: createSaplingRadii(trunkPath.length, trunkRadius, trunkEndRadius, parameters.rootFlare),
    startRadius: trunkRadius,
    endRadius: trunkEndRadius,
    azimuth: 0
  };
  stems.push(mainTrunk);

  const splitProgress = Math.max(1 / parameters.curveResolution[0], parameters.splitHeight * 0.28);
  for (let splitIndex = 0; splitIndex < parameters.baseSplits; splitIndex++) {
    const start = samplePolyline(mainTrunk.points, splitProgress);
    const parentDirection = sampleTangent(mainTrunk.points, splitProgress);
    const azimuth = degreesToRadians(
      parameters.rotate[0] * (splitIndex + 1) + signedVariation(random.trunk, parameters.rotateVariation[0])
    );
    const radial = radialAround(parentDirection, azimuth);
    const splitDirection = normalize(
      add(
        scale(parentDirection, Math.cos(degreesToRadians(parameters.splitAngle[0]))),
        scale(radial, Math.sin(degreesToRadians(parameters.splitAngle[0])))
      )
    );
    const splitLength = trunkLength * (1 - splitProgress) * (0.88 + random.trunk() * 0.08);
    const splitStartRadius = sampleScalar(mainTrunk.radii, splitProgress) * 0.78;
    const splitEndRadius = saplingEndRadius(splitStartRadius, taper[0], parameters.ratioPower, minimumRadius);
    const points = prunePathToMaximumHeight(
      growSaplingPath(
        start,
        splitDirection,
        splitLength,
        Math.max(2, Math.round(parameters.curveResolution[0] * (1 - splitProgress))),
        0,
        azimuth,
        parameters,
        random.trunk,
        random.trunkLateNoise
      ),
      start,
      height * (parameters.crownMaximumHeightRatio ?? 1.5)
    );
    const splitId = nextId++;
    stems.push({
      level: 0,
      id: splitId,
      stableId: proceduralTreeStemId(0, splitId),
      parentId: null,
      supportStemId: mainTrunk.id,
      length: polylineLength(points),
      attachmentProgress: splitProgress,
      points,
      radii: createSaplingRadii(points.length, splitStartRadius, splitEndRadius, 1),
      startRadius: splitStartRadius,
      endRadius: splitEndRadius,
      azimuth
    });
  }

  const verticalHeight = Math.max(...stems.flatMap((stem) => stem.points.map((point) => point[1])));
  let parents = stems.filter((stem) => stem.level === 0);
  for (let level = 1 as 1 | 2; level < parameters.levels; level = (level + 1) as 1 | 2) {
    const clearHeight = verticalHeight * parameters.trunkClearHeightRatio;
    const eligibleParents =
      level === 1
        ? parents.filter((parent) => Math.max(...parent.points.map((point) => point[1])) >= clearHeight)
        : parents;
    const visibleCount = parameters.runtimeBranchBudget[level];
    // Sapling emits one mandatory t=1 continuation for every eligible parent. Generate
    // one additional candidate per parent, then let the runtime budget choose the branches
    // that cover the crown instead of allowing those continuations to consume the budget.
    const authoredAttachmentCurve =
      level === 1 ? parameters.branchAttachmentProgressCurve : parameters.twigAttachmentProgressCurve;
    const authoredRootHeightDistributionCurve =
      level === 1 ? parameters.branchRootHeightDistributionCurve : parameters.twigRootHeightDistributionCurve;
    const targetCount =
      visibleCount > 0
        ? visibleCount + (authoredAttachmentCurve || authoredRootHeightDistributionCurve ? 0 : eligibleParents.length)
        : 0;
    const extensionFraction = level === 1 ? parameters.branchExtensionFraction : parameters.twigExtensionFraction;
    const extensionCount = Math.min(Math.floor(targetCount * (extensionFraction ?? 0)), Math.max(0, targetCount - 1));
    const directCount = targetCount - extensionCount;
    const children = createSaplingChildren(
      eligibleParents,
      level,
      directCount,
      height,
      clearHeight,
      minimumRadius,
      taper,
      parameters,
      level === 1 ? random.branch : random.twig,
      level === 1 ? random.branchLateNoise : random.twigLateNoise,
      () => nextId++
    );
    const sameLevelMode = level === 1 ? parameters.branchSameLevelMode : parameters.twigSameLevelMode;
    const extensionResult =
      sameLevelMode === "distributed-branching"
        ? {
            directStems: children,
            extensions: createSaplingChildren(
              children,
              level,
              extensionCount,
              height,
              clearHeight,
              minimumRadius,
              taper,
              parameters,
              level === 1 ? random.branch : random.twig,
              level === 1 ? random.branchLateNoise : random.twigLateNoise,
              () => nextId++,
              true
            )
          }
        : createSaplingExtensions(
            children,
            level,
            extensionCount,
            height,
            minimumRadius,
            taper,
            parameters,
            level === 1 ? random.branch : random.twig,
            level === 1 ? random.branchLateNoise : random.twigLateNoise,
            () => nextId++
          );
    stems.push(...extensionResult.directStems, ...extensionResult.extensions);
    parents = [...extensionResult.directStems, ...extensionResult.extensions];
  }

  return { branches: stems, height, verticalHeight };
}

function createSaplingChildren(
  parents: readonly SaplingStem[],
  level: 1 | 2,
  targetCount: number,
  height: number,
  clearHeight: number,
  minimumRadius: number,
  taper: SaplingVector,
  parameters: SaplingTreeParameters,
  random: () => number,
  lateNoiseRandom: () => number,
  allocateId: () => number,
  sameLevelChild = false
): SaplingStem[] {
  const baseSize = level === 1 ? parameters.baseSize : parameters.baseSize * parameters.baseSizeScale;
  const attachmentCurve =
    level === 1
      ? sameLevelChild
        ? (parameters.branchSameLevelAttachmentProgressCurve ?? parameters.branchAttachmentProgressCurve)
        : parameters.branchAttachmentProgressCurve
      : sameLevelChild
        ? (parameters.twigSameLevelAttachmentProgressCurve ?? parameters.twigAttachmentProgressCurve)
        : parameters.twigAttachmentProgressCurve;
  const attachmentStart = attachmentCurve ? clamp01(attachmentCurve[0] / 100) : baseSize;
  const allocations = allocateSaplingChildren(
    parents,
    targetCount,
    level,
    height,
    baseSize,
    parameters,
    sameLevelChild
  );
  const children: SaplingStem[] = [];
  let accumulatedRotation = 0;
  const maximumAllocation = Math.max(...allocations, 0);
  const attachmentEnd = level === 2 ? Math.max(attachmentStart, clamp01(parameters.twigAttachmentEndRatio)) : 1;
  const generationMode =
    level === 1
      ? (parameters.branchGenerationMode ?? ((parameters.branchWhorlSize ?? 1) > 1 ? "steps" : "proportional"))
      : (parameters.twigGenerationMode ?? "proportional");
  const rootHeightDistributionCurve =
    level === 1
      ? sameLevelChild
        ? (parameters.branchSameLevelRootHeightDistributionCurve ?? parameters.branchRootHeightDistributionCurve)
        : parameters.branchRootHeightDistributionCurve
      : sameLevelChild
        ? (parameters.twigSameLevelRootHeightDistributionCurve ?? parameters.twigRootHeightDistributionCurve)
        : parameters.twigRootHeightDistributionCurve;
  const rootHeightDistributionBlend = clamp01(
    level === 1
      ? sameLevelChild
        ? (parameters.branchSameLevelRootHeightDistributionBlend ?? parameters.branchRootHeightDistributionBlend ?? 0)
        : (parameters.branchRootHeightDistributionBlend ?? 0)
      : sameLevelChild
        ? (parameters.twigSameLevelRootHeightDistributionBlend ?? parameters.twigRootHeightDistributionBlend ?? 0)
        : (parameters.twigRootHeightDistributionBlend ?? 0)
  );
  const bifurcationAttachments =
    generationMode === "bifurcation"
      ? parents.map((parent, parentIndex) =>
          createBifurcationAttachments(
            parent.points,
            allocations[parentIndex],
            attachmentStart,
            attachmentEnd,
            level === 1 ? (parameters.branchBifurcationThreshold ?? 0) : (parameters.twigBifurcationThreshold ?? 0),
            level === 1 ? (parameters.branchBifurcationSpacing ?? 0) : (parameters.twigBifurcationSpacing ?? 0)
          )
        )
      : undefined;
  // Whole-tree root height is the only global inverse CDF. The other child curves are
  // conditional distributions on each parent and are sampled separately below.
  const distributionRanks = new Map<string, number>();
  const orderedCandidates: { readonly key: string; readonly height: number }[] = [];
  for (let parentIndex = 0; parentIndex < parents.length; parentIndex++) {
    const allocation = allocations[parentIndex];
    for (let childIndex = 0; childIndex < allocation; childIndex++) {
      const fallbackProgress = attachmentStart + (attachmentEnd - attachmentStart) * ((childIndex + 1) / allocation);
      const progress = bifurcationAttachments?.[parentIndex]?.[childIndex] ?? fallbackProgress;
      orderedCandidates.push({
        key: `${parentIndex}:${childIndex}`,
        height: samplePolyline(parents[parentIndex].points, progress)[1]
      });
    }
  }
  orderedCandidates
    .sort((left, right) => left.height - right.height || left.key.localeCompare(right.key))
    .forEach((candidate, rank) => distributionRanks.set(candidate.key, rank));
  for (let childIndex = 0; childIndex < maximumAllocation; childIndex++) {
    for (let parentIndex = 0; parentIndex < parents.length; parentIndex++) {
      if (childIndex >= allocations[parentIndex]) continue;
      const parent = parents[parentIndex];
      // Sapling's findChildPoints distributes children along the exposed parent stem and
      // interpStem unconditionally emits the final child point at t=1.
      const whorlSize =
        level === 1 && generationMode === "steps" ? Math.max(1, Math.round(parameters.branchWhorlSize ?? 1)) : 1;
      const allocation = allocations[parentIndex];
      const authoredWhorlSizes =
        level === 1 && generationMode === "steps" && parameters.branchWhorlSizes?.length
          ? parameters.branchWhorlSizes
          : undefined;
      const whorlCount = authoredWhorlSizes
        ? authoredWhorlSizes.length
        : level === 1 && parameters.branchWhorlCount
          ? Math.min(allocation, Math.max(1, Math.round(parameters.branchWhorlCount)))
          : Math.ceil(allocation / whorlSize);
      const normalizedWhorlSizes =
        authoredWhorlSizes && authoredWhorlSizes.reduce((sum, value) => sum + value, 0) === allocation
          ? authoredWhorlSizes
          : Array.from(
              { length: whorlCount },
              (_, index) => Math.floor(allocation / whorlCount) + (index < allocation % whorlCount ? 1 : 0)
            );
      let whorlIndex = 0;
      let whorlFirstChild = 0;
      while (whorlIndex + 1 < whorlCount && childIndex >= whorlFirstChild + normalizedWhorlSizes[whorlIndex]) {
        whorlFirstChild += normalizedWhorlSizes[whorlIndex];
        whorlIndex++;
      }
      const childrenInWhorl = normalizedWhorlSizes[whorlIndex];
      const positionInWhorl = childIndex - whorlFirstChild;
      const authoredAttachmentProgress =
        attachmentStart + (attachmentEnd - attachmentStart) * ((childIndex + 1) / allocation);
      const distributionRank = distributionRanks.get(`${parentIndex}:${childIndex}`) ?? 0;
      const distributionProbability = targetCount === 1 ? 0.5 : distributionRank / Math.max(targetCount - 1, 1);
      const attachmentProbability =
        whorlSize > 1
          ? whorlIndex / Math.max(whorlCount - 1, 1)
          : allocation === 1
            ? 0.5
            : childIndex / (allocation - 1);
      const whorlOffset =
        whorlSize > 1 && childrenInWhorl > 1
          ? (positionInWhorl / (childrenInWhorl - 1) - 0.5) * (parameters.branchWhorlSpread ?? 0)
          : 0;
      const authoredWhorlAttachment = level === 1 ? parameters.branchWhorlAttachmentProgress?.[whorlIndex] : undefined;
      const generatedAttachment = bifurcationAttachments?.[parentIndex]?.[childIndex];
      const distributedAttachment = attachmentCurve
        ? clamp01(sampleParentCurve(attachmentCurve, attachmentProbability) / 100 + whorlOffset)
        : undefined;
      const bifurcationDistributionBlend = clamp01(
        level === 1
          ? sameLevelChild
            ? (parameters.branchSameLevelBifurcationDistributionBlend ??
              parameters.branchBifurcationDistributionBlend ??
              0)
            : (parameters.branchBifurcationDistributionBlend ?? 0)
          : sameLevelChild
            ? (parameters.twigSameLevelBifurcationDistributionBlend ?? parameters.twigBifurcationDistributionBlend ?? 0)
            : (parameters.twigBifurcationDistributionBlend ?? 0)
      );
      let attachmentProgress =
        generatedAttachment !== undefined
          ? distributedAttachment === undefined
            ? generatedAttachment
            : generatedAttachment * (1 - bifurcationDistributionBlend) +
              distributedAttachment * bifurcationDistributionBlend
          : authoredWhorlAttachment !== undefined
            ? clamp01(authoredWhorlAttachment + whorlOffset)
            : distributedAttachment !== undefined
              ? distributedAttachment
              : generationMode === "interval"
                ? attachmentStart + (attachmentEnd - attachmentStart) * ((childIndex + 0.5) / allocation)
                : level === 1
                  ? primaryBranchAttachmentProgress(parent.points, childIndex, allocations[parentIndex], clearHeight)
                  : authoredAttachmentProgress;
      if (rootHeightDistributionCurve && rootHeightDistributionBlend > Number.EPSILON) {
        const targetRootHeight =
          (sampleParentCurve(rootHeightDistributionCurve, distributionProbability) / 100) * height;
        const rootHeightAttachment = polylineProgressAtHeight(
          parent.points,
          targetRootHeight,
          attachmentStart,
          attachmentEnd
        );
        attachmentProgress =
          attachmentProgress * (1 - rootHeightDistributionBlend) + rootHeightAttachment * rootHeightDistributionBlend;
      }
      const start = samplePolyline(parent.points, attachmentProgress);
      const parentTangent = sampleTangent(parent.points, attachmentProgress);
      const rootHeightRatio = clamp01(start[1] / Math.max(height, Number.EPSILON));
      accumulatedRotation += degreesToRadians(parameters.rotate[level]);
      const whorlAzimuth =
        degreesToRadians(
          level === 1 && parameters.branchWhorlPhaseByHeightCurve
            ? sampleParentCurve(parameters.branchWhorlPhaseByHeightCurve, attachmentProgress)
            : parameters.rotate[level] * (whorlIndex + 1)
        ) +
        (positionInWhorl / childrenInWhorl) * Math.PI * 2;
      const azimuth =
        (level === 1 && parameters.branchAzimuthModesDegrees && parameters.branchAzimuthModeWeights
          ? degreesToRadians(
              weightedMode(random, parameters.branchAzimuthModesDegrees, parameters.branchAzimuthModeWeights)
            )
          : level === 2 && parameters.twigAzimuthModesDegrees && parameters.twigAzimuthModeWeights
            ? degreesToRadians(
                weightedMode(random, parameters.twigAzimuthModesDegrees, parameters.twigAzimuthModeWeights)
              )
            : level === 2 && parameters.twigAzimuthByHeightCurve
              ? degreesToRadians(sampleParentCurve(parameters.twigAzimuthByHeightCurve, rootHeightRatio))
              : whorlSize > 1
                ? whorlAzimuth
                : accumulatedRotation) + degreesToRadians(signedVariation(random, parameters.rotateVariation[level]));
      const relativeTop = clamp01(
        (attachmentEnd - attachmentProgress) / Math.max(attachmentEnd - attachmentStart, 0.001)
      );
      const downAngleCurve =
        level === 1 ? parameters.branchDownAngleByHeightCurve : parameters.twigDownAngleByHeightCurve;
      const downVariation = downAngleCurve
        ? signedVariation(random, Math.abs(parameters.downAngleVariation[level]))
        : -parameters.downAngleVariation[level] * Math.pow(1 - relativeTop, 2) +
          signedVariation(random, Math.max(0, -parameters.downAngleVariation[level]));
      const authoredDownAngle = downAngleCurve
        ? sampleParentCurve(downAngleCurve, rootHeightRatio)
        : parameters.downAngle[level];
      const downAngleOffsetCurve =
        level === 1
          ? parameters.branchDownAngleOffsetByDistributionCurve
          : parameters.twigDownAngleOffsetByDistributionCurve;
      const distributionDownAngleOffset = downAngleOffsetCurve
        ? sampleParentCurve(downAngleOffsetCurve, attachmentProbability)
        : 0;
      const bifurcationAlign =
        generationMode === "bifurcation"
          ? level === 1
            ? (parameters.branchBifurcationAlign ?? 0)
            : (parameters.twigBifurcationAlign ?? 0)
          : 0;
      const downAngle = degreesToRadians(
        (authoredDownAngle + distributionDownAngleOffset + downVariation) * (1 - bifurcationAlign) +
          90 * bifurcationAlign
      );
      let radial = radialAround(parentTangent, azimuth);
      if (generationMode === "bifurcation") {
        const balance =
          level === 1 ? (parameters.branchBifurcationBalance ?? 1) : (parameters.twigBifurcationBalance ?? 1);
        const oppositeBend = bifurcationOppositeBendRadial(parent.points, attachmentProgress, parentTangent);
        radial = normalizeOr(add(scale(radial, 1 - balance), scale(oppositeBend, balance)), radial);
      }
      const direction = normalize(add(scale(parentTangent, Math.cos(downAngle)), scale(radial, Math.sin(downAngle))));
      const crownShape = saplingShapeRatio(
        level === 1 ? parameters.shape : parameters.shapeSecondary,
        relativeTop,
        parameters.customShape
      );
      const lengthCurve = level === 1 ? parameters.branchLengthByHeightCurve : parameters.twigLengthByHeightCurve;
      const crownEnvelope = crownEnvelopeScale(parameters, radial, azimuth);
      const sameLevelLengthRatio = sameLevelChild ? (parameters.extensionLengthRatio?.[level] ?? 0) : 0;
      const authoredLength =
        sameLevelLengthRatio > 0
          ? parent.length * sameLevelLengthRatio
          : lengthCurve
            ? height * (sampleParentCurve(lengthCurve, rootHeightRatio) / 100)
            : parent.length * parameters.length[level] * crownShape;
      const lengthScaleCurve =
        level === 1 ? parameters.branchLengthScaleByDistributionCurve : parameters.twigLengthScaleByDistributionCurve;
      const distributionLengthScale = lengthScaleCurve
        ? sampleParentCurve(lengthScaleCurve, attachmentProbability) / 100
        : 1;
      // An absolute fitted length curve already contains the measured crown envelope.
      // Applying lobe/asymmetry shaping again would double-deform reconstructed stems.
      const shapedLength = (lengthCurve ? authoredLength : authoredLength * crownEnvelope) * distributionLengthScale;
      const lengthVariation = sameLevelChild
        ? (parameters.extensionLengthVariation?.[level] ?? parameters.lengthVariation[level])
        : parameters.lengthVariation[level];
      const length = Math.min(
        height * parameters.maximumLengthRatio[level],
        Math.max(height * Number.EPSILON, shapedLength * (1 + signedVariation(random, lengthVariation)))
      );
      const parentRadius = sampleScalar(parent.radii, attachmentProgress);
      const absoluteRadiusCurve = parameters.childRadiusByHeightCurve?.[level];
      const relativeRadius =
        parent.startRadius *
        Math.pow(length / Math.max(parent.length, minimumRadius), parameters.ratioPower) *
        (parameters.childRadiusScale?.[level] ?? 1);
      const requestedRadius = absoluteRadiusCurve
        ? height * (sampleParentCurve(absoluteRadiusCurve, rootHeightRatio) / 100)
        : relativeRadius;
      const radiusScaleCurve = parameters.childRadiusScaleByDistributionCurve?.[level];
      const distributionRadiusScale = radiusScaleCurve
        ? sampleParentCurve(radiusScaleCurve, attachmentProbability) / 100
        : 1;
      const startRadius = Math.max(
        minimumRadius,
        Math.min(
          requestedRadius * distributionRadiusScale,
          parentRadius * (parameters.childParentRadiusLimit?.[level] ?? 1)
        )
      );
      const endRadius = parameters.childTipRadiusRatio?.[level]
        ? Math.max(minimumRadius, startRadius * parameters.childTipRadiusRatio[level])
        : saplingEndRadius(startRadius, taper[level], parameters.ratioPower, minimumRadius);
      const shapeVariationScaleCurve =
        level === 1
          ? parameters.branchShapeVariationScaleByDistributionCurve
          : parameters.twigShapeVariationScaleByDistributionCurve;
      const shapeVariationScale = shapeVariationScaleCurve
        ? sampleParentCurve(shapeVariationScaleCurve, attachmentProbability) / 100
        : 1;
      const outwardAttractionCurve =
        level === 1
          ? parameters.branchAttractionOutByDistributionCurve
          : parameters.twigAttractionOutByDistributionCurve;
      const outwardAttraction = outwardAttractionCurve
        ? sampleParentCurve(outwardAttractionCurve, attachmentProbability)
        : parameters.attractOut[level];
      const points = prunePathToMaximumHeight(
        growSaplingPath(
          start,
          direction,
          length,
          Math.round(parameters.curveResolution[level]),
          level,
          azimuth,
          parameters,
          random,
          lateNoiseRandom,
          normalizeOr(cross(parentTangent, radial), radialAround(direction, azimuth)),
          shapeVariationScale,
          outwardAttraction
        ),
        start,
        height * (parameters.crownMaximumHeightRatio ?? 1.5)
      );
      const id = allocateId();
      children.push({
        level,
        id,
        stableId: proceduralTreeStemId(level, id),
        parentId: parent.id,
        supportStemId: parent.id,
        length: polylineLength(points),
        attachmentProgress,
        points,
        radii: createSaplingRadii(points.length, startRadius, endRadius, 1),
        startRadius,
        endRadius,
        azimuth
      });
    }
  }
  return children;
}

interface ProceduralTreeStemFrame {
  readonly right: Point;
  readonly along: Point;
  readonly out: Point;
}

interface ResolvedStemNode {
  readonly stem: SaplingStem;
  readonly changed: boolean;
}

/**
 * CPU parity evaluator retained for deterministic generator diagnostics and tests. Production render runtimes pass
 * no stem edits into mesh generation: the vertex shader resolves the same parent-first graph from GPU Path rows.
 */
function applyProceduralTreeStemNodeEdits(
  baseStems: readonly SaplingStem[],
  height: number,
  edits: readonly ProceduralTreeStemNodeEdit[]
): readonly SaplingStem[] {
  if (edits.length === 0) return baseStems;
  const baseByStableId = new Map(baseStems.map((stem) => [stem.stableId, stem]));
  const baseByNumericId = new Map(baseStems.map((stem) => [stem.id, stem]));
  const editByStemId = new Map(edits.map((edit) => [edit.stemId, edit]));
  for (const edit of edits) {
    const target = baseByStableId.get(edit.stemId);
    if (!target) {
      throw new RangeError(`Stem-node edit ${edit.stemId} is absent from the generated result`);
    }
    if (target.level === 0) {
      if (edit.parentStemId !== null) {
        throw new RangeError(`Trunk stem-node edit ${edit.stemId} must be parentless`);
      }
      continue;
    }
    const parent = edit.parentStemId === null ? undefined : baseByStableId.get(edit.parentStemId);
    if (!parent) {
      throw new RangeError(`Stem-node edit ${edit.stemId} references absent parent ${edit.parentStemId}`);
    }
    if (parent.level !== target.level - 1 && parent.level !== target.level) {
      throw new RangeError(`Stem-node edit ${edit.stemId} parent must be level ${target.level - 1} or ${target.level}`);
    }
  }

  const resolved = new Map<string, ResolvedStemNode>();
  const visiting = new Set<string>();
  const resolveStem = (base: SaplingStem): ResolvedStemNode => {
    const existing = resolved.get(base.stableId);
    if (existing) return existing;
    if (visiting.has(base.stableId)) {
      throw new RangeError(`Stem-node edit parent graph contains a cycle at ${base.stableId}`);
    }
    if (base.level === 0) {
      const edit = editByStemId.get(base.stableId);
      const result = edit
        ? { stem: rebuildProceduralTreeTrunkNode(base, edit, height), changed: true }
        : ({ stem: base, changed: false } as const);
      resolved.set(base.stableId, result);
      return result;
    }
    visiting.add(base.stableId);
    const edit = editByStemId.get(base.stableId);
    const baseSupport = base.supportStemId === null ? undefined : baseByNumericId.get(base.supportStemId);
    if (!baseSupport) throw new Error(`Generated stem ${base.stableId} has no support stem`);
    const parentStableId = edit?.parentStemId ?? baseSupport.stableId;
    if (parentStableId === null) {
      throw new RangeError(`Stem-node edit ${base.stableId} requires a parent stem`);
    }
    const parentBase = baseByStableId.get(parentStableId);
    if (!parentBase) throw new RangeError(`Stem-node edit parent ${parentStableId} is absent`);
    const parentResult = resolveStem(parentBase);
    const changed = Boolean(edit) || parentResult.changed || parentStableId !== baseSupport.stableId;
    const stem = changed
      ? rebuildProceduralTreeStemNode(
          base,
          parentResult.stem,
          edit ?? createStemNodeRecord(base, baseSupport, height),
          height
        )
      : base;
    const result = { stem, changed } as const;
    visiting.delete(base.stableId);
    resolved.set(base.stableId, result);
    return result;
  };

  return baseStems.map((stem) => resolveStem(stem).stem);
}

function rebuildProceduralTreeTrunkNode(
  base: SaplingStem,
  record: ProceduralTreeStemNodeEdit,
  height: number
): SaplingStem {
  const worldFrame: ProceduralTreeStemFrame = { right: [1, 0, 0], along: [0, 1, 0], out: [0, 0, 1] };
  const direction = normalize(stemFrameVector(worldFrame, record.directionInParentFrame));
  const pathLength = height * (record.lengthPercentOfHeight / 100);
  const root = record.rootPositionPercentOfHeight
    ? scale(record.rootPositionPercentOfHeight, height / 100)
    : base.points[0];
  const points = growStemNodeControlPath(
    root,
    direction,
    worldFrame.right,
    pathLength,
    record.pathControlPointsPercentOfLength
  );
  const startRadius = height * (record.startRadiusPercentOfHeight / 100);
  const endRadius = startRadius * (record.endRadiusPercentOfStart / 100);
  return {
    ...base,
    parentId: null,
    supportStemId: null,
    length: polylineLength(points),
    attachmentProgress: 0,
    points,
    radii: createStemNodeRadiusProfile(record, points.length, startRadius),
    radialSegments: record.radialSegments,
    axialSubdivisions: [...record.axialSubdivisions],
    tipCap: record.tipCap,
    startRadius,
    endRadius,
    azimuth: 0
  };
}

function rebuildProceduralTreeStemNode(
  base: SaplingStem,
  parent: SaplingStem,
  record: ProceduralTreeStemNodeEdit,
  height: number
): SaplingStem {
  const attachmentProgress = record.attachmentProgressPercent / 100;
  const start = samplePolyline(parent.points, attachmentProgress);
  const parentFrame = createStemAttachmentFrame(parent.points, attachmentProgress);
  const direction = normalize(stemFrameVector(parentFrame, record.directionInParentFrame));
  const pathLength = height * (record.lengthPercentOfHeight / 100);
  const points = growStemNodeControlPath(
    start,
    direction,
    parentFrame.right,
    pathLength,
    record.pathControlPointsPercentOfLength
  );
  const startRadius = height * (record.startRadiusPercentOfHeight / 100);
  const endRadius = startRadius * (record.endRadiusPercentOfStart / 100);
  const sameLevelContinuation = parent.level === base.level;
  return {
    ...base,
    parentId: sameLevelContinuation ? parent.parentId : parent.id,
    supportStemId: parent.id,
    length: polylineLength(points),
    attachmentProgress,
    points,
    radii: createStemNodeRadiusProfile(record, points.length, startRadius),
    radialSegments: record.radialSegments,
    axialSubdivisions: [...record.axialSubdivisions],
    tipCap: record.tipCap,
    startRadius,
    endRadius,
    azimuth: sameLevelContinuation ? parent.azimuth : base.azimuth
  };
}

function createProceduralTreeStemNodeSnapshots(
  stems: readonly SaplingStem[],
  height: number
): readonly ProceduralTreeStemNodeSnapshot[] {
  const byNumericId = new Map(stems.map((stem) => [stem.id, stem]));
  return stems.flatMap((stem) => {
    const parent = stem.supportStemId === null ? undefined : byNumericId.get(stem.supportStemId);
    if (stem.level !== 0 && !parent) throw new Error(`Generated stem ${stem.stableId} has no support stem`);
    const record = parent ? createStemNodeRecord(stem, parent, height) : createParentlessStemNodeState(stem, height);
    return [
      {
        ...record,
        level: stem.level,
        points: stem.points.map((point) => [...point] as Point),
        radii: [...stem.radii]
      }
    ];
  });
}

function createProceduralTreeGpuStemRecords(
  stems: readonly SaplingStem[],
  height: number
): readonly ProceduralTreeGpuStemRecord[] {
  const byNumericId = new Map(stems.map((stem) => [stem.id, stem]));
  return stems.map((stem) => {
    const parent = stem.supportStemId === null ? undefined : byNumericId.get(stem.supportStemId);
    if (stem.supportStemId !== null && !parent) {
      throw new Error(`Generated GPU stem ${stem.stableId} has no support stem`);
    }
    const record = parent ? createStemNodeRecord(stem, parent, height) : createParentlessStemNodeRecord(stem, height);
    return {
      ...record,
      pathControlPointsPercentOfLength: Array.from(
        { length: record.pathControlPointsPercentOfLength.length },
        (_, index) =>
          samplePolyline(
            record.pathControlPointsPercentOfLength,
            index / Math.max(record.pathControlPointsPercentOfLength.length - 1, 1)
          )
      ),
      radiusProfilePercentOfStart: Array.from({ length: record.pathControlPointsPercentOfLength.length }, (_, index) =>
        sampleScalar(
          record.radiusProfilePercentOfStart,
          index / Math.max(record.pathControlPointsPercentOfLength.length - 1, 1)
        )
      ),
      numericId: stem.id,
      level: stem.level,
      rootPosition: [...stem.points[0]] as Point
    };
  });
}

function createParentlessStemNodeRecord(stem: SaplingStem, height: number): ProceduralTreeGpuStemRecord {
  const state = createParentlessStemNodeState(stem, height);
  return {
    ...state,
    numericId: stem.id,
    level: stem.level,
    rootPosition: [...stem.points[0]] as Point
  };
}

function createParentlessStemNodeState(stem: SaplingStem, height: number): ProceduralTreeStemNodeEdit {
  const direction = sampleTangent(stem.points, 0);
  const worldFrame: ProceduralTreeStemFrame = { right: [1, 0, 0], along: [0, 1, 0], out: [0, 0, 1] };
  const pathFrame = createStemPathFrame(direction, worldFrame.right);
  const pathLength = Math.max(polylineLength(stem.points), Number.EPSILON);
  const start = stem.points[0];
  return {
    stemId: stem.stableId,
    parentStemId: null,
    attachmentProgressPercent: 0,
    directionInParentFrame: stemFrameCoordinates(worldFrame, direction),
    lengthPercentOfHeight: (pathLength / height) * 100,
    startRadiusPercentOfHeight: (stem.startRadius / height) * 100,
    endRadiusPercentOfStart: (stem.endRadius / stem.startRadius) * 100,
    pathControlPointsPercentOfLength: stem.points.map((point) =>
      scale(stemFrameCoordinates(pathFrame, subtract(point, start)), 100 / pathLength)
    ),
    radiusProfilePercentOfStart: stem.radii.map((radius) => (radius / stem.startRadius) * 100),
    radialSegments: stem.radialSegments ?? [8, 6, 4][stem.level],
    axialSubdivisions: stem.axialSubdivisions ? [...stem.axialSubdivisions] : stem.points.slice(1).map(() => 1),
    tipCap: stem.tipCap ?? false,
    rootPositionPercentOfHeight: scale(start, 100 / height)
  };
}

function createStemNodeRecord(stem: SaplingStem, parent: SaplingStem, height: number): ProceduralTreeStemNodeEdit {
  const parentFrame = createStemAttachmentFrame(parent.points, stem.attachmentProgress);
  const direction = sampleTangent(stem.points, 0);
  const directionInParentFrame = stemFrameCoordinates(parentFrame, direction);
  const pathFrame = createStemPathFrame(direction, parentFrame.right);
  const pathLength = Math.max(polylineLength(stem.points), Number.EPSILON);
  const start = stem.points[0];
  return {
    stemId: stem.stableId,
    parentStemId: parent.stableId,
    attachmentProgressPercent: stem.attachmentProgress * 100,
    directionInParentFrame,
    lengthPercentOfHeight: (pathLength / height) * 100,
    startRadiusPercentOfHeight: (stem.startRadius / height) * 100,
    endRadiusPercentOfStart: (stem.endRadius / stem.startRadius) * 100,
    pathControlPointsPercentOfLength: stem.points.map((point) =>
      scale(stemFrameCoordinates(pathFrame, subtract(point, start)), 100 / pathLength)
    ),
    radiusProfilePercentOfStart: stem.radii.map((radius) => (radius / stem.startRadius) * 100),
    radialSegments: stem.radialSegments ?? [8, 6, 4][stem.level],
    axialSubdivisions: stem.axialSubdivisions ? [...stem.axialSubdivisions] : stem.points.slice(1).map(() => 1),
    tipCap: stem.tipCap ?? false
  };
}

function createStemNodeRadiusProfile(
  record: ProceduralTreeStemNodeEdit,
  pointCount: number,
  startRadius: number
): readonly number[] {
  return Array.from(
    { length: pointCount },
    (_, index) =>
      startRadius * (sampleScalar(record.radiusProfilePercentOfStart, index / Math.max(pointCount - 1, 1)) / 100)
  );
}

function createStemAttachmentFrame(points: readonly Point[], progress: number): ProceduralTreeStemFrame {
  const along = sampleTangent(points, progress);
  const right = radialAround(along, 0);
  return { right, along, out: normalizeOr(cross(along, right), radialAround(along, Math.PI * 0.5)) };
}

function createStemPathFrame(direction: Point, parentRight: Point): ProceduralTreeStemFrame {
  const along = normalize(direction);
  const right = normalizeOr(reject(parentRight, along), radialAround(along, 0));
  return { right, along, out: normalizeOr(cross(along, right), radialAround(along, Math.PI * 0.5)) };
}

function stemFrameCoordinates(frame: ProceduralTreeStemFrame, value: Point): Point {
  return [dot(value, frame.right), dot(value, frame.along), dot(value, frame.out)];
}

function stemFrameVector(frame: ProceduralTreeStemFrame, value: Point): Point {
  return add(scale(frame.right, value[0]), add(scale(frame.along, value[1]), scale(frame.out, value[2])));
}

function growStemNodeControlPath(
  start: Point,
  direction: Point,
  parentRight: Point,
  pathLength: number,
  controlsPercentOfLength: readonly Point[]
): readonly Point[] {
  const frame = createStemPathFrame(direction, parentRight);
  const segmentCount = controlsPercentOfLength.length - 1;
  const localPoints = Array.from({ length: segmentCount + 1 }, (_, index) =>
    sampleCatmullRomControls(controlsPercentOfLength, index / segmentCount)
  );
  const unscaledOffsets = localPoints.map((local) => stemFrameVector(frame, scale(local, pathLength / 100)));
  const generatedLength = polylineLength(unscaledOffsets);
  const pathScale = pathLength / Math.max(generatedLength, Number.EPSILON);
  return unscaledOffsets.map((offset) => add(start, scale(offset, pathScale)));
}

function growControlPointSpinePath(
  start: Point,
  forward: Point,
  pathLength: number,
  segmentCount: number,
  azimuth: number,
  controlsPercentOfLength: readonly Point[]
): readonly Point[] {
  const tangent = normalize(forward);
  const firstAxis = radialAround(tangent, azimuth);
  const secondAxis = normalizeOr(cross(tangent, firstAxis), radialAround(tangent, azimuth + Math.PI * 0.5));
  const localToWorld = (local: Point): Point =>
    add(
      scale(firstAxis, (local[0] / 100) * pathLength),
      add(scale(tangent, (local[1] / 100) * pathLength), scale(secondAxis, (local[2] / 100) * pathLength))
    );
  const localPoints = Array.from({ length: segmentCount + 1 }, (_, index) =>
    sampleCatmullRomControls(controlsPercentOfLength, index / segmentCount)
  );
  const unscaled = localPoints.map(localToWorld);
  const generatedLength = polylineLength(unscaled);
  const pathScale = pathLength / Math.max(generatedLength, Number.EPSILON);
  return unscaled.map((offset) => add(start, scale(offset, pathScale)));
}

function sampleCatmullRomControls(controls: readonly Point[], progress: number): Point {
  if (controls.length === 2) return add(controls[0], scale(subtract(controls[1], controls[0]), clamp01(progress)));
  const scaledProgress = clamp01(progress) * (controls.length - 1);
  const segment = Math.min(controls.length - 2, Math.floor(scaledProgress));
  const t = scaledProgress - segment;
  const p0 = controls[Math.max(0, segment - 1)];
  const p1 = controls[segment];
  const p2 = controls[segment + 1];
  const p3 = controls[Math.min(controls.length - 1, segment + 2)];
  const t2 = t * t;
  const t3 = t2 * t;
  return [0, 1, 2].map(
    (axis) =>
      0.5 *
      (2 * p1[axis] +
        (-p0[axis] + p2[axis]) * t +
        (2 * p0[axis] - 5 * p1[axis] + 4 * p2[axis] - p3[axis]) * t2 +
        (-p0[axis] + 3 * p1[axis] - 3 * p2[axis] + p3[axis]) * t3)
  ) as unknown as Point;
}

/**
 * SpeedTree-style bifurcation placement: child nodes occupy the strongest parent-spine bends,
 * subject to an axial spacing constraint. The fallback only fills an explicit branch budget
 * when the current spine resolution exposes fewer interior bend samples than requested.
 */
function createBifurcationAttachments(
  points: readonly Point[],
  count: number,
  first: number,
  last: number,
  thresholdRadians: number,
  spacingRatio: number
): readonly number[] {
  if (count <= 0) return [];
  const cumulative = [0];
  for (let index = 1; index < points.length; index++) {
    cumulative.push(cumulative[index - 1] + length(subtract(points[index], points[index - 1])));
  }
  const totalLength = cumulative[cumulative.length - 1];
  const candidates = [] as { progress: number; bend: number }[];
  for (let index = 1; index + 1 < points.length; index++) {
    const progress = cumulative[index] / Math.max(totalLength, Number.EPSILON);
    if (progress < first || progress > last) continue;
    const incoming = normalize(subtract(points[index], points[index - 1]));
    const outgoing = normalize(subtract(points[index + 1], points[index]));
    candidates.push({ progress, bend: Math.acos(clamp(dot(incoming, outgoing), -1, 1)) });
  }
  candidates.sort((left, right) => right.bend - left.bend || left.progress - right.progress);
  const selected: number[] = [];
  const appendEligible = (minimumBend: number): void => {
    for (const candidate of candidates) {
      if (selected.length >= count || candidate.bend + Number.EPSILON < minimumBend) continue;
      if (selected.includes(candidate.progress)) continue;
      if (selected.some((progress) => Math.abs(progress - candidate.progress) < spacingRatio)) continue;
      selected.push(candidate.progress);
    }
  };
  appendEligible(thresholdRadians);
  appendEligible(0);
  for (let index = 0; selected.length < count && index < count * 2; index++) {
    const progress = first + (last - first) * ((index + 0.5) / count);
    if (!selected.some((value) => Math.abs(value - progress) <= Number.EPSILON)) selected.push(progress);
  }
  return selected.sort((left, right) => left - right).slice(0, count);
}

function bifurcationOppositeBendRadial(points: readonly Point[], progress: number, parentTangent: Point): Point {
  if (points.length < 3) return radialAround(parentTangent, 0);
  const cumulative = [0];
  for (let index = 1; index < points.length; index++) {
    cumulative.push(cumulative[index - 1] + length(subtract(points[index], points[index - 1])));
  }
  const target = clamp01(progress) * cumulative[cumulative.length - 1];
  let vertex = 1;
  for (let index = 2; index + 1 < points.length; index++) {
    if (Math.abs(cumulative[index] - target) < Math.abs(cumulative[vertex] - target)) vertex = index;
  }
  const incoming = normalize(subtract(points[vertex], points[vertex - 1]));
  const outgoing = normalize(subtract(points[vertex + 1], points[vertex]));
  return normalizeOr(reject(subtract(incoming, outgoing), parentTangent), radialAround(parentTangent, 0));
}

function createSaplingExtensions(
  directStems: readonly SaplingStem[],
  level: 1 | 2,
  count: number,
  height: number,
  minimumRadius: number,
  taper: SaplingVector,
  parameters: SaplingTreeParameters,
  random: () => number,
  lateNoiseRandom: () => number,
  allocateId: () => number
): { directStems: SaplingStem[]; extensions: SaplingStem[] } {
  if (count <= 0 || directStems.length === 0) return { directStems: [...directStems], extensions: [] };
  const adjustedDirectStems = [...directStems];
  const extensions: SaplingStem[] = [];
  const chainTips = [...adjustedDirectStems];
  for (let index = 0; index < count; index++) {
    const chainIndex = index % chainTips.length;
    const originalSource = chainTips[chainIndex];
    const retainedEndRadius = Math.max(
      minimumRadius,
      originalSource.startRadius * (parameters.extensionRadiusRetention?.[level] ?? 1)
    );
    const source: SaplingStem = {
      ...originalSource,
      endRadius: retainedEndRadius,
      radii: createSaplingRadii(originalSource.points.length, originalSource.startRadius, retainedEndRadius, 1)
    };
    const directIndex = adjustedDirectStems.findIndex((stem) => stem.id === source.id);
    if (directIndex >= 0) adjustedDirectStems[directIndex] = source;
    const extensionIndex = extensions.findIndex((stem) => stem.id === source.id);
    if (extensionIndex >= 0) extensions[extensionIndex] = source;
    chainTips[chainIndex] = source;
    const attachmentProgress = 1;
    const start = samplePolyline(source.points, attachmentProgress);
    const tangent = sampleTangent(source.points, attachmentProgress);
    const azimuth = source.azimuth;
    const rootHeightRatio = clamp01(start[1] / Math.max(height, Number.EPSILON));
    const lengthCurve = level === 1 ? parameters.branchLengthByHeightCurve : parameters.twigLengthByHeightCurve;
    const extensionLengthRatio = parameters.extensionLengthRatio?.[level] ?? 0;
    const authoredLength =
      extensionLengthRatio > 0
        ? source.length * extensionLengthRatio
        : lengthCurve
          ? height * (sampleParentCurve(lengthCurve, rootHeightRatio) / 100)
          : source.length * parameters.length[level];
    const lengthVariation =
      extensionLengthRatio > 0
        ? (parameters.extensionLengthVariation?.[level] ?? parameters.lengthVariation[level])
        : parameters.lengthVariation[level];
    const length = Math.min(
      height * parameters.maximumLengthRatio[level],
      Math.max(height * Number.EPSILON, authoredLength * (1 + signedVariation(random, lengthVariation)))
    );
    const startRadius = retainedEndRadius;
    const willExtendAgain = index + chainTips.length < count;
    const endRadius = willExtendAgain
      ? Math.max(minimumRadius, startRadius * (parameters.extensionRadiusRetention?.[level] ?? 1))
      : saplingEndRadius(startRadius, taper[level], parameters.ratioPower, minimumRadius);
    const points = prunePathToMaximumHeight(
      growSaplingPath(
        start,
        tangent,
        length,
        Math.max(1, Math.round(parameters.curveResolution[level])),
        level,
        azimuth,
        parameters,
        random,
        lateNoiseRandom,
        radialAround(tangent, azimuth)
      ),
      start,
      height * (parameters.crownMaximumHeightRatio ?? 1.5)
    );
    const id = allocateId();
    const extension: SaplingStem = {
      level,
      id,
      stableId: proceduralTreeStemId(level, id),
      parentId: source.parentId,
      supportStemId: source.id,
      length: polylineLength(points),
      attachmentProgress,
      points,
      radii: createSaplingRadii(points.length, startRadius, endRadius, 1),
      startRadius,
      endRadius,
      azimuth
    };
    extensions.push(extension);
    chainTips[chainIndex] = extension;
  }
  return { directStems: adjustedDirectStems, extensions };
}

function createSaplingLeafClusters(
  terminalStems: readonly SaplingStem[],
  height: number,
  parameters: SaplingTreeParameters,
  random: () => number,
  foliageTuning: ProceduralTreeFoliageGeometryTuning,
  lodScale: number,
  leavesPerTerminalStem = parameters.leaves
): LeafCluster[] {
  const clusters: LeafCluster[] = [];
  const maximumStemLength = Math.max(...terminalStems.map((stem) => stem.length), height * 0.001);
  const crownCenter = meanPoint(terminalStems.map((stem) => stem.points[stem.points.length - 1]));
  for (const stem of terminalStems) {
    const authoredFirstBoundary =
      parameters.leafFirstProgressByStem?.[stem.id] ??
      parameters.leafStartProgressByLevel?.[stem.level] ??
      parameters.leafStartProgress ??
      0;
    const rangeMinimum = parameters.leafStartProgressMinimumByLevel?.[stem.level];
    const rangeMaximum = parameters.leafStartProgressMaximumByLevel?.[stem.level];
    const firstBoundary =
      rangeMinimum !== undefined && rangeMaximum !== undefined
        ? rangeMinimum +
          (rangeMaximum - rangeMinimum) *
            Math.pow(random(), parameters.leafStartProgressDistributionExponentByLevel?.[stem.level] ?? 1)
        : clamp01(
            authoredFirstBoundary +
              signedVariation(random, parameters.leafStartProgressVariationByLevel?.[stem.level] ?? 0)
          );
    const hasAuthoredFirstBoundary =
      parameters.leafStartProgressMinimumByLevel !== undefined ||
      parameters.leafStartProgressByLevel !== undefined ||
      parameters.leafStartProgress !== undefined;
    const clusterStart = hasAuthoredFirstBoundary
      ? firstBoundary
      : Math.max(terminalPolylineSegmentStart(stem.points), firstBoundary);
    const clusterCenter = meanPoint([samplePolyline(stem.points, clusterStart), stem.points[stem.points.length - 1]]);
    // Sapling computes the number of child points for the final stem level from the
    // terminal-stem length and the configured crown envelope (leafDist). The envelope
    // is evaluated in whole-tree height space: a twig attached near its local tip can
    // still belong to the lower crown and must not inherit top-crown density merely
    // because its parent-relative attachmentProgress is close to one.
    const relativeLength = stem.length / maximumStemLength;
    const relativeCrownHeight = clamp01(clusterCenter[1] / Math.max(height, Number.EPSILON));
    const authoredDistribution =
      saplingShapeRatio(parameters.leafDistribution, 1 - relativeCrownHeight, parameters.customShape) *
      (parameters.leafDensityByHeightCurve
        ? sampleParentCurve(parameters.leafDensityByHeightCurve, relativeCrownHeight)
        : 1);
    const distributionInfluence = clamp01(parameters.leafDistributionInfluence ?? 1);
    const distribution = 1 + (authoredDistribution - 1) * distributionInfluence;
    const levelDensity = parameters.leafDensityScaleByLevel?.[stem.level] ?? 1;
    const lengthInfluence = clamp01(parameters.leafLengthInfluence ?? 0.9);
    const leafCount =
      parameters.leafCountByStem?.[stem.id] ??
      Math.max(
        1,
        Math.round(
          leavesPerTerminalStem * (1 - lengthInfluence + lengthInfluence * relativeLength) * distribution * levelDensity
        )
      );
    const clusterOutward = normalizeOr(subtract(clusterCenter, crownCenter), sampleTangent(stem.points, 1));
    const phase = (hashString(`leaf-cluster-phase:${parameters.profile}:${stem.id}`) / 4294967296) * Math.PI * 2;
    const leaves: LeafAnchor[] = [];
    const terminalFraction =
      parameters.leafTerminalFractionByStem?.[stem.id] ??
      parameters.leafTerminalFractionByLevel?.[stem.level] ??
      parameters.leafTerminalFraction ??
      0;
    const terminalCount = Math.round(leafCount * clamp01(terminalFraction));
    const nonTerminalCount = leafCount - terminalCount;
    const progressExponent =
      parameters.leafProgressExponentByStem?.[stem.id] ??
      parameters.leafProgressExponentByLevel?.[stem.level] ??
      parameters.leafProgressExponent ??
      1;
    for (let leafIndex = 0; leafIndex < leafCount; leafIndex++) {
      const isTerminal = leafIndex >= nonTerminalCount;
      const nodeIndex = parameters.leafPhyllotaxy === "opposite-decussate" ? Math.floor(leafIndex / 2) : leafIndex;
      const nonTerminalNodeCount =
        parameters.leafPhyllotaxy === "opposite-decussate" ? Math.ceil(nonTerminalCount / 2) : nonTerminalCount;
      const oppositeOffset = parameters.leafPhyllotaxy === "opposite-decussate" && leafIndex % 2 === 1 ? Math.PI : 0;
      const clusterProgress = isTerminal
        ? 1
        : nonTerminalNodeCount <= 1
          ? 0
          : Math.min(nodeIndex, nonTerminalNodeCount - 1) / (nonTerminalNodeCount - 1);
      const progress = isTerminal ? 1 : clusterStart + (1 - clusterStart) * Math.pow(clusterProgress, progressExponent);
      const stemAttachment = samplePolyline(stem.points, progress);
      const tangent = sampleTangent(stem.points, progress);
      const azimuth =
        phase +
        degreesToRadians(nodeIndex * parameters.leafRotate) +
        oppositeOffset +
        degreesToRadians(signedVariation(random, Math.abs(parameters.leafRotateVariation)));
      const downVariation = signedVariation(random, Math.abs(parameters.leafDownAngleVariation));
      const basis = createSaplingLeafBasis(
        tangent,
        azimuth,
        degreesToRadians(parameters.leafDownAngle + downVariation),
        clusterOutward,
        parameters
      );
      const taper =
        parameters.leafScaleTaper < 0
          ? 1 - (1 - clusterProgress) * -parameters.leafScaleTaper
          : 1 - clusterProgress * parameters.leafScaleTaper;
      const variantIndex = selectLeafVariant(parameters.leafVariants, random());
      const variant = parameters.leafVariants[variantIndex];
      const variantSizeBlend = parameters.leafVariantSizeBlend ?? 1;
      const variantHeightScale = 1 + (variant.heightScale - 1) * variantSizeBlend;
      const variantWidthScale = 1 + (variant.widthScale - 1) * variantSizeBlend;
      const leafHeight =
        height *
        parameters.leafScale *
        taper *
        variantHeightScale *
        (1 + signedVariation(random, parameters.leafScaleVariation));
      const leafWidth = leafHeight * parameters.leafScaleX * variantWidthScale;
      const anchorOffset =
        height *
        (parameters.leafAnchorOffsetRatio ?? 0) *
        (1 + signedVariation(random, parameters.leafAnchorOffsetVariation ?? 0));
      const attachment = add(stemAttachment, scale(basis.up, anchorOffset));
      const finalWidth = leafWidth * foliageTuning.widthScale * lodScale + foliageTuning.additiveHalfExtent * 2;
      const finalHeight = leafHeight * foliageTuning.heightScale * lodScale + foliageTuning.additiveHalfExtent * 2;
      const collisionCenter = add(attachment, scale(basis.up, finalHeight * 0.5));
      const densityWeight = parameters.leafDensityByHeightProfile
        ? sampleNormalizedProfile(
            parameters.leafDensityByHeightProfile,
            collisionCenter[1] / Math.max(height, Number.EPSILON)
          )
        : 1;
      leaves.push({
        id: proceduralTreeLeafCardId(stem.id, leafIndex),
        clusterId: stem.id,
        stemId: stem.id,
        progress,
        isTip:
          parameters.leafTerminalFraction === undefined ? leafIndex === leafCount - 1 : progress >= 1 - Number.EPSILON,
        attachment,
        stemAttachment,
        clusterCenter,
        clusterOutward,
        right: basis.right,
        up: basis.up,
        normal: basis.normal,
        tangentHandedness: basis.tangentHandedness,
        width: leafWidth,
        height: leafHeight,
        collisionCenter,
        collisionHalfWidth: finalWidth * 0.5,
        collisionHalfHeight: finalHeight * 0.5,
        densityWeight,
        variantIndex,
        variant,
        tone: clamp01(clamp01(attachment[1] / height) * 0.82 + variant.toneOffset + signedVariation(random, 0.035))
      });
    }
    clusters.push({ id: stem.id, stemId: stem.id, center: clusterCenter, outward: clusterOutward, leaves });
  }
  return clusters;
}

/** Regenerates Sapling child points only when an explicitly requested exact budget needs more candidates. */
function createSaplingLeafClustersForBudget(
  terminalStems: readonly SaplingStem[],
  height: number,
  parameters: SaplingTreeParameters,
  budget: number,
  seed: number,
  foliageTuning: ProceduralTreeFoliageGeometryTuning,
  lodScale: number
): LeafCluster[] {
  if (budget <= 0) return [];
  if (terminalStems.length === 0) {
    throw new RangeError(`Procedural leaf budget ${budget} requires at least one leaf-bearing stem`);
  }
  let leavesPerTerminalStem = parameters.leaves;
  const candidateTarget = budget * 2;
  let clusters = createSaplingLeafClusters(
    terminalStems,
    height,
    parameters,
    createRandom(seed),
    foliageTuning,
    lodScale,
    leavesPerTerminalStem
  );
  if (parameters.leafCountByStem) {
    if (leafClusterLeaves(clusters).length < budget) {
      throw new RangeError(
        `Per-stem leaf Count controls provide ${leafClusterLeaves(clusters).length} cards for budget ${budget}`
      );
    }
    return clusters;
  }
  while (leafClusterLeaves(clusters).length < candidateTarget) {
    const candidateCount = leafClusterLeaves(clusters).length;
    const proportionalDensity = Math.ceil((leavesPerTerminalStem * candidateTarget) / Math.max(candidateCount, 1));
    leavesPerTerminalStem = Math.max(leavesPerTerminalStem + 1, proportionalDensity);
    clusters = createSaplingLeafClusters(
      terminalStems,
      height,
      parameters,
      createRandom(seed),
      foliageTuning,
      lodScale,
      leavesPerTerminalStem
    );
  }
  return clusters;
}

function assertLeafNodeEditTargets(
  canonicalLeaves: readonly LeafAnchor[],
  canonicalBranches: readonly BranchPath[],
  edits: readonly ProceduralTreeLeafNodeEdit[]
): void {
  if (edits.length === 0) return;
  const canonicalIds = new Set(canonicalLeaves.map((leaf) => leaf.id));
  const missing = edits.map((entry) => entry.leafId).filter((leafId) => !canonicalIds.has(leafId));
  if (missing.length > 0) {
    throw new RangeError(`Leaf-node edits reference leaves absent from the generated result: ${missing.join(", ")}`);
  }
  const stemIds = new Set(canonicalBranches.map((branch) => branch.stableId));
  const missingStemIds = [...new Set(edits.map((entry) => entry.stemId).filter((stemId) => !stemIds.has(stemId)))];
  if (missingStemIds.length > 0) {
    throw new RangeError(
      `Leaf-node edits reference stems absent from the generated result: ${missingStemIds.join(", ")}`
    );
  }
}

/**
 * Applies final leaf transforms only after LOD selection. The resulting anchors are the
 * single source of truth for crown vertices, bounds, and per-vertex parent-stem data.
 */
function applyProceduralTreeLeafNodeEditsToAnchors(
  leaves: readonly LeafAnchor[],
  branches: readonly BranchPath[],
  treeHeight: number,
  edits: readonly ProceduralTreeLeafNodeEdit[]
): readonly LeafAnchor[] {
  if (edits.length === 0) return leaves;
  const editByLeafId = new Map(edits.map((entry) => [entry.leafId, entry]));
  const stemByStableId = new Map(branches.map((branch) => [branch.stableId, branch]));
  return leaves.map((leaf) => {
    const edit = editByLeafId.get(leaf.id);
    if (!edit) return leaf;
    const stem = stemByStableId.get(edit.stemId);
    if (!stem) throw new Error(`Procedural leaf ${leaf.id} references missing stem ${edit.stemId}`);
    const progress = edit.progressPercent / 100;
    const stemAttachment = samplePolyline(stem.points, progress);
    const stemFrame = createStemAttachmentFrame(stem.points, progress);
    const attachment = add(
      stemAttachment,
      stemFrameVector(stemFrame, scale(edit.positionOffsetPercentOfHeight, treeHeight / 100))
    );
    const right = [...edit.right] as Point;
    const up = [...edit.up] as Point;
    return {
      ...leaf,
      stemId: stem.id,
      progress,
      isTip: isStemTip(progress),
      attachment,
      stemAttachment,
      right,
      up,
      normal: leaf.normal,
      tangentHandedness: leaf.tangentHandedness,
      width: treeHeight * (edit.widthPercentOfHeight / 100),
      height: treeHeight * (edit.heightPercentOfHeight / 100)
    };
  });
}

function createLeafCardStates(
  leaves: readonly LeafAnchor[],
  branches: readonly BranchPath[],
  treeHeight: number
): readonly ProceduralTreeLeafCardState[] {
  const branchById = new Map(branches.map((branch) => [branch.id, branch]));
  return leaves.map((leaf) => {
    const stem = branchById.get(leaf.stemId);
    if (!stem) throw new Error(`Procedural leaf ${leaf.id} references missing stem ${leaf.stemId}`);
    return {
      leafId: leaf.id,
      stemId: stem.stableId,
      progressPercent: leaf.progress * 100,
      positionOffsetPercentOfHeight: scale(
        stemFrameCoordinates(
          createStemAttachmentFrame(stem.points, leaf.progress),
          subtract(leaf.attachment, leaf.stemAttachment)
        ),
        100 / treeHeight
      ),
      right: leaf.right,
      up: leaf.up,
      widthPercentOfHeight: (leaf.width / treeHeight) * 100,
      heightPercentOfHeight: (leaf.height / treeHeight) * 100
    };
  });
}

/** Rebuilds only card envelopes used by nested LOD sampling. Botanical roots and frames stay identical. */
function withLeafCollisionScale(
  leaves: readonly LeafAnchor[],
  treeHeight: number,
  parameters: SaplingTreeParameters,
  foliageTuning: ProceduralTreeFoliageGeometryTuning,
  foliageScale: number
): LeafAnchor[] {
  return leaves.map((leaf) => {
    const finalWidth = leaf.width * foliageTuning.widthScale * foliageScale + foliageTuning.additiveHalfExtent * 2;
    const finalHeight = leaf.height * foliageTuning.heightScale * foliageScale + foliageTuning.additiveHalfExtent * 2;
    const collisionCenter = add(leaf.attachment, scale(leaf.up, finalHeight * 0.5));
    const densityWeight = parameters.leafDensityByHeightProfile
      ? sampleNormalizedProfile(
          parameters.leafDensityByHeightProfile,
          collisionCenter[1] / Math.max(treeHeight, Number.EPSILON)
        )
      : 1;
    return {
      ...leaf,
      collisionCenter,
      collisionHalfWidth: finalWidth * 0.5,
      collisionHalfHeight: finalHeight * 0.5,
      densityWeight
    };
  });
}

/** Total alpha-card domain area. A shared mask keeps visible foliage coverage proportional to this value. */
function totalLeafCardCoverageArea(
  anchors: readonly LeafAnchor[],
  foliageTuning: ProceduralTreeFoliageGeometryTuning,
  foliageScale: number
): number {
  const additiveSize = foliageTuning.additiveHalfExtent * 2;
  return anchors.reduce(
    (sum, anchor) =>
      sum +
      (anchor.width * foliageTuning.widthScale * foliageScale + additiveSize) *
        (anchor.height * foliageTuning.heightScale * foliageScale + additiveSize),
    0
  );
}

/** Builds the physical botanical card frame; crown shading is resolved after the full leaf set exists. */
function createSaplingLeafBasis(
  tangent: Point,
  azimuth: number,
  downAngle: number,
  clusterOutward: Point,
  parameters: SaplingTreeParameters
): {
  readonly right: Point;
  readonly up: Point;
  readonly normal: Point;
  readonly tangentHandedness: 1 | -1;
} {
  const branchTangent = normalize(tangent);
  const localUp = normalizeOr(reject([0, 1, 0], branchTangent), reject(clusterOutward, branchTangent));
  const localSide = normalizeOr(cross(branchTangent, localUp), radialAround(branchTangent, Math.PI * 0.5));
  const phyllotaxyRadial = normalize(add(scale(localUp, Math.cos(azimuth)), scale(localSide, Math.sin(azimuth))));
  const crownRadial = normalizeOr(reject(clusterOutward, branchTangent), phyllotaxyRadial);
  const petioleRadial = normalize(
    add(
      scale(phyllotaxyRadial, 1 - parameters.leafOutwardOrientation),
      scale(crownRadial, parameters.leafOutwardOrientation)
    )
  );
  const up = normalize(add(scale(branchTangent, Math.cos(downAngle)), scale(petioleRadial, Math.sin(downAngle))));
  const baseNormal = normalizeOr(cross(petioleRadial, branchTangent), cross(up, localSide));
  const rolledNormal = rotateAroundAxis(baseNormal, up, degreesToRadians(parameters.leafAngle));
  const right = normalizeOr(cross(up, rolledNormal), localSide);
  const normal = normalize(cross(right, up));
  const tangentHandedness = dot(cross(normal, right), up) < 0 ? -1 : 1;
  return { right, up, normal, tangentHandedness };
}

/**
 * Resolves one continuous, generator-owned crown normal field after all canonical cards exist.
 * The field radiates from the crown's horizontal centroid on the generated root plane, matching
 * a tree's open upper hemisphere instead of treating each terminal cluster as an isolated sphere.
 */
function applyProceduralTreeCrownShadingNormals(
  leaves: readonly LeafAnchor[],
  treeRootHeight: number,
  crownBlendValue: number
): LeafAnchor[] {
  if (leaves.length === 0) return [];
  const cardCenters = leaves.map((leaf) => add(leaf.attachment, scale(leaf.up, leaf.height * 0.5)));
  const crownCenter = meanPoint(cardCenters);
  const normalOrigin: Point = [crownCenter[0], treeRootHeight, crownCenter[2]];
  const crownBlend = clamp01(crownBlendValue);
  return leaves.map((leaf, leafIndex) => {
    const { normal, tangentHandedness } = resolveProceduralTreeCrownShadingBasis(
      leaf.right,
      leaf.up,
      cardCenters[leafIndex],
      normalOrigin,
      crownBlend
    );
    return { ...leaf, normal, tangentHandedness };
  });
}

function resolveProceduralTreeCrownShadingBasis(
  rightValue: Point,
  upValue: Point,
  cardCenter: Point,
  normalOrigin: Point,
  crownBlend: number
): { readonly normal: Point; readonly tangentHandedness: 1 | -1 } {
  const crownDirection = normalizeOr(subtract(cardCenter, normalOrigin), [0, 1, 0]);
  const geometricNormal = normalize(cross(rightValue, upValue));
  // A reconstructed foliage normal is a shading field, not the flat card's face normal.
  // Keep the radial field independent from physical card roll; tangent space is rebuilt below.
  const outwardGeometricNormal =
    dot(geometricNormal, crownDirection) < 0 ? scale(geometricNormal, -1) : geometricNormal;
  const blendedNormal = normalizeOr(
    add(scale(outwardGeometricNormal, 1 - crownBlend), scale(crownDirection, crownBlend)),
    outwardGeometricNormal
  );
  const normal = constrainLeafNormalToUpperHemisphere(blendedNormal, rightValue, crownDirection);
  const shadingTangent = createLeafShadingTangent(rightValue, upValue, normal);
  const tangentHandedness = dot(cross(normal, shadingTangent), upValue) < 0 ? -1 : 1;
  return { normal, tangentHandedness };
}

/** Closest admissible unit direction when a blended thin-leaf normal points below the crown horizon. */
function constrainLeafNormalToUpperHemisphere(normal: Point, rightValue: Point, crownDirection: Point): Point {
  if (normal[1] >= 0) return normal;
  const right = normalize(rightValue);
  const horizontalCrown: Point = [crownDirection[0], 0, crownDirection[2]];
  const horizontalFallback: Point = Math.hypot(...horizontalCrown) > Number.EPSILON ? horizontalCrown : [1, 0, 0];
  let boundary = normalizeOr(cross([0, 1, 0], right), horizontalFallback);
  if (dot(boundary, crownDirection) < 0) boundary = scale(boundary, -1);
  return boundary;
}

/** Projects the physical U axis into the independent crown-normal tangent plane. */
function createLeafShadingTangent(rightValue: Point, upValue: Point, normalValue: Point): Point {
  const normal = normalize(normalValue);
  return normalizeOr(reject(rightValue, normal), reject(upValue, normal));
}

function attachTreeDissolvePaths(
  trunk: ProceduralTreeMeshData,
  crown: ProceduralTreeMeshData,
  branches: readonly BranchPath[]
) {
  const offsets = createWoodyUvVOffsetLookup(branches);
  const variations = createBranchVariationLookup(branches);
  const stems = new Map(branches.map((branch) => [branch.id, branch]));
  const origins = new Map<string, number>();
  const maxima = new Map<string, number>();
  for (const branch of branches) {
    const key = variations.get(branch.id)!.root.join(":");
    origins.set(key, Math.min(origins.get(key) ?? Infinity, offsets.get(branch.id)!));
  }
  const collect = (mesh: ProceduralTreeMeshData, leaf: boolean) =>
    mesh.positions.map((_, index) => {
      const data = mesh.treeVariationData![index];
      const key = mesh.treeVariationRoots![index].join(":");
      const stemId = Math.floor(data[1] + 0.00001);
      const stem = stems.get(stemId)!;
      const progress = data[0] - Math.min(1, Math.floor(data[0] * 0.5 + 0.00001)) * 2;
      const distance =
        (leaf ? offsets.get(stemId)! + polylineDistanceAtProgress(stem.points, progress) : mesh.uvs[index][1]) -
        origins.get(key)!;
      const tip = distance + (leaf ? mesh.uv1s![index][1] * 2 : 0);
      maxima.set(key, Math.max(maxima.get(key) ?? 0, tip));
      return { key, distance };
    });
  const woody = collect(trunk, false),
    leaves = collect(crown, true);
  const pack = (values: typeof woody) =>
    values.map(({ key, distance }) => [distance, Math.max(maxima.get(key)!, Number.EPSILON)] as const);
  return { trunk: { ...trunk, treeDissolvePaths: pack(woody) }, crown: { ...crown, treeDissolvePaths: pack(leaves) } };
}

function createBranchMesh(
  branches: readonly BranchPath[],
  radialSegments: readonly [number, number, number],
  curveSegmentBudgets: readonly [number, number, number],
  honorAuthoredTopology: boolean
): ProceduralTreeMeshData {
  const positions: Point[] = [];
  const normals: Point[] = [];
  const uvs: [number, number][] = [];
  const treeVariationRoots: Point[] = [];
  const treeVariationCenters: Point[] = [];
  const treeVariationData: [number, number, number][] = [];
  const indices: number[] = [];
  const branchVariation = createBranchVariationLookup(branches);
  const woodyUvVOffsets = createWoodyUvVOffsetLookup(branches);
  const branchById = new Map(branches.map((branch) => [branch.id, branch]));
  for (const branch of branches) {
    const sides = honorAuthoredTopology
      ? (branch.radialSegments ?? radialSegments[branch.level])
      : radialSegments[branch.level];
    if (sides < 3) continue;
    const variation = branchVariation.get(branch.id);
    if (!variation) throw new Error(`Procedural branch variation is missing branch ${branch.id}`);
    const woodyUvVOffset = woodyUvVOffsets.get(branch.id);
    if (woodyUvVOffset === undefined) throw new Error(`Procedural woody UV offset is missing branch ${branch.id}`);
    const support = branch.supportStemId === null ? undefined : branchById.get(branch.supportStemId);
    if (branch.supportStemId !== null && !support) {
      throw new Error(`Procedural branch ${branch.id} has no retained support ${branch.supportStemId}`);
    }
    const supportSides = support
      ? honorAuthoredTopology
        ? (support.radialSegments ?? radialSegments[support.level])
        : radialSegments[support.level]
      : 0;
    appendTube(
      branch,
      sides,
      curveSegmentBudgets[branch.level],
      woodyUvVOffset,
      support,
      supportSides,
      positions,
      normals,
      uvs,
      treeVariationRoots,
      treeVariationCenters,
      treeVariationData,
      indices,
      variation,
      honorAuthoredTopology
    );
  }
  return {
    ...finalizeMesh(positions, normals, uvs, indices),
    treeVariationRoots,
    treeVariationCenters,
    treeVariationData
  };
}

/**
 * Resolves one rooted-tree geodesic coordinate for every woody tube.
 *
 * A child tube starts at its supporting stem's attachment coordinate instead of
 * restarting V at zero. Bark therefore retains the same longitudinal phase on
 * both sides of every primary, secondary, and same-level continuation junction.
 */
function createWoodyUvVOffsetLookup(branches: readonly BranchPath[]): ReadonlyMap<number, number> {
  const branchById = new Map(branches.map((branch) => [branch.id, branch]));
  const resolved = new Map<number, number>();
  const resolving = new Set<number>();
  const resolve = (branch: BranchPath): number => {
    const cached = resolved.get(branch.id);
    if (cached !== undefined) return cached;
    if (resolving.has(branch.id)) throw new Error(`Procedural woody UV support cycle includes ${branch.id}`);
    resolving.add(branch.id);
    let offset = 0;
    if (branch.supportStemId !== null) {
      const support = branchById.get(branch.supportStemId);
      if (!support) {
        throw new Error(`Procedural woody UV branch ${branch.id} has no retained support ${branch.supportStemId}`);
      }
      offset = resolve(support) + polylineDistanceAtProgress(support.points, branch.attachmentProgress);
    }
    resolving.delete(branch.id);
    resolved.set(branch.id, offset);
    return offset;
  };
  branches.forEach(resolve);
  return resolved;
}

interface BranchVariation {
  readonly root: Point;
  readonly influence: 0 | 1;
  readonly branchRank: number;
}

/**
 * Resolves one coherent deformation root for every primary-branch subtree.
 * Scaling the full subtree around this root preserves all primary/twig attachment points.
 */
function createBranchVariationLookup(branches: readonly BranchPath[]): ReadonlyMap<number, BranchVariation> {
  const branchById = new Map(branches.map((branch) => [branch.id, branch]));
  const resolved = new Map<number, BranchVariation>();
  const resolving = new Set<number>();
  const resolve = (branch: BranchPath): BranchVariation => {
    const cached = resolved.get(branch.id);
    if (cached) return cached;
    if (resolving.has(branch.id)) throw new Error(`Procedural branch support cycle includes ${branch.id}`);
    resolving.add(branch.id);
    let variation: BranchVariation;
    if (branch.level === 0) {
      variation = { root: branch.points[0], influence: 0, branchRank: 0 };
    } else {
      const support = branch.supportStemId === null ? undefined : branchById.get(branch.supportStemId);
      variation =
        !support || support.level === 0
          ? { root: branch.points[0], influence: 1, branchRank: 0 }
          : { root: resolve(support).root, influence: 1, branchRank: 0 };
    }
    resolving.delete(branch.id);
    resolved.set(branch.id, variation);
    return variation;
  };
  branches.forEach(resolve);
  const rootKeys: string[] = [];
  const rootIndex = new Map<string, number>();
  resolved.forEach((variation) => {
    if (variation.influence === 0) return;
    const key = variation.root.join(":");
    if (!rootIndex.has(key)) {
      rootIndex.set(key, rootKeys.length);
      rootKeys.push(key);
    }
  });
  const ranks = deterministicLeafVisibilityRanks(rootKeys.length);
  resolved.forEach((variation, branchId) => {
    if (variation.influence === 0) return;
    resolved.set(branchId, {
      ...variation,
      branchRank: ranks[rootIndex.get(variation.root.join(":"))!]
    });
  });
  return resolved;
}

/** Assigns every card a unique, spatially decorrelated GPU visibility threshold. */
function deterministicLeafVisibilityRanks(count: number): readonly number[] {
  if (count <= 0) return [];
  const ordered = Array.from({ length: count }, (_, index) => ({ index, hash: mixUint32(index + 1) }));
  ordered.sort((left, right) => left.hash - right.hash || left.index - right.index);
  const ranks = new Array<number>(count);
  ordered.forEach((entry, rank) => {
    ranks[entry.index] = (rank + 0.5) / count;
  });
  return ranks;
}

function mixUint32(value: number): number {
  let mixed = value >>> 0;
  mixed = Math.imul(mixed ^ (mixed >>> 16), 0x7feb352d);
  mixed = Math.imul(mixed ^ (mixed >>> 15), 0x846ca68b);
  return (mixed ^ (mixed >>> 16)) >>> 0;
}

interface BranchMeshResolution {
  readonly radialSegments: readonly [number, number, number];
  readonly curveSegments: readonly [number, number, number];
}

/**
 * Finds the highest retained tube-detail score that satisfies a hard triangle ceiling.
 * Detail is weighted by generated stem length, so the search preserves the geometry
 * carrying the most visible silhouette instead of relying on species-specific LOD rules.
 */
function resolveBranchMeshResolution(
  branches: readonly BranchPath[],
  baseRadialSegments: readonly [number, number, number],
  baseCurveSegments: readonly [number, number, number],
  leafTriangleCount: number,
  triangleLimit: number,
  preferredTriangleCount: number
): BranchMeshResolution {
  const options = baseRadialSegments.map((baseSides, level) => {
    const baseSegments = baseCurveSegments[level];
    if (
      baseSides < MINIMUM_TUBE_RADIAL_SEGMENTS ||
      baseSegments < MINIMUM_TUBE_CURVE_SEGMENTS ||
      !branches.some((branch) => branch.level === level)
    ) {
      return [{ sides: 0, segments: 0 }] as const;
    }
    const values: { sides: number; segments: number }[] = [];
    for (let sides = MINIMUM_TUBE_RADIAL_SEGMENTS; sides <= baseSides; sides++) {
      for (let segments = MINIMUM_TUBE_CURVE_SEGMENTS; segments <= baseSegments; segments++) {
        values.push({ sides, segments });
      }
    }
    return values;
  });
  const totalStemLength = branches.reduce((sum, branch) => sum + branch.length, 0);
  const scoredOptions = options.map((levelOptions, level) =>
    levelOptions.map((resolution) => {
      let triangleCount = 0;
      let geometricLoss = 0;
      for (const stem of branches) {
        if (stem.level !== level) continue;
        const curveSegments = Math.min(stem.points.length - 1, resolution.segments);
        triangleCount += 2 * resolution.sides * curveSegments;
        const centerlineError = polylineApproximationRmsDistance(stem.points, curveSegments);
        const meanRadius = stem.radii.reduce((sum, radius) => sum + radius, 0) / stem.radii.length;
        const radialSagitta = meanRadius * (1 - Math.cos(Math.PI / resolution.sides));
        geometricLoss += stem.length * (centerlineError + radialSagitta);
      }
      return { resolution, triangleCount, geometricLoss };
    })
  );
  const paretoOptions = scoredOptions.map((levelOptions) => {
    const bestAtTriangleCount = new Map<number, (typeof levelOptions)[number]>();
    for (const option of levelOptions) {
      const retained = bestAtTriangleCount.get(option.triangleCount);
      if (!retained || option.geometricLoss < retained.geometricLoss - Number.EPSILON) {
        bestAtTriangleCount.set(option.triangleCount, option);
      }
    }
    const frontier: (typeof levelOptions)[number][] = [];
    let lowestLoss = Number.POSITIVE_INFINITY;
    for (const option of [...bestAtTriangleCount.values()].sort(
      (left, right) => left.triangleCount - right.triangleCount
    )) {
      if (option.geometricLoss >= lowestLoss - Number.EPSILON) continue;
      frontier.push(option);
      lowestLoss = option.geometricLoss;
    }
    return frontier;
  });
  const parentTriangleCounts: Int32Array[] = [];
  const selectedOptionIndices: Int32Array[] = [];
  const maximumAttainableTriangles =
    leafTriangleCount +
    paretoOptions.reduce(
      (sum, levelOptions) => sum + Math.max(0, ...levelOptions.map((option) => option.triangleCount)),
      0
    );
  const effectiveTriangleLimit = Math.min(triangleLimit, maximumAttainableTriangles);
  let activeTriangleCounts = leafTriangleCount <= effectiveTriangleLimit ? [leafTriangleCount] : [];
  let losses = new Float64Array(effectiveTriangleLimit + 1);
  losses.fill(Number.POSITIVE_INFINITY);
  if (activeTriangleCounts.length) losses[leafTriangleCount] = 0;
  for (const levelOptions of paretoOptions) {
    // This is a three-stage multiple-choice knapsack. Each integer triangle count
    // stores only its lowest loss and back-pointers, so memory is bounded by the
    // hard budget rather than the number of cross-level combinations.
    const nextLosses = new Float64Array(effectiveTriangleLimit + 1);
    nextLosses.fill(Number.POSITIVE_INFINITY);
    const previousCounts = new Int32Array(effectiveTriangleLimit + 1);
    const optionIndices = new Int32Array(effectiveTriangleLimit + 1);
    previousCounts.fill(-1);
    optionIndices.fill(-1);
    for (const triangleCount of activeTriangleCounts) {
      for (let optionIndex = 0; optionIndex < levelOptions.length; optionIndex++) {
        const option = levelOptions[optionIndex];
        const nextTriangleCount = triangleCount + option.triangleCount;
        if (nextTriangleCount > effectiveTriangleLimit) continue;
        const nextLoss = losses[triangleCount] + option.geometricLoss;
        if (nextLoss < nextLosses[nextTriangleCount] - Number.EPSILON) {
          nextLosses[nextTriangleCount] = nextLoss;
          previousCounts[nextTriangleCount] = triangleCount;
          optionIndices[nextTriangleCount] = optionIndex;
        }
      }
    }
    activeTriangleCounts = [];
    let lowestLoss = Number.POSITIVE_INFINITY;
    for (let triangleCount = 0; triangleCount <= effectiveTriangleLimit; triangleCount++) {
      const loss = nextLosses[triangleCount];
      // A lower/equal triangle recipe with lower/equal loss dominates this state
      // under both the hard ceiling and the preferred-budget objective.
      if (loss >= lowestLoss - Number.EPSILON) continue;
      activeTriangleCounts.push(triangleCount);
      lowestLoss = loss;
    }
    parentTriangleCounts.push(previousCounts);
    selectedOptionIndices.push(optionIndices);
    losses = nextLosses;
  }
  let best: { triangleCount: number; geometricLoss: number; quality: number } | undefined;
  for (const triangleCount of activeTriangleCounts) {
    const geometricLoss = losses[triangleCount];
    // A screen-space tube silhouette is displaced by both centerline chord error
    // and polygonal cross-section sagitta. Integrating that displacement along
    // stem length gives a geometry-derived LOD loss without species presets.
    const quality = totalStemLength > 0 ? -geometricLoss / totalStemLength : 0;
    const withinPreferred = triangleCount <= preferredTriangleCount;
    const bestWithinPreferred = best ? best.triangleCount <= preferredTriangleCount : false;
    if (
      !best ||
      (withinPreferred && !bestWithinPreferred) ||
      (withinPreferred === bestWithinPreferred &&
        (withinPreferred
          ? quality > best.quality + Number.EPSILON ||
            (Math.abs(quality - best.quality) <= Number.EPSILON && triangleCount > best.triangleCount)
          : triangleCount < best.triangleCount ||
            (triangleCount === best.triangleCount && quality > best.quality + Number.EPSILON)))
    ) {
      best = { triangleCount, geometricLoss, quality };
    }
  }
  if (!best) {
    throw new RangeError(
      `Procedural tree cannot satisfy ${triangleLimit} triangles: ${leafTriangleCount} leaf triangles leave insufficient room for the retained stems`
    );
  }
  const radialSegments = [0, 0, 0];
  const curveSegments = [0, 0, 0];
  let triangleCount = best.triangleCount;
  for (let level = paretoOptions.length - 1; level >= 0; level--) {
    const optionIndex = selectedOptionIndices[level][triangleCount];
    const option = paretoOptions[level][optionIndex];
    radialSegments[level] = option.resolution.sides;
    curveSegments[level] = option.resolution.segments;
    triangleCount = parentTriangleCounts[level][triangleCount];
  }
  return {
    radialSegments: radialSegments as [number, number, number],
    curveSegments: curveSegments as [number, number, number]
  };
}

function polylineApproximationRmsDistance(points: readonly Point[], segmentBudget: number): number {
  const segmentCount = Math.max(1, Math.min(points.length - 1, segmentBudget));
  const approximation = Array.from({ length: segmentCount + 1 }, (_, index) =>
    samplePolyline(points, index / segmentCount)
  );
  let squaredError = 0;
  for (const point of points) {
    let nearest = Number.POSITIVE_INFINITY;
    for (let segment = 0; segment < approximation.length - 1; segment++) {
      const start = approximation[segment];
      const edge = subtract(approximation[segment + 1], start);
      const edgeLengthSquared = dot(edge, edge);
      const progress =
        edgeLengthSquared > Number.EPSILON ? clamp(dot(subtract(point, start), edge) / edgeLengthSquared) : 0;
      nearest = Math.min(nearest, squaredDistance(point, add(start, scale(edge, progress))));
    }
    squaredError += nearest;
  }
  return Math.sqrt(squaredError / Math.max(points.length, 1));
}

function appendTube(
  branch: BranchPath,
  sides: number,
  segmentBudget: number,
  woodyUvVOffset: number,
  support: BranchPath | undefined,
  supportSides: number,
  positions: Point[],
  normals: Point[],
  uvs: [number, number][],
  treeVariationRoots: Point[],
  treeVariationCenters: Point[],
  treeVariationData: [number, number, number][],
  indices: number[],
  variation: BranchVariation,
  honorAuthoredTopology: boolean
): void {
  const authoredSubdivisions = honorAuthoredTopology ? branch.axialSubdivisions : undefined;
  const sampled = authoredSubdivisions
    ? subdivideStemPath(branch.points, branch.radii, authoredSubdivisions)
    : (() => {
        const segmentCount = Math.max(1, Math.min(branch.points.length - 1, segmentBudget));
        return {
          points: Array.from({ length: segmentCount + 1 }, (_, index) =>
            samplePolyline(branch.points, index / segmentCount)
          ),
          radii: Array.from({ length: segmentCount + 1 }, (_, index) =>
            sampleScalar(branch.radii, index / segmentCount)
          )
        };
      })();
  const points = sampled.points;
  const radii =
    honorAuthoredTopology && branch.tipCap
      ? sampled.radii.map((radius, index) => (index === sampled.radii.length - 1 ? 0 : radius))
      : sampled.radii;
  const vertexStart = positions.length;
  const ringStride = sides + 1;
  const pathDistances = new Array<number>(points.length).fill(0);
  for (let pointIndex = 1; pointIndex < points.length; pointIndex++) {
    pathDistances[pointIndex] =
      pathDistances[pointIndex - 1] + Math.sqrt(squaredDistance(points[pointIndex], points[pointIndex - 1]));
  }
  let previousRight: Point | undefined;
  let previousUp: Point | undefined;
  for (let pointIndex = 0; pointIndex < points.length; pointIndex++) {
    const before = points[Math.max(0, pointIndex - 1)];
    const after = points[Math.min(points.length - 1, pointIndex + 1)];
    const tangent = normalize(subtract(after, before));
    const reference: Point = Math.abs(tangent[1]) < 0.92 ? [0, 1, 0] : [1, 0, 0];
    let right = previousRight
      ? normalizeOr(
          reject(previousRight, tangent),
          normalizeOr(reject(previousUp!, tangent), normalize(cross(reference, tangent)))
        )
      : normalize(cross(reference, tangent));
    // Parallel transport keeps adjacent cross-sections in the same hemisphere. Rebuilding
    // every ring from a world-axis reference flips the frame when a curved Path crosses
    // that reference threshold, which folds the connecting quad and reverses a triangle.
    if (previousRight && dot(right, previousRight) < 0) right = scale(right, -1);
    const up = normalize(cross(tangent, right));
    previousRight = right;
    previousUp = up;
    for (let side = 0; side <= sides; side++) {
      // A per-vertex UV stream requires a duplicated seam vertex. Reusing side zero
      // for the terminal face would interpolate from the full circumference back to
      // zero inside one triangle and create a longitudinal smear.
      const wrappedSide = side === sides ? 0 : side;
      const angle = (wrappedSide / sides) * Math.PI * 2;
      const normal = add(scale(right, Math.cos(angle)), scale(up, Math.sin(angle)));
      const tubePosition = add(points[pointIndex], scale(normal, radii[pointIndex]));
      positions.push(
        pointIndex === 0 && support && support.level < branch.level
          ? constrainChildRootToSupportTube(tubePosition, support, supportSides)
          : tubePosition
      );
      normals.push(normal);
      // UV units are canonical metres on the rendered tube surface. The material
      // owns repeats-per-metre, so changing path subdivision or branch dimensions
      // cannot stretch one texture over an arbitrary normalized 0..1 chart.
      uvs.push([(side / sides) * Math.PI * 2 * radii[pointIndex], woodyUvVOffset + pathDistances[pointIndex]]);
      treeVariationRoots.push(variation.root);
      treeVariationCenters.push(points[pointIndex]);
      const stemProgress = pointIndex / Math.max(points.length - 1, 1);
      treeVariationData.push([variation.influence * 2 + stemProgress, branch.id, variation.branchRank]);
    }
  }
  for (let segment = 0; segment < points.length - 1; segment++) {
    for (let side = 0; side < sides; side++) {
      const next = side + 1;
      const lower = vertexStart + segment * ringStride;
      const upper = lower + ringStride;
      indices.push(lower + side, lower + next, upper + side, lower + next, upper + next, upper + side);
    }
  }
}

/**
 * Shapes a child tube's first ring inside the convex core of its supporting tube.
 *
 * Measured tree junctions use a sheared root ring that follows the parent surface;
 * rebuilding that ring as a regular child-normal cross-section can expose it through
 * the parent's back face. The inradius is the largest circle guaranteed to remain
 * inside a regular support polygon regardless of its transported frame phase.
 */
function constrainChildRootToSupportTube(position: Point, support: BranchPath, supportSides: number): Point {
  if (supportSides < MINIMUM_TUBE_RADIAL_SEGMENTS) {
    throw new RangeError(`Procedural support tube needs at least ${MINIMUM_TUBE_RADIAL_SEGMENTS} radial segments`);
  }
  let closestPoint = support.points[0];
  let closestOffset = subtract(position, closestPoint);
  let closestDistanceSquared = dot(closestOffset, closestOffset);
  let supportRadius = support.radii[0];
  for (let segment = 0; segment < support.points.length - 1; segment++) {
    const start = support.points[segment];
    const edge = subtract(support.points[segment + 1], start);
    const edgeLengthSquared = dot(edge, edge);
    const progress =
      edgeLengthSquared > Number.EPSILON ? clamp(dot(subtract(position, start), edge) / edgeLengthSquared) : 0;
    const candidatePoint = add(start, scale(edge, progress));
    const candidateOffset = subtract(position, candidatePoint);
    const candidateDistanceSquared = dot(candidateOffset, candidateOffset);
    if (candidateDistanceSquared < closestDistanceSquared) {
      closestPoint = candidatePoint;
      closestOffset = candidateOffset;
      closestDistanceSquared = candidateDistanceSquared;
      supportRadius = support.radii[segment] * (1 - progress) + support.radii[segment + 1] * progress;
    }
  }
  const guaranteedInteriorRadius = supportRadius * Math.cos(Math.PI / supportSides);
  const distance = Math.sqrt(closestDistanceSquared);
  return distance > guaranteedInteriorRadius && distance > Number.EPSILON
    ? add(closestPoint, scale(closestOffset, guaranteedInteriorRadius / distance))
    : position;
}

function subdivideStemPath(
  controls: readonly Point[],
  radii: readonly number[],
  subdivisions: readonly number[]
): { readonly points: readonly Point[]; readonly radii: readonly number[] } {
  if (subdivisions.length !== controls.length - 1 || radii.length !== controls.length) {
    throw new RangeError("Authored stem topology must match its Path and radius controls");
  }
  const points: Point[] = [];
  const sampledRadii: number[] = [];
  subdivisions.forEach((count, segment) => {
    for (let step = 0; step < count; step++) {
      const progress = step / count;
      points.push(add(scale(controls[segment], 1 - progress), scale(controls[segment + 1], progress)));
      sampledRadii.push(radii[segment] * (1 - progress) + radii[segment + 1] * progress);
    }
  });
  points.push([...controls[controls.length - 1]] as Point);
  sampledRadii.push(radii[radii.length - 1]);
  return { points, radii: sampledRadii };
}

function resolvedMeshRadialSegments(
  branches: readonly BranchPath[],
  fallback: readonly [number, number, number],
  honorAuthoredTopology: boolean
): readonly [number, number, number] {
  if (!honorAuthoredTopology) return fallback;
  return [0, 1, 2].map((level) =>
    Math.max(
      fallback[level],
      0,
      ...branches.filter((branch) => branch.level === level).map((branch) => branch.radialSegments ?? 0)
    )
  ) as unknown as [number, number, number];
}

function resolvedMeshCurveSegments(
  branches: readonly BranchPath[],
  fallback: readonly [number, number, number],
  honorAuthoredTopology: boolean
): readonly [number, number, number] {
  if (!honorAuthoredTopology) return fallback;
  return [0, 1, 2].map((level) =>
    Math.max(
      fallback[level],
      0,
      ...branches
        .filter((branch) => branch.level === level)
        .map((branch) => branch.axialSubdivisions?.reduce((sum, count) => sum + count, 0) ?? 0)
    )
  ) as unknown as [number, number, number];
}

function createLeafMesh(
  anchors: readonly LeafAnchor[],
  branches: readonly BranchPath[],
  lodScale: number,
  treeHeight: number,
  foliageTuning: ProceduralTreeFoliageGeometryTuning,
  canonicalLeafIndexById: ReadonlyMap<string, number>,
  surfaces: ProceduralTreeStructureParameters["leafSurfaces"],
  lodIndex: number,
  normalField?: PlantNormalField
): ProceduralTreeMeshData {
  const positions: Point[] = [];
  const normals: Point[] = [];
  const uvs: [number, number][] = [];
  const uv1s: [number, number][] = [];
  const uv2s: [number, number][] = [];
  const colors: [number, number, number, number][] = [];
  const tangents: [number, number, number, number][] = [];
  const leafPivots: Point[] = [];
  const leafUps: Point[] = [];
  const leafLocals: [number, number][] = [];
  const leafShapePositions: Point[] = [];
  const leafShapeNormals: Point[] = [];
  const leafCardIds: string[] = [];
  const leafCardIndices: number[] = [];
  const treeVariationRoots: Point[] = [];
  const treeVariationCenters: Point[] = [];
  const treeVariationData: [number, number, number][] = [];
  const indices: number[] = [];
  const bounds = emptyBounds();
  const branchVariation = createBranchVariationLookup(branches);
  const leafRanks = deterministicLeafVisibilityRanks(anchors.length);
  const compiledSurfaces = new Map(
    Object.entries(surfaces ?? {}).map(([id, surface]) => [
      id,
      buildPlantShapeGeometry(surface.shape, surface.resolution)
    ])
  );
  for (let anchorIndex = 0; anchorIndex < anchors.length; anchorIndex++) {
    const anchor = anchors[anchorIndex];
    leafCardIds.push(anchor.id);
    const canonicalLeafIndex = canonicalLeafIndexById.get(anchor.id);
    if (canonicalLeafIndex === undefined)
      throw new Error(`Procedural leaf ${anchor.id} has no canonical GPU frame index`);
    const variation = branchVariation.get(anchor.stemId);
    if (!variation) throw new Error(`Procedural leaf references missing branch variation ${anchor.stemId}`);
    const halfWidth = (anchor.width * foliageTuning.widthScale * lodScale + foliageTuning.additiveHalfExtent * 2) * 0.5;
    const height = anchor.height * foliageTuning.heightScale * lodScale + foliageTuning.additiveHalfExtent * 2;
    const vertexStart = positions.length;
    const shadingTangent = createLeafShadingTangent(anchor.right, anchor.up, anchor.normal);
    const surface = compiledSurfaces.get(anchor.surfaceIdsByLod?.[lodIndex] ?? "") ?? TREE_LEAF_SURFACE;
    const front = normalize(cross(anchor.right, anchor.up));
    for (let vertex = 0; vertex < surface.positions.length; vertex++) {
      const sample = surface.positions[vertex];
      const local = [sample[0] * halfWidth, sample[1] * height] as const;
      const position = add(
        anchor.attachment,
        add(add(scale(anchor.right, local[0]), scale(anchor.up, local[1])), scale(front, sample[2] * halfWidth))
      );
      positions.push(position);
      include(bounds, position);
      const shapeNormal = surface.normals[vertex];
      const localNormal = normalize([shapeNormal[0], (shapeNormal[1] * halfWidth) / height, shapeNormal[2]]);
      const geometricNormal = add(
        add(scale(anchor.right, localNormal[0]), scale(anchor.up, localNormal[1])),
        scale(anchor.normal, localNormal[2])
      );
      const shadingNormal = evaluatePlantNormalField(position, geometricNormal, normalField);
      normals.push(shadingNormal);
      leafShapePositions.push(sample);
      leafShapeNormals.push(shapeNormal);
      uvs.push([surface.uvs[vertex][0], surface.uvs[vertex][1]]);
      uv1s.push([halfWidth, height * 0.5]);
      uv2s.push([canonicalLeafIndex, 0]);
      colors.push([
        anchor.clusterOutward[0] * 0.5 + 0.5,
        anchor.clusterOutward[1] * 0.5 + 0.5,
        anchor.clusterOutward[2] * 0.5 + 0.5,
        anchor.tone
      ]);
      const tangent = normalField?.radialBlend
        ? createLeafShadingTangent(anchor.right, anchor.up, shadingNormal)
        : shadingTangent;
      tangents.push([tangent[0], tangent[1], tangent[2], anchor.tangentHandedness]);
      leafPivots.push(anchor.attachment);
      leafUps.push(anchor.up);
      leafLocals.push([local[0], local[1]]);
      leafCardIndices.push(canonicalLeafIndex);
      treeVariationRoots.push(variation.root);
      treeVariationCenters.push(anchor.stemAttachment);
      treeVariationData.push([
        variation.influence * 2 + anchor.progress,
        anchor.stemId + leafRanks[anchorIndex],
        variation.branchRank
      ]);
    }
    for (const index of surface.indices) indices.push(vertexStart + index);
  }
  if (anchors.length === 0) include(bounds, [0, treeHeight, 0]);
  return {
    positions,
    normals,
    uvs,
    uv1s,
    uv2s,
    colors,
    tangents,
    leafPivots,
    leafUps,
    leafLocals,
    leafShapePositions,
    leafShapeNormals,
    leafCardIds,
    leafCardIndices,
    treeVariationRoots,
    treeVariationCenters,
    treeVariationData,
    indices: toIndexArray(indices),
    bounds: [bounds.minimum, bounds.maximum],
    triangleCount: indices.length / 3
  };
}

/**
 * Keeps one unconditional terminal leaf per stem, then fills the remaining budget in
 * per-stem rounds from the tip inward. A stem therefore cannot consume its second card
 * before the other terminal stems have received their first, which prevents long local
 * runs of cards from tracing one curved twig.
 */
function selectLodLeaves(
  leaves: readonly LeafAnchor[],
  budget: number,
  spacing: number,
  branches: readonly SaplingStem[]
): readonly LeafAnchor[] {
  if (leaves.length < budget) {
    throw new Error(`Procedural tree needs at least ${budget} leaf anchors, received ${leaves.length}`);
  }
  const sourceOrder = new Map(leaves.map((leaf, index) => [leaf, index]));
  const selected = [...selectCrownSilhouetteLeaves(leaves, budget)];
  const selectedSet = new Set(selected);
  const firstTipByStem = new Map<number, LeafAnchor>();
  leaves.forEach((leaf) => {
    if (leaf.isTip && !firstTipByStem.has(leaf.stemId)) firstTipByStem.set(leaf.stemId, leaf);
  });
  const tipLeaves = [...firstTipByStem.values()].filter((leaf) => !selectedSet.has(leaf));
  const remainingTipBudget = budget - selected.length;
  const retainedTips =
    tipLeaves.length > remainingTipBudget
      ? collisionAwareLeafSample(tipLeaves, remainingTipBudget, selected, spacing, branches)
      : tipLeaves;
  selected.push(...retainedTips);
  retainedTips.forEach((leaf) => selectedSet.add(leaf));
  if (selected.length === budget)
    return selected.sort((left, right) => sourceOrder.get(left)! - sourceOrder.get(right)!);

  const remaining = leaves.filter((leaf) => !selectedSet.has(leaf));
  selected.push(...collisionAwareLeafSample(remaining, budget - selected.length, selected, spacing, branches));
  return selected.sort((left, right) => sourceOrder.get(left)! - sourceOrder.get(right)!);
}

/** Retains the six axial crown extrema before spending the remaining leaf budget on interior coverage. */
function selectCrownSilhouetteLeaves(candidates: readonly LeafAnchor[], budget: number): readonly LeafAnchor[] {
  if (budget <= 0 || candidates.length === 0) return [];
  const directions: readonly Point[] = [
    [1, 0, 0],
    [-1, 0, 0],
    [0, 1, 0],
    [0, -1, 0],
    [0, 0, 1],
    [0, 0, -1]
  ];
  const sourceOrder = new Map(candidates.map((leaf, index) => [leaf, index]));
  const selected: LeafAnchor[] = [];
  const selectedSet = new Set<LeafAnchor>();
  for (const direction of directions) {
    const extreme = candidates.reduce((best, candidate) => {
      const bestExtent = dot(best.collisionCenter, direction) + projectedLeafExtent(best, direction);
      const candidateExtent = dot(candidate.collisionCenter, direction) + projectedLeafExtent(candidate, direction);
      return candidateExtent > bestExtent ||
        (candidateExtent === bestExtent && sourceOrder.get(candidate)! < sourceOrder.get(best)!)
        ? candidate
        : best;
    });
    if (!selectedSet.has(extreme)) {
      selected.push(extreme);
      selectedSet.add(extreme);
      if (selected.length === budget) break;
    }
  }
  return selected;
}

/**
 * Selects only authored attachment points. The artist control blends terminal-cluster
 * priority with normalized nearest-selected distance, so increasing spacing fills crown
 * gaps without changing card count, branch geometry, or tip attachment.
 */
function collisionAwareLeafSample(
  candidates: readonly LeafAnchor[],
  count: number,
  retained: readonly LeafAnchor[],
  spacing: number,
  branches: readonly SaplingStem[]
): LeafAnchor[] {
  if (count <= 0 || candidates.length === 0) return [];

  const clearance = clamp01(spacing);
  const terminalOrder = new Map(terminalClusterLeafOrder(candidates).map((leaf, index) => [leaf, index]));
  const maximumDensity = Math.max(...candidates.map((leaf) => leaf.densityWeight), Number.EPSILON);
  const ranked = candidates
    .map((leaf, sourceIndex) => ({
      leaf,
      sourceIndex,
      densityScore:
        (0.25 + 0.75 * (1 - terminalOrder.get(leaf)! / Math.max(candidates.length - 1, 1))) *
        (leaf.densityWeight / maximumDensity)
    }))
    .filter(({ leaf }) => !leafIntersectsForeignBranch(leaf, branches, clearance));
  if (clearance === 0) {
    return ranked
      .sort((left, right) => right.densityScore - left.densityScore || left.sourceIndex - right.sourceIndex)
      .slice(0, count)
      .sort((left, right) => left.sourceIndex - right.sourceIndex)
      .map(({ leaf }) => leaf);
  }
  const chosen = [...retained];
  const result: typeof ranked = [];

  while (result.length < count && ranked.length > 0) {
    const eligible = ranked.map(({ leaf }) => !leafIntersectsSelectedLeaves(leaf, chosen, clearance));
    if (!eligible.some(Boolean)) break;
    const nearestDistances = ranked.map(({ leaf }, index) =>
      !eligible[index] || chosen.length === 0
        ? 0
        : chosen.reduce(
            (minimum, selected) => Math.min(minimum, squaredDistance(leaf.collisionCenter, selected.collisionCenter)),
            Number.POSITIVE_INFINITY
          )
    );
    const maximumDistance = Math.max(...nearestDistances, 0);
    let bestIndex = 0;
    let bestScore = Number.NEGATIVE_INFINITY;
    for (let index = 0; index < ranked.length; index++) {
      if (!eligible[index]) continue;
      const distanceScore = maximumDistance > 0 ? nearestDistances[index] / maximumDistance : 0;
      const score = ranked[index].densityScore * (1 - clearance) + distanceScore * clearance;
      if (score > bestScore || (score === bestScore && ranked[index].sourceIndex < ranked[bestIndex].sourceIndex)) {
        bestIndex = index;
        bestScore = score;
      }
    }
    const [next] = ranked.splice(bestIndex, 1);
    result.push(next);
    chosen.push(next.leaf);
  }

  return result.sort((left, right) => left.sourceIndex - right.sourceIndex).map(({ leaf }) => leaf);
}

function terminalClusterLeafOrder(candidates: readonly LeafAnchor[]): LeafAnchor[] {
  const sourceOrder = new Map(candidates.map((leaf, index) => [leaf, index]));
  const byStem = new Map<number, LeafAnchor[]>();
  candidates.forEach((leaf) => {
    const group = byStem.get(leaf.stemId) ?? [];
    group.push(leaf);
    byStem.set(leaf.stemId, group);
  });
  const stemGroups = [...byStem.entries()]
    .map(([stemId, leaves]) => ({
      stemId,
      leaves: leaves.sort(
        (left, right) => right.progress - left.progress || sourceOrder.get(left)! - sourceOrder.get(right)!
      ),
      rank: hashString(`terminal-leaf-stem:${stemId}`)
    }))
    .sort((left, right) => left.rank - right.rank || left.stemId - right.stemId);

  const ordered: LeafAnchor[] = [];
  const maximumRound = Math.max(0, ...stemGroups.map((group) => group.leaves.length));
  for (let round = 0; round < maximumRound; round++) {
    stemGroups.forEach((group) => {
      const leaf = group.leaves[round];
      if (leaf) ordered.push(leaf);
    });
  }
  return ordered;
}

function leafClusterLeaves(clusters: readonly LeafCluster[]): LeafAnchor[] {
  return clusters.flatMap((cluster) => cluster.leaves);
}

function selectLeafVariant(variants: SaplingTreeParameters["leafVariants"], sample: number): 0 | 1 | 2 | 3 | 4 {
  const totalWeight = variants.reduce((sum, variant) => sum + Math.max(0, variant.weight), 0);
  if (totalWeight <= 0) throw new Error("Procedural tree leaf variants require positive total weight");
  let threshold = clamp01(sample) * totalWeight;
  for (let index = 0; index < variants.length; index++) {
    threshold -= Math.max(0, variants[index].weight);
    if (threshold <= 0) return index as 0 | 1 | 2 | 3 | 4;
  }
  return 4;
}

function countLeafVariants(leaves: readonly LeafAnchor[]): [number, number, number, number, number] {
  const counts: [number, number, number, number, number] = [0, 0, 0, 0, 0];
  leaves.forEach((leaf) => counts[leaf.variantIndex]++);
  return counts;
}

function leafIntersectsSelectedLeaves(
  candidate: LeafAnchor,
  selected: readonly LeafAnchor[],
  clearance: number
): boolean {
  if (clearance <= 0) return false;
  return selected.some((leaf) => {
    const centerDelta = subtract(candidate.collisionCenter, leaf.collisionCenter);
    const centerDistance = Math.hypot(...centerDelta);
    if (centerDistance <= Number.EPSILON) return true;
    const separationAxis = scale(centerDelta, 1 / centerDistance);
    const candidateExtent = projectedLeafExtent(candidate, separationAxis);
    const selectedExtent = projectedLeafExtent(leaf, separationAxis);
    return centerDistance < (candidateExtent + selectedExtent) * clearance;
  });
}

function leafIntersectsForeignBranch(leaf: LeafAnchor, branches: readonly SaplingStem[], clearance: number): boolean {
  if (clearance <= 0) return false;
  return branches.some((branch) => {
    if (branch.id === leaf.stemId) return false;
    const closest = closestPointOnBranch(leaf.collisionCenter, branch);
    if (closest.distance <= Number.EPSILON) return true;
    const separationAxis = normalize(subtract(leaf.collisionCenter, closest.point));
    return closest.distance < closest.radius + projectedLeafExtent(leaf, separationAxis) * clearance;
  });
}

function projectedLeafExtent(leaf: LeafAnchor, axis: Point): number {
  return (
    Math.abs(dot(axis, leaf.right)) * leaf.collisionHalfWidth + Math.abs(dot(axis, leaf.up)) * leaf.collisionHalfHeight
  );
}

function closestPointOnBranch(
  point: Point,
  branch: SaplingStem
): { readonly distance: number; readonly radius: number; readonly point: Point } {
  let minimumSquaredDistance = Number.POSITIVE_INFINITY;
  let radius = branch.startRadius;
  let closestPoint = branch.points[0];
  for (let segment = 0; segment < branch.points.length - 1; segment++) {
    const start = branch.points[segment];
    const end = branch.points[segment + 1];
    const edge = subtract(end, start);
    const edgeLengthSquared = dot(edge, edge);
    const progress =
      edgeLengthSquared > Number.EPSILON ? clamp(dot(subtract(point, start), edge) / edgeLengthSquared) : 0;
    const closest = add(start, scale(edge, progress));
    const distance = squaredDistance(point, closest);
    if (distance < minimumSquaredDistance) {
      minimumSquaredDistance = distance;
      radius = branch.radii[segment] * (1 - progress) + branch.radii[segment + 1] * progress;
      closestPoint = closest;
    }
  }
  return { distance: Math.sqrt(minimumSquaredDistance), radius, point: closestPoint };
}

function closestProgressOnBranch(
  point: Point,
  branch: SaplingStem
): { readonly distance: number; readonly progress: number } {
  // Acceptance defines leaf emission progress on the generator's root-to-tip chord,
  // matching SpeedTree's First/Last axis even when the rendered centerline is curved.
  const start = branch.points[0];
  const edge = subtract(branch.points[branch.points.length - 1], start);
  const edgeLengthSquared = dot(edge, edge);
  const progress =
    edgeLengthSquared > Number.EPSILON ? clamp(dot(subtract(point, start), edge) / edgeLengthSquared) : 0;
  const closest = add(start, scale(edge, progress));
  return {
    distance: Math.sqrt(squaredDistance(point, closest)),
    progress
  };
}

function finalizeMesh(
  positions: readonly Point[],
  normals: readonly Point[],
  uvs: readonly (readonly [number, number])[],
  indices: readonly number[]
): ProceduralTreeMeshData {
  const bounds = emptyBounds();
  positions.forEach((position) => include(bounds, position));
  if (positions.length === 0) {
    bounds.minimum = [0, 0, 0];
    bounds.maximum = [0, 0, 0];
  }
  return {
    positions,
    normals,
    uvs,
    indices: toIndexArray(indices),
    bounds: [bounds.minimum, bounds.maximum],
    triangleCount: indices.length / 3
  };
}

function uploadMesh(engine: Engine, name: string, data: ProceduralTreeMeshData): ModelMesh {
  const mesh = new ModelMesh(engine, name);
  mesh.setPositions(data.positions.map(([x, y, z]) => new Vector3(x, y, z)));
  mesh.setNormals(data.normals.map(([x, y, z]) => new Vector3(x, y, z)));
  mesh.setUVs(data.uvs.map(([x, y]) => new Vector2(x, y)));
  if (data.uv1s)
    mesh.setUVs(
      data.uv1s.map(([x, y]) => new Vector2(x, y)),
      1
    );
  if (data.uv2s)
    mesh.setUVs(
      data.uv2s.map(([x, y]) => new Vector2(x, y)),
      2
    );
  if (data.colors) mesh.setColors(data.colors.map(([r, g, b, a]) => new Color(r, g, b, a)));
  if (data.tangents) mesh.setTangents(data.tangents.map(([x, y, z, w]) => new Vector4(x, y, z, w)));
  mesh.setIndices(data.indices);
  mesh.clearSubMesh();
  mesh.addSubMesh(0, data.indices.length, MeshTopology.Triangles);
  mesh.bounds.min.set(...data.bounds[0]);
  mesh.bounds.max.set(...data.bounds[1]);
  mesh.uploadData(true);
  if (data.treeVariationRoots || data.treeVariationData) {
    if (
      !data.treeVariationRoots ||
      !data.treeVariationData ||
      data.treeVariationRoots.length !== data.positions.length ||
      data.treeVariationData.length !== data.positions.length
    ) {
      throw new Error("Procedural tree variation attributes must cover every vertex");
    }
    const variationFloats = 8;
    const variationData = new Float32Array(data.positions.length * variationFloats);
    for (let vertex = 0; vertex < data.positions.length; vertex++) {
      const offset = vertex * variationFloats;
      variationData.set(data.treeVariationRoots[vertex], offset);
      variationData[offset + 3] = data.treeDissolvePaths?.[vertex][1] ?? 1;
      variationData.set(data.treeVariationData[vertex], offset + 4);
      variationData[offset + 7] = data.treeDissolvePaths?.[vertex][0] ?? 0;
    }
    const bindingIndex = mesh.vertexBufferBindings.length;
    mesh.setVertexBufferBinding(
      new Buffer(engine, BufferBindFlag.VertexBuffer, variationData, BufferUsage.Static),
      variationFloats * Float32Array.BYTES_PER_ELEMENT,
      bindingIndex
    );
    const extensibleMesh = mesh as unknown as ModelMeshVertexElementInternals;
    extensibleMesh._addVertexElement(
      new VertexElement("TREE_VARIATION_ROOT", 0, VertexElementFormat.Vector4, bindingIndex)
    );
    extensibleMesh._addVertexElement(
      new VertexElement("TREE_VARIATION_DATA", 16, VertexElementFormat.Vector4, bindingIndex)
    );
  }
  if (data.treeVariationCenters) {
    if (data.treeVariationCenters.length !== data.positions.length) {
      throw new Error("Procedural tree variation centerline attributes must cover every woody vertex");
    }
    const centerData = new Float32Array(data.positions.length * 3);
    data.treeVariationCenters.forEach((center, vertex) => centerData.set(center, vertex * 3));
    const bindingIndex = mesh.vertexBufferBindings.length;
    mesh.setVertexBufferBinding(
      new Buffer(engine, BufferBindFlag.VertexBuffer, centerData, BufferUsage.Static),
      3 * Float32Array.BYTES_PER_ELEMENT,
      bindingIndex
    );
    const extensibleMesh = mesh as unknown as ModelMeshVertexElementInternals;
    extensibleMesh._addVertexElement(
      new VertexElement("TREE_VARIATION_CENTER", 0, VertexElementFormat.Vector3, bindingIndex)
    );
  }
  if (data.leafShapePositions && data.leafShapeNormals) {
    const values = new Float32Array(data.positions.length * 6);
    data.leafShapePositions.forEach((point, index) => {
      values.set(point, index * 6);
      values.set(data.leafShapeNormals![index], index * 6 + 3);
    });
    const binding = mesh.vertexBufferBindings.length;
    mesh.setVertexBufferBinding(
      new Buffer(engine, BufferBindFlag.VertexBuffer, values, BufferUsage.Static),
      24,
      binding
    );
    const extensible = mesh as unknown as ModelMeshVertexElementInternals;
    extensible._addVertexElement(new VertexElement("LEAF_SHAPE_POSITION", 0, VertexElementFormat.Vector3, binding));
    extensible._addVertexElement(new VertexElement("LEAF_SHAPE_NORMAL", 12, VertexElementFormat.Vector3, binding));
  }
  return mesh;
}

function selectLodBranches(
  branches: readonly SaplingStem[],
  budget: readonly [trunks: number, branches: number, twigs: number]
): {
  readonly branches: readonly SaplingStem[];
  readonly counts: readonly [trunks: number, branches: number, twigs: number];
} {
  const trunks = branches.filter((branch) => branch.level === 0).slice(0, budget[0]);
  const selectedIds = new Set(trunks.map((branch) => branch.id));
  const primary = selectLodChildBranches(branches, 1, selectedIds, budget[1]);
  primary.forEach((branch) => selectedIds.add(branch.id));
  const twigs = selectLodChildBranches(branches, 2, selectedIds, budget[2]);
  return {
    branches: [...trunks, ...primary, ...twigs],
    counts: [trunks.length, primary.length, twigs.length]
  };
}

/**
 * Resolves botanical tips from the retained dependency graph instead of assuming every
 * deepest-level stem is terminal. A primary branch without a retained twig is still a
 * real foliage-bearing tip, which matters when an authored tree has fewer twigs than
 * primary limbs or when an LOD prunes only part of the last recursion level.
 */
function selectedTerminalStems(branches: readonly SaplingStem[]): readonly SaplingStem[] {
  const supportedStemIds = new Set(
    branches.flatMap((branch) => (branch.supportStemId === null ? [] : [branch.supportStemId]))
  );
  const nonTrunk = branches.filter((branch) => branch.level > 0 && !supportedStemIds.has(branch.id));
  if (nonTrunk.length > 0) return nonTrunk;
  return branches.filter((branch) => !supportedStemIds.has(branch.id));
}

/** Selects connected children first, then spends the remaining budget on crown coverage. */
function selectLodChildBranches(
  branches: readonly SaplingStem[],
  level: 1 | 2,
  parentIds: ReadonlySet<number>,
  budget: number
): SaplingStem[] {
  if (budget <= 0) return [];
  const branchById = new Map(branches.map((branch) => [branch.id, branch]));
  const resolvesToSelectedParent = (branch: SaplingStem): boolean => {
    let supportId = branch.supportStemId;
    const visited = new Set<number>();
    while (supportId !== null && !visited.has(supportId)) {
      if (parentIds.has(supportId)) return true;
      visited.add(supportId);
      const support = branchById.get(supportId);
      if (!support || support.level !== level) return false;
      supportId = support.supportStemId;
    }
    return false;
  };
  const candidates = branches.filter((branch) => branch.level === level && resolvesToSelectedParent(branch));
  if (candidates.length <= budget) return candidates;

  const sourceOrder = new Map(candidates.map((branch, index) => [branch.id, index]));
  const candidateCenter = meanBranchEndpoint(candidates);
  const candidatesByParent = new Map<number, SaplingStem[]>();
  for (const candidate of candidates) {
    if (candidate.supportStemId === null || !parentIds.has(candidate.supportStemId)) continue;
    const siblings = candidatesByParent.get(candidate.supportStemId) ?? [];
    siblings.push(candidate);
    candidatesByParent.set(candidate.supportStemId, siblings);
  }

  const selected: SaplingStem[] = [];
  const selectedIds = new Set<number>();
  if (budget >= candidatesByParent.size) {
    // Every visible parent keeps one connected child. Prefer the direction that actually
    // diverges from the parent; the mandatory t=1 continuation has near-zero divergence.
    for (const [parentId, siblings] of candidatesByParent) {
      const child = siblings.reduce((best, candidate) => {
        const bestSupport = branchById.get(best.supportStemId!);
        const candidateSupport = branchById.get(candidate.supportStemId!);
        if (!bestSupport || !candidateSupport) return best;
        const bestDivergence = branchDivergence(bestSupport, best);
        const candidateDivergence = branchDivergence(candidateSupport, candidate);
        return candidateDivergence > bestDivergence ? candidate : best;
      });
      selected.push(child);
      selectedIds.add(child.id);
    }
  }

  while (selected.length < budget) {
    let best: SaplingStem | undefined;
    let bestDistance = Number.NEGATIVE_INFINITY;
    for (const candidate of candidates) {
      if (selectedIds.has(candidate.id)) continue;
      const support = candidate.supportStemId;
      if (support === null || (!parentIds.has(support) && !selectedIds.has(support))) continue;
      const endpoint = candidate.points[candidate.points.length - 1];
      const coverageDistance =
        selected.length > 0
          ? Math.min(...selected.map((branch) => squaredDistance(endpoint, branch.points[branch.points.length - 1])))
          : squaredDistance(endpoint, candidateCenter);
      if (coverageDistance > bestDistance) {
        best = candidate;
        bestDistance = coverageDistance;
      }
    }
    if (!best) break;
    selected.push(best);
    selectedIds.add(best.id);
  }

  return selected.sort((left, right) => sourceOrder.get(left.id)! - sourceOrder.get(right.id)!);
}

function branchDivergence(support: SaplingStem, child: SaplingStem): number {
  const parentDirection = sampleTangent(support.points, child.attachmentProgress);
  const childDirection = sampleTangent(child.points, 0);
  return 1 - clamp(dot(parentDirection, childDirection), -1, 1);
}

function maximumBranchAttachmentError(branches: readonly SaplingStem[]): number {
  const selectedById = new Map(branches.map((branch) => [branch.id, branch]));
  return branches.reduce((maximum, branch) => {
    if (branch.supportStemId === null) return maximum;
    const support = selectedById.get(branch.supportStemId);
    if (!support) throw new Error(`Procedural tree retained stem ${branch.id} without support ${branch.supportStemId}`);
    const expectedRoot = samplePolyline(support.points, branch.attachmentProgress);
    return Math.max(maximum, Math.sqrt(squaredDistance(branch.points[0], expectedRoot)));
  }, 0);
}

function meanBranchEndpoint(branches: readonly SaplingStem[]): Point {
  const total = branches.reduce((sum, branch) => add(sum, branch.points[branch.points.length - 1]), [0, 0, 0] as Point);
  return scale(total, 1 / Math.max(branches.length, 1));
}

function isStemTip(progress: number): boolean {
  return progress >= 1 - 1e-6;
}

function allocateSaplingChildren(
  parents: readonly SaplingStem[],
  targetCount: number,
  level: 1 | 2,
  height: number,
  baseSize: number,
  parameters: SaplingTreeParameters,
  sameLevelChild = false
): number[] {
  const attachmentCurve =
    level === 1
      ? sameLevelChild
        ? (parameters.branchSameLevelAttachmentProgressCurve ?? parameters.branchAttachmentProgressCurve)
        : parameters.branchAttachmentProgressCurve
      : sameLevelChild
        ? (parameters.twigSameLevelAttachmentProgressCurve ?? parameters.twigAttachmentProgressCurve)
        : parameters.twigAttachmentProgressCurve;
  const attachmentStart = attachmentCurve ? clamp01(attachmentCurve[0] / 100) : baseSize;
  const attachmentEnd = level === 2 ? Math.max(attachmentStart, clamp01(parameters.twigAttachmentEndRatio)) : 1;
  const exposedFraction = Math.max(0, attachmentEnd - attachmentStart);
  const lengthPower = Math.max(
    0,
    sameLevelChild
      ? (parameters.sameLevelParentLengthWeightPower?.[level] ?? parameters.parentLengthWeightPower?.[level] ?? 1)
      : (parameters.parentLengthWeightPower?.[level] ?? 1)
  );
  const lengthFloor = clamp01(
    sameLevelChild
      ? (parameters.sameLevelParentLengthWeightFloor?.[level] ?? parameters.parentLengthWeightFloor?.[level] ?? 0.1)
      : (parameters.parentLengthWeightFloor?.[level] ?? 0.1)
  );
  const relativeTop = 0.5;
  const shape = saplingShapeRatio(
    level === 1 ? parameters.shape : parameters.shapeSecondary,
    relativeTop,
    parameters.customShape
  );
  let maximumLength = height;
  for (let index = 1; index <= level; index++) maximumLength *= parameters.length[index];
  // A parent contributes branching capacity in proportion to its usable arclength.
  // The explicit floor, exponent, and smooth parent-height response let species range
  // from crown coverage to concentration on dominant scaffold limbs without storing
  // parent-specific counts.
  let weights = parents.map((parent) => {
    const expectedLength = parent.length * parameters.length[level] * shape;
    const relativeLength = expectedLength / Math.max(maximumLength, height * 0.001);
    const capacity = lengthFloor + (1 - lengthFloor) * relativeLength;
    const capacityByHeightCurve =
      level === 1
        ? sameLevelChild
          ? (parameters.branchSameLevelParentCapacityByHeightCurve ?? parameters.branchParentCapacityByHeightCurve)
          : parameters.branchParentCapacityByHeightCurve
        : sameLevelChild
          ? (parameters.twigSameLevelParentCapacityByHeightCurve ?? parameters.twigParentCapacityByHeightCurve)
          : parameters.twigParentCapacityByHeightCurve;
    const parentRootHeightRatio = clamp01(parent.points[0][1] / Math.max(height, Number.EPSILON));
    const heightCapacity = capacityByHeightCurve
      ? Math.max(0, sampleParentCurve(capacityByHeightCurve, parentRootHeightRatio) / 100)
      : 1;
    return parameters.branches[level] * Math.pow(Math.max(0, capacity), lengthPower) * exposedFraction * heightCapacity;
  });
  const rootHeightDistributionCurve =
    level === 1
      ? sameLevelChild
        ? (parameters.branchSameLevelRootHeightDistributionCurve ?? parameters.branchRootHeightDistributionCurve)
        : parameters.branchRootHeightDistributionCurve
      : sameLevelChild
        ? (parameters.twigSameLevelRootHeightDistributionCurve ?? parameters.twigRootHeightDistributionCurve)
        : parameters.twigRootHeightDistributionCurve;
  const rootHeightDistributionBlend = clamp01(
    level === 1
      ? sameLevelChild
        ? (parameters.branchSameLevelRootHeightDistributionBlend ?? parameters.branchRootHeightDistributionBlend ?? 0)
        : (parameters.branchRootHeightDistributionBlend ?? 0)
      : sameLevelChild
        ? (parameters.twigSameLevelRootHeightDistributionBlend ?? parameters.twigRootHeightDistributionBlend ?? 0)
        : (parameters.twigRootHeightDistributionBlend ?? 0)
  );
  const allocation = new Array(parents.length).fill(0);
  let remaining = targetCount;
  const minimumPerParent = Math.max(0, Math.floor(parameters.minimumChildrenPerParent?.[level] ?? 1));
  const minimumTotal = minimumPerParent * parents.length;
  if (remaining >= minimumTotal) {
    allocation.fill(minimumPerParent);
    remaining -= minimumTotal;
  }
  if (weights.every((weight) => weight <= Number.EPSILON)) weights = parents.map(() => 1);
  const totalWeight = weights.reduce((sum, value) => sum + value, 0) || 1;
  const remainders: { index: number; value: number }[] = [];
  for (let index = 0; index < weights.length; index++) {
    const exact = (weights[index] / totalWeight) * remaining;
    const whole = Math.floor(exact);
    allocation[index] += whole;
    remainders.push({ index, value: exact - whole });
  }
  let assigned = allocation.reduce((sum, value) => sum + value, 0);
  remainders.sort((left, right) => right.value - left.value || left.index - right.index);
  for (let index = 0; assigned < targetCount; index++, assigned++) {
    allocation[remainders[index % remainders.length].index]++;
  }
  if (rootHeightDistributionCurve && rootHeightDistributionBlend > Number.EPSILON) {
    const heightAllocation = allocateSaplingChildrenByRootHeight(
      parents,
      targetCount,
      height,
      attachmentStart,
      attachmentEnd,
      weights,
      minimumPerParent,
      rootHeightDistributionCurve
    );
    return blendIntegerAllocations(allocation, heightAllocation, rootHeightDistributionBlend);
  }
  return allocation;
}

function blendIntegerAllocations(baseline: readonly number[], target: readonly number[], amount: number): number[] {
  const exact = baseline.map((value, index) => value * (1 - amount) + target[index] * amount);
  const result = exact.map(Math.floor);
  const targetTotal = baseline.reduce((sum, value) => sum + value, 0);
  const remainders = exact
    .map((value, index) => ({ index, value: value - result[index] }))
    .sort((left, right) => right.value - left.value || left.index - right.index);
  for (
    let assigned = result.reduce((sum, value) => sum + value, 0), index = 0;
    assigned < targetTotal;
    assigned++, index++
  ) {
    result[remainders[index].index]++;
  }
  return result;
}

/**
 * Assigns an authored whole-tree root-height distribution to parents whose exposed
 * centerlines can physically reach each requested height. Capacity remains the
 * deterministic tie-breaker; it must not send a low root target to a high parent and
 * rely on clamping, because that changes the requested distribution itself.
 */
function allocateSaplingChildrenByRootHeight(
  parents: readonly SaplingStem[],
  targetCount: number,
  height: number,
  attachmentStart: number,
  attachmentEnd: number,
  weights: readonly number[],
  minimumPerParent: number,
  rootHeightDistributionCurve: ProceduralTreeParentCurve
): number[] {
  const allocation = new Array(parents.length).fill(0);
  if (targetCount <= 0 || parents.length === 0) return allocation;
  const ranges = parents.map((parent) => polylineHeightRange(parent.points, attachmentStart, attachmentEnd));
  const desiredHeights = Array.from(
    { length: targetCount },
    (_, rank) =>
      (sampleParentCurve(rootHeightDistributionCurve, targetCount === 1 ? 0.5 : rank / (targetCount - 1)) / 100) *
      height
  );
  const unassignedRanks = new Set(desiredHeights.map((_, rank) => rank));
  const distanceToRange = (value: number, range: readonly [number, number]): number =>
    value < range[0] ? range[0] - value : value > range[1] ? value - range[1] : 0;
  const assign = (parentIndex: number, rank: number): void => {
    allocation[parentIndex]++;
    unassignedRanks.delete(rank);
  };

  if (minimumPerParent > 0 && targetCount >= minimumPerParent * parents.length) {
    const parentsByHeight = ranges
      .map((range, index) => ({ index, midpoint: (range[0] + range[1]) * 0.5 }))
      .sort((left, right) => left.midpoint - right.midpoint || left.index - right.index);
    for (let slot = 0; slot < minimumPerParent; slot++) {
      for (const parent of parentsByHeight) {
        const rank = [...unassignedRanks].reduce((best, candidate) => {
          const bestDistance = distanceToRange(desiredHeights[best], ranges[parent.index]);
          const candidateDistance = distanceToRange(desiredHeights[candidate], ranges[parent.index]);
          return candidateDistance < bestDistance || (candidateDistance === bestDistance && candidate < best)
            ? candidate
            : best;
        });
        assign(parent.index, rank);
      }
    }
  }

  for (const rank of [...unassignedRanks]) {
    let bestParent = 0;
    let bestDistance = Number.POSITIVE_INFINITY;
    let bestLoad = Number.POSITIVE_INFINITY;
    for (let parentIndex = 0; parentIndex < parents.length; parentIndex++) {
      const distance = distanceToRange(desiredHeights[rank], ranges[parentIndex]);
      const load = (allocation[parentIndex] + 1) / Math.max(weights[parentIndex], Number.EPSILON);
      if (
        distance < bestDistance - Number.EPSILON ||
        (Math.abs(distance - bestDistance) <= Number.EPSILON &&
          (load < bestLoad - Number.EPSILON ||
            (Math.abs(load - bestLoad) <= Number.EPSILON && parentIndex < bestParent)))
      ) {
        bestParent = parentIndex;
        bestDistance = distance;
        bestLoad = load;
      }
    }
    assign(bestParent, rank);
  }
  return allocation;
}

function polylineHeightRange(
  points: readonly Point[],
  progressStart: number,
  progressEnd: number
): readonly [minimum: number, maximum: number] {
  const start = clamp01(Math.min(progressStart, progressEnd));
  const end = clamp01(Math.max(progressStart, progressEnd));
  const cumulative = [0];
  for (let index = 1; index < points.length; index++) {
    cumulative.push(cumulative[index - 1] + length(subtract(points[index], points[index - 1])));
  }
  const total = cumulative[cumulative.length - 1];
  const heights = [samplePolyline(points, start)[1], samplePolyline(points, end)[1]];
  for (let index = 1; index + 1 < points.length; index++) {
    const progress = cumulative[index] / Math.max(total, Number.EPSILON);
    if (progress > start && progress < end) heights.push(points[index][1]);
  }
  return [Math.min(...heights), Math.max(...heights)];
}

function growSaplingPath(
  start: Point,
  initialDirection: Point,
  length: number,
  segmentCount: number,
  level: 0 | 1 | 2,
  azimuth: number,
  parameters: SaplingTreeParameters,
  random: () => number,
  lateNoiseRandom: () => number,
  authoredBendAxis?: Point,
  shapeVariationScale = 1,
  outwardAttraction = parameters.attractOut[level]
): readonly Point[] {
  const segments = Math.max(1, segmentCount);
  const spinePath = parameters.spinePathHarmonics[level];
  if (spinePath) {
    return growHarmonicSpinePath(start, initialDirection, length, segments, azimuth, spinePath);
  }
  const points: Point[] = [start];
  const segmentLength = length / segments;
  // SpeedTree/Sapling curve variation is a per-stem shape property. Sampling it
  // independently for every segment and alternating the sign makes the accumulated
  // bend cancel out, so authored branch-to-branch silhouette variation disappears.
  const resolvedShapeVariationScale = Math.max(0, shapeVariationScale);
  const stemCurveVariation = signedVariation(random, parameters.curveVariation[level]) * resolvedShapeVariationScale;
  const lateNoiseAmount =
    parameters.lateNoiseAmount[level] * (1 - clamp01(parameters.lateNoiseSmooth[level])) * resolvedShapeVariationScale;
  const lateNoiseTurbulence = Math.max(0, parameters.lateNoiseTurbulence[level]);
  // Late noise owns an independent coherent wave within the current generator stream.
  // Zero amount consumes no random values and therefore preserves legacy recipes exactly.
  const lateNoisePhaseA = lateNoiseAmount > Number.EPSILON ? lateNoiseRandom() * Math.PI * 2 : 0;
  const lateNoisePhaseB = lateNoiseAmount > Number.EPSILON ? lateNoiseRandom() * Math.PI * 2 : 0;
  const lateNoiseAxisRoll = lateNoiseAmount > Number.EPSILON ? lateNoiseRandom() * Math.PI * 2 : 0;
  let direction = normalize(initialDirection);
  for (let segment = 0; segment < segments; segment++) {
    const progress = segments === 1 ? 1 : segment / (segments - 1);
    let curveStep = parameters.curve[level] / segments;
    if (segment >= Math.round(segments * 0.5) && parameters.curveBack[level] !== 0) {
      curveStep += (2 * parameters.curveBack[level]) / segments;
    }
    const localSway =
      (signedVariation(random, parameters.curveVariation[level]) * progress * 0.12 * resolvedShapeVariationScale) /
      segments;
    const bendAxis = authoredBendAxis
      ? normalizeOr(reject(authoredBendAxis, direction), radialAround(direction, azimuth))
      : radialAround(direction, azimuth);
    const swayAxis = normalizeOr(cross(direction, bendAxis), radialAround(direction, azimuth + Math.PI * 0.5));
    direction = rotateAroundAxis(direction, bendAxis, degreesToRadians(curveStep + stemCurveVariation / segments));
    direction = rotateAroundAxis(direction, swayAxis, degreesToRadians(localSway));

    const declination = Math.acos(clamp(dot(direction, [0, 1, 0]), -1, 1));
    direction = normalize(add(direction, scale([0, 1, 0], (parameters.attractUp[level] * declination) / segments)));
    const previous = points[points.length - 1];
    const horizontal: Point = [previous[0], 0, previous[2]];
    if (outwardAttraction !== 0 && Math.hypot(horizontal[0], horizontal[2]) > 0.000001) {
      direction = normalize(add(direction, scale(normalize(horizontal), (outwardAttraction * progress) / segments)));
    }
    if (lateNoiseAmount > Number.EPSILON) {
      // SpeedTree late noise is evaluated after the authored spine shape. A coherent
      // band-limited angular wave changes direction without changing segment lengths;
      // turbulence controls repetitions and smooth attenuates the complete displacement.
      const lateProgress = (segment + 1) / segments;
      const ramp = clamp01(lateProgress * 4);
      const baseWeight = ramp * ramp * (3 - 2 * ramp);
      const cycles = 0.5 + lateNoiseTurbulence;
      const primaryPhase = Math.PI * 2 * cycles * lateProgress;
      const secondaryPhase = Math.PI * 2 * (cycles * 1.61803398875 + 0.5) * lateProgress;
      const primaryNoise =
        (Math.sin(primaryPhase + lateNoisePhaseA) + 0.35 * Math.sin(secondaryPhase + lateNoisePhaseB)) / 1.35;
      const secondaryNoise =
        (Math.cos(primaryPhase + lateNoisePhaseB) + 0.35 * Math.sin(secondaryPhase + lateNoisePhaseA)) / 1.35;
      const firstAxis = radialAround(direction, azimuth + lateNoiseAxisRoll);
      const secondAxis = normalizeOr(cross(direction, firstAxis), radialAround(direction, azimuth));
      const profileScale = parameters.lateNoiseProfile[level]
        ? sampleParentCurve(parameters.lateNoiseProfile[level]!, lateProgress) / 100
        : 1;
      const angularScale = degreesToRadians((lateNoiseAmount * baseWeight * profileScale) / segments);
      direction = rotateAroundAxis(direction, firstAxis, angularScale * primaryNoise);
      direction = rotateAroundAxis(direction, secondAxis, angularScale * secondaryNoise);
    }
    points.push(add(previous, scale(direction, segmentLength)));
  }
  return points;
}

function growHarmonicSpinePath(
  start: Point,
  initialDirection: Point,
  pathLength: number,
  segmentCount: number,
  azimuth: number,
  coefficientsPercentOfLength: readonly number[]
): readonly Point[] {
  const axisCoefficientCount = PROCEDURAL_TREE_SPINE_PATH_COEFFICIENTS_PER_AXIS;
  const firstCoefficients = coefficientsPercentOfLength.slice(0, axisCoefficientCount);
  const secondCoefficients = coefficientsPercentOfLength.slice(axisCoefficientCount);
  const tangent = normalize(initialDirection);
  const firstAxis = radialAround(tangent, azimuth);
  const secondAxis = normalizeOr(cross(tangent, firstAxis), radialAround(tangent, azimuth + Math.PI * 0.5));
  const segmentLength = pathLength / segmentCount;
  const points: Point[] = [start];
  let previousFirst = 0;
  let previousSecond = 0;
  for (let segment = 1; segment <= segmentCount; segment++) {
    const progress = segment / segmentCount;
    const nextFirst = (sampleSpinePathHarmonics(firstCoefficients, progress) / 100) * pathLength;
    const nextSecond = (sampleSpinePathHarmonics(secondCoefficients, progress) / 100) * pathLength;
    let deltaFirst = nextFirst - previousFirst;
    let deltaSecond = nextSecond - previousSecond;
    const lateralLength = Math.hypot(deltaFirst, deltaSecond);
    const maximumLateralLength = segmentLength * (1 - 1e-6);
    if (lateralLength > maximumLateralLength) {
      const scaleFactor = maximumLateralLength / lateralLength;
      deltaFirst *= scaleFactor;
      deltaSecond *= scaleFactor;
    }
    const axialLength = Math.sqrt(
      Math.max(0, segmentLength * segmentLength - deltaFirst * deltaFirst - deltaSecond * deltaSecond)
    );
    const previous = points[points.length - 1];
    points.push(
      add(previous, add(scale(tangent, axialLength), add(scale(firstAxis, deltaFirst), scale(secondAxis, deltaSecond))))
    );
    previousFirst += deltaFirst;
    previousSecond += deltaSecond;
  }
  return points;
}

function sampleSpinePathHarmonics(coefficients: readonly number[], progress: number): number {
  let value = coefficients[0] * progress;
  for (let harmonic = 1; harmonic <= PROCEDURAL_TREE_SPINE_PATH_HARMONICS; harmonic++) {
    const angle = Math.PI * 2 * harmonic * progress;
    const offset = 1 + (harmonic - 1) * 2;
    value += coefficients[offset] * Math.sin(angle);
    value += coefficients[offset + 1] * (Math.cos(angle) - 1);
  }
  return value;
}

function createSaplingRadii(
  pointCount: number,
  startRadius: number,
  endRadius: number,
  rootFlare: number
): readonly number[] {
  return Array.from({ length: pointCount }, (_, index) => {
    const progress = index / Math.max(pointCount - 1, 1);
    const radius = startRadius + (endRadius - startRadius) * progress;
    return index === 0 ? radius * rootFlare : radius;
  });
}

function saplingEndRadius(startRadius: number, taper: number, ratioPower: number, minimumRadius: number): number {
  const tapered = Math.max(minimumRadius, startRadius * Math.max(0, 1 - taper));
  return Math.max(minimumRadius, Math.pow(tapered, ratioPower));
}

/** Sapling's auto-taper projection across the active recursive levels. */
function findSaplingTaper(parameters: SaplingTreeParameters): SaplingVector {
  const scaledLengths = parameters.length.map((value, level) => {
    if (level === 0) return value;
    const shape = saplingShapeRatio(
      level === 1 ? parameters.shape : parameters.shapeSecondary,
      0,
      parameters.customShape
    );
    return value * shape;
  });
  const products = scaledLengths.map((_, level) => {
    let value = 1;
    for (let index = 0; index <= level; index++) value *= scaledLengths[index];
    return value;
  });
  return products.map((product, level) => {
    const remaining = products.slice(level, parameters.levels).reduce((sum, value) => sum + value, 0);
    return parameters.taper[level] * (remaining > 0 ? product / remaining : 1);
  }) as unknown as SaplingVector;
}

/** Crown-envelope functions used by Sapling and the Weber/Penn tree model. */
function saplingShapeRatio(shape: SaplingTreeParameters["shape"], ratio: number, custom: SaplingVector): number {
  const value = clamp01(ratio);
  switch (shape) {
    case 0:
      return 0.05 + 0.95 * value;
    case 1:
      return 0.2 + 0.8 * Math.sin(Math.PI * value);
    case 2:
      return 0.2 + 0.8 * Math.sin(0.5 * Math.PI * value);
    case 3:
      return 1;
    case 4:
      return 0.5 + 0.5 * value;
    case 5:
      return value <= 0.7 ? 0.05 + (0.95 * value) / 0.7 : 0.05 + (0.95 * (1 - value)) / 0.3;
    case 6:
      return 1 - 0.8 * value;
    case 7:
      return value <= 0.7 ? 0.5 + (0.5 * value) / 0.7 : 0.5 + (0.5 * (1 - value)) / 0.3;
    case 8: {
      const inverted = 1 - value;
      if (inverted === 1) return custom[3];
      if (inverted >= custom[2]) {
        const position = Math.pow((inverted - custom[2]) / Math.max(1 - custom[2], 0.001), 2);
        return position * (custom[3] - custom[1]) + custom[1];
      }
      const position = 1 - Math.pow(1 - inverted / Math.max(custom[2], 0.001), 2);
      return position * (custom[1] - custom[0]) + custom[0];
    }
  }
}

function radialAround(direction: Point, angle: number): Point {
  const tangent = normalize(direction);
  const reference: Point = Math.abs(tangent[1]) < 0.96 ? [0, 1, 0] : [1, 0, 0];
  const first = normalize(cross(tangent, reference));
  const second = normalize(cross(tangent, first));
  return normalize(add(scale(first, Math.cos(angle)), scale(second, Math.sin(angle))));
}

function rotateAroundAxis(value: Point, axis: Point, angle: number): Point {
  const unitAxis = normalize(axis);
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  return normalize(
    add(
      add(scale(value, cosine), scale(cross(unitAxis, value), sine)),
      scale(unitAxis, dot(unitAxis, value) * (1 - cosine))
    )
  );
}

function radicalInverse(value: number): number {
  let index = Math.max(1, Math.floor(value));
  let result = 0;
  let fraction = 0.5;
  while (index > 0) {
    result += (index % 2) * fraction;
    index = Math.floor(index / 2);
    fraction *= 0.5;
  }
  return result;
}

function signedVariation(random: () => number, amount: number): number {
  return (random() * 2 - 1) * amount;
}

function weightedMode(
  random: () => number,
  modes: readonly [number, number, number],
  weights: readonly [number, number, number]
): number {
  const total = weights[0] + weights[1] + weights[2];
  let sample = random() * total;
  for (let index = 0; index < modes.length; index++) {
    sample -= weights[index];
    if (sample <= 0) return modes[index];
  }
  return modes[modes.length - 1];
}

function degreesToRadians(value: number): number {
  return (value * Math.PI) / 180;
}

/**
 * Distributes level-one roots over the portion of the trunk above the requested clear height.
 * The first child is exactly on the clear-height plane and the final child remains at the stem tip.
 */
function primaryBranchAttachmentProgress(
  parentPoints: readonly Point[],
  childIndex: number,
  childCount: number,
  clearHeight: number
): number {
  const clearProgress = progressAtVerticalHeight(parentPoints, clearHeight);
  if (childCount <= 1) return clearProgress;
  return clearProgress + (1 - clearProgress) * (childIndex / (childCount - 1));
}

/** Finds the first interpolated point where a growing trunk crosses a world-space height. */
function progressAtVerticalHeight(points: readonly Point[], targetHeight: number): number {
  if (points.length <= 1 || targetHeight <= points[0][1]) return 0;
  for (let index = 1; index < points.length; index++) {
    const previousHeight = points[index - 1][1];
    const currentHeight = points[index][1];
    if (currentHeight < targetHeight) continue;
    const heightDelta = currentHeight - previousHeight;
    const segmentProgress =
      Math.abs(heightDelta) > Number.EPSILON ? clamp((targetHeight - previousHeight) / heightDelta) : 0;
    return (index - 1 + segmentProgress) / (points.length - 1);
  }
  return 1;
}

/** Finds the legal parent-axis position whose world-space height best matches a crown stratum. */
function polylineProgressAtHeight(
  points: readonly Point[],
  targetHeight: number,
  minimumProgress: number,
  maximumProgress: number
): number {
  if (points.length <= 1) return clamp(minimumProgress, 0, 1);
  const segmentCount = points.length - 1;
  const lowerProgress = clamp(Math.min(minimumProgress, maximumProgress), 0, 1);
  const upperProgress = clamp(Math.max(minimumProgress, maximumProgress), 0, 1);
  let bestProgress = lowerProgress;
  let bestError = Math.abs(samplePolyline(points, lowerProgress)[1] - targetHeight);
  for (let segment = 0; segment < segmentCount; segment++) {
    const segmentStartProgress = segment / segmentCount;
    const segmentEndProgress = (segment + 1) / segmentCount;
    const clippedStartProgress = Math.max(lowerProgress, segmentStartProgress);
    const clippedEndProgress = Math.min(upperProgress, segmentEndProgress);
    if (clippedStartProgress > clippedEndProgress) continue;
    const startHeight = points[segment][1];
    const endHeight = points[segment + 1][1];
    const heightDelta = endHeight - startHeight;
    const projectedWeight = Math.abs(heightDelta) > Number.EPSILON ? (targetHeight - startHeight) / heightDelta : 0;
    const clippedWeight = clamp(
      projectedWeight,
      (clippedStartProgress - segmentStartProgress) * segmentCount,
      (clippedEndProgress - segmentStartProgress) * segmentCount
    );
    const progress = segmentStartProgress + clippedWeight / segmentCount;
    const error = Math.abs(startHeight + heightDelta * clippedWeight - targetHeight);
    if (error < bestError) {
      bestProgress = progress;
      bestError = error;
    }
  }
  return bestProgress;
}

function resolveFirstPrimaryBranchHeightRatio(branches: readonly SaplingStem[], treeHeight: number): number {
  const primaryBranchRootHeights = branches.filter((branch) => branch.level === 1).map((branch) => branch.points[0][1]);
  if (primaryBranchRootHeights.length === 0) {
    // A stem without primary branches has an uninterrupted clear trunk over its full height.
    return 1;
  }
  return clamp01(Math.min(...primaryBranchRootHeights) / Math.max(treeHeight, Number.EPSILON));
}

function samplePolyline(points: readonly Point[], progress: number): Point {
  const position = clamp01(progress) * (points.length - 1);
  const lower = Math.floor(position);
  const upper = Math.min(points.length - 1, lower + 1);
  const weight = position - lower;
  return add(scale(points[lower], 1 - weight), scale(points[upper], weight));
}

function terminalPolylineSegmentStart(points: readonly Point[]): number {
  return points.length <= 1 ? 0 : (points.length - 2) / (points.length - 1);
}

function sampleScalar(values: readonly number[], progress: number): number {
  const position = clamp01(progress) * (values.length - 1);
  const lower = Math.floor(position);
  const upper = Math.min(values.length - 1, lower + 1);
  const weight = position - lower;
  return values[lower] * (1 - weight) + values[upper] * weight;
}

function sampleTangent(points: readonly Point[], progress: number): Point {
  const interval = 1 / Math.max(points.length - 1, 1);
  return normalize(
    subtract(samplePolyline(points, progress + interval * 0.5), samplePolyline(points, progress - interval * 0.5))
  );
}

function emptyBounds(): { minimum: [number, number, number]; maximum: [number, number, number] } {
  return {
    minimum: [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY],
    maximum: [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY]
  };
}

function include(bounds: { minimum: number[]; maximum: number[] }, point: Point): void {
  for (let axis = 0; axis < 3; axis++) {
    bounds.minimum[axis] = Math.min(bounds.minimum[axis], point[axis]);
    bounds.maximum[axis] = Math.max(bounds.maximum[axis], point[axis]);
  }
}

function toIndexArray(indices: readonly number[]): Uint16Array {
  if (indices.some((index) => index > 65535)) throw new Error("Procedural tree mesh exceeds Uint16 index capacity");
  return new Uint16Array(indices);
}

function add(left: Point, right: Point): Point {
  return [left[0] + right[0], left[1] + right[1], left[2] + right[2]];
}

function subtract(left: Point, right: Point): Point {
  return [left[0] - right[0], left[1] - right[1], left[2] - right[2]];
}

function meanPoint(points: readonly Point[]): Point {
  if (points.length === 0) return [0, 0, 0];
  return scale(
    points.reduce((sum, point) => add(sum, point), [0, 0, 0] as Point),
    1 / points.length
  );
}

function scale(value: Point, scalar: number): Point {
  return [value[0] * scalar, value[1] * scalar, value[2] * scalar];
}

function cross(left: Point, right: Point): Point {
  return [
    left[1] * right[2] - left[2] * right[1],
    left[2] * right[0] - left[0] * right[2],
    left[0] * right[1] - left[1] * right[0]
  ];
}

function length(value: Point): number {
  return Math.hypot(...value);
}

function polylineLength(points: readonly Point[]): number {
  let result = 0;
  for (let index = 0; index < points.length - 1; index++) {
    result += Math.sqrt(squaredDistance(points[index], points[index + 1]));
  }
  return result;
}

/** Returns arc distance using the same uniform control-index parameterization as samplePolyline. */
function polylineDistanceAtProgress(points: readonly Point[], progress: number): number {
  if (points.length <= 1) return 0;
  const position = clamp01(progress) * (points.length - 1);
  const segment = Math.min(points.length - 2, Math.floor(position));
  let distance = 0;
  for (let index = 0; index < segment; index++) {
    distance += Math.sqrt(squaredDistance(points[index], points[index + 1]));
  }
  return distance + Math.sqrt(squaredDistance(points[segment], points[segment + 1])) * (position - segment);
}

/**
 * SpeedTree-style pruning envelope. The whole centerline is shortened about its
 * attachment point, preserving its authored curvature and every downstream
 * attachment ratio instead of flattening only the vertices above the ceiling.
 */
function prunePathToMaximumHeight(points: readonly Point[], root: Point, maximumHeight: number): readonly Point[] {
  const pathMaximum = Math.max(...points.map((point) => point[1]));
  if (!Number.isFinite(maximumHeight) || pathMaximum <= maximumHeight) return points;
  const verticalExtent = pathMaximum - root[1];
  if (verticalExtent <= Number.EPSILON) return points;
  const scaleFactor = clamp01((maximumHeight - root[1]) / verticalExtent);
  return points.map((point) => add(root, scale(subtract(point, root), scaleFactor)));
}

function normalize(value: Point): Point {
  const length = Math.hypot(...value);
  return length > 0.000001 ? scale(value, 1 / length) : [0, 1, 0];
}

function normalizeOr(value: Point, fallback: Point): Point {
  const length = Math.hypot(...value);
  return length > 0.000001 ? scale(value, 1 / length) : normalize(fallback);
}

function reject(value: Point, axis: Point): Point {
  const unitAxis = normalize(axis);
  return subtract(value, scale(unitAxis, dot(value, unitAxis)));
}

function squaredDistance(left: Point, right: Point): number {
  const delta = subtract(left, right);
  return delta[0] * delta[0] + delta[1] * delta[1] + delta[2] * delta[2];
}

function dot(left: Point, right: Point): number {
  return left[0] * right[0] + left[1] * right[1] + left[2] * right[2];
}

function clamp01(value: number): number {
  return clamp(value);
}

function clamp(value: number, minimum = 0, maximum = 1): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function hashString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index++) hash = Math.imul(hash ^ value.charCodeAt(index), 16777619);
  return hash >>> 0;
}

function resolveGeneratorSeed(
  explicit: number | undefined,
  geometrySeed: number,
  baseSeed: number,
  role: string
): number {
  return explicit === undefined
    ? (geometrySeed ^ baseSeed ^ hashString(`procedural-tree-generator:${role}`)) >>> 0
    : explicit >>> 0;
}

function createRandom(seed: number): () => number {
  let state = seed || 1;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}
