import { beforeAll, vi } from "vitest";
import { server } from "@vitest/browser/context";

declare module "@vitest/browser/context" {
  interface BrowserCommands {
    mockRemoteAsset(pattern: string, localFile: string): Promise<void>;
  }
}

beforeAll(() =>
  server.commands.mockRemoteAsset(
    /^https:\/\/cdn\.jsdelivr\.net\/npm\/@galacean\/engine-webgl1-polyfill@[^/]+\/dist\/module\.js(?:\?retry=\d+)?$/
      .source,
    "packages/webgl1-polyfill/dist/module.js"
  )
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
