"use client";

/**
 * Physics Modal — acoustic preprocessing formula inspector
 * ==========================================================
 * Interactive calculator covering TVG gain correction, SRAD, the
 * adaptive Lee filter, slant-to-ground rectification, shadow-height
 * mensuration, and MVB 3D volume estimation.
 */

import React, { useState } from "react";

interface PhysicsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function PhysicsModal({ isOpen, onClose }: PhysicsModalProps) {
  const [towfishAlt, setTowfishAlt] = useState<number>(8.0);
  const [shadowLen, setShadowLen] = useState<number>(7.5);
  const [slantRange, setSlantRange] = useState<number>(28.5);
  const [targetWidth, setTargetWidth] = useState<number>(4.8);
  const [targetLength, setTargetLength] = useState<number>(8.5);

  if (!isOpen) return null;

  // Formula Calculations
  const calculatedHeight = (shadowLen * towfishAlt) / (slantRange || 1);
  const calculatedGroundRange = Math.sqrt(
    Math.max(0, slantRange * slantRange - towfishAlt * towfishAlt)
  );
  const calculatedVolume = targetWidth * targetLength * calculatedHeight;
  const calculatedFootprint = targetWidth * targetLength;
  const grazingAngleDeg =
    slantRange > towfishAlt
      ? (Math.asin(towfishAlt / slantRange) * 180) / Math.PI
      : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fadeIn">
      <div className="relative w-full max-w-5xl max-h-[92vh] overflow-y-auto rounded-2xl p-6 bg-white border border-slate-200 shadow-2xl text-slate-800">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-sky-50 border border-sky-300 flex items-center justify-center text-sky-700 shadow-xs">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="9" />
                <path d="M12 3v18M3 12h18" />
                <path d="M7 7l10 10M17 7L7 17" />
              </svg>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-extrabold text-slate-900 tracking-tight">
                  Preprocessing &amp; Mensuration Suite
                </h2>
              </div>
              <p className="text-xs text-slate-500">
                Mathematical formulations for TVG, SRAD, Lee Filter, Slant Correction, Shadow Height, and MVB 3D Volume
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-lg text-slate-400 hover:text-slate-800 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content Body */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
          {/* Left Column: Interactive Calculator & Ray-Trace */}
          <div className="p-5 rounded-xl bg-slate-50 border border-slate-200 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-sky-800 font-mono">
                1. Live Mensuration &amp; 3D Volume Calculator
              </h3>
              <span className="text-[11px] font-mono text-amber-700 font-bold">
                H_target = (L_shadow × H_towfish) / R_slant
              </span>
            </div>

            {/* Parameter Sliders */}
            <div className="space-y-3 font-mono text-xs">
              <div>
                <div className="flex justify-between text-slate-600 mb-1">
                  <span>Towfish Altitude (H_alt):</span>
                  <span className="text-sky-700 font-bold">{towfishAlt.toFixed(1)} m</span>
                </div>
                <input
                  type="range" min="2" max="25" step="0.5" value={towfishAlt}
                  onChange={(e) => setTowfishAlt(parseFloat(e.target.value))}
                  className="w-full accent-sky-600 h-1.5 bg-slate-200 rounded-lg cursor-pointer"
                />
              </div>

              <div>
                <div className="flex justify-between text-slate-600 mb-1">
                  <span>Acoustic Shadow Length (L_shadow):</span>
                  <span className="text-red-600 font-bold">{shadowLen.toFixed(1)} m</span>
                </div>
                <input
                  type="range" min="0.5" max="20" step="0.1" value={shadowLen}
                  onChange={(e) => setShadowLen(parseFloat(e.target.value))}
                  className="w-full accent-red-600 h-1.5 bg-slate-200 rounded-lg cursor-pointer"
                />
              </div>

              <div>
                <div className="flex justify-between text-slate-600 mb-1">
                  <span>Slant Range to Target (R_slant):</span>
                  <span className="text-emerald-700 font-bold">{slantRange.toFixed(1)} m</span>
                </div>
                <input
                  type="range" min={Math.max(towfishAlt + 1, 10)} max="80" step="0.5" value={slantRange}
                  onChange={(e) => setSlantRange(parseFloat(e.target.value))}
                  className="w-full accent-emerald-600 h-1.5 bg-slate-200 rounded-lg cursor-pointer"
                />
              </div>

