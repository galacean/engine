import { CropVisualTimeline, growthProgressMatches } from "./CropGrowthMapping";

export interface CropGrowthTask {
  readonly id: string;
  readonly timeline: CropVisualTimeline;
  readonly apply: (progress: number) => void;
  lastProgress: number;
  lastUpdate: number;
  visible: boolean;
}
export interface CropGrowthScheduleOptions {
  readonly budgetMs: number;
  readonly selectedHz: number;
  readonly nearHz: number;
  readonly farHz: number;
}
export const DEFAULT_GROWTH_SCHEDULE: CropGrowthScheduleOptions = Object.freeze({
  budgetMs: 1,
  selectedHz: 2,
  nearHz: 1,
  farHz: 0.5
});
interface Candidate {
  task: CropGrowthTask;
  interval: number;
  progress: number;
  score: number;
}

/** One render-frame scheduler. Work is spread across frames, with waiting time preventing starvation. */
export class CropGrowthScheduler {
  private readonly tasks = new Map<string, { task: CropGrowthTask; candidate: Candidate }>();
  private readonly queue: Candidate[] = [];
  private lastFrame = -Infinity;
  private wasHidden = false;
  readonly stats = { totalUpdates: 0, frameUpdates: 0, frameMilliseconds: 0, deferred: 0, budgetOverruns: 0 };
  constructor(
    readonly options: CropGrowthScheduleOptions = DEFAULT_GROWTH_SCHEDULE,
    private readonly clock: () => number = () => performance.now()
  ) {
    if (
      ![options.budgetMs, options.selectedHz, options.nearHz, options.farHz].every((n) => Number.isFinite(n) && n > 0)
    )
      throw new Error("生长调度参数必须为正数");
  }
  add(task: CropGrowthTask): void {
    this.tasks.set(task.id, { task, candidate: { task, interval: 0, progress: 0, score: 0 } });
  }
  remove(id: string): void {
    this.tasks.delete(id);
  }
  clear(): void {
    this.tasks.clear();
    this.queue.length = 0;
  }
  /** Visibility priority: -1 invisible, 0 distant, 1 near, 2 selected. */
  tick(now: number, priority: (id: string) => number, hidden = false, budgetMs = this.options.budgetMs): void {
    const start = this.clock();
    this.stats.frameUpdates = 0;
    this.stats.deferred = 0;
    const resume = this.wasHidden || now - this.lastFrame > 2000;
    this.lastFrame = now;
    this.wasHidden = hidden;
    if (hidden) {
      for (const { task } of this.tasks.values()) task.visible = false;
      this.stats.frameMilliseconds = 0;
      return;
    }
    this.queue.length = 0;
    for (const { task, candidate } of this.tasks.values()) {
      if (resume) task.timeline.snap();
      const level = priority(task.id);
      if (level < 0) {
        task.visible = false;
        continue;
      }
      // Visibility is state, not budgeted work. Preserve re-entry even when creation used this frame.
      if (budgetMs <= 0) continue;
      const entering = !task.visible;
      if (entering) task.timeline.snap();
      const progress = task.timeline.sample(now);
      if (growthProgressMatches(task.lastProgress, progress)) {
        task.visible = true;
        continue;
      }
      const immediate =
        entering || !Number.isFinite(task.lastProgress) || progress === 1 || progress < task.lastProgress;
      // Accumulate sub-permille changes instead of uploading almost identical geometry.
      if (!immediate && Math.abs(progress - task.lastProgress) < 0.001) continue;
      const interval =
        1000 / (level === 2 ? this.options.selectedHz : level === 1 ? this.options.nearHz : this.options.farHz);
      if (!immediate && now - task.lastUpdate < interval) continue;
      candidate.interval = interval;
      candidate.progress = progress;
      candidate.score = (now - task.lastUpdate) / interval + level * 2 + (entering ? 2 : 0);
      this.queue.push(candidate);
    }
    this.queue.sort((a, b) => b.score - a.score || a.task.id.localeCompare(b.task.id));
    for (let i = 0; i < this.queue.length; i++) {
      if (this.stats.frameUpdates > 0 && this.clock() - start >= budgetMs) {
        this.stats.deferred = this.queue.length - i;
        break;
      }
      const { task, progress } = this.queue[i];
      task.apply(progress);
      task.visible = true;
      task.lastProgress = progress;
      task.lastUpdate = now;
      this.stats.frameUpdates++;
      this.stats.totalUpdates++;
    }
    this.stats.frameMilliseconds = this.clock() - start;
    if (this.stats.frameMilliseconds > this.options.budgetMs && this.stats.frameUpdates > 0)
      this.stats.budgetOverruns++;
  }
}
