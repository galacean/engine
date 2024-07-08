#include <Tonescale>

// Reference Rendering Transform (RRT)

// Sigmoid function in the range 0 to 1 spanning -2 to +2.
mediump float sigmoid_shaper(mediump float x){
    mediump float t = max(1.0 - abs(x / 2.0), 0.0);
    mediump float y = 1.0 + sign(x) * (1.0 - t * t);

    return y * 0.5;
}

mediump float glow_fwd(mediump float ycIn, mediump float glowGainIn, mediump float glowMid){
    mediump float glowGainOut;

    if (ycIn <= 2.0 / 3.0 * glowMid){
        glowGainOut = glowGainIn;
    } else if (ycIn >= 2.0 * glowMid){
        glowGainOut = 0.0;
    } else{
        glowGainOut = glowGainIn * (glowMid / ycIn - 1.0 / 2.0);
    }

    return glowGainOut;
}


// "Glow" module constants
const mediump float RRT_GLOW_GAIN = 0.05;
const mediump float RRT_GLOW_MID = 0.08;

// Red modifier constants
const mediump float RRT_RED_SCALE = 0.82;
const mediump float RRT_RED_PIVOT = 0.03;
const mediump float RRT_RED_HUE = 0.;
const mediump float RRT_RED_WIDTH = 135.;

// Desaturation contants
const mediump float RRT_SAT_FACTOR = 0.96;


// ACES to OCES
mediump vec3 RRT(mediump vec3 aces){
    // --- Glow module --- //
    mediump float saturation = rgb_2_saturation(aces);
    mediump float ycIn = rgb_2_yc(aces);
    mediump float s = sigmoid_shaper((saturation - 0.4) / 0.2);
    mediump float addedGlow = 1.0 + glow_fwd(ycIn, RRT_GLOW_GAIN * s, RRT_GLOW_MID);
    aces *= addedGlow;

    // --- Red modifier --- //
    mediump float hue = rgb_2_hue(aces);
    mediump float centeredHue = center_hue(hue, RRT_RED_HUE);

    mediump float hueWeight = smoothstep(0.0, 1.0, 1.0 - abs(2.0 * centeredHue / RRT_RED_WIDTH));
    hueWeight *= hueWeight;

    aces.r += hueWeight * saturation * (RRT_RED_PIVOT - aces.r) * (1.0 - RRT_RED_SCALE);

    // --- ACES to RGB rendering space --- //
    aces = clamp(aces, 0.0, HALF_MAX);  // avoids saturated negative colors from becoming positive in the matrix
    mediump vec3 rgbPre = AP0_2_AP1_MAT * aces;
    rgbPre = clamp(rgbPre, 0.0, HALF_MAX);

    // --- Global desaturation --- //
    rgbPre = mix(vec3(dot(rgbPre, AP1_RGB2Y)), rgbPre, RRT_SAT_FACTOR);

    // --- Apply the tonescale independently in rendering-space RGB --- //
    mediump vec3 rgbPost;
    rgbPost.x = segmented_spline_c5_fwd(rgbPre.x);
    rgbPost.y = segmented_spline_c5_fwd(rgbPre.y);
    rgbPost.z = segmented_spline_c5_fwd(rgbPre.z);

    // --- RGB rendering space to OCES --- //
    mediump vec3 outputVal = AP1_2_AP0_MAT * rgbPost;

    return outputVal;
}