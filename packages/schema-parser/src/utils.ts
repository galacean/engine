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
