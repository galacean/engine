#ifndef PROMPT_NOISE_WORLD_HEIGHT_INCLUDED
#define PROMPT_NOISE_WORLD_HEIGHT_INCLUDED

float material_TerrainVertexSpacing;
float renderer_Lod;
float renderer_ClipmapMeshSize;
vec2 material_WorldOrigin;
vec3 material_TerrainViewPosition;
float material_WorldNoiseScale;
float material_WorldNoiseHeight;
vec3 material_WorldNoiseOffset;
vec2 material_FbmSeedOffset;
int material_RidgeSeed;
float material_RidgeStrength;
float material_RidgeFrequency;
float material_RidgeSharpness;
sampler2D material_OperatorTexels;
sampler2D material_RiverSegmentTexels;
sampler2D material_RiverCellTexels;
int material_OperatorCount;
int material_SelectedOperatorId;

float promptNoiseHash(vec2 value) {
  return fract(
    10000.0 * sin(17.0 * value.x + value.y * 0.1) *
    (0.1 + abs(sin(value.y * 13.0 + value.x)))
  );
}

vec3 promptNoiseValue(vec2 value) {
  vec2 fractional = fract(value);
  vec2 squared = fractional * fractional;
  vec2 cubed = squared * fractional;
  vec2 inverse = fractional - 1.0;
  vec2 inverseSquared = inverse * inverse;
  vec2 interpolation = cubed * (6.0 * squared + (-15.0 * fractional + 10.0));
  vec2 derivative = 30.0 * squared * inverseSquared;
  vec2 cell = floor(value);
  float a = promptNoiseHash(cell + vec2(0.0, 0.0));
  float b = promptNoiseHash(cell + vec2(1.0, 0.0));
  float c = promptNoiseHash(cell + vec2(0.0, 1.0));
  float d = promptNoiseHash(cell + vec2(1.0, 1.0));
  float k0 = a;
  float k1 = b - a;
  float k2 = c - a;
  float k3 = d - (b + k2);
  return vec3(
    k2 * interpolation.y + interpolation.x * (k3 * interpolation.y + k1) + k0,
    derivative * (vec2(k3) * interpolation.yx + vec2(k1, k2))
  );
}

float promptNoiseFbm(vec2 position) {
  float amplitude = 0.0;
  float weight = 1.0;
  vec2 derivative = vec2(0.0);
  for (int index = 0; index < 4; index++) {
    vec3 noise = promptNoiseValue(position);
    derivative += noise.yz;
    amplitude += weight * noise.x / (1.0 + dot(derivative, derivative));
    weight *= 0.5;
    position = mat2(vec2(0.8, -0.6), vec2(0.6, 0.8)) * position * 2.0;
  }
  return amplitude;
}

uint promptNoiseSeedMix(uint hash, int value) {
  hash ^= uint(value) * 0x9e3779b9u;
  hash ^= hash >> 16u;
  hash *= 0x7feb352du;
  hash ^= hash >> 15u;
  hash *= 0x846ca68bu;
  hash ^= hash >> 16u;
  return hash;
}

float promptNoiseSeededCell(ivec2 cell, int seed, int octave) {
  uint hash = promptNoiseSeedMix(uint(seed), octave);
  hash = promptNoiseSeedMix(hash, cell.x);
  hash = promptNoiseSeedMix(hash, cell.y);
  return float(hash & 0x00ffffffu) / 16777215.0;
}

float promptNoiseSeededValue(vec2 value, int seed, int octave) {
  vec2 fractional = fract(value);
  vec2 interpolation = fractional * fractional * fractional * (
    fractional * (fractional * 6.0 - 15.0) + 10.0
  );
  ivec2 cell = ivec2(floor(value));
  float a = promptNoiseSeededCell(cell, seed, octave);
  float b = promptNoiseSeededCell(cell + ivec2(1, 0), seed, octave);
  float c = promptNoiseSeededCell(cell + ivec2(0, 1), seed, octave);
  float d = promptNoiseSeededCell(cell + ivec2(1, 1), seed, octave);
  return mix(mix(a, b, interpolation.x), mix(c, d, interpolation.x), interpolation.y);
}

float promptNoiseSegmentDistance(vec2 point, vec2 start, vec2 end) {
  vec2 segment = end - start;
  float factor = clamp(dot(point - start, segment) / max(dot(segment, segment), 0.0001), 0.0, 1.0);
  return length(point - mix(start, end, factor));
}

