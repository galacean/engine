#include <common>
#include <common_vert>
#include <blendShape_input>
#include <normal_share>
uniform mat4 camera_VPMat;
uniform vec2 scene_ShadowBias; // x: depth bias, y: normal bias
uniform vec3 scene_LightDirection;

vec3 applyShadowBias(vec3 positionWS) {
    positionWS -= scene_LightDirection * scene_ShadowBias.x;
    return positionWS;
}

vec3 applyShadowNormalBias(vec3 positionWS, vec3 normalWS) {
    float invNdotL = 1.0 - clamp(dot(-scene_LightDirection, normalWS), 0.0, 1.0);
    float scale = invNdotL * scene_ShadowBias.y;
    positionWS += normalWS * vec3(scale);
    return positionWS;
}

void main() {

    #include <begin_position_vert>
    #include <begin_normal_vert>
    #include <blendShape_vert>
    #include <skinning_vert>
    
    vec4 positionWS = renderer_ModelMat * position;

    positionWS.xyz = applyShadowBias(positionWS.xyz);
    #ifndef MATERIAL_OMIT_NORMAL
        #ifdef RENDERER_HAS_NORMAL
            vec3 normalWS = normalize( mat3(renderer_NormalMat) * normal );
            positionWS.xyz = applyShadowNormalBias(positionWS.xyz, normalWS);
        #endif
    #endif


    vec4 positionCS = camera_VPMat * positionWS;
    positionCS.z = max(positionCS.z, -1.0);// clamp to min ndc z

    gl_Position = positionCS;

}
