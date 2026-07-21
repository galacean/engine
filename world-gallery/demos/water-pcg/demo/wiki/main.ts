import { getWaterPcgCaseHref } from "../navigation";
import { WATER_WIKI_DEFAULT_SLUG, WATER_WIKI_PAGES, findWaterWikiPage } from "./manifest";
import { renderWaterWikiMarkdown } from "./WikiRenderer";
import { getWaterWikiHref, resolveWaterWikiSlug } from "./WikiRouter";
import { createWaterWikiSearchIndex, markdownToSearchText, searchWaterWiki } from "./WikiSearchIndex";
import type { WaterWikiHeading, WaterWikiPage } from "./model";
import "./wiki.css";

function requiredElement<TElement extends HTMLElement>(id: string, type: new () => TElement): TElement {
  const element = document.getElementById(id);
  if (!(element instanceof type)) throw new Error(`Water Wiki is missing #${id}.`);
  return element;
}

const wiki = requiredElement("water-wiki", HTMLElement);
const sidebar = requiredElement("wiki-sidebar", HTMLElement);
const sidebarBackdrop = requiredElement("wiki-sidebar-backdrop", HTMLButtonElement);
const menuToggle = requiredElement("wiki-menu-toggle", HTMLButtonElement);
const searchInput = requiredElement("wiki-search-input", HTMLInputElement);
const resultCount = requiredElement("wiki-result-count", HTMLElement);
const pageNavigation = requiredElement("wiki-page-navigation", HTMLElement);
const reader = requiredElement("wiki-reader", HTMLElement);
const category = requiredElement("wiki-category", HTMLElement);
const readingTime = requiredElement("wiki-reading-time", HTMLElement);
const title = requiredElement("wiki-title", HTMLElement);
const summary = requiredElement("wiki-summary", HTMLElement);
const waterline = requiredElement("wiki-waterline", HTMLElement);
const relatedDemo = requiredElement("wiki-related-demo", HTMLAnchorElement);
const article = requiredElement("wiki-article", HTMLElement);
const pageSequence = requiredElement("wiki-page-sequence", HTMLElement);
const tocNavigation = requiredElement("wiki-toc-navigation", HTMLElement);

const validSlugs = new Set(WATER_WIKI_PAGES.map(({ slug }) => slug));
const searchIndex = createWaterWikiSearchIndex(WATER_WIKI_PAGES);
let activePage = findWaterWikiPage(WATER_WIKI_DEFAULT_SLUG) ?? WATER_WIKI_PAGES[0];

function createPageButton(page: WaterWikiPage): HTMLButtonElement {
  const button = document.createElement("button");
  const label = document.createElement("span");
  const marker = document.createElement("i");
  button.type = "button";
  button.dataset.wikiPage = page.slug;
  button.title = page.summary;
  label.textContent = page.title;
  button.append(marker, label);
  button.addEventListener("click", () => {
    selectPage(page.slug, "push");
    closeSidebar();
  });
  return button;
}

function renderPageNavigation(pages: readonly WaterWikiPage[]): void {
  pageNavigation.replaceChildren();
  const categories = new Map<WaterWikiPage["category"], WaterWikiPage[]>();
  for (const page of pages) {
    const group = categories.get(page.category);
    if (group) group.push(page);
    else categories.set(page.category, [page]);
  }

  for (const [categoryName, categoryPages] of categories) {
    const group = document.createElement("section");
    const heading = document.createElement("h2");
    heading.textContent = categoryName;
    group.append(heading, ...categoryPages.map(createPageButton));
    pageNavigation.append(group);
  }

  if (pages.length === 0) {
    const empty = document.createElement("p");
    empty.className = "wiki-search-empty";
    empty.textContent = "没有找到匹配文档。试试 WaterWorld、浮力或 Flow。";
    pageNavigation.append(empty);
  }
  resultCount.textContent =
    pages.length === WATER_WIKI_PAGES.length ? `${pages.length} 篇` : `${pages.length} / ${WATER_WIKI_PAGES.length}`;
  syncActiveNavigation();
}

function syncActiveNavigation(): void {
  for (const button of pageNavigation.querySelectorAll<HTMLButtonElement>("[data-wiki-page]")) {
    const active = button.dataset.wikiPage === activePage.slug;
    button.classList.toggle("is-active", active);
    if (active) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  }
}

function renderWaterline(page: WaterWikiPage): void {
  const label = document.createElement("span");
  label.className = "wiki-waterline-label";
  label.textContent = "SURFACE SIGNAL";
  const track = document.createElement("i");
  track.className = "wiki-waterline-track";
  waterline.replaceChildren(label, track);
  for (const item of page.telemetry) {
    const chip = document.createElement("span");
    chip.className = "wiki-waterline-chip";
    chip.textContent = item;
    waterline.append(chip);
  }
}

function renderToc(headings: readonly WaterWikiHeading[]): void {
  tocNavigation.replaceChildren(
    ...headings.map((heading) => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = heading.label;
      button.dataset.depth = String(heading.depth);
      button.addEventListener("click", () => scrollToHeading(heading.id));
      return button;
    })
  );
}

