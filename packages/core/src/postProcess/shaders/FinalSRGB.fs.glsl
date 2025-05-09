#include <common>
varying vec2 v_uv;
uniform sampler2D renderer_BlitTexture;

void main(){
	mediump vec4 color = texture2DSRGB(renderer_BlitTexture, v_uv);

    // This is final output, maybe has alpha
    // If we use premultiplied color to convert to sRGB, the larger the Alpha transparency value, the brighter the color
    // Because you made the assumption that the transparent background is black, but in fact the background color can be any color of the browser background

    //So we first assume non-transparent SRGB conversion. Then use the Alpha value and the background canvas to do SRGB blending. Although it is non-linear blending, it is more scientific
    color.rgb = color.rgb / color.a;
    color = linearToSRGB(color);
    gl_FragColor = vec4(color.rgb * color.a, color.a);
}