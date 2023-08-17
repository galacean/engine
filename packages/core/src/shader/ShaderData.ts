import { IClone } from "@galacean/engine-design";
import { Color, Matrix, Vector2, Vector3, Vector4 } from "@galacean/engine-math";
import { IReferable } from "../asset/IReferable";
import { CloneManager } from "../clone/CloneManager";
import { Texture } from "../texture/Texture";
import { ShaderDataGroup } from "./enums/ShaderDataGroup";
import { ShaderPropertyType } from "./enums/ShaderPropertyType";
import { ShaderMacro } from "./ShaderMacro";
import { ShaderMacroCollection } from "./ShaderMacroCollection";
import { ShaderProperty } from "./ShaderProperty";

/**
 * Shader data collection,Correspondence includes shader properties data and macros data.
 */
export class ShaderData implements IReferable, IClone {
  /** @internal */
  _group: ShaderDataGroup;
  /** @internal */
  _propertyValueMap: Record<number, ShaderPropertyValueType> = Object.create(null);
  /** @internal */
  _macroCollection: ShaderMacroCollection = new ShaderMacroCollection();

  private _macroMap: Record<number, ShaderMacro> = Object.create(null);
  private _refCount: number = 0;

  /**
   * @internal
   */
  constructor(group: ShaderDataGroup) {
    this._group = group;
  }

  /**
   * Get float by shader property name.
   * @param propertyName - Shader property name
   * @returns Float
   */
  getFloat(propertyName: string): number;

  /**
   * Get float by shader property.
   * @param property - Shader property, use `ShaderProperty.getByName` to get
   * @returns Float
   */
  getFloat(property: ShaderProperty): number;

  getFloat(property: string | ShaderProperty): number {
    return this.getPropertyValue(property);
  }

  /**
   * Set float by shader property name.
   * @remarks Corresponding float shader property type.
   * @param propertyName - Shader property name
   * @param value - Float
   */
  setFloat(propertyName: string, value: number): void;

  /**
   * Set float by shader property.
   * @remarks Corresponding float shader property type.
   * @param property - Shader property, use `ShaderProperty.getByName` to get
   * @param value - Float
   */
  setFloat(property: ShaderProperty, value: number): void;

  setFloat(property: string | ShaderProperty, value: number): void {
    this._setPropertyValue(property, ShaderPropertyType.Float, value);
  }

  /**
   * Get int by shader property name.
   * @param propertyName - Shader property name
   * @returns Int
   */
  getInt(propertyName: string): number;

  /**
   * Get int by shader property.
   * @param property - Shader property, use `ShaderProperty.getByName` to get
   * @returns Int
   */
  getInt(property: ShaderProperty): number;

  getInt(property: string | ShaderProperty): number {
    return this.getPropertyValue(property);
  }

  /**
   * Set int by shader property name.
   * @remarks Correspondence includes int and bool shader property type.
   * @param propertyName - Shader property name
   * @param value - Int
   */
  setInt(propertyName: string, value: number): void;

  /**
   * Set int by shader property.
   * @remarks Correspondence includes int and bool shader property type.
   * @param property - Shader property, use `ShaderProperty.getByName` to get
   * @param value - Int
   */
  setInt(property: ShaderProperty, value: number): void;

  setInt(property: string | ShaderProperty, value: number): void {
    this._setPropertyValue(property, ShaderPropertyType.Int, value);
  }

  /**
   * Get float array by shader property name.
   * @param propertyName - Shader property name
   * @returns Float array
   */
  getFloatArray(propertyName: string): Float32Array;

  /**
   * Get float array by shader property.
   * @param property - Shader property, use `ShaderProperty.getByName` to get
   * @returns Float array
   */
  getFloatArray(property: ShaderProperty): Float32Array;

  getFloatArray(property: string | ShaderProperty): Float32Array {
    return this.getPropertyValue(property);
  }

  /**
   * Set float array by shader property name.
   * @remarks Correspondence includes float array、vec2 array、vec3 array、vec4 array and matrix array shader property type.
   * @param propertyName - Shader property name
   * @param value - Float array
   */
  setFloatArray(propertyName: string, value: Float32Array): void;

