varying vec2 v_uv;

#ifdef RENDERER_HAS_UV1
    varying vec2 v_uv1;
#endif

#ifdef MATERIAL_HAS_LIGHTMAP
    varying vec2 v_lightmapUV;
#endif