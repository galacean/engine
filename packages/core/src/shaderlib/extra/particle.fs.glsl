#include <common>

varying vec4 v_Color;
varying vec2 v_TextureCoordinate;
uniform sampler2D material_BaseTexture;
uniform vec4 material_BaseColor;
 
uniform mediump vec3 material_EmissiveColor;
#ifdef MATERIAL_HAS_EMISSIVETEXTURE
    uniform sampler2D material_EmissiveTexture;
#endif

#ifdef RENDERER_MODE_MESH
	varying vec4 v_MeshColor;
#endif

void main() {
	vec4 color = material_BaseColor * v_Color;

	#ifdef RENDERER_MODE_MESH
		color *= v_MeshColor;
	#endif

	#ifdef MATERIAL_HAS_BASETEXTURE
		color *= texture2DSRGB(material_BaseTexture, v_TextureCoordinate);
	#endif
	
	// Emissive
	vec3 emissiveRadiance = material_EmissiveColor;
	#ifdef MATERIAL_HAS_EMISSIVETEXTURE
		emissiveRadiance *= texture2DSRGB(material_EmissiveTexture, v_TextureCoordinate).rgb;
	#endif

	color.rgb += emissiveRadiance;


	gl_FragColor = outputSRGBCorrection(color);
}