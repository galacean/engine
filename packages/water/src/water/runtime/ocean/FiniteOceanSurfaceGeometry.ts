import { WorldLayer } from "@galacean/engine-project/rendering/WorldLayer";
import { registerWaterMeshContentRestorer } from "../resources/WaterMeshContentRestorer";
/** Finite Ocean authority rendered through one camera-relative near grid and one graded far-field ring mesh. */
import {
  Buffer,
  type Engine,
  type Entity,
  type Layer,
  type Material,
  MeshRenderer,
  ModelMesh,
  VertexAttribute
} from "@galacean/engine-core";
import { BoundingBox, Vector2, Vector3 } from "@galacean/engine-math";
import { OCEAN_LOOK, OCEAN_RENDER_BUDGET } from "../../authoring/ocean/presets/OceanLook";
import type { OceanNearshoreDescriptorV1 } from "../../authoring/ocean/OceanNearshoreDescriptor";
import { OceanNearshoreOutsidePolicy } from "../../authoring/ocean/OceanNearshoreTypes";
import type { OceanNearshoreStaticAtlas } from "../../compiler/ocean/OceanNearshoreCompiledTypes";
import type { WaterCameraVisibilityProvider, WaterTerrainOcclusionProvider } from "../body/WaterBackendRegistry";
import { applyWaterSurfaceRendererContract } from "../surface/WaterSurfaceRendererContract";

export const FINITE_OCEAN_SURFACE_LAYER = WorldLayer.Water;

export type FiniteOceanPresentationPath = "detailed" | "far-only";
type OceanGeometryRegion = "near" | "far" | "far-only-fill";

interface ModelMeshOwnedBuffers {
  readonly vertexBufferBindings?: ReadonlyArray<{ readonly buffer: Buffer }>;
  readonly _primitive?: { readonly indexBufferBinding?: { readonly buffer: Buffer } };
}

interface OceanGeometryChunk {
  readonly region: OceanGeometryRegion;
  readonly entity: Entity;
  readonly renderer: MeshRenderer;
  readonly mesh: ModelMesh;
  readonly ownedBuffers: readonly Buffer[];
  readonly terrainOcclusionKey: string;
  readonly localMinX: number;
  readonly localMaxX: number;
  readonly localMinZ: number;
  readonly localMaxZ: number;
  readonly wetWorldBounds: BoundingBox;
  hasWetArea: boolean;
  terrainOccluded: boolean;
  readonly vertexCount: number;
  readonly triangleCount: number;
  readonly vertexBufferBytes: number;
  readonly indexBufferBytes: number;
}

export interface FiniteOceanSurfaceGeometryMetrics {
  /** The authoritative Nearshore field remains finite even though presentation reaches the view horizon. */
  readonly finite: true;
  readonly cameraRelative: true;
  readonly nearFieldWindowSizeMetres: number;
  readonly nearFieldCellSizeMetres: number;
  readonly nearFieldSnapSizeMetres: number;
  readonly nearFieldMinimumGuaranteedRadiusMetres: number;
  readonly nearFieldCellCount: number;
  readonly nearFieldDrawCount: number;
  readonly nearFieldVertexCount: number;
  readonly nearFieldTriangleCount: number;
  readonly farFieldRingCount: number;
  readonly farFieldSegmentsPerEdge: number;
  readonly farFieldInnerHalfExtentMetres: number;
  readonly farFieldActualDepthOuterHalfExtentMetres: number;
  readonly farFieldProjectionMarkerHalfExtentMetres: number;
  readonly farFieldProjectionMinimumDistanceMetres: number;
  readonly farFieldProjectionMaximumDistanceMetres: number;
  readonly farFieldProjectionMaximumErrorPixels: number;
  readonly farFieldQuadCount: number;
  readonly farFieldDrawCount: 1;
  readonly farFieldVertexCount: number;
  readonly farFieldTriangleCount: number;
  readonly farOnlyFillDrawCount: 1;
  readonly farOnlyFillVertexCount: number;
  readonly farOnlyFillTriangleCount: number;
  readonly detailedPathDrawCount: number;
  readonly detailedPathVertexCount: number;
  readonly detailedPathTriangleCount: number;
  readonly farOnlyPathDrawCount: number;
  readonly farOnlyPathVertexCount: number;
  readonly farOnlyPathTriangleCount: number;
  readonly residentMeshCount: number;
  readonly residentVertexCount: number;
  readonly residentTriangleCount: number;
  readonly meshCreateCount: number;
  readonly meshUploadCount: number;
  readonly perFrameMeshUpload: false;
  readonly vertexBufferBytes: number;
  readonly indexBufferBytes: number;
  readonly authorityWorldMinimumX: number;
  readonly authorityWorldMinimumZ: number;
  readonly authorityWorldMaximumX: number;
  readonly authorityWorldMaximumZ: number;
  readonly minimumCellSize: number;
  readonly maximumActualCellSize: number;
}

export interface FiniteOceanSurfaceGeometryConfig {
  readonly nearshore: Readonly<OceanNearshoreDescriptorV1>;
  /** Optional compiled RGBA8 nearshore atlas for O(1) dry-quadrant & tight wet-bounds culling. */
  readonly nearshoreAtlas?: Readonly<OceanNearshoreStaticAtlas>;
  /** Optional river/lake connection world bounds [minX, minZ, maxX, maxZ] kept conservatively wet. */
  readonly connectionCoverageBounds?: ReadonlyArray<readonly [number, number, number, number]>;
  readonly surfaceCenterXZ: readonly [number, number];
  readonly size: number;
  readonly waterLevel: number;
  readonly maximumDisplacement: Readonly<{ readonly x: number; readonly y: number; readonly z: number }>;
  readonly initialCameraPositionXZ: Readonly<{ readonly x: number; readonly z: number }>;
  readonly initialPresentationPath: FiniteOceanPresentationPath;
  readonly layer?: Layer;
}

export interface FiniteOceanSurfaceMaterials {
  readonly near: Material;
  readonly far: Material;
}

export interface FiniteOceanSurfaceEnvelope {
  readonly worldMinimumX: number;
  readonly worldMinimumZ: number;
  readonly worldMaximumX: number;
  readonly worldMaximumZ: number;
  readonly size: number;
}

export interface FiniteOceanSurfaceBounds {
  readonly minimum: readonly [number, number, number];
  readonly maximum: readonly [number, number, number];
}

export interface FiniteOceanNearFieldRingSpec {
  readonly outerHalfExtentMetres: number;
  readonly cellSizeMetres: number;
}

export interface FiniteOceanNearFieldLayout {
  readonly windowSizeMetres: number;
  readonly halfExtentMetres: number;
  readonly cellSizeMetres: number;
  readonly outerCellSizeMetres: number;
  readonly snapSizeMetres: number;
  readonly minimumGuaranteedRadiusMetres: number;
  readonly rings: readonly FiniteOceanNearFieldRingSpec[];
  readonly meshAxisCount: number;
  readonly segmentsPerAxis: number;
  readonly segmentsPerMeshAxis: number;
  readonly cellCount: number;
  readonly drawCount: number;
  readonly vertexCount: number;
  readonly triangleCount: number;
}

export interface GradedOceanFarFieldLayout {
  readonly halfExtentsMetres: readonly number[];
  readonly ringCount: number;
  readonly segmentsPerEdge: number;
  readonly verticesPerLoop: number;
  readonly innerHalfExtentMetres: number;
  readonly actualDepthOuterHalfExtentMetres: number;
  readonly projectionMarkerHalfExtentMetres: number;
  readonly projectionMinimumDistanceMetres: number;
  readonly projectionMaximumDistanceMetres: number;
  readonly projectionMaximumErrorPixels: number;
  readonly maximumActualCellSizeMetres: number;
  readonly drawCount: 1;
  readonly quadCount: number;
  readonly vertexCount: number;
  readonly triangleCount: number;
}

export interface GradedOceanFarFieldTopology {
  readonly positions: Vector3[];
  /** UV.x is one only on the projected outer marker loop. */
  readonly projectionMarkers: Vector2[];
  readonly indices: Uint16Array;
}

export interface OceanFarOnlyFillTopology {
  readonly positions: Vector3[];
  /** Every marker remains zero so the far shader keeps this fill in world space. */
  readonly projectionMarkers: Vector2[];
  readonly indices: Uint16Array;
}

