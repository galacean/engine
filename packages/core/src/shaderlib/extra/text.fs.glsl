uniform sampler2D renderElement_TextTexture;
uniform vec2 renderElement_TextTextureSize;
uniform vec4 renderer_OutlineColor;
uniform float renderer_OutlineWidth;

uniform vec4 renderer_UIRectClipRect;
uniform float renderer_UIRectClipEnabled;
uniform vec4 renderer_UIRectClipSoftness;
uniform float renderer_UIRectClipHardClip;

varying vec2 v_uv;
varying vec4 v_color;
varying vec2 v_worldPosition;

float getUIRectClipAlpha()
{
  vec4 edgeDistance = vec4(
    v_worldPosition.x - renderer_UIRectClipRect.x,
    v_worldPosition.y - renderer_UIRectClipRect.y,
    renderer_UIRectClipRect.z - v_worldPosition.x,
    renderer_UIRectClipRect.w - v_worldPosition.y
  );
  vec4 hardClipFactor = step(vec4(0.0), edgeDistance);
  vec4 softness = max(renderer_UIRectClipSoftness, vec4(1e-5));
  vec4 softClipFactor = clamp(edgeDistance / softness, 0.0, 1.0);
  vec4 useSoftness = step(vec4(1e-5), renderer_UIRectClipSoftness);
  vec4 clipFactor = mix(hardClipFactor, softClipFactor, useSoftness);
  return clipFactor.x * clipFactor.y * clipFactor.z * clipFactor.w;
}

float sampleCoverage(vec2 uv)
{
  vec4 c = texture2D(renderElement_TextTexture, uv);
  #ifdef GRAPHICS_API_WEBGL2
    return c.r;
  #else
    return c.a;
  #endif
}

void main()
{
  float rectClipAlpha = 1.0;
  if (renderer_UIRectClipEnabled > 0.5) {
    rectClipAlpha = getUIRectClipAlpha();
  }

  float coverage = sampleCoverage(v_uv);
  vec4 finalColor;

  if (renderer_OutlineWidth > 0.0) {
    vec2 texelSize = 1.0 / renderElement_TextTextureSize;
    vec2 step = texelSize * renderer_OutlineWidth;
    float outlineCoverage = coverage;
    outlineCoverage = max(outlineCoverage, sampleCoverage(v_uv + vec2( step.x,  0.0)));
    outlineCoverage = max(outlineCoverage, sampleCoverage(v_uv + vec2(-step.x,  0.0)));
    outlineCoverage = max(outlineCoverage, sampleCoverage(v_uv + vec2( 0.0,  step.y)));
    outlineCoverage = max(outlineCoverage, sampleCoverage(v_uv + vec2( 0.0, -step.y)));
    outlineCoverage = max(outlineCoverage, sampleCoverage(v_uv + vec2( step.x * 0.7071,  step.y * 0.7071)));
    outlineCoverage = max(outlineCoverage, sampleCoverage(v_uv + vec2(-step.x * 0.7071,  step.y * 0.7071)));
    outlineCoverage = max(outlineCoverage, sampleCoverage(v_uv + vec2( step.x * 0.7071, -step.y * 0.7071)));
    outlineCoverage = max(outlineCoverage, sampleCoverage(v_uv + vec2(-step.x * 0.7071, -step.y * 0.7071)));

    vec3 rgb = mix(renderer_OutlineColor.rgb, v_color.rgb, coverage);
    float alpha = max(coverage, outlineCoverage * renderer_OutlineColor.a) * v_color.a;
    finalColor = vec4(rgb, alpha);
  } else {
    finalColor = vec4(v_color.rgb, v_color.a * coverage);
  }

  finalColor.a *= rectClipAlpha;
  if (renderer_UIRectClipEnabled > 0.5 && renderer_UIRectClipHardClip > 0.5 && finalColor.a < 0.001) {
    discard;
  }
  gl_FragColor = finalColor;
}
