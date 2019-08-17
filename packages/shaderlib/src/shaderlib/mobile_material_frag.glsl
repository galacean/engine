uniform float u_shininess;
uniform vec4 u_ambientLight;

#ifdef O3_EMISSION_TEXTURE

uniform sampler2D u_emission;

#else

uniform vec4 u_emission;

#endif

#ifdef O3_AMBIENT_TEXTURE

uniform sampler2D u_ambient;

#else

uniform vec4 u_ambient;

#endif

#ifdef O3_DIFFUSE_TEXTURE

uniform sampler2D u_diffuse;

#else

uniform vec4 u_diffuse;

#endif

#ifdef O3_SPECULAR_TEXTURE

uniform sampler2D u_specular;

#else

uniform vec4 u_specular;

#endif
