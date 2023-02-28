import { registerGLTFExtension } from "../parser/GLTFParser";
import { GLTFExtensionMode, GLTFExtensionParser } from "./GLTFExtensionParser";

@registerGLTFExtension("KHR_mesh_quantization")
class KHR_mesh_quantization extends GLTFExtensionParser {
  mode = GLTFExtensionMode.AdditiveParse;
}
