"""
SIH26057 — Physical Mensuration & Target Height Calculator
===========================================================

After the YOLOv8-Seg pipeline detects highlight-shadow pairs, this module
calculates the PHYSICAL 3D DIMENSIONS of the detected debris target using
side-scan sonar geometry.

The key insight is that the acoustic shadow cast by a raised target on the
seabed encodes the target's HEIGHT information through a simple geometric
relationship (similar triangles):

                    Towfish (transducer)
                        •
                       /|
                      / |
                     /  | H_towfish (altitude)
                    /   |
                   /    |
    ─────────────•──────•───────────────── Seabed
                Target   │
                |▓▓▓|   │
                  ↕      │← R_slant
               H_target  │
                         │
                         ← Shadow (length L_shadow) →

    By similar triangles:
        H_target / L_shadow = H_towfish / R_slant

    Therefore:
        ┌─────────────────────────────────────────────────────┐
        │  H_target = (L_shadow × H_towfish) / R_slant       │
        └─────────────────────────────────────────────────────┘

REFERENCE:
    Blondel, Ph. "The Handbook of Sidescan Sonar," Springer, 2009, Ch. 6.
    Fish, J.P. & Carr, H.A. "Sound Underwater Images," 1990.
"""

import numpy as np
from typing import List, Dict
from app.config import (
    TOWFISH_ALTITUDE_M, PIXEL_RESOLUTION_M,
    SLANT_RANGE_MAX_M, DEBRIS_CLASSES
)


def calculate_target_height(
    shadow_length_px: int,
    slant_range_m: float,
    towfish_altitude_m: float = TOWFISH_ALTITUDE_M,
    pixel_resolution_m: float = PIXEL_RESOLUTION_M
) -> float:
    """
    Calculate the physical height of a seabed target from its acoustic shadow.
    
    This is the fundamental mensuration equation in side-scan sonar
    target analysis. The shadow length is directly proportional to the
    target height and the slant range, and inversely proportional to
    the towfish altitude.
    
    FORMULA:
        H_target = (L_shadow × H_towfish) / R_slant
    
    Where:
        L_shadow = Shadow length in meters (= shadow_length_px × pixel_resolution_m)
        H_towfish = Towfish altitude above seabed (meters)
        R_slant = Slant range from towfish to target (meters)
    
    ACCURACY CONSIDERATIONS:
        - Assumes flat seabed (slope introduces error)
        - Assumes shadow boundary is sharp (diffraction blur adds uncertainty)
        - Typical accuracy: ±10-15% for targets > 0.3 m height
    
    Args:
        shadow_length_px:   Shadow length measured in pixels
        slant_range_m:      Slant range to the target (meters)
        towfish_altitude_m: Towfish altitude (meters)
        pixel_resolution_m: Pixel resolution (meters/pixel)
    
    Returns:
        Estimated target height in meters
    """
    # Convert shadow length from pixels to meters
    shadow_length_m = shadow_length_px * pixel_resolution_m
    
    # Guard against division by zero
    if slant_range_m <= 0:
        return 0.0
    
    # ── Apply the height formula ──
    # H_target = (L_shadow × H_towfish) / R_slant
    h_target = (shadow_length_m * towfish_altitude_m) / slant_range_m
    
    return round(h_target, 3)


def calculate_target_dimensions(
    highlight_bbox: List[int],
    pixel_resolution_m: float = PIXEL_RESOLUTION_M
) -> Dict[str, float]:
    """
    Calculate the physical width and length of a target from its highlight
    bounding box.
    
    WIDTH = across-track extent (horizontal in the sonar image)
    LENGTH = along-track extent (vertical in the sonar image)
    
    Args:
        highlight_bbox:     [x1, y1, x2, y2] bounding box of the highlight
        pixel_resolution_m: Pixel resolution (meters/pixel)
    
    Returns:
        Dictionary with width_m and length_m
    """
    x1, y1, x2, y2 = highlight_bbox
    width_px = abs(x2 - x1)
    length_px = abs(y2 - y1)
    
    return {
        "width_m": round(width_px * pixel_resolution_m, 2),
        "length_m": round(length_px * pixel_resolution_m, 2),
        "width_px": width_px,
        "length_px": length_px
    }


