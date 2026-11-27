/**
 * Shader Property type.
 * @remarks enumeration can be combined using bit operations.
 */
export enum ShaderPropertyType {
  /** None type. */
  None = 0,
  /** Float type. */
  Float = 0x1,
  /** Int type. */
  Int = 0x2,
  /** Vector2 type. */
  Vector2 = 0x4,
  /** Vector3 type. */
  Vector3 = 0x8,
  /** Vector4 type. */
  Vector4 = 0x10,
  /** Matrix type. */
  Matrix = 0x20,
  /** Color type. */
  Color = 0x40,
  /** Texture type. */
  Texture = 0x80,
  /** Float array type. */
  FloatArray = 0x100,
  /** Int array type. */
  IntArray = 0x200,
  /** Texture array type. */
  TextureArray = 0x400,
  /** Storage/GPU buffer type (WebGPU). */
  Buffer = 0x800
}