  /**
   * Set float array by shader property.
   * @remarks Correspondence includes float array、vec2 array、vec3 array、vec4 array and matrix array shader property type.
   * @param property - Shader property, use `ShaderProperty.getByName` to get
   * @param value - Float array
   */
  setFloatArray(property: ShaderProperty, value: Float32Array): void;

  setFloatArray(property: string | ShaderProperty, value: Float32Array): void {
    this._setPropertyValue(property, ShaderPropertyType.FloatArray, value);
  }

  /**
   * Get int array by shader property name.
   * @param propertyName - Shader property name
   * @returns Int Array
   */
  getIntArray(propertyName: string): Int32Array;

  /**
   * Get int array by shader property.
   * @param property - Shader property, use `ShaderProperty.getByName` to get
   * @returns Int Array
   */
  getIntArray(property: ShaderProperty): Int32Array;

  getIntArray(property: string | ShaderProperty): Int32Array {
    return this.getPropertyValue(property);
  }

  /**
   * Set int array by shader property name.
   * @remarks Correspondence includes bool array、int array、bvec2 array、bvec3 array、bvec4 array、ivec2 array、ivec3 array and ivec4 array shader property type.
   * @param propertyName - Shader property name
   * @param value - Int Array
   */
  setIntArray(propertyName: string, value: Int32Array): void;

  /**
   * Set int array by shader property.
   * @remarks Correspondence includes bool array、int array、bvec2 array、bvec3 array、bvec4 array、ivec2 array、ivec3 array and ivec4 array shader property type.
   * @param property - Shader property, use `ShaderProperty.getByName` to get
   * @param value - Int Array
   */
  setIntArray(property: ShaderProperty, value: Int32Array): void;

  setIntArray(property: string | ShaderProperty, value: Int32Array): void {
    this._setPropertyValue(property, ShaderPropertyType.IntArray, value);
  }

  /**
   * Get two-dimensional from shader property name.
   * @param propertyName - Shader property name
   * @returns Two-dimensional vector
   */
  getVector2(propertyName: string): Vector2;

  /**
   * Get two-dimensional from shader property.
   * @param property - Shader property, use `ShaderProperty.getByName` to get
   * @returns Two-dimensional vector
   */
  getVector2(property: ShaderProperty): Vector2;

  getVector2(property: string | ShaderProperty): Vector2 {
    return this.getPropertyValue(property);
  }

  /**
   * Set two-dimensional vector from shader property name.
   * @remarks Correspondence includes vec2、ivec2 and bvec2 shader property type.
   * @param property - Shader property name
   * @param value - Two-dimensional vector
   */
  setVector2(property: string, value: Vector2): void;

  /**
   * Set two-dimensional vector from shader property.
   * @remarks Correspondence includes vec2、ivec2 and bvec2 shader property type.
   * @param property - Shader property, use `ShaderProperty.getByName` to get
   * @param value - Two-dimensional vector
   */
  setVector2(property: ShaderProperty, value: Vector2): void;

  setVector2(property: string | ShaderProperty, value: Vector2): void {
    this._setPropertyValue(property, ShaderPropertyType.Vector2, value);
  }

  /**
   * Get vector3 by shader property name.
   * @param propertyName - Shader property name
   * @returns Three-dimensional vector
   */
  getVector3(propertyName: string): Vector3;

  /**
   * Get vector3 by shader property.
   * @param property - Shader property, use `ShaderProperty.getByName` to get
   * @returns Three-dimensional vector
   */
  getVector3(property: ShaderProperty): Vector3;

  getVector3(property: string | ShaderProperty): Vector3 {
    return this.getPropertyValue(property);
  }

  /**
   * Set three dimensional vector by shader property name.
   * @remarks Correspondence includes vec3、ivec3 and bvec3 shader property type.
   * @param property - Shader property name
   * @param value - Three-dimensional vector
   */
  setVector3(property: string, value: Vector3): void;

  /**
   * Set three dimensional vector by shader property.
   * @remarks Correspondence includes vec3、ivec3 and bvec3 shader property type.
   * @param property - Shader property, use `ShaderProperty.getByName` to get
   * @param value - Three-dimensional vector
   */
  setVector3(property: ShaderProperty, value: Vector3): void;

