/**
 * Reads chart colors from the live CSS custom properties in globals.css
 * instead of duplicating hex/oklch values here, so this module and Tailwind
 * can never drift apart (ENGINEERING_PRINCIPLES.md §10).
 *
 * `up`/`down` are the candle colors, deliberately not named success/danger:
 * this is a solo tool, so PriceChart skips the red/green win-loss
 * convention (blue up, neutral down) rather than implying a verdict on
 * every bar. See the --chart-up/--chart-down comment in globals.css for the
 * verified contrast numbers.
 */
export type ChartPalette = {
  up: string;
  down: string;
  muted: string;
  surface: string;
  border: string;
};

const FALLBACK_PALETTE: ChartPalette = {
  up: "#155dfc",
  down: "#0a0a0a",
  muted: "#71717a",
  surface: "#ffffff",
  border: "#e4e4e7",
};

/**
 * Round-trips the resolved color through a canvas 2D context instead of
 * returning `getComputedStyle().color` directly. Chromium serializes this
 * app's oklch-based tokens back out as `lab(...)`, which the canvas
 * fillStyle parser accepts fine but lightweight-charts' own bespoke color
 * parser does not ("Failed to parse color: lab(...)", found rendering the
 * first real chart) — getImageData always hands back plain 0-255 sRGB, a
 * format every consumer can read. Same canvas-readback technique used to
 * verify the --input contrast ratio in globals.css.
 */
function resolveColor(cssVariable: string): string {
  const probe = document.createElement("span");
  probe.style.color = `var(${cssVariable})`;
  document.body.appendChild(probe);
  const computed = getComputedStyle(probe).color;
  document.body.removeChild(probe);

  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;
  const ctx = canvas.getContext("2d");
  if (!ctx) return computed;

  ctx.fillStyle = computed;
  ctx.fillRect(0, 0, 1, 1);
  const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
  const alpha = a ?? 255;
  return alpha === 255 ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${alpha / 255})`;
}

/**
 * Client-only (charts are lazy Client Components, §12). Returns the fallback
 * palette during SSR/build, where there is no DOM to resolve tokens from.
 */
export function getChartPalette(): ChartPalette {
  if (typeof document === "undefined") {
    return FALLBACK_PALETTE;
  }

  return {
    up: resolveColor("--chart-up"),
    down: resolveColor("--chart-down"),
    muted: resolveColor("--muted-foreground"),
    surface: resolveColor("--card"),
    border: resolveColor("--border"),
  };
}
