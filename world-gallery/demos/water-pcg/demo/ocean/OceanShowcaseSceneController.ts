import {
  Engine,
  Entity,
  MeshRenderer,
  MeshTopology,
  ModelMesh,
  PBRMaterial,
  PrimitiveMesh,
  RenderFace
} from "@galacean/engine-core";
import {
  Color,
  Vector2,
  Vector3,
  Vector4
} from "@galacean/engine-math";
import type { OceanNearshoreFieldResource } from "../../runtime/ocean/OceanNearshoreFieldResource";
import type { OceanNearshoreStateField } from "../../runtime/ocean/OceanNearshoreStateField";
import type { OceanWaterSurfaceProvider } from "../../runtime/ocean/OceanWaterSurfaceProvider";
import {
  WaterFoamBlendMode,
  WaterFoamSourceKind,
  type WaterFoamBoundedSource
} from "../../runtime/interaction/WaterFoamTypes";
import { createWaterSurfaceSample } from "../../runtime/query/WaterSurfaceProvider";
import { OceanBeachTerrainBuilder } from "./OceanBeachTerrainBuilder";
import { OceanWetSandTextureService } from "./OceanWetSandTextureService";
import {
  OceanPbrTextureLibrary,
  type OceanPbrMaterialBindingOptions,
  type OceanPbrSurfaceKind
} from "./OceanPbrTextureLibrary";
import type { OceanCoastalRockAsset } from "./OceanCoastalRockAsset";
import { resolveOceanCoastalRockGroundedY } from "./OceanCoastalRockPlacement";

type Vector3Tuple = readonly [number, number, number];
type ColorTuple = readonly [number, number, number, number];

export type OceanShowcaseSceneMode = "hero" | "gerstner" | "lod-debug";

export interface OceanShowcaseSceneMetrics {
  readonly mode: OceanShowcaseSceneMode;
  readonly fixtureObjectCount: number;
  readonly reflectionAnchorCount: number;
  /** Legacy counters remain zero after the island/cloud fixture was removed. */
  readonly islandCount: number;
  readonly cloudCount: number;
  readonly heroRockCount: number;
  readonly photogrammetryRockLoaded: boolean;
  readonly photogrammetryRockInstanceCount: number;
  readonly photogrammetryRockPbrMaterialCount: number;
  readonly photogrammetryRockSourceBytes: number;
  readonly distantFixtureCount: number;
  readonly pbrMaterialCount: number;
  readonly nonPbrMaterialCount: 0;
  readonly boatVisible: boolean;
  readonly boatQueryHit: boolean;
  readonly boatSampleFinite: boolean;
  readonly boatX: number;
  readonly boatY: number;
  readonly boatZ: number;
  readonly wakeRibbonCount: number;
  readonly wakeEnergy: number;
  readonly wakeSourceAcceptedCount: number;
  readonly wakeSourceDroppedCount: number;
  readonly wakeFoamSamplePeak: number;
  readonly wakeFoamSampleMean: number;
  readonly bathymetryTerrainVisible: boolean;
  readonly bathymetryTerrainSourceHash?: string;
  readonly bathymetryTerrainVertexCount: number;
  readonly wetSandEnabled: boolean;
  readonly wetSandTextureCount: number;
  readonly wetSandTextureCreateCount: number;
  readonly wetSandTextureDestroyCount: number;
  readonly wetSandUploadRateHz: number;
  readonly wetSandBaseColorUploadCount: number;
  readonly wetSandRoughnessUploadCount: number;
  readonly wetSandResourceBytes: number;
  readonly pbrTextureCount: number;
  readonly pbrTextureResourceBytes: number;
  readonly completePbrTextureSetCount: number;
}

interface OceanShowcaseLayout {
  readonly heroRockCenters: readonly Vector3Tuple[];
  readonly boatPathCenter: Vector3Tuple;
  readonly boatPathRadius: Vector3Tuple;
}

export interface OceanShowcaseWakeSink {
  readonly bodyId: string;
  enqueue(source: Readonly<WaterFoamBoundedSource>): boolean;
  sample(worldX: number, worldZ: number): number;
}

export const OCEAN_SHOWCASE_LAYOUT: Readonly<OceanShowcaseLayout> = Object.freeze({
  heroRockCenters: Object.freeze([
    Object.freeze([-25, 0, -13] as const),
    Object.freeze([16, 0, -17] as const),
    Object.freeze([29, 0, -4] as const)
  ]),
  boatPathCenter: Object.freeze([-27, 0, -43] as const),
  boatPathRadius: Object.freeze([8, 0, 5] as const)
});

const RAD_TO_DEG = 180 / Math.PI;
const BOAT_SURFACE_OFFSET = 0.36;
const BOAT_PATH_RATE = 0.16;
const WAKE_EMISSION_INTERVAL_SECONDS = 0.3;
const WAKE_TRAIL_SAMPLE_COUNT = 17;
const WAKE_STERN_OFFSET = 1.65;
const GRANITE_TEXTURE_BINDING = Object.freeze({
  tiling: Object.freeze([2.8, 1.9] as const),
  normalIntensity: 0.76,
  occlusionIntensity: 0.64
} satisfies OceanPbrMaterialBindingOptions);
const DISTANT_GRANITE_TEXTURE_BINDING = Object.freeze({
  tiling: Object.freeze([5.2, 2.6] as const),
  normalIntensity: 0.92,
  occlusionIntensity: 0.74
} satisfies OceanPbrMaterialBindingOptions);
const SAND_TEXTURE_BINDING = Object.freeze({
  tiling: Object.freeze([16, 7] as const),
  normalIntensity: 0.18,
  occlusionIntensity: 0.24
} satisfies OceanPbrMaterialBindingOptions);
const TERRAIN_SAND_TEXTURE_BINDING = Object.freeze({
  // The compiled field spans 320 x 160 metres. A roughly 1.45-metre tile
  // preserves photographed ripple scale without turning it into deep grooves.
  tiling: Object.freeze([220, 110] as const),
  normalIntensity: 0.08,
  occlusionIntensity: 0.16
} satisfies OceanPbrMaterialBindingOptions);
const NEUTRAL_TEXTURE_BINDING = Object.freeze({
  tiling: Object.freeze([2.5, 3.5] as const),
  normalIntensity: 0.42,
  occlusionIntensity: 0.5
} satisfies OceanPbrMaterialBindingOptions);

