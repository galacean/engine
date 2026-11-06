// Generated from deepseek-ai/deepseek-harness 687f282e8625c6b8d11ff58211a90524be2e4317. MIT; see LICENSE. Do not hand-edit.

// packages/client/ui-trajectory/src/client/TrajectoryTable.tsx
import { useCallback as useCallback8, useEffect as useEffect9, useId as useId6, useLayoutEffect as useLayoutEffect6, useMemo as useMemo4, useRef as useRef11, useState as useState10 } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";

// packages/client/ui-primitives/src/markdown/CodeBlock.tsx
import { Fragment, useCallback as useCallback3, useMemo, useRef as useRef2, useState as useState3, useSyncExternalStore } from "react";
import clsx2 from "clsx";

// packages/client/ui-primitives/src/clipboard.ts
async function writeClipboard(text) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return false;
    }
  }
  const exec = typeof document.execCommand === "function" ? document.execCommand.bind(document) : void 0;
  if (exec === void 0) return false;
  const el = document.createElement("textarea");
  el.value = text;
  el.setAttribute("readonly", "");
  el.style.position = "fixed";
  el.style.left = "-9999px";
  document.body.appendChild(el);
  el.select();
  try {
    return exec("copy");
  } catch {
    return false;
  } finally {
    el.remove();
  }
}

// packages/client/ui-primitives/src/icons/index.tsx
import { useId } from "react";

// packages/client/ui-primitives/src/icons/shared-artwork.tsx
import { jsx, jsxs } from "react/jsx-runtime";
var GlobeOutlineArtwork = ({ size = 14, className, strokeWidth }) => /* @__PURE__ */ jsxs("svg", { width: size, height: size, className, viewBox: "0 0 16 16", fill: "none", xmlns: "http://www.w3.org/2000/svg", "aria-hidden": "true", strokeWidth, children: [
  /* @__PURE__ */ jsx("path", { d: "M7.99986 14.0887C11.3626 14.0887 14.0886 11.3627 14.0886 7.99998C14.0886 4.63727 11.3626 1.91125 7.99986 1.91125C4.63715 1.91125 1.91113 4.63727 1.91113 7.99998C1.91113 11.3627 4.63715 14.0887 7.99986 14.0887Z", stroke: "currentColor" }),
  /* @__PURE__ */ jsx("path", { d: "M2.34619 8H13.6538", stroke: "currentColor", strokeLinecap: "square" }),
  /* @__PURE__ */ jsx("path", { d: "M7.99976 14.0889C9.23509 14.0889 10.1743 11.3629 10.1743 8.00006C10.1743 4.63739 9.23509 1.91138 7.99976 1.91138", stroke: "currentColor" }),
  /* @__PURE__ */ jsx("path", { d: "M7.99973 14.0889C6.76445 14.0889 5.8252 11.3629 5.8252 8.00006C5.8252 4.63739 6.76445 1.91138 7.99973 1.91138", stroke: "currentColor" })
] });
var CodeBracketsArtwork = ({ size = 14, className, strokeWidth }) => /* @__PURE__ */ jsxs("svg", { width: size, height: size, className, viewBox: "0 0 16 16", fill: "none", xmlns: "http://www.w3.org/2000/svg", "aria-hidden": "true", strokeWidth, children: [
  /* @__PURE__ */ jsx("path", { d: "M4.67398 4.25061L1.36094 7.86484C1.29085 7.9413 1.29085 8.05866 1.36094 8.13513L4.67398 11.7494", stroke: "currentColor" }),
  /* @__PURE__ */ jsx("path", { d: "M11.3262 4.25061L14.6392 7.86484C14.7093 7.9413 14.7093 8.05866 14.6392 8.13513L11.3262 11.7494", stroke: "currentColor" }),
  /* @__PURE__ */ jsx("path", { d: "M9.56222 3.62573L6.43774 12.3743", stroke: "currentColor" })
] });
var FolderCloseArtwork = ({ size = 16, className, strokeWidth }) => /* @__PURE__ */ jsxs("svg", { width: size, height: size, className, viewBox: "0 0 16 16", fill: "none", xmlns: "http://www.w3.org/2000/svg", "aria-hidden": "true", strokeWidth, children: [
  /* @__PURE__ */ jsx("path", { d: "M1.50439 3.11059C1.50439 2.55831 1.95211 2.1106 2.50439 2.1106H5.43389C5.67773 2.1106 5.91318 2.19969 6.09593 2.36113L7.71649 3.79265C7.89924 3.95409 8.1347 4.04319 8.3785 4.04319H13.4958C14.0481 4.04319 14.4958 4.4909 14.4958 5.04319V12.8894C14.4958 13.4417 14.0481 13.8894 13.4958 13.8894H2.50439C1.95211 13.8894 1.50439 13.4417 1.50439 12.8894V4.04319V3.11059Z", stroke: "currentColor" }),
  /* @__PURE__ */ jsx("path", { d: "M3.63501 7.66614H12.3647", stroke: "currentColor" })
] });

// packages/client/ui-primitives/src/icons/index.tsx
import { jsx as jsx2, jsxs as jsxs2 } from "react/jsx-runtime";
var ICON_REGULAR_STROKE = 1;
var ICON_MEDIUM_STROKE = 1.3;
var IconSearchOutlineArtwork = ({ size = 16, className, strokeWidth }) => /* @__PURE__ */ jsxs2("svg", { width: size, height: size, className, viewBox: "0 0 16 16", fill: "none", xmlns: "http://www.w3.org/2000/svg", "aria-hidden": "true", strokeWidth, children: [
  /* @__PURE__ */ jsx2("path", { d: "M6.58727 11.8586C9.55061 11.8586 11.9529 9.45637 11.9529 6.49304C11.9529 3.5297 9.55061 1.12744 6.58727 1.12744C3.62394 1.12744 1.22168 3.5297 1.22168 6.49304C1.22168 9.45637 3.62394 11.8586 6.58727 11.8586Z", stroke: "currentColor" }),
  /* @__PURE__ */ jsx2("path", { d: "M10.2991 10.3933L14.7783 14.8725", stroke: "currentColor" })
] });
var IconSearchOutlineRegular = (props) => /* @__PURE__ */ jsx2(IconSearchOutlineArtwork, { ...props, strokeWidth: ICON_REGULAR_STROKE });
var IconSettingsOutlineArtwork = ({ size = 16, className, strokeWidth }) => /* @__PURE__ */ jsxs2("svg", { width: size, height: size, className, viewBox: "0 0 16 16", fill: "none", xmlns: "http://www.w3.org/2000/svg", "aria-hidden": "true", strokeWidth, children: [
  /* @__PURE__ */ jsx2("path", { d: "M8 9.75012C8.9665 9.75012 9.75 8.96662 9.75 8.00012C9.75 7.03362 8.9665 6.25012 8 6.25012C7.0335 6.25012 6.25 7.03362 6.25 8.00012C6.25 8.96662 7.0335 9.75012 8 9.75012Z", stroke: "currentColor" }),
  /* @__PURE__ */ jsx2("path", { d: "M13.0107 7.79377C12.9505 7.89401 12.9205 7.94413 12.9205 7.99951C12.9205 8.0549 12.9505 8.10502 13.0106 8.20528L13.9849 9.83006C14.045 9.93029 14.0751 9.9804 14.0751 10.0358C14.0751 10.0911 14.045 10.1413 13.9849 10.2415L13.0037 11.8777C12.9468 11.9726 12.9184 12.0201 12.8725 12.0461C12.8267 12.072 12.7713 12.072 12.6607 12.072H10.6704C10.5598 12.072 10.5045 12.072 10.4586 12.098C10.4128 12.1239 10.3843 12.1714 10.3274 12.2662L9.33825 13.9142C9.28133 14.009 9.25287 14.0564 9.20703 14.0823C9.16118 14.1083 9.10588 14.1083 8.99529 14.1083H7.00486C6.89426 14.1083 6.83896 14.1083 6.79312 14.0823C6.74727 14.0564 6.71881 14.009 6.6619 13.9142L5.67273 12.2662C5.61581 12.1714 5.58735 12.1239 5.54151 12.098C5.49566 12.072 5.44036 12.072 5.32977 12.072H3.33945C3.2288 12.072 3.17347 12.072 3.12761 12.0461C3.08176 12.0201 3.0533 11.9726 2.9964 11.8777L2.0152 10.2415C1.9551 10.1413 1.92505 10.0911 1.92505 10.0358C1.92505 9.9804 1.9551 9.93029 2.0152 9.83006L2.98951 8.20528C3.04963 8.10502 3.07969 8.0549 3.07969 7.99951C3.07968 7.94413 3.04961 7.89401 2.98946 7.79377L2.01529 6.17011C1.95514 6.06987 1.92507 6.01975 1.92507 5.96437C1.92506 5.90899 1.95512 5.85886 2.01524 5.7586L2.9964 4.1224C3.0533 4.0275 3.08176 3.98005 3.12761 3.95408C3.17347 3.92811 3.2288 3.92811 3.33945 3.92811H5.32977C5.44036 3.92811 5.49566 3.92811 5.54151 3.90216C5.58735 3.87621 5.61581 3.82879 5.67273 3.73397L6.6619 2.08599C6.71881 1.99116 6.74727 1.94375 6.79312 1.9178C6.83896 1.89185 6.89426 1.89185 7.00486 1.89185H8.99529C9.10588 1.89185 9.16118 1.89185 9.20703 1.9178C9.25287 1.94375 9.28133 1.99116 9.33825 2.08599L10.3274 3.73397C10.3843 3.82879 10.4128 3.87621 10.4586 3.90216C10.5045 3.92811 10.5598 3.92811 10.6704 3.92811H12.6607C12.7713 3.92811 12.8267 3.92811 12.8725 3.95408C12.9184 3.98005 12.9468 4.0275 13.0037 4.1224L13.9849 5.7586C14.045 5.85886 14.0751 5.90899 14.0751 5.96437C14.0751 6.01975 14.045 6.06987 13.9849 6.17011L13.0107 7.79377Z", stroke: "currentColor", strokeMiterlimit: "10" })
] });
var IconSettingsOutlineRegular = (props) => /* @__PURE__ */ jsx2(IconSettingsOutlineArtwork, { ...props, strokeWidth: ICON_REGULAR_STROKE });
var IconCheckOutlineArtwork = ({ size = 16, className, strokeWidth }) => /* @__PURE__ */ jsx2("svg", { width: size, height: size, className, viewBox: "0 0 16 16", fill: "none", xmlns: "http://www.w3.org/2000/svg", "aria-hidden": "true", strokeWidth, children: /* @__PURE__ */ jsx2("path", { d: "M2.25 8.5L5.49732 11.7473C5.90519 12.1552 6.57263 12.1344 6.95426 11.7018L13.75 4", stroke: "currentColor" }) });
var IconCheckOutlineRegular = (props) => /* @__PURE__ */ jsx2(IconCheckOutlineArtwork, { ...props, strokeWidth: ICON_REGULAR_STROKE });
var IconChevronRightOutlineArtwork = ({ size = 14, className, strokeWidth }) => /* @__PURE__ */ jsx2("svg", { width: size, height: size, className, viewBox: "0 0 16 16", fill: "none", xmlns: "http://www.w3.org/2000/svg", "aria-hidden": "true", strokeWidth, children: /* @__PURE__ */ jsx2("path", { d: "M6 12L9.29289 8.70711C9.68342 8.31658 9.68342 7.68342 9.29289 7.29289L6 4", stroke: "currentColor" }) });
var IconChevronRightOutlineRegular = (props) => /* @__PURE__ */ jsx2(IconChevronRightOutlineArtwork, { ...props, strokeWidth: ICON_REGULAR_STROKE });
var IconCloseOutlineArtwork = ({ size = 16, className, strokeWidth }) => /* @__PURE__ */ jsxs2("svg", { width: size, height: size, className, viewBox: "0 0 16 16", fill: "none", xmlns: "http://www.w3.org/2000/svg", "aria-hidden": "true", strokeWidth, children: [
  /* @__PURE__ */ jsx2("path", { d: "M2.5 2.5L13.5 13.5", stroke: "currentColor" }),
  /* @__PURE__ */ jsx2("path", { d: "M13.5 2.5L2.5 13.5", stroke: "currentColor" })
] });
var IconCloseOutlineRegular = (props) => /* @__PURE__ */ jsx2(IconCloseOutlineArtwork, { ...props, strokeWidth: ICON_REGULAR_STROKE });
var IconCopyOutlineArtwork = ({ size = 16, className, strokeWidth }) => /* @__PURE__ */ jsxs2("svg", { width: size, height: size, className, viewBox: "0 0 16 16", fill: "none", xmlns: "http://www.w3.org/2000/svg", "aria-hidden": "true", strokeWidth, children: [
  /* @__PURE__ */ jsx2("rect", { x: "1.52075", y: "4.07373", width: "10.3932", height: "10.3932", rx: "2", stroke: "currentColor" }),
  /* @__PURE__ */ jsx2("path", { d: "M11.9792 1.53296C13.36 1.53296 14.4792 2.65225 14.4792 4.03296V9.42847C14.4792 10.3756 13.9521 11.1987 13.1755 11.6228V10.3298C13.3652 10.0787 13.4792 9.7674 13.4792 9.42847V4.03296C13.4792 3.20453 12.8077 2.53296 11.9792 2.53296H6.58374C6.27966 2.53301 5.99684 2.6235 5.7605 2.77905H4.42358C4.85652 2.03463 5.66056 1.53304 6.58374 1.53296H11.9792Z", fill: "currentColor" })
] });
var IconCopyOutlineRegular = (props) => /* @__PURE__ */ jsx2(IconCopyOutlineArtwork, { ...props, strokeWidth: ICON_REGULAR_STROKE });
var IconRefreshOutlineArtwork = ({ size = 16, className, strokeWidth }) => /* @__PURE__ */ jsxs2("svg", { width: size, height: size, className, viewBox: "0 0 16 16", fill: "none", xmlns: "http://www.w3.org/2000/svg", "aria-hidden": "true", strokeWidth, children: [
  /* @__PURE__ */ jsx2("path", { d: "M14.5001 8C14.5 9.28552 14.1188 10.5422 13.4045 11.611C12.6903 12.6799 11.6752 13.5129 10.4875 14.0049C9.29982 14.4968 7.99295 14.6255 6.73212 14.3747C5.4713 14.124 4.31314 13.505 3.4041 12.596C2.49514 11.687 1.87614 10.5288 1.62537 9.26798C1.37459 8.00716 1.50331 6.70028 1.99525 5.51261C2.48719 4.32494 3.32025 3.30981 4.3891 2.59557C5.45795 1.88134 6.71458 1.50008 8.0001 1.5C9.9001 1.5 11.7001 2.3 13.0001 3.6L14.5001 5.1", stroke: "currentColor" }),
  /* @__PURE__ */ jsx2("path", { d: "M14.4999 1.5V5.1H10.8999", stroke: "currentColor" })
] });
var IconRefreshOutlineRegular = (props) => /* @__PURE__ */ jsx2(IconRefreshOutlineArtwork, { ...props, strokeWidth: ICON_REGULAR_STROKE });
var IconUserOutlineArtwork = ({ size = 16, className, strokeWidth }) => /* @__PURE__ */ jsxs2("svg", { width: size, height: size, className, viewBox: "0 0 16 16", fill: "none", xmlns: "http://www.w3.org/2000/svg", "aria-hidden": "true", strokeWidth, children: [
  /* @__PURE__ */ jsx2("path", { d: "M8 8.25C9.51878 8.25 10.75 7.01878 10.75 5.5C10.75 3.98122 9.51878 2.75 8 2.75C6.48122 2.75 5.25 3.98122 5.25 5.5C5.25 7.01878 6.48122 8.25 8 8.25Z", stroke: "currentColor" }),
  /* @__PURE__ */ jsx2("path", { d: "M2.5 14.5C2.5 11.5 5.25 10.25 8 10.25C10.75 10.25 13.5 11.5 13.5 14.5", stroke: "currentColor" })
] });
var IconUserOutlineRegular = (props) => /* @__PURE__ */ jsx2(IconUserOutlineArtwork, { ...props, strokeWidth: ICON_REGULAR_STROKE });
var IconLoadingOutlineArtwork = ({ size = 16, className, strokeWidth }) => /* @__PURE__ */ jsx2("svg", { width: size, height: size, className, viewBox: "0 0 16 16", fill: "none", xmlns: "http://www.w3.org/2000/svg", "aria-hidden": "true", strokeWidth, children: /* @__PURE__ */ jsx2("path", { d: "M12.596 12.596C11.687 13.5049 10.5288 14.1239 9.26798 14.3747C8.00716 14.6255 6.70028 14.4968 5.51261 14.0048C4.32494 13.5129 3.30981 12.6798 2.59557 11.611C1.88134 10.5421 1.50008 9.2855 1.5 7.99998C1.50008 6.71446 1.88134 5.45783 2.59557 4.38898C3.30981 3.32013 4.32494 2.48707 5.51261 1.99513C6.70028 1.50319 8.00716 1.37447 9.26798 1.62524C10.5288 1.87602 11.687 2.49502 12.596 3.40398", stroke: "currentColor" }) });
var IconLoadingOutlineRegular = (props) => /* @__PURE__ */ jsx2(IconLoadingOutlineArtwork, { ...props, strokeWidth: ICON_REGULAR_STROKE });
var IconCodeOutlineArtwork = ({ size = 16, className, strokeWidth }) => /* @__PURE__ */ jsxs2("svg", { width: size, height: size, className, viewBox: "0 0 16 16", fill: "none", xmlns: "http://www.w3.org/2000/svg", "aria-hidden": "true", strokeWidth, children: [
  /* @__PURE__ */ jsx2("path", { d: "M6.27612 1.5L4.52612 14.5", stroke: "currentColor" }),
  /* @__PURE__ */ jsx2("path", { d: "M11.4739 1.5L9.72388 14.5", stroke: "currentColor" }),
  /* @__PURE__ */ jsx2("path", { d: "M2.39868 5.5H14.0681", stroke: "currentColor" }),
  /* @__PURE__ */ jsx2("path", { d: "M1.93188 10.5H13.6013", stroke: "currentColor" })
] });
var IconCodeOutlineRegular = (props) => /* @__PURE__ */ jsx2(IconCodeOutlineArtwork, { ...props, strokeWidth: ICON_REGULAR_STROKE });
var IconSparkleArtwork = ({ size = 16, className, strokeWidth }) => /* @__PURE__ */ jsxs2("svg", { width: size, height: size, className, viewBox: "0 0 16 16", fill: "none", xmlns: "http://www.w3.org/2000/svg", "aria-hidden": "true", strokeWidth, children: [
  /* @__PURE__ */ jsx2("path", { d: "M5.875 3C5.875 6.33333 7.54167 8 10.875 8C7.54167 8 5.875 9.66667 5.875 13C5.875 9.66667 4.20833 8 0.875 8C4.20833 8 5.875 6.33333 5.875 3Z", stroke: "currentColor" }),
  /* @__PURE__ */ jsx2("path", { d: "M12.375 1.55823C12.375 3.39156 13.2917 4.30823 15.125 4.30823C13.2917 4.30823 12.375 5.22489 12.375 7.05823C12.375 5.22489 11.4583 4.30823 9.625 4.30823C11.4583 4.30823 12.375 3.39156 12.375 1.55823Z", stroke: "currentColor" }),
  /* @__PURE__ */ jsx2("path", { d: "M12.375 10.4418C12.375 11.7751 13.0417 12.4418 14.375 12.4418C13.0417 12.4418 12.375 13.1084 12.375 14.4418C12.375 13.1084 11.7083 12.4418 10.375 12.4418C11.7083 12.4418 12.375 11.7751 12.375 10.4418Z", stroke: "currentColor" })
] });
var IconSparkleRegular = (props) => /* @__PURE__ */ jsx2(IconSparkleArtwork, { ...props, strokeWidth: ICON_REGULAR_STROKE });
var IconWrapLinesOutlineArtwork = ({ size = 16, className, strokeWidth }) => /* @__PURE__ */ jsxs2("svg", { width: size, height: size, className, viewBox: "0 0 16 16", fill: "none", xmlns: "http://www.w3.org/2000/svg", "aria-hidden": "true", strokeWidth, children: [
  /* @__PURE__ */ jsx2("path", { d: "M2.3457 3.19299H13.6541", stroke: "currentColor" }),
  /* @__PURE__ */ jsx2("path", { d: "M2.3457 7.46497H9.19332", stroke: "currentColor" }),
  /* @__PURE__ */ jsx2("path", { d: "M2.3457 11.7369H6.4849", stroke: "currentColor" }),
  /* @__PURE__ */ jsx2("path", { d: "M9.1936 7.46497H11.5183C12.6981 7.46497 13.6544 8.42132 13.6544 9.60103C13.6544 10.7808 12.6981 11.7371 11.5183 11.7371H9.1936", stroke: "currentColor" }),
  /* @__PURE__ */ jsx2("path", { d: "M10.9505 9.7677L9.12262 11.5956C9.04452 11.6737 9.04452 11.8003 9.12262 11.8784L10.9505 13.7063", stroke: "currentColor" })
] });
var IconWrapLinesOutlineRegular = (props) => /* @__PURE__ */ jsx2(IconWrapLinesOutlineArtwork, { ...props, strokeWidth: ICON_REGULAR_STROKE });
var IconNowrapFillArtwork = ({ size = 16, className }) => /* @__PURE__ */ jsxs2("svg", { width: size, height: size, className, viewBox: "0 0 16 16", fill: "none", xmlns: "http://www.w3.org/2000/svg", "aria-hidden": "true", children: [
  /* @__PURE__ */ jsx2("path", { d: "M2 15H1V1H2V15Z", fill: "currentColor" }),
  /* @__PURE__ */ jsx2("path", { d: "M12.3535 7.64645C12.5487 7.84171 12.5487 8.15829 12.3535 8.35355L9.85352 10.8535L9.14648 10.1465L10.793 8.5H3.5V7.5H10.793L9.14648 5.85352L9.85352 5.14648L12.3535 7.64645Z", fill: "currentColor" }),
  /* @__PURE__ */ jsx2("path", { d: "M15 15H14V1H15V15Z", fill: "currentColor" })
] });
var IconNowrapFillRegular = (props) => /* @__PURE__ */ jsx2(IconNowrapFillArtwork, { ...props });
var IconWrapFillArtwork = ({ size = 16, className }) => /* @__PURE__ */ jsxs2("svg", { width: size, height: size, className, viewBox: "0 0 16 16", fill: "none", xmlns: "http://www.w3.org/2000/svg", "aria-hidden": "true", children: [
  /* @__PURE__ */ jsx2("path", { d: "M10.9999 8C10.9999 6.89543 10.1046 6 9 6H4.5V5H9C10.6568 5 11.9999 6.34315 11.9999 8C11.9999 9.65685 10.6568 11 9 11H6.20703L6.85351 11.6465L6.14648 12.3535L4.64652 10.8536C4.45126 10.6583 4.45126 10.3417 4.64652 10.1464L6.14648 8.64648L6.85351 9.35352L6.20703 10H9C10.1046 10 10.9999 9.10457 10.9999 8Z", fill: "currentColor" }),
  /* @__PURE__ */ jsx2("path", { d: "M2 15H1V1H2V15Z", fill: "currentColor" }),
  /* @__PURE__ */ jsx2("path", { d: "M15 15H14V1H15V15Z", fill: "currentColor" })
] });
var IconWrapFillRegular = (props) => /* @__PURE__ */ jsx2(IconWrapFillArtwork, { ...props });

// packages/client/ui-primitives/src/Tooltip.tsx
import { cloneElement, createContext, useCallback, useContext, useEffect as useEffect2, useId as useId2, useRef, useState } from "react";
import { createPortal } from "react-dom";

// packages/client/ui-primitives/src/ShortcutKeys.module.css
var ShortcutKeys_default = {
  keys: "ShortcutKeys_keys",
  key: "ShortcutKeys_key",
  tooltip: "ShortcutKeys_tooltip",
  separator: "ShortcutKeys_separator",
  joined: "ShortcutKeys_joined"
};

// packages/client/ui-primitives/src/ShortcutKeys.tsx
import clsx from "clsx";
import { jsx as jsx3 } from "react/jsx-runtime";
function ShortcutKeys({ keys, variant = "plain", className }) {
  return /* @__PURE__ */ jsx3("span", { className: clsx(ShortcutKeys_default.keys, variant === "tooltip" && ShortcutKeys_default.tooltip, variant === "tooltip" && keys.includes("+") && ShortcutKeys_default.joined, className), children: keys.map((key, index) => /* @__PURE__ */ jsx3("kbd", { className: key === "+" ? ShortcutKeys_default.separator : ShortcutKeys_default.key, children: key }, index)) });
}

// packages/client/ui-primitives/src/useDismissOnOutsidePointer.ts
import { useEffect } from "react";
function useDismissOnOutsidePointer(root, open, setOpen, portal) {
  useEffect(() => {
    if (!open) return;
    const closeOutside = (event) => {
      if (event.target instanceof Node && root.current?.contains(event.target) !== true && portal?.current?.contains(event.target) !== true) {
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", closeOutside);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
    };
  }, [root, open, setOpen, portal]);
}

// packages/client/ui-primitives/src/Tooltip.module.css
var Tooltip_default = {
  bubble: "Tooltip_bubble",
  "tooltip-in": "Tooltip_tooltip-in",
  label: "Tooltip_label"
};

// packages/client/ui-primitives/src/input-modality.ts
var INPUT_MODALITY = { pointer: "pointer", keyboard: "keyboard" };
var INPUT_MODALITY_ATTRIBUTE = "data-input-modality";
var FOCUS_NAVIGATION = /* @__PURE__ */ new Set(["Tab", "Home", "End", "PageUp", "PageDown"]);
var pointer = false;
var pointerOwnsFocus = false;
var keyFocusOrigin;
function publish() {
  document.documentElement.setAttribute(INPUT_MODALITY_ATTRIBUTE, pointerOwnsFocus ? INPUT_MODALITY.pointer : INPUT_MODALITY.keyboard);
}
function pointerModality() {
  return pointer;
}
if (typeof window !== "undefined") {
  window.addEventListener("pointerdown", () => {
    pointer = true;
    pointerOwnsFocus = true;
    keyFocusOrigin = void 0;
    publish();
  }, true);
  window.addEventListener("keydown", (event) => {
    pointer = false;
    if (event.isComposing) {
      keyFocusOrigin = void 0;
      return;
    }
    keyFocusOrigin = event.composedPath()[0];
    if (!FOCUS_NAVIGATION.has(event.key) && !event.key.startsWith("Arrow")) return;
    pointerOwnsFocus = false;
    publish();
  }, true);
  window.addEventListener("focusin", (event) => {
    if (keyFocusOrigin === void 0 || event.composedPath()[0] === keyFocusOrigin) return;
    keyFocusOrigin = void 0;
    if (!pointerOwnsFocus) return;
    pointerOwnsFocus = false;
    publish();
  }, true);
  window.addEventListener("blur", () => {
    keyFocusOrigin = void 0;
  });
}

// packages/client/ui-primitives/src/Tooltip.tsx
import { jsx as jsx4, jsxs as jsxs3 } from "react/jsx-runtime";
var TooltipSuppression = createContext(null);
function Tooltip({ label, shortcutKeys, side = "right", align = "center", delayMs = 0, focusDelayMs = 0, gap = 8, disabled = false, portal = false, maxWidth, openOnClick = false, children }) {
  const id = useId2();
  const [pinned, setPinned] = useState(false);
  const anchor = useRef(null);
  const childRef = children.ref;
  const mergedRef = useCallback((el) => {
    anchor.current = el;
    if (typeof childRef === "function") childRef(el);
    else if (childRef != null) childRef.current = el;
  }, [childRef]);
  const [pos, setPos] = useState(null);
  const bubble = useRef(null);
  const resolvedLabel = pos === null ? null : typeof label === "function" ? label() : label;
  const y = pos === null ? 0 : side === "right" ? pos.top + (pos.bottom - pos.top) / 2 : side === "top" ? pos.top - gap : pos.bottom + gap;
  const showTimer = useRef(null);
  const triggers = useRef({ hover: false, focus: false });
  const suppressAncestors = useContext(TooltipSuppression);
  const [suppressed, setSuppressed] = useState(false);
  const announce = useCallback((active) => {
    suppressAncestors?.(active);
  }, [suppressAncestors]);
  const visible = pos !== null && !disabled;
  useEffect2(() => {
    const el = bubble.current;
    if (pos === null || !visible || suppressed || el === null) return;
    const edgeMargin = 12;
    let size;
    let placement = side;
    const fit = () => {
      if (size === void 0) return;
      const { inlineSize: width, blockSize: height } = size;
      const offset = side === "right" ? 0 : align === "end" ? width : width / 2;
      const left = Math.max(edgeMargin, Math.min(pos.x - offset, window.innerWidth - edgeMargin - width));
      const fitsBelow = pos.bottom + gap + height <= window.innerHeight - edgeMargin;
      const fitsAbove = pos.top - gap - height >= edgeMargin;
      if (placement === "bottom" && !fitsBelow && fitsAbove) placement = "top";
      else if (placement === "top" && !fitsAbove && fitsBelow) placement = "bottom";
      el.style.left = `${left + offset}px`;
      el.style.top = `${placement === "right" ? (pos.top + pos.bottom) / 2 : placement === "top" ? pos.top - gap : pos.bottom + gap}px`;
      el.dataset.side = placement;
      el.style.visibility = "visible";
    };
    const observer = new ResizeObserver((entries) => {
      size = entries[0]?.borderBoxSize[0];
      fit();
    });
    observer.observe(el, { box: "border-box" });
    window.addEventListener("resize", fit);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", fit);
    };
  }, [align, gap, pos, side, suppressed, visible]);
  useEffect2(() => {
    announce(visible);
    return () => {
      announce(false);
    };
  }, [announce, visible]);
  const cancelShow = useCallback(() => {
    if (showTimer.current === null) return;
    clearTimeout(showTimer.current);
    showTimer.current = null;
  }, []);
  useEffect2(() => {
    if (pinned && (disabled || !openOnClick)) setPinned(false);
    if (disabled) {
      cancelShow();
      triggers.current = { hover: false, focus: false };
      setPos(null);
    }
    return cancelShow;
  }, [cancelShow, disabled, openOnClick, pinned]);
  const show = () => {
    if (disabled) return;
    const el = anchor.current;
    if (el === null) return;
    const r = el.getBoundingClientRect();
    setPos({
      x: side === "right" ? r.right + 10 : align === "end" ? r.right : r.left + r.width / 2,
      top: r.top,
      bottom: r.bottom
    });
    announce(true);
  };
  const showAfterDelay = (delay) => {
    cancelShow();
    if (delay <= 0) {
      show();
      return;
    }
    showTimer.current = setTimeout(() => {
      showTimer.current = null;
      show();
    }, delay);
  };
  const withdraw = useCallback(() => {
    setPinned(false);
    setPos(null);
    announce(false);
  }, [announce]);
  const hide = () => {
    cancelShow();
    if (!triggers.current.hover && !triggers.current.focus && !pinned) withdraw();
  };
  const dismiss = useCallback(() => {
    cancelShow();
    triggers.current = { hover: false, focus: false };
    withdraw();
  }, [cancelShow, withdraw]);
  useDismissOnOutsidePointer(anchor, openOnClick && visible, dismiss, bubble);
  useEffect2(() => {
    if (!openOnClick || !visible) return;
    const onKeyDown = (event) => {
      if (event.key !== "Escape" && event.key !== "Tab") return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
      }
      dismiss();
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [dismiss, openOnClick, visible]);
  const content = visible && !suppressed && /* @__PURE__ */ jsxs3(
    "span",
    {
      ref: bubble,
      id: openOnClick ? id : void 0,
      className: Tooltip_default.bubble,
      "data-side": side,
      "data-portal": portal || void 0,
      "data-pinned": pinned || void 0,
      "data-align": align,
      "data-has-shortcut": shortcutKeys?.length ? true : void 0,
      style: { left: pos.x, top: y, visibility: "hidden", ...maxWidth === void 0 ? {} : { maxWidth } },
      role: "tooltip",
      "aria-label": shortcutKeys?.length ? [resolvedLabel, shortcutKeys.join(" ")].filter(Boolean).join(" ") : void 0,
      children: [
        resolvedLabel && /* @__PURE__ */ jsx4("span", { className: Tooltip_default.label, children: resolvedLabel }),
        shortcutKeys !== void 0 && shortcutKeys.length > 0 && /* @__PURE__ */ jsx4(ShortcutKeys, { keys: shortcutKeys, variant: "tooltip" })
      ]
    }
  );
  return /* @__PURE__ */ jsxs3(TooltipSuppression.Provider, { value: setSuppressed, children: [
    cloneElement(children, {
      ref: mergedRef,
      "aria-describedby": openOnClick && visible ? [children.props["aria-describedby"], id].filter(Boolean).join(" ") : children.props["aria-describedby"],
      onMouseEnter: (e) => {
        children.props.onMouseEnter?.(e);
        triggers.current.hover = true;
        showAfterDelay(delayMs);
      },
      onMouseLeave: (e) => {
        children.props.onMouseLeave?.(e);
        triggers.current.hover = false;
        cancelShow();
        if (!pinned) withdraw();
      },
      // Activating an ordinary action dismisses the bubble: it often changes
      // what the anchor now does (pin → unpin), and the click leaves the
      // anchor focused, which would otherwise pin the relabelled bubble up.
      onClick: (e) => {
        children.props.onClick?.(e);
        triggers.current.focus = false;
        cancelShow();
        if (openOnClick && !disabled && !pinned) {
          setPinned(true);
          show();
        } else withdraw();
      },
      onFocus: (e) => {
        children.props.onFocus?.(e);
        if (pointerModality()) return;
        triggers.current.focus = true;
        showAfterDelay(focusDelayMs);
      },
      onBlur: (e) => {
        children.props.onBlur?.(e);
        triggers.current.focus = false;
        hide();
      }
    }),
    portal ? content !== false && createPortal(content, document.body) : content
  ] });
}

// packages/client/ui-primitives/src/markdown/highlight.ts
import { createHighlighterCoreSync, createCssVariablesTheme } from "shiki/core";
import { createJavaScriptRegexEngine, defaultJavaScriptRegexConstructor } from "shiki/engine/javascript";
import langTs from "@shikijs/langs/typescript";
import langBash from "@shikijs/langs/shellscript";
import langJson from "@shikijs/langs/json";
var LANGS = [langTs, langBash, langJson];
var LAZY_GRAMMARS = /* @__PURE__ */ new Map([
  ["python", () => import("@shikijs/langs/python")],
  ["ruby", () => import("@shikijs/langs/ruby")],
  ["go", () => import("@shikijs/langs/go")],
  ["rust", () => import("@shikijs/langs/rust")],
  ["java", () => import("@shikijs/langs/java")],
  ["c", () => import("@shikijs/langs/c")],
  ["cpp", () => import("@shikijs/langs/cpp")],
  ["csharp", () => import("@shikijs/langs/csharp")],
  ["kotlin", () => import("@shikijs/langs/kotlin")],
  ["swift", () => import("@shikijs/langs/swift")],
  ["php", () => import("@shikijs/langs/php")],
  ["yaml", () => import("@shikijs/langs/yaml")],
  ["toml", () => import("@shikijs/langs/toml")],
  ["ini", () => import("@shikijs/langs/ini")],
  ["markdown", () => import("@shikijs/langs/markdown")],
  ["mdx", () => import("@shikijs/langs/mdx")],
  ["html", () => import("@shikijs/langs/html")],
  ["css", () => import("@shikijs/langs/css")],
  ["scss", () => import("@shikijs/langs/scss")],
  ["less", () => import("@shikijs/langs/less")],
  ["sql", () => import("@shikijs/langs/sql")],
  ["xml", () => import("@shikijs/langs/xml")],
  ["lua", () => import("@shikijs/langs/lua")],
  ["bat", () => import("@shikijs/langs/bat")],
  ["powershell", () => import("@shikijs/langs/powershell")],
  ["fish", () => import("@shikijs/langs/fish")],
  ["dotenv", () => import("@shikijs/langs/dotenv")],
  ["log", () => import("@shikijs/langs/log")],
  ["csv", () => import("@shikijs/langs/csv")],
  ["diff", () => import("@shikijs/langs/diff")],
  ["http", () => import("@shikijs/langs/http")],
  ["rst", () => import("@shikijs/langs/rst")],
  ["latex", () => import("@shikijs/langs/latex")],
  ["bibtex", () => import("@shikijs/langs/bibtex")],
  ["asciidoc", () => import("@shikijs/langs/asciidoc")],
  ["r", () => import("@shikijs/langs/r")],
  ["julia", () => import("@shikijs/langs/julia")],
  ["dart", () => import("@shikijs/langs/dart")],
  ["scala", () => import("@shikijs/langs/scala")],
  ["clojure", () => import("@shikijs/langs/clojure")],
  ["erlang", () => import("@shikijs/langs/erlang")],
  ["elixir", () => import("@shikijs/langs/elixir")],
  ["haskell", () => import("@shikijs/langs/haskell")],
  ["fsharp", () => import("@shikijs/langs/fsharp")],
  ["vb", () => import("@shikijs/langs/vb")],
  ["perl", () => import("@shikijs/langs/perl")],
  ["verilog", () => import("@shikijs/langs/verilog")],
  ["system-verilog", () => import("@shikijs/langs/system-verilog")],
  ["graphql", () => import("@shikijs/langs/graphql")],
  ["proto", () => import("@shikijs/langs/proto")],
  ["hcl", () => import("@shikijs/langs/hcl")],
  ["nix", () => import("@shikijs/langs/nix")],
  ["vue", () => import("@shikijs/langs/vue")],
  ["svelte", () => import("@shikijs/langs/svelte")],
  ["make", () => import("@shikijs/langs/make")],
  ["cmake", () => import("@shikijs/langs/cmake")],
  ["groovy", () => import("@shikijs/langs/groovy")]
]);
var LANG_ALIASES = /* @__PURE__ */ new Map([
  ["typescript", "typescript"],
  ["ts", "typescript"],
  ["tsx", "typescript"],
  ["javascript", "typescript"],
  ["js", "typescript"],
  ["jsx", "typescript"],
  ["shellscript", "shellscript"],
  ["bash", "shellscript"],
  ["sh", "shellscript"],
  ["shell", "shellscript"],
  ["zsh", "shellscript"],
  ["json", "json"],
  ["jsonc", "json"],
  ["py", "python"],
  ["python", "python"],
  ["rb", "ruby"],
  ["ruby", "ruby"],
  ["go", "go"],
  ["rs", "rust"],
  ["rust", "rust"],
  ["java", "java"],
  ["c", "c"],
  ["cpp", "cpp"],
  ["cs", "csharp"],
  ["csharp", "csharp"],
  ["kotlin", "kotlin"],
  ["swift", "swift"],
  ["php", "php"],
  ["yaml", "yaml"],
  ["yml", "yaml"],
  ["toml", "toml"],
  ["ini", "ini"],
  ["md", "markdown"],
  ["markdown", "markdown"],
  ["mdx", "mdx"],
  ["html", "html"],
  ["css", "css"],
  ["scss", "scss"],
  ["less", "less"],
  ["sql", "sql"],
  ["xml", "xml"],
  ["lua", "lua"],
  ["bat", "bat"],
  ["batch", "bat"],
  ["powershell", "powershell"],
  ["ps1", "powershell"],
  ["ps", "powershell"],
  ["fish", "fish"],
  ["properties", "ini"],
  ["dotenv", "dotenv"],
  ["env", "dotenv"],
  ["log", "log"],
  ["csv", "csv"],
  ["diff", "diff"],
  ["patch", "diff"],
  ["http", "http"],
  ["rst", "rst"],
  ["latex", "latex"],
  ["tex", "latex"],
  ["bibtex", "bibtex"],
  ["bib", "bibtex"],
  ["asciidoc", "asciidoc"],
  ["adoc", "asciidoc"],
  ["r", "r"],
  ["julia", "julia"],
  ["jl", "julia"],
  ["dart", "dart"],
  ["scala", "scala"],
  ["clojure", "clojure"],
  ["clj", "clojure"],
  ["erlang", "erlang"],
  ["erl", "erlang"],
  ["elixir", "elixir"],
  ["ex", "elixir"],
  ["exs", "elixir"],
  ["haskell", "haskell"],
  ["hs", "haskell"],
  ["fsharp", "fsharp"],
  ["fs", "fsharp"],
  ["fsi", "fsharp"],
  ["fsx", "fsharp"],
  ["vb", "vb"],
  ["vbnet", "vb"],
  ["perl", "perl"],
  ["pl", "perl"],
  ["pm", "perl"],
  ["verilog", "verilog"],
  // Shiki's own `v` grammar is the V language; the fence label and the `.v`
  // extension both name Verilog here, so a future V registration needs a
  // different alias.
  ["v", "verilog"],
  ["system-verilog", "system-verilog"],
  ["systemverilog", "system-verilog"],
  ["sv", "system-verilog"],
  ["svh", "system-verilog"],
  ["graphql", "graphql"],
  ["gql", "graphql"],
  ["proto", "proto"],
  ["protobuf", "proto"],
  ["hcl", "hcl"],
  ["tf", "hcl"],
  ["tfvars", "hcl"],
  ["nix", "nix"],
  ["vue", "vue"],
  ["svelte", "svelte"],
  ["make", "make"],
  ["makefile", "make"],
  ["mk", "make"],
  ["cmake", "cmake"],
  ["groovy", "groovy"],
  ["gradle", "groovy"]
]);
function grammarForHint(lang) {
  return lang === void 0 ? void 0 : LANG_ALIASES.get(lang.toLowerCase());
}
function supportsHighlighting(lang) {
  return grammarForHint(lang) !== void 0;
}
var cssVariablesTheme = createCssVariablesTheme({
  name: "css-variables",
  variablePrefix: "--shiki-",
  fontStyle: true
});
var regexEngine = createJavaScriptRegexEngine({
  forgiving: true,
  regexConstructor: (pattern) => defaultJavaScriptRegexConstructor(pattern, {
    lazyCompileLength: Number.POSITIVE_INFINITY
  })
});
var TOKENIZE_MAX_LINE_LENGTH = 1e3;
var singleton;
var BOOT_GRAMMAR_WARMUPS = [
  { lang: "typescript", code: "const answer: number = 42" },
  { lang: "shellscript", code: `printf '%s\\n' "$HOME"` },
  { lang: "json", code: '{"ready":true}' }
];
function createHighlighter() {
  const instance = createHighlighterCoreSync({
    themes: [cssVariablesTheme],
    langs: LANGS,
    engine: regexEngine
  });
  for (const sample of BOOT_GRAMMAR_WARMUPS) {
    instance.codeToTokens(sample.code, {
      lang: sample.lang,
      theme: "css-variables",
      tokenizeTimeLimit: 0
    });
  }
  return instance;
}
function highlighter() {
  singleton ??= createHighlighter();
  return singleton;
}
var requested = /* @__PURE__ */ new Set();
var listeners = /* @__PURE__ */ new Set();
var loadCount = 0;
function subscribeGrammarLoaded(listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
function grammarLoadCount() {
  return loadCount;
}
function ensureGrammar(resolved) {
  const load = LAZY_GRAMMARS.get(resolved);
  if (load === void 0) return true;
  if (highlighter().getLoadedLanguages().includes(resolved)) return true;
  if (!requested.has(resolved)) {
    requested.add(resolved);
    void load().then((mod) => {
      highlighter().loadLanguageSync(mod.default);
      loadCount += 1;
      for (const listener of listeners) listener();
    });
  }
  return false;
}
var warmupTimer = setTimeout(() => {
  highlighter();
}, 0);
warmupTimer.unref?.();
function highlightToHtml(code, lang) {
  const resolved = grammarForHint(lang);
  if (resolved === void 0) return void 0;
  if (!ensureGrammar(resolved)) return void 0;
  return highlighter().codeToHtml(code, {
    lang: resolved,
    theme: "css-variables",
    tokenizeMaxLineLength: TOKENIZE_MAX_LINE_LENGTH
  });
}
var DECORATION_BITS = [[4, "underline"], [8, "line-through"]];
function spanStyle(token) {
  const style = { color: token.color };
  const bits = token.fontStyle ?? 0;
  if ((bits & 1) !== 0) style.fontStyle = "italic";
  if ((bits & 2) !== 0) style.fontWeight = "bold";
  const decorations = DECORATION_BITS.filter(([bit]) => (bits & bit) !== 0);
  if (decorations.length > 0) style.textDecoration = decorations.map(([, value]) => value).join(" ");
  return style;
}
function lineSpans(line) {
  const spans = [];
  let pendingWhitespace = "";
  for (const [index, token] of line.entries()) {
    if (/^\s+$/.test(token.content) && index + 1 < line.length) {
      pendingWhitespace += token.content;
      continue;
    }
    spans.push({ text: pendingWhitespace + token.content, style: spanStyle(token) });
    pendingWhitespace = "";
  }
  return spans;
}
var StreamingHighlightSession = class {
  /** Grammar id the cache was built with; a different resolution resets it. */
  resolved;
  /** Newline-terminated source prefix covered by {@link spans}. */
  prefix = "";
  /** Cached spans, one entry per completed line of {@link prefix}. */
  spans = [];
  /** Grammar state after {@link prefix}; undefined = the grammar's initial state. */
  state;
  lastCode;
  lastLang;
  lastResult;
  generation = 0;
  lastFrame;
  reset(resolved) {
    this.resolved = resolved;
    this.prefix = "";
    this.spans = [];
    this.state = void 0;
    this.generation += 1;
    this.lastFrame = void 0;
  }
  /** Tokenize `text` with `resolved`, resuming from the cached grammar state when one exists. */
  tokenize(resolved, text) {
    return highlighter().codeToTokensBase(text, {
      lang: resolved,
      theme: "css-variables",
      tokenizeMaxLineLength: TOKENIZE_MAX_LINE_LENGTH,
      ...this.state === void 0 ? {} : { grammarState: this.state }
    });
  }
  /**
   * Tokenize one update as a delta for a retained renderer.
   * @param code - the fence text accumulated so far.
   * @param lang - the language hint.
   * @returns Newly completed lines plus the current tail, or `undefined` for the plain arm.
   */
  updateFrame(code, lang) {
    if (code === this.lastCode && lang === this.lastLang && this.lastFrame !== void 0) {
      return this.lastFrame;
    }
    this.lastCode = code;
    this.lastLang = lang;
    this.lastResult = void 0;
    const resolved = grammarForHint(lang);
    if (resolved === void 0 || !ensureGrammar(resolved)) {
      this.reset(void 0);
      return void 0;
    }
    if (resolved !== this.resolved || !code.startsWith(this.prefix)) this.reset(resolved);
    const firstNewLine = this.spans.length;
    const rest = code.slice(this.prefix.length);
    const lastNewline = rest.lastIndexOf("\n");
    if (lastNewline >= 0) {
      const grownEnd = rest[lastNewline - 1] === "\r" ? lastNewline - 1 : lastNewline;
      const tokens = this.tokenize(resolved, rest.slice(0, grownEnd));
      for (const line of tokens) this.spans.push(lineSpans(line));
      this.state = highlighter().getLastGrammarState(tokens);
      this.prefix = code.slice(0, this.prefix.length + lastNewline + 1);
    }
    this.lastFrame = {
      generation: this.generation,
      appended: this.spans.slice(firstNewLine),
      tail: this.tokenize(resolved, rest.slice(lastNewline + 1)).map(lineSpans)
    };
    return this.lastFrame;
  }
  /**
   * Tokenize the fence's current text into per-line highlighted runs;
   * `undefined` means the caller renders its plain fallback. Idempotent per
   * (`code`, `lang`) input — repeated calls return the identical result array —
   * and a retained line keeps its span-array identity across growing calls, so
   * a React caller can reuse cached line elements. A lazy grammar not yet
   * loaded returns `undefined` and loads in the background exactly as
   * {@link highlightToHtml} does; the next call after it registers highlights.
   * @param code - the fence text accumulated so far (display-trimmed, no synthetic trailing newline).
   * @param lang - the language hint (a markdown fence info string).
   * @returns one entry per line of `code` (each an array of runs), or `undefined` for unknown or not-yet-loaded languages.
   */
  update(code, lang) {
    if (code === this.lastCode && lang === this.lastLang && this.lastResult !== void 0) {
      return this.lastResult;
    }
    const frame = this.updateFrame(code, lang);
    if (frame === void 0) return void 0;
    this.lastResult = [...this.spans, ...frame.tail];
    return this.lastResult;
  }
};

// packages/client/ui-primitives/src/CodeCard.module.css
var CodeCard_default = {
  card: "CodeCard_card",
  header: "CodeCard_header",
  heading: "CodeCard_heading",
  language: "CodeCard_language",
  title: "CodeCard_title",
  actions: "CodeCard_actions",
  status: "CodeCard_status",
  action: "CodeCard_action",
  body: "CodeCard_body"
};

// packages/client/ui-primitives/src/CodeToolbar.tsx
import { jsx as jsx5, jsxs as jsxs4 } from "react/jsx-runtime";
function CodeToolbar({ lang, title, status, labels, copyLabel, copiedLabel, copied, wrapped, onCopy, onWrap }) {
  const wrapLabel = wrapped ? labels.unwrapLabel : labels.wrapLabel;
  const clipboardLabel = copied ? copiedLabel : copyLabel;
  return /* @__PURE__ */ jsxs4("div", { className: CodeCard_default.header, "data-code-block-banner": true, children: [
    /* @__PURE__ */ jsxs4("div", { className: CodeCard_default.heading, children: [
      /* @__PURE__ */ jsx5("span", { className: CodeCard_default.language, children: supportsHighlighting(lang) ? lang : labels.codeLabel }),
      title !== void 0 && /* @__PURE__ */ jsx5("span", { className: CodeCard_default.title, title, children: title })
    ] }),
    /* @__PURE__ */ jsxs4("div", { className: CodeCard_default.actions, children: [
      status !== void 0 && /* @__PURE__ */ jsx5("span", { className: CodeCard_default.status, children: status }),
      onWrap !== void 0 && /* @__PURE__ */ jsx5(Tooltip, { label: wrapLabel, side: "top", portal: true, children: /* @__PURE__ */ jsx5("button", { type: "button", className: CodeCard_default.action, "aria-label": labels.wrapLabel, "aria-pressed": wrapped, onClick: onWrap, children: wrapped ? /* @__PURE__ */ jsx5(IconNowrapFillRegular, { size: 14 }) : /* @__PURE__ */ jsx5(IconWrapFillRegular, { size: 14 }) }) }),
      onCopy !== void 0 && /* @__PURE__ */ jsx5(Tooltip, { label: clipboardLabel, side: "top", portal: true, children: /* @__PURE__ */ jsx5("button", { type: "button", className: CodeCard_default.action, "aria-label": clipboardLabel, onClick: onCopy, children: copied ? /* @__PURE__ */ jsx5(IconCheckOutlineRegular, { size: 14 }) : /* @__PURE__ */ jsx5(IconCopyOutlineRegular, { size: 14 }) }) })
    ] })
  ] });
}

// packages/client/ui-primitives/src/markdown/useViewportHighlighting.ts
import { useCallback as useCallback2, useEffect as useEffect3, useState as useState2 } from "react";
var noop = () => {
};
var HighlightViewport = class {
  observer;
  activators = /* @__PURE__ */ new Map();
  observe(element, activate) {
    if (typeof IntersectionObserver === "undefined") {
      activate();
      return noop;
    }
    this.observer ??= new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const current = this.activators.get(entry.target);
        if (current === void 0) continue;
        this.activators.delete(entry.target);
        this.observer?.unobserve(entry.target);
        current();
      }
      this.releaseEmptyObserver();
    });
    this.activators.set(element, activate);
    this.observer.observe(element);
    return () => {
      this.activators.delete(element);
      this.observer?.unobserve(element);
      this.releaseEmptyObserver();
    };
  }
  releaseEmptyObserver() {
    if (this.activators.size > 0) return;
    this.observer?.disconnect();
    this.observer = void 0;
  }
};
var highlightViewport = new HighlightViewport();
function useViewportHighlighting(target, lang) {
  const supported = supportsHighlighting(lang);
  const [activated, setActivated] = useState2(false);
  const activate = useCallback2(() => {
    setActivated(true);
  }, []);
  useEffect3(() => {
    if (activated || !supported) return;
    const element = target.current;
    if (element === null) return;
    return highlightViewport.observe(element, activate);
  }, [activate, activated, supported, target]);
  return activated && supported;
}

// packages/client/ui-primitives/src/markdown/CodeBlock.module.css
var CodeBlock_default = {
  block: "CodeBlock_block",
  bannerWrap: "CodeBlock_bannerWrap",
  banner: "CodeBlock_banner",
  infostring: "CodeBlock_infostring",
  action: "CodeBlock_action",
  copyButton: "CodeBlock_copyButton",
  content: "CodeBlock_content",
  shiki: "CodeBlock_shiki",
  plain: "CodeBlock_plain",
  card: "CodeBlock_card",
  numbered: "CodeBlock_numbered"
};

// packages/client/ui-primitives/src/markdown/CodeBlock.tsx
import { jsx as jsx6, jsxs as jsxs5 } from "react/jsx-runtime";
var SHIKI_PRE_PROPS = {
  className: "shiki css-variables",
  style: { backgroundColor: "var(--shiki-background)", color: "var(--shiki-foreground)" },
  tabIndex: 0
};
var STREAMING_LINE_GROUP_SIZE = 32;
function renderLine(line, index) {
  return /* @__PURE__ */ jsxs5(Fragment, { children: [
    index > 0 && "\n",
    /* @__PURE__ */ jsx6("span", { className: "line", children: line.map((span, spanIndex) => /* @__PURE__ */ jsx6("span", { style: span.style, children: span.text }, spanIndex)) })
  ] }, index);
}
function CodeBlock({
  code,
  lang,
  streaming,
  className,
  contentRef,
  lineNumbers = false,
  showHeader = true,
  copyLabel,
  copiedLabel,
  toolbarLabels,
  wrap
}) {
  const trimmed = code.endsWith("\n") ? code.slice(0, -1) : code;
  const sourceLines = lineNumbers ? trimmed.split("\n") : void 0;
  const rootRef = useRef2(null);
  const highlighting = useViewportHighlighting(rootRef, lang);
  const loaded = useSyncExternalStore(subscribeGrammarLoaded, grammarLoadCount, grammarLoadCount);
  const sessionRef = useRef2(null);
  const lineCacheRef = useRef2(null);
  const settledRef = useRef2(false);
  const streamedBody = useMemo(() => {
    if (!highlighting) {
      sessionRef.current = null;
      lineCacheRef.current = null;
      settledRef.current = false;
      return void 0;
    }
    if (streaming !== true) {
      const previous2 = lineCacheRef.current;
      if (previous2 !== null && previous2.code === trimmed && previous2.lang === lang) {
        settledRef.current = true;
        return previous2.body;
      }
      sessionRef.current = null;
      lineCacheRef.current = null;
      settledRef.current = true;
      return void 0;
    }
    if (settledRef.current) {
      sessionRef.current = null;
      lineCacheRef.current = null;
      settledRef.current = false;
    }
    sessionRef.current ??= new StreamingHighlightSession();
    const frame = sessionRef.current.updateFrame(trimmed, lang);
    if (frame === void 0) {
      lineCacheRef.current = null;
      return void 0;
    }
    const previous = lineCacheRef.current;
    if (previous?.frame === frame && previous.code === trimmed && previous.lang === lang) {
      return previous.body;
    }
    const sameGeneration = previous?.generation === frame.generation;
    const groups = sameGeneration ? [...previous.groups] : [];
    let pending = sameGeneration ? [...previous.pending] : [];
    let nextLine = sameGeneration ? previous.nextLine : 0;
    for (const line of frame.appended) {
      pending.push(renderLine(line, nextLine));
      nextLine += 1;
      if (pending.length !== STREAMING_LINE_GROUP_SIZE) continue;
      const start = nextLine - pending.length;
      groups.push(/* @__PURE__ */ jsx6(Fragment, { children: pending }, start));
      pending = [];
    }
    const tail = frame.tail.map((line, index) => renderLine(line, nextLine + index));
    const tailGroup = /* @__PURE__ */ jsx6(Fragment, { children: [...pending, ...tail] }, nextLine - pending.length);
    const body2 = /* @__PURE__ */ jsx6("pre", { ...SHIKI_PRE_PROPS, children: /* @__PURE__ */ jsxs5("code", { children: [
      groups,
      tailGroup
    ] }) });
    lineCacheRef.current = {
      code: trimmed,
      lang,
      generation: frame.generation,
      frame,
      groups,
      pending,
      nextLine,
      body: body2
    };
    return body2;
  }, [streaming, highlighting, trimmed, lang, loaded]);
  const html = useMemo(
    () => highlighting && streaming !== true && streamedBody === void 0 ? highlightToHtml(trimmed, lang) : void 0,
    [streaming, highlighting, streamedBody, trimmed, lang, loaded]
  );
  const [copied, setCopied] = useState3(false);
  const [localWrapped, setWrapped] = useState3(true);
  const wrapped = wrap ?? localWrapped;
  const onCopy = useCallback3(() => {
    if (copied) return;
    const text = rootRef.current?.querySelector("pre")?.textContent ?? trimmed;
    void writeClipboard(text).then((ok) => {
      if (!ok) return;
      setCopied(true);
      window.setTimeout(() => {
        setCopied(false);
      }, 1e3);
    });
  }, [copied, trimmed]);
  const body = streamedBody !== void 0 ? streamedBody : html === void 0 ? /* @__PURE__ */ jsx6("pre", { className: CodeBlock_default.plain, children: /* @__PURE__ */ jsx6("code", { children: sourceLines === void 0 ? trimmed : sourceLines.map((line, index) => /* @__PURE__ */ jsxs5(Fragment, { children: [
    index > 0 && "\n",
    /* @__PURE__ */ jsx6("span", { className: "line", children: line })
  ] }, index)) }) }) : /* @__PURE__ */ jsx6("div", { dangerouslySetInnerHTML: { __html: html } });
  return /* @__PURE__ */ jsxs5(
    "div",
    {
      ref: rootRef,
      className: clsx2(CodeBlock_default.block, "md-code-block", lineNumbers && CodeBlock_default.numbered, toolbarLabels !== void 0 && CodeBlock_default.card, className),
      "data-line-numbers": lineNumbers || void 0,
      "data-code-wrap": toolbarLabels === void 0 ? void 0 : wrapped,
      style: sourceLines === void 0 ? void 0 : {
        "--dsl-code-block-line-number-width": `${Math.max(2, String(sourceLines.length).length)}ch`
      },
      children: [
        showHeader && /* @__PURE__ */ jsx6("div", { className: CodeBlock_default.bannerWrap, children: toolbarLabels !== void 0 ? /* @__PURE__ */ jsx6(
          CodeToolbar,
          {
            lang,
            labels: toolbarLabels,
            copyLabel,
            copiedLabel,
            copied,
            wrapped,
            onCopy,
            onWrap: wrap === void 0 ? () => {
              setWrapped((value) => !value);
            } : void 0
          }
        ) : /* @__PURE__ */ jsxs5("div", { className: CodeBlock_default.banner, "data-code-block-banner": true, children: [
          /* @__PURE__ */ jsx6("div", { className: CodeBlock_default.infostring, children: lang ?? "" }),
          /* @__PURE__ */ jsx6("div", { className: CodeBlock_default.action, children: /* @__PURE__ */ jsx6("button", { type: "button", className: CodeBlock_default.copyButton, onClick: onCopy, children: copied ? copiedLabel : copyLabel }) })
        ] }) }),
        /* @__PURE__ */ jsx6("div", { ref: contentRef, className: CodeBlock_default.content, "data-code-block-content": true, children: body })
      ]
    }
  );
}

// packages/client/ui-primitives/src/FileTypeIcon.tsx
import clsx3 from "clsx";

// packages/client/ui-primitives/src/CodeFileIcon.tsx
import { useId as useId3 } from "react";

// packages/client/ui-primitives/src/code-file-icon-artwork.ts
var CODE_FILE_ICON_ID_TOKEN = "__DSH_CODE_ICON_INSTANCE__";
var CODE_FILE_ARTWORK = Object.freeze({
  "angular": '<rect x="1" y="1" width="18" height="18" rx="4" fill="#F8ECEF" stroke="#DDE2E8" stroke-width=".5"/><g transform="translate(3 3) scale(.5833333333)"><path fill="#DD0031" d="M16.712 17.711H7.288l-1.204 2.916L12 24l5.916-3.373-1.204-2.916ZM14.692 0l7.832 16.855.814-12.856L14.692 0ZM9.308 0 .662 3.999l.814 12.856L9.308 0Zm-.405 13.93h6.198L12 6.396 8.903 13.93Z"/></g>',
  "c": '<rect x="1" y="1" width="18" height="18" rx="4" fill="#EEF4F8" stroke="#DDE2E8" stroke-width=".5"/><g transform="translate(3 3) scale(.5833333333)"><path fill="#659AD2" d="M16.5921 9.1962s-.354-3.298-3.627-3.39c-3.2741-.09-4.9552 2.474-4.9552 6.14 0 3.6651 1.858 6.5972 5.0451 6.5972 3.184 0 3.5381-3.665 3.5381-3.665l6.1041.365s.36 3.31-2.196 5.836c-2.552 2.5241-5.6901 2.9371-7.8762 2.9201-2.19-.017-5.2261.034-8.1602-2.97-2.938-3.0101-3.436-5.9302-3.436-8.8002 0-2.8701.556-6.6702 4.047-9.5502C7.444.72 9.849 0 12.254 0c10.0422 0 10.7172 9.2602 10.7172 9.2602z"/></g>',
  "clojure": '<rect x="1" y="1" width="18" height="18" rx="4" fill="#F1F7EC" stroke="#DCEAD2" stroke-width=".5"/><svg x="2.75" y="2.75" width="14.5" height="14.5" viewBox="0 0 128 128" preserveAspectRatio="xMidYMid meet"><g fill="none"><path d="M64 0C28.712 0 0 28.6 0 63.751c0 35.155 28.712 63.753 64 63.753s64-28.598 64-63.753C128 28.6 99.288 0 64 0" fill="#FFF"/><path d="M61.659 64.898a265.825 265.825 0 00-1.867 4.12c-2.322 5.241-4.894 11.62-5.834 15.706-.337 1.455-.546 3.258-.542 5.258 0 .79.043 1.622.11 2.469a30.74 30.74 0 0010.533 1.87 30.796 30.796 0 009.642-1.566 18.09 18.09 0 01-2.011-2.12c-4.11-5.221-6.403-12.872-10.031-25.737M46.485 38.96c-7.85 5.51-12.986 14.6-13.005 24.9.019 10.145 5.001 19.116 12.653 24.65 1.877-7.789 6.582-14.92 13.637-29.214a114.691 114.691 0 00-1.43-3.72c-1.955-4.884-4.776-10.556-7.294-13.124-1.283-1.342-2.84-2.502-4.561-3.492" fill="#91DC47"/><path d="M90.697 98.798c-4.05-.506-7.392-1.116-10.317-2.144a36.708 36.708 0 01-16.32 3.807c-20.293 0-36.742-16.383-36.745-36.602 0-10.97 4.852-20.805 12.528-27.512-2.053-.495-4.194-.783-6.38-.779-10.782.101-22.162 6.044-26.9 22.095-.443 2.337-.337 4.103-.337 6.197 0 31.818 25.895 57.613 57.835 57.613 19.561 0 36.841-9.682 47.305-24.489-5.66 1.405-11.103 2.077-15.763 2.091-1.747 0-3.387-.093-4.906-.277" fill="#63B132"/><path d="M79.829 87.634c.357.176 1.167.464 2.293.783 7.579-5.542 12.504-14.469 12.523-24.558h-.003c-.028-16.82-13.693-30.43-30.582-30.462a30.765 30.765 0 00-9.602 1.554c6.21 7.05 9.196 17.127 12.084 28.148l.005.013c.005.009.924 3.06 2.501 7.11 1.566 4.042 3.797 9.048 6.23 12.696 1.597 2.444 3.354 4.2 4.551 4.716" fill="#90B4FE"/><path d="M17.057 30.311c5.463-3.408 11.04-4.637 15.908-4.593 6.722.02 12.008 2.096 14.544 3.516.612.352 1.194.73 1.764 1.12a36.714 36.714 0 0114.786-3.096c20.295.003 36.747 16.386 36.75 36.601-.003 10.192-4.188 19.408-10.934 26.044a45.3 45.3 0 005.225.29c6.406.004 13.329-1.404 18.52-5.753 3.384-2.84 6.22-6.998 7.792-13.233.307-2.408.484-4.856.484-7.347 0-31.817-25.892-57.614-57.835-57.614-19.372 0-36.508 9.5-47.004 24.065z" fill="#5881D8"/></g></svg>',
  "cmake": '<rect x="1" y="1" width="18" height="18" rx="4" fill="#F2F5F7" stroke="#D9E1E7" stroke-width=".5"/><svg x="2.75" y="2.75" width="14.5" height="14.5" viewBox="0 0 128 128" preserveAspectRatio="xMidYMid meet"><path fill="#064F8C" d="M62.8.4L.3 123.8l68.1-57.9z"/><path fill="#249847" d="M123.8 127.7l-84-33.9L0 127.7z"/><path fill="#BE2128" d="M128 126.6L65.6 2.5l9.2 102.6z"/><path fill="#CDCDCE" d="M71.9 104l-3.1-34.9L42 92z"/></svg>',
  "cpp": '<rect x="1" y="1" width="18" height="18" rx="4" fill="#E8F2F8" stroke="#DDE2E8" stroke-width=".5"/><g transform="translate(3 3) scale(.5833333333)"><path fill="#00599C" d="M22.394 6c-.167-.29-.398-.543-.652-.69L12.926.22c-.509-.294-1.34-.294-1.848 0L2.26 5.31c-.508.293-.923 1.013-.923 1.6v10.18c0 .294.104.62.271.91.167.29.398.543.652.69l8.816 5.09c.508.293 1.34.293 1.848 0l8.816-5.09c.254-.147.485-.4.652-.69.167-.29.27-.616.27-.91V6.91c.003-.294-.1-.62-.268-.91zM12 19.11c-3.92 0-7.109-3.19-7.109-7.11 0-3.92 3.19-7.11 7.11-7.11a7.133 7.133 0 016.156 3.553l-3.076 1.78a3.567 3.567 0 00-3.08-1.78A3.56 3.56 0 008.444 12 3.56 3.56 0 0012 15.555a3.57 3.57 0 003.08-1.778l3.078 1.78A7.135 7.135 0 0112 19.11zm7.11-6.715h-.79v.79h-.79v-.79h-.79v-.79h.79v-.79h.79v.79h.79zm2.962 0h-.79v.79h-.79v-.79h-.79v-.79h.79v-.79h.79v.79h.79z"/></g>',
  "csharp": '<rect x="1" y="1" width="18" height="18" rx="4" fill="#F3EEF7" stroke="#E2D7EA" stroke-width=".5"/><svg x="2.75" y="2.75" width="14.5" height="14.5" viewBox="0 0 128 128" preserveAspectRatio="xMidYMid meet"><path fill="#9B4F96" d="M115.4 30.7L67.1 2.9c-.8-.5-1.9-.7-3.1-.7-1.2 0-2.3.3-3.1.7l-48 27.9c-1.7 1-2.9 3.5-2.9 5.4v55.7c0 1.1.2 2.4 1 3.5l106.8-62c-.6-1.2-1.5-2.1-2.4-2.7z"/><path fill="#68217A" d="M10.7 95.3c.5.8 1.2 1.5 1.9 1.9l48.2 27.9c.8.5 1.9.7 3.1.7 1.2 0 2.3-.3 3.1-.7l48-27.9c1.7-1 2.9-3.5 2.9-5.4V36.1c0-.9-.1-1.9-.6-2.8l-106.6 62z"/><path fill="#fff" d="M85.3 76.1C81.1 83.5 73.1 88.5 64 88.5c-13.5 0-24.5-11-24.5-24.5s11-24.5 24.5-24.5c9.1 0 17.1 5 21.3 12.5l13-7.5c-6.8-11.9-19.6-20-34.3-20-21.8 0-39.5 17.7-39.5 39.5s17.7 39.5 39.5 39.5c14.6 0 27.4-8 34.2-19.8l-12.9-7.6zM97 66.2l.9-4.3h-4.2v-4.7h5.1L100 51h4.9l-1.2 6.1h3.8l1.2-6.1h4.8l-1.2 6.1h2.4v4.7h-3.3l-.9 4.3h4.2v4.7h-5.1l-1.2 6h-4.9l1.2-6h-3.8l-1.2 6h-4.8l1.2-6h-2.4v-4.7H97zm4.8 0h3.8l.9-4.3h-3.8l-.9 4.3z"/></svg>',
  "css": '<rect x="1" y="1" width="18" height="18" rx="4" fill="#1572B6"/><text x="10" y="12.8" text-anchor="middle" font-family="Arial,sans-serif" font-size="6.2" font-weight="900" fill="#fff">CSS</text>',
  "dart": '<rect x="1" y="1" width="18" height="18" rx="4" fill="#ECF7FA" stroke="#D5EAF0" stroke-width=".5"/><svg x="2.75" y="2.75" width="14.5" height="14.5" viewBox="0 0 128 128" preserveAspectRatio="xMidYMid meet"><path fill="#00c4b3" d="M35.2 34.9l-8.3-8.3v59.7l.1 2.8c0 1.3.2 2.8.7 4.3l65.6 23.1 16.3-7.2-74.4-74.4z"/><path d="M27.7 93.4zm81.9 15.9l-16.3 7.2-65.4-23.1c1.3 4.8 4 10.1 7 13.2l21.3 21.2 47.6.1 5.8-18.6z" fill="#22d3c5"/><path fill="#0075c9" d="M1.7 65.1C-.4 67.3.7 72 4 75.5l14.7 14.8 9.2 3.3c-.3-1.5-.7-3-.7-4.3l-.1-2.8-.2-59.8m82.7 82.6l7.2-16.4-23-65.6c-1.5-.3-3-.6-4.3-.7l-2.9-.1-59.6.1"/><path d="M93.6 27.3c.2 0 .2 0 0 0 .2 0 .2 0 0 0zm16 82l17.7-5.8V54.8l-20.4-20.5c-3-3-8.3-5.8-13.2-7l23.1 65.6" fill="#00a8e1"/><path fill="#00c4b3" d="M90.5 18.2L75.7 3.5c-3.4-3.4-8-4.4-10.4-2.3L26.9 26.6h59.5l2.9.1c1.3 0 2.8.2 4.3.7l-3.1-9.2z"/></svg>',
  "docker": '<rect x="1" y="1" width="18" height="18" rx="4" fill="#E8F4FC" stroke="#DDE2E8" stroke-width=".5"/><g transform="translate(3 3) scale(.5833333333)"><path fill="#2496ED" d="M13.983 11.078h2.119a.186.186 0 00.186-.185V9.006a.186.186 0 00-.186-.186h-2.119a.185.185 0 00-.185.185v1.888c0 .102.083.185.185.185m-2.954-5.43h2.118a.186.186 0 00.186-.186V3.574a.186.186 0 00-.186-.185h-2.118a.185.185 0 00-.185.185v1.888c0 .102.082.185.185.185m0 2.716h2.118a.187.187 0 00.186-.186V6.29a.186.186 0 00-.186-.185h-2.118a.185.185 0 00-.185.185v1.887c0 .102.082.185.185.186m-2.93 0h2.12a.186.186 0 00.184-.186V6.29a.185.185 0 00-.185-.185H8.1a.185.185 0 00-.185.185v1.887c0 .102.083.185.185.186m-2.964 0h2.119a.186.186 0 00.185-.186V6.29a.185.185 0 00-.185-.185H5.136a.186.186 0 00-.186.185v1.887c0 .102.084.185.186.186m5.893 2.715h2.118a.186.186 0 00.186-.185V9.006a.186.186 0 00-.186-.186h-2.118a.185.185 0 00-.185.185v1.888c0 .102.082.185.185.185m-2.93 0h2.12a.185.185 0 00.184-.185V9.006a.185.185 0 00-.184-.186h-2.12a.185.185 0 00-.184.185v1.888c0 .102.083.185.185.185m-2.964 0h2.119a.185.185 0 00.185-.185V9.006a.185.185 0 00-.184-.186h-2.12a.186.186 0 00-.186.186v1.887c0 .102.084.185.186.185m-2.92 0h2.12a.185.185 0 00.184-.185V9.006a.185.185 0 00-.184-.186h-2.12a.185.185 0 00-.184.185v1.888c0 .102.082.185.185.185M23.763 9.89c-.065-.051-.672-.51-1.954-.51-.338.001-.676.03-1.01.087-.248-1.7-1.653-2.53-1.716-2.566l-.344-.199-.226.327c-.284.438-.49.922-.612 1.43-.23.97-.09 1.882.403 2.661-.595.332-1.55.413-1.744.42H.751a.751.751 0 00-.75.748 11.376 11.376 0 00.692 4.062c.545 1.428 1.355 2.48 2.41 3.124 1.18.723 3.1 1.137 5.275 1.137.983.003 1.963-.086 2.93-.266a12.248 12.248 0 003.823-1.389c.98-.567 1.86-1.288 2.61-2.136 1.252-1.418 1.998-2.997 2.553-4.4h.221c1.372 0 2.215-.549 2.68-1.009.309-.293.55-.65.707-1.046l.098-.288Z"/></g>',
  "elixir": '<rect x="1" y="1" width="18" height="18" rx="4" fill="#F3EEF6" stroke="#E3D9E8" stroke-width=".5"/><svg x="2.75" y="2.75" width="14.5" height="14.5" viewBox="0 0 128 128" preserveAspectRatio="xMidYMid meet"><linearGradient id="__DSH_CODE_ICON_INSTANCE__elixir-original-a" gradientUnits="userSpaceOnUse" x1="835.592" y1="-36.546" x2="821.211" y2="553.414" gradientTransform="matrix(.1297 0 0 .2 -46.03 17.198)"><stop offset="0" stop-color="#d9d8dc"/><stop offset="1" stop-color="#fff" stop-opacity=".385"/></linearGradient><path fill-rule="evenodd" clip-rule="evenodd" fill="url(#__DSH_CODE_ICON_INSTANCE__elixir-original-a)" d="M64.4.5C36.7 13.9 1.9 83.4 30.9 113.9c26.8 33.5 85.4 1.3 68.4-40.5-21.5-36-35-37.9-34.9-72.9z"/><linearGradient id="__DSH_CODE_ICON_INSTANCE__elixir-original-b" gradientUnits="userSpaceOnUse" x1="942.357" y1="-40.593" x2="824.692" y2="472.243" gradientTransform="matrix(.1142 0 0 .2271 -47.053 17.229)"><stop offset="0" stop-color="#8d67af" stop-opacity=".672"/><stop offset="1" stop-color="#9f8daf"/></linearGradient><path fill-rule="evenodd" clip-rule="evenodd" fill="url(#__DSH_CODE_ICON_INSTANCE__elixir-original-b)" d="M64.4.2C36.8 13.6 1.9 82.9 31 113.5c10.7 12.4 28 16.5 37.7 9.1 26.4-18.8 7.4-53.1 10.4-78.5C68.1 33.9 64.2 11.3 64.4.2z"/><linearGradient id="__DSH_CODE_ICON_INSTANCE__elixir-original-c" gradientUnits="userSpaceOnUse" x1="924.646" y1="120.513" x2="924.646" y2="505.851" gradientTransform="matrix(.1227 0 0 .2115 -46.493 17.206)"><stop offset="0" stop-color="#26053d" stop-opacity=".762"/><stop offset="1" stop-color="#b7b4b4" stop-opacity=".278"/></linearGradient><path fill-rule="evenodd" clip-rule="evenodd" fill="url(#__DSH_CODE_ICON_INSTANCE__elixir-original-c)" d="M56.7 4.3c-22.3 15.9-28.2 75-24.1 94.2 8.2 48.1 75.2 28.3 69.6-16.5-6-29.2-48.8-39.2-45.5-77.7z"/><linearGradient id="__DSH_CODE_ICON_INSTANCE__elixir-original-d" gradientUnits="userSpaceOnUse" x1="428.034" y1="198.448" x2="607.325" y2="559.255" gradientTransform="matrix(.1848 0 0 .1404 -42.394 17.138)"><stop offset="0" stop-color="#91739f" stop-opacity=".46"/><stop offset="1" stop-color="#32054f" stop-opacity=".54"/></linearGradient><path fill-rule="evenodd" clip-rule="evenodd" fill="url(#__DSH_CODE_ICON_INSTANCE__elixir-original-d)" d="M78.8 49.8c10.4 13.4 12.7 22.6 6.8 27.9-27.7 19.4-61.3 7.4-54-37.3C22.1 63 4.5 96.8 43.3 101.6c20.8 3.6 54 2 58.9-16.1-.2-15.9-10.8-22.9-23.4-35.7z"/><linearGradient id="__DSH_CODE_ICON_INSTANCE__elixir-original-e" gradientUnits="userSpaceOnUse" x1="907.895" y1="540.636" x2="590.242" y2="201.281" gradientTransform="matrix(.1418 0 0 .1829 -45.23 17.18)"><stop offset="0" stop-color="#463d49" stop-opacity=".331"/><stop offset="1" stop-color="#340a50" stop-opacity=".821"/></linearGradient><path fill-rule="evenodd" clip-rule="evenodd" fill="url(#__DSH_CODE_ICON_INSTANCE__elixir-original-e)" d="M38.1 36.4c-2.9 21.2 35.1 77.9 58.3 71-17.7 35.6-56.9-21.2-64-41.7 1.5-11 2.2-16.4 5.7-29.3z"/><linearGradient id="__DSH_CODE_ICON_INSTANCE__elixir-original-f" gradientUnits="userSpaceOnUse" x1="1102.297" y1="100.542" x2="1008.071" y2="431.648" gradientTransform="matrix(.106 0 0 .2448 -47.595 17.242)"><stop offset="0" stop-color="#715383" stop-opacity=".145"/><stop offset="1" stop-color="#f4f4f4" stop-opacity=".234"/></linearGradient><path fill-rule="evenodd" clip-rule="evenodd" fill="url(#__DSH_CODE_ICON_INSTANCE__elixir-original-f)" d="M60.4 49.7c.8 7.9 3.9 20.5 0 28.8S38.7 102 43.6 115.3c11.4 24.8 37.1-4.4 36.9-19 1.1-11.8-6.6-38.7-1.8-52.5L76.5 41l-13.6-4c-2.2 3.2-3 7.5-2.5 12.7z"/><linearGradient id="__DSH_CODE_ICON_INSTANCE__elixir-original-g" gradientUnits="userSpaceOnUse" x1="1354.664" y1="140.06" x2="1059.233" y2="84.466" gradientTransform="matrix(.09173 0 0 .2828 -48.536 17.28)"><stop offset="0" stop-color="#a5a1a8" stop-opacity=".356"/><stop offset="1" stop-color="#370c50" stop-opacity=".582"/></linearGradient><path fill-rule="evenodd" clip-rule="evenodd" fill="url(#__DSH_CODE_ICON_INSTANCE__elixir-original-g)" d="M65.3 10.8C36 27.4 48 53.4 49.3 81.6l19.1-55.4c-1.4-5.7-2.3-9.5-3.1-15.4z"/><path fill-rule="evenodd" clip-rule="evenodd" fill="#330A4C" fill-opacity=".316" d="M68.3 26.1c-14.8 11.7-14.1 31.3-18.6 54 8.1-21.3 4.1-38.2 18.6-54z"/><path fill-rule="evenodd" clip-rule="evenodd" fill="#FFF" d="M45.8 119.7c8 1.1 12.1 2.2 12.5 3 .3 4.2-11.1 1.2-12.5-3z"/><path fill-rule="evenodd" clip-rule="evenodd" fill="#EDEDED" fill-opacity=".603" d="M49.8 10.8c-6.9 7.7-14.4 21.8-18.2 29.7-1 6.5-.5 15.7.6 23.5.9-18.2 7.5-39.2 17.6-53.2z"/></svg>',
  "env": '<rect x="1" y="1" width="18" height="18" rx="4" fill="#ECD53F"/><text x="10" y="12.9" text-anchor="middle" font-family="Arial,sans-serif" font-size="5.7" font-weight="900" fill="#24292F">.ENV</text>',
  "erlang": '<rect x="1" y="1" width="18" height="18" rx="4" fill="#FAEDF1" stroke="#EED6DE" stroke-width=".5"/><svg x="2.75" y="2.75" width="14.5" height="14.5" viewBox="0 0 128 128" preserveAspectRatio="xMidYMid meet"><path d="M20.7 103.9C11 93.5 5.2 79.2 5.3 62.1 5.2 47 10 34 18.2 24.1H1v79.7l19.7.1zm90.4 0c4.2-4.5 8-9.8 11.4-15.9l-19-9.5c-6.7 10.8-16.4 20.8-29.9 20.9-19.6-.1-27.3-16.9-27.3-38.5h73.3c.1-2.4.1-3.6 0-4.7.5-12.9-2.9-23.7-9.1-32.1H127v79.7l-15.9.1zM47.5 42.4c.8-9.8 8.5-16.3 17.6-16.4 9.1 0 15.7 6.6 15.9 16.4H47.5z" fill="#A90533"/></svg>',
  "flutter": '<rect x="1" y="1" width="18" height="18" rx="4" fill="#EEF7FD" stroke="#D7EAF6" stroke-width=".5"/><svg x="2.75" y="2.75" width="14.5" height="14.5" viewBox="0 0 128 128" preserveAspectRatio="xMidYMid meet"><g fill="#3FB6D3"><path d="M12.3 64.2L76.3 0h39.4L32.1 83.6zM76.3 128h39.4L81.6 93.9l34.1-34.8H76.3L42.2 93.5z"/></g><path fill="#27AACD" d="M81.6 93.9l-20-20-19.4 19.6 19.4 19.6z"/><path fill="#19599A" d="M115.7 128L81.6 93.9l-20 19.2L76.3 128z"/><linearGradient id="__DSH_CODE_ICON_INSTANCE__flutter-original-a" gradientUnits="userSpaceOnUse" x1="59.365" y1="116.36" x2="86.825" y2="99.399"><stop offset="0" stop-color="#1b4e94"/><stop offset=".63" stop-color="#1a5497"/><stop offset="1" stop-color="#195a9b"/></linearGradient><path fill="url(#__DSH_CODE_ICON_INSTANCE__flutter-original-a)" d="M61.6 113.1l30.8-8.4-10.8-10.8z"/></svg>',
  "git": '<rect x="1" y="1" width="18" height="18" rx="4" fill="#FFF0EC" stroke="#DDE2E8" stroke-width=".5"/><g transform="translate(3 3) scale(.5833333333)"><path fill="#F05032" d="M13.09 23.549a1.54 1.54 0 0 1-2.18 0L.451 13.089a1.54 1.54 0 0 1 0-2.179l7.191-7.19 2.733 2.733a1.85 1.85 0 0 0 .964 2.326v6.66a1.849 1.849 0 1 0 1.54 0V8.957l2.508 2.508a1.85 1.85 0 1 0 1.09-1.09l-2.634-2.634a1.85 1.85 0 0 0-2.378-2.377L8.73 2.63 10.91.451a1.54 1.54 0 0 1 2.179 0l10.459 10.46a1.54 1.54 0 0 1 0 2.179z"/></g>',
  "go": '<rect x="1" y="1" width="18" height="18" rx="4" fill="#E7F9FC" stroke="#DDE2E8" stroke-width=".5"/><g transform="translate(3 3) scale(.5833333333)"><path fill="#00ADD8" d="M1.811 10.231c-.047 0-.058-.023-.035-.059l.246-.315c.023-.035.081-.058.128-.058h4.172c.046 0 .058.035.035.07l-.199.303c-.023.036-.082.07-.117.07zM.047 11.306c-.047 0-.059-.023-.035-.058l.245-.316c.023-.035.082-.058.129-.058h5.328c.047 0 .07.035.058.07l-.093.28c-.012.047-.058.07-.105.07zm2.828 1.075c-.047 0-.059-.035-.035-.07l.163-.292c.023-.035.07-.07.117-.07h2.337c.047 0 .07.035.07.082l-.023.28c0 .047-.047.082-.082.082zm12.129-2.36c-.736.187-1.239.327-1.963.514-.176.046-.187.058-.34-.117-.174-.199-.303-.327-.548-.444-.737-.362-1.45-.257-2.115.175-.795.514-1.204 1.274-1.192 2.22.011.935.654 1.706 1.577 1.835.795.105 1.46-.175 1.987-.77.105-.13.198-.27.315-.434H10.47c-.245 0-.304-.152-.222-.35.152-.362.432-.97.596-1.274a.315.315 0 01.292-.187h4.253c-.023.316-.023.631-.07.947a4.983 4.983 0 01-.958 2.29c-.841 1.11-1.94 1.8-3.33 1.986-1.145.152-2.209-.07-3.143-.77-.865-.655-1.356-1.52-1.484-2.595-.152-1.274.222-2.419.993-3.424.83-1.086 1.928-1.776 3.272-2.02 1.098-.2 2.15-.07 3.096.571.62.41 1.063.97 1.356 1.648.07.105.023.164-.117.2m3.868 6.461c-1.064-.024-2.034-.328-2.852-1.029a3.665 3.665 0 01-1.262-2.255c-.21-1.32.152-2.489.947-3.529.853-1.122 1.881-1.706 3.272-1.95 1.192-.21 2.314-.095 3.33.595.923.63 1.496 1.484 1.648 2.605.198 1.578-.257 2.863-1.344 3.962-.771.783-1.718 1.273-2.805 1.495-.315.06-.63.07-.934.106zm2.78-4.72c-.011-.153-.011-.27-.034-.387-.21-1.157-1.274-1.81-2.384-1.554-1.087.245-1.788.935-2.045 2.033-.21.912.234 1.835 1.075 2.21.643.28 1.285.244 1.905-.07.923-.48 1.425-1.228 1.484-2.233z"/></g>',
  "graphql": '<rect x="1" y="1" width="18" height="18" rx="4" fill="#FCEAF6" stroke="#DDE2E8" stroke-width=".5"/><g transform="translate(3 3) scale(.5833333333)"><path fill="#E10098" d="M12.002 0a2.138 2.138 0 1 0 0 4.277 2.138 2.138 0 1 0 0-4.277zm8.54 4.931a2.138 2.138 0 1 0 0 4.277 2.138 2.138 0 1 0 0-4.277zm0 9.862a2.138 2.138 0 1 0 0 4.277 2.138 2.138 0 1 0 0-4.277zm-8.54 4.931a2.138 2.138 0 1 0 0 4.276 2.138 2.138 0 1 0 0-4.276zm-8.542-4.93a2.138 2.138 0 1 0 0 4.276 2.138 2.138 0 1 0 0-4.277zm0-9.863a2.138 2.138 0 1 0 0 4.277 2.138 2.138 0 1 0 0-4.277zm8.542-3.378L2.953 6.777v10.448l9.049 5.224 9.047-5.224V6.777zm0 1.601 7.66 13.27H4.34zm-1.387.371L3.97 15.037V7.363zm2.774 0 6.646 3.838v7.674zM5.355 17.44h13.293l-6.646 3.836z"/></g>',
  "haskell": '<rect x="1" y="1" width="18" height="18" rx="4" fill="#F3F0F7" stroke="#E1D9EA" stroke-width=".5"/><svg x="2.75" y="2.75" width="14.5" height="14.5" viewBox="0 0 128 128" preserveAspectRatio="xMidYMid meet"><path fill="#463B63" d="M0 110.2L30.1 65 0 19.9h22.6L52.7 65l-30.1 45.1H0z"/><path fill="#5E5187" d="M30.1 110.2L60.2 65 30.1 19.9h22.6l60.2 90.3H90.4L71.5 81.9l-18.8 28.2H30.1z"/><path fill="#904F8C" d="M102.9 83.8l-10-15.1H128v15.1h-25.1zM87.8 61.3l-10-15.1H128v15.1H87.8z"/></svg>',
  "ini": '<rect x="1" y="1" width="18" height="18" rx="4" fill="#6E7781"/><text x="10" y="13.2" text-anchor="middle" font-family="Arial,sans-serif" font-size="7.2" font-weight="800" fill="#fff">INI</text>',
  "java": '<rect x="1" y="1" width="18" height="18" rx="4" fill="#F4F7FA" stroke="#D9E2E8" stroke-width=".5"/><svg x="2.5" y="2.5" width="15" height="15" viewBox="0 0 128 128" preserveAspectRatio="xMidYMid meet"><path fill="#0074BD" d="M47.617 98.12s-4.767 2.774 3.397 3.71c9.892 1.13 14.947.968 25.845-1.092 0 0 2.871 1.795 6.873 3.351-24.439 10.47-55.308-.607-36.115-5.969zm-2.988-13.665s-5.348 3.959 2.823 4.805c10.567 1.091 18.91 1.18 33.354-1.6 0 0 1.993 2.025 5.132 3.131-29.542 8.64-62.446.68-41.309-6.336z"/><path fill="#EA2D2E" d="M69.802 61.271c6.025 6.935-1.58 13.17-1.58 13.17s15.289-7.891 8.269-17.777c-6.559-9.215-11.587-13.792 15.635-29.58 0 .001-42.731 10.67-22.324 34.187z"/><path fill="#0074BD" d="M102.123 108.229s3.529 2.91-3.888 5.159c-14.102 4.272-58.706 5.56-71.094.171-4.451-1.938 3.899-4.625 6.526-5.192 2.739-.593 4.303-.485 4.303-.485-4.953-3.487-32.013 6.85-13.743 9.815 49.821 8.076 90.817-3.637 77.896-9.468zM49.912 70.294s-22.686 5.389-8.033 7.348c6.188.828 18.518.638 30.011-.326 9.39-.789 18.813-2.474 18.813-2.474s-3.308 1.419-5.704 3.053c-23.042 6.061-67.544 3.238-54.731-2.958 10.832-5.239 19.644-4.643 19.644-4.643zm40.697 22.747c23.421-12.167 12.591-23.86 5.032-22.285-1.848.385-2.677.72-2.677.72s.688-1.079 2-1.543c14.953-5.255 26.451 15.503-4.823 23.725 0-.002.359-.327.468-.617z"/><path fill="#EA2D2E" d="M76.491 1.587S89.459 14.563 64.188 34.51c-20.266 16.006-4.621 25.13-.007 35.559-11.831-10.673-20.509-20.07-14.688-28.815C58.041 28.42 81.722 22.195 76.491 1.587z"/><path fill="#0074BD" d="M52.214 126.021c22.476 1.437 57-.8 57.817-11.436 0 0-1.571 4.032-18.577 7.231-19.186 3.612-42.854 3.191-56.887.874 0 .001 2.875 2.381 17.647 3.331z"/></svg>',
  "javascript": '<defs><clipPath id="__DSH_CODE_ICON_INSTANCE__a"><rect x="1" y="1" width="18" height="18" rx="4"/></clipPath></defs><g clip-path="url(#__DSH_CODE_ICON_INSTANCE__a)"><svg x="1" y="1" width="18" height="18" viewBox="0 0 128 128" preserveAspectRatio="xMidYMid meet"><path fill="#F0DB4F" d="M1.408 1.408h125.184v125.185H1.408z"/><path fill="#323330" d="M116.347 96.736c-.917-5.711-4.641-10.508-15.672-14.981-3.832-1.761-8.104-3.022-9.377-5.926-.452-1.69-.512-2.642-.226-3.665.821-3.32 4.784-4.355 7.925-3.403 2.023.678 3.938 2.237 5.093 4.724 5.402-3.498 5.391-3.475 9.163-5.879-1.381-2.141-2.118-3.129-3.022-4.045-3.249-3.629-7.676-5.498-14.756-5.355l-3.688.477c-3.534.893-6.902 2.748-8.877 5.235-5.926 6.724-4.236 18.492 2.975 23.335 7.104 5.332 17.54 6.545 18.873 11.531 1.297 6.104-4.486 8.08-10.234 7.378-4.236-.881-6.592-3.034-9.139-6.949-4.688 2.713-4.688 2.713-9.508 5.485 1.143 2.499 2.344 3.63 4.26 5.795 9.068 9.198 31.76 8.746 35.83-5.176.165-.478 1.261-3.666.38-8.581zM69.462 58.943H57.753l-.048 30.272c0 6.438.333 12.34-.714 14.149-1.713 3.558-6.152 3.117-8.175 2.427-2.059-1.012-3.106-2.451-4.319-4.485-.333-.584-.583-1.036-.667-1.071l-9.52 5.83c1.583 3.249 3.915 6.069 6.902 7.901 4.462 2.678 10.459 3.499 16.731 2.059 4.082-1.189 7.604-3.652 9.448-7.401 2.666-4.915 2.094-10.864 2.07-17.444.06-10.735.001-21.468.001-32.237z"/></svg></g>',
  "json": '<rect x="1" y="1" width="18" height="18" rx="4" fill="#F4F4F4" stroke="#DDDDDD" stroke-width=".5"/><svg x="2.75" y="2.75" width="14.5" height="14.5" viewBox="0 0 128 128" preserveAspectRatio="xMidYMid meet"><linearGradient id="__DSH_CODE_ICON_INSTANCE__a" x1="-670.564" x2="-583.105" y1="-280.831" y2="-368.306" gradientTransform="matrix(.9988 0 0 -.9987 689.011 -259.008)" gradientUnits="userSpaceOnUse"><stop offset="0"/><stop offset="1" stop-color="#fff"/></linearGradient><path fill="url(#__DSH_CODE_ICON_INSTANCE__a)" fill-rule="evenodd" d="M63.895 94.303c27.433 37.398 54.281-10.438 54.241-39.205-.046-34.012-34.518-53.021-54.263-53.021C32.182 2.077 2 28.269 2 64.105 2 103.937 36.596 126 63.873 126c-6.172-.889-26.742-5.296-27.019-52.674-.186-32.044 10.453-44.846 26.974-39.214.37.137 18.223 7.18 18.223 30.187 0 22.908-18.156 30.004-18.156 30.004z" clip-rule="evenodd"/><linearGradient id="__DSH_CODE_ICON_INSTANCE__b" x1="-579.148" x2="-666.607" y1="-364.34" y2="-276.873" gradientTransform="matrix(.9988 0 0 -.9987 689.011 -259.008)" gradientUnits="userSpaceOnUse"><stop offset="0"/><stop offset="1" stop-color="#fff"/></linearGradient><path fill="url(#__DSH_CODE_ICON_INSTANCE__b)" fill-rule="evenodd" d="M63.863 34.086C45.736 27.838 23.53 42.778 23.53 72.703 23.53 121.565 59.739 126 64.128 126 95.818 126 126 99.808 126 63.972 126 24.14 91.404 2.077 64.127 2.077c7.555-1.046 40.719 8.176 40.719 53.504 0 29.559-24.764 45.651-40.87 38.776-.37-.137-18.223-7.18-18.223-30.187 0-22.91 18.11-30.085 18.11-30.084z" clip-rule="evenodd"/></svg>',
  "kotlin": '<defs><linearGradient id="__DSH_CODE_ICON_INSTANCE__k" x1="1" y1="19" x2="19" y2="1"><stop stop-color="#0095D5"/><stop offset=".5" stop-color="#7F52FF"/><stop offset="1" stop-color="#F88909"/></linearGradient></defs><rect x="1" y="1" width="18" height="18" rx="4" fill="url(#__DSH_CODE_ICON_INSTANCE__k)"/><g transform="translate(3 3) scale(.5833333333)"><path fill="#FFFFFF" d="M24 24H0V0h24L12 12Z"/></g>',
  "lua": '<rect x="1" y="1" width="18" height="18" rx="4" fill="#ECECF7" stroke="#DDE2E8" stroke-width=".5"/><g transform="translate(3 3) scale(.5833333333)"><path fill="#000080" d="M.38 10.377l-.272-.037c-.048.344-.082.695-.101 1.041l.275.016c.018-.34.051-.682.098-1.02zM4.136 3.289l-.184-.205c-.258.232-.509.48-.746.734l.202.188c.231-.248.476-.49.728-.717zM5.769 2.059l-.146-.235c-.296.186-.586.385-.863.594l.166.219c.27-.203.554-.399.843-.578zM1.824 18.369c.185.297.384.586.593.863l.22-.164c-.205-.271-.399-.555-.58-.844l-.233.145zM1.127 16.402l-.255.104c.129.318.274.635.431.943l.005.01.245-.125-.005-.01c-.153-.301-.295-.611-.421-.922zM.298 9.309l.269.063c.076-.332.168-.664.272-.986l-.261-.087c-.108.332-.202.672-.28 1.01zM.274 12.42l-.275.01c.012.348.04.699.083 1.043l.273-.033c-.042-.336-.069-.68-.081-1.02zM.256 14.506c.073.34.162.682.264 1.014l.263-.08c-.1-.326-.187-.658-.258-.99l-.269.056zM11.573.275L11.563 0c-.348.012-.699.039-1.044.082l.034.273c.338-.041.68-.068 1.02-.08zM23.221 8.566c.1.326.186.66.256.992l.27-.059c-.072-.34-.16-.682-.262-1.014l-.264.081zM17.621 1.389c-.309-.164-.627-.314-.947-.449l-.107.252c.314.133.625.281.926.439l.128-.242zM15.693.572c-.332-.105-.67-.199-1.01-.277l-.063.268c.332.076.664.168.988.273l.085-.264zM6.674 1.545c.298-.15.606-.291.916-.418L7.486.873c-.317.127-.632.272-.937.428l-.015.008.125.244.015-.008zM23.727 11.588l.275-.01a11.797 11.797 0 0 0-.082-1.045l-.273.033c.041.338.068.682.08 1.022zM13.654.105c-.346-.047-.696-.08-1.043-.098l-.014.273c.339.018.683.051 1.019.098l.038-.273zM9.544.527l-.058-.27c-.34.072-.681.16-1.014.264l.081.262c.325-.099.659-.185.991-.256zM1.921 5.469l.231.15c.185-.285.384-.566.592-.834l-.217-.17c-.213.276-.417.563-.606.854zM.943 7.318l.253.107c.132-.313.28-.625.439-.924l-.243-.128c-.163.307-.314.625-.449.945zM18.223 21.943l.145.234c.295-.186.586-.385.863-.594l-.164-.219c-.272.204-.557.4-.844.579zM21.248 19.219l.217.17c.215-.273.418-.561.607-.854l-.23-.148c-.186.285-.385.564-.594.832zM19.855 20.715l.184.203c.258-.23.51-.479.746-.732l-.201-.188c-.23.248-.477.488-.729.717zM22.359 17.504l.244.129c.162-.307.314-.625.449-.945l-.254-.107a11.27 11.27 0 0 1-.439.923zM23.617 13.629l.273.039c.049-.346.082-.695.102-1.043l-.275-.014c-.018.338-.051.682-.1 1.018zM23.156 15.621l.264.086c.107-.332.201-.67.279-1.01l-.268-.063c-.077.333-.169.665-.275.987zM22.453 6.672c.154.303.297.617.424.932l.256-.104c-.131-.322-.277-.643-.436-.953l-.244.125zM8.296 23.418c.331.107.67.201 1.009.279l.062-.268c-.331-.076-.663-.168-.986-.273l-.085.262zM10.335 23.889c.345.049.696.082 1.043.102l.014-.275c-.339-.018-.682-.051-1.019-.098l-.038.271zM17.326 22.449c-.303.154-.613.297-.926.424l.104.256c.318-.131.639-.275.947-.434l.004-.002-.123-.246-.006.002zM4.613 21.467c.274.213.562.418.854.605l.149-.23c-.285-.184-.565-.385-.833-.592l-.17.217zM12.417 23.725l.009.275c.348-.014.699-.041 1.045-.084l-.035-.271c-.336.041-.68.068-1.019.08zM6.37 22.604c.307.162.625.314.946.449l.107-.254c-.313-.133-.624-.279-.924-.439l-.129.244zM3.083 20.041c.233.258.48.51.734.746l.188-.201c-.249-.23-.49-.477-.717-.729l-.205.184zM14.445 23.475l.059.27c.34-.074.68-.162 1.014-.266l-.082-.262c-.325.099-.659.185-.991.258zM21.18.129A2.689 2.689 0 1 0 21.18 5.507 2.689 2.689 0 1 0 21.18.129zM15.324 15.447c0 .471.314.66.852.66.67 0 1.297-.396 1.297-1.016v-.645c-.23.107-.379.141-1.107.24-.735.109-1.042.306-1.042.761zM12 2.818c-5.07 0-9.18 4.109-9.18 9.18 0 5.068 4.11 9.18 9.18 9.18 5.07 0 9.18-4.111 9.18-9.18 0-5.07-4.11-9.18-9.18-9.18zm-2.487 13.77H5.771v-6.023h.769v5.346h2.974v.677zm4.13 0h-.619v-.67c-.405.57-.811.793-1.446.793-.843 0-1.38-.463-1.38-1.182v-3.271h.686v3c0 .52.347.85.893.85.719 0 1.181-.578 1.181-1.461v-2.389h.686v4.33zm-.53-8.393c0-1.484 1.205-2.689 2.689-2.689s2.688 1.205 2.688 2.689-1.203 2.688-2.688 2.688-2.689-1.203-2.689-2.688zm5.567 7.856v.52c-.223.059-.33.074-.471.074-.34 0-.637-.238-.711-.57-.381.406-.918.637-1.471.637-.877 0-1.422-.463-1.422-1.248 0-.527.256-.916.76-1.123.266-.107.414-.141 1.389-.264.545-.066.719-.191.719-.48v-.182c0-.412-.348-.645-.967-.645-.645 0-.957.24-1.016.77h-.693c.041-1 .686-1.404 1.734-1.404 1.066 0 1.627.412 1.627 1.182v2.412c0 .215.133.338.373.338.041-.002.074-.002.149-.017z"/></g>',
  "makefile": '<rect x="1" y="1" width="18" height="18" rx="4" fill="#427819"/><path fill="#fff" d="m5 4.5 2.3 2.3 2.3-2.3L11 5.9 8.7 8.2l2.4 2.4L9.7 12l-2.4-2.4L5 11.9 3.6 10.5l2.3-2.3-2.3-2.3zm7 6.5h4v1.5h-4zm0 2.8h4v1.5h-4z"/>',
  "node": '<rect x="1" y="1" width="18" height="18" rx="4" fill="#EDF7EA" stroke="#DDE2E8" stroke-width=".5"/><g transform="translate(3 3) scale(.5833333333)"><path fill="#539E43" d="M11.998,24c-0.321,0-0.641-0.084-0.922-0.247l-2.936-1.737c-0.438-0.245-0.224-0.332-0.08-0.383 c0.585-0.203,0.703-0.25,1.328-0.604c0.065-0.037,0.151-0.023,0.218,0.017l2.256,1.339c0.082,0.045,0.197,0.045,0.272,0l8.795-5.076 c0.082-0.047,0.134-0.141,0.134-0.238V6.921c0-0.099-0.053-0.192-0.137-0.242l-8.791-5.072c-0.081-0.047-0.189-0.047-0.271,0 L3.075,6.68C2.99,6.729,2.936,6.825,2.936,6.921v10.15c0,0.097,0.054,0.189,0.139,0.235l2.409,1.392 c1.307,0.654,2.108-0.116,2.108-0.89V7.787c0-0.142,0.114-0.253,0.256-0.253h1.115c0.139,0,0.255,0.112,0.255,0.253v10.021 c0,1.745-0.95,2.745-2.604,2.745c-0.508,0-0.909,0-2.026-0.551L2.28,18.675c-0.57-0.329-0.922-0.945-0.922-1.604V6.921 c0-0.659,0.353-1.275,0.922-1.603l8.795-5.082c0.557-0.315,1.296-0.315,1.848,0l8.794,5.082c0.57,0.329,0.924,0.944,0.924,1.603 v10.15c0,0.659-0.354,1.273-0.924,1.604l-8.794,5.078C12.643,23.916,12.324,24,11.998,24z M19.099,13.993 c0-1.9-1.284-2.406-3.987-2.763c-2.731-0.361-3.009-0.548-3.009-1.187c0-0.528,0.235-1.233,2.258-1.233 c1.807,0,2.473,0.389,2.747,1.607c0.024,0.115,0.129,0.199,0.247,0.199h1.141c0.071,0,0.138-0.031,0.186-0.081 c0.048-0.054,0.074-0.123,0.067-0.196c-0.177-2.098-1.571-3.076-4.388-3.076c-2.508,0-4.004,1.058-4.004,2.833 c0,1.925,1.488,2.457,3.895,2.695c2.88,0.282,3.103,0.703,3.103,1.269c0,0.983-0.789,1.402-2.642,1.402 c-2.327,0-2.839-0.584-3.011-1.742c-0.02-0.124-0.126-0.215-0.253-0.215h-1.137c-0.141,0-0.254,0.112-0.254,0.253 c0,1.482,0.806,3.248,4.655,3.248C17.501,17.007,19.099,15.91,19.099,13.993z"/></g>',
  "objective-c": '<rect x="1" y="1" width="18" height="18" rx="4" fill="#438EFF"/><text x="10" y="13.2" text-anchor="middle" font-family="Arial,sans-serif" font-size="7.2" font-weight="800" fill="#fff">OC</text>',
  "perl": '<rect x="1" y="1" width="18" height="18" rx="4" fill="#EAF2F7" stroke="#DDE2E8" stroke-width=".5"/><g transform="translate(3 3) scale(.5833333333)"><path fill="#0073A1" d="M12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0m.157 1.103a10.91 10.91 0 0 1 9.214 5.404c-1.962.152-3.156 1.698-5.132 3.553-2.81 2.637-4.562.582-5.288-.898-.447-1.004-.847-2.117-1.544-2.769A.4.4 0 0 1 9.3 6.02l.08-.37a.083.083 0 0 0-.074-.1c-.33-.022-.601.093-.84.368a2.5 2.5 0 0 0-.375-.064c-.863-.093-1.036.345-1.873.345H5.81c-.758 0-1.391.361-1.7.892-.248.424-.257.884.15.93-.126.445.292.62 1.224.192 0 0 .733.421 1.749.421.549 0 .712.087.914.967.486 2.138 2.404 5.655 6.282 5.655l.118.166c.659.934.86 2.113.48 3.184-.307.867-.697 1.531-.697 1.531q.01.178.01.349c0 .81-.175 1.553-.387 2.23a10.91 10.91 0 0 1-11.989-6.342A10.91 10.91 0 0 1 7.608 2.01a10.9 10.9 0 0 1 4.55-.907M7.524 6.47c.288 0 .575.231.477.272a.4.4 0 0 1-.1.02.38.38 0 0 1-.375.327.384.384 0 0 1-.378-.326.4.4 0 0 1-.101-.02c-.098-.042.19-.273.477-.273m10.193 10.49q.05 0 .101.007.326.054.694.096.135.01.269.026a13.4 13.4 0 0 0 2.846-.007 10.9 10.9 0 0 1-2.007 2.705c-.11-.23-.547-1.19-.573-2.196q-.156-.01-.313-.026-.13-.014-.256-.022a18 18 0 0 1-.735-.102h-.003c-.032 0-.06.01-.074.035l-.003.012q-.081.265-.182.544c.428 1.084.652 2.078.652 2.078.14.22.258.432.363.64a11 11 0 0 1-2.168 1.264 11 11 0 0 1-1.205.426 13.3 13.3 0 0 1 1.055-2.531s.678-1.445 1.027-2.564v-.004a.55.55 0 0 1 .512-.38"/></g>',
  "php": '<rect x="1" y="1" width="18" height="18" rx="4" fill="#F0EFF8" stroke="#DDDCEB" stroke-width=".5"/><g transform="translate(3 3) scale(.5833333333)"><path fill="#777BB4" d="M7.01 10.207h-.944l-.515 2.648h.838c.556 0 .97-.105 1.242-.314.272-.21.455-.559.55-1.049.092-.47.05-.802-.124-.995-.175-.193-.523-.29-1.047-.29zM12 5.688C5.373 5.688 0 8.514 0 12s5.373 6.313 12 6.313S24 15.486 24 12c0-3.486-5.373-6.312-12-6.312zm-3.26 7.451c-.261.25-.575.438-.917.551-.336.108-.765.164-1.285.164H5.357l-.327 1.681H3.652l1.23-6.326h2.65c.797 0 1.378.209 1.744.628.366.418.476 1.002.33 1.752a2.836 2.836 0 0 1-.305.847c-.143.255-.33.49-.561.703zm4.024.715l.543-2.799c.063-.318.039-.536-.068-.651-.107-.116-.336-.174-.687-.174H11.46l-.704 3.625H9.388l1.23-6.327h1.367l-.327 1.682h1.218c.767 0 1.295.134 1.586.401s.378.7.263 1.299l-.572 2.944h-1.389zm7.597-2.265a2.782 2.782 0 0 1-.305.847c-.143.255-.33.49-.561.703a2.44 2.44 0 0 1-.917.551c-.336.108-.765.164-1.286.164h-1.18l-.327 1.682h-1.378l1.23-6.326h2.649c.797 0 1.378.209 1.744.628.366.417.477 1.001.331 1.751zM17.766 10.207h-.943l-.516 2.648h.838c.557 0 .971-.105 1.242-.314.272-.21.455-.559.551-1.049.092-.47.049-.802-.125-.995s-.524-.29-1.047-.29z"/></g>',
  "powershell": '<rect x="1" y="1" width="18" height="18" rx="4" fill="#2671BE"/><path fill="#fff" fill-opacity=".16" d="M5.5 4h11l-3.5 12H2z"/><path d="m6.5 6.5 3 3-4.2 3.2m4 1h4" fill="none" stroke="#fff" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>',
  "protobuf": '<rect x="1" y="1" width="18" height="18" rx="4" fill="#4285F4"/><path fill="none" stroke="#fff" stroke-width="1.2" stroke-linejoin="round" d="m10 3.5 6 3.3v6.4l-6 3.3-6-3.3V6.8z"/><path fill="#fff" d="M6.5 6.5h4.4c2.3 0 3.6 1.2 3.6 3.1s-1.3 3.1-3.6 3.1H9v2H6.5zM9 8.4v2.4h1.6c.8 0 1.2-.4 1.2-1.2s-.4-1.2-1.2-1.2z"/>',
  "python": '<rect x="1" y="1" width="18" height="18" rx="4" fill="#F2F4F7" stroke="#D5DBE5" stroke-width=".5"/><g transform="matrix(.126 0 0 .126 2.30 2.24)"><path fill="#3776AB" d="M 60.510156,6.3979729 C 55.926503,6.4192712 51.549217,6.8101906 47.697656,7.4917229 C 36.35144,9.4962267 34.291407,13.691825 34.291406,21.429223 L 34.291406,31.647973 L 61.103906,31.647973 L 61.103906,35.054223 L 34.291406,35.054223 L 24.228906,35.054223 C 16.436447,35.054223 9.6131468,39.73794 7.4789058,48.647973 C 5.0170858,58.860939 4.9078907,65.233996 7.4789058,75.897973 C 9.3848341,83.835825 13.936449,89.491721 21.728906,89.491723 L 30.947656,89.491723 L 30.947656,77.241723 C 30.947656,68.391821 38.6048,60.585475 47.697656,60.585473 L 74.478906,60.585473 C 81.933857,60.585473 87.885159,54.447309 87.885156,46.960473 L 87.885156,21.429223 C 87.885156,14.162884 81.755176,8.7044455 74.478906,7.4917229 C 69.872919,6.7249976 65.093809,6.3766746 60.510156,6.3979729 z M 46.010156,14.616723 C 48.779703,14.616723 51.041406,16.915369 51.041406,19.741723 C 51.041404,22.558059 48.779703,24.835473 46.010156,24.835473 C 43.23068,24.835472 40.978906,22.558058 40.978906,19.741723 C 40.978905,16.91537 43.23068,14.616723 46.010156,14.616723 z "/><path fill="#FFD43B" d="M 91.228906,35.054223 L 91.228906,46.960473 C 91.228906,56.191228 83.403011,63.960472 74.478906,63.960473 L 47.697656,63.960473 C 40.361823,63.960473 34.291407,70.238956 34.291406,77.585473 L 34.291406,103.11672 C 34.291406,110.38306 40.609994,114.65704 47.697656,116.74172 C 56.184987,119.23733 64.323893,119.68835 74.478906,116.74172 C 81.229061,114.78733 87.885159,110.85411 87.885156,103.11672 L 87.885156,92.897973 L 61.103906,92.897973 L 61.103906,89.491723 L 87.885156,89.491723 L 101.29141,89.491723 C 109.08387,89.491723 111.98766,84.056315 114.69765,75.897973 C 117.49698,67.499087 117.37787,59.422197 114.69765,48.647973 C 112.77187,40.890532 109.09378,35.054223 101.29141,35.054223 L 91.228906,35.054223 z M 76.166406,99.710473 C 78.945884,99.710476 81.197656,101.98789 81.197656,104.80422 C 81.197654,107.63057 78.945881,109.92922 76.166406,109.92922 C 73.396856,109.92922 71.135156,107.63057 71.135156,104.80422 C 71.135158,101.98789 73.396853,99.710473 76.166406,99.710473 z "/></g>',
  "r": '<rect x="1" y="1" width="18" height="18" rx="4" fill="#EEF2F6" stroke="#DDE2E8" stroke-width=".5"/><g transform="translate(3 3) scale(.5833333333)"><path fill="#276DC3" d="M12 2.746c-6.627 0-12 3.599-12 8.037 0 3.897 4.144 7.144 9.64 7.88V16.26c-2.924-.915-4.925-2.755-4.925-4.877 0-3.035 4.084-5.494 9.12-5.494 5.038 0 8.757 1.683 8.757 5.494 0 1.976-.999 3.379-2.662 4.272.09.066.174.128.258.216.169.149.25.363.372.544 2.128-1.45 3.44-3.437 3.44-5.631 0-4.44-5.373-8.038-12-8.038zm-2.111 4.99v13.516l4.093-.002-.002-5.291h1.1c.225 0 .321.066.549.25.272.22.715.982.715.982l2.164 4.063 4.627-.002-2.864-4.826s-.086-.193-.265-.383a2.22 2.22 0 00-.582-.416c-.422-.214-1.149-.434-1.149-.434s3.578-.264 3.578-3.826c0-3.562-3.744-3.63-3.744-3.63zm4.127 2.93l2.478.002s1.149-.062 1.149 1.127c0 1.165-1.149 1.17-1.149 1.17h-2.478zm1.754 6.119c-.494.049-1.012.079-1.54.088v1.807a16.622 16.622 0 002.37-.473l-.471-.891s-.108-.183-.248-.394c-.039-.054-.08-.098-.111-.137z"/></g>',
  "react": '<rect x="1" y="1" width="18" height="18" rx="4" fill="#20232A"/><g transform="translate(3 3) scale(.5833333333)"><path fill="#61DAFB" d="M14.23 12.004a2.236 2.236 0 0 1-2.235 2.236 2.236 2.236 0 0 1-2.236-2.236 2.236 2.236 0 0 1 2.235-2.236 2.236 2.236 0 0 1 2.236 2.236zm2.648-10.69c-1.346 0-3.107.96-4.888 2.622-1.78-1.653-3.542-2.602-4.887-2.602-.41 0-.783.093-1.106.278-1.375.793-1.683 3.264-.973 6.365C1.98 8.917 0 10.42 0 12.004c0 1.59 1.99 3.097 5.043 4.03-.704 3.113-.39 5.588.988 6.38.32.187.69.275 1.102.275 1.345 0 3.107-.96 4.888-2.624 1.78 1.654 3.542 2.603 4.887 2.603.41 0 .783-.09 1.106-.275 1.374-.792 1.683-3.263.973-6.365C22.02 15.096 24 13.59 24 12.004c0-1.59-1.99-3.097-5.043-4.032.704-3.11.39-5.587-.988-6.38-.318-.184-.688-.277-1.092-.278zm-.005 1.09v.006c.225 0 .406.044.558.127.666.382.955 1.835.73 3.704-.054.46-.142.945-.25 1.44-.96-.236-2.006-.417-3.107-.534-.66-.905-1.345-1.727-2.035-2.447 1.592-1.48 3.087-2.292 4.105-2.295zm-9.77.02c1.012 0 2.514.808 4.11 2.28-.686.72-1.37 1.537-2.02 2.442-1.107.117-2.154.298-3.113.538-.112-.49-.195-.964-.254-1.42-.23-1.868.054-3.32.714-3.707.19-.09.4-.127.563-.132zm4.882 3.05c.455.468.91.992 1.36 1.564-.44-.02-.89-.034-1.345-.034-.46 0-.915.01-1.36.034.44-.572.895-1.096 1.345-1.565zM12 8.1c.74 0 1.477.034 2.202.093.406.582.802 1.203 1.183 1.86.372.64.71 1.29 1.018 1.946-.308.655-.646 1.31-1.013 1.95-.38.66-.773 1.288-1.18 1.87-.728.063-1.466.098-2.21.098-.74 0-1.477-.035-2.202-.093-.406-.582-.802-1.204-1.183-1.86-.372-.64-.71-1.29-1.018-1.946.303-.657.646-1.313 1.013-1.954.38-.66.773-1.286 1.18-1.868.728-.064 1.466-.098 2.21-.098zm-3.635.254c-.24.377-.48.763-.704 1.16-.225.39-.435.782-.635 1.174-.265-.656-.49-1.31-.676-1.947.64-.15 1.315-.283 2.015-.386zm7.26 0c.695.103 1.365.23 2.006.387-.18.632-.405 1.282-.66 1.933-.2-.39-.41-.783-.64-1.174-.225-.392-.465-.774-.705-1.146zm3.063.675c.484.15.944.317 1.375.498 1.732.74 2.852 1.708 2.852 2.476-.005.768-1.125 1.74-2.857 2.475-.42.18-.88.342-1.355.493-.28-.958-.646-1.956-1.1-2.98.45-1.017.81-2.01 1.085-2.964zm-13.395.004c.278.96.645 1.957 1.1 2.98-.45 1.017-.812 2.01-1.086 2.964-.484-.15-.944-.318-1.37-.5-1.732-.737-2.852-1.706-2.852-2.474 0-.768 1.12-1.742 2.852-2.476.42-.18.88-.342 1.356-.494zm11.678 4.28c.265.657.49 1.312.676 1.948-.64.157-1.316.29-2.016.39.24-.375.48-.762.705-1.158.225-.39.435-.788.636-1.18zm-9.945.02c.2.392.41.783.64 1.175.23.39.465.772.705 1.143-.695-.102-1.365-.23-2.006-.386.18-.63.406-1.282.66-1.933zM17.92 16.32c.112.493.2.968.254 1.423.23 1.868-.054 3.32-.714 3.708-.147.09-.338.128-.563.128-1.012 0-2.514-.807-4.11-2.28.686-.72 1.37-1.536 2.02-2.44 1.107-.118 2.154-.3 3.113-.54zm-11.83.01c.96.234 2.006.415 3.107.532.66.905 1.345 1.727 2.035 2.446-1.595 1.483-3.092 2.295-4.11 2.295-.22-.005-.406-.05-.553-.132-.666-.38-.955-1.834-.73-3.703.054-.46.142-.944.25-1.438zm4.56.64c.44.02.89.034 1.345.034.46 0 .915-.01 1.36-.034-.44.572-.895 1.095-1.345 1.565-.455-.47-.91-.993-1.36-1.565z"/></g>',
  "ruby": '<rect x="1" y="1" width="18" height="18" rx="4" fill="#FCEDEC" stroke="#DDE2E8" stroke-width=".5"/><g transform="translate(3 3) scale(.5833333333)"><path fill="#CC342D" d="M20.156.083c3.033.525 3.893 2.598 3.829 4.77L24 4.822 22.635 22.71 4.89 23.926h.016C3.433 23.864.15 23.729 0 19.139l1.645-3 2.819 6.586.503 1.172 2.805-9.144-.03.007.016-.03 9.255 2.956-1.396-5.431-.99-3.9 8.82-.569-.615-.51L16.5 2.114 20.159.073l-.003.01zM0 19.089zM5.13 5.073c3.561-3.533 8.157-5.621 9.922-3.84 1.762 1.777-.105 6.105-3.673 9.636-3.563 3.532-8.103 5.734-9.864 3.957-1.766-1.777.045-6.217 3.612-9.75l.003-.003z"/></g>',
  "rust": '<rect x="1" y="1" width="18" height="18" rx="4" fill="#F3E6DD" stroke="#DDE2E8" stroke-width=".5"/><g transform="translate(3 3) scale(.5833333333)"><path fill="#2B2B2B" d="M23.8346 11.7033l-1.0073-.6236a13.7268 13.7268 0 00-.0283-.2936l.8656-.8069a.3483.3483 0 00-.1154-.578l-1.1066-.414a8.4958 8.4958 0 00-.087-.2856l.6904-.9587a.3462.3462 0 00-.2257-.5446l-1.1663-.1894a9.3574 9.3574 0 00-.1407-.2622l.49-1.0761a.3437.3437 0 00-.0274-.3361.3486.3486 0 00-.3006-.154l-1.1845.0416a6.7444 6.7444 0 00-.1873-.2268l.2723-1.153a.3472.3472 0 00-.417-.4172l-1.1532.2724a14.0183 14.0183 0 00-.2278-.1873l.0415-1.1845a.3442.3442 0 00-.49-.328l-1.076.491c-.0872-.0476-.1742-.0952-.2623-.1407l-.1903-1.1673A.3483.3483 0 0016.256.955l-.9597.6905a8.4867 8.4867 0 00-.2855-.086l-.414-1.1066a.3483.3483 0 00-.5781-.1154l-.8069.8666a9.2936 9.2936 0 00-.2936-.0284L12.2946.1683a.3462.3462 0 00-.5892 0l-.6236 1.0073a13.7383 13.7383 0 00-.2936.0284L9.9803.3374a.3462.3462 0 00-.578.1154l-.4141 1.1065c-.0962.0274-.1903.0567-.2855.086L7.744.955a.3483.3483 0 00-.5447.2258L7.009 2.348a9.3574 9.3574 0 00-.2622.1407l-1.0762-.491a.3462.3462 0 00-.49.328l.0416 1.1845a7.9826 7.9826 0 00-.2278.1873L3.8413 3.425a.3472.3472 0 00-.4171.4171l.2713 1.1531c-.0628.075-.1255.1509-.1863.2268l-1.1845-.0415a.3462.3462 0 00-.328.49l.491 1.0761a9.167 9.167 0 00-.1407.2622l-1.1662.1894a.3483.3483 0 00-.2258.5446l.6904.9587a13.303 13.303 0 00-.087.2855l-1.1065.414a.3483.3483 0 00-.1155.5781l.8656.807a9.2936 9.2936 0 00-.0283.2935l-1.0073.6236a.3442.3442 0 000 .5892l1.0073.6236c.008.0982.0182.1964.0283.2936l-.8656.8079a.3462.3462 0 00.1155.578l1.1065.4141c.0273.0962.0567.1914.087.2855l-.6904.9587a.3452.3452 0 00.2268.5447l1.1662.1893c.0456.088.0922.1751.1408.2622l-.491 1.0762a.3462.3462 0 00.328.49l1.1834-.0415c.0618.0769.1235.1528.1873.2277l-.2713 1.1541a.3462.3462 0 00.4171.4161l1.153-.2713c.075.0638.151.1255.2279.1863l-.0415 1.1845a.3442.3442 0 00.49.327l1.0761-.49c.087.0486.1741.0951.2622.1407l.1903 1.1662a.3483.3483 0 00.5447.2268l.9587-.6904a9.299 9.299 0 00.2855.087l.414 1.1066a.3452.3452 0 00.5781.1154l.8079-.8656c.0972.0111.1954.0203.2936.0294l.6236 1.0073a.3472.3472 0 00.5892 0l.6236-1.0073c.0982-.0091.1964-.0183.2936-.0294l.8069.8656a.3483.3483 0 00.578-.1154l.4141-1.1066a8.4626 8.4626 0 00.2855-.087l.9587.6904a.3452.3452 0 00.5447-.2268l.1903-1.1662c.088-.0456.1751-.0931.2622-.1407l1.0762.49a.3472.3472 0 00.49-.327l-.0415-1.1845a6.7267 6.7267 0 00.2267-.1863l1.1531.2713a.3472.3472 0 00.4171-.416l-.2713-1.1542c.0628-.0749.1255-.1508.1863-.2278l1.1845.0415a.3442.3442 0 00.328-.49l-.49-1.076c.0475-.0872.0951-.1742.1407-.2623l1.1662-.1893a.3483.3483 0 00.2258-.5447l-.6904-.9587.087-.2855 1.1066-.414a.3462.3462 0 00.1154-.5781l-.8656-.8079c.0101-.0972.0202-.1954.0283-.2936l1.0073-.6236a.3442.3442 0 000-.5892zm-6.7413 8.3551a.7138.7138 0 01.2986-1.396.714.714 0 11-.2997 1.396zm-.3422-2.3142a.649.649 0 00-.7715.5l-.3573 1.6685c-1.1035.501-2.3285.7795-3.6193.7795a8.7368 8.7368 0 01-3.6951-.814l-.3574-1.6684a.648.648 0 00-.7714-.499l-1.473.3158a8.7216 8.7216 0 01-.7613-.898h7.1676c.081 0 .1356-.0141.1356-.088v-2.536c0-.074-.0536-.0881-.1356-.0881h-2.0966v-1.6077h2.2677c.2065 0 1.1065.0587 1.394 1.2088.0901.3533.2875 1.5044.4232 1.8729.1346.413.6833 1.2381 1.2685 1.2381h3.5716a.7492.7492 0 00.1296-.0131 8.7874 8.7874 0 01-.8119.9526zM6.8369 20.024a.714.714 0 11-.2997-1.396.714.714 0 01.2997 1.396zM4.1177 8.9972a.7137.7137 0 11-1.304.5791.7137.7137 0 011.304-.579zm-.8352 1.9813l1.5347-.6824a.65.65 0 00.33-.8585l-.3158-.7147h1.2432v5.6025H3.5669a8.7753 8.7753 0 01-.2834-3.348zm6.7343-.5437V8.7836h2.9601c.153 0 1.0792.1772 1.0792.8697 0 .575-.7107.7815-1.2948.7815zm10.7574 1.4862c0 .2187-.008.4363-.0243.651h-.9c-.09 0-.1265.0586-.1265.1477v.413c0 .973-.5487 1.1846-1.0296 1.2382-.4576.0517-.9648-.1913-1.0275-.4717-.2704-1.5186-.7198-1.8436-1.4305-2.4034.8817-.5599 1.799-1.386 1.799-2.4915 0-1.1936-.819-1.9458-1.3769-2.3153-.7825-.5163-1.6491-.6195-1.883-.6195H5.4682a8.7651 8.7651 0 014.907-2.7699l1.0974 1.151a.648.648 0 00.9182.0213l1.227-1.1743a8.7753 8.7753 0 016.0044 4.2762l-.8403 1.8982a.652.652 0 00.33.8585l1.6178.7188c.0283.2875.0425.577.0425.8717zm-9.3006-9.5993a.7128.7128 0 11.984 1.0316.7137.7137 0 01-.984-1.0316zm8.3389 6.71a.7107.7107 0 01.9395-.3625.7137.7137 0 11-.9405.3635z"/></g>',
  "scala": '<rect x="1" y="1" width="18" height="18" rx="4" fill="#FCECEB" stroke="#DDE2E8" stroke-width=".5"/><g transform="translate(3 3) scale(.5833333333)"><path fill="#DC322F" d="M4.589 24c4.537 0 13.81-1.516 14.821-3v-5.729c-.957 1.408-10.284 2.912-14.821 2.912V24zM4.589 16.365c4.537 0 13.81-1.516 14.821-3V7.636c-.957 1.408-10.284 2.912-14.821 2.912v5.817zM4.589 8.729c4.537 0 13.81-1.516 14.821-3V0C18.453 1.408 9.126 2.912 4.589 2.912v5.817z"/></g>',
  "shell": '<rect x="1" y="1" width="18" height="18" rx="4" fill="#303642"/><g transform="translate(3 3) scale(.5833333333)"><path fill="#7EE787" d="M21.038,4.9l-7.577-4.498C13.009,0.134,12.505,0,12,0c-0.505,0-1.009,0.134-1.462,0.403L2.961,4.9 C2.057,5.437,1.5,6.429,1.5,7.503v8.995c0,1.073,0.557,2.066,1.462,2.603l7.577,4.497C10.991,23.866,11.495,24,12,24 c0.505,0,1.009-0.134,1.461-0.402l7.577-4.497c0.904-0.537,1.462-1.529,1.462-2.603V7.503C22.5,6.429,21.943,5.437,21.038,4.9z M15.17,18.946l0.013,0.646c0.001,0.078-0.05,0.167-0.111,0.198l-0.383,0.22c-0.061,0.031-0.111-0.007-0.112-0.085L14.57,19.29 c-0.328,0.136-0.66,0.169-0.872,0.084c-0.04-0.016-0.057-0.075-0.041-0.142l0.139-0.584c0.011-0.046,0.036-0.092,0.069-0.121 c0.012-0.011,0.024-0.02,0.036-0.026c0.022-0.011,0.043-0.014,0.062-0.006c0.229,0.077,0.521,0.041,0.802-0.101 c0.357-0.181,0.596-0.545,0.592-0.907c-0.003-0.328-0.181-0.465-0.613-0.468c-0.55,0.001-1.064-0.107-1.072-0.917 c-0.007-0.667,0.34-1.361,0.889-1.8l-0.007-0.652c-0.001-0.08,0.048-0.168,0.111-0.2l0.37-0.236 c0.061-0.031,0.111,0.007,0.112,0.087l0.006,0.653c0.273-0.109,0.511-0.138,0.726-0.088c0.047,0.012,0.067,0.076,0.048,0.151 l-0.144,0.578c-0.011,0.044-0.036,0.088-0.065,0.116c-0.012,0.012-0.025,0.021-0.038,0.028c-0.019,0.01-0.038,0.013-0.057,0.009 c-0.098-0.022-0.332-0.073-0.699,0.113c-0.385,0.195-0.52,0.53-0.517,0.778c0.003,0.297,0.155,0.387,0.681,0.396 c0.7,0.012,1.003,0.318,1.01,1.023C16.105,17.747,15.736,18.491,15.17,18.946z M19.143,17.859c0,0.06-0.008,0.116-0.058,0.145 l-1.916,1.164c-0.05,0.029-0.09,0.004-0.09-0.056v-0.494c0-0.06,0.037-0.093,0.087-0.122l1.887-1.129 c0.05-0.029,0.09-0.004,0.09,0.056V17.859z M20.459,6.797l-7.168,4.427c-0.894,0.523-1.553,1.109-1.553,2.187v8.833 c0,0.645,0.26,1.063,0.66,1.184c-0.131,0.023-0.264,0.039-0.398,0.039c-0.42,0-0.833-0.114-1.197-0.33L3.226,18.64 c-0.741-0.44-1.201-1.261-1.201-2.142V7.503c0-0.881,0.46-1.702,1.201-2.142l7.577-4.498c0.363-0.216,0.777-0.33,1.197-0.33 c0.419,0,0.833,0.114,1.197,0.33l7.577,4.498c0.624,0.371,1.046,1.013,1.164,1.732C21.686,6.557,21.12,6.411,20.459,6.797z"/></g>',
  "solidity": '<rect x="1" y="1" width="18" height="18" rx="4" fill="#F0F0F0" stroke="#DDE2E8" stroke-width=".5"/><g transform="translate(3 3) scale(.5833333333)"><path fill="#363636" d="M4.409 6.608L7.981.255l3.572 6.353H4.409zM8.411 0l3.569 6.348L15.552 0H8.411zm4.036 17.392l3.572 6.354 3.575-6.354h-7.147zm-.608-10.284h-7.43l3.715 6.605 3.715-6.605zm.428-.25h7.428L15.982.255l-3.715 6.603zM15.589 24l-3.569-6.349L8.448 24h7.141zm-3.856-6.858H4.306l3.712 6.603 3.715-6.603zm.428-.25h7.433l-3.718-6.605-3.715 6.605z"/></g>',
  "sql": '<rect x="1" y="1" width="18" height="18" rx="4" fill="#336791"/><ellipse cx="10" cy="5.5" rx="5.8" ry="2.1" fill="#fff"/><path fill="#fff" fill-opacity=".88" d="M4.2 5.5v8.9c0 1.2 2.6 2.1 5.8 2.1s5.8-.9 5.8-2.1V5.5c0 1.2-2.6 2.1-5.8 2.1s-5.8-.9-5.8-2.1z"/><path d="M4.2 9.2c0 1.2 2.6 2.1 5.8 2.1s5.8-.9 5.8-2.1M4.2 12.9c0 1.2 2.6 2.1 5.8 2.1s5.8-.9 5.8-2.1" fill="none" stroke="#336791" stroke-opacity=".7" stroke-width=".7"/>',
  "svelte": '<rect x="1" y="1" width="18" height="18" rx="4" fill="#FFF0EB" stroke="#DDE2E8" stroke-width=".5"/><g transform="translate(3 3) scale(.5833333333)"><path fill="#FF3E00" d="M10.354 21.125a4.44 4.44 0 0 1-4.765-1.767 4.109 4.109 0 0 1-.703-3.107 3.898 3.898 0 0 1 .134-.522l.105-.321.287.21a7.21 7.21 0 0 0 2.186 1.092l.208.063-.02.208a1.253 1.253 0 0 0 .226.83 1.337 1.337 0 0 0 1.435.533 1.231 1.231 0 0 0 .343-.15l5.59-3.562a1.164 1.164 0 0 0 .524-.778 1.242 1.242 0 0 0-.211-.937 1.338 1.338 0 0 0-1.435-.533 1.23 1.23 0 0 0-.343.15l-2.133 1.36a4.078 4.078 0 0 1-1.135.499 4.44 4.44 0 0 1-4.765-1.766 4.108 4.108 0 0 1-.702-3.108 3.855 3.855 0 0 1 1.742-2.582l5.589-3.563a4.072 4.072 0 0 1 1.135-.499 4.44 4.44 0 0 1 4.765 1.767 4.109 4.109 0 0 1 .703 3.107 3.943 3.943 0 0 1-.134.522l-.105.321-.286-.21a7.204 7.204 0 0 0-2.187-1.093l-.208-.063.02-.207a1.255 1.255 0 0 0-.226-.831 1.337 1.337 0 0 0-1.435-.532 1.231 1.231 0 0 0-.343.15L8.62 9.368a1.162 1.162 0 0 0-.524.778 1.24 1.24 0 0 0 .211.937 1.338 1.338 0 0 0 1.435.533 1.235 1.235 0 0 0 .344-.151l2.132-1.36a4.067 4.067 0 0 1 1.135-.498 4.44 4.44 0 0 1 4.765 1.766 4.108 4.108 0 0 1 .702 3.108 3.857 3.857 0 0 1-1.742 2.583l-5.589 3.562a4.072 4.072 0 0 1-1.135.499m10.358-17.95C18.484-.015 14.082-.96 10.9 1.068L5.31 4.63a6.412 6.412 0 0 0-2.896 4.295 6.753 6.753 0 0 0 .666 4.336 6.43 6.43 0 0 0-.96 2.396 6.833 6.833 0 0 0 1.168 5.167c2.229 3.19 6.63 4.135 9.812 2.108l5.59-3.562a6.41 6.41 0 0 0 2.896-4.295 6.756 6.756 0 0 0-.665-4.336 6.429 6.429 0 0 0 .958-2.396 6.831 6.831 0 0 0-1.167-5.168Z"/></g>',
  "swift": '<defs><clipPath id="__DSH_CODE_ICON_INSTANCE__a"><rect x="1" y="1" width="18" height="18" rx="4"/></clipPath></defs><g clip-path="url(#__DSH_CODE_ICON_INSTANCE__a)"><svg x="1" y="1" width="18" height="18" viewBox="0 0 128 128" preserveAspectRatio="xMidYMid meet"><path fill="#f05138" d="M126.33 34.06a39.32 39.32 0 00-.79-7.83 28.78 28.78 0 00-2.65-7.58 28.84 28.84 0 00-4.76-6.32 23.42 23.42 0 00-6.62-4.55 27.27 27.27 0 00-7.68-2.53c-2.65-.51-5.56-.51-8.21-.76H30.25a45.46 45.46 0 00-6.09.51 21.82 21.82 0 00-5.82 1.52c-.53.25-1.32.51-1.85.76a33.82 33.82 0 00-5 3.28c-.53.51-1.06.76-1.59 1.26a22.41 22.41 0 00-4.76 6.32 23.61 23.61 0 00-2.65 7.58 78.5 78.5 0 00-.79 7.83v60.39a39.32 39.32 0 00.79 7.83 28.78 28.78 0 002.65 7.58 28.84 28.84 0 004.76 6.32 23.42 23.42 0 006.62 4.55 27.27 27.27 0 007.68 2.53c2.65.51 5.56.51 8.21.76h63.22a45.08 45.08 0 008.21-.76 27.27 27.27 0 007.68-2.53 30.13 30.13 0 006.62-4.55 22.41 22.41 0 004.76-6.32 23.61 23.61 0 002.65-7.58 78.49 78.49 0 00.79-7.83V34.06z"/><path fill="#fefefe" d="M85 96.5c-11.11 6.13-26.38 6.76-41.75.47A64.53 64.53 0 0113.84 73a50 50 0 0010.85 6.32c15.87 7.1 31.73 6.61 42.9 0-15.9-11.66-29.4-26.82-39.46-39.2a43.47 43.47 0 01-5.29-6.82c12.16 10.61 31.5 24 38.38 27.79a271.77 271.77 0 01-27-32.34 266.8 266.8 0 0044.47 34.87c.71.38 1.26.7 1.7 1a32.7 32.7 0 001.21-3.51c3.71-12.89-.53-27.54-9.79-39.67C93.25 33.81 106 57.05 100.66 76.51c-.14.53-.29 1-.45 1.55l.19.22c10.59 12.63 7.68 26 6.35 23.5C101 91 90.37 94.33 85 96.5z"/></svg></g>',
  "toml": '<rect x="1" y="1" width="18" height="18" rx="4" fill="#F6EEEA" stroke="#DDE2E8" stroke-width=".5"/><g transform="translate(3 3) scale(.5833333333)"><path fill="#9C4121" d="M.014 0h5.34v2.652H2.888v18.681h2.468V24H.015V0Zm17.622 5.049v2.78h-4.274v12.935h-3.008V7.83H6.059V5.05h11.577ZM23.986 24h-5.34v-2.652h2.467V2.667h-2.468V0h5.34v24Z"/></g>',
  "typescript": '<defs><clipPath id="__DSH_CODE_ICON_INSTANCE__a"><rect x="1" y="1" width="18" height="18" rx="4"/></clipPath></defs><g clip-path="url(#__DSH_CODE_ICON_INSTANCE__a)"><svg x="1" y="1" width="18" height="18" viewBox="0 0 128 128" preserveAspectRatio="xMidYMid meet"><path fill="#fff" d="M22.67 47h99.67v73.67H22.67z"/><path data-name="original" fill="#007acc" d="M1.5 63.91v62.5h125v-125H1.5zm100.73-5a15.56 15.56 0 017.82 4.5 20.58 20.58 0 013 4c0 .16-5.4 3.81-8.69 5.85-.12.08-.6-.44-1.13-1.23a7.09 7.09 0 00-5.87-3.53c-3.79-.26-6.23 1.73-6.21 5a4.58 4.58 0 00.54 2.34c.83 1.73 2.38 2.76 7.24 4.86 8.95 3.85 12.78 6.39 15.16 10 2.66 4 3.25 10.46 1.45 15.24-2 5.2-6.9 8.73-13.83 9.9a38.32 38.32 0 01-9.52-.1 23 23 0 01-12.72-6.63c-1.15-1.27-3.39-4.58-3.25-4.82a9.34 9.34 0 011.15-.73L82 101l3.59-2.08.75 1.11a16.78 16.78 0 004.74 4.54c4 2.1 9.46 1.81 12.16-.62a5.43 5.43 0 00.69-6.92c-1-1.39-3-2.56-8.59-5-6.45-2.78-9.23-4.5-11.77-7.24a16.48 16.48 0 01-3.43-6.25 25 25 0 01-.22-8c1.33-6.23 6-10.58 12.82-11.87a31.66 31.66 0 019.49.26zm-29.34 5.24v5.12H56.66v46.23H45.15V69.26H28.88v-5a49.19 49.19 0 01.12-5.17C29.08 59 39 59 51 59h21.83z"/></svg></g>',
  "vue": '<rect x="1" y="1" width="18" height="18" rx="4" fill="#ECF8F3" stroke="#D5EAE0" stroke-width=".5"/><path fill="#41B883" d="M3.5 5h3.2l3.3 5.7L13.3 5h3.2L10 16z"/><path fill="#35495E" d="M6.7 5H9l1 1.8L11 5h2.3L10 10.7z"/>',
  "wasm": '<defs><clipPath id="__DSH_CODE_ICON_INSTANCE__a"><rect x="1" y="1" width="18" height="18" rx="4"/></clipPath></defs><g clip-path="url(#__DSH_CODE_ICON_INSTANCE__a)"><svg x="1" y="1" width="18" height="18" viewBox="0 0 128 128" preserveAspectRatio="xMidYMid meet"><path fill="#654ff0" d="M.223.222v127.555h127.555V.222H78.594c.014.227.036.455.036.686 0 8.08-6.55 14.626-14.63 14.626-8.078 0-14.625-6.546-14.625-14.626 0-.231.022-.459.031-.686zm29.595 68.746h8.445l5.782 30.738h.107l6.968-30.738h7.908l6.265 31.119h.106l6.597-31.119h8.284l-10.765 45.156H61.12l-6.213-30.738H54.8l-6.7 30.738h-8.557zm59.994 0h13.334l13.284 45.156h-8.77l-2.879-10.051H89.59l-2.212 10.05h-8.5ZM94.895 80.1l-3.684 16.57h11.473L98.448 80.1Z"/></svg></g>',
  "xml": '<rect x="1" y="1" width="18" height="18" rx="4" fill="#EAF3FA" stroke="#DDE2E8" stroke-width=".5"/><g transform="translate(3 3) scale(.5833333333)"><path fill="#005FAD" d="M4.345 7.053c-.495.02-.44.725-.536 1.081-.157.583-.3 1.325-.347 1.926-.046.585-.008 1.127.066 1.719.058.46.191.767.07.89-.108.11-3.216 2.962-3.466 3.123-.26.169-.08.584.069.817.157.246.23.373.557.33.306-.042.405-.409.583-.606.228-.252 2.421-2.401 2.616-2.401.077.544.367 1.064.67 1.513.15.222.314.439.505.629.175.175.4.317.587.45.44.024.795-.301.35-.67-.17-.14-.735-.971-.927-1.43-.18-.43-.574-1.076-.146-1.428 1.494-1.23 3.72-2.262 4.247-2.313-.257 1.024-1.356 3.048-1.757 4.012-.14.333-.231.732-.185 1.094.055.434.383.774.587.806.417-.023.7-.387.946-.645.343-.357.634-.685.974-1.043.339-.356.672-.731.971-1.07.184-.207.674-.713.963-.713-.11.693-.716 1.552-.839 2.254-.125.716.531 1.596 1.217.956.623-.58 1.255-1.129 1.867-1.72.217-.208.175.037.224.242.05.208.176.91.275 1.1.18.346.496.592.897.598.362.006.727-.161.982-.414.19-.187.513-.699.154-.832-.23-.086-.217-.176-.495-.129-.172.029-.362.074-.507.179-.367-.003-.381-.89-.324-1.161.068-.327.207-.659.185-.998-.026-.418-.478-.69-.582-.72-.156-.076-.253.023-.458.212-.173.161-.363.332-.535.495-.34.322-.768.813-.942.813.305-.705.708-2.652-.643-2.48-.563.071-.95.377-1.394.71-.29.28-.683.641-.936.87-.236.216-.371.404-.496.404.132-.747 1.685-3.167.885-3.853-.158-.136-.313-.325-.515-.349a4.637 4.637 0 0 0-.833.19c-.565.18-2.78 1.28-4.19 2.289-.131.094-.214-.085-.231-.29-.087-1.058.199-2.19.496-3.188.208-.696-.557-1.225-.659-1.249zm18.177.874c-.166.364-.2.894-.248 1.319a24.307 24.307 0 0 0-1.246-.115c.238.296.691.588 1.056.724-.048.366-.434.67-.599 1.021.458-.127.676-.47.989-.821.362.22.791.627 1.26.636-.177-.376-.334-.695-.658-.966.269-.175.717-.362.924-.633-.345-.074-.718-.093-1.052-.015-.258-.284-.3-.772-.426-1.15zm-2.92.079c-.23.02-.613.49-.832.773-.807 1.039-1.542 3.15-1.661 3.542-.363 1.195-.502 2.672.28 3.722.456.612 1.258.66 2.041.434.405-.116.812-.406.95-.723.114-.263.174-.753-.404-.38-.224.145-.634.304-1.37.291-.247-.004-.651-.357-.76-.722-.192-.595-.11-1.393-.11-1.393.167-1.028.642-2.146 1.061-3.076.163-.36.658-1.259.842-1.546 0 0 .239-.373.131-.77-.031-.116-.091-.16-.168-.152zm3.072 2.976c-.12.264-.144.648-.18.956-.274-.031-.63-.066-.904-.083.172.215.501.426.766.525-.034.265-.314.486-.434.741.332-.092.49-.34.717-.596.263.16.575.456.914.462-.127-.273-.242-.504-.477-.701.195-.127.52-.262.67-.46a1.77 1.77 0 0 0-.763-.01c-.187-.206-.217-.56-.309-.834zm-1.123 2.422c-.083.183-.1.449-.125.662a12.6 12.6 0 0 0-.624-.058c.119.148.346.295.53.363-.025.184-.219.336-.301.513.23-.064.339-.236.496-.413.181.11.397.316.632.32-.088-.19-.168-.349-.33-.485.135-.087.36-.181.463-.317a1.22 1.22 0 0 0-.527-.008c-.13-.142-.151-.387-.214-.576z"/></g>',
  "yaml": '<rect x="1" y="1" width="18" height="18" rx="4" fill="#FCEEEF" stroke="#F0D8DB" stroke-width=".5"/><svg x="2.75" y="2.75" width="14.5" height="14.5" viewBox="0 0 128 128" preserveAspectRatio="xMidYMid meet">\n<polygon transform="matrix(.24805 0 0 .24805 .5 5.6287)" points="87.702 137.67 0 0 63.25 0 119.02 88.646 175.24 0 235.79 0 143.98 137.67 143.98 224.95 87.702 224.95"/>\n<path d="m82.428 49.149h-25.266l-5.1388 12.408h-11.188l23.659-55.798h11.444l22.699 55.798h-11.956l-4.2525-12.408zm-4.197-11.14-7.7455-20.476-8.6412 20.476z" fill="#cb171e"/>\n<polygon transform="matrix(.24805 0 0 .24805 .5 5.6287)" points="87.701 250.18 87.701 470.65 135 470.65 135 318.57 184.51 420.79 221.74 420.79 272.94 314.98 272.94 470.6 318.32 470.6 318.32 250.18 256.36 250.18 201.38 349.88 149.02 250.18"/>\n<polygon transform="matrix(.24805 0 0 .24805 .5 5.6287)" points="512 422.74 512 422.74 395.64 422.74 395.64 250.12 347.44 250.12 347.44 469.65 512 469.65"/>\n</svg>',
  "zig": '<rect x="1" y="1" width="18" height="18" rx="4" fill="#FFF4DF" stroke="#DDE2E8" stroke-width=".5"/><g transform="translate(3 3) scale(.5833333333)"><path fill="#E18A00" d="m23.53 1.02-7.686 3.45h-7.06l-2.98 3.452h7.173L.47 22.98l7.681-3.607h7.065v-.002l2.978-3.45-7.148-.001 12.482-14.9zM0 4.47v14.901h1.883l2.98-3.45H3.451v-8h.942l2.824-3.45H0zm22.117 0-2.98 3.608h1.412v7.844h-.942l-2.98 3.45H24V4.47h-1.883z"/></g>'
});

// packages/client/ui-primitives/src/CodeFileIcon.tsx
import { jsx as jsx7 } from "react/jsx-runtime";
function CodeFileIcon({ type, size = 20, className }) {
  const instanceId = `dsh-code-icon-${useId3().replaceAll(":", "")}`;
  const artwork = CODE_FILE_ARTWORK[type].replaceAll(CODE_FILE_ICON_ID_TOKEN, instanceId);
  return /* @__PURE__ */ jsx7(
    "svg",
    {
      width: size,
      height: size,
      className,
      viewBox: "0 0 20 20",
      xmlns: "http://www.w3.org/2000/svg",
      "aria-hidden": true,
      dangerouslySetInnerHTML: { __html: artwork }
    }
  );
}

// packages/client/ui-primitives/src/code-file-types.ts
var CODE_FILE_TYPES = [
  "angular",
  "c",
  "clojure",
  "cmake",
  "cpp",
  "csharp",
  "css",
  "dart",
  "docker",
  "elixir",
  "env",
  "erlang",
  "flutter",
  "git",
  "go",
  "graphql",
  "haskell",
  "ini",
  "java",
  "javascript",
  "json",
  "kotlin",
  "lua",
  "makefile",
  "node",
  "objective-c",
  "perl",
  "php",
  "powershell",
  "protobuf",
  "python",
  "r",
  "react",
  "ruby",
  "rust",
  "scala",
  "shell",
  "solidity",
  "sql",
  "svelte",
  "swift",
  "toml",
  "typescript",
  "vue",
  "wasm",
  "xml",
  "yaml",
  "zig"
];
var CODE_FILE_TYPE_SET = new Set(CODE_FILE_TYPES);
var FILE_NAME_TYPES = {
  ".bash_profile": "shell",
  ".bashrc": "shell",
  ".env": "env",
  ".gitattributes": "git",
  ".gitconfig": "git",
  ".gitignore": "git",
  ".gitmodules": "git",
  ".mailmap": "git",
  ".profile": "shell",
  ".zprofile": "shell",
  ".zshrc": "shell",
  "bsdmakefile": "makefile",
  "cmakelists.txt": "cmake",
  "commit_editmsg": "git",
  "compose.yaml": "docker",
  "compose.yml": "docker",
  "docker-compose.yaml": "docker",
  "docker-compose.yml": "docker",
  "dockerfile": "docker",
  "gemfile": "ruby",
  "gnumakefile": "makefile",
  "guardfile": "ruby",
  "makefile": "makefile",
  "npm-shrinkwrap.json": "node",
  "package-lock.json": "node",
  "package.json": "node",
  "podfile": "ruby",
  "rakefile": "ruby"
};
var FILE_NAME_PREFIX_TYPES = [
  ["dockerfile.", "docker"],
  [".env.", "env"]
];
var FILE_NAME_SUFFIX_TYPES = [
  [".component.ts", "angular"],
  [".component.html", "angular"],
  [".directive.ts", "angular"],
  [".service.ts", "angular"],
  [".module.ts", "angular"],
  [".pipe.ts", "angular"],
  [".guard.ts", "angular"],
  [".interceptor.ts", "angular"],
  [".dockerfile", "docker"]
];
var EXTENSION_TYPES = {
  "bash": "shell",
  "c": "c",
  "c++": "cpp",
  "cc": "cpp",
  "cfg": "ini",
  "cjs": "javascript",
  "clj": "clojure",
  "cljc": "clojure",
  "cljs": "clojure",
  "cmake": "cmake",
  "cpp": "cpp",
  "cs": "csharp",
  "csh": "shell",
  "css": "css",
  "csx": "csharp",
  "cts": "typescript",
  "cxx": "cpp",
  "dart": "dart",
  "dtd": "xml",
  "edn": "clojure",
  "env": "env",
  "erl": "erlang",
  "es6": "javascript",
  "escript": "erlang",
  "ex": "elixir",
  "exs": "elixir",
  "fish": "shell",
  "gemspec": "ruby",
  "go": "go",
  "gql": "graphql",
  "graphql": "graphql",
  "h": "c",
  "h++": "cpp",
  "hh": "cpp",
  "hpp": "cpp",
  "hrl": "erlang",
  "hs": "haskell",
  "hxx": "cpp",
  "ini": "ini",
  "ipp": "cpp",
  "java": "java",
  "js": "javascript",
  "json": "json",
  "json5": "json",
  "jsonc": "json",
  "jsx": "react",
  "ksh": "shell",
  "kt": "kotlin",
  "kts": "kotlin",
  "lhs": "haskell",
  "lua": "lua",
  "m": "objective-c",
  "mak": "makefile",
  "mjs": "javascript",
  "mk": "makefile",
  "mm": "objective-c",
  "mts": "typescript",
  "node": "node",
  "pch": "objective-c",
  "php": "php",
  "php3": "php",
  "php4": "php",
  "php5": "php",
  "phps": "php",
  "phtml": "php",
  "pl": "perl",
  "plist": "xml",
  "pm": "perl",
  "pod": "perl",
  "proto": "protobuf",
  "ps1": "powershell",
  "psd1": "powershell",
  "psm1": "powershell",
  "py": "python",
  "pyi": "python",
  "pyw": "python",
  "pyx": "python",
  "r": "r",
  "rake": "ruby",
  "rb": "ruby",
  "rmd": "r",
  "rs": "rust",
  "sc": "scala",
  "scala": "scala",
  "sh": "shell",
  "sol": "solidity",
  "sql": "sql",
  "svelte": "svelte",
  "swift": "swift",
  "t": "perl",
  "tcsh": "shell",
  "toml": "toml",
  "tpp": "cpp",
  "ts": "typescript",
  "tsx": "react",
  "vue": "vue",
  "wasm": "wasm",
  "wast": "wasm",
  "wat": "wasm",
  "xml": "xml",
  "xsd": "xml",
  "xsl": "xml",
  "xslt": "xml",
  "yaml": "yaml",
  "yml": "yaml",
  "zig": "zig",
  "zsh": "shell"
};
var LINK_CODE_EXTENSIONS = /* @__PURE__ */ new Set([
  "ts",
  "tsx",
  "js",
  "jsx",
  "mjs",
  "cjs",
  "cts",
  "mts",
  "css",
  "scss",
  "sass",
  "less",
  "html",
  "htm",
  "vue",
  "svelte",
  "astro",
  "json",
  "jsonc",
  "json5",
  "yaml",
  "yml",
  "toml",
  "xml",
  "ini",
  "env",
  "sh",
  "bash",
  "zsh",
  "fish",
  "ps1",
  "bat",
  "cmd",
  "py",
  "pyi",
  "rb",
  "rs",
  "go",
  "java",
  "kt",
  "kts",
  "c",
  "cc",
  "cpp",
  "cxx",
  "h",
  "hh",
  "hpp",
  "cs",
  "php",
  "swift",
  "sql",
  "proto",
  "graphql",
  "gql",
  "lua",
  "r",
  "pl",
  "scala",
  "clj",
  "cljs",
  "ex",
  "exs",
  "erl",
  "hs",
  "dart"
]);
function basename(path) {
  return path.slice(Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\")) + 1);
}
function isCodeFileType(type) {
  return CODE_FILE_TYPE_SET.has(type);
}
function isLinkCodeExtension(extension) {
  return LINK_CODE_EXTENSIONS.has(extension.toLowerCase());
}
function classifyCodeFileType(name, extension, context) {
  const exact = FILE_NAME_TYPES[name];
  if (exact !== void 0) return exact;
  for (const [prefix, type] of FILE_NAME_PREFIX_TYPES) {
    if (name.startsWith(prefix)) return type;
  }
  for (const [suffix, type] of FILE_NAME_SUFFIX_TYPES) {
    if (name.endsWith(suffix)) return type;
  }
  if (extension === "dart" && context !== void 0) {
    const pubspec = Object.entries(context.files).find(([path]) => basename(path).toLowerCase() === "pubspec.yaml")?.[1];
    if (pubspec?.includes("flutter:") === true) return "flutter";
  }
  return EXTENSION_TYPES[extension] ?? null;
}

// packages/client/ui-primitives/src/FileTypeIcon.module.css
var FileTypeIcon_default = {
  icon: "FileTypeIcon_icon",
  code: "FileTypeIcon_code",
  excel: "FileTypeIcon_excel",
  folder: "FileTypeIcon_folder",
  html: "FileTypeIcon_html",
  image: "FileTypeIcon_image",
  markdown: "FileTypeIcon_markdown",
  other: "FileTypeIcon_other",
  pdf: "FileTypeIcon_pdf",
  ppt: "FileTypeIcon_ppt",
  video: "FileTypeIcon_video",
  word: "FileTypeIcon_word"
};

// packages/client/ui-primitives/src/FileTypeIcon.tsx
import { jsx as jsx8, jsxs as jsxs6 } from "react/jsx-runtime";
var EXTENSION_TYPES2 = {
  scss: "code",
  sass: "code",
  less: "code",
  vue: "code",
  svelte: "code",
  astro: "code",
  bat: "code",
  cmd: "code",
  csv: "excel",
  tsv: "excel",
  html: "html",
  htm: "html",
  png: "image",
  jpg: "image",
  jpeg: "image",
  gif: "image",
  svg: "image",
  webp: "image",
  avif: "image",
  bmp: "image",
  ico: "image",
  tif: "image",
  tiff: "image",
  heic: "image",
  heif: "image",
  md: "markdown",
  mdx: "markdown",
  markdown: "markdown",
  pdf: "pdf",
  ppt: "ppt",
  pptx: "ppt",
  key: "ppt",
  mp4: "video",
  mov: "video",
  m4v: "video",
  webm: "video",
  mkv: "video",
  avi: "video",
  mpg: "video",
  mpeg: "video",
  doc: "word",
  docx: "word",
  rtf: "word",
  odt: "word",
  pages: "word",
  xls: "excel",
  xlsx: "excel",
  xlsm: "excel",
  xlsb: "excel",
  xlt: "excel",
  xltx: "excel",
  xltm: "excel",
  ods: "excel",
  ots: "excel",
  fods: "excel",
  numbers: "excel"
};
var NAME_TYPES = {
  changelog: "markdown",
  contributing: "markdown",
  readme: "markdown"
};
function basename2(path) {
  return path.slice(Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\")) + 1);
}
function fileExtension(path) {
  const name = basename2(path);
  const dot = name.lastIndexOf(".");
  return dot < 0 ? "" : name.slice(dot + 1);
}
function classifyFileType(path, context) {
  const name = basename2(path).toLowerCase();
  const extension = fileExtension(name).toLowerCase();
  return classifyCodeFileType(name, extension, context) ?? NAME_TYPES[name] ?? EXTENSION_TYPES2[extension] ?? "other";
}
var FILE_BODY = "M8.48924 28H19.5108C21.6479 28 22.7165 28 23.5594 27.6509C24.6833 27.1853 25.5762 26.2924 26.0417 25.1685C26.3909 24.3256 26.3909 23.257 26.3909 21.1199V8.79443C26.3909 8.32877 26.3909 8.09593 26.3471 7.87507C26.2887 7.58058 26.173 7.30042 26.0067 7.05048C25.882 6.86303 25.7177 6.69799 25.3893 6.36792L20.0611 1.01354C19.7304 0.681235 19.5651 0.515081 19.3769 0.38885C19.126 0.220541 18.8443 0.103463 18.5481 0.0443412C18.3259 0 18.0915 0 17.6226 0H8.48924C6.35209 0 5.28351 0 4.4406 0.349145C3.31672 0.814671 2.4238 1.70759 1.95828 2.83147C1.60913 3.67438 1.60913 4.74296 1.60913 6.88011V21.1199C1.60913 23.257 1.60913 24.3256 1.95828 25.1685C2.4238 26.2924 3.31672 27.1853 4.4406 27.6509C5.28351 28 6.35209 28 8.48924 28Z";
var FILE_FOLD = "M26.3909 7.37445L19.0525 0V3.77445C19.0525 4.89271 19.0525 5.45184 19.2352 5.89289C19.4788 6.48096 19.946 6.94818 20.5341 7.19176C20.9751 7.37445 21.5342 7.37445 22.6525 7.37445H26.3909Z";
var FILE_MARK_TRANSFORM = "translate(14 16) scale(1.12) translate(-14 -16)";
var LARGE_FILE_MARK_TRANSFORM = "translate(14 16) scale(1.22) translate(-14 -16)";
var FOLDER_MARK_TRANSFORM = "translate(14 13.0693) scale(1.12) translate(-14 -13.0693)";
function FileGlyph({
  size,
  className,
  children,
  markTransform,
  muted = false
}) {
  return /* @__PURE__ */ jsxs6("svg", { width: size, height: size, className, viewBox: "0 0 28 28", fill: "none", xmlns: "http://www.w3.org/2000/svg", "aria-hidden": true, children: [
    /* @__PURE__ */ jsx8("path", { d: FILE_BODY, fill: "currentColor" }),
    muted ? /* @__PURE__ */ jsx8("path", { d: FILE_FOLD, fill: "var(--dsw-static-neutral-400)" }) : /* @__PURE__ */ jsx8("path", { d: FILE_FOLD, fill: "var(--dsw-static-neutral-00)", fillOpacity: ".7" }),
    children !== void 0 && /* @__PURE__ */ jsx8("g", { color: "var(--dsw-static-neutral-00)", "data-file-type-mark": true, transform: markTransform, children })
  ] });
}
function FolderGlyph({ size, className }) {
  return /* @__PURE__ */ jsxs6("svg", { width: size, height: size, className, viewBox: "0 0 28 28", fill: "none", xmlns: "http://www.w3.org/2000/svg", "aria-hidden": true, children: [
    /* @__PURE__ */ jsx8(
      "path",
      {
        d: "M2.80078 10.2112C2.80078 9.52802 2.80078 9.18642 2.85314 8.866C2.98648 8.05 3.36942 7.29538 3.94925 6.70595C4.17694 6.4745 4.45264 6.2728 5.00404 5.86939C5.29197 5.65874 5.43594 5.55342 5.58711 5.46632C5.97089 5.24521 6.39638 5.10618 6.83667 5.05803C7.01011 5.03906 7.18849 5.03906 7.54524 5.03906H11.6543C12.4669 5.03906 12.8732 5.03906 13.2599 5.13697C13.3882 5.16945 13.5143 5.20986 13.6375 5.25795C14.0091 5.40294 14.3398 5.63902 15.0012 6.1112L16.2632 7.01224C16.5526 7.21881 16.6972 7.3221 16.8598 7.38553C16.9137 7.40657 16.9689 7.42425 17.025 7.43846C17.1942 7.4813 17.372 7.4813 17.7275 7.4813H19.8008C22.0506 7.4813 23.1755 7.4813 23.9641 8.05425C24.2188 8.23928 24.4428 8.46326 24.6278 8.71794C25.2008 9.50654 25.2008 10.6315 25.2008 12.8813V18.7283C25.2008 20.9781 25.2008 22.1031 24.6278 22.8917C24.4428 23.1463 24.2188 23.3703 23.9641 23.5554C23.1755 24.1283 22.0506 24.1283 19.8008 24.1283H8.20077C5.95094 24.1283 4.82602 24.1283 4.03743 23.5554C3.78274 23.3703 3.55877 23.1463 3.37373 22.8917C2.80078 22.1031 2.80078 20.9781 2.80078 18.7283V10.2112Z",
        fill: "currentColor"
      }
    ),
    /* @__PURE__ */ jsx8("g", { color: "var(--dsw-static-neutral-00)", "data-file-type-mark": true, transform: FOLDER_MARK_TRANSFORM, children: /* @__PURE__ */ jsx8("path", { d: "M6.31445 13.0693H21.6893", stroke: "currentColor", strokeWidth: "2.38" }) })
  ] });
}
function SpreadsheetGlyph({ size, className }) {
  return /* @__PURE__ */ jsx8(FileGlyph, { size, className, children: /* @__PURE__ */ jsx8(
    "path",
    {
      d: "M14 11.5H11.4C10.5599 11.5 10.1399 11.5 9.81901 11.6635C9.53677 11.8073 9.3073 12.0368 9.16349 12.319C9 12.6399 9 13.0599 9 13.9V16.5M14 11.5H16.6C17.4401 11.5 17.8601 11.5 18.181 11.6635C18.4632 11.8073 18.6927 12.0368 18.8365 12.319C19 12.6399 19 13.0599 19 13.9V16.5M14 11.5V21.5M14 21.5H16.6C17.4401 21.5 17.8601 21.5 18.181 21.3365C18.4632 21.1927 18.6927 20.9632 18.8365 20.681C19 20.3601 19 19.9401 19 19.1V16.5M14 21.5H11.4C10.5599 21.5 10.1399 21.5 9.81901 21.3365C9.53677 21.1927 9.3073 20.9632 9.16349 20.681C9 20.3601 9 19.9401 9 19.1V16.5M19 16.5H9",
      stroke: "currentColor",
      strokeWidth: "1.2"
    }
  ) });
}
function glyph(type, size, className) {
  switch (type) {
    case "code":
      return /* @__PURE__ */ jsxs6(FileGlyph, { size, className, children: [
        /* @__PURE__ */ jsx8("path", { d: "M10.0053 13.126L7.0236 16.3788C6.96052 16.4476 6.96052 16.5532 7.0236 16.622L10.0053 19.8748", stroke: "currentColor", strokeWidth: "1.35" }),
        /* @__PURE__ */ jsx8("path", { d: "M17.9941 13.126L20.9759 16.3788C21.039 16.4476 21.039 16.5532 20.9759 16.622L17.9941 19.8748", stroke: "currentColor", strokeWidth: "1.35" }),
        /* @__PURE__ */ jsx8("path", { d: "M15.2652 12.957L12.7344 20.0433", stroke: "currentColor", strokeWidth: "1.35" })
      ] });
    case "excel":
      return /* @__PURE__ */ jsx8(SpreadsheetGlyph, { size, className });
    case "folder":
      return /* @__PURE__ */ jsx8(FolderGlyph, { size, className });
    case "html":
      return /* @__PURE__ */ jsx8(FileGlyph, { size, className, markTransform: FILE_MARK_TRANSFORM, children: /* @__PURE__ */ jsx8(
        "path",
        {
          fillRule: "evenodd",
          clipRule: "evenodd",
          d: "M13.9994 9.68298C17.212 9.68298 19.8167 12.2872 19.8168 15.4997C19.8168 18.7123 17.2121 21.3171 13.9994 21.3171C10.7869 21.3169 8.18274 18.7122 8.18274 15.4997C8.1829 12.2873 10.787 9.68315 13.9994 9.68298ZM9.26213 16.0247C9.47025 17.9241 10.7936 19.4876 12.5639 20.0463C12.42 19.7977 12.2952 19.5152 12.1879 19.2116C11.885 18.3541 11.693 17.2434 11.6424 16.0247H9.26213ZM16.3565 16.0247C16.3059 17.2434 16.1145 18.3542 15.8116 19.2116C15.7044 19.5151 15.5788 19.7971 15.435 20.0456C17.2054 19.487 18.5293 17.9242 18.7374 16.0247H16.3565ZM12.6938 16.0247C12.7439 17.1459 12.9212 18.1334 13.1784 18.8616C13.332 19.2962 13.503 19.61 13.6686 19.805C13.834 19.9996 13.9473 20.0256 13.9994 20.0258C14.0514 20.0258 14.1651 20.0002 14.331 19.805C14.4966 19.61 14.6676 19.2962 14.8211 18.8616C15.0784 18.1334 15.2557 17.1459 15.3058 16.0247H12.6938ZM13.9994 10.733C13.9473 10.7331 13.834 10.7598 13.6686 10.9545C13.503 11.1494 13.3319 11.4633 13.1784 11.8978C12.903 12.6777 12.7188 13.7545 12.6849 14.9747H15.3147C15.2808 13.7545 15.0966 12.6777 14.8211 11.8978C14.6676 11.4633 14.4965 11.1494 14.331 10.9545C14.1651 10.7593 14.0514 10.733 13.9994 10.733ZM15.5888 11.0051C15.6701 11.1756 15.7444 11.3576 15.8116 11.5478C16.1343 12.4613 16.3308 13.6619 16.3647 14.9747H18.7374C18.5352 13.1307 17.2817 11.6036 15.5888 11.0051ZM12.4101 11.0051C10.7174 11.6037 9.46428 13.1308 9.26213 14.9747H11.6349C11.6688 13.6619 11.8652 12.4613 12.1879 11.5478C12.2551 11.3577 12.3288 11.1756 12.4101 11.0051Z",
          fill: "currentColor"
        }
      ) });
    case "image":
      return /* @__PURE__ */ jsxs6(FileGlyph, { size, className, markTransform: FILE_MARK_TRANSFORM, children: [
        /* @__PURE__ */ jsx8("path", { d: "M10.4212 15.9204C10.5756 15.6558 10.9579 15.6558 11.1123 15.9204L13.6493 20.2696C13.8048 20.5362 13.6125 20.8711 13.3037 20.8711H8.22974C7.92102 20.8711 7.72868 20.5362 7.88423 20.2696L10.4212 15.9204Z", fill: "currentColor" }),
        /* @__PURE__ */ jsx8("path", { d: "M15.4981 13.186C15.6505 12.9117 16.0451 12.9117 16.1975 13.186L20.1368 20.2769C20.2849 20.5435 20.0922 20.8711 19.7872 20.8711H11.9084C11.6034 20.8711 11.4107 20.5435 11.5588 20.2769L15.4981 13.186Z", fill: "currentColor" }),
        /* @__PURE__ */ jsx8("path", { d: "M11.8603 11.3997C11.8603 12.286 11.1418 13.0045 10.2555 13.0045C9.36924 13.0045 8.65076 12.286 8.65076 11.3997C8.65076 10.5134 9.36924 9.79492 10.2555 9.79492C11.1418 9.79492 11.8603 10.5134 11.8603 11.3997Z", fill: "currentColor" })
      ] });
    case "markdown":
      return /* @__PURE__ */ jsx8(FileGlyph, { size, className, markTransform: LARGE_FILE_MARK_TRANSFORM, children: /* @__PURE__ */ jsx8("path", { d: "M8.7588 19.5V14.6H9.8998L11.9298 17.932H11.3278L13.3018 14.6H14.4428L14.4568 19.5H13.1828L13.1688 16.539H13.3858L11.9088 19.017H11.2928L9.7738 16.539H10.0398V19.5H8.7588ZM15.4375 19.5V14.6H17.7545C18.2958 14.6 18.7718 14.7003 19.1825 14.901C19.5932 15.1017 19.9128 15.384 20.1415 15.748C20.3748 16.112 20.4915 16.546 20.4915 17.05C20.4915 17.5493 20.3748 17.9833 20.1415 18.352C19.9128 18.716 19.5932 18.9983 19.1825 19.199C18.7718 19.3997 18.2958 19.5 17.7545 19.5H15.4375ZM16.8235 18.394H17.6985C17.9785 18.394 18.2212 18.3427 18.4265 18.24C18.6365 18.1327 18.7998 17.9787 18.9165 17.778C19.0332 17.5727 19.0915 17.33 19.0915 17.05C19.0915 16.7653 19.0332 16.5227 18.9165 16.322C18.7998 16.1213 18.6365 15.9697 18.4265 15.867C18.2212 15.7597 17.9785 15.706 17.6985 15.706H16.8235V18.394Z", fill: "currentColor" }) });
    case "other":
      return /* @__PURE__ */ jsx8(FileGlyph, { size, className, muted: true });
    case "pdf":
      return /* @__PURE__ */ jsx8(FileGlyph, { size, className, markTransform: LARGE_FILE_MARK_TRANSFORM, children: /* @__PURE__ */ jsx8("path", { d: "M6.80616 19.5V14.6H9.04616C9.49416 14.6 9.87916 14.6723 10.2012 14.817C10.5278 14.9617 10.7798 15.1717 10.9572 15.447C11.1345 15.7177 11.2232 16.0397 11.2232 16.413C11.2232 16.7817 11.1345 17.1013 10.9572 17.372C10.7798 17.6427 10.5278 17.8527 10.2012 18.002C9.87916 18.1467 9.49416 18.219 9.04616 18.219H7.57616L8.19216 17.617V19.5H6.80616ZM8.19216 17.764L7.57616 17.127H8.96216C9.2515 17.127 9.46616 17.064 9.60616 16.938C9.75083 16.812 9.82316 16.637 9.82316 16.413C9.82316 16.1843 9.75083 16.007 9.60616 15.881C9.46616 15.755 9.2515 15.692 8.96216 15.692H7.57616L8.19216 15.055V17.764ZM11.8989 19.5V14.6H14.2159C14.7573 14.6 15.2333 14.7003 15.6439 14.901C16.0546 15.1017 16.3743 15.384 16.6029 15.748C16.8363 16.112 16.9529 16.546 16.9529 17.05C16.9529 17.5493 16.8363 17.9833 16.6029 18.352C16.3743 18.716 16.0546 18.9983 15.6439 19.199C15.2333 19.3997 14.7573 19.5 14.2159 19.5H11.8989ZM13.2849 18.394H14.1599C14.4399 18.394 14.6826 18.3427 14.8879 18.24C15.0979 18.1327 15.2613 17.9787 15.3779 17.778C15.4946 17.5727 15.5529 17.33 15.5529 17.05C15.5529 16.7653 15.4946 16.5227 15.3779 16.322C15.2613 16.1213 15.0979 15.9697 14.8879 15.867C14.6826 15.7597 14.4399 15.706 14.1599 15.706H13.2849V18.394ZM17.6821 19.5V14.6H21.5251V15.671H19.0681V19.5H17.6821ZM18.9701 17.82V16.749H21.2311V17.82H18.9701Z", fill: "currentColor" }) });
    case "ppt":
      return /* @__PURE__ */ jsx8(FileGlyph, { size, className, markTransform: LARGE_FILE_MARK_TRANSFORM, children: /* @__PURE__ */ jsx8("path", { d: "M11.0132 20.5V13.5H14.2132C14.8532 13.5 15.4032 13.6033 15.8632 13.81C16.3299 14.0167 16.6899 14.3167 16.9432 14.71C17.1966 15.0967 17.3232 15.5567 17.3232 16.09C17.3232 16.6167 17.1966 17.0733 16.9432 17.46C16.6899 17.8467 16.3299 18.1467 15.8632 18.36C15.4032 18.5667 14.8532 18.67 14.2132 18.67H12.1132L12.9932 17.81V20.5H11.0132ZM12.9932 18.02L12.1132 17.11H14.0932C14.5066 17.11 14.8132 17.02 15.0132 16.84C15.2199 16.66 15.3232 16.41 15.3232 16.09C15.3232 15.7633 15.2199 15.51 15.0132 15.33C14.8132 15.15 14.5066 15.06 14.0932 15.06H12.1132L12.9932 14.15V18.02Z", fill: "currentColor" }) });
    case "video":
      return /* @__PURE__ */ jsx8(FileGlyph, { size, className, markTransform: FILE_MARK_TRANSFORM, children: /* @__PURE__ */ jsx8("path", { d: "M17.5 14.634C18.1667 15.0189 18.1667 15.9811 17.5 16.366L11.5 19.8301C10.8333 20.215 10 19.7339 10 18.9641L10 12.0359C10 11.2661 10.8333 10.785 11.5 11.1699L17.5 14.634Z", fill: "currentColor" }) });
    case "word":
      return /* @__PURE__ */ jsx8(FileGlyph, { size, className, markTransform: LARGE_FILE_MARK_TRANSFORM, children: /* @__PURE__ */ jsx8("path", { d: "M10.5118 20.5L8.24179 13.5H10.2818L12.1918 19.56H11.1618L13.1718 13.5H14.9918L16.8918 19.56H15.9018L17.8718 13.5H19.7618L17.4918 20.5H15.3718L13.7518 15.35H14.3218L12.6318 20.5H10.5118Z", fill: "currentColor" }) });
    /* v8 ignore next -- closed-union backstop; only reached if a type is forged */
    default:
      return assertNever(type);
  }
}
function assertNever(value) {
  throw new Error(`unreachable traditional file type: ${String(value)}`);
}
function FileTypeIcon(props) {
  const { size = 28, className } = props;
  const resolvedType = "path" in props ? classifyFileType(props.path, props.context) : props.kind;
  return isCodeFileType(resolvedType) ? /* @__PURE__ */ jsx8(CodeFileIcon, { type: resolvedType, size, className }) : glyph(resolvedType, size, clsx3(FileTypeIcon_default.icon, FileTypeIcon_default[resolvedType], className));
}

// packages/client/ui-primitives/src/file-size.ts
function fileSizeText(bytes) {
  if (bytes < 1024) return `${bytes}B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb < 10 ? kb.toFixed(1) : Math.round(kb)}KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)}MB`;
  const gb = mb / 1024;
  return `${gb < 10 ? gb.toFixed(1) : Math.round(gb)}GB`;
}

// packages/client/ui-primitives/src/JsonTree.tsx
import clsx6 from "clsx";
import { useCallback as useCallback5, useEffect as useEffect6, useId as useId5, useLayoutEffect as useLayoutEffect4, useRef as useRef7, useState as useState5, useSyncExternalStore as useSyncExternalStore2 } from "react";

// packages/client/ui-primitives/src/Menu.tsx
import { useEffect as useEffect5, useLayoutEffect as useLayoutEffect3, useRef as useRef6, useState as useState4 } from "react";
import { createPortal as createPortal3 } from "react-dom";
import clsx5 from "clsx";

// packages/client/ui-primitives/src/overlay-top-margin.ts
function overlayTopMargin(min) {
  const root = document.documentElement;
  const clearance = Number.parseFloat(getComputedStyle(root).getPropertyValue("--dsh-frame-top-clearance"));
  if (Number.isNaN(clearance)) return min;
  return Math.max(min, (root.hasAttribute("data-fullscreen") ? 0 : clearance) + 20);
}

// packages/client/ui-primitives/src/pointer-grace.ts
import { useCallback as useCallback4, useEffect as useEffect4, useRef as useRef3 } from "react";
var POINTER_GRACE_MS = 200;
function usePointerGrace(close) {
  const timerRef = useRef3(null);
  const closeRef = useRef3(close);
  closeRef.current = close;
  const cancel = useCallback4(() => {
    if (timerRef.current === null) return;
    clearTimeout(timerRef.current);
    timerRef.current = null;
  }, []);
  const arm = useCallback4(() => {
    cancel();
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      closeRef.current();
    }, POINTER_GRACE_MS);
  }, [cancel]);
  useEffect4(() => cancel, [cancel]);
  return { arm, cancel };
}

// packages/client/ui-primitives/src/useModalLayer.ts
import { useLayoutEffect, useRef as useRef4 } from "react";

// packages/client/ui-primitives/src/keyboard-composition.ts
function observeComposition(document2) {
  let composing = false;
  let ended = false;
  const start = () => {
    composing = true;
  };
  const end = () => {
    composing = false;
    ended = true;
  };
  const release = () => {
    ended = false;
  };
  const blur = () => {
    composing = false;
    ended = false;
  };
  document2.addEventListener("compositionstart", start, true);
  document2.addEventListener("compositionend", end, true);
  document2.addEventListener("keyup", release, true);
  document2.defaultView?.addEventListener("blur", blur);
  return {
    guards: (event) => {
      const guarded = composing || ended || event.isComposing || event.keyCode === 229;
      ended = false;
      return guarded;
    },
    dispose: () => {
      document2.removeEventListener("compositionstart", start, true);
      document2.removeEventListener("compositionend", end, true);
      document2.removeEventListener("keyup", release, true);
      document2.defaultView?.removeEventListener("blur", blur);
    }
  };
}

// packages/client/ui-primitives/src/focus.ts
var releases = /* @__PURE__ */ new WeakMap();
var navigationKeys = /* @__PURE__ */ new Set(["Tab", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Home", "End"]);
function focusWithoutRing(element, options) {
  releases.get(element)?.();
  const release = () => {
    element.removeAttribute("data-dsh-automatic-focus");
    element.removeEventListener("blur", release);
    element.removeEventListener("keydown", navigate, true);
    releases.delete(element);
  };
  const navigate = (event) => {
    if (!event.isComposing && !event.ctrlKey && !event.altKey && !event.metaKey && navigationKeys.has(event.key)) release();
  };
  releases.set(element, release);
  element.setAttribute("data-dsh-automatic-focus", "");
  element.addEventListener("blur", release);
  element.addEventListener("keydown", navigate, true);
  element.focus(options);
  if (!element.matches(":focus")) release();
}

// packages/client/ui-primitives/src/useModalLayer.ts
var layers = /* @__PURE__ */ new WeakMap();
function isBehindModal(anchor) {
  if (anchor === null) return false;
  const top = layers.get(anchor.ownerDocument)?.at(-1);
  return top !== void 0 && !top.element.contains(anchor);
}

// packages/client/ui-primitives/src/MenuSurface.tsx
import { forwardRef, useId as useId4, useLayoutEffect as useLayoutEffect2, useRef as useRef5 } from "react";
import { createPortal as createPortal2 } from "react-dom";
import clsx4 from "clsx";

// packages/client/ui-primitives/src/MenuSurface.module.css
var MenuSurface_default = {
  surface: "MenuSurface_surface",
  backing: "MenuSurface_backing",
  compact: "MenuSurface_compact",
  material: "MenuSurface_material"
};

// packages/client/ui-primitives/src/MenuSurface.tsx
import { Fragment as Fragment2, jsx as jsx9, jsxs as jsxs7 } from "react/jsx-runtime";
var MenuSurface = forwardRef(function MenuSurface2({
  compact = false,
  className,
  style,
  children,
  ...props
}, ref) {
  const id = useId4();
  const backingRef = useRef5(null);
  useLayoutEffect2(() => {
    document.body.appendChild(backingRef.current);
  }, []);
  const anchorStyle = {
    "--dsh-menu-anchor": `--dsh-menu-${id.replaceAll(":", "")}`
  };
  return /* @__PURE__ */ jsxs7(Fragment2, { children: [
    /* @__PURE__ */ jsxs7(
      "div",
      {
        ...props,
        ref,
        "data-menu-material": "translucent",
        className: clsx4(MenuSurface_default.surface, compact && MenuSurface_default.compact, className),
        style: { ...style, ...anchorStyle },
        children: [
          /* @__PURE__ */ jsx9("div", { "aria-hidden": "true", className: MenuSurface_default.material }),
          children
        ]
      }
    ),
    createPortal2(
      /* @__PURE__ */ jsx9(
        "div",
        {
          ref: backingRef,
          "aria-hidden": "true",
          "data-menu-backing": "",
          className: clsx4(MenuSurface_default.backing, compact && MenuSurface_default.compact),
          style: { ...anchorStyle, visibility: style?.visibility }
        }
      ),
      document.body
    )
  ] });
});

// packages/client/ui-primitives/src/Menu.module.css
var Menu_default = {
  root: "Menu_root",
  list: "Menu_list",
  submenu: "Menu_submenu",
  portal: "Menu_portal",
  sideTop: "Menu_sideTop",
  alignEnd: "Menu_alignEnd",
  scrollable: "Menu_scrollable",
  viewport: "Menu_viewport",
  footer: "Menu_footer",
  itemWrap: "Menu_itemWrap",
  item: "Menu_item",
  denseList: "Menu_denseList",
  label: "Menu_label",
  compactList: "Menu_compactList",
  itemIcon: "Menu_itemIcon",
  separator: "Menu_separator",
  check: "Menu_check",
  itemLabel: "Menu_itemLabel",
  shortcut: "Menu_shortcut",
  shortcutKeys: "Menu_shortcutKeys",
  selected: "Menu_selected",
  selectedFill: "Menu_selectedFill",
  danger: "Menu_danger"
};

// packages/client/ui-primitives/src/Menu.tsx
import { jsx as jsx10, jsxs as jsxs8 } from "react/jsx-runtime";
function isSeparator(entry) {
  return "type" in entry && entry.type === "separator";
}
function isLabel(entry) {
  return "type" in entry && entry.type === "label";
}
var MEASURE_STYLE = { visibility: "hidden", left: 0, top: 0 };
function Menu({ open, anchor, items = [], children, selectedId, selectedIds, onSelect, onClose, align = "start", side = "bottom", portal = false, closeOnPointerLeave = false, dense = false, compact = false, autoFocus = false, selection = "check", getAnchorRect, footer, className, listClassName }) {
  const rootRef = useRef6(null);
  const listRef = useRef6(null);
  const walkIndex = useRef6(null);
  const triggerRef = useRef6(null);
  const selectingWithTab = useRef6(false);
  const refocusAnchor = (navigation = false) => {
    const trigger = triggerRef.current;
    const target = trigger !== null && document.contains(trigger) && !trigger.disabled ? trigger : rootRef.current?.querySelector("button:not(:disabled)");
    if (target == null) return;
    if (navigation) target.focus();
    else focusWithoutRing(target);
  };
  const refocusAfterSelection = () => {
    const navigation = selectingWithTab.current;
    queueMicrotask(() => {
      if (openRef.current) return;
      const active = document.activeElement;
      if (active === null || active === document.body || listRef.current?.contains(active) === true) refocusAnchor(navigation);
    });
  };
  const openRef = useRef6(open);
  openRef.current = open;
  const [openSubmenuId, setOpenSubmenuId] = useState4(null);
  const [fixedPos, setFixedPos] = useState4(null);
  const { arm: armClose, cancel: cancelClose } = usePointerGrace(onClose);
  useLayoutEffect3(() => {
    if (!open || !portal) {
      setFixedPos(null);
      return;
    }
    const place = () => {
      let r;
      if (getAnchorRect !== void 0) {
        r = getAnchorRect();
      } else {
        r = rootRef.current?.getBoundingClientRect() ?? null;
      }
      if (r === null) return;
      const MARGIN = 12;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const listEl = listRef.current;
      const lw = listEl?.offsetWidth ?? 0;
      const lh = listEl?.offsetHeight ?? 0;
      let x;
      let y;
      if (side === "right") {
        x = r.right + 4;
        y = r.top;
      } else if (align === "start") {
        x = r.left;
        y = side === "bottom" ? r.bottom + 4 : r.top - lh - 4;
      } else {
        x = r.right - lw;
        y = side === "bottom" ? r.bottom + 4 : r.top - lh - 4;
      }
      if (lw > 0) x = Math.min(Math.max(x, MARGIN), vw - lw - MARGIN);
      if (lh > 0) y = Math.min(Math.max(y, overlayTopMargin(MARGIN)), vh - lh - MARGIN);
      setFixedPos((current) => current?.left === x && current.top === y ? current : { left: x, top: y });
    };
    place();
    const track = () => {
      place();
      frame = requestAnimationFrame(track);
    };
    let frame = requestAnimationFrame(track);
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [open, portal, align, side, getAnchorRect]);
  useEffect5(() => {
    if (!open) {
      triggerRef.current = null;
      return;
    }
    const active = document.activeElement;
    triggerRef.current = active instanceof HTMLElement && rootRef.current?.contains(active) === true ? active : null;
  }, [open]);
  useEffect5(() => {
    if (!open || !autoFocus) return;
    const first = listRef.current?.querySelector("button:not(:disabled)");
    walkIndex.current = first === void 0 || first === null ? null : 0;
    if (first != null) focusWithoutRing(first);
  }, [open, autoFocus]);
  useEffect5(() => {
    if (!open) {
      setOpenSubmenuId(null);
      walkIndex.current = null;
      return;
    }
    const composition = observeComposition(document);
    const onPointerDown = (e) => {
      if (!(e.target instanceof Node)) return;
      if (rootRef.current?.contains(e.target) === true) return;
      if (listRef.current?.contains(e.target) === true) return;
      onClose();
    };
    const onKeyDown = (e) => {
      if (composition.guards(e) || isBehindModal(rootRef.current) || e.defaultPrevented || e.ctrlKey || e.altKey || e.metaKey) return;
      const focused = document.activeElement;
      const insideList = listRef.current?.contains(focused) === true;
      const anchored = rootRef.current?.contains(focused) === true || insideList;
      if (e.key === "Escape" && !e.shiftKey) {
        e.preventDefault();
        if (e.repeat) return;
        onClose();
        if (anchored || autoFocus) refocusAnchor();
      }
      if (e.key === "Tab") {
        const list3 = listRef.current;
        if (list3 === null || !anchored) return;
        if (e.shiftKey) {
          e.preventDefault();
          onClose();
          refocusAnchor(true);
          return;
        }
        if (insideList) {
          if (focused instanceof Element && focused.getAttribute("role") === "menuitem") {
            e.preventDefault();
            selectingWithTab.current = true;
            try {
              focused.click();
            } finally {
              selectingWithTab.current = false;
            }
          }
          return;
        }
        const row = list3.querySelector("button:not(:disabled)");
        if (row === null) return;
        e.preventDefault();
        row.focus();
        walkIndex.current = 0;
        return;
      }
      if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) return;
      const list2 = listRef.current;
      if (list2 === null || !anchored) return;
      const buttons = Array.from(list2.querySelectorAll("button:not(:disabled)"));
      if (buttons.length === 0) return;
      const index = buttons.indexOf(focused);
      const from = index >= 0 ? index : walkIndex.current;
      const next = e.key === "Home" ? 0 : e.key === "End" ? buttons.length - 1 : from === null ? e.key === "ArrowDown" ? 0 : buttons.length - 1 : (from + (e.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length;
      e.preventDefault();
      walkIndex.current = next;
      buttons[next]?.focus();
    };
    const onWindowBlur = () => {
      if (document.activeElement instanceof HTMLIFrameElement) onClose();
    };
    document.addEventListener("pointerdown", onPointerDown);
    const onEscape = (event) => {
      if (event.key === "Escape") onKeyDown(event);
    };
    const onOtherKey = (event) => {
      if (event.key !== "Escape") onKeyDown(event);
    };
    document.addEventListener("keydown", onOtherKey);
    document.addEventListener("keydown", onEscape, true);
    window.addEventListener("blur", onWindowBlur);
    return () => {
      composition.dispose();
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onOtherKey);
      document.removeEventListener("keydown", onEscape, true);
      window.removeEventListener("blur", onWindowBlur);
    };
  }, [open, onClose, autoFocus]);
  useEffect5(() => {
    if (!open) cancelClose();
  }, [open, cancelClose]);
  const scrollable = !items.some((entry) => !isSeparator(entry) && !isLabel(entry) && entry.submenu !== void 0 && entry.submenu.length > 0);
  const renderEntry = (entry) => {
    if (isSeparator(entry)) {
      return /* @__PURE__ */ jsx10("div", { className: Menu_default.separator, role: "separator" }, entry.id);
    }
    if (isLabel(entry)) {
      return /* @__PURE__ */ jsx10("div", { className: Menu_default.label, role: "presentation", children: entry.text }, entry.id);
    }
    const hasSub = entry.submenu !== void 0 && entry.submenu.length > 0;
    const subOpen = hasSub && openSubmenuId === entry.id;
    const selected = entry.id === selectedId || selectedIds?.includes(entry.id) === true;
    return /* @__PURE__ */ jsxs8(
      "div",
      {
        className: Menu_default.itemWrap,
        onMouseEnter: hasSub ? () => {
          setOpenSubmenuId(entry.id);
        } : void 0,
        onMouseLeave: () => {
          setOpenSubmenuId(null);
        },
        children: [
          /* @__PURE__ */ jsxs8(
            "button",
            {
              type: "button",
              role: "menuitem",
              className: clsx5(Menu_default.item, selected && (selection === "fill" ? Menu_default.selectedFill : Menu_default.selected), entry.danger === true && Menu_default.danger),
              disabled: entry.disabled,
              "aria-keyshortcuts": entry.shortcut?.aria,
              "aria-haspopup": hasSub ? "menu" : void 0,
              "aria-expanded": hasSub ? subOpen : void 0,
              onFocus: hasSub ? () => {
                setOpenSubmenuId(entry.id);
              } : void 0,
              onClick: () => {
                if (hasSub) {
                  setOpenSubmenuId(entry.id);
                  return;
                }
                onSelect?.(entry.id);
              },
              children: [
                entry.icon !== void 0 && /* @__PURE__ */ jsx10("span", { className: Menu_default.itemIcon, children: entry.icon }),
                /* @__PURE__ */ jsx10("span", { className: Menu_default.itemLabel, children: entry.label }),
                entry.shortcut !== void 0 && /* @__PURE__ */ jsx10("span", { "aria-hidden": "true", className: Menu_default.shortcut, children: /* @__PURE__ */ jsx10(ShortcutKeys, { keys: entry.shortcut.keys, className: Menu_default.shortcutKeys }) }),
                selected && selection === "check" && /* @__PURE__ */ jsx10(IconCheckOutlineRegular, { className: Menu_default.check })
              ]
            }
          ),
          subOpen && entry.submenu !== void 0 && /* @__PURE__ */ jsx10(MenuSurface, { compact, className: clsx5(Menu_default.submenu, compact && Menu_default.compactList), role: "menu", children: entry.submenu.map((sub) => /* @__PURE__ */ jsxs8(
            "button",
            {
              type: "button",
              role: "menuitem",
              className: Menu_default.item,
              disabled: sub.disabled,
              "aria-keyshortcuts": sub.shortcut?.aria,
              onClick: () => {
                onSelect?.(sub.id);
                refocusAfterSelection();
              },
              children: [
                sub.icon !== void 0 && /* @__PURE__ */ jsx10("span", { className: Menu_default.itemIcon, children: sub.icon }),
                /* @__PURE__ */ jsx10("span", { className: Menu_default.itemLabel, children: sub.label }),
                sub.shortcut !== void 0 && /* @__PURE__ */ jsx10("span", { "aria-hidden": "true", className: Menu_default.shortcut, children: /* @__PURE__ */ jsx10(ShortcutKeys, { keys: sub.shortcut.keys, className: Menu_default.shortcutKeys }) })
              ]
            },
            sub.id
          )) })
        ]
      },
      entry.id
    );
  };
  const collapseSubmenuFrom = (e) => {
    const row = e.target instanceof Element ? e.target.closest('button[role="menuitem"]') : null;
    if (row === null || row.getAttribute("aria-haspopup") === "menu") return;
    if (row.closest('[role="menu"]') !== e.currentTarget) return;
    setOpenSubmenuId(null);
  };
  const list = open && /* @__PURE__ */ jsxs8(
    MenuSurface,
    {
      compact,
      ref: listRef,
      className: clsx5(Menu_default.list, listClassName, dense && Menu_default.denseList, compact && Menu_default.compactList, scrollable && Menu_default.scrollable, portal && Menu_default.portal, side === "top" && !portal && Menu_default.sideTop, align === "end" && !portal && Menu_default.alignEnd),
      style: portal ? fixedPos ?? MEASURE_STYLE : void 0,
      role: "menu",
      onClick: (e) => {
        e.stopPropagation();
        const row = e.target instanceof Element ? e.target.closest('button[role="menuitem"]') : null;
        if (row !== null && row.getAttribute("aria-haspopup") !== "menu") refocusAfterSelection();
      },
      onMouseOver: collapseSubmenuFrom,
      onFocus: collapseSubmenuFrom,
      children: [
        /* @__PURE__ */ jsxs8("div", { className: Menu_default.viewport, role: "presentation", children: [
          items.map(renderEntry),
          children
        ] }),
        footer !== void 0 && footer.length > 0 && /* @__PURE__ */ jsx10("div", { className: Menu_default.footer, role: "presentation", children: footer.map(renderEntry) })
      ]
    }
  );
  return /* @__PURE__ */ jsxs8(
    "span",
    {
      ref: rootRef,
      className: clsx5(Menu_default.root, className),
      onPointerEnter: closeOnPointerLeave ? cancelClose : void 0,
      onPointerLeave: closeOnPointerLeave ? () => {
        if (open) armClose();
      } : void 0,
      children: [
        anchor,
        portal ? list !== false && createPortal3(list, document.body) : list
      ]
    }
  );
}

// packages/client/ui-primitives/src/JsonTree.module.css
var JsonTree_default = {
  root: "JsonTree_root",
  container: "JsonTree_container",
  expandedTopLevel: "JsonTree_expandedTopLevel",
  topLevelBracket: "JsonTree_topLevelBracket",
  expandedTopLevelContainer: "JsonTree_expandedTopLevelContainer",
  row: "JsonTree_row",
  children: "JsonTree_children",
  expander: "JsonTree_expander",
  copySlot: "JsonTree_copySlot",
  label: "JsonTree_label",
  clickableLabel: "JsonTree_clickableLabel",
  stringValue: "JsonTree_stringValue",
  stringField: "JsonTree_stringField",
  stringText: "JsonTree_stringText",
  stringRaw: "JsonTree_stringRaw",
  stringActions: "JsonTree_stringActions",
  stringToggleSlot: "JsonTree_stringToggleSlot",
  stringToggle: "JsonTree_stringToggle",
  summary: "JsonTree_summary",
  numberValue: "JsonTree_numberValue",
  keywordValue: "JsonTree_keywordValue",
  otherValue: "JsonTree_otherValue",
  punctuation: "JsonTree_punctuation",
  preview: "JsonTree_preview",
  previewProperty: "JsonTree_previewProperty",
  previewEllipsis: "JsonTree_previewEllipsis",
  actionButton: "JsonTree_actionButton",
  collapseIcon: "JsonTree_collapseIcon",
  collapsedContent: "JsonTree_collapsedContent"
};

// packages/client/ui-primitives/src/JsonTree.tsx
import { Fragment as Fragment3, jsx as jsx11, jsxs as jsxs9 } from "react/jsx-runtime";
var OBJECT_PREVIEW_LIMIT = 4;
var ARRAY_PREVIEW_LIMIT = 5;
var PREVIEW_DEPTH_LIMIT = 2;
function valueCopyMenuItems(labels) {
  return [
    { id: "value", label: labels.copyValue },
    { id: "json", label: labels.copyJson },
    { id: "path", label: labels.copyPath }
  ];
}
function objectCopyMenuItems(labels) {
  return [
    { id: "prettyJson", label: labels.copyPrettyJson },
    { id: "json", label: labels.copyCompactJson },
    { id: "path", label: labels.copyPath }
  ];
}
function createCopyStore() {
  let current;
  const listeners2 = /* @__PURE__ */ new Map();
  return {
    get: () => current,
    set(next) {
      const previous = current?.id;
      current = next;
      for (const id of /* @__PURE__ */ new Set([previous, next?.id])) {
        if (id === void 0) continue;
        for (const listener of listeners2.get(id) ?? []) listener();
      }
    },
    subscribe(id, listener) {
      let row = listeners2.get(id);
      if (row === void 0) listeners2.set(id, row = /* @__PURE__ */ new Set());
      row.add(listener);
      return () => {
        row.delete(listener);
        if (row.size === 0) listeners2.delete(id);
      };
    }
  };
}
function JsonCopyAction({ store, target, persistent, labels, onCopy, onClose }) {
  const id = pathId(target.path);
  const subscribe = useCallback5((listener) => store.subscribe(id, listener), [id, store]);
  const getSnapshot = () => {
    const current = store.get();
    return current?.id === id ? current : void 0;
  };
  const snapshot = useSyncExternalStore2(subscribe, getSnapshot, getSnapshot);
  const buttonRef = useRef7(null);
  const state = snapshot?.state ?? "idle";
  const object = typeof target.value === "object" && target.value !== null;
  const copyTitle = state === "copied" ? labels.copied : state === "failed" ? labels.copyFailed : object ? labels.copyPrettyJson : labels.copyValue;
  return /* @__PURE__ */ jsx11("span", { className: JsonTree_default.copySlot, children: (persistent || snapshot !== void 0) && /* @__PURE__ */ jsx11(
    Menu,
    {
      open: snapshot?.menuOpen === true,
      compact: true,
      portal: true,
      align: "end",
      anchor: /* @__PURE__ */ jsx11(
        "button",
        {
          ref: buttonRef,
          type: "button",
          className: JsonTree_default.actionButton,
          "data-json-copy-button": true,
          "data-state": state,
          "aria-label": copyTitle,
          title: labels.copyButtonTitle(copyTitle),
          onClick: () => void onCopy(target, object ? "prettyJson" : "value"),
          onContextMenu: (event) => {
            event.preventDefault();
            event.stopPropagation();
            store.set({ id, target, state, menuOpen: true });
          },
          children: state === "copied" ? /* @__PURE__ */ jsx11(IconCheckOutlineRegular, { size: 12 }) : /* @__PURE__ */ jsx11(IconCopyOutlineRegular, { size: 12 })
        }
      ),
      items: object ? objectCopyMenuItems(labels) : valueCopyMenuItems(labels),
      onSelect: (mode) => {
        void onCopy(target, mode);
      },
      onClose,
      getAnchorRect: () => buttonRef.current.getBoundingClientRect()
    }
  ) });
}
function isExpandableValue(value) {
  return typeof value === "object" && value !== null && !(value instanceof Date);
}
function entriesOf(value) {
  if (Array.isArray(value)) {
    return value.map((item, index) => [String(index), item]);
  }
  return Object.keys(value).map((key) => [
    key,
    value[key]
  ]);
}
function bracketOf(value) {
  return Array.isArray(value) ? ["[", "]"] : ["{", "}"];
}
function previewPrimitive(value) {
  if (value === null) return /* @__PURE__ */ jsx11("span", { className: JsonTree_default.keywordValue, children: "null" });
  if (typeof value === "string") {
    return /* @__PURE__ */ jsx11("span", { className: JsonTree_default.stringValue, children: JSON.stringify(value) });
  }
  if (typeof value === "number") {
    return /* @__PURE__ */ jsx11("span", { className: JsonTree_default.numberValue, children: String(value) });
  }
  if (typeof value === "boolean") {
    return /* @__PURE__ */ jsx11("span", { className: JsonTree_default.keywordValue, children: String(value) });
  }
  if (typeof value === "bigint") {
    return /* @__PURE__ */ jsx11("span", { className: JsonTree_default.otherValue, children: value.toString() });
  }
  if (typeof value === "undefined") {
    return /* @__PURE__ */ jsx11("span", { className: JsonTree_default.otherValue, children: "undefined" });
  }
  if (typeof value === "symbol") {
    return /* @__PURE__ */ jsx11("span", { className: JsonTree_default.otherValue, children: value.description ?? "Symbol" });
  }
  if (typeof value === "function") {
    return /* @__PURE__ */ jsx11("span", { className: JsonTree_default.otherValue, children: value.name || "Function" });
  }
  return null;
}
function previewValue(value, depth) {
  if (!isExpandableValue(value)) return previewPrimitive(value);
  const array = Array.isArray(value);
  const entries = entriesOf(value);
  const limit = array ? ARRAY_PREVIEW_LIMIT : OBJECT_PREVIEW_LIMIT;
  const visible = entries.slice(0, limit);
  const [open, close] = bracketOf(value);
  return /* @__PURE__ */ jsxs9(Fragment3, { children: [
    /* @__PURE__ */ jsx11("span", { className: JsonTree_default.punctuation, children: open }),
    depth >= PREVIEW_DEPTH_LIMIT ? /* @__PURE__ */ jsx11("span", { className: JsonTree_default.previewEllipsis, children: "\u2026" }) : visible.map(([key, item], index) => /* @__PURE__ */ jsxs9("span", { children: [
      index > 0 && /* @__PURE__ */ jsx11("span", { className: JsonTree_default.punctuation, children: ", " }),
      !array && /* @__PURE__ */ jsxs9(Fragment3, { children: [
        /* @__PURE__ */ jsx11("span", { className: JsonTree_default.previewProperty, children: key }),
        /* @__PURE__ */ jsx11("span", { className: JsonTree_default.punctuation, children: ": " })
      ] }),
      previewValue(item, depth + 1)
    ] }, key)),
    depth < PREVIEW_DEPTH_LIMIT && entries.length > limit && /* @__PURE__ */ jsx11("span", { className: JsonTree_default.previewEllipsis, children: ", \u2026" }),
    /* @__PURE__ */ jsx11("span", { className: JsonTree_default.punctuation, children: close })
  ] });
}
function primitiveValue(value) {
  if (value === null) return /* @__PURE__ */ jsx11("span", { className: JsonTree_default.keywordValue, children: "null" });
  if (typeof value === "string") {
    return /* @__PURE__ */ jsx11("span", { className: JsonTree_default.stringValue, children: JSON.stringify(value) });
  }
  if (typeof value === "boolean") {
    return /* @__PURE__ */ jsx11("span", { className: JsonTree_default.keywordValue, children: String(value) });
  }
  if (typeof value === "number") {
    return /* @__PURE__ */ jsx11("span", { className: JsonTree_default.numberValue, children: String(value) });
  }
  if (typeof value === "bigint") {
    return /* @__PURE__ */ jsx11("span", { className: JsonTree_default.numberValue, children: `${value.toString()}n` });
  }
  if (value instanceof Date) {
    return /* @__PURE__ */ jsx11("span", { className: JsonTree_default.otherValue, children: value.toISOString() });
  }
  if (typeof value === "function") {
    return /* @__PURE__ */ jsxs9("span", { className: JsonTree_default.otherValue, children: [
      "function() ",
      "{ }"
    ] });
  }
  if (typeof value === "undefined") {
    return /* @__PURE__ */ jsx11("span", { className: JsonTree_default.otherValue, children: "undefined" });
  }
  return /* @__PURE__ */ jsx11("span", { className: JsonTree_default.otherValue, children: value.toString() });
}
function fieldText(field) {
  return field === "" ? '""' : field;
}
function pathId(path) {
  return path.map((part) => typeof part === "number" ? `n${String(part)}` : `s${String(part.length)}:${part}`).join("/");
}
function claimFocus(button) {
  button.focus();
}
function moveFocus(button, direction) {
  const tree = button.closest('[role="tree"]');
  if (tree === null) return;
  const expanders = Array.from(tree.querySelectorAll("[data-json-expander]"));
  const current = expanders.indexOf(button);
  if (current < 0 || expanders.length === 0) return;
  const next = (current + direction + expanders.length) % expanders.length;
  const nextExpander = expanders[next];
  if (nextExpander !== void 0) claimFocus(nextExpander);
}
function NodeField({
  field,
  expandable,
  onToggle
}) {
  if (field === void 0) return null;
  return /* @__PURE__ */ jsxs9(
    "span",
    {
      className: clsx6(JsonTree_default.label, expandable && JsonTree_default.clickableLabel),
      onClick: expandable ? onToggle : void 0,
      children: [
        fieldText(field),
        ":"
      ]
    }
  );
}
function JsonString({
  collapsedStringLines,
  stringWrapping,
  field,
  labels,
  lastElement,
  renderCopy,
  value
}) {
  const contentsId = useId5();
  const contentRef = useRef7(null);
  const rawRef = useRef7(null);
  const [expanded, setExpanded] = useState5(false);
  const [wrapped, setWrapped] = useState5(false);
  const [truncated, setTruncated] = useState5(false);
  useLayoutEffect4(() => {
    if (expanded) return;
    const content = contentRef.current;
    const measure = () => {
      const lineHeight = Number.parseFloat(getComputedStyle(content).lineHeight);
      setTruncated(content.scrollHeight > lineHeight * collapsedStringLines);
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(content);
    return () => {
      observer.disconnect();
    };
  }, [collapsedStringLines, expanded, field, lastElement, value]);
  useLayoutEffect4(() => {
    if (!expanded) return;
    const raw = rawRef.current;
    const clips = [];
    const tree = raw.closest(`.${JsonTree_default.root}`);
    for (let parent = tree.parentElement; parent !== null; parent = parent.parentElement) {
      if (/auto|scroll|hidden|clip/.test(getComputedStyle(parent).overflowY)) clips.push(parent);
    }
    const measure = () => {
      let top = 0;
      let bottom = window.innerHeight;
      for (const clip of clips) {
        const rect = clip.getBoundingClientRect();
        const style = getComputedStyle(clip);
        top = Math.max(top, rect.top + clip.clientTop);
        bottom = Math.min(bottom, rect.top + clip.clientTop + clip.clientHeight - Number.parseFloat(style.paddingBottom));
      }
      const available = bottom - Math.max(top, raw.getBoundingClientRect().top);
      raw.style.maxHeight = `${Math.max(16, available - 4)}px`;
    };
    measure();
    const observer = typeof ResizeObserver === "undefined" ? void 0 : new ResizeObserver(measure);
    observer?.observe(raw);
    for (const clip of clips) observer?.observe(clip);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [expanded, value]);
  if (expanded) {
    const fieldId = `${contentsId}-field`;
    return /* @__PURE__ */ jsxs9("div", { className: JsonTree_default.stringField, "data-expanded": true, children: [
      field !== void 0 && /* @__PURE__ */ jsxs9("span", { id: fieldId, className: JsonTree_default.label, children: [
        fieldText(field),
        ":"
      ] }),
      /* @__PURE__ */ jsx11(
        "pre",
        {
          ref: rawRef,
          id: contentsId,
          className: JsonTree_default.stringRaw,
          "data-wrap": wrapped,
          tabIndex: 0,
          "aria-labelledby": field === void 0 ? void 0 : fieldId,
          children: value
        }
      ),
      !lastElement && /* @__PURE__ */ jsx11("span", { className: JsonTree_default.punctuation, children: "," }),
      /* @__PURE__ */ jsxs9("div", { className: JsonTree_default.stringActions, children: [
        stringWrapping !== void 0 && /* @__PURE__ */ jsx11(
          "button",
          {
            type: "button",
            className: JsonTree_default.actionButton,
            "aria-label": stringWrapping.label,
            title: stringWrapping.label,
            "aria-pressed": wrapped,
            "aria-controls": contentsId,
            onClick: () => {
              const next = !wrapped;
              setWrapped(next);
              stringWrapping.setDefault(next);
            },
            children: /* @__PURE__ */ jsx11(IconWrapLinesOutlineRegular, { size: 12 })
          }
        ),
        /* @__PURE__ */ jsx11(
          "button",
          {
            type: "button",
            className: JsonTree_default.actionButton,
            "aria-label": labels.collapseNode,
            title: labels.collapseNode,
            "aria-expanded": true,
            "aria-controls": contentsId,
            onClick: () => {
              setExpanded(false);
            },
            children: /* @__PURE__ */ jsx11(
              "svg",
              {
                width: "12",
                height: "12",
                viewBox: "0 0 16 16",
                fill: "none",
                stroke: "currentColor",
                "aria-hidden": "true",
                children: /* @__PURE__ */ jsx11("path", { d: "M9.5 1.5V6.5H14.5M1.5 9.5H6.5V14.5" })
              }
            )
          }
        ),
        renderCopy?.(true)
      ] })
    ] });
  }
  return /* @__PURE__ */ jsxs9(Fragment3, { children: [
    renderCopy?.(),
    /* @__PURE__ */ jsx11("span", { className: JsonTree_default.stringField, "data-expanded": expanded, children: /* @__PURE__ */ jsxs9("span", { ref: contentRef, id: contentsId, className: JsonTree_default.stringText, children: [
      truncated && /* @__PURE__ */ jsx11("span", { className: JsonTree_default.stringToggleSlot, children: /* @__PURE__ */ jsxs9(
        "button",
        {
          type: "button",
          className: JsonTree_default.stringToggle,
          "aria-label": labels.expandNode,
          "aria-expanded": false,
          "aria-controls": contentsId,
          onClick: () => {
            setWrapped(stringWrapping?.getDefault() ?? false);
            setExpanded(true);
          },
          children: [
            /* @__PURE__ */ jsx11("span", { "aria-hidden": "true", children: "\u2026" }),
            labels.expandNode
          ]
        }
      ) }),
      field !== void 0 && /* @__PURE__ */ jsxs9("span", { className: JsonTree_default.label, children: [
        fieldText(field),
        ":"
      ] }),
      primitiveValue(value),
      !lastElement && /* @__PURE__ */ jsx11("span", { className: JsonTree_default.punctuation, children: "," })
    ] }) })
  ] });
}
function JsonTreeNode({
  collapsedStringLines,
  stringWrapping,
  field,
  initialExpanded,
  labels,
  lastElement,
  onClaimTabStop,
  onRowHover,
  path,
  renderCopy,
  tabStopId,
  value
}) {
  const contentsId = useId5();
  const expanderRef = useRef7(null);
  const [expanded, setExpanded] = useState5(initialExpanded);
  const nodeId = pathId(path);
  const container = isExpandableValue(value);
  const entries = container ? entriesOf(value) : [];
  const expandable = entries.length > 0;
  const toggle = () => {
    setExpanded((current) => !current);
    claimFocus(expanderRef.current);
  };
  const onExpanderKeyDown = (event) => {
    if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
      event.preventDefault();
      setExpanded(event.key === "ArrowRight");
      return;
    }
    if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      event.preventDefault();
      moveFocus(event.currentTarget, event.key === "ArrowUp" ? -1 : 1);
    }
  };
  const row = (children, ariaExpanded) => /* @__PURE__ */ jsxs9(
    "div",
    {
      className: JsonTree_default.row,
      role: "treeitem",
      "aria-expanded": ariaExpanded,
      onMouseOver: (event) => {
        event.stopPropagation();
        onRowHover(event.currentTarget, { path, value });
      },
      children: [
        typeof value !== "string" && renderCopy?.({ path, value }),
        children
      ]
    }
  );
  if (typeof value === "string") {
    return row(
      /* @__PURE__ */ jsx11(
        JsonString,
        {
          collapsedStringLines,
          stringWrapping,
          field,
          value,
          labels,
          lastElement,
          renderCopy: renderCopy === void 0 ? void 0 : (persistent) => renderCopy({ path, value }, persistent)
        }
      )
    );
  }
  if (!container) {
    return row(/* @__PURE__ */ jsxs9(Fragment3, { children: [
      /* @__PURE__ */ jsx11(NodeField, { field, expandable: false, onToggle: toggle }),
      primitiveValue(value),
      !lastElement && /* @__PURE__ */ jsx11("span", { className: JsonTree_default.punctuation, children: "," })
    ] }));
  }
  const [open, close] = bracketOf(value);
  if (!expandable) {
    return row(/* @__PURE__ */ jsxs9(Fragment3, { children: [
      /* @__PURE__ */ jsx11(NodeField, { field, expandable: false, onToggle: toggle }),
      /* @__PURE__ */ jsx11("span", { className: JsonTree_default.punctuation, children: open }),
      /* @__PURE__ */ jsx11("span", { className: JsonTree_default.punctuation, children: close }),
      !lastElement && /* @__PURE__ */ jsx11("span", { className: JsonTree_default.punctuation, children: "," })
    ] }));
  }
  return row(/* @__PURE__ */ jsxs9(Fragment3, { children: [
    /* @__PURE__ */ jsx11(
      "span",
      {
        ref: expanderRef,
        className: clsx6(JsonTree_default.expander, expanded ? JsonTree_default.collapseIcon : JsonTree_default.expandIcon),
        "data-json-expander": true,
        role: "button",
        "aria-label": expanded ? labels.collapseNode : labels.expandNode,
        "aria-expanded": expanded,
        "aria-controls": expanded ? contentsId : void 0,
        tabIndex: tabStopId === nodeId ? 0 : -1,
        onFocus: () => {
          onClaimTabStop(nodeId);
        },
        onClick: toggle,
        onKeyDown: onExpanderKeyDown
      }
    ),
    /* @__PURE__ */ jsxs9("span", { className: JsonTree_default.summary, children: [
      /* @__PURE__ */ jsx11(NodeField, { field, expandable: true, onToggle: toggle }),
      /* @__PURE__ */ jsx11("span", { className: JsonTree_default.preview, children: previewValue(value, 0) }),
      !lastElement && /* @__PURE__ */ jsx11("span", { className: JsonTree_default.punctuation, children: "," })
    ] }),
    expanded && /* @__PURE__ */ jsx11("ul", { id: contentsId, role: "group", className: JsonTree_default.children, children: entries.map(([key, item], index) => /* @__PURE__ */ jsx11(
      JsonTreeNode,
      {
        collapsedStringLines,
        stringWrapping,
        field: key,
        value: item,
        path: [...path, Array.isArray(value) ? index : key],
        labels,
        lastElement: index === entries.length - 1,
        initialExpanded: false,
        tabStopId,
        onClaimTabStop,
        onRowHover,
        renderCopy
      },
      key
    )) })
  ] }), expanded);
}
function formattedPath(path) {
  return path.reduce((result, part) => {
    if (typeof part === "number") return `${result}[${String(part)}]`;
    return /^[A-Za-z_$][\w$]*$/.test(part) ? `${result}.${part}` : `${result}[${JSON.stringify(part)}]`;
  }, "$");
}
function copyText(target, mode) {
  if (mode === "path") return formattedPath(target.path);
  if (mode === "prettyJson") return JSON.stringify(target.value, null, 2);
  if (mode === "json") return JSON.stringify(target.value);
  if (typeof target.value === "string") return target.value;
  if (typeof target.value === "undefined") return "undefined";
  if (typeof target.value === "bigint") return target.value.toString();
  if (typeof target.value === "symbol") return target.value.description ?? "Symbol";
  if (typeof target.value === "function") return target.value.name || "Function";
  return JSON.stringify(target.value);
}
function JsonTree({
  data,
  label,
  className,
  collapsedStringLines = 3,
  stringWrapping,
  copyable = true,
  expandTopLevel = true,
  labels
}) {
  const rootEntries = entriesOf(data);
  const firstExpandableIndex = rootEntries.findIndex(([, value]) => isExpandableValue(value) && entriesOf(value).length > 0);
  const firstExpandableEntry = rootEntries[firstExpandableIndex];
  const initialTabStopId = expandTopLevel ? firstExpandableEntry === void 0 ? null : pathId([Array.isArray(data) ? firstExpandableIndex : firstExpandableEntry[0]]) : isExpandableValue(data) && rootEntries.length > 0 ? pathId([]) : null;
  const activeRowRef = useRef7();
  const resetTimer = useRef7();
  const copySequence = useRef7(0);
  const [copyStore] = useState5(createCopyStore);
  const [tabStopId, setTabStopId] = useState5(initialTabStopId);
  const setActiveRow = (row) => {
    activeRowRef.current?.removeAttribute("data-json-copy-active");
    activeRowRef.current = row;
    row?.setAttribute("data-json-copy-active", "");
  };
  const clearCopyTarget = () => {
    copySequence.current += 1;
    if (resetTimer.current !== void 0) clearTimeout(resetTimer.current);
    setActiveRow(void 0);
    copyStore.set(void 0);
  };
  useEffect6(() => () => {
    copySequence.current += 1;
    if (resetTimer.current !== void 0) clearTimeout(resetTimer.current);
    activeRowRef.current?.removeAttribute("data-json-copy-active");
  }, []);
  useEffect6(() => {
    clearCopyTarget();
    setTabStopId(initialTabStopId);
  }, [data, expandTopLevel, initialTabStopId]);
  const handleRowHover = (row, target) => {
    if (!copyable || copyStore.get()?.menuOpen) return;
    if (activeRowRef.current === row) return;
    setActiveRow(row);
    copyStore.set({ id: pathId(target.path), target, state: "idle", menuOpen: false });
  };
  const handleRootMouseOver = (event) => {
    if (!copyable || copyStore.get()?.menuOpen) return;
    if (!(event.target instanceof Element)) return;
    if (event.target.closest("[data-json-copy-button]") === null) clearCopyTarget();
  };
  const copy = async (target, mode) => {
    const sequence = ++copySequence.current;
    const snapshot = {
      id: pathId(target.path),
      target,
      state: "idle",
      menuOpen: false
    };
    copyStore.set(snapshot);
    let state;
    try {
      await navigator.clipboard.writeText(copyText(target, mode));
      state = "copied";
    } catch {
      state = "failed";
    }
    const current = copyStore.get();
    if (sequence !== copySequence.current || current?.target !== target) return;
    copyStore.set({ ...current, state });
    if (resetTimer.current !== void 0) clearTimeout(resetTimer.current);
    resetTimer.current = setTimeout(() => {
      const current2 = copyStore.get();
      if (current2?.target === target) copyStore.set({ ...current2, state: "idle" });
    }, 1500);
  };
  const [rootOpen, rootClose] = bracketOf(data);
  const renderCopy = copyable ? (target, persistent = false) => /* @__PURE__ */ jsx11(
    JsonCopyAction,
    {
      store: copyStore,
      target,
      persistent,
      labels,
      onCopy: copy,
      onClose: clearCopyTarget
    }
  ) : void 0;
  return /* @__PURE__ */ jsx11(
    "div",
    {
      className: clsx6(JsonTree_default.root, className),
      style: { "--json-tree-collapsed-lines": collapsedStringLines },
      onMouseOver: handleRootMouseOver,
      onMouseLeave: () => {
        if (!copyStore.get()?.menuOpen) clearCopyTarget();
      },
      children: expandTopLevel ? /* @__PURE__ */ jsxs9("div", { className: JsonTree_default.expandedTopLevel, children: [
        /* @__PURE__ */ jsxs9(
          "div",
          {
            className: clsx6(JsonTree_default.row, JsonTree_default.topLevelBracket),
            "data-json-root-row": true,
            onMouseOver: (event) => {
              event.stopPropagation();
              handleRowHover(event.currentTarget, { path: [], value: data });
            },
            children: [
              renderCopy?.({ path: [], value: data }),
              /* @__PURE__ */ jsx11("span", { className: JsonTree_default.punctuation, children: rootOpen })
            ]
          }
        ),
        /* @__PURE__ */ jsx11(
          "div",
          {
            "aria-label": label,
            className: clsx6(JsonTree_default.container, JsonTree_default.expandedTopLevelContainer),
            role: "tree",
            children: rootEntries.map(([key, value], index) => /* @__PURE__ */ jsx11(
              JsonTreeNode,
              {
                collapsedStringLines,
                stringWrapping,
                field: key,
                value,
                path: [Array.isArray(data) ? index : key],
                labels,
                lastElement: index === rootEntries.length - 1,
                initialExpanded: false,
                tabStopId,
                onClaimTabStop: setTabStopId,
                onRowHover: handleRowHover,
                renderCopy
              },
              key
            ))
          }
        ),
        /* @__PURE__ */ jsx11("div", { className: clsx6(JsonTree_default.row, JsonTree_default.topLevelBracket), children: /* @__PURE__ */ jsx11("span", { className: JsonTree_default.punctuation, children: rootClose }) })
      ] }) : /* @__PURE__ */ jsx11("div", { "aria-label": label, className: JsonTree_default.container, role: "tree", children: /* @__PURE__ */ jsx11(
        JsonTreeNode,
        {
          collapsedStringLines,
          stringWrapping,
          value: data,
          path: [],
          labels,
          lastElement: true,
          initialExpanded: true,
          tabStopId,
          onClaimTabStop: setTabStopId,
          onRowHover: handleRowHover,
          renderCopy
        }
      ) })
    }
  );
}

// packages/client/ui-primitives/src/markdown/MarkdownText.tsx
import { memo, useMemo as useMemo3, useRef as useRef10 } from "react";
import clsx9 from "clsx";

// packages/client/ui-primitives/src/markdown/incremental.ts
var UNSTABLE_TAIL_BLOCKS = 2;
function blockKey(node, base, index) {
  const offset = node.position?.start.offset;
  return offset === void 0 ? -(index + 1) : base + offset;
}
function lineTerminatorEnd(text, start) {
  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (char === "\n") return index + 1;
    if (char === "\r") return text[index + 1] === "\n" ? index + 2 : index + 1;
  }
  return void 0;
}
function committableLinePrefixLength(text) {
  let previousEnd = 0;
  let end = 0;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === "\n") {
      previousEnd = end;
      end = index + 1;
      continue;
    }
    if (char !== "\r" || index + 1 >= text.length) continue;
    if (text[index + 1] === "\n") index += 1;
    previousEnd = end;
    end = index + 1;
  }
  return previousEnd;
}
function trailingLineTerminator(text) {
  return text.endsWith("\r\n") ? "\r\n" : text.endsWith("\r") ? "\r" : "\n";
}
function containsClosingFence(text, marker, markerLength) {
  let start = 0;
  while (start <= text.length) {
    let end = start;
    while (end < text.length && text[end] !== "\n" && text[end] !== "\r") end += 1;
    const line = text.slice(start, end);
    let indent = 0;
    while (indent < 3 && line[indent] === " ") indent += 1;
    let run = indent;
    while (line[run] === marker) run += 1;
    if (run - indent >= markerLength && /^[ \t]*$/.test(line.slice(run))) return true;
    if (end === text.length) return false;
    start = text[end] === "\r" && text[end + 1] === "\n" ? end + 2 : end + 1;
  }
  return false;
}
function advancePoint(point, appended, precededByCarriageReturn) {
  let line = point.line;
  let column = point.column;
  let afterCarriageReturn = precededByCarriageReturn;
  for (const char of appended) {
    if (char === "\n") {
      if (!afterCarriageReturn) line += 1;
      column = 1;
      afterCarriageReturn = false;
      continue;
    }
    if (char === "\r") {
      line += 1;
      column = 1;
      afterCarriageReturn = true;
      continue;
    }
    column += 1;
    afterCarriageReturn = false;
  }
  return { line, column, offset: point.offset + appended.length };
}
var IncrementalMarkdownParser = class {
  /** @param parse - Grammar shared with whatever renders the blocks, so boundaries agree. */
  constructor(parse) {
    this.parse = parse;
  }
  prevText = "";
  tailStart = 0;
  frozen = [];
  generation = 0;
  cached = null;
  openFence = null;
  /** Parse one unclosed-fence content slice through the caller's grammar. */
  fenceValue(state, text) {
    const root = this.parse(`${state.syntheticPrefix}${text}`);
    if (root.children.length !== 1) return void 0;
    const node = root.children[0];
    return node.type === "code" ? node.value : void 0;
  }
  /** Recognize the parsed tail's final unclosed fence and prepare its incremental content frontier. */
  openFenceState(text, base, tail, frozen) {
    const codeIndex = tail.length - 1;
    const block = tail[codeIndex];
    if (block?.node.type !== "code") return null;
    const node = block.node;
    const startOffset = node.position?.start.offset;
    const end = node.position?.end;
    if (startOffset === void 0 || end?.offset === void 0) return null;
    if (base + end.offset !== text.length) return null;
    const source = text.slice(base);
    const previousLf = source.lastIndexOf("\n", startOffset - 1);
    const previousCr = source.lastIndexOf("\r", startOffset - 1);
    const lineStart = Math.max(previousLf, previousCr) + 1;
    const terminatorEnd = lineTerminatorEnd(source, startOffset);
    if (terminatorEnd === void 0) return null;
    if (terminatorEnd === source.length && source.endsWith("\r")) return null;
    const openingLine = source.slice(lineStart, terminatorEnd).replace(/[\r\n]+$/, "");
    const opening = /^( {0,3})(`{3,}|~{3,})/.exec(openingLine);
    if (opening === null) return null;
    const indent = opening[1];
    const run = opening[2];
    if (lineStart + indent.length !== startOffset) return null;
    const marker = run[0];
    const contentStart = base + terminatorEnd;
    const content = text.slice(contentStart);
    if (containsClosingFence(content, marker, run.length)) return null;
    const syntheticPrefix = `${indent}${run}
`;
    const stableLength = committableLinePrefixLength(content);
    const stableValue = stableLength === 0 ? "" : this.fenceValue({ syntheticPrefix }, content.slice(0, stableLength));
    if (stableValue === void 0) return null;
    const pendingStart = contentStart + stableLength;
    const stableSource = content.slice(0, stableLength);
    const valuePrefix = stableLength === 0 ? "" : `${stableValue}${trailingLineTerminator(stableSource)}`;
    const pendingValue = this.fenceValue({ syntheticPrefix }, text.slice(pendingStart));
    if (pendingValue === void 0 || `${valuePrefix}${pendingValue}` !== node.value) return null;
    return {
      marker,
      markerLength: run.length,
      syntheticPrefix,
      codeIndex,
      frozen,
      tail,
      pendingStart,
      valuePrefix,
      end: { line: end.line, column: end.column, offset: end.offset },
      endedWithCarriageReturn: text.endsWith("\r")
    };
  }
  /** Extend a recognized unclosed fence without parsing its completed content prefix again. */
  updateOpenFence(state, text, previousText) {
    const pending = text.slice(state.pendingStart);
    if (containsClosingFence(pending, state.marker, state.markerLength)) return void 0;
    const pendingValue = this.fenceValue(state, pending);
    if (pendingValue === void 0) return void 0;
    const stableLength = committableLinePrefixLength(pending);
    const stableValue = stableLength === 0 ? "" : this.fenceValue(state, pending.slice(0, stableLength));
    if (stableValue === void 0) return void 0;
    const block = state.tail[state.codeIndex];
    const previousNode = block.node;
    const end = advancePoint(
      state.end,
      text.slice(previousText.length),
      state.endedWithCarriageReturn
    );
    const node = {
      ...previousNode,
      value: `${state.valuePrefix}${pendingValue}`,
      position: { start: previousNode.position.start, end }
    };
    const tail = state.tail.map((entry, index) => index === state.codeIndex ? { ...entry, node } : entry);
    const cached = {
      frozen: state.frozen,
      tail,
      generation: this.generation
    };
    this.openFence = {
      ...state,
      tail,
      pendingStart: state.pendingStart + stableLength,
      valuePrefix: stableLength === 0 ? state.valuePrefix : `${state.valuePrefix}${stableValue}${trailingLineTerminator(pending.slice(0, stableLength))}`,
      end,
      endedWithCarriageReturn: text.endsWith("\r")
    };
    return cached;
  }
  /**
   * Fold the current accumulated text and return the frozen/tail split.
   * Idempotent for identical input (the previous result is returned as-is),
   * so callers may invoke it from render paths that re-execute.
   * @param text - The full accumulated markdown source.
   * @returns Frozen and tail blocks with stream-stable render keys.
   */
  update(text) {
    if (this.cached !== null && text === this.prevText) return this.cached;
    if (!text.startsWith(this.prevText)) {
      this.prevText = "";
      this.tailStart = 0;
      this.frozen = [];
      this.openFence = null;
      this.generation += 1;
    }
    const previousText = this.prevText;
    if (previousText !== "" && this.openFence !== null) {
      const incremental = this.updateOpenFence(this.openFence, text, previousText);
      if (incremental !== void 0) {
        this.prevText = text;
        this.cached = incremental;
        return incremental;
      }
      this.openFence = null;
    }
    this.prevText = text;
    const base = this.tailStart;
    const blocks = this.parse(text.slice(base)).children;
    let firstUnstable = Math.max(0, blocks.length - UNSTABLE_TAIL_BLOCKS);
    if (firstUnstable > 0) {
      const cutEnd = blocks[firstUnstable - 1]?.position?.end.offset;
      if (cutEnd === void 0) {
        firstUnstable = 0;
      } else {
        for (const node of blocks.slice(0, firstUnstable)) {
          this.frozen.push({ node, key: blockKey(node, base, this.frozen.length) });
        }
        this.tailStart = base + cutEnd;
      }
    }
    const tail = blocks.slice(firstUnstable).map((node, index) => ({
      node,
      key: blockKey(node, base, index)
    }));
    this.cached = { frozen: [...this.frozen], tail, generation: this.generation };
    this.openFence = this.openFenceState(text, base, tail, this.cached.frozen);
    return this.cached;
  }
};

// packages/client/ui-primitives/src/markdown/local-image-syntax.ts
function recoverLocalImages(root, source) {
  const visit = (node) => {
    if (node.type === "paragraph" && node.children.length === 1) {
      const [child] = node.children;
      if (child.type === "text" && child.position !== void 0 && source.slice(child.position.start.offset, child.position.end.offset) === child.value) {
        const pattern = /^!\[([^\]\n]*)\]\(((?:\/(?!\/)|\.{1,2}\/|[a-z]:[\\/])[^\n<>()[\]"']+\.[a-z\d]+)\)$/iu;
        const match = pattern.exec(child.value);
        if (match !== null && match[2].includes(" ") && classifyFileType(match[2]) === "image") {
          node.children = [{ type: "image", alt: match[1], url: match[2], position: child.position }];
        }
      }
    } else if ("children" in node) {
      for (const child of node.children) visit(child);
    }
  };
  visit(root);
  return root;
}

// packages/client/ui-primitives/src/markdown/parse.ts
import { fromMarkdown } from "mdast-util-from-markdown";
import { gfmFromMarkdown } from "mdast-util-gfm";
import { mathFromMarkdown } from "mdast-util-math";
import { gfm } from "micromark-extension-gfm";
import { math } from "micromark-extension-math";

// packages/client/ui-primitives/src/markdown/cjkFriendlyStrong.ts
import { attention } from "micromark-core-commonmark";
import { unicodePunctuation } from "micromark-util-character";
import { classifyCharacter } from "micromark-util-classify-character";
import { codes, constants } from "micromark-util-symbol";
var cjkCharacter = new RegExp([
  "\\p{Script_Extensions=Han}",
  "\\p{Script_Extensions=Hiragana}",
  "\\p{Script_Extensions=Katakana}",
  "\\p{Script_Extensions=Hangul}",
  "\\p{Script_Extensions=Bopomofo}"
].join("|"), "u");
function isCjkCharacter(code) {
  return code !== null && code >= 0 && cjkCharacter.test(String.fromCodePoint(code));
}
var tokenizeCjkFriendlyAttention = function(effects, ok, nok) {
  const configuredAttentionMarkers = this.parser.constructs.attentionMarkers.null;
  if (configuredAttentionMarkers === void 0) {
    throw new Error("micromark CommonMark attention markers are unavailable");
  }
  const attentionMarkers = configuredAttentionMarkers;
  const previous = this.previous;
  const before = classifyCharacter(previous);
  let marker = codes.eof;
  return start;
  function start(code) {
    if (code !== codes.asterisk) return nok(code);
    marker = code;
    effects.enter("attentionSequence");
    return inside(code);
  }
  function inside(code) {
    if (code === marker) {
      effects.consume(code);
      return inside;
    }
    const token = effects.exit("attentionSequence");
    const after = classifyCharacter(code);
    const open = !after || after === constants.characterGroupPunctuation && Boolean(before) || attentionMarkers.includes(code);
    const commonMarkClose = !before || before === constants.characterGroupPunctuation && Boolean(after) || attentionMarkers.includes(previous);
    const markerCount = token.end.offset - token.start.offset;
    const cjkStrongClose = markerCount >= 2 && unicodePunctuation(previous) && isCjkCharacter(code);
    const close = commonMarkClose || cjkStrongClose;
    token._open = open;
    token._close = close;
    return ok(code);
  }
};
var cjkFriendlyAttention = {
  name: "cjkFriendlyAttention",
  resolveAll: attention.resolveAll,
  tokenize: tokenizeCjkFriendlyAttention
};
var cjkFriendlyStrongExtension = {
  text: { [codes.asterisk]: cjkFriendlyAttention }
};
function cjkFriendlyStrong() {
  return cjkFriendlyStrongExtension;
}

// packages/client/ui-primitives/src/markdown/mathCompatibility.ts
import { factorySpace } from "micromark-factory-space";
import { markdownLineEnding } from "micromark-util-character";
import { codes as codes2, constants as constants2, types } from "micromark-util-symbol";
var previousBackslash = function(code) {
  if (code !== codes2.backslash) return true;
  const tail = this.events.at(-1);
  if (tail === void 0) return false;
  return tail[1].type === types.characterEscape;
};
var tokenizeBackslashMathText = function(effects, ok, nok) {
  return start;
  function start(code) {
    if (code !== codes2.backslash) return nok(code);
    effects.enter("mathText");
    effects.enter("mathTextSequence");
    effects.consume(code);
    return open;
  }
  function open(code) {
    if (code !== codes2.leftParenthesis) return nok(code);
    effects.consume(code);
    effects.exit("mathTextSequence");
    return between;
  }
  function between(code) {
    if (code === codes2.eof) return nok(code);
    if (code === codes2.backslash) {
      return effects.attempt({ partial: true, tokenize: tokenizeClose }, close, afterCloseAttempt)(code);
    }
    if (markdownLineEnding(code)) {
      effects.enter(types.lineEnding);
      effects.consume(code);
      effects.exit(types.lineEnding);
      return between;
    }
    return dataStart(code);
  }
  function afterCloseAttempt(code) {
    return effects.check({ partial: true, tokenize: tokenizeOpen }, nok, dataStart)(code);
  }
  function dataStart(code) {
    effects.enter("mathTextData");
    effects.consume(code);
    return code === codes2.backslash ? afterDataBackslash : data;
  }
  function afterDataBackslash(code) {
    if (code === codes2.backslash) {
      effects.consume(code);
      return data;
    }
    return data(code);
  }
  function data(code) {
    if (code === codes2.eof || code === codes2.backslash || markdownLineEnding(code)) {
      effects.exit("mathTextData");
      return between(code);
    }
    effects.consume(code);
    return data;
  }
  function close(code) {
    effects.exit("mathText");
    return ok(code);
  }
  function tokenizeClose(closeEffects, closeOk, closeNok) {
    return slash;
    function slash(code) {
      if (code !== codes2.backslash) return closeNok(code);
      closeEffects.enter("mathTextSequence");
      closeEffects.consume(code);
      return parenthesis;
    }
    function parenthesis(code) {
      if (code !== codes2.rightParenthesis) return closeNok(code);
      closeEffects.consume(code);
      closeEffects.exit("mathTextSequence");
      return closeOk;
    }
  }
  function tokenizeOpen(openEffects, openOk, openNok) {
    return slash;
    function slash(code) {
      if (code !== codes2.backslash) return openNok(code);
      openEffects.enter(types.chunkString);
      openEffects.consume(code);
      return parenthesis;
    }
    function parenthesis(code) {
      if (code !== codes2.leftParenthesis) return openNok(code);
      openEffects.consume(code);
      openEffects.exit(types.chunkString);
      return openOk;
    }
  }
};
function createMathFlow(marker, openMarker, closeMarker, multiline) {
  const tokenize = function(effects, ok, nok) {
    const self = this;
    let oddBackslashRun = false;
    const tail = self.events.at(-1);
    const initialSize = tail?.[1].type === types.linePrefix ? tail[2].sliceSerialize(tail[1], true).length : 0;
    return start;
    function start(code) {
      if (code !== marker) return nok(code);
      effects.enter("mathFlow");
      effects.enter("mathFlowFence");
      effects.enter("mathFlowFenceSequence");
      effects.consume(code);
      return open;
    }
    function open(code) {
      if (code !== openMarker) return nok(code);
      effects.consume(code);
      effects.exit("mathFlowFenceSequence");
      effects.exit("mathFlowFence");
      return marker === codes2.dollarSign ? afterDollarOpen : content;
    }
    function afterDollarOpen(code) {
      return code === codes2.dollarSign ? nok(code) : content(code);
    }
    function content(code) {
      if (code === codes2.eof) return nok(code);
      if (code === marker && (marker !== codes2.dollarSign || !oddBackslashRun)) {
        return effects.attempt(
          { partial: true, tokenize: tokenizeClosingFence },
          closed,
          afterClosingFenceAttempt
        )(code);
      }
      if (markdownLineEnding(code)) {
        return multiline ? effects.attempt(nonLazyContinuation, afterContinuation, nok)(code) : nok(code);
      }
      return valueStart(code);
    }
    function afterClosingFenceAttempt(code) {
      return marker === codes2.backslash ? effects.check({ partial: true, tokenize: tokenizeOpeningFence }, nok, markerValueStart)(code) : markerValueStart(code);
    }
    function afterContinuation(code) {
      return effects.attempt(
        { partial: true, tokenize: tokenizeClosingFence },
        closed,
        initialSize ? factorySpace(effects, content, types.linePrefix, initialSize + 1) : content
      )(code);
    }
    function valueStart(code) {
      effects.enter("mathFlowValue");
      oddBackslashRun = code === codes2.backslash;
      effects.consume(code);
      return value;
    }
    function markerValueStart(code) {
      effects.enter("mathFlowValue");
      oddBackslashRun = false;
      effects.consume(code);
      return valueAfterMarker;
    }
    function valueAfterMarker(code) {
      if (code === marker) {
        effects.consume(code);
        return value;
      }
      return value(code);
    }
    function value(code) {
      if (code === codes2.eof || code === marker || markdownLineEnding(code)) {
        effects.exit("mathFlowValue");
        return content(code);
      }
      oddBackslashRun = code === codes2.backslash ? !oddBackslashRun : false;
      effects.consume(code);
      return value;
    }
    function closed(code) {
      effects.exit("mathFlow");
      return ok(code);
    }
    function tokenizeClosingFence(closeEffects, closeOk, closeNok) {
      return factorySpace(closeEffects, sequenceStart, types.linePrefix, constants2.tabSize);
      function sequenceStart(code) {
        if (code !== marker) return closeNok(code);
        closeEffects.enter("mathFlowFence");
        closeEffects.enter("mathFlowFenceSequence");
        closeEffects.consume(code);
        return sequenceEnd;
      }
      function sequenceEnd(code) {
        if (code !== closeMarker) return closeNok(code);
        closeEffects.consume(code);
        closeEffects.exit("mathFlowFenceSequence");
        return factorySpace(closeEffects, after, types.whitespace);
      }
      function after(code) {
        if (code !== codes2.eof && !markdownLineEnding(code)) return closeNok(code);
        closeEffects.exit("mathFlowFence");
        return closeOk(code);
      }
    }
    function tokenizeOpeningFence(openEffects, openOk, openNok) {
      return sequenceStart;
      function sequenceStart(code) {
        if (code !== marker) return openNok(code);
        openEffects.enter(types.chunkString);
        openEffects.consume(code);
        return sequenceEnd;
      }
      function sequenceEnd(code) {
        if (code !== openMarker) return openNok(code);
        openEffects.consume(code);
        openEffects.exit(types.chunkString);
        return openOk;
      }
    }
  };
  return {
    concrete: true,
    name: marker === codes2.dollarSign ? "sameLineDollarMathFlow" : "backslashMathFlow",
    tokenize
  };
}
var tokenizeNonLazyContinuation = function(effects, ok, nok) {
  const self = this;
  return start;
  function start(code) {
    if (code === codes2.eof) return ok(code);
    if (!markdownLineEnding(code)) return nok(code);
    effects.enter(types.lineEnding);
    effects.consume(code);
    effects.exit(types.lineEnding);
    return lineStart;
  }
  function lineStart(code) {
    return self.parser.lazy[self.now().line] ? nok(code) : ok(code);
  }
};
var nonLazyContinuation = {
  partial: true,
  tokenize: tokenizeNonLazyContinuation
};
var backslashMathText = {
  name: "backslashMathText",
  previous: previousBackslash,
  tokenize: tokenizeBackslashMathText
};
var backslashMathFlow = createMathFlow(
  codes2.backslash,
  codes2.leftSquareBracket,
  codes2.rightSquareBracket,
  true
);
var sameLineDollarMathFlow = createMathFlow(
  codes2.dollarSign,
  codes2.dollarSign,
  codes2.dollarSign,
  false
);
var backslashMath = {
  flow: {
    [codes2.backslash]: backslashMathFlow,
    [codes2.dollarSign]: sameLineDollarMathFlow
  },
  text: { [codes2.backslash]: backslashMathText }
};
function mathCompatibility() {
  return backslashMath;
}

// packages/client/ui-primitives/src/markdown/parse.ts
function parseGfm(text) {
  return recoverLocalImages(fromMarkdown(text, {
    extensions: [gfm(), cjkFriendlyStrong()],
    mdastExtensions: [gfmFromMarkdown()]
  }), text);
}
function parseGfmWithMath(text) {
  return recoverLocalImages(fromMarkdown(text, {
    extensions: [gfm(), cjkFriendlyStrong(), mathCompatibility(), math()],
    mdastExtensions: [gfmFromMarkdown(), mathFromMarkdown()]
  }), text);
}

// packages/client/ui-primitives/src/markdown/render.tsx
import { Fragment as Fragment4, createElement as createElement2, useCallback as useCallback7, useState as useState9 } from "react";
import clsx8 from "clsx";
import { normalizeUri } from "micromark-util-sanitize-uri";

// packages/client/ui-primitives/src/markdown/file-link.ts
function parseFileLink(value) {
  const hash = value.indexOf("#");
  const destination = hash < 0 ? value : value.slice(0, hash);
  if (destination.includes("?")) return void 0;
  let path;
  try {
    path = decodeURIComponent(destination);
  } catch (_error) {
    return void 0;
  }
  if (path.length === 0 || /[\u0000-\u001f\u007f]/.test(path) || /^[\\/]{2}/.test(path) || /^[a-z][a-z\d+.-]*:/i.test(path) && !/^[a-z]:[\\/]/i.test(path)) return void 0;
  if (hash < 0) return { path };
  const fragment = value.slice(hash + 1);
  const match = /^L([1-9]\d*)(?:-L([1-9]\d*))?$/.exec(fragment);
  if (match === null) return void 0;
  const line = Number(match[1]);
  const end = match[2] === void 0 ? line : Number(match[2]);
  if (!Number.isSafeInteger(line) || !Number.isSafeInteger(end) || end < line) return void 0;
  return { path, line };
}

// packages/client/ui-primitives/src/markdown/katex.tsx
import { createElement } from "react";
import katex from "katex";
import { jsx as jsx12 } from "react/jsx-runtime";
function styleObject(css) {
  const style = {};
  for (const declaration of css.split(";")) {
    const colon = declaration.indexOf(":");
    if (colon === -1) continue;
    const name = declaration.slice(0, colon).trim();
    const key = name.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    style[key] = declaration.slice(colon + 1).trim();
  }
  return style;
}
function domToReact(node, key) {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent;
  if (node.nodeType !== Node.ELEMENT_NODE) return null;
  const element = node;
  const props = { key };
  for (const attribute of element.attributes) {
    if (attribute.name === "class") props["className"] = attribute.value;
    else if (attribute.name === "style") props["style"] = styleObject(attribute.value);
    else props[attribute.name] = attribute.value;
  }
  const children = [...element.childNodes].map(domToReact);
  return children.length === 0 ? createElement(element.localName, props) : createElement(element.localName, props, ...children);
}
function renderTexToReact(value, displayMode) {
  let html;
  try {
    html = katex.renderToString(value, { displayMode, throwOnError: true });
  } catch (error) {
    try {
      html = katex.renderToString(value, { displayMode, strict: "ignore", throwOnError: false });
    } catch {
      return /* @__PURE__ */ jsx12(
        "span",
        {
          className: "katex-error",
          style: { color: "#cc0000" },
          title: String(error),
          children: value
        }
      );
    }
  }
  const parsed = new DOMParser().parseFromString(html, "text/html");
  return [...parsed.body.childNodes].map(domToReact);
}

// packages/client/ui-primitives/src/SiteGlyph.tsx
import {
  siAliexpress,
  siApple,
  siBaidu,
  siBilibili,
  siCsdn,
  siDuckduckgo,
  siEbay,
  siFacebook,
  siGithub,
  siGitlab,
  siGoogle,
  siInstagram,
  siJuejin,
  siMdnwebdocs,
  siNetflix,
  siNpm,
  siPypi,
  siQq,
  siQuora,
  siReddit,
  siSinaweibo,
  siSpotify,
  siStackoverflow,
  siTaobao,
  siTelegram,
  siTiktok,
  siV2ex,
  siWechat,
  siWhatsapp,
  siWikipedia,
  siX,
  siYcombinator,
  siYoutube,
  siZhihu
} from "simple-icons";
import { jsx as jsx13 } from "react/jsx-runtime";
var SITE_HOSTS = {
  "github.com": siGithub,
  "github.io": siGithub,
  "raw.githubusercontent.com": siGithub,
  "gitlab.com": siGitlab,
  "npmjs.com": siNpm,
  "pypi.org": siPypi,
  "stackoverflow.com": siStackoverflow,
  "developer.mozilla.org": siMdnwebdocs,
  "wikipedia.org": siWikipedia,
  "news.ycombinator.com": siYcombinator,
  "youtube.com": siYoutube,
  "youtu.be": siYoutube,
  "x.com": siX,
  "twitter.com": siX,
  "bilibili.com": siBilibili,
  "zhihu.com": siZhihu,
  "juejin.cn": siJuejin,
  "csdn.net": siCsdn,
  "google.com": siGoogle,
  "baidu.com": siBaidu,
  "duckduckgo.com": siDuckduckgo,
  "tiktok.com": siTiktok,
  "netflix.com": siNetflix,
  "spotify.com": siSpotify,
  "facebook.com": siFacebook,
  "instagram.com": siInstagram,
  "reddit.com": siReddit,
  "telegram.org": siTelegram,
  "t.me": siTelegram,
  "weixin.qq.com": siWechat,
  "qq.com": siQq,
  "whatsapp.com": siWhatsapp,
  "wa.me": siWhatsapp,
  "weibo.com": siSinaweibo,
  "taobao.com": siTaobao,
  "aliexpress.com": siAliexpress,
  "ebay.com": siEbay,
  "quora.com": siQuora,
  "v2ex.com": siV2ex,
  "apple.com": siApple
};
function siteIcon(href) {
  let host;
  try {
    const url = new URL(href);
    if (url.protocol !== "http:" && url.protocol !== "https:") return void 0;
    host = url.hostname.toLowerCase();
  } catch {
    return void 0;
  }
  let match;
  let matched = 0;
  for (const [suffix, icon] of Object.entries(SITE_HOSTS)) {
    if ((host === suffix || host.endsWith(`.${suffix}`)) && suffix.length > matched) {
      match = icon;
      matched = suffix.length;
    }
  }
  return match;
}
function siteGlyph({ href, size, className }) {
  const icon = href === void 0 ? void 0 : siteIcon(href);
  if (icon === void 0) return void 0;
  return (
    // Simple Icons fill their 24-unit box edge to edge; the -2 inset leaves the
    // same ~8% margin the 20-unit ic_ds_* glyphs draw inside their own box.
    /* @__PURE__ */ jsx13("svg", { width: size, height: size, className, viewBox: "-2 -2 28 28", fill: "none", xmlns: "http://www.w3.org/2000/svg", "aria-hidden": true, children: /* @__PURE__ */ jsx13("path", { d: icon.path, fill: "currentColor" }) })
  );
}

// packages/client/ui-primitives/src/LinkIcon.tsx
import { jsx as jsx14, jsxs as jsxs10 } from "react/jsx-runtime";
function classifyLinkPath(path) {
  const type = classifyFileType(path);
  const extension = fileExtension(path);
  if (isCodeFileType(type)) return isLinkCodeExtension(extension) ? "code" : "other";
  if (extension === "") return "other";
  switch (type) {
    case "code":
    case "html":
      return "code";
    case "image":
      return "image";
    case "excel":
    case "pdf":
    case "ppt":
    case "word":
      return "document";
    case "markdown":
    case "other":
    case "video":
      return "other";
    /* v8 ignore next -- classifyFileType returns a closed union exhausted above */
    default:
      return assertNever2(type);
  }
}
var PhotoGlyph = ({ size, className, strokeWidth }) => /* @__PURE__ */ jsxs10("svg", { width: size, height: size, className, viewBox: "0 0 16 16", fill: "none", xmlns: "http://www.w3.org/2000/svg", "aria-hidden": "true", strokeWidth, children: [
  /* @__PURE__ */ jsx14("path", { d: "M12.4326 2.38086H3.56763C2.46306 2.38086 1.56763 3.27629 1.56763 4.38086V11.6192C1.56763 12.7237 2.46306 13.6192 3.56763 13.6192H12.4326C13.5372 13.6192 14.4326 12.7237 14.4326 11.6192V4.38086C14.4326 3.27629 13.5372 2.38086 12.4326 2.38086Z", stroke: "currentColor" }),
  /* @__PURE__ */ jsx14("path", { d: "M10.536 7.03286C11.1948 7.03286 11.7288 6.49884 11.7288 5.8401C11.7288 5.18136 11.1948 4.64734 10.536 4.64734C9.87728 4.64734 9.34326 5.18136 9.34326 5.8401C9.34326 6.49884 9.87728 7.03286 10.536 7.03286Z", stroke: "currentColor" }),
  /* @__PURE__ */ jsx14("path", { d: "M1.5979 9.28409L4.17738 7.37514C4.57462 7.08117 5.12701 7.12145 5.47741 7.46992L8.3322 10.309C8.6572 10.6323 9.1605 10.6931 9.5532 10.4566L10.8859 9.65399C11.2531 9.43289 11.7205 9.47039 12.0477 9.74729L14.2823 11.6379", stroke: "currentColor" })
] });
var PaperDocGlyph = ({ size, className, strokeWidth }) => /* @__PURE__ */ jsxs10("svg", { width: size, height: size, className, viewBox: "0 0 16 16", fill: "none", xmlns: "http://www.w3.org/2000/svg", "aria-hidden": "true", strokeWidth, children: [
  /* @__PURE__ */ jsx14("path", { d: "M3.51919 14.5069H12.4807C13.0679 14.5069 13.5438 14.031 13.5438 13.4438V5.97499C13.5438 5.68818 13.428 5.41352 13.2226 5.21341L9.71251 1.79459C9.51402 1.60124 9.24781 1.49304 8.97075 1.49304H3.51919C2.93204 1.49304 2.45605 1.96902 2.45605 2.55618V13.4438C2.45605 14.031 2.93203 14.5069 3.51919 14.5069Z", stroke: "currentColor" }),
  /* @__PURE__ */ jsx14("path", { d: "M8.90454 1.6095V4.87091C8.90454 5.45806 9.38051 5.93405 9.96768 5.93405H13.4953", stroke: "currentColor" }),
  /* @__PURE__ */ jsx14("path", { d: "M4.31152 8.7561H7.83046", stroke: "currentColor" }),
  /* @__PURE__ */ jsx14("path", { d: "M4.31152 11.3651H9.36598", stroke: "currentColor" })
] });
var PaperGlyph = ({ size, className, strokeWidth }) => /* @__PURE__ */ jsxs10("svg", { width: size, height: size, className, viewBox: "0 0 16 16", fill: "none", xmlns: "http://www.w3.org/2000/svg", "aria-hidden": "true", strokeWidth, children: [
  /* @__PURE__ */ jsx14("path", { d: "M3.75275 14.271H12.2473C12.7749 14.271 13.2027 13.8433 13.2027 13.3156V5.91732C13.2027 5.65958 13.0985 5.41276 12.9139 5.23293L9.59477 2.00011C9.4164 1.82636 9.17717 1.72913 8.9282 1.72913H3.75275C3.22511 1.72913 2.79736 2.15686 2.79736 2.68451V13.3156C2.79736 13.8433 3.22511 14.271 3.75275 14.271Z", stroke: "currentColor" }),
  /* @__PURE__ */ jsx14("path", { d: "M8.84888 1.83838V4.94133C8.84888 5.46896 9.2766 5.89671 9.80426 5.89671H13.157", stroke: "currentColor" })
] });
function assertNever2(value) {
  throw new Error(`unreachable link icon kind: ${String(value)}`);
}
function LinkIconArtwork({ kind, href, size = 14, className, strokeWidth }) {
  switch (kind) {
    case "url":
      return siteGlyph({ href, size, className }) ?? /* @__PURE__ */ jsx14(GlobeOutlineArtwork, { size, className, strokeWidth });
    case "folder":
      return /* @__PURE__ */ jsx14(FolderCloseArtwork, { size, className, strokeWidth });
    case "code":
      return /* @__PURE__ */ jsx14(CodeBracketsArtwork, { size, className, strokeWidth });
    case "image":
      return /* @__PURE__ */ jsx14(PhotoGlyph, { size, className, strokeWidth });
    case "document":
      return /* @__PURE__ */ jsx14(PaperDocGlyph, { size, className, strokeWidth });
    case "other":
      return /* @__PURE__ */ jsx14(PaperGlyph, { size, className, strokeWidth });
    /* v8 ignore next -- closed-union backstop; only reached if a kind is forged */
    default:
      return assertNever2(kind);
  }
}
function LinkIconMedium(props) {
  return /* @__PURE__ */ jsx14(LinkIconArtwork, { ...props, strokeWidth: ICON_MEDIUM_STROKE });
}

// packages/client/ui-primitives/src/markdown/MarkdownDelegate.tsx
import { createContext as createContext2, useContext as useContext2, useMemo as useMemo2 } from "react";
import { jsx as jsx15 } from "react/jsx-runtime";
var MarkdownDelegateContext = createContext2({});
function useMarkdownDelegate() {
  return useContext2(MarkdownDelegateContext);
}

// packages/client/ui-primitives/src/HoverCard.tsx
import { useCallback as useCallback6, useContext as useContext3, useEffect as useEffect7, useLayoutEffect as useLayoutEffect5, useRef as useRef8, useState as useState7 } from "react";
import clsx7 from "clsx";
import { createPortal as createPortal4 } from "react-dom";

// packages/client/ui-primitives/src/HoverCardGroup.tsx
import { createContext as createContext3, useState as useState6 } from "react";
import { jsx as jsx16 } from "react/jsx-runtime";
var HoverCardGroupContext = createContext3(null);

// packages/client/ui-primitives/src/HoverCard.module.css
var HoverCard_default = {
  root: "HoverCard_root",
  card: "HoverCard_card",
  copyable: "HoverCard_copyable",
  feedback: "HoverCard_feedback",
  copied: "HoverCard_copied",
  status: "HoverCard_status",
  preview: "HoverCard_preview",
  inline: "HoverCard_inline",
  media: "HoverCard_media"
};

// packages/client/ui-primitives/src/HoverCard.tsx
import { jsx as jsx17, jsxs as jsxs11 } from "react/jsx-runtime";
var PREVIEW_FADE_MS = 100;
var PREVIEW_MAX_HEIGHT = 420;
var PREVIEW_INSET = 24;
var INLINE_PREVIEW_WIDTH = 300;
var ANCHOR_GAP = 8;
var VIEWPORT_MARGIN = 8;
function HoverCard({
  anchor,
  content,
  openDelayMs = 500,
  disabled = false,
  grouped = false,
  copyText: copyText2,
  copyLabel,
  copiedLabel,
  variant = "compact",
  widthAnchorRef,
  inline = false
}) {
  const rootRef = useRef8(null);
  const cardRef = useRef8(null);
  const timerRef = useRef8(null);
  const copyTimerRef = useRef8(null);
  const copyHeightRef = useRef8(null);
  const copyEpochRef = useRef8(0);
  const copyingRef = useRef8(false);
  const mountedRef = useRef8(true);
  const [phase, setPhase] = useState7("closed");
  const open = phase !== "closed";
  const closing = phase === "closing";
  const [pos, setPos] = useState7(null);
  const positioned = pos !== null;
  const [copied, setCopied] = useState7(false);
  const parentGroup = useContext3(HoverCardGroupContext);
  const group = grouped ? parentGroup : null;
  const [groupOwner] = useState7(() => Symbol("hover-card"));
  const clearCopied = useCallback6(() => {
    if (copyTimerRef.current !== null) {
      clearTimeout(copyTimerRef.current);
      copyTimerRef.current = null;
    }
    copyHeightRef.current = null;
    setCopied(false);
  }, []);
  const close = useCallback6(() => {
    copyEpochRef.current += 1;
    clearCopied();
    setPhase((current) => variant === "preview" && current !== "closed" ? "closing" : "closed");
  }, [clearCopied, variant]);
  const { arm: armClose, cancel: cancelClose } = usePointerGrace(close);
  const clearTimer = useCallback6(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);
  const dismissImmediately = useCallback6(() => {
    clearTimer();
    cancelClose();
    copyEpochRef.current += 1;
    clearCopied();
    setPhase("closed");
  }, [clearTimer, cancelClose, clearCopied]);
  const groupVisible = open && positioned;
  useLayoutEffect5(() => {
    if (!groupVisible || group === null) return;
    group.shown(groupOwner, dismissImmediately, cardRef.current);
    return () => {
      group.release(groupOwner);
    };
  }, [group, groupOwner, groupVisible, dismissImmediately]);
  useEffect7(() => {
    if (!closing) return;
    const timer = setTimeout(() => {
      setPhase("closed");
    }, PREVIEW_FADE_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [closing]);
  useEffect7(() => {
    if (!disabled) return;
    clearTimer();
    cancelClose();
    close();
  }, [disabled, cancelClose, close]);
  useEffect7(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      copyEpochRef.current += 1;
      clearTimer();
      if (copyTimerRef.current !== null) {
        clearTimeout(copyTimerRef.current);
        copyTimerRef.current = null;
      }
    };
  }, []);
  useEffect7(() => {
    if (!open || variant !== "preview" && !inline) return;
    const dismiss = (event) => {
      if (event.key !== "Escape") return;
      if (inline) event.stopPropagation();
      clearTimer();
      cancelClose();
      close();
    };
    window.addEventListener("keydown", dismiss, inline);
    return () => {
      window.removeEventListener("keydown", dismiss, inline);
    };
  }, [open, variant, inline, cancelClose, close]);
  useLayoutEffect5(() => {
    if (!open) {
      setPos(null);
      return;
    }
    const place = () => {
      const wrapper = rootRef.current;
      if (wrapper === null) return;
      const r = wrapper.getBoundingClientRect();
      const h = cardRef.current?.offsetHeight ?? 0;
      if (variant === "preview") {
        const bounds = widthAnchorRef?.current?.getBoundingClientRect() ?? r;
        const width = Math.max(0, Math.min(bounds.width - PREVIEW_INSET * 2, window.innerWidth - VIEWPORT_MARGIN * 2));
        const topMargin = overlayTopMargin(VIEWPORT_MARGIN);
        const belowTop = Math.max(topMargin, r.bottom + ANCHOR_GAP);
        const above = Math.max(0, r.top - ANCHOR_GAP - topMargin);
        const below = Math.max(0, window.innerHeight - belowTop - VIEWPORT_MARGIN);
        const onTop = above >= Math.min(PREVIEW_MAX_HEIGHT, below);
        const maxHeight = Math.min(PREVIEW_MAX_HEIGHT, onTop ? above : below);
        setPos({
          left: Math.max(VIEWPORT_MARGIN, Math.min(bounds.left + PREVIEW_INSET, window.innerWidth - width - VIEWPORT_MARGIN)),
          top: onTop ? Math.max(topMargin, r.top - Math.min(h, maxHeight) - ANCHOR_GAP) : belowTop,
          width,
          maxHeight
        });
        return;
      }
      if (inline) {
        const height = Math.max(h, cardRef.current?.scrollHeight ?? 0);
        const width = Math.max(0, Math.min(INLINE_PREVIEW_WIDTH, window.innerWidth - VIEWPORT_MARGIN * 2));
        const topMargin = overlayTopMargin(VIEWPORT_MARGIN);
        const belowTop = Math.max(topMargin, r.bottom + ANCHOR_GAP);
        const above = Math.max(0, r.top - ANCHOR_GAP - topMargin);
        const below = Math.max(0, window.innerHeight - belowTop - VIEWPORT_MARGIN);
        const onTop = height > below && above > below;
        const maxHeight = onTop ? above : below;
        setPos({
          left: Math.max(VIEWPORT_MARGIN, Math.min(r.left, window.innerWidth - width - VIEWPORT_MARGIN)),
          top: onTop ? r.top - ANCHOR_GAP - Math.min(height, maxHeight) : belowTop,
          width,
          maxHeight
        });
        return;
      }
      const top = r.top + h > window.innerHeight - VIEWPORT_MARGIN ? window.innerHeight - h - VIEWPORT_MARGIN : r.top;
      setPos({ left: r.right + ANCHOR_GAP, top });
    };
    place();
    const observer = (variant === "preview" || inline) && typeof ResizeObserver !== "undefined" ? new ResizeObserver(place) : null;
    for (const element of [cardRef.current, rootRef.current, widthAnchorRef?.current]) {
      if (element !== null && element !== void 0) observer?.observe(element);
    }
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      observer?.disconnect();
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [open, variant, widthAnchorRef, positioned, inline]);
  useLayoutEffect5(() => {
    if (!open || pos === null || variant === "preview" || inline) return;
    const h = cardRef.current?.offsetHeight ?? 0;
    if (pos.top + h > window.innerHeight - VIEWPORT_MARGIN) {
      setPos({ left: pos.left, top: window.innerHeight - h - VIEWPORT_MARGIN });
    }
  }, [open, pos, variant, inline]);
  const copy = async (text) => {
    if (copied || copyingRef.current) return;
    copyingRef.current = true;
    const copyEpoch = copyEpochRef.current;
    const accepted = await writeClipboard(text);
    copyingRef.current = false;
    const card2 = cardRef.current;
    if (!accepted || !mountedRef.current || copyEpoch !== copyEpochRef.current || card2 === null) return;
    const height = card2.offsetHeight;
    copyHeightRef.current = height > 0 ? height : null;
    setCopied(true);
    copyTimerRef.current = setTimeout(clearCopied, 1e3);
  };
  const copyable = copyText2 !== void 0;
  const dismissFromAnchor = (event) => {
    if (cardRef.current?.contains(event.target)) return;
    clearTimer();
    cancelClose();
    close();
  };
  const card = open && pos !== null && /* @__PURE__ */ jsx17(
    "div",
    {
      ref: cardRef,
      className: clsx7(HoverCard_default.card, variant === "preview" && HoverCard_default.preview, inline && HoverCard_default.media, copyable && HoverCard_default.copyable, copied && HoverCard_default.feedback),
      "data-closing": closing || void 0,
      style: {
        ...pos,
        minHeight: copied && copyHeightRef.current !== null ? copyHeightRef.current : void 0,
        "--dsh-hover-preview-fade": `${PREVIEW_FADE_MS}ms`
      },
      role: copyable ? "button" : void 0,
      tabIndex: copyable ? 0 : void 0,
      "aria-label": copyable ? `${copyLabel}: ${copyText2}` : void 0,
      onClick: copyable ? (e) => {
        const selection = window.getSelection();
        if (selection !== null && !selection.isCollapsed) {
          for (let i = 0; i < selection.rangeCount; i += 1) {
            if (selection.getRangeAt(i).intersectsNode(e.currentTarget)) return;
          }
        }
        void copy(copyText2);
      } : void 0,
      onKeyDown: copyable ? (e) => {
        if (e.key !== "Enter" && e.key !== " ") return;
        e.preventDefault();
        void copy(copyText2);
      } : void 0,
      children: copied ? /* @__PURE__ */ jsx17("span", { className: HoverCard_default.copied, "aria-hidden": "true", children: copiedLabel }) : content
    }
  );
  return /* @__PURE__ */ jsxs11(
    "span",
    {
      ref: rootRef,
      className: clsx7(HoverCard_default.root, inline && HoverCard_default.inline),
      onFocus: inline ? (event) => {
        if (!disabled && event.target.matches(":focus-visible")) {
          cancelClose();
          setPhase("open");
        }
      } : void 0,
      onBlur: inline ? (event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          clearTimer();
          cancelClose();
          close();
        }
      } : void 0,
      onPointerEnter: (event) => {
        if (disabled || inline && event.pointerType === "touch") return;
        cancelClose();
        if (open) {
          setPhase("open");
          return;
        }
        clearTimer();
        if (group?.isWarm()) setPhase("open");
        else timerRef.current = setTimeout(() => {
          setPhase("open");
        }, openDelayMs);
      },
      onPointerLeave: () => {
        clearTimer();
        if (open) armClose();
      },
      onPointerDownCapture: dismissFromAnchor,
      onClickCapture: dismissFromAnchor,
      children: [
        anchor,
        open && copyable && /* @__PURE__ */ jsx17("span", { className: HoverCard_default.status, role: "status", children: copied ? copiedLabel : "" }),
        card !== false && createPortal4(card, document.body)
      ]
    }
  );
}

// packages/client/ui-primitives/src/ImageLightbox.tsx
import { useEffect as useEffect8, useRef as useRef9 } from "react";
import { createPortal as createPortal5 } from "react-dom";

// packages/client/ui-primitives/src/ImageLightbox.module.css
var ImageLightbox_default = {
  backdrop: "ImageLightbox_backdrop",
  stage: "ImageLightbox_stage",
  mask: "ImageLightbox_mask",
  image: "ImageLightbox_image",
  close: "ImageLightbox_close"
};

// packages/client/ui-primitives/src/ImageLightbox.tsx
import { jsx as jsx18, jsxs as jsxs12 } from "react/jsx-runtime";
function ImageLightbox({ src, alt, labels, onClose }) {
  const closeRef = useRef9(null);
  const restoreRef = useRef9(null);
  useEffect8(() => {
    restoreRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus();
    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      }
      if (event.key === "Tab") {
        event.preventDefault();
        closeRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      restoreRef.current?.focus();
    };
  }, [onClose]);
  return createPortal5(
    /* @__PURE__ */ jsx18(
      "div",
      {
        className: ImageLightbox_default.backdrop,
        role: "dialog",
        "aria-modal": "true",
        "aria-label": labels.dialog,
        children: /* @__PURE__ */ jsxs12("div", { className: ImageLightbox_default.stage, children: [
          /* @__PURE__ */ jsx18("div", { className: ImageLightbox_default.mask, "aria-hidden": "true", onMouseDown: onClose }),
          /* @__PURE__ */ jsx18("img", { className: ImageLightbox_default.image, src, alt }),
          /* @__PURE__ */ jsx18("button", { ref: closeRef, type: "button", className: ImageLightbox_default.close, "aria-label": labels.close, onClick: onClose, children: /* @__PURE__ */ jsx18(IconCloseOutlineRegular, { size: 16 }) })
        ] })
      }
    ),
    document.body
  );
}

// packages/client/ui-primitives/src/ImagePreview.tsx
import { useState as useState8 } from "react";

// packages/client/ui-primitives/src/ImagePreview.module.css
var ImagePreview_default = {
  frame: "ImagePreview_frame",
  image: "ImagePreview_image",
  status: "ImagePreview_status"
};

// packages/client/ui-primitives/src/ImagePreview.tsx
import { jsx as jsx19, jsxs as jsxs13 } from "react/jsx-runtime";
function ImagePreview({ src, alt, loadingLabel, failedLabel }) {
  return /* @__PURE__ */ jsx19(Preview, { src, alt, loadingLabel, failedLabel }, src);
}
function Preview({ src, alt, loadingLabel, failedLabel }) {
  const [state, setState] = useState8("loading");
  return /* @__PURE__ */ jsxs13("span", { className: ImagePreview_default.frame, children: [
    state !== "failed" && /* @__PURE__ */ jsx19(
      "img",
      {
        src,
        alt,
        loading: "lazy",
        decoding: "async",
        referrerPolicy: "no-referrer",
        className: ImagePreview_default.image,
        "data-ready": state === "ready" || void 0,
        onLoad: () => {
          setState("ready");
        },
        onError: () => {
          setState("failed");
        }
      }
    ),
    state !== "ready" && /* @__PURE__ */ jsxs13("span", { className: ImagePreview_default.status, role: "status", children: [
      state === "loading" && /* @__PURE__ */ jsx19(IconLoadingOutlineRegular, { size: 16 }),
      /* @__PURE__ */ jsx19("span", { children: state === "loading" ? loadingLabel : failedLabel })
    ] })
  ] });
}

// packages/client/ui-primitives/src/markdown/MarkdownText.module.css
var MarkdownText_default = {
  markdown: "MarkdownText_markdown",
  fileLink: "MarkdownText_fileLink",
  fileMention: "MarkdownText_fileMention",
  linkIcon: "MarkdownText_linkIcon",
  tableScroll: "MarkdownText_tableScroll",
  tableFill: "MarkdownText_tableFill",
  imageAlt: "MarkdownText_imageAlt",
  image: "MarkdownText_image",
  compact: "MarkdownText_compact",
  imageButton: "MarkdownText_imageButton",
  previewName: "MarkdownText_previewName"
};

// packages/client/ui-primitives/src/markdown/render.tsx
import { Fragment as Fragment5, jsx as jsx20, jsxs as jsxs14 } from "react/jsx-runtime";
function sanitizeUrl(url) {
  try {
    switch (new URL(url).protocol) {
      case "http:":
      case "https:":
      case "mailto:":
        return url;
      default:
        return "";
    }
  } catch {
    return "";
  }
}
function remoteImageUrl(url) {
  try {
    const protocol = new URL(url).protocol;
    return protocol === "http:" || protocol === "https:" ? url : void 0;
  } catch {
    return void 0;
  }
}
function vocabularyImageUrl(url) {
  try {
    const protocol = new URL(url).protocol;
    return protocol === "http:" || protocol === "https:" || protocol === "blob:" || protocol === "data:" || url.startsWith("dsh-app://app/api/file?") ? url : void 0;
  } catch {
    return void 0;
  }
}
function imageSource(url, pathImages) {
  const remote = remoteImageUrl(sanitizeUrl(normalizeUri(url)));
  if (remote !== void 0) return remote;
  const rewritten = pathImages?.resolve(url);
  return rewritten === void 0 ? void 0 : vocabularyImageUrl(rewritten);
}
function createReferenceTargets() {
  return { definitions: /* @__PURE__ */ new Map(), footnotes: /* @__PURE__ */ new Map() };
}
function collectReferenceTargets(nodes, targets) {
  for (const node of nodes) {
    if (node.type === "definition") {
      const id = node.identifier.toUpperCase();
      if (!targets.definitions.has(id)) targets.definitions.set(id, node);
    } else if (node.type === "footnoteDefinition") {
      const id = node.identifier.toUpperCase();
      if (!targets.footnotes.has(id)) targets.footnotes.set(id, node);
    }
    if ("children" in node) collectReferenceTargets(node.children, targets);
  }
}
function renderBlocks(blocks, context) {
  return blocks.map((block) => renderNode(block.node, block.key, context)).filter((element) => element !== null);
}
function wrapBlockChildren(elements, edges) {
  const wrapped = [];
  for (const element of elements) {
    if (edges || wrapped.length > 0) wrapped.push("\n");
    wrapped.push(element);
  }
  if (edges && elements.length > 0) wrapped.push("\n");
  return wrapped;
}
function renderBlockEntries(blocks, context) {
  const entries = [];
  for (const [index, block] of blocks.entries()) {
    if (block.type === "paragraph") {
      entries.push({ paragraph: renderChildren(block.children, context) });
    } else {
      const element = renderNode(block, index, context);
      if (element !== null) entries.push({ element });
    }
  }
  return entries;
}
function renderChildren(nodes, context) {
  return nodes.map((node, index) => renderNode(node, index, context));
}
function renderNode(node, key, context) {
  switch (node.type) {
    case "text":
      return node.value;
    case "paragraph":
      return /* @__PURE__ */ jsx20("p", { children: renderChildren(node.children, context) }, key);
    case "heading":
      return createElement2(`h${node.depth}`, { key }, ...renderChildren(node.children, context));
    case "blockquote":
      return /* @__PURE__ */ jsx20("blockquote", { children: wrapBlockChildren(
        renderChildren(node.children, { ...context, inBlockquote: true }).filter((child) => child !== null),
        true
      ) }, key);
    case "thematicBreak":
      return /* @__PURE__ */ jsx20("hr", {}, key);
    case "break":
      return /* @__PURE__ */ jsxs14(Fragment4, { children: [
        /* @__PURE__ */ jsx20("br", {}),
        "\n"
      ] }, key);
    case "strong":
      return /* @__PURE__ */ jsx20("strong", { children: renderChildren(node.children, context) }, key);
    case "emphasis":
      return /* @__PURE__ */ jsx20("em", { children: renderChildren(node.children, context) }, key);
    case "delete":
      return /* @__PURE__ */ jsx20("del", { children: renderChildren(node.children, context) }, key);
    case "inlineCode": {
      const value = node.value.replace(/\r?\n|\r/g, " ");
      const href = inlineCodeHttpUrl(value);
      if (href !== void 0) return /* @__PURE__ */ jsx20("code", { children: renderSafeLink(href, [value], "link") }, key);
      const mention = context.inLink === true ? void 0 : context.fileMentions?.resolve(value);
      if (mention !== void 0) {
        return /* @__PURE__ */ jsx20("code", { children: /* @__PURE__ */ jsxs14(
          "button",
          {
            type: "button",
            className: MarkdownText_default.fileMention,
            title: mention.title,
            "aria-label": mention.label,
            onClick: mention.open,
            children: [
              /* @__PURE__ */ jsx20(LinkIconMedium, { kind: classifyLinkPath(value), className: MarkdownText_default.linkIcon }),
              value
            ]
          }
        ) }, key);
      }
      return /* @__PURE__ */ jsx20("code", { children: value }, key);
    }
    case "html":
      return node.value;
    case "code":
      return renderCode(node, key, context);
    case "math":
      return /* @__PURE__ */ jsx20(Fragment4, { children: renderTexToReact(node.value, true) }, key);
    case "inlineMath":
      return /* @__PURE__ */ jsx20(Fragment4, { children: renderTexToReact(node.value, false) }, key);
    case "list":
      return renderList(node, key, context);
    case "listItem":
      return renderListItem(node, listItemLoose(node), key, context);
    case "table":
      return renderTable(node, key, context);
    case "link":
      return renderAnchor(
        node.url,
        renderChildren(node.children, { ...context, inLink: true }),
        key,
        !anchorWrapsOnlyImages(node.children),
        context.streaming
      );
    case "linkReference":
      return renderLinkReference(node, key, context);
    case "image":
      return renderImage(node.url, node.alt ?? "", key, context);
    case "imageReference":
      return renderImageReference(node, key, context);
    case "footnoteReference":
      return renderFootnoteReference(node, key, context);
    case "definition":
    case "footnoteDefinition":
      return null;
    default:
      return null;
  }
}
function renderCode(node, key, context) {
  const language = node.lang ?? void 0;
  if (node.value === "") {
    return /* @__PURE__ */ jsx20("pre", { children: /* @__PURE__ */ jsx20("code", { className: language === void 0 ? void 0 : `language-${language}` }) }, key);
  }
  const lang = language === void 0 ? void 0 : /^[\w-]+/.exec(language)?.[0];
  if (!context.streaming && lang === "math") {
    return /* @__PURE__ */ jsx20(Fragment4, { children: renderTexToReact(`${node.value}
`, true) }, key);
  }
  return /* @__PURE__ */ jsx20(
    CodeBlock,
    {
      code: `${node.value}
`,
      lang,
      streaming: context.streaming,
      copyLabel: context.labels.code.copyLabel,
      copiedLabel: context.labels.code.copiedLabel,
      toolbarLabels: context.labels.code.toolbarLabels
    },
    key
  );
}
function listLoose(list) {
  return (list.spread ?? false) || list.children.some(listItemLoose);
}
function listItemLoose(item) {
  return item.spread ?? item.children.length > 1;
}
function renderList(node, key, context) {
  const loose = listLoose(node);
  const properties = {};
  if (typeof node.start === "number" && node.start !== 1) properties.start = node.start;
  if (node.children.some((item) => typeof item.checked === "boolean")) {
    properties.className = "contains-task-list";
  }
  return createElement2(
    node.ordered === true ? "ol" : "ul",
    { key, ...properties },
    ...node.children.map((item, index) => renderListItem(item, loose, index, context))
  );
}
function renderListItem(item, loose, key, context) {
  const entries = renderBlockEntries(item.children, context);
  const task = typeof item.checked === "boolean";
  if (task) {
    const checkbox = /* @__PURE__ */ jsx20("input", { type: "checkbox", checked: item.checked === true, disabled: true }, "task-checkbox");
    const head = entries[0];
    if (head !== void 0 && "paragraph" in head) {
      head.paragraph = head.paragraph.length > 0 ? [checkbox, " ", ...head.paragraph] : [checkbox];
    } else {
      entries.unshift({ paragraph: [checkbox] });
    }
  }
  const parts = [];
  for (const [index, entry] of entries.entries()) {
    const isParagraph = "paragraph" in entry;
    if (loose || index !== 0 || !isParagraph) parts.push("\n");
    if (!isParagraph) parts.push(entry.element);
    else if (loose) parts.push(/* @__PURE__ */ jsx20("p", { children: entry.paragraph }, `p-${index}`));
    else parts.push(/* @__PURE__ */ jsx20(Fragment4, { children: entry.paragraph }, `p-${index}`));
  }
  const tail = entries[entries.length - 1];
  if (tail !== void 0 && (loose || !("paragraph" in tail))) parts.push("\n");
  return /* @__PURE__ */ jsx20("li", { className: task ? "task-list-item" : void 0, children: parts }, key);
}
function renderTable(node, key, context) {
  const align = node.align ?? null;
  const [headRow, ...bodyRows] = node.children;
  const columns = align === null ? headRow?.children.length ?? 0 : align.length;
  const wide = columns >= 4 && context.inBlockquote !== true;
  return (
    // Wide tables rest with overflow-x hidden (the hover-revealed bar in
    // MarkdownText.module.css), which drops Chromium's implicit scroller
    // focusability — the explicit tabindex keeps them keyboard-reachable,
    // and :focus-visible restores scrolling.
    /* @__PURE__ */ jsx20(
      "div",
      {
        className: clsx8(MarkdownText_default.tableScroll, wide ? "md-table-wide" : MarkdownText_default.tableFill),
        tabIndex: wide ? 0 : void 0,
        children: /* @__PURE__ */ jsxs14("table", { children: [
          headRow !== void 0 && /* @__PURE__ */ jsx20("thead", { children: renderTableRow(headRow, "th", align, 0, context) }),
          bodyRows.length > 0 && /* @__PURE__ */ jsx20("tbody", { children: bodyRows.map((row, index) => renderTableRow(row, "td", align, index + 1, context)) })
        ] })
      },
      key
    )
  );
}
function renderTableRow(row, cellTag, align, key, context) {
  const length = align === null ? row.children.length : align.length;
  const cells = [];
  for (let index = 0; index < length; index++) {
    const cell = row.children[index];
    const alignValue = align?.[index];
    cells.push(createElement2(
      cellTag,
      // hast-util-to-jsx-runtime's default tableCellAlignToStyle turned the
      // deprecated align attribute into an inline style; keep that DOM.
      { key: index, style: alignValue == null ? void 0 : { textAlign: alignValue } },
      ...cell === void 0 ? [] : renderChildren(cell.children, context)
    ));
  }
  return /* @__PURE__ */ jsx20("tr", { children: cells }, key);
}
function anchorWrapsOnlyImages(children) {
  return children.length > 0 && children.every((child) => child.type === "image" || child.type === "imageReference");
}
function renderSafeLink(href, children, key, glyph2 = true) {
  const safeHref = sanitizeUrl(href);
  if (safeHref === "") return /* @__PURE__ */ jsx20(Fragment4, { children }, key);
  return /* @__PURE__ */ jsx20(MarkdownAnchor, { href: safeHref, glyph: glyph2, children }, key);
}
function MarkdownAnchor({ href, glyph: glyph2, children }) {
  const { openExternalLink } = useMarkdownDelegate();
  const external = ["http:", "https:"].includes(new URL(href).protocol);
  const open = external ? openExternalLink : void 0;
  return /* @__PURE__ */ jsxs14(
    "a",
    {
      href,
      ...external ? { target: "_blank", rel: "noopener noreferrer" } : {},
      onClick: open === void 0 ? void 0 : (event) => {
        if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        open(href);
      },
      children: [
        glyph2 && /* @__PURE__ */ jsx20(LinkIconMedium, { kind: "url", href, className: MarkdownText_default.linkIcon }),
        children
      ]
    }
  );
}
function renderAnchor(url, children, key, glyph2 = true, streaming = false) {
  const file = streaming ? void 0 : parseFileLink(url);
  if (file !== void 0) {
    return /* @__PURE__ */ jsx20(MarkdownFileLink, { file, glyph: glyph2, children }, key);
  }
  return renderSafeLink(normalizeUri(url), children, key, glyph2);
}
function MarkdownFileLink({ file, glyph: glyph2, children }) {
  const { openFile, fileImages } = useMarkdownDelegate();
  if (openFile === void 0) return /* @__PURE__ */ jsx20(Fragment5, { children });
  const preview = glyph2 && classifyLinkPath(file.path) === "image" ? fileImages : void 0;
  const src = preview?.resolve(file.path);
  const anchor = /* @__PURE__ */ jsxs14(
    "button",
    {
      type: "button",
      className: clsx8(MarkdownText_default.fileMention, MarkdownText_default.fileLink),
      title: src === void 0 ? file.path : void 0,
      onClick: () => {
        openFile(file.path, file.line === void 0 ? void 0 : { line: file.line });
      },
      children: [
        glyph2 && /* @__PURE__ */ jsx20(LinkIconMedium, { kind: classifyLinkPath(file.path), className: MarkdownText_default.linkIcon }),
        children
      ]
    }
  );
  if (src === void 0 || preview === void 0) return anchor;
  return /* @__PURE__ */ jsx20(
    HoverCard,
    {
      inline: true,
      anchor,
      content: /* @__PURE__ */ jsxs14(Fragment5, { children: [
        /* @__PURE__ */ jsx20(ImagePreview, { src, alt: file.path, loadingLabel: preview.labels.loading, failedLabel: preview.labels.failed }),
        /* @__PURE__ */ jsx20("span", { className: MarkdownText_default.previewName, children: file.path.split(/[\\/]/u).pop() })
      ] })
    }
  );
}
function inlineCodeHttpUrl(value) {
  if (value.trim() !== value) return void 0;
  try {
    const protocol = new URL(value).protocol;
    return protocol === "http:" || protocol === "https:" ? value : void 0;
  } catch {
    return void 0;
  }
}
function renderImage(url, alt, key, context) {
  return /* @__PURE__ */ jsx20(
    MarkdownImage,
    {
      destination: url,
      alt,
      pathImages: context.pathImages,
      streaming: context.streaming,
      inLink: context.inLink === true
    },
    `${key}:${url}`
  );
}
function MarkdownImage({ destination, alt, pathImages, streaming, inLink }) {
  const { fileImages } = useMarkdownDelegate();
  const file = streaming ? void 0 : parseFileLink(destination);
  const src = (file === void 0 ? void 0 : fileImages?.resolve(file.path)) ?? imageSource(destination, pathImages);
  if (src === void 0) return /* @__PURE__ */ jsx20("span", { className: MarkdownText_default.imageAlt, children: alt });
  return /* @__PURE__ */ jsx20(LoadedMarkdownImage, { src, alt, destination, preview: inLink ? void 0 : fileImages }, src);
}
function LoadedMarkdownImage({ src, alt, destination, preview }) {
  const [failed, setFailed] = useState9(false);
  const [open, setOpen] = useState9(false);
  const close = useCallback7(() => {
    setOpen(false);
  }, []);
  if (failed) return /* @__PURE__ */ jsxs14("span", { className: MarkdownText_default.imageAlt, children: [
    preview === void 0 ? "" : `${preview.labels.failed} \xB7 `,
    alt || destination
  ] });
  const img = /* @__PURE__ */ jsx20(
    "img",
    {
      className: MarkdownText_default.image,
      src,
      alt,
      onError: () => {
        setFailed(true);
      },
      loading: "lazy",
      decoding: "async",
      referrerPolicy: "no-referrer"
    }
  );
  if (preview === void 0) return img;
  return /* @__PURE__ */ jsxs14(Fragment5, { children: [
    /* @__PURE__ */ jsx20(
      "button",
      {
        type: "button",
        className: MarkdownText_default.imageButton,
        title: preview.labels.open,
        "aria-label": alt ? `${preview.labels.open}: ${alt}` : preview.labels.open,
        onClick: () => {
          setOpen(true);
        },
        children: img
      }
    ),
    open && /* @__PURE__ */ jsx20(ImageLightbox, { src, alt, labels: preview.labels, onClose: close })
  ] });
}
function referenceSuffix(node) {
  if (node.referenceType === "collapsed") return "][]";
  if (node.referenceType === "full") return `][${node.label ?? node.identifier}]`;
  return "]";
}
function renderLinkReference(node, key, context) {
  const definition = context.targets.definitions.get(node.identifier.toUpperCase());
  if (definition === void 0) {
    return /* @__PURE__ */ jsxs14(Fragment4, { children: [
      "[",
      renderChildren(node.children, context),
      referenceSuffix(node)
    ] }, key);
  }
  const rendered = renderChildren(node.children, { ...context, inLink: true });
  return renderAnchor(definition.url, rendered, key, !anchorWrapsOnlyImages(node.children), context.streaming);
}
function renderImageReference(node, key, context) {
  const definition = context.targets.definitions.get(node.identifier.toUpperCase());
  if (definition === void 0) return `![${node.alt ?? ""}${referenceSuffix(node)}`;
  return renderImage(definition.url, node.alt ?? "", key, context);
}
function renderFootnoteReference(node, key, context) {
  const id = node.identifier.toUpperCase();
  const seen = context.footnoteCounts.get(id);
  if (seen === void 0) context.footnoteOrder.push(id);
  context.footnoteCounts.set(id, (seen ?? 0) + 1);
  return /* @__PURE__ */ jsx20("sup", { children: String(context.footnoteOrder.indexOf(id) + 1) }, key);
}
function renderFootnoteSection(context) {
  const items = [];
  for (const id of context.footnoteOrder) {
    const definition = context.targets.footnotes.get(id);
    if (definition === void 0) continue;
    const count = context.footnoteCounts.get(id) ?? 0;
    const backrefs = [];
    for (let reference = 1; reference <= count; reference++) {
      if (backrefs.length > 0) backrefs.push(" ");
      backrefs.push("\u21A9");
      if (reference > 1) backrefs.push(/* @__PURE__ */ jsx20("sup", { children: String(reference) }, `re-${reference}`));
    }
    const entries = renderBlockEntries(definition.children, context);
    const tail = entries[entries.length - 1];
    const body = entries.map((entry, index) => "paragraph" in entry ? /* @__PURE__ */ jsxs14("p", { children: [
      entry.paragraph,
      entry === tail && /* @__PURE__ */ jsxs14(Fragment5, { children: [
        " ",
        backrefs
      ] })
    ] }, `p-${index}`) : entry.element);
    if (tail === void 0 || !("paragraph" in tail)) body.push(...backrefs);
    items.push(
      /* @__PURE__ */ jsx20("li", { id: `user-content-fn-${normalizeUri(id.toLowerCase())}`, children: wrapBlockChildren(body, true) }, id)
    );
  }
  if (items.length === 0) return null;
  return /* @__PURE__ */ jsxs14("section", { "data-footnotes": true, className: "footnotes", children: [
    /* @__PURE__ */ jsx20("h2", { id: "footnote-label", className: "sr-only", children: context.labels.footnotes }),
    /* @__PURE__ */ jsx20("ol", { children: items })
  ] }, "footnotes");
}

// packages/client/ui-primitives/src/markdown/MarkdownText.tsx
import "katex/dist/katex.min.css";
import { jsx as jsx21 } from "react/jsx-runtime";
function renderSettled(text, labels, fileMentions, pathImages) {
  const root = parseGfmWithMath(text);
  const targets = createReferenceTargets();
  collectReferenceTargets(root.children, targets);
  const context = {
    streaming: false,
    labels,
    fileMentions,
    pathImages,
    targets,
    footnoteOrder: [],
    footnoteCounts: /* @__PURE__ */ new Map()
  };
  const blocks = wrapBlockChildren(
    renderBlocks(root.children.map((node, index) => ({
      node,
      /* v8 ignore next -- parseFull uses parseGfm, which stamps every top-level node. */
      key: node.position?.start.offset ?? -(index + 1)
    })), context),
    false
  );
  const section = renderFootnoteSection(context);
  return section === null ? blocks : [...blocks, "\n", section];
}
var StreamingRenderer = class {
  /** @param labels - Localized Markdown chrome baked into cached elements; the owner replaces the renderer when it changes. */
  constructor(labels) {
    this.labels = labels;
  }
  parser = new IncrementalMarkdownParser(parseGfm);
  generation = -1;
  frozenCount = 0;
  frozenElements = [];
  frozenTargets = createReferenceTargets();
  frozenFootnoteOrder = [];
  frozenFootnoteCounts = /* @__PURE__ */ new Map();
  lastText = null;
  lastRendered = [];
  /**
   * Render the current accumulated text. Idempotent per text value, so React
   * may re-execute the calling render freely.
   * @param text - The full accumulated markdown source.
   * @returns Frozen elements, re-rendered tail, and the footnote section.
   */
  render(text) {
    if (text === this.lastText) return this.lastRendered;
    const { frozen, tail, generation } = this.parser.update(text);
    if (generation !== this.generation) {
      this.generation = generation;
      this.frozenCount = 0;
      this.frozenElements = [];
      this.frozenTargets = createReferenceTargets();
      this.frozenFootnoteOrder = [];
      this.frozenFootnoteCounts = /* @__PURE__ */ new Map();
    }
    const newlyFrozen = frozen.slice(this.frozenCount);
    collectReferenceTargets(newlyFrozen.map((block) => block.node), this.frozenTargets);
    const frameTargets = {
      definitions: new Map(this.frozenTargets.definitions),
      footnotes: new Map(this.frozenTargets.footnotes)
    };
    collectReferenceTargets(tail.map((block) => block.node), frameTargets);
    if (newlyFrozen.length > 0) {
      const frozenContext = {
        streaming: true,
        labels: this.labels,
        fileMentions: void 0,
        pathImages: void 0,
        targets: frameTargets,
        footnoteOrder: this.frozenFootnoteOrder,
        footnoteCounts: this.frozenFootnoteCounts
      };
      const batch = [...this.frozenElements];
      for (const element of renderBlocks(newlyFrozen, frozenContext)) {
        if (batch.length > 0) batch.push("\n");
        batch.push(element);
      }
      this.frozenElements = batch;
      this.frozenCount = frozen.length;
    }
    const tailContext = {
      streaming: true,
      labels: this.labels,
      fileMentions: void 0,
      pathImages: void 0,
      targets: frameTargets,
      footnoteOrder: [...this.frozenFootnoteOrder],
      footnoteCounts: new Map(this.frozenFootnoteCounts)
    };
    const children = [...this.frozenElements];
    for (const element of renderBlocks(tail, tailContext)) {
      if (children.length > 0) children.push("\n");
      children.push(element);
    }
    const section = renderFootnoteSection(tailContext);
    if (section !== null) children.push("\n", section);
    this.lastText = text;
    this.lastRendered = children;
    return this.lastRendered;
  }
};
var MarkdownText = memo(function MarkdownText2({
  text,
  streaming = false,
  labels,
  fileMentions,
  pathImages,
  variant = "body"
}) {
  const streamRef = useRef10(null);
  const streamLabelsRef = useRef10(labels);
  const children = useMemo3(() => {
    if (!streaming) {
      streamRef.current = null;
      return renderSettled(text, labels, fileMentions, pathImages);
    }
    if (streamRef.current === null || streamLabelsRef.current !== labels) {
      streamRef.current = new StreamingRenderer(labels);
      streamLabelsRef.current = labels;
    }
    return streamRef.current.render(text);
  }, [text, streaming, labels, fileMentions, pathImages]);
  return /* @__PURE__ */ jsx21(
    "div",
    {
      className: clsx9(MarkdownText_default.markdown, variant === "compact" && MarkdownText_default.compact),
      "data-markdown-variant": variant === "compact" ? variant : void 0,
      children
    }
  );
});

// packages/client/ui-primitives/src/markdown/plain-text.ts
function inlineText(node) {
  switch (node.type) {
    case "text":
    case "inlineCode":
    case "code":
      return node.value ?? "";
    case "image":
    case "imageReference":
      return node.alt ?? "";
    case "break":
      return "\n";
    case "html":
      return node.value ?? "";
    default:
      return node.children?.map(inlineText).join("") ?? "";
  }
}
function compactInline(text) {
  return text.replace(/\s+/g, " ").trim();
}
function blockText(node) {
  switch (node.type) {
    case "root":
    case "blockquote":
      return node.children?.map(blockText).filter(Boolean).join("\n\n") ?? "";
    case "paragraph":
    case "heading":
      return compactInline(inlineText(node));
    case "code":
      return node.value?.trim() ?? "";
    case "list":
      return node.children?.map(blockText).filter(Boolean).join("\n") ?? "";
    case "listItem":
      return node.children?.map(blockText).filter(Boolean).join(" ") ?? "";
    case "table":
      return node.children?.map(blockText).filter(Boolean).join("\n") ?? "";
    case "tableRow":
      return node.children?.map(blockText).join("	") ?? "";
    case "tableCell":
      return compactInline(inlineText(node));
    case "html":
      return node.value ?? "";
    case "thematicBreak":
    case "definition":
      return "";
    default:
      return compactInline(inlineText(node));
  }
}
function findFirstParagraph(node) {
  if (node.type === "paragraph") {
    const text = compactInline(inlineText(node));
    if (text !== "") return text;
  }
  for (const child of node.children ?? []) {
    const text = findFirstParagraph(child);
    if (text !== void 0) return text;
  }
  return void 0;
}
function fullText(root) {
  return blockText(root).split("\n").map((line) => line.trim()).join("\n").replace(/\n{3,}/g, "\n\n").trim();
}
function extractMarkdownPlainText(markdown, options = {}) {
  const { mode = "all" } = options;
  const root = parseGfm(markdown);
  const all = fullText(root);
  switch (mode) {
    case "all":
      return all;
    case "first-line":
      return all.split("\n").find((line) => line !== "") ?? "";
    case "first-paragraph":
      return findFirstParagraph(root) ?? all.split("\n").find((line) => line !== "") ?? "";
  }
}

// packages/client/ui-primitives/src/StateDot.tsx
import clsx10 from "clsx";

// packages/client/ui-primitives/src/StateDot.module.css
var StateDot_default = {
  dot: "StateDot_dot",
  spinner: "StateDot_spinner",
  spinnerMotion: "StateDot_spinnerMotion",
  "dsh-state-dot-spin": "StateDot_dsh-state-dot-spin",
  spinnerTrack: "StateDot_spinnerTrack",
  spinnerArc: "StateDot_spinnerArc",
  "dsh-state-dot-dash": "StateDot_dsh-state-dot-dash",
  step: "StateDot_step"
};

// packages/client/ui-primitives/src/StateDot.tsx
import { jsx as jsx22, jsxs as jsxs15 } from "react/jsx-runtime";
function syncSpinner(element) {
  if (element === null) return;
  pinSpinner(element);
  element.addEventListener("animationstart", () => {
    pinSpinner(element);
  });
}
function pinSpinner(element) {
  const spinner = element;
  for (const animation of spinner.getAnimations?.({ subtree: true }) ?? []) animation.startTime = 0;
}
function StateDot({ state, size, className, appearance = "dot" }) {
  const edge = size ?? (state === "ongoing" ? 14 : 10);
  if (state === "ongoing") {
    return /* @__PURE__ */ jsx22(
      "svg",
      {
        ref: syncSpinner,
        className: clsx10(StateDot_default.spinner, className),
        "data-state": "ongoing",
        width: edge,
        height: edge,
        viewBox: "0 0 24 24",
        "aria-hidden": "true",
        children: /* @__PURE__ */ jsxs15("g", { className: StateDot_default.spinnerMotion, children: [
          /* @__PURE__ */ jsx22("circle", { className: StateDot_default.spinnerTrack, cx: "12", cy: "12", r: "9.5" }),
          /* @__PURE__ */ jsx22("circle", { className: StateDot_default.spinnerArc, cx: "12", cy: "12", r: "9.5" })
        ] })
      }
    );
  }
  return /* @__PURE__ */ jsx22(
    "span",
    {
      className: clsx10(appearance === "step" ? StateDot_default.step : StateDot_default.dot, className),
      "data-state": state,
      style: { width: edge, height: edge },
      "aria-hidden": "true",
      children: appearance === "step" && state === "done" && /* @__PURE__ */ jsx22(IconCheckOutlineRegular, { size: edge - 2 })
    }
  );
}

// packages/client/ui-trajectory/src/client/TrajectoryTable.tsx
import { structuredPatch } from "diff";

// packages/client/ui-trajectory/src/client/trajectory-record.ts
function trajectoryRecordId(cell) {
  if (cell.recordId !== void 0) return cell.recordId;
  if (cell.callId !== void 0) return `${cell.kind}\0call\0${cell.callId}`;
  if (cell.sourceSeq !== void 0) return `${cell.kind}\0seq\0${cell.sourceSeq}`;
  return `${cell.kind}\0index\0${cell.index}`;
}
function formatDurationMillis(milliseconds, t) {
  if (milliseconds === null || !Number.isFinite(milliseconds)) return "\u2014";
  const integer = String(Math.round(milliseconds));
  return t("unit.milliseconds", {
    value: integer.replace(/\B(?=(\d{3})+(?!\d))/g, ",")
  });
}
function formatElapsedSeconds(seconds, t) {
  return formatDurationMillis(seconds === null ? null : seconds * 1e3, t);
}

// packages/client/ui-trajectory/src/client/trajectory-virtual-rows.ts
var CONTENT_ROW_HEIGHT = 30;
var COLLAPSED_SUMMARY_HEIGHT = 20;
var TERMINAL_BOUNDARY_HEIGHT = 9;
function trajectoryVirtualRecordKey(record2) {
  const identity = encodeURIComponent(trajectoryRecordId(record2.cell));
  return record2.collapsedSummaryKind === void 0 ? identity : `${identity}\0summary\0${record2.collapsedSummaryKind}`;
}
function groupTrajectoryVirtualRows(records) {
  const rows = [];
  let pending = [];
  for (const [logicalIndex, record2] of records.entries()) {
    const entry = { logicalIndex, record: record2 };
    if (record2.cell.requestOnly === true) {
      pending.push(entry);
      continue;
    }
    const entries = [...pending, entry];
    pending = [];
    rows.push({
      entries,
      height: record2.collapsedSummaryKind === void 0 ? CONTENT_ROW_HEIGHT : COLLAPSED_SUMMARY_HEIGHT,
      key: trajectoryVirtualRecordKey(record2)
    });
  }
  if (pending.length > 0) {
    rows.push({
      entries: pending,
      height: TERMINAL_BOUNDARY_HEIGHT,
      key: pending.map((candidate) => trajectoryVirtualRecordKey(candidate.record)).join("|")
    });
  }
  return rows;
}

// packages/client/ui-trajectory/src/client/trajectory-preview.ts
var PREVIEW_SOURCE_CHARACTERS = 2048;
var PREVIEW_OUTPUT_CHARACTERS = 512;
function trajectoryPreviewText(text) {
  const source = text.slice(0, PREVIEW_SOURCE_CHARACTERS);
  const compact = extractMarkdownPlainText(source).replace(/\s+/g, " ").trim();
  const preview = compact.slice(0, PREVIEW_OUTPUT_CHARACTERS).trimEnd();
  return source.length < text.length || preview.length < compact.length ? `${preview}\u2026` : preview;
}

// packages/client/ui-trajectory/src/client/copy-codes.ts
var COMPACTION_INTERRUPTED_ERROR = "trajectory.compaction-interrupted";

// packages/client/ui-trajectory/src/client/code-program.ts
var PTC_TOOL_NAME = "run_code";
function record(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value : void 0;
}
function parseRecord(value) {
  if (value === void 0) return void 0;
  try {
    return record(JSON.parse(value));
  } catch {
    return void 0;
  }
}
function recordedLanguage(schemaRaw) {
  const schema = parseRecord(schemaRaw);
  const properties = record(record(schema?.parameters)?.properties);
  const description = record(properties?.code)?.description;
  if (typeof description !== "string") return void 0;
  const typescript = /\bTypeScript\b/i.test(description);
  const python = /\bPython\b/i.test(description);
  if (typescript === python) return void 0;
  return typescript ? "typescript" : "python";
}
function codeProgram(cell) {
  if (cell.kind !== "tool" && cell.kind !== "subtool") return void 0;
  if (cell.toolName !== PTC_TOOL_NAME || cell.inputDetail === void 0) return void 0;
  const args = parseRecord(cell.inputDetail);
  if (typeof args?.code !== "string") return void 0;
  if (args.description !== void 0 && typeof args.description !== "string") return void 0;
  return {
    rawInput: cell.inputDetail,
    source: args.code,
    description: typeof args.description === "string" && args.description.trim() !== "" ? args.description : args.code.split(/\r?\n/).find((line) => line.trim() !== "")?.trim() ?? "",
    arguments: args,
    language: recordedLanguage(cell.schemaDetail)
  };
}

// packages/client/ui-trajectory/src/client/TrajectoryTable.module.css
var TrajectoryTable_default = {
  split: "TrajectoryTable_split",
  tablePane: "TrajectoryTable_tablePane",
  "trajectory-table": "TrajectoryTable_trajectory-table",
  historyLoading: "TrajectoryTable_historyLoading",
  historyLoadingBar: "TrajectoryTable_historyLoadingBar",
  table: "TrajectoryTable_table",
  historyLoadRow: "TrajectoryTable_historyLoadRow",
  historyLoadButton: "TrajectoryTable_historyLoadButton",
  visuallyHidden: "TrajectoryTable_visuallyHidden",
  eventColumn: "TrajectoryTable_eventColumn",
  contentColumn: "TrajectoryTable_contentColumn",
  eventHeader: "TrajectoryTable_eventHeader",
  virtualSpacer: "TrajectoryTable_virtualSpacer",
  turnRail: "TrajectoryTable_turnRail",
  requestBoundaryControl: "TrajectoryTable_requestBoundaryControl",
  requestBoundaryControlActive: "TrajectoryTable_requestBoundaryControlActive",
  event: "TrajectoryTable_event",
  selectionRail: "TrajectoryTable_selectionRail",
  turnLabel: "TrajectoryTable_turnLabel",
  turnLabelFull: "TrajectoryTable_turnLabelFull",
  turnLabelCompact: "TrajectoryTable_turnLabelCompact",
  turnLabelActive: "TrajectoryTable_turnLabelActive",
  eventInner: "TrajectoryTable_eventInner",
  kindSlot: "TrajectoryTable_kindSlot",
  content: "TrajectoryTable_content",
  kindTag: "TrajectoryTable_kindTag",
  kindTagIcon: "TrajectoryTable_kindTagIcon",
  kindTagLabel: "TrajectoryTable_kindTagLabel",
  message: "TrajectoryTable_message",
  user: "TrajectoryTable_user",
  systemNeutral: "TrajectoryTable_systemNeutral",
  contextGreen: "TrajectoryTable_contextGreen",
  compacted: "TrajectoryTable_compacted",
  compactedSummary: "TrajectoryTable_compactedSummary",
  promptDiffSections: "TrajectoryTable_promptDiffSections",
  promptDiffSection: "TrajectoryTable_promptDiffSection",
  promptDiffTitle: "TrajectoryTable_promptDiffTitle",
  promptDiff: "TrajectoryTable_promptDiff",
  promptDiffLinemeta: "TrajectoryTable_promptDiffLinemeta",
  promptDiffLinecontext: "TrajectoryTable_promptDiffLinecontext",
  promptDiffLineadded: "TrajectoryTable_promptDiffLineadded",
  promptDiffLineremoved: "TrajectoryTable_promptDiffLineremoved",
  assistantVioletBright: "TrajectoryTable_assistantVioletBright",
  toolAmber: "TrajectoryTable_toolAmber",
  subtoolAmber: "TrajectoryTable_subtoolAmber",
  contentText: "TrajectoryTable_contentText",
  toolCallOnly: "TrajectoryTable_toolCallOnly",
  collapsedTurnContent: "TrajectoryTable_collapsedTurnContent",
  collapsedTurnEllipsis: "TrajectoryTable_collapsedTurnEllipsis",
  collapsedTurnText: "TrajectoryTable_collapsedTurnText",
  resultPreview: "TrajectoryTable_resultPreview",
  resultRequest: "TrajectoryTable_resultRequest",
  inlineResultText: "TrajectoryTable_inlineResultText",
  toolCallNameTypeface: "TrajectoryTable_toolCallNameTypeface",
  toolCallPayload: "TrajectoryTable_toolCallPayload",
  inlineResult: "TrajectoryTable_inlineResult",
  noOutputText: "TrajectoryTable_noOutputText",
  arrow: "TrajectoryTable_arrow",
  error: "TrajectoryTable_error",
  overview: "TrajectoryTable_overview",
  details: "TrajectoryTable_details",
  errorPayload: "TrajectoryTable_errorPayload",
  resultBlockText: "TrajectoryTable_resultBlockText",
  jsonPayload: "TrajectoryTable_jsonPayload",
  jsonPreview: "TrajectoryTable_jsonPreview",
  detailsResizeHandle: "TrajectoryTable_detailsResizeHandle",
  detailsHeader: "TrajectoryTable_detailsHeader",
  detailsTitle: "TrajectoryTable_detailsTitle",
  requestDetailsDot: "TrajectoryTable_requestDetailsDot",
  requestDetailsName: "TrajectoryTable_requestDetailsName",
  detailsLocation: "TrajectoryTable_detailsLocation",
  close: "TrajectoryTable_close",
  detailTabs: "TrajectoryTable_detailTabs",
  detailTab: "TrajectoryTable_detailTab",
  detailTabActive: "TrajectoryTable_detailTabActive",
  detailBody: "TrajectoryTable_detailBody",
  detailBodySummary: "TrajectoryTable_detailBodySummary",
  summaryScrollRegion: "TrajectoryTable_summaryScrollRegion",
  markdownPayload: "TrajectoryTable_markdownPayload",
  overviewParentLinks: "TrajectoryTable_overviewParentLinks",
  overviewHierarchyNavLink: "TrajectoryTable_overviewHierarchyNavLink",
  overviewHierarchyJumpIconTight: "TrajectoryTable_overviewHierarchyJumpIconTight",
  requestTokenDetail: "TrajectoryTable_requestTokenDetail",
  usagePanel: "TrajectoryTable_usagePanel",
  usageGroup: "TrajectoryTable_usageGroup",
  usageHeading: "TrajectoryTable_usageHeading",
  timestampToggle: "TrajectoryTable_timestampToggle",
  overviewSections: "TrajectoryTable_overviewSections",
  overviewSection: "TrajectoryTable_overviewSection",
  overviewHeading: "TrajectoryTable_overviewHeading",
  overviewTitle: "TrajectoryTable_overviewTitle",
  overviewTitleIcon: "TrajectoryTable_overviewTitleIcon",
  overviewPreview: "TrajectoryTable_overviewPreview",
  programDescription: "TrajectoryTable_programDescription",
  programIcon: "TrajectoryTable_programIcon",
  programSummary: "TrajectoryTable_programSummary",
  detailBodyProgram: "TrajectoryTable_detailBodyProgram",
  programPanel: "TrajectoryTable_programPanel",
  programActions: "TrajectoryTable_programActions",
  programLanguage: "TrajectoryTable_programLanguage",
  programAction: "TrajectoryTable_programAction",
  programContent: "TrajectoryTable_programContent",
  programSource: "TrajectoryTable_programSource",
  programOutput: "TrajectoryTable_programOutput",
  programError: "TrajectoryTable_programError",
  schemaTree: "TrajectoryTable_schemaTree",
  markdownPreview: "TrajectoryTable_markdownPreview",
  assistantContent: "TrajectoryTable_assistantContent",
  payload: "TrajectoryTable_payload",
  thinkingQuote: "TrajectoryTable_thinkingQuote",
  thinkingQuoteOnlyPreview: "TrajectoryTable_thinkingQuoteOnlyPreview",
  assistantContentRendered: "TrajectoryTable_assistantContentRendered",
  thinkingToggle: "TrajectoryTable_thinkingToggle",
  thinkingChevron: "TrajectoryTable_thinkingChevron",
  assistantOutput: "TrajectoryTable_assistantOutput",
  schema: "TrajectoryTable_schema",
  schemaPreview: "TrajectoryTable_schemaPreview",
  schemaIntro: "TrajectoryTable_schemaIntro",
  schemaName: "TrajectoryTable_schemaName",
  schemaDescription: "TrajectoryTable_schemaDescription",
  schemaParameters: "TrajectoryTable_schemaParameters",
  schemaParametersTitle: "TrajectoryTable_schemaParametersTitle",
  payloadPreview: "TrajectoryTable_payloadPreview",
  sourceBlocks: "TrajectoryTable_sourceBlocks",
  sourceBlock: "TrajectoryTable_sourceBlock",
  sourceBlockHeader: "TrajectoryTable_sourceBlockHeader",
  sourceBlockJumpTarget: "TrajectoryTable_sourceBlockJumpTarget",
  sourceBlockLabel: "TrajectoryTable_sourceBlockLabel",
  sourceBlockJumpIcon: "TrajectoryTable_sourceBlockJumpIcon",
  sourceBlockContent: "TrajectoryTable_sourceBlockContent",
  messageImages: "TrajectoryTable_messageImages",
  attachments: "TrajectoryTable_attachments",
  attachmentsPreview: "TrajectoryTable_attachmentsPreview",
  attachmentRow: "TrajectoryTable_attachmentRow",
  attachmentIcon: "TrajectoryTable_attachmentIcon",
  attachmentInfo: "TrajectoryTable_attachmentInfo",
  attachmentName: "TrajectoryTable_attachmentName",
  attachmentMetadata: "TrajectoryTable_attachmentMetadata",
  attachmentDisclosure: "TrajectoryTable_attachmentDisclosure",
  assistantToolCalls: "TrajectoryTable_assistantToolCalls",
  assistantToolCallsPreview: "TrajectoryTable_assistantToolCallsPreview",
  assistantToolCallButton: "TrajectoryTable_assistantToolCallButton",
  assistantToolCallIcon: "TrajectoryTable_assistantToolCallIcon",
  assistantToolCallText: "TrajectoryTable_assistantToolCallText",
  assistantToolCallName: "TrajectoryTable_assistantToolCallName",
  assistantToolCallArgs: "TrajectoryTable_assistantToolCallArgs",
  systemPrompt: "TrajectoryTable_systemPrompt",
  toolCatalog: "TrajectoryTable_toolCatalog",
  toolCatalogItem: "TrajectoryTable_toolCatalogItem",
  toolCatalogSummary: "TrajectoryTable_toolCatalogSummary",
  toolCatalogChevron: "TrajectoryTable_toolCatalogChevron",
  toolCatalogIcon: "TrajectoryTable_toolCatalogIcon",
  toolCatalogName: "TrajectoryTable_toolCatalogName",
  toolCatalogDescription: "TrajectoryTable_toolCatalogDescription",
  toolCatalogDefinition: "TrajectoryTable_toolCatalogDefinition",
  toolCatalogFullDescription: "TrajectoryTable_toolCatalogFullDescription",
  toolCatalogTree: "TrajectoryTable_toolCatalogTree",
  resultBlocks: "TrajectoryTable_resultBlocks",
  resultBlocksPreview: "TrajectoryTable_resultBlocksPreview",
  noPayload: "TrajectoryTable_noPayload",
  toolUpdatePayload: "TrajectoryTable_toolUpdatePayload"
};

// packages/client/ui-trajectory/src/client/TrajectoryTable.tsx
import { Fragment as Fragment6, jsx as jsx23, jsxs as jsxs16 } from "react/jsx-runtime";
var BOTTOM_FOLLOW_THRESHOLD_PX = 2;
var OLDER_LOAD_THRESHOLD_PX = 48;
var HISTORY_LOAD_ROW_HEIGHT_PX = 30;
var VIRTUALIZATION_THRESHOLD = 100;
var VIRTUAL_OVERSCAN_ROWS = 12;
var VIRTUAL_INITIAL_VIEWPORT_HEIGHT_PX = 600;
var KIND_LABEL_KEY = {
  system: "kind.system",
  user: "kind.user",
  context: "kind.context",
  compacted: "kind.compacted",
  message: "kind.assistant",
  tool: "kind.tool",
  subtool: "kind.subtool"
};
function ToolWrenchIcon() {
  return /* @__PURE__ */ jsx23(
    "svg",
    {
      width: "13",
      height: "13",
      viewBox: "0 0 16 16",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: "1.5",
      strokeLinecap: "round",
      strokeLinejoin: "round",
      "data-role-icon": "wrench",
      "aria-hidden": "true",
      children: /* @__PURE__ */ jsx23("path", { d: "M14 3.3a3.8 3.8 0 0 1-4.8 4.8l-5.1 5.1a1.6 1.6 0 1 1-2.3-2.3l5.1-5.1A3.8 3.8 0 0 1 11.7 1l-2.3 2.3 2.3 2.3L14 3.3Z" })
    }
  );
}
function InformationIcon() {
  return /* @__PURE__ */ jsxs16(
    "svg",
    {
      width: "14",
      height: "14",
      viewBox: "0 0 16 16",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: "1.4",
      strokeLinecap: "round",
      "data-role-icon": "information",
      "aria-hidden": "true",
      children: [
        /* @__PURE__ */ jsx23("circle", { cx: "8", cy: "8", r: "6.7" }),
        /* @__PURE__ */ jsx23("circle", { cx: "8", cy: "5.5", r: ".85", fill: "currentColor", stroke: "none" }),
        /* @__PURE__ */ jsx23("path", { d: "M8 7.75v3.4", strokeWidth: "1.8" })
      ]
    }
  );
}
function CompactedIcon() {
  return /* @__PURE__ */ jsxs16(
    "svg",
    {
      width: "13",
      height: "13",
      viewBox: "0 0 16 16",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: "1.5",
      strokeLinecap: "round",
      strokeLinejoin: "round",
      "data-role-icon": "compacted",
      "aria-hidden": "true",
      children: [
        /* @__PURE__ */ jsx23("path", { d: "m2.5 2.5 3.75 3.75M3 6.25h3.25V3" }),
        /* @__PURE__ */ jsx23("path", { d: "m13.5 2.5-3.75 3.75M13 6.25H9.75V3" }),
        /* @__PURE__ */ jsx23("path", { d: "m2.5 13.5 3.75-3.75M3 9.75h3.25V13" }),
        /* @__PURE__ */ jsx23("path", { d: "m13.5 13.5-3.75-3.75M13 9.75H9.75V13" })
      ]
    }
  );
}
var KIND_ICON = {
  system: /* @__PURE__ */ jsx23(IconSettingsOutlineRegular, { size: 13 }),
  user: /* @__PURE__ */ jsx23(IconUserOutlineRegular, { size: 13 }),
  context: /* @__PURE__ */ jsx23(InformationIcon, {}),
  compacted: /* @__PURE__ */ jsx23(CompactedIcon, {}),
  message: /* @__PURE__ */ jsx23(IconSparkleRegular, { size: 13 }),
  tool: /* @__PURE__ */ jsx23(ToolWrenchIcon, {}),
  subtool: /* @__PURE__ */ jsx23(ToolWrenchIcon, {})
};
function useStableVirtualRowStructure(rows) {
  const cache = useRef11({ rows: [], structure: [] });
  if (cache.current.rows === rows) return cache.current.structure;
  const structure = cache.current.structure.length === rows.length && rows.every((row, index) => {
    const previous = cache.current.structure[index];
    return previous?.key === row.key && previous.height === row.height;
  }) ? cache.current.structure : rows.map((row) => ({ key: row.key, height: row.height }));
  cache.current = { rows, structure };
  return structure;
}
var DETAILS_MIN_WIDTH = 320;
var DETAILS_MAX_WIDTH = 720;
var TABLE_MIN_WIDTH = 280;
var DETAILS_RESIZE_STEP = 16;
var TOOL_REQUEST_SHARE = 0.58;
var TOOL_REQUEST_MIN_WIDTH = 180;
var TOOL_REQUEST_MAX_WIDTH = 480;
var DEFAULT_TOOL_REQUEST_SHARE = 0.36;
var DEFAULT_TOOL_REQUEST_OFFSET = 56;
var SYSTEM_PROMPT_TABS = [
  { id: "system-prompt", labelKey: "tab.systemPrompt" },
  { id: "tools", labelKey: "tab.tools" }
];
var SYSTEM_UPDATE_TABS = [
  { id: "diff", labelKey: "tab.diff" },
  ...SYSTEM_PROMPT_TABS
];
var REQUEST_TABS = [
  { id: "overview", labelKey: "tab.summary" },
  { id: "options", labelKey: "tab.options" },
  { id: "usage", labelKey: "tab.usage" },
  { id: "timing", labelKey: "tab.timing" }
];
function jsonTreeLabels(t) {
  return {
    copyValue: t("copy.value"),
    copyJson: t("copy.json"),
    copyPath: t("copy.path"),
    copyPrettyJson: t("copy.prettyJson"),
    copyCompactJson: t("copy.compactJson"),
    copied: t("copied"),
    copyFailed: t("copy.failed"),
    collapseNode: t("collapse"),
    expandNode: t("expand"),
    copyButtonTitle: (action) => t("copy.optionsHint", { action })
  };
}
function markdownLabels(t) {
  return {
    code: { copyLabel: t("copy"), copiedLabel: t("copied") },
    footnotes: t("markdown.footnotes")
  };
}
function clampDetailsWidth(width, splitWidth) {
  const maxWidth = Math.max(
    DETAILS_MIN_WIDTH,
    Math.min(DETAILS_MAX_WIDTH, splitWidth - TABLE_MIN_WIDTH)
  );
  return Math.round(Math.min(Math.max(width, DETAILS_MIN_WIDTH), maxWidth));
}
function defaultToolRequestWidth(splitWidth) {
  return Math.min(
    Math.max(
      splitWidth * DEFAULT_TOOL_REQUEST_SHARE - DEFAULT_TOOL_REQUEST_OFFSET,
      TOOL_REQUEST_MIN_WIDTH
    ),
    TOOL_REQUEST_MAX_WIDTH
  );
}
function formatDurationMs(milliseconds, t) {
  if (milliseconds < 1e3) return t("unit.milliseconds", { value: Math.round(milliseconds) });
  return t("unit.seconds", {
    value: (milliseconds / 1e3).toFixed(milliseconds < 1e4 ? 2 : 1)
  });
}
function formatStartedAt(timestamp, t) {
  if (timestamp === null || !Number.isFinite(timestamp)) return t("timing.notAvailable");
  const date = new Date(timestamp);
  const two = (value) => String(value).padStart(2, "0");
  const three = (value) => String(value).padStart(3, "0");
  const time = `${two(date.getHours())}:${two(date.getMinutes())}:${two(date.getSeconds())}.${three(date.getMilliseconds())}`;
  const day = `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())}`;
  return `${day} ${time}`;
}
function clickSelectsText(target) {
  const selection = window.getSelection();
  return selection !== null && !selection.isCollapsed && selection.rangeCount > 0 && selection.getRangeAt(0).intersectsNode(target);
}
function StartedAtValue({ timestamp, t }) {
  const [showUnix, setShowUnix] = useState10(false);
  if (timestamp === null || !Number.isFinite(timestamp)) return /* @__PURE__ */ jsx23("dd", { children: t("timing.notAvailable") });
  return /* @__PURE__ */ jsx23("dd", { children: /* @__PURE__ */ jsx23(
    "button",
    {
      type: "button",
      className: TrajectoryTable_default.timestampToggle,
      title: showUnix ? t("timing.showLocalTime") : t("timing.showUnixTimestamp"),
      onClick: (event) => {
        if (clickSelectsText(event.currentTarget)) return;
        setShowUnix((current) => !current);
      },
      children: showUnix ? (timestamp / 1e3).toFixed(3) : formatStartedAt(timestamp, t)
    }
  ) });
}
function totalTime(metrics, t) {
  if (!metrics.timingRecorded) return t("timing.notRecorded");
  if (metrics.stepStartTime === null) return t("timing.stepStartUnavailable");
  if (metrics.completedTime === null) return t("status.pending");
  return formatDurationMs(Math.max(0, metrics.completedTime - metrics.stepStartTime), t);
}
function ttft(metrics, t) {
  if (!metrics.timingRecorded) return t("timing.notRecorded");
  if (metrics.stepStartTime === null) return t("timing.stepStartUnavailable");
  if (metrics.firstTokenTime === null) return t("timing.firstTokenUnavailable");
  return formatDurationMs(Math.max(0, metrics.firstTokenTime - metrics.stepStartTime), t);
}
function generationTime(metrics, t) {
  if (!metrics.timingRecorded || metrics.firstTokenTime === null) return t("timing.firstTokenUnavailable");
  if (metrics.completedTime === null) return t("status.pending");
  return formatDurationMs(Math.max(0, metrics.completedTime - metrics.firstTokenTime), t);
}
function throughput(metrics, t) {
  if (!metrics.usageProvided) return t("timing.usageUnavailable");
  if (metrics.outputTokens === null) return t("timing.outputTokensUnavailable");
  if (!metrics.timingRecorded || metrics.firstTokenTime === null) return t("timing.firstTokenUnavailable");
  if (metrics.completedTime === null) return t("status.pending");
  const generationSeconds = (metrics.completedTime - metrics.firstTokenTime) / 1e3;
  if (generationSeconds <= 0) return t("timing.durationTooShort");
  return t("unit.tokensPerSecond", {
    value: (metrics.outputTokens / generationSeconds).toFixed(1)
  });
}
function AssistantTimingPanel({
  metrics,
  t
}) {
  return /* @__PURE__ */ jsxs16("dl", { className: TrajectoryTable_default.overview, children: [
    /* @__PURE__ */ jsxs16("div", { children: [
      /* @__PURE__ */ jsx23("dt", { children: t("timing.started") }),
      /* @__PURE__ */ jsx23(StartedAtValue, { timestamp: metrics.stepStartTime, t })
    ] }),
    /* @__PURE__ */ jsxs16("div", { children: [
      /* @__PURE__ */ jsx23("dt", { children: t("timing.totalDuration") }),
      /* @__PURE__ */ jsx23("dd", { children: totalTime(metrics, t) })
    ] }),
    /* @__PURE__ */ jsxs16("div", { children: [
      /* @__PURE__ */ jsx23("dt", { children: t("timing.ttft") }),
      /* @__PURE__ */ jsx23("dd", { children: ttft(metrics, t) })
    ] }),
    /* @__PURE__ */ jsxs16("div", { children: [
      /* @__PURE__ */ jsx23("dt", { children: t("timing.generation") }),
      /* @__PURE__ */ jsx23("dd", { children: generationTime(metrics, t) })
    ] }),
    /* @__PURE__ */ jsxs16("div", { children: [
      /* @__PURE__ */ jsx23("dt", { children: t("timing.throughput") }),
      /* @__PURE__ */ jsx23("dd", { children: throughput(metrics, t) })
    ] })
  ] });
}
function flattenRecords(turns) {
  return turns.flatMap((turn, section) => {
    let firstInSection = true;
    const records = turn.groups.flatMap((group) => {
      return group.cells.map((cell, index) => {
        const turnStart = firstInSection && cell.requestOnly !== true && cell.kind !== "system" && (cell.kind !== "compacted" || turn.turn === null);
        if (turnStart) firstInSection = false;
        return {
          turn: turn.turn,
          section,
          group: group.title,
          groupStart: index === 0,
          turnStart,
          cell,
          turnEnd: false
        };
      });
    });
    const last = records.at(-1);
    if (last !== void 0) last.turnEnd = true;
    return records;
  });
}
function filterRecords(records, matches) {
  const filtered = records.filter(
    (record2) => record2.cell.requestOnly !== true && matches.has(record2.cell.index)
  ).map((record2) => ({ ...record2, groupStart: false, turnStart: false, turnEnd: false }));
  const startedSections = /* @__PURE__ */ new Set();
  for (const [index, record2] of filtered.entries()) {
    const previous = filtered[index - 1];
    const next = filtered[index + 1];
    record2.groupStart = previous === void 0 || previous.section !== record2.section || previous.group !== record2.group;
    record2.turnStart = !startedSections.has(record2.section) && record2.cell.kind !== "system" && (record2.cell.kind !== "compacted" || record2.turn === null);
    if (record2.turnStart) startedSections.add(record2.section);
    record2.turnEnd = next === void 0 || next.section !== record2.section;
  }
  return filtered;
}
function requestKey(turn, group) {
  return `${turn}\0${group}`;
}
function requestIdentity(request) {
  return request.purpose === "compaction" ? `compaction\0${request.seq}` : `assistant\0${request.turn}\0${request.step}`;
}
function indexRequestBoundaries(records, requestGroups) {
  const boundaries = /* @__PURE__ */ new Map();
  for (const record2 of records) {
    const key = requestKey(record2.turn, record2.group);
    if (!requestGroups.has(key)) continue;
    if (boundaries.has(key)) continue;
    if (record2.cell.kind === "user" || record2.cell.kind === "context") continue;
    boundaries.set(key, record2.cell.index);
  }
  return boundaries;
}
function sectionLabel(turn, t) {
  return turn === null ? t("section.betweenTurns") : t("turn.label", { turn });
}
function indexRequestNumbers(sessionNumbers) {
  const numbers = /* @__PURE__ */ new Map();
  for (const request of sessionNumbers ?? []) {
    numbers.set(requestKey(request.turn, request.group), request.number);
  }
  return numbers;
}
function indexRequestBoundaryRuns(records, requestGroups) {
  const indexes = /* @__PURE__ */ new Map();
  let runLength = 0;
  for (const record2 of records) {
    if (record2.cell.requestOnly === true) {
      indexes.set(record2.cell.index, runLength++);
      continue;
    }
    if (runLength > 0 && record2.groupStart && requestGroups.has(requestKey(record2.turn, record2.group))) {
      indexes.set(record2.cell.index, runLength);
    }
    runLength = 0;
  }
  return indexes;
}
function summarizeTurn(records, requestGroups, t) {
  const steps = new Set(
    records.map((record2) => requestKey(record2.turn, record2.group)).filter((key) => requestGroups.has(key))
  ).size;
  const toolCalls = records.filter(
    (record2) => record2.cell.kind === "tool" || record2.cell.kind === "subtool"
  ).length;
  return [
    t(steps === 1 ? "summary.steps.one" : "summary.steps.other", { count: steps }),
    t(toolCalls === 1 ? "summary.toolCalls.one" : "summary.toolCalls.other", {
      count: toolCalls
    })
  ].join(" \xB7 ");
}
function collapseTurnRecords(records, collapsedTurns, requestGroups, t) {
  const recordsByTurn = /* @__PURE__ */ new Map();
  for (const record2 of records) {
    if (record2.turn === null) continue;
    const turnRecords = recordsByTurn.get(record2.turn) ?? [];
    turnRecords.push(record2);
    recordsByTurn.set(record2.turn, turnRecords);
  }
  return records.flatMap((record2) => {
    if (record2.turn === null || !collapsedTurns.has(record2.turn)) return [record2];
    const turnRecords = recordsByTurn.get(record2.turn) ?? [record2];
    if (record2.cell.requestOnly === true || record2.cell.kind === "system") return [record2];
    const contentRecords = turnRecords.filter((candidate) => candidate.cell.requestOnly !== true && candidate.cell.kind !== "system");
    if (contentRecords.length <= 1) return [record2];
    if (record2.cell.index !== contentRecords[0]?.cell.index) return [];
    return [
      { ...record2, turnEnd: false },
      {
        ...record2,
        groupStart: false,
        turnStart: false,
        turnEnd: true,
        collapsedSummary: summarizeTurn(contentRecords.slice(1), requestGroups, t),
        collapsedSummaryKind: "turn"
      }
    ];
  });
}
function assistantToolCalls(records, assistantIndex) {
  const at = records.findIndex((record2) => record2.cell.index === assistantIndex);
  if (at === -1 || records[at]?.cell.kind !== "message") return [];
  const calls = [];
  for (let i = at + 1; i < records.length; i++) {
    const record2 = records[i];
    if (record2 === void 0) break;
    if (record2.cell.kind !== "tool" && record2.cell.kind !== "subtool") break;
    calls.push(record2);
  }
  return calls;
}
function summarizeAssistantTools(records, t) {
  const names = [...new Set(records.map((record2) => {
    const separator = record2.cell.text.indexOf(" \xB7 ");
    return separator === -1 ? record2.cell.text : record2.cell.text.slice(0, separator);
  }).filter((name) => name !== ""))];
  const count = records.length;
  const summary = t(count === 1 ? "summary.toolCalls.one" : "summary.toolCalls.other", { count });
  return names.length > 0 ? `${summary} \xB7 ${names.join(", ")}` : summary;
}
function collapseAssistantRecords(records, collapsedAssistants, t) {
  const out = [];
  for (let i = 0; i < records.length; i++) {
    const record2 = records[i];
    if (record2 === void 0) continue;
    out.push(record2);
    if (record2.cell.kind !== "message" || !collapsedAssistants.has(trajectoryRecordId(record2.cell))) continue;
    const calls = [];
    for (let j = i + 1; j < records.length; j++) {
      const candidate = records[j];
      if (candidate === void 0 || candidate.collapsedSummary !== void 0 || candidate.cell.kind !== "tool" && candidate.cell.kind !== "subtool") break;
      calls.push(candidate);
    }
    if (calls.length === 0) continue;
    const last = calls.at(-1);
    out[out.length - 1] = { ...record2, turnEnd: false };
    out.push({
      ...record2,
      groupStart: false,
      turnStart: false,
      turnEnd: last?.turnEnd ?? false,
      collapsedSummary: summarizeAssistantTools(calls, t),
      collapsedSummaryKind: "assistant"
    });
    i += calls.length;
  }
  return out;
}
function stateOf(record2) {
  if (record2.cell.isError) return "error";
  if (record2.cell.kind === "compacted" && record2.cell.timeSeconds === null) return "running";
  if (record2.cell.assistantMetrics?.completedTime === null) return "running";
  if ((record2.cell.kind === "tool" || record2.cell.kind === "subtool") && record2.cell.outputDetail === void 0) return "running";
  return "complete";
}
function statusLabel(state, t) {
  if (state === "error") return t("status.failed");
  if (state === "running") return t("status.pending");
  return t("status.completed");
}
function requestErrorMessage(request, t) {
  if (request.errorCode === "AUTH") return t("details.failure.auth");
  if (request.error === COMPACTION_INTERRUPTED_ERROR) return t("layout.compactionInterrupted");
  return request.error;
}
function TokenRows({ cell, t }) {
  const content = cell.output !== void 0 && cell.think !== void 0 ? Math.max(0, cell.output - cell.think) : void 0;
  return /* @__PURE__ */ jsxs16(Fragment6, { children: [
    /* @__PURE__ */ jsxs16("div", { children: [
      /* @__PURE__ */ jsx23("dt", { children: t("usage.tokens") }),
      /* @__PURE__ */ jsx23("dd", { children: cell.output === void 0 ? "\u2014" : t("unit.tokens", { value: cell.output }) })
    ] }),
    cell.think !== void 0 && /* @__PURE__ */ jsxs16("div", { className: TrajectoryTable_default.requestTokenDetail, children: [
      /* @__PURE__ */ jsx23("dt", { children: t("usage.reasoning") }),
      /* @__PURE__ */ jsx23("dd", { children: t("unit.tokens", { value: cell.think }) })
    ] }),
    content !== void 0 && /* @__PURE__ */ jsxs16("div", { className: TrajectoryTable_default.requestTokenDetail, children: [
      /* @__PURE__ */ jsx23("dt", { children: t("usage.content") }),
      /* @__PURE__ */ jsx23("dd", { children: t("unit.tokens", { value: content }) })
    ] })
  ] });
}
function inputTotal(usage) {
  if (usage.input === void 0 && usage.cacheRead === void 0 && usage.cacheWrite === void 0) return void 0;
  return (usage.input ?? 0) + (usage.cacheRead ?? 0) + (usage.cacheWrite ?? 0);
}
function UsageRows({ usage, t }) {
  if (usage === void 0) return /* @__PURE__ */ jsx23("p", { className: TrajectoryTable_default.noPayload, children: t("usage.notReported") });
  const totalInput = inputTotal(usage);
  const otherOutput = usage.output !== void 0 && usage.reasoning !== void 0 ? usage.output - usage.reasoning : void 0;
  return /* @__PURE__ */ jsxs16("dl", { className: TrajectoryTable_default.overview, children: [
    totalInput !== void 0 && /* @__PURE__ */ jsxs16("div", { children: [
      /* @__PURE__ */ jsx23("dt", { children: t("usage.input") }),
      /* @__PURE__ */ jsx23("dd", { children: t("unit.tokens", { value: totalInput }) })
    ] }),
    usage.cacheRead !== void 0 && /* @__PURE__ */ jsxs16("div", { className: TrajectoryTable_default.requestTokenDetail, children: [
      /* @__PURE__ */ jsx23("dt", { children: t("usage.cached") }),
      /* @__PURE__ */ jsx23("dd", { children: t("unit.tokens", { value: usage.cacheRead }) })
    ] }),
    usage.cacheWrite !== void 0 && /* @__PURE__ */ jsxs16("div", { className: TrajectoryTable_default.requestTokenDetail, children: [
      /* @__PURE__ */ jsx23("dt", { children: t("usage.cacheCreated") }),
      /* @__PURE__ */ jsx23("dd", { children: t("unit.tokens", { value: usage.cacheWrite }) })
    ] }),
    usage.input !== void 0 && /* @__PURE__ */ jsxs16("div", { className: TrajectoryTable_default.requestTokenDetail, children: [
      /* @__PURE__ */ jsx23("dt", { children: t("usage.other") }),
      /* @__PURE__ */ jsx23("dd", { children: t("unit.tokens", { value: usage.input }) })
    ] }),
    usage.output !== void 0 && /* @__PURE__ */ jsxs16("div", { children: [
      /* @__PURE__ */ jsx23("dt", { children: t("usage.output") }),
      /* @__PURE__ */ jsx23("dd", { children: t("unit.tokens", { value: usage.output }) })
    ] }),
    usage.reasoning !== void 0 && /* @__PURE__ */ jsxs16("div", { className: TrajectoryTable_default.requestTokenDetail, children: [
      /* @__PURE__ */ jsx23("dt", { children: t("usage.reasoning") }),
      /* @__PURE__ */ jsx23("dd", { children: t("unit.tokens", { value: usage.reasoning }) })
    ] }),
    otherOutput !== void 0 && /* @__PURE__ */ jsxs16("div", { className: TrajectoryTable_default.requestTokenDetail, children: [
      /* @__PURE__ */ jsx23("dt", { children: t("usage.content") }),
      /* @__PURE__ */ jsx23("dd", { children: t("unit.tokens", { value: otherOutput }) })
    ] })
  ] });
}
function RequestUsagePanel({
  usage,
  cumulative,
  t
}) {
  return /* @__PURE__ */ jsxs16("div", { className: TrajectoryTable_default.usagePanel, children: [
    /* @__PURE__ */ jsxs16("section", { className: TrajectoryTable_default.usageGroup, children: [
      /* @__PURE__ */ jsx23("h4", { className: TrajectoryTable_default.usageHeading, children: t("usage.thisRequest") }),
      /* @__PURE__ */ jsx23(UsageRows, { usage, t })
    ] }),
    /* @__PURE__ */ jsxs16("section", { className: TrajectoryTable_default.usageGroup, children: [
      /* @__PURE__ */ jsx23("h4", { className: TrajectoryTable_default.usageHeading, children: t("usage.sessionCumulative") }),
      /* @__PURE__ */ jsx23(UsageRows, { usage: cumulative, t })
    ] })
  ] });
}
function RequestOptions({
  options,
  preview = false,
  stringWrapping,
  t
}) {
  if (options === void 0) {
    return /* @__PURE__ */ jsx23("p", { className: TrajectoryTable_default.noPayload, children: t("options.notRecorded") });
  }
  return /* @__PURE__ */ jsx23(
    JsonTree,
    {
      data: options,
      stringWrapping,
      collapsedStringLines: preview ? 3 : 12,
      label: t("options.json"),
      labels: jsonTreeLabels(t),
      className: preview ? TrajectoryTable_default.jsonPreview : TrajectoryTable_default.jsonPayload
    }
  );
}
function messageSourceLabel(source, t) {
  if (typeof source !== "object" || source === null || Array.isArray(source)) {
    return t("source.unknown");
  }
  const properties = source;
  const kind = properties.kind;
  if (kind === "user") return t("source.user");
  if (kind === "goal") {
    const round = properties.round;
    return typeof round === "number" && round > 0 ? t("source.goalRound", { round }) : t("source.goal");
  }
  if (typeof kind !== "string" || kind === "") return t("source.unknown");
  return `${kind[0]?.toUpperCase() ?? ""}${kind.slice(1)}`;
}
function MessageSource({ record: record2, stringWrapping, t }) {
  const source = record2.cell.messageSource;
  if (source === void 0) return /* @__PURE__ */ jsx23("p", { className: TrajectoryTable_default.noPayload, children: t("source.notRecorded") });
  const data = typeof source === "object" && source !== null ? source : { value: source };
  return /* @__PURE__ */ jsx23(
    JsonTree,
    {
      data,
      stringWrapping,
      collapsedStringLines: 12,
      label: t("source.messageJson"),
      labels: jsonTreeLabels(t),
      className: TrajectoryTable_default.jsonPayload
    }
  );
}
function isMarkdownRecord(record2) {
  return record2.cell.kind === "user" || record2.cell.kind === "context" || record2.cell.kind === "message";
}
function parentRecords(records, record2) {
  if (record2.cell.kind !== "tool" && record2.cell.kind !== "subtool") return {};
  const at = records.findIndex((candidate) => candidate.cell.index === record2.cell.index);
  if (at === -1) return {};
  let tool;
  if (record2.cell.kind === "subtool") {
    for (let i = at - 1; i >= 0; i--) {
      const candidate = records[i];
      if (candidate === void 0 || candidate.turn !== record2.turn || candidate.group !== record2.group) break;
      if (candidate.cell.kind === "tool") {
        tool = candidate;
        break;
      }
    }
  }
  const parentCallId = tool?.cell.callId ?? record2.cell.callId;
  let message;
  if (parentCallId !== void 0) {
    message = records.find(
      (candidate) => candidate.turn === record2.turn && candidate.cell.kind === "message" && candidate.cell.sourceBlocks?.some((block) => block.callId === parentCallId) === true
    );
  }
  return { ...message === void 0 ? {} : { message }, ...tool === void 0 ? {} : { tool } };
}
function markdownSource(record2) {
  if (record2.cell.kind === "user" || record2.cell.kind === "context") {
    return record2.cell.inputDetail;
  }
  if (record2.cell.kind === "message" || record2.cell.kind === "compacted") {
    return record2.cell.outputDetail;
  }
  return void 0;
}
function detailTabs(record2) {
  if (record2.cell.kind === "system") {
    if (record2.cell.promptDetail === void 0 && record2.cell.systemPromptDetail !== void 0) {
      return SYSTEM_PROMPT_TABS.filter((tab) => tab.id === "system-prompt");
    }
    return record2.cell.previousPromptDetail === void 0 ? SYSTEM_PROMPT_TABS : SYSTEM_UPDATE_TABS;
  }
  if (record2.cell.kind === "compacted") {
    return [
      { id: "overview", labelKey: "tab.summary" },
      { id: "raw", labelKey: "tab.rawOutput" }
    ];
  }
  if (isMarkdownRecord(record2)) {
    return [
      { id: "overview", labelKey: "tab.summary" },
      { id: "rendered", labelKey: "tab.preview" },
      { id: "raw", labelKey: "tab.raw" },
      ...record2.cell.messageSource === void 0 ? [] : [{ id: "source", labelKey: "tab.source" }]
    ];
  }
  return [
    { id: "overview", labelKey: "tab.summary" },
    ...record2.cell.inputDetail ? [{
      id: "input",
      labelKey: codeProgram(record2.cell) === void 0 ? "tab.payload" : "code.source"
    }] : [],
    ...record2.cell.outputDetail || codeProgram(record2.cell) !== void 0 ? [{ id: "output", labelKey: "tab.result" }] : [],
    { id: "schema", labelKey: "tab.schema" },
    { id: "timing", labelKey: "tab.timing" }
  ];
}
function recordDisplayText(cell, t) {
  if (isToolCallOnly(cell, t)) return "";
  const program = codeProgram(cell);
  if (program !== void 0) return `${PTC_TOOL_NAME} \xB7 ${program.description.replace(/\s+/g, " ")}`;
  if (cell.previewMarkdown !== void 0) {
    const preview = trajectoryPreviewText(cell.previewMarkdown);
    if (cell.text === "") return preview;
    return preview === "" ? cell.text : `${cell.text} \xB7 ${preview}`;
  }
  if (cell.text !== "") return cell.text;
  const markdown = cell.kind === "user" || cell.kind === "context" ? cell.inputDetail : cell.kind === "message" ? cell.outputDetail ?? cell.thinkingDetail : void 0;
  return markdown === void 0 ? "" : trajectoryPreviewText(markdown);
}
function recordResultText(cell) {
  return cell.resultPreviewMarkdown === void 0 ? cell.result : trajectoryPreviewText(cell.resultPreviewMarkdown);
}
function toolCallTextParts(cell, text) {
  if (cell.kind !== "tool" && cell.kind !== "subtool") return void 0;
  const program = cell.toolName === PTC_TOOL_NAME;
  const separator = text.indexOf(" \xB7 ");
  if (separator === -1) return { name: text, program };
  return {
    program,
    name: text.slice(0, separator),
    args: text.slice(separator + 3)
  };
}
function isToolCallOnly(cell, t) {
  return cell.kind === "message" && !cell.outputDetail && !cell.thinkingDetail && cell.text === t("layout.toolCallOnly");
}
function RecordPresentation({
  cell,
  children,
  t
}) {
  const displayText = useMemo4(
    () => recordDisplayText(cell, t),
    [
      cell.kind,
      cell.text,
      cell.toolName,
      cell.previewMarkdown,
      cell.inputDetail,
      cell.outputDetail,
      cell.thinkingDetail,
      t
    ]
  );
  const resultText = useMemo4(
    () => recordResultText(cell),
    [cell.result, cell.resultPreviewMarkdown]
  );
  const toolCallOnly = isToolCallOnly(cell, t);
  const toolCallText = toolCallTextParts(cell, displayText);
  const listDisplayText = toolCallOnly ? t("record.toolCallOnly") : toolCallText === void 0 ? displayText : [toolCallText.name, toolCallText.args].filter(Boolean).join(" ");
  return children({
    displayText,
    listDisplayText,
    resultText,
    toolCallOnly,
    toolCallText
  });
}
function RecordListText({
  displayText,
  toolCallOnly,
  toolCallText,
  t
}) {
  if (toolCallOnly) {
    return /* @__PURE__ */ jsx23("span", { className: TrajectoryTable_default.toolCallOnly, children: t("record.toolCallOnly") });
  }
  if (toolCallText === void 0) return displayText || "\u2014";
  return /* @__PURE__ */ jsxs16(Fragment6, { children: [
    /* @__PURE__ */ jsxs16("span", { className: TrajectoryTable_default.toolCallNameTypeface, children: [
      toolCallText.program && /* @__PURE__ */ jsx23(IconCodeOutlineRegular, { className: TrajectoryTable_default.programIcon, size: 12 }),
      toolCallText.name || "\u2014"
    ] }),
    toolCallText.args !== void 0 && /* @__PURE__ */ jsx23("span", { className: toolCallText.program ? TrajectoryTable_default.programSummary : TrajectoryTable_default.toolCallPayload, children: toolCallText.args })
  ] });
}
function MarkdownFragment({
  text,
  rendered,
  preview,
  variant = "body",
  t
}) {
  const labels = useMemo4(() => markdownLabels(t), [t]);
  if (rendered) {
    return /* @__PURE__ */ jsx23("div", { className: preview ? TrajectoryTable_default.markdownPreview : TrajectoryTable_default.markdownPayload, children: /* @__PURE__ */ jsx23(MarkdownText, { text, labels, variant }) });
  }
  return /* @__PURE__ */ jsx23("pre", { className: `${TrajectoryTable_default.payload} ${preview ? TrajectoryTable_default.payloadPreview : ""}`, children: text });
}
function SourceBlocks({
  blocks,
  onOpenCall,
  t
}) {
  const attachments = new Map(recordAttachments(blocks, t).map((entry) => [entry.index, entry]));
  return /* @__PURE__ */ jsx23("div", { className: TrajectoryTable_default.sourceBlocks, children: blocks.map((block, index) => {
    const attachment = attachments.get(index);
    return attachment !== void 0 ? /* @__PURE__ */ jsxs16("details", { className: TrajectoryTable_default.attachmentDisclosure, children: [
      /* @__PURE__ */ jsxs16("summary", { children: [
        /* @__PURE__ */ jsx23("span", { className: TrajectoryTable_default.sourceBlockLabel, children: t("block.label", { index: index + 1, type: block.type }) }),
        /* @__PURE__ */ jsx23("span", { className: TrajectoryTable_default.attachmentName, title: attachment.name, children: attachment.name })
      ] }),
      /* @__PURE__ */ jsx23("pre", { className: TrajectoryTable_default.sourceBlockContent, children: block.content })
    ] }, index) : /* @__PURE__ */ jsxs16("section", { className: TrajectoryTable_default.sourceBlock, children: [
      block.callId !== void 0 ? /* @__PURE__ */ jsxs16(
        "button",
        {
          type: "button",
          className: TrajectoryTable_default.sourceBlockJumpTarget,
          "aria-label": t("block.openSummary", { index: index + 1 }),
          title: t("block.openSummaryTitle"),
          onClick: () => {
            if (block.callId !== void 0) onOpenCall(block.callId);
          },
          children: [
            /* @__PURE__ */ jsx23("span", { className: TrajectoryTable_default.sourceBlockLabel, children: t("block.label", { index: index + 1, type: block.type }) }),
            /* @__PURE__ */ jsx23(IconChevronRightOutlineRegular, { className: TrajectoryTable_default.sourceBlockJumpIcon, size: 12 })
          ]
        }
      ) : /* @__PURE__ */ jsx23("div", { className: TrajectoryTable_default.sourceBlockHeader, children: /* @__PURE__ */ jsx23("span", { className: TrajectoryTable_default.sourceBlockLabel, children: t("block.label", { index: index + 1, type: block.type }) }) }),
      /* @__PURE__ */ jsx23("pre", { className: TrajectoryTable_default.sourceBlockContent, children: block.content })
    ] }, index);
  }) });
}
function recordAttachments(blocks, t) {
  let imageIndex = 0;
  return (blocks ?? []).flatMap((block, index) => {
    const ref = block.attachment ?? block.file;
    if (ref === void 0) return [];
    if (block.attachment !== void 0) imageIndex += 1;
    return [{
      block,
      index,
      name: ref.name ?? t("attachment.imageName", { index: imageIndex }),
      metadata: [
        block.attachment?.mediaType ?? fileExtension(ref.name ?? "").toUpperCase(),
        fileSizeText(ref.bytes),
        ...block.attachment === void 0 ? [] : [`${block.attachment.width} \xD7 ${block.attachment.height}`]
      ].filter(Boolean).join(" \xB7 ")
    }];
  });
}
function RecordAttachments({
  blocks,
  preview,
  renderSlot,
  loadImage,
  t
}) {
  const attachments = recordAttachments(blocks, t);
  if (attachments.length === 0) return null;
  return /* @__PURE__ */ jsx23(
    "ul",
    {
      className: preview ? `${TrajectoryTable_default.attachments} ${TrajectoryTable_default.attachmentsPreview}` : TrajectoryTable_default.attachments,
      "aria-label": t("attachment.list"),
      children: attachments.map(({ block, index, name, metadata }) => /* @__PURE__ */ jsxs16("li", { className: TrajectoryTable_default.attachmentRow, children: [
        block.attachment !== void 0 ? renderSlot("conversation.trajectory.images", {
          images: [{ attachment: block.attachment, label: name }],
          align: "start",
          thumbnail: true,
          loadImage
        }) : /* @__PURE__ */ jsx23("span", { className: TrajectoryTable_default.attachmentIcon, children: /* @__PURE__ */ jsx23(FileTypeIcon, { path: name }) }),
        /* @__PURE__ */ jsxs16("div", { className: TrajectoryTable_default.attachmentInfo, children: [
          /* @__PURE__ */ jsx23("span", { className: TrajectoryTable_default.attachmentName, title: name, children: name }),
          /* @__PURE__ */ jsx23("span", { className: TrajectoryTable_default.attachmentMetadata, children: metadata })
        ] })
      ] }, index))
    }
  );
}
function AssistantToolCalls({
  blocks,
  preview,
  onOpenCall,
  t
}) {
  const calls = blocks?.filter((block) => block.type === "tool-call") ?? [];
  if (calls.length === 0) return null;
  return /* @__PURE__ */ jsx23(
    "ul",
    {
      className: preview ? `${TrajectoryTable_default.assistantToolCalls} ${TrajectoryTable_default.assistantToolCallsPreview}` : TrajectoryTable_default.assistantToolCalls,
      children: calls.map((call, index) => /* @__PURE__ */ jsx23("li", { children: /* @__PURE__ */ jsxs16(
        "button",
        {
          type: "button",
          className: TrajectoryTable_default.assistantToolCallButton,
          title: t("block.openSummaryTitle"),
          onClick: () => {
            if (call.callId !== void 0) onOpenCall(call.callId);
          },
          children: [
            /* @__PURE__ */ jsx23(
              "svg",
              {
                className: TrajectoryTable_default.assistantToolCallIcon,
                width: "12",
                height: "12",
                viewBox: "0 0 24 24",
                fill: "none",
                "aria-hidden": "true",
                children: /* @__PURE__ */ jsx23(
                  "path",
                  {
                    d: "M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94z",
                    stroke: "currentColor",
                    strokeWidth: "1.8",
                    strokeLinecap: "round",
                    strokeLinejoin: "round"
                  }
                )
              }
            ),
            /* @__PURE__ */ jsxs16("span", { className: TrajectoryTable_default.assistantToolCallText, children: [
              /* @__PURE__ */ jsx23("span", { className: TrajectoryTable_default.assistantToolCallName, children: call.toolName ?? t("details.toolCall") }),
              call.content !== "" && /* @__PURE__ */ jsx23("span", { className: TrajectoryTable_default.assistantToolCallArgs, children: call.content })
            ] })
          ]
        }
      ) }, call.callId ?? index))
    }
  );
}
function ToolGlyph() {
  return /* @__PURE__ */ jsx23(
    "svg",
    {
      className: TrajectoryTable_default.toolCatalogIcon,
      width: "12",
      height: "12",
      viewBox: "0 0 24 24",
      fill: "none",
      "aria-hidden": "true",
      children: /* @__PURE__ */ jsx23(
        "path",
        {
          d: "M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94z",
          stroke: "currentColor",
          strokeWidth: "1.8",
          strokeLinecap: "round",
          strokeLinejoin: "round"
        }
      )
    }
  );
}
function ToolCatalog({
  tools,
  stringWrapping,
  t
}) {
  if (tools.length === 0) return /* @__PURE__ */ jsx23("p", { className: TrajectoryTable_default.noPayload, children: t("record.toolsMissing") });
  return /* @__PURE__ */ jsx23("div", { className: TrajectoryTable_default.toolCatalog, children: tools.map((tool, index) => /* @__PURE__ */ jsxs16("details", { className: TrajectoryTable_default.toolCatalogItem, children: [
    /* @__PURE__ */ jsxs16("summary", { className: TrajectoryTable_default.toolCatalogSummary, children: [
      /* @__PURE__ */ jsx23(IconChevronRightOutlineRegular, { className: TrajectoryTable_default.toolCatalogChevron, size: 12 }),
      /* @__PURE__ */ jsx23(ToolGlyph, {}),
      /* @__PURE__ */ jsx23("span", { className: TrajectoryTable_default.toolCatalogName, children: tool.name }),
      /* @__PURE__ */ jsx23("span", { className: TrajectoryTable_default.toolCatalogDescription, children: tool.description })
    ] }),
    /* @__PURE__ */ jsxs16("div", { className: TrajectoryTable_default.toolCatalogDefinition, children: [
      tool.description !== "" && /* @__PURE__ */ jsx23("p", { className: TrajectoryTable_default.toolCatalogFullDescription, children: tool.description }),
      /* @__PURE__ */ jsx23(
        JsonTree,
        {
          data: tool.parameters,
          stringWrapping,
          label: t("record.namedParametersJson", { name: tool.name }),
          labels: jsonTreeLabels(t),
          className: TrajectoryTable_default.toolCatalogTree
        }
      )
    ] })
  ] }, `${tool.name}:${index}`)) });
}
function promptDiffLines(before, after) {
  const patch = structuredPatch("", "", before, after, void 0, void 0, { context: 3 });
  return patch.hunks.flatMap((hunk, hunkIndex) => [
    ...hunkIndex === 0 ? [] : [{ kind: "meta", text: "" }],
    {
      kind: "meta",
      text: `@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@`
    },
    ...hunk.lines.flatMap((line) => {
      if (line.startsWith("\\")) return [];
      if (line.startsWith("+")) return [{ kind: "added", text: line }];
      if (line.startsWith("-")) return [{ kind: "removed", text: line }];
      return [{ kind: "context", text: line }];
    })
  ]);
}
function PromptDiffSection({
  title,
  before,
  after
}) {
  const lines = promptDiffLines(before, after);
  if (lines.length === 0) return null;
  return /* @__PURE__ */ jsxs16("section", { className: TrajectoryTable_default.promptDiffSection, children: [
    /* @__PURE__ */ jsx23("h3", { className: TrajectoryTable_default.promptDiffTitle, children: title }),
    /* @__PURE__ */ jsx23("pre", { className: TrajectoryTable_default.promptDiff, children: lines.map((line, index) => /* @__PURE__ */ jsxs16("span", { className: TrajectoryTable_default[`promptDiffLine${line.kind}`], children: [
      line.text || " ",
      "\n"
    ] }, index)) })
  ] });
}
function SystemPromptDiff({
  before,
  after,
  t
}) {
  const toolsBefore = JSON.stringify(before.tools, null, 2);
  const toolsAfter = JSON.stringify(after.tools, null, 2);
  return /* @__PURE__ */ jsxs16("div", { className: TrajectoryTable_default.promptDiffSections, children: [
    before.system !== after.system && /* @__PURE__ */ jsx23(
      PromptDiffSection,
      {
        title: t("record.systemPrompt"),
        before: before.system,
        after: after.system
      }
    ),
    toolsBefore !== toolsAfter && /* @__PURE__ */ jsx23(
      PromptDiffSection,
      {
        title: t("record.tools"),
        before: toolsBefore,
        after: toolsAfter
      }
    )
  ] });
}
function ToolOutputBlocks({
  blocks,
  error,
  errorDetail,
  preview,
  renderSlot,
  loadImage
}) {
  return /* @__PURE__ */ jsxs16(
    "div",
    {
      className: [
        TrajectoryTable_default.resultBlocks,
        preview ? TrajectoryTable_default.resultBlocksPreview : void 0,
        error ? TrajectoryTable_default.errorPayload : void 0
      ].filter((value) => value !== void 0).join(" "),
      children: [
        error && errorDetail !== void 0 && errorDetail !== "" && /* @__PURE__ */ jsx23("pre", { className: TrajectoryTable_default.resultBlockText, children: errorDetail }),
        blocks.map((block, index) => block.attachment !== void 0 ? /* @__PURE__ */ jsx23("div", { className: TrajectoryTable_default.messageImages, children: renderSlot("conversation.trajectory.images", { images: [{ attachment: block.attachment }], align: "start", loadImage }) }, index) : block.content !== "" ? /* @__PURE__ */ jsx23("pre", { className: TrajectoryTable_default.resultBlockText, children: block.content }, index) : null)
      ]
    }
  );
}
function MarkdownRecordContent({
  record: record2,
  rendered,
  preview = false,
  thinkingExpanded,
  onThinkingExpandedChange,
  onOpenCall,
  renderSlot,
  loadImage,
  t
}) {
  if (record2.cell.sourceBlocks?.length && record2.cell.sourceBlocks.every((block) => block.type === "tool-addition" || block.type === "tool-removal")) {
    return /* @__PURE__ */ jsx23("pre", { className: `${TrajectoryTable_default.payload} ${TrajectoryTable_default.toolUpdatePayload}`, children: record2.cell.inputDetail });
  }
  if (!rendered && record2.cell.sourceBlocks && record2.cell.sourceBlocks.length > 0) {
    return /* @__PURE__ */ jsx23(
      SourceBlocks,
      {
        blocks: record2.cell.sourceBlocks,
        onOpenCall,
        t
      }
    );
  }
  if (record2.cell.thinkingDetail) {
    if (!rendered) {
      const source2 = [
        record2.cell.thinkingDetail,
        record2.cell.outputDetail
      ].filter((value) => value !== void 0 && value !== "").join("\n\n");
      return /* @__PURE__ */ jsx23(MarkdownFragment, { text: source2, rendered: false, preview, t });
    }
    return /* @__PURE__ */ jsxs16("div", { className: `${TrajectoryTable_default.assistantContent} ${TrajectoryTable_default.assistantContentRendered}`, children: [
      /* @__PURE__ */ jsxs16(
        "div",
        {
          className: preview && !record2.cell.outputDetail ? `${TrajectoryTable_default.thinkingQuote} ${TrajectoryTable_default.thinkingQuoteOnlyPreview}` : TrajectoryTable_default.thinkingQuote,
          children: [
            /* @__PURE__ */ jsxs16(
              "button",
              {
                type: "button",
                className: TrajectoryTable_default.thinkingToggle,
                "aria-expanded": thinkingExpanded,
                onClick: () => {
                  onThinkingExpandedChange(!thinkingExpanded);
                },
                children: [
                  t("record.thinking"),
                  /* @__PURE__ */ jsx23(IconChevronRightOutlineRegular, { className: TrajectoryTable_default.thinkingChevron, size: 12 })
                ]
              }
            ),
            thinkingExpanded && /* @__PURE__ */ jsx23(
              MarkdownFragment,
              {
                text: record2.cell.thinkingDetail,
                rendered,
                preview,
                variant: "compact",
                t
              }
            )
          ]
        }
      ),
      record2.cell.outputDetail && /* @__PURE__ */ jsx23("div", { className: TrajectoryTable_default.assistantOutput, children: /* @__PURE__ */ jsx23(
        MarkdownFragment,
        {
          text: record2.cell.outputDetail,
          rendered,
          preview,
          t
        }
      ) }),
      /* @__PURE__ */ jsx23(
        AssistantToolCalls,
        {
          blocks: record2.cell.sourceBlocks,
          preview,
          onOpenCall,
          t
        }
      ),
      /* @__PURE__ */ jsx23(
        RecordAttachments,
        {
          blocks: record2.cell.sourceBlocks,
          preview,
          renderSlot,
          loadImage,
          t
        }
      )
    ] });
  }
  const source = markdownSource(record2);
  const hasAttachments = record2.cell.sourceBlocks?.some((block) => block.attachment !== void 0 || block.file !== void 0) === true;
  const hasToolCalls = record2.cell.kind === "message" && record2.cell.sourceBlocks?.some((block) => block.type === "tool-call") === true;
  if (!source && !hasAttachments && !hasToolCalls) {
    const emptyLabel = isToolCallOnly(record2.cell, t) ? t("record.toolCallOnly") : record2.cell.text || t("record.noContent");
    return /* @__PURE__ */ jsx23("p", { className: TrajectoryTable_default.noPayload, children: emptyLabel });
  }
  if (!rendered || !hasAttachments && !hasToolCalls) {
    return /* @__PURE__ */ jsx23(MarkdownFragment, { text: source ?? "", rendered, preview, t });
  }
  return /* @__PURE__ */ jsxs16("div", { children: [
    source && /* @__PURE__ */ jsx23(MarkdownFragment, { text: source, rendered: true, preview, t }),
    record2.cell.kind === "message" && /* @__PURE__ */ jsx23(
      AssistantToolCalls,
      {
        blocks: record2.cell.sourceBlocks,
        preview,
        onOpenCall,
        t
      }
    ),
    /* @__PURE__ */ jsx23(
      RecordAttachments,
      {
        blocks: record2.cell.sourceBlocks,
        preview,
        renderSlot,
        loadImage,
        t
      }
    )
  ] });
}
function RecordTiming({
  record: record2,
  preview = false,
  t
}) {
  return record2.cell.kind === "message" && record2.cell.assistantMetrics !== void 0 ? /* @__PURE__ */ jsx23(AssistantTimingPanel, { metrics: record2.cell.assistantMetrics, t }) : /* @__PURE__ */ jsxs16("dl", { className: TrajectoryTable_default.overview, children: [
    /* @__PURE__ */ jsxs16("div", { children: [
      /* @__PURE__ */ jsx23("dt", { children: t("timing.started") }),
      /* @__PURE__ */ jsx23(StartedAtValue, { timestamp: record2.cell.startedAt ?? null, t })
    ] }),
    /* @__PURE__ */ jsxs16("div", { children: [
      /* @__PURE__ */ jsx23("dt", { children: t("timing.duration") }),
      /* @__PURE__ */ jsx23("dd", { children: formatElapsedSeconds(record2.cell.timeSeconds, t) })
    ] }),
    !preview && /* @__PURE__ */ jsxs16("div", { children: [
      /* @__PURE__ */ jsx23("dt", { children: t("timing.source") }),
      /* @__PURE__ */ jsx23("dd", { children: record2.cell.timeSeconds === null ? t("timing.notAvailable") : t("timing.sessionTimestamps") })
    ] })
  ] });
}
function RequestTiming({
  assistant,
  anchor,
  request,
  preview = false,
  t
}) {
  if (assistant !== void 0) return /* @__PURE__ */ jsx23(RecordTiming, { record: assistant, preview, t });
  if (request?.startedAt !== void 0) {
    const duration = request.completedAt === null || request.completedAt === void 0 ? null : Math.max(0, (request.completedAt - request.startedAt) / 1e3);
    return /* @__PURE__ */ jsxs16("dl", { className: TrajectoryTable_default.overview, children: [
      /* @__PURE__ */ jsxs16("div", { children: [
        /* @__PURE__ */ jsx23("dt", { children: t("timing.started") }),
        /* @__PURE__ */ jsx23(StartedAtValue, { timestamp: request.startedAt, t })
      ] }),
      /* @__PURE__ */ jsxs16("div", { children: [
        /* @__PURE__ */ jsx23("dt", { children: t("timing.duration") }),
        /* @__PURE__ */ jsx23("dd", { children: formatElapsedSeconds(duration, t) })
      ] }),
      !preview && /* @__PURE__ */ jsxs16("div", { children: [
        /* @__PURE__ */ jsx23("dt", { children: t("timing.source") }),
        /* @__PURE__ */ jsx23("dd", { children: duration === null ? t("timing.sessionTimestampsRunning") : t("timing.sessionTimestamps") })
      ] })
    ] });
  }
  return /* @__PURE__ */ jsxs16("dl", { className: TrajectoryTable_default.overview, children: [
    /* @__PURE__ */ jsxs16("div", { children: [
      /* @__PURE__ */ jsx23("dt", { children: t("timing.started") }),
      /* @__PURE__ */ jsx23(StartedAtValue, { timestamp: anchor?.cell.startedAt ?? null, t })
    ] }),
    /* @__PURE__ */ jsxs16("div", { children: [
      /* @__PURE__ */ jsx23("dt", { children: t("timing.duration") }),
      /* @__PURE__ */ jsx23("dd", { children: formatElapsedSeconds(null, t) })
    ] })
  ] });
}
function RecordPayload({
  record: record2,
  direction,
  preview = false,
  renderSlot,
  loadImage,
  stringWrapping,
  t
}) {
  const value = direction === "input" ? record2.cell.inputDetail : record2.cell.outputDetail;
  const missing = direction === "input" ? t("record.noPayload") : t("record.noResult");
  if (!value) return /* @__PURE__ */ jsx23("p", { className: TrajectoryTable_default.noPayload, children: missing });
  const error = direction === "output" && record2.cell.isError === true;
  const payloadClass = preview ? TrajectoryTable_default.jsonPreview : TrajectoryTable_default.jsonPayload;
  const payloadClassName = error ? `${payloadClass} ${TrajectoryTable_default.errorPayload}` : payloadClass;
  const json = parseJsonContainer(value);
  const singleTextResult = direction === "output" && record2.cell.outputBlocks?.length === 1 && record2.cell.outputBlocks[0]?.type === "text";
  if (singleTextResult && json !== void 0) {
    return /* @__PURE__ */ jsx23(
      JsonTree,
      {
        data: json,
        stringWrapping,
        collapsedStringLines: preview ? 3 : 12,
        label: t("record.resultJson"),
        labels: jsonTreeLabels(t),
        className: payloadClassName
      }
    );
  }
  if (direction === "output" && record2.cell.outputBlocks?.some((block) => block.attachment !== void 0 || block.content !== "") === true) {
    return /* @__PURE__ */ jsx23(
      ToolOutputBlocks,
      {
        blocks: record2.cell.outputBlocks,
        error,
        errorDetail: error ? value : void 0,
        preview,
        renderSlot,
        loadImage
      }
    );
  }
  const markdown = direction === "input" && (record2.cell.kind === "user" || record2.cell.kind === "context") || direction === "output" && record2.cell.kind === "message";
  if (markdown) {
    return /* @__PURE__ */ jsx23(
      "div",
      {
        className: [
          preview ? TrajectoryTable_default.markdownPreview : TrajectoryTable_default.markdownPayload,
          error ? TrajectoryTable_default.errorPayload : void 0
        ].filter((className) => className !== void 0).join(" "),
        children: /* @__PURE__ */ jsx23(MarkdownText, { text: value, labels: markdownLabels(t) })
      }
    );
  }
  if (json !== void 0) {
    return /* @__PURE__ */ jsx23(
      JsonTree,
      {
        data: json,
        stringWrapping,
        collapsedStringLines: preview ? 3 : 12,
        label: t(direction === "input" ? "record.payloadJson" : "record.outputJson"),
        labels: jsonTreeLabels(t),
        className: payloadClassName
      }
    );
  }
  return /* @__PURE__ */ jsx23(
    "pre",
    {
      className: [
        TrajectoryTable_default.payload,
        preview ? TrajectoryTable_default.payloadPreview : void 0,
        error ? TrajectoryTable_default.errorPayload : void 0,
        value === t("record.noOutput") ? TrajectoryTable_default.noOutputText : void 0
      ].filter((value2) => value2 !== void 0).join(" "),
      children: value
    }
  );
}
function RecordSchema({
  record: record2,
  preview = false,
  stringWrapping,
  t
}) {
  if (!record2.cell.schemaDetail) {
    return /* @__PURE__ */ jsx23("p", { className: TrajectoryTable_default.noPayload, children: t("record.schemaUnavailable") });
  }
  const schema = parseToolSchema(record2.cell.schemaDetail);
  if (schema !== void 0) {
    return /* @__PURE__ */ jsxs16("div", { className: preview ? `${TrajectoryTable_default.schema} ${TrajectoryTable_default.schemaPreview}` : TrajectoryTable_default.schema, children: [
      /* @__PURE__ */ jsxs16("header", { className: TrajectoryTable_default.schemaIntro, children: [
        /* @__PURE__ */ jsx23("h3", { className: TrajectoryTable_default.schemaName, children: schema.name }),
        /* @__PURE__ */ jsx23("p", { className: TrajectoryTable_default.schemaDescription, children: schema.description })
      ] }),
      /* @__PURE__ */ jsxs16("section", { className: TrajectoryTable_default.schemaParameters, children: [
        /* @__PURE__ */ jsx23("h4", { className: TrajectoryTable_default.schemaParametersTitle, children: t("record.parameters") }),
        /* @__PURE__ */ jsx23(
          JsonTree,
          {
            data: schema.parameters,
            stringWrapping,
            collapsedStringLines: preview ? 3 : 12,
            label: t("record.namedParametersJson", { name: schema.name }),
            labels: jsonTreeLabels(t),
            className: TrajectoryTable_default.schemaTree
          }
        )
      ] })
    ] });
  }
  return /* @__PURE__ */ jsx23("pre", { className: `${TrajectoryTable_default.payload} ${preview ? TrajectoryTable_default.payloadPreview : ""}`, children: record2.cell.schemaDetail });
}
function parseToolSchema(value) {
  try {
    const parsed = JSON.parse(value);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return void 0;
    const schema = parsed;
    if (typeof schema.name !== "string" || typeof schema.description !== "string" || typeof schema.parameters !== "object" || schema.parameters === null || Array.isArray(schema.parameters)) return void 0;
    return {
      name: schema.name,
      description: schema.description,
      parameters: schema.parameters
    };
  } catch {
    return void 0;
  }
}
function parseJsonContainer(value) {
  try {
    const parsed = JSON.parse(value);
    return typeof parsed === "object" && parsed !== null ? parsed : void 0;
  } catch {
    return void 0;
  }
}
function InspectorCopyButton({ text, label, t }) {
  const [state, setState] = useState10("idle");
  useEffect9(() => {
    if (state === "idle") return;
    const timer = setTimeout(() => {
      setState("idle");
    }, 1500);
    return () => {
      clearTimeout(timer);
    };
  }, [state]);
  const title = state === "idle" ? label : t(state === "copied" ? "copied" : "copy.failed");
  return /* @__PURE__ */ jsx23(
    "button",
    {
      type: "button",
      className: TrajectoryTable_default.programAction,
      "data-state": state,
      "aria-label": title,
      title,
      onClick: () => {
        void writeClipboard(text).then((ok) => {
          setState(ok ? "copied" : "failed");
        });
      },
      children: state === "copied" ? /* @__PURE__ */ jsx23(IconCheckOutlineRegular, { size: 12 }) : /* @__PURE__ */ jsx23(IconCopyOutlineRegular, { size: 12 })
    }
  );
}
function ProgramInput({ program, initialWrapped, stringWrapping, onOpen, t }) {
  const contentsId = useId6();
  const [wrapped, setWrapped] = useState10(initialWrapped);
  const [showJson, setShowJson] = useState10(false);
  const actions = /* @__PURE__ */ jsxs16("span", { className: TrajectoryTable_default.programActions, children: [
    !showJson && program.language !== void 0 && /* @__PURE__ */ jsx23("span", { className: TrajectoryTable_default.programLanguage, children: program.language }),
    !showJson && /* @__PURE__ */ jsx23(
      "button",
      {
        type: "button",
        className: TrajectoryTable_default.programAction,
        "aria-label": t("record.wrapLines"),
        title: t("record.wrapLines"),
        "aria-pressed": wrapped,
        "aria-controls": contentsId,
        onClick: () => {
          const next = !wrapped;
          setWrapped(next);
          stringWrapping?.setDefault(next);
        },
        children: /* @__PURE__ */ jsx23(IconWrapLinesOutlineRegular, { size: 12 })
      }
    ),
    onOpen === void 0 && /* @__PURE__ */ jsx23(
      "button",
      {
        type: "button",
        className: TrajectoryTable_default.programAction,
        "aria-label": t("code.originalJson"),
        title: t("code.originalJson"),
        "aria-pressed": showJson,
        "aria-controls": contentsId,
        onClick: () => {
          setShowJson((value) => !value);
        },
        children: /* @__PURE__ */ jsxs16(
          "svg",
          {
            width: "12",
            height: "12",
            viewBox: "0 0 16 16",
            fill: "none",
            stroke: "currentColor",
            strokeWidth: "1.5",
            strokeLinecap: "round",
            strokeLinejoin: "round",
            "aria-hidden": "true",
            children: [
              /* @__PURE__ */ jsx23("path", { d: "M6 2H5a2 2 0 0 0-2 2v2a2 2 0 0 1-2 2 2 2 0 0 1 2 2v2a2 2 0 0 0 2 2h1" }),
              /* @__PURE__ */ jsx23("path", { d: "M10 2h1a2 2 0 0 1 2 2v2a2 2 0 0 0 2 2 2 2 0 0 0-2 2v2a2 2 0 0 1-2 2h-1" })
            ]
          }
        )
      }
    ),
    /* @__PURE__ */ jsx23(
      InspectorCopyButton,
      {
        text: showJson ? program.rawInput : program.source,
        label: t(showJson ? "copy.json" : "code.copySource"),
        t
      }
    )
  ] });
  const body = /* @__PURE__ */ jsx23("div", { id: contentsId, className: TrajectoryTable_default.programContent, "data-wrap": wrapped, children: showJson ? /* @__PURE__ */ jsx23(
    JsonTree,
    {
      data: program.arguments,
      label: t("record.parametersJson"),
      labels: jsonTreeLabels(t),
      stringWrapping
    }
  ) : /* @__PURE__ */ jsx23(
    CodeBlock,
    {
      code: program.source,
      lang: program.language,
      lineNumbers: true,
      showHeader: false,
      className: TrajectoryTable_default.programSource,
      copyLabel: t("code.copySource"),
      copiedLabel: t("copied")
    }
  ) });
  return onOpen === void 0 ? /* @__PURE__ */ jsxs16("section", { className: TrajectoryTable_default.programPanel, children: [
    /* @__PURE__ */ jsxs16("header", { className: TrajectoryTable_default.overviewHeading, children: [
      /* @__PURE__ */ jsx23("span", { children: t("code.source") }),
      actions
    ] }),
    body
  ] }) : /* @__PURE__ */ jsx23(OverviewSection, { label: t("code.source"), onOpen, actions, children: body });
}
function ProgramOutput({ record: record2, stringWrapping, onOpen, t }) {
  const output = record2.cell.outputDetail;
  const json = output === void 0 || record2.cell.isError === true ? void 0 : parseJsonContainer(output);
  const actions = output === void 0 ? void 0 : /* @__PURE__ */ jsx23("span", { className: TrajectoryTable_default.programActions, children: /* @__PURE__ */ jsx23(InspectorCopyButton, { text: output, label: t("code.copyOutput"), t }) });
  const body = /* @__PURE__ */ jsx23("div", { className: TrajectoryTable_default.programContent, children: output === void 0 || output === "" ? /* @__PURE__ */ jsx23("p", { className: TrajectoryTable_default.noPayload, children: t(stateOf(record2) === "running" ? "code.running" : "record.noOutput") }) : json !== void 0 ? /* @__PURE__ */ jsx23(
    JsonTree,
    {
      data: json,
      label: t("record.outputJson"),
      labels: jsonTreeLabels(t),
      stringWrapping,
      collapsedStringLines: onOpen === void 0 ? 12 : 3
    }
  ) : /* @__PURE__ */ jsx23("pre", { className: `${TrajectoryTable_default.programOutput} ${record2.cell.isError === true ? TrajectoryTable_default.programError : ""}`, children: output }) });
  return onOpen === void 0 ? /* @__PURE__ */ jsxs16("section", { className: TrajectoryTable_default.programPanel, children: [
    /* @__PURE__ */ jsxs16("header", { className: TrajectoryTable_default.overviewHeading, children: [
      /* @__PURE__ */ jsx23("span", { children: t("code.output") }),
      actions
    ] }),
    body
  ] }) : /* @__PURE__ */ jsx23(OverviewSection, { label: t("code.output"), onOpen, actions, children: body });
}
function OverviewSection({
  label,
  onOpen,
  actions,
  children
}) {
  const previewRef = useRef11(null);
  const [hasMore, setHasMore] = useState10(false);
  const measureOverflow = useCallback8((preview) => {
    setHasMore(preview.scrollHeight - preview.clientHeight - preview.scrollTop > 1);
  }, []);
  useLayoutEffect6(() => {
    const preview = previewRef.current;
    const measure = () => {
      measureOverflow(preview);
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(preview);
    for (const child of preview.children) observer.observe(child);
    return () => {
      observer.disconnect();
    };
  }, [children, measureOverflow]);
  return /* @__PURE__ */ jsxs16("section", { className: TrajectoryTable_default.overviewSection, children: [
    /* @__PURE__ */ jsxs16("h3", { className: TrajectoryTable_default.overviewHeading, children: [
      /* @__PURE__ */ jsxs16(
        "button",
        {
          type: "button",
          className: TrajectoryTable_default.overviewTitle,
          onClick: onOpen,
          children: [
            /* @__PURE__ */ jsx23("span", { children: label }),
            /* @__PURE__ */ jsx23(IconChevronRightOutlineRegular, { className: TrajectoryTable_default.overviewTitleIcon, size: 12 })
          ]
        }
      ),
      actions
    ] }),
    /* @__PURE__ */ jsx23(
      "div",
      {
        ref: previewRef,
        className: `${TrajectoryTable_default.overviewPreview} ${TrajectoryTable_default.summaryScrollRegion}`,
        "data-summary-scroll-region": "",
        "data-scroll-more": hasMore || void 0,
        onScroll: (event) => {
          measureOverflow(event.currentTarget);
        },
        children
      }
    )
  ] });
}
function TrajectoryTable({
  t,
  stringWrapping,
  renderSlot,
  loadImage,
  requestNumbers: sessionRequestNumbers,
  turns,
  streamingCells = [],
  timelineFocusIndexes = null,
  searchMatchIndexes = null,
  onSelectedIndexChange,
  onRecordSelect,
  recordSelection = null,
  recordFocus = null,
  historyLoading = false,
  olderHistoryLoading = false,
  historyStartSeq,
  hasOlderRecords = false,
  onLoadOlder,
  onClearSelection,
  collapsedTurns,
  onToggleTurn,
  collapsedAssistants,
  onToggleAssistant,
  inspectCallId = null,
  onInspectApplied
}) {
  const [selectedRecordId, setSelectedRecordId] = useState10(null);
  const [selectedRequest, setSelectedRequest] = useState10(null);
  const [activeTab, setActiveTab] = useState10("overview");
  const [codeWrappingOnOpen, setCodeWrappingOnOpen] = useState10(false);
  const [thinkingDisclosure, setThinkingDisclosure] = useState10();
  const [detailsWidth, setDetailsWidth] = useState10(null);
  const [toolRequestOffset, setToolRequestOffset] = useState10(null);
  const detailsResizeDrag = useRef11(null);
  const appliedRecordSelection = useRef11(null);
  const appliedRecordFocus = useRef11(null);
  const tabHistory = useRef11(/* @__PURE__ */ new Set(["overview"]));
  const rootRef = useRef11(null);
  const tablePaneRef = useRef11(null);
  const followsTableTail = useRef11(false);
  const tableScrollInitialized = useRef11(false);
  const [tableScrollReady, setTableScrollReady] = useState10(false);
  const pendingScrollRecordId = useRef11(null);
  const loadingOlder = useRef11(false);
  const [olderLoading, setOlderLoading] = useState10(false);
  const olderLoadAnchor = useRef11(null);
  const allRecords = useMemo4(() => flattenRecords(turns), [turns]);
  const streamingCellsByIndex = useMemo4(
    () => new Map(streamingCells.map((cell) => [cell.index, cell])),
    [streamingCells]
  );
  const currentRecord = useCallback8((record2) => {
    const cell = streamingCellsByIndex.get(record2.cell.index);
    return cell === void 0 ? record2 : { ...record2, cell };
  }, [streamingCellsByIndex]);
  const selectedTemplate = useMemo4(
    () => selectedRecordId === null ? void 0 : allRecords.find((record2) => trajectoryRecordId(record2.cell) === selectedRecordId),
    [allRecords, selectedRecordId]
  );
  const selected = selectedTemplate === void 0 ? void 0 : currentRecord(selectedTemplate);
  const selectedProgram = selected === void 0 ? void 0 : codeProgram(selected.cell);
  const thinkingExpanded = thinkingDisclosure?.recordId === selectedRecordId ? thinkingDisclosure.expanded : selected?.cell.kind === "message" && Boolean(selected.cell.thinkingDetail?.trim());
  const setThinkingExpanded = (expanded) => {
    if (selectedRecordId !== null) {
      setThinkingDisclosure({ recordId: selectedRecordId, expanded });
    }
  };
  const selectedIndex = selected?.cell.index ?? null;
  useEffect9(() => {
    onSelectedIndexChange?.(selectedIndex);
  }, [onSelectedIndexChange, selectedIndex]);
  const requestGroups = useMemo4(() => new Set(
    (sessionRequestNumbers ?? []).map((request) => requestKey(request.turn, request.group))
  ), [sessionRequestNumbers]);
  const requestBoundaries = useMemo4(
    () => indexRequestBoundaries(allRecords, requestGroups),
    [allRecords, requestGroups]
  );
  const requestNumbers = useMemo4(
    () => indexRequestNumbers(sessionRequestNumbers),
    [sessionRequestNumbers]
  );
  const records = useMemo4(() => {
    if (searchMatchIndexes !== null) return filterRecords(allRecords, searchMatchIndexes);
    const turnRecords = collapsedTurns.size === 0 ? allRecords : collapseTurnRecords(allRecords, collapsedTurns, requestGroups, t);
    return collapsedAssistants.size === 0 ? turnRecords : collapseAssistantRecords(turnRecords, collapsedAssistants, t);
  }, [allRecords, collapsedAssistants, collapsedTurns, requestGroups, searchMatchIndexes, t]);
  const projectedVirtualRows = useMemo4(
    () => groupTrajectoryVirtualRows(records),
    [records]
  );
  const virtualRowStructure = useStableVirtualRowStructure(projectedVirtualRows);
  const virtualizationEnabled = hasOlderRecords || records.length > VIRTUALIZATION_THRESHOLD;
  const virtualScrollMargin = hasOlderRecords ? HISTORY_LOAD_ROW_HEIGHT_PX : 0;
  const estimateVirtualRowSize = useCallback8(
    (index) => virtualRowStructure[index]?.height ?? 30,
    [virtualRowStructure]
  );
  const getVirtualRowKey = useCallback8(
    (index) => virtualRowStructure[index]?.key ?? index,
    [virtualRowStructure]
  );
  const getTableScrollElement = useCallback8(() => tablePaneRef.current, []);
  const rowVirtualizer = useVirtualizer({
    count: virtualizationEnabled ? virtualRowStructure.length : 0,
    enabled: virtualizationEnabled,
    estimateSize: estimateVirtualRowSize,
    getItemKey: getVirtualRowKey,
    getScrollElement: getTableScrollElement,
    initialRect: { width: 0, height: VIRTUAL_INITIAL_VIEWPORT_HEIGHT_PX },
    anchorTo: "end",
    overscan: VIRTUAL_OVERSCAN_ROWS,
    scrollMargin: virtualScrollMargin,
    scrollEndThreshold: BOTTOM_FOLLOW_THRESHOLD_PX,
    followOnAppend: "auto"
  });
  const virtualIndexByRecordId = useMemo4(() => {
    const indexes = /* @__PURE__ */ new Map();
    for (const [virtualIndex, row] of projectedVirtualRows.entries()) {
      for (const entry of row.entries) {
        if (entry.record.collapsedSummary === void 0) {
          indexes.set(trajectoryRecordId(entry.record.cell), virtualIndex);
        }
      }
    }
    return indexes;
  }, [projectedVirtualRows]);
  const virtualItems = virtualizationEnabled ? rowVirtualizer.getVirtualItems() : [];
  const virtualTop = Math.max(0, (virtualItems[0]?.start ?? 0) - virtualScrollMargin);
  const virtualBottom = virtualItems.length === 0 ? 0 : Math.max(
    0,
    rowVirtualizer.getTotalSize() + virtualScrollMargin - (virtualItems.at(-1)?.end ?? 0)
  );
  const renderedRecords = virtualizationEnabled ? virtualItems.flatMap((item) => {
    const row = projectedVirtualRows[item.index];
    if (row === void 0) return [];
    return row.entries.map((entry, entryIndex) => ({
      record: currentRecord(entry.record),
      position: entry.logicalIndex,
      terminalRequestBoundary: entry.record.cell.requestOnly === true && row.entries.at(-1)?.record.cell.requestOnly === true && entryIndex === row.entries.length - 1
    }));
  }) : records.map((record2, position) => ({
    record: currentRecord(record2),
    position,
    terminalRequestBoundary: record2.cell.requestOnly === true && position === records.length - 1
  }));
  const requestBoundaryRuns = useMemo4(
    () => indexRequestBoundaryRuns(records, requestGroups),
    [records, requestGroups]
  );
  const selectedPrompt = selected?.cell.kind === "system" ? selected.cell.promptDetail : void 0;
  const selectedPreviousPrompt = selected?.cell.kind === "system" ? selected.cell.previousPromptDetail : void 0;
  const selectedSystemPrompt = selectedPrompt?.system ?? selected?.cell.systemPromptDetail;
  const promptSelected = selectedSystemPrompt !== void 0;
  const selectedState = selected === void 0 ? void 0 : stateOf(selected);
  const selectedRequestInfo = selectedRequest === null ? void 0 : sessionRequestNumbers?.find((request) => requestIdentity(request) === selectedRequest.identity);
  const selectedRequestRecordTemplates = useMemo4(() => selectedRequestInfo === void 0 ? [] : allRecords.filter(
    (record2) => record2.turn === selectedRequestInfo.turn && record2.group === selectedRequestInfo.group
  ), [allRecords, selectedRequestInfo]);
  const selectedRequestRecords = selectedRequestRecordTemplates.map(currentRecord);
  const selectedRequestAssistant = selectedRequestRecords.find(
    (record2) => record2.cell.kind === "message" && record2.cell.requestOnly !== true
  );
  const selectedRequestAnchor = selectedRequestAssistant ?? selectedRequestRecords[0];
  const selectedRequestNumber = selectedRequestInfo?.number;
  const selectedRequestState = selectedRequestInfo === void 0 ? void 0 : selectedRequestInfo.status ?? (selectedRequestAssistant?.cell.assistantMetrics?.completedTime === null ? "running" : selectedRequestAssistant === void 0 && selectedRequestRecords.some((record2) => stateOf(record2) === "running") ? "running" : "complete");
  const selectedRequestToolCalls = selectedRequestRecords.filter(
    (record2) => record2.cell.kind === "tool"
  ).length;
  const selectedRequestSubtoolCalls = selectedRequestRecords.filter(
    (record2) => record2.cell.kind === "subtool"
  ).length;
  const selectedRequestResultTemplate = selectedRequestInfo?.resultSeq === void 0 ? selectedRequestAssistant : allRecords.find((record2) => record2.cell.sourceSeq === selectedRequestInfo.resultSeq);
  const selectedRequestResult = selectedRequestResultTemplate === void 0 ? void 0 : currentRecord(selectedRequestResultTemplate);
  const selectedRequestUsage = selectedRequestInfo?.usage ?? (selectedRequestAssistant === void 0 ? void 0 : {
    ...selectedRequestAssistant.cell.input === void 0 ? {} : { input: selectedRequestAssistant.cell.input },
    ...selectedRequestAssistant.cell.cacheRead === void 0 ? {} : { cacheRead: selectedRequestAssistant.cell.cacheRead },
    ...selectedRequestAssistant.cell.cacheWrite === void 0 ? {} : { cacheWrite: selectedRequestAssistant.cell.cacheWrite },
    ...selectedRequestAssistant.cell.output === void 0 ? {} : { output: selectedRequestAssistant.cell.output },
    ...selectedRequestAssistant.cell.think === void 0 ? {} : { reasoning: selectedRequestAssistant.cell.think }
  });
  const selectedRequestCumulativeUsage = selectedRequestInfo?.cumulativeUsage ?? selectedRequestUsage;
  const selectedRequestOptions = selectedRequestInfo?.requestConfig;
  const activeTurn = selectedRequestInfo === void 0 ? selected?.turn : selectedRequestInfo.turn;
  const activeSection = selectedRequestInfo === void 0 ? selected?.section : selectedRequestRecords[0]?.section;
  const selectedTabs = selectedRequestInfo !== void 0 ? REQUEST_TABS.filter((tab) => tab.id !== "options" || selectedRequestOptions !== void 0) : selected === void 0 ? [] : detailTabs(selected);
  const selectedParents = selected === void 0 ? {} : parentRecords(allRecords, selected);
  const selectedParentMessage = selectedParents.message;
  const selectedParentTool = selectedParents.tool;
  const selectedAssistantRequest = selected?.cell.kind === "message" ? requestNumbers.get(requestKey(selected.turn, selected.group)) : void 0;
  const selectedAssistantRequestInfo = selectedAssistantRequest === void 0 ? void 0 : sessionRequestNumbers?.find((request) => request.number === selectedAssistantRequest);
  const selectedAssistantRequestTarget = selectedAssistantRequestInfo === void 0 ? void 0 : { identity: requestIdentity(selectedAssistantRequestInfo) };
  const hasSelectedHierarchy = selectedAssistantRequestTarget !== void 0 || selectedParents.message !== void 0 || selectedParents.tool !== void 0;
  const splitStyle = toolRequestOffset === null ? void 0 : {
    "--trajectory-tool-request-width": `calc(58cqw - ${toolRequestOffset}px)`
  };
  const activateTab = (tab) => {
    setCodeWrappingOnOpen(stringWrapping?.getDefault() ?? false);
    tabHistory.current.delete(tab);
    tabHistory.current.add(tab);
    setActiveTab(tab);
  };
  const clearInspectorSelection = () => {
    setSelectedRecordId(null);
    setSelectedRequest(null);
  };
  const clearAllSelections = () => {
    clearInspectorSelection();
    onClearSelection?.();
  };
  const selectRecord = useCallback8((index) => {
    setCodeWrappingOnOpen(stringWrapping?.getDefault() ?? false);
    const record2 = allRecords.find((candidate) => candidate.cell.index === index);
    onRecordSelect?.(index);
    setSelectedRequest(null);
    setSelectedRecordId(record2 === void 0 ? null : trajectoryRecordId(record2.cell));
    if (record2 === void 0) return;
    const tabs = detailTabs(record2);
    const available = new Set(tabs.map((tab) => tab.id));
    const recent = [...tabHistory.current].reverse().find((tab) => available.has(tab));
    setActiveTab(recent ?? tabs[0]?.id ?? "overview");
  }, [allRecords, onRecordSelect, stringWrapping]);
  useEffect9(() => {
    if (recordSelection === null || appliedRecordSelection.current === recordSelection) return;
    appliedRecordSelection.current = recordSelection;
    selectRecord(recordSelection.index);
    const record2 = allRecords.find((candidate) => candidate.cell.index === recordSelection.index);
    pendingScrollRecordId.current = record2 === void 0 ? null : trajectoryRecordId(record2.cell);
  }, [allRecords, recordSelection, selectRecord]);
  useEffect9(() => {
    if (recordFocus === null || appliedRecordFocus.current === recordFocus) return;
    appliedRecordFocus.current = recordFocus;
    const record2 = allRecords.find((candidate) => candidate.cell.index === recordFocus.index);
    pendingScrollRecordId.current = record2 === void 0 ? null : trajectoryRecordId(record2.cell);
  }, [allRecords, recordFocus]);
  const selectRequest = (request, tab = "overview") => {
    setSelectedRecordId(null);
    setSelectedRequest(request);
    activateTab(tab);
  };
  const openRecordSummary = (target) => {
    const targetAt = allRecords.findIndex((record2) => record2.cell.index === target.cell.index);
    if (target.turn !== null && collapsedTurns.has(target.turn)) onToggleTurn(target.turn);
    if (target.cell.kind === "tool" || target.cell.kind === "subtool") {
      for (let i = targetAt - 1; i >= 0; i--) {
        const candidate = allRecords[i];
        if (candidate === void 0 || candidate.turn !== target.turn) break;
        if (candidate.cell.kind !== "message") continue;
        const assistantId = trajectoryRecordId(candidate.cell);
        if (collapsedAssistants.has(assistantId)) onToggleAssistant(assistantId);
        break;
      }
    }
    setSelectedRequest(null);
    setSelectedRecordId(trajectoryRecordId(target.cell));
    activateTab("overview");
  };
  const openCallSummary = (callId) => {
    const target = allRecords.find((record2) => record2.cell.callId === callId);
    if (target !== void 0) openRecordSummary(target);
  };
  const openRecordSummaryRef = useRef11(openRecordSummary);
  openRecordSummaryRef.current = openRecordSummary;
  useEffect9(() => {
    if (inspectCallId === null) return;
    const target = flattenRecords(turns).find((record2) => record2.cell.callId === inspectCallId);
    if (target === void 0) return;
    openRecordSummaryRef.current(target);
    pendingScrollRecordId.current = trajectoryRecordId(target.cell);
    onInspectApplied?.();
  }, [inspectCallId, turns, onInspectApplied]);
  useEffect9(() => {
    const id = pendingScrollRecordId.current;
    if (id === null) return;
    const position = records.findIndex((record2) => trajectoryRecordId(record2.cell) === id && record2.collapsedSummary === void 0);
    if (position === -1) return;
    if (virtualizationEnabled) {
      const virtualIndex = virtualIndexByRecordId.get(id);
      if (virtualIndex === void 0) return;
      pendingScrollRecordId.current = null;
      followsTableTail.current = false;
      rowVirtualizer.scrollToIndex(virtualIndex, { behavior: "smooth", align: "center" });
      return;
    }
    pendingScrollRecordId.current = null;
    followsTableTail.current = false;
    const recordIndex = records[position]?.cell.index;
    const row = recordIndex === void 0 ? null : rootRef.current?.querySelector(`tr[data-record-index="${recordIndex}"]`);
    if (row !== void 0 && row !== null && typeof row.scrollIntoView === "function") {
      row.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [records, rowVirtualizer, virtualIndexByRecordId, virtualizationEnabled]);
  useEffect9(() => {
    if (timelineFocusIndexes === null || timelineFocusIndexes.size === 0) return;
    const focusedPositions = records.flatMap((record2, position) => record2.collapsedSummary === void 0 && record2.cell.requestOnly !== true && timelineFocusIndexes.has(record2.cell.index) ? [position] : []);
    const first = focusedPositions.at(0);
    const last = focusedPositions.at(-1);
    if (first === void 0 || last === void 0) return;
    if (!virtualizationEnabled) {
      const ledger = rootRef.current;
      if (ledger === null) return;
      const focusedRows = [
        ...ledger.querySelectorAll('tr[data-timeline-focus="inside"]')
      ];
      const firstRow = focusedRows.at(0);
      const lastRow = focusedRows.at(-1);
      if (firstRow === void 0 || lastRow === void 0) return;
      const focusHeight2 = lastRow.getBoundingClientRect().bottom - firstRow.getBoundingClientRect().top;
      const target = focusHeight2 > ledger.clientHeight ? firstRow : focusedRows[Math.floor((focusedRows.length - 1) / 2)];
      if (target !== void 0 && typeof target.scrollIntoView === "function") {
        followsTableTail.current = false;
        target.scrollIntoView({
          behavior: "smooth",
          block: focusHeight2 > ledger.clientHeight ? "start" : "center"
        });
      }
      return;
    }
    const focusedVirtualIndexes = [...new Set(focusedPositions.flatMap((position) => {
      const record2 = records[position];
      if (record2 === void 0) return [];
      const virtualIndex = virtualIndexByRecordId.get(trajectoryRecordId(record2.cell));
      return virtualIndex === void 0 ? [] : [virtualIndex];
    }))].sort((left, right) => left - right);
    const firstVirtual = focusedVirtualIndexes.at(0);
    const lastVirtual = focusedVirtualIndexes.at(-1);
    if (firstVirtual === void 0 || lastVirtual === void 0) return;
    const paneHeight = tablePaneRef.current?.clientHeight ?? 0;
    const focusHeight = projectedVirtualRows.slice(firstVirtual, lastVirtual + 1).reduce((height, row) => height + row.height, 0);
    followsTableTail.current = false;
    rowVirtualizer.scrollToIndex(
      focusHeight > paneHeight ? firstVirtual : focusedVirtualIndexes[Math.floor((focusedVirtualIndexes.length - 1) / 2)] ?? firstVirtual,
      {
        behavior: "smooth",
        align: focusHeight > paneHeight ? "start" : "center"
      }
    );
  }, [
    projectedVirtualRows,
    records,
    rowVirtualizer,
    timelineFocusIndexes,
    virtualIndexByRecordId,
    virtualizationEnabled
  ]);
  const requestOlder = useCallback8((pane, requireTop) => {
    if (!hasOlderRecords || onLoadOlder === void 0 || loadingOlder.current || olderHistoryLoading || requireTop && pane.scrollTop > OLDER_LOAD_THRESHOLD_PX) return;
    loadingOlder.current = true;
    setOlderLoading(true);
    olderLoadAnchor.current = {
      historyStartSeq,
      scrollHeight: pane.scrollHeight,
      scrollTop: pane.scrollTop
    };
    void onLoadOlder().then((advanced) => {
      if (!advanced) olderLoadAnchor.current = null;
    }).finally(() => {
      loadingOlder.current = false;
      setOlderLoading(false);
    });
  }, [hasOlderRecords, historyStartSeq, olderHistoryLoading, onLoadOlder]);
  useLayoutEffect6(() => {
    const pane = tablePaneRef.current;
    if (pane === null) return;
    const anchor = olderLoadAnchor.current;
    if (anchor !== null && anchor.historyStartSeq !== historyStartSeq) {
      if (!virtualizationEnabled) {
        pane.scrollTop = anchor.scrollTop + pane.scrollHeight - anchor.scrollHeight;
      }
      olderLoadAnchor.current = null;
      followsTableTail.current = false;
      return;
    }
    if (!tableScrollInitialized.current) {
      if (historyLoading) return;
      tableScrollInitialized.current = true;
      followsTableTail.current = true;
      if (virtualizationEnabled) rowVirtualizer.scrollToEnd({ behavior: "auto" });
      else pane.scrollTop = pane.scrollHeight;
      setTableScrollReady(true);
      return;
    }
    if (!followsTableTail.current) return;
    if (!virtualizationEnabled) pane.scrollTop = pane.scrollHeight;
  }, [
    historyLoading,
    historyStartSeq,
    rowVirtualizer,
    virtualRowStructure,
    virtualizationEnabled
  ]);
  const olderBusy = olderHistoryLoading || olderLoading;
  const showInitialLoading = historyLoading || !tableScrollReady;
  const historyRowOffset = hasOlderRecords ? 1 : 0;
  return /* @__PURE__ */ jsxs16("div", { ref: rootRef, className: TrajectoryTable_default.split, style: splitStyle, children: [
    /* @__PURE__ */ jsxs16(
      "div",
      {
        ref: tablePaneRef,
        className: TrajectoryTable_default.tablePane,
        "data-trajectory-scroll": "",
        onScroll: (event) => {
          const pane = event.currentTarget;
          followsTableTail.current = pane.scrollHeight - pane.clientHeight - pane.scrollTop <= BOTTOM_FOLLOW_THRESHOLD_PX;
          requestOlder(pane, true);
        },
        onClick: (event) => {
          if (event.target === event.currentTarget) clearAllSelections();
        },
        children: [
          showInitialLoading && /* @__PURE__ */ jsx23("div", { className: TrajectoryTable_default.historyLoading, role: "status", "aria-live": "polite", children: /* @__PURE__ */ jsxs16("span", { className: TrajectoryTable_default.historyLoadingBar, children: [
            /* @__PURE__ */ jsx23(StateDot, { state: "ongoing" }),
            t("history.loadingTrajectory")
          ] }) }),
          /* @__PURE__ */ jsxs16(
            "table",
            {
              className: TrajectoryTable_default.table,
              "data-scroll-ready": tableScrollReady || void 0,
              "aria-rowcount": records.length + historyRowOffset,
              children: [
                /* @__PURE__ */ jsxs16("colgroup", { children: [
                  /* @__PURE__ */ jsx23("col", { className: TrajectoryTable_default.eventColumn }),
                  /* @__PURE__ */ jsx23("col", { className: TrajectoryTable_default.contentColumn })
                ] }),
                /* @__PURE__ */ jsxs16("tbody", { children: [
                  hasOlderRecords && /* @__PURE__ */ jsx23(
                    "tr",
                    {
                      className: TrajectoryTable_default.historyLoadRow,
                      "data-history-load": "",
                      "aria-rowindex": 1,
                      children: /* @__PURE__ */ jsx23("td", { colSpan: 2, children: /* @__PURE__ */ jsxs16(
                        "button",
                        {
                          type: "button",
                          className: TrajectoryTable_default.historyLoadButton,
                          disabled: olderBusy || onLoadOlder === void 0,
                          "aria-label": olderBusy ? t("history.loadingEarlierAria") : t("history.loadEarlier"),
                          onClick: () => {
                            const pane = tablePaneRef.current;
                            if (pane !== null) requestOlder(pane, false);
                          },
                          children: [
                            olderBusy && /* @__PURE__ */ jsx23(StateDot, { state: "ongoing" }),
                            /* @__PURE__ */ jsx23("span", { "aria-hidden": "true", children: olderBusy ? t("history.loadingEarlier") : t("history.loadEarlier") }),
                            /* @__PURE__ */ jsx23("span", { className: TrajectoryTable_default.visuallyHidden, role: "status", "aria-live": "polite", children: olderBusy ? t("history.loadingEarlier") : "" })
                          ]
                        }
                      ) })
                    }
                  ),
                  virtualTop > 0 && /* @__PURE__ */ jsx23("tr", { className: TrajectoryTable_default.virtualSpacer, "data-virtual-spacer": "top", "aria-hidden": "true", children: /* @__PURE__ */ jsx23(
                    "td",
                    {
                      colSpan: 2,
                      style: {
                        "--trajectory-virtual-spacer-height": `${virtualTop}px`
                      }
                    }
                  ) }),
                  renderedRecords.map(({ record: record2, position, terminalRequestBoundary }) => /* @__PURE__ */ jsx23(
                    RecordPresentation,
                    {
                      cell: record2.cell,
                      t,
                      children: ({ displayText, listDisplayText, resultText, toolCallOnly, toolCallText }) => {
                        const isCollapsedSummary = record2.collapsedSummary !== void 0;
                        const isRequestOnly = record2.cell.requestOnly === true;
                        const isInitialSystem = record2.cell.kind === "system" && record2.cell.index === allRecords[0]?.cell.index;
                        const key = requestKey(record2.turn, record2.group);
                        const request = requestBoundaries.get(key) === record2.cell.index && !isCollapsedSummary && (record2.turn === null || !collapsedTurns.has(record2.turn)) ? requestNumbers.get(key) : void 0;
                        const requestInfo = request === void 0 ? void 0 : sessionRequestNumbers?.find((candidate) => candidate.number === request);
                        const requestStatus = requestInfo?.status ?? (record2.cell.isError === true ? "error" : void 0);
                        const requestRunIndex = requestBoundaryRuns.get(record2.cell.index) ?? 0;
                        const requestBoundaryStyle = {
                          "--request-boundary-offset": `${requestRunIndex * 8}px`
                        };
                        const requestLabel = request === void 0 ? void 0 : t(requestInfo?.purpose === "compaction" ? "request.labelCompaction" : "request.label", { request });
                        const requestSelected = requestInfo !== void 0 && selectedRequest?.identity === requestIdentity(requestInfo);
                        const sectionActive = record2.turn === null ? activeSection === record2.section : activeTurn === record2.turn;
                        const singleToolNotice = record2.cell.kind === "context" && record2.cell.sourceBlocks?.length === 1 && record2.cell.sourceBlocks.every((block) => block.type === "tool-addition" || block.type === "tool-removal");
                        return /* @__PURE__ */ jsxs16(
                          "tr",
                          {
                            tabIndex: isRequestOnly || singleToolNotice ? -1 : 0,
                            "aria-rowindex": position + 1 + historyRowOffset,
                            "aria-label": isCollapsedSummary ? t("request.collapsedSummary", {
                              kind: t(record2.collapsedSummaryKind === "turn" ? "request.collapsedTurn" : "request.collapsedAssistant"),
                              summary: record2.collapsedSummary
                            }) : isRequestOnly ? t("request.rowAriaCompaction", { request: request ?? "" }) : t("request.rowAria", {
                              request: request === void 0 ? "" : t("request.rowPrefix", { request }),
                              kind: t(KIND_LABEL_KEY[record2.cell.kind]),
                              content: listDisplayText || t("request.noContent")
                            }),
                            "aria-selected": !isCollapsedSummary && !isRequestOnly && selectedIndex === record2.cell.index,
                            "data-kind": record2.cell.kind,
                            "data-trajectory-row-key": trajectoryVirtualRecordKey(record2),
                            "data-virtual-position": virtualizationEnabled ? position : void 0,
                            "data-record-index": !isCollapsedSummary && !isRequestOnly ? record2.cell.index : void 0,
                            "data-request-only": isRequestOnly || void 0,
                            "data-terminal-request-boundary": terminalRequestBoundary || void 0,
                            "data-group-start": record2.groupStart || void 0,
                            "data-turn-start": record2.turnStart || void 0,
                            "data-error": record2.cell.isError || void 0,
                            "data-running": stateOf(record2) === "running" || void 0,
                            "data-turn-end": record2.turnEnd || void 0,
                            "data-collapsed-summary": record2.collapsedSummaryKind,
                            "data-selected": !isCollapsedSummary && selectedIndex === record2.cell.index || void 0,
                            "data-timeline-focus": isCollapsedSummary || timelineFocusIndexes === null ? void 0 : timelineFocusIndexes.has(record2.cell.index) ? "inside" : "outside",
                            onClick: isRequestOnly || singleToolNotice ? void 0 : isCollapsedSummary ? () => {
                              if (record2.collapsedSummaryKind === "turn" && record2.turn !== null) {
                                onToggleTurn(record2.turn);
                              } else onToggleAssistant(trajectoryRecordId(record2.cell));
                            } : () => {
                              selectRecord(record2.cell.index);
                            },
                            onDoubleClick: (event) => {
                              if (isCollapsedSummary || isRequestOnly || singleToolNotice) return;
                              if (record2.turn !== null && collapsedTurns.has(record2.turn)) {
                                event.preventDefault();
                                onToggleTurn(record2.turn);
                                return;
                              }
                              if (record2.cell.kind === "message" && assistantToolCalls(allRecords, record2.cell.index).length > 0) {
                                event.preventDefault();
                                onToggleAssistant(trajectoryRecordId(record2.cell));
                                return;
                              }
                              if (!record2.turnStart) return;
                              if (record2.turn === null) return;
                              if (allRecords.filter((candidate) => candidate.turn === record2.turn && candidate.cell.requestOnly !== true && candidate.cell.kind !== "system").length <= 1) return;
                              event.preventDefault();
                              onToggleTurn(record2.turn);
                            },
                            onKeyDown: (event) => {
                              if (isRequestOnly || singleToolNotice) return;
                              if (event.key !== "Enter" && event.key !== " ") return;
                              event.preventDefault();
                              if (isCollapsedSummary) {
                                if (record2.collapsedSummaryKind === "turn" && record2.turn !== null) {
                                  onToggleTurn(record2.turn);
                                } else onToggleAssistant(trajectoryRecordId(record2.cell));
                                return;
                              }
                              selectRecord(record2.cell.index);
                            },
                            children: [
                              /* @__PURE__ */ jsxs16("td", { className: TrajectoryTable_default.event, children: [
                                request !== void 0 && /* @__PURE__ */ jsx23(
                                  "button",
                                  {
                                    type: "button",
                                    className: requestSelected ? `${TrajectoryTable_default.requestBoundaryControl} ${TrajectoryTable_default.requestBoundaryControlActive}` : TrajectoryTable_default.requestBoundaryControl,
                                    "aria-label": requestLabel,
                                    "aria-pressed": requestSelected,
                                    "data-label": requestLabel,
                                    "data-request-run-index": requestRunIndex,
                                    "data-request-status": requestStatus,
                                    style: requestBoundaryStyle,
                                    onClick: (event) => {
                                      event.stopPropagation();
                                      if (requestInfo !== void 0) {
                                        selectRequest({ identity: requestIdentity(requestInfo) });
                                      }
                                    },
                                    onDoubleClick: (event) => {
                                      event.stopPropagation();
                                    }
                                  }
                                ),
                                record2.turn !== null && activeTurn === record2.turn && !isInitialSystem && /* @__PURE__ */ jsx23("span", { className: TrajectoryTable_default.turnRail, "aria-hidden": "true" }),
                                !isCollapsedSummary && selectedIndex === record2.cell.index && /* @__PURE__ */ jsx23("span", { className: TrajectoryTable_default.selectionRail, "aria-hidden": "true" }),
                                !isCollapsedSummary && !isRequestOnly && record2.turnStart && /* @__PURE__ */ jsx23(
                                  "span",
                                  {
                                    className: sectionActive ? `${TrajectoryTable_default.turnLabel} ${TrajectoryTable_default.turnLabelActive}` : TrajectoryTable_default.turnLabel,
                                    "aria-label": sectionLabel(record2.turn, t),
                                    children: record2.turn === null ? sectionLabel(record2.turn, t) : /* @__PURE__ */ jsxs16(Fragment6, { children: [
                                      /* @__PURE__ */ jsx23("span", { className: TrajectoryTable_default.turnLabelFull, "aria-hidden": "true", children: sectionLabel(record2.turn, t) }),
                                      /* @__PURE__ */ jsxs16("span", { className: TrajectoryTable_default.turnLabelCompact, "aria-hidden": "true", children: [
                                        "#",
                                        record2.turn
                                      ] })
                                    ] })
                                  }
                                ),
                                /* @__PURE__ */ jsx23("div", { className: TrajectoryTable_default.eventInner, children: !isCollapsedSummary && !isRequestOnly && /* @__PURE__ */ jsx23(
                                  "span",
                                  {
                                    className: TrajectoryTable_default.kindSlot,
                                    children: /* @__PURE__ */ jsxs16(
                                      "span",
                                      {
                                        className: `${TrajectoryTable_default.kindTag} ${record2.cell.kind === "system" ? TrajectoryTable_default.systemNeutral : record2.cell.kind === "context" ? TrajectoryTable_default.contextGreen : record2.cell.kind === "compacted" ? TrajectoryTable_default.compacted : record2.cell.kind === "tool" ? TrajectoryTable_default.toolAmber : record2.cell.kind === "message" ? TrajectoryTable_default.assistantVioletBright : record2.cell.kind === "subtool" ? TrajectoryTable_default.subtoolAmber : TrajectoryTable_default[record2.cell.kind]}`,
                                        "data-role-kind": record2.cell.kind,
                                        children: [
                                          /* @__PURE__ */ jsx23(
                                            Tooltip,
                                            {
                                              label: t(KIND_LABEL_KEY[record2.cell.kind]),
                                              side: "right",
                                              children: /* @__PURE__ */ jsx23("span", { className: TrajectoryTable_default.kindTagIcon, "aria-hidden": "true", children: KIND_ICON[record2.cell.kind] })
                                            }
                                          ),
                                          /* @__PURE__ */ jsx23("span", { className: TrajectoryTable_default.kindTagLabel, children: t(KIND_LABEL_KEY[record2.cell.kind]) })
                                        ]
                                      }
                                    )
                                  }
                                ) })
                              ] }),
                              /* @__PURE__ */ jsx23("td", { className: TrajectoryTable_default.content, children: isRequestOnly ? null : record2.collapsedSummary !== void 0 ? /* @__PURE__ */ jsxs16("span", { className: TrajectoryTable_default.collapsedTurnContent, title: record2.collapsedSummary, children: [
                                /* @__PURE__ */ jsx23("span", { className: TrajectoryTable_default.collapsedTurnEllipsis, children: "\u2026" }),
                                /* @__PURE__ */ jsx23("span", { className: TrajectoryTable_default.collapsedTurnText, children: record2.collapsedSummary })
                              ] }) : /* @__PURE__ */ jsxs16(
                                "span",
                                {
                                  className: resultText === void 0 ? TrajectoryTable_default.contentText : TrajectoryTable_default.resultPreview,
                                  title: resultText === void 0 ? listDisplayText : `${listDisplayText} \u2192 ${resultText}`,
                                  children: [
                                    /* @__PURE__ */ jsx23("span", { className: resultText === void 0 ? void 0 : TrajectoryTable_default.resultRequest, children: /* @__PURE__ */ jsx23(
                                      RecordListText,
                                      {
                                        displayText,
                                        toolCallOnly,
                                        toolCallText,
                                        t
                                      }
                                    ) }),
                                    resultText !== void 0 && /* @__PURE__ */ jsxs16("span", { className: record2.cell.isError ? `${TrajectoryTable_default.inlineResult} ${TrajectoryTable_default.error}` : TrajectoryTable_default.inlineResult, children: [
                                      /* @__PURE__ */ jsx23("span", { className: TrajectoryTable_default.arrow, children: "\u2192" }),
                                      /* @__PURE__ */ jsx23(
                                        "span",
                                        {
                                          className: resultText === t("record.noOutput") ? `${TrajectoryTable_default.inlineResultText} ${TrajectoryTable_default.noOutputText}` : TrajectoryTable_default.inlineResultText,
                                          children: resultText
                                        }
                                      )
                                    ] })
                                  ]
                                }
                              ) })
                            ]
                          }
                        );
                      }
                    },
                    trajectoryVirtualRecordKey(record2)
                  )),
                  virtualBottom > 0 && /* @__PURE__ */ jsx23("tr", { className: TrajectoryTable_default.virtualSpacer, "data-virtual-spacer": "bottom", "aria-hidden": "true", children: /* @__PURE__ */ jsx23(
                    "td",
                    {
                      colSpan: 2,
                      style: {
                        "--trajectory-virtual-spacer-height": `${virtualBottom}px`
                      }
                    }
                  ) })
                ] })
              ]
            }
          )
        ]
      }
    ),
    (selectedRequestInfo !== void 0 || promptSelected || selected !== void 0 && selectedState !== void 0) && /* @__PURE__ */ jsxs16(
      "aside",
      {
        className: TrajectoryTable_default.details,
        "aria-label": t("details.event"),
        style: detailsWidth === null ? void 0 : { width: detailsWidth },
        children: [
          /* @__PURE__ */ jsx23(
            "div",
            {
              className: TrajectoryTable_default.detailsResizeHandle,
              role: "separator",
              "aria-label": t("details.resize"),
              "aria-controls": "trajectory-detail-panel",
              "aria-orientation": "vertical",
              tabIndex: 0,
              title: t("details.resizeTitle"),
              onDoubleClick: () => {
                setDetailsWidth(null);
                setToolRequestOffset(null);
              },
              onPointerDown: (event) => {
                if (event.button !== 0) return;
                const details = event.currentTarget.parentElement;
                if (details === null) return;
                const split = details.parentElement;
                if (split === null) return;
                const splitWidth = split.getBoundingClientRect().width;
                detailsResizeDrag.current = {
                  pointerId: event.pointerId,
                  startX: event.clientX,
                  startWidth: details.getBoundingClientRect().width,
                  splitWidth,
                  startToolRequestOffset: toolRequestOffset ?? splitWidth * TOOL_REQUEST_SHARE - defaultToolRequestWidth(splitWidth)
                };
                event.currentTarget.setPointerCapture(event.pointerId);
                event.preventDefault();
              },
              onPointerMove: (event) => {
                const drag = detailsResizeDrag.current;
                if (drag === null || drag.pointerId !== event.pointerId) return;
                const nextDetailsWidth = clampDetailsWidth(
                  drag.startWidth + drag.startX - event.clientX,
                  drag.splitWidth
                );
                setDetailsWidth(nextDetailsWidth);
                setToolRequestOffset(
                  drag.startToolRequestOffset + (nextDetailsWidth - drag.startWidth) * TOOL_REQUEST_SHARE
                );
              },
              onPointerUp: (event) => {
                if (detailsResizeDrag.current?.pointerId !== event.pointerId) return;
                detailsResizeDrag.current = null;
                event.currentTarget.releasePointerCapture(event.pointerId);
              },
              onPointerCancel: () => {
                detailsResizeDrag.current = null;
              },
              onKeyDown: (event) => {
                if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
                const details = event.currentTarget.parentElement;
                if (details === null) return;
                const split = details.parentElement;
                if (split === null) return;
                const direction = event.key === "ArrowLeft" ? 1 : -1;
                const currentDetailsWidth = details.getBoundingClientRect().width;
                const splitWidth = split.getBoundingClientRect().width;
                const nextDetailsWidth = clampDetailsWidth(
                  currentDetailsWidth + direction * DETAILS_RESIZE_STEP,
                  splitWidth
                );
                const currentToolRequestOffset = toolRequestOffset ?? splitWidth * TOOL_REQUEST_SHARE - defaultToolRequestWidth(splitWidth);
                setDetailsWidth(nextDetailsWidth);
                setToolRequestOffset(
                  currentToolRequestOffset + (nextDetailsWidth - currentDetailsWidth) * TOOL_REQUEST_SHARE
                );
                event.preventDefault();
              }
            }
          ),
          /* @__PURE__ */ jsxs16("div", { className: TrajectoryTable_default.detailsHeader, children: [
            /* @__PURE__ */ jsx23("div", { className: TrajectoryTable_default.detailsTitle, children: selectedRequestInfo !== void 0 ? /* @__PURE__ */ jsxs16(Fragment6, { children: [
              /* @__PURE__ */ jsx23("span", { className: TrajectoryTable_default.requestDetailsDot, "aria-hidden": "true" }),
              /* @__PURE__ */ jsx23("span", { className: TrajectoryTable_default.requestDetailsName, children: t("request.label", { request: selectedRequestNumber ?? "\u2014" }) }),
              /* @__PURE__ */ jsx23("span", { className: TrajectoryTable_default.detailsLocation, children: selectedRequestInfo.purpose === "compaction" ? t("request.compaction", { section: sectionLabel(selectedRequestInfo.turn, t) }) : sectionLabel(selectedRequestInfo.turn, t) })
            ] }) : promptSelected ? /* @__PURE__ */ jsxs16(Fragment6, { children: [
              /* @__PURE__ */ jsx23("span", { className: `${TrajectoryTable_default.kindTag} ${TrajectoryTable_default.systemNeutral}`, children: t("kind.system") }),
              /* @__PURE__ */ jsx23("span", { className: TrajectoryTable_default.detailsLocation, children: selected?.cell.text })
            ] }) : selected !== void 0 && /* @__PURE__ */ jsxs16(Fragment6, { children: [
              /* @__PURE__ */ jsx23(
                "span",
                {
                  className: `${TrajectoryTable_default.kindTag} ${selected.cell.kind === "context" ? TrajectoryTable_default.contextGreen : selected.cell.kind === "compacted" ? TrajectoryTable_default.compacted : selected.cell.kind === "tool" ? TrajectoryTable_default.toolAmber : selected.cell.kind === "message" ? TrajectoryTable_default.assistantVioletBright : selected.cell.kind === "subtool" ? TrajectoryTable_default.subtoolAmber : TrajectoryTable_default[selected.cell.kind]}`,
                  children: t(KIND_LABEL_KEY[selected.cell.kind])
                }
              ),
              /* @__PURE__ */ jsx23("span", { className: TrajectoryTable_default.detailsLocation, children: selected.cell.kind === "compacted" ? sectionLabel(selected.turn, t) : `${sectionLabel(selected.turn, t)} \xB7 ${selected.group}` })
            ] }) }),
            /* @__PURE__ */ jsx23(
              "button",
              {
                type: "button",
                className: TrajectoryTable_default.close,
                "aria-label": t("details.close"),
                onClick: clearInspectorSelection,
                children: /* @__PURE__ */ jsx23("span", { "aria-hidden": "true", children: "\xD7" })
              }
            )
          ] }),
          /* @__PURE__ */ jsx23("div", { className: TrajectoryTable_default.detailTabs, role: "tablist", "aria-label": t("details.event"), children: selectedTabs.map((tab) => /* @__PURE__ */ jsx23(
            "button",
            {
              id: `trajectory-detail-${tab.id}`,
              type: "button",
              role: "tab",
              "aria-controls": "trajectory-detail-panel",
              "aria-selected": activeTab === tab.id,
              className: activeTab === tab.id ? `${TrajectoryTable_default.detailTab} ${TrajectoryTable_default.detailTabActive}` : TrajectoryTable_default.detailTab,
              onClick: () => {
                activateTab(tab.id);
              },
              children: t(tab.labelKey)
            },
            tab.id
          )) }),
          /* @__PURE__ */ jsxs16(
            "div",
            {
              id: "trajectory-detail-panel",
              className: activeTab === "overview" ? `${TrajectoryTable_default.detailBody} ${TrajectoryTable_default.detailBodySummary}` : selectedProgram !== void 0 && (activeTab === "input" || activeTab === "output") ? `${TrajectoryTable_default.detailBody} ${TrajectoryTable_default.detailBodyProgram}` : TrajectoryTable_default.detailBody,
              role: "tabpanel",
              "aria-labelledby": `trajectory-detail-${activeTab}`,
              children: [
                selectedRequestInfo !== void 0 && selectedRequestState !== void 0 && activeTab === "overview" && /* @__PURE__ */ jsxs16(Fragment6, { children: [
                  /* @__PURE__ */ jsxs16(
                    "dl",
                    {
                      className: `${TrajectoryTable_default.overview} ${TrajectoryTable_default.summaryScrollRegion}`,
                      "data-summary-scroll-region": "",
                      children: [
                        /* @__PURE__ */ jsxs16("div", { children: [
                          /* @__PURE__ */ jsx23("dt", { children: t("details.status") }),
                          /* @__PURE__ */ jsx23("dd", { className: selectedRequestState === "error" ? TrajectoryTable_default.error : void 0, children: statusLabel(selectedRequestState, t) })
                        ] }),
                        selectedRequestInfo.purpose === "compaction" && /* @__PURE__ */ jsxs16("div", { children: [
                          /* @__PURE__ */ jsx23("dt", { children: t("details.purpose") }),
                          /* @__PURE__ */ jsx23("dd", { children: t("request.compactionPurpose") })
                        ] }),
                        (selectedRequestInfo.provider ?? selectedRequestInfo.requestConfig?.provider) !== void 0 && /* @__PURE__ */ jsxs16("div", { children: [
                          /* @__PURE__ */ jsx23("dt", { children: t("details.provider") }),
                          /* @__PURE__ */ jsx23("dd", { children: selectedRequestInfo.provider ?? selectedRequestInfo.requestConfig?.provider })
                        ] }),
                        (selectedRequestInfo.model ?? selectedRequestInfo.requestConfig?.model) !== void 0 && /* @__PURE__ */ jsxs16("div", { children: [
                          /* @__PURE__ */ jsx23("dt", { children: t("details.model") }),
                          /* @__PURE__ */ jsx23("dd", { children: selectedRequestInfo.model ?? selectedRequestInfo.requestConfig?.model })
                        ] }),
                        /* @__PURE__ */ jsxs16("div", { children: [
                          /* @__PURE__ */ jsx23("dt", { children: t("details.toolCalls") }),
                          /* @__PURE__ */ jsx23("dd", { children: selectedRequestToolCalls })
                        ] }),
                        selectedRequestSubtoolCalls > 0 && /* @__PURE__ */ jsxs16("div", { children: [
                          /* @__PURE__ */ jsx23("dt", { children: t("details.subtoolCalls") }),
                          /* @__PURE__ */ jsx23("dd", { children: selectedRequestSubtoolCalls })
                        ] }),
                        selectedRequestInfo.error !== void 0 && /* @__PURE__ */ jsxs16("div", { children: [
                          /* @__PURE__ */ jsx23("dt", { children: t(selectedRequestState !== "error" && selectedRequestInfo.retry !== void 0 ? "details.lastAttemptError" : "details.error") }),
                          /* @__PURE__ */ jsx23("dd", { className: selectedRequestState === "error" ? TrajectoryTable_default.error : void 0, children: requestErrorMessage(selectedRequestInfo, t) })
                        ] }),
                        selectedRequestInfo.retry !== void 0 && /* @__PURE__ */ jsxs16("div", { children: [
                          /* @__PURE__ */ jsx23("dt", { children: t("details.retry") }),
                          /* @__PURE__ */ jsx23("dd", { children: selectedRequestInfo.maxRetries === void 0 ? selectedRequestInfo.retry : t("request.retryProgress", {
                            retry: selectedRequestInfo.retry,
                            maximum: selectedRequestInfo.maxRetries
                          }) })
                        ] }),
                        selectedRequestInfo.retryDelayMs !== void 0 && /* @__PURE__ */ jsxs16("div", { children: [
                          /* @__PURE__ */ jsx23("dt", { children: t("details.retryDelay") }),
                          /* @__PURE__ */ jsx23("dd", { children: formatDurationMs(selectedRequestInfo.retryDelayMs, t) })
                        ] }),
                        selectedRequestResult !== void 0 && /* @__PURE__ */ jsxs16("div", { children: [
                          /* @__PURE__ */ jsx23("dt", { children: t("details.result") }),
                          /* @__PURE__ */ jsx23("dd", { className: TrajectoryTable_default.overviewParentLinks, children: /* @__PURE__ */ jsxs16(
                            "button",
                            {
                              type: "button",
                              className: TrajectoryTable_default.overviewHierarchyNavLink,
                              onClick: () => {
                                openRecordSummary(selectedRequestResult);
                              },
                              children: [
                                /* @__PURE__ */ jsx23("span", { children: selectedRequestInfo.purpose === "compaction" ? t("details.compacted") : t("details.assistantMessage") }),
                                /* @__PURE__ */ jsx23(
                                  IconChevronRightOutlineRegular,
                                  {
                                    className: TrajectoryTable_default.overviewHierarchyJumpIconTight,
                                    size: 11
                                  }
                                )
                              ]
                            }
                          ) })
                        ] })
                      ]
                    }
                  ),
                  /* @__PURE__ */ jsxs16("div", { className: TrajectoryTable_default.overviewSections, children: [
                    selectedRequestOptions !== void 0 && /* @__PURE__ */ jsx23(OverviewSection, { label: t("tab.options"), onOpen: () => {
                      activateTab("options");
                    }, children: /* @__PURE__ */ jsx23(RequestOptions, { options: selectedRequestOptions, preview: true, stringWrapping, t }) }),
                    /* @__PURE__ */ jsx23(OverviewSection, { label: t("tab.usage"), onOpen: () => {
                      activateTab("usage");
                    }, children: /* @__PURE__ */ jsx23(UsageRows, { usage: selectedRequestUsage, t }) }),
                    /* @__PURE__ */ jsx23(OverviewSection, { label: t("tab.timing"), onOpen: () => {
                      activateTab("timing");
                    }, children: /* @__PURE__ */ jsx23(
                      RequestTiming,
                      {
                        assistant: selectedRequestAssistant,
                        anchor: selectedRequestAnchor,
                        request: selectedRequestInfo,
                        preview: true,
                        t
                      }
                    ) })
                  ] })
                ] }),
                selectedRequestInfo !== void 0 && activeTab === "options" && /* @__PURE__ */ jsx23(RequestOptions, { options: selectedRequestOptions, stringWrapping, t }),
                selectedRequestInfo !== void 0 && activeTab === "usage" && /* @__PURE__ */ jsx23(
                  RequestUsagePanel,
                  {
                    usage: selectedRequestUsage,
                    cumulative: selectedRequestCumulativeUsage,
                    t
                  }
                ),
                selectedRequestInfo !== void 0 && activeTab === "timing" && /* @__PURE__ */ jsx23(
                  RequestTiming,
                  {
                    assistant: selectedRequestAssistant,
                    anchor: selectedRequestAnchor,
                    request: selectedRequestInfo,
                    t
                  }
                ),
                selectedPrompt !== void 0 && selectedPreviousPrompt !== void 0 && activeTab === "diff" && /* @__PURE__ */ jsx23(
                  SystemPromptDiff,
                  {
                    before: selectedPreviousPrompt,
                    after: selectedPrompt,
                    t
                  }
                ),
                promptSelected && activeTab === "system-prompt" && (selectedSystemPrompt === "" ? /* @__PURE__ */ jsx23("p", { className: TrajectoryTable_default.noPayload, children: t("record.systemPromptMissing") }) : /* @__PURE__ */ jsx23("div", { className: `${TrajectoryTable_default.markdownPayload} ${TrajectoryTable_default.systemPrompt}`, children: /* @__PURE__ */ jsx23(MarkdownText, { text: selectedSystemPrompt, labels: markdownLabels(t) }) })),
                selectedPrompt !== void 0 && activeTab === "tools" && /* @__PURE__ */ jsx23(ToolCatalog, { tools: selectedPrompt.tools, stringWrapping, t }),
                !promptSelected && selected?.cell.kind === "compacted" && selectedState !== void 0 && activeTab === "overview" && /* @__PURE__ */ jsxs16(Fragment6, { children: [
                  /* @__PURE__ */ jsxs16(
                    "dl",
                    {
                      className: `${TrajectoryTable_default.overview} ${TrajectoryTable_default.summaryScrollRegion}`,
                      "data-summary-scroll-region": "",
                      children: [
                        /* @__PURE__ */ jsxs16("div", { children: [
                          /* @__PURE__ */ jsx23("dt", { children: t("details.status") }),
                          /* @__PURE__ */ jsx23("dd", { className: selectedState === "error" ? TrajectoryTable_default.error : void 0, children: statusLabel(selectedState, t) })
                        ] }),
                        /* @__PURE__ */ jsxs16("div", { children: [
                          /* @__PURE__ */ jsx23("dt", { children: t("timing.duration") }),
                          /* @__PURE__ */ jsx23("dd", { children: formatElapsedSeconds(selected.cell.timeSeconds, t) })
                        ] }),
                        /* @__PURE__ */ jsxs16("div", { children: [
                          /* @__PURE__ */ jsx23("dt", { children: t("usage.tokens") }),
                          /* @__PURE__ */ jsx23("dd", { children: "\u2014" })
                        ] })
                      ]
                    }
                  ),
                  selected.cell.outputDetail !== void 0 && /* @__PURE__ */ jsx23(
                    "div",
                    {
                      className: `${TrajectoryTable_default.compactedSummary} ${TrajectoryTable_default.summaryScrollRegion}`,
                      "data-summary-scroll-region": "",
                      children: /* @__PURE__ */ jsx23(
                        MarkdownRecordContent,
                        {
                          record: selected,
                          renderSlot,
                          loadImage,
                          rendered: true,
                          thinkingExpanded,
                          onThinkingExpandedChange: setThinkingExpanded,
                          onOpenCall: openCallSummary,
                          t
                        }
                      )
                    }
                  )
                ] }),
                !promptSelected && selected !== void 0 && selected.cell.kind !== "compacted" && selectedState !== void 0 && activeTab === "overview" && /* @__PURE__ */ jsxs16(Fragment6, { children: [
                  selectedProgram !== void 0 && selectedProgram.description !== "" && /* @__PURE__ */ jsx23("p", { className: TrajectoryTable_default.programDescription, children: selectedProgram.description }),
                  /* @__PURE__ */ jsxs16(
                    "dl",
                    {
                      className: `${TrajectoryTable_default.overview} ${TrajectoryTable_default.summaryScrollRegion}`,
                      "data-summary-scroll-region": "",
                      children: [
                        selected.cell.messageSource !== void 0 && /* @__PURE__ */ jsxs16("div", { children: [
                          /* @__PURE__ */ jsx23("dt", { children: t("details.source") }),
                          /* @__PURE__ */ jsx23("dd", { className: TrajectoryTable_default.overviewParentLinks, children: /* @__PURE__ */ jsxs16(
                            "button",
                            {
                              type: "button",
                              className: TrajectoryTable_default.overviewHierarchyNavLink,
                              onClick: () => {
                                activateTab("source");
                              },
                              children: [
                                /* @__PURE__ */ jsx23("span", { children: messageSourceLabel(selected.cell.messageSource, t) }),
                                /* @__PURE__ */ jsx23(
                                  IconChevronRightOutlineRegular,
                                  {
                                    className: TrajectoryTable_default.overviewHierarchyJumpIconTight,
                                    size: 11
                                  }
                                )
                              ]
                            }
                          ) })
                        ] }),
                        hasSelectedHierarchy && /* @__PURE__ */ jsxs16("div", { children: [
                          /* @__PURE__ */ jsx23("dt", { children: selectedAssistantRequestTarget !== void 0 ? t("details.source") : t("details.hierarchy") }),
                          /* @__PURE__ */ jsxs16("dd", { className: TrajectoryTable_default.overviewParentLinks, children: [
                            selectedAssistantRequestTarget !== void 0 && /* @__PURE__ */ jsxs16(
                              "button",
                              {
                                type: "button",
                                className: TrajectoryTable_default.overviewHierarchyNavLink,
                                onClick: () => {
                                  selectRequest(selectedAssistantRequestTarget);
                                },
                                children: [
                                  /* @__PURE__ */ jsx23("span", { children: t("request.label", { request: selectedAssistantRequest ?? "\u2014" }) }),
                                  /* @__PURE__ */ jsx23(
                                    IconChevronRightOutlineRegular,
                                    {
                                      className: TrajectoryTable_default.overviewHierarchyJumpIconTight,
                                      size: 11
                                    }
                                  )
                                ]
                              }
                            ),
                            selectedParentMessage !== void 0 && /* @__PURE__ */ jsxs16(
                              "button",
                              {
                                type: "button",
                                className: TrajectoryTable_default.overviewHierarchyNavLink,
                                onClick: () => {
                                  openRecordSummary(selectedParentMessage);
                                },
                                children: [
                                  /* @__PURE__ */ jsx23("span", { children: t("details.assistantMessage") }),
                                  /* @__PURE__ */ jsx23(
                                    IconChevronRightOutlineRegular,
                                    {
                                      className: TrajectoryTable_default.overviewHierarchyJumpIconTight,
                                      size: 11
                                    }
                                  )
                                ]
                              }
                            ),
                            selectedParentTool !== void 0 && /* @__PURE__ */ jsxs16(
                              "button",
                              {
                                type: "button",
                                className: TrajectoryTable_default.overviewHierarchyNavLink,
                                onClick: () => {
                                  openRecordSummary(selectedParentTool);
                                },
                                children: [
                                  /* @__PURE__ */ jsx23("span", { children: t("details.toolCall") }),
                                  /* @__PURE__ */ jsx23(
                                    IconChevronRightOutlineRegular,
                                    {
                                      className: TrajectoryTable_default.overviewHierarchyJumpIconTight,
                                      size: 11
                                    }
                                  )
                                ]
                              }
                            )
                          ] })
                        ] }),
                        /* @__PURE__ */ jsxs16("div", { children: [
                          /* @__PURE__ */ jsx23("dt", { children: t("details.status") }),
                          /* @__PURE__ */ jsx23("dd", { className: selectedState === "error" ? TrajectoryTable_default.error : void 0, children: statusLabel(selectedState, t) })
                        ] }),
                        selected.cell.kind === "message" && /* @__PURE__ */ jsx23(TokenRows, { cell: selected.cell, t }),
                        (selected.cell.kind === "user" || selected.cell.kind === "context") && /* @__PURE__ */ jsxs16("div", { children: [
                          /* @__PURE__ */ jsx23("dt", { children: t("timing.duration") }),
                          /* @__PURE__ */ jsx23("dd", { children: formatElapsedSeconds(selected.cell.timeSeconds, t) })
                        ] })
                      ]
                    }
                  ),
                  /* @__PURE__ */ jsxs16("div", { className: TrajectoryTable_default.overviewSections, children: [
                    selectedProgram !== void 0 ? /* @__PURE__ */ jsxs16(Fragment6, { children: [
                      /* @__PURE__ */ jsx23(
                        ProgramInput,
                        {
                          program: selectedProgram,
                          initialWrapped: codeWrappingOnOpen,
                          stringWrapping,
                          onOpen: () => {
                            activateTab("input");
                          },
                          t
                        },
                        `preview:${selectedRecordId}`
                      ),
                      /* @__PURE__ */ jsx23(
                        ProgramOutput,
                        {
                          record: selected,
                          stringWrapping,
                          onOpen: () => {
                            activateTab("output");
                          },
                          t
                        }
                      )
                    ] }) : isMarkdownRecord(selected) ? /* @__PURE__ */ jsx23(Fragment6, { children: /* @__PURE__ */ jsx23(OverviewSection, { label: t("tab.preview"), onOpen: () => {
                      activateTab("rendered");
                    }, children: /* @__PURE__ */ jsx23(
                      MarkdownRecordContent,
                      {
                        record: selected,
                        renderSlot,
                        loadImage,
                        rendered: true,
                        preview: true,
                        thinkingExpanded,
                        onThinkingExpandedChange: setThinkingExpanded,
                        onOpenCall: openCallSummary,
                        t
                      }
                    ) }) }) : /* @__PURE__ */ jsxs16(Fragment6, { children: [
                      selected.cell.inputDetail && /* @__PURE__ */ jsx23(OverviewSection, { label: t("tab.payload"), onOpen: () => {
                        activateTab("input");
                      }, children: /* @__PURE__ */ jsx23(RecordPayload, { record: selected, direction: "input", preview: true, renderSlot, loadImage, stringWrapping, t }) }),
                      selected.cell.outputDetail && /* @__PURE__ */ jsx23(OverviewSection, { label: t("tab.result"), onOpen: () => {
                        activateTab("output");
                      }, children: /* @__PURE__ */ jsx23(RecordPayload, { record: selected, direction: "output", preview: true, renderSlot, loadImage, stringWrapping, t }) }),
                      /* @__PURE__ */ jsx23(OverviewSection, { label: t("tab.schema"), onOpen: () => {
                        activateTab("schema");
                      }, children: /* @__PURE__ */ jsx23(RecordSchema, { record: selected, preview: true, stringWrapping, t }) })
                    ] }),
                    selectedAssistantRequestTarget !== void 0 && /* @__PURE__ */ jsx23(
                      OverviewSection,
                      {
                        label: t("timing.request"),
                        onOpen: () => {
                          selectRequest(selectedAssistantRequestTarget, "timing");
                        },
                        children: /* @__PURE__ */ jsx23(RecordTiming, { record: selected, preview: true, t })
                      }
                    ),
                    (selected.cell.kind === "tool" || selected.cell.kind === "subtool") && /* @__PURE__ */ jsx23(OverviewSection, { label: t("tab.timing"), onOpen: () => {
                      activateTab("timing");
                    }, children: /* @__PURE__ */ jsx23(RecordTiming, { record: selected, preview: true, t }) })
                  ] })
                ] }),
                !promptSelected && selected !== void 0 && activeTab === "rendered" && /* @__PURE__ */ jsx23(
                  MarkdownRecordContent,
                  {
                    record: selected,
                    renderSlot,
                    loadImage,
                    rendered: true,
                    thinkingExpanded,
                    onThinkingExpandedChange: setThinkingExpanded,
                    onOpenCall: openCallSummary,
                    t
                  }
                ),
                !promptSelected && selected !== void 0 && activeTab === "raw" && /* @__PURE__ */ jsx23(
                  MarkdownRecordContent,
                  {
                    record: selected,
                    renderSlot,
                    loadImage,
                    rendered: false,
                    thinkingExpanded,
                    onThinkingExpandedChange: setThinkingExpanded,
                    onOpenCall: openCallSummary,
                    t
                  }
                ),
                !promptSelected && selected !== void 0 && activeTab === "source" && /* @__PURE__ */ jsx23(MessageSource, { record: selected, stringWrapping, t }),
                !promptSelected && selected !== void 0 && activeTab === "input" && (selectedProgram === void 0 ? /* @__PURE__ */ jsx23(RecordPayload, { record: selected, direction: "input", renderSlot, loadImage, stringWrapping, t }) : /* @__PURE__ */ jsx23(
                  ProgramInput,
                  {
                    program: selectedProgram,
                    initialWrapped: codeWrappingOnOpen,
                    stringWrapping,
                    t
                  },
                  `input:${selectedRecordId}`
                )),
                !promptSelected && selected !== void 0 && activeTab === "output" && (selectedProgram === void 0 ? /* @__PURE__ */ jsx23(RecordPayload, { record: selected, direction: "output", renderSlot, loadImage, stringWrapping, t }) : /* @__PURE__ */ jsx23(ProgramOutput, { record: selected, stringWrapping, t })),
                !promptSelected && selected !== void 0 && activeTab === "schema" && /* @__PURE__ */ jsx23(RecordSchema, { record: selected, stringWrapping, t }),
                !promptSelected && selected !== void 0 && activeTab === "timing" && /* @__PURE__ */ jsx23(RecordTiming, { record: selected, t })
              ]
            }
          )
        ]
      }
    )
  ] });
}

// packages/client/ui-trajectory/src/client/TrajectoryTimeline.tsx
import {
  memo as memo2,
  useEffect as useEffect10,
  useMemo as useMemo5,
  useRef as useRef12,
  useState as useState11
} from "react";

// packages/client/ui-trajectory/src/client/timeline.ts
function formatTimelineOffset(milliseconds, t) {
  return formatDurationMillis(milliseconds, t);
}
function laneFor(kind) {
  if (kind === "tool" || kind === "subtool") return 2;
  if (kind === "message" || kind === "compacted") return 1;
  return 0;
}
function finite(value) {
  return value !== null && value !== void 0 && Number.isFinite(value);
}
function cellRange(cell) {
  if (!finite(cell.startedAt)) return null;
  const durationMs = finite(cell.timeSeconds) ? Math.max(0, cell.timeSeconds * 1e3) : 0;
  return { start: cell.startedAt, end: cell.startedAt + durationMs };
}
function deriveTrajectoryTimeline(turns, mode = "sequence") {
  if (mode !== "sequence") {
    return deriveTimedTimeline(
      turns,
      mode === "duration" || mode === "actual",
      mode === "duration"
    );
  }
  const spans = [];
  const turnBoundaries = [];
  for (const turn of turns) {
    const cells = turn.groups.flatMap(
      (group) => group.cells.filter((cell) => cell.requestOnly !== true)
    );
    if (cells.length === 0) continue;
    if (turn.turn !== null) {
      turnBoundaries.push({
        turn: turn.turn,
        time: spans.length
      });
    }
    spans.push(...cells.map((cell, offset) => ({
      start: spans.length + offset,
      end: spans.length + offset + 1,
      index: cell.index,
      isError: cell.isError === true,
      kind: cell.kind,
      label: cell.text,
      lane: laneFor(cell.kind)
    })));
  }
  if (spans.length === 0) return null;
  return {
    start: 0,
    end: spans.length,
    spans,
    turnBoundaries
  };
}
function deriveTimedTimeline(turns, actualDuration, compressIdle) {
  const timedTurns = turns.flatMap((turn) => {
    const rawSpans2 = turn.groups.flatMap(
      (group) => group.cells.flatMap((cell) => {
        if (cell.requestOnly === true) return [];
        const range = cellRange(cell);
        return range === null ? [] : [{
          ...range,
          index: cell.index,
          isError: cell.isError === true,
          kind: cell.kind,
          label: cell.text,
          lane: laneFor(cell.kind)
        }];
      })
    );
    return rawSpans2.length === 0 ? [] : [{ turn: turn.turn, rawSpans: rawSpans2 }];
  });
  const rawSpans = timedTurns.flatMap((turn) => turn.rawSpans);
  if (rawSpans.length === 0) return null;
  const removedIdleBySpan = /* @__PURE__ */ new Map();
  let removedIdle = 0;
  let coveredUntil = null;
  for (const span of [...rawSpans].sort((left, right) => left.start - right.start || left.end - right.end)) {
    if (compressIdle && coveredUntil !== null && span.start > coveredUntil) {
      removedIdle += span.start - coveredUntil;
    }
    removedIdleBySpan.set(span, removedIdle);
    coveredUntil = coveredUntil === null ? span.end : Math.max(coveredUntil, span.end);
  }
  const spans = [];
  const turnBoundaries = [];
  for (const turn of timedTurns) {
    const projected = turn.rawSpans.map((span) => {
      const offset = removedIdleBySpan.get(span) ?? 0;
      return {
        ...span,
        start: span.start - offset,
        end: (actualDuration ? span.end : span.start) - offset
      };
    });
    spans.push(...projected);
    if (turn.turn !== null) {
      turnBoundaries.push({
        turn: turn.turn,
        time: Math.min(...projected.map((span) => span.start))
      });
    }
  }
  return {
    start: Math.min(...spans.map((span) => span.start)),
    end: Math.max(...spans.map((span) => span.end)),
    spans,
    turnBoundaries
  };
}
function trajectoryTimelineFocusIndexes(turns, range, mode = "sequence") {
  const model = deriveTrajectoryTimeline(turns, mode);
  return new Set(
    model?.spans.filter((span) => span.start <= range.end && span.end >= range.start).map((span) => span.index)
  );
}

// packages/client/ui-trajectory/src/client/TrajectoryTimeline.module.css
var TrajectoryTimeline_default = {
  root: "TrajectoryTimeline_root",
  plot: "TrajectoryTimeline_plot",
  labels: "TrajectoryTimeline_labels",
  track: "TrajectoryTimeline_track",
  earlierHistory: "TrajectoryTimeline_earlierHistory",
  empty: "TrajectoryTimeline_empty",
  lanes: "TrajectoryTimeline_lanes",
  turnBoundaries: "TrajectoryTimeline_turnBoundaries",
  turnBoundary: "TrajectoryTimeline_turnBoundary",
  span: "TrajectoryTimeline_span",
  selection: "TrajectoryTimeline_selection",
  selectionEdges: "TrajectoryTimeline_selectionEdges",
  hoverLine: "TrajectoryTimeline_hoverLine"
};

// packages/client/ui-trajectory/src/client/TrajectoryTimeline.tsx
import { Fragment as Fragment7, jsx as jsx24, jsxs as jsxs17 } from "react/jsx-runtime";
var MINIMUM_DRAG_PX = 3;
var MINIMUM_ZOOM_OPERATIONS = 4;
var EDGE_PAN_ZONE_FRACTION = 0.08;
var EDGE_PAN_STEP_FRACTION = 0.025;
var MAXIMUM_EDGE_PAN_PX = 32;
var TIMELINE_TOOLTIP_DELAY_MS = 500;
function assistantTimingDetail(metrics) {
  const start = metrics?.stepStartTime;
  const first = metrics?.firstTokenTime;
  const completed = metrics?.completedTime;
  if (metrics?.timingRecorded !== true || typeof start !== "number" || typeof first !== "number" || typeof completed !== "number" || !Number.isFinite(start) || !Number.isFinite(first) || !Number.isFinite(completed) || first < start || completed < first) return {};
  return { ttftMs: first - start, decodingMs: completed - first };
}
function timelineRecordDetail(cell) {
  const durationMs = cell.timeSeconds === null || !Number.isFinite(cell.timeSeconds) ? void 0 : Math.max(0, cell.timeSeconds * 1e3);
  const startedAt = cell.startedAt === null || !Number.isFinite(cell.startedAt) ? void 0 : cell.startedAt;
  return {
    ...durationMs === void 0 ? {} : { durationMs },
    ...startedAt === void 0 ? {} : { startedAt },
    ...assistantTimingDetail(cell.assistantMetrics)
  };
}
function timelineKindLabel(kind, t) {
  switch (kind) {
    case "system":
      return t("kind.system");
    case "user":
      return t("kind.user");
    case "context":
      return t("kind.context");
    case "compacted":
      return t("kind.compacted");
    case "message":
      return t("kind.assistant");
    case "tool":
      return t("kind.tool");
    case "subtool":
      return t("kind.subtool");
  }
}
function formatRecordedTime(timestamp) {
  return new Date(timestamp).toLocaleTimeString(void 0, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    fractionalSecondDigits: 3
  });
}
function timelineTooltipLabel(kind, detail, t) {
  const heading = timelineKindLabel(kind, t);
  if (detail === void 0) return heading;
  const duration = detail.durationMs === void 0 ? null : t("timeline.total", { duration: formatTimelineOffset(detail.durationMs, t) });
  const range = detail.startedAt === void 0 ? null : detail.durationMs === void 0 ? t("timeline.started", { time: formatRecordedTime(detail.startedAt) }) : `${formatRecordedTime(detail.startedAt)} \u2192 ${formatRecordedTime(
    detail.startedAt + detail.durationMs
  )}`;
  const segments = detail.ttftMs === void 0 || detail.decodingMs === void 0 ? null : t("timeline.ttftDecoding", {
    ttft: formatTimelineOffset(detail.ttftMs, t),
    decoding: formatTimelineOffset(detail.decodingMs, t)
  });
  const timing = [duration, segments].filter((value) => value !== null).join(" \xB7 ");
  return [heading, range, timing].filter((value) => value !== null && value !== "").join("\n");
}
function orderedRange(left, right) {
  return left <= right ? { start: left, end: right } : { start: right, end: left };
}
function clampFraction(value) {
  return Math.min(1, Math.max(0, value));
}
function centeredRange(center, width, minimum, maximum) {
  const clampedWidth = Math.min(maximum - minimum, Math.max(0, width));
  const start = Math.min(
    Math.max(center - clampedWidth / 2, minimum),
    maximum - clampedWidth
  );
  return { start, end: start + clampedWidth };
}
function rangeFraction(range, start, duration, minimum, maximum) {
  const bounded = orderedRange(
    Math.min(maximum, Math.max(minimum, range.start)),
    Math.min(maximum, Math.max(minimum, range.end))
  );
  return {
    start: (bounded.start - start) / duration,
    end: (bounded.end - start) / duration
  };
}
function LaneLabels({ t }) {
  return /* @__PURE__ */ jsxs17("div", { className: TrajectoryTimeline_default.labels, "aria-hidden": "true", children: [
    /* @__PURE__ */ jsx24("span", { children: t("column.input") }),
    /* @__PURE__ */ jsx24("span", { children: t("column.model") }),
    /* @__PURE__ */ jsx24("span", { children: t("column.tools") })
  ] });
}
function EarlierHistoryBoundary({
  loading,
  onHover,
  onLoad,
  t
}) {
  return /* @__PURE__ */ jsx24(
    Tooltip,
    {
      label: loading ? t("history.loadingEarlier") : t("history.clickToLoadEarlier"),
      side: "right",
      delayMs: TIMELINE_TOOLTIP_DELAY_MS,
      children: /* @__PURE__ */ jsx24(
        "button",
        {
          type: "button",
          className: TrajectoryTimeline_default.earlierHistory,
          "data-earlier-history": true,
          "data-loading": loading || void 0,
          "aria-label": loading ? t("history.loadingEarlierAria") : t("history.loadEarlier"),
          "aria-disabled": loading || onLoad === void 0,
          onClick: onLoad,
          onPointerEnter: (event) => {
            event.stopPropagation();
            onHover();
          },
          onPointerMove: (event) => {
            event.stopPropagation();
          },
          onPointerDown: (event) => {
            event.stopPropagation();
          },
          children: "\u2026"
        }
      )
    }
  );
}
var TrajectoryTimeline = memo2(function TrajectoryTimeline2({
  t,
  turns,
  mode,
  range,
  hasEarlierRecords = false,
  onLoadEarlier,
  selectedIndex = null,
  searchMatchIndexes = null,
  onRangeChange,
  onRecordSelect,
  onRecordFocus
}) {
  const model = useMemo5(() => deriveTrajectoryTimeline(turns, mode), [mode, turns]);
  const detailByIndex = useMemo5(
    () => new Map(turns.flatMap(
      (turn) => turn.groups.flatMap(
        (group) => group.cells.map((cell) => [cell.index, timelineRecordDetail(cell)])
      )
    )),
    [turns]
  );
  const dragRef = useRef12(null);
  const panRef = useRef12(null);
  const rootRef = useRef12(null);
  const trackRef = useRef12(null);
  const [draft, setDraft] = useState11(null);
  const [hover, setHover] = useState11(null);
  const [loadingEarlier, setLoadingEarlier] = useState11(false);
  const [panning, setPanning] = useState11(false);
  const [viewport, setViewport] = useState11(null);
  const [animateViewport, setAnimateViewport] = useState11(false);
  useEffect10(() => {
    if (model !== null && range !== null && (range.end < model.start || range.start > model.end)) {
      onRangeChange(null);
    }
  }, [model, onRangeChange, range]);
  useEffect10(() => {
    if (model === null) return;
    setAnimateViewport(false);
    setViewport((current) => current !== null && (current.end < model.start || current.start > model.end) ? null : current);
  }, [model]);
  useEffect10(() => {
    if (model === null || selectedIndex === null) return;
    const selectedSpan = model.spans.find((span) => span.index === selectedIndex);
    if (selectedSpan === void 0) return;
    setAnimateViewport(true);
    setViewport((current) => {
      if (current === null) return current;
      if (selectedSpan.end > current.start && selectedSpan.start < current.end) return current;
      const duration = Math.max(1, current.end - current.start);
      const desiredStart = selectedSpan.end <= current.start ? selectedSpan.start : selectedSpan.end - duration;
      const nextStart = Math.min(
        Math.max(desiredStart, model.start),
        Math.max(model.start, model.end - duration)
      );
      if (nextStart === current.start) return current;
      return { start: nextStart, end: nextStart + duration };
    });
  }, [model, selectedIndex]);
  const fullDuration = Math.max(1, (model?.end ?? 0) - (model?.start ?? 0));
  const viewportDuration = Math.min(
    fullDuration,
    Math.max(1, (viewport?.end ?? 0) - (viewport?.start ?? 0))
  );
  const viewportStart = model === null || viewport === null ? model?.start ?? 0 : Math.min(
    Math.max(viewport.start, model.start),
    model.end - viewportDuration
  );
  const domainDuration = viewport === null ? fullDuration : viewportDuration;
  const domainStart = viewport === null ? model?.start ?? 0 : viewportStart;
  const showsEarlierBoundary = hasEarlierRecords && model !== null && domainStart === model.start;
  const loadEarlier = onLoadEarlier === void 0 || loadingEarlier ? void 0 : () => {
    setLoadingEarlier(true);
    void onLoadEarlier().finally(() => {
      setLoadingEarlier(false);
    });
  };
  const projectedDomainStyle = model === null ? void 0 : {
    "--trajectory-domain-left": `${-(domainStart - model.start) / domainDuration * 100}%`,
    "--trajectory-domain-width": `${fullDuration / domainDuration * 100}%`
  };
  const committed = model === null || range === null ? null : rangeFraction(range, domainStart, domainDuration, model.start, model.end);
  const draftFraction = model === null || draft === null ? null : rangeFraction(draft, domainStart, domainDuration, model.start, model.end);
  const visibleRange = draftFraction ?? committed;
  const activeRange = draft ?? range;
  useEffect10(() => {
    const root = rootRef.current;
    if (root === null) return;
    const onWheel = (event) => {
      event.preventDefault();
      const track = trackRef.current;
      if (track === null || model === null) return;
      setAnimateViewport(false);
      const rect = track.getBoundingClientRect();
      const anchorFraction = clampFraction((event.clientX - rect.left) / Math.max(1, rect.width));
      const nextDuration = Math.min(
        fullDuration,
        Math.max(
          Math.min(mode === "sequence" ? MINIMUM_ZOOM_OPERATIONS : 20, fullDuration),
          domainDuration * Math.exp(event.deltaY * 15e-4)
        )
      );
      if (nextDuration >= fullDuration * 0.999) {
        setViewport(null);
        return;
      }
      const anchorTime = domainStart + anchorFraction * domainDuration;
      const nextStart = Math.min(
        Math.max(anchorTime - anchorFraction * nextDuration, model.start),
        model.end - nextDuration
      );
      setViewport({ start: nextStart, end: nextStart + nextDuration });
    };
    root.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      root.removeEventListener("wheel", onWheel);
    };
  }, [domainDuration, domainStart, fullDuration, mode, model]);
  if (model === null) {
    return /* @__PURE__ */ jsx24("section", { ref: rootRef, className: TrajectoryTimeline_default.root, "aria-label": t("timeline.aria"), children: /* @__PURE__ */ jsxs17("div", { className: TrajectoryTimeline_default.plot, children: [
      /* @__PURE__ */ jsx24(LaneLabels, { t }),
      /* @__PURE__ */ jsxs17("div", { className: TrajectoryTimeline_default.track, children: [
        /* @__PURE__ */ jsx24("span", { className: TrajectoryTimeline_default.empty, children: t("timeline.noTimingData") }),
        hasEarlierRecords && /* @__PURE__ */ jsx24(
          EarlierHistoryBoundary,
          {
            loading: loadingEarlier,
            onHover: () => {
              setHover(null);
            },
            onLoad: loadEarlier,
            t
          }
        )
      ] })
    ] }) });
  }
  const minimumSelectionDuration = Math.min(
    domainDuration,
    fullDuration / model.spans.length
  );
  const fractionAt = (event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return clampFraction((event.clientX - rect.left) / Math.max(1, rect.width));
  };
  const recordIndexAt = (event) => {
    const target = event.target instanceof HTMLElement ? event.target : null;
    const value = target?.closest("[data-timeline-record-index]")?.dataset.timelineRecordIndex;
    if (value === void 0) return null;
    const index = Number(value);
    return Number.isFinite(index) ? index : null;
  };
  const commit = (nextRange) => {
    onRangeChange(nextRange);
  };
  const onPointerDown = (event) => {
    if (event.button === 2) {
      panRef.current = {
        anchorClientX: event.clientX,
        anchorStart: domainStart,
        moved: false,
        pannable: viewport !== null,
        pointerId: event.pointerId
      };
      if (viewport !== null) setAnimateViewport(false);
      setPanning(true);
      if (typeof event.currentTarget.setPointerCapture === "function") {
        event.currentTarget.setPointerCapture(event.pointerId);
      }
      return;
    }
    if (event.button !== 0) return;
    const anchor = fractionAt(event);
    const anchorTime = domainStart + anchor * domainDuration;
    const recordIndex = recordIndexAt(event);
    setHover({ fraction: anchor, recordIndex });
    dragRef.current = {
      pointerId: event.pointerId,
      anchorTime,
      anchorClientX: event.clientX,
      recordIndex
    };
    if (typeof event.currentTarget.setPointerCapture === "function") {
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    setDraft({ start: anchorTime, end: anchorTime });
  };
  const onPointerMove = (event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const fraction = fractionAt(event);
    setHover({ fraction, recordIndex: recordIndexAt(event) });
    const pan = panRef.current;
    if (pan !== null && pan.pointerId === event.pointerId) {
      if (Math.abs(event.clientX - pan.anchorClientX) >= MINIMUM_DRAG_PX) {
        pan.moved = true;
      }
      if (!pan.pannable) return;
      const delta = (event.clientX - pan.anchorClientX) / Math.max(1, rect.width);
      const nextStart = Math.min(
        Math.max(pan.anchorStart - delta * domainDuration, model.start),
        model.end - domainDuration
      );
      setViewport({ start: nextStart, end: nextStart + domainDuration });
      return;
    }
    const drag = dragRef.current;
    if (drag === null || drag.pointerId !== event.pointerId) return;
    let nextDomainStart = domainStart;
    if (viewport !== null) {
      const localX = event.clientX - rect.left;
      const edgeWidth = Math.min(
        MAXIMUM_EDGE_PAN_PX,
        Math.max(1, rect.width * EDGE_PAN_ZONE_FRACTION)
      );
      const direction = localX < edgeWidth ? -1 : localX > rect.width - edgeWidth ? 1 : 0;
      if (direction !== 0) {
        const edgeDistance = direction < 0 ? edgeWidth - localX : localX - (rect.width - edgeWidth);
        const strength = clampFraction(edgeDistance / edgeWidth);
        const desiredStart = domainStart + direction * domainDuration * EDGE_PAN_STEP_FRACTION * Math.max(0.2, strength);
        nextDomainStart = Math.min(
          Math.max(desiredStart, model.start),
          model.end - domainDuration
        );
        if (nextDomainStart !== domainStart) {
          setAnimateViewport(false);
          setViewport({
            start: nextDomainStart,
            end: nextDomainStart + domainDuration
          });
        }
      }
    }
    const pointTime = nextDomainStart + fraction * domainDuration;
    setDraft(orderedRange(drag.anchorTime, pointTime));
  };
  const onPointerEnd = (event) => {
    const pan = panRef.current;
    if (pan !== null && pan.pointerId === event.pointerId) {
      const moved = pan.moved || Math.abs(event.clientX - pan.anchorClientX) >= MINIMUM_DRAG_PX;
      panRef.current = null;
      setPanning(false);
      if (!moved) onRangeChange(null);
      return;
    }
    const drag = dragRef.current;
    if (drag === null || drag.pointerId !== event.pointerId) return;
    const pointFraction = fractionAt(event);
    const pointTime = domainStart + pointFraction * domainDuration;
    const selected = orderedRange(drag.anchorTime, pointTime);
    setHover({ fraction: pointFraction, recordIndex: recordIndexAt(event) });
    dragRef.current = null;
    setDraft(null);
    const click = Math.abs(event.clientX - drag.anchorClientX) < MINIMUM_DRAG_PX;
    const clickedSpan = click && drag.recordIndex !== null ? model.spans.find((span) => span.index === drag.recordIndex) : void 0;
    if (clickedSpan !== void 0) {
      onRangeChange(null);
      onRecordSelect?.(clickedSpan.index);
      return;
    }
    const committedRange = selected.end - selected.start < minimumSelectionDuration ? centeredRange(
      click ? selected.start : (selected.start + selected.end) / 2,
      minimumSelectionDuration,
      model.start,
      model.end
    ) : selected;
    commit(committedRange);
    if (click) {
      const timelinePoint = selected.start;
      const nearest = model.spans.reduce((candidate, span) => {
        const candidateDistance = timelinePoint < candidate.start ? candidate.start - timelinePoint : timelinePoint > candidate.end ? timelinePoint - candidate.end : 0;
        const spanDistance = timelinePoint < span.start ? span.start - timelinePoint : timelinePoint > span.end ? timelinePoint - span.end : 0;
        return spanDistance < candidateDistance ? span : candidate;
      });
      onRecordFocus?.(nearest.index);
    }
  };
  const onKeyDown = (event) => {
    if (event.key !== "Escape" || range === null) return;
    event.preventDefault();
    onRangeChange(null);
  };
  const onPointerCancel = () => {
    dragRef.current = null;
    panRef.current = null;
    setDraft(null);
    setHover(null);
    setPanning(false);
  };
  return /* @__PURE__ */ jsx24("section", { ref: rootRef, className: TrajectoryTimeline_default.root, "aria-label": t("timeline.aria"), children: /* @__PURE__ */ jsxs17("div", { className: TrajectoryTimeline_default.plot, children: [
    /* @__PURE__ */ jsx24(LaneLabels, { t }),
    /* @__PURE__ */ jsxs17(
      "div",
      {
        ref: trackRef,
        className: TrajectoryTimeline_default.track,
        "data-panning": panning || void 0,
        "aria-label": t("timeline.overviewAria"),
        tabIndex: 0,
        onKeyDown,
        onPointerDown,
        onPointerMove,
        onPointerUp: onPointerEnd,
        onPointerCancel,
        onPointerLeave: () => {
          if (dragRef.current === null && panRef.current === null) setHover(null);
        },
        onDoubleClick: (event) => {
          event.preventDefault();
          onRangeChange(null);
        },
        onContextMenu: (event) => {
          event.preventDefault();
        },
        children: [
          showsEarlierBoundary && /* @__PURE__ */ jsx24(
            EarlierHistoryBoundary,
            {
              loading: loadingEarlier,
              onHover: () => {
                setHover(null);
              },
              onLoad: loadEarlier,
              t
            }
          ),
          hover !== null && hover.recordIndex === null && draft === null && /* @__PURE__ */ jsx24(
            "div",
            {
              className: TrajectoryTimeline_default.hoverLine,
              "data-timeline-hover-line": true,
              "aria-hidden": "true",
              style: {
                "--trajectory-hover-left": `${hover.fraction * 100}%`
              }
            }
          ),
          visibleRange !== null && /* @__PURE__ */ jsxs17(Fragment7, { children: [
            /* @__PURE__ */ jsx24(
              "div",
              {
                className: TrajectoryTimeline_default.selection,
                "data-dragging": draft === null ? void 0 : "true",
                "aria-hidden": "true",
                style: {
                  "--trajectory-selection-left": `${visibleRange.start * 100}%`,
                  "--trajectory-selection-width": `${(visibleRange.end - visibleRange.start) * 100}%`
                }
              }
            ),
            /* @__PURE__ */ jsx24(
              "div",
              {
                className: TrajectoryTimeline_default.selectionEdges,
                "data-dragging": draft === null ? void 0 : "true",
                "aria-hidden": "true",
                style: {
                  "--trajectory-selection-left": `${visibleRange.start * 100}%`,
                  "--trajectory-selection-width": `${(visibleRange.end - visibleRange.start) * 100}%`
                }
              }
            )
          ] }),
          /* @__PURE__ */ jsx24(
            "div",
            {
              className: TrajectoryTimeline_default.turnBoundaries,
              "data-animate-viewport": animateViewport || void 0,
              "aria-hidden": "true",
              style: projectedDomainStyle,
              children: model.turnBoundaries.filter((boundary) => boundary.time > model.start && boundary.time >= domainStart && boundary.time <= domainStart + domainDuration).map((boundary) => /* @__PURE__ */ jsx24(
                "span",
                {
                  className: TrajectoryTimeline_default.turnBoundary,
                  "data-turn": boundary.turn,
                  style: {
                    "--trajectory-turn-left": `${(boundary.time - model.start) / fullDuration * 100}%`
                  }
                },
                boundary.turn
              ))
            }
          ),
          /* @__PURE__ */ jsx24(
            "div",
            {
              className: TrajectoryTimeline_default.lanes,
              "data-animate-viewport": animateViewport || void 0,
              "data-timeline-domain": true,
              style: projectedDomainStyle,
              children: model.spans.filter((span) => span.index === selectedIndex || span.end >= domainStart && span.start <= domainStart + domainDuration).map((span) => {
                const left = (span.start - model.start) / fullDuration;
                const width = (span.end - span.start) / fullDuration;
                const widthPercent = width * 100;
                const detail = detailByIndex.get(span.index);
                const ttftMs = detail?.ttftMs;
                const decodingMs = detail?.decodingMs;
                const ttftFraction = ttftMs === void 0 || decodingMs === void 0 || ttftMs + decodingMs <= 0 ? null : ttftMs / (ttftMs + decodingMs);
                return /* @__PURE__ */ jsx24(
                  Tooltip,
                  {
                    label: () => timelineTooltipLabel(span.kind, detail, t),
                    side: "bottom",
                    delayMs: TIMELINE_TOOLTIP_DELAY_MS,
                    children: /* @__PURE__ */ jsx24(
                      "span",
                      {
                        "aria-hidden": "true",
                        className: TrajectoryTimeline_default.span,
                        "data-timeline-span": span.kind,
                        "data-timeline-record-index": span.index,
                        "data-assistant-timing": ttftFraction === null ? void 0 : "true",
                        "data-error": span.isError || void 0,
                        "data-equal-duration": mode === "time" || void 0,
                        "data-current": span.index === selectedIndex || void 0,
                        "data-hovered": hover?.recordIndex === span.index || void 0,
                        "data-search-match": searchMatchIndexes === null ? void 0 : searchMatchIndexes.has(span.index) ? "true" : "false",
                        "data-selected": activeRange === null ? void 0 : span.start <= activeRange.end && span.end >= activeRange.start ? "true" : "false",
                        style: {
                          "--trajectory-span-left": `${left * 100}%`,
                          "--trajectory-span-width": `${widthPercent}%`,
                          "--trajectory-span-gap": `min(${widthPercent * 0.08}%, 1px)`,
                          "--trajectory-span-lane": span.lane,
                          ...ttftFraction === null ? {} : { "--trajectory-assistant-ttft": `${ttftFraction * 100}%` }
                        }
                      }
                    )
                  },
                  span.index
                );
              })
            }
          )
        ]
      }
    )
  ] }) });
});

// packages/client/ui-trajectory/src/client/TrajectoryToolbar.module.css
var TrajectoryToolbar_default = {
  root: "TrajectoryToolbar_root",
  inner: "TrajectoryToolbar_inner",
  actions: "TrajectoryToolbar_actions",
  toggle: "TrajectoryToolbar_toggle",
  toggleIcon: "TrajectoryToolbar_toggleIcon",
  control: "TrajectoryToolbar_control",
  controlTrack: "TrajectoryToolbar_controlTrack",
  controlThumb: "TrajectoryToolbar_controlThumb",
  action: "TrajectoryToolbar_action",
  actionIcon: "TrajectoryToolbar_actionIcon",
  search: "TrajectoryToolbar_search",
  searchIcon: "TrajectoryToolbar_searchIcon",
  searchInput: "TrajectoryToolbar_searchInput"
};

// packages/client/ui-trajectory/src/client/TrajectoryToolbar.tsx
import { jsx as jsx25, jsxs as jsxs18 } from "react/jsx-runtime";
function TrajectoryToolbar({
  actualDuration,
  onActualDurationChange,
  actualTime,
  onActualTimeChange,
  allTurnsCollapsed,
  onToggleAllTurns,
  allAssistantsCollapsed,
  onToggleAllAssistants,
  searchQuery,
  onSearchQueryChange,
  t
}) {
  return /* @__PURE__ */ jsx25("div", { className: TrajectoryToolbar_default.root, role: "toolbar", "aria-label": t("toolbar.aria"), children: /* @__PURE__ */ jsxs18("div", { className: TrajectoryToolbar_default.inner, children: [
    /* @__PURE__ */ jsxs18("div", { className: TrajectoryToolbar_default.actions, children: [
      /* @__PURE__ */ jsxs18(
        "button",
        {
          type: "button",
          className: TrajectoryToolbar_default.toggle,
          "aria-label": t("toolbar.useActualDuration"),
          "aria-pressed": actualDuration,
          title: actualDuration ? t("toolbar.useEqualWidth") : t("toolbar.useActualDuration"),
          onClick: () => {
            onActualDurationChange(!actualDuration);
          },
          children: [
            /* @__PURE__ */ jsxs18(
              "svg",
              {
                className: TrajectoryToolbar_default.toggleIcon,
                viewBox: "0 0 16 16",
                fill: "none",
                "aria-hidden": "true",
                children: [
                  /* @__PURE__ */ jsx25("circle", { cx: "8", cy: "8", r: "5.25" }),
                  /* @__PURE__ */ jsx25("path", { d: "M8 4.75V8l2.25 1.5" })
                ]
              }
            ),
            t("toolbar.duration")
          ]
        }
      ),
      /* @__PURE__ */ jsxs18(
        "button",
        {
          type: "button",
          className: TrajectoryToolbar_default.control,
          role: "switch",
          "aria-checked": actualTime,
          hidden: true,
          onClick: () => {
            onActualTimeChange(!actualTime);
          },
          children: [
            /* @__PURE__ */ jsx25("span", { children: t("toolbar.actualTime") }),
            /* @__PURE__ */ jsx25("span", { className: TrajectoryToolbar_default.controlTrack, "data-on": actualTime || void 0, "aria-hidden": "true", children: /* @__PURE__ */ jsx25("span", { className: TrajectoryToolbar_default.controlThumb }) })
          ]
        }
      ),
      /* @__PURE__ */ jsxs18(
        "button",
        {
          type: "button",
          className: TrajectoryToolbar_default.action,
          "aria-label": allTurnsCollapsed ? t("toolbar.expandTurns") : t("toolbar.collapseTurns"),
          "aria-pressed": allTurnsCollapsed,
          title: allTurnsCollapsed ? t("toolbar.expandTurns") : t("toolbar.collapseTurns"),
          onClick: onToggleAllTurns,
          children: [
            /* @__PURE__ */ jsx25("span", { className: TrajectoryToolbar_default.actionIcon, "aria-hidden": "true", children: allTurnsCollapsed ? "\u229E" : "\u229F" }),
            t("toolbar.turns")
          ]
        }
      ),
      /* @__PURE__ */ jsxs18(
        "button",
        {
          type: "button",
          className: TrajectoryToolbar_default.action,
          "aria-label": allAssistantsCollapsed ? t("toolbar.expandCalls") : t("toolbar.collapseCalls"),
          "aria-pressed": allAssistantsCollapsed,
          title: allAssistantsCollapsed ? t("toolbar.expandCalls") : t("toolbar.collapseCalls"),
          onClick: onToggleAllAssistants,
          children: [
            /* @__PURE__ */ jsx25("span", { className: TrajectoryToolbar_default.actionIcon, "aria-hidden": "true", children: allAssistantsCollapsed ? "\u229E" : "\u229F" }),
            t("toolbar.calls")
          ]
        }
      )
    ] }),
    /* @__PURE__ */ jsxs18("div", { className: TrajectoryToolbar_default.search, children: [
      /* @__PURE__ */ jsx25(IconSearchOutlineRegular, { size: 11, className: TrajectoryToolbar_default.searchIcon }),
      /* @__PURE__ */ jsx25(
        "input",
        {
          type: "search",
          className: TrajectoryToolbar_default.searchInput,
          "aria-label": t("toolbar.search"),
          placeholder: t("toolbar.searchPlaceholder"),
          value: searchQuery,
          onChange: (event) => {
            onSearchQueryChange(event.currentTarget.value);
          }
        }
      )
    ] })
  ] }) });
}

// packages/client/ui-trajectory/src/client/trajectory-search-index.ts
function searchableJson(value) {
  if (value === void 0) return "";
  try {
    return JSON.stringify(value);
  } catch {
    return "";
  }
}
function sameSources(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}
function markdownPreview(cell) {
  if (cell.previewMarkdown === void 0) return "";
  const preview = trajectoryPreviewText(cell.previewMarkdown);
  if (cell.text === "") return preview;
  return preview === "" ? cell.text : `${cell.text} \xB7 ${preview}`;
}
function resultPreview(cell) {
  return cell.resultPreviewMarkdown === void 0 ? cell.result ?? "" : trajectoryPreviewText(cell.resultPreviewMarkdown);
}
function recordSources(turn, group, cell) {
  const blocks = [
    ...cell.sourceBlocks ?? [],
    ...cell.outputBlocks ?? []
  ];
  return [
    turn === null ? "between turns" : `turn ${turn}`,
    group,
    cell.kind,
    cell.kind === "message" ? "assistant" : "",
    cell.text,
    cell.previewMarkdown ?? "",
    cell.inputDetail ?? "",
    cell.outputDetail ?? "",
    cell.thinkingDetail ?? "",
    cell.schemaDetail ?? "",
    cell.result ?? "",
    cell.resultPreviewMarkdown ?? "",
    cell.callId ?? "",
    ...blocks.flatMap((block) => [
      block.type,
      block.content,
      block.callId ?? "",
      block.toolName ?? "",
      block.attachment?.name ?? ""
    ]),
    searchableJson(cell.messageSource),
    searchableJson(cell.promptDetail),
    searchableJson(cell.previousPromptDetail)
  ];
}
var TrajectorySearchIndex = class {
  entries = /* @__PURE__ */ new Map();
  layouts;
  /**
   * Incrementally synchronize one or more current trajectory layout slices.
   * @param layouts - Finalized and optional streaming layouts from the same view.
   * @returns Whether the indexed layout version changed.
   */
  update(layouts) {
    if (this.layouts === layouts) return false;
    this.layouts = layouts;
    const seen = /* @__PURE__ */ new Set();
    for (const turns of layouts) {
      for (const turn of turns) {
        for (const group of turn.groups) {
          for (const cell of group.cells) {
            if (cell.requestOnly === true) continue;
            const id = trajectoryRecordId(cell);
            const sources = recordSources(turn.turn, group.title, cell);
            const previous = this.entries.get(id);
            const entry = previous !== void 0 && sameSources(previous.sources, sources) ? previous : {
              sources,
              text: [
                ...sources,
                markdownPreview(cell),
                resultPreview(cell)
              ].join("\n").toLocaleLowerCase()
            };
            this.entries.set(id, entry);
            seen.add(id);
          }
        }
      }
    }
    for (const id of this.entries.keys()) {
      if (!seen.has(id)) this.entries.delete(id);
    }
    return true;
  }
  /**
   * Match a query against the latest committed index version.
   * @param query - Space-separated case-insensitive search terms.
   * @returns Matching stable record identities, or `null` without a query.
   */
  search(query) {
    const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
    if (terms.length === 0) return null;
    const matches = /* @__PURE__ */ new Set();
    for (const [id, entry] of this.entries) {
      if (terms.every((term) => entry.text.includes(term))) matches.add(id);
    }
    return matches;
  }
};

// packages/client/ui-attachment/src/MessageImage.tsx
import { useCallback as useCallback9, useEffect as useEffect11, useMemo as useMemo6, useState as useState12 } from "react";

// packages/client/ui-attachment/src/MessageImage.module.css
var MessageImage_default = {
  gallery: "MessageImage_gallery",
  frame: "MessageImage_frame",
  loading: "MessageImage_loading",
  error: "MessageImage_error",
  spinner: "MessageImage_spinner",
  "spinner-rotate": "MessageImage_spinner-rotate"
};

// packages/client/ui-attachment/src/MessageImage.tsx
import { Fragment as Fragment8, jsx as jsx26, jsxs as jsxs19 } from "react/jsx-runtime";
function singleFit(dimensions) {
  const natural = dimensions.width / dimensions.height;
  const ratio = Math.min(4, Math.max(0.25, natural));
  const box = ratio >= 1 ? { width: 240, height: 240 / ratio } : { width: 240 * ratio, height: 240 };
  const scale = Math.min(1, dimensions.width / box.width, dimensions.height / box.height);
  return {
    width: Math.max(1, Math.round(box.width * scale)),
    height: Math.max(1, Math.round(box.height * scale)),
    objectPosition: natural < 0.25 ? "center top" : natural > 4 ? "left center" : "center"
  };
}
function dimensionsOf(image) {
  if ("attachment" in image) return image.attachment;
  return image.preview.width !== void 0 && image.preview.height !== void 0 ? { width: image.preview.width, height: image.preview.height } : void 0;
}
function MessageImage({ image, load, variant, labels }) {
  const preview = "preview" in image ? image.preview : void 0;
  const attachment = "attachment" in image ? image.attachment : void 0;
  const [loaded, setLoaded] = useState12(() => attachment === void 0 ? null : load.peek?.(attachment) ?? null);
  const [error, setError] = useState12(false);
  const [open, setOpen] = useState12(false);
  const [attempt, setAttempt] = useState12(0);
  const request = useCallback9(() => {
    setAttempt((a) => a + 1);
  }, []);
  const close = useCallback9(() => {
    setOpen(false);
  }, []);
  const dimensions = useMemo6(() => dimensionsOf(image), [image]);
  const fit = useMemo6(
    () => {
      if (variant !== "single") return void 0;
      return dimensions === void 0 ? { width: 240, height: 240, objectPosition: "center" } : singleFit(dimensions);
    },
    [dimensions, variant]
  );
  useEffect11(() => {
    if (attachment === void 0) return;
    let live = true;
    setError(false);
    setLoaded(load.peek?.(attachment) ?? null);
    void load(attachment).then((url) => {
      if (live) setLoaded(url);
    }).catch(() => {
      if (live) setError(true);
    });
    return () => {
      live = false;
    };
  }, [attachment, load, attempt]);
  const src = preview?.url ?? loaded;
  const label = ("attachment" in image ? image.label : void 0) ?? preview?.name ?? attachment?.name ?? labels.image;
  const loadingThumbnail = variant === "thumbnail" && src === null;
  if (error) return /* @__PURE__ */ jsx26(
    "button",
    {
      type: "button",
      className: MessageImage_default.error,
      "data-variant": variant,
      title: variant === "thumbnail" ? labels.loadFailed : void 0,
      "aria-label": variant === "thumbnail" ? labels.loadFailed : void 0,
      onClick: request,
      children: variant === "thumbnail" ? /* @__PURE__ */ jsx26("span", { "aria-hidden": "true", children: /* @__PURE__ */ jsx26(IconRefreshOutlineRegular, {}) }) : labels.loadFailed
    }
  );
  return /* @__PURE__ */ jsxs19(Fragment8, { children: [
    /* @__PURE__ */ jsx26(
      "button",
      {
        type: "button",
        className: MessageImage_default.frame,
        "data-variant": variant,
        style: fit === void 0 ? void 0 : { width: fit.width, height: fit.height },
        title: loadingThumbnail ? labels.loading : labels.open,
        "aria-label": loadingThumbnail ? labels.loading : labels.openNamed(label),
        "aria-busy": loadingThumbnail || void 0,
        onClick: () => {
          if (src !== null) setOpen(true);
        },
        children: src === null ? /* @__PURE__ */ jsx26("span", { className: MessageImage_default.loading, "aria-hidden": loadingThumbnail || void 0, children: loadingThumbnail ? /* @__PURE__ */ jsx26(IconLoadingOutlineRegular, { className: MessageImage_default.spinner }) : labels.loading }) : /* @__PURE__ */ jsx26("img", { src, alt: label, style: fit === void 0 ? void 0 : { objectPosition: fit.objectPosition } })
      }
    ),
    open && src !== null && /* @__PURE__ */ jsx26(ImageLightbox, { src, alt: label, labels: labels.lightbox, onClose: close })
  ] });
}
function ImageGallery({ images, load, align, compact = false, thumbnail = false, labels }) {
  if (images.length === 0) return null;
  const variant = thumbnail ? "thumbnail" : compact || images.length > 1 ? "tile" : "single";
  return /* @__PURE__ */ jsx26("div", { className: MessageImage_default.gallery, "data-align": align, children: images.map((image, index) => /* @__PURE__ */ jsx26(
    MessageImage,
    {
      image,
      load,
      variant,
      labels
    },
    `${"attachment" in image ? image.attachment.attachmentId : image.preview.url}:${index}`
  )) });
}
export {
  ImageGallery,
  PTC_TOOL_NAME,
  TrajectorySearchIndex,
  TrajectoryTable,
  TrajectoryTimeline,
  TrajectoryToolbar,
  codeProgram,
  deriveTrajectoryTimeline,
  formatDurationMillis,
  formatElapsedSeconds,
  formatTimelineOffset,
  trajectoryRecordId,
  trajectoryTimelineFocusIndexes
};
//# sourceMappingURL=renderer.js.map
