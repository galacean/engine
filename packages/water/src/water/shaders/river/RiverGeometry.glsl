#ifndef RIVER_GEOMETRY_INCLUDED
#define RIVER_GEOMETRY_INCLUDED

vec2 safeNormalize2(vec2 value, vec2 fallback) {
  float lengthSquared = dot(value, value);
  return lengthSquared > 0.00000001 ? value * inversesqrt(lengthSquared) : fallback;
}

vec3 safeNormalize3(vec3 value, vec3 fallback) {
  float lengthSquared = dot(value, value);
  return lengthSquared > 0.00000001 ? value * inversesqrt(lengthSquared) : fallback;
}

float surfaceTime() {
  float selectedTime = material_SurfaceTimeOverride >= 0.0
    ? material_SurfaceTimeOverride
    : scene_ElapsedTime.x;
  return mod(max(selectedTime, 0.0), {{TIME_PERIOD_SECONDS}});
}

// WebGL2 only: PCG RXS-M-XS with the same integer lattice/seed packing as the CPU.
uint riverHashCell(vec2 point) {
  uvec2 cell = uvec2(mod(floor(point), {{NOISE_PERIOD}}));
  uint inputValue = (cell.x + cell.y * {{NOISE_PERIOD_UINT}}) ^ uint(material_SurfaceSeed);
  uint state = inputValue * {{HASH_MULTIPLIER_UINT}} + {{HASH_INCREMENT_UINT}};
  uint word = ((state >> ((state >> 28u) + 4u)) ^ state) * {{HASH_OUTPUT_MULTIPLIER_UINT}};
  return (word >> 22u) ^ word;
}

float riverHash21(vec2 point) {
  return float(riverHashCell(point) >> 8u) * (1.0 / 16777216.0);
}

// Returns (value, dValue/dx, dValue/dy) using the exact same lattice and curve as riverValueNoise.
vec3 riverValueNoiseWithGrad(vec2 point) {
  point = mod(point, {{NOISE_PERIOD}});
  vec2 cell = floor(point);
  vec2 local = fract(point);
  vec2 curve = local * local * (3.0 - 2.0 * local);
  vec2 dCurve = 6.0 * local * (1.0 - local);
  float v00 = riverHash21(cell);
  float v10 = riverHash21(cell + vec2(1.0, 0.0));
  float v01 = riverHash21(cell + vec2(0.0, 1.0));
  float v11 = riverHash21(cell + vec2(1.0, 1.0));
  float bottom = mix(v00, v10, curve.x);
  float top = mix(v01, v11, curve.x);
  float value = mix(bottom, top, curve.y);
  float dValDx = mix(v10 - v00, v11 - v01, curve.y) * dCurve.x;
  float dValDy = (top - bottom) * dCurve.y;
  return vec3(value, dValDx, dValDy);
}

float riverShoreDamping(float signedAcrossDistance, float halfWidth) {
  float shoreDistance = halfWidth - abs(signedAcrossDistance);
  return smoothstep(0.0, material_ShoreDampingWidth, shoreDistance);
}

