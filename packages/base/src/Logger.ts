/**
 * console log的简单封装，默认为关闭状态，需要调用Logger.enable()来开启
 * @class
 * @private
 */
/* tslint:disable */
const noop = (message?: any, ...optionalParams: any[]) => {};
const debug = console.log.bind(console);
const info = console.info.bind(console);
const warn = console.warn.bind(console);
const error = console.error.bind(console);

export const Logger = {
  debug: noop,
  info: noop,
  warn: noop,
  error: noop,
  isEnabled: false,

  /** 开启Log */
  enable() {
    this.debug = debug;
    this.info = info;
    this.warn = warn;
    this.error = error;
    this.isEnabled = true;
  },

  /** 关闭Log */
  disable() {
    this.debug = noop;
    this.info = noop;
    this.warn = noop;
    this.error = noop;
    this.isEnabled = false;
  }
};
