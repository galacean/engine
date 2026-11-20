#ifndef SUN_LENS_FLARE
#define SUN_LENS_FLARE

#include "ShaderLibrary/Common/Common.glsl"

struct VisibilityTfAttributes {
	float a_PrevVisibility;
};

struct VisibilityTfVaryings {
	float v_NextVisibility;
};

struct FlareQuadAttributes {
	vec2 a_QuadCorner;
	// x: optical-axis scale, y: unused/reserved, z: quad half-size in isotropic screen-height units, w: shapeType (0=glare, 1=circle, 2=hex, 3=dot)
	vec4 a_FlareGeo;
	// rgb: linear ghost hue, a: unused/reserved
	vec4 a_FlareHue;
	// Per-draw visibility fed directly from Transform Feedback ping-pong buffer (instanceStepRate >= 34)
	float a_SunVisibility;
};

struct FlareQuadVaryings {
	vec2 v_local;
	vec3 v_color;
	float v_shapeType;
	float v_radius;
};

// Pass 0 (Transform Feedback, ShaderDataGroup.Renderer):
highp sampler2D renderer_SunLensFlareDepthTexture;
// xy: scale from screen UV to depth texture UV, zw: offset
vec4 renderer_SunLensFlareDepthRect;
// x: sunU, y: sunV, z: aspectRatio, w: diskSampleRadiusY
vec4 renderer_SunLensFlareVisibilityParams0;
// x: depthSkyThreshold, y: temporalBlendFactor, z: unused, w: unused
vec4 renderer_SunLensFlareVisibilityParams1;

// Pass 1 (Instanced Additive Quads, ShaderDataGroup.Material):
// x: sunU, y: sunV, z: effectiveIntensity, w: aspectRatio
vec4 material_SunLensFlareParams0;
// x: glareIntensity, y: ghostIntensity, z: ghostSpread, w: ghostChromaticity
vec4 material_SunLensFlareParams1;
// rgb: linear tint (pre-compensated when composited directly into Bloom _mipRT[0]), a: animation time (seconds)
vec4 material_SunLensFlareTint;
// < 0.0: read a_SunVisibility from Transform Feedback VBO; >= 0.0: use this value directly (occlusion disabled / WebGL1)
float material_SunLensFlareVisibilityOverride;

#ifdef GRAPHICS_API_WEBGL2
	vec2 toSunLensFlareDepthUv(vec2 screenUv, vec4 depthRect) {
		vec2 clampedScreen = clamp(screenUv, vec2(0.002), vec2(0.998));
		return clamp(clampedScreen * depthRect.xy + depthRect.zw, vec2(0.002), vec2(0.998));
	}

	// 9-tap solar disk visibility executed on 1 single vertex in Transform Feedback (RASTERIZER_DISCARD, zero FBO pass).
	float sampleSunLensFlareVisibilityTf(vec2 sunUv, float aspectRatio, float radiusY, float skyThreshold, vec4 depthRect) {
		vec2 r = vec2(radiusY / max(aspectRatio, 0.0001), radiusY);
		vec2 d = r * 0.70710678;

		float vis = 0.0;
		highp float depth;

		depth = texture2DLodEXT(renderer_SunLensFlareDepthTexture, toSunLensFlareDepthUv(sunUv, depthRect), 0.0).r;
		vis += step(skyThreshold, depth) * 2.0;

		depth = texture2DLodEXT(renderer_SunLensFlareDepthTexture, toSunLensFlareDepthUv(sunUv + vec2(r.x, 0.0), depthRect), 0.0).r;
		vis += step(skyThreshold, depth);
		depth = texture2DLodEXT(renderer_SunLensFlareDepthTexture, toSunLensFlareDepthUv(sunUv - vec2(r.x, 0.0), depthRect), 0.0).r;
		vis += step(skyThreshold, depth);
		depth = texture2DLodEXT(renderer_SunLensFlareDepthTexture, toSunLensFlareDepthUv(sunUv + vec2(0.0, r.y), depthRect), 0.0).r;
		vis += step(skyThreshold, depth);
		depth = texture2DLodEXT(renderer_SunLensFlareDepthTexture, toSunLensFlareDepthUv(sunUv - vec2(0.0, r.y), depthRect), 0.0).r;
		vis += step(skyThreshold, depth);

		depth = texture2DLodEXT(renderer_SunLensFlareDepthTexture, toSunLensFlareDepthUv(sunUv + d, depthRect), 0.0).r;
		vis += step(skyThreshold, depth);
		depth = texture2DLodEXT(renderer_SunLensFlareDepthTexture, toSunLensFlareDepthUv(sunUv - d, depthRect), 0.0).r;
		vis += step(skyThreshold, depth);
		depth = texture2DLodEXT(renderer_SunLensFlareDepthTexture, toSunLensFlareDepthUv(sunUv + vec2(d.x, -d.y), depthRect), 0.0).r;
		vis += step(skyThreshold, depth);
		depth = texture2DLodEXT(renderer_SunLensFlareDepthTexture, toSunLensFlareDepthUv(sunUv + vec2(-d.x, d.y), depthRect), 0.0).r;
		vis += step(skyThreshold, depth);

		return vis * 0.1;
	}
