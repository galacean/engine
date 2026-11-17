import {
  BoundingBox,
  BoundingFrustum,
  type Camera,
  CameraModifyFlags,
  type Engine,
  type Entity,
  type Material,
  Matrix,
  MeshRenderer,
  MeshTopology,
  type ModelMesh,
  Shader,
  ShaderData,
  ShaderDataGroup,
  ShaderLanguage,
  ShaderPass,
  Texture2D,
  TextureFilterMode,
  TextureFormat,
  TextureWrapMode,
  TransformFeedbackSimulator,
  Vector3,
  Vector4
} from "@galacean/engine";
import { GRASS_AUTHORED_HEIGHT_METRES } from "../world/SeedWorldAssetPlacementProfile.ts";
import {
  createSeedWorldDetailDensitySampler,
  sampleSeedWorldDetailHeight
} from "../world/SeedWorldDetailCandidateLattice.ts";
import {
  createSeedWorldForwardGrassRingMesh,
  DETAIL_TRANSFORM_STRIDE_BYTES,
  type SeedWorldForwardGrassRingMesh
} from "./SeedWorldDetailInstancedMesh.ts";
import { sampleSeedWorldHeight, seedWorldOriginX, seedWorldOriginZ, type SeedWorldFields } from "./SeedWorldFields.ts";
import { seedWorldGrassCoverageScale } from "./SeedWorldGrassAppearance.ts";
import type { SeedWorldDetailSpeciesProfile } from "../world/SeedWorldDetailSpecies.ts";
import type { SeedWorldDetailDensityField } from "./SeedWorldPopulationPlan.ts";

const WINDOW_TEXELS = 256;
const WINDOW_HALF_METRES = 128;
const WINDOW_RECENTER_THRESHOLD_METRES = 64;
const COARSE_TILE_METRES = 4;
const COARSE_GRID_SIZE = WINDOW_TEXELS / COARSE_TILE_METRES;
const MAX_BAKED_DENSITY_PER_SQM = 24;
const MAX_BAKED_ECO_HEIGHT_METRES = 2;

const TF_SHADER_NAME = "SeedWorld/ForwardGrassTF";
const TF_VARYINGS = ["v_PositionRotation", "v_Scale", "v_SurfaceWeights", "v_TerrainNormal"];

const RendererShaderData = ShaderData as unknown as new (group: ShaderDataGroup) => ShaderData;

