import LocRange from "../common/LocRange";
import { ExpandSegment } from "./Parser";
// #if _DEVELOPMENT
import PpSourceMap, { MapRange } from "./PpSourceMap";
// #endif

export class PpUtils {
  static expand(
    segments: ExpandSegment[],
    source: string,
    // #if _DEVELOPMENT
    sourceMap?: PpSourceMap
    //#endif
  ) {
    const ret: string[] = [];
    let startIdx = 0;
    let generatedIdx = 0;

    for (const seg of segments) {
      const originSlice = source.slice(startIdx, seg.rangeInBlock.start);
      ret.push(originSlice, seg.replace);

      const generatedIdxEnd = generatedIdx + originSlice.length + seg.replace.length;

      // #if _DEVELOPMENT
      const mapRange = new MapRange(seg.block, seg.rangeInBlock, {
        start: generatedIdx + originSlice.length,
        end: generatedIdxEnd
      });
      sourceMap?.addMapRange(mapRange);
      // #endif

      startIdx = seg.rangeInBlock.end;
      generatedIdx = generatedIdxEnd;
    }
    ret.push(source.slice(startIdx));
    return ret.join("");
  }

  static assembleSegments(
    segments: {
      range: LocRange;
      replace: string;
    }[],
    source: string
  ) {
    const ret: string[] = [];
    let startIdx = 0;
    for (const seg of segments) {
      const originSlice = source.slice(startIdx, seg.range.start.index);
      ret.push(originSlice, seg.replace);
      startIdx = seg.range.end.index;
    }
    ret.push(source.slice(startIdx));
    return ret.join("");
  }
}
