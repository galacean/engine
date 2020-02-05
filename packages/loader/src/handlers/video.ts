import { Request, Prop, HandlerCb } from "../type";
import { Resource } from "../Resource";

/**
 * @private
 */
export class VideoHandler {
  load(request: Request, props: Prop, callback: HandlerCb) {
    props.reSample = props.reSample || false;

    request.load("video", props, function(err, video) {
      if (!err) {
        callback(null, video);
      } else {
        callback("Error loading Texture from " + props.url);
      }
    });
  }

  open(resource: Resource) {
    resource.asset = resource.data;
  }
}
