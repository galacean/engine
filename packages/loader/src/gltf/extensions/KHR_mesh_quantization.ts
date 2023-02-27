import { registerGLTFExtension } from "../parser/GLTFParser";
import { GLTFExtensionParser } from "./GLTFExtensionParser";

@registerGLTFExtension("KHR_mesh_quantization")
class KHR_mesh_quantization extends GLTFExtensionParser {}