/** Expands the finite authority envelope by the detailed shader's proven displacement envelope. */
export function resolveFiniteOceanSurfaceBounds(
  envelope: Readonly<FiniteOceanSurfaceEnvelope>,
  waterLevel: number,
  maximumDisplacement: Readonly<{ readonly x: number; readonly y: number; readonly z: number }>
): Readonly<FiniteOceanSurfaceBounds> {
  const values = [waterLevel, maximumDisplacement.x, maximumDisplacement.y, maximumDisplacement.z];
  if (
    values.some((value) => !Number.isFinite(value)) ||
    Object.values(maximumDisplacement).some((value) => value < 0)
  ) {
    throw new RangeError("Finite Ocean displacement bounds must be finite and non-negative.");
  }
  return Object.freeze({
    minimum: Object.freeze([
      envelope.worldMinimumX - maximumDisplacement.x,
      waterLevel - maximumDisplacement.y,
      envelope.worldMinimumZ - maximumDisplacement.z
    ] as const),
    maximum: Object.freeze([
      envelope.worldMaximumX + maximumDisplacement.x,
      waterLevel + maximumDisplacement.y,
      envelope.worldMaximumZ + maximumDisplacement.z
    ] as const)
  });
}

function nearshoreWorldBounds(descriptor: Readonly<OceanNearshoreDescriptorV1>): FiniteOceanSurfaceEnvelope {
  const { grid } = descriptor;
  const worldMinimumX = grid.originXZ[0] - grid.cellSizeXZ[0] * 0.5;
  const worldMinimumZ = grid.originXZ[1] - grid.cellSizeXZ[1] * 0.5;
  return Object.freeze({
    worldMinimumX,
    worldMinimumZ,
    worldMaximumX: worldMinimumX + grid.cellSizeXZ[0] * grid.width,
    worldMaximumZ: worldMinimumZ + grid.cellSizeXZ[1] * grid.height,
    size: Math.max(grid.cellSizeXZ[0] * grid.width, grid.cellSizeXZ[1] * grid.height)
  });
}

/** Resolves the authoritative source envelope; presentation geometry is camera-relative and unbounded. */
export function resolveFiniteOceanSurfaceEnvelope(
  config: Readonly<Pick<FiniteOceanSurfaceGeometryConfig, "nearshore" | "surfaceCenterXZ" | "size">>
): Readonly<FiniteOceanSurfaceEnvelope> {
  const [centerX, centerZ] = config.surfaceCenterXZ;
  if (!Number.isFinite(centerX) || !Number.isFinite(centerZ)) {
    throw new RangeError("Finite Ocean presentation center must be finite.");
  }
  if (!Number.isFinite(config.size) || config.size <= 0) {
    throw new RangeError("Finite Ocean presentation size must be finite and positive.");
  }
  const halfSize = config.size * 0.5;
  const envelope = Object.freeze({
    worldMinimumX: centerX - halfSize,
    worldMinimumZ: centerZ - halfSize,
    worldMaximumX: centerX + halfSize,
    worldMaximumZ: centerZ + halfSize,
    size: config.size
  });
  const authority = nearshoreWorldBounds(config.nearshore);
  const tolerance = 0.0001;
  if (
    authority.worldMinimumX < envelope.worldMinimumX - tolerance ||
    authority.worldMinimumZ < envelope.worldMinimumZ - tolerance ||
    authority.worldMaximumX > envelope.worldMaximumX + tolerance ||
    authority.worldMaximumZ > envelope.worldMaximumZ + tolerance
  ) {
    throw new RangeError("Finite Ocean presentation envelope must contain the complete nearshore authority grid.");
  }
  return envelope;
}

/** Undefined inside the atlas; otherwise resolves all crossed edge policies fail-closed. */
export function resolveFiniteOceanOutsideWetness(
  descriptor: Readonly<OceanNearshoreDescriptorV1>,
  worldX: number,
  worldZ: number
): boolean | undefined {
  const { grid, outsidePolicy } = descriptor;
  const minimumX = grid.originXZ[0] - grid.cellSizeXZ[0] * 0.5;
  const minimumZ = grid.originXZ[1] - grid.cellSizeXZ[1] * 0.5;
  const maximumX = minimumX + grid.cellSizeXZ[0] * grid.width;
  const maximumZ = minimumZ + grid.cellSizeXZ[1] * grid.height;
  let outside = false;
  if (worldX < minimumX) {
    if (outsidePolicy.negativeX !== OceanNearshoreOutsidePolicy.DeepOcean) return false;
    outside = true;
  }
  if (worldX > maximumX) {
    if (outsidePolicy.positiveX !== OceanNearshoreOutsidePolicy.DeepOcean) return false;
    outside = true;
  }
  if (worldZ < minimumZ) {
    if (outsidePolicy.negativeZ !== OceanNearshoreOutsidePolicy.DeepOcean) return false;
    outside = true;
  }
  if (worldZ > maximumZ) {
    if (outsidePolicy.positiveZ !== OceanNearshoreOutsidePolicy.DeepOcean) return false;
    outside = true;
  }
  return outside ? true : undefined;
}

/** Fixed detailed layout proof used by runtime metrics and budget tests. */
export function resolveFiniteOceanNearFieldLayout(): Readonly<FiniteOceanNearFieldLayout> {
  const budget = OCEAN_RENDER_BUDGET;
  const windowSizeMetres = budget.nearFieldWindowSizeMetres;
  const cellSizeMetres = budget.nearFieldCellSizeMetres;
  const snapSizeMetres = budget.nearFieldSnapSizeMetres;
  const meshAxisCount = budget.nearFieldMeshAxisCount;
  const rings: readonly FiniteOceanNearFieldRingSpec[] = budget.nearFieldConcentricRings;
  const values = [windowSizeMetres, cellSizeMetres, snapSizeMetres, meshAxisCount];
  if (values.some((value) => !Number.isFinite(value) || value <= 0)) {
    throw new RangeError("Finite Ocean near-field layout values must be finite and positive.");
  }
  const halfExtentMetres = windowSizeMetres * 0.5;
  if (meshAxisCount !== 2 || rings.length === 0) {
    throw new RangeError("Finite Ocean concentric near-field layout requires 2x2 symmetric quadrants and >=1 ring.");
  }
  const segmentsPerAxis = windowSizeMetres / cellSizeMetres;
  const segmentsPerMeshAxis = segmentsPerAxis / meshAxisCount;
  const windowSnapCount = windowSizeMetres / snapSizeMetres;
  if (
    !Number.isInteger(meshAxisCount) ||
    !Number.isInteger(segmentsPerAxis) ||
    !Number.isInteger(segmentsPerMeshAxis) ||
    !Number.isInteger(windowSnapCount) ||
    windowSnapCount % 2 !== 0 ||
    !Number.isInteger(snapSizeMetres / cellSizeMetres)
  ) {
    throw new RangeError("Finite Ocean near-field window, Mesh, Cell, and Snap sizes must divide exactly.");
  }
  let previousExtent = 0;
  let previousCell: number = cellSizeMetres;
  let cellsPerQuadrant = 0;
  let verticesPerMesh = 0;
  let trianglesPerMesh = 0;
  for (let ringIndex = 0; ringIndex < rings.length; ringIndex++) {
    const ring = rings[ringIndex]!;
    if (
      !Number.isFinite(ring.outerHalfExtentMetres) ||
      !Number.isFinite(ring.cellSizeMetres) ||
      ring.outerHalfExtentMetres <= previousExtent ||
      ring.cellSizeMetres <= 0 ||
      !Number.isInteger(ring.outerHalfExtentMetres / ring.cellSizeMetres) ||
      !Number.isInteger(previousExtent / ring.cellSizeMetres)
    ) {
      throw new RangeError("Finite Ocean concentric near-field rings must increase strictly and divide evenly.");
    }
    if (ringIndex === 0) {
      if (ring.cellSizeMetres !== cellSizeMetres) {
        throw new RangeError("Finite Ocean inner concentric ring must match nearFieldCellSizeMetres.");
      }
    } else if (ring.cellSizeMetres !== previousCell * 2) {
      throw new RangeError("Finite Ocean concentric near-field ring transitions must step by exact 2:1 cell ratios.");
    }
    const outerCells = ring.outerHalfExtentMetres / ring.cellSizeMetres;
    const innerCells = previousExtent / ring.cellSizeMetres;
    const ringQuads = outerCells * outerCells - innerCells * innerCells;
    cellsPerQuadrant += ringQuads;
    if (ringIndex === 0) {
      verticesPerMesh += (outerCells + 1) * (outerCells + 1);
      trianglesPerMesh += ringQuads * 2;
    } else {
      // Shared coarse vertices along the inner ring boundary are already emitted by the previous ring.
      verticesPerMesh += (outerCells + 1) * (outerCells + 1) - (innerCells + 1) * (innerCells + 1);
      // Each 2:1 stitch cell along the two inner seams replaces 2 triangles with 3 (+1 per seam cell).
      trianglesPerMesh += ringQuads * 2 + innerCells * 2;
    }
    previousExtent = ring.outerHalfExtentMetres;
    previousCell = ring.cellSizeMetres;
  }
  if (previousExtent !== halfExtentMetres) {
    throw new RangeError("Finite Ocean concentric near-field rings must reach exact halfExtentMetres.");
  }
  const meshCount = meshAxisCount * meshAxisCount;
  if (verticesPerMesh > 65_535) {
    throw new RangeError("Finite Ocean near-field quadrants must remain compatible with Uint16 indices.");
  }
  const minimumGuaranteedRadiusMetres = halfExtentMetres - snapSizeMetres * 0.5;
  if (minimumGuaranteedRadiusMetres <= OCEAN_LOOK.wave.fadeEndMetres) {
    throw new RangeError("Finite Ocean near field must cover the complete macro-wave fade distance.");
  }
  if (
    !Number.isFinite(budget.farFieldClosureTransitionStartMetres) ||
    !Number.isFinite(budget.farFieldClosureTransitionEndMetres) ||
    budget.farFieldClosureTransitionStartMetres < 0 ||
    budget.farFieldClosureTransitionEndMetres <= budget.farFieldClosureTransitionStartMetres ||
    budget.farFieldClosureTransitionEndMetres > minimumGuaranteedRadiusMetres ||
    budget.farFieldClosureTransitionEndMetres < OCEAN_LOOK.wave.fadeEndMetres
  ) {
    throw new RangeError(
      "Finite Ocean far-field closure must complete after waves fade and before every near-field edge."
    );
  }
  return Object.freeze({
    windowSizeMetres,
    halfExtentMetres,
    cellSizeMetres,
    outerCellSizeMetres: previousCell,
    snapSizeMetres,
    minimumGuaranteedRadiusMetres,
    rings,
    meshAxisCount,
    segmentsPerAxis,
    segmentsPerMeshAxis,
    cellCount: meshCount * cellsPerQuadrant,
    drawCount: meshCount,
    vertexCount: meshCount * verticesPerMesh,
    triangleCount: meshCount * trianglesPerMesh
  });
}

