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
	mat4 material_WhiteBalanceMatrix;
	vec4 material_ColorAdjustments; // x: postExposure multiplier, y: contrast multiplier, z: saturation multiplier

	highp vec3 applyLogCContrast(highp vec3 color, highp float contrast) {
		// Contrast in ARRI LogC space pivoted at 18% middle gray (log2(5.5555556 * 0.18 + 0.047996) = 0.06763344)
		highp vec3 colorLog = log2(5.5555556 * color + 0.047996);
		colorLog = (colorLog - 0.06763344) * contrast + 0.06763344;
		return max((exp2(colorLog) - 0.047996) * 0.18, vec3(0.0));
	}
#endif

void frag(Varyings v) {
	highp vec4 color = texture2D(renderer_BlitTexture, v.v_uv);

	#ifdef ENABLE_EFFECT_BLOOM
		#ifdef BLOOM_HQ
			mediump vec3 bloom = sampleTexture2DBicubic(material_BloomTexture, v.v_uv, material_BloomTexelSize).rgb;
		#else
			mediump vec3 bloom = texture2D(material_BloomTexture, v.v_uv).rgb;
		#endif

		bloom *= material_BloomIntensityParams.x;
		highp vec3 bloomColor = bloom * material_BloomTint.rgb;

		#ifdef BLOOM_DIRT
			mediump vec3 dirt = texture2D(material_BloomDirtTexture, v.v_uv * material_BloomDirtTilingOffset.xy + material_BloomDirtTilingOffset.zw).rgb;
			dirt *= material_BloomIntensityParams.y;
			// Additive bloom (artist friendly)
			bloomColor += dirt * bloom;
		#endif
	#endif

	#ifdef ENABLE_EFFECT_COLOR_ADJUSTMENTS
		highp float alpha = clamp(color.a, 0.0, 1.0);
		highp mat3 wbMat = mat3(material_WhiteBalanceMatrix);
		highp float exposure = material_ColorAdjustments.x;
		highp float contrast = material_ColorAdjustments.y;
		if (alpha >= 0.9999) {
			#ifdef ENABLE_EFFECT_BLOOM
				color.rgb += bloomColor;
			#endif
			color.rgb = max(wbMat * (color.rgb * exposure), vec3(0.0));
			color.rgb = applyLogCContrast(color.rgb, contrast);
		} else {
			#ifdef ENABLE_EFFECT_BLOOM
				highp vec3 gradedBloom = max(wbMat * (bloomColor * exposure), vec3(0.0));
			#endif
			if (alpha > 1e-4) {
				highp vec3 straight = color.rgb / alpha;
				#ifdef ENABLE_EFFECT_BLOOM
					straight += bloomColor;
				#endif
				straight = max(wbMat * (straight * exposure), vec3(0.0));
				color.rgb = applyLogCContrast(straight, contrast) * alpha;
				#ifdef ENABLE_EFFECT_BLOOM
					color.rgb += gradedBloom * (1.0 - alpha);
				#endif
			} else {
				color.rgb = max(wbMat * (color.rgb * exposure), vec3(0.0));
				#ifdef ENABLE_EFFECT_BLOOM
					color.rgb += gradedBloom;
				#endif
			}
		}
		highp float colorLuminance = dot(color.rgb, vec3(0.2126729, 0.7151522, 0.072175));
		color.rgb = max(mix(vec3(colorLuminance), color.rgb, material_ColorAdjustments.z), vec3(0.0));
	#else
		#ifdef ENABLE_EFFECT_BLOOM
			color.rgb += bloomColor;
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
