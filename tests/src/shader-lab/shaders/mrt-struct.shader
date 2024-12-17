Shader "/custom.gs" {

    SubShader "Default" {

    Pass "Pass0" {
        struct Attributes {
        vec3 POSITION;
        vec2 TEXCOORD_0;
        vec4 JOINTS_0;
        vec4 WEIGHTS_0;
        };
    
        struct Varyings {
        vec2 uv;
        };

        vec4 material_BaseColor;
        mat4 renderer_MVPMat;
    
        VertexShader = vert;
        FragmentShader = frag;

        Varyings vert(Attributes attr) {
            Varyings v;

            vec4 position = vec4(attr.POSITION, 1.0);

            gl_Position = renderer_MVPMat * position;
            v.uv = attr.TEXCOORD_0;

            return v;
        }

        struct mrt {
            layout(location = 0) vec4 fragColor0;
            layout(location = 1) vec4 fragColor1;
        };

        mrt frag(Varyings v) {
            mrt o;

            vec4 baseColor = material_BaseColor;

            o.fragColor0 = baseColor;
            o.fragColor1 = baseColor;
            return o;
        }
    }
    }
}