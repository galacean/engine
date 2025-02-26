// This code uses the Unity skybox-Procedural shader algorithm, developed by Unity and licensed under the Unity Companion License. 
// The original implementation can be found at unity build-in shader(DefaultResourcesExtra/Skybox-Procedural.shader)

#include <common>

const float MIE_G = -0.990;
const float MIE_G2 = 0.9801;
const float SKY_GROUND_THRESHOLD = 0.02;

uniform float material_SunSize;
uniform float material_SunSizeConvergence;
uniform vec4 scene_SunlightColor;
uniform vec3 scene_SunlightDirection;

varying vec3 v_GroundColor;
varying vec3 v_SkyColor;

#ifdef MATERIAL_SUN_HIGH_QUALITY
	varying vec3 v_Vertex;
#elif defined(MATERIAL_SUN_SIMPLE)
	varying vec3 v_RayDir;
#else
	varying float v_SkyGroundFactor;
#endif

#if defined(MATERIAL_SUN_HIGH_QUALITY)||defined(MATERIAL_SUN_SIMPLE)
	varying vec3 v_SunColor;
#endif

// Calculates the Mie phase function
float getMiePhase(float eyeCos, float eyeCos2) {
	float temp = 1.0 + MIE_G2 - 2.0 * MIE_G * eyeCos;
	temp = pow(temp, pow(material_SunSize,0.65) * 10.0);
	temp = max(temp,1.0e-4); // prevent division by zero, esp. in half precision
	temp = 1.5 * ((1.0 - MIE_G2) / (2.0 + MIE_G2)) * (1.0 + eyeCos2) / temp;
	return temp;
}

// Calculates the sun shape
float calcSunAttenuation(vec3 lightPos, vec3 ray) {
	#ifdef MATERIAL_SUN_HIGH_QUALITY
		float focusedEyeCos = pow(clamp(dot(lightPos, ray),0.0,1.0), material_SunSizeConvergence);
		return getMiePhase(-focusedEyeCos, focusedEyeCos * focusedEyeCos);
	#else //MATERIAL_SUN_SIMPLE
		vec3 delta = lightPos - ray;
		float dist = length(delta);
		float spot = 1.0 - smoothstep(0.0, material_SunSize, dist);
		return spot * spot;
	#endif
}

void main() {
	// if y > 1 [eyeRay.y < -SKY_GROUND_THRESHOLD] - ground
	// if y >= 0 and < 1 [eyeRay.y <= 0 and > -SKY_GROUND_THRESHOLD] - horizon
	// if y < 0 [eyeRay.y > 0] - sky
	vec3 col = vec3(0.0, 0.0, 0.0);

	#ifdef MATERIAL_SUN_HIGH_QUALITY
		vec3 ray = normalize(v_Vertex);
		float y = ray.y / SKY_GROUND_THRESHOLD;
	#elif defined(MATERIAL_SUN_SIMPLE) 
		vec3 ray = v_RayDir;
		float y = ray.y / SKY_GROUND_THRESHOLD;	
	#else
		float y = v_SkyGroundFactor;
	#endif

	// if we did precalculate color in vprog: just do lerp between them
	col = mix(v_SkyColor, v_GroundColor, clamp(y,0.0,1.0));

	#if defined(MATERIAL_SUN_HIGH_QUALITY)||defined(MATERIAL_SUN_SIMPLE)
		if (y < 0.0)
			col += v_SunColor * calcSunAttenuation(-scene_SunlightDirection, -ray);
	#endif


	gl_FragColor = vec4(col,1.0);

	gl_FragColor = linearToGamma(gl_FragColor);
}

