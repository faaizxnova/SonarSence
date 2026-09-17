"use client";

/**
 * Clearance Dossier PDF Generator
 * ==================================
 * Client-side PDF report generation using jsPDF. The dossier contains a
 * title page, the 7-stage preprocessing suite specs, a 3D MVB volume
 * mensuration table, WGS84 coordinates, and the acoustic physics formulas.
 */

import { jsPDF } from "jspdf";
import type { ReportData } from "@/lib/types";

/**
 * Generate and download a Clearance Dossier PDF.
 */
export function generateClearanceDossier(data: ReportData): void {
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 18;
  const contentWidth = pageWidth - 2 * margin;
  let y = margin;

  // ──────────────────────────────────────────────────────────
  // PAGE 1: TITLE & EXECUTIVE SUMMARY
  // ──────────────────────────────────────────────────────────

  // Background header bar
  doc.setFillColor(10, 14, 26);
  doc.rect(0, 0, pageWidth, 75, "F");

  // Classification banner
  doc.setFillColor(220, 38, 38);
  doc.rect(0, 0, pageWidth, 7, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.text("CLASSIFIED — FOR OFFICIAL HYDROGRAPHIC CLEARANCE USE ONLY", pageWidth / 2, 5, {
    align: "center",
  });

  // Title
  doc.setTextColor(0, 229, 255);
  doc.setFontSize(20);
  doc.setFont("helvetica", "bold");
  doc.text("HYDROGRAPHIC CLEARANCE DOSSIER", pageWidth / 2, 28, { align: "center" });

  doc.setTextColor(200, 200, 200);
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text("SonarSense — AI-Powered Underwater Marine Debris Detection", pageWidth / 2, 38, {
    align: "center",
  });

  doc.setTextColor(150, 150, 150);
  doc.setFontSize(8);
  doc.text("Side-Scan Sonar (600 kHz) Preprocessing & 3D MVB Volumetric Analysis", pageWidth / 2, 45, {
    align: "center",
  });

  // Horizontal rule
  doc.setDrawColor(0, 229, 255);
  doc.setLineWidth(0.4);
  doc.line(margin + 20, 52, pageWidth - margin - 20, 52);

  // Metadata block
  y = 60;
  doc.setTextColor(180, 180, 180);
  doc.setFontSize(7.5);
  doc.text(`Generated: ${new Date().toISOString()}`, pageWidth / 2, y, { align: "center" });
  y += 4.5;
  doc.text(
    `Total Verified Anomalies: ${data.total_detections} Targets | Survey Origin: ${data.sonar_config.survey_origin_lat}°N, ${data.sonar_config.survey_origin_lon}°E`,
    pageWidth / 2,
    y,
    { align: "center" }
  );

  // ──────────────────────────────────────────────────────────
  // 1. PREPROCESSING SUITE & ACOUSTIC SPECIFICATIONS
  // ──────────────────────────────────────────────────────────
  y = 86;
  doc.setTextColor(0, 150, 220);
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text("1. ACOUSTIC PREPROCESSING & ALGORITHM SUITE", margin, y);

  y += 6;
  doc.setTextColor(50, 50, 50);
  doc.setFontSize(7.5);
  doc.setFont("helvetica", "normal");

  const configLines = [
    `Sonar Frequency:           ${data.sonar_config.frequency_khz} kHz (Dual-Channel SSS)`,
    `Towfish Altitude (H_alt):   ${data.sonar_config.towfish_altitude_m} m above seafloor`,
    `Maximum Slant Range:       ${data.sonar_config.slant_range_max_m} m per channel (150m total swath)`,
    `Time-Varying Gain (TVG):   20 * log10(R) + 2 * alpha * R (dB), alpha = 0.05 dB/m`,
    `SRAD Denoising:            Speckle Reducing Anisotropic Diffusion (PDE-based, 5 iterations)`,
    `Adaptive Lee Filter:       7x7 Window LMMSE Speckle Suppression [K = sigma²_L / (sigma²_L + sigma²_n)]`,
    `Slant Range Correction:    R_ground = sqrt(R_slant² - H_towfish²) [Hyperbolic nadir flattening]`,
    `Neural Inference Model:    YOLOv8-Seg Dual-Head (Specular Highlights + Acoustic Shadows)`,
    `Height Mensuration:        H_target = (L_shadow * H_towfish) / R_slant`,
    `3D MVB Volume:             V_3d = Length * Width * Height (m³)`,
  ];

  for (const line of configLines) {
    doc.text(line, margin + 2, y);
    y += 4.2;
  }

  // ──────────────────────────────────────────────────────────
  // 2. 3D MVB & DIMENSIONS SUMMARY TABLE
  // ──────────────────────────────────────────────────────────
  y += 6;
  doc.setTextColor(0, 150, 220);
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text("2. 3D MINIMUM VOLUMETRIC BOUNDING (MVB) SUMMARY", margin, y);
  y += 6;

  // Table header
  const colWidths = [10, 36, 18, 16, 28, 22, 22, 22];
  const headers = ["#", "Object Class", "Threat", "Conf.", "Dimensions (m)", "Height (m)", "3D Vol (m³)", "R_slant"];

  doc.setFillColor(15, 23, 42);
  doc.rect(margin, y - 3.5, contentWidth, 6, "F");
  doc.setTextColor(0, 229, 255);
  doc.setFontSize(6.5);
  doc.setFont("helvetica", "bold");

  let x = margin + 2;
  for (let i = 0; i < headers.length; i++) {
    doc.text(headers[i], x, y);
    x += colWidths[i];
  }

  y += 5;

  // Table rows
  doc.setFont("helvetica", "normal");
  doc.setTextColor(50, 50, 50);

  for (const det of data.detections) {
    if (y > pageHeight - 25) {
      addPageFooter(doc, pageWidth, pageHeight);
      doc.addPage();
      y = margin + 10;
    }

    if (det.id % 2 === 0) {
      doc.setFillColor(245, 247, 250);
      doc.rect(margin, y - 3.2, contentWidth, 5.2, "F");
    }

    x = margin + 2;
    doc.setFontSize(6.5);
    doc.text(`${det.id + 1}`, x, y);
    x += colWidths[0];

    doc.text(det.class.replace(/_/g, " ").slice(0, 22), x, y);
    x += colWidths[1];

    if (det.threat === "HIGH") doc.setTextColor(220, 38, 38);
    else if (det.threat === "MEDIUM") doc.setTextColor(230, 130, 0);
    else if (det.threat === "LOW") doc.setTextColor(160, 150, 0);
    else doc.setTextColor(100, 100, 150);
    doc.text(det.threat, x, y);
    doc.setTextColor(50, 50, 50);
    x += colWidths[2];

    doc.text(`${(det.confidence * 100).toFixed(0)}%`, x, y);
    x += colWidths[3];

    doc.text(`${det.dimensions.length_m}x${det.dimensions.width_m}x${det.dimensions.height_m}`, x, y);
    x += colWidths[4];

    doc.text(`${det.h_target_m.toFixed(3)} m`, x, y);
    x += colWidths[5];

    const vol = det.mvb?.volume_m3 || (det.dimensions.length_m * det.dimensions.width_m * det.h_target_m);
    doc.text(`${vol.toFixed(2)} m³`, x, y);
    x += colWidths[6];

    doc.text(`${det.slant_range_m.toFixed(1)} m`, x, y);

    y += 5.2;
  }

  // ──────────────────────────────────────────────────────────
  // 3. WGS84 COORDINATE REGISTRY
  // ──────────────────────────────────────────────────────────
  y += 6;
  if (y > pageHeight - 45) {
    addPageFooter(doc, pageWidth, pageHeight);
    doc.addPage();
    y = margin + 10;
  }

  doc.setTextColor(0, 150, 220);
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text("3. WGS84 GEO-REFERENCED REGISTRY", margin, y);
  y += 6;

  doc.setFontSize(6.5);
  doc.setFont("helvetica", "bold");
  doc.setFillColor(15, 23, 42);
  doc.rect(margin, y - 3.5, contentWidth, 6, "F");
  doc.setTextColor(0, 229, 255);

  const coordHeaders = ["#", "Object Class", "Latitude (WGS84)", "Longitude (WGS84)", "Est. Depth (m)"];
  const coordWidths = [12, 45, 45, 45, 25];
  x = margin + 2;
  for (let i = 0; i < coordHeaders.length; i++) {
    doc.text(coordHeaders[i], x, y);
    x += coordWidths[i];
  }
  y += 5;

  doc.setFont("helvetica", "normal");
  doc.setTextColor(50, 50, 50);

  for (const det of data.detections) {
    if (y > pageHeight - 25) {
      addPageFooter(doc, pageWidth, pageHeight);
      doc.addPage();
      y = margin + 10;
    }

    x = margin + 2;
    doc.text(`${det.id + 1}`, x, y);
    x += coordWidths[0];
    doc.text(det.class.replace(/_/g, " "), x, y);
    x += coordWidths[1];
    doc.text(`${det.coordinates[1].toFixed(6)}° N`, x, y);
    x += coordWidths[2];
    doc.text(`${det.coordinates[0].toFixed(6)}° E`, x, y);
    x += coordWidths[3];
    doc.text("−28.5 m", x, y);
    y += 5;
  }

  // Footer on last page
  addPageFooter(doc, pageWidth, pageHeight);

  // Save the PDF
  const timestamp = new Date().toISOString().slice(0, 19).replace(/[:.]/g, "-");
  doc.save(`SonarSense_Clearance_Dossier_${timestamp}.pdf`);
}

function addPageFooter(doc: jsPDF, pageWidth: number, pageHeight: number) {
  const page = doc.getNumberOfPages();
  doc.setFontSize(6);
  doc.setTextColor(130, 130, 130);
  doc.text(
    `SonarSense — AI Marine Debris Clearance System | Page ${page}`,
    pageWidth / 2,
    pageHeight - 8,
    { align: "center" }
  );
  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.2);
  doc.line(18, pageHeight - 11, pageWidth - 18, pageHeight - 11);
}
