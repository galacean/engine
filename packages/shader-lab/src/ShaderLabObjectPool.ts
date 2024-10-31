import { ClearableObjectPool, IPoolElement } from "@galacean/engine";

/**
 * @internal
 */
export class ShaderLabObjectPool<T extends IPoolElement> extends ClearableObjectPool<T> {
  static ShaderLabObjectPoolSet: ShaderLabObjectPool<IPoolElement>[] = [];
  static clearAllShaderLabObjectPool() {
    for (let i = 0; i < this.ShaderLabObjectPoolSet.length; i++) {
      this.ShaderLabObjectPoolSet[i].clear();
    }
  }

  constructor(type: new () => T) {
    super(type);
    ShaderLabObjectPool.ShaderLabObjectPoolSet.push(this);
  }
}
