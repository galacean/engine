uniform sampler2D material_BaseTexture;

varying vec2 v_uv;

void main() {
  gl_FragColor = texture2D(material_BaseTexture, v_uv);
}