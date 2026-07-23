import {
  Color,
  Entity,
  Layer,
  Material,
  MeshRenderer,
  MeshTopology,
  ModelMesh,
  Script,
  Vector2,
  Vector3,
  Vector4,
  type Engine,
  type Texture2D
} from "@galacean/engine";
import { RIVER_FLOW_UV_SCALE, RIVER_GEOMETRY_Y_OFFSET } from "../../compiler/river/constants";
import type { RiverCompiledData, RiverCompiledSample } from "../../compiler/river/types";
import type {
  RectangularWaterHeightField,
  RectangularWaterHeightFieldSample,
  WaterHeightFieldCoordinate
} from "../../runtime/interaction/RectangularWaterHeightField";
import {
  createRiverMaterial,
  setRiverSurfaceOpticsBinding,
  setRiverSurfaceOpacityScale,
  setRiverSurfaceTintWeight
} from "../../runtime/river/RiverMaterialFactory";
import type {
  WaterSurfaceOpticsBinding,
  WaterSurfaceOpticsBindingReadback
} from "../../runtime/optics/WaterSurfaceOpticsTypes";
import {
  configureInteractivePoolTemporalFoamRegion,
  createInteractivePoolRippleMaterial,
  setInteractivePoolTemporalFoamTexture,
  type InteractivePoolTemporalFoamRegion
} from "./InteractivePoolRippleMaterial";
import { computeInteractivePoolRippleVisibility } from "./InteractivePoolRippleStyle";
import type { PoolLocalEffectsDebugView } from "./PoolP1ShowcaseConfig";

const RIPPLE_HIGHLIGHT_THRESHOLD = 0.16;
const RIPPLE_TROUGH_COLOR = [0.04, 0.42, 0.52] as const;
const RIPPLE_NEUTRAL_COLOR = [0.34, 0.88, 0.94] as const;
const RIPPLE_CREST_COLOR = [0.94, 1, 1] as const;
const RENDER_SUBDIVISIONS_PER_FIELD_CELL = 2;
const POOL_WATER_OPACITY_SCALE = 1.5;
const POOL_WATER_TINT_WEIGHT = 0.55;

interface PoolSurfaceRow {
  readonly baseHeight: number;
  readonly normalX: number;
  readonly normalY: number;
  readonly normalZ: number;
  readonly tangentX: number;
  readonly tangentY: number;
  readonly tangentZ: number;
  readonly distance: number;
  readonly flowTravelTime: number;
  readonly flowSpeed: number;
  readonly depth: number;
  readonly halfWidth: number;
}

export interface InteractivePoolSurfaceOptions {
  readonly engine: Engine;
  readonly parent: Entity;
  readonly compiledData: RiverCompiledData;
  readonly heightField: RectangularWaterHeightField;
}

function lerp(left: number, right: number, amount: number): number {
  return left + (right - left) * amount;
}

function sampleReachRow(
  samples: readonly RiverCompiledSample[],
  targetDistance: number,
  networkDistanceOffset: number,
  networkFlowTimeOffset: number
): PoolSurfaceRow {
  let rightIndex = 1;
  while (rightIndex < samples.length - 1 && samples[rightIndex].distance < targetDistance) rightIndex++;
  const left = samples[Math.max(0, rightIndex - 1)];
  const right = samples[Math.min(samples.length - 1, rightIndex)];
  const distanceSpan = right.distance - left.distance;
  const amount = distanceSpan > Number.EPSILON ? (targetDistance - left.distance) / distanceSpan : 0;
  let tangentX = lerp(left.tangent[0], right.tangent[0], amount);
  let tangentY = lerp(left.tangent[1], right.tangent[1], amount);
  let tangentZ = lerp(left.tangent[2], right.tangent[2], amount);
  const tangentLength = Math.hypot(tangentX, tangentY, tangentZ) || 1;
  tangentX /= tangentLength;
  tangentY /= tangentLength;
  tangentZ /= tangentLength;
  const horizontalLength = Math.hypot(tangentX, tangentZ) || 1;
  const lateralX = -tangentZ / horizontalLength;
  const lateralZ = tangentX / horizontalLength;
  let normalX = -lateralZ * tangentY;
  let normalY = lateralZ * tangentX - lateralX * tangentZ;
  let normalZ = lateralX * tangentY;
  const normalLength = Math.hypot(normalX, normalY, normalZ) || 1;
  normalX /= normalLength;
  normalY /= normalLength;
  normalZ /= normalLength;
  return {
    baseHeight: lerp(left.position[1], right.position[1], amount) + RIVER_GEOMETRY_Y_OFFSET.surface,
    normalX,
    normalY,
    normalZ,
    tangentX,
    tangentY,
    tangentZ,
    distance: networkDistanceOffset + lerp(left.distance, right.distance, amount),
    flowTravelTime: networkFlowTimeOffset + lerp(left.flowTravelTime, right.flowTravelTime, amount),
    flowSpeed: lerp(left.flowSpeed, right.flowSpeed, amount),
    depth: lerp(left.depth, right.depth, amount),
    halfWidth: lerp(left.width, right.width, amount) * 0.5
  };
}

