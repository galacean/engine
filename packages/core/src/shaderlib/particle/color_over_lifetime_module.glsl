
#if defined(RENDERER_COL_GRADIENT) || defined(RENDERER_COL_RANDOM_GRADIENTS)
    uniform vec4 renderer_COLMaxGradientColor[4]; // x:time y:r z:g w:b
    uniform vec2 renderer_COLMaxGradientAlpha[4]; // x:time y:alpha

    #ifdef RANDOM_COLOR_OVER_LIFETIME
        uniform vec4 renderer_COLMinGradientColor[4]; // x:time y:r z:g w:b
        uniform vec2 renderer_COLMinGradientAlpha[4]; // x:time y:alpha
    #endif

    uniform vec4 renderer_COLGradientKeysMaxTime; // x: minColorKeysMaxTime, y: minAlphaKeysMaxTime, z: maxColorKeysMaxTime, w: maxAlphaKeysMaxTime
#endif



#if defined(RENDERER_COL_GRADIENT) || defined(RENDERER_COL_RANDOM_GRADIENTS)
    vec4 evaluateParticleGradient(in vec4 colorKeys[4], in float colorKeysMaxTime, in vec2 alphaKeys[4], in float alphaKeysMaxTime, in float normalizedAge){
        vec4 value;
        float alphaAge = min(normalizedAge, alphaKeysMaxTime);
        for(int i = 0; i < 4; i++){
            vec2 key = alphaKeys[i];
            float time = key.x;
            if(alphaAge <= time){
                if(i == 0){
                    value.a = colorKeys[0].y;
                }
                else {
                    vec2 lastKey = alphaKeys[i-1];
                    float lastTime = lastKey.x;
                    float age = (alphaAge - lastTime) / (time - lastTime);
                    value.a = mix(lastKey.y, key.y, age);
                }
                break;
            }
        }
        
        float colorAge = min(normalizedAge, colorKeysMaxTime);
        for(int i = 0; i < 4; i++){
            vec4 key = colorKeys[i];
            float time = key.x;
            if(colorAge <= time){
                if(i == 0){
                    value.rgb = colorKeys[0].yzw;
                }
                else {
                    vec4 lastKey = colorKeys[i-1];
                    float lastTime = lastKey.x;
                    float age = (colorAge - lastTime) / (time-lastTime);
                    value.rgb = mix(lastKey.yzw, key.yzw, age);
                }
                break;
            }
        }
        return value;
    }
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
