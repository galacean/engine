import { ResourceLoader } from "@alipay/o3-loader";

import { KTXTextureNewHandler, parseSingleKTX, parseCubeKTX } from "./loader/KTXTextureNewLoader";

ResourceLoader.registerHandler("ktxNew", new KTXTextureNewHandler());

export { parseSingleKTX, parseCubeKTX };
