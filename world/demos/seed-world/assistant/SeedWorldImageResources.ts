import { ImageResourceBudget, type ConversationImageResources } from "@galacean/engine-ai-chat/ai-chat/image-resources";
import { toAgentValue } from "@galacean/engine-ai-chat/ai-chat/agent-values";
import type { SeedWorldAgentApplication } from "../agent-adapter/SeedWorldAgentApplication.ts";

/**
 * Lazy ConversationImageResources facade bound to SeedWorldAgentApplication.
 *
 * The assistant HUD is mounted during startup shader warmup (`preparePresentation`)
 * before `application.viewSnapshots` is assigned. Forwarding lazily keeps `pick`,
 * snapshot lease accounting, and turn-based GPU reclamation connected without
 * coupling AgentLoop construction to startup initialization order.
 */
export function createSeedWorldImageResources(
  application: Pick<SeedWorldAgentApplication, "viewSnapshots" | "requireViewSnapshots">
): ConversationImageResources {
  const fallbackBudget = new ImageResourceBudget();
  return {
    get budget() {
      return application.viewSnapshots?.budget ?? fallbackBudget;
    },
    get diagnostics() {
      return application.viewSnapshots?.diagnostics ?? toAgentValue(fallbackBudget.stats);
    },
    beginTurn(turn) {
      application.viewSnapshots?.beginTurn(turn);
    },
    acquireImage(imagePath) {
      return application.requireViewSnapshots().acquireImage(imagePath);
    },
    hasImage(imagePath) {
      return application.viewSnapshots?.hasImage(imagePath) ?? false;
    },
    paths() {
      return application.viewSnapshots?.paths() ?? [];
    },
    resetConversation() {
      application.viewSnapshots?.resetConversation();
    },
    pick(input) {
      return application.requireViewSnapshots().pick(input);
    }
  };
}
