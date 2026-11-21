import { IPhysicsMaterial, IPhysicsMaterialProperties } from "@galacean/engine-design";
import { HavokPhysics } from "./HavokPhysics";
import { HKEnumValue, HKPhysicsMaterial } from "./HavokTypes";

/** @internal */
export interface HavokMaterialConsumer {
  _applyHKMaterial(mat: HKPhysicsMaterial): void;
}

/**
 * Physics material for Havok.
 * Havok stores material properties by value on each HP_ShapeId, so this class
 * tracks attached consumers (shapes & character controllers) and pushes updates on mutation.
 */
export class HavokPhysicsMaterial implements IPhysicsMaterial {
  private _havokPhysics: HavokPhysics;
  private _hkMaterial: HKPhysicsMaterial;
  private _consumers = new Set<HavokMaterialConsumer>();

  constructor(havokPhysics: HavokPhysics, properties: IPhysicsMaterialProperties) {
    this._havokPhysics = havokPhysics;
    this._hkMaterial = [
      properties.staticFriction,
      properties.dynamicFriction,
      properties.bounciness,
      this._mapCombineMode(properties.frictionCombine),
      this._mapCombineMode(properties.bounceCombine)
    ];
  }

  /** @internal */
  _getHKMaterial(): HKPhysicsMaterial {
    return this._hkMaterial;
  }

  /** @internal */
  _addConsumer(consumer: HavokMaterialConsumer): void {
    this._consumers.add(consumer);
  }

  /** @internal */
  _removeConsumer(consumer: HavokMaterialConsumer): void {
    this._consumers.delete(consumer);
  }

  setBounciness(value: number): void {
    if (this._hkMaterial[2] === value) return;
    this._hkMaterial[2] = value;
    this._syncConsumers();
  }

  setDynamicFriction(value: number): void {
    if (this._hkMaterial[1] === value) return;
    this._hkMaterial[1] = value;
    this._syncConsumers();
  }

  setStaticFriction(value: number): void {
    if (this._hkMaterial[0] === value) return;
    this._hkMaterial[0] = value;
    this._syncConsumers();
  }

  setBounceCombine(value: number): void {
    const mapped = this._mapCombineMode(value);
    if (this._hkMaterial[4] === mapped) return;
    this._hkMaterial[4] = mapped;
    this._syncConsumers();
  }

  setFrictionCombine(value: number): void {
    const mapped = this._mapCombineMode(value);
    if (this._hkMaterial[3] === mapped) return;
    this._hkMaterial[3] = mapped;
    this._syncConsumers();
  }

  destroy(): void {
    this._consumers.clear();
  }

  private _syncConsumers(): void {
    const mat = this._hkMaterial;
    for (let it = this._consumers.values(), cur = it.next(); !cur.done; cur = it.next()) {
      cur.value._applyHKMaterial(mat);
    }
  }

  private _mapCombineMode(mode: number): HKEnumValue {
    const mc = this._havokPhysics._hk.MaterialCombine;
    switch (mode) {
      case 0: // PhysicsMaterialCombineMode.Average
        return mc.ARITHMETIC_MEAN;
      case 1: // PhysicsMaterialCombineMode.Minimum
        return mc.MINIMUM;
      case 2: // PhysicsMaterialCombineMode.Multiply
        return mc.MULTIPLY;
      case 3: // PhysicsMaterialCombineMode.Maximum
        return mc.MAXIMUM;
      default:
        return mc.ARITHMETIC_MEAN;
    }
  }
}
