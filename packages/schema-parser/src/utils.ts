export function switchElementsIndex(elements: any[], currentIndex: number, targetIndex: number) {
  [elements[currentIndex], elements[targetIndex]] = [elements[targetIndex], elements[currentIndex]];
}
