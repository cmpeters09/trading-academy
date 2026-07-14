/**
 * Reads chart colors from the live CSS custom properties in globals.css
 * instead of duplicating hex/oklch values here, so a candle's green and a
 * stat's green can never drift apart (ENGINEERING_PRINCIPLES.md §10).
 */
export type ChartPalette = {
  success: string;
  danger: string;
  muted: string;
  surface: string;
  border: string;
};

const FALLBACK_PALETTE: ChartPalette = {
  success: "#16a34a",
  danger: "#dc2626",
  muted: "#71717a",
  surface: "#ffffff",
  border: "#e4e4e7",
};

function resolveColor(cssVariable: string): string {
  const probe = document.createElement("span");
  probe.style.color = `var(${cssVariable})`;
  document.body.appendChild(probe);
  const resolved = getComputedStyle(probe).color;
  document.body.removeChild(probe);
  return resolved;
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
    success: resolveColor("--success"),
    danger: resolveColor("--destructive"),
    muted: resolveColor("--muted-foreground"),
    surface: resolveColor("--card"),
    border: resolveColor("--border"),
  };
}
