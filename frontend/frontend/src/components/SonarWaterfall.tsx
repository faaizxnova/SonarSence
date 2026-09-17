"use client";

/**
 * Sonar Waterfall Panel
 * ======================
 * Acoustic side-scan sonar waterfall viewer with a 7-stage preprocessing
 * pipeline (Raw → TVG → SRAD → Lee Filter → Slant Correction → YOLOv8 →
 * 3D MVB), YOLOv8 target overlays, and instant scenario switching.
 */

import React, { useEffect, useRef, useState, useCallback } from "react";
import { getSonarImageUrl } from "@/lib/api";
import type { DetectionFeature, PipelineStage } from "@/lib/types";
import { DEMO_SCENARIOS } from "@/lib/api";

interface SonarWaterfallProps {
  detections: DetectionFeature[];
  pipelineStage: PipelineStage;
  scenarioId?: string;
  customImageSrc?: string | null;
  onStageChange?: (stage: PipelineStage) => void;
  onDetectionClick?: (detection: DetectionFeature) => void;
  isProcessing?: boolean;
}

export default function SonarWaterfall({
  detections,
  pipelineStage,
  scenarioId = "gost_net1",
  customImageSrc,
  onStageChange,
  onDetectionClick,
  isProcessing = false,
}: SonarWaterfallProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [showOverlays, setShowOverlays] = useState(true);
  const imageRef = useRef<HTMLImageElement | null>(null);

  // ── Load sonar image from custom upload, backend, or local sample ──
  const loadImage = useCallback(() => {
    setImageLoaded(false);

    const matchedScenario = DEMO_SCENARIOS.find((s) => s.id === scenarioId);
    const samplePath = matchedScenario?.image || `/samples/${scenarioId}.png`;

    // 1. Raw SSS stage: show raw uploaded file or preset sample
    if (pipelineStage === "raw") {
      const rawSrc = (customImageSrc && scenarioId === "custom_upload")
        ? customImageSrc
        : `${samplePath}?t=${Date.now()}`;
        
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.src = rawSrc;
      img.onload = () => {
        imageRef.current = img;
        setImageLoaded(true);
      };
      img.onerror = () => loadFallbackTexture();
      return;
    }

    // 2. Preprocessed stages (TVG, SRAD, Lee filter, Slant correction, Annotated, MVB):
    // Fetch dynamically computed stage from the backend
    const effectiveScenario = customImageSrc ? "custom_upload" : scenarioId;
    const backendUrl = `${getSonarImageUrl(pipelineStage, effectiveScenario)}&t=${Date.now()}`;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = backendUrl;

    img.onload = () => {
      imageRef.current = img;
      setImageLoaded(true);
    };

    img.onerror = () => {
      // Graceful fallback to client sample or custom image
      const fallbackSrc = (customImageSrc && scenarioId === "custom_upload") ? customImageSrc : `${samplePath}?t=${Date.now()}`;
      const fallbackImg = new Image();
      fallbackImg.crossOrigin = "anonymous";
      fallbackImg.src = fallbackSrc;
      fallbackImg.onload = () => {
        imageRef.current = fallbackImg;
        setImageLoaded(true);
      };
      fallbackImg.onerror = () => loadFallbackTexture();
    };

    function loadFallbackTexture() {
      const offCanvas = document.createElement("canvas");
      offCanvas.width = 1024;
      offCanvas.height = 512;
      const offCtx = offCanvas.getContext("2d");
      if (offCtx) {
        const grad = offCtx.createLinearGradient(0, 0, 1024, 0);
        grad.addColorStop(0, "#081018");
        grad.addColorStop(0.48, "#1a2c3a");
        grad.addColorStop(0.5, "#04060a");
        grad.addColorStop(0.52, "#1a2c3a");
        grad.addColorStop(1, "#081018");
        offCtx.fillStyle = grad;
        offCtx.fillRect(0, 0, 1024, 512);

        const fallbackImg = new Image();
        fallbackImg.src = offCanvas.toDataURL();
        fallbackImg.onload = () => {
          imageRef.current = fallbackImg;
          setImageLoaded(true);
        };
      }
    }
  }, [pipelineStage, scenarioId, customImageSrc]);

  useEffect(() => {
    loadImage();
  }, [loadImage]);

  // ── Canvas rendering ──
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container || !imageRef.current || !imageLoaded) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const rect = container.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;

    const img = imageRef.current;
    const scaleX = canvas.width / img.width;
    const scaleY = canvas.height / img.height;

    // Clear and draw the sonar waterfall image
    ctx.fillStyle = "#0a0f1d";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    // Render Overlays according to active stage
    if (showOverlays && detections.length > 0) {
      if (pipelineStage === "mvb") {
        drawMVB3DWireframes(ctx, detections, scaleX, scaleY);
      } else if (pipelineStage === "annotated") {
        // YOLOv8 Pixel-Level Segmentation Polygon Outlines — annotated stage only
        drawYOLOSegmentationPolygons(ctx, detections, scaleX, scaleY, img.width, img.height, scenarioId);
      }
    }

    // Nadir blind track line (center)
    ctx.save();
    ctx.strokeStyle = "rgba(0, 229, 255, 0.35)";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 6]);
    ctx.beginPath();
    ctx.moveTo(canvas.width / 2, 0);
    ctx.lineTo(canvas.width / 2, canvas.height);
    ctx.stroke();
    ctx.restore();

    // Channel labels
    ctx.save();
    ctx.font = "bold 10px 'JetBrains Mono', monospace";
    ctx.fillStyle = "rgba(241, 245, 249, 0.85)";
    ctx.textAlign = "center";
    ctx.fillText("◄ PORT SWATH (75m)", canvas.width * 0.25, 18);
    ctx.fillText("STARBOARD SWATH (75m) ►", canvas.width * 0.75, 18);
    ctx.restore();

    // Range scale
    drawRangeScale(ctx, canvas.width, canvas.height);
  }, [detections, imageLoaded, pipelineStage, showOverlays]);

  // Click on detection
  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current || !imageRef.current || !onDetectionClick) return;

    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const scaleX = canvas.width / imageRef.current.width;
    const scaleY = canvas.height / imageRef.current.height;

    for (const det of detections) {
      const [x1, y1, x2, y2] = det.properties.highlight_bbox;
      const sx1 = x1 * scaleX, sy1 = y1 * scaleY;
      const sx2 = x2 * scaleX, sy2 = y2 * scaleY;

      if (x >= sx1 - 15 && x <= sx2 + 15 && y >= sy1 - 15 && y <= sy2 + 15) {
        onDetectionClick(det);
        return;
      }
    }
  };

  const stages: Array<{
    id: PipelineStage;
    label: string;
    description: string;
  }> = [
    { id: "raw", label: "1. Raw SSS", description: "Raw acoustic backscatter" },
    { id: "tvg", label: "2. TVG Gain", description: "Absorption & spreading correction" },
    { id: "srad", label: "3. SRAD", description: "Anisotropic speckle diffusion" },
    { id: "lee", label: "4. Lee Filter", description: "Adaptive statistical denoising" },
    { id: "corrected", label: "5. Slant Range", description: "Geometric nadir flattening" },
    { id: "annotated", label: "6. YOLOv8", description: "Acoustic highlight & target bounding boxes" },
    { id: "mvb", label: "7. MVB 3D Box", description: "3D Volumetric Bounding Box" },
  ];

  return (
    <div className="h-full flex flex-col bg-[var(--bg-primary)] border-r border-[var(--border-subtle)]">
      {/* Panel Header */}
      <div className="flex items-center justify-between px-3.5 py-2 bg-[var(--bg-secondary)] border-b border-[var(--border-subtle)] flex-wrap gap-2 shadow-sm">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-sky-600 shadow-[0_0_6px_rgba(2,132,199,0.5)]" />
          <span className="text-xs font-bold uppercase tracking-wider text-[var(--text-primary)] font-mono">
            Acoustic Feed • 600 kHz SSS
          </span>
        </div>

        {/* 7-Stage Pipeline Selector */}
        <div className="flex items-center gap-1 p-1 rounded-lg bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] text-[11px] font-mono flex-wrap">
          {stages.map((st) => (
            <button
              key={st.id}
              onClick={() => onStageChange?.(st.id)}
              className={`px-2 py-1 rounded-md transition-all cursor-pointer font-bold ${
                pipelineStage === st.id
                  ? "bg-[var(--accent-primary)] text-white border border-[var(--accent-primary)] shadow-sm"
                  : "text-[var(--text-secondary)] hover:bg-white"
              }`}
              title={st.description}
            >
              {st.label}
            </button>
          ))}
        </div>

        {/* Overlay Toggle */}
        <button
          onClick={() => setShowOverlays(!showOverlays)}
          className={`px-2.5 py-1 rounded-lg text-[11px] font-mono font-bold border transition-all cursor-pointer ${
            showOverlays
              ? "bg-[var(--bg-secondary)] text-[var(--accent-primary)] border-[var(--border-subtle)] shadow-sm"
              : "bg-transparent text-[var(--text-muted)] border-[var(--border-subtle)]"
          }`}
        >
          {showOverlays ? "Targets: ON" : "Targets: OFF"}
        </button>
      </div>

      {/* Waterfall Canvas */}
      <div ref={containerRef} className="flex-1 relative overflow-hidden bg-slate-950">
        {isProcessing && <div className="sonar-scan-line" />}

        <canvas
          ref={canvasRef}
          className="w-full h-full cursor-crosshair block"
          onClick={handleCanvasClick}
        />

        {!imageLoaded && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2.5 bg-slate-900/80 backdrop-blur-xs text-white">
            <div className="spinner" />
            <span className="text-xs font-mono tracking-wider text-slate-300">
              STREAMING ACOUSTIC SWATH DATA...
            </span>
          </div>
        )}
      </div>

      {/* Footer bar with no text */}
      <div className="h-6 bg-[var(--bg-tertiary)] border-t border-[var(--border-subtle)]" />
    </div>
  );
}