/** Advances one shared field in physics and uploads its actual geometry once in late update. */
export class InteractivePoolSurfaceController extends Script {
  private readonly _localGradient: WaterHeightFieldCoordinate = { x: 0, z: 0 };
  private readonly _worldGradient: WaterHeightFieldCoordinate = { x: 0, z: 0 };
  private readonly _worldPosition: WaterHeightFieldCoordinate = { x: 0, z: 0 };
  private readonly _fieldSample: RectangularWaterHeightFieldSample = {
    height: 0,
    verticalVelocity: 0,
    gradientLocalX: 0,
    gradientLocalZ: 0
  };
  private _heightField: RectangularWaterHeightField | null = null;
  private _surfaceEntity: Entity | null = null;
  private _mesh: ModelMesh | null = null;
  private _material: Material | null = null;
  private _rippleMaterial: Material | null = null;
  private _surfaceOpticsBinding?: Readonly<WaterSurfaceOpticsBinding>;
  private _surfaceOpticsReadback?: Readonly<WaterSurfaceOpticsBindingReadback>;
  private _positions: Vector3[] = [];
  private _normals: Vector3[] = [];
  private _rippleColors: Color[] = [];
  private _baseHeights = new Float32Array();
  private _baseNormals = new Float32Array();
  private _renderResolutionX = 0;
  private _renderResolutionZ = 0;
  private _uploadedRevision = -1;
  private _totalMeshUploads = 0;
  private _maximumUploadsPerRenderFrame = 0;
  private _lastFrameUploadCount = 0;
  private _lastPhysicsStepSucceeded = true;
  private _highlightedVertexCount = 0;
  private _rippleHighlightPeak = 0;

  get surfaceVertexCount(): number {
    return this._positions.length;
  }

  get totalMeshUploads(): number {
    return this._totalMeshUploads;
  }

  get maximumUploadsPerRenderFrame(): number {
    return this._maximumUploadsPerRenderFrame;
  }

  get lastFrameUploadCount(): number {
    return this._lastFrameUploadCount;
  }

  get lastPhysicsStepSucceeded(): boolean {
    return this._lastPhysicsStepSucceeded;
  }

  get highlightedVertexCount(): number {
    return this._highlightedVertexCount;
  }

  get rippleHighlightPeak(): number {
    return this._rippleHighlightPeak;
  }

  get surfaceOpticsReadback(): Readonly<WaterSurfaceOpticsBindingReadback> | undefined {
    return this._surfaceOpticsReadback;
  }

  /** May be called before or after configure; subsequent materials consume the same complete snapshot. */
  setSurfaceOpticsBinding(
    binding?: Readonly<WaterSurfaceOpticsBinding>
  ): Readonly<WaterSurfaceOpticsBindingReadback> | undefined {
    this._surfaceOpticsBinding = binding;
    const material = this._material;
    if (!material) return undefined;
    this._surfaceOpticsReadback = setRiverSurfaceOpticsBinding(material, binding, { planarEligible: true });
    return this._surfaceOpticsReadback;
  }

