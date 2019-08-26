import devicePixelRatio from './devicePixelRatio';
import * as Mixin from './util/mixin';
import document from './document';

/**同步和异步都需要的数据*/
let canvas: any = {};

/**异步注册*/
function registerCanvas(c, id: string) {
  canvas = c;
  canvas.id = id;
  canvas.clientWidth = c.width / devicePixelRatio;
  canvas.clientHeight = c.height / devicePixelRatio;

  if (!('tagName' in canvas)) {
    canvas.tagName = 'CANVAS'
  }

  canvas.type = 'canvas';

  Mixin.parentNode(canvas);
  Mixin.style(canvas);
  Mixin.classList(canvas);
  Mixin.clientRegion(canvas);
  Mixin.offsetRegion(canvas);

  canvas.focus = function () {
  };
  canvas.blur = function () {
  };

  canvas.addEventListener = function (type, listener, options = {}) {
    document.addEventListener(type, listener, options);
  }

  canvas.removeEventListener = function (type, listener) {
    document.removeEventListener(type, listener);
  }

  canvas.dispatchEvent = function (event: Event) {
    document.dispatchEvent(event);
  }
}

/**异步获取*/
function getCanvas() {
  return canvas;
}


export {
  registerCanvas,
  getCanvas,
}
