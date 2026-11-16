import { WebGLEngine } from "../../../galacean/dist/module.js";
import { vi } from "vitest";
import { createWebGL1Canvas } from "./canvas";

export async function createEngine(disabled: string[] = [], configureContext?: (gl: WebGLRenderingContext) => void) {
  const canvas = createWebGL1Canvas();
  canvas.width = canvas.height = 16;
  const gl = canvas.getContext("webgl")!;
  const getExtension = gl.getExtension.bind(gl);
  vi.spyOn(gl, "getExtension").mockImplementation((name) => (disabled.includes(name) ? null : getExtension(name)));
  configureContext?.(gl);
  return { engine: await WebGLEngine.create({ canvas }), gl };
}
