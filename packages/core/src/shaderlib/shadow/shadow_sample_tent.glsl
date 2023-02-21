// ------------------------------------------------------------------
//  PCF Filtering Tent Functions
// ------------------------------------------------------------------

// Assuming a isoceles right angled triangle of height "triangleHeight" (as drawn below).
// This function return the area of the triangle above the first texel(in Y the first texel).
//
// |\      <-- 45 degree slop isosceles right angled triangle
// | \
// ----    <-- length of this side is "triangleHeight"
// _ _ _ _ <-- texels
float sampleShadowGetIRTriangleTexelArea(float triangleHeight) {
    return triangleHeight - 0.5;
}

// Assuming a isoceles triangle of 1.5 texels height and 3 texels wide lying on 4 texels.
// This function return the area of the triangle above each of those texels.
//    |    <-- offset from -0.5 to 0.5, 0 meaning triangle is exactly in the center
//   / \   <-- 45 degree slop isosceles triangle (ie tent projected in 2D)
//  /   \
// _ _ _ _ <-- texels
// X Y Z W <-- result indices (in computedArea.xyzw and computedAreaUncut.xyzw)
// Top point at (right,top) in a texel,left bottom point at (middle,middle) in a texel,right bottom point at (middle,middle) in a texel.
void sampleShadowGetTexelAreasTent3x3(float offset, out vec4 computedArea, out vec4 computedAreaUncut) {
    // Compute the exterior areas,a and h is same.
    float a = offset + 0.5;
    float offsetSquaredHalved = a * a * 0.5;
    computedAreaUncut.x = computedArea.x = offsetSquaredHalved - offset;
    computedAreaUncut.w = computedArea.w = offsetSquaredHalved;

    // Compute the middle areas
    // For Y : We find the area in Y of as if the left section of the isoceles triangle would
    // intersect the axis between Y and Z (ie where offset = 0).
    computedAreaUncut.y = sampleShadowGetIRTriangleTexelArea(1.5 - offset);
    // This area is superior to the one we are looking for if (offset < 0) thus we need to
    // subtract the area of the triangle defined by (0,1.5-offset), (0,1.5+offset), (-offset,1.5).
    float clampedOffsetLeft = min(offset,0.0);
    float areaOfSmallLeftTriangle = clampedOffsetLeft * clampedOffsetLeft;
    computedArea.y = computedAreaUncut.y - areaOfSmallLeftTriangle;

    // We do the same for the Z but with the right part of the isoceles triangle
    computedAreaUncut.z = sampleShadowGetIRTriangleTexelArea(1.5 + offset);
    float clampedOffsetRight = max(offset,0.0);
    float areaOfSmallRightTriangle = clampedOffsetRight * clampedOffsetRight;
    computedArea.z = computedAreaUncut.z - areaOfSmallRightTriangle;
}

// Assuming a isoceles triangle of 2.5 texel height and 5 texels wide lying on 6 texels.
// This function return the weight of each texels area relative to the full triangle area.
//  /       \
// _ _ _ _ _ _ <-- texels
// 0 1 2 3 4 5 <-- computed area indices (in texelsWeights[])
// Top point at (right,top) in a texel,left bottom point at (middle,middle) in a texel,right bottom point at (middle,middle) in a texel.
void sampleShadowGetTexelWeightsTent5x5(float offset, out vec3 texelsWeightsA, out vec3 texelsWeightsB) {
    vec4 areaFrom3texelTriangle;
    vec4 areaUncutFrom3texelTriangle;
    sampleShadowGetTexelAreasTent3x3(offset, areaFrom3texelTriangle, areaUncutFrom3texelTriangle);

    // Triangle slope is 45 degree thus we can almost reuse the result of the 3 texel wide computation.
    // the 5 texel wide triangle can be seen as the 3 texel wide one but shifted up by one unit/texel.
    // 0.16 is 1/(the triangle area)
    texelsWeightsA.x = 0.16 * (areaFrom3texelTriangle.x);
    texelsWeightsA.y = 0.16 * (areaUncutFrom3texelTriangle.y);
    texelsWeightsA.z = 0.16 * (areaFrom3texelTriangle.y + 1.0);
    texelsWeightsB.x = 0.16 * (areaFrom3texelTriangle.z + 1.0);
    texelsWeightsB.y = 0.16 * (areaUncutFrom3texelTriangle.z);
    texelsWeightsB.z = 0.16 * (areaFrom3texelTriangle.w);
}

