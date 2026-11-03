import { fromMarkdown } from "mdast-util-from-markdown";

type MarkdownNode = {
  type: string;
  url?: string;
  title?: string | null;
  value?: string;
  children?: MarkdownNode[];
  position?: { start: { offset?: number }; end: { offset?: number } };
};

/**
 * Host knowledge is mounted under editor/, but its sources also contain
 * document-relative links. Publish one canonical view for both read and grep.
 * Only known file references in prose are rewritten; executable examples,
 * declaration imports, user documents and external URLs retain their bytes.
 */
export function canonicalKnowledgePaths(source: string, path: string, paths: ReadonlySet<string>): string {
  const resolve = (reference: string): string | undefined => {
    if (/^(?:[a-z][a-z\d+.-]*:|\/|#)/i.test(reference)) return undefined;
    const [file, fragment = ""] = reference.split(/(?=#)/, 2);
    if (paths.has(file)) return undefined; // Already project-relative, including editor/... links.
    const parts = path.split("/").slice(0, -1);
    for (const part of file.split("/")) {
      if (part === "..") {
        if (!parts.length) return undefined;
        parts.pop();
      } else if (part !== ".") parts.push(part);
    }
    const target = parts.join("/");
    return paths.has(target) ? target + fragment : undefined;
  };
  const edits: { start: number; end: number; text: string }[] = [];
  const visit = (node: MarkdownNode) => {
    const start = node.position?.start.offset,
      end = node.position?.end.offset;
    if (start !== undefined && end !== undefined) {
      if (node.type === "link" || node.type === "definition") {
        const target = resolve(node.url!);
        if (target) {
          const title = node.title == null ? "" : ` "${node.title.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
          if (node.type === "link") {
            const labelEnd = node.children?.at(-1)?.position?.end.offset ?? start + 1;
            const close = source.indexOf("]", labelEnd);
            edits.push({ start: close + 1, end, text: `(<${target}>${title})` });
          } else {
            const label = /^\[(?:\\.|[^\]\\])*\]:/.exec(source.slice(start, end));
            if (label) edits.push({ start: start + label[0].length, end, text: ` <${target}>${title}` });
          }
        }
      } else if (node.type === "inlineCode") {
        const target = resolve(node.value!);
        if (target) {
          const ticks = /^`+/.exec(source.slice(start, end))![0];
          edits.push({ start, end, text: `${ticks}${target}${ticks}` });
        }
      }
    }
    for (const child of node.children ?? []) visit(child);
  };
  visit(fromMarkdown(source));
  for (const edit of edits.sort((a, b) => b.start - a.start)) {
    source = source.slice(0, edit.start) + edit.text + source.slice(edit.end);
  }
  return source;
}
