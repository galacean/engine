#ifndef FINAL_SRGB
#define FINAL_SRGB

#include "Common/Common.glsl"

mediump sampler2D renderer_BlitTexture;

void frag(Varyings v) {
	mediump vec4 color = texture2DSRGB(renderer_BlitTexture, v.v_uv);

    // This is final output, maybe has alpha
    // If we use premultiplied color to convert to sRGB. Since we ignored the background color, the greater the transparency, the greater the final composite color
    // But the actual transparent canvas can be composited with any color of the browser background

    // So we assume non-transparent SRGB conversion. Then use the Alpha value and the background canvas to do SRGB blending
    // Although it is non-linear blending, it is more scientific
    color.rgb = color.rgb / color.a;
    color = linearToSRGB(color);
    gl_FragColor = vec4(color.rgb * color.a, color.a);
}

#endif