export interface OceanShowcaseRockGeometry {
  readonly positions: Vector3[];
  readonly normals: Vector3[];
  readonly tangents: Vector4[];
  readonly uvs: Vector2[];
  readonly indices: Uint16Array;
  readonly bounds: {
    readonly minimum: Vector3;
    readonly maximum: Vector3;
  };
}

export interface OceanShowcaseCliffGeometry {
  readonly positions: Vector3[];
  readonly normals: Vector3[];
  readonly tangents: Vector4[];
  readonly uvs: Vector2[];
  readonly indices: Uint16Array;
  readonly bounds: {
    readonly minimum: Vector3;
    readonly maximum: Vector3;
  };
}

/**
 * Builds a compact deterministic rock instead of stretching a perfect sphere.
 * Geometry is authored once, uploaded once, and then transformed per fixture.
 */
export function buildOceanShowcaseRockGeometry(
  seed: number,
  latitudeSegments = 24,
  longitudeSegments = 36,
  irregularity = 1
): OceanShowcaseRockGeometry {
  if (
    !Number.isSafeInteger(seed) ||
    !Number.isSafeInteger(latitudeSegments) ||
    latitudeSegments < 4 ||
    !Number.isSafeInteger(longitudeSegments) ||
    longitudeSegments < 6 ||
    !Number.isFinite(irregularity) ||
    irregularity <= 0 ||
    irregularity > 2.5
  ) {
    throw new Error("Ocean showcase rock geometry parameters are invalid.");
  }
  const vertexSide = longitudeSegments + 1;
  const positions: Vector3[] = [];
  const uvs: Vector2[] = [];
  const phase = (seed % 997) * 0.017;
  const minimum = new Vector3(
    Number.POSITIVE_INFINITY,
    Number.POSITIVE_INFINITY,
    Number.POSITIVE_INFINITY
  );
  const maximum = new Vector3(
    Number.NEGATIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
    Number.NEGATIVE_INFINITY
  );
  for (let latitude = 0; latitude <= latitudeSegments; latitude++) {
    const theta = (latitude / latitudeSegments) * Math.PI;
    const vertical = Math.cos(theta);
    const horizontal = Math.pow(
      Math.max(0, Math.sin(theta)),
      0.54
    );
    for (
      let longitude = 0;
      longitude <= longitudeSegments;
      longitude++
    ) {
      const phi =
        (longitude / longitudeSegments) * Math.PI * 2;
      const radialScale =
        1 +
        Math.sin(phi * 3 + phase) * 0.14 * irregularity +
        Math.sin(phi * 7 + theta * 2 + phase * 0.7) *
          0.075 *
          irregularity +
        Math.cos(theta * 4 + phase) * 0.055 * irregularity +
        Math.sin(phi * 11 - theta * 5 + phase * 1.31) *
          0.035 *
          irregularity +
        Math.cos(phi * 5 + theta * 7 - phase * 0.43) *
          0.025 *
          irregularity;
      const horizontalAsymmetry =
        1 +
        Math.sin(theta * 3 + phase * 0.7) * 0.11 +
        Math.cos(phi + phase) * vertical * 0.09;
      const verticalCenterShift =
        Math.sin(theta * 1.7 + phase) * 0.055;
      const x =
        Math.cos(phi) *
          horizontal *
          radialScale *
          horizontalAsymmetry +
        vertical * 0.1 +
        verticalCenterShift;
      const z =
        Math.sin(phi) *
        horizontal *
        (radialScale * 0.94 +
          Math.sin(phi * 2 + phase) * 0.035) *
        (1 - Math.cos(theta * 2 + phase) * 0.035);
      const unflattenedY =
        Math.sign(vertical) *
          Math.pow(Math.abs(vertical), 0.72) +
        Math.sin(phi * 2 + phase) *
          horizontal *
          0.075 *
          irregularity +
        Math.sin(phi * 5 - theta * 2 + phase * 0.3) *
          horizontal *
          Math.max(0, irregularity - 1) *
          0.09;
      const y =
        unflattenedY < -0.68
          ? -0.68 + (unflattenedY + 0.68) * 0.22
          : unflattenedY > 0.78
            ? 0.78 + (unflattenedY - 0.78) * 0.6
            : unflattenedY;
      const position = new Vector3(x, y, z);
      positions.push(position);
      uvs.push(
        new Vector2(
          longitude / longitudeSegments,
          latitude / latitudeSegments
        )
      );
      minimum.x = Math.min(minimum.x, x);
      minimum.y = Math.min(minimum.y, y);
      minimum.z = Math.min(minimum.z, z);
      maximum.x = Math.max(maximum.x, x);
      maximum.y = Math.max(maximum.y, y);
      maximum.z = Math.max(maximum.z, z);
    }
  }

  const indexValues: number[] = [];
  for (let latitude = 0; latitude < latitudeSegments; latitude++) {
    for (
      let longitude = 0;
      longitude < longitudeSegments;
      longitude++
    ) {
      const current =
        latitude * vertexSide + longitude;
      const next = current + vertexSide;
      indexValues.push(
        current,
        current + 1,
        next,
        next,
        current + 1,
        next + 1
      );
    }
  }
  const indices = new Uint16Array(indexValues);
  const normalValues = new Float64Array(positions.length * 3);
  for (let index = 0; index < indices.length; index += 3) {
    const indexA = indices[index];
    const indexB = indices[index + 1];
    const indexC = indices[index + 2];
    const a = positions[indexA];
    const b = positions[indexB];
    const c = positions[indexC];
    const edgeABX = b.x - a.x;
    const edgeABY = b.y - a.y;
    const edgeABZ = b.z - a.z;
    const edgeACX = c.x - a.x;
    const edgeACY = c.y - a.y;
    const edgeACZ = c.z - a.z;
    const normalX = edgeABY * edgeACZ - edgeABZ * edgeACY;
    const normalY = edgeABZ * edgeACX - edgeABX * edgeACZ;
    const normalZ = edgeABX * edgeACY - edgeABY * edgeACX;
    for (const vertexIndex of [indexA, indexB, indexC]) {
      const offset = vertexIndex * 3;
      normalValues[offset] += normalX;
      normalValues[offset + 1] += normalY;
      normalValues[offset + 2] += normalZ;
    }
  }
  const normals = positions.map((position, vertexIndex) => {
    const offset = vertexIndex * 3;
    const x = normalValues[offset];
    const y = normalValues[offset + 1];
    const z = normalValues[offset + 2];
    const length = Math.hypot(x, y, z);
    if (length > 1e-8) {
      return new Vector3(x / length, y / length, z / length);
    }
    return position.lengthSquared() > 1e-8
      ? position.clone().normalize()
      : new Vector3(0, 1, 0);
  });
  for (let latitude = 0; latitude <= latitudeSegments; latitude++) {
    const firstIndex = latitude * vertexSide;
    const lastIndex = firstIndex + longitudeSegments;
    const first = normals[firstIndex];
    const last = normals[lastIndex];
    const seam = new Vector3(
      first.x + last.x,
      first.y + last.y,
      first.z + last.z
    );
    if (seam.lengthSquared() > 1e-8) seam.normalize();
    else seam.copyFrom(first);
    normals[firstIndex] = seam;
    normals[lastIndex] = seam.clone();
  }
  const tangents = normals.map((normal, index) => {
    const longitude = index % vertexSide;
    const phi =
      (longitude / longitudeSegments) * Math.PI * 2;
    let x = -Math.sin(phi);
    let y = 0;
    let z = Math.cos(phi);
    const normalProjection =
      x * normal.x + y * normal.y + z * normal.z;
    x -= normal.x * normalProjection;
    y -= normal.y * normalProjection;
    z -= normal.z * normalProjection;
    const length = Math.hypot(x, y, z);
    if (length > 1e-8) {
      x /= length;
      y /= length;
      z /= length;
    } else {
      x = 1;
      y = 0;
      z = 0;
    }
    return new Vector4(x, y, z, 1);
  });
  return {
    positions,
    normals,
    tangents,
    uvs,
    indices,
    bounds: { minimum, maximum }
  };
}

