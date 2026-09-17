"use client";

/**
 * Control Panel — top command bar with dataset selection, pipeline
 * controls, the physics/MVB inspectors, live AUV scan toggle, and
 * report export actions.
 */

import React, { useRef, useState } from "react";
import type { PipelineStatus } from "@/lib/types";
import { DEMO_SCENARIOS } from "@/lib/api";

interface ControlPanelProps {
  status: PipelineStatus;
  detectionCount: number;
  selectedScenario: string;
  onScenarioChange: (scenarioId: string) => void;
  onUpload: (file?: File | null) => void;
  onAnalyze: () => void;
  onGenerateDossier: () => void;
  onDownloadJSON: () => void;
  onDownloadCSV: () => void;
  onOpenPhysicsModal: () => void;
  onOpenMVBModal: () => void;
  isLiveScanning: boolean;
  onToggleLiveScan: () => void;
}

export default function ControlPanel({
  status,
  detectionCount,
  selectedScenario,
  onScenarioChange,
  onUpload,
  onAnalyze,
  onGenerateDossier,
  onDownloadJSON,
  onDownloadCSV,
  onOpenPhysicsModal,
  onOpenMVBModal,
  isLiveScanning,
  onToggleLiveScan,
}: ControlPanelProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [audioEnabled, setAudioEnabled] = useState(true);

  // Synthesize realistic submarine acoustic sonar ping
  const playSonarPing = () => {
    if (!audioEnabled || typeof window === "undefined") return;
    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "sine";
      osc.frequency.setValueAtTime(1200, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(700, ctx.currentTime + 0.4);

      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.45);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + 0.45);
    } catch {}
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    onUpload(file || null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const statusConfig: Record<
    PipelineStatus,
    { label: string; className: string }
  > = {
    idle: { label: "STANDBY", className: "status-badge bg-transparent text-[var(--text-muted)] border-[var(--border-subtle)]" },
    uploading: { label: "UPLOADING", className: "status-badge status-processing" },
    processing: { label: "INFERENCE", className: "status-badge status-processing" },
    complete: { label: "OPERATIONAL", className: "status-badge status-operational" },
    error: { label: "ALERT", className: "status-badge status-error" },
  };

  const currentStatus = statusConfig[status];
  const isProcessing = status === "uploading" || status === "processing";

  return (
    <header className="bg-[var(--bg-secondary)] border-b border-[var(--border-subtle)] px-4 py-2.5 flex items-center justify-between flex-wrap gap-3">
      {/* ── Left: Logo & System Identity ── */}
      <div className="flex items-center gap-3">
        <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-[var(--accent-primary)] text-white shadow-sm">
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="10" />
            <path d="M12 2a10 10 0 0 1 10 10" />
            <circle cx="12" cy="12" r="4" />
          </svg>
        </div>

        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-sm font-extrabold tracking-tight text-[var(--text-primary)]">
              SonarSense
            </h1>
            <span className="text-[10px] px-2 py-0.5 rounded-full border-[var(--border-subtle)] text-[var(--text-secondary)] font-mono font-bold border">
              600 kHz SSS
            </span>
          </div>
          <p className="text-[11px] text-[var(--text-muted)] font-semibold">
            YOLOv8 Debris Detection
          </p>
        </div>
      </div>

      {/* ── Center: 12-Object Scenario Selector & Action Buttons ── */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* 12 Object Scenarios Dropdown */}
        <div className="flex items-center gap-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-secondary)] px-3 py-1.5 shadow-sm">
          <span className="text-[11px] font-mono font-bold text-[var(--text-primary)] uppercase">
            Dataset:
          </span>
          <select
            value={selectedScenario}
            onChange={(e) => onScenarioChange(e.target.value)}
            className="bg-transparent text-xs font-mono font-semibold text-[var(--text-primary)] outline-none cursor-pointer max-w-[240px]"
          >
            {DEMO_SCENARIOS.map((sc) => (
              <option key={sc.id} value={sc.id} className="bg-[var(--bg-secondary)] text-[var(--text-primary)] font-sans">
                {sc.name}
              </option>
            ))}
          </select>
        </div>

        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".xtf,.png,.jpg,.jpeg,.tif,.tiff"
          onChange={handleFileSelect}
          className="hidden"
          id="sonar-upload"
        />

        {/* Upload XTF Button */}
        <button
          className="btn-secondary !text-xs cursor-pointer"
          onClick={() => fileInputRef.current?.click()}
          disabled={isProcessing}
          title="Upload real raw side-scan sonar image or XTF ping stream"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" />
          </svg>
          Upload Image
        </button>

        {/* Run AI Analysis Button */}
        <button
          className="btn-primary !text-xs cursor-pointer flex items-center gap-1.5 shadow-sm"
          onClick={() => {
            playSonarPing();
            onAnalyze();
          }}
          disabled={isProcessing}
        >
          {isProcessing ? (
            <div className="spinner !border-white/30 !border-t-white" style={{ width: 12, height: 12, borderWidth: 2 }} />
          ) : (
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.35-4.35" />
            </svg>
          )}
          {isProcessing ? "Processing..." : "Run AI Pipeline"}
        </button>

        {/* 3D MVB Modal Button */}
        <button
          onClick={onOpenMVBModal}
          className="btn-secondary"
          title="Inspect 3D Minimum Volumetric Bounding Box (Volume V = L x W x H)"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
            <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
          </svg>
          3D MVB Box
        </button>

        {/* Acoustic Physics & Mensuration Modal Button */}
        <button
          onClick={onOpenPhysicsModal}
          className="btn-secondary !text-xs cursor-pointer flex items-center gap-1"
          title="Inspect mathematical shadow trigonometry, TVG, SRAD & Lee formulas"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
          </svg>
          Physics Math
        </button>

        {/* Live AUV Scan Simulation Button */}
        <button
          onClick={() => {
            playSonarPing();
            onToggleLiveScan();
          }}
          className={`btn-secondary ${isLiveScanning ? "!border-[#D97706] !text-[#D97706]" : ""}`}
          title="Toggle live autonomous AUV sonar survey simulation"
        >
          <span className={`w-2 h-2 rounded-full ${isLiveScanning ? "bg-amber-500 animate-ping" : "bg-slate-400"}`} />
          {isLiveScanning ? "AUV: Active" : "Live AUV"}
        </button>

        {/* Generate Dossier Button */}
        <button
          className="btn-danger !text-xs cursor-pointer flex items-center gap-1"
          onClick={onGenerateDossier}
          disabled={isProcessing || detectionCount === 0}
          style={{ opacity: detectionCount === 0 ? 0.4 : 1 }}
          title="Export clearance dossier as PDF"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
          </svg>
          PDF Dossier
        </button>

        {/* Download JSON Button */}
        <button
          className="btn-secondary !text-xs cursor-pointer flex items-center gap-1"
          onClick={onDownloadJSON}
          disabled={isProcessing || detectionCount === 0}
          style={{ opacity: detectionCount === 0 ? 0.4 : 1 }}
          title="Export anomaly report as JSON"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
          </svg>
          JSON
        </button>

        {/* Download CSV Button */}
        <button
          className="btn-secondary !text-xs cursor-pointer flex items-center gap-1"
          onClick={onDownloadCSV}
          disabled={isProcessing || detectionCount === 0}
          style={{ opacity: detectionCount === 0 ? 0.4 : 1 }}
          title="Export anomaly report as CSV"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
          </svg>
          CSV
        </button>
      </div>

      {/* ── Right: Audio Toggle & Status ── */}
      <div className="flex items-center gap-2.5">
        {/* Audio Ping SFX Toggle */}
        <button
          onClick={() => setAudioEnabled(!audioEnabled)}
          className="btn-secondary !p-1.5 cursor-pointer"
          title={audioEnabled ? "Sonar Audio: ON" : "Sonar Audio: MUTED"}
        >
          {audioEnabled ? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
              <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
              <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
              <line x1="23" y1="9" x2="17" y2="15" />
            </svg>
          )}
        </button>

        {/* Target Count Badge */}
        {detectionCount > 0 && (
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full font-mono text-[11px] font-bold bg-[var(--bg-tertiary)] text-[var(--text-primary)] border border-[var(--border-subtle)]">
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent-primary)]" />
            {detectionCount} DETECTIONS
          </div>
        )}

        {/* Pipeline Status */}
        <span className={currentStatus.className}>
          {currentStatus.label}
        </span>
      </div>
    </header>
  );
}
