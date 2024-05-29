export enum LoggerLevel {
  info = 0,
  warn = 1,
  error = 2,
  off = 3
}

export class Logger {
  static _level = LoggerLevel.error;
  static setLevel(lvl: LoggerLevel) {
    this._level = lvl;
  }

  static get enabled() {
    return Logger._level < LoggerLevel.off;
  }

  readonly name: string;

  constructor(name: string) {
    this.name = name;
  }

  private _log(color: number, ...param: any[]) {
    console.log(`\x1B[38;5;${color}m[${this.name}]`, ...param, "\x1B[m");
  }

  log(...param: any[]) {
    if (Logger._level > LoggerLevel.info) return;
    this._log(Logger.GREEN, ...param);
  }

  warn(...param: any[]) {
    if (Logger._level > LoggerLevel.warn) return;
    this._log(Logger.YELLOW, ...param);
  }

  error(...param: any[]) {
    if (Logger._level > LoggerLevel.error) return;
    this._log(Logger.RED, ...param);
  }

  static RED = 1;
  static YELLOW = 11;
  static GREEN = 41;
}