  setVector3(property: string | ShaderProperty, value: Vector3): void {
    this._setPropertyValue(property, ShaderPropertyType.Vector3, value);
  }

  /**
   * Get vector4 by shader property name.
   * @param propertyName - Shader property name
   * @returns Four-dimensional vector
   */
  getVector4(propertyName: string): Vector4;

  /**
   * Get vector4 by shader property.
   * @param property - Shader property, use `ShaderProperty.getByName` to get
   * @returns Four-dimensional vector
   */
  getVector4(property: ShaderProperty): Vector4;

  getVector4(property: string | ShaderProperty): Vector4 {
    return this.getPropertyValue(property);
  }

  /**
   * Set four-dimensional vector by shader property name.
   * @remarks Correspondence includes vec4、ivec4 and bvec4 shader property type.
   * @param property - Shader property name
   * @param value - Four-dimensional vector
   */
  setVector4(property: string, value: Vector4): void;

  /**
   * Set four-dimensional vector by shader property.
   * @remarks Correspondence includes vec4、ivec4 and bvec4 shader property type.
   * @param property - Shader property, use `ShaderProperty.getByName` to get
   * @param value - Four-dimensional vector
   */
  setVector4(property: ShaderProperty, value: Vector4): void;

  setVector4(property: string | ShaderProperty, value: Vector4): void {
    this._setPropertyValue(property, ShaderPropertyType.Vector4, value);
  }

  /**
   * Get matrix by shader property name.
   * @param propertyName - Shader property name
   * @returns Matrix
   */
  getMatrix(propertyName: string): Matrix;

  /**
   * Get matrix by shader property.
   * @param property - Shader property, use `ShaderProperty.getByName` to get
   * @returns Matrix
   */
  getMatrix(property: ShaderProperty): Matrix;

  getMatrix(property: string | ShaderProperty): Matrix {
    return this.getPropertyValue(property);
  }

  /**
   * Set matrix by shader property name.
   * @remarks Correspondence includes matrix shader property type.
   * @param propertyName - Shader property name
   * @param value - Matrix
   */
  setMatrix(propertyName: string, value: Matrix);

  /**
   * Set matrix by shader property.
   * @remarks Correspondence includes matrix shader property type.
   * @param property - Shader property, use `ShaderProperty.getByName` to get
   * @param value - Matrix
   */
  setMatrix(property: ShaderProperty, value: Matrix);

  setMatrix(property: string | ShaderProperty, value: Matrix): void {
    this._setPropertyValue(property, ShaderPropertyType.Matrix, value);
  }

  /**
   * Get color by shader property name.
   * @param propertyName - Shader property name
   * @returns Color
   */
  getColor(propertyName: string): Color;

  /**
   * Get color by shader property.
   * @param property - Shader property, use `ShaderProperty.getByName` to get
   * @returns Color
   */
  getColor(property: ShaderProperty): Color;

  getColor(property: string | ShaderProperty): Color {
    return this.getPropertyValue(property);
  }

  /**
   * Set color by shader property name.
   * @remarks Correspondence includes vec4 shader property type.
   * @param propertyName - Shader property name
   * @param value - Color
   */
  setColor(propertyName: string, value: Color): void;

  /**
   * Set color by shader property.
   * @remarks Correspondence includes vec4 shader property type.
   * @param property - Shader property, use `ShaderProperty.getByName` to get
   * @param value - Color
   */
  setColor(property: ShaderProperty, value: Color): void;

  setColor(property: string | ShaderProperty, value: Color): void {
    this._setPropertyValue(property, ShaderPropertyType.Color, value);
  }

  /**
   * Get texture by shader property name.
   * @param propertyName - Shader property name
   * @returns Texture
   */
  getTexture(propertyName: string): Texture;

  /**
   * Get texture by shader property.
   * @param property - Shader property, use `ShaderProperty.getByName` to get
   * @returns Texture
   */
  getTexture(property: ShaderProperty): Texture;

  getTexture(property: string | ShaderProperty): Texture {
    return this.getPropertyValue(property);
  }

