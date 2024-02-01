uniform mediump sampler2D renderer_BlitTexture;
varying vec2 v_uv;

void main() {
	gl_FragColor = texture2D(renderer_BlitTexture, v_uv);
}

