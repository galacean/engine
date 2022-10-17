import { GLTFResource } from "../GLTFResource";

/**
 * @internal
 */
export class ParserContext {
  glTFResource: GLTFResource;
  keepMeshData: boolean;
  createAnimator: boolean;
}
