#ifndef SUN_LENS_FLARE_VISIBILITY_CORE
#define SUN_LENS_FLARE_VISIBILITY_CORE

// Pass 0 (Visibility Sampling, ShaderDataGroup.Renderer):
highp sampler2D renderer_SunLensFlareDepthTexture;
// xy: scale from screen UV to depth texture UV, zw: offset
vec4 renderer_SunLensFlareDepthRect;
// x: sunU, y: sunV, z: aspectRatio, w: diskSampleRadiusY
vec4 renderer_SunLensFlareVisibilityParams0;
// x: depthSkyThreshold, y: temporalBlendFactor, z: unused, w: unused
vec4 renderer_SunLensFlareVisibilityParams1;

#if defined(GRAPHICS_API_WEBGL2) || defined(GRAPHICS_API_WEBGPU)
	vec2 toSunLensFlareDepthUv(vec2 screenUv, vec4 depthRect) {
		vec2 clampedScreen = clamp(screenUv, vec2(0.002), vec2(0.998));
		return clamp(clampedScreen * depthRect.xy + depthRect.zw, vec2(0.002), vec2(0.998));
	}

	// 9-tap solar disk visibility shared by WebGL2 Transform Feedback and WebGPU ComputeShader.
	float sampleSunLensFlareVisibilityTf(vec2 sunUv, float aspectRatio, float radiusY, float skyThreshold, vec4 depthRect) {
		vec2 r = vec2(radiusY / max(aspectRatio, 0.0001), radiusY);
		vec2 d = r * 0.70710678;

		float vis = 0.0;
		highp float depth;

		depth = textureLod(renderer_SunLensFlareDepthTexture, toSunLensFlareDepthUv(sunUv, depthRect), 0.0).r;
		vis += step(skyThreshold, depth) * 2.0;

		depth = textureLod(renderer_SunLensFlareDepthTexture, toSunLensFlareDepthUv(sunUv + vec2(r.x, 0.0), depthRect), 0.0).r;
		vis += step(skyThreshold, depth);
		depth = textureLod(renderer_SunLensFlareDepthTexture, toSunLensFlareDepthUv(sunUv - vec2(r.x, 0.0), depthRect), 0.0).r;
		vis += step(skyThreshold, depth);
		depth = textureLod(renderer_SunLensFlareDepthTexture, toSunLensFlareDepthUv(sunUv + vec2(0.0, r.y), depthRect), 0.0).r;
		vis += step(skyThreshold, depth);
		depth = textureLod(renderer_SunLensFlareDepthTexture, toSunLensFlareDepthUv(sunUv - vec2(0.0, r.y), depthRect), 0.0).r;
		vis += step(skyThreshold, depth);

		depth = textureLod(renderer_SunLensFlareDepthTexture, toSunLensFlareDepthUv(sunUv + d, depthRect), 0.0).r;
		vis += step(skyThreshold, depth);
		depth = textureLod(renderer_SunLensFlareDepthTexture, toSunLensFlareDepthUv(sunUv - d, depthRect), 0.0).r;
		vis += step(skyThreshold, depth);
		depth = textureLod(renderer_SunLensFlareDepthTexture, toSunLensFlareDepthUv(sunUv + vec2(d.x, -d.y), depthRect), 0.0).r;
		vis += step(skyThreshold, depth);
		depth = textureLod(renderer_SunLensFlareDepthTexture, toSunLensFlareDepthUv(sunUv + vec2(-d.x, d.y), depthRect), 0.0).r;
		vis += step(skyThreshold, depth);

		return vis * 0.1;
	}
#endif

#endif
