export enum LayerKind {
  Terrain = "Terrain",
  Water = "Water",
  Grass = "Grass"
}

export interface HeightMapSpec {
  url: string;
  /** Storage format tag — e.g. "r16-unorm-le", "png16". Loader dispatches on this. */
  format: string;
  width: number;
  height: number;
  /** Real-world elevation the raw sample 0 maps to. Negative for sea floor. */
  minMetres: number;
  /** Real-world elevation the raw sample max maps to. */
  maxMetres: number;
}

export interface ControlMapSpec {
  url: string;
  format: string;
  width: number;
  height: number;
  /** Free-form doc string describing the bit layout — parser ignores; humans read. */
  bits?: string;
}

export interface RegionSpec {
  id: string;
  positionXZ: [number, number];
  sizeMeter: number;
  heightmap: HeightMapSpec;
  controlmap: ControlMapSpec;
  colormap?: { url: string };
}

export interface LayerSpec {
  id: number;
  name: string;
  kind: LayerKind;
  textures?: {
    albedo: string;
    normal?: string;
  };
  params?: {
    uvScale: number;
    normalIntensity?: number;
    detilStrength?: number;
    uvRotationDegrees?: number;
  };
  externalConsumer?: string;
  consumerConfig?: Record<string, unknown>;
}

export interface Manifest {
  version: string;
  world: {
    originXZ: [number, number];
  };
  regions: RegionSpec[];
  layers: LayerSpec[];
}

/**
 * Fetch and validate a manifest.json. Unknown fields are preserved as-is (design.md §3.4 forward compat).
 */
export async function loadManifest(url: string): Promise<Manifest> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`[TerrainManifest] fetch ${url} → ${res.status}`);
  const json = (await res.json()) as Manifest;
  if (!json.version) throw new Error(`[TerrainManifest] missing "version" in ${url}`);
  if (!Array.isArray(json.regions) || json.regions.length === 0) {
    throw new Error(`[TerrainManifest] no regions in ${url}`);
  }
  if (!Array.isArray(json.layers) || json.layers.length === 0) {
    throw new Error(`[TerrainManifest] no layers in ${url}`);
  }
  return json;
}
