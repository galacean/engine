varying vec2 v_uv;

uniform vec4 u_ambientLight;

#ifdef R3_SHADOW_MAP_COUNT

struct Shadow {
  float     bias;
  float     intensity;
  vec2      mapSize;
  float     radius;
};

uniform Shadow u_shadows[R3_SHADOW_MAP_COUNT];

uniform sampler2D u_shadowMaps[R3_SHADOW_MAP_COUNT];

varying vec4 v_PositionFromLight[R3_SHADOW_MAP_COUNT];

const vec4 bitShift = vec4(1.0, 1.0/256.0, 1.0/(256.0*256.0), 1.0/(256.0*256.0*256.0));

/**
* 释出深度值
*/
float unpack(const in vec4 rgbaDepth) {
  return dot(rgbaDepth, bitShift);
}

/**
* 判断是否需要显示阴影
*/
float getVisibility(vec4 positionFromLight, const in sampler2D shadowMap, vec2 mapSize, float intensity, float bias, float radius) {

    vec3 shadowCoord = (positionFromLight.xyz/positionFromLight.w)/2.0 + 0.5;
    float filterX = step(0.0, shadowCoord.x) * (1.0 - step(1.0, shadowCoord.x));
    float filterY = step(0.0, shadowCoord.y) * (1.0 - step(1.0, shadowCoord.y));

    shadowCoord.z -= bias;
    vec2 texelSize = vec2( 1.0 ) / mapSize;

    float visibility = 0.0;
    for (float y = -1.0 ; y <=1.0 ; y+=1.0) {
      for (float x = -1.0 ; x <=1.0 ; x+=1.0) {
        vec2 uv = shadowCoord.xy + texelSize * vec2(x, y) * radius;
        vec4 rgbaDepth = texture2D(shadowMap, uv);
        float depth = unpack(rgbaDepth);
        visibility += step(depth, shadowCoord.z) * intensity;
      }
    }

    visibility *= ( 1.0 / 9.0 );
    return visibility * filterX * filterY;

}

#endif

void main() {

  vec4 shadowColor = vec4(1.0, 1.0, 1.0, 1.0);

#ifdef R3_SHADOW_MAP_COUNT

  float visibility = 1.0;

  for(int i = 0; i < R3_SHADOW_MAP_COUNT; i++) {

   visibility -= getVisibility(v_PositionFromLight[i], u_shadowMaps[i], u_shadows[i].mapSize, u_shadows[i].intensity, u_shadows[i].bias, u_shadows[i].radius);

  }

  visibility = clamp(visibility, 0.0, 1.0);
  shadowColor = vec4(visibility, visibility, visibility, 1.0);

#endif

  gl_FragColor = shadowColor;
}