#include <common>

uniform mediump sampler2D renderer_BlitTexture;
#ifdef HAS_TEX_LOD
	uniform float renderer_BlitMipLevel;
#endif

uniform vec4 renderer_SourceScaleOffset;

varying vec2 v_uv;

#ifdef HAS_TEX_LOD
	vec4 texture2DLodSRGB(sampler2D tex, vec2 uv, float lod, bool decodeSRGB) {
		vec4 color = texture2DLodEXT(tex, uv, lod);
		#ifdef ENGINE_NO_SRGB
			if (decodeSRGB) color = sRGBToLinear(color);
		#endif
		return color;
	}
#endif

void main() {
	vec2 uv = v_uv;
	uv = uv * renderer_SourceScaleOffset.xy + renderer_SourceScaleOffset.zw;

	#ifdef HAS_TEX_LOD
		gl_FragColor = texture2DLodSRGB( renderer_BlitTexture, uv, renderer_BlitMipLevel, renderer_BlitTexture_SRGBDecode);
	#else
		gl_FragColor = texture2DSRGB( renderer_BlitTexture, uv, renderer_BlitTexture_SRGBDecode);
	#endif
}

