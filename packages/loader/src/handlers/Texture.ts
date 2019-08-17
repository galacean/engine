import {Texture2D} from '@alipay/o3-material';
import {TextureFilter, TextureWrapMode} from '@alipay/o3-base';
import {Request, Prop, HandlerCb} from '../type';
import {Resource} from '../Resource';

/**
 * @private
 */
export class TextureHandler {

  load(request: Request, props: Prop, callback: HandlerCb) {
    request.load(props.handlerType, props, function (err, img) {

      if (!err) {

        callback(null, img);

      } else {

        callback('Error loading Texture from ' + props.url);

      }

    });
  }

  open(resource: Resource) {

    if (resource.handlerType === 'video') {
      const config = {
        ...{
          magFilter: TextureFilter.LINEAR,
          minFilter: TextureFilter.LINEAR,
          wrapS: TextureWrapMode.CLAMP_TO_EDGE,
          wrapT: TextureWrapMode.CLAMP_TO_EDGE
        }, ...resource.config
      }
      const tex = new Texture2D(resource.name, resource.data, config);
      tex.type = resource.assetType;
      resource.asset = tex;
    } else {
      const tex = new Texture2D(resource.name, resource.data, resource.config);
      tex.type = resource.assetType;
      resource.asset = tex;
    }

  }

}
