precision mediump float;

//-- varying
varying vec2 v_uv;
varying vec3 v_normal;
varying vec3 v_viewDir;

//-- uniforms
uniform sampler2D u_hatch0;
uniform sampler2D u_hatch1;
uniform sampler2D u_hatch2;
uniform sampler2D u_hatch3;
uniform sampler2D u_hatch4;
uniform sampler2D u_hatch5;

struct DirectLight {
  vec3 color;
  float intensity;
  vec3 direction;
};
uniform DirectLight u_mainLight;
  
void main() {
  
  // lighting
  vec3 N = normalize(v_normal);
  vec3 V = normalize(v_viewDir);

  float d =  max(dot(N, -u_mainLight.direction), 0.0)*u_mainLight.intensity;
  
  //vec3 halfDir = normalize(-V - u_mainLight.direction);
  //float s = pow(clamp(dot(N,halfDir), 0.0, 1.0), 64.0)*u_mainLight.intensity;
  
  // weights
  vec3 weights0 = vec3(0, 0, 0);
	vec3 weights1 = vec3(0, 0, 0);
				
	float H = d * 7.0;
				
	if (H > 6.0) {
		// white
	} else if (H > 5.5) {
    weights0.x = H - 5.0;
	} else if (H > 4.0) {
		weights0.x = H - 4.0;
		weights0.y = 1.0 - weights0.x;
	} else if (H > 3.0) {
		weights0.y = H - 3.0;
		weights0.z = 1.0 - weights0.y;
	} else if (H > 2.0) {
		weights0.z = H - 2.0;
		weights1.x = 1.0 - weights0.z;
	} else if (H > 1.0) {
	  weights1.x = H - 1.0;
		weights1.y = 1.0 - weights1.x;
	} else {
		weights1.y = H;
		weights1.z = 1.0 - weights1.y;
	}
        
  // shading
  vec4 h0 = texture2D(u_hatch0, v_uv)*weights0.x;
  vec4 h1 = texture2D(u_hatch1, v_uv)*weights0.y;
  vec4 h2 = texture2D(u_hatch2, v_uv)*weights0.z;
  vec4 h3 = texture2D(u_hatch3, v_uv)*weights1.x;
  vec4 h4 = texture2D(u_hatch4, v_uv)*weights1.y;
  vec4 h5 = texture2D(u_hatch5, v_uv)*weights1.z;

  vec4 w = vec4(1.0, 1.0, 1.0, 1.0)*(1.0-weights0.x-weights0.y-weights0.z-weights1.x-weights1.y-weights1.z);
  gl_FragColor = h0+h1+h2+h3+h4+h5+w;
}