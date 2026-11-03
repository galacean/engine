import type { ReactNode } from "react";
import type { ImageAttachmentRef, MessageImageLabels } from "./dsh/contracts.ts";
import type { TrajectoryKey } from "./dsh/locales.ts";
import type { CommonKey } from "./dsh/common-locales.ts";

// Offline implementations of the DSH host's slot, locale and attachment contracts.
export type TranslateNS<_Namespace extends string> = (key: TrajectoryKey | CommonKey, params?: Record<string, string | number>) => string;
export type AttachmentId = string;
export type MessageImageLoader = ((attachment: ImageAttachmentRef) => Promise<string>) & {
  peek?: (attachment: ImageAttachmentRef) => string | undefined;
};
export type ToolSchema = { name: string; description?: string; parameters: Record<string, unknown>; strict?: boolean };
export type ImageProps = {
  images: readonly { attachment: ImageAttachmentRef }[];
  loadImage: MessageImageLoader;
  align?: "start" | "end";
  compact?: boolean;
  thumbnail?: boolean;
};
export type PropsRenderSlots<Name extends string> = { renderSlot: (name: Name, props: ImageProps) => ReactNode };
export type ImageGalleryProps = Omit<ImageProps, "loadImage"> & { load: MessageImageLoader; labels: MessageImageLabels };