def classify_debris_by_dimensions(
    width_m: float,
    length_m: float,
    height_m: float,
    class_id: int
) -> Dict:
    """
    Refine debris classification using physical dimensions.
    
    The initial classification from YOLOv8-Seg is based on visual features.
    This function cross-validates using known debris dimension ranges.
    
    Args:
        width_m:   Measured width (meters)
        length_m:  Measured length (meters)
        height_m:  Calculated height (meters)
        class_id:  Initial classification from YOLO
    
    Returns:
        Refined classification with metadata
    """
    # Dimension-based classification rules
    dimension_rules = {
        0: {"min_area": 1.0,  "max_area": 150.0, "label": "ghost_net"},
        1: {"min_area": 8.0,  "max_area": 45.0,  "label": "shipping_container"},
        2: {"min_area": 0.1,  "max_area": 3.0,   "label": "unexploded_ordnance_uxo"},
        3: {"min_area": 0.2,  "max_area": 3.5,   "label": "moored_sea_mine"},
        4: {"min_area": 6.0,  "max_area": 40.0,  "label": "aircraft_fuselage"},
        5: {"min_area": 0.2,  "max_area": 2.5,   "label": "chemical_drum"},
        6: {"min_area": 0.3,  "max_area": 10.0,  "label": "mooring_anchor_chain"},
        7: {"min_area": 1.0,  "max_area": 30.0,  "label": "pipeline_trench_scour"},
        8: {"min_area": 8.0,  "max_area": 80.0,  "label": "wooden_shipwreck"},
        9: {"min_area": 4.0,  "max_area": 15.0,  "label": "submerged_vehicle"},
        10: {"min_area": 1.0, "max_area": 12.0,  "label": "plastic_debris_bales"},
        11: {"min_area": 0.2, "max_area": 4.0,   "label": "discarded_tires_reef"},
        12: {"min_area": 0.1, "max_area": 100.0, "label": "unknown_anomaly"},
    }
    
    area = width_m * length_m
    
    # Check if dimensions match the initial class
    if class_id in dimension_rules:
        rule = dimension_rules[class_id]
        if rule["min_area"] <= area <= rule["max_area"]:
            confidence_boost = 0.05  # Dimensions match → higher confidence
        else:
            confidence_boost = -0.10  # Mismatch → lower confidence
    else:
        confidence_boost = 0.0
    
    debris_info = DEBRIS_CLASSES.get(class_id, DEBRIS_CLASSES[6])
    
    return {
        "class_id": class_id,
        "class_label": debris_info["label"],
        "description": debris_info["description"],
        "threat_level": debris_info["threat"],
        "confidence_adjustment": confidence_boost
    }


def run_mensuration_pipeline(
    detections: List[Dict],
    towfish_altitude_m: float = TOWFISH_ALTITUDE_M,
    pixel_resolution_m: float = PIXEL_RESOLUTION_M
) -> List[Dict]:
    """
    Run the complete mensuration pipeline on all detections.
    
    For each detection:
      1. Calculate target height from shadow length
      2. Calculate target width/length from highlight bbox
      3. Refine classification using dimensions
      4. Package results for GeoJSON output
    
    Args:
        detections:         List of detections from the YOLO pipeline
        towfish_altitude_m: Towfish altitude (meters)
        pixel_resolution_m: Pixel resolution (meters/pixel)
    
    Returns:
        List of enriched detection dictionaries with physical measurements
    """
    enriched = []
    
    for det in detections:
        # ── Step 1: Calculate target height ──
        h_target = calculate_target_height(
            shadow_length_px=det["shadow_length_px"],
            slant_range_m=det["slant_range_m"],
            towfish_altitude_m=towfish_altitude_m,
            pixel_resolution_m=pixel_resolution_m
        )
        
        # ── Step 2: Calculate width and length ──
        dims = calculate_target_dimensions(
            highlight_bbox=det["highlight_bbox"],
            pixel_resolution_m=pixel_resolution_m
        )
        
        # ── Step 3: Refine classification ──
        classification = classify_debris_by_dimensions(
            width_m=dims["width_m"],
            length_m=dims["length_m"],
            height_m=h_target,
            class_id=det["class_id"]
        )
        
        # ── Step 4: Minimum Volumetric Bounding (MVB) 3D Box ──
        from app.inference.mvb import calculate_mvb_3d
        mvb_data = calculate_mvb_3d(
            highlight_bbox=det["highlight_bbox"],
            target_height_m=h_target,
            pixel_resolution_m=pixel_resolution_m,
            orientation_deg=round(float(det.get("orientation_deg", 0.0)), 1)
        )
        
        enriched.append({
            **det,
            "h_target_m": h_target,
            "dimensions": {
                "width_m": dims["width_m"],
                "length_m": dims["length_m"],
                "height_m": h_target,
            },
            "mvb": mvb_data,
            "classification": {
                "class_id": classification["class_id"],
                "class_label": classification["class_label"],
                "description": classification["description"],
                "threat_level": classification["threat_level"],
            },
            "confidence": round(det.get("confidence", 0.9), 2),
            "mensuration_method": "shadow_height_formula_and_mvb_3d",
            "formula": "H_target = (L_shadow × H_towfish) / R_slant | V_mvb = L × W × H",
            "parameters": {
                "L_shadow_px": det["shadow_length_px"],
                "L_shadow_m": round(det["shadow_length_px"] * pixel_resolution_m, 3),
                "H_towfish_m": towfish_altitude_m,
                "R_slant_m": det["slant_range_m"],
                "volume_m3": mvb_data["volume_m3"],
                "footprint_area_m2": mvb_data["footprint_area_m2"],
            }
        })
    
    return enriched

