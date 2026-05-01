#ifndef BLIT_VERTEX_INCLUDED
#define BLIT_VERTEX_INCLUDED

struct Attributes {
  vec4 POSITION_UV;
};

struct Varyings {
  vec2 v_uv;
};

Varyings vert(Attributes attr) {
  Varyings v;
  gl_Position = vec4(attr.POSITION_UV.xy, 0.0, 1.0);
  v.v_uv = attr.POSITION_UV.zw;
  return v;
}

#endif
