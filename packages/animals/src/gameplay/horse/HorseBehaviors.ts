import type { BehaviorNode } from "../behavior/BehaviorTree";

const action = (name: string, params?: Record<string, unknown>): BehaviorNode => ({ type: "action", name, params });
const condition = (name: string, params?: Record<string, unknown>): BehaviorNode => ({
  type: "condition",
  name,
  params
});
const sequence = (...children: BehaviorNode[]): BehaviorNode => ({ type: "sequence", children });
const selector = (...children: BehaviorNode[]): BehaviorNode => ({ type: "selector", children });
const entrance = () => sequence(action("enter"), selector(condition("groundEntry"), action("land")));
const idle = (): BehaviorNode => ({
  type: "weightedRandom",
  children: ["idle", "idleB", "idleC"].map((state) => ({ weight: 1, node: action("animate", { state }) }))
});
const ensurePresent = () => selector(condition("present"), entrance());
const approach = () =>
  selector(
    action("move", { target: "player", gait: "run" }),
    sequence(entrance(), action("move", { target: "player", gait: "run" }))
  );
const dismount = () => action("dismount");
const command = (name: string, ...steps: BehaviorNode[]): BehaviorNode =>
  sequence(condition("command", { name }), selector(sequence(...steps, action("complete")), action("reject")));

/** Editable behavior composition; action names resolve through the mount capability registry. */
export const HORSE_BEHAVIOR: BehaviorNode = {
  type: "selector",
  reactive: true,
  children: [
    command("come", ensurePresent(), approach(), action("animate", { state: "idle", immediate: true })),
    command("summon", ensurePresent()),
    command("dismount", dismount()),
    command(
      "dismiss",
      dismount(),
      selector(condition("absent"), sequence(action("animate", { state: "death" }), action("remove")))
    ),
    sequence(condition("mounted"), action("ride")),
    sequence(
      condition("present"),
      selector(sequence(condition("stay"), idle()), sequence(condition("followFar"), approach()), {
        type: "weightedRandom",
        children: [
          {
            weight: 3,
            when: { name: "grassAvailable" },
            node: sequence(
              action("move", { target: "grass", gait: "walk" }),
              condition("onGrass"),
              action("animate", { state: "eat" })
            )
          },
          { weight: 2, node: action("move", { target: "wander", gait: "walk" }) },
          { weight: 2, node: idle() }
        ]
      })
    ),
    action("wait")
  ]
};