float promptNoiseRidgeStroke(vec2 logicalXZ, ivec2 cell, float cellSize) {
  float angle = promptNoiseSeededCell(cell, material_RidgeSeed, 17) * 6.28318530718;
  vec2 direction = vec2(cos(angle), sin(angle));
  vec2 perpendicular = vec2(-direction.y, direction.x);
  vec2 centerJitter = vec2(
    promptNoiseSeededCell(cell, material_RidgeSeed, 29),
    promptNoiseSeededCell(cell, material_RidgeSeed, 43)
  ) - 0.5;
  vec2 center = (vec2(cell) + vec2(0.5) + centerJitter * 0.42) * cellSize;
  float lengthScale = mix(0.72, 1.18, promptNoiseSeededCell(cell, material_RidgeSeed, 59));
  float bendScale = mix(-0.24, 0.24, promptNoiseSeededCell(cell, material_RidgeSeed, 71));
  float halfLength = cellSize * lengthScale * 0.5;
  vec2 start = center - direction * halfLength;
  vec2 middle = center + perpendicular * cellSize * bendScale;
  vec2 end = center + direction * halfLength;
  float distanceToStroke = min(
    promptNoiseSegmentDistance(logicalXZ, start, middle),
    promptNoiseSegmentDistance(logicalXZ, middle, end)
  );
  float width = cellSize * mix(0.14, 0.22, promptNoiseSeededCell(cell, material_RidgeSeed, 83));
  float profile = smoothstep(1.0, 0.0, distanceToStroke / width);
  return pow(profile, max(1.0, material_RidgeSharpness * 0.25));
}

float promptNoiseContinuousRidges(vec2 logicalXZ) {
  float cellSize = 1.0 / material_RidgeFrequency;
  ivec2 sourceCell = ivec2(floor(logicalXZ / cellSize));
  float ridge = 0.0;
  for (int offsetZ = -1; offsetZ <= 1; offsetZ++) {
    for (int offsetX = -1; offsetX <= 1; offsetX++) {
      ridge = max(ridge, promptNoiseRidgeStroke(logicalXZ, sourceCell + ivec2(offsetX, offsetZ), cellSize));
    }
  }
  float detail = promptNoiseSeededValue(logicalXZ * material_RidgeFrequency * 7.0, material_RidgeSeed, 97);
  return ridge * mix(0.82, 1.0, detail);
}

float promptNoiseStochasticHeight(vec2 logicalXZ) {
  vec2 noisePosition = (
    (logicalXZ + vec2(0.5)) / 1024.0 + material_WorldNoiseOffset.xz + material_FbmSeedOffset
  ) * material_WorldNoiseScale * 0.1;
  float terrain3dBackground = promptNoiseFbm(noisePosition) *
    material_WorldNoiseHeight * 10.0 + material_WorldNoiseOffset.y * 100.0;
  return terrain3dBackground + promptNoiseContinuousRidges(logicalXZ) * material_RidgeStrength;
}

vec4 promptNoiseOperatorTexel(int operatorIndex, int texelOffset) {
  int linearIndex = operatorIndex * 7 + texelOffset;
  ivec2 size = textureSize(material_OperatorTexels, 0);
  return texelFetch(material_OperatorTexels, ivec2(linearIndex % size.x, linearIndex / size.x), 0);
}

vec4 promptNoiseRiverSegmentTexel(int linearIndex) {
  ivec2 size = textureSize(material_RiverSegmentTexels, 0);
  return texelFetch(material_RiverSegmentTexels, ivec2(linearIndex % size.x, linearIndex / size.x), 0);
}

vec4 promptNoiseRiverCellTexel(int linearIndex) {
  ivec2 size = textureSize(material_RiverCellTexels, 0);
  return texelFetch(material_RiverCellTexels, ivec2(linearIndex % size.x, linearIndex / size.x), 0);
}

vec4 promptNoiseRiverProfile(int operatorIndex, float factor) {
  vec4 source = promptNoiseOperatorTexel(operatorIndex, 4);
  vec4 middle = promptNoiseOperatorTexel(operatorIndex, 5);
  vec4 mouth = promptNoiseOperatorTexel(operatorIndex, 6);
  return factor <= 0.5
    ? mix(source, middle, clamp(factor * 2.0, 0.0, 1.0))
    : mix(middle, mouth, clamp((factor - 0.5) * 2.0, 0.0, 1.0));
}

vec2 promptNoiseQuadraticBezierPoint(vec2 start, vec2 control, vec2 end, float factor) {
  float inverse = 1.0 - factor;
  return inverse * inverse * start + 2.0 * inverse * factor * control + factor * factor * end;
}

