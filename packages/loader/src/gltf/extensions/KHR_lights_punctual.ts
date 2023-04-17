import { DirectLight, Entity, PointLight, SpotLight } from "@galacean/engine-core";
import { registerGLTFExtension } from "../parser/GLTFParser";
import { GLTFParserContext } from "../parser/GLTFParserContext";
import { GLTFExtensionMode, GLTFExtensionParser } from "./GLTFExtensionParser";
import { IKHRLightsPunctual, IKHRLightsPunctual_LightNode } from "./GLTFExtensionSchema";

@registerGLTFExtension("KHR_lights_punctual", GLTFExtensionMode.AdditiveParse)
class KHR_lights_punctual extends GLTFExtensionParser {
  override additiveParse(
    context: GLTFParserContext,
    entity: Entity,
    extensionSchema: IKHRLightsPunctual_LightNode
  ): void {
    const lightsSchema = (<IKHRLightsPunctual>context.glTF.extensions.KHR_lights_punctual).lights;
    const lightSchema = lightsSchema[extensionSchema.light];

    const { color, intensity = 1, type, range, spot } = lightSchema;
    const glTFResource = context.glTFResource;
    let light: DirectLight | PointLight | SpotLight;

    if (type === "directional") {
      light = entity.addComponent(DirectLight);
    } else if (type === "point") {
      light = entity.addComponent(PointLight);
    } else if (type === "spot") {
      light = entity.addComponent(SpotLight);
    }

    if (color) {
      light.color.set(color[0], color[1], color[2], 1);
    }

    light.intensity = intensity;

    if (range && !(light instanceof DirectLight)) {
      light.distance = range;
    }

    if (spot && light instanceof SpotLight) {
      const { innerConeAngle = 0, outerConeAngle = Math.PI / 4 } = spot;

      light.angle = innerConeAngle;
      light.penumbra = outerConeAngle - innerConeAngle;
    }

    if (!glTFResource.lights) glTFResource.lights = [];
    glTFResource.lights.push(light);
  }
}
