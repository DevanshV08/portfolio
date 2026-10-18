# /// script
# requires-python = ">=3.12"
# dependencies = ["numpy==2.5.3", "pillow==12.3.0"]
# ///
"""Builds the web assets for the track backdrops from Poly Haven's CC0 HDRIs.

Run with `npm run backdrops` (needs uv). For each backdrop it writes:

  public/backdrops/<id>/light.hdr           Poly Haven's 1K HDR (1024x512): lighting and reflections
  public/backdrops/<id>/<size>/<face>.webp  the 8K HDR as a cube map with 1536 and 1024 px faces:
                                            the photo you see behind the car

The 8K sources (about 100 MB each) are downloaded once into .cache/polyhaven and never deployed.
Every image written is under 2000 px on each side.

Cube faces store radiance x as y = x / (1 + x) in sRGB: the shaded pit interior (about 0.1) and
its sunlit lane outside (up to about 20) both keep their detail in 8 bits. The site decodes
x = y / (1 - y), capped at 16 (src/components/scene/PhotoBackdrop.tsx). Faces follow OpenGL's cube
map layout, and the site looks up direction d at (-d.x, d.y, d.z), the same x flip three.js
applies to cube textures.
"""

from __future__ import annotations

import shutil
import time
import urllib.request
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / ".cache" / "polyhaven"
OUT = ROOT / "public" / "backdrops"
SOURCE_URL = "https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/{res}/{name}_{res}.hdr"

BACKDROPS = {
    "pit": "zwartkops_pit",
    "grid": "zwartkops_start_afternoon",
    "straight": "zwartkops_straight_afternoon",
}
# Face size -> supersampling per axis. Both read about 3072 source samples across a face.
FACE_SIZES = {1536: 2, 1024: 3}
FACES = ("px", "nx", "py", "ny", "pz", "nz")
# The site caps decoded radiance here: brighter is white after tone mapping anyway.
DECODE_MAX = 16.0
WEBP_QUALITY = 86
MAX_SIDE = 1999

# OpenGL cube map face selection: texel (s, t) -> lookup vector, with t = 0 on the top row
# (three.js uploads cube faces without flipping them).
LOOKUP = {
    "px": lambda sc, tc, one: (one, -tc, -sc),
    "nx": lambda sc, tc, one: (-one, -tc, sc),
    "py": lambda sc, tc, one: (sc, one, tc),
    "ny": lambda sc, tc, one: (sc, -one, -tc),
    "pz": lambda sc, tc, one: (sc, -tc, one),
    "nz": lambda sc, tc, one: (-sc, -tc, -one),
}


def fetch(name: str, res: str) -> Path:
    """Poly Haven HDR from the cache, downloading it the first time."""
    path = CACHE / f"{name}_{res}.hdr"
    if not path.exists():
        CACHE.mkdir(parents=True, exist_ok=True)
        url = SOURCE_URL.format(name=name, res=res)
        print(f"  downloading {url}")
        partial = path.with_suffix(".part")
        with urllib.request.urlopen(url) as response, partial.open("wb") as file:
            shutil.copyfileobj(response, file)
        partial.rename(path)
    return path


def hdr_size(path: Path) -> tuple[int, int]:
    """(width, height) from a Radiance header."""
    with path.open("rb") as file:
        head = file.read(4096)
    end = head.index(b"\n\n")
    axes = head[end + 2 : head.index(b"\n", end + 2)].split()
    return int(axes[3]), int(axes[1])


def read_hdr(path: Path) -> np.ndarray:
    """Decodes a Radiance .hdr (new-style RLE) to float32 RGB, the way three.js does."""
    data = path.read_bytes()
    end = data.find(b"\n\n")
    if not data.startswith(b"#?") or end < 0 or b"FORMAT=32-bit_rle_rgbe" not in data[:end]:
        raise ValueError(f"{path.name}: not a Radiance RGBE file")
    line_end = data.index(b"\n", end + 2)
    axes = data[end + 2 : line_end].split()
    if len(axes) != 4 or axes[0] != b"-Y" or axes[2] != b"+X":
        raise ValueError(f"{path.name}: unsupported orientation {axes!r}")
    height, width = int(axes[1]), int(axes[3])

    pos = line_end + 1
    rgbe = np.empty((height, 4, width), np.uint8)
    for y in range(height):
        if data[pos] != 2 or data[pos + 1] != 2 or (data[pos + 2] << 8 | data[pos + 3]) != width:
            raise ValueError(f"{path.name}: scanline {y} is not new-style RLE")
        pos += 4
        for channel in range(4):
            row = bytearray()
            while len(row) < width:
                count = data[pos]
                if count > 128:
                    row += data[pos + 1 : pos + 2] * (count - 128)
                    pos += 2
                else:
                    row += data[pos + 1 : pos + 1 + count]
                    pos += 1 + count
            if len(row) != width:
                raise ValueError(f"{path.name}: scanline {y} overruns")
            rgbe[y, channel] = np.frombuffer(row, np.uint8)

    rgbe = rgbe.transpose(0, 2, 1)
    exponent = rgbe[..., 3].astype(np.int32)
    # value = mantissa * 2^(e - 128) / 255, as three.js's HDR loaders decode it.
    scale = np.where(exponent > 0, np.ldexp(np.float32(1 / 255), exponent - 128), 0).astype(np.float32)
    return rgbe[..., :3].astype(np.float32) * scale[..., None]