/** Resolves the immutable square rings whose cells grow with distance from the camera. */
export function resolveGradedOceanFarFieldLayout(): Readonly<GradedOceanFarFieldLayout> {
  const budget = OCEAN_RENDER_BUDGET;
  const halfExtentsMetres = [...budget.farFieldRingHalfExtentsMetres];
  const segmentsPerEdge = budget.farFieldRingSegmentsPerEdge;
  if (
    halfExtentsMetres.length < 3 ||
    halfExtentsMetres.some((value) => !Number.isFinite(value) || value <= 0) ||
    !Number.isInteger(segmentsPerEdge) ||
    segmentsPerEdge <= 0
  ) {
    throw new RangeError("Ocean graded far-field dimensions must be finite and positive.");
  }
  for (let index = 1; index < halfExtentsMetres.length; index++) {
    if (halfExtentsMetres[index]! <= halfExtentsMetres[index - 1]!) {
      throw new RangeError("Ocean graded far-field half extents must increase strictly.");
    }
  }
  const near = resolveFiniteOceanNearFieldLayout();
  const innerHalfExtentMetres = halfExtentsMetres[0]!;
  const projectionMarkerHalfExtentMetres = halfExtentsMetres[halfExtentsMetres.length - 1]!;
  const actualDepthOuterHalfExtentMetres = halfExtentsMetres[halfExtentsMetres.length - 2]!;
  const innerSegmentLength = (innerHalfExtentMetres * 2) / segmentsPerEdge;
  if (
    innerHalfExtentMetres !== near.halfExtentMetres ||
    !Number.isInteger(innerSegmentLength / near.outerCellSizeMetres) ||
    budget.farFieldClosureTransitionEndMetres > near.minimumGuaranteedRadiusMetres ||
    projectionMarkerHalfExtentMetres !== budget.farFieldMinimumProjectionDistanceMetres ||
    actualDepthOuterHalfExtentMetres >= projectionMarkerHalfExtentMetres
  ) {
    throw new RangeError("Ocean graded far field must align to the flat detailed edge and projection budget.");
  }
  const ringCount = halfExtentsMetres.length - 1;
  const verticesPerLoop = segmentsPerEdge * 4;
  const quadCount = ringCount * verticesPerLoop;
  const vertexCount = halfExtentsMetres.length * verticesPerLoop;
  const triangleCount = quadCount * 2;
  if (
    vertexCount > budget.farFieldMaximumResidentVertexCount ||
    triangleCount > budget.farFieldMaximumResidentTriangleCount ||
    vertexCount > 65_535
  ) {
    throw new RangeError("Ocean graded far-field topology exceeds its immutable mobile budget.");
  }
  return Object.freeze({
    halfExtentsMetres: Object.freeze(halfExtentsMetres),
    ringCount,
    segmentsPerEdge,
    verticesPerLoop,
    innerHalfExtentMetres,
    actualDepthOuterHalfExtentMetres,
    projectionMarkerHalfExtentMetres,
    projectionMinimumDistanceMetres: budget.farFieldMinimumProjectionDistanceMetres,
    projectionMaximumDistanceMetres: budget.farFieldMaximumProjectionDistanceMetres,
    projectionMaximumErrorPixels: budget.farFieldMaximumProjectionErrorPixels,
    maximumActualCellSizeMetres: (actualDepthOuterHalfExtentMetres * 2) / segmentsPerEdge,
    drawCount: 1,
    quadCount,
    vertexCount,
    triangleCount
  });
}

function appendSquareLoop(
  positions: Vector3[],
  markers: Vector2[],
  halfExtent: number,
  segments: number,
  marker: number
): void {
  const step = (halfExtent * 2) / segments;
  for (let segment = 0; segment < segments; segment++) {
    positions.push(new Vector3(-halfExtent, 0, -halfExtent + segment * step));
    markers.push(new Vector2(marker, 0));
  }
  for (let segment = 0; segment < segments; segment++) {
    positions.push(new Vector3(-halfExtent + segment * step, 0, halfExtent));
    markers.push(new Vector2(marker, 0));
  }
  for (let segment = 0; segment < segments; segment++) {
    positions.push(new Vector3(halfExtent, 0, halfExtent - segment * step));
    markers.push(new Vector2(marker, 0));
  }
  for (let segment = 0; segment < segments; segment++) {
    positions.push(new Vector3(halfExtent - segment * step, 0, -halfExtent));
    markers.push(new Vector2(marker, 0));
  }
}

/** Builds one shared-index-compatible mesh; no topology changes occur after upload. */
export function createGradedOceanFarFieldTopology(
  layout: Readonly<GradedOceanFarFieldLayout> = resolveGradedOceanFarFieldLayout()
): Readonly<GradedOceanFarFieldTopology> {
  const positions: Vector3[] = [];
  const projectionMarkers: Vector2[] = [];
  const indices: number[] = [];
  const lastLoop = layout.halfExtentsMetres.length - 1;
  for (let loop = 0; loop <= lastLoop; loop++) {
    appendSquareLoop(
      positions,
      projectionMarkers,
      layout.halfExtentsMetres[loop]!,
      layout.segmentsPerEdge,
      loop === lastLoop ? 1 : 0
    );
  }
  for (let ring = 0; ring < layout.ringCount; ring++) {
    const innerOffset = ring * layout.verticesPerLoop;
    const outerOffset = innerOffset + layout.verticesPerLoop;
    for (let vertex = 0; vertex < layout.verticesPerLoop; vertex++) {
      const next = (vertex + 1) % layout.verticesPerLoop;
      const inner = innerOffset + vertex;
      const innerNext = innerOffset + next;
      const outer = outerOffset + vertex;
      const outerNext = outerOffset + next;
      indices.push(inner, outer, innerNext, innerNext, outer, outerNext);
    }
  }
  if (
    positions.length !== layout.vertexCount ||
    projectionMarkers.length !== layout.vertexCount ||
    indices.length / 3 !== layout.triangleCount
  ) {
    throw new Error("Ocean graded far-field topology does not match its fixed layout proof.");
  }
  return Object.freeze({
    positions,
    projectionMarkers,
    indices: new Uint16Array(indices)
  });
}

