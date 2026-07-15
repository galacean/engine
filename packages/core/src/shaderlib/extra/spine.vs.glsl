uniform mat4 renderer_MVPMat;

attribute vec3 POSITION;
attribute vec2 TEXCOORD_0;
attribute vec4 LIGHT_COLOR;

#ifdef RENDERER_TINT_BLACK
  attribute vec3 DARK_COLOR;
#endif

varying vec2 v_uv;
varying vec4 v_lightColor;

#ifdef RENDERER_TINT_BLACK
  varying vec3 v_darkColor;
#endif

#ifdef RENDERER_UI_RECT_CLIP
  // Spine vertices are entity-local (unlike UI chunk vertices, which are pre-transformed to
  // world space), so the rect-clip world position must be derived from the model matrix.
  uniform mat4 renderer_ModelMat;
  varying vec2 v_worldPosition;
#endif

void main()
{
  gl_Position = renderer_MVPMat * vec4(POSITION, 1.0);

  v_uv = TEXCOORD_0;
  v_lightColor = LIGHT_COLOR;

  #ifdef RENDERER_TINT_BLACK
    v_darkColor = DARK_COLOR;
  #endif

  #ifdef RENDERER_UI_RECT_CLIP
    v_worldPosition = (renderer_ModelMat * vec4(POSITION, 1.0)).xy;
  #endif
}
