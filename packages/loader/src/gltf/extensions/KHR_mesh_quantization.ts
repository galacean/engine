import { registerExtension } from "../parser/Parser";
import { ExtensionParser } from "./ExtensionParser";

@registerExtension("KHR_mesh_quantization")
class KHR_mesh_quantization extends ExtensionParser {}
