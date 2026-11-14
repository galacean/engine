/** Ported from DeepSeek Harness read-render.spec.ts (MIT); see ../vendor/deepseek-read/UPSTREAM.md. */
import { describe, expect, it } from "vitest";
import { buildWindow, parseReadArgs, READ_LIMIT, READ_MAX_LINE_LENGTH, type ReadWindow } from "../src/ai-chat/vendor/deepseek-read/read-window";
const DEFAULT_CAPS = { maxBytes: 16 * 1024 };
const READ_ALL: ReadWindow = { offset: 1, limit: READ_LIMIT, ...DEFAULT_CAPS };
async function* whole(text: string) { yield text; }
async function* chunked(text: string, size: number) {
  for (let i = 0; i < text.length; i += size) yield text.slice(i, i + size);
}

describe("DeepSeek line-window semantics", () => {
  it("numbers lines and reports total for a whole-file read", async () => {
    const result = await buildWindow(whole("one\ntwo\nthree"), READ_ALL, "f");
    expect(result.lines).toEqual([{ number: 1, text: "one" }, { number: 2, text: "two" }, { number: 3, text: "three" }]);
    expect(result.totalLines).toBe(3);
    expect(result.next).toBeNull();
  });
  it("applies offset/limit and reports a continuation", async () => {
    const result = await buildWindow(whole("one\ntwo\nthree\nfour"), { ...READ_ALL, offset: 2, limit: 2 }, "f");
    expect(result.lines.map(line => line.number)).toEqual([2, 3]);
    expect(result.totalLines).toBe(4);
    expect(result.next).toEqual({ offset: 4 });
  });
  it.each(["one\r\ntwo\r\n", "one\ntwo", "one\ntwo\n"])("handles CRLF, final lines and trailing newline: %j", async source => {
    const result = await buildWindow(whole(source), READ_ALL, "f");
    expect(result.lines.map(line => line.text)).toEqual(["one", "two"]);
    expect(result.totalLines).toBe(2);
  });
  it("reads an empty file at offset 1 as zero lines", async () => {
    expect(await buildWindow(whole(""), READ_ALL, "f")).toMatchObject({ lines: [], totalLines: 0, next: null });
  });
  it("rejects an offset past EOF", async () => {
    await expect(buildWindow(whole("one\ntwo"), { ...READ_ALL, offset: 9 }, "f")).rejects.toThrow("out of range");
  });
  it("windows identically across small input chunks", async () => {
    const options = { ...READ_ALL, offset: 2, limit: 1 };
    expect(await buildWindow(chunked("one\r\ntwo\nthree", 2), options, "f")).toEqual(await buildWindow(whole("one\r\ntwo\nthree"), options, "f"));
  });
  it("caps output bytes in streamed input", async () => {
    const source = Array.from({ length: 2000 }, () => "y".repeat(100)).join("\n");
    const result = await buildWindow(chunked(source, 512), READ_ALL, "f");
    expect(result.totalLines).toBe(2000);
    expect(result.next).not.toBeNull();
    expect(new TextEncoder().encode(JSON.stringify(result.lines)).length).toBeLessThanOrEqual(DEFAULT_CAPS.maxBytes);
  });
  it.each([1, 2, 17, 256])("losslessly pages a true long line across %i-character chunks", async size => {
    const source = "a".repeat(READ_MAX_LINE_LENGTH - 1) + "😀" + "x".repeat(100000) + "\nnext";
    const result = await buildWindow(chunked(source, size), { ...READ_ALL, limit: 1 }, "f");
    expect(result.lines[0].text).toBe("a".repeat(READ_MAX_LINE_LENGTH - 1));
    expect(result.totalLines).toBe(2);
    expect(result.next).toEqual({ offset: 1, column: READ_MAX_LINE_LENGTH });
    let cursor = result.next, recovered = result.lines[0].text;
    while (cursor?.offset === 1) {
      const page = await buildWindow(chunked(source,size), {...READ_ALL, ...cursor, limit:1}, "f");
      recovered += page.lines[0].text; cursor = page.next;
    }
    expect(recovered).toBe(source.split("\n")[0]);
    expect(cursor).toEqual({offset:2});
    expect((await buildWindow(whole(source), { ...READ_ALL, offset: 2 }, "f")).lines[0].text).toBe("next");
  });
  it("defers an ordinary line intact even if a prefix would fit the remaining page", async () => {
    const source = "a".repeat(100) + "\n" + "b".repeat(107);
    const first = await buildWindow(whole(source), { ...READ_ALL, maxBytes: 230 }, "f");
    expect(first.lines).toEqual([{ number: 1, text: "a".repeat(100) }]);
    expect(first.next).toEqual({ offset: 2 });
    const second = await buildWindow(whole(source), { ...READ_ALL, ...first.next!, maxBytes: 230 }, "f");
    expect(second.lines).toEqual([{ number: 2, text: "b".repeat(107) }]);
    expect(second.next).toBeNull();
  });
  it("does not silently shorten a line for an impossibly small host budget", async () => {
    await expect(buildWindow(whole("😀xxx"), { ...READ_ALL, maxBytes: 28 }, "f")).rejects.toThrow("one rendered line");
  });
  it("keeps a rejected next line in the continuation when its record cannot fit", async () => {
    const first = await buildWindow(whole("one\ntwo"), { ...READ_ALL, maxBytes: 29 }, "f");
    expect(first.lines.map(line => line.text)).toEqual(["one"]);
    expect(first.next).toEqual({ offset: 2 });
    expect((await buildWindow(whole("one\ntwo"), { ...READ_ALL, ...first.next! }, "f")).lines[0].text).toBe("two");
  });
  it("defaults read args and rejects invalid windows", () => {
    expect(parseReadArgs({ file_path: "a", offset: null, limit: null })).toEqual({ file_path: "a", offset: 1, limit: 2000 });
    for (const args of [{ offset: 0 }, { limit: 2001 }, { column: -1 }, { offset: 1.5 }, { column: Number.MAX_SAFE_INTEGER + 1 }]) {
      expect(() => parseReadArgs({ file_path: "a", ...args })).toThrow();
    }
  });
});
