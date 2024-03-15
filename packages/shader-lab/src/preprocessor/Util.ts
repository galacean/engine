export class Util {
  static replaceSegments(source: string, segments: IReplaceSegment[]) {
    if (segments.length === 0) return source;
    let lastRangeEnd = 0;
    const textList: string[] = [];
    let seg: IReplaceSegment;
    for (let i = 0; i < segments.length; i++) {
      seg = segments[i];
      textList.push(source.substring(lastRangeEnd, seg.startIdx));
      textList.push(seg.replace);
      lastRangeEnd = seg.endIdx;
    }
    textList.push(source.substring(seg.endIdx));
    return textList.join("");
  }
}
