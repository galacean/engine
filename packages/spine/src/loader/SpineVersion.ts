/** Read only the export header, before selecting or invoking a version-specific parser. */
export function readSpineVersion(data: string | ArrayBuffer): string {
  if (typeof data === "string") {
    const version = JSON.parse(data).skeleton?.spine;
    if (typeof version === "string" && /^\d+\.\d+(?:\.|$)/.test(version)) return version;
    throw new Error("Spine JSON is missing a valid skeleton.spine export version.");
  }

  const bytes = new Uint8Array(data);
  function readString(offset: number): { value: string; end: number } | null {
    let count = 0;
    for (let shift = 0; shift < 35; shift += 7) {
      if (offset >= bytes.length) return null;
      const byte = bytes[offset++];
      count += (byte & 127) * 2 ** shift;
      if ((byte & 128) === 0) {
        const end = offset + Math.max(0, count - 1);
        if (end > bytes.length) return null;
        return { value: new TextDecoder().decode(bytes.subarray(offset, end)), end };
      }
    }
    return null;
  }

  // 3.x stores the hash as a length-prefixed string. 4.x stores an eight-byte hash.
  const hash = readString(0);
  const oldVersion = hash && readString(hash.end)?.value;
  const newVersion = readString(8)?.value;
  const candidates = [
    oldVersion && /^3\.\d+\.\d+$/.test(oldVersion) ? oldVersion : null,
    newVersion && /^4\.\d+\.\d+$/.test(newVersion) ? newVersion : null
  ].filter(Boolean);
  if (candidates.length !== 1) {
    throw new Error("Cannot determine Spine binary export version: invalid or ambiguous header.");
  }
  return candidates[0];
}
