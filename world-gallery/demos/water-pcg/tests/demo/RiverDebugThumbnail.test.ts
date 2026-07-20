import { describe, expect, it } from "vitest";
import { RiverReadonlyUint8Buffer } from "../../compiler/shared/ReadonlyNumericBuffer";
import type { RiverLocalMapAtlasData } from "../../compiler/river/types";
import { RiverDebugChannel } from "../../demo/debug/RiverDebugSession";
import { decodeRiverLocalMapThumbnail } from "../../demo/debug/RiverDebugThumbnail";

const ATLAS: RiverLocalMapAtlasData = {
  width: 2,
  height: 1,
  padding: 0,
  tiles: [],
  pixels: new RiverReadonlyUint8Buffer([255, 0, 64, 0, 128, 128, 255, 255])
};

describe("decodeRiverLocalMapThumbnail", () => {
  it("decodes signed Local Flow RG into an inspectable color field", () => {
    const raster = decodeRiverLocalMapThumbnail(ATLAS, RiverDebugChannel.LocalFlow);

    expect(raster.width).toBe(2);
    expect(raster.height).toBe(1);
    expect(Array.from(raster.pixels)).toEqual([255, 0, 128, 255, 128, 128, 128, 255]);
  });

  it("decodes foam and signed distance without mutating the source atlas", () => {
    const before = Array.from(ATLAS.pixels);
    const foam = decodeRiverLocalMapThumbnail(ATLAS, RiverDebugChannel.LocalFoam);
    const signedDistance = decodeRiverLocalMapThumbnail(ATLAS, RiverDebugChannel.LocalSignedDistance);

    expect(Array.from(foam.pixels)).toEqual([64, 64, 64, 255, 255, 255, 255, 255]);
    expect(Array.from(signedDistance.pixels)).toEqual([255, 70, 0, 255, 0, 70, 255, 255]);
    expect(Array.from(ATLAS.pixels)).toEqual(before);
  });

  it("uses the packed RGB channels for the Atlas Rect overview", () => {
    const raster = decodeRiverLocalMapThumbnail(ATLAS, RiverDebugChannel.AtlasRect);

    expect(Array.from(raster.pixels)).toEqual([255, 0, 64, 255, 128, 128, 255, 255]);
  });
});