/**
 * Builds a low distant coastal ridge rather than stretching a sphere. The
 * boundary sinks below sea level, while two asymmetric peaks and several
 * deterministic frequencies keep the skyline from reading as a dome.
 */
export function buildOceanShowcaseCliffGeometry(
  seed: number,
  widthSegments = 30,
  depthSegments = 12
): OceanShowcaseCliffGeometry {
  if (
    !Number.isSafeInteger(seed) ||
    !Number.isSafeInteger(widthSegments) ||
    widthSegments < 8 ||
    !Number.isSafeInteger(depthSegments) ||
    depthSegments < 4
  ) {
    throw new Error("Ocean showcase cliff geometry parameters are invalid.");
  }
  const vertexWidth = widthSegments + 1;
  const phase = (seed % 1543) * 0.013;
  const positions: Vector3[] = [];
  const uvs: Vector2[] = [];
  const minimum = new Vector3(
    Number.POSITIVE_INFINITY,
    Number.POSITIVE_INFINITY,
    Number.POSITIVE_INFINITY
  );
  const maximum = new Vector3(
    Number.NEGATIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
    Number.NEGATIVE_INFINITY
  );
  for (let z = 0; z <= depthSegments; z++) {
    const normalizedZ = (z / depthSegments) * 2 - 1;
    const depthEnvelope = Math.pow(
      Math.max(0, 1 - Math.abs(normalizedZ)),
      0.7
    );
    for (let x = 0; x <= widthSegments; x++) {
      const normalizedX = (x / widthSegments) * 2 - 1;
      const widthEnvelope = Math.pow(
        Math.max(0, 1 - Math.abs(normalizedX)),
        0.58
      );
      const peakA =
        Math.exp(
          -Math.pow((normalizedX + 0.34) / 0.25, 2)
        ) * 0.28;
      const peakB =
        Math.exp(
          -Math.pow((normalizedX - 0.37) / 0.34, 2)
        ) * 0.2;
      const erosion =
        Math.sin(normalizedX * 11 + normalizedZ * 4 + phase) *
          0.095 +
        Math.sin(normalizedX * 23 - normalizedZ * 9 + phase * 0.7) *
          0.045 +
        Math.cos(normalizedX * 5 + normalizedZ * 13 - phase * 0.4) *
          0.035;
      const height =
        -0.62 +
        widthEnvelope *
          depthEnvelope *
          (1.12 + peakA + peakB + erosion);
      const position = new Vector3(
        normalizedX,
        height,
        normalizedZ
      );
      positions.push(position);
      uvs.push(
        new Vector2(
          x / widthSegments,
          z / depthSegments
        )
      );
      minimum.x = Math.min(minimum.x, position.x);
      minimum.y = Math.min(minimum.y, position.y);
      minimum.z = Math.min(minimum.z, position.z);
      maximum.x = Math.max(maximum.x, position.x);
      maximum.y = Math.max(maximum.y, position.y);
      maximum.z = Math.max(maximum.z, position.z);
    }
  }
  const indexValues: number[] = [];
  for (let z = 0; z < depthSegments; z++) {
    for (let x = 0; x < widthSegments; x++) {
      const current = z * vertexWidth + x;
      const next = current + vertexWidth;
      indexValues.push(
        current,
        next,
        current + 1,
        current + 1,
        next,
        next + 1
      );
    }
  }
  const indices = new Uint16Array(indexValues);
  const normalValues = new Float64Array(positions.length * 3);
  for (let index = 0; index < indices.length; index += 3) {
    const indexA = indices[index];
    const indexB = indices[index + 1];
    const indexC = indices[index + 2];
    const a = positions[indexA];
    const b = positions[indexB];
    const c = positions[indexC];
    const abX = b.x - a.x;
    const abY = b.y - a.y;
    const abZ = b.z - a.z;
    const acX = c.x - a.x;
    const acY = c.y - a.y;
    const acZ = c.z - a.z;
    const normalX = abY * acZ - abZ * acY;
    const normalY = abZ * acX - abX * acZ;
    const normalZ = abX * acY - abY * acX;
    for (const vertexIndex of [indexA, indexB, indexC]) {
      const offset = vertexIndex * 3;
      normalValues[offset] += normalX;
      normalValues[offset + 1] += normalY;
      normalValues[offset + 2] += normalZ;
    }
  }
  const normals = positions.map((_position, vertexIndex) => {
    const offset = vertexIndex * 3;
    const x = normalValues[offset];
    const y = normalValues[offset + 1];
    const z = normalValues[offset + 2];
    const length = Math.hypot(x, y, z);
    return length > 1e-8
      ? new Vector3(x / length, y / length, z / length)
      : new Vector3(0, 1, 0);
  });
  const tangents = normals.map((normal) => {
    const projection = normal.x;
    const x = 1 - normal.x * projection;
    const y = -normal.y * projection;
    const z = -normal.z * projection;
    const length = Math.hypot(x, y, z);
    return length > 1e-8
      ? new Vector4(x / length, y / length, z / length, 1)
      : new Vector4(0, 0, 1, 1);
  });
  return {
    positions,
    normals,
    tangents,
    uvs,
    indices,
    bounds: { minimum, maximum }
  };
}