vec2 promptNoiseQuadraticBezierDistance(vec2 point, vec2 start, vec2 control, vec2 end) {
  float bestDistance = 1.0e20;
  float bestFactor = 0.0;
  vec2 segmentStart = start;
  const int segmentCount = 12;
  for (int index = 1; index <= segmentCount; index++) {
    float endFactor = float(index) / float(segmentCount);
    vec2 segmentEnd = promptNoiseQuadraticBezierPoint(start, control, end, endFactor);
    vec2 segment = segmentEnd - segmentStart;
    float localFactor = clamp(dot(point - segmentStart, segment) / max(dot(segment, segment), 0.0001), 0.0, 1.0);
    float candidateDistance = length(point - mix(segmentStart, segmentEnd, localFactor));
    if (candidateDistance < bestDistance) {
      bestDistance = candidateDistance;
      bestFactor = (float(index - 1) + localFactor) / float(segmentCount);
    }
    segmentStart = segmentEnd;
  }
  return vec2(bestDistance, bestFactor);
}

void promptNoiseRiverCurve(vec4 header, vec4 placement, vec4 shape, out vec2 start, out vec2 control, out vec2 end) {
  vec2 forward = normalize(placement.zw);
  vec2 right = vec2(-forward.y, forward.x);
  float halfLength = shape.x * 0.5;
  start = placement.xy - forward * halfLength;
  control = placement.xy + right * shape.y;
  end = placement.xy + forward * halfLength;
}

void promptNoiseRiverSample(
  int operatorIndex,
  vec2 logicalXZ,
  vec4 placement,
  vec4 shape,
  vec4 bedProfile,
  out vec4 riverGeometryOut,
  out vec4 riverProperties
) {
  vec4 fieldBinding = promptNoiseOperatorTexel(operatorIndex, 4);
  if (fieldBinding.w > 0.5) {
    vec4 fieldGrid = promptNoiseOperatorTexel(operatorIndex, 5);
    vec4 fieldSize = promptNoiseOperatorTexel(operatorIndex, 6);
    ivec2 gridSize = ivec2(fieldSize.xy + vec2(0.5));
    ivec2 cell = clamp(
      ivec2(floor((logicalXZ - fieldGrid.xy) / max(fieldGrid.zw, vec2(0.00001)))),
      ivec2(0),
      gridSize - ivec2(1)
    );
    int cellIndex = int(fieldBinding.z + 0.5) + cell.y * gridSize.x + cell.x;
    float bestDistance = 1.0e20;
    float bestFactor = 0.0;
    float bestBedHeight = 0.0;
    float bestWidth = 0.0;
    float bestDepth = 0.0;
    float bestBankFeather = 0.0;
    float bestFlowSpeed = 0.0;
    for (int slot = 0; slot < 8; slot++) {
      vec4 indices = promptNoiseRiverCellTexel(cellIndex * 2 + slot / 4);
      int component = slot - (slot / 4) * 4;
      float oneBasedIndex = indices.x;
      if (component == 1) oneBasedIndex = indices.y;
      if (component == 2) oneBasedIndex = indices.z;
      if (component == 3) oneBasedIndex = indices.w;
      if (oneBasedIndex < 0.5) continue;
      int segmentIndex = int(oneBasedIndex + 0.5) - 1;
      vec4 segmentXZ = promptNoiseRiverSegmentTexel(segmentIndex * 4);
      vec4 segmentBedWidth = promptNoiseRiverSegmentTexel(segmentIndex * 4 + 1);
      vec4 segmentDepthBank = promptNoiseRiverSegmentTexel(segmentIndex * 4 + 2);
      vec4 segmentFlowFactor = promptNoiseRiverSegmentTexel(segmentIndex * 4 + 3);
      vec2 segment = segmentXZ.zw - segmentXZ.xy;
      float localFactor = clamp(
        dot(logicalXZ - segmentXZ.xy, segment) / max(dot(segment, segment), 0.0001),
        0.0,
        1.0
      );
      float candidateDistance = length(logicalXZ - mix(segmentXZ.xy, segmentXZ.zw, localFactor));
      if (candidateDistance < bestDistance) {
        bestDistance = candidateDistance;
        bestFactor = mix(segmentFlowFactor.z, segmentFlowFactor.w, localFactor);
        bestBedHeight = mix(segmentBedWidth.x, segmentBedWidth.y, localFactor);
        bestWidth = mix(segmentBedWidth.z, segmentBedWidth.w, localFactor);
        bestDepth = mix(segmentDepthBank.x, segmentDepthBank.y, localFactor);
        bestBankFeather = mix(segmentDepthBank.z, segmentDepthBank.w, localFactor);
        bestFlowSpeed = mix(segmentFlowFactor.x, segmentFlowFactor.y, localFactor);
      }
    }
    riverGeometryOut = vec4(bestDistance, bestFactor, bestBedHeight, bestWidth);
    riverProperties = vec4(bestDepth, bestBankFeather, bestFlowSpeed, 1.0);
  } else {
    vec2 start;
    vec2 control;
    vec2 end;
    promptNoiseRiverCurve(vec4(0.0), placement, shape, start, control, end);
    vec2 curve = promptNoiseQuadraticBezierDistance(logicalXZ, start, control, end);
    vec4 legacyProfile = promptNoiseRiverProfile(operatorIndex, curve.y);
    riverGeometryOut = vec4(curve.x, curve.y, mix(bedProfile.x, bedProfile.y, curve.y), legacyProfile.x);
    riverProperties = vec4(legacyProfile.yzw, 0.0);
  }
}

