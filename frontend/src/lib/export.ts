/**
 * Report export helpers — JSON and CSV downloads for the anomaly report.
 * Pulled out of the dashboard page so the export format lives in one
 * place and the page component only wires up the click handlers.
 */
import type { ReportData } from "./types";

function triggerDownload(dataUri: string, filename: string) {
  const anchor = document.createElement("a");
  anchor.setAttribute("href", dataUri);
  anchor.setAttribute("download", filename);
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

export function downloadReportJSON(reportData: ReportData) {
  const dataStr =
    "data:text/json;charset=utf-8," +
    encodeURIComponent(JSON.stringify(reportData, null, 2));
  triggerDownload(dataStr, `SonarSense_Anomaly_Report_${timestamp()}.json`);
}

export function downloadReportCSV(reportData: ReportData): boolean {
  if (!reportData.detections || reportData.detections.length === 0) return false;

  const headers = [
    "id", "class", "threat", "confidence",
    "latitude", "longitude",
    "length_m", "width_m", "height_m", "volume_m3", "slant_range_m",
  ];

  const csvRows = [headers.join(",")];

  for (const det of reportData.detections) {
    const row = [
      det.id,
      det.class,
      det.threat,
      det.confidence,
      det.coordinates[1], // lat
      det.coordinates[0], // lon
      det.dimensions.length_m,
      det.dimensions.width_m,
      det.dimensions.height_m,
      det.mvb?.volume_m3 ?? "",
      det.slant_range_m,
    ];
    csvRows.push(row.join(","));
  }

  const dataStr = "data:text/csv;charset=utf-8," + encodeURIComponent(csvRows.join("\n"));
  triggerDownload(dataStr, `SonarSense_Anomaly_Report_${timestamp()}.csv`);
  return true;
}
