// #define MIP_COUNT 5

precision highp float;
varying vec2 v_uv;

uniform sampler2D s_sourceRT;
uniform sampler2D s_compositeRT[MIP_COUNT];
uniform float u_bloomStrength;

uniform float u_chooser;

float lerpBloomFactor(const in float factor) { 
  float bloomRadius = 0.1;
	float mirrorFactor = 1.2 - factor;
	return mix(factor, mirrorFactor, bloomRadius);
}

void main(){

  vec3 color = texture2D(s_sourceRT, v_uv).rgb;

  #ifndef SIMPLE
    for(int i=0; i<MIP_COUNT; i++){
      vec3 t = texture2D(s_compositeRT[i], v_uv).rgb;
      float s = float(i);
      t *= lerpBloomFactor(1.0-0.2*s)*u_bloomStrength;

      color += t;
    }
  #else
    float t = texture2D(s_compositeRT[0], v_uv).r;

    if(u_chooser > -1.0){
      if(u_chooser < 1.0){
        color *= t;
      }else{
        color = vec3(t);
      }

    } 
  #endif

  gl_FragColor = vec4(color, 1.0);
}