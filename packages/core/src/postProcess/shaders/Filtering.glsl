#ifndef FILTERING
#define FILTERING

vec2 bSpline3MiddleLeft(vec2 x){
    return 0.16666667 + x * (0.5 + x * (0.5 - x * 0.5));
}

vec2 bSpline3MiddleRight(vec2 x){
      return 0.66666667 + x * (-1.0 + 0.5 * x) * x;
}

vec2 bSpline3Rightmost(vec2 x){
      return 0.16666667 + x * (-0.5 + x * (0.5 - x * 0.16666667));
}

// Compute weights & offsets for 4x bilinear taps for the bicubic B-Spline filter.
// The fractional coordinate should be in the [0, 1] range (centered on 0.5).
// Inspired by: http://vec3.ca/bicubic-filtering-in-fewer-taps/
void bicubicFilter(vec2 fracCoord, out vec2 weights[2], out vec2 offsets[2]){
      vec2 r  = bSpline3Rightmost(fracCoord);
      vec2 mr = bSpline3MiddleRight(fracCoord);
      vec2 ml = bSpline3MiddleLeft(fracCoord);
      vec2 l  = 1.0 - mr - ml - r;

      weights[0] = r + mr;
      weights[1] = ml + l;
      offsets[0] = -1.0 + mr / weights[0];
      offsets[1] =  1.0 + l / weights[1];
}


// texSize: (1/width, 1/height, width, height)
vec4 sampleTexture2DBicubic(sampler2D tex, vec2 coord, vec4 texSize){
	vec2 xy = coord * texSize.zw + 0.5;
    vec2 ic = floor(xy);
    vec2 fc = fract(xy);

    vec2 weights[2], offsets[2];
    bicubicFilter(fc, weights, offsets);

    return weights[0].y * (weights[0].x * sampleTexture(tex, (ic + vec2(offsets[0].x, offsets[0].y) - 0.5) * texSize.xy)  +
                        	weights[1].x * sampleTexture(tex, (ic + vec2(offsets[1].x, offsets[0].y) - 0.5) * texSize.xy)) +
            weights[1].y * (weights[0].x * sampleTexture(tex, (ic + vec2(offsets[0].x, offsets[1].y) - 0.5) * texSize.xy)  +
                            weights[1].x * sampleTexture(tex, (ic + vec2(offsets[1].x, offsets[1].y) - 0.5) * texSize.xy));
}


#endif