// Evaluates (height, dHeight/dAcross, dHeight/dDownstream) analytically in 24 hashes instead of 120.
vec3 riverMacroSurfaceWithGrad(
  vec2 motionCoord,
  float halfWidth,
  float localFlowSpeed,
  float sampledFlowSpeed
) {
  float shoreDistance = halfWidth - abs(motionCoord.x);
  float shoreDamping = smoothstep(0.0, material_ShoreDampingWidth, shoreDistance);
  float dShoreDampingDx = 0.0;
  if (
    material_ShoreDampingWidth > 0.0
    && shoreDistance > 0.0
    && shoreDistance < material_ShoreDampingWidth
  ) {
    float t = shoreDistance / material_ShoreDampingWidth;
    float dSmooth = (6.0 * t * (1.0 - t)) / material_ShoreDampingWidth;
    float dAbsX = motionCoord.x > 0.0 ? -1.0 : (motionCoord.x < 0.0 ? 1.0 : 0.0);
    dShoreDampingDx = dSmooth * dAbsX;
  }
  float flowing = localFlowSpeed > {{FLOW_EPSILON}} ? 1.0 : 0.0;
  vec4 offsets = material_SurfaceDomainOffsets * flowing;
  float warpOffset = material_SurfaceWarpOffset * flowing;
  float lengthScale = max(material_SurfaceLengthScale, 0.001);
  vec2 baseDomain = vec2(
    motionCoord.x,
    motionCoord.y * {{REFERENCE_FLOW_SPEED}}
  ) / lengthScale;
  float warpGain = {{DOMAIN_WARP_STRENGTH}} * material_SurfaceTurbulence;
  vec3 warpSampleX = riverValueNoiseWithGrad(
    baseDomain * {{DOMAIN_WARP_SCALE}}
      + vec2({{WARP_OFFSET_X_X}}, {{WARP_OFFSET_X_Y}} + warpOffset)
  );
  vec3 warpSampleY = riverValueNoiseWithGrad(
    baseDomain * {{DOMAIN_WARP_SCALE}}
      + vec2({{WARP_OFFSET_Y_X}}, {{WARP_OFFSET_Y_Y}} + warpOffset)
  );
  vec2 warp = vec2(warpSampleX.x, warpSampleY.x) * 2.0 - 1.0;
  vec2 warped = baseDomain + warp * warpGain;
  float warpJacobianScale = 2.0 * warpGain * {{DOMAIN_WARP_SCALE}};
  float jxx = 1.0 + warpJacobianScale * warpSampleX.y;
  float jxy = warpJacobianScale * warpSampleX.z;
  float jyx = warpJacobianScale * warpSampleY.y;
  float jyy = 1.0 + warpJacobianScale * warpSampleY.z;

  vec3 broad0 = riverValueNoiseWithGrad(warped + vec2(0.0, offsets.x));
  vec3 broad1 = riverValueNoiseWithGrad(
    warped * {{SECOND_OCTAVE_SCALE}}
      + vec2({{SECOND_OCTAVE_OFFSET_X}}, {{SECOND_OCTAVE_OFFSET_Y}} + offsets.y)
  );
  vec3 broad2 = riverValueNoiseWithGrad(
    warped * {{THIRD_OCTAVE_SCALE}}
      + vec2({{THIRD_OCTAVE_OFFSET_X}}, {{THIRD_OCTAVE_OFFSET_Y}} + offsets.z)
  );
  float broad = broad0.x * {{OCTAVE_WEIGHT_0}}
    + broad1.x * {{OCTAVE_WEIGHT_1}}
    + broad2.x * {{OCTAVE_WEIGHT_2}};
  vec2 gradBroadWarped = broad0.yz * {{OCTAVE_WEIGHT_0}}
    + broad1.yz * ({{OCTAVE_WEIGHT_1}} * {{SECOND_OCTAVE_SCALE}})
    + broad2.yz * ({{OCTAVE_WEIGHT_2}} * {{THIRD_OCTAVE_SCALE}});

  vec3 ridgeSample = riverValueNoiseWithGrad(
    warped * {{RIDGE_SCALE}}
      + vec2({{RIDGE_OFFSET_X}}, {{RIDGE_OFFSET_Y}} + offsets.w)
  );
  float ridgeSigned = ridgeSample.x * 2.0 - 1.0;
  float ridge = 1.0 - abs(ridgeSigned);
  float ridgeSign = ridgeSigned >= 0.0 ? -2.0 : 2.0;
  vec2 gradRidgeWarped = ridgeSample.yz * ({{RIDGE_SCALE}} * ridgeSign);

  float shape = (broad - 0.5) * {{BROAD_WEIGHT}}
    + (ridge - 0.5) * {{RIDGE_WEIGHT}} * material_SurfaceTurbulence;
  vec2 gradShapeWarped = gradBroadWarped * {{BROAD_WEIGHT}}
    + gradRidgeWarped * ({{RIDGE_WEIGHT}} * material_SurfaceTurbulence);
  float gradBaseX = gradShapeWarped.x * jxx + gradShapeWarped.y * jyx;
  float gradBaseY = gradShapeWarped.x * jxy + gradShapeWarped.y * jyy;

  float height = material_SurfaceMaxDisplacement * shoreDamping * shape;
  float dAcross = material_SurfaceMaxDisplacement
    * (dShoreDampingDx * shape + shoreDamping * (gradBaseX / lengthScale));
  float dDownstream = material_SurfaceMaxDisplacement
    * shoreDamping
    * (gradBaseY * ({{REFERENCE_FLOW_SPEED}} / (lengthScale * sampledFlowSpeed)));
  return vec3(height, dAcross, dDownstream);
}

struct RiverGeometryVertex {
  vec4 localPosition;
  vec4 worldPosition;
  vec3 worldTangent;
  vec2 worldFlow;
  vec3 macroNormalWS;
  vec4 clipPosition;
};

RiverGeometryVertex evaluateRiverGeometry(Attributes attr) {
  RiverGeometryVertex geometry;
  float sampledFlowSpeed = max(attr.TEXCOORD_1.x, {{DERIVATIVE_MIN_FLOW_SPEED}});
  float computedMacroHeight = 0.0;
  float acrossDerivative = 0.0;
  float downstreamDerivative = 0.0;
  if (material_SurfaceMaxDisplacement * material_MacroDisplacementEnabled > 0.0) {
    vec3 macroSurface = riverMacroSurfaceWithGrad(
      attr.TEXCOORD_2,
      attr.TEXCOORD_3.x,
      attr.TEXCOORD_1.x,
      sampledFlowSpeed
    );
    computedMacroHeight = macroSurface.x * material_MacroDisplacementEnabled;
    acrossDerivative = macroSurface.y * material_MacroDisplacementEnabled;
    downstreamDerivative = macroSurface.z * material_MacroDisplacementEnabled;
  }
  vec4 localPosition = attr.POSITION;
  float connectionMotion = waterConnectionFacts((renderer_ModelMat * attr.POSITION).xz).x;
  computedMacroHeight *= connectionMotion;
  acrossDerivative *= connectionMotion;
  downstreamDerivative *= connectionMotion;
  localPosition.y += computedMacroHeight;
  vec4 computedWorldPosition = renderer_ModelMat * localPosition;
  vec3 worldTangent = safeNormalize3(
    mat3(renderer_ModelMat) * attr.TANGENT.xyz,
    vec3(0.0, 0.0, 1.0)
  );
  vec2 computedWorldFlow = safeNormalize2(worldTangent.xz, vec2(0.0, 1.0));
  vec2 heightGradient = attr.TEXCOORD_4 * acrossDerivative + attr.TEXCOORD_5 * downstreamDerivative;
  vec3 displacedNormal = attr.NORMAL / max(attr.NORMAL.y, 0.000001)
    - vec3(heightGradient.x, 0.0, heightGradient.y);
  vec3 computedMacroNormalWS = normalize(mat3(renderer_NormalMat) * displacedNormal);
  vec4 computedClipPosition = renderer_MVPMat * localPosition;
  geometry.localPosition = localPosition;
  geometry.worldPosition = computedWorldPosition;
  geometry.worldTangent = worldTangent;
  geometry.worldFlow = computedWorldFlow;
  geometry.macroNormalWS = computedMacroNormalWS;
  geometry.clipPosition = computedClipPosition;
  return geometry;
}

#endif
