import type { BuildingGeometry, EffectiveGeometry, GeometryModification, OccupiedUnit } from "./geometry";
import type { PartIdentity } from "./identity";
import type { BuildingUnit } from "./unit";

/** A host of an attach connection, optionally narrowed to one of its elements. */
export interface HostRef {
  readonly part: string;
  readonly element?: string;
}
/** Directional: the guest's geometry and rule depend on its hosts (one or more). */
export interface AttachDef {
  readonly kind: "attach";
  readonly id: string;
  readonly guest: string;
  readonly hosts: readonly HostRef[];
  /** Overrides the group and type-pair defaults. "none" disables the rule. */
  readonly rule?: string;
  readonly params?: Readonly<Record<string, unknown>>;
}
/** Symmetric: neither part depends on the other. Can also be found by a detector. */
export interface JoinDef {
  readonly kind: "join";
  readonly id: string;
  readonly parts: readonly [string, string];
  readonly rule?: string;
  readonly params?: Readonly<Record<string, unknown>>;
}
export type ConnectionDef = AttachDef | JoinDef;

/** Read-only view of a participant. `geometry` is the ORIGINAL geometry: rules never see
 * other rules' edits, so their results do not depend on evaluation order. */
export interface ParticipantView {
  readonly key: string;
  readonly identity: PartIdentity;
  readonly type: string;
  readonly group: string;
  readonly unit?: BuildingUnit;
  /** The host element named by the connection, if any. */
  readonly element?: string;
  readonly geometry: EffectiveGeometry;
  /** The space the part occupies: its units laid on the original geometry, one entry for each
   * unit whose asset declares a space. Parts laid from assets without one occupy nothing. */
  readonly occupied: readonly OccupiedUnit[];
}
export interface RuleContext {
  readonly key: string;
  readonly kind: "attach" | "join";
  readonly params: Readonly<Record<string, unknown>>;
  readonly seed: number;
  /** Attach only. */
  readonly guest?: ParticipantView;
  readonly hosts: readonly ParticipantView[];
  /** Every participant: [guest, ...hosts] for attach, both parts for join. */
  readonly parts: readonly ParticipantView[];
  /** The parts attached to a participant, other than the participants, in key order. A rule
   * reads what stands on its parts here. */
  readonly attached: readonly ParticipantView[];
}
/** A participant key, or a part derived by the same rule result. */
export type PartRef = { readonly part: string } | { readonly derived: string };
export interface DerivedPartSpec {
  readonly localId: string;
  readonly type: string;
  /** Defaults to the connection's owner group. */
  readonly group?: string;
  readonly geometry: BuildingGeometry;
  /** Optional for points and lines, as for author parts. */
  readonly algorithm?: { readonly type: string; readonly params?: Readonly<Record<string, unknown>> };
  readonly unit?: BuildingUnit;
}
export type DerivedConnectionSpec =
  | {
      readonly kind: "attach";
      readonly localId: string;
      readonly guest: PartRef;
      readonly hosts: readonly { readonly ref: PartRef; readonly element?: string }[];
      readonly rule?: string;
      readonly params?: Readonly<Record<string, unknown>>;
    }
  | {
      readonly kind: "join";
      readonly localId: string;
      readonly parts: readonly [PartRef, PartRef];
      readonly rule?: string;
      readonly params?: Readonly<Record<string, unknown>>;
    };
/** A rule edits participants' geometry and derives parts and further connections. It
 * never changes algorithms or units. */
export interface RuleResult {
  readonly modify?: readonly { readonly part: string; readonly modification: GeometryModification }[];
  readonly derive?: readonly DerivedPartSpec[];
  readonly connect?: readonly DerivedConnectionSpec[];
  readonly diagnostics?: readonly string[];
}
export type ConnectionRule = (context: RuleContext) => RuleResult;
export type JoinDetector = (a: ParticipantView, b: ParticipantView) => boolean;

/** Default-rule keys. Type names are restricted to [A-Za-z0-9_-], so these cannot collide. */
export const attachPairKey = (guest: string, hosts: readonly string[]): string => `attach:${guest}>${hosts.join("+")}`;
export const joinPairKey = (a: string, b: string): string => (a <= b ? `join:${a}|${b}` : `join:${b}|${a}`);

/** Type-pair default rules, the lowest level of the rule override chain. */
export class RuleDefaults {
  private readonly rules = new Map<string, string>();
  attach(guest: string, hosts: readonly string[], rule: string): void {
    this.set(attachPairKey(guest, hosts), rule);
  }
  join(a: string, b: string, rule: string): void {
    this.set(joinPairKey(a, b), rule);
  }
  get(pair: string): string | undefined {
    return this.rules.get(pair);
  }
  private set(pair: string, rule: string) {
    if (this.rules.has(pair)) throw Error(`Default rule for ${pair} is already set`);
    this.rules.set(pair, rule);
  }
}