const TF_VERTEX_SHADER = `
precision highp float;
precision highp int;

uniform sampler2D u_TerrainTex;
uniform sampler2D u_MaskTex;
uniform vec4 u_WindowOriginSize;
uniform vec4 u_WorldBounds;
uniform vec4 u_GridRect;
uniform vec4 u_CameraSector;
uniform vec4 u_SectorParams;
uniform vec4 u_FeatherAndWidth;
uniform vec4 u_LodParams;
uniform vec4 u_ScaleParams;
uniform vec4 u_Frustum0;
uniform vec4 u_Frustum1;
uniform vec4 u_Frustum2;
uniform vec4 u_Frustum3;
uniform vec4 u_Frustum4;
uniform vec4 u_Frustum5;

out vec4 v_PositionRotation;
out vec3 v_Scale;
out vec3 v_SurfaceWeights;
out vec3 v_TerrainNormal;

uint forwardGrassHash(uint x) {
  x ^= x >> 16u;
  x *= 0x7feb352du;
  x ^= x >> 15u;
  x *= 0x846ca68bu;
  x ^= x >> 16u;
  return x;
}

uint forwardGrassCellHash(ivec2 cell) {
  uint h = uint(cell.x) * 0x9e3779b9u ^ uint(cell.y) * 0x85ebca6bu;
  return forwardGrassHash(h);
}

float forwardGrassUnitFloat(uint h) {
  return float(h & 0x00ffffffu) / 16777216.0;
}

void emitCulled() {
  v_PositionRotation = vec4(u_CameraSector.x, 0.0, u_CameraSector.y, 0.0);
  v_Scale = vec3(0.0);
  v_SurfaceWeights = vec3(0.0);
  v_TerrainNormal = vec3(0.0, 1.0, 0.0);
}

bool forwardGrassSphereInFrustum(vec3 center, float radius) {
  if (dot(u_Frustum0.xyz, center) + u_Frustum0.w < -radius) return false;
  if (dot(u_Frustum1.xyz, center) + u_Frustum1.w < -radius) return false;
  if (dot(u_Frustum2.xyz, center) + u_Frustum2.w < -radius) return false;
  if (dot(u_Frustum3.xyz, center) + u_Frustum3.w < -radius) return false;
  if (dot(u_Frustum4.xyz, center) + u_Frustum4.w < -radius) return false;
  if (dot(u_Frustum5.xyz, center) + u_Frustum5.w < -radius) return false;
  return true;
}

void main() {
  int id = gl_VertexID;
  int gridW = max(1, int(round(u_GridRect.z)));
  int minGx = int(round(u_GridRect.x));
  int minGz = int(round(u_GridRect.y));
  ivec2 cell = ivec2(minGx + (id % gridW), minGz + (id / gridW));

  uint baseSeed = forwardGrassCellHash(cell);
  float rJitterX = forwardGrassUnitFloat(forwardGrassHash(baseSeed ^ 0x68bc21ebu));
  float rJitterZ = forwardGrassUnitFloat(forwardGrassHash(baseSeed ^ 0x02e5be93u));
  float stepMetres = u_LodParams.x;
  vec2 worldXZ = (vec2(cell) + vec2(0.05) + vec2(rJitterX, rJitterZ) * 0.9) * stepMetres;

  if (
    worldXZ.x < u_WorldBounds.x ||
    worldXZ.x > u_WorldBounds.z ||
    worldXZ.y < u_WorldBounds.y ||
    worldXZ.y > u_WorldBounds.w
  ) {
    emitCulled();
    return;
  }

  vec2 toCell = worldXZ - u_CameraSector.xy;
  float dist = length(toCell);
  float innerFeather = u_FeatherAndWidth.x;
  float outerFeather = u_FeatherAndWidth.y;
  float minBound = max(0.0, u_SectorParams.x - innerFeather);
  float maxBound = u_SectorParams.y + outerFeather;
  if (dist < minBound || dist > maxBound) {
    emitCulled();
    return;
  }

  bool inFootHalo = dist <= u_SectorParams.w;
  bool inCone = dist > 0.001 && dot(toCell / dist, u_CameraSector.zw) >= u_SectorParams.z;
  if (!inFootHalo && !inCone) {
    emitCulled();
    return;
  }

  // Ring 0 <-> Ring 1 share the exact 0.25m world lattice, so staggered distance jitter
  // swaps each clump in-place at its identical position/yaw/scale over a 10m band.
  // Ring 1 <-> Ring 2 use different lattice steps (0.25m vs 0.50m), so they crossfade smoothly in scale.
  float ringLod = u_GridRect.w;
  float lodBlendScale = 1.0;
  if (ringLod < 0.5) {
    float jitterOuter = (forwardGrassUnitFloat(forwardGrassHash(baseSeed ^ 0x517cc1b7u)) * 2.0 - 1.0) * outerFeather;
    if (outerFeather > 0.001) {
      if (dist + jitterOuter >= u_SectorParams.y) {
        emitCulled();
        return;
      }
    } else if (dist > u_SectorParams.y) {
      emitCulled();
      return;
    }
  } else if (ringLod < 1.5) {
    float jitterInner = (forwardGrassUnitFloat(forwardGrassHash(baseSeed ^ 0x517cc1b7u)) * 2.0 - 1.0) * innerFeather;
    if (u_SectorParams.x > 0.001 && dist + jitterInner < u_SectorParams.x) {
      emitCulled();
      return;
    }
    if (outerFeather > 0.001) {
      lodBlendScale = 1.0 - smoothstep(u_SectorParams.y - outerFeather, u_SectorParams.y + outerFeather, dist);
    } else if (dist > u_SectorParams.y) {
      emitCulled();
      return;
    }
  } else {
    if (innerFeather > 0.001 && u_SectorParams.x > 0.001) {
      lodBlendScale = smoothstep(u_SectorParams.x - innerFeather, u_SectorParams.x + innerFeather, dist);
    }
    if (dist > u_SectorParams.y) {
      emitCulled();
      return;
    }
  }
  if (lodBlendScale <= 0.001) {
    emitCulled();
    return;
  }

  vec2 localPos = worldXZ - u_WindowOriginSize.xy;
  if (
    localPos.x < 0.0 ||
    localPos.y < 0.0 ||
    localPos.x >= u_WindowOriginSize.w - 1.0 ||
    localPos.y >= u_WindowOriginSize.w - 1.0
  ) {
    emitCulled();
    return;
  }

  vec2 maskUV = (localPos + vec2(0.5)) * u_WindowOriginSize.z;
  vec4 maskSample = texture(u_MaskTex, maskUV);
  if (maskSample.r <= 0.0005) {
    emitCulled();
    return;
  }

  float fadeStart = u_FeatherAndWidth.w;
  float t = clamp((dist - fadeStart) / max(u_LodParams.z - fadeStart, 0.001), 0.0, 1.0);
  float lodDensity = 1.0 - (1.0 - u_LodParams.w) * (t * t * (3.0 - 2.0 * t));
  float expectedClumps = maskSample.r * u_LodParams.y * lodDensity;
  float acceptRand = forwardGrassUnitFloat(baseSeed);
  float densityScale = smoothstep(acceptRand - 0.08, acceptRand + 0.02, expectedClumps);
  if (densityScale <= 0.001) {
    emitCulled();
    return;
  }

  ivec2 maxTexel = ivec2(int(u_WindowOriginSize.w) - 1);
  ivec2 p0 = clamp(ivec2(floor(localPos)), ivec2(0), maxTexel);
  ivec2 p1 = min(p0 + ivec2(1), maxTexel);
  vec2 frac = clamp(localPos - vec2(p0), vec2(0.0), vec2(1.0));
  vec4 t00 = texelFetch(u_TerrainTex, p0, 0);
  vec4 t10 = texelFetch(u_TerrainTex, ivec2(p1.x, p0.y), 0);
  vec4 t01 = texelFetch(u_TerrainTex, ivec2(p0.x, p1.y), 0);
  vec4 t11 = texelFetch(u_TerrainTex, p1, 0);
  vec4 terrainSample = mix(mix(t00, t10, frac.x), mix(t01, t11, frac.x), frac.y);

  if (!forwardGrassSphereInFrustum(vec3(worldXZ.x, terrainSample.r + 0.6, worldXZ.y), 2.5)) {
    emitCulled();
    return;
  }

  float grassWeight = terrainSample.a;
  float covScale = clamp((grassWeight - 0.186363637) / (0.681818068 - 0.186363637), 0.0, 1.0);
  if (covScale <= 0.0) {
    emitCulled();
    return;
  }

  float rYaw = forwardGrassUnitFloat(forwardGrassHash(baseSeed ^ 0xc2b2ae35u));
  float rScale = forwardGrassUnitFloat(forwardGrassHash(baseSeed ^ 0x63d83595u));

  float vertScale;
  if (u_ScaleParams.z > 0.5) {
    float ecoHeight = mix(maskSample.b, maskSample.a, rScale) * ${MAX_BAKED_ECO_HEIGHT_METRES.toFixed(1)};
    vertScale = ecoHeight / max(u_ScaleParams.w, 0.001);
  } else {
    vertScale = mix(u_ScaleParams.x, u_ScaleParams.y, rScale);
  }

  float finalScale = vertScale * covScale * densityScale * lodBlendScale;
  float densityPreserve = clamp(sqrt(max(1.0, maskSample.r * u_LodParams.y * lodDensity)), 1.0, 1.45);
  float horizBoost = densityPreserve * u_FeatherAndWidth.z;
  float nx = terrainSample.g;
  float nz = terrainSample.b;
  float ny = sqrt(max(0.0001, 1.0 - nx * nx - nz * nz));

  v_PositionRotation = vec4(worldXZ.x, terrainSample.r, worldXZ.y, rYaw * 6.2831853);
  v_Scale = vec3(finalScale * horizBoost, finalScale, finalScale * horizBoost);
  v_SurfaceWeights = vec3(grassWeight, maskSample.g, max(0.0, 1.0 - grassWeight - maskSample.g));
  v_TerrainNormal = normalize(vec3(nx, ny, nz));
}
`;

