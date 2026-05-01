#ifndef FORWARD_PASS_BLINNPHONG_INCLUDED
#define FORWARD_PASS_BLINNPHONG_INCLUDED

#include "ShaderLibrary/Common/Common.glsl"
#include "ShaderLibrary/Common/Fog.glsl"
#include "ShaderLibrary/Common/Transform.glsl"
#include "ShaderLibrary/Common/Attributes.glsl"
#include "ShaderLibrary/Skin/Skin.glsl"
#include "ShaderLibrary/Skin/BlendShape.glsl"
#include "ShaderLibrary/Shadow/Shadow.glsl"
#include "ShaderLibrary/BlinnPhong/MobileBlinnPhong.glsl"
#include "ShaderLibrary/Common/ViewDirection.glsl"

// Vertex stage carries mesh tangent through to fragment only when BlinnPhong
// samples a normal map AND the mesh provides a tangent attribute. Otherwise
// fragment derives the tangent frame from dFdx/dFdy.
#if defined(RENDERER_HAS_NORMAL) && defined(RENDERER_HAS_TANGENT) && defined(MATERIAL_HAS_NORMALTEXTURE)
    #define NEED_VERTEX_TANGENT
#endif

vec4 material_TilingOffset;

struct Varyings {
    vec2 v_uv;

    #ifdef RENDERER_ENABLE_VERTEXCOLOR
        vec4 v_color;
    #endif

    vec3 v_pos;

    #if SCENE_FOG_MODE != 0
        vec3 v_positionVS;
    #endif

    #ifdef RENDERER_HAS_NORMAL
        vec3 v_normalWS;
        #ifdef NEED_VERTEX_TANGENT
            vec3 v_tangentWS;
            vec3 v_bitangentWS;
        #endif
    #endif

    #if defined(NEED_CALCULATE_SHADOWS) && (SCENE_SHADOW_CASCADED_COUNT == 1)
        vec3 v_shadowCoord;
    #endif
};


Varyings BlinnPhongVertex(Attributes attr) {
    Varyings v;

    vec4 position = vec4(attr.POSITION, 1.0);

    #ifdef RENDERER_HAS_NORMAL
        vec3 normal = attr.NORMAL;
        #ifdef RENDERER_HAS_TANGENT
            vec4 tangent = attr.TANGENT;
        #endif
    #endif

    // Blend shape
    #ifdef RENDERER_HAS_BLENDSHAPE
        calculateBlendShape(attr, position
            #ifdef RENDERER_HAS_NORMAL
                , normal
                #ifdef RENDERER_HAS_TANGENT
                    , tangent
                #endif
            #endif
        );
    #endif

    // Skinning
    #ifdef RENDERER_HAS_SKIN
        mat4 skinMatrix = getSkinMatrix(attr);
        position = skinMatrix * position;
        #if defined(RENDERER_HAS_NORMAL) && !defined(MATERIAL_OMIT_NORMAL)
            mat3 skinNormalMatrix = INVERSE_MAT(mat3(skinMatrix));
            normal = normal * skinNormalMatrix;
            #ifdef NEED_VERTEX_TANGENT
                tangent.xyz = tangent.xyz * skinNormalMatrix;
            #endif
        #endif
    #endif

    // UV
    #ifdef RENDERER_HAS_UV
        v.v_uv = attr.TEXCOORD_0;
    #else
        v.v_uv = vec2(0.0);
    #endif
    #ifdef MATERIAL_NEED_TILING_OFFSET
        v.v_uv = v.v_uv * material_TilingOffset.xy + material_TilingOffset.zw;
    #endif

    // Vertex color
    #ifdef RENDERER_ENABLE_VERTEXCOLOR
        v.v_color = attr.COLOR_0;
    #endif

    // Normal
    #if defined(RENDERER_HAS_NORMAL) && !defined(MATERIAL_OMIT_NORMAL)
        v.v_normalWS = normalize( mat3(renderer_NormalMat) * normal );
        #ifdef NEED_VERTEX_TANGENT
            vec3 tangentWS = normalize( mat3(renderer_NormalMat) * tangent.xyz );
            v.v_tangentWS = tangentWS;
            v.v_bitangentWS = cross(v.v_normalWS, tangentWS) * tangent.w;
        #endif
    #endif

    // World position
    vec4 worldPos = renderer_ModelMat * position;
    v.v_pos = worldPos.xyz / worldPos.w;

    // Clip position
    gl_Position = renderer_MVPMat * position;

    // Shadow
    #if defined(NEED_CALCULATE_SHADOWS) && (SCENE_SHADOW_CASCADED_COUNT == 1)
        v.v_shadowCoord = getShadowCoord(v.v_pos);
    #endif

    // Fog
    #if SCENE_FOG_MODE != 0
        v.v_positionVS = (renderer_MVMat * position).xyz;
    #endif

    return v;
}


void BlinnPhongFragment(Varyings v) {
    vec4 ambient, emission, diffuse, specular;
    initBlinnPhongMaterial(v.v_uv, ambient, emission, diffuse, specular);

    // Apply vertex color
    #ifdef RENDERER_ENABLE_VERTEXCOLOR
        diffuse *= v.v_color;
    #endif

    // Normal
    vec3 N;
    #ifdef RENDERER_HAS_NORMAL
        N = normalize(v.v_normalWS);
        #ifdef MATERIAL_HAS_NORMALTEXTURE
            #ifdef NEED_VERTEX_TANGENT
                mat3 tbn = mat3(v.v_tangentWS, v.v_bitangentWS, v.v_normalWS);
            #else
                mat3 tbn = getTBNByDerivatives(v.v_uv, N, v.v_pos, gl_FrontFacing);
            #endif
            N = getNormalByNormalTexture(tbn, material_NormalTexture, material_NormalIntensity, v.v_uv, gl_FrontFacing);
        #else
            N *= float(gl_FrontFacing) * 2.0 - 1.0;
        #endif
    #else
        N = vec3(0.0, 0.0, 1.0);
    #endif

    // View direction
    vec3 V = getViewDirection(camera_Position, camera_Forward, v.v_pos);

    // Shadow
    float shadowAttenuation = 1.0;
    #if defined(SCENE_DIRECT_LIGHT_COUNT) && defined(NEED_CALCULATE_SHADOWS)
        #if SCENE_SHADOW_CASCADED_COUNT == 1
            vec3 shadowCoord = v.v_shadowCoord;
        #else
            vec3 shadowCoord = getShadowCoord(v.v_pos);
        #endif
        shadowAttenuation *= sampleShadowMap(v.v_pos, shadowCoord);
    #endif

    // Lighting
    calculateBlinnPhongLighting(N, V, v.v_pos, shadowAttenuation, diffuse, specular);

    // Alpha cutoff
    #ifdef MATERIAL_IS_ALPHA_CUTOFF
        if (diffuse.a < material_AlphaCutoff) {
            discard;
        }
    #endif

    vec4 color = emission + ambient + diffuse + specular;

    #ifdef MATERIAL_IS_TRANSPARENT
        color.a = diffuse.a;
    #else
        color.a = 1.0;
    #endif

    // Fog
    #if SCENE_FOG_MODE != 0
        color = fog(color, v.v_positionVS);
    #endif

    gl_FragColor = color;
}


#endif
