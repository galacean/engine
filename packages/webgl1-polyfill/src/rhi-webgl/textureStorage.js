export function textureStorage(isCube) {
  const gl = this._gl;
  const { internalFormat, baseFormat, dataType } = this._formatDetail;
  const { mipmapCount, width, height, _isDepthTexture } = this._texture;
  this._bind();
  if (!isCube) {
    if (_isDepthTexture) {
      gl.texImage2D(this._target, 0, internalFormat, width, height, 0, baseFormat, dataType, null);
    } else {
      for (let i = 0; i < mipmapCount; i++) {
        const mipWidth = Math.max(1, width >> i);
        const mipHeight = Math.max(1, height >> i);
        gl.texImage2D(this._target, i, internalFormat, mipWidth, mipHeight, 0, baseFormat, dataType, null);
      }
    }
  } else {
    for (let i = 0; i < mipmapCount; i++) {
      const size = Math.max(1, width >> i);
      for (let faceIndex = 0; faceIndex < 6; faceIndex++) {
        gl.texImage2D(
          gl.TEXTURE_CUBE_MAP_POSITIVE_X + faceIndex,
          i,
          internalFormat,
          size,
          size,
          0,
          baseFormat,
          dataType,
          null
        );
      }
    }
  }
}
