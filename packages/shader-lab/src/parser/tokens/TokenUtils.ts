import { createToken, ITokenConfig } from "chevrotain";

/** @internal */
export class TokenUtils {
  static createKeywordToken(k: string, opts?: Partial<ITokenConfig>) {
    return createToken({ label: k, name: k, pattern: new RegExp(k), ...opts });
  }

  static createKeywordTokenWithPrefix(k: string, prefix: string, opts?: Partial<ITokenConfig>) {
    const key = `${prefix}.${k}`;
    return TokenUtils.createKeywordToken(key, opts);
  }

  static getEnumKeys(arg: Object) {
    return Object.values(arg).filter((value) => isNaN(Number(value)));
  }
}
