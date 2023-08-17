
#if defined(RENDERER_COL_GRADIENT) || defined(RENDERER_COL_RANDOM_GRADIENTS)
    uniform vec4 renderer_COLMaxGradientColor[4]; // x:time y:r z:g w:b
    uniform vec2 renderer_COLMaxGradientAlpha[4]; // x:time y:alpha

    #ifdef RANDOM_COLOR_OVER_LIFETIME
        uniform vec4 renderer_COLMinGradientColor[4]; // x:time y:r z:g w:b
        uniform vec2 renderer_COLMinGradientAlpha[4]; // x:time y:alpha
    #endif
#endif



#if defined(RENDERER_COL_GRADIENT) || defined(RENDERER_COL_RANDOM_GRADIENTS)
    vec4 evaluateParticleGradient(in vec2 alphaKeys[4], in vec4 colorKeys[4], in float normalizedAge){
        vec4 value;
        for(int i = 1; i < 4; i++){
            vec2 key = alphaKeys[i];
            float time = key.x;
            if(time >= normalizedAge){
                vec2 lastKey = alphaKeys[i-1];
                float lastTime = lastKey.x;
                float age = (normalizedAge - lastTime) / (time - lastTime);
                value.a = mix(lastKey.y, key.y, age);
                break;
            }
        }
        
        for(int i = 1; i < 4 ; i++){
            vec4 key = colorKeys[i];
            float time = key.x;
            if(time >= normalizedAge){
                vec4 lastKey = colorKeys[i-1];
                float lastTime = lastKey.x;
                float age = (normalizedAge - lastTime) / (time-lastTime);
                value.rgb = mix(lastKey.yzw, key.yzw, age);
                break;
            }
        }
        return value;
    }
#endif


vec4 computeParticleColor(in vec4 color, in float normalizedAge) {
    #ifdef COLOR_OVER_LIFETIME
        color *= evaluateParticleGradient(renderer_COLMaxGradientAlpha, renderer_COLMaxGradientColor, normalizedAge);
    #endif

    #ifdef RANDOM_COLOR_OVER_LIFETIME
        color *= mix(evaluateParticleGradient(renderer_COLMinGradientAlpha, renderer_COLMinGradientColor, normalizedAge), evaluateParticleGradient(renderer_COLMaxGradientAlpha, renderer_COLMaxGradientColor, normalizedAge), a_Random0.y);
    #endif
    return color;
}
