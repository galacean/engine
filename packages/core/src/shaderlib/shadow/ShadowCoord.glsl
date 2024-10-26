
uniform mat4 scene_ShadowMatrices[SCENE_SHADOW_CASCADED_COUNT + 1];
uniform vec4 scene_ShadowSplitSpheres[4];

mediump int computeCascadeIndex(vec3 positionWS) {
    vec3 fromCenter0 = positionWS - scene_ShadowSplitSpheres[0].xyz;
    vec3 fromCenter1 = positionWS - scene_ShadowSplitSpheres[1].xyz;
    vec3 fromCenter2 = positionWS - scene_ShadowSplitSpheres[2].xyz;
    vec3 fromCenter3 = positionWS - scene_ShadowSplitSpheres[3].xyz;

    mediump vec4 comparison = vec4(
        dot(fromCenter0, fromCenter0) < scene_ShadowSplitSpheres[0].w,
        dot(fromCenter1, fromCenter1) < scene_ShadowSplitSpheres[1].w,
        dot(fromCenter2, fromCenter2) < scene_ShadowSplitSpheres[2].w,
        dot(fromCenter3, fromCenter3) < scene_ShadowSplitSpheres[3].w);
    comparison.yzw = clamp(comparison.yzw - comparison.xyz,0.0,1.0);//keep the nearest
    mediump vec4 indexCoefficient = vec4(4.0,3.0,2.0,1.0);
    mediump int index = 4 - int(dot(comparison, indexCoefficient));
    return index;
}

vec3 getShadowCoord() {
    #if SCENE_SHADOW_CASCADED_COUNT == 1
        mediump int cascadeIndex = 0;
    #else
        mediump int cascadeIndex = computeCascadeIndex(v_pos);
    #endif

    #ifdef GRAPHICS_API_WEBGL2
        mat4 shadowMatrix = scene_ShadowMatrices[cascadeIndex];
    #else
        mat4 shadowMatrix;
        #if SCENE_SHADOW_CASCADED_COUNT == 4
            if (cascadeIndex == 0) {
                shadowMatrix = scene_ShadowMatrices[0];
            } else if (cascadeIndex == 1) {
                shadowMatrix = scene_ShadowMatrices[1];
            } else if (cascadeIndex == 2) {
                shadowMatrix = scene_ShadowMatrices[2];
            } else if (cascadeIndex == 3) {
                shadowMatrix = scene_ShadowMatrices[3];
            } else {
                shadowMatrix = scene_ShadowMatrices[4];
            }
        #endif
        #if SCENE_SHADOW_CASCADED_COUNT == 2
            if (cascadeIndex == 0) {
                shadowMatrix = scene_ShadowMatrices[0];
            } else if (cascadeIndex == 1) {
                shadowMatrix = scene_ShadowMatrices[1];
            } else {
                shadowMatrix = scene_ShadowMatrices[2];
            } 
        #endif
        #if SCENE_SHADOW_CASCADED_COUNT == 1
            if (cascadeIndex == 0) {
                shadowMatrix = scene_ShadowMatrices[0];
            } else  {
                shadowMatrix = scene_ShadowMatrices[1];
            } 
        #endif
    #endif

    vec4 shadowCoord = shadowMatrix * vec4(v_pos, 1.0);
    return shadowCoord.xyz;
}
