import { Color, MathUtil, Vector2, Vector3, Vector4 } from "@galacean/engine-math";
import { Texture } from "../texture";

/**
 * Represents a parameter of a post process effect.
 * @remarks
 * The parameter will be mixed to a final value and be used in post process manager.
 */
export abstract class PostProcessEffectParameter<T> {
  /**
   * Whether the parameter is enabled.
   */
  enabled = true;

  readonly type;

  protected _needLerp = false;
  protected _value: T;

  /**
   * The value of the parameter.
   */
  get value(): T {
    return this._value;
  }

  set value(value: T) {
    this._value = value;
  }

  constructor(type, value: T, needLerp = false) {
    this.type = type;
    this._needLerp = needLerp;
    this._value = value;
  }

  _lerp(to: T, factor: number) {
    if (factor > 0) {
      this.value = to;
    }
  }
}

/**
 * Represents a float parameter of a post process effect.
 */
export class PostProcessEffectFloatParameter extends PostProcessEffectParameter<number> {
  override get value(): number {
    return this._value;
  }

  override set value(v: number) {
    this._value = MathUtil.clamp(v, this._min, this._max);
  }

  /**
   * Create a new float parameter.
   * @param value - The default value of the parameter
   * @param _min - The minimum value of the parameter, default is Number.NEGATIVE_INFINITY
   * @param _max - The maximum value of the parameter, default is Number.POSITIVE_INFINITY
   * @param needLerp - Whether the parameter needs to be lerp, default is true
   */
  constructor(
    value: number,
    private _min = Number.NEGATIVE_INFINITY,
    private _max = Number.POSITIVE_INFINITY,
    needLerp = true
  ) {
    super(Number, value, needLerp);
    this.value = value;
  }

  override _lerp(to: number, factor: number) {
    if (this._needLerp) {
      this.value = MathUtil.lerp(this.value, to, factor);
    } else {
      super._lerp(to, factor);
    }
  }
}

/**
 * Represents a boolean parameter of a post process effect.
 */
export class PostProcessEffectBoolParameter extends PostProcessEffectParameter<boolean> {
  /**
   * Create a new boolean parameter.
   * @param value - The default value of the parameter
   */
  constructor(value: boolean) {
    super(Boolean, value, false);
  }
}

/**
 * Represents a texture parameter of a post process effect.
 */
export class PostProcessEffectTextureParameter extends PostProcessEffectParameter<Texture> {
  /**
   * Create a new texture parameter.
   * @param value - The default texture of the parameter
   */
  constructor(value: Texture) {
    super(Texture, value, false);
  }
}

/**
 * Represents a color parameter of a post process effect.
 */
export class PostProcessEffectColorParameter extends PostProcessEffectParameter<Color> {
  /**
   * Create a new color parameter.
   * @param value - The default color of the parameter
   * @param needLerp - Whether the parameter needs to be lerp, default is true
   */
  constructor(value: Color, needLerp = true) {
    super(Color, value, needLerp);
  }

  override _lerp(to: Color, factor: number) {
    if (this._needLerp) {
      Color.lerp(this.value, to, factor, this.value);
    } else {
      super._lerp(to, factor);
    }
  }
}

/**
 * Represents a vector2 parameter of a post process effect.
 */
export class PostProcessEffectVector2Parameter extends PostProcessEffectParameter<Vector2> {
  /**
   * Create a new vector2 parameter.
   * @param value - The default vector2 of the parameter
   * @param needLerp - Whether the parameter needs to be lerp, default is true
   */
  constructor(value: Vector2, needLerp = true) {
    super(Vector2, value, needLerp);
  }

  override _lerp(to: Vector2, factor: number) {
    if (this._needLerp) {
      Vector2.lerp(this.value, to, factor, this.value);
    } else {
      super._lerp(to, factor);
    }
  }
}

/**
 * Represents a vector3 parameter of a post process effect.
 */
export class PostProcessEffectVector3Parameter extends PostProcessEffectParameter<Vector3> {
  /**
   * Create a new vector3 parameter.
   * @param value - The default vector3 of the parameter
   * @param needLerp - Whether the parameter needs to be lerp, default is true
   */
  constructor(value: Vector3, needLerp = true) {
    super(Vector3, value, needLerp);
  }

  override _lerp(to: Vector3, factor: number) {
    if (this._needLerp) {
      Vector3.lerp(this.value, to, factor, this.value);
    } else {
      super._lerp(to, factor);
    }
  }
}

/**
 * Represents a vector4 parameter of a post process effect.
 */
export class PostProcessEffectVector4Parameter extends PostProcessEffectParameter<Vector4> {
  /**
   * Create a new vector4 parameter.
   * @param value - The default vector4 of the parameter
   * @param needLerp - Whether the parameter needs to be lerp, default is true
   */
  constructor(value: Vector4, needLerp = true) {
    super(Vector4, value, needLerp);
  }

  override _lerp(to: Vector4, factor: number) {
    if (this._needLerp) {
      Vector4.lerp(this.value, to, factor, this.value);
    } else {
      super._lerp(to, factor);
    }
  }
}

/**
 * Represents a enum parameter of a post process effect.
 */
export class PostProcessEffectEnumParameter<T> extends PostProcessEffectParameter<number> {
  /**
   * Create a new enum parameter.
   * @param type - The type of the enum
   * @param value - The default enum value of the parameter
   */
  constructor(type, value: number) {
    super(type, value, false);
  }
}
