import { Engine } from "../Engine";
import { BaseMaterial } from "../material";
import { CullMode, Shader } from "../shader";

export class TrailMaterial extends BaseMaterial {
    constructor(engine: Engine) {
        super(engine, Shader.find("trail-shader"));
        
        this.isTransparent = true;
        this.renderState.rasterState.cullMode = CullMode.Off;
    }
}