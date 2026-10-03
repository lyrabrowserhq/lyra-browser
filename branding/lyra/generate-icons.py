#!/usr/bin/env python3
# Copyright Lyra. Icon generation for Lyra Firefox branding.
# Rasterizes the Lyra bird mark into Firefox branding files.

"""Generate Firefox branding raster and SVG assets from lyra-mark.png."""

from __future__ import annotations

import base64
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
ASSETS = ROOT / "assets"
FIREFOX = ROOT / "firefox"
CONTENT = FIREFOX / "content"
FONT = ROOT / "fonts" / "SpaceMono-Bold.ttf"
LYRA_PNG = ASSETS / "lyra-mark.png"
WORDMARK = "LYRA BROWSER"

CANVAS = "#0A0A0B"
RAISED = "#16161A"
PAPER = "#FAFAFA"

LINUX_SIZES = (16, 22, 24, 32, 48, 64, 128, 256)
ICO_SIZES = (16, 32, 48, 64, 128, 256)


def run(cmd: list[str]) -> None:
    subprocess.run(cmd, check=True)


def magick(*args: str) -> None:
    run(["magick", *args])


def write(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text if text.endswith("\n") else text + "\n")


def resize_mark(dest: Path, size: int, *, background: str | None = None) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    if background:
        magick(
            str(LYRA_PNG),
            "-background",
            background,
            "-gravity",
            "center",
            "-resize",
            f"{size}x{size}",
            "-extent",
            f"{size}x{size}",
            str(dest),
        )
    else:
        magick(
            str(LYRA_PNG),
            "-background",
            "none",
            "-filter",
            "Lanczos",
            "-resize",
            f"{size}x{size}",
            str(dest),
        )


def dark_mark(src_size: int, dest: Path) -> None:
    magick(
        str(LYRA_PNG),
        "-resize",
        f"{src_size}x{src_size}",
        "(",
        "+clone",
        "-alpha",
        "extract",
        ")",
        "-alpha",
        "off",
        "-fill",
        CANVAS,
        "-colorize",
        "100",
        "-compose",
        "CopyOpacity",
        "-composite",
        str(dest),
    )


