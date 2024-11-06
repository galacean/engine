import { AssetPromise, ResourceManager } from "@galacean/engine-core";
import { request } from "@galacean/engine-core";
import type { RequestConfig } from "@galacean/engine-core/types/asset/request";

/** @internal */
export class Utils {
  private static _urlSchema = "files://";
  static shaderIncludeRegex = /\s#include\s+"([^\\"]+)"/gm;

  static pathResolve(path: string, base: string): string {
    return new URL(path, Utils._urlSchema + base).href.substring(Utils._urlSchema.length);
  }

  static isRelativePath(path: string): boolean {
    return path[0] === ".";
  }
}
