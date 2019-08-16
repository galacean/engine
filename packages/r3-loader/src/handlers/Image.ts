import {Request, Prop, HandlerCb} from '../type';
import {Resource} from '../Resource';

/**
 * @private
 */
export class ImageHandler {

  load(request: Request, props: Prop, callback: HandlerCb) {

    props.reSample = props.reSample || false;

    request.load('image', props, function (err, img) {

      if (!err) {

        callback(null, img);

      } else {

        callback('Error loading Texture from ' + props.url);

      }

    });

  }

  open(resource: Resource) {

    resource.asset = resource.data;

  }

}
