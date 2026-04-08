#ifndef COLOR_OVER_LIFETIME_INCLUDED
#define COLOR_OVER_LIFETIME_INCLUDED

#if defined(RENDERER_COL_GRADIENT) || defined(RENDERER_COL_RANDOM_GRADIENTS)
    vec4 renderer_COLMaxGradientColor[4]; // x:time y:r z:g w:b
    vec2 renderer_COLMaxGradientAlpha[4]; // x:time y:alpha

    #ifdef RENDERER_COL_RANDOM_GRADIENTS
        vec4 renderer_COLMinGradientColor[4]; // x:time y:r z:g w:b
        vec2 renderer_COLMinGradientAlpha[4]; // x:time y:alpha
    #endif

    vec4 renderer_COLGradientKeysMaxTime; // x: minColorKeysMaxTime, y: minAlphaKeysMaxTime, z: maxColorKeysMaxTime, w: maxAlphaKeysMaxTime
#endif


vec4 computeParticleColor(in vec4 color, in float normalizedAge) {
    #if defined(RENDERER_COL_GRADIENT) || defined(RENDERER_COL_RANDOM_GRADIENTS)
       vec4 gradientColor = evaluateParticleGradient(renderer_COLMaxGradientColor, renderer_COLGradientKeysMaxTime.z, renderer_COLMaxGradientAlpha, renderer_COLGradientKeysMaxTime.w, normalizedAge);
    #endif

    #ifdef RENDERER_COL_RANDOM_GRADIENTS
        gradientColor = mix(evaluateParticleGradient(renderer_COLMinGradientColor,renderer_COLGradientKeysMaxTime.x, renderer_COLMinGradientAlpha, renderer_COLGradientKeysMaxTime.y, normalizedAge), gradientColor, a_Random0.y);
    #endif

    #if defined(RENDERER_COL_GRADIENT) || defined(RENDERER_COL_RANDOM_GRADIENTS)
       color *= gradientColor;
    #endif

    return color;
}

#endif
