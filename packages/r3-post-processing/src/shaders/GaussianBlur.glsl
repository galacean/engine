// #define FILTER_SIZE 7

precision highp float;
varying vec2 v_uv;

uniform sampler2D s_sourceRT;
uniform float u_texelSize;
uniform vec2 u_direction;


float gaussianPdf(in float x, in float sigma) {
	return 0.39894 * exp( -0.5 * x * x/( sigma * sigma))/sigma;
}

void main(){
  float fSigma = float(FILTER_SIZE);
  float weightSum = gaussianPdf(0.0, fSigma);
  vec3 diffuseSum = texture2D( s_sourceRT, v_uv).rgb * weightSum;

  for( int i = 1; i < FILTER_SIZE; i ++ ) {
		float x = float(i);
		float w = gaussianPdf(x, fSigma);
		vec2 uvOffset = u_direction * u_texelSize * x;
		vec3 sample1 = texture2D( s_sourceRT, v_uv + uvOffset).rgb;
		vec3 sample2 = texture2D( s_sourceRT, v_uv - uvOffset).rgb;
		diffuseSum += (sample1 + sample2) * w;
		weightSum += 2.0 * w;
		}
  
	gl_FragColor = vec4(diffuseSum/weightSum, 1.0);
}