/**
 * Deterministic, demo-owned environment for making Planar reflection legible.
 *
 * The controller does not modify Ocean authoring/runtime data. The boat samples
 * the same OceanWaterSurfaceProvider used by gameplay queries and the wake is
 * excluded from the Planar pass with the same water layer as the ring mesh.
 */
export class OceanShowcaseSceneController {
  readonly root: Entity;

  private readonly _environmentRoot: Entity;
  private readonly _boatRoot: Entity;
  private readonly _wakeRoot: Entity;
  private readonly _queryPosition = new Vector3();
  private readonly _surfaceSample = createWaterSurfaceSample();
  private readonly _meshes: ModelMesh[] = [];
  private readonly _materials: PBRMaterial[] = [];
  private _mode: OceanShowcaseSceneMode;
  private _fixtureObjectCount = 0;
  private _boatQueryHit = false;
  private _boatSampleFinite = true;
  private _wakeEnergy = 0;
  private _wakeSourceAcceptedCount = 0;
  private _wakeSourceDroppedCount = 0;
  private _wakeFoamSamplePeak = 0;
  private _wakeFoamSampleMean = 0;
  private _lastWakeSampleTime: number | undefined;
  private _boatX = 0;
  private _boatY = 0;
  private _boatZ = 0;
  private readonly _terrain?: OceanBeachTerrainBuilder;
  private readonly _wetSand?: OceanWetSandTextureService;

  private readonly _unitCube: ModelMesh;
  private readonly _unitSphere: ModelMesh;
  private readonly _unitCylinder: ModelMesh;
  private readonly _unitCone: ModelMesh;

  constructor(
    private readonly _engine: Engine,
    parent: Entity,
    private readonly _surfaceProvider: OceanWaterSurfaceProvider,
    mode: OceanShowcaseSceneMode,
    private readonly _nearshoreResource?: OceanNearshoreFieldResource,
    nearshoreState?: OceanNearshoreStateField,
    private readonly _textureLibrary?: OceanPbrTextureLibrary,
    private readonly _coastalRockAsset?: OceanCoastalRockAsset,
    private readonly _wakeSink?: OceanShowcaseWakeSink
  ) {
    this.root = parent.createChild("ocean-showcase-scene");
    this._environmentRoot = this.root.createChild("ocean-showcase-environment");
    this._boatRoot = this.root.createChild("ocean-showcase-boat");
    this._wakeRoot = this._boatRoot.createChild("ocean-showcase-wake");
    this._mode = mode;

    this._unitCube = this._trackMesh(PrimitiveMesh.createCuboid(this._engine, 1, 1, 1));
    this._unitSphere = this._trackMesh(PrimitiveMesh.createSphere(this._engine, 1, 18));
    this._unitCylinder = this._trackMesh(PrimitiveMesh.createCylinder(this._engine, 0.5, 0.5, 1, 16, 1));
    this._unitCone = this._trackMesh(PrimitiveMesh.createCone(this._engine, 0.5, 1, 16, 1));

    this._terrain = this._nearshoreResource
      ? new OceanBeachTerrainBuilder(
          this._engine,
          this._environmentRoot,
          this._nearshoreResource
        )
      : undefined;
    if (this._terrain && this._textureLibrary) {
      this._terrain.material.baseColor = new Color(
        0.98,
        0.92,
        0.84,
        1
      );
      this._terrain.material.roughness = 1;
      this._terrain.material.specularIntensity = 0.22;
      this._terrain.material.ior = 1.35;
      this._textureLibrary.apply(
        this._terrain.material,
        "sand",
        TERRAIN_SAND_TEXTURE_BINDING
      );
    }
    this._wetSand =
      this._terrain && nearshoreState
        ? new OceanWetSandTextureService(
            this._engine,
            this._terrain.wetFilmMaterial,
            nearshoreState,
            this._textureLibrary
              ? {
                  detailSource:
                    this._textureLibrary.wetSandSource
                }
              : {}
          )
        : undefined;
    this._wetSand?.updateFrame(this._engine.time.frameCount, 0);
    this._createEnvironment();
    this._createBoat();
    this.setMode(mode);
  }

