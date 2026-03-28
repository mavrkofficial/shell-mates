/**
 * Animated Game Boy–style idle GIFs: same pixel lobsters as generate-8bit-pfps.mjs,
 * 4-frame vertical bob (logical pixels), quantized with gifenc.
 *
 * Env: LOBSTER_COUNT, OUT_DIR (default web/public/lobsters), GIF_DELAY_MS (default 160),
 *      BOB_FRAMES (default 4: 0,-1,-2,-1 logical px)
 *      LOBSTER_KEEP_PNG=1 — keep numbered *.png in OUT_DIR (default: remove them so the folder is GIF-only)
 */
import "dotenv/config";
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, unlinkSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import sharp from "sharp";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { GIFEncoder, quantize, applyPalette } = require("gifenc");
import { mulberry32, hashSeed } from "./lib/seeded-rng.mjs";
import { renderLobsterBuffer } from "./lib/pixel-lobster.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));

function pickR(rng, arr) {
  return arr[Math.min(arr.length - 1, Math.floor(rng() * arr.length))];
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

/** Default bob pattern (one loop); negative = move sprite up in frame */
const DEFAULT_BOB = [0, -1, -2, -1];

async function rgbaFrame(rawLogical, logical, w) {
  return sharp(rawLogical, {
    raw: { width: logical, height: logical, channels: 4 },
  })
    .resize(w, w, { kernel: sharp.kernel.nearest })
    .ensureAlpha()
    .raw()
    .toBuffer();
}

async function main() {
  const count = Math.max(1, parseInt(process.env.LOBSTER_COUNT || "1000", 10));
  const outDir = process.env.OUT_DIR || join(__dirname, "..", "web", "public", "lobsters");
  const delayMs = Math.max(40, parseInt(process.env.GIF_DELAY_MS || "160", 10));
  const manifestPath = join(__dirname, "traits.manifest.json");
  if (!existsSync(manifestPath)) {
    console.error("Missing personas/traits.manifest.json");
    process.exit(1);
  }

  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const { output, archetypes, bowColors, bodyColors, shellColors, bellyColors, eyeWhite, eyePupil, outline } =
    manifest;

  const logical = output.logicalSize || 36;
  const scale = output.scale || 8;
  const background = output.background || "#c4e8f2";
  const w = logical * scale;

  let bobPattern = DEFAULT_BOB;
  const custom = process.env.BOB_FRAMES;
  if (custom) {
    bobPattern = custom.split(",").map((s) => parseInt(s.trim(), 10));
    if (bobPattern.some((n) => !Number.isFinite(n))) {
      console.error("BOB_FRAMES must be comma-separated integers, e.g. 0,-1,-2,-1");
      process.exit(1);
    }
  }

  mkdirSync(outDir, { recursive: true });

  console.log(
    `Generating ${count} animated GIFs -> ${outDir} (${w}x${w}, ${bobPattern.length} frames, ${delayMs}ms)`
  );

  for (let id = 0; id < count; id++) {
    const rng = mulberry32(hashSeed(id));
    const arch = pickR(rng, archetypes);
    const bow = !!arch.bow && rng() > 0.08;
    const bodyScale = typeof arch.bodyScale === "number" ? arch.bodyScale : lerp(0.92, 1.08, rng());
    const [lo, hi] = arch.clawScaleRange || [0.9, 1.2];
    const clawScale = lerp(lo, hi, rng());

    const colors = {
      body: pickR(rng, bodyColors),
      shell: pickR(rng, shellColors),
      belly: pickR(rng, bellyColors),
      outline,
      eyeWhite,
      eyePupil,
      bow: bow ? pickR(rng, bowColors) : undefined,
    };

    const frameBuffers = [];
    for (const bobDy of bobPattern) {
      const raw = renderLobsterBuffer({
        size: logical,
        background,
        colors,
        bow,
        clawScale,
        bodyScale,
        bobDy,
      });
      frameBuffers.push(await rgbaFrame(raw, logical, w));
    }

    const firstRgba = new Uint8Array(frameBuffers[0]);
    const palette = quantize(firstRgba, 256);
    const encoder = GIFEncoder();
    encoder.writeFrame(applyPalette(firstRgba, palette), w, w, {
      palette,
      delay: delayMs,
      repeat: 0,
    });
    for (let f = 1; f < frameBuffers.length; f++) {
      const rgba = new Uint8Array(frameBuffers[f]);
      const index = applyPalette(rgba, palette);
      encoder.writeFrame(index, w, w, { delay: delayMs });
    }
    encoder.finish();

    const outPath = join(outDir, `${id}.gif`);
    writeFileSync(outPath, Buffer.from(encoder.bytes()));

    if (id > 0 && id % 100 === 0) console.log(`  … ${id}`);
  }

  const keepPng = process.env.LOBSTER_KEEP_PNG === "1" || process.env.LOBSTER_KEEP_PNG === "true";
  if (!keepPng) {
    let removed = 0;
    for (const name of readdirSync(outDir)) {
      if (/^\d+\.png$/u.test(name)) {
        try {
          unlinkSync(join(outDir, name));
          removed++;
        } catch {
          /* ignore */
        }
      }
    }
    if (removed > 0) {
      console.log(`Removed ${removed} numbered *.png (GIF-only folder). Set LOBSTER_KEEP_PNG=1 to keep PNGs next time.`);
    }
  }

  console.log(`Done. ${count} GIFs. Run personas:generate + personas:build to refresh registration JSON (default image path is .gif).`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
