/**
 * Canvas & inline-SVG colour palette.
 * =====================================
 * The Canvas2D API and raw SVG presentation attributes cannot read CSS
 * custom properties, so the sonar waterfall, radar map, and the physics
 * / MVB wireframe diagrams draw with these literal values instead of a
 * `var(--token)` string. This is the single place those values live —
 * do not hardcode a hex colour anywhere else. Keep this in sync by hand
 * with the `--surface-viewport*` tokens in `globals.css`.
 */
export const VIZ = {
  // Dark instrument-feed surfaces (sonar waterfall, radar map)
  surface: "#0B1220",
  surfaceAlt: "#0F1C2E",
  surfaceBorder: "#334155",
  gridLine: "#334155",
  text: "#E2E8F0",
  textMuted: "#94A3B8",

  // Detection overlay semantics
  highlight: "#4ADE80", // YOLOv8 acoustic-highlight bounding box (green)
  elevated: "#38BDF8", // MVB top face / relief elevation (cyan)
  nadirLine: "rgba(0, 229, 255, 0.35)",
  cyan: "#00E5FF",

  // Threat / callout accents used inside canvas & SVG diagrams
  danger: "#EF4444",
  warning: "#EAB308",
  success: "#10B981",
  amber: "#D97706",
} as const;
