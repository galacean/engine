import { type Engine, ModelMesh } from "@galacean/engine-core";
import { Mixin, Overwrite } from "@/override";
import type { WebGL1GraphicDevice } from "../../rhi-webgl/GLCapability";
import { WebGL1Extension } from "../../rhi-webgl/WebGL1Extension";

@Mixin("PrimitiveMesh")
export class PrimitiveMesh {
  @Overwrite
  static _createIndexedMesh(engine: Engine, indices: Uint16Array | Uint32Array): ModelMesh {
    if (
      indices instanceof Uint32Array &&
      !(engine._hardwareRenderer as WebGL1GraphicDevice).canIUse(WebGL1Extension.elementIndexUint)
    )
      throw new Error("The vertex count is over limit.");
    const mesh = new ModelMesh(engine);
    mesh.setIndices(indices);
    return mesh;
  }
}
