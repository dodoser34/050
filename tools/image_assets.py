"""Track generated assets and export them at the sizes in images.prompt."""
import argparse
import json
import re
from pathlib import Path

from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "frontend/assets/img"
MANIFEST = ROOT / "prompts/images.manifest.json"


def entries():
    source = (ROOT / "prompts/images.prompt").read_text(encoding="utf-8")
    pattern = r"^\[([^\]]+)\]\s+(\d+)x(\d+)[^\n]*\n(.*?)(?=\n\s*\n|\Z)"
    return [dict(path=m[1], width=int(m[2]), height=int(m[3]), prompt=m[4].strip())
            for m in re.finditer(pattern, source, re.M | re.S)]


def refresh():
    previous = json.loads(MANIFEST.read_text(encoding="utf-8")) if MANIFEST.exists() else []
    lookup = {item["path"]: item for item in previous}
    items = []
    for entry in entries():
        entry.update({k: v for k, v in lookup.get(entry["path"], {}).items()
                      if k not in entry})
        entry["status"] = "saved" if (ASSETS / entry["path"]).is_file() else "pending"
        items.append(entry)
    MANIFEST.write_text(json.dumps(items, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return items


def save(asset, source):
    items = refresh()
    entry = next(item for item in items if item["path"] == asset)
    target = ASSETS / asset
    if target.exists():
        raise FileExistsError(target)
    target.parent.mkdir(parents=True, exist_ok=True)
    with Image.open(source) as original:
        image = original.convert("RGBA" if target.suffix == ".png" else "RGB")
        image = ImageOps.fit(image, (entry["width"], entry["height"]), method=Image.Resampling.LANCZOS)
        if target.suffix == ".png":
            if image.getextrema()[3][0] == 255:
                raise ValueError(f"Transparent PNG has no transparent pixels: {asset}")
            image.save(target, optimize=True)
        else:
            image.save(target, "WEBP", quality=85, method=6)
    entry.update(status="saved", source=str(source), generator="built-in image_gen")
    MANIFEST.write_text(json.dumps(items, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(dict(path=asset, size=[entry["width"], entry["height"]], bytes=target.stat().st_size)))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("command", choices=["list", "save", "status"])
    parser.add_argument("--asset")
    parser.add_argument("--source")
    args = parser.parse_args()
    if args.command == "save":
        save(args.asset, args.source)
    else:
        items = refresh()
        print(json.dumps(items if args.command == "list" else
                         dict(total=len(items), saved=sum(i["status"] == "saved" for i in items)),
                         ensure_ascii=False))
