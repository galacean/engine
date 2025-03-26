#include <common>
#include <camera_declare>

#include <uv_share>
#include <normal_share>
#include <color_share>
#include <worldpos_share>

#include <light_frag_define>
#include <ShadowFragmentDeclaration>
#include <mobile_material_frag>

#include <FogFragmentDeclaration>
#include <normal_get>

void main() {

    #include <begin_mobile_frag>
    #include <begin_viewdir_frag>
    #include <mobile_blinnphong_frag>

    gl_FragColor = emission + ambient + diffuse + specular;

    #ifdef MATERIAL_IS_TRANSPARENT
        gl_FragColor.a = diffuse.a;
    #else
        gl_FragColor.a = 1.0;
    #endif

    #include <FogFragment>

    gl_FragColor = outputTransform(gl_FragColor);
}
