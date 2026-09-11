import { GSErrorName } from "./GSError";
import { ShaderRange } from "./common/ShaderRange";
import { ShaderPosition } from "./common/ShaderPosition";
import { GSError } from "./GSError";

export class ShaderCompilerUtils {
  static createPosition(index: number, line = 0, column = 0): ShaderPosition {
    const position = new ShaderPosition();
    position.set(index, line, column);
    return position;
  }

  static createRange(start: ShaderPosition, end: ShaderPosition): ShaderRange {
    const range = new ShaderRange();
    range.set(start, end);
    return range;
  }

  static createGSError(
    message: string,
    errorName: GSErrorName,
    source: string | undefined,
    location: ShaderRange | ShaderPosition,
    code?: string,
    file?: string
  ): GSError {
    return new GSError(errorName, message, location, source, file, code);
  }
}
