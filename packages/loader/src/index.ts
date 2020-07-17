import { ResourceLoader } from "./ResourceLoader";
import { Resource } from "./Resource";
import * as path from "./path";

import { TechniqueHandler } from "./handlers/Technique";
import { ImageHandler } from "./handlers/Image";
import { VideoHandler } from "./handlers/video";
import { TextureNewHandler } from "./handlers/TextureNew";
import { TextureCubeMapNewHandler } from "./handlers/TextureCubeMapNew";

// register default handlers
ResourceLoader.registerHandler("technique", new TechniqueHandler());
ResourceLoader.registerHandler("image", new ImageHandler());
ResourceLoader.registerHandler("video", new VideoHandler());

ResourceLoader.registerHandler("textureNew", new TextureNewHandler());
ResourceLoader.registerHandler("cubemapNew", new TextureCubeMapNewHandler());

export { ResourceLoader, Resource, path };
import "./GLTFLoader";
import "./BufferLoader";
import "./Texture2DLoader";
import "./JSONLoader";
import "./KTXLoader";

export { openTechnique } from "./handlers/Technique";
