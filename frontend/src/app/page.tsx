"use client";

/**
 * Main Dashboard Page
 * =====================
 * Clean, high-contrast oceanographic research portal:
 *   LEFT:  600 kHz side-scan sonar waterfall feed with 7 preprocessing stages
 *   RIGHT: subsea deep-zoom bathymetric radar GIS & 3D globe tactical view
 *
 * Also includes: 12 sample debris datasets, YOLOv8 detection overlays,
 * a 3D MVB volumetric inspector, an acoustic physics/mensuration modal,
 * live AUV scan simulation, and clearance dossier PDF export.
 *
 * Layout: side-by-side above the `md` breakpoint, stacked (waterfall
 * then map then detail) below it so the console stays usable on a
 * laptop or a narrow projector output.
 */

import React, { useState, useCallback, useEffect } from "react";

import ControlPanel from "@/components/ControlPanel";
import SonarWaterfall from "@/components/SonarWaterfall";
import TacticalMap from "@/components/TacticalMap";
import DetectionCard from "@/components/DetectionCard";
import PhysicsModal from "@/components/PhysicsModal";
import MVBModal from "@/components/MVBModal";
import ErrorBoundary from "@/components/ErrorBoundary";
import { generateClearanceDossier } from "@/components/DossierGenerator";
import { downloadReportJSON, downloadReportCSV } from "@/lib/export";

import { uploadSonarData, generateReport, getDetections, createMockScenario } from "@/lib/api";
import type {
  DetectionCollection,
  DetectionFeature,
  PipelineStage,
  PipelineStatus,
} from "@/lib/types";

