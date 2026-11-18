"""Build paired review images and triangle CSVs from capture.cjs output."""
import argparse
import csv
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont
from scipy import ndimage


def load(root, filename):
    with Image.open(root / filename) as image:
        return image.convert("RGB")


def output_csv(path, header, rows):
    with path.open("w", newline="") as file:
        writer = csv.writer(file)
        writer.writerow(header)
        writer.writerows(rows)


def add_text(draw, x, y, text, size=18):
    draw.text((x, y), text, fill="#edf4f7", font=ImageFont.load_default(size=size))


def strongest_differences(before, after, frame, threshold, box_limit, ignore):
    if before.size != after.size:
        raise ValueError("Paired screenshot dimensions differ")
    width, height = before.size
    delta = np.abs(np.asarray(before, dtype=np.int16) - np.asarray(after, dtype=np.int16)).max(axis=2)
    visible_after = {(item["family"], item["id"]) for item in frame["auto"]["visible"]}
    candidates = [item for item in frame["auto"]["visible"] if item["lod"] > 0]
    candidates += [
        item for item in frame["lod0"]["visible"] if (item["family"], item["id"]) not in visible_after
    ]
    region = np.zeros((height, width), dtype=bool)
    for candidate in candidates:
        if not candidate.get("bounds"):
            continue
        left, top, right, bottom = candidate["bounds"]
        region[max(0, int(top * height) - 3):min(height, int(bottom * height) + 4),
               max(0, int(left * width) - 3):min(width, int(right * width) + 4)] = True
    for left, top, right, bottom in ignore:
        region[int(top * height):int(bottom * height), int(left * width):int(right * width)] = False
    changed = (delta >= threshold) & region
    influence = ndimage.binary_dilation(changed, iterations=4)
    labels, count = ndimage.label(influence)
    components = ndimage.find_objects(labels)
    weights = ndimage.sum_labels(np.where(changed, delta, 0), labels, np.arange(1, count + 1))
    boxes = []
    for index in sorted(range(count), key=lambda i: (-weights[i], i)):
        if len(boxes) >= box_limit or weights[index] < 8 * threshold:
            break
        y, x = components[index]
        if (x.stop - x.start) * (y.stop - y.start) > width * height * 0.35:
            continue
        boxes.append((max(0, x.start - 5), max(0, y.start - 5), min(width - 1, x.stop + 5), min(height - 1, y.stop + 5)))
    return boxes


def save_seed_sheet(out, data, pairs, suffix=""):
    width = min(680, pairs[0][1].width)
    height = round(width * pairs[0][1].height / pairs[0][1].width)
    sheet = Image.new("RGB", (width * 2 + 30, 90 + (height + 45) * len(pairs)), "#192932")
    draw = ImageDraw.Draw(sheet)
    add_text(draw, 10, 10, f"{data['template']} / Seed {data['seed']} / Spawn camera", 24)
    add_text(draw, 10, 50, "LOD0 forced")
    add_text(draw, width + 20, 50, "Automatic LOD")
    for index, (yaw, before, after, first, second) in enumerate(pairs):
        top = 90 + index * (height + 45)
        angle = f"{yaw} deg" + (" (default)" if yaw == 0 else "")
        add_text(draw, 10, top, f"{angle} / {first:,} to {second:,} rock triangles")
        sheet.paste(before.resize((width, height), Image.Resampling.LANCZOS), (10, top + 27))
        sheet.paste(after.resize((width, height), Image.Resampling.LANCZOS), (width + 20, top + 27))
    sheet.save(out / f"spawn-360{suffix}.jpg", quality=94, subsampling=0)


def seed_report(root, out, data, threshold, max_boxes, ignore):
    if not data["frames"]:
        raise ValueError("Capture did not record any views")
    frames_per_sheet = 12
    multipage = len(data["frames"]) > frames_per_sheet
    page = 1
    rows, details, pairs = [], [], []
    for frame in data["frames"]:
        yaw = frame["yaw"]
        before, after = (load(root, frame[key]["file"]) for key in ("lod0", "auto"))
        boxes = strongest_differences(before, after, frame, threshold, max_boxes, ignore)
        for image in (before, after):
            draw = ImageDraw.Draw(image)
            for box in boxes:
                draw.rectangle(box, outline="#ffffff", width=5)
                draw.rectangle(box, outline="#ff3434", width=3)
        first, second = frame["lod0"]["triangles"], frame["auto"]["triangles"]
        change = (first - second) / first if first else None
        rows.append((yaw, first, second, first - second, f"{change:.2%}" if change is not None else "", len(boxes)))
        for mode in ("lod0", "auto"):
            counts = {}
            for item in frame[mode]["visible"]:
                key = (item["family"], item["lod"])
                instances, triangles = counts.get(key, (0, 0))
                counts[key] = instances + 1, triangles + item["triangles"]
            details.extend((yaw, mode, family, lod, count, triangles)
                           for (family, lod), (count, triangles) in sorted(counts.items()))
        pairs.append((yaw, before, after, first, second))
        if len(pairs) == frames_per_sheet:
            save_seed_sheet(out, data, pairs, f"-{page:02}" if multipage else "")
            pairs.clear()
            page += 1
    if pairs:
        save_seed_sheet(out, data, pairs, f"-{page:02}" if multipage else "")
    output_csv(out / "triangles.csv", ("yaw_deg", "lod0_triangles", "auto_triangles", "saved", "saved_pct", "boxes"), rows)
    output_csv(out / "triangles-by-level.csv", ("yaw_deg", "mode", "family", "lod", "renderers", "triangles"), details)


