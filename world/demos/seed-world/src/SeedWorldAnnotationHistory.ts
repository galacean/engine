import type { ViewAnnotation } from "@galacean/engine-world-planning/world/SeedWorldViewSnapshot";

/** Each committed gesture is one undo step; a new gesture discards the redo branch. */
export class SeedWorldAnnotationHistory {
  private marks: ViewAnnotation[] = [];
  private cursor = 0;
  get annotations(): readonly ViewAnnotation[] {
    return this.marks.slice(0, this.cursor);
  }
  get canUndo(): boolean {
    return this.cursor > 0;
  }
  get canRedo(): boolean {
    return this.cursor < this.marks.length;
  }
  clone(): SeedWorldAnnotationHistory {
    const copy = new SeedWorldAnnotationHistory();
    copy.marks = structuredClone(this.marks);
    copy.cursor = this.cursor;
    return copy;
  }
  add(shape: ViewAnnotation): void {
    if (this.cursor >= 64) throw new Error("最多保留 64 笔，请撤销部分标记后再画。");
    this.marks.splice(this.cursor, this.marks.length - this.cursor, structuredClone(shape));
    this.cursor++;
  }
  undo(): void {
    if (this.canUndo) this.cursor--;
  }
  redo(): void {
    if (this.canRedo) this.cursor++;
  }
}
