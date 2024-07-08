#include <ColorTransform>
#include <RRT>
#include <ODT>

vec3 ACESTonemap(vec3 color){
    vec3 aces = sRGB_2_AP0 * color;
    vec3 oces = RRT(aces);
    vec3 odt = ODT_RGBmonitor_100nits_dim(oces);

    return odt;
}