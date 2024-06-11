import { Logger } from "../Logger";
import LocRange from "../common/LocRange";
import Position from "../common/Position";

export class PpError {
  logger = new Logger("Preprocessor");

  protected throw(pos: Position | LocRange, ...msgs: any[]): never {
    this.error(pos, ...msgs);
    throw msgs.join(" ");
  }

  protected error(pos: Position | LocRange, ...msgs: any[]) {
    this.logger.log(Logger.RED, pos.toString(), ...msgs);
  }
}
