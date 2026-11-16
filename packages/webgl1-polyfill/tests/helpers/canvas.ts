import { vi } from "vitest";

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