  configureTemporalFoamRegion(region: InteractivePoolTemporalFoamRegion): void {
    if (!this._rippleMaterial) throw new Error("Interactive pool surface must be configured first.");
    configureInteractivePoolTemporalFoamRegion(this._rippleMaterial, region);
  }

  setTemporalFoamTexture(texture: Texture2D | null, enabled: boolean, debugView: PoolLocalEffectsDebugView): void {
    if (!this._rippleMaterial) return;
    setInteractivePoolTemporalFoamTexture(this._rippleMaterial, texture, enabled, debugView);
  }

  configure(options: InteractivePoolSurfaceOptions): void {
    if (this._mesh) throw new Error("InteractivePoolSurfaceController is already configured.");
    const reach = options.compiledData.reaches[0];
    const samples = reach?.artifact.samples;
    if (!reach || !samples || samples.length < 2)
      throw new Error("Interactive pool requires one compiled River reach.");
    const field = options.heightField;
    this._heightField = field;
    const renderResolutionX = (field.resolutionX - 1) * RENDER_SUBDIVISIONS_PER_FIELD_CELL + 1;
    const renderResolutionZ = (field.resolutionZ - 1) * RENDER_SUBDIVISIONS_PER_FIELD_CELL + 1;
    this._renderResolutionX = renderResolutionX;
    this._renderResolutionZ = renderResolutionZ;
    const vertexCount = renderResolutionX * renderResolutionZ;
    this._positions = Array.from({ length: vertexCount }, () => new Vector3());
    this._normals = Array.from({ length: vertexCount }, () => new Vector3(0, 1, 0));
    const tangents = Array.from({ length: vertexCount }, () => new Vector4());
    this._rippleColors = Array.from({ length: vertexCount }, () => new Color(0, 0, 0, 0));
    const uv0 = Array.from({ length: vertexCount }, () => new Vector2());
    const uv1 = Array.from({ length: vertexCount }, () => new Vector2());
    const uv2 = Array.from({ length: vertexCount }, () => new Vector2());
    const uv3 = Array.from({ length: vertexCount }, () => new Vector2());
    this._baseHeights = new Float32Array(vertexCount);
    this._baseNormals = new Float32Array(vertexCount * 3);
    let minimumX = Number.POSITIVE_INFINITY;
    let minimumY = Number.POSITIVE_INFINITY;
    let minimumZ = Number.POSITIVE_INFINITY;
    let maximumX = Number.NEGATIVE_INFINITY;
    let maximumY = Number.NEGATIVE_INFINITY;
    let maximumZ = Number.NEGATIVE_INFINITY;

    for (let x = 0; x < renderResolutionX; x++) {
      const normalizedX = x / (renderResolutionX - 1);
      const row = sampleReachRow(
        samples,
        normalizedX * reach.length,
        reach.networkDistanceOffset,
        reach.networkFlowTimeOffset
      );
      const localX = -field.length * 0.5 + normalizedX * field.length;
      for (let z = 0; z < renderResolutionZ; z++) {
        const normalizedZ = z / (renderResolutionZ - 1);
        const localZ = -field.width * 0.5 + normalizedZ * field.width;
        field.localToWorld(localX, localZ, this._worldPosition);
        const index = z * renderResolutionX + x;
        const position = this._positions[index];
        position.set(this._worldPosition.x, row.baseHeight, this._worldPosition.z);
        this._baseHeights[index] = row.baseHeight;
        const normalOffset = index * 3;
        this._baseNormals[normalOffset] = row.normalX;
        this._baseNormals[normalOffset + 1] = row.normalY;
        this._baseNormals[normalOffset + 2] = row.normalZ;
        this._normals[index].set(row.normalX, row.normalY, row.normalZ);
        tangents[index].set(row.tangentX, row.tangentY, row.tangentZ, 1);
        const signedAcrossDistance = localZ;
        const across = 0.5 - signedAcrossDistance / field.width;
        uv0[index].set(across, row.flowTravelTime * RIVER_FLOW_UV_SCALE);
        uv1[index].set(row.flowSpeed, row.distance);
        uv2[index].set(signedAcrossDistance, row.flowTravelTime);
        uv3[index].set(row.halfWidth, row.depth);
        minimumX = Math.min(minimumX, position.x);
        minimumY = Math.min(minimumY, position.y);
        minimumZ = Math.min(minimumZ, position.z);
        maximumX = Math.max(maximumX, position.x);
        maximumY = Math.max(maximumY, position.y);
        maximumZ = Math.max(maximumZ, position.z);
      }
    }

    const indices = new Uint16Array((renderResolutionX - 1) * (renderResolutionZ - 1) * 6);
    let writeIndex = 0;
    for (let z = 0; z < renderResolutionZ - 1; z++) {
      for (let x = 0; x < renderResolutionX - 1; x++) {
        const bottomLeft = z * renderResolutionX + x;
        const bottomRight = bottomLeft + 1;
        const topLeft = bottomLeft + renderResolutionX;
        const topRight = topLeft + 1;
        indices[writeIndex++] = bottomLeft;
        indices[writeIndex++] = topLeft;
        indices[writeIndex++] = bottomRight;
        indices[writeIndex++] = bottomRight;
        indices[writeIndex++] = topLeft;
        indices[writeIndex++] = topRight;
      }
    }

    const mesh = new ModelMesh(options.engine, "interactive-pool-surface-mesh");
    const verticalMargin = field.maxDisplacement + options.compiledData.surfaceMotion.maxDisplacement;
    mesh.bounds.min.set(minimumX, minimumY - verticalMargin, minimumZ);
    mesh.bounds.max.set(maximumX, maximumY + verticalMargin, maximumZ);
    mesh.setPositions(this._positions);
    mesh.setNormals(this._normals);
    mesh.setTangents(tangents);
    mesh.setColors(this._rippleColors);
    mesh.setUVs(uv0, 0);
    mesh.setUVs(uv1, 1);
    mesh.setUVs(uv2, 2);
    mesh.setUVs(uv3, 3);
    mesh.setIndices(indices);
    mesh.addSubMesh(0, indices.length, MeshTopology.Triangles);
    mesh.addSubMesh(0, indices.length, MeshTopology.Triangles);
    mesh.uploadData(false);
    mesh.isGCIgnored = true;
    this._mesh = mesh;
    this._totalMeshUploads = 1;

    const material = createRiverMaterial(options.engine, reach.config.material, 1, options.compiledData.surfaceMotion);
    setRiverSurfaceOpacityScale(material, POOL_WATER_OPACITY_SCALE);
    setRiverSurfaceTintWeight(material, POOL_WATER_TINT_WEIGHT);
    material.name = "InteractivePoolRiverSurfaceMaterial";
    material.isGCIgnored = true;
    this._material = material;
    this._surfaceOpticsReadback = setRiverSurfaceOpticsBinding(material, this._surfaceOpticsBinding, {
      planarEligible: true
    });
    const rippleMaterial = createInteractivePoolRippleMaterial(options.engine);
    this._rippleMaterial = rippleMaterial;
    const surfaceEntity = options.parent.createChild("interactive-pool-dynamic-surface");
    // The shared planar service excludes this layer from its reflection camera,
    // preventing the water surface from recursively reflecting itself.
    surfaceEntity.layer = Layer.Layer30;
    const renderer = surfaceEntity.addComponent(MeshRenderer);
    renderer.enableVertexColor = true;
    renderer.mesh = mesh;
    renderer.setMaterial(0, material);
    renderer.setMaterial(1, rippleMaterial);
    this._surfaceEntity = surfaceEntity;
    this._uploadedRevision = field.revision;
  }

