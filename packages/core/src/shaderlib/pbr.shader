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
       
        DepthState{
            Write {true | false};
            Test {Never | Less | Equal | LessEqual | Greater | NotEqual | GreaterEqual | Always}
        }

        StencilState{
            /** Write the reference value of the stencil buffer. */
            referenceValue 0;
            /** Specifying a bit-wise mask that is used to AND the reference value and the stored stencil value when the test is done. */
            mask 0xff;
            /** Specifying a bit mask to enable or disable writing of individual bits in the stencil planes. */
            writeMask 0xff;

            /** The comparison function of the reference value of the front face of the geometry and the current buffer storage value. */
            compareFunctionFront Always;
            /** The comparison function of the reference value of the back of the geometry and the current buffer storage value. */
            compareFunctionBack Always;
            
            /** Whether to enable stencil test. */
            enabled: boolean = false;
    
          
            
            /** specifying the function to use for front face when both the stencil test and the depth test pass. */
            passOperationFront: StencilOperation = StencilOperation.Keep;
            /** specifying the function to use for back face when both the stencil test and the depth test pass. */
            passOperationBack: StencilOperation = StencilOperation.Keep;
            /** specifying the function to use for front face when the stencil test fails. */
            failOperationFront: StencilOperation = StencilOperation.Keep;
            /** specifying the function to use for back face when the stencil test fails. */
            failOperationBack: StencilOperation = StencilOperation.Keep;
            /** specifying the function to use for front face when the stencil test passes, but the depth test fails. */
            zFailOperationFront: StencilOperation = StencilOperation.Keep;
            /** specifying the function to use for back face when the stencil test passes, but the depth test fails. */
            zFailOperationBack: StencilOperation = StencilOperation.Keep;

        }
       
       

        /** Stencil state. */
        readonly stencilState: StencilState = new StencilState();
        /** Raster state. */
        readonly rasterState: RasterState = new RasterState();

        VertexShader vert
        FragmentShader frag
    }
}