  /**
   * Set texture by shader property name.
   * @param propertyName - Shader property name
   * @param value - Texture
   */
  setTexture(propertyName: string, value: Texture): void;

  /**
   * Set texture by shader property.
   * @param property - Shader property, use `ShaderProperty.getByName` to get
   * @param value - Texture
   */
  setTexture(property: ShaderProperty, value: Texture): void;

  setTexture(property: string | ShaderProperty, value: Texture): void {
    if (this._getReferCount() > 0) {
      const lastValue = this.getPropertyValue<Texture>(property);
      lastValue && lastValue._addReferCount(-1);
      value && value._addReferCount(1);
    }
    this._setPropertyValue(property, ShaderPropertyType.Texture, value);
  }

  /**
   * Get texture array by shader property name.
   * @param propertyName - Shader property name
   * @returns Texture array
   */
  getTextureArray(propertyName: string): Texture[];

  /**
   * Get texture array by shader property.
   * @param property - Shader property, use `ShaderProperty.getByName` to get
   * @returns Texture array
   */
  getTextureArray(property: ShaderProperty): Texture[];

  getTextureArray(property: string | ShaderProperty): Texture[] {
    return this.getPropertyValue(property);
  }

  /**
   * Set texture array by shader property name.
   * @param propertyName - Shader property name
   * @param value - Texture array
   */
  setTextureArray(propertyName: string, value: Texture[]): void;

  /**
   * Set texture array by shader property.
   * @param property - Shader property, use `ShaderProperty.getByName` to get
   * @param value - Texture array
   */
  setTextureArray(property: ShaderProperty, value: Texture[]): void;

  setTextureArray(property: string | ShaderProperty, value: Texture[]): void {
    if (this._getReferCount() > 0) {
      const lastValue = this.getPropertyValue<Texture[]>(property);
      if (lastValue) {
        for (let i = 0, n = lastValue.length; i < n; i++) {
          lastValue[i]._addReferCount(-1);
        }
      }
      if (value) {
        for (let i = 0, n = value.length; i < n; i++) {
          value[i]._addReferCount(1);
        }
      }
    }
    this._setPropertyValue(property, ShaderPropertyType.TextureArray, value);
  }

  /**
   * Get shader property value set on this shaderData.
   * @param property - Shader property
   * @returns Property value
   */
  getPropertyValue<T extends ShaderPropertyValueType>(property: string | ShaderProperty): T {
    if (typeof property === "string") {
      property = ShaderProperty.getByName(property);
    }
    return this._propertyValueMap[property._uniqueId] as T;
  }

  /**
   * Enable macro with name.
   * @param macroName - Macro name
   */
  enableMacro(macroName: string): void;

  /**
   * Enable macro with name and value.
   * @remarks Name and value will combine, it's equal the macro of "name value".
   * @param name - Macro name
   * @param value - Macro value
   */
  enableMacro(name: string, value: string): void;

  /**
   * Enable macro with shaderMacro.
   * @param macro - Shader macro
   */
  enableMacro(macro: ShaderMacro): void;

  enableMacro(macro: string | ShaderMacro, value?: string): void {
    if (typeof macro === "string") {
      macro = ShaderMacro.getByName(macro, value);
    }
    const nameID = macro._nameId;
    const lastMacro = this._macroMap[nameID];
    if (lastMacro !== macro) {
      const macroCollection = this._macroCollection;
      lastMacro && macroCollection.disable(lastMacro);
      macroCollection.enable(macro);
      this._macroMap[nameID] = macro;
    }
  }

  /**
   * Disable macro.
   * @param macroName - Macro name
   */
  disableMacro(macroName: string): void;

  /**
   * Disable macro.
   * @param macro - Shader macro
   */
  disableMacro(macro: ShaderMacro): void;

  disableMacro(macro: string | ShaderMacro): void {
    let nameID: number;
    if (typeof macro === "string") {
      nameID = ShaderMacro._macroNameIdMap[macro];
      if (nameID === undefined) {
        return;
      }
    } else {
      nameID = macro._nameId;
    }

    const currentMacro = this._macroMap[nameID];
    if (currentMacro) {
      this._macroCollection.disable(currentMacro);
      delete this._macroMap[nameID];
    }
  }