  onPhysicsUpdate(): void {
    const field = this._heightField;
    if (!field) return;
    this._lastPhysicsStepSucceeded = field.step(this.scene.physics.fixedTimeStep);
  }

  onLateUpdate(): void {
    this._lastFrameUploadCount = 0;
    const field = this._heightField;
    const mesh = this._mesh;
    if (!field || !mesh || field.revision === this._uploadedRevision) return;
    let highlightedVertexCount = 0;
    let rippleHighlightPeak = 0;
    const renderResolutionX = this._renderResolutionX;
    const renderResolutionZ = this._renderResolutionZ;
    for (let z = 0; z < renderResolutionZ; z++) {
      const localZ = -field.width * 0.5 + (z / (renderResolutionZ - 1)) * field.width;
      for (let x = 0; x < renderResolutionX; x++) {
        const localX = -field.length * 0.5 + (x / (renderResolutionX - 1)) * field.length;
        if (!field.sampleLocal(localX, localZ, this._fieldSample)) continue;
        const index = z * renderResolutionX + x;
        const height = this._fieldSample.height;
        this._positions[index].y = this._baseHeights[index] + height;
        this._localGradient.x = this._fieldSample.gradientLocalX;
        this._localGradient.z = this._fieldSample.gradientLocalZ;
        field.localGradientToWorld(this._localGradient.x, this._localGradient.z, this._worldGradient);
        const normalOffset = index * 3;
        const normal = this._normals[index];
        normal.set(
          this._baseNormals[normalOffset] - this._worldGradient.x,
          this._baseNormals[normalOffset + 1],
          this._baseNormals[normalOffset + 2] - this._worldGradient.z
        );
        const normalLength = normal.length();
        if (!Number.isFinite(normalLength) || normalLength <= Number.EPSILON) normal.set(0, 1, 0);
        else Vector3.scale(normal, 1 / normalLength, normal);

        const slope = Math.hypot(this._localGradient.x, this._localGradient.z);
        const velocity = this._fieldSample.verticalVelocity;
        const visibility = computeInteractivePoolRippleVisibility(height, slope, velocity);
        const signedHeight = Math.max(-1, Math.min(1, height / 0.045));
        const colorStart = signedHeight < 0 ? RIPPLE_TROUGH_COLOR : RIPPLE_NEUTRAL_COLOR;
        const colorEnd = signedHeight < 0 ? RIPPLE_NEUTRAL_COLOR : RIPPLE_CREST_COLOR;
        const colorAmount = signedHeight < 0 ? signedHeight + 1 : signedHeight;
        this._rippleColors[index].set(
          lerp(colorStart[0], colorEnd[0], colorAmount),
          lerp(colorStart[1], colorEnd[1], colorAmount),
          lerp(colorStart[2], colorEnd[2], colorAmount),
          visibility
        );
        if (visibility >= RIPPLE_HIGHLIGHT_THRESHOLD) highlightedVertexCount++;
        rippleHighlightPeak = Math.max(rippleHighlightPeak, visibility);
      }
    }
    mesh.setPositions(this._positions);
    mesh.setNormals(this._normals);
    mesh.setColors(this._rippleColors);
    mesh.uploadData(false);
    this._uploadedRevision = field.revision;
    this._lastFrameUploadCount = 1;
    this._totalMeshUploads++;
    this._maximumUploadsPerRenderFrame = Math.max(this._maximumUploadsPerRenderFrame, 1);
    this._highlightedVertexCount = highlightedVertexCount;
    this._rippleHighlightPeak = rippleHighlightPeak;
  }

  dispose(): void {
    if (this._material) setRiverSurfaceOpticsBinding(this._material);
    this._surfaceEntity?.destroy();
    this._mesh?.destroy(true);
    this._material?.destroy(true);
    this._rippleMaterial?.destroy(true);
    this._surfaceEntity = null;
    this._mesh = null;
    this._material = null;
    this._rippleMaterial = null;
    this._surfaceOpticsBinding = undefined;
    this._surfaceOpticsReadback = undefined;
    this._heightField = null;
    this._positions = [];
    this._normals = [];
    this._rippleColors = [];
    this._baseHeights = new Float32Array();
    this._baseNormals = new Float32Array();
    this._renderResolutionX = 0;
    this._renderResolutionZ = 0;
  }
}
