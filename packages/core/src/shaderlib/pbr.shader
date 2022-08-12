VertexShader "vert"
{
    #include <common>
    #include <common_vert>
    #include <blendShape_input>
    #include <uv_share>
    #include <color_share>
    #include <normal_share>
    #include <worldpos_share>
    #include <shadow_share>
    #include <fog_share>

    void main() {
        #include <begin_position_vert>
        #include <begin_normal_vert>
        #include <blendShape_vert>
        #include <skinning_vert>
        #include <uv_vert>
        #include <color_vert>
        #include <normal_vert>
        #include <worldpos_vert>
        #include <shadow_vert>
        #include <position_vert>

        #include <fog_vert>
    }
}

FragmentShader "frag"
{
    #define IS_METALLIC_WORKFLOW
    #include <common>
    #include <common_frag>

    #include <fog_share>

    #include <uv_share>
    #include <normal_share>
    #include <color_share>
    #include <worldpos_share>

    #include <light_frag_define>


    #include <pbr_frag_define>
    #include <pbr_helper>

    void main() {
        #include <pbr_frag>
        #include <fog_frag>
    }
}


Shader "PBR"
{
 UsePass "PBR"
 Pass "forward"
 {
    /** Blend state. */
    readonly blendState: BlendState = new BlendState();
    /** Depth state. */
    readonly depthState: DepthState = new DepthState();
    /** Stencil state. */
    readonly stencilState: StencilState = new StencilState();
    /** Raster state. */
    readonly rasterState: RasterState = new RasterState();

    VertexShader vert
    FragmentShader frag
 }
}