float promptNoiseDiskWeight(vec2 logicalXZ, vec2 center, float radius, float falloff) {
  float innerRadius = max(radius - falloff, 0.0);
  return 1.0 - smoothstep(innerRadius, radius, distance(logicalXZ, center));
}

float promptNoiseRiverTerrainCrossSectionHeight(
  float distanceToCenter,
  float fullWidth,
  float bedHeight,
  float depth,
  float bankFeather,
  float bankWidth,
  float bankHeight
) {
  float halfWidth = fullWidth * 0.5;
  float surfaceHeight = bedHeight + depth;
  float submergedBankWidth = min(halfWidth, max(bankFeather, depth));
  float submergedBankFactor = smoothstep(
    halfWidth - submergedBankWidth,
    halfWidth,
    distanceToCenter
  );
  if (distanceToCenter <= halfWidth) {
    return mix(bedHeight, surfaceHeight, submergedBankFactor);
  }
  float dryDistance = distanceToCenter - halfWidth;
  float dryShoreFactor = smoothstep(0.0, max(bankFeather, 0.05), dryDistance);
  float bankFactor = clamp(dryDistance / max(bankWidth, 0.00001), 0.0, 1.0);
  float shoreProtectionHeight = max(0.12, depth * 0.25);
  return surfaceHeight
    + shoreProtectionHeight * dryShoreFactor
    + bankHeight * bankFactor * bankFactor;
}

float promptNoiseShapeHeight(vec2 logicalXZ) {
  float height = promptNoiseStochasticHeight(logicalXZ);
  for (int operatorIndex = 0; operatorIndex < material_OperatorCount; operatorIndex++) {
    vec4 header = promptNoiseOperatorTexel(operatorIndex, 0);
    int kind = int(header.x + 0.5);
    if (header.y < 0.5 || kind == 3) continue;
    vec4 placement = promptNoiseOperatorTexel(operatorIndex, 1);
    vec4 shape = promptNoiseOperatorTexel(operatorIndex, 2);
    vec4 bedProfile = promptNoiseOperatorTexel(operatorIndex, 3);
    if (kind == 1) {
      vec4 riverGeometry;
      vec4 riverProperties;
      promptNoiseRiverSample(operatorIndex, logicalXZ, placement, shape, bedProfile, riverGeometry, riverProperties);
      float halfWidth = riverGeometry.w * 0.5;
      float bankFactor = clamp((riverGeometry.x - halfWidth) / shape.w, 0.0, 1.0);
      float influence = 1.0 - pow(bankFactor, max(bedProfile.w, 0.05));
      float riverHeight = riverProperties.w > 0.5
        ? promptNoiseRiverTerrainCrossSectionHeight(
            riverGeometry.x,
            riverGeometry.w,
            riverGeometry.z,
            riverProperties.x,
            riverProperties.y,
            shape.w,
            bedProfile.z
          )
        : riverGeometry.z + bedProfile.z * bankFactor * bankFactor;
      height = mix(height, riverHeight, influence);
    } else if (kind == 2) {
      float influence = promptNoiseDiskWeight(logicalXZ, placement.xy, shape.x, shape.y);
      height = mix(height, shape.z, influence * shape.w);
    }
  }
  return height;
}

