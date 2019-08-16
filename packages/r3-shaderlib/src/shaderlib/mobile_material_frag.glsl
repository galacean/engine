uniform float u_shininess;
uniform vec4 u_ambientLight;

#ifdef R3_EMISSION_TEXTURE

uniform sampler2D u_emission;

#else

uniform vec4 u_emission;

#endif

#ifdef R3_AMBIENT_TEXTURE

uniform sampler2D u_ambient;

#else

uniform vec4 u_ambient;

#endif

#ifdef R3_DIFFUSE_TEXTURE

uniform sampler2D u_diffuse;

#else

uniform vec4 u_diffuse;

#endif

#ifdef R3_SPECULAR_TEXTURE

uniform sampler2D u_specular;

#else

uniform vec4 u_specular;

#endif