def silhouette(image):
    rgb = np.asarray(image, dtype=np.int16)
    return rgb, np.max(np.abs(rgb - rgb[0, 0]), axis=2) > 9


def asset_report(root, out, data):
    rows = []
    width, height = data["width"], data["height"]
    expected = (width * data["supersample"], height * data["supersample"])
    for frame_index, frame in enumerate(data["frames"]):
        levels = frame["images"]
        images = [load(root, level["file"]) for level in levels]
        if any(image.size != expected for image in images):
            raise ValueError(f"Asset capture dimensions differ from {expected}")
        images = [image.resize((width, height), Image.Resampling.LANCZOS) for image in images]
        analyses = [silhouette(image) for image in images]
        rgb, mask = analyses[0]
        if not mask.any():
            raise ValueError(f"Original is absent in asset frame {frame_index}")
        for level, (other, other_mask) in zip(levels[1:], analyses[1:]):
            overlap, union = mask & other_mask, mask | other_mask
            iou = overlap.sum() / union.sum()
            mae = np.abs(rgb[overlap] - other[overlap]).mean() if overlap.any() else None
            rows.append((frame["share"], frame["yaw"], level["id"], levels[0]["triangles"], level["triangles"],
                         round(float(iou), 5), "" if mae is None else round(float(mae), 3)))
        y, x = np.where(np.logical_or.reduce([entry[1] for entry in analyses]))
        crop = (
            max(0, min(int(x.min()) - 24, width // 2 - 95)),
            max(0, min(int(y.min()) - 24, height // 2 - 60)),
            min(width, max(int(x.max()) + 25, width // 2 + 95)),
            min(height, max(int(y.max()) + 25, height // 2 + 60)),
        )
        crop_width, crop_height = crop[2] - crop[0], crop[3] - crop[1]
        sheet = Image.new(
            "RGB", (2 * (crop_width + 12) + 12, 74 + (crop_height + 32) * (len(levels) - 1)), "#192932"
        )
        draw = ImageDraw.Draw(sheet)
        add_text(draw, 12, 10, f"{frame['share']:.1%} / yaw {frame['yaw']} deg / {height}p", 22)
        add_text(draw, 12, 42, f"LOD0 / {levels[0]['triangles']:,} tris")
        for index, (level, image) in enumerate(zip(levels[1:], images[1:])):
            top = 74 + index * (crop_height + 32)
            sheet.paste(images[0].crop(crop), (12, top))
            sheet.paste(image.crop(crop), (crop_width + 24, top))
            add_text(draw, crop_width + 24, top + crop_height + 3, f"{level['id']} / {level['triangles']:,} tris", 16)
        sheet.save(out / f"asset-{frame_index:02}.png")
    output_csv(out / "asset-metrics.csv", ("screen_share", "yaw_deg", "candidate", "lod0_triangles",
                                           "candidate_triangles", "silhouette_iou", "rgb_mae_overlap"), rows)


def rectangle(value):
    parts = tuple(map(float, value.split(",")))
    if len(parts) != 4 or not (0 <= parts[0] < parts[2] <= 1 and 0 <= parts[1] < parts[3] <= 1):
        raise argparse.ArgumentTypeError("Expected left,top,right,bottom as ascending fractions of frame size")
    return parts


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("measurements", type=Path)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--threshold", type=int, default=7)
    parser.add_argument("--boxes", type=int, default=3)
    parser.add_argument("--ignore", type=rectangle, action="append", default=[])
    args = parser.parse_args()
    if not 1 <= args.threshold <= 255 or args.boxes < 0:
        parser.error("Use a threshold of 1–255 and a nonnegative box count")
    data = json.loads(args.measurements.read_text())
    root = args.measurements.parent
    args.out.mkdir(parents=True, exist_ok=True)
    if data["kind"] == "asset":
        asset_report(root, args.out, data)
    elif data["kind"] == "seed":
        seed_report(root, args.out, data, args.threshold, args.boxes, args.ignore)
    else:
        parser.error("Expected capture.cjs asset or seed measurements")


if __name__ == "__main__":
    main()