float promptNoiseRiverCorridorWeight(vec2 logicalXZ) {
  float weight = 0.0;
  for (int operatorIndex = 0; operatorIndex < material_OperatorCount; operatorIndex++) {
    vec4 header = promptNoiseOperatorTexel(operatorIndex, 0);
    if (header.y < 0.5 || int(header.x + 0.5) != 1) continue;
    vec4 placement = promptNoiseOperatorTexel(operatorIndex, 1);
    vec4 shape = promptNoiseOperatorTexel(operatorIndex, 2);
    vec4 bedProfile = promptNoiseOperatorTexel(operatorIndex, 3);
    vec4 riverGeometry;
    vec4 riverProfile;
    promptNoiseRiverSample(operatorIndex, logicalXZ, placement, shape, bedProfile, riverGeometry, riverProfile);
    float halfWidth = riverGeometry.w * 0.5;
    weight = max(
      weight,
      1.0 - smoothstep(halfWidth, halfWidth + max(shape.w, 0.00001), riverGeometry.x)
    );
  }
  return weight;
}

// Same bounded River Field used by height, Water projection, Semantic Field,
// and C2-D scene placement. x=riverbed, y=wet edge, z=erosion apron.
vec3 promptNoiseRiverTerrainLayer(vec2 logicalXZ) {
  vec3 layer = vec3(0.0);
  for (int operatorIndex = 0; operatorIndex < material_OperatorCount; operatorIndex++) {
    vec4 header = promptNoiseOperatorTexel(operatorIndex, 0);
    if (header.y < 0.5 || int(header.x + 0.5) != 1) continue;
    vec4 placement = promptNoiseOperatorTexel(operatorIndex, 1);
    vec4 shape = promptNoiseOperatorTexel(operatorIndex, 2);
    vec4 bedProfile = promptNoiseOperatorTexel(operatorIndex, 3);
    vec4 riverGeometry;
    vec4 riverProperties;
    promptNoiseRiverSample(operatorIndex, logicalXZ, placement, shape, bedProfile, riverGeometry, riverProperties);
    float halfWidth = riverGeometry.w * 0.5;
    float shoreWidth = max(riverProperties.y, 0.05);
    float erosionWidth = max(shape.w * 0.35, shoreWidth);
    layer.x = max(
      layer.x,
      1.0 - smoothstep(halfWidth * 0.65, halfWidth + shoreWidth, riverGeometry.x)
    );
    layer.y = max(
      layer.y,
      1.0 - smoothstep(halfWidth, halfWidth + shoreWidth, riverGeometry.x)
    );
    layer.z = max(
      layer.z,
      1.0 - smoothstep(
        halfWidth + shoreWidth,
        halfWidth + shoreWidth + erosionWidth,
        riverGeometry.x
      )
    );
  }
  return layer;
}

float promptNoiseHeight(vec2 logicalXZ) {
  float shapeHeight = promptNoiseShapeHeight(logicalXZ);
  float height = shapeHeight;
  for (int operatorIndex = 0; operatorIndex < material_OperatorCount; operatorIndex++) {
    vec4 header = promptNoiseOperatorTexel(operatorIndex, 0);
    if (header.y < 0.5 || int(header.x + 0.5) != 3) continue;
    vec4 placement = promptNoiseOperatorTexel(operatorIndex, 1);
    vec4 shape = promptNoiseOperatorTexel(operatorIndex, 2);
    float influence = promptNoiseDiskWeight(logicalXZ, placement.xy, shape.x, shape.y) *
      (1.0 - promptNoiseRiverCorridorWeight(logicalXZ));
    if (influence <= 0.0) continue;
    float radius = shape.z;
    float average = (
      shapeHeight +
      promptNoiseShapeHeight(logicalXZ + vec2(radius, 0.0)) +
      promptNoiseShapeHeight(logicalXZ - vec2(radius, 0.0)) +
      promptNoiseShapeHeight(logicalXZ + vec2(0.0, radius)) +
      promptNoiseShapeHeight(logicalXZ - vec2(0.0, radius))
    ) * 0.2;
    height = mix(height, average, influence * shape.w);
  }
  return height;
}

