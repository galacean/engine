import { vi } from "vitest";

export function useLocalBasis() {
  const localBasis: Record<string, string> = {
    "basis_transcoder.js": new URL("../../../packages/loader/libs/basis_transcoder.js", import.meta.url).href,
    "basis_transcoder.wasm": new URL("../../../packages/loader/libs/basis_transcoder.wasm", import.meta.url).href
  };
  const fetchResource = globalThis.fetch.bind(globalThis);
  return vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
    const url = new URL(input instanceof Request ? input.url : input, location.href);
    const local = url.hostname === "mdn.alipayobjects.com" && localBasis[url.pathname.split("/").pop()!];
    return fetchResource(local || input, init);
  });
}