const TF_FRAGMENT_SHADER = `
precision highp float;
out vec4 color;
void main() {
  color = vec4(0.0);
}
`;

function getForwardGrassTfPass(): ShaderPass {
  let shader = Shader.find(TF_SHADER_NAME);
  if (!shader) {
    const pass = new ShaderPass(
      "ForwardGrassTF",
      [[0, TF_VERTEX_SHADER]],
      [[0, TF_FRAGMENT_SHADER]],
      ShaderLanguage.GLSLES300
    );
    shader = Shader.create(TF_SHADER_NAME, [pass])!;
  }
  return shader.subShaders[0].passes[0];
}

export interface ForwardGrassSamplerContext {
  readonly fields: SeedWorldFields;
  readonly densityFields: readonly SeedWorldDetailDensityField[];
  readonly speciesProfiles: readonly SeedWorldDetailSpeciesProfile[];
  readonly resolveDensityMultiplier: (field: SeedWorldDetailDensityField) => number;
  readonly sampleSurfaceWeights: (
    fields: SeedWorldFields,
    worldX: number,
    worldZ: number,
    out: [grass: number, road: number, remaining: number]
  ) => void;
  readonly sampleTerrainNormal: (
    fields: SeedWorldFields,
    worldX: number,
    worldZ: number,
    out: [x: number, y: number, z: number]
  ) => void;
  readonly sampleGrassCoverage?: (worldX: number, worldZ: number) => number;
  readonly sampleContactIsWater?: (worldX: number, worldZ: number) => boolean;
}

export interface ForwardGrassUpdateParams {
  readonly camera: Camera;
  readonly active: boolean;
  readonly lod1DistanceMetres: number;
  readonly lod2DistanceMetres: number;
  readonly maximumDistanceMetres: number;
  readonly minimumDensityFraction: number;
  readonly minScale: number;
  readonly maxScale: number;
  readonly useEcologicalHeight: boolean;
  readonly colorizeLod: boolean;
  readonly debugColors: Readonly<Record<0 | 1 | 2, Vector4>>;
  readonly debugOffColor: Vector4;
  readonly lodDebugColorProperty: string;
  readonly revealRangeSetter: (renderer: MeshRenderer, minY: number, maxY: number) => void;
  readonly samplerContext: ForwardGrassSamplerContext;
}

export interface ForwardGrassRingConfig {
  readonly lod: 0 | 1 | 2;
  readonly stepMetres: number;
  readonly footHaloMetres: number;
  readonly innerFeatherMetres: number;
  readonly outerFeatherMetres: number;
  readonly widthBoost: number;
  readonly initialCapacity: number;
}

/** Angular pad outside camera horizontal half-FOV for blade width, wind sway, and terrain slope. */
const SECTOR_ANGULAR_MARGIN_RADIANS = (4 * Math.PI) / 180;

const RING_CONFIGS: readonly ForwardGrassRingConfig[] = [
  {
    lod: 0,
    stepMetres: 0.25,
    footHaloMetres: 4.0,
    innerFeatherMetres: 0,
    outerFeatherMetres: 5.0,
    widthBoost: 1.0,
    initialCapacity: 16384
  },
  {
    lod: 1,
    stepMetres: 0.25,
    footHaloMetres: 0,
    innerFeatherMetres: 5.0,
    outerFeatherMetres: 4.5,
    widthBoost: 1.0,
    initialCapacity: 24576
  },
  {
    lod: 2,
    stepMetres: 0.5,
    footHaloMetres: 0,
    innerFeatherMetres: 4.5,
    outerFeatherMetres: 0,
    widthBoost: 1.25,
    initialCapacity: 24576
  }
];

interface ForwardGrassRingState {
  readonly config: ForwardGrassRingConfig;
  readonly entity: Entity;
  readonly renderer: MeshRenderer;
  readonly ringMesh: SeedWorldForwardGrassRingMesh;
  readonly simulator: TransformFeedbackSimulator;
  readonly shaderData: ShaderData;
  readonly bounds: BoundingBox;
  capacity: number;
  appliedColorize?: boolean;
}

/**
 * GPU-driven camera-centric forward-sector grass system using Galacean's TransformFeedbackSimulator.
 * Keeps a compact 256m x 256m sliding world-height + grass-mask texture window in VRAM and snaps
 * every forward-cone instance to fixed world lattice coordinates so blades never slide on camera move.
 */
export class SeedWorldForwardGrass {
  private readonly _engine: Engine;
  private readonly _root: Entity;
  private readonly _terrainTex: Texture2D;
  private readonly _maskTex: Texture2D;
  private readonly _terrainData = new Float32Array(WINDOW_TEXELS * WINDOW_TEXELS * 4);
  private readonly _maskData = new Uint8Array(WINDOW_TEXELS * WINDOW_TEXELS * 4);
  private readonly _coarseMinY = new Float32Array(COARSE_GRID_SIZE * COARSE_GRID_SIZE);
  private readonly _coarseMaxY = new Float32Array(COARSE_GRID_SIZE * COARSE_GRID_SIZE);
  private readonly _coarseMaxEcoHeight = new Float32Array(COARSE_GRID_SIZE * COARSE_GRID_SIZE);
  private readonly _coarseHasGrass = new Uint8Array(COARSE_GRID_SIZE * COARSE_GRID_SIZE);
  private readonly _rings: ForwardGrassRingState[] = [];
  private readonly _surfaceWeightsScratch: [number, number, number] = [1, 0, 0];
  private readonly _normalScratch: [number, number, number] = [0, 1, 0];
  private readonly _viewProjection = new Matrix();
  private readonly _frustum = new BoundingFrustum();
  private readonly _tileBounds = new BoundingBox();
  private readonly _frustumVecs: readonly Vector4[] = [
    new Vector4(),
    new Vector4(),
    new Vector4(),
    new Vector4(),
    new Vector4(),
    new Vector4()
  ];

