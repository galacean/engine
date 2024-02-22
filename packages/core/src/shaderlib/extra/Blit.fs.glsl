uniform mediump sampler2D renderer_BlitTexture;
uniform float renderer_BlitMipLevel;
varying vec2 v_uv;

void main() {
	#ifdef HAS_TEX_LOD
		gl_FragColor = texture2DLodEXT( renderer_BlitTexture, v_uv, renderer_BlitMipLevel );
	#else
		gl_FragColor = texture2D( renderer_BlitTexture, v_uv, renderer_BlitMipLevel );
	#endif
}

