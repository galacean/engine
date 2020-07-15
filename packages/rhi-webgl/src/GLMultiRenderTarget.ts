import { WebGLRenderer } from "./WebGLRenderer";
import { MultiRenderTarget } from "@alipay/o3-material";
import { GLTexture2D } from "./GLTexture2D";
import { GLRenderTarget } from "./GLRenderTarget";

export class GLMultiRenderTarget extends GLRenderTarget {
  private _glTextures: GLTexture2D[] = [];
  private buffers: number[] = [];

  constructor(rhi: WebGLRenderer, config: MultiRenderTarget) {
    super(rhi, config);
    // todo:delete
    if (this._isNew) return;

    this.activeRenderTarget();
    if (config.depthTexture) {
      this.glDepthTexture = this.initDepthTexture(config.depthTexture);
    } else {
      this.depthRenderBuffer = this.initDepthRenderBuffer();
    }

    config.textures.forEach((texture, index) => {
      this._glTextures.push(this.initColorTexture(texture, index));
      this.buffers.push(this.rhi.gl.COLOR_ATTACHMENT0 + index);
    });

    this.checkFrameBuffer();

    this.rhi.gl.drawBuffers(this.buffers);
  }

  finalize() {
    // todo:delete
    if (this._isNew) return;

    super.finalize();
    this._glTextures.forEach((texture) => {
      texture.finalize();
    });
    this._glTextures = [];
    this.buffers = [];
  }
}