  private _windowOriginX = Number.NaN;
  private _windowOriginZ = Number.NaN;
  private _maskDirty = true;
  private _tfDirty = true;
  private _sectorAngleDirty = true;
  private _sectorHalfAngleRadians = (35 * Math.PI) / 180;
  private _sectorCosHalfAngle = Math.cos((35 * Math.PI) / 180);
  private _boundCamera?: Camera;

  private _lastCamX = Number.NaN;
  private _lastCamY = Number.NaN;
  private _lastCamZ = Number.NaN;
  private _lastCamFwdX = 0;
  private _lastCamFwdY = 0;
  private _lastCamFwdZ = -1;
  private _lastFwdX = 0;
  private _lastFwdZ = -1;
  private _lastNear = Number.NaN;
  private _lastFar = Number.NaN;
  private _lastLod1Dist = Number.NaN;
  private _lastLod2Dist = Number.NaN;
  private _lastMaxDist = Number.NaN;
  private _lastMinDensity = Number.NaN;
  private _lastMinScale = Number.NaN;
  private _lastMaxScale = Number.NaN;
  private _lastUseEcoHeight = false;
  private _destroyed = false;

  private readonly _onCameraModified = (flag: CameraModifyFlags): void => {
    if (flag & (CameraModifyFlags.FieldOfView | CameraModifyFlags.AspectRatio | CameraModifyFlags.ProjectionType)) {
      this._sectorAngleDirty = true;
      this._tfDirty = true;
    }
  };

  static isSupported(engine: Engine): boolean {
    const hardware = (engine as Engine & { _hardwareRenderer?: { isWebGL2?: boolean } })._hardwareRenderer;
    return Boolean(hardware?.isWebGL2);
  }

  constructor(
    engine: Engine,
    parent: Entity,
    sourceMesh: ModelMesh,
    material: Material,
    configureRenderer: (renderer: MeshRenderer) => void
  ) {
    this._engine = engine;
    this._root = parent.createChild("Forward Sector Grass (TF)");

    const terrainTex = new Texture2D(engine, WINDOW_TEXELS, WINDOW_TEXELS, TextureFormat.R32G32B32A32, false, false);
    terrainTex.filterMode = TextureFilterMode.Point;
    terrainTex.wrapModeU = terrainTex.wrapModeV = TextureWrapMode.Clamp;
    terrainTex.isGCIgnored = true;
    this._terrainTex = terrainTex;

    const maskTex = new Texture2D(engine, WINDOW_TEXELS, WINDOW_TEXELS, TextureFormat.R8G8B8A8, false, false);
    maskTex.filterMode = TextureFilterMode.Bilinear;
    maskTex.wrapModeU = maskTex.wrapModeV = TextureWrapMode.Clamp;
    maskTex.isGCIgnored = true;
    this._maskTex = maskTex;

    const tfPass = getForwardGrassTfPass();
    for (const config of RING_CONFIGS) {
      const simulator = new TransformFeedbackSimulator(
        engine,
        DETAIL_TRANSFORM_STRIDE_BYTES,
        config.initialCapacity,
        tfPass,
        TF_VARYINGS
      );
      const bounds = new BoundingBox(new Vector3(-1, -1, -1), new Vector3(1, 1, 1));
      const entity = this._root.createChild(`Forward Grass LOD${config.lod}`);
      const ringMesh = createSeedWorldForwardGrassRingMesh(
        engine,
        sourceMesh,
        simulator.readBinding,
        bounds,
        entity.name,
        config.lod
      );
      const renderer = entity.addComponent(MeshRenderer);
      renderer.mesh = ringMesh.mesh;
      renderer.setMaterial(material);
      configureRenderer(renderer);
      renderer.enabled = false;

      const shaderData = new RendererShaderData(ShaderDataGroup.Renderer);
      shaderData.setTexture("u_TerrainTex", this._terrainTex);
      shaderData.setTexture("u_MaskTex", this._maskTex);

      this._rings.push({
        config,
        entity,
        renderer,
        ringMesh,
        simulator,
        shaderData,
        bounds,
        capacity: config.initialCapacity
      });
    }
  }

  visitRenderers(visitor: (renderer: MeshRenderer) => void): void {
    for (const ring of this._rings) visitor(ring.renderer);
  }

  invalidateMask(): void {
    this._maskDirty = true;
    this._tfDirty = true;
  }

  invalidateSimulation(): void {
    this._tfDirty = true;
  }

