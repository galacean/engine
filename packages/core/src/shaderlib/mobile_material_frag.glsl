uniform vec4 u_emissiveColor;
uniform vec4 u_baseColor;
uniform vec4 u_specularColor;
uniform float u_shininess;
uniform float u_normalIntensity;
uniform float u_alphaCutoff;

#ifdef EMISSIVETEXTURE
    uniform sampler2D u_emissiveTexture;
#endif

#ifdef BASETEXTURE
    uniform sampler2D u_baseTexture;
#endif

#ifdef O3_SPECULAR_TEXTURE
    uniform sampler2D u_specularTexture;
#endif

#ifdef NORMALTEXTURE
    uniform sampler2D u_normalTexture;
#endif
