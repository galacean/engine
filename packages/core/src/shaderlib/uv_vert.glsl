#ifdef RENDERER_HAS_UV
    v_uv = TEXCOORD_0;
#else
    // may need this calculate normal
    v_uv = vec2( 0., 0. );
#endif

#ifdef RENDERER_HAS_UV1
    v_uv1 = TEXCOORD_1;
#endif

#ifdef MATERIAL_NEED_TILING_OFFSET
    v_uv = v_uv * material_TilingOffset.xy + material_TilingOffset.zw;
#endif