  update(params: ForwardGrassUpdateParams): void {
    if (this._destroyed) return;
    if (!params.active) {
      for (const ring of this._rings) ring.renderer.enabled = false;
      return;
    }

    this._bindCamera(params.camera);
    if (this._sectorAngleDirty) {
      const halfVerticalFovRad = (Math.max(1, Math.min(179, params.camera.fieldOfView)) * Math.PI) / 360;
      const aspect = Math.max(0.1, params.camera.aspectRatio);
      const frustumHalfHorizRad = Math.atan(Math.tan(halfVerticalFovRad) * aspect);
      this._sectorHalfAngleRadians = Math.min(Math.PI, frustumHalfHorizRad + SECTOR_ANGULAR_MARGIN_RADIANS);
      this._sectorCosHalfAngle = Math.cos(this._sectorHalfAngleRadians);
      this._sectorAngleDirty = false;
      this._tfDirty = true;
    }

    const camPos = params.camera.entity.transform.worldPosition;
    const camFwd = params.camera.entity.transform.worldForward;
    const rawLen = Math.hypot(camFwd.x, camFwd.z);
    let fwdX = this._lastFwdX;
    let fwdZ = this._lastFwdZ;
    if (rawLen > 0.05) {
      fwdX = camFwd.x / rawLen;
      fwdZ = camFwd.z / rawLen;
    }

    const needWindowRebake =
      this._maskDirty ||
      !Number.isFinite(this._windowOriginX) ||
      Math.abs(camPos.x - (this._windowOriginX + WINDOW_HALF_METRES)) > WINDOW_RECENTER_THRESHOLD_METRES ||
      Math.abs(camPos.z - (this._windowOriginZ + WINDOW_HALF_METRES)) > WINDOW_RECENTER_THRESHOLD_METRES;

    if (needWindowRebake) {
      this._rebakeWindow(camPos.x, camPos.z, params.samplerContext);
      this._maskDirty = false;
      this._tfDirty = true;
    }

    const movedEnough =
      !Number.isFinite(this._lastCamX) ||
      Math.hypot(camPos.x - this._lastCamX, camPos.y - this._lastCamY, camPos.z - this._lastCamZ) > 0.01;
    const turnedEnough =
      camFwd.x * this._lastCamFwdX + camFwd.y * this._lastCamFwdY + camFwd.z * this._lastCamFwdZ < 0.99995;
    const clipPlanesChanged =
      params.camera.nearClipPlane !== this._lastNear || params.camera.farClipPlane !== this._lastFar;
    const paramsChanged =
      this._lastLod1Dist !== params.lod1DistanceMetres ||
      this._lastLod2Dist !== params.lod2DistanceMetres ||
      this._lastMaxDist !== params.maximumDistanceMetres ||
      this._lastMinDensity !== params.minimumDensityFraction ||
      this._lastMinScale !== params.minScale ||
      this._lastMaxScale !== params.maxScale ||
      this._lastUseEcoHeight !== params.useEcologicalHeight;

    const shouldDispatchTf = this._tfDirty || movedEnough || turnedEnough || clipPlanesChanged || paramsChanged;
    if (shouldDispatchTf) {
      Matrix.multiply(params.camera.projectionMatrix, params.camera.viewMatrix, this._viewProjection);
      this._frustum.calculateFromMatrix(this._viewProjection);
      this._syncFrustumUniformVectors();
      this._dispatchAllRings(camPos.x, camPos.z, fwdX, fwdZ, params);
      this._lastCamX = camPos.x;
      this._lastCamY = camPos.y;
      this._lastCamZ = camPos.z;
      this._lastCamFwdX = camFwd.x;
      this._lastCamFwdY = camFwd.y;
      this._lastCamFwdZ = camFwd.z;
      this._lastFwdX = fwdX;
      this._lastFwdZ = fwdZ;
      this._lastNear = params.camera.nearClipPlane;
      this._lastFar = params.camera.farClipPlane;
      this._lastLod1Dist = params.lod1DistanceMetres;
      this._lastLod2Dist = params.lod2DistanceMetres;
      this._lastMaxDist = params.maximumDistanceMetres;
      this._lastMinDensity = params.minimumDensityFraction;
      this._lastMinScale = params.minScale;
      this._lastMaxScale = params.maxScale;
      this._lastUseEcoHeight = params.useEcologicalHeight;
      this._tfDirty = false;
    }

    for (const ring of this._rings) {
      if (ring.appliedColorize !== params.colorizeLod) {
        ring.appliedColorize = params.colorizeLod;
        ring.renderer.shaderData.setVector4(
          params.lodDebugColorProperty,
          params.colorizeLod ? params.debugColors[ring.config.lod] : params.debugOffColor
        );
      }
    }
  }

  getDiagnostics(): {
    lod0: { batches: number; instances: number; triangles: number };
    lod1: { batches: number; instances: number; triangles: number };
    lod2: { batches: number; instances: number; triangles: number };
  } {
    const out = {
      lod0: { batches: 0, instances: 0, triangles: 0 },
      lod1: { batches: 0, instances: 0, triangles: 0 },
      lod2: { batches: 0, instances: 0, triangles: 0 }
    };
    for (const ring of this._rings) {
      if (!ring.renderer.enabled || ring.ringMesh.mesh.instanceCount <= 0) continue;
      const bucket = ring.config.lod === 0 ? out.lod0 : ring.config.lod === 1 ? out.lod1 : out.lod2;
      const count = ring.ringMesh.mesh.instanceCount;
      bucket.batches += 1;
      bucket.instances += count;
      bucket.triangles += count * ring.ringMesh.triangleCountPerInstance;
    }
    return out;
  }

  destroy(): void {
    if (this._destroyed) return;
    this._destroyed = true;
    this._unbindCamera();
    for (const ring of this._rings) {
      ring.ringMesh.mesh.destroy();
      ring.simulator.destroy();
    }
    this._rings.length = 0;
    this._terrainTex.destroy();
    this._maskTex.destroy();
    if (!this._root.destroyed) this._root.destroy();
  }

  private _bindCamera(camera: Camera): void {
    if (this._boundCamera === camera) return;
    this._unbindCamera();
    this._boundCamera = camera;
    (
      camera as unknown as { _registerModifyListener?: (listener: (flag: CameraModifyFlags) => void) => void }
    )._registerModifyListener?.(this._onCameraModified);
    this._sectorAngleDirty = true;
    this._tfDirty = true;
  }

  private _unbindCamera(): void {
    if (!this._boundCamera) return;
    (
      this._boundCamera as unknown as {
        _unRegisterModifyListener?: (listener: (flag: CameraModifyFlags) => void) => void;
      }
    )._unRegisterModifyListener?.(this._onCameraModified);
    this._boundCamera = undefined;
  }

