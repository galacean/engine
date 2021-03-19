/**
 * The type of resource, mainly used to deal with the recovery of GL objects associated with the resource object.
 */
export enum InternalAssetType {
  /** Belonging to the current scene, GL resources will be automatically released when the scene is switched. */
  Scene = 1,
  /** Cache automatically handles, if not used in a period of time, GL resources will be released. */
  Cache = 2
}

/**
 * Camera's clear mode enumeration
 * @readonly
 */
export enum ClearMode {
  /** Do not perform any operations to clear the background */
  DONT_CLEAR = 0,
  /** Clear the background color and depth buffer */
  SOLID_COLOR = 1,
  /** Only clear the depth buffer */
  DEPTH_ONLY = 2,
  /** Only clear colors */
  COLOR_ONLY = 3,
  /** Only clear the template buffer */
  STENCIL_ONLY = 4,
  /** Clear all buffers */
  ALL_CLEAR = 5
}

/**
 * Material type enumeration
 * @readonly
 */
export enum MaterialType {
  /** Opaque */
  OPAQUE = 1000,
  /** Transparent */
  TRANSPARENT = 2000
}

/**
 * Rendering state that can be turned on or off.
 * @readonly
 */
export enum RenderState {
  /** Color blend calculation of fragments */
  BLEND = 3042,
  /** Front and back culling */
  CULL_FACE = 2884,
  /** Depth test */
  DEPTH_TEST = 2929,
  /** Alpha test */
  ALPHA_TEST = 3008,
  /** Offset of the depth value of the polygon fragment. */
  POLYGON_OFFSET_FILL = 32823,
  /** Calculation of temporary coverage value determined by alpha value. */
  SAMPLE_ALPHA_TO_COVERAGE = 32926,
  /** Clipping test, discarding the fragments outside the clipping rectangle. */
  SCISSOR_TEST = 3089
}

/**
 * Face enumeration
 * @readonly
 */
export enum FrontFace {
  /** Clockwise */
  CW = 0x0900,
  /** Counterclockwise */
  CCW = 0x0901
}

/**
 * Face culling enum
 * @readonly
 */
export enum CullFace {
  /** Front */
  FRONT = 1028,
  /** Back */
  BACK = 1029,
  /** Front and back */
  FRONT_AND_BACK = 1032
}

/**
 * Display surface enumeration
 * @readonly
 * */
export enum Side {
  /** Cull the back, only show the front */
  FRONT,
  /** Cull the front, only show the back */
  BACK,
  /** Cull out before smoothing, without showing any surface */
  NONE,
  /** Turn off culling, display the front and back */
  DOUBLE
}

/**
 * Comparison function enum
 * @readonly
 */
export enum CompFunc {
  /** Never pass */
  NEVER = 0x0200,
  /** Pass when less than the reference value */
  LESS = 0x0201,
  /** Pass when equal to reference value */
  EQUAL = 0x0202,
  /** Pass when less than or equal to the reference value */
  LEQUAL = 0x0203,
  /** Pass when greater than the reference value */
  GREATER = 0x0204,
  /** Pass when not equal to reference value */
  NOTEQUAL = 0x0205,
  /** Pass when greater than or equal to the reference value */
  GEQUAL = 0x0206,
  /** Always pass */
  ALWAYS = 0x0207
}

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
 * Uniform Semantic and Oasis3D extension supported by glTF 1.0
 * @readonly
 */
export enum UniformSemantic {
  // -- GLTF
  /** Local matrix */
  LOCAL = 1,
  /** Model matrix */
  MODEL = 2,
  /** View matrix */
  VIEW = 3,
  /** Project matrix */
  PROJECTION = 4,
  /** Model View matrix */
  MODELVIEW = 5,
  /** View Projection matrix */
  VIEWPROJECTION = 21,
  /** Model View Project matrix */
  MODELVIEWPROJECTION = 6,
  /** Model matrix's inverse matrix */
  MODELINVERSE = 7,
  /** View matrix's inverse matrix */
  VIEWINVERSE = 8,
  /** Projection matrix's inverse matrix */
  PROJECTIONINVERSE = 9,
  /** Model View matrix's inverse matrix */
  MODELVIEWINVERSE = 10,
  /** Model View Project matrix's inverse matrix */
  MODELVIEWPROJECTIONINVERSE = 11,
  /** The inverse transpose matrix of Model matrix, which can be used to transform Normal */
  MODELINVERSETRANSPOSE = 12,
  /** Model View matrix's inverse transpose matrix */
  MODELVIEWINVERSETRANSPOSE = 13,
  /** Viewport parameter */
  VIEWPORT = 14,
  /** Joint matrix array */
  JOINTMATRIX = 15,
  /** MorphTarget weights */
  MORPHWEIGHTS = 16,

  // --
  /** Current camera position */
  EYEPOS = 17,
  /** How long the current program is running */
  TIME = 18,
  /** Joint matrix texture */
  JOINTTEXTURE = 19,
  /** Joint count */
  JOINTCOUNT = 20
}

/**
 * Color blending method enumeration
 */
export enum BlendFunc {
  /** Multiply all channels by 0 */
  ZERO = 0,
  /** Multiply all channels by 1 */
  ONE = 1,
  /** Multiply all channels by source color */
  SRC_COLOR = 768,
  /** Multiply all channels by 1 minus source color */
  ONE_MINUS_SRC_COLOR = 769,
  /** Multiply all channels by source alpha */
  SRC_ALPHA = 770,
  /** Multiply all channels by 1 minus source alpha */
  ONE_MINUS_SRC_ALPHA = 771,
  /** Multiply all channels by destination alpha */
  DST_ALPHA = 772,
  /** Multiply all channels by 1 minus destination alpha */
  ONE_MINUS_DST_ALPHA = 773,
  /** Multiply all channels by destination color */
  DST_COLOR = 774,
  /** Multiply all channels by 1 minus destination color */
  ONE_MINUS_DST_COLOR = 775,
  /**
   * Multiplies the RGB colors by the smaller of either the source alpha value or the value of 1 minus the destination alpha value. The alpha value is multiplied by 1.
   */
  SRC_ALPHA_SATURATE = 776,
  /**
   * Multiply all channels by a color constant.
   */
  enumANT_COLOR = 32769,
  /** Multiply all channels by 1 minus the color constant. */
  ONE_MINUS_enumANT_COLOR = 32770,
  /**
   * Multiply all channels by an alpha constant.
   */
  enumANT_ALPHA = 32771,
  /**
   * Multiply all channels by one minus the Alpha constant.
   */
  ONE_MINUS_enumANT_ALPHA = 32772
}

/**
 * Probe rendering rate.
 * */
export enum RefreshRate {
  /** Only render once */
  ONCE = 1,
  /** Render every frame. */
  EVERYFRAME = 2
}

/**
 * GL Capabilities
 * Some capabilities can be smoothed out by extension, and some capabilities must use WebGL 2.0.
 * */
export enum GLCapabilityType {
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
  s3tc_webkit = "WEBKIT_WEBGL_compressed_texture_s3tc"
  // atc = "WEBGL_compressed_texture_atc",
  // s3tc_srgb = "WEBGL_compressed_texture_s3tc_srgb"
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