/**
 * Covers the graded far field's center hole only while every wet fragment is proven to use the far closure.
 * Four vertices are sufficient because coverage and shoreline antialiasing remain fragment-space atlas work.
 */
export function createOceanFarOnlyFillTopology(
  nearLayout: Readonly<FiniteOceanNearFieldLayout> = resolveFiniteOceanNearFieldLayout(),
  farLayout: Readonly<GradedOceanFarFieldLayout> = resolveGradedOceanFarFieldLayout()
): Readonly<OceanFarOnlyFillTopology> {
  if (nearLayout.halfExtentMetres !== farLayout.innerHalfExtentMetres) {
    throw new RangeError("Ocean far-only fill must align to both the detailed grid and graded far field.");
  }
  const halfExtent = nearLayout.halfExtentMetres;
  const positions = [
    new Vector3(-halfExtent, 0, -halfExtent),
    new Vector3(-halfExtent, 0, halfExtent),
    new Vector3(halfExtent, 0, -halfExtent),
    new Vector3(halfExtent, 0, halfExtent)
  ];
  const projectionMarkers = positions.map(() => new Vector2(0, 0));
  const indices = new Uint16Array([0, 1, 2, 2, 1, 3]);
  const budget = OCEAN_RENDER_BUDGET;
  if (
    positions.length > budget.farOnlyFillMaximumResidentVertexCount ||
    indices.length / 3 > budget.farOnlyFillMaximumResidentTriangleCount
  ) {
    throw new RangeError("Ocean far-only fill exceeds its immutable mobile budget.");
  }
  return Object.freeze({ positions, projectionMarkers, indices });
}

function resolveFiniteOceanNearFieldAxis(camera: number, latticeOrigin: number, snapSizeMetres: number): number {
  return latticeOrigin + Math.round((camera - latticeOrigin) / snapSizeMetres) * snapSizeMetres;
}

/** Snaps the complete near/far topology to a stable world lattice without clamping it to the finite authority. */
export function resolveFiniteOceanNearFieldCenter(
  envelope: Readonly<FiniteOceanSurfaceEnvelope>,
  cameraX: number,
  cameraZ: number,
  layout: Readonly<FiniteOceanNearFieldLayout> = resolveFiniteOceanNearFieldLayout()
): readonly [number, number] {
  if (!Number.isFinite(cameraX) || !Number.isFinite(cameraZ)) {
    throw new RangeError("Finite Ocean camera position must be finite.");
  }
  return Object.freeze([
    resolveFiniteOceanNearFieldAxis(cameraX, envelope.worldMinimumX, layout.snapSizeMetres),
    resolveFiniteOceanNearFieldAxis(cameraZ, envelope.worldMinimumZ, layout.snapSizeMetres)
  ] as const);
}

/**
 * Builds one watertight concentric-ring quadrant covering signX * [0..R] x signZ * [0..R].
 * Shared seam vertices use the coarser outer ring's samplingCellSize in TEXCOORD_0.x so
 * vertex displacement matches identically across 2:1 ring transitions and quadrant axes.
 */
export function createFiniteOceanNearFieldQuadrantTopology(
  layout: Readonly<FiniteOceanNearFieldLayout>,
  signX: -1 | 1,
  signZ: -1 | 1
): Readonly<{ positions: Vector3[]; uvs: Vector2[]; indices: Uint16Array }> {
  const rings = layout.rings;
  const minCell = layout.cellSizeMetres;
  const maxExtent = layout.halfExtentMetres;
  const gridStride = maxExtent / minCell + 1;
  const positions: Vector3[] = [];
  const uvs: Vector2[] = [];
  const indices: number[] = [];
  const vertexIndices = new Map<number, number>();
  const flipWinding = signX * signZ < 0;

  const samplingCellSizeFor = (u: number, v: number): number => {
    const r = u > v ? u : v;
    for (let i = 0; i < rings.length - 1; i++) {
      if (r < rings[i]!.outerHalfExtentMetres) return rings[i]!.cellSizeMetres;
    }
    return rings[rings.length - 1]!.cellSizeMetres;
  };

  const getVertex = (u: number, v: number): number => {
    const key = (v / minCell) * gridStride + u / minCell;
    let index = vertexIndices.get(key);
    if (index === undefined) {
      index = positions.length;
      vertexIndices.set(key, index);
      positions.push(new Vector3(signX * u, 0, signZ * v));
      uvs.push(new Vector2(samplingCellSizeFor(u, v), 0));
    }
    return index;
  };

  const emitTri = (i0: number, i1: number, i2: number): void => {
    if (flipWinding) indices.push(i0, i2, i1);
    else indices.push(i0, i1, i2);
  };

  for (let ringIndex = 0; ringIndex < rings.length; ringIndex++) {
    const ring = rings[ringIndex]!;
    const innerExtent = ringIndex === 0 ? 0 : rings[ringIndex - 1]!.outerHalfExtentMetres;
    const outerExtent = ring.outerHalfExtentMetres;
    const cell = ring.cellSizeMetres;
    const prevCell = ringIndex === 0 ? cell : rings[ringIndex - 1]!.cellSizeMetres;
    const cellsOuter = outerExtent / cell;
    const cellsInner = innerExtent / cell;
    for (let iz = 0; iz < cellsOuter; iz++) {
      for (let ix = 0; ix < cellsOuter; ix++) {
        if (ix < cellsInner && iz < cellsInner) continue;
        const u0 = ix * cell;
        const u1 = u0 + cell;
        const v0 = iz * cell;
        const v1 = v0 + cell;
        if (ringIndex > 0 && ix === cellsInner && iz < cellsInner) {
          // 2:1 vertical seam stitch along u = innerExtent
          const a = getVertex(u0, v0);
          const m = getVertex(u0, v0 + prevCell);
          const c = getVertex(u0, v1);
          const b = getVertex(u1, v0);
          const d = getVertex(u1, v1);
          emitTri(a, m, b);
          emitTri(m, c, d);
          emitTri(m, d, b);
        } else if (ringIndex > 0 && iz === cellsInner && ix < cellsInner) {
          // 2:1 horizontal seam stitch along v = innerExtent
          const a = getVertex(u0, v0);
          const m = getVertex(u0 + prevCell, v0);
          const b = getVertex(u1, v0);
          const c = getVertex(u0, v1);
          const d = getVertex(u1, v1);
          emitTri(a, c, m);
          emitTri(m, d, b);
          emitTri(m, c, d);
        } else {
          const a = getVertex(u0, v0);
          const b = getVertex(u1, v0);
          const c = getVertex(u0, v1);
          const d = getVertex(u1, v1);
          emitTri(a, c, b);
          emitTri(b, c, d);
        }
      }
    }
  }
  return { positions, uvs, indices: new Uint16Array(indices) };
}

const WET_GRID_MAX_EDGE = 128;

interface MutableWetRectQuery {
  hasWet: boolean;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/**
 * Conservative 2D prefix-sum index over the nearshore atlas and outside policies.
 * Supports zero-GC O(log N) dry-quadrant skipping and tight wet world-AABB queries on grid snaps.
 */
class OceanWetnessGrid {
  private readonly _width: number;
  private readonly _height: number;
  private readonly _stride: number;
  private readonly _prefixSum: Int32Array;
  private readonly _atlasMinX: number;
  private readonly _atlasMaxX: number;
  private readonly _atlasMinZ: number;
  private readonly _atlasMaxZ: number;
  private readonly _coarseCellX: number;
  private readonly _coarseCellZ: number;
  private readonly _negXDeep: boolean;
  private readonly _posXDeep: boolean;
  private readonly _negZDeep: boolean;
  private readonly _posZDeep: boolean;

