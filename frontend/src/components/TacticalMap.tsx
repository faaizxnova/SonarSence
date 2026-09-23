"use client";

/**
 * Tactical Map — deep-zoom subsea GIS radar
 * ===========================================
 * Right panel: 3D subsea tactical map with smooth zoom/pan, a live
 * cursor bathymetry readout, bathymetric depth contours, and
 * threat-colored detection markers.
 */

import React, { useEffect, useRef, useState, useCallback } from "react";
import mapboxgl from "mapbox-gl";
import type { DetectionCollection, DetectionFeature } from "@/lib/types";
import { VIZ } from "@/lib/theme";
import { SURVEY_ORIGIN } from "@/lib/api";

interface TacticalMapProps {
  geojson: DetectionCollection | null;
  selectedDetection?: DetectionFeature | null;
  onDetectionSelect?: (detection: DetectionFeature) => void;
}

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "";
const DEFAULT_CENTER: [number, number] = SURVEY_ORIGIN; // Centre of the Bay of Bengal
const DEFAULT_ZOOM = 13;

export default function TacticalMap({
  geojson,
  selectedDetection,
  onDetectionSelect,
}: TacticalMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<mapboxgl.Marker[]>([]);
  const [mapReady, setMapReady] = useState(false);
  const [mapboxZoom, setMapboxZoom] = useState(DEFAULT_ZOOM);

  const hasToken = MAPBOX_TOKEN && MAPBOX_TOKEN !== "YOUR_MAPBOX_TOKEN_HERE";
  const [viewMode, setViewMode] = useState<"radar" | "mapbox">(
    hasToken ? "mapbox" : "radar"
  );

  // ── Radar Canvas Interactive Pan & Deep-Zoom State ──
  const radarCanvasRef = useRef<HTMLCanvasElement>(null);
  const radarAnimRef = useRef<number | undefined>(undefined);
  const [zoomLevel, setZoomLevel] = useState<number>(1.0);
  const [panOffset, setPanOffset] = useState<{ x: number; y: number }>({
    x: 0,
    y: 0,
  });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number }>({
    x: 0,
    y: 0,
  });
  const [cursorGeo, setCursorGeo] = useState<{
    lat: number;
    lon: number;
    depth: number;
    range: number;
  }>({
    lat: DEFAULT_CENTER[1],
    lon: DEFAULT_CENTER[0],
    depth: 34.8,
    range: 0,
  });

  // ── Initialize Mapbox when in mapbox mode ──
  useEffect(() => {
    if (viewMode !== "mapbox" || !hasToken) return;
    if (!mapContainerRef.current || mapRef.current) return;

    mapboxgl.accessToken = MAPBOX_TOKEN;

    const map = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: "mapbox://styles/mapbox/light-v11",
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
      pitch: 45,
      bearing: -17.6,
      antialias: true,
    });

    map.addControl(new mapboxgl.NavigationControl(), "top-right");
    map.addControl(
      new mapboxgl.ScaleControl({ maxWidth: 200, unit: "metric" }),
      "bottom-right"
    );

    map.on("load", () => {
      setMapReady(true);
      // The container is laid out inside a flex split-screen panel whose
      // width isn't final at the instant Mapbox measures it (toggling the
      // sonar/map split, collapsing the detail sidebar, or a plain window
      // resize all change it afterwards) — without an explicit resize the
      // canvas keeps its stale size and the view looks zoomed/misaligned.
      map.resize();
    });
    map.on("zoom", () => setMapboxZoom(map.getZoom()));

    mapRef.current = map;

    // Keep the canvas in sync with its container's actual size.
    const resizeObserver = new ResizeObserver(() => map.resize());
    resizeObserver.observe(mapContainerRef.current);

    return () => {
      resizeObserver.disconnect();
      map.remove();
      mapRef.current = null;
    };
  }, [viewMode, hasToken]);

  // ── Render Mapbox markers ──
  const renderMapboxMarkers = useCallback(() => {
    if (!mapRef.current || !mapReady || !geojson || viewMode !== "mapbox") return;

    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    const map = mapRef.current;

    for (const feature of geojson.features) {
      const props = feature.properties;
      const [lon, lat] = feature.geometry.coordinates;

      const el = document.createElement("div");
      el.className = "tactical-marker";
      el.style.cssText = `
        width: ${props.marker_size || 16}px;
        height: ${props.marker_size || 16}px;
        border-radius: 50%;
        background: ${props.marker_color};
        border: 2px solid rgba(255,255,255,0.8);
        cursor: pointer;
        position: relative;
        box-shadow: 0 0 12px ${props.marker_color}aa, 0 0 24px ${props.marker_color}55;
      `;

      el.addEventListener("click", () => {
        if (onDetectionSelect) onDetectionSelect(feature);
      });

      const marker = new mapboxgl.Marker({ element: el })
        .setLngLat([lon, lat])
        .addTo(map);

      markersRef.current.push(marker);
    }
  }, [geojson, mapReady, viewMode, onDetectionSelect]);

  useEffect(() => {
    renderMapboxMarkers();
  }, [renderMapboxMarkers]);

  // ── Fly to selected detection ──
  useEffect(() => {
    if (viewMode === "mapbox" && mapRef.current && selectedDetection) {
      const [lon, lat] = selectedDetection.geometry.coordinates;
      mapRef.current.flyTo({
        center: [lon, lat],
        zoom: 15,
        duration: 1500,
        essential: true,
      });
    } else if (viewMode === "radar" && selectedDetection) {
      // Auto-pan and zoom into the newly selected target on the radar
      // canvas — a direct response to the selection prop changing, not
      // a self-triggered render loop.
      const [lon, lat] = selectedDetection.geometry.coordinates;
      const targetDx = (lon - DEFAULT_CENTER[0]) * 35000;
      const targetDy = -(lat - DEFAULT_CENTER[1]) * 35000;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPanOffset({ x: -targetDx, y: -targetDy });
      setZoomLevel((z) => Math.max(1.6, z));
    }
  }, [selectedDetection, viewMode]);

  // ── Subsea Bathymetric Radar Canvas Rendering Loop with Zoom & Pan ──
  useEffect(() => {
    if (viewMode !== "radar") return;

    const canvas = radarCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const renderRadar = () => {
      const w = (canvas.width = canvas.parentElement?.clientWidth || 600);
      const h = (canvas.height = canvas.parentElement?.clientHeight || 500);
      const cx = w / 2 + panOffset.x * zoomLevel;
      const cy = h / 2 + panOffset.y * zoomLevel;
      const maxRadius = Math.min(w, h) * 0.48 * zoomLevel;

      // Dark subsea oceanic abyss background
      ctx.fillStyle = VIZ.surfaceAlt;
      ctx.fillRect(0, 0, w, h);

      // ── Bathymetric Depth Contours ──
      const depths = [
        { r: maxRadius * 0.2, label: "−10m Coastal Shelf" },
        { r: maxRadius * 0.4, label: "−20m Subsea Slope" },
        { r: maxRadius * 0.65, label: "−35m Debris Channel" },
        { r: maxRadius * 0.9, label: "−50m Trench Basin" },
        { r: maxRadius * 1.25, label: "−75m Outer Trench" },
      ];

      depths.forEach((depth) => {
        ctx.beginPath();
        ctx.arc(cx, cy, depth.r, 0, Math.PI * 2);
        ctx.strokeStyle = VIZ.gridLine;
        ctx.lineWidth = 1.2;
        ctx.setLineDash([4, 4]);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.font = "9px 'JetBrains Mono', monospace";
        ctx.fillStyle = VIZ.textMuted;
        ctx.fillText(depth.label, cx + 8, cy - depth.r + 12);
      });

      // ── Polar Grid Lines & Range Rings ──
      ctx.strokeStyle = VIZ.gridLine;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cx, cy - maxRadius * 1.5);
      ctx.lineTo(cx, cy + maxRadius * 1.5);
      ctx.moveTo(cx - maxRadius * 1.5, cy);
      ctx.lineTo(cx + maxRadius * 1.5, cy);
      ctx.stroke();

      // ── Draw GeoJSON Debris Detections ──
      if (geojson && geojson.features) {
        geojson.features.forEach((feat) => {
          const coords = feat.geometry.coordinates;
          const dx = (coords[0] - DEFAULT_CENTER[0]) * 35000;
          const dy = -(coords[1] - DEFAULT_CENTER[1]) * 35000;
          const px = cx + dx * zoomLevel;
          const py = cy + dy * zoomLevel;

          const isSelected = selectedDetection?.id === feat.id;
          const color = feat.properties.marker_color || VIZ.cyan;

          // Simple Flat Dot Marker
          ctx.save();
          ctx.beginPath();
          const dotRadius = isSelected ? 6 : 4;
          ctx.arc(px, py, dotRadius, 0, Math.PI * 2);
          ctx.fillStyle = color;
          ctx.fill();
          if (isSelected) {
            ctx.lineWidth = 2;
            ctx.strokeStyle = VIZ.text;
            ctx.stroke();
          }
          ctx.restore();

          // Clean Minimal Target Badge
          ctx.save();
          ctx.font = "11px sans-serif";
          const label = `${feat.properties.class_label.replace(/_/g, " ").replace(/^\w/, c => c.toUpperCase())} · ${(feat.properties.confidence * 100).toFixed(0)}%`;
          const metrics = ctx.measureText(label);
          ctx.fillStyle = "rgba(11, 18, 32, 0.9)";
          ctx.fillRect(px + 10, py - 14, metrics.width + 8, 16);
          ctx.fillStyle = VIZ.text;
          ctx.fillText(label, px + 14, py - 2);
          ctx.restore();
        });
      }

      radarAnimRef.current = requestAnimationFrame(renderRadar);
    };

    renderRadar();

    return () => {
      if (radarAnimRef.current) cancelAnimationFrame(radarAnimRef.current);
    };
  }, [geojson, selectedDetection, zoomLevel, panOffset, viewMode]);

  // ── Mouse Wheel Zoom (Deep Zooming) ──
  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const zoomFactor = e.deltaY < 0 ? 1.15 : 0.87;
    setZoomLevel((prev) => Math.min(8.0, Math.max(0.4, prev * zoomFactor)));
  };

  // ── Mouse Drag-to-Pan ──
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    setIsDragging(true);
    setDragStart({ x: e.clientX - panOffset.x, y: e.clientY - panOffset.y });
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = radarCanvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    // Calculate simulated geographic coordinates & depth under cursor
    const cx = canvas.width / 2 + panOffset.x * zoomLevel;
    const cy = canvas.height / 2 + panOffset.y * zoomLevel;
    const relX = (mouseX - cx) / (35000 * zoomLevel);
    const relY = -(mouseY - cy) / (35000 * zoomLevel);

    const curLon = DEFAULT_CENTER[0] + relX;
    const curLat = DEFAULT_CENTER[1] + relY;
    const distM = Math.hypot(mouseX - cx, mouseY - cy) / (zoomLevel * 3.5);
    const calcDepth = 34.8 + distM * 0.12;

    setCursorGeo({
      lat: curLat,
      lon: curLon,
      depth: calcDepth,
      range: distM,
    });

    if (isDragging) {
      setPanOffset({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y,
      });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // ── Click on Detection ──
  const handleRadarClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!radarCanvasRef.current || !geojson || !onDetectionSelect) return;
    const canvas = radarCanvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;
    const cx = canvas.width / 2 + panOffset.x * zoomLevel;
    const cy = canvas.height / 2 + panOffset.y * zoomLevel;

    for (const feat of geojson.features) {
      const coords = feat.geometry.coordinates;
      const dx = (coords[0] - DEFAULT_CENTER[0]) * 35000;
      const dy = -(coords[1] - DEFAULT_CENTER[1]) * 35000;
      const px = cx + dx * zoomLevel;
      const py = cy + dy * zoomLevel;

      const dist = Math.hypot(clickX - px, clickY - py);
      if (dist < 22) {
        onDetectionSelect(feat);
        return;
      }
    }
  };

  const resetView = () => {
    setZoomLevel(1.0);
    setPanOffset({ x: 0, y: 0 });
  };

  return (
    <div className="h-full flex flex-col relative overflow-hidden bg-[var(--bg-primary)]">
      {/* Panel Header */}
      <div className="flex items-center justify-between px-3.5 py-2 bg-[var(--bg-secondary)] border-b border-[var(--border-subtle)] z-10 flex-wrap gap-2 shadow-sm">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-[var(--threat-low)]" />
          <span className="text-xs font-bold uppercase tracking-wider text-[var(--text-primary)] font-mono">
            {viewMode === "radar"
              ? "Deep-Zoom Subsea Bathymetric GIS"
              : "3D Globe Tactical View (WGS84)"}
          </span>
          <span className="text-[10px] px-2 py-0.5 rounded bg-[var(--bg-tertiary)] border-[var(--border-subtle)] text-[var(--text-secondary)] border border-[var(--border-subtle)] font-mono font-bold">
            Zoom: {(viewMode === "mapbox" ? mapboxZoom : zoomLevel).toFixed(1)}x
          </span>
        </div>

        {/* View Switcher Controls */}
        <div className="flex items-center gap-2">
          {hasToken && (
            <div role="group" aria-label="Map view" className="flex p-0.5 rounded-lg bg-[var(--bg-tertiary)] border-[var(--border-subtle)] border text-[11px] font-mono">
              <button
                onClick={() => setViewMode("radar")}
                aria-pressed={viewMode === "radar"}
                className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                  viewMode === "radar"
                    ? "bg-[var(--accent-primary)] text-white font-medium border border-[var(--accent-primary)] shadow-sm"
                    : "text-[var(--text-secondary)] hover:text-white"
                }`}
              >
                📡 Radar GIS
              </button>
              <button
                onClick={() => setViewMode("mapbox")}
                aria-pressed={viewMode === "mapbox"}
                className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                  viewMode === "mapbox"
                    ? "bg-[var(--accent-primary)] text-white font-medium border border-[var(--accent-primary)] shadow-sm"
                    : "text-[var(--text-secondary)] hover:text-white"
                }`}
              >
                🛰️ 3D Globe
              </button>
            </div>
          )}

          {geojson && (
            <span className="text-[11px] px-2.5 py-0.5 rounded-lg bg-[var(--bg-tertiary)] text-[var(--text-primary)] border border-[var(--border-subtle)] font-mono font-bold">
              {geojson.features.length} Targets
            </span>
          )}
        </div>
      </div>

      {/* Main Map / Radar Display */}
      <div className="flex-1 relative overflow-hidden min-h-0 bg-[var(--surface-viewport)]">
        {viewMode === "radar" ? (
          <div className="w-full h-full relative cursor-grab active:cursor-grabbing">
            <canvas
              ref={radarCanvasRef}
              role="img"
              aria-label={`Bathymetric radar view, zoom ${zoomLevel.toFixed(1)}x, ${geojson?.features.length ?? 0} detections plotted`}
              onWheel={handleWheel}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onClick={handleRadarClick}
              className="w-full h-full block"
            />

            {/* Radar Real-time Coordinate & Bathymetry HUD (Light Theme Card) */}
            <div className="absolute top-3 left-3 p-3 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-subtle)] text-[11px] font-mono text-[var(--text-primary)] space-y-1 pointer-events-none shadow-sm">
              <div className="text-[var(--text-primary)] font-medium flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-lg hidden" />
                BATHYMETRY HUD: VIZAG SURVEY
              </div>
              <div className="text-[var(--text-secondary)]">LAT: {cursorGeo.lat.toFixed(5)}° N</div>
              <div className="text-[var(--text-secondary)]">LON: {cursorGeo.lon.toFixed(5)}° E</div>
              <div className="text-[var(--text-secondary)]">DEPTH: −{cursorGeo.depth.toFixed(1)}m | RANGE: {cursorGeo.range.toFixed(1)}m</div>
              <div className="text-[10px] text-[var(--text-muted)] pt-1 border-t border-[var(--border-subtle)]">
                💡 Scroll wheel to zoom in/out • Click &amp; drag to pan
              </div>
            </div>

            {/* Zoom Controls & View Reset */}
            <div className="absolute bottom-4 right-4 flex flex-col gap-1.5 z-20 font-mono">
              <button
                onClick={() => setZoomLevel((z) => Math.min(8.0, z * 1.3))}
                className="w-8 h-8 rounded-lg bg-[var(--bg-secondary)] text-[var(--text-primary)] border border-[var(--border-subtle)] flex items-center justify-center font-bold hover:bg-[var(--bg-tertiary)] cursor-pointer shadow-sm text-sm"
                title="Zoom in"
                aria-label="Zoom in"
              >
                +
              </button>
              <button
                onClick={() => setZoomLevel((z) => Math.max(0.4, z / 1.3))}
                className="w-8 h-8 rounded-lg bg-[var(--bg-secondary)] text-[var(--text-primary)] border border-[var(--border-subtle)] flex items-center justify-center font-bold hover:bg-[var(--bg-tertiary)] cursor-pointer shadow-sm text-sm"
                title="Zoom out"
                aria-label="Zoom out"
              >
                −
              </button>
              <button
                onClick={resetView}
                className="px-2 h-8 rounded-lg bg-[var(--bg-secondary)] text-[var(--text-primary)] border border-[var(--border-subtle)] text-[10px] flex items-center justify-center font-semibold hover:bg-[var(--bg-tertiary)] cursor-pointer shadow-sm"
                title="Reset view to origin"
                aria-label="Reset view to origin"
              >
                ⟲ 1x
              </button>
            </div>
          </div>
        ) : (
          <div ref={mapContainerRef} className="w-full h-full relative">
            {!hasToken && (
              <div
                className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-8 text-center bg-[var(--bg-tertiary)]"
              >
                <div className="p-5 rounded-2xl bg-white border border-[var(--border-subtle)] max-w-sm shadow-sm">
                  <div className="text-sky-700 font-mono text-sm font-bold mb-1">
                    Mapbox Satellite Token
                  </div>
                  <p className="text-xs text-[var(--text-muted)] mb-3">
                    Mapbox 3D Globe requires an API key in <code>.env.local</code>.
                    Switch to <strong>📡 Deep-Zoom Radar GIS</strong> for offline
                    zero-dependency acoustic bathymetry with pan &amp; zoom!
                  </p>
                  <button
                    onClick={() => setViewMode("radar")}
                    className="px-4 py-1.5 rounded-lg bg-sky-600 text-white font-bold text-xs hover:bg-sky-700 transition-colors cursor-pointer shadow-sm"
                  >
                    Switch to Deep-Zoom Radar GIS
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer bar with no text */}
      <div className="h-6 bg-[var(--bg-tertiary)] border-t border-[var(--border-subtle)]" />
    </div>
  );
}
