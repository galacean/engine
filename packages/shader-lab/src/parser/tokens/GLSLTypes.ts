import { createToken } from "chevrotain";

export const glsl_mat2 = createToken({ name: "glsl_mat2", pattern: /mat2\s/ });
export const glsl_mat3 = createToken({ name: "glsl_mat3", pattern: /mat3\s/ });
export const glsl_mat4 = createToken({ name: "glsl_mat4", pattern: /mat4\s/ });

export const glsl_vec2 = createToken({ name: "glsl_vec2", pattern: /vec2\s/ });
export const glsl_vec3 = createToken({ name: "glsl_vec3", pattern: /vec3\s/ });
export const glsl_vec4 = createToken({ name: "glsl_vec4", pattern: /vec4\s/ });

export const glsl_ivec2 = createToken({ name: "glsl_ivec2", pattern: /ivec2\s/ });
export const glsl_ivec3 = createToken({ name: "glsl_ivec3", pattern: /ivec3\s/ });
export const glsl_ivec4 = createToken({ name: "glsl_ivec4", pattern: /ivec4\s/ });

export const glsl_float = createToken({ name: "glsl_float", pattern: /float\s/ });
export const glsl_int = createToken({ name: "glsl_int", pattern: /int\s/ });

export const glsl_sampler2D = createToken({
  name: "glsl_sampler2D",
  pattern: /sampler2D\s/
});

export const glsl_sampler2DArray = createToken({ name: "sampler2DArray", pattern: /sampler2DArray / });

export const tokenList = [
  glsl_ivec2,
  glsl_ivec3,
  glsl_ivec4,
  glsl_mat2,
  glsl_mat3,
  glsl_mat4,
  glsl_vec2,
  glsl_vec3,
  glsl_vec4,
  glsl_float,
  glsl_int,
  glsl_sampler2DArray,
  glsl_sampler2D
];

const glsl_highp = createToken({ name: "glsl_highp", pattern: /highp/ });
const glsl_mediump = createToken({ name: "glsl_mediump", pattern: /mediump/ });
const glsl_lowp = createToken({ name: "glsl_lowp", pattern: /lowp/ });
export const precisionTokenList = [glsl_highp, glsl_mediump, glsl_lowp];