  constructor(
    descriptor: Readonly<OceanNearshoreDescriptorV1>,
    atlas: Readonly<OceanNearshoreStaticAtlas>,
    connectionCoverageBounds?: ReadonlyArray<readonly [number, number, number, number]>
  ) {
    const grid = descriptor.grid;
    const atlasMinX = grid.originXZ[0] - grid.cellSizeXZ[0] * 0.5;
    const atlasMinZ = grid.originXZ[1] - grid.cellSizeXZ[1] * 0.5;
    const worldSpanX = grid.cellSizeXZ[0] * grid.width;
    const worldSpanZ = grid.cellSizeXZ[1] * grid.height;
    this._atlasMinX = atlasMinX;
    this._atlasMaxX = atlasMinX + worldSpanX;
    this._atlasMinZ = atlasMinZ;
    this._atlasMaxZ = atlasMinZ + worldSpanZ;

    const width = Math.min(atlas.width, WET_GRID_MAX_EDGE);
    const height = Math.min(atlas.height, WET_GRID_MAX_EDGE);
    this._width = width;
    this._height = height;
    this._stride = width + 1;
    this._coarseCellX = worldSpanX / width;
    this._coarseCellZ = worldSpanZ / height;

    const outside = descriptor.outsidePolicy;
    this._negXDeep = outside.negativeX === OceanNearshoreOutsidePolicy.DeepOcean;
    this._posXDeep = outside.positiveX === OceanNearshoreOutsidePolicy.DeepOcean;
    this._negZDeep = outside.negativeZ === OceanNearshoreOutsidePolicy.DeepOcean;
    this._posZDeep = outside.positiveZ === OceanNearshoreOutsidePolicy.DeepOcean;

    // Conservative shore halo covers bilinear filtering, shader AA fringe, and RGBA8 quantization.
    const shoreHaloMetres = Math.max(grid.cellSizeXZ[0], grid.cellSizeXZ[1]) * 2.0 + 2.0;
    const shoreRange = Math.max(atlas.shoreDistanceRange, 0.0001);
    const minimumPotentialShoreCode = Math.max(0, Math.floor(128 - (shoreHaloMetres / shoreRange) * 127));

    const cells = new Uint8Array(width * height);
    const pixels = atlas.pixels.borrowTypedArray();
    const pixelCount = pixels.length;
    for (let z = 0; z < atlas.height; z++) {
      const cz = Math.min(height - 1, Math.floor((z * height) / atlas.height));
      const rowOffset = z * atlas.width;
      const coarseRow = cz * width;
      for (let x = 0; x < atlas.width; x++) {
        const offset = (rowOffset + x) * 4;
        if (offset + 3 < pixelCount && (pixels[offset]! > 0 || pixels[offset + 3]! >= minimumPotentialShoreCode)) {
          const cx = Math.min(width - 1, Math.floor((x * width) / atlas.width));
          cells[coarseRow + cx] = 1;
        }
      }
    }

    if (connectionCoverageBounds) {
      for (let i = 0; i < connectionCoverageBounds.length; i++) {
        const bounds = connectionCoverageBounds[i]!;
        const cMinX = Math.max(0, Math.floor((bounds[0] - atlasMinX) / this._coarseCellX));
        const cMaxX = Math.min(width - 1, Math.floor((bounds[2] - atlasMinX) / this._coarseCellX));
        const cMinZ = Math.max(0, Math.floor((bounds[1] - atlasMinZ) / this._coarseCellZ));
        const cMaxZ = Math.min(height - 1, Math.floor((bounds[3] - atlasMinZ) / this._coarseCellZ));
        for (let cz = cMinZ; cz <= cMaxZ; cz++) {
          const coarseRow = cz * width;
          for (let cx = cMinX; cx <= cMaxX; cx++) cells[coarseRow + cx] = 1;
        }
      }
    }

    const stride = this._stride;
    const prefixSum = new Int32Array(stride * (height + 1));
    for (let z = 0; z < height; z++) {
      const srcRow = z * width;
      const prevRow = z * stride;
      const dstRow = (z + 1) * stride;
      let rowAcc = 0;
      for (let x = 0; x < width; x++) {
        rowAcc += cells[srcRow + x]!;
        prefixSum[dstRow + x + 1] = prefixSum[prevRow + x + 1]! + rowAcc;
      }
    }
    this._prefixSum = prefixSum;
  }

  private _rectSum(x0: number, z0: number, x1: number, z1: number): number {
    const ps = this._prefixSum;
    const s = this._stride;
    return ps[(z1 + 1) * s + (x1 + 1)]! - ps[z0 * s + (x1 + 1)]! - ps[(z1 + 1) * s + x0]! + ps[z0 * s + x0]!;
  }

