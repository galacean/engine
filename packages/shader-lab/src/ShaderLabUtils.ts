import { ClearableObjectPool, IPoolElement } from "@galacean/engine";

export class ShaderLabUtils {
  private static _shaderLabObjectPoolSet: ClearableObjectPool<IPoolElement>[] = [];

  static createObjectPool<T extends IPoolElement>(type: new () => T) {
    const pool = new ClearableObjectPool<T>(type);
    ShaderLabUtils._shaderLabObjectPoolSet.push(pool);
    return pool;
  }

  static clearAllShaderLabObjectPool() {
    for (let i = 0; i < ShaderLabUtils._shaderLabObjectPoolSet.length; i++) {
      ShaderLabUtils._shaderLabObjectPoolSet[i].clear();
    }
  }
}
