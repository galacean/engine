#ifndef UBER_POST
#define UBER_POST

#include "ShaderLibrary/PostProcess/PostCommon.glsl"
#include "ShaderLibrary/PostProcess/Filtering.glsl"
#include "ShaderLibrary/PostProcess/Tonemapping/NeutralTonemapping.glsl"
#include "ShaderLibrary/PostProcess/Tonemapping/ACESTonemapping.glsl"

mediump sampler2D renderer_BlitTexture;
#ifdef ENABLE_EFFECT_BLOOM
	mediump sampler2D material_BloomTexture;
	mediump sampler2D material_BloomDirtTexture;
	vec4 material_BloomTexelSize;
	vec4 material_BloomTint;
	vec4 material_BloomDirtTilingOffset;
	vec4 material_BloomIntensityParams;
#endif

#ifdef ENABLE_EFFECT_COLOR_ADJUSTMENTS
	float material_PostExposure;
	vec3 material_WhiteBalance;
	vec4 material_ColorAdjustments; // x: contrast multiplier, y: saturation multiplier
#endif

#ifdef ENABLE_EFFECT_SUN_LENS_FLARE
	mediump sampler2D material_SunLensFlareTexture;
	float material_SunLensFlareCompositeIntensity;
#endif

#ifdef ENABLE_EFFECT_VOLUMETRIC_LIGHT
	mediump sampler2D material_VolumetricLightTexture;
	// x: sunU, y: sunV, z: softKnee, w: aspectRatio
	vec4 material_VolumetricLightCompositeParams;
	// rgb: linear tint, a: effectiveStrength
	vec4 material_VolumetricLightTint;
#endif

vec3 linearToLMS(vec3 color) {
	return vec3(
		dot(color, vec3(0.390405, 0.549941, 0.00892632)),
		dot(color, vec3(0.0708416, 0.963172, 0.00135775)),
		dot(color, vec3(0.0231082, 0.128021, 0.936245))
	);
}

vec3 lmsToLinear(vec3 color) {
	return vec3(
		dot(color, vec3(2.85847, -1.62879, -0.024891)),
		dot(color, vec3(-0.210182, 1.1582, 0.000324281)),
		dot(color, vec3(-0.041812, -0.118169, 1.06867))
	);
}

void frag(Varyings v) {
	mediump vec4 color = texture2D(renderer_BlitTexture, v.v_uv);

	#ifdef ENABLE_EFFECT_COLOR_ADJUSTMENTS
		color.rgb *= material_PostExposure;
	#endif

	#ifdef ENABLE_EFFECT_BLOOM
    	#ifdef BLOOM_HQ
    	  mediump vec3 bloom = sampleTexture2DBicubic(material_BloomTexture, v.v_uv, material_BloomTexelSize).rgb;
    	#else
    	  mediump vec3 bloom = texture2D(material_BloomTexture, v.v_uv).rgb;
    	#endif

    	bloom *= material_BloomIntensityParams.x;
    	color.rgb += bloom * material_BloomTint.rgb;

    	#ifdef BLOOM_DIRT
    	  mediump vec3 dirt = texture2D(material_BloomDirtTexture, v.v_uv * material_BloomDirtTilingOffset.xy + material_BloomDirtTilingOffset.zw).rgb;
    	  dirt *= material_BloomIntensityParams.y;
    	  // Additive bloom (artist friendly)
    	  color.rgb += dirt * bloom;
    	#endif
	#endif

	#ifdef ENABLE_EFFECT_SUN_LENS_FLARE
		if (material_SunLensFlareCompositeIntensity > 0.0) {
			color.rgb += texture2D(material_SunLensFlareTexture, v.v_uv).rgb * material_SunLensFlareCompositeIntensity;
		}
	#endif

	#ifdef ENABLE_EFFECT_VOLUMETRIC_LIGHT
		if (material_VolumetricLightTint.a > 0.0) {
			vec2 vlDSun = (material_VolumetricLightCompositeParams.xy - v.v_uv) * vec2(max(material_VolumetricLightCompositeParams.w, 0.25), 1.0);
			float vlEnvelope = 0.42 + 0.72 * exp(-length(vlDSun) * 1.15);
			vec3 vlShaft = texture2D(material_VolumetricLightTexture, v.v_uv).rgb * material_VolumetricLightTint.a * vlEnvelope;
			color.rgb += vlShaft * (vec3(1.0) - clamp(color.rgb, 0.0, 1.0) * material_VolumetricLightCompositeParams.z);
		}
	#endif

	#ifdef ENABLE_EFFECT_COLOR_ADJUSTMENTS
		color.rgb = max(lmsToLinear(linearToLMS(color.rgb) * material_WhiteBalance), vec3(0.0));
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
