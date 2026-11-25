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
	#ifdef VOLUMETRIC_LIGHT_RAYMARCH
		highp sampler2D material_VolumetricLightTexture;
		highp sampler2D material_VolumetricLightDepthTexture;
	#else
		mediump sampler2D material_VolumetricLightTexture;
	#endif
	// Low:      x: sunU, y: sunV, z: softKnee, w: aspectRatio
	// Raymarch: x: lowTexelX, y: lowTexelY, z: softKnee, w: bilateralSharpness
	vec4 material_VolumetricLightCompositeParams;
	// Low:      rgb: linear tint, a: effectiveStrength
	// Raymarch: rgb: linear tint * effectiveStrength, a: 1.0
	vec4 material_VolumetricLightTint;
#endif

#if defined(ENABLE_EFFECT_VOLUMETRIC_LIGHT) && defined(VOLUMETRIC_LIGHT_RAYMARCH)
float sampleVolumetricLightBilateral(vec2 uv, float fullDepth) {
	vec2 texel = material_VolumetricLightCompositeParams.xy;
	vec2 lowSize = vec2(1.0) / texel;
	vec2 fPos = uv * lowSize - 0.5;
	vec2 baseUv = (floor(fPos) + 0.5) * texel;
	vec2 frac = clamp(fract(fPos), 0.0, 1.0);
	vec2 minUv = texel * 0.5;
	vec2 maxUv = vec2(1.0) - minUv;

	vec2 s00 = texture2D(material_VolumetricLightTexture, clamp(baseUv, minUv, maxUv)).rg;
	vec2 s10 = texture2D(material_VolumetricLightTexture, clamp(baseUv + vec2(texel.x, 0.0), minUv, maxUv)).rg;
	vec2 s01 = texture2D(material_VolumetricLightTexture, clamp(baseUv + vec2(0.0, texel.y), minUv, maxUv)).rg;
	vec2 s11 = texture2D(material_VolumetricLightTexture, clamp(baseUv + texel, minUv, maxUv)).rg;

	float invFullDepth = 1.0 / max(fullDepth, 1e-4);
	float sharp = material_VolumetricLightCompositeParams.w;
	float d00 = abs(fullDepth - s00.g) * invFullDepth * sharp;
	float d10 = abs(fullDepth - s10.g) * invFullDepth * sharp;
	float d01 = abs(fullDepth - s01.g) * invFullDepth * sharp;
	float d11 = abs(fullDepth - s11.g) * invFullDepth * sharp;

	float w00 = (1.0 - frac.x) * (1.0 - frac.y) / (1e-4 + d00 * d00);
	float w10 = frac.x * (1.0 - frac.y) / (1e-4 + d10 * d10);
	float w01 = (1.0 - frac.x) * frac.y / (1e-4 + d01 * d01);
	float w11 = frac.x * frac.y / (1e-4 + d11 * d11);

	float wSum = w00 + w10 + w01 + w11;
	return (s00.r * w00 + s10.r * w10 + s01.r * w01 + s11.r * w11) / max(wSum, 1e-5);
}
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
			#ifdef VOLUMETRIC_LIGHT_RAYMARCH
				float vlFullDepth = remapDepthBufferLinear01(texture2D(material_VolumetricLightDepthTexture, v.v_uv).r);
				float vlScatter = sampleVolumetricLightBilateral(v.v_uv, vlFullDepth);
				vec3 vlShaft = material_VolumetricLightTint.rgb * vlScatter;
			#else
				vec2 vlDSun = (material_VolumetricLightCompositeParams.xy - v.v_uv) * vec2(max(material_VolumetricLightCompositeParams.w, 0.25), 1.0);
				float vlEnvelope = 0.42 + 0.72 * exp(-length(vlDSun) * 1.15);
				vec3 vlShaft = texture2D(material_VolumetricLightTexture, v.v_uv).rgb * (material_VolumetricLightTint.a * vlEnvelope);
			#endif
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
