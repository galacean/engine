precision highp float;
varying vec2 v_uv;

uniform sampler2D s_sourceRT;

uniform float s_threshold;
uniform float s_smoothWidth;

void main(){
  vec4 srcColor = texture2D(s_sourceRT, v_uv);

  float luma = dot(srcColor.xyz, vec3( 0.299, 0.587, 0.114 ));
  float alpha = smoothstep(s_threshold, s_threshold+s_smoothWidth, luma);

  gl_FragColor = mix(vec4(0.0, 0.0, 0.0, 1.0), srcColor, alpha);

}