  get metrics(): Readonly<OceanShowcaseSceneMetrics> {
    const environmentVisible = this._environmentRoot.isActive;
    return Object.freeze({
      mode: this._mode,
      fixtureObjectCount: environmentVisible ? this._fixtureObjectCount : 0,
      reflectionAnchorCount:
        environmentVisible
          ? OCEAN_SHOWCASE_LAYOUT.heroRockCenters.length
          : 0,
      islandCount: 0,
      cloudCount: 0,
      heroRockCount:
        environmentVisible
          ? OCEAN_SHOWCASE_LAYOUT.heroRockCenters.length
          : 0,
      photogrammetryRockLoaded:
        environmentVisible &&
        (this._coastalRockAsset?.metrics.loaded ?? false),
      photogrammetryRockInstanceCount:
        environmentVisible
          ? (this._coastalRockAsset?.metrics.instanceCount ?? 0)
          : 0,
      photogrammetryRockPbrMaterialCount:
        environmentVisible
          ? (this._coastalRockAsset?.metrics
              .completePbrMaterialCount ?? 0)
          : 0,
      photogrammetryRockSourceBytes:
        this._coastalRockAsset?.metrics.sourceBytes ?? 0,
      distantFixtureCount: 0,
      pbrMaterialCount:
        environmentVisible
          ? this._materials.length + (this._terrain ? 2 : 0)
          : 0,
      nonPbrMaterialCount: 0,
      boatVisible: this._boatRoot.isActive,
      boatQueryHit: this._boatQueryHit,
      boatSampleFinite: this._boatSampleFinite,
      boatX: this._boatX,
      boatY: this._boatY,
      boatZ: this._boatZ,
      wakeRibbonCount: this._wakeRoot.isActive ? this._wakeRoot.children.length : 0,
      wakeEnergy: this._wakeEnergy,
      wakeSourceAcceptedCount:
        this._wakeSourceAcceptedCount,
      wakeSourceDroppedCount:
        this._wakeSourceDroppedCount,
      wakeFoamSamplePeak: this._wakeFoamSamplePeak,
      wakeFoamSampleMean: this._wakeFoamSampleMean,
      bathymetryTerrainVisible:
        environmentVisible && (this._terrain?.root.isActive ?? false),
      bathymetryTerrainSourceHash: this._terrain?.metrics.sourceHash,
      bathymetryTerrainVertexCount: this._terrain?.metrics.vertexCount ?? 0,
      wetSandEnabled:
        environmentVisible && (this._wetSand?.metrics.enabled ?? false),
      wetSandTextureCount: this._wetSand?.metrics.textureCount ?? 0,
      wetSandTextureCreateCount:
        this._wetSand?.metrics.textureCreateCount ?? 0,
      wetSandTextureDestroyCount:
        this._wetSand?.metrics.textureDestroyCount ?? 0,
      wetSandUploadRateHz: this._wetSand?.metrics.uploadRateHz ?? 0,
      wetSandBaseColorUploadCount:
        this._wetSand?.metrics.baseColorUploadCount ?? 0,
      wetSandRoughnessUploadCount:
        this._wetSand?.metrics.roughnessMetallicUploadCount ?? 0,
      wetSandResourceBytes: this._wetSand?.metrics.resourceBytes ?? 0,
      pbrTextureCount:
        this._textureLibrary?.metrics.textureCount ?? 0,
      pbrTextureResourceBytes:
        this._textureLibrary?.metrics.resourceBytes ?? 0,
      completePbrTextureSetCount: this._textureLibrary
        ? [
            this._textureLibrary.metrics
              .sandTextureSetComplete,
            this._textureLibrary.metrics
              .graniteTextureSetComplete,
            this._textureLibrary.metrics
              .neutralTextureSetComplete
          ].filter(Boolean).length
        : 0
    });
  }

  setMode(mode: OceanShowcaseSceneMode): void {
    this._mode = mode;
    const heroEnvironment = mode !== "gerstner";
    this._environmentRoot.isActive = heroEnvironment;
    // Keep one provider-driven scale reference in the isolated Gerstner case.
    // The scenery and Wake remain disabled, so the route still proves the
    // macro surface rather than the authored beach composition.
    this._boatRoot.isActive = true;
    this._wakeRoot.isActive = heroEnvironment;
    this._terrain?.setVisible(heroEnvironment);
    if (!heroEnvironment) {
      this._wakeEnergy = 0;
      this._wakeFoamSamplePeak = 0;
      this._wakeFoamSampleMean = 0;
    }
  }

  /** Provider-driven visual buoyancy with no duplicated wave equation. */
  update(elapsedTime: number, deltaTime = 0): void {
    if (this._environmentRoot.isActive) {
      this._wetSand?.updateFrame(
        this._engine.time.frameCount,
        Math.max(0, deltaTime)
      );
    }
    if (!this._boatRoot.isActive) return;
    const layout = OCEAN_SHOWCASE_LAYOUT;
    const phase = Math.max(0, elapsedTime) * BOAT_PATH_RATE;
    const x = layout.boatPathCenter[0] + Math.sin(phase) * layout.boatPathRadius[0];
    const z = layout.boatPathCenter[2] + Math.cos(phase) * layout.boatPathRadius[2];
    const velocityX = Math.cos(phase) * layout.boatPathRadius[0] * BOAT_PATH_RATE;
    const velocityZ = -Math.sin(phase) * layout.boatPathRadius[2] * BOAT_PATH_RATE;
    this._queryPosition.set(x, 0, z);
    this._boatQueryHit = this._surfaceProvider.sampleSurface(this._queryPosition, this._surfaceSample);

    const sample = this._surfaceSample;
    const y = this._boatQueryHit ? sample.surfacePosition.y + BOAT_SURFACE_OFFSET : BOAT_SURFACE_OFFSET;
    const normal = sample.surfaceNormal;
    const yaw = Math.atan2(velocityX, velocityZ) * RAD_TO_DEG;
    const pitch = this._boatQueryHit ? Math.atan2(-normal.z, Math.max(0.001, normal.y)) * RAD_TO_DEG : 0;
    const roll = this._boatQueryHit ? Math.atan2(normal.x, Math.max(0.001, normal.y)) * RAD_TO_DEG : 0;
    this._boatRoot.transform.setPosition(x, y, z);
    this._boatRoot.transform.setRotation(pitch, yaw, roll);

    this._boatX = x;
    this._boatY = y;
    this._boatZ = z;
    this._boatSampleFinite =
      Number.isFinite(x) &&
      Number.isFinite(y) &&
      Number.isFinite(z) &&
      Number.isFinite(normal.x) &&
      Number.isFinite(normal.y) &&
      Number.isFinite(normal.z);
    const speed = Math.hypot(velocityX, velocityZ);
    this._wakeEnergy = this._boatQueryHit ? Math.min(1, 0.28 + speed * 0.32) : 0;
    this._updateWakeSources(
      Math.max(0, elapsedTime),
      this._boatQueryHit
    );
    this._measureWakeFoam(Math.max(0, elapsedTime));
    const pulse = 0.94 + Math.sin(phase * 5) * 0.06;
    this._wakeRoot.transform.setScale(1, pulse, 0.82 + this._wakeEnergy * 0.3);
  }

