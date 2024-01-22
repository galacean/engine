#ifdef RENDERER_HAS_UV
    v.v_uv = attr.TEXCOORD_0;
#else
    // may need this calculate normal
    v.v_uv = vec2( 0.0, 0.0 );
#endif

#ifdef RENDERER_HAS_UV1
    v.v_uv1 = attr.TEXCOORD_1;
#endif

#ifdef MATERIAL_NEED_TILING_OFFSET
    v.v_uv = v.v_uv * material_TilingOffset.xy + material_TilingOffset.zw;
#endif