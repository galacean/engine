import { AnimationEvent } from "@oasis-engine/core";
import { registerExtension } from "../parser/Parser";
import { ParserContext } from "../parser/ParserContext";
import { ExtensionParser } from "./ExtensionParser";
import { IOasisAnimation } from "./Schema";

// @ts-ignore
@registerExtension("OASIS_animation")
class OASIS_animation extends ExtensionParser {
  // @ts-ignore
  createEngineResource(schema: IOasisAnimation, context: ParserContext): Promise<AnimationEvent[]> {
    const { engine } = context.glTFResource;
    const { events } = schema;
    return Promise.all(
      events.map((eventData) => {
        return new Promise<AnimationEvent>((resolve) => {
          const event = new AnimationEvent();
          event.functionName = eventData.functionName;
          event.time = eventData.time;
          if (eventData?.parameter?.refId) {
            // @ts-ignore
            engine.resourceManager.getResourceByRef(eventData.parameter).then((asset) => {
              eventData.parameter = asset;
              event.parameter = eventData.parameter;
              resolve(event);
            });
          } else {
            event.parameter = eventData.parameter;
            resolve(event);
          }
        });
      })
    );
  }
}
