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

float riverValueNoise(vec2 point) {
  point = mod(point, {{NOISE_PERIOD}});
  vec2 cell = floor(point);
  vec2 local = fract(point);
  vec2 curve = local * local * (3.0 - 2.0 * local);
  float bottom = mix(riverHash21(cell), riverHash21(cell + vec2(1.0, 0.0)), curve.x);
  float top = mix(
    riverHash21(cell + vec2(0.0, 1.0)),
    riverHash21(cell + vec2(1.0, 1.0)),
    curve.x
  );
  return mix(bottom, top, curve.y);
}

float riverFbm(vec2 point, vec4 offsets) {
  float value = riverValueNoise(point + vec2(0.0, offsets.x)) * {{OCTAVE_WEIGHT_0}};
  value += riverValueNoise(
    point * {{SECOND_OCTAVE_SCALE}}
      + vec2({{SECOND_OCTAVE_OFFSET_X}}, {{SECOND_OCTAVE_OFFSET_Y}} + offsets.y)
  ) * {{OCTAVE_WEIGHT_1}};
  value += riverValueNoise(
    point * {{THIRD_OCTAVE_SCALE}}
      + vec2({{THIRD_OCTAVE_OFFSET_X}}, {{THIRD_OCTAVE_OFFSET_Y}} + offsets.z)
  ) * {{OCTAVE_WEIGHT_2}};
  return value;
}

float riverShoreDamping(float signedAcrossDistance, float halfWidth) {
  float shoreDistance = halfWidth - abs(signedAcrossDistance);
  return smoothstep(0.0, material_ShoreDampingWidth, shoreDistance);
}

vec2 riverWarpedDomain(vec2 motionCoord, float warpOffset) {
  float lengthScale = max(material_SurfaceLengthScale, 0.001);
  vec2 baseDomain = vec2(
    motionCoord.x,
    motionCoord.y * {{REFERENCE_FLOW_SPEED}}
  ) / lengthScale;
  vec2 warp = vec2(
    riverValueNoise(
      baseDomain * {{DOMAIN_WARP_SCALE}}
        + vec2({{WARP_OFFSET_X_X}}, {{WARP_OFFSET_X_Y}} + warpOffset)
    ),
    riverValueNoise(
      baseDomain * {{DOMAIN_WARP_SCALE}}
        + vec2({{WARP_OFFSET_Y_X}}, {{WARP_OFFSET_Y_Y}} + warpOffset)
    )
  ) * 2.0 - 1.0;
  return baseDomain + warp * ({{DOMAIN_WARP_STRENGTH}} * material_SurfaceTurbulence);
}

float riverMacroHeight(
  vec2 motionCoord,
  float halfWidth,
  float localFlowSpeed
) {
  float shoreDamping = riverShoreDamping(motionCoord.x, halfWidth);
  float flowing = localFlowSpeed > {{FLOW_EPSILON}} ? 1.0 : 0.0;
  vec4 offsets = material_SurfaceDomainOffsets * flowing;
  vec2 warped = riverWarpedDomain(motionCoord, material_SurfaceWarpOffset * flowing);
  float broad = riverFbm(warped, offsets);
  float ridgeNoise = riverValueNoise(
    warped * {{RIDGE_SCALE}}
      + vec2({{RIDGE_OFFSET_X}}, {{RIDGE_OFFSET_Y}} + offsets.w)
  );
  float ridge = 1.0 - abs(ridgeNoise * 2.0 - 1.0);
  float shape = (broad - 0.5) * {{BROAD_WEIGHT}}
    + (ridge - 0.5) * {{RIDGE_WEIGHT}} * material_SurfaceTurbulence;
  return material_SurfaceMaxDisplacement * shoreDamping * shape;
}

struct RiverGeometryVertex {
  vec4 localPosition;
  vec4 worldPosition;
  vec3 worldTangent;
  vec2 worldFlow;
  float macroHeight;
  vec3 macroNormalWS;
  vec4 clipPosition;
};

RiverGeometryVertex evaluateRiverGeometry(Attributes attr) {
  RiverGeometryVertex geometry;
  float derivativeStep = {{DERIVATIVE_STEP}};
  float sampledFlowSpeed = max(attr.TEXCOORD_1.x, {{DERIVATIVE_MIN_FLOW_SPEED}});
  float flowTimeStep = derivativeStep / sampledFlowSpeed;
  float downstreamSpan = flowTimeStep * sampledFlowSpeed;
  float computedMacroHeight = 0.0;
  float acrossDerivative = 0.0;
  float downstreamDerivative = 0.0;
  if (material_SurfaceMaxDisplacement * material_MacroDisplacementEnabled > 0.0) {
  computedMacroHeight = riverMacroHeight(
    attr.TEXCOORD_2,
    attr.TEXCOORD_3.x,
    attr.TEXCOORD_1.x
  ) * material_MacroDisplacementEnabled;
  float acrossPositive = riverMacroHeight(
    attr.TEXCOORD_2 + vec2(derivativeStep, 0.0),
    attr.TEXCOORD_3.x,
    attr.TEXCOORD_1.x
  );
  float acrossNegative = riverMacroHeight(
    attr.TEXCOORD_2 - vec2(derivativeStep, 0.0),
    attr.TEXCOORD_3.x,
    attr.TEXCOORD_1.x
  );
  float downstreamPositive = riverMacroHeight(
    attr.TEXCOORD_2 + vec2(0.0, flowTimeStep),
    attr.TEXCOORD_3.x,
    attr.TEXCOORD_1.x
  );
  float downstreamNegative = riverMacroHeight(
    attr.TEXCOORD_2 - vec2(0.0, flowTimeStep),
    attr.TEXCOORD_3.x,
    attr.TEXCOORD_1.x
  );
  acrossDerivative = (acrossPositive - acrossNegative) / (derivativeStep * 2.0)
    * material_MacroDisplacementEnabled;
  downstreamDerivative = (downstreamPositive - downstreamNegative) / (downstreamSpan * 2.0)
    * material_MacroDisplacementEnabled;
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
  geometry.macroHeight = computedMacroHeight;
  geometry.macroNormalWS = computedMacroNormalWS;
  geometry.clipPosition = computedClipPosition;
  return geometry;
}

#endif
