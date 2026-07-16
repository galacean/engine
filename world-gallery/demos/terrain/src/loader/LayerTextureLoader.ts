import { Engine, Texture2DArray, TextureFilterMode, TextureFormat, TextureWrapMode } from "@galacean/engine";
import { LayerSpec } from "./ManifestLoader";

async function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`[LayerTextureLoader] failed to load ${url}`));
    img.src = url;
  });
}

async function loadImageAtResolution(url: string, target: number): Promise<ImageBitmap> {
  const img = await loadImage(url);
  // Rescale via createImageBitmap so every layer slot shares the array dimensions. Nearest is fine here —
  // the PBR textures are much higher-res than the target anyway; a proper mip chain is S2.
  return createImageBitmap(img, {
    resizeWidth: target,
    resizeHeight: target,
    resizeQuality: "high"
  });
}

/**
 * Build one sRGB albedo array and one linear normal array covering the manifest's Terrain-kind layers, in id
 * order. Both arrays share a single resolution so shader UV sampling stays uniform.
 */
export async function loadLayerTextureArrays(
  engine: Engine,
  layers: LayerSpec[],
  baseUrl: string,
  size = 1024
): Promise<{ albedo: Texture2DArray; normal: Texture2DArray; layerCount: number }> {
  const terrainLayers = layers.filter((l) => l.kind === "Terrain" && l.textures?.albedo);
  const albedoArray = new Texture2DArray(engine, size, size, terrainLayers.length, TextureFormat.R8G8B8A8, true, true);
  const normalArray = new Texture2DArray(engine, size, size, terrainLayers.length, TextureFormat.R8G8B8A8, true, false);
  for (const tex of [albedoArray, normalArray]) {
    tex.filterMode = TextureFilterMode.Bilinear;
    tex.wrapModeU = tex.wrapModeV = TextureWrapMode.Repeat;
  }

  await Promise.all(
    terrainLayers.map(async (layer) => {
      const idx = layer.id;
      const albedoUrl = new URL(layer.textures!.albedo, baseUrl).href;
      const albedoImg = await loadImageAtResolution(albedoUrl, size);
      albedoArray.setImageSource(idx, albedoImg);
      if (layer.textures!.normal) {
        const normalUrl = new URL(layer.textures!.normal, baseUrl).href;
        const normalImg = await loadImageAtResolution(normalUrl, size);
        normalArray.setImageSource(idx, normalImg);
      }
    })
  );

  albedoArray.generateMipmaps();
  normalArray.generateMipmaps();

  return { albedo: albedoArray, normal: normalArray, layerCount: terrainLayers.length };
}
