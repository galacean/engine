export function switchElementsIndex(elements: any[], currentIndex: number, targetIndex: number) {
  if (currentIndex === targetIndex || targetIndex === null || targetIndex === undefined) {
    return;
  }
  [elements[currentIndex], elements[targetIndex]] = [elements[targetIndex], elements[currentIndex]];
}