export default function DashboardPage() {
  // ── State ──
  const [status, setStatus] = useState<PipelineStatus>("idle");
  const [geojson, setGeojson] = useState<DetectionCollection | null>(null);
  const [selectedDetection, setSelectedDetection] =
    useState<DetectionFeature | null>(null);
  const [pipelineStage, setPipelineStage] = useState<PipelineStage>("annotated");
  const [selectedScenario, setSelectedScenario] = useState("gost_net1");
  const [customImageSrc, setCustomImageSrc] = useState<string | null>(null);
  const [isPhysicsModalOpen, setIsPhysicsModalOpen] = useState(false);
  const [isMVBModalOpen, setIsMVBModalOpen] = useState(false);
  const [isLiveScanning, setIsLiveScanning] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isMapVisible, setIsMapVisible] = useState(false);

  const isSimulated = geojson?.metadata.data_source === "simulated";

  // ── Load a scenario, shared by init/scenario-change/analyze/retry ──
  const loadScenario = useCallback(async (scenarioId: string) => {
    setStatus("processing");
    setErrorMessage(null);
    try {
      const data = await uploadSonarData(null, scenarioId);
      setGeojson(data);
      setStatus("complete");
    } catch (err) {
      console.error("Scenario load failed:", err);
      setStatus("error");
      setErrorMessage("Could not load this dataset. Check your connection and retry.");
    }
  }, []);

  // ── Initialize on Mount ──
  useEffect(() => {
    let cancelled = false;
    async function init() {
      setStatus("processing");
      try {
        const initialData = await getDetections(selectedScenario);
        if (cancelled) return;
        setGeojson(initialData);
        setStatus("complete");
      } catch (err) {
        if (cancelled) return;
        console.error("Init failed:", err);
        setStatus("error");
        setErrorMessage("Could not reach the detection service. Retry to use offline simulation.");
      }
    }
    init();
    return () => {
      cancelled = true;
    };
    // Only re-run for the initial mount's scenario; later changes go through handleScenarioChange.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Scenario Change Handler ──
  const handleScenarioChange = useCallback(
    async (scenarioId: string) => {
      setCustomImageSrc(null);
      setSelectedScenario(scenarioId);
      setSelectedDetection(null);
      await loadScenario(scenarioId);
    },
    [loadScenario]
  );

  // ── Upload Handler ──
  const handleUpload = useCallback(
    async (file?: File | null) => {
      setErrorMessage(null);
      try {
        setStatus("uploading");
        setSelectedDetection(null);
        if (file) {
          const localUrl = URL.createObjectURL(file);
          setCustomImageSrc(localUrl);
          setSelectedScenario("custom_upload");
          const result = await uploadSonarData(file, "custom_upload");
          setGeojson(result);
        } else {
          const result = await uploadSonarData(null, selectedScenario);
          setGeojson(result);
        }
        setStatus("complete");
      } catch (error) {
        console.error("Upload failed:", error);
        setStatus("error");
        setErrorMessage("Upload failed. Check the file and retry.");
      }
    },
    [selectedScenario]
  );

  // ── Analyze Handler ──
  const handleAnalyze = useCallback(async () => {
    await loadScenario(selectedScenario);
  }, [loadScenario, selectedScenario]);

  // ── Retry Handler (re-runs whatever the current scenario is) ──
  const handleRetry = useCallback(() => {
    loadScenario(selectedScenario);
  }, [loadScenario, selectedScenario]);

  // ── Dossier PDF Generation ──
  const handleGenerateDossier = useCallback(async () => {
    try {
      const reportData = await generateReport(geojson);
      generateClearanceDossier(reportData);
    } catch (error) {
      console.error("Dossier generation failed:", error);
      setErrorMessage("Could not generate the PDF dossier. Please retry.");
    }
  }, [geojson]);

  // ── JSON Report Generation ──
  const handleDownloadJSON = useCallback(async () => {
    try {
      const reportData = await generateReport(geojson);
      downloadReportJSON(reportData);
    } catch (error) {
      console.error("JSON export failed:", error);
      setErrorMessage("Could not export the JSON report. Please retry.");
    }
  }, [geojson]);

  // ── CSV Report Generation ──
  const handleDownloadCSV = useCallback(async () => {
    try {
      const reportData = await generateReport(geojson);
      const ok = downloadReportCSV(reportData);
      if (!ok) setErrorMessage("No detections to export yet.");
    } catch (error) {
      console.error("CSV export failed:", error);
      setErrorMessage("Could not export the CSV report. Please retry.");
    }
  }, [geojson]);

  // ── Detection Selection Handler ──
  const handleDetectionSelect = useCallback(
    (detection: DetectionFeature) => {
      setSelectedDetection((prev) =>
        prev?.id === detection.id ? null : detection
      );
    },
    []
  );

  // ── Live AUV Scanning Simulation Loop ──
  useEffect(() => {
    if (!isLiveScanning || !geojson || geojson.features.length === 0) return;

    let currentIndex = 0;
    const interval = setInterval(() => {
      currentIndex = (currentIndex + 1) % geojson.features.length;
      setSelectedDetection(geojson.features[currentIndex]);
    }, 4000);

    return () => clearInterval(interval);
  }, [isLiveScanning, geojson]);

  const detections = geojson?.features || [];

  return (
    <div className="h-dvh w-full flex flex-col bg-[var(--bg-primary)] text-[var(--text-primary)]">
      {/* ── Top: Command & Control Panel ── */}
      <ControlPanel
        status={status}
        detectionCount={detections.length}
        selectedScenario={selectedScenario}
        onScenarioChange={handleScenarioChange}
        onUpload={handleUpload}
        onAnalyze={handleAnalyze}
        onGenerateDossier={handleGenerateDossier}
        onDownloadJSON={handleDownloadJSON}
        onDownloadCSV={handleDownloadCSV}
        onOpenPhysicsModal={() => setIsPhysicsModalOpen(true)}
        onOpenMVBModal={() => setIsMVBModalOpen(true)}
        isLiveScanning={isLiveScanning}
        onToggleLiveScan={() => setIsLiveScanning(!isLiveScanning)}
      />

      {/* ── Status strip: simulated-data notice + error/retry ── */}
      {(isSimulated || errorMessage) && (
        <div className="flex flex-wrap items-center gap-2 px-4 py-1.5 border-b border-[var(--border-subtle)] bg-[var(--bg-secondary)] text-[11px] font-mono font-semibold">
          {errorMessage && (
            <div role="alert" className="flex items-center gap-2 text-[var(--threat-high)]">
              <span>{errorMessage}</span>
              <button onClick={handleRetry} className="btn-secondary !py-0.5 !px-2 !text-[10px]">
                Retry
              </button>
            </div>
          )}
          {isSimulated && (
            <span className="ml-auto flex items-center gap-1.5 text-[var(--text-muted)]">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent-live)]" />
              Simulated data — backend unreachable, showing offline demo dataset
            </span>
          )}
        </div>
      )}

      {/* ── Main: Split-Screen Layout (stacks below md) ── */}
      <div className="flex-1 flex flex-col md:flex-row overflow-y-auto md:overflow-hidden min-h-0 relative">
        {/* ── Toggle: Sonar Full-Screen ⇄ Split with Tactical Map ── */}
        <button
          onClick={() => setIsMapVisible((v) => !v)}
          aria-pressed={isMapVisible}
          className="absolute top-3 right-3 z-30 btn-secondary !text-xs shadow-md"
          title={isMapVisible ? "Return to full-screen sonar feed" : "Split screen to show the tactical map"}
        >
          {isMapVisible ? (
            <>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <path d="M9 3v18" />
              </svg>
              Full-Screen Sonar
            </>
          ) : (
            <>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="7" height="18" rx="1" />
                <rect x="14" y="3" width="7" height="18" rx="1" />
              </svg>
              Show Tactical Map
            </>
          )}
        </button>

        {/* ── Sonar Acoustic Waterfall Feed ── */}
        <div
          className={`flex flex-col min-h-[420px] md:min-h-0 border-b md:border-b-0 border-[var(--border-subtle)] ${
            isMapVisible ? "w-full md:w-1/2 md:border-r" : "w-full"
          }`}
        >
          <ErrorBoundary label="Sonar waterfall">
            <SonarWaterfall
              detections={detections}
              pipelineStage={pipelineStage}
              scenarioId={selectedScenario}
              customImageSrc={customImageSrc}
              onStageChange={setPipelineStage}
              onDetectionClick={handleDetectionSelect}
              isProcessing={
                status === "processing" ||
                status === "uploading" ||
                isLiveScanning
              }
            />
          </ErrorBoundary>
        </div>

        {/* ── Subsea Tactical GIS Map + Detail Sidebar ── */}
        {isMapVisible && (
        <div className="flex flex-col md:flex-row w-full md:w-1/2 min-h-[420px] md:min-h-0">
          {/* Map / Radar GIS */}
          <div
            className="flex-1 flex flex-col min-h-[360px] md:min-h-0 border-b md:border-b-0"
            style={{
              borderRightWidth: selectedDetection && isSidebarOpen ? 1 : 0,
              borderColor: "var(--border-subtle)",
            }}
          >
            <ErrorBoundary label="Tactical map">
              <TacticalMap
                geojson={geojson}
                selectedDetection={selectedDetection}
                onDetectionSelect={handleDetectionSelect}
              />
            </ErrorBoundary>
          </div>

          {/* Detection Detail Sidebar */}
          {selectedDetection && (
            <div
              className={`overflow-y-auto bg-[var(--bg-secondary)] border-l border-[var(--border-subtle)] w-full md:w-[320px] shrink-0 ${isSidebarOpen ? "" : "md:hidden"}`}
            >
              <div className="p-3.5">
                <div className="flex items-center justify-between mb-2 md:hidden">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                    Target Detail
                  </span>
                  <button
                    onClick={() => setIsSidebarOpen(false)}
                    aria-label="Collapse target detail panel"
                    className="text-xs text-[var(--text-muted)]"
                  >
                    Hide
                  </button>
                </div>
                <DetectionCard
                  detection={selectedDetection}
                  onClose={() => setSelectedDetection(null)}
                  onOpenMVB={() => setIsMVBModalOpen(true)}
                />

                {/* Target Registry List */}
                <div className="mt-4">
                  <span className="text-[11px] font-bold uppercase tracking-wider block mb-2 font-mono text-[var(--text-muted)]">
                    Target Registry ({detections.length})
                  </span>
                  <ul className="space-y-1.5 list-none m-0 p-0">
                    {detections.map((det) => {
                      const isSelected = selectedDetection?.id === det.id;
                      return (
                        <li key={det.id}>
                          <button
                            onClick={() => handleDetectionSelect(det)}
                            aria-current={isSelected}
                            className={`w-full text-left p-2.5 rounded-lg transition-all duration-150 cursor-pointer border ${
                              isSelected
                                ? "bg-[var(--bg-tertiary)] border-[var(--accent-primary)]"
                                : "bg-transparent hover:bg-[var(--bg-tertiary)] border-[var(--border-subtle)]"
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <div
                                className="w-2 h-2 rounded-full shrink-0"
                                style={{
                                  background: det.properties.marker_color,
                                  boxShadow: `0 0 4px ${det.properties.marker_color}`,
                                }}
                              />
                              <span className="text-xs font-semibold uppercase font-mono text-[var(--text-primary)]">
                                {det.properties.class_label.replace(/_/g, " ")}
                              </span>
                              <span className="text-xs ml-auto font-mono font-bold text-[var(--accent-primary)]">
                                {(det.properties.confidence * 100).toFixed(0)}%
                              </span>
                            </div>
                            <div className="text-xs mt-1 ml-4 font-mono flex items-center justify-between text-[var(--text-muted)] text-[10px]">
                              <span>
                                H={det.properties.h_target_m.toFixed(2)} m •{" "}
                                {det.properties.mvb?.volume_m3.toFixed(2)} m³
                              </span>
                              <span
                                className="px-1.5 py-0.2 rounded font-bold text-[9px]"
                                style={{
                                  background: `${det.properties.marker_color}18`,
                                  color: det.properties.marker_color,
                                  border: `1px solid ${det.properties.marker_color}33`,
                                }}
                              >
                                {det.properties.threat_level}
                              </span>
                            </div>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              </div>
            </div>
          )}
          {selectedDetection && !isSidebarOpen && (
            <button
              onClick={() => setIsSidebarOpen(true)}
              className="hidden md:flex items-center justify-center w-6 border-l border-[var(--border-subtle)] bg-[var(--bg-secondary)] text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
              aria-label="Expand target detail panel"
              title="Expand target detail panel"
            >
              ‹
            </button>
          )}
        </div>
        )}
      </div>

      {/* ── Interactive Physics & Mensuration Modal ── */}
      <PhysicsModal
        isOpen={isPhysicsModalOpen}
        onClose={() => setIsPhysicsModalOpen(false)}
      />

      {/* ── Interactive 3D MVB Modal ── */}
      <MVBModal
        isOpen={isMVBModalOpen}
        onClose={() => setIsMVBModalOpen(false)}
        detection={selectedDetection || (detections.length > 0 ? detections[0] : createMockScenario(selectedScenario).features[0])}
      />
    </div>
  );
}
