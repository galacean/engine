import { Texture2D } from "@alipay/o3-material";
import { Request, Prop, HandlerCb } from "../type";
import { Resource } from "../Resource";

/**
 *
 * @private
 */
export class TextureNewHandler {
  load(request: Request, props: Prop, callback: HandlerCb) {
    request.load(props.handlerType, props, function(err, img) {
      if (!err) {
        callback(null, img);
      } else {
        callback("Error loading Texture from " + props.url);
      }
    });
  }

  open(resource: Resource, rhi) {
    const { data } = resource;
    const { width, height } = data;
    const tex = new Texture2D(rhi, width, height);

    if (!tex._glTexture) return;

    tex.setImageSource(data);
    tex.generateMipmaps();

    tex.type = resource.assetType;
    resource.asset = tex;
  }
}
