import { ResourceLoader } from "@alipay/o3-loader";

import { KTXTextureHandler } from "./loader/KTXTextureLoader";

ResourceLoader.registerHandler("ktx", new KTXTextureHandler());

export { CompressedTexture2D } from "./CompressedTexture2D";
