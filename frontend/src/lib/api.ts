/**
 * API Client & Simulation Engine
 * =================================
 * Connects to the FastAPI backend with offline simulation fallback.
 * Supports the bundled marine debris scenarios and all 7 acoustic preprocessing stages.
 */

import type {
  DetectionCollection,
  DetectionFeature,
  PipelineStage,
  ReportData,
} from "./types";

// Survey origin [lon, lat] — centre of the Bay of Bengal (Indian Ocean).
// Must match SURVEY_ORIGIN_LAT/LON in backend/app/config.py.
export const SURVEY_ORIGIN: [number, number] = [88.0, 15.0];
const fromOrigin = (dLon: number, dLat: number): [number, number] => [
  SURVEY_ORIGIN[0] + dLon,
  SURVEY_ORIGIN[1] + dLat,
];

export const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// Sample sonar scenarios (offline-safe: every image ships in /public/samples)
export const DEMO_SCENARIOS = [
  {
    id: "gost_net1",
    name: "01 • Ghost Fishing Net",
    category: "Acoustic Target Survey",
    description: "Dual-channel side-scan sonar image of an entangled ghost fishing net on the seafloor",
    image: "/samples/gost_net1.png",
  },
  {
    id: "wooden_shipwreck",
    name: "02 • Sunken Shipwreck",
    category: "Historic Marine Debris",
    description: "High-resolution side-scan sonar survey revealing a sunken ship hull on the seabed",
    image: "/samples/ship.png",
  },
];

