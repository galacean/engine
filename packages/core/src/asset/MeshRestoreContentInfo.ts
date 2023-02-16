import { RequestConfig } from "./request";
import { RestoreContentInfo } from "./RestoreContentInfo";

export class MeshRestoreContentInfo extends RestoreContentInfo {
  constructor(
    public url: string,
    public requestConfig: RequestConfig,
    public bufferOffset?: number,
    public bufferLength?: number,
    public mimeType?: string
  ) {
    super();
  }

  restoreContent(): void {
    
  }
}
