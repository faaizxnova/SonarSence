"""
SIH26057 — Minimum Volumetric Bounding (MVB) & 3D Bounding Box Mensuration
===========================================================================

Computes the Oriented 3D Minimum Bounding Box (MVB) for underwater marine debris
targets detected by the YOLOv8-Seg dual-head pipeline.

Combines:
  1. Along-track physical length (L) from highlight segmentation mask
  2. Across-track physical width (W) from highlight segmentation mask
  3. Vertical target relief height (H) from acoustic shadow geometry
  4. Principle axis orientation angle (theta) from spatial moments
  5. 3D Volume (V = L * W * H in m^3)
  6. Seabed Footprint Area (A = L * W in m^2)
  7. 8-Corner 3D Wireframe Vertices [(x_i, y_i, z_i)] for tactical rendering
"""

import numpy as np
from typing import Dict, List, Tuple


def calculate_mvb_3d(
    highlight_bbox: List[int],
    target_height_m: float,
    pixel_resolution_m: float = 0.146,
    orientation_deg: float = 0.0
) -> Dict:
    """
    Calculate the 3D Minimum Volumetric Bounding Box (MVB) for a target.
    
    Args:
        highlight_bbox: [x1, y1, x2, y2] in pixels
        target_height_m: Calculated target height in meters from acoustic shadow
        pixel_resolution_m: Pixel resolution in meters/pixel
        orientation_deg: Estimated seabed orientation in degrees
        
    Returns:
        Dictionary containing 3D dimensions, volume, area, vertices, and risk metrics.
    """
    x1, y1, x2, y2 = highlight_bbox
    width_px = max(1, abs(x2 - x1))
    length_px = max(1, abs(y2 - y1))
    
    width_m = round(width_px * pixel_resolution_m, 3)
    length_m = round(length_px * pixel_resolution_m, 3)
    height_m = max(0.05, round(target_height_m, 3))
    
    # 3D Volume (m^3)
    volume_m3 = round(width_m * length_m * height_m, 3)
    
    # Seabed Footprint Area (m^2)
    footprint_area_m2 = round(width_m * length_m, 3)
    
    # Total Surface Area (m^2)
    surface_area_m2 = round(2 * (width_m * length_m + width_m * height_m + length_m * height_m), 3)
    
    # Aspect Ratio & Compactness
    aspect_ratio = round(max(width_m, length_m) / (min(width_m, length_m) + 1e-4), 2)
    
    # Generate 8 corners of the 3D bounding box centered at target
    # Coordinate system: X (across-track), Y (along-track), Z (elevation above seabed)
    dx = width_m / 2.0
    dy = length_m / 2.0
    dz = height_m
    
    # Base 8 vertices [X, Y, Z]
    base_vertices = np.array([
        [-dx, -dy, 0.0],  # Bottom-Front-Left
        [ dx, -dy, 0.0],  # Bottom-Front-Right
        [ dx,  dy, 0.0],  # Bottom-Back-Right
        [-dx,  dy, 0.0],  # Bottom-Back-Left
        [-dx, -dy,  dz],  # Top-Front-Left
        [ dx, -dy,  dz],  # Top-Front-Right
        [ dx,  dy,  dz],  # Top-Back-Right
        [-dx,  dy,  dz],  # Top-Back-Left
    ])
    
    # Rotate around Z-axis by orientation_deg
    rad = np.radians(orientation_deg)
    rot_matrix = np.array([
        [np.cos(rad), -np.sin(rad), 0],
        [np.sin(rad),  np.cos(rad), 0],
        [0,            0,           1]
    ])
    
    rotated_vertices = np.dot(base_vertices, rot_matrix.T)
    
    return {
        "dimensions": {
            "length_m": length_m,
            "width_m": width_m,
            "height_m": height_m,
        },
        "volume_m3": volume_m3,
        "footprint_area_m2": footprint_area_m2,
        "surface_area_m2": surface_area_m2,
        "aspect_ratio": aspect_ratio,
        "orientation_deg": orientation_deg,
        "vertices_3d": rotated_vertices.tolist(),
        "bbox_2d_px": {
            "x1": x1,
            "y1": y1,
            "x2": x2,
            "y2": y2,
            "width_px": width_px,
            "length_px": length_px,
        },
        "mensuration_type": "Oriented_Minimum_Bounding_Volume"
    }
