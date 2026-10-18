// Captures the posters shown in place of the 3D scene on devices that can't
// run WebGL. Run with `npm run posters`, which builds the site first.
// Needs Google Chrome; set CHROME_PATH if it isn't in the default macOS location.

import { createServer } from "node:http";
import { copyFile, readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const OUT_DIR = join(ROOT, "out");
const PUBLIC_DIR = join(ROOT, "public");
const CHROME = process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PORT = 4174;

// Kept under 2000 px on each side, like every image in the project.
const POSTERS = [
  { file: "poster.jpg", width: 1920, height: 1080 },
  { file: "poster-portrait.jpg", width: 900, height: 1948 },
];

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".glb": "model/gltf-binary",
  ".woff2": "font/woff2",
  ".txt": "text/plain",
  ".jpg": "image/jpeg",
};

async function resolveFile(urlPath) {
  const clean = normalize(decodeURIComponent(urlPath.split("?")[0])).replace(/^(\.\.[/\\])+/, "");
  for (const candidate of [clean, `${clean}.html`, join(clean, "index.html")]) {
    const full = join(OUT_DIR, candidate);
    try {
      if ((await stat(full)).isFile()) return full;
    } catch {
      // try the next candidate
    }
  }
  return null;
}

const server = createServer(async (req, res) => {
  const file = await resolveFile(req.url ?? "/");
  if (!file) {
    res.writeHead(404).end();
    return;
  }
  const body = await readFile(file);
  res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" }).end(body);
});
await new Promise((resolve) => server.listen(PORT, "127.0.0.1", resolve));

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"],
});

try {
  for (const { file, width, height } of POSTERS) {
    const context = await browser.createBrowserContext();
    const page = await context.newPage();
    // Reduced motion skips the intro and stops the turntable: a still frame.
    await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
    await page.setViewport({ width, height });
    await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => document.querySelector("main")?.dataset.phase === "live", { timeout: 30000 });
    await new Promise((resolve) => setTimeout(resolve, 1500));
    await page.addStyleTag({ content: "[data-overlay] { display: none !important; }" });
    await new Promise((resolve) => setTimeout(resolve, 200));
    const target = join(PUBLIC_DIR, file);
    await page.screenshot({ path: target, type: "jpeg", quality: 82 });
    await copyFile(target, join(OUT_DIR, file));
    console.log(`Saved public/${file} (${width}×${height})`);
    await context.close();
  }
} finally {
  await browser.close();
  server.close();
}
