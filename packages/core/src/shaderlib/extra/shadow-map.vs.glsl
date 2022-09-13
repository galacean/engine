#include <common_vert>
#include <blendShape_input>
#include <normal_share>
uniform mat4 u_lightViewProjMat;
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
    #include <normal_vert>
    vec4 temp_pos = u_modelMat * position;
    vec3 v_pos = temp_pos.xyz / temp_pos.w;

    v_pos = applyShadowBias(v_pos);
    #ifndef OMIT_NORMAL
        #ifdef O3_HAS_NORMAL
            v_pos = applyShadowNormalBias(v_pos, v_normal);
        #endif
    #endif

    gl_Position = u_lightViewProjMat * vec4(v_pos, 1.0);

}
