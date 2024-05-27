export class Logger {
  static enabled = true;
  private enabled = true;

  readonly name: string;

  constructor(name: string) {
    this.name = name;
  }

  log(color: number, ...param: any[]) {
    if (Logger.enabled && this.enabled) console.log(`\x1B[38;5;${color}m[${this.name}]`, ...param, "\x1B[m");
  }

  error(...param: any[]) {
    this.log(Logger.RED, ...param);
  }

  static RED = 1;
  static YELLOW = 11;
  static GREEN = 41;
}
