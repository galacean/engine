/** Pure pixel conversion helpers for Water PCG debug-card thumbnails. */
import type { RiverLocalMapAtlasData } from "../../compiler/river/types";
import { RiverDebugChannel } from "./RiverDebugSession";

export interface RiverDebugRaster {
  readonly width: number;
  readonly height: number;
  readonly pixels: Uint8ClampedArray;
}

function signedByteToUnit(value: number): number {
  return (value / 255) * 2 - 1;
}

function byte(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

export function decodeRiverLocalMapThumbnail(
  atlas: RiverLocalMapAtlasData,
  channel: RiverDebugChannel
): RiverDebugRaster {
  const source = atlas.pixels.toTypedArray();
  const pixels = new Uint8ClampedArray(atlas.width * atlas.height * 4);
  for (let index = 0; index < atlas.width * atlas.height; index++) {
    const sourceOffset = index * 4;
    const targetOffset = index * 4;
    const flowX = signedByteToUnit(source[sourceOffset]);
    const flowZ = signedByteToUnit(source[sourceOffset + 1]);
    const foam = source[sourceOffset + 2];
    const signedDistance = signedByteToUnit(source[sourceOffset + 3]);
    if (channel === RiverDebugChannel.LocalFlow) {
      pixels[targetOffset] = byte((flowX * 0.5 + 0.5) * 255);
      pixels[targetOffset + 1] = byte((flowZ * 0.5 + 0.5) * 255);
      pixels[targetOffset + 2] = 128;
    } else if (channel === RiverDebugChannel.LocalFoam) {
      pixels[targetOffset] = foam;
      pixels[targetOffset + 1] = foam;
      pixels[targetOffset + 2] = foam;
    } else if (channel === RiverDebugChannel.LocalSignedDistance) {
      const magnitude = Math.abs(signedDistance);
      pixels[targetOffset] = signedDistance < 0 ? byte(50 + magnitude * 205) : byte(30 * (1 - magnitude));
      pixels[targetOffset + 1] = byte(70 + (1 - magnitude) * 90);
      pixels[targetOffset + 2] = signedDistance >= 0 ? byte(50 + magnitude * 205) : byte(30 * (1 - magnitude));
    } else {
      pixels[targetOffset] = source[sourceOffset];
      pixels[targetOffset + 1] = source[sourceOffset + 1];
      pixels[targetOffset + 2] = source[sourceOffset + 2];
    }
    pixels[targetOffset + 3] = 255;
  }
  return { width: atlas.width, height: atlas.height, pixels };
}
