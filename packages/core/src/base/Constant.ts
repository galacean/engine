/**
 * Data type enumeration
 */
export enum DataType {
  /** Float */
  FLOAT = 5126, // gl.FLOAT
  /** Floating-point two-dimensional vector */
  FLOAT_VEC2 = 35664, // gl.FLOAT_VEC2
  /** Floating-point three-dimensional vector */
  FLOAT_VEC3 = 35665, // gl.FLOAT_VEC3
  /** Floating-point four-dimensional vector */
  FLOAT_VEC4 = 35666, // gl.FLOAT_VEC4

  /** Integer */
  INT = 5124, // gl.INT
  /** Integer two-dimensional vector */
  INT_VEC2 = 35667, // gl.INT_VEC2
  /** Integer three-dimensional vector */
  INT_VEC3 = 35668, // gl.INT_VEC3
  /** Integer four-dimensional vector */
  INT_VEC4 = 35669, // gl.INT_VEC4

  /** Boolean */
  BOOL = 35670, // gl.BOOL
  /** Boolean two-dimensional vector */
  BOOL_VEC2 = 35671, // gl.BOOL_VEC2
  /** Boolean three-dimensional vector */
  BOOL_VEC3 = 35672, // gl.BOOL_VEC3
  /** Boolean four-dimensional vector */
  BOOL_VEC4 = 35673, // gl.BOOL_VEC4

  /** Second-order matrix */
  FLOAT_MAT2 = 35674, // gl.FLOAT_MAT2
  /** Third-order matrix */
  FLOAT_MAT3 = 35675, // gl.FLOAT_MAT3
  /** Fourth-order matrix */
  FLOAT_MAT4 = 35676, // gl.FLOAT_MAT4

  /** Float array */
  FLOAT_ARRAY = 35677, // gl.FLOAT_ARRAY
  /** Floating-point two-dimensional vector array */
  FLOAT_VEC2_ARRAY = 100000,
  /** Floating-point three-dimensional vector array */
  FLOAT_VEC3_ARRAY,
  /** Floating-point four-dimensional vector array */
  FLOAT_VEC4_ARRAY,

  /** Integer array */
  INT_ARRAY,
  /** Integer two-dimensional vector array */
  INT_VEC2_ARRAY,
  /** Integer three-dimensional vector array */
  INT_VEC3_ARRAY,
  /** Integer four-dimensional vector array */
  INT_VEC4_ARRAY,

  /** Second-order matrix array */
  FLOAT_MAT2_ARRAY,
  /** Third-order matrix array */
  FLOAT_MAT3_ARRAY,
  /** Fourth-order matrix array */
  FLOAT_MAT4_ARRAY,

  /** 2D texture sampler array */
  SAMPLER_2D_ARRAY,
  /** Cube map texture sampler array */
  SAMPLER_CUBE_ARRAY,

  /** 2D sampler */
  SAMPLER_2D = 35678, // gl.SAMPLER_2D
  /** Cube map Texture sampler */
  SAMPLER_CUBE = 35680, // gl.SAMPLER_CUBE

  /** Byte */
  BYTE = 5120, // gl.BYTE
  /** Unsigned byte */
  UNSIGNED_BYTE = 5121, // gl.UNSIGNED_BYTE
  /** Short */
  SHORT = 5122, // gl.SHORT
  /** Unsigned short */
  UNSIGNED_SHORT = 5123, // gl.UNSIGNED_SHORT
  /** Unsigned int */
  UNSIGNED_INT = 5125 // gl.UNSIGNED_INT
}

/**
 * GL Capabilities
 * Some capabilities can be smoothed out by extension, and some capabilities must use WebGL 2.0.
 * */
export enum GLCapabilityType {
  shaderVertexID = "shaderVertexID",
  standardDerivatives = "OES_standard_derivatives",
  shaderTextureLod = "EXT_shader_texture_lod",
  elementIndexUint = "OES_element_index_uint",
  depthTexture = "WEBGL_depth_texture",
  drawBuffers = "WEBGL_draw_buffers",
  vertexArrayObject = "OES_vertex_array_object",
  instancedArrays = "ANGLE_instanced_arrays",
  multipleSample = "multipleSampleOnlySupportedInWebGL2",
  textureFloat = "OES_texture_float",
  textureFloatLinear = "OES_texture_float_linear",
  textureHalfFloat = "OES_texture_half_float",
  textureHalfFloatLinear = "OES_texture_half_float_linear",
  WEBGL_colorBufferFloat = "WEBGL_color_buffer_float",
  colorBufferFloat = "EXT_color_buffer_float",
  colorBufferHalfFloat = "EXT_color_buffer_half_float",
  textureFilterAnisotropic = "EXT_texture_filter_anisotropic",
  blendMinMax = "EXT_blend_minmax",

  astc = "WEBGL_compressed_texture_astc",
  astc_webkit = "WEBKIT_WEBGL_compressed_texture_astc",
  etc = "WEBGL_compressed_texture_etc",
  etc_webkit = "WEBKIT_WEBGL_compressed_texture_etc",
  etc1 = "WEBGL_compressed_texture_etc1",
  etc1_webkit = "WEBKIT_WEBGL_compressed_texture_etc1",
  pvrtc = "WEBGL_compressed_texture_pvrtc",
  pvrtc_webkit = "WEBKIT_WEBGL_compressed_texture_pvrtc",
  s3tc = "WEBGL_compressed_texture_s3tc",
  s3tc_webkit = "WEBKIT_WEBGL_compressed_texture_s3tc",
  // atc = "WEBGL_compressed_texture_atc",
  // s3tc_srgb = "WEBGL_compressed_texture_s3tc_srgb"

  WEBGL_lose_context = "WEBGL_lose_context"
}

export type TypedArray =
  | Int8Array
  | Uint8Array
  | Int16Array
  | Uint16Array
  | Int32Array
  | Uint32Array
  | Uint8ClampedArray
  | Float32Array
  | Float64Array;
