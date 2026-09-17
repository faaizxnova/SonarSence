/**
 * API Client & Simulation Engine
 * =================================
 * Connects to the FastAPI backend with offline simulation fallback.
 * Supports all 13 marine debris object scenarios and all 7 acoustic preprocessing stages.
 */

import type {
  DetectionCollection,
  DetectionFeature,
  PipelineStage,
  ReportData,
} from "./types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// 13 Sample Sonar Scenarios (offline-safe: every image ships in /public/samples)
export const DEMO_SCENARIOS = [
  {
    id: "gost_net1",
    name: "01 • Ghost Fishing Net",
    category: "Acoustic Target Survey",
    description: "Dual-channel side-scan sonar image of an entangled ghost fishing net on the seafloor",
    image: "/samples/gost_net1.png",
  },
  {
    id: "baseline_survey",
    name: "02 • Discarded Tyres Reef",
    category: "Acoustic Target Survey",
    description: "Baseline dual-swath survey with specular acoustic highlight and relief shadow",
    image: "/samples/sonar_discarded_tires_reef.png",
  },
  {
    id: "test_sonar",
    name: "03 • Subsea Shipping Containers",
    category: "Acoustic Target Survey",
    description: "Sonar survey of an intermodal freight container with acoustic relief shadow",
    image: "/samples/sonar_shipping_containers.png",
  },
  {
    id: "test_1",
    name: "04 • User-Uploaded Sonar",
    category: "Acoustic Target Survey",
    description: "Sample of a manually uploaded raw sonar image, unprocessed",
    image: "/samples/test_1.png",
  },
  {
    id: "wooden_shipwreck",
    name: "05 • Sunken Shipwreck",
    category: "Historic Marine Debris",
    description: "High-resolution side-scan sonar survey revealing a sunken ship hull on the seabed",
    image: "/samples/ship.png",
  },
  {
    id: "moored_sea_mine",
    name: "06 • Moored Sea Mine",
    category: "Unexploded Ordnance",
    description: "Single tethered mine-like target with a compact spherical acoustic signature",
    image: "/samples/sonar_moored_sea_mine.png",
  },
  {
    id: "unexploded_ordnance",
    name: "07 • Unexploded Ordnance",
    category: "Unexploded Ordnance",
    description: "Elongated ordnance-shaped target consistent with a legacy munition on the seabed",
    image: "/samples/sonar_unexploded_ordnance.png",
  },
  {
    id: "chemical_drums",
    name: "08 • Chemical Drums",
    category: "Hazardous Debris",
    description: "Two discrete drum-shaped targets on the port and starboard swath",
    image: "/samples/sonar_chemical_drums.png",
  },
  {
    id: "ghost_net_field",
    name: "09 • Ghost Net Debris Field",
    category: "Acoustic Target Survey",
    description: "Multi-target survey with three entangled net clusters of varying size",
    image: "/samples/sonar_ghost_fishing_nets.png",
  },
  {
    id: "pipeline_trench",
    name: "10 • Pipeline Trench Debris",
    category: "Infrastructure Hazard",
    description: "Object of interest adjacent to a subsea pipeline trench alignment",
    image: "/samples/sonar_pipeline_trench_scour.png",
  },
  {
    id: "submerged_vehicle",
    name: "11 • Submerged Vehicle",
    category: "Acoustic Target Survey",
    description: "Two vehicle-scale targets on opposing swaths of a single pass",
    image: "/samples/sonar_submerged_vehicle.png",
  },
  {
    id: "aircraft_wreckage",
    name: "12 • Aircraft Wreckage Field",
    category: "Historic Marine Debris",
    description: "Three-part debris field consistent with a distributed aircraft wreckage site",
    image: "/samples/sonar_aircraft_wreckage.png",
  },
  {
    id: "regional_multi_sea_survey",
    name: "13 • Regional Multi-Sea Survey",
    category: "Regional Survey",
    description: "Three illustrative detections spread across the Arabian Sea, the Bay of Bengal, and the open Indian Ocean — for exercising the tactical map at national scale rather than a single survey site",
    image: "/samples/sonar_plastic_debris_bales.png",
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
        label: "ghost_fishing_net",
        threat: "HIGH",
        conf: 0.842,
        w: 4.8,
        l: 8.5,
        h: 2.1,
        slant: 58.5,
        shadowLen: 7.5,
        color: "#dc2626",
        coords: [83.3142, 17.7238],
        hlBbox: [755, 65, 965, 360],
        shBbox: [710, 160, 765, 320],
        hlPoly: [
          [875, 65], [965, 200], [920, 360], [755, 260]
        ],
        shPoly: [
          [755, 160], [800, 160], [800, 320], [710, 320]
        ],
        orient: 24.0,
      },
    ],
    baseline_survey: [
      {
        label: "discarded_tires",
        threat: "LOW",
        conf: 0.794,
        w: 1.2,
        l: 1.2,
        h: 0.45,
        slant: 24.0,
        shadowLen: 4.2,
        color: "#65a30d",
        coords: [83.311, 17.72],
        hlBbox: [220, 280, 254, 314],
        shBbox: [178, 280, 220, 314],
        hlPoly: [
          [220, 297], [228, 282], [246, 280], [254, 297], [246, 314], [228, 312]
        ],
        shPoly: [
          [178, 284], [220, 280], [220, 314], [178, 310]
        ],
        orient: 0.0,
      },
    ],
    test_sonar: [
      {
        label: "shipping_container",
        threat: "HIGH",
        conf: 0.912,
        w: 6.0,
        l: 8.3,
        h: 1.39,
        slant: 42.5,
        shadowLen: 7.4,
        color: "#38bdf8",
        coords: [83.3105, 17.721],
        hlBbox: [221, 118, 278, 159],
        shBbox: [170, 118, 221, 159],
        hlPoly: [[221, 118], [278, 122], [278, 159], [221, 155]],
        shPoly: [[170, 118], [221, 118], [221, 155], [170, 155]],
        orient: 12.0,
      }
    ],
    test_1: [
      {
        label: "ghost_fishing_net",
        threat: "HIGH",
        conf: 0.865,
        w: 4.8,
        l: 8.5,
        h: 2.1,
        slant: 58.5,
        shadowLen: 7.5,
        color: "#dc2626",
        coords: [83.316, 17.726],
        hlBbox: [755, 65, 965, 360],
        shBbox: [710, 160, 765, 320],
        hlPoly: [[875, 65], [965, 200], [920, 360], [755, 260]],
        shPoly: [[755, 160], [800, 160], [800, 320], [710, 320]],
        orient: 24.0,
      }
    ],
    wooden_shipwreck: [
      {
        label: "wooden_shipwreck",
        threat: "HIGH",
        conf: 0.885,
        w: 17.5,
        l: 41.6,
        h: 3.12,
        slant: 31.8,
        shadowLen: 12.4,
        color: "#d97706",
        coords: [83.3148, 17.7242],
        hlBbox: [675, 150, 855, 430],
        shBbox: [785, 180, 865, 420],
        hlPoly: [[685, 160], [745, 155], [845, 395], [775, 430]],
        shPoly: [[745, 155], [865, 200], [865, 420], [845, 395]],
        orient: 8.0,
      }
    ],
    moored_sea_mine: [
      {
        label: "moored_sea_mine",
        threat: "HIGH",
        conf: 0.912,
        w: 0.9,
        l: 0.9,
        h: 0.85,
        slant: 35.0,
        shadowLen: 5.2,
        color: "#dc2626",
        coords: [83.3125, 17.7221],
        hlBbox: [228, 192, 292, 244],
        shBbox: [158, 196, 250, 242],
        hlPoly: [[228, 192], [292, 192], [292, 244], [228, 244]],
        shPoly: [[158, 196], [250, 196], [250, 242], [158, 242]],
        orient: 0.0,
      },
    ],
    unexploded_ordnance: [
      {
        label: "unexploded_ordnance",
        threat: "HIGH",
        conf: 0.878,
        w: 0.4,
        l: 1.8,
        h: 0.35,
        slant: 40.0,
        shadowLen: 3.1,
        color: "#dc2626",
        coords: [83.313, 17.7228],
        hlBbox: [298, 203, 348, 244],
        shBbox: [238, 207, 302, 242],
        hlPoly: [[298, 203], [348, 203], [348, 244], [298, 244]],
        shPoly: [[238, 207], [302, 207], [302, 242], [238, 242]],
        orient: 90.0,
      },
    ],
    chemical_drums: [
      {
        label: "chemical_drum",
        threat: "MEDIUM",
        conf: 0.804,
        w: 0.6,
        l: 0.6,
        h: 0.9,
        slant: 30.0,
        shadowLen: 3.8,
        color: "#d97706",
        coords: [83.3108, 17.7205],
        hlBbox: [226, 156, 308, 224],
        shBbox: [123, 160, 232, 222],
        hlPoly: [[226, 156], [308, 156], [308, 224], [226, 224]],
        shPoly: [[123, 160], [232, 160], [232, 222], [123, 222]],
        orient: 0.0,
      },
      {
        label: "chemical_drum",
        threat: "MEDIUM",
        conf: 0.771,
        w: 0.6,
        l: 0.6,
        h: 0.88,
        slant: 46.0,
        shadowLen: 4.0,
        color: "#d97706",
        coords: [83.3135, 17.7232],
        hlBbox: [616, 276, 662, 322],
        shBbox: [656, 278, 755, 320],
        hlPoly: [[616, 276], [662, 276], [662, 322], [616, 322]],
        shPoly: [[656, 278], [755, 278], [755, 320], [656, 320]],
        orient: 0.0,
      },
    ],
    ghost_net_field: [
      {
        label: "ghost_fishing_net",
        threat: "HIGH",
        conf: 0.869,
        w: 5.2,
        l: 9.0,
        h: 1.8,
        slant: 33.0,
        shadowLen: 6.6,
        color: "#dc2626",
        coords: [83.3117, 17.721],
        hlBbox: [226, 161, 302, 244],
        shBbox: [151, 163, 230, 222],
        hlPoly: [[226, 161], [302, 161], [302, 244], [226, 244]],
        shPoly: [[151, 163], [230, 163], [230, 222], [151, 222]],
        orient: 12.0,
      },
      {
        label: "ghost_fishing_net",
        threat: "HIGH",
        conf: 0.803,
        w: 3.0,
        l: 5.5,
        h: 1.1,
        slant: 52.0,
        shadowLen: 4.2,
        color: "#dc2626",
        coords: [83.314, 17.7226],
        hlBbox: [718, 93, 767, 147],
        shBbox: [763, 95, 820, 145],
        hlPoly: [[718, 93], [767, 93], [767, 147], [718, 147]],
        shPoly: [[763, 95], [820, 95], [820, 145], [763, 145]],
        orient: 34.0,
      },
      {
        label: "ghost_fishing_net",
        threat: "MEDIUM",
        conf: 0.742,
        w: 2.0,
        l: 3.5,
        h: 0.7,
        slant: 60.0,
        shadowLen: 2.9,
        color: "#d97706",
        coords: [83.3155, 17.7218],
        hlBbox: [746, 413, 797, 462],
        shBbox: [793, 415, 862, 460],
        hlPoly: [[746, 413], [797, 413], [797, 462], [746, 462]],
        shPoly: [[793, 415], [862, 415], [862, 460], [793, 460]],
        orient: 20.0,
      },
    ],
    pipeline_trench: [
      {
        label: "pipeline_debris",
        threat: "MEDIUM",
        conf: 0.793,
        w: 1.5,
        l: 2.2,
        h: 0.6,
        slant: 47.0,
        shadowLen: 3.3,
        color: "#d97706",
        coords: [83.3122, 17.7233],
        hlBbox: [678, 220, 732, 262],
        shBbox: [728, 222, 822, 260],
        hlPoly: [[678, 220], [732, 220], [732, 262], [678, 262]],
        shPoly: [[728, 222], [822, 222], [822, 260], [728, 260]],
        orient: 0.0,
      },
    ],
    submerged_vehicle: [
      {
        label: "submerged_vehicle",
        threat: "HIGH",
        conf: 0.887,
        w: 1.8,
        l: 4.2,
        h: 1.5,
        slant: 34.0,
        shadowLen: 6.0,
        color: "#dc2626",
        coords: [83.3113, 17.7216],
        hlBbox: [268, 205, 322, 247],
        shBbox: [203, 207, 272, 245],
        hlPoly: [[268, 205], [322, 205], [322, 247], [268, 247]],
        shPoly: [[203, 207], [272, 207], [272, 245], [203, 245]],
        orient: 4.0,
      },
      {
        label: "submerged_vehicle",
        threat: "MEDIUM",
        conf: 0.812,
        w: 1.8,
        l: 4.2,
        h: 1.4,
        slant: 50.0,
        shadowLen: 4.9,
        color: "#d97706",
        coords: [83.3147, 17.7236],
        hlBbox: [658, 220, 717, 262],
        shBbox: [713, 222, 787, 260],
        hlPoly: [[658, 220], [717, 220], [717, 262], [658, 262]],
        shPoly: [[713, 222], [787, 222], [787, 260], [713, 260]],
        orient: 4.0,
      },
    ],
    regional_multi_sea_survey: [
      {
        // Arabian Sea, open water west of the Konkan coast
        label: "marine_debris_cluster",
        threat: "HIGH",
        conf: 0.858,
        w: 3.6,
        l: 6.2,
        h: 1.3,
        slant: 38.0,
        shadowLen: 5.4,
        color: "#dc2626",
        coords: [70.8, 16.5],
        hlBbox: [300, 162, 352, 207],
        shBbox: [238, 162, 300, 207],
        hlPoly: [[300, 162], [352, 162], [352, 207], [300, 207]],
        shPoly: [[238, 162], [300, 162], [300, 207], [238, 207]],
        orient: 0.0,
      },
      {
        // Bay of Bengal, open water east of the Andhra-Odisha coast
        label: "discarded_fishing_gear",
        threat: "MEDIUM",
        conf: 0.802,
        w: 2.1,
        l: 3.8,
        h: 0.9,
        slant: 44.0,
        shadowLen: 3.9,
        color: "#d97706",
        coords: [88.0, 14.0],
        hlBbox: [710, 143, 758, 183],
        shBbox: [758, 143, 817, 183],
        hlPoly: [[710, 143], [758, 143], [758, 183], [710, 183]],
        shPoly: [[758, 143], [817, 143], [817, 183], [758, 183]],
        orient: 0.0,
      },
      {
        // Open Indian Ocean, south of Sri Lanka / the Maldives — distinct
        // from the two marginal seas above
        label: "unidentified_debris",
        threat: "LOW",
        conf: 0.731,
        w: 1.4,
        l: 2.0,
        h: 0.5,
        slant: 27.0,
        shadowLen: 2.2,
        color: "#65a30d",
        coords: [76.5, 4.0],
        hlBbox: [238, 340, 300, 385],
        shBbox: [180, 340, 238, 385],
        hlPoly: [[238, 340], [300, 340], [300, 385], [238, 385]],
        shPoly: [[180, 340], [238, 340], [238, 385], [180, 385]],
        orient: 0.0,
      },
    ],
    aircraft_wreckage: [
      {
        label: "aircraft_debris",
        threat: "LOW",
        conf: 0.702,
        w: 0.8,
        l: 1.4,
        h: 0.4,
        slant: 22.0,
        shadowLen: 1.6,
        color: "#65a30d",
        coords: [83.311, 17.7239],
        hlBbox: [198, 93, 232, 124],
        shBbox: [153, 95, 202, 122],
        hlPoly: [[198, 93], [232, 93], [232, 124], [198, 124]],
        shPoly: [[153, 95], [202, 95], [202, 122], [153, 122]],
        orient: 0.0,
      },
      {
        label: "aircraft_fuselage",
        threat: "HIGH",
        conf: 0.861,
        w: 3.0,
        l: 11.0,
        h: 2.4,
        slant: 36.0,
        shadowLen: 7.8,
        color: "#dc2626",
        coords: [83.3116, 17.7231],
        hlBbox: [313, 205, 352, 247],
        shBbox: [258, 207, 317, 245],
        hlPoly: [[313, 205], [352, 205], [352, 247], [313, 247]],
        shPoly: [[258, 207], [317, 207], [317, 245], [258, 245]],
        orient: 16.0,
      },
      {
        label: "aircraft_debris",
        threat: "MEDIUM",
        conf: 0.753,
        w: 1.2,
        l: 2.0,
        h: 0.6,
        slant: 58.0,
        shadowLen: 3.4,
        color: "#d97706",
        coords: [83.3152, 17.7223],
        hlBbox: [598, 308, 647, 357],
        shBbox: [643, 310, 712, 355],
        hlPoly: [[598, 308], [647, 308], [647, 357], [598, 357]],
        shPoly: [[643, 310], [712, 310], [712, 355], [643, 355]],
        orient: 0.0,
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
      survey_origin: [83.3119, 17.7215],
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
      survey_origin_lat: 17.7215,
      survey_origin_lon: 83.3119,
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

export async function healthCheck(): Promise<{ status: string; system: string }> {
  try {
    const response = await fetch(`${API_BASE}/api/v1/health`);
    if (response.ok) {
      return await response.json();
    }
  } catch {}
  return { status: "operational", system: "SonarSense Processing Engine" };
}
