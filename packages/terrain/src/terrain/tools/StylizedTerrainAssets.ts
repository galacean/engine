import colorFieldUrl from "../../data/seed-world/public/textures/grass-color-detail.r8?url";
import clusterNormalUrl from "../../data/seed-world/public/textures/grass-surface-normal.rgb8?url";
import { generateTerrainTexture } from "./TerrainTextureGenerator";

const roadColor = [0.5520114015120001, 0.44520119451622786, 0.2831487404299921] as const;
const layerAlbedo = [
  { property: "lowGroundTexture", name: "Terrain-Low-Ground", low: [0.014, 0.067, 0.115], high: [0.018, 0.082, 0.145] },
  { property: "coastTexture", name: "Terrain-Coast", low: [0.5, 0.4, 0.25], high: roadColor },
  { property: "roadTexture", name: "Terrain-Road", low: [0.49, 0.39, 0.25], high: roadColor }
] as const;

/** Generates repeatable albedos for the non-grass layers. Grass colour comes from the shared field. */
export function generateStylizedTerrainAlbedo() {
  const size = 64;
  return layerAlbedo.map(({ property, name, low, high }, index) => ({
    property,
    name,
    size,
    pixels: generateTerrainTexture({
      size,
      seed: 41023 + (property === "roadTexture" ? 3 : index),
      low,
      high,
      frequency: 8,
      colorSpace: "sRGB"
    })
  }));
}

/** Returns linear, uploadable maps from the authored stylized texture sources. */
export async function generateStylizedTerrainMaps() {
  const read = async (url: string, channels: number) => {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Stylized terrain map: HTTP ${response.status}`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    const size = Math.sqrt(bytes.length / channels);
    if (!Number.isInteger(size) || size < 1) throw new RangeError("A stylized map must have square dimensions");
    return { bytes, size };
  };
  const [field, normal] = await Promise.all([read(colorFieldUrl, 1), read(clusterNormalUrl, 3)]);
  const colorField = new Uint8Array(field.bytes.length * 4);
  for (let i = 0; i < field.bytes.length; i++) {
    colorField.set([field.bytes[i], field.bytes[i], field.bytes[i], 255], i * 4);
  }
  const clusterNormal = new Uint8Array(normal.size ** 2 * 4);
  for (let i = 0; i < normal.size ** 2; i++) {
    // The source is world XYZ with Y up. Terrain layers store tangent RGB with Z up.
    const x = normal.bytes[i * 3];
    const y = normal.bytes[i * 3 + 1];
    const z = normal.bytes[i * 3 + 2];
    clusterNormal.set([x, z, y, 255], i * 4);
  }
  return {
    colorField: { size: field.size, pixels: colorField },
    clusterNormal: { size: normal.size, pixels: clusterNormal }
  };
}
