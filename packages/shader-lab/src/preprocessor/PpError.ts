import { Logger } from "../Logger";
import { IIndexRange, Position } from "../common";

export class PpError {
  logger = new Logger("Preprocessor");

  protected throw(pos: Position | IIndexRange, ...msgs: any[]): never {
    this.error(pos, ...msgs);
    throw msgs.join(" ");
  }

  protected error(pos: Position | IIndexRange, ...msgs: any[]) {
    this.logger.log(Logger.RED, pos.toString(), ...msgs);
  }
}
