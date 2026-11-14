#ifndef WATER_SPATIAL_FIELD_DECODE_INCLUDED
#define WATER_SPATIAL_FIELD_DECODE_INCLUDED

float waterSpatialFieldDecodeDepth(
  float encodedDepth,
  float maximumDepth
) {
  return encodedDepth * maximumDepth;
}

float waterSpatialFieldDecodeSignedDistance(
  float encodedDistance,
  float decodeScale,
  float decodeBias,
  float signedDistanceRange
) {
  return (encodedDistance * decodeScale + decodeBias)
    * signedDistanceRange;
}

#endif
