/** Generic conservative transport. Values are amounts; capacity converts them to concentration. */
export interface FieldNode {
  readonly id: string;
  readonly capacity: number;
  readonly intakeWeight: number;
}
export interface FieldEdge {
  readonly a: number;
  readonly b: number;
  readonly conductance: number;
  readonly sinceMs: number;
}
export interface FieldGraph {
  readonly nodes: readonly FieldNode[];
  readonly edges: readonly FieldEdge[];
}
export interface FieldReaction {
  /** Signed amount/second, evaluated after conservative transport. Bound source/sinks to capacity. */
  (node: FieldNode, amount: number): number;
}

/** Validate once when constructing/changing a field graph, not once per render frame. */
export function validateFieldGraph(graph: FieldGraph, seconds: number, stabilityLimit = 0.9): void {
  if (
    !Number.isFinite(seconds) ||
    seconds <= 0 ||
    !Number.isFinite(stabilityLimit) ||
    stabilityLimit <= 0 ||
    stabilityLimit >= 1
  )
    throw new Error("Invalid spatial field step or stability limit");
  const ids = new Set<string>(),
    edges = new Set<string>(),
    rates = new Float64Array(graph.nodes.length);
  for (const node of graph.nodes) {
    if (
      !node.id ||
      ids.has(node.id) ||
      !Number.isFinite(node.capacity) ||
      node.capacity <= 0 ||
      !Number.isFinite(node.intakeWeight) ||
      node.intakeWeight <= 0
    )
      throw new Error("Invalid spatial field node");
    ids.add(node.id);
  }
  for (const e of graph.edges) {
    const key = `${Math.min(e.a, e.b)}:${Math.max(e.a, e.b)}`;
    if (
      !Number.isInteger(e.a) ||
      !Number.isInteger(e.b) ||
      !graph.nodes[e.a] ||
      !graph.nodes[e.b] ||
      e.a === e.b ||
      edges.has(key) ||
      !Number.isFinite(e.conductance) ||
      e.conductance < 0 ||
      !Number.isFinite(e.sinceMs) ||
      e.sinceMs < 0
    )
      throw new Error("Invalid spatial field connection");
    edges.add(key);
    rates[e.a] += e.conductance / graph.nodes[e.a].capacity;
    rates[e.b] += e.conductance / graph.nodes[e.b].capacity;
  }
  if (rates.some((rate) => rate * seconds > stabilityLimit))
    throw new Error("Unstable spatial field: adjust conductance or explicit step");
}

/** Caller owns the two buffers. All transfers read the same old state. */
export function transportField(
  graph: FieldGraph,
  before: Float64Array,
  after: Float64Array,
  seconds: number,
  timeMs = Infinity,
  reaction?: FieldReaction
): void {
  if (before === after || before.length !== graph.nodes.length || after.length !== before.length)
    throw new Error("Spatial field requires separate, correctly sized buffers");
  after.set(before);
  for (const e of graph.edges) {
    if (timeMs < e.sinceMs) continue;
    const flow =
      seconds * e.conductance * (before[e.a] / graph.nodes[e.a].capacity - before[e.b] / graph.nodes[e.b].capacity);
    after[e.a] -= flow;
    after[e.b] += flow;
  }
  if (reaction)
    for (let i = 0; i < after.length; i++)
      after[i] = Math.max(
        0,
        Math.min(graph.nodes[i].capacity, after[i] + seconds * reaction(graph.nodes[i], after[i]))
      );
}

/** Nearest rings first; saturated nodes remain traversable. Stable IDs remove insertion-order bias. */
export function distributeFieldInput(graph: FieldGraph, values: Float64Array, origin: number, input: number) {
  if (!Number.isFinite(input) || input < 0 || !graph.nodes[origin]) throw new Error("Invalid field input");
  const adjacency = graph.nodes.map(() => [] as number[]);
  for (const e of graph.edges) {
    adjacency[e.a].push(e.b);
    adjacency[e.b].push(e.a);
  }
  const own = Math.min(input, Math.max(0, graph.nodes[origin].capacity - values[origin]));
  values[origin] += own;
  let remaining = input - own,
    frontier = [origin];
  const seen = new Set(frontier);
  while (remaining > 1e-12 && frontier.length) {
    const ring: number[] = [];
    for (const i of frontier)
      for (const j of adjacency[i])
        if (!seen.has(j)) {
          seen.add(j);
          ring.push(j);
        }
    ring.sort((a, b) => (graph.nodes[a].id < graph.nodes[b].id ? -1 : 1));
    let receivers = ring.filter((i) => graph.nodes[i].capacity > values[i]);
    while (remaining > 1e-12 && receivers.length) {
      const weights = receivers.map((i) => (graph.nodes[i].capacity - values[i]) * graph.nodes[i].intakeWeight);
      const total = weights.reduce((a, b) => a + b, 0),
        available = remaining;
      let used = 0;
      receivers.forEach((i, index) => {
        const amount = Math.min(graph.nodes[i].capacity - values[i], (available * weights[index]) / total);
        values[i] += amount;
        used += amount;
      });
      remaining = Math.max(0, remaining - used);
      receivers = receivers.filter((i) => graph.nodes[i].capacity - values[i] > 1e-12);
      if (used <= 1e-12) break;
    }
    frontier = ring;
  }
  return { input, absorbed: own, distributed: input - own - remaining, lost: remaining };
}