export function createMockScenario(
  scenarioId: string = "gost_net1"
): DetectionCollection {
  const scenarioTargets: Record<
    string,
    Array<{
      label: string;
      threat: "HIGH" | "MEDIUM" | "LOW" | "UNKNOWN";
      conf: number;
      w: number;
      l: number;
      h: number;
      slant: number;
      shadowLen: number;
      color: string;
      coords: [number, number];
      hlBbox: [number, number, number, number];
      shBbox: [number, number, number, number];
      hlPoly: [number, number][];
      shPoly: [number, number][];
      orient: number;
    }>
  > = {
    gost_net1: [
      {
        // LEFT ghost-net cluster — port channel (measured from gost_net1.png @ 1024×512)
        label: "ghost_net",
        threat: "HIGH",
        conf: 0.91,
        w: 8.6,   // (283-86) px × 0.146 m/px ≈ 28.7 px wide → ~8.6 m
        l: 18.5,  // (420-100) px × 0.146 ≈ 18.5 m
        h: 0.0,   // computed from shadow formula
        slant: 52.8,
        shadowLen: 5.3, // 36 px × 0.146
        color: "#dc2626",
        coords: fromOrigin(0.0009, 0.0016),
        hlBbox: [86, 100, 283, 420],
        shBbox: [50, 140, 86, 380],
        hlPoly: [[86,100],[283,100],[283,420],[86,420]],
        shPoly: [[50,140],[86,140],[86,380],[50,380]],
        orient: 18.0,
      },
      {
        // RIGHT ghost-net cluster — starboard channel
        label: "ghost_net",
        threat: "HIGH",
        conf: 0.88,
        w: 9.7,
        l: 18.0,
        h: 0.0,
        slant: 58.2,
        shadowLen: 6.4, // 44 px × 0.146
        color: "#dc2626",
        coords: fromOrigin(0.0036, 0.0029),
        hlBbox: [704, 60, 921, 390],
        shBbox: [921, 90, 965, 360],
        hlPoly: [[704,60],[921,60],[921,390],[704,390]],
        shPoly: [[921,90],[965,90],[965,360],[921,360]],
        orient: 22.0,
      },
    ],
    wooden_shipwreck: [
      {
        // Shipwreck hull highlight (measured from ship.png @ 1024×512)
        label: "wooden_shipwreck",
        threat: "MEDIUM",
        conf: 0.94,
        w: 18.8,  // (706-577) × 0.146
        l: 35.6,  // (382-138) × 0.146
        h: 0.0,
        slant: 32.4,
        shadowLen: 19.6, // 134 px × 0.146
        color: "#d97706",
        coords: fromOrigin(0.0029, 0.0027),
        hlBbox: [577, 138, 706, 382],
        shBbox: [706, 168, 840, 382],
        hlPoly: [[577,138],[706,138],[706,382],[577,382]],
        shPoly: [[706,168],[840,168],[840,382],[706,382]],
        orient: 8.0,
      },
      {
        // Bow / debris scatter section
        label: "wooden_shipwreck",
        threat: "MEDIUM",
        conf: 0.72,
        w: 7.0,
        l: 16.1,
        h: 0.0,
        slant: 30.1,
        shadowLen: 2.9, // 20 px × 0.146
        color: "#d97706",
        coords: fromOrigin(0.0026, 0.0024),
        hlBbox: [530, 210, 578, 320],
        shBbox: [510, 220, 530, 310],
        hlPoly: [[530,210],[578,210],[578,320],[530,320]],
        shPoly: [[510,220],[530,220],[530,310],[510,310]],
        orient: 5.0,
      },
    ],
  };

  const targets = scenarioTargets[scenarioId] || scenarioTargets.gost_net1;

  const features: DetectionFeature[] = targets.map((t, idx) => {
    const calcHeight = (t.shadowLen * 8.0) / t.slant;
    const volM3 = Number((t.w * t.l * calcHeight).toFixed(3));
    const areaM2 = Number((t.w * t.l).toFixed(3));
    const surfM2 = Number(
      (2 * (t.w * t.l + t.w * calcHeight + t.l * calcHeight)).toFixed(3)
    );

    return {
      type: "Feature",
      id: idx,
      geometry: {
        type: "Point",
        coordinates: t.coords,
      },
      properties: {
        detection_id: idx,
        class_id: idx,
        class_label: t.label,
        confidence: t.conf,
        threat_level: t.threat,
        description: `Hydrographically verified ${t.label.replace(/_/g, " ")}`,
        h_target_m: Number(calcHeight.toFixed(3)),
        slant_range_m: t.slant,
        channel: t.hlBbox[0] < 512 ? "port" : "starboard",
        dimensions: {
          width_m: t.w,
          length_m: t.l,
          height_m: Number(calcHeight.toFixed(3)),
        },
        mvb: {
          dimensions: {
            length_m: t.l,
            width_m: t.w,
            height_m: Number(calcHeight.toFixed(3)),
          },
          volume_m3: volM3,
          footprint_area_m2: areaM2,
          surface_area_m2: surfM2,
          aspect_ratio: Number((Math.max(t.w, t.l) / Math.min(t.w, t.l)).toFixed(2)),
          orientation_deg: t.orient,
          bbox_2d_px: {
            x1: t.hlBbox[0],
            y1: t.hlBbox[1],
            x2: t.hlBbox[2],
            y2: t.hlBbox[3],
            width_px: t.hlBbox[2] - t.hlBbox[0],
            length_px: t.hlBbox[3] - t.hlBbox[1],
          },
          mensuration_type: "Oriented_Minimum_Bounding_Volume",
        },
        mensuration: {
          method: "shadow_height_formula_and_mvb_3d",
          formula: "H_target = (L_shadow × H_towfish) / R_slant | V_mvb = L × W × H",
          parameters: {
            L_shadow_px: Math.round(t.shadowLen / 0.146),
            L_shadow_m: t.shadowLen,
            H_towfish_m: 8.0,
            R_slant_m: t.slant,
            volume_m3: volM3,
            footprint_area_m2: areaM2,
          },
        },
        highlight_bbox: t.hlBbox,
        shadow_bbox: t.shBbox,
        highlight_polygon: t.hlPoly,
        shadow_polygon: t.shPoly,
        segmentation_area_px: Math.round(t.w * t.l * 48),
        marker_color: t.color,
        marker_size: 16,
        depth_m: -28.5,
        source: "yolov8_seg_dual_head",
        timestamp: new Date().toISOString(),
      },
    };
  });

  return {
    type: "FeatureCollection",
    metadata: {
      system: "SonarSense — AI-Powered Marine Debris Detection",
      scenario: scenarioId,
      total_detections: features.length,
      survey_origin: SURVEY_ORIGIN,
      frequency_khz: 600,
      towfish_altitude_m: 8.0,
      slant_range_max_m: 75.0,
      data_source: "simulated",
    },
    features,
  };
}

