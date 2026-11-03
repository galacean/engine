#version 300 es
precision highp float;
precision highp int;

flat in ivec2 v_texelCoordinate;
out vec4 outputColor;

uniform sampler2D u_atlas;
uniform int u_encoding;
uniform float u_maximumDepth;
uniform float u_shoreDistanceRange;

{{SPATIAL_FIELD_DECODE_FUNCTIONS}}

vec2 waterSpatialFieldPackUnorm16(float value) {
  float code = floor(clamp(value, 0.0, 1.0) * 65535.0 + 0.5);
  return vec2(floor(code / 256.0), mod(code, 256.0)) / 255.0;
}

void main() {
  vec4 encoded = texelFetch(u_atlas, v_texelCoordinate, 0);
  float depth = waterSpatialFieldDecodeDepth(
    encoded.b,
    u_maximumDepth
  );
  float shoreDistance = u_encoding == 0
    ? waterSpatialFieldDecodeSignedDistance(
        encoded.a,
        2.0,
        -1.0,
        u_shoreDistanceRange
      )
    : waterSpatialFieldDecodeSignedDistance(
        encoded.a,
        255.0 / 127.0,
        -128.0 / 127.0,
        u_shoreDistanceRange
      );
  vec2 packedDepth = waterSpatialFieldPackUnorm16(
    u_maximumDepth > 0.0 ? depth / u_maximumDepth : 0.0
  );
  vec2 packedShore = waterSpatialFieldPackUnorm16(
    u_shoreDistanceRange > 0.0
      ? shoreDistance / (u_shoreDistanceRange * 2.0) + 0.5
      : 0.5
  );
  outputColor = vec4(packedDepth, packedShore);
}
