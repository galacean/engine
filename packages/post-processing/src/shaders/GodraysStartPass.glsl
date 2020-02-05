#define TAPS_PER_PASS 6.0
precision highp float;
varying vec2 v_uv;

uniform sampler2D s_depthTexture;
uniform vec2 u_sunScreen;
uniform float u_stepSize;

const float UnpackDownscale = 255. / 256.; 
const vec3 PackFactors = vec3( 256. * 256. * 256., 256. * 256.,  256. );
const vec4 UnpackFactors = UnpackDownscale / vec4( PackFactors, 1. );

float unpackRGBAToDepth( const in vec4 v ) {
  return dot( v, UnpackFactors );
}

void main(){

  vec2 delta = u_sunScreen - v_uv;
  float dist = length( delta );

  vec2 stepv = u_stepSize * delta / dist;

  float iters = dist/u_stepSize;
  vec2 uv = v_uv.xy;
  float col = 0.0;
  float depth = 0.0;

  if ( 0.0 <= iters && uv.y < 1.0 ) {
    depth = unpackRGBAToDepth(texture2D(s_depthTexture, uv));
    depth = pow(depth, 30.);
    col += 1. - depth;
  }
  uv += stepv;

  if ( 1.0 <= iters && uv.y < 1.0 ) {
    depth = unpackRGBAToDepth(texture2D(s_depthTexture, uv));
    depth = pow(depth, 20.);
    col += 1. - depth;
  }
  uv += stepv;

  if ( 2.0 <= iters && uv.y < 1.0 ) {
    depth = unpackRGBAToDepth(texture2D(s_depthTexture, uv));
    depth = pow(depth, 20.);
    col += 1. - depth;
  }
  uv += stepv;  

  if ( 3.0 <= iters && uv.y < 1.0 ) { 
    depth = unpackRGBAToDepth(texture2D(s_depthTexture, uv));
    depth = pow(depth, 20.);
    col += 1. - depth;
  }
  uv += stepv;

  if ( 4.0 <= iters && uv.y < 1.0 ) {
    depth = unpackRGBAToDepth(texture2D(s_depthTexture, uv));
    depth = pow(depth, 20.);
    col += 1. - depth;  
  }
  uv += stepv;

  if ( 5.0 <= iters && uv.y < 1.0 ) {
    depth = unpackRGBAToDepth(texture2D(s_depthTexture, uv));
    depth = pow(depth, 20.);
    col += 1. - depth;
  }
  uv += stepv;

  gl_FragColor = vec4( col/TAPS_PER_PASS );
  gl_FragColor.a = 1.0;
  
}


