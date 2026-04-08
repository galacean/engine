#ifndef UV_INCLUDED
#define UV_INCLUDED

varying vec2 v_uv;

#ifdef RENDERER_HAS_UV1
    varying vec2 v_uv1;
#endif

vec4 material_TilingOffset;

void initUV(out vec2 uv, out vec2 uv1) {
    #ifdef RENDERER_HAS_UV
        uv = TEXCOORD_0;
    #else
        uv = vec2(0.0, 0.0);
    #endif

    #ifdef RENDERER_HAS_UV1
        uv1 = TEXCOORD_1;
    #endif

    #ifdef MATERIAL_NEED_TILING_OFFSET
        uv = uv * material_TilingOffset.xy + material_TilingOffset.zw;
    #endif
}

#endif
