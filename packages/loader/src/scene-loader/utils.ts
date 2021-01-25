export function switchElementsIndex(elements: any[], currentIndex: number, targetIndex: number) {
  if (currentIndex === targetIndex || targetIndex === null || targetIndex === undefined) {
    return;
  }
  [elements[currentIndex], elements[targetIndex]] = [elements[targetIndex], elements[currentIndex]];
}

export function isAsset(config: any): boolean {
  return config && config.type === "asset";
}

export function getAllGetters(obj: any): Array<string> {
  const result = [];
  const prototype = Object.getPrototypeOf(obj);
  const prototype_property_descriptors = Object.getOwnPropertyDescriptors(prototype);
  for (const [property, descriptor] of Object.entries(prototype_property_descriptors)) {
    if (typeof descriptor.get === "function") {
      result.push(property);
    }
  }
  return result;
}

export function union(arr1: Array<any>, arr2: Array<any>): Array<any> {
  return arr1.concat(arr2.filter((v) => !(arr1.indexOf(v) > -1)));
}

// https://github.com/BabylonJS/Babylon.js/blob/d780145531ac1b1cee85cbfba4d836dcc24ab58e/src/Engines/Extensions/engine.textureSelector.ts#L70
// Intelligently add supported compressed formats in order to check for.
// Check for ASTC support first as it is most powerful and to be very cross platform.
// Next PVRTC & DXT, which are probably superior to ETC1/2.
// Likely no hardware which supports both PVR & DXT, so order matters little.
// ETC2 is newer and handles ETC1 (no alpha capability), so check for first.
export const compressedTextureLoadOrder = {
  astc: 1,
  s3tc: 2,
  pvrtc: 3,
  etc: 4,
  etc1: 5
};
