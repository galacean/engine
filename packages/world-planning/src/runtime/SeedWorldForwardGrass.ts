import {
  BoundingBox,
  Buffer,
  BufferBindFlag,
  BufferUsage,
  VertexBufferBinding,
  VertexElement,
  VertexElementFormat,
  type Camera,
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
import {
  SeedWorldArrayPickBatch,
  type SeedWorldPickVisitor
} from "@galacean/engine-modify/rendering/SeedWorldPickBatch";
import { GRASS_AUTHORED_HEIGHT_METRES } from "../world/SeedWorldAssetPlacementProfile.ts";
import {
  createSeedWorldDetailDensitySamplerInto,
  createSeedWorldDetailHeightSamplerInto
} from "../world/SeedWorldDetailCandidateLattice.ts";
import {
  createSeedWorldForwardGrassRingMesh,
  DETAIL_TRANSFORM_STRIDE_BYTES,
  type SeedWorldForwardGrassRingMesh
} from "./SeedWorldDetailInstancedMesh.ts";
import {
  createSeedWorldHeightSampler,
  seedWorldOriginX,
  seedWorldOriginZ,
  type SeedWorldFields
} from "./SeedWorldFields.ts";
import { seedWorldGrassCoverageScale } from "./SeedWorldGrassAppearance.ts";
import type { SeedWorldDetailSpeciesProfile } from "../world/SeedWorldDetailSpecies.ts";
import type { SeedWorldDetailDensityField } from "./SeedWorldPopulationPlan.ts";

const WINDOW_TEXELS = 256;
const WINDOW_HALF_METRES = 128;
const COARSE_TILE_METRES = 4;
const WINDOW_RECENTER_THRESHOLD_METRES = COARSE_TILE_METRES;
const WINDOW_TEXEL_MASK = WINDOW_TEXELS - 1;
const COARSE_GRID_SIZE = WINDOW_TEXELS / COARSE_TILE_METRES;
const COARSE_GRID_MASK = COARSE_GRID_SIZE - 1;
const MAX_BAKED_DENSITY_PER_SQM = 24;
const MAX_BAKED_ECO_HEIGHT_METRES = 2;
const FRUSTUM_HALF_XZ = 0.9;
const FRUSTUM_BOTTOM_PAD = 0.2;
const FRUSTUM_TOP_PAD = 0.25;
// Radial translation allowance and normalized-plane expansion; reuse must satisfy both bounds.
const CANDIDATE_REUSE_DISTANCE = 0.6;
const CANDIDATE_GROUP_WIDTH = 8;
const CANDIDATE_CELLS_PER_GROUP = CANDIDATE_GROUP_WIDTH * CANDIDATE_GROUP_WIDTH;
// A 64×64 window addresses each tile in 12 bits. The high nibble stores its four quadrants.
const TILE_INDEX_BITS = 12;
const TILE_INDEX_MASK = (1 << TILE_INDEX_BITS) - 1;
const TILE_COLUMN_MASK = COARSE_GRID_SIZE - 1;
const QUADRANT_MASK = 0xf;
const FAR_GROUP_BIT = 1 << 8;
const ALL_GROUP_BITS = (FAR_GROUP_BIT << 1) - 1;
// The shader decodes a group origin as z * 1024 + x.
const GROUP_ROW_STRIDE = CANDIDATE_GROUP_WIDTH * 1024;
const CANDIDATE_RADIAL_PADDING = 1 + CANDIDATE_REUSE_DISTANCE;

const TF_SHADER_NAME = "SeedWorld/ForwardGrassTF";
const TF_VARYINGS = ["v_PositionRotation", "v_Scale", "v_SurfaceWeights", "v_TerrainNormal"];

const EMPTY_INPUTS: never[] = [];
const EMPTY_GROUPS = new Float32Array(0);

const RendererShaderData = ShaderData as unknown as new (group: ShaderDataGroup) => ShaderData;

const TF_VERTEX_SHADER = `
precision highp float;
precision highp int;

uniform sampler2D u_TerrainTex;
uniform sampler2D u_MaskTex;
in float a_GrassGroup;
uniform vec4 u_GrassParams[8];
uniform vec4 u_Frustum[6];
#define u_WindowOriginSize u_GrassParams[0]
#define u_WorldBounds u_GrassParams[1]
#define u_GridRect u_GrassParams[2]
#define u_CameraPosition u_GrassParams[3]
#define u_RingDistances u_GrassParams[4]
#define u_FeatherAndWidth u_GrassParams[5]
#define u_LodParams u_GrassParams[6]
#define u_ScaleParams u_GrassParams[7]
#define u_Frustum0 u_Frustum[0]
#define u_Frustum1 u_Frustum[1]
#define u_Frustum2 u_Frustum[2]
#define u_Frustum3 u_Frustum[3]
#define u_Frustum4 u_Frustum[4]
#define u_Frustum5 u_Frustum[5]

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
  v_PositionRotation = vec4(u_CameraPosition.x, 0.0, u_CameraPosition.y, 0.0);
  v_Scale = vec3(0.0);
  v_SurfaceWeights = vec3(0.0);
  v_TerrainNormal = vec3(0.0, 1.0, 0.0);
}

bool forwardGrassBoxInFrustum(vec3 center, vec3 halfExtents) {
  if (dot(u_Frustum0.xyz, center) + u_Frustum0.w + dot(abs(u_Frustum0.xyz), halfExtents) < 0.0) return false;
  if (dot(u_Frustum1.xyz, center) + u_Frustum1.w + dot(abs(u_Frustum1.xyz), halfExtents) < 0.0) return false;
  if (dot(u_Frustum2.xyz, center) + u_Frustum2.w + dot(abs(u_Frustum2.xyz), halfExtents) < 0.0) return false;
  if (dot(u_Frustum3.xyz, center) + u_Frustum3.w + dot(abs(u_Frustum3.xyz), halfExtents) < 0.0) return false;
  if (dot(u_Frustum4.xyz, center) + u_Frustum4.w + dot(abs(u_Frustum4.xyz), halfExtents) < 0.0) return false;
  if (dot(u_Frustum5.xyz, center) + u_Frustum5.w + dot(abs(u_Frustum5.xyz), halfExtents) < 0.0) return false;
  return true;
}

void main() {
  int cellIndex = int(a_GrassGroup) + (gl_VertexID & 7) + ((gl_VertexID >> 3) << 10);
  ivec2 cell = ivec2(u_WindowOriginSize.xy / u_LodParams.x) + ivec2(cellIndex & 1023, cellIndex >> 10);

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

  vec2 toCell = worldXZ - u_CameraPosition.xy;
  float dist = length(toCell);
  float innerFeather = u_FeatherAndWidth.x;
  float outerFeather = u_FeatherAndWidth.y;
  float minBound = max(0.0, u_RingDistances.x - innerFeather);
  float maxBound = u_RingDistances.y + outerFeather;
  if (dist < minBound || dist > maxBound) {
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
      if (dist + jitterOuter >= u_RingDistances.y) {
        emitCulled();
        return;
      }
    } else if (dist > u_RingDistances.y) {
      emitCulled();
      return;
    }
  } else if (ringLod < 1.5) {
    float jitterInner = (forwardGrassUnitFloat(forwardGrassHash(baseSeed ^ 0x517cc1b7u)) * 2.0 - 1.0) * innerFeather;
    if (u_RingDistances.x > 0.001 && dist + jitterInner < u_RingDistances.x) {
      emitCulled();
      return;
    }
    if (outerFeather > 0.001) {
      lodBlendScale = 1.0 - smoothstep(u_RingDistances.y - outerFeather, u_RingDistances.y + outerFeather, dist);
    } else if (dist > u_RingDistances.y) {
      emitCulled();
      return;
    }
  } else {
    if (innerFeather > 0.001 && u_RingDistances.x > 0.001) {
      lodBlendScale = smoothstep(u_RingDistances.x - innerFeather, u_RingDistances.x + innerFeather, dist);
    }
    if (dist > u_RingDistances.y) {
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

  // Toroidal physical addressing lets incremental 4m strips update edges without full-window copies.
  vec2 maskUV = (mod(worldXZ, u_WindowOriginSize.w) + vec2(0.5)) * u_WindowOriginSize.z;
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

  vec2 flooredWorld = floor(worldXZ);
  ivec2 p0 = ivec2(flooredWorld) & ${WINDOW_TEXEL_MASK};
  ivec2 p1 = (p0 + ivec2(1)) & ${WINDOW_TEXEL_MASK};
  vec2 frac = clamp(worldXZ - flooredWorld, vec2(0.0), vec2(1.0));
  vec4 t00 = texelFetch(u_TerrainTex, p0, 0);
  vec4 t10 = texelFetch(u_TerrainTex, ivec2(p1.x, p0.y), 0);
  vec4 t01 = texelFetch(u_TerrainTex, ivec2(p0.x, p1.y), 0);
  vec4 t11 = texelFetch(u_TerrainTex, p1, 0);
  vec4 terrainSample = mix(mix(t00, t10, frac.x), mix(t01, t11, frac.x), frac.y);

  float bladeMaxHeight = u_ScaleParams.z > 0.5
    ? max(maskSample.b, maskSample.a) * ${MAX_BAKED_ECO_HEIGHT_METRES.toFixed(1)} + ${FRUSTUM_TOP_PAD.toFixed(2)}
    : max(u_ScaleParams.x, u_ScaleParams.y) * u_ScaleParams.w + ${FRUSTUM_TOP_PAD.toFixed(2)};
  float boxCenterY = terrainSample.r + 0.5 * (bladeMaxHeight - ${FRUSTUM_BOTTOM_PAD.toFixed(2)});
  float boxHalfY = 0.5 * (bladeMaxHeight + ${FRUSTUM_BOTTOM_PAD.toFixed(2)});
  if (!forwardGrassBoxInFrustum(vec3(worldXZ.x, boxCenterY, worldXZ.y), vec3(${FRUSTUM_HALF_XZ.toFixed(2)}, boxHalfY, ${FRUSTUM_HALF_XZ.toFixed(2)}))) {
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
  /** The owner invalidates the mask whenever a world-space sample can change. */
  readonly reuseWindowSamples?: boolean;
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
  readonly innerFeatherMetres: number;
  readonly outerFeatherMetres: number;
  readonly widthBoost: number;
  readonly initialCapacity: number;
}

const RING_CONFIGS: readonly ForwardGrassRingConfig[] = [
  {
    lod: 0,
    stepMetres: 0.25,
    innerFeatherMetres: 0,
    outerFeatherMetres: 4.0,
    widthBoost: 1.0,
    initialCapacity: 16384
  },
  {
    lod: 1,
    stepMetres: 0.25,
    innerFeatherMetres: 4.0,
    outerFeatherMetres: 4.5,
    widthBoost: 1.0,
    initialCapacity: 24576
  },
  {
    lod: 2,
    stepMetres: 0.5,
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
  readonly pickBatch: SeedWorldArrayPickBatch;
  readonly ringMesh: SeedWorldForwardGrassRingMesh;
  readonly simulator: TransformFeedbackSimulator;
  readonly shaderData: ShaderData;
  readonly bounds: BoundingBox;
  readonly tileData: Uint16Array;
  readonly candidateElements: VertexElement[];
  candidateGroups: Float32Array;
  readonly uniformValues: Float32Array;
  readonly boundValues: Float64Array;
  revealRangeSetter?: ForwardGrassUpdateParams["revealRangeSetter"];
  tileCount: number;
  uploadedTileCount: number;
  candidateCount: number;
  tilesDirty: boolean;
  capacity: number;
  groupCapacity: number;
  valid: boolean;
  appliedColorize?: boolean;
}

/**
 * GPU-driven camera-centric grass system using Galacean's TransformFeedbackSimulator.
 * Keeps a compact 256m x 256m sliding world-height + grass-mask texture window in VRAM and snaps
 * every visible instance to fixed world lattice coordinates so blades never slide on camera move.
 */
export class SeedWorldForwardGrass {
  private readonly _engine: Engine;
  private readonly _root: Entity;
  private readonly _terrainTex: Texture2D;
  private readonly _maskTex: Texture2D;
  private readonly _terrainData = new Float32Array(WINDOW_TEXELS * WINDOW_TEXELS * 4);
  private readonly _maskData = new Uint8Array(WINDOW_TEXELS * WINDOW_TEXELS * 4);
  private readonly _stripTerrain = new Float32Array(COARSE_TILE_METRES * WINDOW_TEXELS * 4);
  private readonly _stripMask = new Uint8Array(COARSE_TILE_METRES * WINDOW_TEXELS * 4);
  private readonly _coarseMinY = new Float32Array(COARSE_GRID_SIZE * COARSE_GRID_SIZE);
  private readonly _coarseMaxY = new Float32Array(COARSE_GRID_SIZE * COARSE_GRID_SIZE);
  private readonly _coarseMaxEcoHeight = new Float32Array(COARSE_GRID_SIZE * COARSE_GRID_SIZE);
  private readonly _rowMinY = new Float32Array(COARSE_GRID_SIZE);
  private readonly _rowMaxY = new Float32Array(COARSE_GRID_SIZE);
  private readonly _rowMaxEco = new Float32Array(COARSE_GRID_SIZE);
  private readonly _radialGroupMasks = new Uint16Array(COARSE_GRID_SIZE * COARSE_GRID_SIZE);
  private readonly _radialEpochs = new Uint32Array(COARSE_GRID_SIZE * COARSE_GRID_SIZE);
  private _radialEpoch = 1;
  private readonly _groupInnerSquared = new Float64Array(3);
  private readonly _groupOuterSquared = new Float64Array(3);
  private readonly _coarseHasGrass = new Uint8Array(COARSE_GRID_SIZE * COARSE_GRID_SIZE);
  private readonly _rings: ForwardGrassRingState[] = [];
  private readonly _candidateBindings: VertexBufferBinding[] = [];
  private _candidateGroups = EMPTY_GROUPS;
  private readonly _grassFields: {
    field: SeedWorldDetailDensityField;
    sizeMetres: number;
    sampler: (sample: Float64Array) => void;
    multiplier: number;
    usesCoverage: boolean;
    heightSampler?: (sample: Float64Array) => void;
  }[] = [];
  private _windowSampleSource?: ForwardGrassSamplerContext;
  private _heightFields?: SeedWorldFields;
  private _heightSampler?: (sample: Float64Array) => boolean;
  private readonly _heightSample = new Float64Array(3);
  private readonly _densitySample = new Float64Array(4);
  private readonly _surfaceWeightsScratch: [number, number, number] = [1, 0, 0];
  private readonly _normalScratch: [number, number, number] = [0, 1, 0];
  private readonly _viewProjection = new Matrix();
  private readonly _lastProjection = new Float32Array(16).fill(NaN);
  private readonly _candidateTransform = new Float32Array(16).fill(NaN);
  private readonly _rotation = new Float64Array(4);
  private readonly _lastView = new Float32Array(16).fill(NaN);
  private readonly _frustumUniforms = new Float32Array(24);
  private readonly _candidatePlanes = new Float64Array(24);
  private readonly _windowHeightRange = new Float64Array(2);
  private _candidatesDirty = true;
  private readonly _cameraXZ = new Float64Array(2);
  private readonly _planes = new Float64Array(24);
  private readonly _bands = new Float64Array(6);
  private readonly _visibleRingBounds = new Float64Array(18);
  private readonly _ringInnerSquared = new Float64Array(RING_CONFIGS.length);
  private readonly _ringOuterSquared = new Float64Array(RING_CONFIGS.length);

  private _windowOriginX = Number.NaN;
  private _windowOriginZ = Number.NaN;
  private _maskDirty = true;
  private _tfDirty = true;
  private _lastCamera?: Camera;
  private _lastCustomView = false;

  private readonly _lastValues = new Float64Array(14).fill(NaN);
  private _lastUseEcoHeight = false;
  private _destroyed = false;

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
    this._root = parent.createChild("Frustum Grass (TF)");

    const terrainTex = new Texture2D(engine, WINDOW_TEXELS, WINDOW_TEXELS, TextureFormat.R32G32B32A32, false, false);
    terrainTex.filterMode = TextureFilterMode.Point;
    terrainTex.wrapModeU = terrainTex.wrapModeV = TextureWrapMode.Repeat;
    terrainTex.isGCIgnored = true;
    this._terrainTex = terrainTex;

    const maskTex = new Texture2D(engine, WINDOW_TEXELS, WINDOW_TEXELS, TextureFormat.R8G8B8A8, false, false);
    maskTex.filterMode = TextureFilterMode.Bilinear;
    maskTex.wrapModeU = maskTex.wrapModeV = TextureWrapMode.Repeat;
    maskTex.isGCIgnored = true;
    this._maskTex = maskTex;

    const tfPass = getForwardGrassTfPass();
    for (const config of RING_CONFIGS) {
      const simulator = new TransformFeedbackSimulator(
        engine,
        DETAIL_TRANSFORM_STRIDE_BYTES,
        config.initialCapacity,
        tfPass,
        TF_VARYINGS,
        "output-only"
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
      const pickBatch = new SeedWorldArrayPickBatch(renderer);
      pickBatch.count = 1;
      pickBatch.interactionOccluder = false;

      const uniformValues = new Float32Array(32);
      const shaderData = new RendererShaderData(ShaderDataGroup.Renderer);
      shaderData.setTexture("u_TerrainTex", this._terrainTex);
      shaderData.setTexture("u_MaskTex", this._maskTex);
      shaderData.setFloatArray("u_GrassParams", uniformValues);
      shaderData.setFloatArray("u_Frustum", this._frustumUniforms);

      this._rings.push({
        config,
        entity,
        renderer,
        pickBatch,
        ringMesh,
        simulator,
        shaderData,
        bounds,
        tileData: new Uint16Array(COARSE_GRID_SIZE * COARSE_GRID_SIZE),
        candidateElements: [new VertexElement("a_GrassGroup", 0, VertexElementFormat.Float, 0, 1)],
        candidateGroups: EMPTY_GROUPS,
        uniformValues,
        boundValues: new Float64Array(6).fill(NaN),
        tileCount: 0,
        uploadedTileCount: -1,
        candidateCount: 0,
        tilesDirty: true,
        capacity: config.initialCapacity,
        groupCapacity: Math.ceil(config.initialCapacity / CANDIDATE_CELLS_PER_GROUP),
        valid: false
      });
    }
  }

  visitRenderers(visitor: (renderer: MeshRenderer) => void): void {
    for (const ring of this._rings) visitor(ring.renderer);
  }

  /** One grassland identity per submitted draw, using the same GPU instances as the color pass. */
  visitPickBatches(visitor: SeedWorldPickVisitor, grasslandId?: string): void {
    for (const { renderer, ringMesh, pickBatch } of this._rings) {
      if (!renderer.enabled || !renderer.entity.isActiveInHierarchy || ringMesh.mesh.instanceCount === 0) continue;
      pickBatch.id = grasslandId;
      visitor(pickBatch);
    }
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
      for (let i = 0; i < this._rings.length; i++) this._rings[i]!.renderer.enabled = false;
      return;
    }

    const camera = params.camera;
    const transform = camera.entity.transform.worldMatrix.elements;
    const customView = camera.usesCustomViewMatrix;
    const camX = transform[12]!,
      camY = transform[13]!,
      camZ = transform[14]!;
    // The camera ignores entity scale. Its rotation can change even when a singular world matrix stays identical.
    const rotation = this._rotation;
    camera.entity.transform.worldRotationQuaternion.copyToArray(rotation);
    const rotationChanged =
      rotation[0] !== this._lastValues[3] ||
      rotation[1] !== this._lastValues[4] ||
      rotation[2] !== this._lastValues[5] ||
      rotation[3] !== this._lastValues[6];
    let viewChanged = false;
    if (rotationChanged || customView || this._lastCustomView) {
      const elements = camera.viewMatrix.elements;
      // A manual view may translate independently of its entity, including when the override is reset.
      const count = customView || this._lastCustomView ? 16 : 12;
      for (let i = 0; i < count; i++) {
        if (elements[i] !== this._lastView[i]) {
          viewChanged = true;
          break;
        }
      }
    }

    const needWindowRebake =
      this._maskDirty ||
      !Number.isFinite(this._windowOriginX) ||
      Math.abs(camX - (this._windowOriginX + WINDOW_HALF_METRES)) >= WINDOW_RECENTER_THRESHOLD_METRES ||
      Math.abs(camZ - (this._windowOriginZ + WINDOW_HALF_METRES)) >= WINDOW_RECENTER_THRESHOLD_METRES;

    if (needWindowRebake) {
      this._rebakeWindow(camX, camZ, params.samplerContext);
      this._maskDirty = false;
      this._tfDirty = true;
    } else if (this._terrainTex.isContentLost || this._maskTex.isContentLost) {
      // Device restoration invalidates GPU storage while the sampled window remains current on the CPU.
      this._terrainTex.setPixelBuffer(this._terrainData);
      this._maskTex.setPixelBuffer(this._maskData);
      this._tfDirty = true;
    }

    const movedEnough =
      !Number.isFinite(this._lastValues[0]!) ||
      (camX - this._lastValues[0]!) ** 2 + (camY - this._lastValues[1]!) ** 2 + (camZ - this._lastValues[2]!) ** 2 >
        0.0001;
    const projection = camera.projectionMatrix;
    let clipPlanesChanged = false;
    for (let i = 0; i < 16; i++) {
      if (projection.elements[i] !== this._lastProjection[i]) {
        clipPlanesChanged = true;
        break;
      }
    }
    const paramsChanged =
      this._lastValues[8]! !== params.lod1DistanceMetres ||
      this._lastValues[9]! !== params.lod2DistanceMetres ||
      this._lastValues[10]! !== params.maximumDistanceMetres ||
      this._lastValues[11]! !== params.minimumDensityFraction ||
      this._lastValues[12]! !== params.minScale ||
      this._lastValues[13]! !== params.maxScale ||
      this._lastUseEcoHeight !== params.useEcologicalHeight;

    const cameraChanged = camera !== this._lastCamera;
    const shouldDispatchTf =
      this._tfDirty || cameraChanged || movedEnough || viewChanged || clipPlanesChanged || paramsChanged;
    if (shouldDispatchTf) {
      const view = camera.viewMatrix;
      this._cameraXZ[0] = camX;
      this._cameraXZ[1] = camZ;
      Matrix.multiply(projection, view, this._viewProjection);
      this._syncFrustumPlanes();
      this._candidatesDirty =
        this._tfDirty ||
        cameraChanged ||
        clipPlanesChanged ||
        paramsChanged ||
        (camX - this._candidateTransform[12]!) ** 2 +
          (camY - this._candidateTransform[13]!) ** 2 +
          (camZ - this._candidateTransform[14]!) ** 2 >
          CANDIDATE_REUSE_DISTANCE ** 2 ||
        !this._candidateVolumeContainsFrustum(params);
      if (this._candidatesDirty) {
        if (
          this._tfDirty ||
          paramsChanged ||
          this._candidateTransform[12] !== camX ||
          this._candidateTransform[14] !== camZ
        ) {
          if (++this._radialEpoch > 0xffffffff) {
            this._radialEpochs.fill(0);
            this._radialEpoch = 1;
          }
        }
        this._candidateTransform.set(transform);
        this._candidatePlanes.set(this._planes);
      }
      // Leave generation dirty if an upload or feedback draw throws.
      this._tfDirty = true;
      this._dispatchAllRings(params);
      this._lastValues[0] = camX;
      this._lastValues[1] = camY;
      this._lastValues[2] = camZ;
      this._lastProjection.set(projection.elements);
      this._lastView.set(view.elements);
      this._lastCamera = camera;
      this._lastValues[8] = params.lod1DistanceMetres;
      this._lastValues[9] = params.lod2DistanceMetres;
      this._lastValues[10] = params.maximumDistanceMetres;
      this._lastValues[11] = params.minimumDensityFraction;
      this._lastValues[12] = params.minScale;
      this._lastValues[13] = params.maxScale;
      this._lastUseEcoHeight = params.useEcologicalHeight;
      this._tfDirty = false;
    }

    if (rotationChanged) this._lastValues.set(rotation, 3);
    this._lastCustomView = customView;

    for (let i = 0; i < this._rings.length; i++) {
      const ring = this._rings[i]!;
      // Presentation changes do not invalidate the cached GPU data.
      ring.renderer.enabled = ring.valid;
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
    this._lastCamera = undefined;
    for (const ring of this._rings) {
      ring.renderer.mesh = null!;
      ring.ringMesh.mesh.destroy();
      ring.simulator.destroy();
    }
    this._candidateBindings[0]?.buffer.destroy();
    this._candidateBindings.length = 0;
    this._candidateGroups = EMPTY_GROUPS;
    this._rings.length = 0;
    this._grassFields.length = 0;
    this._windowSampleSource = undefined;
    this._heightFields = undefined;
    this._heightSampler = undefined;
    this._terrainTex.destroy();
    this._maskTex.destroy();
    if (!this._root.destroyed) this._root.destroy();
  }

  private _sampleWindowTexel(
    wx: number,
    wz: number,
    physIdx: number,
    fields: SeedWorldFields,
    worldMinX: number,
    worldMinZ: number,
    worldMaxX: number,
    worldMaxZ: number,
    worldCenterOffsetX: number,
    worldCenterOffsetZ: number,
    ctx: ForwardGrassSamplerContext,
    grassFieldCount: number
  ): void {
    const clampedX = Math.max(worldMinX, Math.min(worldMaxX, wx));
    const clampedZ = Math.max(worldMinZ, Math.min(worldMaxZ, wz));
    const inBounds = wx >= worldMinX && wx <= worldMaxX && wz >= worldMinZ && wz <= worldMaxZ;

    this._heightSample[0] = clampedX;
    this._heightSample[1] = clampedZ;
    const h = this._heightSampler!(this._heightSample) ? this._heightSample[2]! : 0;
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
      const grassFields = this._grassFields;
      const localCenterX = clampedX - worldCenterOffsetX;
      const localCenterZ = clampedZ - worldCenterOffsetZ;
      const localOriginX = clampedX - worldMinX;
      const localOriginZ = clampedZ - worldMinZ;
      for (let f = 0; f < grassFieldCount; f++) {
        const gf = grassFields[f]!;
        if (gf.usesCoverage && (covScale <= 0 || isWater)) continue;
        this._densitySample[0] = localCenterX;
        this._densitySample[1] = localCenterZ;
        gf.sampler(this._densitySample);
        const d = this._densitySample[2]! * gf.multiplier;
        if (d <= 0) continue;
        totalDensity += d;
        if (!gf.usesCoverage) hasAquatic = true;
        if (gf.heightSampler) {
          this._densitySample[0] = localOriginX;
          this._densitySample[1] = localOriginZ;
          gf.heightSampler(this._densitySample);
          ecoMin = this._densitySample[2]!;
          ecoMax = this._densitySample[3]!;
        }
      }
    }

    const effectiveGrassWeight =
      hasAquatic && covScale <= 0 ? Math.max(this._surfaceWeightsScratch[0], 0.7) : this._surfaceWeightsScratch[0];
    const terrainData = this._terrainData;
    const maskData = this._maskData;
    terrainData[physIdx] = h;
    terrainData[physIdx + 1] = this._normalScratch[0];
    terrainData[physIdx + 2] = this._normalScratch[2];
    terrainData[physIdx + 3] = effectiveGrassWeight;

    maskData[physIdx] = Math.max(0, Math.min(255, Math.round((totalDensity / MAX_BAKED_DENSITY_PER_SQM) * 255)));
    maskData[physIdx + 1] = Math.max(0, Math.min(255, Math.round(this._surfaceWeightsScratch[1] * 255)));
    maskData[physIdx + 2] = Math.max(0, Math.min(255, Math.round((ecoMin / MAX_BAKED_ECO_HEIGHT_METRES) * 255)));
    maskData[physIdx + 3] = Math.max(0, Math.min(255, Math.round((ecoMax / MAX_BAKED_ECO_HEIGHT_METRES) * 255)));
  }

  private _recomputeCoarseTile(tx: number, tz: number, tileOffsetX: number, tileOffsetZ: number): void {
    const x0 = tx * COARSE_TILE_METRES;
    const z0 = tz * COARSE_TILE_METRES;
    const xEnd = tx === COARSE_GRID_MASK ? COARSE_TILE_METRES - 1 : COARSE_TILE_METRES;
    const zEnd = tz === COARSE_GRID_MASK ? COARSE_TILE_METRES - 1 : COARSE_TILE_METRES;
    const gxStart = tx === 0 ? 0 : -1;
    const gzStart = tz === 0 ? 0 : -1;
    const worldX0 = this._windowOriginX + x0;
    const worldZ0 = this._windowOriginZ + z0;
    const terrainData = this._terrainData;
    const maskData = this._maskData;

    let tileMinY = Number.POSITIVE_INFINITY;
    let tileMaxY = Number.NEGATIVE_INFINITY;
    let tileMaxEco = 0;
    let hasGrass = 0;

    for (let dz = 0; dz <= zEnd; dz++) {
      const pz = (worldZ0 + dz) & WINDOW_TEXEL_MASK;
      const row = pz * WINDOW_TEXELS;
      for (let dx = 0; dx <= xEnd; dx++) {
        const px = (worldX0 + dx) & WINDOW_TEXEL_MASK;
        const idx = (row + px) * 4;
        const h = terrainData[idx]!;
        if (h < tileMinY) tileMinY = h;
        if (h > tileMaxY) tileMaxY = h;
      }
    }
    for (let dz = gzStart; dz <= zEnd; dz++) {
      const pz = (worldZ0 + dz) & WINDOW_TEXEL_MASK;
      const row = pz * WINDOW_TEXELS;
      for (let dx = gxStart; dx <= xEnd; dx++) {
        const px = (worldX0 + dx) & WINDOW_TEXEL_MASK;
        const idx = (row + px) * 4;
        if (maskData[idx]! > 0) hasGrass = 1;
        const eco = (Math.max(maskData[idx + 2]!, maskData[idx + 3]!) / 255) * MAX_BAKED_ECO_HEIGHT_METRES;
        if (eco > tileMaxEco) tileMaxEco = eco;
      }
    }

    const physTx = (tileOffsetX + tx) & COARSE_GRID_MASK;
    const physTz = (tileOffsetZ + tz) & COARSE_GRID_MASK;
    const physIndex = physTz * COARSE_GRID_SIZE + physTx;
    this._coarseMinY[physIndex] = Number.isFinite(tileMinY) ? tileMinY : 0;
    this._coarseMaxY[physIndex] = Number.isFinite(tileMaxY) ? tileMaxY : 100;
    this._coarseMaxEcoHeight[physIndex] = tileMaxEco;
    this._coarseHasGrass[physIndex] = hasGrass;
  }

  private _refreshRowBounds(tileOffsetZ: number): void {
    this._windowHeightRange[0] = Infinity;
    this._windowHeightRange[1] = -Infinity;
    for (let tz = 0; tz < COARSE_GRID_SIZE; tz++) {
      const physTz = (tileOffsetZ + tz) & COARSE_GRID_MASK;
      const rowOffset = physTz * COARSE_GRID_SIZE;
      let rowMin = Infinity;
      let rowMax = -Infinity;
      let rowEco = 0;
      for (let physTx = 0; physTx < COARSE_GRID_SIZE; physTx++) {
        const idx = rowOffset + physTx;
        const minY = this._coarseMinY[idx]!;
        const maxY = this._coarseMaxY[idx]!;
        const eco = this._coarseMaxEcoHeight[idx]!;
        if (minY < rowMin) rowMin = minY;
        if (maxY > rowMax) rowMax = maxY;
        if (eco > rowEco) rowEco = eco;
      }
      this._rowMinY[physTz] = rowMin;
      this._rowMaxY[physTz] = rowMax;
      this._rowMaxEco[physTz] = rowEco;
      if (rowMin < this._windowHeightRange[0]!) this._windowHeightRange[0] = rowMin;
      if (rowMax > this._windowHeightRange[1]!) this._windowHeightRange[1] = rowMax;
    }
  }

  private _rebakeWindow(camX: number, camZ: number, ctx: ForwardGrassSamplerContext): void {
    const originX = Math.floor((camX - WINDOW_HALF_METRES) / COARSE_TILE_METRES) * COARSE_TILE_METRES;
    const originZ = Math.floor((camZ - WINDOW_HALF_METRES) / COARSE_TILE_METRES) * COARSE_TILE_METRES;
    const oldOriginX = this._windowOriginX;
    const oldOriginZ = this._windowOriginZ;
    const shiftX = originX - oldOriginX;
    const shiftZ = originZ - oldOriginZ;
    const reuse =
      ctx.reuseWindowSamples &&
      !this._maskDirty &&
      this._windowSampleSource === ctx &&
      Number.isFinite(oldOriginX) &&
      Number.isFinite(oldOriginZ) &&
      Math.abs(shiftX) < WINDOW_TEXELS &&
      Math.abs(shiftZ) < WINDOW_TEXELS;
    if (reuse && shiftX === 0 && shiftZ === 0) {
      this._maskDirty = false;
      return;
    }
    // A failed sample/upload must retry from a complete window.
    this._maskDirty = true;
    this._windowSampleSource = ctx.reuseWindowSamples ? ctx : undefined;
    this._windowOriginX = originX;
    this._windowOriginZ = originZ;

    const fields = ctx.fields;
    if (this._heightFields !== fields) {
      this._heightFields = fields;
      this._heightSampler = createSeedWorldHeightSampler(fields);
    }
    const worldMinX = seedWorldOriginX(fields);
    const worldMinZ = seedWorldOriginZ(fields);
    const worldMaxX = worldMinX + fields.sizeMetres;
    const worldMaxZ = worldMinZ + fields.sizeMetres;

    const grassFields = this._grassFields;
    let grassFieldCount = 0;
    for (let fieldIndex = 0; fieldIndex < ctx.densityFields.length; fieldIndex++) {
      const field = ctx.densityFields[fieldIndex]!;
      if (field.category !== "grass" || field.maximumDensityPerSquareMetre <= 0) continue;
      const multiplier = ctx.resolveDensityMultiplier(field);
      if (multiplier <= 0) continue;
      let profile: SeedWorldDetailSpeciesProfile | undefined;
      for (let i = 0; i < ctx.speciesProfiles.length; i++) {
        if (ctx.speciesProfiles[i]!.key === field.prototypeFamily) {
          profile = ctx.speciesProfiles[i];
          break;
        }
      }
      let cached = grassFields[grassFieldCount];
      if (!cached) {
        cached = {
          field,
          sizeMetres: fields.sizeMetres,
          sampler: createSeedWorldDetailDensitySamplerInto(field, fields.sizeMetres),
          multiplier,
          usesCoverage: false,
          heightSampler: createSeedWorldDetailHeightSamplerInto(field, fields.sizeMetres)
        };
        grassFields.push(cached);
      } else if (cached.field !== field || cached.sizeMetres !== fields.sizeMetres) {
        cached.field = field;
        cached.sizeMetres = fields.sizeMetres;
        cached.sampler = createSeedWorldDetailDensitySamplerInto(field, fields.sizeMetres);
        cached.heightSampler = createSeedWorldDetailHeightSamplerInto(field, fields.sizeMetres);
      }
      cached.multiplier = multiplier;
      cached.usesCoverage = profile?.habitat === "terrestrial";
      grassFieldCount++;
    }
    grassFields.length = grassFieldCount;

    const worldCenterOffsetX = worldMinX + fields.sizeMetres * 0.5;
    const worldCenterOffsetZ = worldMinZ + fields.sizeMetres * 0.5;
    const terrainData = this._terrainData;
    const maskData = this._maskData;
    const tileOffsetX = originX / COARSE_TILE_METRES;
    const tileOffsetZ = originZ / COARSE_TILE_METRES;

    if (!reuse) {
      for (let iz = 0; iz < WINDOW_TEXELS; iz++) {
        const wz = originZ + iz;
        const pz = wz & WINDOW_TEXEL_MASK;
        const row = pz * WINDOW_TEXELS;
        for (let ix = 0; ix < WINDOW_TEXELS; ix++) {
          const wx = originX + ix;
          const px = wx & WINDOW_TEXEL_MASK;
          this._sampleWindowTexel(
            wx,
            wz,
            (row + px) * 4,
            fields,
            worldMinX,
            worldMinZ,
            worldMaxX,
            worldMaxZ,
            worldCenterOffsetX,
            worldCenterOffsetZ,
            ctx,
            grassFieldCount
          );
        }
      }

      this._terrainTex.setPixelBuffer(terrainData);
      this._maskTex.setPixelBuffer(maskData);

      for (let tz = 0; tz < COARSE_GRID_SIZE; tz++) {
        for (let tx = 0; tx < COARSE_GRID_SIZE; tx++) {
          this._recomputeCoarseTile(tx, tz, tileOffsetX, tileOffsetZ);
        }
      }
      this._refreshRowBounds(tileOffsetZ);
      return;
    }

    const stripTerrain = this._stripTerrain;
    const stripMask = this._stripMask;
    if (shiftZ !== 0) {
      const startZ = shiftZ > 0 ? oldOriginZ + WINDOW_TEXELS : originZ;
      const endZ = shiftZ > 0 ? originZ + WINDOW_TEXELS : oldOriginZ;
      for (let sz = startZ; sz < endZ; sz += COARSE_TILE_METRES) {
        const dstZ = sz & WINDOW_TEXEL_MASK;
        for (let dz = 0; dz < COARSE_TILE_METRES; dz++) {
          const wz = sz + dz;
          const pz = dstZ + dz;
          const physRow = pz * WINDOW_TEXELS;
          const stripRow = dz * WINDOW_TEXELS;
          for (let ix = 0; ix < WINDOW_TEXELS; ix++) {
            const wx = originX + ix;
            const px = wx & WINDOW_TEXEL_MASK;
            const physIdx = (physRow + px) * 4;
            this._sampleWindowTexel(
              wx,
              wz,
              physIdx,
              fields,
              worldMinX,
              worldMinZ,
              worldMaxX,
              worldMaxZ,
              worldCenterOffsetX,
              worldCenterOffsetZ,
              ctx,
              grassFieldCount
            );
            const sIdx = (stripRow + px) * 4;
            stripTerrain[sIdx] = terrainData[physIdx]!;
            stripTerrain[sIdx + 1] = terrainData[physIdx + 1]!;
            stripTerrain[sIdx + 2] = terrainData[physIdx + 2]!;
            stripTerrain[sIdx + 3] = terrainData[physIdx + 3]!;
            stripMask[sIdx] = maskData[physIdx]!;
            stripMask[sIdx + 1] = maskData[physIdx + 1]!;
            stripMask[sIdx + 2] = maskData[physIdx + 2]!;
            stripMask[sIdx + 3] = maskData[physIdx + 3]!;
          }
        }
        this._terrainTex.setPixelBuffer(stripTerrain, 0, 0, dstZ, WINDOW_TEXELS, COARSE_TILE_METRES);
        this._maskTex.setPixelBuffer(stripMask, 0, 0, dstZ, WINDOW_TEXELS, COARSE_TILE_METRES);
      }
    }

    if (shiftX !== 0) {
      const startX = shiftX > 0 ? oldOriginX + WINDOW_TEXELS : originX;
      const endX = shiftX > 0 ? originX + WINDOW_TEXELS : oldOriginX;
      // Exclude rows already sampled during shiftZ so L-shaped jumps never double-sample corners.
      const sampleStartZ = shiftZ < 0 ? oldOriginZ : originZ;
      const sampleEndZ = shiftZ > 0 ? oldOriginZ + WINDOW_TEXELS : originZ + WINDOW_TEXELS;
      for (let sx = startX; sx < endX; sx += COARSE_TILE_METRES) {
        const dstX = sx & WINDOW_TEXEL_MASK;
        for (let wz = sampleStartZ; wz < sampleEndZ; wz++) {
          const physRow = (wz & WINDOW_TEXEL_MASK) * WINDOW_TEXELS;
          for (let dx = 0; dx < COARSE_TILE_METRES; dx++) {
            this._sampleWindowTexel(
              sx + dx,
              wz,
              (physRow + dstX + dx) * 4,
              fields,
              worldMinX,
              worldMinZ,
              worldMaxX,
              worldMaxZ,
              worldCenterOffsetX,
              worldCenterOffsetZ,
              ctx,
              grassFieldCount
            );
          }
        }
        for (let pz = 0; pz < WINDOW_TEXELS; pz++) {
          const physRowIdx = (pz * WINDOW_TEXELS + dstX) * 4;
          const stripRowIdx = pz * COARSE_TILE_METRES * 4;
          for (let i = 0; i < COARSE_TILE_METRES * 4; i++) {
            stripTerrain[stripRowIdx + i] = terrainData[physRowIdx + i]!;
            stripMask[stripRowIdx + i] = maskData[physRowIdx + i]!;
          }
        }
        this._terrainTex.setPixelBuffer(stripTerrain, 0, dstX, 0, COARSE_TILE_METRES, WINDOW_TEXELS);
        this._maskTex.setPixelBuffer(stripMask, 0, dstX, 0, COARSE_TILE_METRES, WINDOW_TEXELS);
      }
    }

    // Recompute only the coarse tile columns/rows whose texel footprint changed or hit window border clamp.
    const txShift = shiftX / COARSE_TILE_METRES;
    const tzShift = shiftZ / COARSE_TILE_METRES;
    if (txShift !== 0) {
      const colStart = txShift > 0 ? Math.max(0, COARSE_GRID_SIZE - txShift - 1) : 0;
      const colEnd = txShift > 0 ? COARSE_GRID_SIZE - 1 : Math.min(COARSE_GRID_SIZE - 1, -txShift + 1);
      for (let tz = 0; tz < COARSE_GRID_SIZE; tz++) {
        this._recomputeCoarseTile(0, tz, tileOffsetX, tileOffsetZ);
        this._recomputeCoarseTile(COARSE_GRID_SIZE - 1, tz, tileOffsetX, tileOffsetZ);
        for (let tx = colStart; tx <= colEnd; tx++) {
          if (tx !== 0 && tx !== COARSE_GRID_SIZE - 1) {
            this._recomputeCoarseTile(tx, tz, tileOffsetX, tileOffsetZ);
          }
        }
      }
    }
    if (tzShift !== 0) {
      const rowStart = tzShift > 0 ? Math.max(0, COARSE_GRID_SIZE - tzShift - 1) : 0;
      const rowEnd = tzShift > 0 ? COARSE_GRID_SIZE - 1 : Math.min(COARSE_GRID_SIZE - 1, -tzShift + 1);
      for (let tx = 0; tx < COARSE_GRID_SIZE; tx++) {
        this._recomputeCoarseTile(tx, 0, tileOffsetX, tileOffsetZ);
        this._recomputeCoarseTile(tx, COARSE_GRID_SIZE - 1, tileOffsetX, tileOffsetZ);
        for (let tz = rowStart; tz <= rowEnd; tz++) {
          if (tz !== 0 && tz !== COARSE_GRID_SIZE - 1) {
            this._recomputeCoarseTile(tx, tz, tileOffsetX, tileOffsetZ);
          }
        }
      }
    }
    this._refreshRowBounds(tileOffsetZ);
  }

  private _syncFrustumPlanes(): void {
    const e = this._viewProjection.elements,
      planes = this._planes;
    for (let i = 0; i < 6; i++) {
      const axis = i < 2 ? 2 : i < 4 ? 0 : 1;
      const sign = i === 0 || i === 2 || i === 5 ? 1 : -1;
      const x = e[3]! + sign * e[axis]!,
        y = e[7]! + sign * e[axis + 4]!,
        z = e[11]! + sign * e[axis + 8]!;
      const inverseLength = 1 / Math.sqrt(x * x + y * y + z * z);
      const offset = i * 4;
      planes[offset] = x * inverseLength;
      planes[offset + 1] = y * inverseLength;
      planes[offset + 2] = z * inverseLength;
      planes[offset + 3] = (e[15]! + sign * e[axis + 12]!) * inverseLength;
    }
    this._frustumUniforms.set(planes);
  }

  /**
   * Prove that every current GPU-visible clump AABB corner remains in the cached expanded planes.
   * Maximizing the difference of two affine plane equations over a bounding box also covers
   * rotation and numerical transform jitter; no angle threshold or stale GPU frustum is used.
   */
  private _candidateVolumeContainsFrustum(params: ForwardGrassUpdateParams): boolean {
    const camX = this._cameraXZ[0]!,
      camZ = this._cameraXZ[1]!;
    let feather = 0;
    for (let i = 0; i < RING_CONFIGS.length; i++) feather = Math.max(feather, RING_CONFIGS[i]!.outerFeatherMetres);
    const radius =
      Math.max(params.lod1DistanceMetres, params.lod2DistanceMetres, params.maximumDistanceMetres) +
      feather +
      FRUSTUM_HALF_XZ;
    const maxBladeHeight = params.useEcologicalHeight
      ? MAX_BAKED_ECO_HEIGHT_METRES + FRUSTUM_TOP_PAD
      : Math.max(params.minScale, params.maxScale) * GRASS_AUTHORED_HEIGHT_METRES + FRUSTUM_TOP_PAD;
    const minY = this._windowHeightRange[0]! - FRUSTUM_BOTTOM_PAD;
    const maxY = this._windowHeightRange[1]! + maxBladeHeight;
    for (let i = 0; i < 24; i += 4) {
      const dx = this._planes[i]! - this._candidatePlanes[i]!;
      const dy = this._planes[i + 1]! - this._candidatePlanes[i + 1]!;
      const dz = this._planes[i + 2]! - this._candidatePlanes[i + 2]!;
      const maximumDifference =
        dx * (dx >= 0 ? camX + radius : camX - radius) +
        dy * (dy >= 0 ? maxY : minY) +
        dz * (dz >= 0 ? camZ + radius : camZ - radius) +
        this._planes[i + 3]! -
        this._candidatePlanes[i + 3]!;
      if (!(maximumDifference <= CANDIDATE_REUSE_DISTANCE - 0.0001)) return false;
    }
    return true;
  }

  /** Bound all rings in one tile pass; frustum/height work is shared across LOD overlap. */
  private _boundVisibleRings(bands: Float64Array, params: ForwardGrassUpdateParams): void {
    const camX = this._cameraXZ[0]!,
      camZ = this._cameraXZ[1]!;
    let extent = 0;
    for (let r = 0; r < this._rings.length; r++) {
      const bounds = this._visibleRingBounds,
        offset = r * 6;
      bounds[offset] = bounds[offset + 1] = bounds[offset + 2] = Infinity;
      bounds[offset + 3] = bounds[offset + 4] = bounds[offset + 5] = -Infinity;
      const inner = bands[r * 2]!,
        outer = bands[r * 2 + 1]!;
      this._rings[r]!.tileCount = 0;
      const config = this._rings[r]!.config;
      const innerRadius = Math.max(0, inner - (inner > 0.01 ? config.innerFeatherMetres : 0));
      const outerRadius = outer + (outer < params.maximumDistanceMetres - 0.01 ? config.outerFeatherMetres : 0);
      const valid = outer > inner + 0.01 && outer > 0.01;
      this._ringInnerSquared[r] =
        innerRadius > CANDIDATE_RADIAL_PADDING ? (innerRadius - CANDIDATE_RADIAL_PADDING) ** 2 : 0;
      this._ringOuterSquared[r] = valid ? (outerRadius + CANDIDATE_RADIAL_PADDING) ** 2 : -1;
      this._groupInnerSquared[r] = Math.max(0, innerRadius - CANDIDATE_REUSE_DISTANCE - 0.0001) ** 2;
      this._groupOuterSquared[r] = (outerRadius + CANDIDATE_REUSE_DISTANCE + 0.0001) ** 2;
      if (valid) extent = Math.max(extent, outerRadius);
    }
    const x0 = Math.max(
      0,
      Math.floor((camX - extent - this._windowOriginX - CANDIDATE_RADIAL_PADDING) / COARSE_TILE_METRES)
    );
    const x1 = Math.min(
      COARSE_GRID_SIZE - 1,
      Math.floor((camX + extent - this._windowOriginX + CANDIDATE_RADIAL_PADDING) / COARSE_TILE_METRES)
    );
    const z0 = Math.max(
      0,
      Math.floor((camZ - extent - this._windowOriginZ - CANDIDATE_RADIAL_PADDING) / COARSE_TILE_METRES)
    );
    const z1 = Math.min(
      COARSE_GRID_SIZE - 1,
      Math.floor((camZ + extent - this._windowOriginZ + CANDIDATE_RADIAL_PADDING) / COARSE_TILE_METRES)
    );
    const outerSquared = (extent + CANDIDATE_RADIAL_PADDING) ** 2;
    const fixedBladeHeight =
      Math.max(params.minScale, params.maxScale) * GRASS_AUTHORED_HEIGHT_METRES + FRUSTUM_TOP_PAD;
    const tileOffsetX = Math.floor(this._windowOriginX / COARSE_TILE_METRES);
    const tileOffsetZ = Math.floor(this._windowOriginZ / COARSE_TILE_METRES);
    for (let tz = z0; tz <= z1; tz++) {
      const physTz = (tileOffsetZ + tz) & COARSE_GRID_MASK;
      const minZ = this._windowOriginZ + tz * COARSE_TILE_METRES,
        maxZ = minZ + COARSE_TILE_METRES;
      const dz = Math.max(minZ - camZ, 0, camZ - maxZ);
      const farZ = Math.max(Math.abs(minZ - camZ), Math.abs(maxZ - camZ));
      // Clip a whole row conservatively before testing its individual terrain tiles.
      // Each plane uses the row's maximum possible height/Z support, including blade padding.
      let rowX0 = x0,
        rowX1 = x1;
      const rowMinY = this._rowMinY[physTz]! - FRUSTUM_BOTTOM_PAD;
      const rowMaxY =
        this._rowMaxY[physTz]! +
        (params.useEcologicalHeight ? this._rowMaxEco[physTz]! + FRUSTUM_TOP_PAD : fixedBladeHeight);
      for (let planeIndex = 0; planeIndex < 6; planeIndex++) {
        const offset = planeIndex * 4;
        const px = this._planes[offset]!,
          py = this._planes[offset + 1]!,
          pz = this._planes[offset + 2]!,
          pw = this._planes[offset + 3]! + CANDIDATE_REUSE_DISTANCE;
        const support =
          pw + py * (py >= 0 ? rowMaxY : rowMinY) + pz * (pz >= 0 ? maxZ + FRUSTUM_HALF_XZ : minZ - FRUSTUM_HALF_XZ);
        if (px > 1e-8)
          rowX0 = Math.max(
            rowX0,
            Math.ceil((-support / px - COARSE_TILE_METRES - FRUSTUM_HALF_XZ - this._windowOriginX) / COARSE_TILE_METRES)
          );
        else if (px < -1e-8)
          rowX1 = Math.min(
            rowX1,
            Math.floor((-support / px + FRUSTUM_HALF_XZ - this._windowOriginX) / COARSE_TILE_METRES)
          );
        else if (support < 0) {
          rowX0 = rowX1 + 1;
          break;
        }
      }
      for (let tx = rowX0; tx <= rowX1; tx++) {
        const index = tz * COARSE_GRID_SIZE + tx;
        const physTx = (tileOffsetX + tx) & COARSE_GRID_MASK;
        const physIndex = physTz * COARSE_GRID_SIZE + physTx;
        if (!this._coarseHasGrass[physIndex]) continue;
        const minX = this._windowOriginX + tx * COARSE_TILE_METRES,
          maxX = minX + COARSE_TILE_METRES;
        const dx = Math.max(minX - camX, 0, camX - maxX);
        const nearSquared = dx * dx + dz * dz;
        if (nearSquared > outerSquared) continue;
        const farX = Math.max(Math.abs(minX - camX), Math.abs(maxX - camX));
        const farSquared = farX * farX + farZ * farZ;
        const minY = this._coarseMinY[physIndex]! - FRUSTUM_BOTTOM_PAD;
        const maxY =
          this._coarseMaxY[physIndex]! +
          (params.useEcologicalHeight ? this._coarseMaxEcoHeight[physIndex]! + FRUSTUM_TOP_PAD : fixedBladeHeight);
        let visible = true;
        let clipPlanes = 0;
        for (let i = 0; i < 24; i += 4) {
          const px = this._planes[i]!,
            py = this._planes[i + 1]!,
            pz = this._planes[i + 2]!;
          if (
            px * (px >= 0 ? maxX + FRUSTUM_HALF_XZ : minX - FRUSTUM_HALF_XZ) +
              py * (py >= 0 ? maxY : minY) +
              pz * (pz >= 0 ? maxZ + FRUSTUM_HALF_XZ : minZ - FRUSTUM_HALF_XZ) +
              this._planes[i + 3]! +
              CANDIDATE_REUSE_DISTANCE <
            0
          ) {
            visible = false;
            break;
          }
          if (
            px * (px >= 0 ? minX - FRUSTUM_HALF_XZ : maxX + FRUSTUM_HALF_XZ) +
              py * (py >= 0 ? minY : maxY) +
              pz * (pz >= 0 ? minZ - FRUSTUM_HALF_XZ : maxZ + FRUSTUM_HALF_XZ) +
              this._planes[i + 3]! +
              CANDIDATE_REUSE_DISTANCE <
            0
          )
            clipPlanes |= 1 << (i / 4);
        }
        if (!visible) continue;
        let radial = this._radialGroupMasks[index]!;
        if (this._radialEpochs[index] !== this._radialEpoch) {
          radial = this._tileRadialGroups(minX, minZ, nearSquared, farSquared);
          this._radialGroupMasks[index] = radial;
          this._radialEpochs[index] = this._radialEpoch;
        }
        const groups =
          radial & (clipPlanes ? this._tileFrustumGroups(minX, minZ, minY, maxY, clipPlanes) : ALL_GROUP_BITS);
        if (!groups) continue;
        for (let r = 0; r < this._rings.length; r++) {
          if (nearSquared > this._ringOuterSquared[r]! || farSquared < this._ringInnerSquared[r]!) continue;
          const groupMask = r === 2 ? groups >> 8 : (groups >> (r * 4)) & QUADRANT_MASK;
          if (!groupMask) continue;
          const ring = this._rings[r]!;
          const offset = ring.tileCount++;
          const packed = (groupMask << TILE_INDEX_BITS) | index;
          if (ring.tileData[offset] !== packed) {
            ring.tileData[offset] = packed;
            ring.tilesDirty = true;
          }
          const bounds = this._visibleRingBounds,
            boundOffset = r * 6;
          bounds[boundOffset] = Math.min(bounds[boundOffset]!, minX - 0.5);
          bounds[boundOffset + 1] = Math.min(bounds[boundOffset + 1]!, minY);
          bounds[boundOffset + 2] = Math.min(bounds[boundOffset + 2]!, minZ - 0.5);
          bounds[boundOffset + 3] = Math.max(bounds[boundOffset + 3]!, maxX + 0.5);
          bounds[boundOffset + 4] = Math.max(bounds[boundOffset + 4]!, maxY);
          bounds[boundOffset + 5] = Math.max(bounds[boundOffset + 5]!, maxZ + 0.5);
        }
      }
    }
  }

  // One bit per 8x8 group. LODs zero and one each use four quadrants; LOD two spans a whole tile.
  private _tileRadialGroups(x: number, z: number, nearestSquared: number, farthestSquared: number): number {
    const inner = this._groupInnerSquared,
      outer = this._groupOuterSquared;
    let mask = nearestSquared <= outer[2]! && farthestSquared >= inner[2]! ? FAR_GROUP_BIT : 0;
    let partialRings = 0;
    for (let r = 0; r < 2; r++) {
      if (nearestSquared > outer[r]! || farthestSquared < inner[r]!) continue;
      if (nearestSquared >= inner[r]! && farthestSquared <= outer[r]!) mask |= QUADRANT_MASK << (4 * r);
      else partialRings |= 1 << r;
    }
    if (!partialRings) return mask;
    const cameraX = this._cameraXZ[0]!,
      cameraZ = this._cameraXZ[1]!,
      step = COARSE_TILE_METRES / 2;
    for (let j = 0; j < 2; j++) {
      const z0 = z + j * step,
        z1 = z0 + step,
        nearZ = Math.max(z0 - cameraZ, 0, cameraZ - z1),
        farZ = Math.max(Math.abs(z0 - cameraZ), Math.abs(z1 - cameraZ));
      for (let i = 0; i < 2; i++) {
        const x0 = x + i * step,
          x1 = x0 + step,
          nearX = Math.max(x0 - cameraX, 0, cameraX - x1),
          farX = Math.max(Math.abs(x0 - cameraX), Math.abs(x1 - cameraX));
        const quadrantNearSquared = nearX * nearX + nearZ * nearZ,
          quadrantFarSquared = farX * farX + farZ * farZ,
          bit = 1 << (j * 2 + i);
        if (partialRings & 1 && quadrantNearSquared <= outer[0]! && quadrantFarSquared >= inner[0]!) mask |= bit;
        if (partialRings & 2 && quadrantNearSquared <= outer[1]! && quadrantFarSquared >= inner[1]!) mask |= bit << 4;
      }
    }
    return mask;
  }

  private _tileFrustumGroups(x: number, z: number, minY: number, maxY: number, planes: number): number {
    const half = COARSE_TILE_METRES / 2;
    let quadrants = QUADRANT_MASK;
    while (planes) {
      const p = (31 - Math.clz32(planes & -planes)) * 4;
      planes &= planes - 1;
      const px = this._planes[p]!,
        py = this._planes[p + 1]!,
        pz = this._planes[p + 2]!,
        pw = this._planes[p + 3]! + CANDIDATE_REUSE_DISTANCE + 0.0001;
      const supportY = py * (py >= 0 ? maxY : minY);
      const x0 = px * (px >= 0 ? x + half + FRUSTUM_HALF_XZ : x - FRUSTUM_HALF_XZ) + supportY,
        x1 = px * (px >= 0 ? x + COARSE_TILE_METRES + FRUSTUM_HALF_XZ : x + half - FRUSTUM_HALF_XZ) + supportY;
      const z0 = pz * (pz >= 0 ? z + half + FRUSTUM_HALF_XZ : z - FRUSTUM_HALF_XZ),
        z1 = pz * (pz >= 0 ? z + COARSE_TILE_METRES + FRUSTUM_HALF_XZ : z + half - FRUSTUM_HALF_XZ);
      if ((px >= 0 ? x1 : x0) + (pz >= 0 ? z1 : z0) + pw < 0) return 0;
      if (x0 + z0 + pw < 0) quadrants &= ~1;
      if (x1 + z0 + pw < 0) quadrants &= ~2;
      if (x0 + z1 + pw < 0) quadrants &= ~4;
      if (x1 + z1 + pw < 0) quadrants &= ~8;
    }
    return FAR_GROUP_BIT | (quadrants << 4) | quadrants;
  }

  private _writeCandidateGroups(ring: ForwardGrassRingState): number {
    const tiles = ring.tileData,
      groups = ring.candidateGroups;
    let count = 0;
    if (ring.config.lod === 2) {
      for (let i = 0; i < ring.tileCount; i++) {
        const packed = tiles[i]!;
        if (packed >> TILE_INDEX_BITS)
          groups[count++] = ((packed & TILE_INDEX_MASK) >> 6) * GROUP_ROW_STRIDE + (packed & TILE_COLUMN_MASK) * 8;
      }
    } else {
      for (let start = 0; start < ring.tileCount; ) {
        const row = (tiles[start]! & TILE_INDEX_MASK) >> 6,
          base = row * 2 * GROUP_ROW_STRIDE;
        let end = start;
        while (end < ring.tileCount && (tiles[end]! & TILE_INDEX_MASK) >> 6 === row) {
          const packed = tiles[end++]!,
            x = (packed & TILE_COLUMN_MASK) * 16;
          if ((packed >> TILE_INDEX_BITS) & 1) groups[count++] = base + x;
          if ((packed >> TILE_INDEX_BITS) & 2) groups[count++] = base + x + 8;
        }
        for (let i = start; i < end; i++) {
          const packed = tiles[i]!,
            x = (packed & TILE_COLUMN_MASK) * 16;
          if ((packed >> TILE_INDEX_BITS) & 4) groups[count++] = base + GROUP_ROW_STRIDE + x;
          if ((packed >> TILE_INDEX_BITS) & 8) groups[count++] = base + GROUP_ROW_STRIDE + x + 8;
        }
        start = end;
      }
    }
    return count * CANDIDATE_CELLS_PER_GROUP;
  }

  /** Keep each LOD at a stable attribute offset. Upload the changed span before any LOD reads it. */
  private _prepareCandidateBuffer(): void {
    let resize = !this._candidateBindings.length;
    for (let r = 0; r < this._rings.length; r++) {
      const ring = this._rings[r]!;
      const width = COARSE_TILE_METRES / ring.config.stepMetres;
      // A tile bounds the number of possible input groups. Each selected group
      // consumes one float here, and 64 full instance records in the output.
      const groups = (ring.tileCount * width * width) / CANDIDATE_CELLS_PER_GROUP;
      if (groups > ring.groupCapacity) {
        ring.groupCapacity = Math.ceil(groups * 1.25);
      }
      if (ring.candidateGroups.length < ring.groupCapacity) resize = true;
    }
    if (resize) {
      let length = 0;
      for (const ring of this._rings) length += ring.groupCapacity;
      const data = new Float32Array(length);
      const buffer = new Buffer(this._engine, BufferBindFlag.VertexBuffer, data.byteLength, BufferUsage.Dynamic);
      buffer.isGCIgnored = true;
      this._candidateBindings[0]?.buffer.destroy();
      this._candidateBindings[0] = new VertexBufferBinding(buffer, 4);
      this._candidateGroups = data;
      let offset = 0;
      for (const ring of this._rings) {
        const end = offset + ring.groupCapacity;
        ring.candidateElements[0]!.offset = offset * 4;
        ring.candidateGroups = data.subarray(offset, end);
        ring.tilesDirty = true;
        offset = end;
      }
    }
    const buffer = this._candidateBindings[0]!.buffer;
    const lost = buffer.isContentLost;
    let first = this._candidateGroups.length,
      end = 0;
    for (let r = 0; r < this._rings.length; r++) {
      const ring = this._rings[r]!;
      if (!lost && !ring.tilesDirty && ring.tileCount === ring.uploadedTileCount) continue;
      ring.candidateCount = this._writeCandidateGroups(ring);
      if (ring.candidateCount > ring.capacity) {
        const capacity = Math.ceil(ring.candidateCount * 1.25);
        const previous = ring.simulator.readBinding.buffer;
        ring.simulator.resize(capacity, EMPTY_INPUTS);
        ring.ringMesh.mesh.setVertexBufferBinding(ring.simulator.readBinding, ring.ringMesh.instanceBinding);
        previous.destroy();
        ring.capacity = capacity;
      }
      if (ring.candidateCount) {
        const offset = ring.candidateGroups.byteOffset / 4;
        first = Math.min(first, offset);
        end = Math.max(end, offset + ring.candidateCount / CANDIDATE_CELLS_PER_GROUP);
      }
    }
    if (end > first) buffer.setData(this._candidateGroups, first * 4, first, end - first);
    for (let r = 0; r < this._rings.length; r++) {
      const ring = this._rings[r]!;
      ring.tilesDirty = false;
      ring.uploadedTileCount = ring.tileCount;
    }
  }

  private _dispatchAllRings(params: ForwardGrassUpdateParams): void {
    const camX = this._cameraXZ[0]!,
      camZ = this._cameraXZ[1]!;
    const fields = params.samplerContext.fields;
    const worldMinX = seedWorldOriginX(fields);
    const worldMinZ = seedWorldOriginZ(fields);
    const worldMaxX = worldMinX + fields.sizeMetres;
    const worldMaxZ = worldMinZ + fields.sizeMetres;

    const bands = this._bands;
    bands[0] = 0;
    bands[1] = Math.max(0, Math.min(params.lod1DistanceMetres, params.maximumDistanceMetres));
    bands[2] = Math.max(0, params.lod1DistanceMetres);
    bands[3] = Math.max(params.lod1DistanceMetres, Math.min(params.lod2DistanceMetres, params.maximumDistanceMetres));
    bands[4] = Math.max(0, Math.max(params.lod1DistanceMetres, params.lod2DistanceMetres));
    bands[5] = params.maximumDistanceMetres;

    const fadeStart = Math.max(0, Math.min(params.lod1DistanceMetres, params.maximumDistanceMetres * 0.75));
    if (this._candidatesDirty) this._boundVisibleRings(bands, params);
    if (this._candidatesDirty || this._candidateBindings[0]?.buffer.isContentLost) this._prepareCandidateBuffer();
    for (let r = 0; r < this._rings.length; r++) {
      const ring = this._rings[r]!;
      ring.valid = false;
      const innerR = bands[r * 2]!,
        outerR = bands[r * 2 + 1]!;
      if (outerR <= innerR + 0.01 || outerR <= 0.01) {
        ring.renderer.enabled = false;
        ring.ringMesh.mesh.instanceCount = 0;
        continue;
      }

      const step = ring.config.stepMetres;
      const innerFeather = innerR > 0.01 ? ring.config.innerFeatherMetres : 0;
      const outerFeather = outerR < params.maximumDistanceMetres - 0.01 ? ring.config.outerFeatherMetres : 0;

      const visible = this._visibleRingBounds,
        index = r * 6;
      const visMinX = visible[index]!,
        visMinY = visible[index + 1]!,
        visMinZ = visible[index + 2]!;
      const visMaxX = visible[index + 3]!,
        visMaxY = visible[index + 4]!,
        visMaxZ = visible[index + 5]!;

      if (visMinX > visMaxX || visMinZ > visMaxZ) {
        ring.renderer.enabled = false;
        ring.ringMesh.mesh.instanceCount = 0;
        continue;
      }

      const minY = visMinY;
      const maxY = visMaxY;

      const count = ring.candidateCount;
      if (count === 0) {
        ring.ringMesh.mesh.instanceCount = 0;
        ring.renderer.enabled = false;
        continue;
      }

      const sd = ring.shaderData;
      const v = ring.uniformValues;
      v[0] = this._windowOriginX;
      v[1] = this._windowOriginZ;
      v[2] = 1 / WINDOW_TEXELS;
      v[3] = WINDOW_TEXELS;
      v[4] = worldMinX;
      v[5] = worldMinZ;
      v[6] = worldMaxX;
      v[7] = worldMaxZ;
      v[10] = ring.config.lod === 2 ? 3 : 4;
      v[11] = ring.config.lod;
      v[12] = camX;
      v[13] = camZ;
      v[16] = innerR;
      v[17] = outerR;
      v[20] = innerFeather;
      v[21] = outerFeather;
      v[22] = ring.config.widthBoost;
      v[23] = fadeStart;
      v[24] = step;
      v[25] = step * step * MAX_BAKED_DENSITY_PER_SQM;
      v[26] = params.maximumDistanceMetres;
      v[27] = params.minimumDensityFraction;
      v[28] = params.minScale;
      v[29] = params.maxScale;
      v[30] = params.useEcologicalHeight ? 1 : 0;
      v[31] = GRASS_AUTHORED_HEIGHT_METRES;

      if (!ring.simulator.beginUpdate(sd, EMPTY_INPUTS, this._candidateBindings, ring.candidateElements)) {
        ring.renderer.enabled = false;
        continue;
      }
      try {
        ring.simulator.draw(MeshTopology.Points, 0, CANDIDATE_CELLS_PER_GROUP, count / CANDIDATE_CELLS_PER_GROUP);
      } finally {
        ring.simulator.endUpdate();
      }

      ring.ringMesh.mesh.instanceCount = count;

      const bound = ring.boundValues;
      const revealChanged =
        bound[1] !== minY || bound[4] !== maxY || ring.revealRangeSetter !== params.revealRangeSetter;
      if (
        bound[0] !== visMinX - FRUSTUM_HALF_XZ ||
        bound[1] !== minY ||
        bound[2] !== visMinZ - FRUSTUM_HALF_XZ ||
        bound[3] !== visMaxX + FRUSTUM_HALF_XZ ||
        bound[4] !== maxY ||
        bound[5] !== visMaxZ + FRUSTUM_HALF_XZ
      ) {
        bound[0] = visMinX - FRUSTUM_HALF_XZ;
        bound[1] = minY;
        bound[2] = visMinZ - FRUSTUM_HALF_XZ;
        bound[3] = visMaxX + FRUSTUM_HALF_XZ;
        bound[4] = maxY;
        bound[5] = visMaxZ + FRUSTUM_HALF_XZ;
        ring.ringMesh.mesh.bounds.min.copyFromArray(bound);
        ring.ringMesh.mesh.bounds.max.copyFromArray(bound, 3);
      }
      if (revealChanged) {
        try {
          params.revealRangeSetter(ring.renderer, minY, maxY);
        } catch (error) {
          // The mesh bounds are current, but this range still needs publication on retry.
          ring.revealRangeSetter = undefined;
          throw error;
        }
        ring.revealRangeSetter = params.revealRangeSetter;
      }
      ring.valid = true;
    }
  }
}
