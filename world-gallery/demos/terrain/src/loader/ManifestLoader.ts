import { AssetType, Engine, JSONAsset } from "@galacean/engine";

/** terrain control-map bit layout. */
export const TERRAIN_CONTROL_BITS =
  "31-27 base | 26-22 overlay | 21-14 blend | 13-10 uv rotation | 9-7 uv scale | 2 hole | 1 navigation | 0 autoshader";

/** A square terrain region stored as one layer in the GPU texture arrays. */
export interface TerrainRegionSpec {
  /** Stable terrain region location, not the transient texture-array layer. */
  location: [x: number, z: number];
  /** First atlas row for this region inside the vertically stacked height data. */
  heightOffsetY: number;
  /** Raw little-endian terrain control map. */
  controlMap: string;
  /** terrain RGBA color/roughness map for this region. */
  colorMap: string;
}

/** Height atlas containing vertically stacked uint16 regions. */
export interface TerrainHeightAtlasSpec {
  url: string;
  format: "r16-unorm-le";
  width: number;
  height: number;
  minMetres: number;
  maxMetres: number;
}

/** terrain texture-asset values consumed by the core sampler. */
export interface TerrainLayerSpec {
  id: number;
  name: string;
  albedoHeight: string;
  normalRoughness: string;
  albedoColor: [r: number, g: number, b: number];
  uvScale: number;
  detilingRotation: number;
  detilingShift: number;
  normalDepth: number;
  aoStrength: number;
  roughnessMod: number;
}

/** Material parameters consumed by the terrain shader. */
export interface TerrainMaterialSpec {
  autoShader: {
    enabled: boolean;
    baseTexture: number;
    overlayTexture: number;
    slope: number;
    heightReduction: number;
  };
  projection: {
    enabled: boolean;
    threshold: number;
  };
  sampling: {
    blendSharpness: number;
    mipmapBias: number;
    biasDistance: number;
    depthBlur: number;
  };
  dualScaling: {
    enabled: boolean;
    texture: number;
    near: number;
    far: number;
    reduction: number;
  };
  macroVariation: {
    enabled: boolean;
    noiseTexture: string;
    color1: [r: number, g: number, b: number];
    color2: [r: number, g: number, b: number];
    slope: number;
    noise1Scale: number;
    noise1Angle: number;
    noise1Offset: [x: number, y: number];
    noise2Scale: number;
  };
}

/** Geometry-clipmap settings matching a terrain node. */
export interface TerrainClipmapSpec {
  meshSize: number;
  meshLods: number;
}

/** Procedural world-continuation settings. */
export interface TerrainWorldNoiseSpec {
  /** Uses a fragment lookup instead of the vertex-propagated height derivatives. */
  fragmentNormals: boolean;
  /** Width of the transition between authored region height and procedural world noise. */
  regionBlend: number;
  /** Largest number of morenoise octaves near the camera. */
  maxOctaves: number;
  /** Smallest number of morenoise octaves at long distance. */
  minOctaves: number;
  /** Distance over which the octave count reaches its minimum. */
  lodDistance: number;
  /** Frequency multiplier of the procedural height field. */
  scale: number;
  /** Height multiplier of the procedural field in metres. */
  height: number;
  /** World-noise XZ translation and Y height offset. */
  offset: readonly [x: number, y: number, z: number];
}

/** terrain world settings that are independent of region payloads. */
export interface TerrainWorldSpec {
  /** Empty space, a flat continuation, or terrain's procedural noise continuation outside regions. */
  background: "none" | "flat" | "noise";
  /** Parameters consumed when `background` is `noise`. */
  noise: TerrainWorldNoiseSpec;
}

/** Complete portable contract for the terrain demo. */
export interface TerrainManifest {
  version: "1";
  terrain: {
    regionSize: number;
    regionMapSize: number;
    vertexSpacing: number;
    heightAtlas: TerrainHeightAtlasSpec;
    regions: TerrainRegionSpec[];
  };
  clipmap: TerrainClipmapSpec;
  world: TerrainWorldSpec;
  layers: TerrainLayerSpec[];
  material: TerrainMaterialSpec;
}

/**
 * Loads and validates the terrain manifest's structural invariants.
 * @param engine Engine whose resource manager owns the loaded manifest asset.
 * @param url Absolute manifest URL.
 * @returns Validated terrain manifest.
 * @throws If loading fails or the manifest violates the terrain data contract.
 */
export async function loadManifest(engine: Engine, url: string): Promise<TerrainManifest> {
  const asset = await engine.resourceManager.load<JSONAsset>({ url, type: AssetType.JSON });
  if (!(asset instanceof JSONAsset)) {
    throw new Error(`[TerrainManifest] ${url} did not resolve to JSONAsset`);
  }
  const manifest = asset.data as TerrainManifest;
  validateManifest(manifest, url);
  return manifest;
}

