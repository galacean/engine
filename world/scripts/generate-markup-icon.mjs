// Run with node world/scripts/generate-markup-icon.mjs and Khronos KTX-Software 4.4.2 on PATH.
import { chromium } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { writeFile } from "node:fs/promises";

const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  const { png, layout } = await page.evaluate(async () => {
    const ICON_SIZE = 112;
    const CANVAS_SCALE = 3;
    const CYCLE_SECONDS = 3.4;
    function easeInOutCubic(t) {
      const x = Math.max(0, Math.min(1, t));
      return x < 0.5 ? 4 * x * x * x : 1 - ((-2 * x + 2) ** 3) / 2;
    }

    function cubicBezier(p0, p1, p2, p3, t) {
      const u = 1 - t;
      return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3;
    }

    /** Sample the organic 2-segment S-curve stroke in local icon space (0..ICON_SIZE). */
    function sampleScribblePoint(t, cx, cy) {
      const clamped = Math.max(0, Math.min(1, t));
      if (clamped <= 0.5) {
        const s = clamped * 2;
        return [
          cubicBezier(cx - 38, cx - 38, cx - 21, cx - 21, s),
          cubicBezier(cy + 14, cy - 8, cy - 8, cy + 7, s)
        ];
      }
      const s = (clamped - 0.5) * 2;
      return [
        cubicBezier(cx - 21, cx - 21, cx - 6, cx - 2, s),
        cubicBezier(cy + 7, cy + 24, cy + 24, cy + 12, s)
      ];
    }

    /** Draw one frame of the borderless animated Pen + S-curve stroke icon. */
    function renderAnimatedMarkupIcon(ctx, phaseSeconds) {
      const size = ICON_SIZE;
      ctx.setTransform(CANVAS_SCALE, 0, 0, CANVAS_SCALE, 0, 0);
      ctx.clearRect(0, 0, size, size);

      const cx = size * 0.5;
      const cy = size * 0.54;
      const t = ((phaseSeconds % CYCLE_SECONDS) + CYCLE_SECONDS) % CYCLE_SECONDS;

      // Motion phases:
      // 0.00 - 0.45: calm resting pen
      // 0.45 - 0.80: pen glides cleanly to start of stroke
      // 0.80 - 1.75: pen traces the luminous S-curve stroke (0 -> 1)
      // 1.75 - 2.45: hold full pen + scribble silhouette
      // 2.45 - 3.05: stroke smoothly sweeps into pen tip (start 0 -> 1) while pen returns to rest
      // 3.05 - 3.40: calm pause
      const restTip = [cx - 2, cy + 12];
      const startTip = sampleScribblePoint(0, cx, cy);

      let drawStart = 0;
      let drawEnd = 0;
      let tipX = restTip[0];
      let tipY = restTip[1];
      let extraTiltDeg = 0;
      let penLift = 0;

      if (t < 0.45) {
        tipX = restTip[0];
        tipY = restTip[1];
      } else if (t < 0.8) {
        const k = easeInOutCubic((t - 0.45) / 0.35);
        tipX = restTip[0] + (startTip[0] - restTip[0]) * k;
        tipY = restTip[1] + (startTip[1] - restTip[1]) * k - Math.sin(k * Math.PI) * 8.0;
        extraTiltDeg = -6 * k;
        penLift = Math.sin(k * Math.PI) * 2.2;
      } else if (t < 1.75) {
        const k = easeInOutCubic((t - 0.8) / 0.95);
        drawStart = 0;
        drawEnd = k;
        const pt = sampleScribblePoint(k, cx, cy);
        const ptAhead = sampleScribblePoint(Math.min(1, k + 0.03), cx, cy);
        tipX = pt[0];
        tipY = pt[1];
        const dy = ptAhead[1] - pt[1];
        extraTiltDeg = -6 + k * 6 + Math.max(-5, Math.min(5, dy * 1.1));
      } else if (t < 2.45) {
        drawStart = 0;
        drawEnd = 1;
        tipX = restTip[0];
        tipY = restTip[1];
      } else if (t < 3.05) {
        const k = easeInOutCubic((t - 2.45) / 0.6);
        drawStart = k;
        drawEnd = 1;
        tipX = restTip[0];
        tipY = restTip[1];
      }

      // 1. Draw the live S-curve stroke segment [drawStart .. drawEnd]
      if (drawEnd - drawStart > 0.006) {
        const steps = 44;
        const span = drawEnd - drawStart;

        ctx.save();
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.shadowColor = "rgba(8, 16, 30, 0.58)";
        ctx.shadowBlur = 11;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 2.6;
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 5.4;
        ctx.beginPath();
        for (let i = 0; i <= steps; i++) {
          const [px, py] = sampleScribblePoint(drawStart + (span * i) / steps, cx, cy);
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.stroke();
        ctx.restore();
      }

      // 2. Draw the bold minimalist tilted stylus/pen anchored directly at its nib (tipX, tipY)
      ctx.save();
      ctx.translate(tipX, tipY - penLift);
      ctx.rotate(((36 + extraTiltDeg) * Math.PI) / 180);
      ctx.shadowColor = "rgba(8, 16, 30, 0.62)";
      ctx.shadowBlur = 12;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 2.8;
      ctx.strokeStyle = "#ffffff";
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      const halfW = 7.4;
      const collarY = -13.5;
      const topY = -50.0;

      // Outline barrel + rounded cap + crisp tapered nib ending exactly at (0, 0)
      ctx.lineWidth = 4.8;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(-halfW, collarY);
      ctx.lineTo(-halfW, topY + 5.0);
      ctx.arcTo(-halfW, topY, 0, topY, 5.0);
      ctx.arcTo(halfW, topY, halfW, topY + 5.0, 5.0);
      ctx.lineTo(halfW, collarY);
      ctx.closePath();
      ctx.stroke();

      // Subtle collar divider line
      ctx.lineWidth = 3.6;
      ctx.beginPath();
      ctx.moveTo(-halfW + 1.0, collarY - 0.5);
      ctx.lineTo(halfW - 1.0, collarY - 0.5);
      ctx.stroke();
      ctx.restore();
    }

    const fps = 30;
    const size = ICON_SIZE * CANVAS_SCALE;
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    const tiles = [];
    const lookup = new Map();
    const frames = [];
    let left = size, top = size, right = 0, bottom = 0;
    for (let i = 0; i < Math.round(CYCLE_SECONDS * fps); i++) {
      renderAnimatedMarkupIcon(ctx, i / fps);
      const key = canvas.toDataURL();
      if (!lookup.has(key)) {
        lookup.set(key, tiles.length);
        tiles.push(await createImageBitmap(canvas));
        const pixels = ctx.getImageData(0, 0, size, size).data;
        for (let y = 0; y < size; y++) {
          for (let x = 0; x < size; x++) {
            if (pixels[(y * size + x) * 4 + 3] === 0) continue;
            left = Math.min(left, x);
            top = Math.min(top, y);
            right = Math.max(right, x + 1);
            bottom = Math.max(bottom, y + 1);
          }
        }
      }
      frames.push(lookup.get(key));
    }
    // Downsample the original 3x artwork to 1.5x. Retain transparent gutters for bilinear sampling.
    left = Math.max(0, 2 * Math.floor(left / 2) - 2);
    top = Math.max(0, 2 * Math.floor(top / 2) - 2);
    right = Math.min(size, 2 * Math.ceil(right / 2) + 2);
    bottom = Math.min(size, 2 * Math.ceil(bottom / 2) + 2);
    const width = (right - left) / 2, height = (bottom - top) / 2;
    const columns = Math.ceil(Math.sqrt(tiles.length));
    const rows = Math.ceil(tiles.length / columns);
    const atlas = document.createElement("canvas");
    atlas.width = columns * width;
    atlas.height = rows * height;
    const out = atlas.getContext("2d");
    for (const [i, tile] of tiles.entries()) {
      out.drawImage(tile, left, top, right - left, bottom - top, (i % columns) * width,
        Math.floor(i / columns) * height, width, height);
      tile.close();
    }
    return {
      png: atlas.toDataURL("image/png").split(",")[1],
      layout: { fps, columns, rows, trim: [left, top, size - right, size - bottom].map(n => n / size), frames }
    };
  });
  const assets = new URL("../demos/seed-world/assets/", import.meta.url);
  const ktx2 = execFileSync("ktx", [
    "create", "--format", "R8G8B8A8_SRGB", "--assign-tf", "srgb", "--encode", "uastc", "--uastc-quality", "3",
    "--zstd", "18", "--stdin", "--stdout"
  ], { input: Buffer.from(png, "base64"), maxBuffer: 8 * 1024 * 1024 });
  await writeFile(new URL("markup-pen.ktx2", assets), ktx2);
  await writeFile(new URL("markup-pen.json", assets), JSON.stringify(layout) + "\n");
} finally {
  await browser.close();
}
