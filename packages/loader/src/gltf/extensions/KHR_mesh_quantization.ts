import { registerGLTFExtension } from "../parser/GLTFParser";
import { GLTFExtensionMode, GLTFExtensionParser } from "./GLTFExtensionParser";

@registerGLTFExtension("KHR_mesh_quantization", GLTFExtensionMode.AdditiveParse)
class KHR_mesh_quantization extends GLTFExtensionParser {}
