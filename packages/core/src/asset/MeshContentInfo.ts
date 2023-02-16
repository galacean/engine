import { RequestConfig } from "./request";

export class MeshContentInfo {
  constructor(
    public url: string,
    public requestConfig: RequestConfig,
    public bufferOffset?: number,
    public bufferLength?: number,
    public mimeType?: string
  ) {}
}