#endif

// Pass 0: 1-vertex Transform Feedback temporal visibility update (no FBO, no CPU readback).
VisibilityTfVaryings visibilityTfVert(VisibilityTfAttributes attr) {
	VisibilityTfVaryings v;
	#ifdef GRAPHICS_API_WEBGL2
		float rawVis = sampleSunLensFlareVisibilityTf(
			renderer_SunLensFlareVisibilityParams0.xy,
			renderer_SunLensFlareVisibilityParams0.z,
			renderer_SunLensFlareVisibilityParams0.w,
			renderer_SunLensFlareVisibilityParams1.x,
			renderer_SunLensFlareDepthRect
		);
		float blendFactor = clamp(renderer_SunLensFlareVisibilityParams1.y, 0.0, 1.0);
		v.v_NextVisibility = mix(attr.a_PrevVisibility, rawVis, blendFactor);
	#else
		v.v_NextVisibility = 1.0;
	#endif
	gl_Position = vec4(0.0);
	return v;
}

void visibilityTfFrag(VisibilityTfVaryings v) {
	discard;
}

// Analytical regular hexagon distance rotated by 0.2 rad (zero trig/sqrt per pixel).
float sunLensFlareHexDist(vec2 q) {
	vec2 r = vec2(0.9800666 * q.x - 0.1986693 * q.y, 0.1986693 * q.x + 0.9800666 * q.y);
	vec2 a = abs(r);
	return max(a.y, dot(a, vec2(0.8660254, 0.5)));
}

