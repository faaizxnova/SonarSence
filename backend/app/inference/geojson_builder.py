"""
SIH26057 — GeoJSON Feature Collection Builder
===============================================

Converts pixel-space sonar detections into georeferenced WGS84 coordinates
and packages them as a standards-compliant GeoJSON FeatureCollection
(RFC 7946).

COORDINATE CONVERSION:
    Side-scan sonar data is collected along a survey line. Each detection's
    pixel position in the waterfall image maps to a physical offset from
    the survey origin:
    
    1. ACROSS-TRACK (x-axis): The cross-track pixel position maps to a
       ground-range distance from the nadir line.
    
    2. ALONG-TRACK (y-axis): The vertical pixel position maps to a
       distance along the survey line (= speed × time).
    
    These offsets are then rotated by the survey heading and projected
    onto WGS84 lat/lon using local flat-Earth approximation (valid for
    survey areas < 10 km across).

OUTPUT FORMAT:
    The GeoJSON FeatureCollection contains Point features for each detection,
    with properties including classification, physical dimensions, confidence,
    and the calculated target height — ready for overlay on Mapbox GL JS.
"""

import numpy as np
from typing import List, Dict, Any
from datetime import datetime, timezone
from app.config import (
    SURVEY_ORIGIN_LAT, SURVEY_ORIGIN_LON,
    SURVEY_HEADING_DEG, PIXEL_RESOLUTION_M,
    WATERFALL_WIDTH_PX, WATERFALL_HEIGHT_PX,
    METERS_PER_DEG_LAT, METERS_PER_DEG_LON,
    TOWFISH_ALTITUDE_M
)


def pixel_to_wgs84(
    center_px: List[int],
    image_width: int = WATERFALL_WIDTH_PX,
    image_height: int = WATERFALL_HEIGHT_PX,
    pixel_res_m: float = PIXEL_RESOLUTION_M,
    origin_lat: float = SURVEY_ORIGIN_LAT,
    origin_lon: float = SURVEY_ORIGIN_LON,
    heading_deg: float = SURVEY_HEADING_DEG
) -> Dict[str, float]:
    """
    Convert a pixel coordinate in the sonar waterfall to WGS84 lat/lon.
    
    The conversion pipeline:
        Pixel (x, y) → Physical offset (dx_m, dy_m) → Rotate by heading → Lat/Lon
    
    Args:
        center_px:    [x, y] pixel coordinates in the waterfall image
        image_width:  Total waterfall width (pixels)
        image_height: Total waterfall height (pixels)
        pixel_res_m:  Pixel resolution (meters/pixel)
        origin_lat:   Survey origin latitude (degrees)
        origin_lon:   Survey origin longitude (degrees)
        heading_deg:  Survey line heading (degrees from North, clockwise)
    
    Returns:
        Dictionary with latitude, longitude, and depth estimate
    """
    px_x, px_y = center_px
    
    # ── Step 1: Convert pixel position to physical offset (meters) ──
    # x-axis: cross-track distance from nadir
    # Center of image (image_width/2) = nadir (0 m cross-track)
    cross_track_m = (px_x - image_width / 2) * pixel_res_m
    
    # y-axis: along-track distance from top of waterfall
    along_track_m = px_y * pixel_res_m
    
    # ── Step 2: Rotate by survey heading ──
    # Convert heading to radians (measured CW from North)
    heading_rad = np.radians(heading_deg)
    
    # Rotation matrix: heading is CW from North (y-axis)
    # dx_east = cross_track × cos(heading) + along_track × sin(heading)
    # dy_north = -cross_track × sin(heading) + along_track × cos(heading)
    dx_east = cross_track_m * np.cos(heading_rad) + along_track_m * np.sin(heading_rad)
    dy_north = -cross_track_m * np.sin(heading_rad) + along_track_m * np.cos(heading_rad)
    
    # ── Step 3: Convert meters to degrees ──
    delta_lat = dy_north / METERS_PER_DEG_LAT
    delta_lon = dx_east / METERS_PER_DEG_LON
    
    lat = origin_lat + delta_lat
    lon = origin_lon + delta_lon
    
    # Simulated depth (negative below sea level)
    # Assume seabed is at towfish altitude below the surface
    depth_m = -(TOWFISH_ALTITUDE_M + np.random.uniform(15, 25))
    
    return {
        "latitude": round(float(lat), 6),
        "longitude": round(float(lon), 6),
        "depth_m": round(float(depth_m), 1)
    }


