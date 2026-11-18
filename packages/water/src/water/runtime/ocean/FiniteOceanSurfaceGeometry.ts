import { registerWaterMeshContentRestorer } from "../resources/WaterMeshContentRestorer";
/** Finite Ocean authority rendered through one camera-relative near grid and one graded far-field ring mesh. */
import {
  Buffer,
  type Engine,
  type Entity,
  Layer,
  type Material,
  MeshRenderer,
  ModelMesh,
  VertexAttribute
} from "@galacean/engine-core";
import { Vector2, Vector3 } from "@galacean/engine-math";
import { OCEAN_LOOK, OCEAN_RENDER_BUDGET } from "../../authoring/ocean/presets/OceanLook";
import type { OceanNearshoreDescriptorV1 } from "../../authoring/ocean/OceanNearshoreDescriptor";
import { OceanNearshoreOutsidePolicy } from "../../authoring/ocean/OceanNearshoreTypes";
import type { WaterCameraVisibilityProvider } from "../body/WaterBackendRegistry";
import { applyWaterSurfaceRendererContract } from "../surface/WaterSurfaceRendererContract";

export const FINITE_OCEAN_SURFACE_LAYER = Layer.Layer30;

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

export interface FiniteOceanNearFieldLayout {
  readonly windowSizeMetres: number;
  readonly halfExtentMetres: number;
  readonly cellSizeMetres: number;
  readonly snapSizeMetres: number;
  readonly minimumGuaranteedRadiusMetres: number;
  readonly meshAxisCount: number;
  readonly segmentsPerAxis: number;
  readonly segmentsPerMeshAxis: number;
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
  const values = [windowSizeMetres, cellSizeMetres, snapSizeMetres, meshAxisCount];
  if (values.some((value) => !Number.isFinite(value) || value <= 0)) {
    throw new RangeError("Finite Ocean near-field layout values must be finite and positive.");
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
  const meshCount = meshAxisCount * meshAxisCount;
  const verticesPerMesh = (segmentsPerMeshAxis + 1) * (segmentsPerMeshAxis + 1);
  if (verticesPerMesh > 65_535) {
    throw new RangeError("Finite Ocean near-field quadrants must remain compatible with Uint16 indices.");
  }
  const minimumGuaranteedRadiusMetres = windowSizeMetres * 0.5 - snapSizeMetres * 0.5;
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
    halfExtentMetres: windowSizeMetres * 0.5,
    cellSizeMetres,
    snapSizeMetres,
    minimumGuaranteedRadiusMetres,
    meshAxisCount,
    segmentsPerAxis,
    segmentsPerMeshAxis,
    drawCount: meshCount,
    vertexCount: meshCount * verticesPerMesh,
    triangleCount: meshCount * segmentsPerMeshAxis * segmentsPerMeshAxis * 2
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
    !Number.isInteger(innerSegmentLength / near.cellSizeMetres) ||
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

function appendNearFieldMesh(
  positions: Vector3[],
  samplingCells: Vector2[],
  indices: number[],
  minimumX: number,
  minimumZ: number,
  segments: number,
  cellSize: number
): void {
  const vertexSide = segments + 1;
  for (let z = 0; z <= segments; z++) {
    for (let x = 0; x <= segments; x++) {
      positions.push(new Vector3(minimumX + x * cellSize, 0, minimumZ + z * cellSize));
      samplingCells.push(new Vector2(cellSize, 0));
    }
  }
  for (let z = 0; z < segments; z++) {
    for (let x = 0; x < segments; x++) {
      const a = z * vertexSide + x;
      const b = a + 1;
      const c = a + vertexSide;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
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
  return {
    region: input.region,
    entity,
    renderer,
    mesh,
    ownedBuffers: Object.freeze([...ownedBuffers]),
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
    this._nearFieldCenterX = initialCenter[0];
    this._nearFieldCenterZ = initialCenter[1];
    this._presentationPath = config.initialPresentationPath;
    this._cameraRelativeRoot = this.root.createChild("camera-relative-grid");
    this._cameraRelativeRoot.layer = this.layer;
    this._cameraRelativeRoot.transform.setPosition(this._nearFieldCenterX, 0, this._nearFieldCenterZ);

    const nearMeshSize = nearFieldLayout.windowSizeMetres / nearFieldLayout.meshAxisCount;
    for (let meshZ = 0; meshZ < nearFieldLayout.meshAxisCount; meshZ++) {
      for (let meshX = 0; meshX < nearFieldLayout.meshAxisCount; meshX++) {
        const minimumX = -nearFieldLayout.halfExtentMetres + meshX * nearMeshSize;
        const minimumZ = -nearFieldLayout.halfExtentMetres + meshZ * nearMeshSize;
        const maximumX = minimumX + nearMeshSize;
        const maximumZ = minimumZ + nearMeshSize;
        const positions: Vector3[] = [];
        const samplingCells: Vector2[] = [];
        const indices: number[] = [];
        appendNearFieldMesh(
          positions,
          samplingCells,
          indices,
          minimumX,
          minimumZ,
          nearFieldLayout.segmentsPerMeshAxis,
          nearFieldLayout.cellSizeMetres
        );
        this._chunks.push(
          createGeometryChunk(engine, this._cameraRelativeRoot, materials.near, this.layer, {
            name: `near-${meshX}-${meshZ}`,
            region: "near",
            positions,
            uvs: samplingCells,
            indices: new Uint16Array(indices),
            restoreTopology: () => {
              const positions: Vector3[] = [],
                uvs: Vector2[] = [],
                indices: number[] = [];
              appendNearFieldMesh(
                positions,
                uvs,
                indices,
                minimumX,
                minimumZ,
                nearFieldLayout.segmentsPerMeshAxis,
                nearFieldLayout.cellSizeMetres
              );
              return { positions, uvs, indices: new Uint16Array(indices) };
            },
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
    this._applyPresentationPath();
    this.metrics = Object.freeze({
      finite: true,
      cameraRelative: true,
      nearFieldWindowSizeMetres: nearFieldLayout.windowSizeMetres,
      nearFieldCellSizeMetres: nearFieldLayout.cellSizeMetres,
      nearFieldSnapSizeMetres: nearFieldLayout.snapSizeMetres,
      nearFieldMinimumGuaranteedRadiusMetres: nearFieldLayout.minimumGuaranteedRadiusMetres,
      nearFieldCellCount: nearFieldLayout.segmentsPerAxis ** 2,
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

  /** True when at least one Ocean surface chunk intersects the current source-Camera frustum. */
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
    return true;
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
    for (const chunk of this._chunks) {
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
