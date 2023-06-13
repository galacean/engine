varying vec4 v_Color;
varying vec2 v_TextureCoordinate;
uniform sampler2D u_baseTexture;
uniform vec4 u_baseColor;

#ifdef MESH
	varying vec4 v_MeshColor;
#endif

void main() {
	#ifdef MESH
		gl_FragColor=v_MeshColor;
	#else
		gl_FragColor=vec4(1.0);	
	#endif
		
	#ifdef BASETEXTURE
		gl_FragColor*=texture2D(u_baseTexture,v_TextureCoordinate)*u_baseColor*2.0*v_Color;
	#else
		gl_FragColor*=u_baseColor*2.0*v_Color;
	#endif
}