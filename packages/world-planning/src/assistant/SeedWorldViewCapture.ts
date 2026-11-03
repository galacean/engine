import { encodeImage } from "@galacean/engine-ai-chat/ai-chat/image-resources";
import type { AgentViewObservation } from "@galacean/engine-ai-chat/ai-chat/agent-types";

/** Encode exactly the color buffer paired with a view snapshot. */
export async function encodeSeedWorldView(
  pixels: Uint8Array,
  width: number,
  height: number
): Promise<AgentViewObservation["image"]> {
  const source = document.createElement("canvas");
  source.width = width;
  source.height = height;
  const context = source.getContext("2d");
  if (!context) throw new Error("2D image encoding is unavailable");
  const data = context.createImageData(width, height);
  // The engine already flips projection when rendering to a texture.
  data.data.set(pixels);
  context.putImageData(data, 0, 0);
  try {
    return await encodeImage(source);
  } finally {
    source.width = source.height = 0;
  }
}

/** Same delivered resolution for normal-frame color, identity and fixture coordinates. */
export function seedWorldViewSize(width: number, height: number): { width: number; height: number } {
  if (
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    width <= 0 ||
    height <= 0 ||
    width * height > 16 * 1024 * 1024
  )
    throw new Error("Viewport size is unavailable or too large");
  const scale = Math.min(1, 768 / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}