  queryWetRect(minX: number, maxX: number, minZ: number, maxZ: number, out: MutableWetRectQuery): void {
    let hasWet = false;
    let wMinX = Number.POSITIVE_INFINITY;
    let wMaxX = Number.NEGATIVE_INFINITY;
    let wMinZ = Number.POSITIVE_INFINITY;
    let wMaxZ = Number.NEGATIVE_INFINITY;

    // 1. Inside atlas intersection via O(log N) prefix-sum binary search.
    const ix0 = Math.max(minX, this._atlasMinX);
    const ix1 = Math.min(maxX, this._atlasMaxX);
    const iz0 = Math.max(minZ, this._atlasMinZ);
    const iz1 = Math.min(maxZ, this._atlasMaxZ);
    if (ix0 < ix1 && iz0 < iz1) {
      const cMinX = Math.max(0, Math.min(this._width - 1, Math.floor((ix0 - this._atlasMinX) / this._coarseCellX)));
      const cMaxX = Math.max(
        cMinX,
        Math.min(this._width - 1, Math.ceil((ix1 - this._atlasMinX) / this._coarseCellX) - 1)
      );
      const cMinZ = Math.max(0, Math.min(this._height - 1, Math.floor((iz0 - this._atlasMinZ) / this._coarseCellZ)));
      const cMaxZ = Math.max(
        cMinZ,
        Math.min(this._height - 1, Math.ceil((iz1 - this._atlasMinZ) / this._coarseCellZ) - 1)
      );
      if (this._rectSum(cMinX, cMinZ, cMaxX, cMaxZ) > 0) {
        let lo = cMinX;
        let hi = cMaxX;
        while (lo < hi) {
          const mid = (lo + hi) >> 1;
          if (this._rectSum(cMinX, cMinZ, mid, cMaxZ) > 0) hi = mid;
          else lo = mid + 1;
        }
        const wetCMinX = lo;
        lo = wetCMinX;
        hi = cMaxX;
        while (lo < hi) {
          const mid = (lo + hi + 1) >> 1;
          if (this._rectSum(mid, cMinZ, cMaxX, cMaxZ) > 0) lo = mid;
          else hi = mid - 1;
        }
        const wetCMaxX = lo;

        lo = cMinZ;
        hi = cMaxZ;
        while (lo < hi) {
          const mid = (lo + hi) >> 1;
          if (this._rectSum(wetCMinX, cMinZ, wetCMaxX, mid) > 0) hi = mid;
          else lo = mid + 1;
        }
        const wetCMinZ = lo;
        lo = wetCMinZ;
        hi = cMaxZ;
        while (lo < hi) {
          const mid = (lo + hi + 1) >> 1;
          if (this._rectSum(wetCMinX, mid, wetCMaxX, cMaxZ) > 0) lo = mid;
          else hi = mid - 1;
        }
        const wetCMaxZ = lo;

        hasWet = true;
        wMinX = Math.max(ix0, this._atlasMinX + wetCMinX * this._coarseCellX);
        wMaxX = Math.min(ix1, this._atlasMinX + (wetCMaxX + 1) * this._coarseCellX);
        wMinZ = Math.max(iz0, this._atlasMinZ + wetCMinZ * this._coarseCellZ);
        wMaxZ = Math.min(iz1, this._atlasMinZ + (wetCMaxZ + 1) * this._coarseCellZ);
      }
    }

    // 2. Outside-atlas strips and corners (fail-closed: wet only if every crossed edge is DeepOcean).
    for (let rx = -1; rx <= 1; rx++) {
      if (rx === -1 && !this._negXDeep) continue;
      if (rx === 1 && !this._posXDeep) continue;
      const sx0 = rx === -1 ? minX : rx === 0 ? Math.max(minX, this._atlasMinX) : Math.max(minX, this._atlasMaxX);
      const sx1 = rx === -1 ? Math.min(maxX, this._atlasMinX) : rx === 0 ? Math.min(maxX, this._atlasMaxX) : maxX;
      if (sx0 >= sx1) continue;
      for (let rz = -1; rz <= 1; rz++) {
        if (rx === 0 && rz === 0) continue;
        if (rz === -1 && !this._negZDeep) continue;
        if (rz === 1 && !this._posZDeep) continue;
        const sz0 = rz === -1 ? minZ : rz === 0 ? Math.max(minZ, this._atlasMinZ) : Math.max(minZ, this._atlasMaxZ);
        const sz1 = rz === -1 ? Math.min(maxZ, this._atlasMinZ) : rz === 0 ? Math.min(maxZ, this._atlasMaxZ) : maxZ;
        if (sz0 >= sz1) continue;
        hasWet = true;
        if (sx0 < wMinX) wMinX = sx0;
        if (sx1 > wMaxX) wMaxX = sx1;
        if (sz0 < wMinZ) wMinZ = sz0;
        if (sz1 > wMaxZ) wMaxZ = sz1;
      }
    }

    out.hasWet = hasWet;
    out.minX = wMinX;
    out.maxX = wMaxX;
    out.minZ = wMinZ;
    out.maxZ = wMaxZ;
  }
}

function createGeometryChunk(
  engine: Engine,
  parent: Entity,
  material: Material,
  layer: Layer,
  input: Readonly<{
    name: string;
    region: OceanGeometryRegion;
    positions: Vector3[];
    uvs: Vector2[];
    indices: Uint16Array;
    bounds: Readonly<FiniteOceanSurfaceBounds>;
    localMinX?: number;
    localMaxX?: number;
    localMinZ?: number;
    localMaxZ?: number;
    restoreTopology(): { positions: Vector3[]; uvs: Vector2[]; indices: Uint16Array };
  }>
): OceanGeometryChunk {
  const mesh = new ModelMesh(engine);
  mesh.setPositions(input.positions);
  mesh.setUVs(input.uvs);
  mesh.setIndices(input.indices);
  mesh.addSubMesh(0, input.indices.length);
  mesh.bounds.min.set(input.bounds.minimum[0], input.bounds.minimum[1], input.bounds.minimum[2]);
  mesh.bounds.max.set(input.bounds.maximum[0], input.bounds.maximum[1], input.bounds.maximum[2]);
  mesh.uploadData(true);
  // Capture only the generator, not input's initial large geometry arrays.
  const restoreTopology = input.restoreTopology;
  registerWaterMeshContentRestorer(engine, mesh, () => {
    const data = restoreTopology();
    return {
      vertexCount: data.positions.length,
      indices: data.indices,
      read: (attribute, vertex, component) => {
        if (attribute === VertexAttribute.Position) {
          const value = data.positions[vertex];
          return component === 0 ? value.x : component === 1 ? value.y : value.z;
        }
        const value = data.uvs[vertex];
        return component === 0 ? value.x : value.y;
      }
    };
  });
  const ownedMesh = mesh as unknown as ModelMeshOwnedBuffers;
  const vertexBuffers = new Set<Buffer>();
  const ownedBuffers = new Set<Buffer>();
  for (const binding of ownedMesh.vertexBufferBindings ?? []) {
    if (!binding) continue;
    vertexBuffers.add(binding.buffer);
    ownedBuffers.add(binding.buffer);
  }
  const indexGpuBuffer = ownedMesh._primitive?.indexBufferBinding?.buffer;
  if (indexGpuBuffer) ownedBuffers.add(indexGpuBuffer);
  const entity = parent.createChild(input.name);
  entity.layer = layer;
  const renderer = entity.addComponent(MeshRenderer);
  renderer.mesh = mesh;
  renderer.setMaterial(material);
  applyWaterSurfaceRendererContract(renderer);
  renderer.shaderData.setFloat("renderer_OceanLod", input.region === "near" ? 0 : 2);
  const wetWorldBounds = new BoundingBox(
    new Vector3(input.bounds.minimum[0], input.bounds.minimum[1], input.bounds.minimum[2]),
    new Vector3(input.bounds.maximum[0], input.bounds.maximum[1], input.bounds.maximum[2])
  );
  return {
    region: input.region,
    entity,
    renderer,
    mesh,
    ownedBuffers: Object.freeze([...ownedBuffers]),
    terrainOcclusionKey: `ocean:${input.name}`,
    localMinX: input.localMinX ?? input.bounds.minimum[0],
    localMaxX: input.localMaxX ?? input.bounds.maximum[0],
    localMinZ: input.localMinZ ?? input.bounds.minimum[2],
    localMaxZ: input.localMaxZ ?? input.bounds.maximum[2],
    wetWorldBounds,
    hasWetArea: true,
    terrainOccluded: false,
    vertexCount: input.positions.length,
    triangleCount: input.indices.length / 3,
    vertexBufferBytes: [...vertexBuffers].reduce((bytes, buffer) => bytes + buffer.byteLength, 0),
    indexBufferBytes: indexGpuBuffer?.byteLength ?? 0
  };
}

export class FiniteOceanSurfaceGeometry {
  readonly root: Entity;
  readonly layer: Layer;
  readonly metrics: Readonly<FiniteOceanSurfaceGeometryMetrics>;
  private readonly _envelope: Readonly<FiniteOceanSurfaceEnvelope>;
  private readonly _nearFieldLayout: Readonly<FiniteOceanNearFieldLayout>;
  private readonly _cameraRelativeRoot: Entity;
  private readonly _chunks: OceanGeometryChunk[] = [];
  private readonly _waterLevel: number;
  private readonly _wetnessGrid?: OceanWetnessGrid;
  private readonly _wetQueryScratch: MutableWetRectQuery = {
    hasWet: true,
    minX: 0,
    maxX: 0,
    minZ: 0,
    maxZ: 0
  };
  private _dispX: number;
  private _dispY: number;
  private _dispZ: number;
  private _nearFieldCenterX: number;
  private _nearFieldCenterZ: number;
  private _presentationPath: FiniteOceanPresentationPath;
  private _destroyed = false;

