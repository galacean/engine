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
	mediump vec4 color = texture2DSRGB(renderer_BlitTexture, v_uv);

	#ifdef ENABLE_EFFECT_BLOOM
    	#ifdef BLOOM_HQ
    	  mediump vec4 bloom = sampleTexture2DBicubic(material_BloomTexture, v_uv, renderer_texelSize);
    	#else
    	  mediump vec4 bloom = texture2DSRGB(material_BloomTexture, v_uv);
    	#endif

    	bloom *= material_BloomIntensityParams.x;
		vec4 finalBloom = bloom * material_BloomTint;

    	#ifdef BLOOM_DIRT
    	  mediump vec4 dirt = texture2DSRGB(material_BloomDirtTexture, v_uv * material_BloomDirtTilingOffset.xy + material_BloomDirtTilingOffset.zw);
    	  dirt *= material_BloomIntensityParams.y;
    	  // Additive bloom (artist friendly)
		  finalBloom += dirt * bloom;
    	#endif
		
		color.rgb += finalBloom.rgb;

		// Bloom is additive, so we need to compensation the factor to eliminate the effect of dividing by alpha in the sRGB pass
		float bloomCompensationFactor = additiveColorCompensationFactor(color.a) - 1.0;
	#else
		vec4 finalBloom = vec4(0.0);
		float bloomCompensationFactor = 0.0;
	#endif
	
	#ifdef ENABLE_EFFECT_TONEMAPPING
		vec3 originalColor = color.rgb;
		#if TONEMAPPING_MODE == 0
      		color.rgb = neutralTonemap(color.rgb);
    	#elif TONEMAPPING_MODE == 1
      		color.rgb = ACESTonemap(color.rgb);
    	#endif
    	color.rgb = clamp(color.rgb, vec3(0), vec3(1));

		vec3 tonemappingFactor = color.rgb/originalColor.rgb;
		gl_FragColor = vec4(color.rgb + tonemappingFactor * finalBloom.rgb * bloomCompensationFactor, color.a);
	#else
		gl_FragColor = vec4(color.rgb + finalBloom.rgb * bloomCompensationFactor, color.a);
	#endif
	

   
}