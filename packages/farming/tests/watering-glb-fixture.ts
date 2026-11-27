import { readFileSync } from "node:fs";

/** Keep import tests self-contained after Farming externalized its shared KTX2 textures. */
export function wateringGlbFixture(): Uint8Array {
  const url = new URL("../src/farming/assets/watering/watering-can.glb", import.meta.url);
  const bytes = readFileSync(url);
  const jsonLength = bytes.readUInt32LE(12);
  const document = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString());
  for (const image of document.images ?? []) {
    if (!image.uri || image.uri.startsWith("data:")) continue;
    const imageBytes = readFileSync(new URL(image.uri, url));
    image.uri = `data:${image.mimeType};base64,${imageBytes.toString("base64")}`;
  }
  const json = Buffer.from(JSON.stringify(document));
  const padded = Buffer.alloc(Math.ceil(json.length / 4) * 4, 0x20);
  json.copy(padded);
  const header = Buffer.from(bytes.subarray(0, 20));
  const remaining = bytes.subarray(20 + jsonLength);
  header.writeUInt32LE(20 + padded.length + remaining.length, 8);
  header.writeUInt32LE(padded.length, 12);
  return new Uint8Array(Buffer.concat([header, padded, remaining]));
}