  constructor(
    engine: Engine,
    parent: Entity,
    materials: Readonly<FiniteOceanSurfaceMaterials>,
    config: Readonly<FiniteOceanSurfaceGeometryConfig>
  ) {
    const envelope = resolveFiniteOceanSurfaceEnvelope(config);
    resolveFiniteOceanSurfaceBounds(envelope, config.waterLevel, config.maximumDisplacement);
    const nearFieldLayout = resolveFiniteOceanNearFieldLayout();
    const farFieldLayout = resolveGradedOceanFarFieldLayout();
    if (config.initialPresentationPath !== "detailed" && config.initialPresentationPath !== "far-only") {
      throw new RangeError("Finite Ocean presentation path must be 'detailed' or 'far-only'.");
    }
    const initialCenter = resolveFiniteOceanNearFieldCenter(
      envelope,
      config.initialCameraPositionXZ.x,
      config.initialCameraPositionXZ.z,
      nearFieldLayout
    );

    this.layer = config.layer ?? FINITE_OCEAN_SURFACE_LAYER;
    this.root = parent.createChild("camera-relative-ocean-surface");
    this.root.layer = this.layer;
    this._envelope = envelope;
    this._nearFieldLayout = nearFieldLayout;
    this._waterLevel = config.waterLevel;
    this._dispX = config.maximumDisplacement.x;
    this._dispY = config.maximumDisplacement.y;
    this._dispZ = config.maximumDisplacement.z;
    this._wetnessGrid = config.nearshoreAtlas
      ? new OceanWetnessGrid(config.nearshore, config.nearshoreAtlas, config.connectionCoverageBounds)
      : undefined;
    this._nearFieldCenterX = initialCenter[0];
    this._nearFieldCenterZ = initialCenter[1];
    this._presentationPath = config.initialPresentationPath;
    this._cameraRelativeRoot = this.root.createChild("camera-relative-grid");
    this._cameraRelativeRoot.layer = this.layer;
    this._cameraRelativeRoot.transform.setPosition(this._nearFieldCenterX, 0, this._nearFieldCenterZ);

    const nearMeshSize = nearFieldLayout.windowSizeMetres / nearFieldLayout.meshAxisCount;
    for (let meshZ = 0; meshZ < nearFieldLayout.meshAxisCount; meshZ++) {
      for (let meshX = 0; meshX < nearFieldLayout.meshAxisCount; meshX++) {
        const signX: -1 | 1 = meshX === 0 ? -1 : 1;
        const signZ: -1 | 1 = meshZ === 0 ? -1 : 1;
        const minimumX = -nearFieldLayout.halfExtentMetres + meshX * nearMeshSize;
        const minimumZ = -nearFieldLayout.halfExtentMetres + meshZ * nearMeshSize;
        const maximumX = minimumX + nearMeshSize;
        const maximumZ = minimumZ + nearMeshSize;
        const topology = createFiniteOceanNearFieldQuadrantTopology(nearFieldLayout, signX, signZ);
        this._chunks.push(
          createGeometryChunk(engine, this._cameraRelativeRoot, materials.near, this.layer, {
            name: `near-${meshX}-${meshZ}`,
            region: "near",
            positions: topology.positions,
            uvs: topology.uvs,
            indices: topology.indices,
            localMinX: minimumX,
            localMaxX: maximumX,
            localMinZ: minimumZ,
            localMaxZ: maximumZ,
            restoreTopology: () => createFiniteOceanNearFieldQuadrantTopology(nearFieldLayout, signX, signZ),
            bounds: {
              minimum: [
                minimumX - config.maximumDisplacement.x,
                config.waterLevel - config.maximumDisplacement.y,
                minimumZ - config.maximumDisplacement.z
              ],
              maximum: [
                maximumX + config.maximumDisplacement.x,
                config.waterLevel + config.maximumDisplacement.y,
                maximumZ + config.maximumDisplacement.z
              ]
            }
          })
        );
      }
    }

    const farOnlyFillTopology = createOceanFarOnlyFillTopology(nearFieldLayout, farFieldLayout);
    const farOnlyFillHalfExtent = nearFieldLayout.halfExtentMetres;
    this._chunks.push(
      createGeometryChunk(engine, this._cameraRelativeRoot, materials.far, this.layer, {
        name: "far-only-center-fill",
        region: "far-only-fill",
        positions: farOnlyFillTopology.positions,
        uvs: farOnlyFillTopology.projectionMarkers,
        indices: farOnlyFillTopology.indices,
        restoreTopology: () => {
          const data = createOceanFarOnlyFillTopology(nearFieldLayout, farFieldLayout);
          return { positions: data.positions, uvs: data.projectionMarkers, indices: data.indices };
        },
        bounds: {
          minimum: [-farOnlyFillHalfExtent, config.waterLevel - 0.01, -farOnlyFillHalfExtent],
          maximum: [farOnlyFillHalfExtent, config.waterLevel + 0.01, farOnlyFillHalfExtent]
        }
      })
    );

    const farTopology = createGradedOceanFarFieldTopology(farFieldLayout);
    const farBoundsHalfExtent = farFieldLayout.projectionMarkerHalfExtentMetres;
    this._chunks.push(
      createGeometryChunk(engine, this._cameraRelativeRoot, materials.far, this.layer, {
        name: "graded-far-field",
        region: "far",
        positions: farTopology.positions,
        uvs: farTopology.projectionMarkers,
        indices: farTopology.indices,
        restoreTopology: () => {
          const data = createGradedOceanFarFieldTopology(farFieldLayout);
          return { positions: data.positions, uvs: data.projectionMarkers, indices: data.indices };
        },
        bounds: {
          minimum: [-farBoundsHalfExtent, config.waterLevel - 0.01, -farBoundsHalfExtent],
          maximum: [farBoundsHalfExtent, config.waterLevel + 0.01, farBoundsHalfExtent]
        }
      })
    );

    const nearChunks = this._chunks.filter((chunk) => chunk.region === "near");
    const farChunk = this._chunks.find((chunk) => chunk.region === "far");
    const farOnlyFillChunk = this._chunks.find((chunk) => chunk.region === "far-only-fill");
    if (!farChunk) throw new Error("Ocean graded far-field Mesh was not created.");
    if (!farOnlyFillChunk) throw new Error("Ocean far-only center-fill Mesh was not created.");
    const nearFieldVertexCount = nearChunks.reduce((sum, chunk) => sum + chunk.vertexCount, 0);
    const nearFieldTriangleCount = nearChunks.reduce((sum, chunk) => sum + chunk.triangleCount, 0);
    const detailedPathDrawCount = nearChunks.length + 1;
    const detailedPathVertexCount = nearFieldVertexCount + farChunk.vertexCount;
    const detailedPathTriangleCount = nearFieldTriangleCount + farChunk.triangleCount;
    const farOnlyPathDrawCount = 2;
    const farOnlyPathVertexCount = farOnlyFillChunk.vertexCount + farChunk.vertexCount;
    const farOnlyPathTriangleCount = farOnlyFillChunk.triangleCount + farChunk.triangleCount;
    this._refreshNearChunkWetBounds();
    this._applyPresentationPath();
    this.metrics = Object.freeze({
      finite: true,
      cameraRelative: true,
      nearFieldWindowSizeMetres: nearFieldLayout.windowSizeMetres,
      nearFieldCellSizeMetres: nearFieldLayout.cellSizeMetres,
      nearFieldSnapSizeMetres: nearFieldLayout.snapSizeMetres,
      nearFieldMinimumGuaranteedRadiusMetres: nearFieldLayout.minimumGuaranteedRadiusMetres,
      nearFieldCellCount: nearFieldLayout.cellCount,
      nearFieldDrawCount: nearChunks.length,
      nearFieldVertexCount,
      nearFieldTriangleCount,
      farFieldRingCount: farFieldLayout.ringCount,
      farFieldSegmentsPerEdge: farFieldLayout.segmentsPerEdge,
      farFieldInnerHalfExtentMetres: farFieldLayout.innerHalfExtentMetres,
      farFieldActualDepthOuterHalfExtentMetres: farFieldLayout.actualDepthOuterHalfExtentMetres,
      farFieldProjectionMarkerHalfExtentMetres: farFieldLayout.projectionMarkerHalfExtentMetres,
      farFieldProjectionMinimumDistanceMetres: farFieldLayout.projectionMinimumDistanceMetres,
      farFieldProjectionMaximumDistanceMetres: farFieldLayout.projectionMaximumDistanceMetres,
      farFieldProjectionMaximumErrorPixels: farFieldLayout.projectionMaximumErrorPixels,
      farFieldQuadCount: farFieldLayout.quadCount,
      farFieldDrawCount: 1,
      farFieldVertexCount: farChunk.vertexCount,
      farFieldTriangleCount: farChunk.triangleCount,
      farOnlyFillDrawCount: 1,
      farOnlyFillVertexCount: farOnlyFillChunk.vertexCount,
      farOnlyFillTriangleCount: farOnlyFillChunk.triangleCount,
      detailedPathDrawCount,
      detailedPathVertexCount,
      detailedPathTriangleCount,
      farOnlyPathDrawCount,
      farOnlyPathVertexCount,
      farOnlyPathTriangleCount,
      residentMeshCount: this._chunks.length,
      residentVertexCount: detailedPathVertexCount + farOnlyFillChunk.vertexCount,
      residentTriangleCount: detailedPathTriangleCount + farOnlyFillChunk.triangleCount,
      meshCreateCount: this._chunks.length,
      meshUploadCount: this._chunks.length,
      perFrameMeshUpload: false,
      vertexBufferBytes: this._chunks.reduce((sum, chunk) => sum + chunk.vertexBufferBytes, 0),
      indexBufferBytes: this._chunks.reduce((sum, chunk) => sum + chunk.indexBufferBytes, 0),
      authorityWorldMinimumX: envelope.worldMinimumX,
      authorityWorldMinimumZ: envelope.worldMinimumZ,
      authorityWorldMaximumX: envelope.worldMaximumX,
      authorityWorldMaximumZ: envelope.worldMaximumZ,
      minimumCellSize: nearFieldLayout.cellSizeMetres,
      maximumActualCellSize: farFieldLayout.maximumActualCellSizeMetres
    });
  }

  /** Switches immutable Mesh visibility only; no buffer or material is recreated or uploaded. */
  setPresentationPath(path: FiniteOceanPresentationPath): boolean {
    if (this._destroyed) throw new Error("Finite Ocean geometry has been destroyed.");
    if (path !== "detailed" && path !== "far-only") {
      throw new RangeError("Finite Ocean presentation path must be 'detailed' or 'far-only'.");
    }
    if (path === this._presentationPath) return false;
    this._presentationPath = path;
    this._applyPresentationPath();
    return true;
  }

