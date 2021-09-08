uniform sampler2D u_baseTexture;

varying vec2 v_uv;

void main() {
  gl_FragColor = texture2D(u_baseTexture, v_uv);
}