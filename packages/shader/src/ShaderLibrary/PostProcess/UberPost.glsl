#ifndef UBER_POST
#define UBER_POST

#include "ShaderLibrary/PostProcess/PostCommon.glsl"
#include "ShaderLibrary/PostProcess/Filtering.glsl"
#include "ShaderLibrary/PostProcess/Tonemapping/NeutralTonemapping.glsl"
#include "ShaderLibrary/PostProcess/Tonemapping/ACESTonemapping.glsl"

mediump sampler2D renderer_BlitTexture;
vec4 renderer_texelSize;
#ifdef ENABLE_EFFECT_BLOOM
	mediump sampler2D material_BloomTexture;
	mediump sampler2D material_BloomDirtTexture;
	vec4 material_BloomTint;
	vec4 material_BloomDirtTilingOffset;
	vec4 material_BloomIntensityParams;
#endif

#ifdef ENABLE_EFFECT_COLOR_ADJUSTMENTS
	float material_PostExposure;
	mat4 material_WhiteBalanceMatrix;
	vec4 material_ColorAdjustments; // x: contrast multiplier, y: saturation multiplier
#endif

void frag(Varyings v) {
	mediump vec4 color = texture2D(renderer_BlitTexture, v.v_uv);

	#ifdef ENABLE_EFFECT_COLOR_ADJUSTMENTS
		color.rgb *= material_PostExposure;
	#endif

	#ifdef ENABLE_EFFECT_BLOOM
    	#ifdef BLOOM_HQ
    	  mediump vec4 bloom = sampleTexture2DBicubic(material_BloomTexture, v.v_uv, renderer_texelSize);
    	#else
    	  mediump vec4 bloom = texture2D(material_BloomTexture, v.v_uv);
    	#endif

    	bloom *= material_BloomIntensityParams.x;
    	color += bloom * material_BloomTint;

    	#ifdef BLOOM_DIRT
    	  mediump vec4 dirt = texture2D(material_BloomDirtTexture, v.v_uv * material_BloomDirtTilingOffset.xy + material_BloomDirtTilingOffset.zw);
    	  dirt *= material_BloomIntensityParams.y;
    	  // Additive bloom (artist friendly)
    	  color += dirt * bloom;
    	#endif
	#endif

	#ifdef ENABLE_EFFECT_COLOR_ADJUSTMENTS
		color.rgb = max(mat3(material_WhiteBalanceMatrix) * color.rgb, vec3(0.0));
		color.rgb = max((color.rgb - vec3(0.18)) * material_ColorAdjustments.x + vec3(0.18), vec3(0.0));
		float colorLuminance = dot(color.rgb, vec3(0.2126729, 0.7151522, 0.072175));
		color.rgb = max(mix(vec3(colorLuminance), color.rgb, material_ColorAdjustments.y), vec3(0.0));
	#endif

	#ifdef ENABLE_EFFECT_TONEMAPPING
		#if TONEMAPPING_MODE == 0
      		color.rgb = neutralTonemap(color.rgb);
    	#elif TONEMAPPING_MODE == 1
      		color.rgb = ACESTonemap(color.rgb);
    	#endif

    	color.rgb = clamp(color.rgb, vec3(0), vec3(1));
	#endif

    gl_FragColor = color;
}

#endif