  /** Updates active displacement envelope (e.g. after live wave tuning edits) and tightens wet bounds. */
  setMaximumDisplacement(displacement: Readonly<{ readonly x: number; readonly y: number; readonly z: number }>): void {
    if (this._destroyed) throw new Error("Finite Ocean geometry has been destroyed.");
    if (
      !Number.isFinite(displacement.x) ||
      !Number.isFinite(displacement.y) ||
      !Number.isFinite(displacement.z) ||
      displacement.x < 0 ||
      displacement.y < 0 ||
      displacement.z < 0
    ) {
      throw new RangeError("Finite Ocean displacement bounds must be finite and non-negative.");
    }
    if (displacement.x === this._dispX && displacement.y === this._dispY && displacement.z === this._dispZ) return;
    this._dispX = displacement.x;
    this._dispY = displacement.y;
    this._dispZ = displacement.z;
    this._refreshNearChunkWetBounds();
  }

  /** Updates per-chunk terrain-horizon occlusion without disabling the horizon ring. */
  refreshTerrainOcclusion(provider?: WaterTerrainOcclusionProvider): void {
    const chunks = this._chunks;
    const worldMatrix = this._cameraRelativeRoot.transform.worldMatrix;
    for (let index = 0; index < chunks.length; index++) {
      const chunk = chunks[index]!;
      if (chunk.region !== "near") continue;
      if (!chunk.hasWetArea) {
        chunk.terrainOccluded = false;
        if (chunk.renderer.enabled) chunk.renderer.enabled = false;
        continue;
      }
      BoundingBox.transform(chunk.mesh.bounds, worldMatrix, chunk.wetWorldBounds);
      const occluded = provider !== undefined && provider.isOccluded(chunk.terrainOcclusionKey, chunk.wetWorldBounds);
      chunk.terrainOccluded = occluded;
      const shouldEnable = !occluded;
      if (chunk.renderer.enabled !== shouldEnable) {
        chunk.renderer.enabled = shouldEnable;
      }
    }
  }

  /**
   * True when at least one wet, unoccluded detailed near-field quadrant intersects the camera frustum.
   * Checks `_cameraRelativeRoot.isActiveInHierarchy` rather than `chunk.entity.isActiveInHierarchy`
   * so entering `far-only` never permanently prevents returning to `detailed` when looking back.
   */
  hasCameraVisibleNearChunk(provider: WaterCameraVisibilityProvider): boolean {
    if (!this._cameraRelativeRoot.isActiveInHierarchy) return false;
    const chunks = this._chunks;
    const worldMatrix = this._cameraRelativeRoot.transform.worldMatrix;
    for (let index = 0; index < chunks.length; index++) {
      const chunk = chunks[index]!;
      if (chunk.region !== "near") continue;
      if (!chunk.hasWetArea || chunk.terrainOccluded) continue;
      BoundingBox.transform(chunk.mesh.bounds, worldMatrix, chunk.wetWorldBounds);
      if (provider.isVisible(chunk.wetWorldBounds, chunk.entity.layer)) {
        return true;
      }
    }
    return false;
  }

  /** Queries reflection demand without changing scene visibility for other cameras. */
  hasCameraVisibleChunk(provider: WaterCameraVisibilityProvider): boolean {
    const chunks = this._chunks;
    for (let index = 0; index < chunks.length; index++) {
      const renderer = chunks[index]!.renderer;
      if (
        renderer.enabled &&
        renderer.entity.isActiveInHierarchy &&
        provider.isVisible(renderer.bounds, renderer.entity.layer)
      ) {
        return true;
      }
    }
    return false;
  }

  /** Moves the complete immutable topology; neither the near nor far Mesh uploads again. */
  updateCameraPosition(cameraX: number, cameraZ: number): boolean {
    if (this._destroyed) throw new Error("Finite Ocean geometry has been destroyed.");
    if (!Number.isFinite(cameraX) || !Number.isFinite(cameraZ)) {
      throw new RangeError("Finite Ocean camera position must be finite.");
    }
    const snapSizeMetres = this._nearFieldLayout.snapSizeMetres;
    const centerX = resolveFiniteOceanNearFieldAxis(cameraX, this._envelope.worldMinimumX, snapSizeMetres);
    const centerZ = resolveFiniteOceanNearFieldAxis(cameraZ, this._envelope.worldMinimumZ, snapSizeMetres);
    if (centerX === this._nearFieldCenterX && centerZ === this._nearFieldCenterZ) return false;
    this._nearFieldCenterX = centerX;
    this._nearFieldCenterZ = centerZ;
    this._cameraRelativeRoot.transform.setPosition(centerX, 0, centerZ);
    this._refreshNearChunkWetBounds();
    return true;
  }

  /** Tightens each near quadrant's local bounds to its conservative wet sub-rect and disables 100% dry quadrants. */
  private _refreshNearChunkWetBounds(): void {
    const chunks = this._chunks;
    const centerX = this._nearFieldCenterX;
    const centerZ = this._nearFieldCenterZ;
    const dispX = this._dispX;
    const dispY = this._dispY;
    const dispZ = this._dispZ;
    const waterLevel = this._waterLevel;
    const grid = this._wetnessGrid;
    const scratch = this._wetQueryScratch;
    const worldMatrix = this._cameraRelativeRoot.transform.worldMatrix;

    for (let index = 0; index < chunks.length; index++) {
      const chunk = chunks[index]!;
      if (chunk.region !== "near") continue;
      const expWorldMinX = centerX + chunk.localMinX - dispX;
      const expWorldMaxX = centerX + chunk.localMaxX + dispX;
      const expWorldMinZ = centerZ + chunk.localMinZ - dispZ;
      const expWorldMaxZ = centerZ + chunk.localMaxZ + dispZ;

      if (grid) {
        grid.queryWetRect(expWorldMinX, expWorldMaxX, expWorldMinZ, expWorldMaxZ, scratch);
        if (!scratch.hasWet) {
          chunk.hasWetArea = false;
          chunk.terrainOccluded = false;
          if (chunk.renderer.enabled) chunk.renderer.enabled = false;
          continue;
        }
        chunk.hasWetArea = true;
        const wetMinX = Math.max(expWorldMinX, scratch.minX - dispX) - centerX;
        const wetMaxX = Math.min(expWorldMaxX, scratch.maxX + dispX) - centerX;
        const wetMinZ = Math.max(expWorldMinZ, scratch.minZ - dispZ) - centerZ;
        const wetMaxZ = Math.min(expWorldMaxZ, scratch.maxZ + dispZ) - centerZ;
        chunk.mesh.bounds.min.set(wetMinX, waterLevel - dispY, wetMinZ);
        chunk.mesh.bounds.max.set(wetMaxX, waterLevel + dispY, wetMaxZ);
      } else {
        chunk.hasWetArea = true;
        chunk.mesh.bounds.min.set(chunk.localMinX - dispX, waterLevel - dispY, chunk.localMinZ - dispZ);
        chunk.mesh.bounds.max.set(chunk.localMaxX + dispX, waterLevel + dispY, chunk.localMaxZ + dispZ);
      }
      BoundingBox.transform(chunk.mesh.bounds, worldMatrix, chunk.wetWorldBounds);
      const shouldEnable = !chunk.terrainOccluded;
      if (chunk.renderer.enabled !== shouldEnable) {
        chunk.renderer.enabled = shouldEnable;
      }
    }
  }

  setMaterials(materials: Readonly<FiniteOceanSurfaceMaterials>): void {
    for (const chunk of this._chunks) {
      chunk.renderer.setMaterial(chunk.region === "near" ? materials.near : materials.far);
    }
  }

  setRenderPriority(priority: number): void {
    if (!Number.isFinite(priority)) throw new RangeError("Finite Ocean render priority must be finite.");
    for (const chunk of this._chunks) chunk.renderer.priority = priority;
  }

  private _applyPresentationPath(): void {
    const detailed = this._presentationPath === "detailed";
    const chunks = this._chunks;
    for (let index = 0; index < chunks.length; index++) {
      const chunk = chunks[index]!;
      if (chunk.region === "near") chunk.entity.isActive = detailed;
      else if (chunk.region === "far-only-fill") chunk.entity.isActive = !detailed;
      else chunk.entity.isActive = true;
    }
  }

  destroy(): void {
    if (this._destroyed) return;
    this._destroyed = true;
    this.root.destroy();
    for (const chunk of this._chunks) {
      chunk.mesh.destroy(true);
      for (const buffer of chunk.ownedBuffers) buffer.destroy(true);
    }
    this._chunks.length = 0;
  }
}
