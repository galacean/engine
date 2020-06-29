import { ResourceLoader } from "./ResourceLoader";
import { Resource } from "./Resource";
import * as path from "./path";

import { TextureHandler } from "./handlers/Texture";
import { TechniqueHandler } from "./handlers/Technique";
import { ImageHandler } from "./handlers/Image";
import { VideoHandler } from "./handlers/video";
import { TextureCubeMapHandler } from "./handlers/TextureCubeMap";
import { CanvasTextureHandler } from "./handlers/CanvasTexture";
import { TextureNewHandler } from "./handlers/TextureNew";
import { TextureCubeMapNewHandler } from "./handlers/TextureCubeMapNew";

// register default handlers
ResourceLoader.registerHandler("texture", new TextureHandler());
ResourceLoader.registerHandler("technique", new TechniqueHandler());
ResourceLoader.registerHandler("image", new ImageHandler());
ResourceLoader.registerHandler("video", new VideoHandler());
ResourceLoader.registerHandler("cubemap", new TextureCubeMapHandler());
ResourceLoader.registerHandler("canvastexture", new CanvasTextureHandler());

ResourceLoader.registerHandler("textureNew", new TextureNewHandler());
ResourceLoader.registerHandler("cubemapNew", new TextureCubeMapNewHandler());

export { ResourceLoader, Resource, path };

export { openTechnique } from "./handlers/Technique";
