#ifndef MASONRY_WALL_BAKE_INCLUDED
#define MASONRY_WALL_BAKE_INCLUDED
#ifdef RENDERER_MASONRY_WALL_BAKE
#if defined(RENDERER_MASONRY_WALL_ARRAY) && defined(RENDERER_MASONRY_WALL_LAYOUT)
uniform highp sampler2DArray renderer_WallBakeLayers;
#else
uniform highp sampler2D renderer_WallBakeAtlas;
#endif
#ifdef RENDERER_MASONRY_WALL_LAYOUT
#ifndef RENDERER_MASONRY_WALL_DIRECT
uniform highp sampler2D renderer_WallBakeRecords;
#endif
uniform int renderer_WallBakeChart;
#ifdef RENDERER_MASONRY_WALL_LARGE_PALETTE
uniform highp sampler2D renderer_WallBakePalette;
#else
uniform vec4 renderer_WallBakeColors[16];
#endif
#ifndef RENDERER_MASONRY_WALL_DIRECT
vec4 masonryWallRecord(int index) {
  int width = textureSize(renderer_WallBakeRecords, 0).x;
  return texelFetch(renderer_WallBakeRecords, ivec2(index % width, index / width), 0);
}
#endif
vec3 masonryWallLamp(int index) {
  #ifdef RENDERER_MASONRY_WALL_LARGE_PALETTE
    int width = textureSize(renderer_WallBakePalette, 0).x;
    return texelFetch(renderer_WallBakePalette, ivec2(index % width, index / width), 0).rgb;
  #else
    return renderer_WallBakeColors[index].rgb;
  #endif
}
vec4 masonryWallProject(vec2 encoded, out vec2 atlasUV, out vec4 colorLayer, out vec4 bounds) {
  #ifdef RENDERER_MASONRY_WALL_DIRECT
  int tag = int(floor(encoded.x));
  atlasUV = vec2(fract(encoded.x), encoded.y);
  colorLayer = vec4(tag > 0 ? masonryWallLamp(max(tag-1,0)) : vec3(0.0), 0.0);
  bounds = vec4(0.0);
  return vec4(0.0);
  #else
  int chart = renderer_WallBakeChart > 0 ? renderer_WallBakeChart : int(floor(encoded.x));
  vec4 head = masonryWallRecord(encoded.y < -1e18 ? 0 : chart);
  vec2 local = vec2(encoded.x - float(chart), encoded.y);
  atlasUV = vec2(0.0);
  colorLayer = vec4(0.0);
  bounds = vec4(0.0);
  if (head.y > 0.5) {
    int record = int(head.x);
    vec4 uvMap = masonryWallRecord(record);
    vec4 source = masonryWallRecord(record + 2);
    atlasUV = local * uvMap.xy + uvMap.zw;
    bounds = masonryWallRecord(record + 1);
    colorLayer = vec4(masonryWallLamp(int(source.x)), source.y);
  }
  return vec4(local, head.x + 3.0, max(0.0, head.y - 1.0));
  #endif
}
vec3 masonryWallSample(vec2 uv, vec4 colorLayer, vec4 bounds) {
  #ifndef RENDERER_MASONRY_WALL_DIRECT
  if (any(lessThan(uv, bounds.xy)) || any(greaterThan(uv, bounds.zw))) return vec3(0.0);
  #endif
  #ifdef RENDERER_MASONRY_WALL_ARRAY
    return texture(renderer_WallBakeLayers, vec3(uv, colorLayer.w)).r * colorLayer.rgb;
  #else
    return texture2D(renderer_WallBakeAtlas, uv).r * colorLayer.rgb;
  #endif
}
#ifdef RENDERER_MASONRY_WALL_OVERLAP
vec3 masonryWallAdditional(vec4 extra) {
  vec3 radiance = vec3(0.0);
  #ifndef RENDERER_MASONRY_WALL_DIRECT
  int end = int(extra.z + 3.0 * extra.w + 0.5);
  for (int record = int(extra.z + 0.5); record < end; record += 3) {
    vec4 map = masonryWallRecord(record);
    vec2 uv = extra.xy * map.xy + map.zw;
    vec4 bounds = masonryWallRecord(record + 1);
    if (all(greaterThanEqual(uv,bounds.xy)) && all(lessThanEqual(uv,bounds.zw))) {
      vec4 source = masonryWallRecord(record + 2);
      vec4 colorLayer = vec4(masonryWallLamp(int(source.x)), source.y);
      radiance += masonryWallSample(uv,colorLayer,bounds);
    }
  }
  #endif
  return radiance;
}
#endif
#else
uniform vec3 renderer_WallBakeTint;
vec3 masonryWallIrradiance(vec2 uv) {
  return texture2D(renderer_WallBakeAtlas, uv).r * renderer_WallBakeTint;
}
#endif
#endif
#endif
