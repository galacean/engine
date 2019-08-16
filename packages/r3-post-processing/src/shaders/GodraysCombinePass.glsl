precision highp float;
varying vec2 v_uv;

uniform sampler2D s_sourceRT;
uniform sampler2D s_godRays;
uniform vec2 u_sunScreen;
uniform float u_godRayIntensity;
uniform float u_godRayLong;
uniform vec3 u_color;

void main() {

  vec2 delta = u_sunScreen - v_uv;
  float dist = length( delta );
  float d2 = dist;

  float value = d2*u_godRayLong;

  float godrays = 1.0 - 2.0*texture2D( s_godRays, v_uv ).r;

  gl_FragColor = texture2D(s_sourceRT, v_uv) + u_godRayIntensity*cos(d2)*cos(d2) * vec4(smoothstep(0.0, 1.0, godrays-value) * u_color.r, smoothstep(0.0, 1.0, godrays-value) * u_color.g, smoothstep(0.0, 1.0, godrays-value)  * u_color.b, 0);

}  
             