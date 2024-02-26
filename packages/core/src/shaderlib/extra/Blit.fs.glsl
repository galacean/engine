uniform mediump sampler2D renderer_BlitTexture;
#ifdef HAS_TEX_LOD
	uniform float renderer_BlitMipLevel;
#endif

varying vec2 v_uv;

void main() {
	#ifdef HAS_TEX_LOD
		gl_FragColor = texture2DLodEXT( renderer_BlitTexture, v_uv, renderer_BlitMipLevel );
	#else
		gl_FragColor = texture2D( renderer_BlitTexture, v_uv );
	#endif
}