  destroy(): void {
    this._wetSand?.destroy();
    this._terrain?.destroy();
    this.root.destroy();
    for (const mesh of this._meshes) mesh.destroy(true);
    for (const material of this._materials) material.destroy(true);
    this._meshes.length = 0;
    this._materials.length = 0;
  }

  setWetSandEnabled(enabled: boolean): void {
    this._wetSand?.setEnabled(enabled);
  }

  resetWetSand(): void {
    this._wetSand?.reset();
  }

  resetWakeEmitter(): void {
    this._lastWakeSampleTime = undefined;
    this._wakeSourceAcceptedCount = 0;
    this._wakeSourceDroppedCount = 0;
    this._wakeFoamSamplePeak = 0;
    this._wakeFoamSampleMean = 0;
  }

  private _createEnvironment(): void {
    const wetRock = this._createMaterial(
      "OceanShowcaseWetGranite",
      [0.92, 0.94, 0.96, 1],
      0.46,
      0,
      "granite",
      GRANITE_TEXTURE_BINDING
    );
    const dryRock = this._createMaterial(
      "OceanShowcaseDryGranite",
      [1, 0.98, 0.94, 1],
      0.68,
      0,
      "granite",
      GRANITE_TEXTURE_BINDING
    );
    const duneSand = this._createMaterial(
      "OceanShowcaseDuneSand",
      [0.82, 0.77, 0.68, 1],
      0.88,
      0,
      "sand",
      SAND_TEXTURE_BINDING
    );
    const heroRockScales: readonly Vector3Tuple[] = [
      [38, 15, 16],
      [34, 17, 15],
      [24, 10, 10.5]
    ];
    const heroRockRotations: readonly Vector3Tuple[] = [
      [5, -24, -5],
      [7, 51, -4],
      [9, -62, 6]
    ];
    const fallbackHeroRockScales: readonly Vector3Tuple[] = [
      [4.2, 3.15, 3.4],
      [3.35, 3.45, 3.1],
      [2.25, 2.05, 1.9]
    ];
    const heroRockMeshes = this._coastalRockAsset
      ? []
      : OCEAN_SHOWCASE_LAYOUT.heroRockCenters.map(
          (_center, index) =>
            this._createRockMesh(
              `OceanShowcaseHeroRock${index}`,
              73129 + index * 7919,
              20,
              30,
              1.65
            )
        );
    for (
      let index = 0;
      index < OCEAN_SHOWCASE_LAYOUT.heroRockCenters.length;
      index++
    ) {
      const [x, , z] = OCEAN_SHOWCASE_LAYOUT.heroRockCenters[index];
      const bedHeight = this._sampleBedHeight(x, z);
      if (this._coastalRockAsset) {
        const scale = heroRockScales[index];
        this._coastalRockAsset.instantiate(
          this._environmentRoot,
          `hero-rock-${index}`,
          [
            x,
            resolveOceanCoastalRockGroundedY(
              bedHeight,
              scale[1]
            ),
            z
          ],
          scale,
          heroRockRotations[index]
        );
        this._fixtureObjectCount++;
      } else {
        const scale = fallbackHeroRockScales[index];
        this._createPrimitive(
          `hero-rock-${index}`,
          heroRockMeshes[index],
          index === 1 ? wetRock : dryRock,
          [x, bedHeight + scale[1] * 0.48, z],
          scale,
          this._environmentRoot,
          [
            7 + index * 5,
            -19 + index * 27,
            4 - index * 3
          ]
        );
      }
    }

    const duneFixtures: readonly {
      readonly position: Vector3Tuple;
      readonly scale: Vector3Tuple;
      readonly rotation: Vector3Tuple;
    }[] = [
      {
        position: [-66, 3.1, 29],
        scale: [25, 5.2, 9],
        rotation: [0, -8, 0]
      },
      {
        position: [0, 2.1, 43],
        scale: [35, 3.6, 5],
        rotation: [0, 5, 0]
      },
      {
        position: [69, 3.8, 29],
        scale: [26, 6.2, 10],
        rotation: [0, -11, 0]
      }
    ];
    const duneMeshes = duneFixtures.map((_fixture, index) =>
      this._createRockMesh(
        `OceanShowcaseDuneMesh${index}`,
        91373 + index * 3571,
        18,
        28
      )
    );
    for (let index = 0; index < duneFixtures.length; index++) {
      const fixture = duneFixtures[index];
      this._createPrimitive(
        `beach-dune-${index}`,
        duneMeshes[index],
        duneSand,
        fixture.position,
        fixture.scale,
        this._environmentRoot,
        fixture.rotation
      );
    }

    const shorelineStoneMesh = this._createRockMesh(
      "OceanShowcaseShorelineStoneMesh",
      11887,
      14,
      22
    );
    const shorelineStones: readonly {
      readonly position: readonly [number, number];
      readonly scale: Vector3Tuple;
      readonly rotationY: number;
    }[] = [
      { position: [-38, -1], scale: [1.25, 0.72, 0.9], rotationY: 17 },
      { position: [-29, 5], scale: [0.72, 0.46, 0.58], rotationY: -31 },
      { position: [-7, -2], scale: [0.92, 0.55, 0.68], rotationY: 43 },
      { position: [4, 7], scale: [0.55, 0.36, 0.48], rotationY: -12 },
      { position: [37, 5], scale: [1.08, 0.62, 0.74], rotationY: 29 },
      { position: [48, 11], scale: [0.66, 0.4, 0.5], rotationY: -37 },
      { position: [57, 1], scale: [1.42, 0.8, 1.02], rotationY: 8 }
    ];
    for (let index = 0; index < shorelineStones.length; index++) {
      const stone = shorelineStones[index];
      const [x, z] = stone.position;
      const bedHeight = this._sampleBedHeight(x, z);
      this._createPrimitive(
        `shoreline-stone-${index}`,
        shorelineStoneMesh,
        index % 3 === 0 ? wetRock : dryRock,
        [x, bedHeight + stone.scale[1] * 0.42, z],
        stone.scale,
        this._environmentRoot,
        [4 - index, stone.rotationY, index % 2 === 0 ? 3 : -4]
      );
    }

    // Keep the dusk horizon clear until a production-quality headland and
    // lighthouse asset is available. The former procedural ridge was mostly
    // submerged; scene-colour transmission enlarged its low-poly profile into
    // mountain-shaped patches in the water and dominated every fixed view.
  }

