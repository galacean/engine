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

void frag(Varyings v) {
	mediump vec4 color = texture2DSRGB(renderer_BlitTexture, v.v_uv);

	#ifdef ENABLE_EFFECT_BLOOM
    	#ifdef BLOOM_HQ
    	  mediump vec4 bloom = sampleTexture2DBicubic(material_BloomTexture, v.v_uv, renderer_texelSize);
    	#else
    	  mediump vec4 bloom = texture2DSRGB(material_BloomTexture, v.v_uv);
    	#endif

    	bloom *= material_BloomIntensityParams.x;
    	color += bloom * material_BloomTint;

    	#ifdef BLOOM_DIRT
    	  mediump vec4 dirt = texture2DSRGB(material_BloomDirtTexture, v.v_uv * material_BloomDirtTilingOffset.xy + material_BloomDirtTilingOffset.zw);
    	  dirt *= material_BloomIntensityParams.y;
    	  // Additive bloom (artist friendly)
    	  color += dirt * bloom;
    	#endif
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
