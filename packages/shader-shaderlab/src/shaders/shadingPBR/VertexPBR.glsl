#ifndef VERTEX_INCLUDE
#define VERTEX_INCLUDE

#include "Transform.glsl"
#include "Skin.glsl"
#include "BlendShape.glsl"
#include "Shadow.glsl"


struct VertexInputs{
    vec4 positionOS;
    vec3 positionWS;

    #if SCENE_FOG_MODE != 0
        vec3 positionVS;
    #endif

    #ifdef RENDERER_HAS_NORMAL
        vec3 normalWS;
        #ifdef RENDERER_HAS_TANGENT
            vec3 tangentWS;
            vec3 bitangentWS;
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

        #if defined(RENDERER_HAS_NORMAL)
            mat3 skinNormalMatrix = INVERSE_MAT(mat3(skinMatrix));
            normal = normal * skinNormalMatrix;
            #ifdef RENDERER_HAS_TANGENT
                tangent.xyz = tangent.xyz * skinNormalMatrix;
            #endif
        #endif
    #endif

    // TBN world space
    #ifdef RENDERER_HAS_NORMAL
        inputs.normalWS = normalize( mat3(renderer_NormalMat) * normal );

        #ifdef RENDERER_HAS_TANGENT
            vec3 tangentWS = normalize( mat3(renderer_NormalMat) * tangent.xyz );
            vec3 bitangentWS = cross( inputs.normalWS, tangentWS ) * tangent.w;

            inputs.tangentWS = tangentWS;
            inputs.bitangentWS = bitangentWS;
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