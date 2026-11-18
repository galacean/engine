/** Exact comparison of immutable text and binary views, including sliced buffers. */
export function sameRuntimeProjectContent(
  a: string | Uint8Array | undefined,
  b: string | Uint8Array | undefined
): boolean {
  if (a === b) return true;
  if (!(a instanceof Uint8Array) || !(b instanceof Uint8Array) || a.length !== b.length) return false;
  let offset = 0;
  // Aligned resource buffers compare four bytes at a time, without hashing or sampling.
  if ((a.byteOffset & 3) === 0 && (b.byteOffset & 3) === 0 && a.length >= 4) {
    const length = Math.floor(a.length / 4);
    const left = new Uint32Array(a.buffer, a.byteOffset, length);
    const right = new Uint32Array(b.buffer, b.byteOffset, length);
    for (let i = 0; i < length; i++) if (left[i] !== right[i]) return false;
    offset = length * 4;
  }
  for (let i = offset; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/** Retain immutable text; detach mutable bytes when storing a cache snapshot. */
export function snapshotRuntimeProjectContent(content: string | Uint8Array | undefined): typeof content {
  return content instanceof Uint8Array ? new Uint8Array(content) : content;
}
