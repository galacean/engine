uniform vec4 material_EmissiveColor;
uniform vec4 material_BaseColor;
uniform vec4 material_SpecularColor;
uniform float material_Shininess;
uniform float material_NormalIntensity;
uniform float material_AlphaCutoff;

#ifdef MATERIAL_HAS_EMISSIVETEXTURE
    uniform sampler2D material_EmissiveTexture;
#endif

#ifdef MATERIAL_HAS_BASETEXTURE
    uniform sampler2D material_BaseTexture;
#endif

#ifdef MATERIAL_HAS_SPECULAR_TEXTURE
    uniform sampler2D material_SpecularTexture;
#endif

#ifdef MATERIAL_HAS_NORMALTEXTURE
    uniform sampler2D material_NormalTexture;
#endif
