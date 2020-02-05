import { getCanvas } from "./register";
import * as Mixin from "./util/mixin";

export default class {
  constructor() {
    let canvas = getCanvas();

    const image = (canvas.createImage && canvas.createImage()) || {};

    if (!("tagName" in image)) {
      image.tagName = "IMG";
    }

    Mixin.parentNode(image);
    Mixin.classList(image);

    return image;
  }
}
