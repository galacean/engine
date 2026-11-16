import { beforeAll, vi } from "vitest";
import { server } from "@vitest/browser/context";

declare module "@vitest/browser/context" {
  interface BrowserCommands {
    mockRemoteAsset(pattern: string, localFile: string): Promise<void>;
  }
}

export const webgl1PolyfillURLPattern =
  /^https:\/\/mdn\.alipayobjects\.com\/rms\/afts\/file\/[^/]+\/engine-webgl1-polyfill\.js(?:\?retry=\d+)?$/;

beforeAll(() =>
  server.commands.mockRemoteAsset(webgl1PolyfillURLPattern.source, "packages/webgl1-polyfill/dist/module.js")
);

export function createWebGL1Canvas(): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  const getContext = canvas.getContext.bind(canvas);
  canvas.getContext = ((type: string, options?: unknown) =>
    type === "webgl2" || type === "experimental-webgl2" ? null : getContext(type, options)) as typeof canvas.getContext;
  return canvas;
}

export function makeFallbackCanvas() {
  const canvas = document.createElement("canvas");
  const getContext = canvas.getContext.bind(canvas);
  const attempts = vi.spyOn(canvas, "getContext").mockImplementation((type: string, options?: unknown) => {
    if (type === "webgl2" || type === "experimental-webgl2") return null;
    return getContext(type, options);
  });
  return { canvas, attempts };
}
