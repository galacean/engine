
#ifdef COLOR_OVER_LIFETIME
    uniform vec4 u_ColorOverLifeGradientColors[4]; // x为key,yzw为Color
    uniform vec2 u_ColorOverLifeGradientAlphas[4]; // x为key,y为Alpha
    uniform vec4 u_ColorOverLifeGradientRanges;
#endif
#ifdef RANDOM_COLOR_OVER_LIFETIME
    uniform vec4 u_ColorOverLifeGradientColors[4]; // x为key,yzw为Color
    uniform vec2 u_ColorOverLifeGradientAlphas[4]; // x为key,y为Alpha
    uniform vec4 u_ColorOverLifeGradientRanges;
    uniform vec4 u_MaxColorOverLifeGradientColors[4]; // x为key,yzw为Color
    uniform vec2 u_MaxColorOverLifeGradientAlphas[4]; // x为key,y为Alpha
    uniform vec4 u_MaxColorOverLifeGradientRanges;
#endif

#if defined(COLOR_OVER_LIFETIME) || defined(RANDOM_COLOR_OVER_LIFETIME)
vec4 getColorFromGradient(in vec2 gradientAlphas[COLOR_COUNT],
    in vec4 gradientColors[COLOR_COUNT],
    in float normalizedAge, in vec4 keyRanges) {
    float alphaAge = clamp(normalizedAge, keyRanges.z, keyRanges.w);
    vec4 overTimeColor;
    for (int i = 1; i < COLOR_COUNT; i++) {
        vec2 gradientAlpha = gradientAlphas[i];
        float alphaKey = gradientAlpha.x;
        if (alphaKey >= alphaAge) {
            vec2 lastGradientAlpha = gradientAlphas[i - 1];
            float lastAlphaKey = lastGradientAlpha.x;
            float age = (alphaAge - lastAlphaKey) / (alphaKey - lastAlphaKey);
            overTimeColor.a = mix(lastGradientAlpha.y, gradientAlpha.y, age);
            break;
        }
    }

    float colorAge = clamp(normalizedAge, keyRanges.x, keyRanges.y);
    for (int i = 1; i < COLOR_COUNT; i++) {
        vec4 gradientColor = gradientColors[i];
        float colorKey = gradientColor.x;
        if (colorKey >= colorAge) {
            vec4 lastGradientColor = gradientColors[i - 1];
            float lastColorKey = lastGradientColor.x;
            float age = (colorAge - lastColorKey) / (colorKey - lastColorKey);
            overTimeColor.rgb = mix(gradientColors[i - 1].yzw, gradientColor.yzw, age);
            break;
        }
    }
    return overTimeColor;
}
#endif

vec4 computeParticleColor(in vec4 color, in float normalizedAge) {
#ifdef COLOR_OVER_LIFETIME
    color *= getColorFromGradient(u_ColorOverLifeGradientAlphas,
	u_ColorOverLifeGradientColors,
	normalizedAge, u_ColorOverLifeGradientRanges);
#endif

#ifdef RANDOM_COLOR_OVER_LIFETIME
    color *= mix(getColorFromGradient(u_ColorOverLifeGradientAlphas,
		     u_ColorOverLifeGradientColors,
		     normalizedAge, u_ColorOverLifeGradientRanges),
	getColorFromGradient(u_MaxColorOverLifeGradientAlphas,
	    u_MaxColorOverLifeGradientColors,
	    normalizedAge, u_MaxColorOverLifeGradientRanges),
	a_Random0.y);
#endif

    return color;
}