// Pass 1: 34 tightly-bounded additive instanced quads (1 glare + 11 circles + 11 hexagons + 11 sparkles).
FlareQuadVaryings flareQuadVert(FlareQuadAttributes attr) {
	FlareQuadVaryings v;
	v.v_local = attr.a_QuadCorner;
	v.v_shapeType = attr.a_FlareGeo.w;
	v.v_radius = attr.a_FlareGeo.z;
	v.v_color = vec3(0.0);

	float visibility = material_SunLensFlareVisibilityOverride >= 0.0
		? material_SunLensFlareVisibilityOverride
		: attr.a_SunVisibility;
	float combinedIntensity = material_SunLensFlareParams0.z * clamp(visibility, 0.0, 1.0);
	float glareIntensity = material_SunLensFlareParams1.x;
	float ghostIntensity = material_SunLensFlareParams1.y;
	bool isGlare = attr.a_FlareGeo.w < 0.5;

	if (combinedIntensity <= 0.0001 || (isGlare ? glareIntensity <= 0.0001 : ghostIntensity <= 0.0001)) {
		gl_Position = vec4(2.0, 2.0, 0.0, 1.0);
		return v;
	}

	vec2 sunUv = material_SunLensFlareParams0.xy;
	float aspectRatio = max(material_SunLensFlareParams0.w, 0.0001);
	float ghostSpread = material_SunLensFlareParams1.z;
	float chromaticity = material_SunLensFlareParams1.w;

	// Aspect-corrected screen coordinates centered at (0, 0) with +Y up.
	vec2 m = vec2((sunUv.x - 0.5) * aspectRatio, 0.5 - sunUv.y);
	vec2 center = isGlare ? m : m * (attr.a_FlareGeo.x * ghostSpread);
	float radius = attr.a_FlareGeo.z;

	// Convert to offscreen RT clip space (flipY convention: v=0 top -> clipY=-1, v=1 bottom -> clipY=+1).
	vec2 centerClip = vec2((center.x * 2.0) / aspectRatio, -center.y * 2.0);
	vec2 halfClip = vec2((radius * 2.0) / aspectRatio, radius * 2.0);

	// Cull quads completely outside the viewport so zero fragments are rasterized.
	if (abs(centerClip.x) - halfClip.x > 1.0 || abs(centerClip.y) - halfClip.y > 1.0) {
		gl_Position = vec4(2.0, 2.0, 0.0, 1.0);
		return v;
	}

	if (isGlare) {
		v.v_color = material_SunLensFlareTint.rgb * (combinedIntensity * glareIntensity);
	} else {
		float rQuad = length(center - m);
		float rolloff = exp(0.35 - rQuad * 0.35) * 0.56 * ghostIntensity;
		vec3 hue = mix(vec3(1.0), attr.a_FlareHue.rgb, chromaticity);
		v.v_color = hue * material_SunLensFlareTint.rgb * (combinedIntensity * rolloff);
	}

	vec2 p = center + attr.a_QuadCorner * radius;
	gl_Position = vec4((p.x * 2.0) / aspectRatio, -p.y * 2.0, 0.0, 1.0);
	return v;
}

void flareQuadFrag(FlareQuadVaryings v) {
	if (v.v_shapeType < 0.5) {
		// Sun core glow & starburst frills (radial falloff + smooth quad boundary taper).
		float localLenSq = dot(v.v_local, v.v_local);
		if (localLenSq >= 1.0) {
			discard;
		}
		vec2 delta = v.v_local * v.v_radius;
		float localLen = sqrt(localLenSq + 1e-6);
		float r = localLen * v.v_radius;
		float edgeMask = clamp((1.0 - localLen) * 5.0, 0.0, 1.0);
		float angle = atan(delta.y, delta.x);
		float bright = 0.2 + sin(material_SunLensFlareTint.a) * 0.03;
		float frillPattern = abs(sin(angle * 3.0 + cos(angle * 9.0))) * abs(sin(angle * 9.0));
		float frills = frillPattern * exp(-r * 6.0) * 0.55;
		float core = (bright / (sqrt(r * 4.0) + 0.08)) * exp(-r * 4.5);
		vec3 glare = (vec3(0.96, 0.96, 1.0) * core + vec3(1.0, 0.96, 0.88) * frills) * edgeMask;
		gl_FragColor = vec4(max(glare * v.v_color, vec3(0.0)), 1.0);
		return;
	}

	float shape = 0.0;
	if (v.v_shapeType < 1.5) {
		// Soft circular bokeh disc with subtle coated outer ring (pure multiply-add).
		float cNorm = dot(v.v_local, v.v_local);
		float circleFill = max(1.0 - cNorm, 0.0);
		shape = circleFill * (0.40 + 0.35 * clamp((cNorm - 0.45) * 2.1277, 0.0, 1.0));
	} else if (v.v_shapeType < 2.5) {
		// Crisp, compact hexagonal aperture ghost with coated rim highlight.
		float hd = sunLensFlareHexDist(v.v_local * 0.60);
		float hexMask = clamp((0.50 - hd) * 20.0, 0.0, 1.0);
		float hexRim = 0.65 + 0.65 * clamp((hd - 0.28) * 5.5556, 0.0, 1.0);
		shape = hexMask * hexRim * 0.44;
	} else {
		// Pinpoint specular sparkle along the optical axis (polynomial falloff).
		float dotT = max(1.0 - dot(v.v_local, v.v_local), 0.0);
		shape = dotT * dotT * dotT * 0.45;
	}

	if (shape <= 0.0) {
		discard;
	}
	gl_FragColor = vec4(v.v_color * shape, 1.0);
}

#endif