  private _createBoat(): void {
    const smoothHull = this._trackMesh(
      PrimitiveMesh.createCapsule(
        this._engine,
        0.5,
        3.35,
        24,
        3
      )
    );
    const hull = this._createMaterial(
      "OceanShowcaseBoatHull",
      [0.028, 0.09, 0.1, 1],
      0.36,
      0.08,
      "neutral",
      NEUTRAL_TEXTURE_BINDING
    );
    const trim = this._createMaterial(
      "OceanShowcaseBoatTrim",
      [0.78, 0.17, 0.035, 1],
      0.42,
      0.04,
      "neutral",
      NEUTRAL_TEXTURE_BINDING
    );
    const cabin = this._createMaterial(
      "OceanShowcaseBoatCabin",
      [0.72, 0.68, 0.56, 1],
      0.58,
      0,
      "neutral",
      NEUTRAL_TEXTURE_BINDING
    );
    this._createPrimitive(
      "boat-hull",
      smoothHull,
      hull,
      [0, -0.08, 0],
      [1.38, 1, 0.62],
      this._boatRoot,
      [90, 0, 0]
    );
    this._createPrimitive(
      "boat-deck",
      this._unitCube,
      trim,
      [0, 0.32, -0.18],
      [1.08, 0.14, 2.7],
      this._boatRoot
    );
    this._createPrimitive(
      "boat-cabin",
      this._unitCube,
      cabin,
      [0, 0.68, -0.5],
      [0.82, 0.58, 1.05],
      this._boatRoot
    );
    this._createPrimitive(
      "boat-mast",
      this._unitCylinder,
      trim,
      [0, 1.55, -0.2],
      [0.07, 1.75, 0.07],
      this._boatRoot
    );

    // The wake is authored through the bounded temporal-foam source contract.
    // It owns no mesh or second water surface.
  }

  private _updateWakeSources(
    elapsedTime: number,
    surfaceHit: boolean
  ): void {
    const sink = this._wakeSink;
    if (!sink || !surfaceHit || !this._wakeRoot.isActive) {
      this._lastWakeSampleTime = undefined;
      return;
    }
    const lastSampleTime = this._lastWakeSampleTime;
    const discontinuous =
      lastSampleTime === undefined ||
      elapsedTime < lastSampleTime ||
      elapsedTime - lastSampleTime >
        WAKE_EMISSION_INTERVAL_SECONDS * 2.5;
    if (discontinuous) {
      for (
        let index = WAKE_TRAIL_SAMPLE_COUNT - 1;
        index >= 0;
        index--
      ) {
        this._emitWakeSource(
          elapsedTime -
            index * WAKE_EMISSION_INTERVAL_SECONDS,
          index /
            Math.max(1, WAKE_TRAIL_SAMPLE_COUNT - 1)
        );
      }
      this._lastWakeSampleTime = elapsedTime;
      return;
    }
    if (
      elapsedTime - lastSampleTime <
      WAKE_EMISSION_INTERVAL_SECONDS
    ) {
      return;
    }
    this._emitWakeSource(elapsedTime, 0);
    this._lastWakeSampleTime = elapsedTime;
  }

  private _emitWakeSource(
    sampleTime: number,
    ageRatio: number
  ): void {
    const sink = this._wakeSink;
    if (!sink) return;
    const phase = Math.max(0, sampleTime) * BOAT_PATH_RATE;
    const layout = OCEAN_SHOWCASE_LAYOUT;
    const x =
      layout.boatPathCenter[0] +
      Math.sin(phase) * layout.boatPathRadius[0];
    const z =
      layout.boatPathCenter[2] +
      Math.cos(phase) * layout.boatPathRadius[2];
    const velocityX =
      Math.cos(phase) *
      layout.boatPathRadius[0] *
      BOAT_PATH_RATE;
    const velocityZ =
      -Math.sin(phase) *
      layout.boatPathRadius[2] *
      BOAT_PATH_RATE;
    const inverseSpeed =
      1 / Math.max(0.001, Math.hypot(velocityX, velocityZ));
    const accepted = sink.enqueue({
      bodyId: sink.bodyId,
      kind: WaterFoamSourceKind.Wake,
      intensity: 1 - ageRatio * 0.42,
      lifetimeSeconds: 3.8 - ageRatio,
      priority: 1.5,
      blend: WaterFoamBlendMode.Add,
      range: {
        kind: "circle",
        worldX:
          x -
          velocityX * inverseSpeed * WAKE_STERN_OFFSET,
        worldZ:
          z -
          velocityZ * inverseSpeed * WAKE_STERN_OFFSET,
        radius: 0.85 + ageRatio * 0.8
      }
    });
    if (accepted) {
      this._wakeSourceAcceptedCount++;
    } else {
      this._wakeSourceDroppedCount++;
    }
  }

