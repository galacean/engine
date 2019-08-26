import * as Mixin from './util/mixin';
import Element from './Element';

function noop() {
}

export default class HTMLElement extends Element {
  className: string;
  children: Array<any>;
  focus: any;
  blur: any;
  insertBefore: any;
  appendChild: any;
  removeChild: any;
  remove: any;
  innerHTML: string;
  tagName: string;

  constructor(tagName = '', level?: number) {
    super();

    this.className = '';
    this.children = [];

    this.focus = noop;
    this.blur = noop;

    this.insertBefore = noop;
    this.appendChild = noop;
    this.removeChild = noop;
    this.remove = noop;

    this.innerHTML = '';

    this.tagName = tagName.toUpperCase();

    Mixin.parentNode(this, level);
    Mixin.style(this);
    Mixin.classList(this);
    Mixin.clientRegion(this);
    Mixin.offsetRegion(this);
    Mixin.scrollRegion(this);
  }
}