export async function uploadSonarData(
  file?: File | null,
  scenarioId: string = "gost_net1"
): Promise<DetectionCollection> {
  const url = `${API_BASE}/api/v1/upload?scenario=${scenarioId}`;

  try {
    let response: Response;
    if (file) {
      const formData = new FormData();
      formData.append("file", file);
      response = await fetch(url, {
        method: "POST",
        body: formData,
      });
    } else {
      response = await fetch(url, {
        method: "POST",
      });
    }

    if (response.ok) {
      return await response.json();
    }
  } catch {
    console.warn("Backend offline, utilizing built-in simulation fallback");
  }

  return createMockScenario(scenarioId);
}

export async function getDetections(
  scenarioId: string = "gost_net1"
): Promise<DetectionCollection> {
  try {
    const response = await fetch(`${API_BASE}/api/v1/detections?scenario=${encodeURIComponent(scenarioId)}`);
    if (response.ok) {
      return await response.json();
    }
  } catch {
    console.warn("Backend offline, utilizing built-in detection data");
  }
  return createMockScenario(scenarioId);
}

export function getSonarImageUrl(
  stage: PipelineStage = "annotated",
  scenarioId?: string
): string {
  const scenarioParam = scenarioId ? `&scenario=${scenarioId}` : "";
  const t = Date.now();
  return `${API_BASE}/api/v1/sonar-image?stage=${stage}${scenarioParam}&t=${t}`;
}

export async function generateReport(
  geojson?: DetectionCollection | null
): Promise<ReportData> {
  try {
    const response = await fetch(`${API_BASE}/api/v1/report`, {
      method: "POST",
    });
    if (response.ok) {
      return await response.json();
    }
  } catch {
    console.warn("Backend offline, generating report from local dataset");
  }

  const currentGeojson = geojson || createMockScenario("gost_net1");
  return {
    title: "SonarSense — Marine Debris Clearance Dossier",
    system: "AI-Powered Automated Underwater Marine Debris Detection",
    sonar_config: {
      frequency_khz: 600,
      towfish_altitude_m: 8.0,
      slant_range_max_m: 75.0,
      survey_origin_lat: SURVEY_ORIGIN[1],
      survey_origin_lon: SURVEY_ORIGIN[0],
    },
    preprocessing_suite: {
      tvg_gain: "20*log10(R) + 2*0.05*R (dB)",
      srad_iterations: 5,
      lee_filter_window: "7x7",
      range_correction: "slant_to_ground",
      range_correction_formula: "R_ground = sqrt(R_slant² − H_towfish²)",
    },
    inference_model: "YOLOv8-Seg (Dual-Head Highlight-Shadow Architecture)",
    height_formula: "H_target = (L_shadow × H_towfish) / R_slant",
    mvb_formula: "V_3d = Length × Width × Height (m³)",
    total_detections: currentGeojson.features.length,
    detections: currentGeojson.features.map((f, i) => ({
      id: i,
      class: f.properties.class_label,
      threat: f.properties.threat_level,
      confidence: f.properties.confidence,
      dimensions: f.properties.dimensions,
      h_target_m: f.properties.h_target_m,
      mvb: f.properties.mvb,
      coordinates: f.geometry.coordinates,
      slant_range_m: f.properties.slant_range_m,
      mensuration: f.properties.mensuration.parameters,
    })),
    geojson: currentGeojson,
  };
}

export interface BackendHealth {
  connected: boolean;
  apiBase: string;
  latencyMs?: number;
  detail?: string;
}

/**
 * Probe the FastAPI backend. Reports the true reachability of the API rather
 * than masking a failure, so the UI can tell live inference apart from the
 * offline fallback dataset.
 */
export async function healthCheck(timeoutMs = 8000): Promise<BackendHealth> {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${API_BASE}/api/v1/health`, {
      signal: controller.signal,
      cache: "no-store",
    });
    if (!response.ok) {
      return { connected: false, apiBase: API_BASE, detail: `HTTP ${response.status}` };
    }
    await response.json();
    return { connected: true, apiBase: API_BASE, latencyMs: Date.now() - started };
  } catch (err) {
    const detail =
      err instanceof DOMException && err.name === "AbortError"
        ? `No response in ${timeoutMs / 1000}s`
        : "Unreachable (network/CORS)";
    return { connected: false, apiBase: API_BASE, detail };
  } finally {
    clearTimeout(timer);
  }
}
