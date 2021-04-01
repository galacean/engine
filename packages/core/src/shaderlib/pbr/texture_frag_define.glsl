#ifdef HAS_BASECOLORMAP

uniform sampler2D u_baseColorSampler;

#endif

#ifdef O3_NORMAL_TEXTURE

uniform sampler2D u_normalTexture;

#endif

#ifdef HAS_EMISSIVEMAP

uniform sampler2D u_emissiveSampler;

#endif

#ifdef HAS_METALMAP

uniform sampler2D u_metallicSampler;

#endif

#ifdef HAS_ROUGHNESSMAP

uniform sampler2D u_roughnessSampler;

#endif

#ifdef HAS_METALROUGHNESSMAP

uniform sampler2D u_metallicRoughnessSampler;

#endif


#ifdef HAS_SPECULARGLOSSINESSMAP

uniform sampler2D u_specularGlossinessSampler;

#endif

#ifdef HAS_OCCLUSIONMAP

uniform sampler2D u_occlusionSampler;

#endif

#ifdef HAS_OPACITYMAP

uniform sampler2D u_opacitySampler;

#endif

#ifdef HAS_REFLECTIONMAP

uniform samplerCube u_reflectionSampler;

#endif