// ─── YOLOv8 Pixel-Level Segmentation Outline Renderer ─────────

function drawYOLOSegmentationPolygons(
  ctx: CanvasRenderingContext2D,
  detections: DetectionFeature[],
  scaleX: number,
  scaleY: number,
  imgW: number = 1024,
  imgH: number = 512,
  scenarioId: string = ""
) {
  for (let i = 0; i < detections.length; i++) {
    const det = detections[i];
    const props = det.properties;
    
    // Draw simple flat bounding box instead of segmentation (based on requirements)
    const [x1, y1, x2, y2] = props.highlight_bbox;
    const sx1 = x1 * scaleX;
    const sy1 = y1 * scaleY;
    const sx2 = x2 * scaleX;
    const sy2 = y2 * scaleY;

    ctx.save();
    ctx.strokeStyle = "#4ADE80"; // Flat thin green border
    ctx.lineWidth = 1;
    ctx.strokeRect(sx1, sy1, sx2 - sx1, sy2 - sy1);
    ctx.restore();

    drawTargetLabelBadge(ctx, det, scaleX, scaleY, i, scenarioId);
  }
}

function drawTargetLabelBadge(
  ctx: CanvasRenderingContext2D,
  det: DetectionFeature,
  scaleX: number,
  scaleY: number,
  index: number = 0,
  scenarioId: string = ""
) {
  const props = det.properties;
  const [hx1, hy1] = props.highlight_bbox;
  const x = hx1 * scaleX;
  const y = Math.max(20, hy1 * scaleY - 8);

  ctx.save();
  ctx.font = "11px sans-serif"; // plain sans-serif

  const label = `Target · H: ${props.h_target_m.toFixed(2)}m`;
  const metrics = ctx.measureText(label);
  const lw = metrics.width + 12;
  const lh = 18;

  ctx.fillStyle = "rgba(15, 28, 46, 0.9)"; // flat dark bg
  ctx.strokeStyle = "#4ADE80";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.rect(x - 2, y - lh + 4, lw, lh);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "#CBD5E1"; // light grey text
  ctx.fillText(label, x + 4, y);

  ctx.restore();
}

