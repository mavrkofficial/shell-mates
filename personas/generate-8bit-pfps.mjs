/**
 * Generate N retro pixel lobster PFPs from personas/traits.manifest.json
 * Deterministic per index (same seed -> same lobster).
 *
 * Env: LOBSTER_COUNT (default 1000), OUT_DIR (default web/public/lobsters)
 * Loads root .env if present (optional).
 */
import "dotenv/config";
import { readFileSync, mkdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import sharp from "sharp";
import { mulberry32, hashSeed } from "./lib/seeded-rng.mjs";
import { renderLobsterBuffer } from "./lib/pixel-lobster.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));

function pickR(rng, arr) {
  return arr[Math.min(arr.length - 1, Math.floor(rng() * arr.length))];
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

async function main() {
  const count = Math.max(1, parseInt(process.env.LOBSTER_COUNT || "1000", 10));
  const outDir = process.env.OUT_DIR || join(__dirname, "..", "web", "public", "lobsters");
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

  mkdirSync(outDir, { recursive: true });

  console.log(`Generating ${count} lobsters -> ${outDir} (${w}x${w} PNG)`);

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

    const raw = renderLobsterBuffer({
      size: logical,
      background,
      colors,
      bow,
      clawScale,
      bodyScale,
    });

    const png = await sharp(raw, {
      raw: { width: logical, height: logical, channels: 4 },
    })
      .resize(w, w, { kernel: sharp.kernel.nearest })
      .png()
      .toBuffer();

    const file = join(outDir, `${id}.png`);
    await sharp(png).toFile(file);
    if (id > 0 && id % 100 === 0) console.log(`  … ${id}`);
  }

  console.log(`Done. ${count} files.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
