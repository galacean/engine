import { Texture2D } from "@alipay/o3-material";
import { Request, Prop, HandlerCb } from "../type";
import { Resource } from "../Resource";

/**
 * Canvas Texture:
 *   given size & draw(ctx, params),
 *   runs the `draw` function, returns the canvas as texture
 *
 * Basic Usage:
 * let res = new Resource('image-name', {
 *  type : 'canvastexture',
 *  config: {
 *    magFilter: TextureFilter.LINEAR,
 *    minFilter: TextureFilter.LINEAR_MIPMAP_LINEAR,
 *    width: 512, height: 512,
 *    color: 'rgb(0,10,40)',
 *    draw: function(ctx, params) {
 *      ctx.fillStyle = params.color;
 *      ctx.fillRect(0,0, params.width, params.height);
 *    }
 *  }
 * });
 *
 * // load resource ...
 */
export class CanvasTextureHandler {
  load(request: Request, props: Prop, callback: HandlerCb) {
    if (!props.hasOwnProperty("draw")) {
      callback('canvastexture resource has no "draw" function specified', null);
    } else {
      const width = props.width || 256;
      const height = props.height || 256;
      props.width = width;
      props.height = height;
      // let params = {width: width, height: height, };
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      props.draw(ctx, props);
      callback(null, canvas);
    }
  }

  open(resource: Resource) {
    const tex = new Texture2D(resource.name, resource.data, resource.config);
    resource.asset = tex;
  }
}
