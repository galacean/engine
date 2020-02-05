#define FILTER_SIZE 7
precision highp float;
precision highp int;
#include <depth_packing>

varying vec2 v_uv;

uniform sampler2D s_sourceRT;
uniform sampler2D s_normalRT;
uniform sampler2D s_depthRT;

uniform float u_direction;
uniform float u_blurSize;

uniform float u_zNear;
uniform float u_zFar;

uniform float u_depthBias;
uniform float u_rtSize;

float getLinearDepth(vec2 coord) {                          
  float depth = unpackRGBAToDepth(texture2D(s_depthRT, coord.xy));
  float viewDepth = abs(depth);
  return viewDepth;
}   

float gaussianPdf(in float x, in float sigma) {
	return 0.39894 * exp( -0.5 * x * x/( sigma * sigma))/sigma;
}

vec3 unpackRGBToNormal( const in vec3 rgb ) {
	return 2.0 * rgb.xyz - 1.0;
}

void main()
{
    vec2 off = vec2(0.0);
    if (u_direction < 0.0) {
        off[0] = u_blurSize / u_rtSize;
    }
    else {
        off[1] = u_blurSize / u_rtSize;
        
    }

    float sum = 0.0;
    float weightSum = 0.0;

    vec3 centerNormal = unpackRGBToNormal(texture2D(s_normalRT, v_uv).xyz);

    float centerDepth = getLinearDepth(v_uv);

    for(int i = 0;i < FILTER_SIZE; ++i){

      float offset = (float(FILTER_SIZE) - 1.0)/2.0;
      vec2 coord = clamp(v_uv + vec2(float(i) - offset) * off, vec2(0.0), vec2(1.0));

      float x = abs(float(i) - offset);
      float w = gaussianPdf(x,float(FILTER_SIZE)); 
    
      vec3 normal = unpackRGBToNormal(texture2D(s_normalRT, coord).xyz);
      w *= clamp(dot(normal, centerNormal), 0.0, 1.0);

      float d = getLinearDepth(coord);

      w *= (1.0 - smoothstep( 0.0, 1.0,abs(centerDepth - d) / u_depthBias));

      weightSum += w;
      sum += texture2D(s_sourceRT, coord).r * w;
    }

   gl_FragColor = vec4(vec3(sum / weightSum), 1.0);

}