              <div className="grid grid-cols-2 gap-3 pt-1 border-t border-slate-200">
                <div>
                  <div className="flex justify-between text-slate-600 mb-1">
                    <span>Length (L):</span>
                    <span className="text-sky-700 font-bold">{targetLength.toFixed(1)}m</span>
                  </div>
                  <input
                    type="range" min="0.5" max="25" step="0.5" value={targetLength}
                    onChange={(e) => setTargetLength(parseFloat(e.target.value))}
                    className="w-full accent-sky-600 h-1.5 bg-slate-200 rounded cursor-pointer"
                  />
                </div>
                <div>
                  <div className="flex justify-between text-slate-600 mb-1">
                    <span>Width (W):</span>
                    <span className="text-sky-700 font-bold">{targetWidth.toFixed(1)}m</span>
                  </div>
                  <input
                    type="range" min="0.5" max="15" step="0.5" value={targetWidth}
                    onChange={(e) => setTargetWidth(parseFloat(e.target.value))}
                    className="w-full accent-sky-600 h-1.5 bg-slate-200 rounded cursor-pointer"
                  />
                </div>
              </div>
            </div>

            {/* Calculated Output Cards */}
            <div className="grid grid-cols-4 gap-2 text-center font-mono text-xs">
              <div className="p-2.5 rounded-lg bg-white border border-slate-200 shadow-2xs">
                <div className="text-[9px] text-slate-500 font-bold">RELIEF HEIGHT</div>
                <div className="text-sm font-bold text-amber-700 mt-0.5">{calculatedHeight.toFixed(3)} m</div>
              </div>
              <div className="p-2.5 rounded-lg bg-white border border-slate-200 shadow-2xs">
                <div className="text-[9px] text-slate-500 font-bold">3D VOLUME</div>
                <div className="text-sm font-bold text-sky-700 mt-0.5">{calculatedVolume.toFixed(2)} m³</div>
              </div>
              <div className="p-2.5 rounded-lg bg-white border border-slate-200 shadow-2xs">
                <div className="text-[9px] text-slate-500 font-bold">FOOTPRINT</div>
                <div className="text-sm font-bold text-emerald-700 mt-0.5">{calculatedFootprint.toFixed(1)} m²</div>
              </div>
              <div className="p-2.5 rounded-lg bg-white border border-slate-200 shadow-2xs">
                <div className="text-[9px] text-slate-500 font-bold">GRAZING θ</div>
                <div className="text-sm font-bold text-purple-700 mt-0.5">{grazingAngleDeg.toFixed(1)}°</div>
              </div>
            </div>

            {/* 2D Acoustic Ray-Trace Diagram */}
            <div className="h-32 rounded-lg bg-slate-950 border border-slate-800 overflow-hidden flex items-center justify-center p-2">
              <svg viewBox="0 0 360 120" className="w-full h-full">
                <line x1="10" y1="20" x2="350" y2="20" stroke="#0284c7" strokeWidth="1" strokeDasharray="4 2" />
                <text x="15" y="16" fill="#38bdf8" fontSize="8" fontFamily="monospace">WATER SURFACE</text>

                <line x1="10" y1="105" x2="350" y2="105" stroke="#475569" strokeWidth="2" />
                <text x="15" y="116" fill="#94a3b8" fontSize="8" fontFamily="monospace">SEAFLOOR BATHYMETRY</text>

                <circle cx="60" cy="45" r="5" fill="#00e5ff" />
                <text x="70" y="47" fill="#00e5ff" fontSize="9" fontWeight="bold" fontFamily="monospace">TOWFISH (Alt: {towfishAlt.toFixed(1)}m)</text>

                <line x1="60" y1="45" x2="200" y2="92" stroke="#eab308" strokeWidth="1.5" strokeDasharray="3 3" />
                <line x1="60" y1="45" x2="270" y2="105" stroke="#ef4444" strokeWidth="1.2" strokeDasharray="2 2" />

