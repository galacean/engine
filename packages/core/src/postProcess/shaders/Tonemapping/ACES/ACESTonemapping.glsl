#include <ColorTransform>
#include <RRT>
#include <ODT>

vec3 ACESTonemap(vec3 color){
    vec3 aces = sRGB_2_AP0 * color;
    
    // --- Glow module --- //
    mediump float saturation = rgb_2_saturation(aces);
    mediump float ycIn = rgb_2_yc(aces);
    mediump float s = sigmoid_shaper((saturation - 0.4) / 0.2);
    float addedGlow = 1.0 + glow_fwd(ycIn, RRT_GLOW_GAIN * s, RRT_GLOW_MID);
    aces *= addedGlow;

    // --- Red modifier --- //
    mediump float hue = rgb_2_hue(vec3(aces));
    mediump float centeredHue = center_hue(hue, RRT_RED_HUE);
    float hueWeight = smoothstep(0.0, 1.0, 1.0 - abs(2.0 * centeredHue / RRT_RED_WIDTH));
    hueWeight *= hueWeight;

    aces.r += hueWeight * saturation * (RRT_RED_PIVOT - aces.r) * (1.0 - RRT_RED_SCALE);

    // --- ACES to RGB rendering space --- //
    vec3 acescg = max(AP0_2_AP1_MAT * aces, 0.0);

    // --- Global desaturation --- //
    acescg = mix(vec3(dot(acescg, AP1_RGB2Y)), acescg, RRT_SAT_FACTOR);

    // Apply RRT and ODT
    // https://github.com/TheRealMJP/BakingLab/blob/master/BakingLab/ACES.hlsl
    const float a = 0.0245786;
    const float b = 0.000090537;
    const float c = 0.983729;
    const float d = 0.4329510;
    const float e = 0.238081;

    // To reduce the likelyhood of extremely large values, we avoid using the x^2 term and therefore
    // divide numerator and denominator by it. This will lead to the constant factors of the
    // quadratic in the numerator and denominator to be divided by x; we add a tiny epsilon to avoid divide by 0.
    vec3 rcpAcesCG = 1.0 / (acescg + FLT_MIN);
    mediump vec3 rgbPost = (acescg + a - b * rcpAcesCG) /
    (acescg * c + d + e * rcpAcesCG);

    // Apply gamma adjustment to compensate for dim surround
    vec3 linearCV = darkSurround_to_dimSurround(rgbPost);

    // Apply desaturation to compensate for luminance difference
    linearCV = mix(vec3(dot(linearCV, AP1_RGB2Y)), linearCV, ODT_SAT_FACTOR);

    // Convert to display primary encoding
    // Rendering space RGB to XYZ
    vec3 XYZ = AP1_2_XYZ_MAT * linearCV;

    // Apply CAT from ACES white point to assumed observer adapted white point
    XYZ = D60_2_D65_CAT * XYZ;

    // CIE XYZ to display primaries
    linearCV = XYZ_2_REC709_MAT * XYZ;

    return linearCV;

}