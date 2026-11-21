import { Camera, Material, Script, Texture2D } from "@galacean/engine";
import { TerrainClipmap } from "./clipmap/TerrainClipmap";
import type { TerrainFarMaterialOptions } from "./clipmap/TerrainClipmapMaterial";
import type { TerrainLayerResolvedSource } from "./clipmap/TerrainLayerResidency";

/** Borrowed, replaceable inputs for a square, centred terrain. */
export interface TerrainMapInputs {
  readonly heightmap: Texture2D;
  readonly alphamap?: Texture2D;
  readonly densityMap?: Texture2D;
  readonly material: Material;
  readonly layers?: readonly TerrainLayerResolvedSource<Texture2D>[];
  readonly channels?: readonly [string | null, string | null, string | null, string | null];
  readonly sizeMetres: number;
  readonly minimumHeight: number;
  readonly maximumHeight: number;
  readonly ringSize?: number;
  readonly lodCount?: number;
  readonly farMaterial?: TerrainFarMaterialOptions;
}

/** Terrain backed by caller-owned maps and a Clipmap-compatible material. */
export class TerrainMapComponent extends Script {
  private _clipmap?: TerrainClipmap;
  private _root?: typeof this.entity;

  /** Current renderer, including the existing height and alphamap update APIs. */
  get clipmap(): TerrainClipmap | undefined {
    return this._clipmap;
  }

  /**
   * Resolves maps and publishes a new terrain or replaces the active inputs.
   * Textures and the source material remain owned by the caller.
   */
  setMaps(camera: Camera, inputs: TerrainMapInputs) {
    const { heightmap, alphamap, densityMap, material, sizeMetres, minimumHeight, maximumHeight } = inputs;
    if (
      !Number.isFinite(sizeMetres) ||
      sizeMetres <= 0 ||
      !Number.isFinite(minimumHeight) ||
      !Number.isFinite(maximumHeight) ||
      minimumHeight >= maximumHeight ||
      heightmap.width < 2 ||
      heightmap.width !== heightmap.height
    ) {
      throw new RangeError("Terrain requires a square RG16 heightmap and a finite size and height range");
    }
    if (alphamap && (!inputs.channels || !inputs.layers)) {
      throw new Error("An Alphamap requires layer sources and a channel mapping");
    }
    const heights = decodeTerrainHeightmapTexture(heightmap);
    const alpha = alphamap && readTerrainMapPixels(alphamap);
    const density = densityMap && readTerrainMapPixels(densityMap);
    const position = this.entity.transform.worldPosition;
    const range = maximumHeight - minimumHeight;
    const grid = {
      vertexSpacing: sizeMetres / (heightmap.width - 1),
      minHeight: position.y + minimumHeight,
      maxHeight: position.y + maximumHeight,
      sources: [
        {
          id: "terrain",
          worldPosition: [position.x - sizeMetres / 2, position.y, position.z - sizeMetres / 2] as const,
          worldSize: [sizeMetres, range, sizeMetres] as const,
          heightSampleSize: [heightmap.width, heightmap.height] as const,
          heightDecodeOffset: position.y + minimumHeight,
          heightDecodeScale: range,
          heightSamples: heights
        }
      ]
    };
    const layers =
      alphamap && alpha && inputs.layers && inputs.channels
        ? [
            {
              id: "terrain",
              layers: inputs.layers,
              alphamaps: [
                {
                  sampleSize: [alphamap.width, alphamap.height] as const,
                  layers: inputs.channels,
                  weights: alpha
                }
              ]
            }
          ]
        : undefined;
    if (!this.scene) {
      throw new Error("TerrainMapComponent requires an active Scene");
    }
    const root = this.scene.createRootEntity("Terrain rendering");
    root.layer = this.entity.layer;
    let next: TerrainClipmap;
    try {
      next = new TerrainClipmap(
        this.engine,
        root,
        camera,
        grid,
        material,
        inputs.ringSize ?? 64,
        inputs.lodCount ?? 7,
        layers,
        inputs.farMaterial
      );
    } catch (error) {
      root.destroy();
      throw error;
    }
    this.release();
    this._root = root;
    this._clipmap = next;
    return { root, heights, alpha, density, clipmap: next };
  }

  override onDisable(): void {
    this.release();
  }

  /** Removes derived renderer resources while retaining caller-owned inputs. */
  release(): void {
    if (this._root) this._root.isActive = false;
    this._clipmap?.destroy();
    this._root?.destroy();
    this._clipmap = this._root = undefined;
  }
}

/** Reads RGBA8 source pixels into a caller-owned buffer. */
export function readTerrainMapPixels(texture: Texture2D): Uint8Array {
  const bytes = new Uint8Array(texture.width * texture.height * 4);
  texture.getPixelBuffer(bytes);
  return bytes;
}

/** Decodes two big-endian height bytes per RGBA8 texel. */
export function decodeTerrainHeightmapTexture(texture: Texture2D): Uint16Array {
  const bytes = readTerrainMapPixels(texture);
  return Uint16Array.from({ length: texture.width * texture.height }, (_, i) => (bytes[i * 4] << 8) | bytes[i * 4 + 1]);
}
