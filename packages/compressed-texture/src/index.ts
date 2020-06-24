import { ResourceLoader } from "@alipay/o3-loader";

import { KTXTextureHandler, parseSingleKTX, parseCubeKTX } from "./loader/KTXTextureLoader";
import { KTXTextureNewHandler } from "./loader/KTXTextureNewLoader";

ResourceLoader.registerHandler("ktx", new KTXTextureHandler());
ResourceLoader.registerHandler("ktxNew", new KTXTextureNewHandler());

export { CompressedTexture2D } from "./CompressedTexture2D";
export { CompressedTextureCubeMap } from "./CompressedTextureCubeMap";
export { parseCubeKTX, parseSingleKTX };
