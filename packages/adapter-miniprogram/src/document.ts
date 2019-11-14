import HTMLElement from "./HTMLElement";
import HTMLVideoElement from "./HTMLVideoElement";
import Image from "./Image";
import { getCanvas, getCanvas2D } from "./register";
import Event from "./Event";

class Body extends HTMLElement {
  constructor() {
    // 为了性能, 此处不按照标准的DOM层级关系设计
    // 将 body 设置为 0级, parent元素为null
    super("body", 0);
  }

  addEventListener(type, listener, options = {}) {
    document.addEventListener(type, listener, options);
  }

  removeEventListener(type, listener) {
    document.removeEventListener(type, listener);
  }

  dispatchEvent(event: Event) {
    document.dispatchEvent(event);
  }
}

class DocumentElement extends HTMLElement {
  constructor() {
    super("html", 0);
  }

  addEventListener(type, listener, options = {}) {
    document.addEventListener(type, listener, options);
  }

  removeEventListener(type, listener) {
    document.removeEventListener(type, listener);
  }

  dispatchEvent(event: Event) {
    document.dispatchEvent(event);
  }
}

const events = {};

const document = {
  readyState: "complete",
  visibilityState: "visible", // 'visible' , 'hidden'
  hidden: false,
  fullscreen: true,

  scripts: [],
  style: {},

  ontouchstart: null,
  ontouchmove: null,
  ontouchend: null,
  onvisibilitychange: null,

  parentNode: null,
  parentElement: null,
  head: null,
  body: null,
  documentElement: null,
  createElement(tagName) {
    tagName = tagName.toLowerCase();
    if (tagName === "canvas") {
      return getCanvas2D();
    } else if (tagName === "img") {
      return new Image();
    } else if (tagName === "video") {
      return new HTMLVideoElement();
    }

    return new HTMLElement(tagName);
  },

  createElementNS(nameSpace, tagName) {
    return this.createElement(tagName);
  },

  createTextNode(text) {
    // TODO: Do we need the TextNode Class ???
    return text;
  },

  getElementById(id) {
    let canvas = getCanvas();
    let canvas2D = getCanvas2D();
    if (id === canvas.id) {
      return canvas;
    } else if (id === canvas2D.id) {
      return canvas2D;
    }
    return null;
  },

  getElementsByTagName(tagName) {
    tagName = tagName.toLowerCase();
    if (tagName === "head") {
      return [document.head];
    } else if (tagName === "body") {
      return [document.body];
    } else if (tagName === "canvas") {
      return [getCanvas(), getCanvas2D()];
    }
    return [];
  },

  getElementsByTagNameNS(nameSpace, tagName) {
    return this.getElementsByTagName(tagName);
  },

  getElementsByName(tagName) {
    if (tagName === "head") {
      return [document.head];
    } else if (tagName === "body") {
      return [document.body];
    } else if (tagName === "canvas") {
      return [getCanvas(), getCanvas2D()];
    }
    return [];
  },

  querySelector(query) {
    let canvas = getCanvas();
    let canvas2D = getCanvas2D();
    if (query === "head") {
      return document.head;
    } else if (query === "body") {
      return document.body;
    } else if (query === "canvas") {
      return canvas;
    } else if (query === `#${canvas.id}`) {
      return canvas;
    } else if (query === `#${canvas2D.id}`) {
      return canvas2D;
    }
    return null;
  },

  querySelectorAll(query) {
    if (query === "head") {
      return [document.head];
    } else if (query === "body") {
      return [document.body];
    } else if (query === "canvas") {
      return [getCanvas(), getCanvas2D()];
    }
    return [];
  },

  addEventListener(type, listener, options) {
    if (!events[type]) {
      events[type] = [];
    }
    events[type].push(listener);
  },

  removeEventListener(type, listener) {
    const listeners = events[type];

    if (listeners && listeners.length > 0) {
      for (let i = listeners.length; i--; i > 0) {
        if (listeners[i] === listener) {
          listeners.splice(i, 1);
          break;
        }
      }
    }
  },

  dispatchEvent(event: Event) {
    const type = event.type;
    const listeners = events[type];

    if (listeners) {
      for (let i = 0; i < listeners.length; i++) {
        listeners[i](event);
      }
    }

    if (event.target && typeof event.target["on" + type] === "function") {
      event.target["on" + type](event);
    }
  }
};

document.documentElement = new DocumentElement();
document.head = new HTMLElement("head");
document.body = new Body();

export default document;
