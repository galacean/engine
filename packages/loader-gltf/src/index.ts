import { GLBHandler } from "./glb";
import { GLTFHandler } from "./glTF";
import { ResourceLoader } from "@alipay/o3-loader";

ResourceLoader.registerHandler("gltf", new GLTFHandler());
ResourceLoader.registerHandler("glb", new GLBHandler());

export { HandledExtensions, RegistExtension } from "./glTF";
