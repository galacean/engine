#include <Tonescale>

// Reference Rendering Transform (RRT)

// Sigmoid function in the range 0 to 1 spanning -2 to +2.
float sigmoid_shaper(float x){
    float t = max(1.0 - abs(x / 2.0), 0.0);
    float y = 1.0 + sign(x) * (1.0 - t * t);

    return y * 0.5;
}

float glow_fwd(float ycIn, float glowGainIn, float glowMid){
    float glowGainOut;

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
const float RRT_GLOW_GAIN = 0.05;
const float RRT_GLOW_MID = 0.08;

// Red modifier constants
const float RRT_RED_SCALE = 0.82;
const float RRT_RED_PIVOT = 0.03;
const float RRT_RED_HUE = 0.;
const float RRT_RED_WIDTH = 135.;

// Desaturation contants
const float RRT_SAT_FACTOR = 0.96;


// ACES to OCES
vec3 RRT(vec3 aces){
    // --- Glow module --- //
    float saturation = rgb_2_saturation(aces);
    float ycIn = rgb_2_yc(aces);
    float s = sigmoid_shaper((saturation - 0.4) / 0.2);
    float addedGlow = 1.0 + glow_fwd(ycIn, RRT_GLOW_GAIN * s, RRT_GLOW_MID);
    aces *= addedGlow;

    // --- Red modifier --- //
    float hue = rgb_2_hue(aces);
    float centeredHue = center_hue(hue, RRT_RED_HUE);

    float hueWeight = smoothstep(0.0, 1.0, 1.0 - abs(2.0 * centeredHue / RRT_RED_WIDTH));
    hueWeight *= hueWeight;

    aces.r += hueWeight * saturation * (RRT_RED_PIVOT - aces.r) * (1.0 - RRT_RED_SCALE);

    // --- ACES to RGB rendering space --- //
    aces = clamp(aces, 0.0, HALF_MAX);  // avoids saturated negative colors from becoming positive in the matrix
    vec3 rgbPre = AP0_2_AP1_MAT * aces;
    rgbPre = clamp(rgbPre, 0.0, HALF_MAX);

    // --- Global desaturation --- //
    rgbPre = mix(vec3(dot(rgbPre, AP1_RGB2Y)), rgbPre, RRT_SAT_FACTOR);

    // --- Apply the tonescale independently in rendering-space RGB --- //
    vec3 rgbPost;
    rgbPost.x = segmented_spline_c5_fwd(rgbPre.x);
    rgbPost.y = segmented_spline_c5_fwd(rgbPre.y);
    rgbPost.z = segmented_spline_c5_fwd(rgbPre.z);

    // --- RGB rendering space to OCES --- //
    vec3 outputVal = AP1_2_AP0_MAT * rgbPost;

    return outputVal;
}