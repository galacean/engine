import { Texture2D } from "../texture";
import { RequestConfig } from "./request";

export class TextureContentInfo {
  constructor(
    public texture: Texture2D,
    public url: string,
    public requestConfig: RequestConfig,
    public bufferOffset?: number,
    public bufferLength?: number,
    public mimeType?: string
  ) {}
}