  private _measureWakeFoam(elapsedTime: number): void {
    const sink = this._wakeSink;
    if (!sink || !this._wakeRoot.isActive) {
      this._wakeFoamSamplePeak = 0;
      this._wakeFoamSampleMean = 0;
      return;
    }
    const layout = OCEAN_SHOWCASE_LAYOUT;
    let peak = 0;
    let total = 0;
    for (
      let index = 0;
      index < WAKE_TRAIL_SAMPLE_COUNT;
      index++
    ) {
      const sampleTime =
        elapsedTime -
        index * WAKE_EMISSION_INTERVAL_SECONDS;
      const phase =
        Math.max(0, sampleTime) * BOAT_PATH_RATE;
      const velocityX =
        Math.cos(phase) *
        layout.boatPathRadius[0] *
        BOAT_PATH_RATE;
      const velocityZ =
        -Math.sin(phase) *
        layout.boatPathRadius[2] *
        BOAT_PATH_RATE;
      const inverseSpeed =
        1 /
        Math.max(
          0.001,
          Math.hypot(velocityX, velocityZ)
        );
      const foam = Math.min(
        1,
        Math.max(
          0,
          sink.sample(
            layout.boatPathCenter[0] +
              Math.sin(phase) *
                layout.boatPathRadius[0] -
              velocityX *
                inverseSpeed *
                WAKE_STERN_OFFSET,
            layout.boatPathCenter[2] +
              Math.cos(phase) *
                layout.boatPathRadius[2] -
              velocityZ *
                inverseSpeed *
                WAKE_STERN_OFFSET
          )
        )
      );
      peak = Math.max(peak, foam);
      total += foam;
    }
    this._wakeFoamSamplePeak = peak;
    this._wakeFoamSampleMean =
      total / WAKE_TRAIL_SAMPLE_COUNT;
  }

  private _createMaterial(
    name: string,
    color: ColorTuple,
    roughness: number,
    metallic: number,
    surface?: OceanPbrSurfaceKind,
    textureBinding?: Readonly<OceanPbrMaterialBindingOptions>,
    emissive: ColorTuple = [0, 0, 0, 1],
    transparent = false
  ): PBRMaterial {
    const material = new PBRMaterial(this._engine);
    material.name = name;
    material.baseColor = new Color(...color);
    material.emissiveColor = new Color(...emissive);
    material.roughness = roughness;
    material.metallic = metallic;
    material.specularIntensity =
      surface === "sand"
        ? 0.22
        : surface === "granite"
          ? 0.55
          : 0.7;
    material.isTransparent = transparent;
    if (surface && textureBinding && this._textureLibrary) {
      this._textureLibrary.apply(
        material,
        surface,
        textureBinding
      );
    }
    this._materials.push(material);
    return material;
  }

  private _createPrimitive(
    name: string,
    mesh: ModelMesh,
    material: PBRMaterial,
    position: Vector3Tuple,
    scale: Vector3Tuple,
    parent: Entity = this._environmentRoot,
    rotation: Vector3Tuple = [0, 0, 0]
  ): Entity {
    const entity = parent.createChild(name);
    entity.transform.setPosition(...position);
    entity.transform.setRotation(...rotation);
    entity.transform.setScale(...scale);
    const renderer = entity.addComponent(MeshRenderer);
    renderer.mesh = mesh;
    renderer.setMaterial(material);
    this._fixtureObjectCount++;
    return entity;
  }

  private _sampleBedHeight(worldX: number, worldZ: number): number {
    const resource = this._nearshoreResource;
    if (!resource) return -0.5;
    const { grid } = resource.data;
    const gridX = Math.min(
      grid.width - 1,
      Math.max(
        0,
        Math.round((worldX - grid.originXZ[0]) / grid.cellSizeXZ[0])
      )
    );
    const gridZ = Math.min(
      grid.height - 1,
      Math.max(
        0,
        Math.round((worldZ - grid.originXZ[1]) / grid.cellSizeXZ[1])
      )
    );
    return resource.bedHeightAt(gridZ * grid.width + gridX);
  }

  private _createRockMesh(
    name: string,
    seed: number,
    latitudeSegments = 24,
    longitudeSegments = 36,
    irregularity = 1
  ): ModelMesh {
    const geometry = buildOceanShowcaseRockGeometry(
      seed,
      latitudeSegments,
      longitudeSegments,
      irregularity
    );
    const mesh = new ModelMesh(this._engine, name);
    mesh.bounds.min.copyFrom(geometry.bounds.minimum);
    mesh.bounds.max.copyFrom(geometry.bounds.maximum);
    mesh.setPositions(geometry.positions);
    mesh.setNormals(geometry.normals);
    mesh.setTangents(geometry.tangents);
    mesh.setUVs(geometry.uvs);
    mesh.setIndices(geometry.indices);
    mesh.addSubMesh(
      0,
      geometry.indices.length,
      MeshTopology.Triangles
    );
    mesh.uploadData(true);
    return this._trackMesh(mesh);
  }

  private _createCliffMesh(
    name: string,
    seed: number
  ): ModelMesh {
    const geometry = buildOceanShowcaseCliffGeometry(seed);
    const mesh = new ModelMesh(this._engine, name);
    mesh.bounds.min.copyFrom(geometry.bounds.minimum);
    mesh.bounds.max.copyFrom(geometry.bounds.maximum);
    mesh.setPositions(geometry.positions);
    mesh.setNormals(geometry.normals);
    mesh.setTangents(geometry.tangents);
    mesh.setUVs(geometry.uvs);
    mesh.setIndices(geometry.indices);
    mesh.addSubMesh(
      0,
      geometry.indices.length,
      MeshTopology.Triangles
    );
    mesh.uploadData(true);
    return this._trackMesh(mesh);
  }

  private _trackMesh(mesh: ModelMesh): ModelMesh {
    this._meshes.push(mesh);
    return mesh;
  }
}
