varying vec4 v_Color;
varying vec2 v_TextureCoordinate;
uniform sampler2D material_BaseTexture;
uniform vec4 material_BaseColor;

#ifdef MESH
	varying vec4 v_MeshColor;
#endif

void main() {
	#ifdef MESH
		gl_FragColor = v_MeshColor;
	#else
		gl_FragColor = vec4(1.0);	
	#endif
		
	#ifdef MATERIAL_HAS_BASETEXTURE
		gl_FragColor *= texture2D(material_BaseTexture,v_TextureCoordinate) * material_BaseColor * 2.0 * v_Color;
	#else
		gl_FragColor *= material_BaseColor*2.0*v_Color;
	#endif
}