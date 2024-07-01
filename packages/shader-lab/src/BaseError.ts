import { Logger } from "./Logger";
import { IIndexRange } from "./preprocessor/IndexRange";

export default class BaseError {
  logger: Logger;

  constructor(name: string) {
    this.logger = new Logger(name);
  }

  protected throw(pos: number | IIndexRange, ...msgs: any[]): never {
    this.error(pos, ...msgs);
    throw [[this.logger.name], ...msgs].join(" ");
  }

  protected error(pos: number | IIndexRange, ...msgs: any[]) {
    this.logger.error(pos.toString(), ...msgs);
  }
}
