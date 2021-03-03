uniform vec4 u_emissiveColor;
uniform vec4 u_diffuseColor;
uniform vec4 u_specularColor;
uniform float u_shininess;
uniform float u_normalIntensity;

#ifdef O3_EMISSIVE_TEXTURE
    uniform sampler2D u_emissiveTexture;
#endif

#ifdef O3_DIFFUSE_TEXTURE
    uniform sampler2D u_diffuseTexture;
#endif

#ifdef O3_SPECULAR_TEXTURE
    uniform sampler2D u_specularTexture;
#endif

#ifdef O3_NORMAL_TEXTURE
    uniform sampler2D u_normalTexture;
#endif