  private _rebakeWindow(camX: number, camZ: number, ctx: ForwardGrassSamplerContext): void {
    const originX = Math.floor(camX - WINDOW_HALF_METRES);
    const originZ = Math.floor(camZ - WINDOW_HALF_METRES);
    this._windowOriginX = originX;
    this._windowOriginZ = originZ;

    const fields = ctx.fields;
    const worldMinX = seedWorldOriginX(fields);
    const worldMinZ = seedWorldOriginZ(fields);
    const worldMaxX = worldMinX + fields.sizeMetres;
    const worldMaxZ = worldMinZ + fields.sizeMetres;

    const grassFields: Array<{
      readonly field: SeedWorldDetailDensityField;
      readonly sampler: (x: number, z: number) => number;
      readonly multiplier: number;
      readonly usesCoverage: boolean;
      readonly usesEcoHeight: boolean;
    }> = [];
    for (const field of ctx.densityFields) {
      if (field.category !== "grass" || field.maximumDensityPerSquareMetre <= 0) continue;
      const profile = ctx.speciesProfiles.find((p) => p.key === field.prototypeFamily);
      const multiplier = ctx.resolveDensityMultiplier(field);
      if (multiplier <= 0) continue;
      grassFields.push({
        field,
        sampler: createSeedWorldDetailDensitySampler(field, fields.sizeMetres),
        multiplier,
        usesCoverage: profile?.habitat === "terrestrial",
        usesEcoHeight: Boolean(field.heightRangeMetres)
      });
    }

    const worldCenterOffsetX = worldMinX + fields.sizeMetres * 0.5;
    const worldCenterOffsetZ = worldMinZ + fields.sizeMetres * 0.5;
    const terrainData = this._terrainData;
    const maskData = this._maskData;

    for (let iz = 0; iz < WINDOW_TEXELS; iz++) {
      const wz = originZ + iz;
      const clampedZ = Math.max(worldMinZ, Math.min(worldMaxZ, wz));
      const inBoundsZ = wz >= worldMinZ && wz <= worldMaxZ;
      for (let ix = 0; ix < WINDOW_TEXELS; ix++) {
        const wx = originX + ix;
        const clampedX = Math.max(worldMinX, Math.min(worldMaxX, wx));
        const inBounds = inBoundsZ && wx >= worldMinX && wx <= worldMaxX;
        const idx = (iz * WINDOW_TEXELS + ix) * 4;

        const h = sampleSeedWorldHeight(fields, clampedX, clampedZ) ?? 0;
        ctx.sampleTerrainNormal(fields, clampedX, clampedZ, this._normalScratch);
        ctx.sampleSurfaceWeights(fields, clampedX, clampedZ, this._surfaceWeightsScratch);
        if (ctx.sampleGrassCoverage) {
          const cov = Math.max(0, Math.min(1, ctx.sampleGrassCoverage(clampedX, clampedZ)));
          this._surfaceWeightsScratch[0] = cov;
          this._surfaceWeightsScratch[1] = Math.min(this._surfaceWeightsScratch[1], 1 - cov);
        }
        const covScale = seedWorldGrassCoverageScale(this._surfaceWeightsScratch[0]);
        const isWater = ctx.sampleContactIsWater?.(clampedX, clampedZ) ?? false;

        let totalDensity = 0;
        let hasAquatic = false;
        let ecoMin = 0.25;
        let ecoMax = 0.55;
        if (inBounds) {
          const localCenterX = clampedX - worldCenterOffsetX;
          const localCenterZ = clampedZ - worldCenterOffsetZ;
          const localOriginX = clampedX - worldMinX;
          const localOriginZ = clampedZ - worldMinZ;
          for (let f = 0; f < grassFields.length; f++) {
            const gf = grassFields[f]!;
            if (gf.usesCoverage && (covScale <= 0 || isWater)) continue;
            const d = gf.sampler(localCenterX, localCenterZ) * gf.multiplier;
            if (d <= 0) continue;
            totalDensity += d;
            if (!gf.usesCoverage) hasAquatic = true;
            if (gf.usesEcoHeight) {
              ecoMin =
                sampleSeedWorldDetailHeight(gf.field, fields.sizeMetres, localOriginX, localOriginZ, 0) ?? ecoMin;
              ecoMax =
                sampleSeedWorldDetailHeight(gf.field, fields.sizeMetres, localOriginX, localOriginZ, 1) ?? ecoMax;
            }
          }
        }

        const effectiveGrassWeight =
          hasAquatic && covScale <= 0 ? Math.max(this._surfaceWeightsScratch[0], 0.7) : this._surfaceWeightsScratch[0];
        terrainData[idx] = h;
        terrainData[idx + 1] = this._normalScratch[0];
        terrainData[idx + 2] = this._normalScratch[2];
        terrainData[idx + 3] = effectiveGrassWeight;

        maskData[idx] = Math.max(0, Math.min(255, Math.round((totalDensity / MAX_BAKED_DENSITY_PER_SQM) * 255)));
        maskData[idx + 1] = Math.max(0, Math.min(255, Math.round(this._surfaceWeightsScratch[1] * 255)));
        maskData[idx + 2] = Math.max(0, Math.min(255, Math.round((ecoMin / MAX_BAKED_ECO_HEIGHT_METRES) * 255)));
        maskData[idx + 3] = Math.max(0, Math.min(255, Math.round((ecoMax / MAX_BAKED_ECO_HEIGHT_METRES) * 255)));
      }
    }

    this._terrainTex.setPixelBuffer(terrainData);
    this._maskTex.setPixelBuffer(maskData);

    for (let tz = 0; tz < COARSE_GRID_SIZE; tz++) {
      const z0 = tz * COARSE_TILE_METRES;
      const z1 = Math.min(WINDOW_TEXELS - 1, z0 + COARSE_TILE_METRES);
      const gz0 = Math.max(0, z0 - 1);
      for (let tx = 0; tx < COARSE_GRID_SIZE; tx++) {
        const x0 = tx * COARSE_TILE_METRES;
        const x1 = Math.min(WINDOW_TEXELS - 1, x0 + COARSE_TILE_METRES);
        const gx0 = Math.max(0, x0 - 1);
        let tileMinY = Number.POSITIVE_INFINITY;
        let tileMaxY = Number.NEGATIVE_INFINITY;
        let tileMaxEco = 0;
        let hasGrass = 0;

        for (let iz = z0; iz <= z1; iz++) {
          const row = iz * WINDOW_TEXELS;
          for (let ix = x0; ix <= x1; ix++) {
            const idx = (row + ix) * 4;
            const h = terrainData[idx]!;
            if (h < tileMinY) tileMinY = h;
            if (h > tileMaxY) tileMaxY = h;
            const eco = (maskData[idx + 3]! / 255) * MAX_BAKED_ECO_HEIGHT_METRES;
            if (eco > tileMaxEco) tileMaxEco = eco;
          }
        }
        for (let iz = gz0; iz <= z1 && hasGrass === 0; iz++) {
          const row = iz * WINDOW_TEXELS;
          for (let ix = gx0; ix <= x1; ix++) {
            if (maskData[(row + ix) * 4]! > 0) {
              hasGrass = 1;
              break;
            }
          }
        }

        const tileIdx = tz * COARSE_GRID_SIZE + tx;
        this._coarseMinY[tileIdx] = Number.isFinite(tileMinY) ? tileMinY : 0;
        this._coarseMaxY[tileIdx] = Number.isFinite(tileMaxY) ? tileMaxY : 100;
        this._coarseMaxEcoHeight[tileIdx] = tileMaxEco;
        this._coarseHasGrass[tileIdx] = hasGrass;
      }
    }
  }