                <rect x="200" y="90" width="16" height="15" fill="#00e5ff" rx="2" />
                <text x="180" y="85" fill="#00e5ff" fontSize="8" fontFamily="monospace">HIGHLIGHT</text>

                <rect x="216" y="103" width="54" height="4" fill="#ef4444" opacity="0.8" />
                <text x="220" y="116" fill="#ef4444" fontSize="8" fontFamily="monospace">SHADOW ({shadowLen.toFixed(1)}m)</text>
              </svg>
            </div>
          </div>

          {/* Right Column: Preprocessing Suite Mathematical Breakdown */}
          <div className="flex flex-col gap-3">
            {/* TVG Formulation */}
            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
              <div className="flex items-center gap-2 mb-1">
                <span className="w-2 h-2 rounded-full bg-sky-600" />
                <h4 className="text-xs font-bold font-mono text-slate-900 uppercase">1. Time-Varying Gain (TVG)</h4>
              </div>
              <p className="text-[11px] text-slate-600 mb-2">
                Compensates for 2-way acoustic spherical spreading ($20\log_{10} R$) and seawater absorption ($2\alpha R$).
              </p>
              <div className="p-2 rounded bg-white border border-slate-200 font-mono text-[11px] text-sky-800 shadow-2xs">
                G(R) = 20·log₁₀(R) + 2·α·R + G₀, where α = 0.05 dB/m at 600 kHz
              </div>
            </div>

            {/* SRAD Formulation */}
            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
              <div className="flex items-center gap-2 mb-1">
                <span className="w-2 h-2 rounded-full bg-emerald-600" />
                <h4 className="text-xs font-bold font-mono text-slate-900 uppercase">2. SRAD (Speckle Anisotropic Diffusion)</h4>
              </div>
              <p className="text-[11px] text-slate-600 mb-2">
                PDE-based filter smoothing homogeneous seafloor speckle while preserving sharp shadow terminations.
              </p>
              <div className="p-2 rounded bg-white border border-slate-200 font-mono text-[11px] text-emerald-800 shadow-2xs">
                ∂I/∂t = div( c(q) ∇I ),  c(q) = 1 / [1 + (q² - q₀²) / (q₀²·(1 + q₀²))]
              </div>
            </div>

            {/* Adaptive Lee Filter */}
            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
              <div className="flex items-center gap-2 mb-1">
                <span className="w-2 h-2 rounded-full bg-amber-600" />
                <h4 className="text-xs font-bold font-mono text-slate-900 uppercase">3. Adaptive Lee Filter</h4>
              </div>
              <p className="text-[11px] text-slate-600 mb-2">
                Local minimum mean square error (LMMSE) estimator reducing multiplicative speckle variance.
              </p>
              <div className="p-2 rounded bg-white border border-slate-200 font-mono text-[11px] text-amber-800 shadow-2xs">
                Î(x,y) = μ_L + K·(I(x,y) - μ_L),  K = σ²_L / (σ²_L + σ²_n)
              </div>
            </div>

            {/* Slant-to-Ground Correction */}
            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
              <div className="flex items-center gap-2 mb-1">
                <span className="w-2 h-2 rounded-full bg-purple-600" />
                <h4 className="text-xs font-bold font-mono text-slate-900 uppercase">4. Slant-to-Ground Rectification &amp; MVB</h4>
              </div>
              <div className="p-2 rounded bg-white border border-slate-200 font-mono text-[11px] text-purple-800 shadow-2xs">
                R_ground = √(R_slant² - H_towfish²)  |  3D MVB Volume V = L × W × H
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-6 pt-4 border-t border-slate-200 flex items-center justify-between text-xs font-mono text-slate-500">
          <div>References: Blondel (Handbook of Sidescan Sonar) • Yu &amp; Acton (IEEE TIP SRAD)</div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-700 text-white font-semibold transition-all cursor-pointer shadow-xs"
          >
            Close Inspector
          </button>
        </div>
      </div>
    </div>
  );
}
