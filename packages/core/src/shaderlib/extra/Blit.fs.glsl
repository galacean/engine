uniform mediump sampler2D renderer_BlitTexture;
#ifdef HAS_TEX_LOD
	uniform float renderer_BlitMipLevel;
#endif


varying vec2 v_uv;

void main() {
	vec2 uv = v_uv;
	#ifdef renderer_FlipYBlitTexture
		uv.y = 1.0 - uv.y;
	#endif

	#ifdef HAS_TEX_LOD
		gl_FragColor = texture2DLodEXT( renderer_BlitTexture, uv, renderer_BlitMipLevel );
	#else
		gl_FragColor = texture2D( renderer_BlitTexture, uv );
	#endif
}

