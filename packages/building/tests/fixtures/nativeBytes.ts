/** Test-only native capture decoder, shared by Node and browser acceptance. */
export function nativeBytes(hex: string): DataView {
  if (hex.length % 2 || !/^[0-9a-f]*$/i.test(hex)) throw Error("Native hexadecimal bytes required");
  return new DataView(Uint8Array.from(hex.match(/../g) ?? [], (byte) => parseInt(byte, 16)).buffer);
}