  /**
   * Get shader macro array that are currently enabled for ShaderData.
   */
  getMacros(): ShaderMacro[];
  /**
   * Get shader macro array that are currently enabled for ShaderData.
   * @param out - Shader macro array
   */
  getMacros(out: ShaderMacro[]): void;

  getMacros(out?: ShaderMacro[]): ShaderMacro[] | void {
    if (out) {
      const macroMap = this._macroMap;
      out.length = 0;
      for (var key in macroMap) {
        out.push(macroMap[key]);
      }
    } else {
      return Object.values(this._macroMap);
    }
  }

  /**
   * Get all shader properties that have been set on this shaderData
   * @returns  All shader properties
   */
  getProperties(): ShaderProperty[];

  /**
   * Get all shader properties that have been set on this shaderData
   * @param out - All shader properties
   */
  getProperties(out: ShaderProperty[]): void;

  getProperties(out?: ShaderProperty[]): void | ShaderProperty[] {
    let properties: ShaderProperty[];
    if (out) {
      out.length = 0;
      properties = out;
    } else {
      properties = [];
    }

    const propertyValueMap = this._propertyValueMap;
    const propertyIdMap = ShaderProperty._propertyIdMap;
    for (let key in propertyValueMap) {
      properties.push(propertyIdMap[key]);
    }

    if (!out) {
      return properties;
    }
  }

  clone(): ShaderData {
    const shaderData = new ShaderData(this._group);
    this.cloneTo(shaderData);
    return shaderData;
  }

  cloneTo(target: ShaderData): void {
    CloneManager.deepCloneObject(this._macroCollection, target._macroCollection);
    Object.assign(target._macroMap, this._macroMap);
    const referCount = target._getReferCount();
    const propertyValueMap = this._propertyValueMap;
    const targetPropertyValueMap = target._propertyValueMap;
    const keys = Object.keys(propertyValueMap);
    for (let i = 0, n = keys.length; i < n; i++) {
      const k = keys[i];
      const property = <ShaderPropertyValueType>propertyValueMap[k];
      if (property != null) {
        if (typeof property === "number") {
          targetPropertyValueMap[k] = property;
        } else if (property instanceof Texture) {
          targetPropertyValueMap[k] = property;
          referCount > 0 && property._addReferCount(referCount);
        } else if (property instanceof Array || property instanceof Float32Array || property instanceof Int32Array) {
          targetPropertyValueMap[k] = property.slice();
        } else {
          const targetProperty = targetPropertyValueMap[k];
          if (targetProperty) {
            targetProperty.copyFrom(property);
          } else {
            targetPropertyValueMap[k] = property.clone();
          }
        }
      } else {
        targetPropertyValueMap[k] = property;
      }
    }
  }

  /**
   * @internal
   */
  _setPropertyValue<T extends ShaderPropertyValueType>(
    property: string | ShaderProperty,
    type: ShaderPropertyType,
    value: T
  ): void {
    if (typeof property === "string") {
      property = ShaderProperty.getByName(property);
    }

    if (property._group !== this._group) {
      if (property._group === undefined) {
        property._group = this._group;
      } else {
        throw `Shader property ${property.name} has been used as ${ShaderDataGroup[property._group]} group.`;
      }
    }

    if (property._type !== type) {
      if (property._type === undefined) {
        property._type = type;
      } else {
        throw `Shader property ${property.name} has been used as ${ShaderPropertyType[property._type]} type.`;
      }
    }

    this._propertyValueMap[property._uniqueId] = value;
  }

  /**
   * @internal
   */
  _getReferCount(): number {
    return this._refCount;
  }

  /**
   * @internal
   */
  _addReferCount(value: number): void {
    this._refCount += value;
    const properties = this._propertyValueMap;
    for (const k in properties) {
      const property = properties[k];
      // @todo: Separate array to speed performance.
      if (property && property instanceof Texture) {
        property._addReferCount(value);
      }
    }
  }
}

export type ShaderPropertyValueType =
  | number
  | Vector2
  | Vector3
  | Vector4
  | Color
  | Matrix
  | Texture
  | Texture[]
  | Int32Array
  | Float32Array;
