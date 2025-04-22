#include <common>
varying vec2 v_uv;
uniform sampler2D renderer_BlitTexture;

void main(){
	mediump vec4 color = texture2DSRGB(renderer_BlitTexture, v_uv);

    gl_FragColor = linearToSRGB(color);    
}