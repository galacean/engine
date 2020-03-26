import { ResourceLoader } from "@alipay/o3-loader";

import { KTXTextureHandler } from "./loader/KTXTextureLoader";

ResourceLoader.registerHandler("ktx", new KTXTextureHandler());
