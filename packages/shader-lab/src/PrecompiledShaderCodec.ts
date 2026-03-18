import { IPrecompiledShader } from "@galacean/engine-design";

/** Magic bytes: "GSB\0" */
const MAGIC = 0x00425347;
/** Header size in bytes: magic(4) + version(2) + flags(2) = 8 */
const HEADER_SIZE = 8;

/**
 * Current precompiled shader format version.
 * Increment when the format changes in a backward-incompatible way.
 */
export const PRECOMPILE_VERSION = 1;

/**
 * Encode an IPrecompiledShader into a binary ArrayBuffer (.gsb format).
 *
 * Format:
 *  [0-3]  magic: "GSB\0" (uint32 LE)
 *  [4-5]  format version (uint16 LE)
 *  [6-7]  reserved flags (uint16 LE)
 *  [8..]  JSON payload (UTF-8 encoded)
 */
export function encode(data: IPrecompiledShader): ArrayBuffer {
  const jsonStr = JSON.stringify(data);
  const encoder = new TextEncoder();
  const jsonBytes = encoder.encode(jsonStr);

  const buffer = new ArrayBuffer(HEADER_SIZE + jsonBytes.byteLength);
  const view = new DataView(buffer);

  // Write header
  view.setUint32(0, MAGIC, true);
  view.setUint16(4, data.version, true);
  view.setUint16(6, 0, true); // reserved flags

  // Write JSON payload
  const uint8 = new Uint8Array(buffer, HEADER_SIZE);
  uint8.set(jsonBytes);

  return buffer;
}

/**
 * Decode a binary ArrayBuffer (.gsb format) into an IPrecompiledShader.
 * @throws Error if magic bytes are invalid or version is incompatible.
 */
export function decode(buffer: ArrayBuffer): IPrecompiledShader {
  if (buffer.byteLength < HEADER_SIZE) {
    throw new Error("Invalid .gsb file: buffer too small.");
  }

  const view = new DataView(buffer);

  // Validate magic
  const magic = view.getUint32(0, true);
  if (magic !== MAGIC) {
    throw new Error(`Invalid .gsb file: bad magic 0x${magic.toString(16)}, expected 0x${MAGIC.toString(16)}.`);
  }

  // Validate version
  const version = view.getUint16(4, true);
  if (version > PRECOMPILE_VERSION) {
    throw new Error(
      `Incompatible .gsb version ${version}, current supported version is ${PRECOMPILE_VERSION}. Please update the engine.`
    );
  }

  // Decode JSON payload
  const decoder = new TextDecoder();
  const jsonStr = decoder.decode(new Uint8Array(buffer, HEADER_SIZE));
  const data: IPrecompiledShader = JSON.parse(jsonStr);

  return data;
}
