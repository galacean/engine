#include <common>

uniform mediump sampler2D renderer_BlitTexture;
#ifdef HAS_TEX_LOD
	uniform float renderer_BlitMipLevel;
#endif

varying vec2 v_uv;

void main() {
	vec2 uv = v_uv;
	// Screen uv is flipped
	uv.y = 1.0 - uv.y;

	#ifdef HAS_TEX_LOD
		gl_FragColor = texture2DLodEXT( renderer_BlitTexture, uv, renderer_BlitMipLevel );
	#else
		gl_FragColor = texture2D( renderer_BlitTexture, uv );
	#endif

	// Color space in screen is in gamma space but without sRGB texture, so we need to convert it to linear space manually
	gl_FragColor = sRGBToLinear(gl_FragColor);

	gl_FragColor = outputSRGBCorrection(gl_FragColor);
}

