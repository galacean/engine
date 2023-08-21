import { RenderContext } from "../RenderContext";
import { RenderData } from "../RenderData";

export interface IBatcher {
  commitRenderData(context: RenderContext, data: RenderData): void;
  flush(): void;
  uploadBuffer(): void;
  clear(): void;
}
