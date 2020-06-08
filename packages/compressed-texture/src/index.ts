import { ResourceLoader } from "@alipay/o3-loader";

import { KTXTextureHandler, parseSingleKTX, parseCubeKTX } from "./loader/KTXTextureLoader";

ResourceLoader.registerHandler("ktx", new KTXTextureHandler());

export { CompressedTexture2D } from "./CompressedTexture2D";
export { CompressedTextureCubeMap } from "./CompressedTextureCubeMap";
export { parseCubeKTX, parseSingleKTX };
