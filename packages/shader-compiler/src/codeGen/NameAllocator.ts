/**
 * Words that ShaderLab accepts as identifiers but GLSL ES 1.00 or 3.00 reserves. GLES100 output also runs as
 * GLSL ES 3.00 on WebGL2, so both versions apply to every target.
 */
const reservedWords = new Set(
  (
    "asm attribute active atomic_uint case cast centroid class coherent common default double dvec2 dvec3 dvec4 " +
    "enum extern external filter fixed flat fvec2 fvec3 fvec4 goto half hvec2 hvec3 hvec4 iimage1D iimage1DArray " +
    "iimage2D iimage2DArray iimage3D iimageBuffer iimageCube image1D image1DArray image2D image2DArray image3D " +
    "imageBuffer imageCube inline input interface isampler1D isampler1DArray isampler2D isampler2DArray " +
    "isampler2DMS isampler2DMSArray isampler2DRect isampler3D isamplerBuffer isamplerCube layout long mat2x2 " +
    "mat2x3 mat2x4 mat3x2 mat3x3 mat3x4 mat4x2 mat4x3 mat4x4 namespace noinline noperspective output packed " +
    "partition patch public readonly resource restrict sample sampler1D sampler1DArray sampler1DArrayShadow " +
    "sampler1DShadow sampler2DArray sampler2DArrayShadow sampler2DMS sampler2DMSArray sampler2DRect " +
    "sampler2DRectShadow sampler2DShadow sampler3D sampler3DRect samplerBuffer samplerCubeShadow short sizeof " +
    "smooth static subroutine superp switch template this typedef uimage1D uimage1DArray uimage2D uimage2DArray " +
    "uimage3D uimageBuffer uimageCube uint union unsigned usampler1D usampler1DArray usampler2D usampler2DArray " +
    "usampler2DMS usampler2DMSArray usampler2DRect usampler3D usamplerBuffer usamplerCube using uvec2 uvec3 uvec4 " +
    "varying volatile writeonly"
  ).split(" ")
);

/**
 * Tests whether GLSL ES rejects an identifier that ShaderLab accepts.
 * @param name - Source identifier
 * @returns Whether the identifier uses a reserved word or namespace
 * @internal
 */
export function isUnsafeGLSLIdentifier(name: string): boolean {
  return reservedWords.has(name) || name.startsWith("gl_") || name.includes("__");
}

/**
 * Allocates generated identifiers that avoid source identifiers and each other.
 * @internal
 */
export class NameAllocator {
  private readonly _used = new Set<string>();
  private readonly _names = new Map<unknown, string>();

  /**
   * Reserves a source identifier so that generated names never shadow it.
   * @param name - Source identifier
   */
  reserve(name: string): void {
    this._used.add(name);
  }

  /**
   * Keeps a source identifier when GLSL accepts it, otherwise assigns a legal name to its identity.
   * @param key - Source declaration or namespace identity
   * @param name - Source identifier
   * @returns Identifier used by the declaration and its references
   */
  sourceName(key: unknown, name: string): string {
    if (!isUnsafeGLSLIdentifier(name)) return name;
    return this.allocate(key, name.startsWith("gl_") ? `user_${name}` : `${name}_`);
  }

  /**
   * Returns the same identifier for every request with the same key.
   * @param key - Identity of the generated declaration, independent of its spelling
   * @param preferred - Readable base name. Repeated underscores collapse to one, because WebGL rejects `__`
   * @returns An identifier that differs from every reserved and previously allocated name
   */
  allocate(key: unknown, preferred: string): string {
    let name = this._names.get(key);
    if (name === undefined) {
      const base = preferred.replace(/_{2,}/g, "_");
      const separator = base.endsWith("_") ? "" : "_";
      name = base;
      for (let suffix = 1; this._used.has(name); suffix++) name = `${base}${separator}${suffix}`;
      this._used.add(name);
      this._names.set(key, name);
    }
    return name;
  }

  /** Releases all reservations and allocations between compilation requests. */
  reset(): void {
    this._used.clear();
    this._names.clear();
  }
}
