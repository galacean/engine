import {log, errorLog} from '../log'

/**
 * @class TextureHook
 */
export default class TextureHook {
  public textures: number = 0
  private realCreateTexture: any
  private realDeleteTexture: any
  private hooked:boolean
  private gl: WebGLRenderingContext

  constructor (gl: WebGLRenderingContext) {
    this.realCreateTexture = gl.createTexture
    this.realDeleteTexture = gl.deleteTexture

    gl.createTexture = this.hookedCreateTexture.bind(this)
    gl.deleteTexture = this.hookedDeleteTexture.bind(this)

    this.hooked = true
    this.gl = gl

    log(`Texture is hooked.`)
  }

  private hookedCreateTexture() {
    let texture = this.realCreateTexture.call(this.gl)

    this.textures++

    log(`CreateTexture:`, texture, `textures: ${this.textures}`)

    return texture
  }

  private hookedDeleteTexture(texture:any) {
    this.realDeleteTexture.call(this.gl, texture)

    this.textures--

    log(`DeleteTexture. textures: ${this.textures}`)
  }

  public reset () {
    this.textures = 0
  }

  public release () {
    if (this.hooked) {
      this.gl.createTexture = this.realCreateTexture
      this.gl.deleteTexture = this.realDeleteTexture
    }

    this.hooked = false
  }
}