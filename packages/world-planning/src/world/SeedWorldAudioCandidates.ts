import {
  audioDistance,
  AudioPropagation,
  audioPropagationGain,
  waterPropagationGain,
  nearestAudioPoint,
  type AudioSegment,
  AudioPoint
} from "@galacean/engine-terrain/terrain/audio/EnvironmentAudioMath";

export type SpatialClip = "grass" | "shrub" | "leaves" | "stream" | "lake" | "ocean";
export interface AudioCandidate {
  id: string;
  /** Grid identity stays numeric during traversal; no per-query string keys. */
  cellX?: number;
  cellZ?: number;
  clip: SpatialClip;
  position: AudioPoint;
  segment?: AudioSegment;
  gain: number;
  reach: number;
  /** Publication order preserves ties when the spatial index visits river segments out of order. */
  order?: number;
}

/** Capacity changes only when world geometry is published. Queries overwrite the active prefix. */
export class AudioCandidateBuffer {
  readonly items: AudioCandidate[] = [];
  count = 0;
  scores = new Float64Array(0);
  readonly propagation = new AudioPropagation();

  constructor(capacity: number) {
    this.reserve(capacity);
  }

  reserve(capacity: number): void {
    if (capacity > this.scores.length) this.scores = new Float64Array(capacity);
    while (this.items.length < capacity)
      this.items.push({
        id: "",
        cellX: undefined,
        cellZ: undefined,
        clip: "grass",
        position: new AudioPoint(),
        segment: undefined,
        gain: 0,
        reach: 1,
        order: undefined
      });
  }
}

export interface AudioCandidateSelection {
  first?: AudioCandidate;
  second?: AudioCandidate;
}

/** Query buffers are borrowed, mutable storage, valid until the next discovery/publication. */
export function selectAudioCandidates(
  candidates: AudioCandidateBuffer,
  clip: SpatialClip,
  p: AudioPoint,
  out: AudioCandidateSelection
): void {
  const water = clip === "stream" || clip === "lake" || clip === "ocean";
  const scores = candidates.scores;
  let firstScore = -1,
    secondScore = -1;
  let first: AudioCandidate | undefined;
  let firstOrder = Infinity;
  for (let i = 0; i < candidates.count; i++) {
    const candidate = candidates.items[i]!;
    if (candidate.clip !== clip) continue;
    if (candidate.segment) nearestAudioPoint(candidate.segment, p, candidate.position);
    audioDistance(p, candidate.position, candidates.propagation);
    const d = candidates.propagation.distance;
    let score = -1;
    if (d < candidate.reach) {
      if (water) waterPropagationGain(candidate.reach, 0, candidates.propagation);
      else audioPropagationGain(candidate.reach, 0, candidates.propagation);
      score = candidate.gain * candidates.propagation.gain;
    }
    scores[i] = score;
    if (score < 0) continue;
    const order = candidate.order ?? i;
    if (!first || score > firstScore || (score === firstScore && order < firstOrder)) {
      first = candidate;
      firstScore = score;
      firstOrder = order;
    }
  }
  let second: AudioCandidate | undefined;
  let secondOrder = Infinity;
  if (first)
    for (let i = 0; i < candidates.count; i++) {
      const candidate = candidates.items[i]!;
      if (candidate.clip !== clip || scores[i]! < 0 || candidate === first) continue;
      audioDistance(candidate.position, first.position, candidates.propagation);
      if (candidates.propagation.distance <= 10) continue;
      const order = candidate.order ?? i;
      if (!second || scores[i]! > secondScore || (scores[i] === secondScore && order < secondOrder)) {
        second = candidate;
        secondScore = scores[i]!;
        secondOrder = order;
      }
    }
  out.first = first;
  out.second = second;
}
