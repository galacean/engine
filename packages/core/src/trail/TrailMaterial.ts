import { Engine } from "../Engine";
import { BaseMaterial, BlendMode } from "../material";
import { CullMode, Shader } from "../shader";

export class TrailMaterial extends BaseMaterial {
    constructor(engine: Engine) {
        super(engine, Shader.find("trail-shader"));

        this.isTransparent = true;
        this.blendMode = BlendMode.Additive;
        this.renderState.rasterState.cullMode = CullMode.Off;
    }
}