function validateManifest(manifest: TerrainManifest, url: string): void {
  if (manifest.version !== "1") {
    throw new Error(`[TerrainManifest] ${url} has unsupported version ${String(manifest.version)}`);
  }

  const { terrain, clipmap, layers, world } = manifest;
  if (!terrain || !isPowerOfTwo(terrain.regionSize)) {
    throw new Error("[TerrainManifest] terrain.regionSize must be a positive power of two");
  }
  if (!Number.isInteger(terrain.regionMapSize) || terrain.regionMapSize <= 0 || terrain.regionMapSize % 2 !== 0) {
    throw new Error("[TerrainManifest] terrain.regionMapSize must be a positive even integer");
  }
  if (!(terrain.vertexSpacing > 0)) {
    throw new Error("[TerrainManifest] terrain.vertexSpacing must be greater than zero");
  }
  if (world?.background !== "none" && world?.background !== "flat" && world?.background !== "noise") {
    throw new Error("[TerrainManifest] world.background must be none, flat, or noise");
  }
  const noise = world?.noise;
  if (!noise || typeof noise.fragmentNormals !== "boolean") {
    throw new Error("[TerrainManifest] world.noise.fragmentNormals must be boolean");
  }
  if (!(noise.regionBlend >= 0.05 && noise.regionBlend <= 0.95)) {
    throw new Error("[TerrainManifest] world.noise.regionBlend must be in 0.05..0.95");
  }
  if (!Number.isInteger(noise.minOctaves) || !Number.isInteger(noise.maxOctaves) || noise.minOctaves < 0 || noise.maxOctaves > 15) {
    throw new Error("[TerrainManifest] world.noise octaves must be integers in 0..15");
  }
  if (noise.minOctaves > noise.maxOctaves) {
    throw new Error("[TerrainManifest] world.noise.minOctaves must not exceed maxOctaves");
  }
  if (!(noise.lodDistance >= 0 && noise.lodDistance <= 40000)) {
    throw new Error("[TerrainManifest] world.noise.lodDistance must be in 0..40000");
  }
  if (!(noise.scale >= 0.25 && noise.scale <= 20)) {
    throw new Error("[TerrainManifest] world.noise.scale must be in 0.25..20");
  }
  if (!(noise.height >= 0 && noise.height <= 1000)) {
    throw new Error("[TerrainManifest] world.noise.height must be in 0..1000");
  }
  if (!Array.isArray(noise.offset) || noise.offset.length !== 3 || noise.offset.some((value) => !Number.isFinite(value))) {
    throw new Error("[TerrainManifest] world.noise.offset must contain three finite components");
  }
  if (!terrain.heightAtlas || terrain.heightAtlas.width !== terrain.regionSize) {
    throw new Error("[TerrainManifest] height atlas width must equal terrain.regionSize");
  }
  if (terrain.heightAtlas.format !== "r16-unorm-le") {
    throw new Error("[TerrainManifest] height atlas must use r16-unorm-le");
  }
  if (!Number.isInteger(terrain.heightAtlas.height) || terrain.heightAtlas.height < terrain.regionSize) {
    throw new Error("[TerrainManifest] height atlas height must contain at least one region");
  }
  if (!(terrain.heightAtlas.maxMetres > terrain.heightAtlas.minMetres)) {
    throw new Error("[TerrainManifest] height atlas range must be increasing");
  }
  if (!Array.isArray(terrain.regions) || terrain.regions.length === 0) {
    throw new Error("[TerrainManifest] terrain.regions must not be empty");
  }
  if (
    !Number.isInteger(clipmap?.meshSize) ||
    clipmap.meshSize < 8 ||
    clipmap.meshSize > 64 ||
    clipmap.meshSize % 2 !== 0 ||
    !Number.isInteger(clipmap.meshLods) ||
    clipmap.meshLods < 1 ||
    clipmap.meshLods > 10
  ) {
    throw new Error("[TerrainManifest] clipmap must use terrain's meshSize 8..64 step 2 and meshLods 1..10");
  }
  if (!Array.isArray(layers) || layers.length === 0 || layers.length > 32) {
    throw new Error("[TerrainManifest] layers must contain 1..32 texture assets");
  }

  const halfMap = terrain.regionMapSize / 2;
  const occupiedLocations = new Set<string>();
  for (const region of terrain.regions) {
    const [x, z] = region.location;
    if (!Number.isInteger(x) || !Number.isInteger(z) || x < -halfMap || x >= halfMap || z < -halfMap || z >= halfMap) {
      throw new Error(`[TerrainManifest] region (${x}, ${z}) is outside [-${halfMap}, ${halfMap - 1}]`);
    }
    const key = `${x},${z}`;
    if (occupiedLocations.has(key)) {
      throw new Error(`[TerrainManifest] duplicate region location (${x}, ${z})`);
    }
    occupiedLocations.add(key);
    if (
      !Number.isInteger(region.heightOffsetY) ||
      region.heightOffsetY < 0 ||
      region.heightOffsetY + terrain.regionSize > terrain.heightAtlas.height
    ) {
      throw new Error(`[TerrainManifest] region (${x}, ${z}) has an invalid heightOffsetY`);
    }
    if (typeof region.controlMap !== "string" || region.controlMap.length === 0) {
      throw new Error(`[TerrainManifest] region (${x}, ${z}) must provide a controlMap`);
    }
    if (typeof region.colorMap !== "string" || region.colorMap.length === 0) {
      throw new Error(`[TerrainManifest] region (${x}, ${z}) must provide a colorMap`);
    }
  }

  const textureIds = layers.map((layer) => layer.id).sort((a, b) => a - b);
  for (let index = 0; index < textureIds.length; index++) {
    if (textureIds[index] !== index) {
      throw new Error("[TerrainManifest] texture layer ids must be contiguous from zero");
    }
  }

  const materialTextureIds = [
    manifest.material.autoShader.baseTexture,
    manifest.material.autoShader.overlayTexture,
    manifest.material.dualScaling.texture
  ];
  if (materialTextureIds.some((id) => !Number.isInteger(id) || id < 0 || id >= layers.length)) {
    throw new Error("[TerrainManifest] material texture ids must reference loaded texture assets");
  }
  const { near, far } = manifest.material.dualScaling;
  if (!(near >= 0) || !(far > near)) {
    throw new Error("[TerrainManifest] dualScaling.far must be greater than dualScaling.near");
  }
}

function isPowerOfTwo(value: number): boolean {
  return Number.isInteger(value) && value > 0 && (value & (value - 1)) === 0;
}
