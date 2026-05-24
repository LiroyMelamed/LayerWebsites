#!/usr/bin/env python3
"""Generate sharp AshrafEssa logo assets from source PDF/PNG scan."""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

try:
    import fitz
    from PIL import Image, ImageEnhance, ImageFilter, ImageOps
except ImportError:
    print("Install: pip3 install pymupdf pillow", file=sys.stderr)
    sys.exit(1)

ROOT = Path(__file__).resolve().parents[2]
FRONTEND = ROOT / "frontend"
PUBLIC = FRONTEND / "public"
LOGOS = FRONTEND / "src" / "assets" / "images" / "logos"
DEFAULT_PDF = Path.home() / "Downloads" / "CamScanner 03.05.2026 17.55.pdf"


def extract_pdf(pdf_path: Path, out_png: Path, zoom: float = 6.0) -> None:
    doc = fitz.open(pdf_path)
    page = doc[0]
    pix = page.get_pixmap(matrix=fitz.Matrix(zoom, zoom), alpha=False)
    pix.save(str(out_png))
    doc.close()


def trim_fuzz(im: Image.Image, fuzz_pct: int = 8) -> Image.Image:
    tmp_in = Path("/tmp/ashraf-trim-in.png")
    tmp_out = Path("/tmp/ashraf-trim-out.png")
    im.convert("RGB").save(tmp_in)
    subprocess.run(
        ["magick", str(tmp_in), "-fuzz", f"{fuzz_pct}%", "-trim", "+repage", str(tmp_out)],
        check=True,
    )
    return Image.open(tmp_out).convert("RGBA")


def gentle_sharpen(im: Image.Image) -> Image.Image:
    rgb = im.convert("RGB")
    rgb = rgb.filter(ImageFilter.UnsharpMask(radius=1.2, percent=120, threshold=4))
    rgb = ImageEnhance.Sharpness(rgb).enhance(1.15)
    out = rgb.convert("RGBA")
    if im.mode == "RGBA":
        out.putalpha(im.split()[3])
    return out


def white_background_to_alpha(im: Image.Image, threshold: int = 248) -> Image.Image:
    """Remove scan paper white; keep logo colors on transparent background."""
    src = im.convert("RGBA")
    px = src.load()
    w, h = src.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            # Near-white paper + light grey scan noise
            if r >= threshold and g >= threshold and b >= threshold:
                px[x, y] = (255, 255, 255, 0)
            else:
                px[x, y] = (r, g, b, 255)
    # Soften alpha edges (reduces jagged white halos)
    r, g, b, a = src.split()
    a = a.filter(ImageFilter.GaussianBlur(radius=0.6))
    return Image.merge("RGBA", (r, g, b, a))


def fit_on_canvas(im: Image.Image, size: int, bg=(255, 255, 255, 255), pad_ratio: float = 0.08) -> Image.Image:
    canvas = Image.new("RGBA", (size, size), bg)
    inner = int(size * (1 - 2 * pad_ratio))
    copy = im.copy()
    copy.thumbnail((inner, inner), Image.Resampling.LANCZOS)
    x = (size - copy.width) // 2
    y = (size - copy.height) // 2
    canvas.paste(copy, (x, y), copy)
    return canvas


def resize_width(im: Image.Image, width: int) -> Image.Image:
    ratio = width / im.width
    return im.resize((width, max(1, int(im.height * ratio))), Image.Resampling.LANCZOS)


def emblem_for_tint(full_rgba: Image.Image) -> Image.Image:
    """Dark single-tone emblem for login/toolbar tint (scales area only)."""
    w, h = full_rgba.size
    side = int(min(w, h * 0.55))
    left = (w - side) // 2
    crop = full_rgba.crop((left, 0, left + side, side))
    gray = ImageOps.grayscale(crop.convert("RGB"))
    # Dark bronze silhouette
    dark = gray.point(lambda p: 45 if p < 220 else 0)
    dark = dark.convert("RGBA")
    dark.putalpha(gray.point(lambda p: 0 if p > 235 else 255))
    return resize_width(dark, 140)


def save_png(im: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.suffix.lower() == ".ico":
        sizes = [(16, 16), (32, 32), (48, 48)]
        im.save(path, format="ICO", sizes=[(s[0], s[1]) for s in sizes])
    else:
        im.save(path, format="PNG", optimize=True)


def main() -> None:
    src = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_PDF
    mode = (sys.argv[2] if len(sys.argv) > 2 else "wordmark").lower()

    if not src.exists():
        print(f"Source not found: {src}", file=sys.stderr)
        sys.exit(1)

    raw_png = Path("/tmp/ashraf-raw.png")
    if src.suffix.lower() == ".pdf":
        print(f"# Extracting {src} at 8x")
        extract_pdf(src, raw_png, zoom=8.0)
    else:
        raw_png = src

    trimmed = trim_fuzz(Image.open(raw_png))
    sharp = gentle_sharpen(trimmed)
    logo_rgba = white_background_to_alpha(sharp)

    if mode in ("wordmark", "all"):
        # Navbar + email: full scanned wordmark, transparent background
        save_png(resize_width(logo_rgba, 900), LOGOS / "logo2.png")
        save_png(fit_on_canvas(logo_rgba, 512, pad_ratio=0.06), PUBLIC / "firm-logo.png")
        print(f"# {LOGOS / 'logo2.png'}")
        print(f"# {PUBLIC / 'firm-logo.png'}")

    if mode == "all":
        master_square = fit_on_canvas(logo_rgba, 1024, bg=(255, 255, 255, 255))
        for name, px in {
            "android-chrome-512x512.png": 512,
            "android-chrome-192x192.png": 192,
            "apple-touch-icon.png": 180,
            "logo512.png": 512,
            "logo192.png": 192,
            "favicon.png": 512,
            "favicon-32x32.png": 32,
            "favicon-16x16.png": 16,
        }.items():
            save_png(master_square.resize((px, px), Image.Resampling.LANCZOS), PUBLIC / name)
            print(f"# {PUBLIC / name}")
        save_png(master_square.resize((32, 32), Image.Resampling.LANCZOS), PUBLIC / "favicon.ico")
        save_png(resize_width(logo_rgba, 240), LOGOS / "logo.png")
        save_png(emblem_for_tint(logo_rgba), LOGOS / "logoLM.png")
        lum = ImageOps.grayscale(logo_rgba.convert("RGB"))
        white = ImageOps.invert(lum)
        alpha = logo_rgba.split()[3]
        white_rgba = Image.merge("RGBA", (white, white, white, alpha))
        save_png(resize_width(white_rgba, 400), LOGOS / "logoLMwhite.png")

    print("# Done (mode=%s). Favicons: keep existing crisp emblem unless mode=all." % mode)


if __name__ == "__main__":
    main()
