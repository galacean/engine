Shader "Effect" {
  EditorProperties {
    u_color( "Main Color", Color ) = ( 0, 1, 0, 1 );
    Header("Group A") {
      u_range( "Test Range", Range( 1, 100, 3 ) ) = 10;
      u_mode( "Mode Toggle", Boolean ) = true;
    }
    u_color1( "Main Color1", Color ) = ( 0, 1, 0, 1 );
    Collapsible("Group B") {
      u_texture( "Texture", Texture2D );
      u_texture2( "TextureCube", TextureCube );
    }
    u_color2( "Main Color2", Color ) = ( 0, 1, 0, 1 );
  }

  EditorMacros {
    HAS_TEXTURE("If has texture");
    HAS_UV("If vertex has uv", Range(1,100,2)) = 10;
  }

  SubShader "Default" {
    Pass "Pass0" {
      mat4 renderer_MVPMat;
      vec3 u_color;
      bool u_mode;
      sampler2D u_texture;

      struct a2v {
        vec4 POSITION;
        vec2 TEXCOORD_0;
      };

      struct v2f {
        vec3 v_pos;
        vec2 v_uv;
      };

      v2f vert( a2v v ) {
        v2f o;
        gl_Position = renderer_MVPMat * v.POSITION;
        o.v_pos = gl_Position.xyz;
        o.v_uv = v.TEXCOORD_0;

        return o;
      }

      void frag( v2f i ) {
        if ( u_mode ) {
            gl_FragColor = vec4( u_color, 1.0 );
        } else {
          #ifdef HAS_TEXTURE
            gl_FragColor = texture2D( u_texture, i.v_uv );
          #else
            gl_FragColor = vec4(1.0, 0.5, 0.0, 1.0);
          #endif
        }
      }

      VertexShader = vert;
      FragmentShader = frag;
    }
  }
}