def render_face(pano: np.ndarray, face: str, size: int, ss: int) -> np.ndarray:
    """Linear radiance for one cube face, size x size, averaging ss x ss samples per texel."""
    height, width, _ = pano.shape
    m = size * ss
    coords = ((np.arange(m, dtype=np.float32) + 0.5) / m) * 2 - 1
    out = np.empty((size, size, 3), np.float32)
    block = 64  # output rows per pass, to bound memory
    for r0 in range(0, size, block):
        r1 = min(size, r0 + block)
        sc, tc = np.meshgrid(coords, coords[r0 * ss : r1 * ss])
        lx, ly, lz = LOOKUP[face](sc, tc, np.ones_like(sc))
        # The site looks up direction d at (-d.x, d.y, d.z), so this texel shows:
        dx, dy, dz = -lx, ly, lz
        norm = np.sqrt(dx * dx + dy * dy + dz * dz)
        dx, dy, dz = dx / norm, dy / norm, dz / norm
        # three.js equirect convention: u from atan2(z, x); v = 1 at the top (the sky).
        u = np.arctan2(dz, dx) / np.float32(2 * np.pi) + np.float32(0.5)
        v = np.arcsin(np.clip(dy, -1, 1)) / np.float32(np.pi) + np.float32(0.5)
        x = u * width - np.float32(0.5)
        y = (1 - v) * height - np.float32(0.5)
        x0 = np.floor(x).astype(np.int64)
        y0 = np.floor(y).astype(np.int64)
        fx = (x - x0)[..., None]
        fy = (y - y0)[..., None]
        xa, xb = x0 % width, (x0 + 1) % width
        ya, yb = np.clip(y0, 0, height - 1), np.clip(y0 + 1, 0, height - 1)
        top = pano[ya, xa] * (1 - fx) + pano[ya, xb] * fx
        bottom = pano[yb, xa] * (1 - fx) + pano[yb, xb] * fx
        samples = top * (1 - fy) + bottom * fy
        out[r0:r1] = samples.reshape(r1 - r0, ss, size, ss, 3).mean(axis=(1, 3))
    return out


def encode(radiance: np.ndarray) -> Image.Image:
    """Radiance as y = x / (1 + x), in 8-bit sRGB."""
    x = np.maximum(radiance, 0)
    y = x / (1 + x)
    srgb = np.where(y <= 0.0031308, y * 12.92, 1.055 * np.power(y, 1 / 2.4) - 0.055)
    return Image.fromarray(np.clip(srgb * 255 + 0.5, 0, 255).astype(np.uint8))


def main() -> None:
    for backdrop_id, name in BACKDROPS.items():
        started = time.perf_counter()
        print(f"{backdrop_id} ({name})")
        target = OUT / backdrop_id
        target.mkdir(parents=True, exist_ok=True)

        light = fetch(name, "1k")
        if max(hdr_size(light)) > MAX_SIDE:
            raise SystemExit(f"{light.name} is too large")
        shutil.copyfile(light, target / "light.hdr")

        pano = read_hdr(fetch(name, "8k"))
        h = pano.shape[0]
        # What can be on screen: from 45 degrees above the horizon to 60 below.
        visible = pano[int(h * (0.5 - 45 / 180)) : int(h * (0.5 + 60 / 180))].max(axis=2)
        print(
            f"  decoded {pano.shape[1]}x{h}; visible band: 99.9th percentile {np.percentile(visible, 99.9):.2f}, "
            f"{(visible > DECODE_MAX).mean() * 100:.3f}% above the {DECODE_MAX:g} cap"
        )

        for size, ss in FACE_SIZES.items():
            folder = target / str(size)
            folder.mkdir(exist_ok=True)
            total = 0
            for face in FACES:
                image = encode(render_face(pano, face, size, ss))
                if max(image.size) > MAX_SIDE:
                    raise SystemExit(f"{face} face is {image.size}, over {MAX_SIDE} px")
                path = folder / f"{face}.webp"
                image.save(path, "WEBP", quality=WEBP_QUALITY, method=6)
                total += path.stat().st_size
            print(f"  {size} px faces: {total / 1e6:.2f} MB")
        del pano
        print(f"  done in {time.perf_counter() - started:.0f} s")


if __name__ == "__main__":
    main()
