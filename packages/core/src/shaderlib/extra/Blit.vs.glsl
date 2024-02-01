attribute vec4 POSITION_UV;
varying vec2 v_uv;

void main() {	
	gl_Position = vec4(POSITION_UV.xy, 0.0, 1.0);	
	v_uv = POSITION_UV.zw;
}