def ico_from_pngs(pngs: list[Path], dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    magick(*[str(p) for p in pngs], str(dest))


def render_wordmark(
    path: Path, text: str, fill: str, width: int, height: int, pointsize: int, kerning: int = 4
) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    magick(
        "-background",
        "none",
        "-fill",
        fill,
        "-font",
        str(FONT),
        "-pointsize",
        str(pointsize),
        "-kerning",
        str(kerning),
        f"label:{text}",
        "-gravity",
        "center",
        "-extent",
        f"{width}x{height}",
        str(path),
    )


def wordmark_svg() -> str:
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 48" fill="context-fill" fill-opacity="context-fill-opacity">
  <text x="360" y="34" text-anchor="middle" font-family="Space Mono, ui-monospace, monospace" font-weight="700" font-size="28" letter-spacing="3">{WORDMARK}</text>
</svg>
'''


def png_data_uri(path: Path) -> str:
    return "data:image/png;base64," + base64.standard_b64encode(path.read_bytes()).decode("ascii")


def write_product_svgs() -> None:
    shutil.copy2(LYRA_PNG, CONTENT / "lyra-mark.png")
    href = png_data_uri(LYRA_PNG)
    write(
        ASSETS / "lyra-mark.svg",
        f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024" role="img" aria-label="Lyra">
  <image href="{href}" width="1024" height="1024"/>
</svg>
''',
    )
    write(
        CONTENT / "about-logo.svg",
        f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" fill="context-fill" fill-opacity="context-fill-opacity" role="img" aria-label="Lyra">
  <image href="{href}" width="1024" height="1024"/>
</svg>
''',
    )
    write(
        ASSETS / "favicon.svg",
        f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="Lyra">
  <rect width="64" height="64" rx="14" fill="{CANVAS}"/>
  <image href="{href}" x="2" y="2" width="60" height="60"/>
</svg>
''',
    )
    write(
        CONTENT / "document_pdf.svg",
        f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" role="img" aria-label="PDF">
  <rect x="4" y="2" width="20" height="28" rx="2" fill="#16161A"/>
  <rect x="4" y="2" width="20" height="28" rx="2" fill="none" stroke="#FAFAFA" stroke-width="1.5"/>
  <image href="{href}" x="6" y="8" width="16" height="16"/>
</svg>
''',
    )
    write(CONTENT / "about-wordmark.svg", wordmark_svg())
    write(CONTENT / "firefox-wordmark.svg", wordmark_svg())


def main() -> int:
    if not shutil.which("magick"):
        print("need ImageMagick magick", file=sys.stderr)
        return 1
    if not FONT.is_file():
        print(f"missing font {FONT}", file=sys.stderr)
        return 1
    if not LYRA_PNG.is_file():
        print(f"missing mark {LYRA_PNG}", file=sys.stderr)
        return 1

    tmp = ROOT / ".gen-tmp"
    if tmp.exists():
        shutil.rmtree(tmp)
    tmp.mkdir()

    try:
        write_product_svgs()

        for size in LINUX_SIZES:
            resize_mark(FIREFOX / f"default{size}.png", size)

        resize_mark(CONTENT / "about-logo.png", 256)
        resize_mark(CONTENT / "about-logo@2x.png", 512)
        resize_mark(CONTENT / "about.png", 128)
        resize_mark(CONTENT / "about-logo-private.png", 256, background=RAISED)
        resize_mark(CONTENT / "about-logo-private@2x.png", 512, background=RAISED)

        resize_mark(FIREFOX / "VisualElements_70.png", 70, background=CANVAS)
        resize_mark(FIREFOX / "VisualElements_150.png", 150, background=CANVAS)
        resize_mark(FIREFOX / "PrivateBrowsing_70.png", 70, background=RAISED)
        resize_mark(FIREFOX / "PrivateBrowsing_150.png", 150, background=RAISED)

        magick(
            "-size",
            "650x500",
            f"xc:{CANVAS}",
            str(LYRA_PNG),
            "-resize",
            "380x380",
            "-gravity",
            "center",
            "-compose",
            "over",
            "-composite",
            str(FIREFOX / "background.png"),
        )

        ico_pngs = [FIREFOX / f"default{size}.png" for size in ICO_SIZES]
        ico_from_pngs(ico_pngs, FIREFOX / "firefox.ico")
        ico_from_pngs(
            [FIREFOX / "default16.png", FIREFOX / "default32.png", FIREFOX / "default64.png"],
            FIREFOX / "firefox64.ico",
        )

        doc_pngs = []
        for size in ICO_SIZES:
            png = tmp / f"document{size}.png"
            pad = max(2, size // 10)
            rx = max(1, size // 16)
            mark = tmp / f"docmark{size}.png"
            dark_mark(max(8, int(size * 0.45)), mark)
            magick(
                "-size",
                f"{size}x{size}",
                "xc:none",
                "-fill",
                PAPER,
                "-draw",
                f"roundrectangle {pad},{pad} {size - pad},{size - pad * 0.6:.0f} {rx},{rx}",
                mark,
                "-gravity",
                "center",
                "-geometry",
                f"+0+{size // 12}",
                "-compose",
                "over",
                "-composite",
                str(png),
            )
            doc_pngs.append(png)
        ico_from_pngs(doc_pngs, FIREFOX / "document.ico")
        ico_from_pngs(doc_pngs, FIREFOX / "document_pdf.ico")
        ico_from_pngs(
            [FIREFOX / "default16.png", FIREFOX / "default32.png"],
            FIREFOX / "newtab.ico",
        )
        shutil.copy2(FIREFOX / "newtab.ico", FIREFOX / "newwindow.ico")

        pb_pngs = []
        for size in ICO_SIZES:
            png = tmp / f"pb{size}.png"
            resize_mark(png, size, background=RAISED)
            pb_pngs.append(png)
        ico_from_pngs(pb_pngs, FIREFOX / "pbmode.ico")

        magick("-size", "150x57", f"xc:{CANVAS}", str(tmp / "header.png"))
        resize_mark(tmp / "header-mark.png", 40)
        magick(
            str(tmp / "header.png"),
            str(tmp / "header-mark.png"),
            "-gravity",
            "west",
            "-geometry",
            "+12+0",
            "-composite",
            "BMP3:" + str(FIREFOX / "wizHeader.bmp"),
        )
        shutil.copy2(FIREFOX / "wizHeader.bmp", FIREFOX / "wizHeaderRTL.bmp")
        magick(
            str(FIREFOX / "background.png"),
            "-resize",
            "164x314!",
            "BMP3:" + str(FIREFOX / "wizWatermark.bmp"),
        )

        wm_light = tmp / "lyra-wordmark-light.png"
        wm_dark = tmp / "lyra-wordmark-dark.png"
        render_wordmark(wm_light, WORDMARK, PAPER, 980, 80, 42)
        render_wordmark(wm_dark, WORDMARK, CANVAS, 980, 80, 42)
        shutil.copy2(wm_light, CONTENT / "about-wordmark.png")
        shutil.copy2(wm_dark, CONTENT / "about-wordmark-on-light.png")

        lockup_wm = tmp / "lockup-wordmark.png"
        magick(
            "-background",
            "none",
            "-fill",
            PAPER,
            "-font",
            str(FONT),
            "-pointsize",
            "140",
            "-kerning",
            "12",
            f"label:{WORDMARK}",
            "-trim",
            "+repage",
            str(lockup_wm),
        )
        magick(
            "(",
            str(LYRA_PNG),
            "-filter",
            "Lanczos",
            "-resize",
            "448x448",
            ")",
            "(",
            str(lockup_wm),
            ")",
            "-background",
            "none",
            "-gravity",
            "center",
            "+smush",
            "112",
            "-background",
            CANVAS,
            "-gravity",
            "center",
            "-bordercolor",
            CANVAS,
            "-border",
            "144x112",
            str(ASSETS / "lyra-lockup-on-dark.png"),
        )

        magick(
            "-size",
            "180x180",
            f"xc:{CANVAS}",
            str(LYRA_PNG),
            "-resize",
            "148x148",
            "-gravity",
            "center",
            "-composite",
            str(ASSETS / "apple-touch-icon.png"),
        )

        og_wm = tmp / "og-wordmark.png"
        magick(
            "-background",
            "none",
            "-fill",
            PAPER,
            "-font",
            str(FONT),
            "-pointsize",
            "64",
            "-kerning",
            "6",
            f"label:{WORDMARK}",
            "-trim",
            "+repage",
            str(og_wm),
        )
        magick(
            "(",
            str(LYRA_PNG),
            "-resize",
            "240x240",
            ")",
            "(",
            str(og_wm),
            ")",
            "-background",
            "none",
            "-gravity",
            "center",
            "+smush",
            "40",
            "-background",
            CANVAS,
            "-gravity",
            "center",
            "-extent",
            "1200x630",
            str(ASSETS / "og.webp"),
        )

        print("generated Firefox branding rasters under", FIREFOX)
        return 0
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


if __name__ == "__main__":
    raise SystemExit(main())
