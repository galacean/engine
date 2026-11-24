#ifndef VERTEX_INCLUDE
#define VERTEX_INCLUDE

#include "ShaderLibrary/PBR/CommonPBR.glsl"

struct VertexInputs{
    vec4 positionOS;
    vec3 positionWS;

    #if SCENE_FOG_MODE != 0
        vec3 positionVS;
    #endif

    #ifdef NEED_VERTEX_NORMAL
        vec3 normalWS;
        #ifdef NEED_VERTEX_TANGENT
            vec3 tangentWS;
            vec3 bitangentWS;
            #ifdef MATERIAL_ENABLE_ANISOTROPY
                float tangentSign;
            #endif
        #endif
    #endif
};

vec4 material_TilingOffset;
vec2 getUV0(Attributes attributes){
    vec2 uv0 = vec2(0);

    #ifdef RENDERER_HAS_UV
        uv0 = attributes.TEXCOORD_0;
    #endif

    return uv0 * material_TilingOffset.xy + material_TilingOffset.zw;
}

VertexInputs getVertexInputs(Attributes attributes){
    VertexInputs inputs;
    vec4 position = vec4(attributes.POSITION, 1.0);

    // Match calculateBlendShape's attribute gates even when no tangent varying is needed.
    #ifdef RENDERER_HAS_NORMAL
        vec3 normal = vec3( attributes.NORMAL );
        #ifdef RENDERER_HAS_TANGENT
            vec4 tangent = vec4( attributes.TANGENT );
        #endif
    #endif


    // BlendShape
    #ifdef RENDERER_HAS_BLENDSHAPE
        calculateBlendShape(attributes, position
        #ifdef RENDERER_HAS_NORMAL
            ,normal
             #ifdef RENDERER_HAS_TANGENT
                ,tangent
            #endif
        #endif
        );
    #endif

    // Skin
    #ifdef RENDERER_HAS_SKIN
        mat4 skinMatrix = getSkinMatrix(attributes);
        position = skinMatrix * position;

        #ifdef NEED_VERTEX_NORMAL
            mat3 skinNormalMatrix = inverse(mat3(skinMatrix));
            normal = normal * skinNormalMatrix;
            #ifdef NEED_VERTEX_TANGENT
                tangent.xyz = mat3(skinMatrix) * tangent.xyz;
                // The blended skin matrix can reflect even when individual joints do not.
                tangent.w *= dot( cross( skinMatrix[0].xyz, skinMatrix[1].xyz ), skinMatrix[2].xyz ) < 0.0 ? -1.0 : 1.0;
            #endif
        #endif
    #endif

    // TBN world space
    #ifdef NEED_VERTEX_NORMAL
        mat3 normalMat = mat3(renderer_NormalMat);
        inputs.normalWS = normalize( normalMat * normal );

        #ifdef NEED_VERTEX_TANGENT
            vec3 tangentWS = mat3(renderer_ModelMat) * tangent.xyz;
            // Keep zero tangents finite for fragment-stage frame recovery.
            float tangentLengthSquared = dot(tangentWS, tangentWS);
            if (tangentLengthSquared > 0.0) {
                tangentWS *= inversesqrt(tangentLengthSquared);
            }
            float worldHandedness = dot( cross( renderer_ModelMat[0].xyz, renderer_ModelMat[1].xyz ), renderer_ModelMat[2].xyz ) < 0.0 ? -1.0 : 1.0;
            vec3 bitangentWS = cross( inputs.normalWS, tangentWS ) * ( tangent.w * worldHandedness );

            inputs.tangentWS = tangentWS;
            inputs.bitangentWS = bitangentWS;
            #ifdef MATERIAL_ENABLE_ANISOTROPY
                inputs.tangentSign = tangent.w * worldHandedness;
            #endif
        #endif
    #endif


    inputs.positionOS = position;
    vec4 positionWS = renderer_ModelMat * position;
    inputs.positionWS = positionWS.xyz / positionWS.w;

     #if SCENE_FOG_MODE != 0
        vec4 positionVS = renderer_MVMat * position;
        inputs.positionVS = positionVS.xyz / positionVS.w;
    #endif

    return inputs;
}

#endif
