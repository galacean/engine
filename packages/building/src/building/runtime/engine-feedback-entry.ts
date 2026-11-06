import { WebGLEngine, WebGLMode } from "@galacean/engine";
export { EngineRoofFeedback } from "./EngineRoofFeedback";

/** The render canvas owns one context; compute and draw borrow that same device. */
export async function createFeedbackEngine(canvas: HTMLCanvasElement): Promise<WebGLEngine> {
  return WebGLEngine.create({
    canvas,
    graphicDeviceOptions: {
      webGLMode: WebGLMode.WebGL2
    }
  });
}
