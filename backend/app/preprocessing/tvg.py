"""
SIH26057 — Time-Varying Gain (TVG) Radiometric Correction
==========================================================

Side-scan sonar acoustic backscatter suffers from severe geometric
attenuation as sound propagates through water:
  1. Spherical Spreading Loss: 20 * log10(R) for two-way transmission
  2. Absorption Loss: 2 * alpha * R (alpha is acoustic absorption coefficient in dB/km)

Without TVG correction, near-range acoustic data (close to nadir) is
severely overexposed/saturated while far-range acoustic returns fade into
background noise.

FORMULA:
  G(R) = 20 * log10(R + epsilon) + 2 * alpha * R + G0

Where:
  - R: Slant range in meters from towfish transducer
  - alpha: Absorption coefficient (typically ~0.05 dB/m at 600 kHz in seawater)
  - G0: Baseline calibration offset
"""

import cv2
import numpy as np
from typing import Tuple


def apply_time_varying_gain(
    image: np.ndarray,
    slant_range_max_m: float = 75.0,
    frequency_khz: float = 600.0,
    towfish_altitude_m: float = 8.0,
    dual_channel: bool = True,
    alpha_db_per_m: float = 0.05,
    gain_scale: float = 1.0
) -> np.ndarray:
    """
    Apply dual-channel Time-Varying Gain (TVG) normalization across the swath.
    
    Args:
        image: Grayscale sonar image (H x W), values 0..255 or float
        slant_range_max_m: Maximum slant range per channel (meters)
        frequency_khz: Sonar operating acoustic frequency (kHz)
        towfish_altitude_m: Towfish altitude above seafloor (meters)
        dual_channel: If True, center column is nadir line (Port left, Stbd right)
        alpha_db_per_m: Seawater absorption attenuation (dB/m)
        gain_scale: Multiplier for user-controlled compensation intensity
        
    Returns:
        TVG-corrected image (uint8, 0..255)
    """
    if len(image.shape) == 3:
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    else:
        gray = image.copy()
        
    h, w = gray.shape
    img_float = gray.astype(np.float32)
    
    # Calculate range vector per column
    if dual_channel:
        center_x = w / 2.0
        # Distance in pixels from center
        cols = np.arange(w, dtype=np.float32)
        dist_px = np.abs(cols - center_x)
        max_px = center_x
        # Convert pixel distance to meters
        range_m = np.sqrt(towfish_altitude_m**2 + (dist_px / max_px * slant_range_max_m)**2)
    else:
        cols = np.arange(w, dtype=np.float32)
        range_m = np.sqrt(towfish_altitude_m**2 + (cols / float(w) * slant_range_max_m)**2)
        
    # Calculate TVG gain curve (dB)
    # Transmission loss TL = 20 * log10(R) + 2 * alpha * R
    epsilon = 1e-3
    tl_db = 20.0 * np.log10(range_m + epsilon) + (2.0 * alpha_db_per_m * range_m)
    
    # Normalize gain curve between 0.6 and 2.4
    min_tl = np.min(tl_db)
    max_tl = np.max(tl_db)
    normalized_gain = 1.0 + gain_scale * ((tl_db - min_tl) / (max_tl - min_tl + epsilon) - 0.5)
    
    # Apply column-wise gain matrix
    gain_matrix = np.tile(normalized_gain, (h, 1))
    corrected = img_float * gain_matrix
    
    # Contrast stretch and normalize
    p2, p98 = np.percentile(corrected, (1.0, 99.0))
    if p98 > p2:
        corrected = (corrected - p2) / (p98 - p2) * 255.0
    
    return np.clip(corrected, 0, 255).astype(np.uint8)
