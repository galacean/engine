precision highp float;
varying vec2 v_uv;

uniform sampler2D s_resultRT;
uniform sampler2D s_sceneRT;

void main(){

  vec3 c = texture2D(s_resultRT, v_uv).rgb;
  float a = texture2D(s_sceneRT, v_uv).a;
  gl_FragColor = vec4(c,a);

}