import { Logger } from "./Logger";
import { IIndexRange, Position } from "./common";

export default class BaseError {
  logger: Logger;

  constructor(name: string) {
    this.logger = new Logger(name);
  }

  protected throw(pos: number | Position | IIndexRange, ...msgs: any[]): never {
    this.error(pos, ...msgs);
    throw [[this.logger.name], ...msgs].join(" ");
  }

  protected error(pos: number | Position | IIndexRange, ...msgs: any[]) {
    this.logger.error(pos.toString(), ...msgs);
  }
}
