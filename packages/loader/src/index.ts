import { ResourceLoader } from './ResourceLoader';
import { Resource } from './Resource';
import * as path from './path';

import { TextureHandler } from './handlers/Texture';
import { TechniqueHandler } from './handlers/Technique';
import { ImageHandler } from './handlers/Image';
import { VideoHandler } from './handlers/Video';
import { TextureCubeMapHandler } from './handlers/TextureCubeMap';
import { CanvasTextureHandler } from './handlers/CanvasTexture';

// register default handlers
ResourceLoader.registerHandler( 'texture', new TextureHandler() );
ResourceLoader.registerHandler( 'technique', new TechniqueHandler() );
ResourceLoader.registerHandler( 'image', new ImageHandler() );
ResourceLoader.registerHandler( 'video', new VideoHandler() );
ResourceLoader.registerHandler( 'cubemap', new TextureCubeMapHandler() );
ResourceLoader.registerHandler( 'canvastexture', new CanvasTextureHandler() );

export { ResourceLoader, Resource, path };

export { openTechnique } from './handlers/Technique';
