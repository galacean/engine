precision highp float;
#include <depth_packing>

varying vec2 v_uv;

uniform sampler2D s_sourceRT;
uniform sampler2D s_sceneDepth;

uniform float u_zNear; // camera.zNear
uniform float u_zFar; // camera.zFar

uniform float u_textureWidth;
uniform float u_textureHeight;

uniform float u_focusDepth; 
uniform float u_focusLength;
uniform float u_focusStop;

uniform float u_dither;
uniform float u_maxBlur;

uniform float u_showFocus;

//--
const float PI = 3.1415926;
const float CoC = 0.03; //circle of confusion size in mm (35mm film = 0.03mm)
const int samples = SAMPLES; //samples on the first ring
const int rings = RINGS; //ring count
const int maxringsamples = rings * samples;

float fringe = 0.7; // bokeh chromatic aberration / fringing
float threshold = 0.5; // highlight threshold;
float gain = 2.0; // highlight gain;
float bias = 0.5; // bokeh edge bias

// depth
float getSceneDepth(vec2 uv){

  float depth = unpackRGBAToDepth( texture2D(s_sceneDepth, uv) );
  return depth*(u_zFar-u_zNear)+u_zNear;

}

vec3 showFocus(vec3 col,float blur,float depth){

  float edge = 0.002 * depth;
  float m = clamp(smoothstep(0.0,edge,blur),0.0,1.0);
  float e = clamp(smoothstep(1.0-edge,1.0,blur),0.0,1.0);

  col = mix(col,vec3(1.0,0.5,0.0),(1.0-m)*0.6);
  col = mix(col,vec3(0.0,0.5,1.0),((1.0-e)-(1.0-m))*0.2);

  return col;

}

vec4 gatherVec4(float i, float j, int ringsamples, float w, float h, float blur) {
	float rings2 = float(rings);
	float step = PI*2.0 / float(ringsamples);
	float pw = cos(j*step)*i;
	float ph = sin(j*step)*i;
  float p = 1.0;
  
  vec2 sampleCoord = v_uv + vec2(pw*w,ph*h);
  sampleCoord = clamp(sampleCoord,vec2(0.0,0.0),vec2(1.0,1.0));
  vec3 sampleColor = texture2D(s_sourceRT,sampleCoord).xyz;

  vec3 new_color = sampleColor * mix(1.0, i/rings2, bias) * p;
  float count = 1.0 * mix(1.0, i /rings2, bias) * p;
  return vec4(new_color,count);
}

void main(){

  float depth = getSceneDepth(v_uv);
  float fDepth = u_focusDepth;

  float blur = 0.0;
  float f = u_focusLength; 
	float d = fDepth*1000.0; 
	float o = depth*1000.0; 

	float a = (o*f)/(o-f); 
	float b = (d*f)/(d-f);
	float c = (d-f)/(d*u_focusStop*CoC);

  blur = abs(a-b)*c;
  
  blur = clamp(blur,0.0,2.0);
  //blur = clamp(blur,0.0,1.0);


	// vec2 noise = vec2(rand(v_uv), rand( v_uv + vec2( 0.4, 0.6 ) ) )*u_dither*blur;
  vec2 noise = vec2(0.0, 0.0);

  // getting blur x and y step factor
	float w = (1.0/u_textureWidth)*blur*u_maxBlur+noise.x;
	float h = (1.0/u_textureHeight)*blur*u_maxBlur+noise.y;

  // calculation of final color
	vec3 color = vec3(0.0);

	color = texture2D(s_sourceRT, v_uv).rgb;
	float simpleCount = 1.0;
	int ringsamples;

	for (int i = 1; i <= rings; i++) {
		ringsamples = i * samples;

		for (int j = 0 ; j < maxringsamples ; j++) {
			if (j < ringsamples){
        vec4 res = gatherVec4(float(i), float(j), ringsamples, w, h, blur);
        color += res.xyz;
        simpleCount += res.w;
    
      }
		}
  }

  color /= simpleCount;

  if(u_showFocus > 0.0){
    color = texture2D(s_sourceRT, v_uv).rgb;
    color = showFocus(color, blur, depth);
  }
  
  gl_FragColor = vec4(color, 1.0);

}