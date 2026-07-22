import {
  AssetType,
  BufferAsset,
  Engine,
  Texture2D,
  Texture2DArray,
  TextureFilterMode,
  TextureFormat,
  TextureWrapMode
} from "@galacean/engine";
import { TerrainData, TerrainRegionData } from "../data/TerrainData";
import { TerrainManifest } from "./ManifestLoader";

/**
 * Loads terrain regions into parallel height, control, and color/roughness texture arrays plus a region map.
 * @param engine Engine that owns the GPU textures.
 * @param manifest Validated terrain manifest.
 * @param manifestUrl Absolute manifest URL used to resolve payload paths.
 * @returns Terrain data ready for CPU queries and renderer binding.
 * @throws If any binary payload has an unexpected byte length.
 */
export async function loadTerrainData(
  engine: Engine,
  manifest: TerrainManifest,
  manifestUrl: string
): Promise<TerrainData> {
  const { terrain } = manifest;
  const atlasSpec = terrain.heightAtlas;
  const atlasBuffer = await loadBuffer(engine, new URL(atlasSpec.url, manifestUrl).href);
  const atlas = new Uint16Array(atlasBuffer);
  if (atlas.length !== atlasSpec.width * atlasSpec.height) {
    throw new Error(
      `[TerrainData] height atlas has ${atlas.length} samples; expected ${atlasSpec.width}x${atlasSpec.height}`
    );
  }

  const [controls, colorImages] = await Promise.all([
    Promise.all(
      terrain.regions.map(async (region) => {
        const payload = new Uint32Array(await loadBuffer(engine, new URL(region.controlMap, manifestUrl).href));
        const expectedSamples = terrain.regionSize * terrain.regionSize;
        if (payload.length !== expectedSamples) {
          throw new Error(
            `[TerrainData] control ${region.controlMap} has ${payload.length} samples; expected ${expectedSamples}`
          );
        }
        return payload;
      })
    ),
    Promise.all(terrain.regions.map((region) => loadImage(new URL(region.colorMap, manifestUrl).href)))
  ]);
  for (const [index, image] of colorImages.entries()) {
    if (image.naturalWidth !== terrain.regionSize || image.naturalHeight !== terrain.regionSize) {
      throw new Error(
        `[TerrainData] color ${terrain.regions[index].colorMap} must be ${terrain.regionSize}x${terrain.regionSize}`
      );
    }
  }

  const heightMaps = new Texture2DArray(
    engine,
    terrain.regionSize,
    terrain.regionSize,
    terrain.regions.length,
    TextureFormat.R32G32B32A32,
    false,
    false
  );
  heightMaps.filterMode = TextureFilterMode.Point;
  heightMaps.wrapModeU = heightMaps.wrapModeV = TextureWrapMode.Clamp;

  const controlMaps = new Texture2DArray(
    engine,
    terrain.regionSize,
    terrain.regionSize,
    terrain.regions.length,
    TextureFormat.R8G8B8A8,
    false,
    false
  );
  controlMaps.filterMode = TextureFilterMode.Point;
  controlMaps.wrapModeU = controlMaps.wrapModeV = TextureWrapMode.Clamp;

  const colorMaps = new Texture2DArray(
    engine,
    terrain.regionSize,
    terrain.regionSize,
    terrain.regions.length,
    TextureFormat.R8G8B8A8,
    true,
    true
  );
  for (let layer = 0; layer < colorImages.length; layer++) {
    colorMaps.setImageSource(layer, colorImages[layer]);
  }
  colorMaps.generateMipmaps();
  colorMaps.filterMode = TextureFilterMode.Trilinear;
  colorMaps.wrapModeU = colorMaps.wrapModeV = TextureWrapMode.Clamp;
  colorMaps.anisoLevel = 16;

  const regions: TerrainRegionData[] = [];
  for (let layer = 0; layer < terrain.regions.length; layer++) {
    const spec = terrain.regions[layer];
    const heights = sliceHeightRegion(atlas, atlasSpec.width, terrain.regionSize, spec.heightOffsetY);
    const heightRgba = new Float32Array(heights.length * 4);
    for (let index = 0; index < heights.length; index++) {
      heightRgba[index * 4] =
        atlasSpec.minMetres + (heights[index] / 65535) * (atlasSpec.maxMetres - atlasSpec.minMetres);
    }
    heightMaps.setPixelBuffer(layer, heightRgba, 0, 0, 0, terrain.regionSize, terrain.regionSize, 1);

    const control = controls[layer];
    const controlRgba = new Uint8Array(control.length * 4);
    for (let index = 0; index < control.length; index++) {
      const word = control[index];
      const offset = index * 4;
      controlRgba[offset] = word & 0xff;
      controlRgba[offset + 1] = (word >>> 8) & 0xff;
      controlRgba[offset + 2] = (word >>> 16) & 0xff;
      controlRgba[offset + 3] = word >>> 24;
    }
    controlMaps.setPixelBuffer(layer, controlRgba, 0, 0, 0, terrain.regionSize, terrain.regionSize, 1);
    regions.push({ location: spec.location, heights, control });
  }

  const regionLayers = new Int16Array(terrain.regionMapSize * terrain.regionMapSize);
  regionLayers.fill(-1);
  const regionMapRgba = new Uint32Array(regionLayers.length * 4);
  const halfMap = terrain.regionMapSize / 2;
  for (let layer = 0; layer < regions.length; layer++) {
    const [x, z] = regions[layer].location;
    const mapIndex = (z + halfMap) * terrain.regionMapSize + x + halfMap;
    regionLayers[mapIndex] = layer;
    regionMapRgba[mapIndex * 4] = layer + 1;
  }

  const regionMap = new Texture2D(
    engine,
    terrain.regionMapSize,
    terrain.regionMapSize,
    TextureFormat.R32G32B32A32_UInt,
    false,
    false
  );
  regionMap.setPixelBuffer(regionMapRgba);
  regionMap.filterMode = TextureFilterMode.Point;
  regionMap.wrapModeU = regionMap.wrapModeV = TextureWrapMode.Clamp;

  return new TerrainData(
    terrain.regionSize,
    terrain.regionMapSize,
    terrain.vertexSpacing,
    atlasSpec.minMetres,
    atlasSpec.maxMetres,
    regions,
    regionLayers,
    heightMaps,
    controlMaps,
    colorMaps,
    regionMap
  );
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`[TerrainData] failed to load ${url}`));
    image.src = url;
  });
}

function sliceHeightRegion(atlas: Uint16Array, atlasWidth: number, regionSize: number, sourceY: number): Uint16Array {
  const region = new Uint16Array(regionSize * regionSize);
  for (let row = 0; row < regionSize; row++) {
    const sourceStart = (sourceY + row) * atlasWidth;
    region.set(atlas.subarray(sourceStart, sourceStart + regionSize), row * regionSize);
  }
  return region;
}

async function loadBuffer(engine: Engine, url: string): Promise<ArrayBuffer> {
  const asset = await engine.resourceManager.load<BufferAsset>({ url, type: AssetType.Buffer });
  if (!(asset instanceof BufferAsset)) {
    throw new Error(`[TerrainData] ${url} did not resolve to BufferAsset`);
  }
  return asset.buffer;
}
