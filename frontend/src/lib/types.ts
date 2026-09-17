/**
 * Shared TypeScript interfaces for the marine debris detection dashboard.
 */

/** Physical dimensions of a detected debris target */
export interface Dimensions {
  width_m: number;
  length_m: number;
  height_m: number;
}

/** 3D Minimum Volumetric Bounding (MVB) calculations */
export interface MVB3DData {
  dimensions: {
    length_m: number;
    width_m: number;
    height_m: number;
  };
  volume_m3: number;
  footprint_area_m2: number;
  surface_area_m2: number;
  aspect_ratio: number;
  orientation_deg: number;
  vertices_3d?: number[][];
  bbox_2d_px?: {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    width_px: number;
    length_px: number;
  };
  mensuration_type?: string;
}

/** Mensuration provenance — documents how H_target was calculated */
export interface MensurationParams {
  L_shadow_px: number;
  L_shadow_m: number;
  H_towfish_m: number;
  R_slant_m: number;
  volume_m3?: number;
  footprint_area_m2?: number;
}

export interface Mensuration {
  method: string;
  formula: string;
  parameters: MensurationParams;
}

/** GeoJSON Feature properties for a single detection */
export interface DetectionProperties {
  detection_id: number;
  timestamp: string;
  source: string;

  // Classification
  class_id: number;
  class_label: string;
  description: string;
  threat_level: "HIGH" | "MEDIUM" | "LOW" | "UNKNOWN";
  confidence: number;

  // Physical measurements
  dimensions: Dimensions;
  h_target_m: number;
  mvb?: MVB3DData;

  // Acoustic parameters
  slant_range_m: number;
  channel: "port" | "starboard";
  depth_m: number;

  // Mensuration provenance
  mensuration: Mensuration;

  // Pixel-space bounding boxes and YOLOv8 segmentation polygon outlines
  highlight_bbox: [number, number, number, number];
  shadow_bbox: [number, number, number, number];
  highlight_polygon?: [number, number][];
  shadow_polygon?: [number, number][];
  segmentation_area_px?: number;

  // Display properties
  marker_color: string;
  marker_size: number;
}

/** GeoJSON Point Feature for a detection */
export interface DetectionFeature {
  type: "Feature";
  id: number;
  geometry: {
    type: "Point";
    coordinates: [number, number]; // [lon, lat]
  };
  properties: DetectionProperties;
}

/** Survey metadata from the backend */
export interface SurveyMetadata {
  system: string;
  scenario?: string;
  sonar?: string;
  model?: string;
  survey_origin?: {
    latitude: number;
    longitude: number;
    heading_deg: number;
  } | [number, number];
  towfish_altitude_m?: number;
  frequency_khz?: number;
  slant_range_max_m?: number;
  generated_at?: string;
  total_detections: number;
  /** Set to "simulated" by the offline mock fallback; absent/"live" means it came from the backend. */
  data_source?: "live" | "simulated";
}

/** GeoJSON FeatureCollection response from the backend */
export interface DetectionCollection {
  type: "FeatureCollection";
  metadata: SurveyMetadata;
  features: DetectionFeature[];
}

/** Report data for the PDF dossier */
export interface ReportDetection {
  id: number;
  class: string;
  threat: string;
  confidence: number;
  dimensions: Dimensions;
  h_target_m: number;
  mvb?: MVB3DData;
  coordinates: [number, number];
  slant_range_m: number;
  mensuration: MensurationParams;
}

export interface ReportData {
  title: string;
  system: string;
  sonar_config: {
    frequency_khz: number;
    towfish_altitude_m: number;
    slant_range_max_m: number;
    survey_origin_lat: number;
    survey_origin_lon: number;
  };
  preprocessing_suite?: {
    tvg_gain?: string;
    srad_iterations?: number;
    lee_filter_window?: string | number;
    range_correction?: string;
    range_correction_formula?: string;
  };
  preprocessing?: {
    lee_filter_window: number | string;
    range_correction: string;
    range_correction_formula: string;
  };
  inference_model: string;
  height_formula: string;
  mvb_formula?: string;
  total_detections: number;
  detections: ReportDetection[];
  geojson: DetectionCollection;
}

/** Pipeline stages */
export type PipelineStage =
  | "raw"
  | "tvg"
  | "srad"
  | "lee"
  | "filtered"
  | "corrected"
  | "annotated"
  | "mvb";

/** Analysis pipeline status */
export type PipelineStatus =
  | "idle"
  | "uploading"
  | "processing"
  | "complete"
  | "error";
