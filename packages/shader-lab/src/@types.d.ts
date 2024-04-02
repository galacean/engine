/** @internal */
interface IPosition {
  line: number;
  character: number;
  // offset from first character
  index: number;
}

/** @internal */
interface IPositionRange {
  start: IPosition;
  end: IPosition;
}

/** @internal */
interface ITokenizeOptions {
  /** Whether the tokenized word retain the separator  */
  keepNonSpaceSplitter: boolean;
}

/** @internal */
type ChunkTerminator = string | ((char: string) => boolean);

/** @internal */
interface IScanningResult<T> {
  res?: T;
  end: boolean;
}

/** @internal */
interface IScanningChunkOptions {
  keepTerminator: boolean;
  skipHeadingSpace: boolean;
}

/** @internal */
interface IReplaceSegment {
  startIdx: number;
  endIdx: number;
  replace: string;
}
