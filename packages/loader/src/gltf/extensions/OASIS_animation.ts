import { AnimationClip, AnimationEvent } from "@oasis-engine/core";
import { GLTFResource } from "../GLTFResource";
import { GLTFExtensionOwnerSchema } from "../GLTFSchema";
import { registerGLTFExtension } from "../parser/GLTFParser";
import { GLTFParserContext } from "../parser/GLTFParserContext";
import { GLTFExtensionMode, GLTFExtensionParser } from "./GLTFExtensionParser";
import { IOasisAnimation } from "./GLTFExtensionSchema";

@registerGLTFExtension("OASIS_animation_event", GLTFExtensionMode.AdditiveParse)
class OASIS_animation extends GLTFExtensionParser {
  /**
   * @override
   */
  additiveParse(context: GLTFParserContext, animationClip: AnimationClip, schema: IOasisAnimation): Promise<void> {
    const { engine } = context.glTFResource;
    const { events } = schema;
    return Promise.all(
      events.map((eventData) => {
        return new Promise<void>((resolve) => {
          const event = new AnimationEvent();
          event.functionName = eventData.functionName;
          event.time = eventData.time;
          event.parameter = eventData.parameter;
          animationClip.addEvent(event);
          resolve();
        });
      })
    ).then((res) => {
      return null;
    });
  }
}
