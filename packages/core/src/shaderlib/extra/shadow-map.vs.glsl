#include <common>
#include <common_vert>
#include <blendShape_input>
#include <normal_share>
uniform mat4 u_VPMat;
uniform vec2 u_shadowBias; // x: depth bias, y: normal bias
uniform vec3 u_lightDirection;

vec3 applyShadowBias(vec3 positionWS) {
    positionWS -= u_lightDirection * u_shadowBias.x;
    return positionWS;
}

vec3 applyShadowNormalBias(vec3 positionWS, vec3 normalWS) {
    float invNdotL = 1.0 - clamp(dot(-u_lightDirection, normalWS), 0.0, 1.0);
    float scale = invNdotL * u_shadowBias.y;
    positionWS += normalWS * vec3(scale);
    return positionWS;
}

void main() {

    #include <begin_position_vert>
    #include <begin_normal_vert>
    #include <blendShape_vert>
    #include <skinning_vert>
    
    vec4 positionWS = u_modelMat * position;

    positionWS.xyz = applyShadowBias(positionWS.xyz);
    #ifndef OMIT_NORMAL
        #ifdef O3_HAS_NORMAL
            vec3 normalWS = normalize( mat3(u_normalMat) * normal );
            positionWS.xyz = applyShadowNormalBias(positionWS.xyz, normalWS);
        #endif
    #endif


    vec4 positionCS = u_VPMat * positionWS;
    positionCS.z = max(positionCS.z, -1.0);// clamp to min ndc z

    gl_Position = positionCS;

}