// 5x5 Tent filter (45 degree sloped triangles in U and V)
void sampleShadowComputeSamplesTent5x5(vec4 shadowMapTextureTexelSize, vec2 coord, out float fetchesWeights[9], out vec2 fetchesUV[9])
{
    // tent base is 5x5 base thus covering from 25 to 36 texels, thus we need 9 bilinear PCF fetches
    vec2 tentCenterInTexelSpace = coord.xy * shadowMapTextureTexelSize.zw;
    vec2 centerOfFetchesInTexelSpace = floor(tentCenterInTexelSpace + 0.5);
    vec2 offsetFromTentCenterToCenterOfFetches = tentCenterInTexelSpace - centerOfFetchesInTexelSpace;

    // find the weight of each texel based on the area of a 45 degree slop tent above each of them.
    vec3 texelsWeightsUA, texelsWeightsUB;
    vec3 texelsWeightsVA, texelsWeightsVB;
    sampleShadowGetTexelWeightsTent5x5(offsetFromTentCenterToCenterOfFetches.x, texelsWeightsUA, texelsWeightsUB);
    sampleShadowGetTexelWeightsTent5x5(offsetFromTentCenterToCenterOfFetches.y, texelsWeightsVA, texelsWeightsVB);

    // each fetch will cover a group of 2x2 texels, the weight of each group is the sum of the weights of the texels
    vec3 fetchesWeightsU = vec3(texelsWeightsUA.xz, texelsWeightsUB.y) + vec3(texelsWeightsUA.y, texelsWeightsUB.xz);
    vec3 fetchesWeightsV = vec3(texelsWeightsVA.xz, texelsWeightsVB.y) + vec3(texelsWeightsVA.y, texelsWeightsVB.xz);

    // move the PCF bilinear fetches to respect texels weights
    vec3 fetchesOffsetsU = vec3(texelsWeightsUA.y, texelsWeightsUB.xz) / fetchesWeightsU.xyz + vec3(-2.5,-0.5,1.5);
    vec3 fetchesOffsetsV = vec3(texelsWeightsVA.y, texelsWeightsVB.xz) / fetchesWeightsV.xyz + vec3(-2.5,-0.5,1.5);
    fetchesOffsetsU *= shadowMapTextureTexelSize.xxx;
    fetchesOffsetsV *= shadowMapTextureTexelSize.yyy;

    vec2 bilinearFetchOrigin = centerOfFetchesInTexelSpace * shadowMapTextureTexelSize.xy;
    fetchesUV[0] = bilinearFetchOrigin + vec2(fetchesOffsetsU.x, fetchesOffsetsV.x);
    fetchesUV[1] = bilinearFetchOrigin + vec2(fetchesOffsetsU.y, fetchesOffsetsV.x);
    fetchesUV[2] = bilinearFetchOrigin + vec2(fetchesOffsetsU.z, fetchesOffsetsV.x);
    fetchesUV[3] = bilinearFetchOrigin + vec2(fetchesOffsetsU.x, fetchesOffsetsV.y);
    fetchesUV[4] = bilinearFetchOrigin + vec2(fetchesOffsetsU.y, fetchesOffsetsV.y);
    fetchesUV[5] = bilinearFetchOrigin + vec2(fetchesOffsetsU.z, fetchesOffsetsV.y);
    fetchesUV[6] = bilinearFetchOrigin + vec2(fetchesOffsetsU.x, fetchesOffsetsV.z);
    fetchesUV[7] = bilinearFetchOrigin + vec2(fetchesOffsetsU.y, fetchesOffsetsV.z);
    fetchesUV[8] = bilinearFetchOrigin + vec2(fetchesOffsetsU.z, fetchesOffsetsV.z);

    fetchesWeights[0] = fetchesWeightsU.x * fetchesWeightsV.x;
    fetchesWeights[1] = fetchesWeightsU.y * fetchesWeightsV.x;
    fetchesWeights[2] = fetchesWeightsU.z * fetchesWeightsV.x;
    fetchesWeights[3] = fetchesWeightsU.x * fetchesWeightsV.y;
    fetchesWeights[4] = fetchesWeightsU.y * fetchesWeightsV.y;
    fetchesWeights[5] = fetchesWeightsU.z * fetchesWeightsV.y;
    fetchesWeights[6] = fetchesWeightsU.x * fetchesWeightsV.z;
    fetchesWeights[7] = fetchesWeightsU.y * fetchesWeightsV.z;
    fetchesWeights[8] = fetchesWeightsU.z * fetchesWeightsV.z;
}