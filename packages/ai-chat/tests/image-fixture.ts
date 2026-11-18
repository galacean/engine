import type { AgentMessage } from "../src/ai-chat/agent-types";
import { imageDataUrl, imageFromDataUrl } from "../src/ai-chat/image-resources";
export const fixtureBlob = (dataUrl: string) => imageFromDataUrl(dataUrl, 1, 1).blob;
export async function serializedImages(messages: readonly AgentMessage[]): Promise<string> {
  return JSON.stringify(await Promise.all(messages.map(async m => m.role === "user" && m.image
    ? { ...m, image: { width: m.image.width, height: m.image.height, dataUrl: await imageDataUrl(m.image.blob) } } : m)));
}