vec4 promptNoiseFormulaMasks(vec2 logicalXZ) {
  vec3 masks = vec3(0.0);
  float selected = 0.0;
  for (int operatorIndex = 0; operatorIndex < material_OperatorCount; operatorIndex++) {
    vec4 header = promptNoiseOperatorTexel(operatorIndex, 0);
    if (header.y < 0.5) continue;
    int kind = int(header.x + 0.5);
    vec4 placement = promptNoiseOperatorTexel(operatorIndex, 1);
    vec4 shape = promptNoiseOperatorTexel(operatorIndex, 2);
    float influence = 0.0;
    if (kind == 1) {
      vec4 bedProfile = promptNoiseOperatorTexel(operatorIndex, 3);
      vec4 riverGeometry;
      vec4 riverProfile;
      promptNoiseRiverSample(operatorIndex, logicalXZ, placement, shape, bedProfile, riverGeometry, riverProfile);
      float halfWidth = riverGeometry.w * 0.5;
      influence = 1.0 - smoothstep(halfWidth, halfWidth + shape.w, riverGeometry.x);
      masks.r = max(masks.r, influence);
    } else if (kind == 2) {
      influence = promptNoiseDiskWeight(logicalXZ, placement.xy, shape.x, shape.y);
      masks.g = max(masks.g, influence);
    } else {
      influence = promptNoiseDiskWeight(logicalXZ, placement.xy, shape.x, shape.y);
      masks.b = max(masks.b, influence);
    }
    if (int(header.w + 0.5) == material_SelectedOperatorId) selected = max(selected, influence);
  }
  return vec4(masks, selected);
}

struct PromptNoiseClipmapVertex {
  vec3 positionWS;
  vec2 logicalXZ;
  float morph;
};

float promptNoiseClipmapMorphFactor(vec2 sourceXZ) {
  float levelSpacing = material_TerrainVertexSpacing * exp2(renderer_Lod);
  float cameraDistance = length(sourceXZ - material_TerrainViewPosition.xz);
  float transition = (
    cameraDistance / levelSpacing - renderer_ClipmapMeshSize - 4.0
  ) / (renderer_ClipmapMeshSize - 2.0);
  return smoothstep(0.55, 0.95, transition);
}

vec2 promptNoiseClipmapVertexShift(vec3 positionOS, vec2 sourceXZ) {
  float levelSpacing = material_TerrainVertexSpacing * exp2(renderer_Lod);
  vec2 levelGrid = sourceXZ / levelSpacing;
  vec2 vertexParity = fract(positionOS.xz * 0.5) * 2.0;
  if (renderer_Lod < 0.5) {
    float diagonalParity = round(fract(round(mod(levelGrid.y, 4.0)) * round(mod(levelGrid.x, 4.0)) * 0.25));
    return mix(vertexParity, vec2(vertexParity.x, -vertexParity.y), diagonalParity);
  }
  return vertexParity * round((fract(levelGrid * 0.25) - 0.5) * 4.0);
}

PromptNoiseClipmapVertex promptNoiseClipmapVertexAt(vec3 positionOS) {
  PromptNoiseClipmapVertex result;
  vec4 homogeneousPositionWS = renderer_ModelMat * vec4(positionOS, 1.0);
  vec3 sourcePositionWS = homogeneousPositionWS.xyz / homogeneousPositionWS.w;
  vec2 sourceXZ = sourcePositionWS.xz;
  vec2 sourceLogicalXZ = sourceXZ + material_WorldOrigin;
  float sourceHeight = promptNoiseHeight(sourceLogicalXZ);
  result.morph = promptNoiseClipmapMorphFactor(sourceXZ);
  float levelSpacing = material_TerrainVertexSpacing * exp2(renderer_Lod);
  vec2 targetXZ = sourceXZ - promptNoiseClipmapVertexShift(positionOS, sourceXZ) * levelSpacing;
  vec2 targetLogicalXZ = targetXZ + material_WorldOrigin;
  float targetHeight = promptNoiseHeight(targetLogicalXZ);
  result.positionWS = vec3(
    mix(sourceXZ.x, targetXZ.x, result.morph),
    mix(sourceHeight, targetHeight, result.morph),
    mix(sourceXZ.y, targetXZ.y, result.morph)
  );
  result.logicalXZ = mix(sourceLogicalXZ, targetLogicalXZ, result.morph);
  return result;
}

vec3 promptNoiseGeometryNormal(vec2 logicalXZ) {
  float spacing = material_TerrainVertexSpacing;
  float height = promptNoiseHeight(logicalXZ);
  float rightHeight = promptNoiseHeight(logicalXZ + vec2(spacing, 0.0));
  float frontHeight = promptNoiseHeight(logicalXZ + vec2(0.0, spacing));
  return normalize(vec3(height - rightHeight, spacing, height - frontHeight));
}

#endif
