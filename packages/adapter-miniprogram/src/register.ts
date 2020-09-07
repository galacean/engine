import devicePixelRatio from "./devicePixelRatio";
import * as Mixin from "./util/mixin";
import document from "./document";

/**同步和异步都需要的数据*/
let canvas: any = {};
let canvas2D: any = {};

/**异步注册3Dcanvas*/
function registerCanvas(canvas, id: string) {
  canvas.id = id;

  if (!("tagName" in canvas)) {
    canvas.tagName = "CANVAS";
  }

  canvas.type = "canvas";

  Mixin.parentNode(canvas);
  Mixin.style(canvas);
  Mixin.classList(canvas);
  Mixin.clientRegion(canvas);
  Mixin.offsetRegion(canvas);

  canvas.focus = function () {};
  canvas.blur = function () {};

  canvas.addEventListener = function (type, listener, options = {}) {
    document.addEventListener(type, listener, options);
  };

  canvas.removeEventListener = function (type, listener) {
    document.removeEventListener(type, listener);
  };

  canvas.dispatchEvent = function (event: Event) {
    document.dispatchEvent(event);
  };
}

/**异步注册2Dcanvas*/
function registerCanvas2D(ctx, id: string) {
  const width = 1024;
  const height = 1024;
  canvas2D = {
    width,
    height,
    clientWidth: width / devicePixelRatio,
    clientHeight: height / devicePixelRatio,
    id,
    type: "canvas"
  };

  if (!("tagName" in canvas2D)) {
    canvas2D.tagName = "CANVAS";
  }

  Mixin.parentNode(canvas2D);
  Mixin.style(canvas2D);
  Mixin.classList(canvas2D);
  Mixin.clientRegion(canvas2D);
  Mixin.offsetRegion(canvas2D);

  canvas2D.getContext = function (type) {
    if (type === "2d") {
      return ctx;
    }
  };
  canvas2D.focus = function () {};
  canvas2D.blur = function () {};

  canvas2D.addEventListener = function (type, listener, options = {}) {
    document.addEventListener(type, listener, options);
  };

  canvas2D.removeEventListener = function (type, listener) {
    document.removeEventListener(type, listener);
  };

  canvas2D.dispatchEvent = function (event: Event) {
    document.dispatchEvent(event);
  };
}

/**异步获取3Dcanvas*/
function getCanvas() {
  return canvas;
}

/**异步获取2Dcanvas*/
function getCanvas2D() {
  return canvas2D;
}

export { registerCanvas, registerCanvas2D, getCanvas, getCanvas2D };
