// Controllable logger for the shader packages. Mirrors engine-core's Logger API (off by default,
// toggled via enable/disable) but is a local copy so shader-parser keeps zero engine-core dependency.
const noop = (_message?: unknown, ..._optionalParams: unknown[]): void => {};

export const Logger = {
  debug: noop,
  info: noop,
  warn: noop,
  error: noop,
  isEnabled: false,

  /** Turn logging on (binds to `console`). */
  enable(): void {
    this.debug = console.log.bind(console);
    this.info = console.info.bind(console);
    this.warn = console.warn.bind(console);
    this.error = console.error.bind(console);
    this.isEnabled = true;
  },

  /** Turn logging off. */
  disable(): void {
    this.debug = noop;
    this.info = noop;
    this.warn = noop;
    this.error = noop;
    this.isEnabled = false;
  }
};
