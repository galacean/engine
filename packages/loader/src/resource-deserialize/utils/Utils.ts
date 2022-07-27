/**
 * Array buffer to string.
 * @param buf
 */
export function ab2str(buf: ArrayBuffer) {
  return String.fromCharCode.apply(null, new Uint16Array(buf));
}
