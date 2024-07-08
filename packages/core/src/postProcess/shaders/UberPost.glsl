#include <PostCommon>
#include <Filtering>
#include <NeutralTonemapping>
#include <ACESTonemapping>

varying vec2 v_uv;
uniform sampler2D renderer_BlitTexture;
uniform vec4 renderer_texelSize;    // x: 1/width, y: 1/height, z: width, w: height
#ifdef ENABLE_EFFECT_BLOOM
	uniform sampler2D material_BloomTexture;
	uniform sampler2D material_BloomDirtTexture;
	uniform vec4 material_BloomTint;
	uniform vec4 material_BloomDirtTilingOffset;
	uniform vec4 material_BloomIntensityParams; // x: bloom intensity, y: dirt intensity
#endif


void main(){
	mediump vec4 color = sampleTexture(renderer_BlitTexture, v_uv);

	#ifdef ENABLE_EFFECT_BLOOM
    	#ifdef BLOOM_HQ
    	  mediump vec4 bloom = sampleTexture2DBicubic(material_BloomTexture, v_uv, renderer_texelSize);
    	#else
    	  mediump vec4 bloom = sampleTexture(material_BloomTexture, v_uv);
    	#endif

    	bloom *= material_BloomIntensityParams.x;
    	color += bloom * material_BloomTint;

    	#ifdef BLOOM_DIRT
    	  mediump vec4 dirt = sampleTexture(material_BloomDirtTexture, v_uv * material_BloomDirtTilingOffset.xy + material_BloomDirtTilingOffset.zw);
    	  dirt *= material_BloomIntensityParams.y;
    	  // Additive bloom (artist friendly)
    	  color += dirt * bloom;
    	#endif
	#endif

	#ifdef ENABLE_EFFECT_TONEMAPPING
		#if TONEMAPPING_MODE == 1
      		color.rgb = neutralTonemap(color.rgb);
    	#elif TONEMAPPING_MODE == 2
      		color.rgb = ACESTonemap(color.rgb);
    	#endif

    	color.rgb = clamp(color.rgb, vec3(0), vec3(1));
	#endif

    gl_FragColor = color;

	#ifndef ENGINE_IS_COLORSPACE_GAMMA
      gl_FragColor = linearToGamma(gl_FragColor);
    #endif
}