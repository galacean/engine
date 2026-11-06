import { ContentRestorer, type AssetPromise, type Engine, type EngineObject } from "@galacean/engine-core";

/** ResourceManager replaces recipes by resource ID and removes them in EngineObject.destroy(). */
class WaterContentRestorer<T extends EngineObject> extends ContentRestorer<T> {
  constructor(
    resource: T,
    private readonly restore: () => void | AssetPromise<T>
  ) {
    super(resource);
  }

  restoreContent(): void | AssetPromise<T> {
    if (!this.resource.destroyed) return this.restore();
  }
}

/** Keep a recipe or borrow immutable source data; never copy GPU-sized arrays here. */
export function registerWaterContentRestorer<T extends EngineObject>(
  engine: Engine,
  resource: T,
  restore: () => void | AssetPromise<T>
): void {
  engine.resourceManager.addContentRestorer(new WaterContentRestorer(resource, restore));
}
