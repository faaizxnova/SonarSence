"use client";

/**
 * MVB Modal — 3D Minimum Volumetric Bounding box visualizer with a
 * rotatable wireframe, live volume/footprint/surface-area readouts,
 * and a hazard clearance summary.
 */

import React, { useState } from "react";
import type { DetectionFeature } from "@/lib/types";
import { useModalA11y } from "@/lib/useModalA11y";
import { VIZ } from "@/lib/theme";

interface MVBModalProps {
  isOpen: boolean;
  onClose: () => void;
  detection: DetectionFeature | null;
}

export default function MVBModal({ isOpen, onClose, detection }: MVBModalProps) {
  const [rotX, setRotX] = useState(-25);
  const [rotY, setRotY] = useState(35);
  const [scaleFactor, setScaleFactor] = useState(1.0);
  const modalRef = useModalA11y(isOpen, onClose);

  if (!isOpen || !detection) return null;

  const props = detection.properties;
  const mvb = props.mvb || {
    dimensions: props.dimensions,
    volume_m3: props.dimensions.length_m * props.dimensions.width_m * props.h_target_m,
    footprint_area_m2: props.dimensions.length_m * props.dimensions.width_m,
    surface_area_m2: 2 * (props.dimensions.length_m * props.dimensions.width_m + props.dimensions.length_m * props.h_target_m + props.dimensions.width_m * props.h_target_m),
    aspect_ratio: Math.max(props.dimensions.length_m, props.dimensions.width_m) / Math.min(props.dimensions.length_m, props.dimensions.width_m),
    orientation_deg: 15.0,
  };

  const { length_m, width_m, height_m } = mvb.dimensions;

  // Normalized 3D box dimensions for SVG isometric wireframe
  const maxDim = Math.max(length_m, width_m, height_m, 1.0);
  const bx = (width_m / maxDim) * 90 * scaleFactor;
  const by = (length_m / maxDim) * 90 * scaleFactor;
  const bz = (height_m / maxDim) * 80 * scaleFactor;

  // 3D projected vertices centered at (180, 150)
  const cx = 180;
  const cy = 150;
  const radX = (rotX * Math.PI) / 180;
  const radY = (rotY * Math.PI) / 180;

  const project3D = (x: number, y: number, z: number) => {
    // Rotate Y (Yaw)
    const x1 = x * Math.cos(radY) + y * Math.sin(radY);
    const y1 = -x * Math.sin(radY) + y * Math.cos(radY);
    const z1 = z;
    // Rotate X (Pitch) — only the resulting y is needed for this 2D projection
    const y2 = y1 * Math.cos(radX) - z1 * Math.sin(radX);
    return { px: cx + x1, py: cy + y2 };
  };

  const v0 = project3D(-bx, -by, 0);
  const v1 = project3D(bx, -by, 0);
  const v2 = project3D(bx, by, 0);
  const v3 = project3D(-bx, by, 0);
  const v4 = project3D(-bx, -by, bz);
  const v5 = project3D(bx, -by, bz);
  const v6 = project3D(bx, by, bz);
  const v7 = project3D(-bx, by, bz);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fadeIn">
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="mvb-modal-title"
        className="relative w-full max-w-4xl max-h-[92vh] overflow-y-auto rounded-2xl p-6 bg-[var(--bg-secondary)] border border-[var(--border-subtle)] text-[var(--text-primary)] shadow-lg"
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-[var(--border-subtle)]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[var(--bg-tertiary)] border border-sky-300 flex items-center justify-center text-sky-500 shadow-xs">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
                <line x1="12" y1="22.08" x2="12" y2="12" />
              </svg>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 id="mvb-modal-title" className="text-base font-bold text-[var(--text-primary)] font-mono tracking-wide uppercase">
                  3D MINIMUM VOLUMETRIC BOUNDING (MVB)
                </h2>
                <span className={`status-badge threat-${props.threat_level.toLowerCase()} !text-[10px]`}>
                  {props.threat_level} THREAT
                </span>
              </div>
              <p className="text-xs text-[var(--text-muted)] font-mono">
                Target: <strong>{props.class_label.replace(/_/g, " ").toUpperCase()}</strong> • ID #{props.detection_id + 1}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            aria-label="Close 3D MVB inspector"
            className="p-2 rounded-lg text-slate-400 hover:text-[var(--text-primary)] hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
          {/* Left: 3D Wireframe Canvas */}
          <div className="p-4 rounded-xl bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] flex flex-col items-center justify-between">
            <div className="w-full flex items-center justify-between font-mono text-xs text-[var(--text-secondary)] mb-2">
              <span className="text-sky-500 font-bold">3D Wireframe Projection</span>
              <span className="text-[var(--text-muted)]">Seabed Orientation: {mvb.orientation_deg}°</span>
            </div>

            {/* SVG 3D Canvas */}
            <div
              role="img"
              aria-label={`3D wireframe of ${props.class_label.replace(/_/g, " ")}: length ${length_m.toFixed(2)} metres, width ${width_m.toFixed(2)} metres, height ${height_m.toFixed(2)} metres`}
              className="w-full h-64 relative rounded-lg border overflow-hidden flex items-center justify-center"
              style={{ background: VIZ.surface, borderColor: VIZ.surfaceBorder }}
            >
              <svg viewBox="0 0 360 300" className="w-full h-full">
                {/* Seabed Grid Plane */}
                <ellipse cx="180" cy="220" rx="140" ry="40" fill="rgba(0, 229, 255, 0.03)" stroke="rgba(0, 229, 255, 0.2)" strokeDasharray="3 3" />

                {/* Base Bottom Face (Green) */}
                <polygon
                  points={`${v0.px},${v0.py} ${v1.px},${v1.py} ${v2.px},${v2.py} ${v3.px},${v3.py}`}
                  fill="rgba(16, 185, 129, 0.2)"
                  stroke={VIZ.success}
                  strokeWidth="2"
                />

                {/* Vertical Corner Pillars */}
                <line x1={v0.px} y1={v0.py} x2={v4.px} y2={v4.py} stroke={VIZ.cyan} strokeWidth="1.5" strokeDasharray="2 2" />
                <line x1={v1.px} y1={v1.py} x2={v5.px} y2={v5.py} stroke={VIZ.cyan} strokeWidth="2" />
                <line x1={v2.px} y1={v2.py} x2={v6.px} y2={v6.py} stroke={VIZ.cyan} strokeWidth="2" />
                <line x1={v3.px} y1={v3.py} x2={v7.px} y2={v7.py} stroke={VIZ.cyan} strokeWidth="1.5" strokeDasharray="2 2" />

                {/* Top Elevated Face (Cyan Highlight) */}
                <polygon
                  points={`${v4.px},${v4.py} ${v5.px},${v5.py} ${v6.px},${v6.py} ${v7.px},${v7.py}`}
                  fill="rgba(0, 229, 255, 0.3)"
                  stroke={VIZ.cyan}
                  strokeWidth="2.5"
                />

                {/* Side Face Highlights */}
                <polygon
                  points={`${v1.px},${v1.py} ${v2.px},${v2.py} ${v6.px},${v6.py} ${v5.px},${v5.py}`}
                  fill="rgba(0, 229, 255, 0.12)"
                  stroke="rgba(0, 229, 255, 0.5)"
                  strokeWidth="1"
                />

                {/* Dimension Callouts */}
                <text x={v2.px + 8} y={v2.py} fill={VIZ.success} fontSize="10" fontFamily="monospace">L: {length_m}m</text>
                <text x={v1.px - 30} y={v1.py + 16} fill={VIZ.elevated} fontSize="10" fontFamily="monospace">W: {width_m}m</text>
                <text x={v6.px + 10} y={(v2.py + v6.py) / 2} fill={VIZ.warning} fontSize="10" fontWeight="bold" fontFamily="monospace">H: {height_m}m</text>
              </svg>
            </div>

            {/* Rotation Sliders */}
            <div className="w-full grid grid-cols-3 gap-3 font-mono text-[11px] text-[var(--text-muted)] mt-3">
              <div>
                <div className="flex justify-between text-[var(--text-muted)]"><span>Pitch</span><span>{rotX}°</span></div>
                <input
                  type="range" min="-60" max="10" value={rotX}
                  onChange={(e) => setRotX(parseInt(e.target.value))}
                  className="w-full accent-sky-600 h-1.5 bg-slate-200 rounded cursor-pointer"
                />
              </div>
              <div>
                <div className="flex justify-between text-[var(--text-muted)]"><span>Yaw</span><span>{rotY}°</span></div>
                <input
                  type="range" min="-90" max="90" value={rotY}
                  onChange={(e) => setRotY(parseInt(e.target.value))}
                  className="w-full accent-sky-600 h-1.5 bg-slate-200 rounded cursor-pointer"
                />
              </div>
              <div>
                <div className="flex justify-between text-[var(--text-muted)]"><span>Scale</span><span>{scaleFactor.toFixed(1)}x</span></div>
                <input
                  type="range" min="0.6" max="1.5" step="0.1" value={scaleFactor}
                  onChange={(e) => setScaleFactor(parseFloat(e.target.value))}
                  className="w-full accent-sky-600 h-1.5 bg-slate-200 rounded cursor-pointer"
                />
              </div>
            </div>
          </div>

          {/* Right: Volumetric Metrics & Physical Parameters */}
          <div className="flex flex-col gap-4">
            {/* Primary Volume & Area Cards */}
            <div className="grid grid-cols-2 gap-3 font-mono">
              <div className="p-3.5 rounded-xl bg-[var(--bg-tertiary)] border border-[var(--border-subtle)]">
                <div className="text-[10px] text-[var(--text-muted)] uppercase font-bold">3D Enclosed Volume</div>
                <div className="text-xl font-bold text-sky-700 mt-1">{mvb.volume_m3.toFixed(3)} m³</div>
                <div className="text-[10px] text-[var(--text-muted)]">{(mvb.volume_m3 * 1000).toFixed(0)} Liters equivalent</div>
              </div>

              <div className="p-3.5 rounded-xl bg-[var(--bg-tertiary)] border border-[var(--border-subtle)]">
                <div className="text-[10px] text-[var(--text-muted)] uppercase font-bold">Seabed Footprint</div>
                <div className="text-xl font-bold text-emerald-700 mt-1">{mvb.footprint_area_m2.toFixed(2)} m²</div>
                <div className="text-[10px] text-[var(--text-muted)]">Total Seafloor Contact</div>
              </div>
            </div>

            {/* Dimensional Breakdown Table */}
            <div className="p-4 rounded-xl bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] font-mono text-xs">
              <div className="text-sky-700 font-bold uppercase tracking-wider mb-2.5">
                Physical Mensuration Breakdown
              </div>
              <div className="space-y-1.5 text-[var(--text-secondary)]">
                <div className="flex justify-between py-1 border-b border-[var(--border-subtle)]">
                  <span className="text-[var(--text-muted)]">Along-Track Length (L):</span>
                  <span className="font-bold text-emerald-700">{length_m.toFixed(2)} m</span>
                </div>
                <div className="flex justify-between py-1 border-b border-[var(--border-subtle)]">
                  <span className="text-[var(--text-muted)]">Across-Track Width (W):</span>
                  <span className="font-bold text-sky-700">{width_m.toFixed(2)} m</span>
                </div>
                <div className="flex justify-between py-1 border-b border-[var(--border-subtle)]">
                  <span className="text-[var(--text-muted)]">Acoustic Relief Height (H):</span>
                  <span className="font-bold text-amber-700">{height_m.toFixed(3)} m</span>
                </div>
                <div className="flex justify-between py-1 border-b border-[var(--border-subtle)]">
                  <span className="text-[var(--text-muted)]">Total Surface Area (A):</span>
                  <span>{mvb.surface_area_m2.toFixed(2)} m²</span>
                </div>
                <div className="flex justify-between py-1 border-b border-[var(--border-subtle)]">
                  <span className="text-[var(--text-muted)]">Aspect Ratio (L/W):</span>
                  <span>{mvb.aspect_ratio.toFixed(2)} : 1</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-[var(--text-muted)]">Slant Range Distance:</span>
                  <span>{props.slant_range_m.toFixed(1)} m ({props.channel})</span>
                </div>
              </div>
            </div>

            {/* Maritime Threat Assessment */}
            <div className="p-3.5 rounded-xl bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] text-xs">
              <div className="font-mono font-bold text-[var(--text-primary)] mb-1">
                Hydrographic Hazard Clearance Index
              </div>
              <p className="text-[var(--text-muted)] text-[11px] leading-relaxed">
                {height_m > 1.5
                  ? "⚠️ High vertical relief exceeding 1.5m represents a severe navigation hazard for submersibles and shallow-draft vessels."
                  : "✓ Low vertical relief under 1.5m poses localized seabed entanglement and ecological risk."}
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-6 pt-4 border-t border-[var(--border-subtle)] flex items-center justify-between text-xs font-mono text-[var(--text-muted)]">
          <div>Formula: V = L × W × H | H = (L_shadow × H_towfish) / R_slant</div>
          <button
            onClick={onClose}
            className="btn-primary"
          >
            Close 3D MVB
          </button>
        </div>
      </div>
    </div>
  );
}