def build_geojson_feature(detection: Dict) -> Dict:
    """
    Build a single GeoJSON Feature from an enriched detection dictionary.
    
    Args:
        detection: Enriched detection from the mensuration pipeline
    
    Returns:
        GeoJSON Feature (Point geometry with properties)
    """
    # Convert pixel coordinates to WGS84
    coords = pixel_to_wgs84(detection["center_px"])
    
    # Build RFC 7946 compliant feature
    feature = {
        "type": "Feature",
        "id": detection["detection_id"],
        "geometry": {
            "type": "Point",
            "coordinates": [coords["longitude"], coords["latitude"]]
        },
        "properties": {
            # ── Detection Metadata ──
            "detection_id": detection["detection_id"],
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "source": detection.get("source", "simulated_yolov8_seg"),
            
            # ── Classification ──
            "class_id": detection["classification"]["class_id"],
            "class_label": detection["classification"]["class_label"],
            "description": detection["classification"]["description"],
            "threat_level": detection["classification"]["threat_level"],
            "confidence": detection["confidence"],
            
            # ── Physical Measurements & MVB 3D Bounding ──
            "dimensions": detection["dimensions"],
            "h_target_m": detection["h_target_m"],
            "mvb": detection.get("mvb", {}),
            
            # ── Acoustic Parameters ──
            "slant_range_m": detection["slant_range_m"],
            "channel": detection["channel"],
            "depth_m": coords["depth_m"],
            
            # ── Mensuration Provenance ──
            "mensuration": {
                "method": detection["mensuration_method"],
                "formula": detection["formula"],
                "parameters": detection["parameters"]
            },
            
            # ── Bounding Boxes & Polygons (pixel space, for overlay rendering) ──
            "highlight_bbox": detection["highlight_bbox"],
            "shadow_bbox": detection["shadow_bbox"],
            "highlight_polygon": detection.get("highlight_polygon"),
            "shadow_polygon": detection.get("shadow_polygon"),
            
            # ── Display Properties ──
            "marker_color": _get_threat_color(detection["classification"]["threat_level"]),
            "marker_size": _get_marker_size(detection["confidence"]),
        }
    }
    
    return feature


def _to_native(obj: Any) -> Any:
    """
    Recursively convert numpy types to native Python types so the
    result is JSON-serializable. NumPy int64/float64 cause TypeError
    in json.dumps().
    """
    if isinstance(obj, dict):
        return {k: _to_native(v) for k, v in obj.items()}
    elif isinstance(obj, (list, tuple)):
        return [_to_native(item) for item in obj]
    elif isinstance(obj, np.integer):
        return int(obj)
    elif isinstance(obj, np.floating):
        return float(obj)
    elif isinstance(obj, np.ndarray):
        return obj.tolist()
    return obj


def build_geojson_collection(detections: List[Dict]) -> Dict:
    """
    Build a complete GeoJSON FeatureCollection from all enriched detections.
    
    This is the primary output format consumed by the Mapbox GL JS frontend
    and the PDF dossier generator.
    
    Args:
        detections: List of enriched detections from the mensuration pipeline
    
    Returns:
        GeoJSON FeatureCollection (RFC 7946 compliant)
    """
    features = [build_geojson_feature(det) for det in detections]
    
    collection = {
        "type": "FeatureCollection",
        "metadata": {
            "system": "SIH26057 — AI-Powered Marine Debris Detection",
            "sonar": "Simulated 600 kHz Side-Scan Sonar",
            "model": "YOLOv8-Seg (Simulated Dual-Head Pipeline)",
            "survey_origin": {
                "latitude": SURVEY_ORIGIN_LAT,
                "longitude": SURVEY_ORIGIN_LON,
                "heading_deg": SURVEY_HEADING_DEG
            },
            "towfish_altitude_m": TOWFISH_ALTITUDE_M,
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "total_detections": len(features),
        },
        "features": features
    }
    
    # Ensure all numpy types are converted to native Python types
    return _to_native(collection)


def _get_threat_color(threat_level: str) -> str:
    """Map threat level to a display color for map markers."""
    colors = {
        "HIGH": "#ff3333",
        "MEDIUM": "#ff9900",
        "LOW": "#ffcc00",
        "UNKNOWN": "#9966ff"
    }
    return colors.get(threat_level, "#ffffff")


def _get_marker_size(confidence: float) -> int:
    """Map detection confidence to marker size (pixels)."""
    if confidence >= 0.9:
        return 24
    elif confidence >= 0.8:
        return 20
    elif confidence >= 0.7:
        return 16
    else:
        return 12
