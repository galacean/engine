#include <common>

varying vec4 v_Color;
varying vec2 v_TextureCoordinate;
uniform sampler2D material_BaseTexture;
uniform vec4 material_BaseColor;

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
	
	gl_FragColor = outputSRGBCorrection(color);
}