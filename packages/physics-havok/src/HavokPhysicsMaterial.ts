import { IPhysicsMaterial, IPhysicsMaterialProperties } from "@galacean/engine-design";
import { HavokPhysics } from "./HavokPhysics";
import { HKEnumValue, HKPhysicsMaterial } from "./HavokTypes";

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
  private _staticFriction: number;
  private _dynamicFriction: number;
  private _bounciness: number;
  private _frictionCombine: number;
  private _bounceCombine: number;
  private _hkMaterial: HKPhysicsMaterial;
  private _consumers = new Set<HavokMaterialConsumer>();

  constructor(havokPhysics: HavokPhysics, properties: IPhysicsMaterialProperties) {
    this._havokPhysics = havokPhysics;
    this._staticFriction = properties.staticFriction;
    this._dynamicFriction = properties.dynamicFriction;
    this._bounciness = properties.bounciness;
    this._frictionCombine = properties.frictionCombine;
    this._bounceCombine = properties.bounceCombine;
    this._hkMaterial = this._buildHKMaterial();
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
    this._bounciness = value;
    this._syncConsumers();
  }

  setDynamicFriction(value: number): void {
    this._dynamicFriction = value;
    this._syncConsumers();
  }

  setStaticFriction(value: number): void {
    this._staticFriction = value;
    this._syncConsumers();
  }

  setBounceCombine(value: number): void {
    this._bounceCombine = value;
    this._syncConsumers();
  }

  setFrictionCombine(value: number): void {
    this._frictionCombine = value;
    this._syncConsumers();
  }

  destroy(): void {
    this._consumers.clear();
  }

  private _syncConsumers(): void {
    this._hkMaterial = this._buildHKMaterial();
    const mat = this._hkMaterial;
    this._consumers.forEach((consumer) => {
      consumer._applyHKMaterial(mat);
    });
  }

  private _buildHKMaterial(): HKPhysicsMaterial {
    return [
      this._staticFriction,
      this._dynamicFriction,
      this._bounciness,
      this._mapCombineMode(this._frictionCombine),
      this._mapCombineMode(this._bounceCombine)
    ];
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