function drawMVB3DWireframes(
  ctx: CanvasRenderingContext2D,
  detections: DetectionFeature[],
  scaleX: number,
  scaleY: number
) {
  ctx.save();
  for (const det of detections) {
    const props = det.properties;
    const [x1, y1, x2, y2] = props.highlight_bbox;
    const sx1 = x1 * scaleX;
    const sy1 = y1 * scaleY;
    const sx2 = x2 * scaleX;
    const sy2 = y2 * scaleY;

    const zOffset = Math.max(12, Math.min(45, (props.h_target_m || 1.5) * 16));

    // Base box (Green #4ADE80)
    ctx.strokeStyle = "#4ADE80";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(sx1, sy1, sx2 - sx1, sy2 - sy1);

    // Top elevated box (Cyan #38BDF8)
    const tx1 = sx1 + zOffset * 0.7;
    const ty1 = sy1 - zOffset;
    const tx2 = sx2 + zOffset * 0.7;
    const ty2 = sy2 - zOffset;

    ctx.strokeStyle = "#38BDF8";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(tx1, ty1, tx2 - tx1, ty2 - ty1);

    // 4 Connecting Corner Pillars
    ctx.strokeStyle = "rgba(56, 189, 248, 0.75)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(sx1, sy1); ctx.lineTo(tx1, ty1);
    ctx.moveTo(sx2, sy1); ctx.lineTo(tx2, ty1);
    ctx.moveTo(sx1, sy2); ctx.lineTo(tx1, ty2);
    ctx.moveTo(sx2, sy2); ctx.lineTo(tx2, ty2);
    ctx.stroke();

    // Volume Tag Callout
    const vol = props.mvb?.volume_m3 || (props.dimensions.length_m * props.dimensions.width_m * (props.h_target_m || 1.5));
    const tag = `3D MVB: ${vol.toFixed(2)} m³ (H=${(props.h_target_m || 1.5).toFixed(2)}m)`;

    ctx.font = "11px sans-serif";
    const metrics = ctx.measureText(tag);
    const lw = metrics.width + 12;
    const lh = 18;

    let tagX = sx1;
    let tagY = Math.max(20, ty1 - 10);

    ctx.fillStyle = "rgba(15, 28, 46, 0.92)";
    ctx.strokeStyle = "#4ADE80";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.rect(tagX, tagY - lh + 4, lw, lh);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "#CBD5E1";
    ctx.fillText(tag, tagX + 6, tagY);
  }
  ctx.restore();
}

function drawRangeScale(
  ctx: CanvasRenderingContext2D,
  canvasWidth: number,
  canvasHeight: number
) {
  ctx.save();
  ctx.font = "bold 9px 'JetBrains Mono', monospace";
  ctx.fillStyle = "rgba(241, 245, 249, 0.6)";
  ctx.textAlign = "center";

  const marks = [0, 15, 30, 45, 60, 75];
  const halfW = canvasWidth / 2;

  for (const range of marks) {
    const fraction = range / 75;
    const portX = halfW - fraction * halfW;
    ctx.fillText(`${range}m`, portX, canvasHeight - 4);
    const stbdX = halfW + fraction * halfW;
    if (range > 0) ctx.fillText(`${range}m`, stbdX, canvasHeight - 4);
  }

  ctx.restore();
}
