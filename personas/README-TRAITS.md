# Retro 8-bit PFPs (`traits.manifest.json` + `personas:8bit-gif`)

You define **archetypes** and **color pools** in [`traits.manifest.json`](traits.manifest.json). The script [`generate-8bit-gifs.mjs`](generate-8bit-gifs.mjs) generates **deterministic animated GIFs** (Game Boy–style idle bob): lobster `id` always maps to the same image (seed = `hashSeed(id)`).

## Workflow (GIFs — default)

1. Edit **`personas/traits.manifest.json`** — add archetypes, tweak `bowColors`, `bodyColors`, `clawScaleRange`, etc.
2. Run:

   ```bash
   set LOBSTER_COUNT=1000
   npm run personas:8bit-gif
   ```

   GIFs go to **`web/public/lobsters/0.gif` … `{N-1}.gif`** (288×288 by default: 36×36 logical grid × 8× scale, nearest-neighbor upscale).

3. Run **`npm run personas:generate`** then **`npm run personas:build`** so registration JSON points at `/lobsters/{i}.gif` (default in code; or set **`LOBSTER_IMAGE_EXT=gif`** in `.env`).

Or one shot: **`npm run pipeline:8bit`** (skips Gemini; uses template text + 8-bit GIF art). Same as **`npm run pipeline:8bit-gif`**.

### Optional: static PNG only

If you want **non-animated** PNGs instead: **`npm run personas:8bit`**, set **`LOBSTER_IMAGE_EXT=png`**, then **`personas:generate`** + **`personas:build`**.

**GIF options:** **`GIF_DELAY_MS`** (default 160), **`BOB_FRAMES`** (comma-separated logical-pixel offsets, default `0,-1,-2,-1`). After a run, **numbered `*.png` files are removed** from `web/public/lobsters` so you only keep GIFs (set **`LOBSTER_KEEP_PNG=1`** to keep both).

## Manifest fields

| Field | Purpose |
|-------|--------|
| `output.logicalSize` | Pixel art grid size (square). |
| `output.scale` | Integer upscale (retro chunky pixels). |
| `output.background` | Hex color behind the lobster. |
| `archetypes` | Weighted equally when picking per lobster. Use `bow: true` for bows, `clawScaleRange` for male vs smol vs chonk. |
| `bowColors` | Pink / purple / white / red bows (girl-leaning archetypes). |
| `bodyColors`, `shellColors`, `bellyColors` | Pools for carapace / shell / belly. |

## Swapping in your own art

If you later draw **layer PNGs** (body, claws, bow, etc.), you can either:

- Replace the procedural renderer in [`lib/pixel-lobster.mjs`](lib/pixel-lobster.mjs) with compositing logic, or  
- Keep this manifest and only **expand palettes / archetypes** so the code still picks traits, but your new drawer uses sprites.

## Gemini vs 8-bit

- **8-bit GIF** (`personas:8bit-gif`): free at scale, no API key.  
- **Gemini** (`personas:art`): optional for one-off hero images; not required for 1000 procedural lobsters.
