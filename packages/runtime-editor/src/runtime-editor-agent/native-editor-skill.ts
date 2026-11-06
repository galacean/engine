import content from "../skills/galacean-editor.md?raw";
import { parseAgentSkill } from "@galacean/engine-ai-chat/ai-chat/agent-skills";

/** Metadata and instructions have a single source: the Markdown frontmatter. */
export const nativeEditorSkill = parseAgentSkill(content);
