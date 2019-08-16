precision highp float;
varying vec2 v_uv;

uniform sampler2D s_sourceRT;
uniform sampler2D s_ramp;

void main(){
  vec4 srcColor = texture2D(s_sourceRT, v_uv);

  float rr = texture2D(s_ramp, srcColor.rr).r;
	float gg = texture2D(s_ramp, srcColor.gg).g;
	float bb = texture2D(s_ramp, srcColor.bb).b; 

  gl_FragColor = vec4(rr, gg, bb, 1.0);

}