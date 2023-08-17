
#if defined(RENDERER_COL_GRADIENT) || defined(RENDERER_COL_RANDOM_GRADIENTS)
    uniform vec4 renderer_COLMaxGradientColor[4]; // x:time y:r z:g w:b
    uniform vec2 renderer_COLMaxGradientAlpha[4]; // x:time y:alpha

    #ifdef RANDOM_COLOR_OVER_LIFETIME
        uniform vec4 renderer_COLMinGradientColor[4]; // x:time y:r z:g w:b
        uniform vec2 renderer_COLMinGradientAlpha[4]; // x:time y:alpha
    #endif

    uniform ivec4 renderer_COLGradientKeysLength; // x: minColorKeysLength, y: minAlphaKeysLength, z: maxColorKeysLength, w: maxAlphaKeysLength
#endif



#if defined(RENDERER_COL_GRADIENT) || defined(RENDERER_COL_RANDOM_GRADIENTS)
    vec4 evaluateParticleGradient(in vec4 colorKeys[4], in int colorKeyCount, in vec2 alphaKeys[4], in int alphaKeyCount, in float normalizedAge){
        vec4 value;
        for(int i = 0; i < 4; i++){
            vec2 key = alphaKeys[i];
            float time = key.x;
            if(normalizedAge <= time){
                if(i == 0){
                    value.a = colorKeys[0].y;
                }
                else {
                    vec2 lastKey = alphaKeys[i-1];
                    float lastTime = lastKey.x;
                    float age = (normalizedAge - lastTime) / (time - lastTime);
                    value.a = mix(lastKey.y, key.y, age);
                }
                break;
            }
            else if(i == colorKeyCount - 1){
                value.a = colorKeys[i].y;
                break;
            }
        }
        
        for(int i = 0; i < 4; i++){
            vec4 key = colorKeys[i];
            float time = key.x;
            if(normalizedAge <= time){
                if(i == 0){
                    value.rgb = colorKeys[0].yzw;
                }
                else {
                    vec4 lastKey = colorKeys[i-1];
                    float lastTime = lastKey.x;
                    float age = (normalizedAge - lastTime) / (time-lastTime);
                    value.rgb = mix(lastKey.yzw, key.yzw, age);
                }
                break;
            }
            else if(i == colorKeyCount - 1){
                value.rgb = colorKeys[i].yzw;
                break;
            }
        }
        return value;
    }
#endif


vec4 computeParticleColor(in vec4 color, in float normalizedAge) {
    #ifdef RENDERER_COL_GRADIENT
        color *= evaluateParticleGradient(renderer_COLMaxGradientColor, renderer_COLGradientKeysLength.z, renderer_COLMaxGradientAlpha, renderer_COLGradientKeysLength.w, normalizedAge);
    #endif

    #ifdef RENDERER_COL_RANDOM_GRADIENTS
        color *= mix(evaluateParticleGradient(renderer_COLMinGradientColor,renderer_COLGradientKeysLength.x,renderer_COLMinGradientAlpha, renderer_COLGradientKeysLength.y, normalizedAge), evaluateParticleGradient(renderer_COLMaxGradientColor, renderer_COLGradientKeysLength.z, renderer_COLMaxGradientAlpha, renderer_COLGradientKeysLength.w, normalizedAge), a_Random0.y);
    #endif
    return color;
}