function scrollToHeading(headingId: string): void {
  const heading = article.querySelector<HTMLElement>(`#${CSS.escape(headingId)}`);
  heading?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function enhanceArticle(): void {
  for (const anchor of article.querySelectorAll<HTMLButtonElement>("[data-heading-id]")) {
    anchor.addEventListener("click", () => scrollToHeading(anchor.dataset.headingId ?? ""));
  }

  for (const block of article.querySelectorAll<HTMLElement>("pre")) {
    const code = block.querySelector("code");
    if (!code) continue;
    const button = document.createElement("button");
    button.className = "wiki-copy-code";
    button.type = "button";
    button.textContent = "复制";
    button.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(code.textContent ?? "");
        button.textContent = "已复制";
      } catch {
        button.textContent = "复制失败";
      }
      window.setTimeout(() => {
        button.textContent = "复制";
      }, 1400);
    });
    block.append(button);
  }
}

function renderPageSequence(page: WaterWikiPage): void {
  const index = WATER_WIKI_PAGES.indexOf(page);
  const previous = WATER_WIKI_PAGES[index - 1];
  const next = WATER_WIKI_PAGES[index + 1];
  const buttons: HTMLButtonElement[] = [];

  const createSequenceButton = (target: WaterWikiPage, direction: "previous" | "next"): HTMLButtonElement => {
    const button = document.createElement("button");
    const caption = document.createElement("span");
    const label = document.createElement("strong");
    button.type = "button";
    button.dataset.direction = direction;
    caption.textContent = direction === "previous" ? "上一篇" : "下一篇";
    label.textContent = target.title;
    button.append(caption, label);
    button.addEventListener("click", () => selectPage(target.slug, "push"));
    return button;
  };

  if (previous) buttons.push(createSequenceButton(previous, "previous"));
  if (next) buttons.push(createSequenceButton(next, "next"));
  pageSequence.replaceChildren(...buttons);
}

function updateRelatedDemo(page: WaterWikiPage): void {
  if (!page.relatedCaseId) {
    relatedDemo.hidden = true;
    relatedDemo.removeAttribute("href");
    return;
  }
  relatedDemo.hidden = false;
  relatedDemo.href = getWaterPcgCaseHref(window.location.href, page.relatedCaseId);
  const label = relatedDemo.querySelector("span");
  if (label) label.textContent = page.relatedCaseLabel ?? "在相关 Demo 中查看";
}

function updateHistory(page: WaterWikiPage, mode: "push" | "replace" | "none"): void {
  if (mode === "none") return;
  const href = getWaterWikiHref(window.location.href, page.slug);
  const state = { waterWikiPage: page.slug };
  if (mode === "push") window.history.pushState(state, "", href);
  else window.history.replaceState(state, "", href);
}

function selectPage(slug: string, historyMode: "push" | "replace" | "none"): void {
  const page = findWaterWikiPage(slug) ?? findWaterWikiPage(WATER_WIKI_DEFAULT_SLUG);
  if (!page) throw new Error("Water Wiki has no readable pages.");
  activePage = page;
  const rendered = renderWaterWikiMarkdown(page.markdown);
  category.textContent = page.category;
  readingTime.textContent = `${Math.max(1, Math.ceil(markdownToSearchText(page.markdown).length / 520))} 分钟阅读`;
  title.textContent = page.title;
  summary.textContent = page.summary;
  article.innerHTML = rendered.html;
  renderWaterline(page);
  renderToc(rendered.headings);
  renderPageSequence(page);
  updateRelatedDemo(page);
  enhanceArticle();
  syncActiveNavigation();
  updateHistory(page, historyMode);
  document.title = `Water PCG Wiki · ${page.title}`;
  reader.scrollTo({ top: 0, behavior: historyMode === "push" ? "smooth" : "auto" });
}

function openSidebar(): void {
  wiki.dataset.sidebarOpen = "true";
  menuToggle.setAttribute("aria-expanded", "true");
  sidebar.querySelector<HTMLButtonElement>("[aria-current='page']")?.focus({ preventScroll: true });
}

function closeSidebar(): void {
  delete wiki.dataset.sidebarOpen;
  menuToggle.setAttribute("aria-expanded", "false");
}

menuToggle.setAttribute("aria-controls", sidebar.id);
menuToggle.setAttribute("aria-expanded", "false");
menuToggle.addEventListener("click", () => {
  if (wiki.dataset.sidebarOpen === "true") closeSidebar();
  else openSidebar();
});
sidebarBackdrop.addEventListener("click", closeSidebar);

searchInput.addEventListener("input", () => {
  renderPageNavigation(searchWaterWiki(searchIndex, searchInput.value));
});

document.addEventListener("keydown", (event) => {
  const target = event.target;
  const typing = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;
  if (event.key === "/" && !typing) {
    event.preventDefault();
    searchInput.focus();
  }
  if (event.key === "Escape") {
    closeSidebar();
    if (document.activeElement === searchInput) searchInput.blur();
  }
});

window.addEventListener("popstate", () => {
  selectPage(resolveWaterWikiSlug(window.location, validSlugs, WATER_WIKI_DEFAULT_SLUG), "none");
});

renderPageNavigation(WATER_WIKI_PAGES);
const initialSlug = resolveWaterWikiSlug(window.location, validSlugs, WATER_WIKI_DEFAULT_SLUG);
selectPage(initialSlug, new URLSearchParams(window.location.search).get("doc") === initialSlug ? "none" : "replace");