  private _syncFrustumUniformVectors(): void {
    const planes = [
      this._frustum.near,
      this._frustum.far,
      this._frustum.left,
      this._frustum.right,
      this._frustum.top,
      this._frustum.bottom
    ];
    for (let i = 0; i < 6; i++) {
      const plane = planes[i]!;
      this._frustumVecs[i]!.set(plane.normal.x, plane.normal.y, plane.normal.z, plane.distance);
    }
  }

  private _dispatchAllRings(
    camX: number,
    camZ: number,
    fwdX: number,
    fwdZ: number,
    params: ForwardGrassUpdateParams
  ): void {
    const fields = params.samplerContext.fields;
    const worldMinX = seedWorldOriginX(fields);
    const worldMinZ = seedWorldOriginZ(fields);
    const worldMaxX = worldMinX + fields.sizeMetres;
    const worldMaxZ = worldMinZ + fields.sizeMetres;

    const bands: readonly [number, number][] = [
      [0, Math.max(0, Math.min(params.lod1DistanceMetres, params.maximumDistanceMetres))],
      [
        Math.max(0, params.lod1DistanceMetres),
        Math.max(params.lod1DistanceMetres, Math.min(params.lod2DistanceMetres, params.maximumDistanceMetres))
      ],
      [Math.max(0, Math.max(params.lod1DistanceMetres, params.lod2DistanceMetres)), params.maximumDistanceMetres]
    ];

    const fadeStart = Math.max(0, Math.min(params.lod1DistanceMetres, params.maximumDistanceMetres * 0.75));
    const fixedMaxBladeHeight = params.maxScale * GRASS_AUTHORED_HEIGHT_METRES + 0.25;
    for (let r = 0; r < this._rings.length; r++) {
      const ring = this._rings[r]!;
      const [innerR, outerR] = bands[r]!;
      if (outerR <= innerR + 0.01 || outerR <= 0.01) {
        ring.renderer.enabled = false;
        ring.ringMesh.mesh.instanceCount = 0;
        continue;
      }

      const step = ring.config.stepMetres;
      const halfAngle = this._sectorHalfAngleRadians;
      const halo = ring.config.footHaloMetres;
      const innerFeather = innerR > 0.01 ? ring.config.innerFeatherMetres : 0;
      const outerFeather = outerR < params.maximumDistanceMetres - 0.01 ? ring.config.outerFeatherMetres : 0;
      const boundsInnerR = Math.max(0, innerR - innerFeather);
      const boundsOuterR = outerR + outerFeather;

      let sectorMinX = Number.POSITIVE_INFINITY;
      let sectorMaxX = Number.NEGATIVE_INFINITY;
      let sectorMinZ = Number.POSITIVE_INFINITY;
      let sectorMaxZ = Number.NEGATIVE_INFINITY;
      const expand = (x: number, z: number) => {
        if (x < sectorMinX) sectorMinX = x;
        if (x > sectorMaxX) sectorMaxX = x;
        if (z < sectorMinZ) sectorMinZ = z;
        if (z > sectorMaxZ) sectorMaxZ = z;
      };
      if (halo > 0) {
        expand(camX - halo, camZ - halo);
        expand(camX + halo, camZ + halo);
      } else {
        expand(camX, camZ);
      }
      const angleSamples = [-1, -0.5, 0, 0.5, 1];
      for (const frac of angleSamples) {
        const a = frac * halfAngle;
        const c = Math.cos(a);
        const s = Math.sin(a);
        const dirX = fwdX * c - fwdZ * s;
        const dirZ = fwdX * s + fwdZ * c;
        expand(camX + dirX * boundsOuterR, camZ + dirZ * boundsOuterR);
        if (boundsInnerR > 0) expand(camX + dirX * boundsInnerR, camZ + dirZ * boundsInnerR);
      }

      const txStart = Math.max(0, Math.floor((sectorMinX - this._windowOriginX - 1) / COARSE_TILE_METRES));
      const txEnd = Math.min(
        COARSE_GRID_SIZE - 1,
        Math.floor((sectorMaxX - this._windowOriginX + 1) / COARSE_TILE_METRES)
      );
      const tzStart = Math.max(0, Math.floor((sectorMinZ - this._windowOriginZ - 1) / COARSE_TILE_METRES));
      const tzEnd = Math.min(
        COARSE_GRID_SIZE - 1,
        Math.floor((sectorMaxZ - this._windowOriginZ + 1) / COARSE_TILE_METRES)
      );
      const outerPadSq = (boundsOuterR + 1) * (boundsOuterR + 1);
      const innerPadSq = boundsInnerR > 1 ? (boundsInnerR - 1) * (boundsInnerR - 1) : 0;

      let visMinX = Number.POSITIVE_INFINITY;
      let visMaxX = Number.NEGATIVE_INFINITY;
      let visMinZ = Number.POSITIVE_INFINITY;
      let visMaxZ = Number.NEGATIVE_INFINITY;
      let visMinY = Number.POSITIVE_INFINITY;
      let visMaxY = Number.NEGATIVE_INFINITY;

      for (let tz = tzStart; tz <= tzEnd; tz++) {
        const tileMinZ = this._windowOriginZ + tz * COARSE_TILE_METRES;
        const tileMaxZ = tileMinZ + COARSE_TILE_METRES;
        const cz = Math.max(tileMinZ, Math.min(camZ, tileMaxZ));
        const dzClose = cz - camZ;
        const fz = Math.abs(camZ - tileMinZ) >= Math.abs(camZ - tileMaxZ) ? tileMinZ : tileMaxZ;
        const dzFar = fz - camZ;
        const rowOffset = tz * COARSE_GRID_SIZE;

        for (let tx = txStart; tx <= txEnd; tx++) {
          const tileIdx = rowOffset + tx;
          if (this._coarseHasGrass[tileIdx] === 0) continue;

          const tileMinX = this._windowOriginX + tx * COARSE_TILE_METRES;
          const tileMaxX = tileMinX + COARSE_TILE_METRES;
          const cx = Math.max(tileMinX, Math.min(camX, tileMaxX));
          const dxClose = cx - camX;
          if (dxClose * dxClose + dzClose * dzClose > outerPadSq) continue;

          if (innerPadSq > 0) {
            const fx = Math.abs(camX - tileMinX) >= Math.abs(camX - tileMaxX) ? tileMinX : tileMaxX;
            const dxFar = fx - camX;
            if (dxFar * dxFar + dzFar * dzFar < innerPadSq) continue;
          }

          const tileMinY = this._coarseMinY[tileIdx]! - 0.5;
          const bladeH = params.useEcologicalHeight ? this._coarseMaxEcoHeight[tileIdx]! + 0.25 : fixedMaxBladeHeight;
          const tileMaxY = this._coarseMaxY[tileIdx]! + bladeH;

          this._tileBounds.min.set(tileMinX - 1.0, tileMinY, tileMinZ - 1.0);
          this._tileBounds.max.set(tileMaxX + 1.0, tileMaxY, tileMaxZ + 1.0);
          if (!this._frustum.intersectsBox(this._tileBounds)) continue;

          if (tileMinX - 0.5 < visMinX) visMinX = tileMinX - 0.5;
          if (tileMaxX + 0.5 > visMaxX) visMaxX = tileMaxX + 0.5;
          if (tileMinZ - 0.5 < visMinZ) visMinZ = tileMinZ - 0.5;
          if (tileMaxZ + 0.5 > visMaxZ) visMaxZ = tileMaxZ + 0.5;
          if (tileMinY < visMinY) visMinY = tileMinY;
          if (tileMaxY > visMaxY) visMaxY = tileMaxY;
        }
      }

      if (visMinX > visMaxX || visMinZ > visMaxZ) {
        ring.renderer.enabled = false;
        ring.ringMesh.mesh.instanceCount = 0;
        continue;
      }

      const minX = Math.max(sectorMinX, visMinX);
      const maxX = Math.min(sectorMaxX, visMaxX);
      const minZ = Math.max(sectorMinZ, visMinZ);
      const maxZ = Math.min(sectorMaxZ, visMaxZ);
      const minY = visMinY;
      const maxY = visMaxY;

      const minGx = Math.floor(minX / step);
      const maxGx = Math.ceil(maxX / step);
      const minGz = Math.floor(minZ / step);
      const maxGz = Math.ceil(maxZ / step);
      const gridWidth = Math.max(1, maxGx - minGx + 1);
      const gridHeight = Math.max(1, maxGz - minGz + 1);
      const count = gridWidth * gridHeight;

      if (count > ring.capacity) {
        const nextCapacity = Math.ceil(count * 1.25);
        ring.simulator.resize(nextCapacity, []);
        ring.capacity = nextCapacity;
      }

      const sd = ring.shaderData;
      sd.setVector4(
        "u_WindowOriginSize",
        new Vector4(this._windowOriginX, this._windowOriginZ, 1 / WINDOW_TEXELS, WINDOW_TEXELS)
      );
      sd.setVector4("u_WorldBounds", new Vector4(worldMinX, worldMinZ, worldMaxX, worldMaxZ));
      sd.setVector4("u_GridRect", new Vector4(minGx, minGz, gridWidth, ring.config.lod));
      sd.setVector4("u_CameraSector", new Vector4(camX, camZ, fwdX, fwdZ));
      sd.setVector4("u_SectorParams", new Vector4(innerR, outerR, this._sectorCosHalfAngle, halo));
      sd.setVector4("u_FeatherAndWidth", new Vector4(innerFeather, outerFeather, ring.config.widthBoost, fadeStart));
      sd.setVector4(
        "u_LodParams",
        new Vector4(
          step,
          step * step * MAX_BAKED_DENSITY_PER_SQM,
          params.maximumDistanceMetres,
          params.minimumDensityFraction
        )
      );
      sd.setVector4(
        "u_ScaleParams",
        new Vector4(params.minScale, params.maxScale, params.useEcologicalHeight ? 1 : 0, GRASS_AUTHORED_HEIGHT_METRES)
      );
      sd.setVector4("u_Frustum0", this._frustumVecs[0]!);
      sd.setVector4("u_Frustum1", this._frustumVecs[1]!);
      sd.setVector4("u_Frustum2", this._frustumVecs[2]!);
      sd.setVector4("u_Frustum3", this._frustumVecs[3]!);
      sd.setVector4("u_Frustum4", this._frustumVecs[4]!);
      sd.setVector4("u_Frustum5", this._frustumVecs[5]!);

      if (!ring.simulator.beginUpdate(sd, [], [], [])) {
        ring.renderer.enabled = false;
        continue;
      }
      try {
        ring.simulator.draw(MeshTopology.Points, 0, count);
      } finally {
        ring.simulator.endUpdate();
      }

      ring.ringMesh.mesh.setVertexBufferBinding(ring.simulator.readBinding, ring.ringMesh.instanceBinding);
      ring.ringMesh.mesh.instanceCount = count;

      ring.bounds.min.set(minX - 1, minY, minZ - 1);
      ring.bounds.max.set(maxX + 1, maxY, maxZ + 1);
      ring.ringMesh.mesh.bounds = ring.bounds;
      params.revealRangeSetter(ring.renderer, minY, maxY);
      ring.renderer.enabled = true;
    }
  }
}
