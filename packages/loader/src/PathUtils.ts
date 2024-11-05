/** @internal */
export class PathUtils {
  private static _urlSchema = "files://";
  static shaderIncludeRegex = /\s#include\s+"([^\\"]+)"/gm;

  static pathResolve(path: string, base: string): string {
    return new URL(path, PathUtils._urlSchema + base).href.substring(PathUtils._urlSchema.length);
  }

  static isRelativePath(path: string): boolean {
    return path[0] === ".";
  }
}
