"""
SIH26057 — Slant-to-Ground Range Correction
============================================

Raw side-scan sonar data is collected in SLANT RANGE — the direct line-of-sight
distance from the towfish transducer to the seabed. This produces two artifacts:

  1. NADIR BLIND ZONE: The first returns come from directly below the towfish
     (the "water column"). This zone contains no useful seabed data and must
     be removed.

  2. GEOMETRIC DISTORTION: Objects at the same horizontal distance but different
     depths appear at different positions in the raw sonar image. Close-range
     returns are compressed, far-range returns are stretched.

The correction uses the Pythagorean theorem assuming a flat seabed:

    R_ground = sqrt(R_slant² − H_towfish²)

Where:
    R_slant    = Direct distance from transducer to seabed point (meters)
    H_towfish  = Altitude of towfish above the seabed (meters)
    R_ground   = True horizontal distance across the seabed (meters)

IMPORTANT: This formula is valid ONLY for R_slant ≥ H_towfish.
For R_slant < H_towfish, the return is from the WATER COLUMN (no seabed echo),
and these samples are discarded — this is the nadir removal step.

REFERENCE:
    Blondel, Ph. "The Handbook of Sidescan Sonar," Springer, 2009, Ch. 4.
"""

import numpy as np
import cv2
from typing import Tuple


def compute_ground_range_lut(
    num_samples: int,
    slant_range_max_m: float,
    towfish_altitude_m: float
) -> Tuple[np.ndarray, np.ndarray, int]:
    """
    Build a lookup table (LUT) mapping slant-range pixel indices to
    ground-range pixel indices for a single sonar channel.
    
    This LUT is precomputed once per survey configuration and applied
    to every ping line, making the correction O(N) per row.
    
    Args:
        num_samples:       Number of samples (pixels) per channel per ping
        slant_range_max_m: Maximum slant range for this channel (meters)
        towfish_altitude_m: Towfish altitude above seabed (meters)
    
    Returns:
        Tuple of:
          - ground_range_indices: Array mapping each valid slant-range pixel
                                 to its corrected ground-range pixel index
          - valid_mask:           Boolean mask — True for samples that are
                                 seabed returns (not water column)
          - nadir_cutoff:        First valid sample index (end of water column)
    
    PHYSICS NOTE:
        The nadir cutoff index corresponds to the first slant-range sample
        where R_slant ≥ H_towfish. Below this threshold, the acoustic pulse
        hasn't yet reached the seabed — it's still traversing the water column.
    """
    # Create slant range array: each pixel maps to a physical distance
    # Pixel 0 = 0 m (towfish location), Pixel N = slant_range_max_m
    slant_range_m = np.linspace(0, slant_range_max_m, num_samples)
    
    # ── Identify valid seabed returns ──
    # Only samples where R_slant ≥ H_towfish have physically meaningful
    # ground-range projections. The rest are the "water column" / nadir zone.
    valid_mask = slant_range_m >= towfish_altitude_m
    nadir_cutoff = np.argmax(valid_mask)  # First True index
    
    # ── Apply the correction formula: R_ground = sqrt(R_slant² − H²) ──
    ground_range_m = np.zeros_like(slant_range_m)
    ground_range_m[valid_mask] = np.sqrt(
        slant_range_m[valid_mask] ** 2 - towfish_altitude_m ** 2
    )
    
    # ── Compute the maximum ground range for scaling ──
    ground_range_max_m = np.sqrt(slant_range_max_m ** 2 - towfish_altitude_m ** 2)
    
    # ── Map ground-range meters to pixel indices ──
    # The output image has the same number of pixels as valid input samples
    num_valid = np.sum(valid_mask)
    ground_range_indices = (
        ground_range_m[valid_mask] / ground_range_max_m * (num_valid - 1)
    ).astype(np.int32)
    
    return ground_range_indices, valid_mask, int(nadir_cutoff)


def slant_to_ground_range_correction(
    waterfall_image: np.ndarray,
    towfish_altitude_m: float,
    slant_range_max_m: float,
    dual_channel: bool = True
) -> np.ndarray:
    """
    Apply slant-to-ground range correction to a sonar waterfall image.
    
    This geometrically projects the raw slant-range data onto a flat seabed
    plane, removing the nadir blind zone and correcting the non-linear
    spatial distortion inherent in side-scan sonar geometry.
    
    The corrected image has uniform pixel spacing in ground-range, making
    it suitable for:
      - Accurate target mensuration (measuring physical dimensions)
      - Shadow length measurement for target height calculation
      - GIS overlay and georeferencing
    
    Args:
        waterfall_image:   Raw sonar waterfall (grayscale, H×W)
                           For dual-channel: left half = port, right half = starboard
        towfish_altitude_m: Towfish altitude above seabed (meters)
        slant_range_max_m:  Maximum slant range per channel (meters)
        dual_channel:       If True, process port and starboard channels independently
    
    Returns:
        Ground-range corrected waterfall image (same height, adjusted width)
    """
    h, w = waterfall_image.shape[:2]
    
    if dual_channel:
        # ── Split into port (left) and starboard (right) channels ──
        mid = w // 2
        port_channel = waterfall_image[:, :mid]  # Port: indices go right-to-left (far→near)
        stbd_channel = waterfall_image[:, mid:]   # Starboard: left-to-right (near→far)
        
        # Port channel is typically stored in reverse (far range on the left)
        # Flip to make it near→far for consistent processing
        port_channel = np.fliplr(port_channel)
        
        # Process each channel independently
        port_corrected = _correct_single_channel(
            port_channel, towfish_altitude_m, slant_range_max_m
        )
        stbd_corrected = _correct_single_channel(
            stbd_channel, towfish_altitude_m, slant_range_max_m
        )
        
        # Recombine: flip port back to its original orientation
        port_corrected = np.fliplr(port_corrected)
        
        # Ensure both channels have equal width for clean display
        min_width = min(port_corrected.shape[1], stbd_corrected.shape[1])
        corrected = np.hstack([
            port_corrected[:, -min_width:],
            stbd_corrected[:, :min_width]
        ])
    else:
        corrected = _correct_single_channel(
            waterfall_image, towfish_altitude_m, slant_range_max_m
        )
    
    # Normalize dimensions to match original input image for 1:1 canvas overlay alignment
    if corrected.shape != (h, w):
        corrected = cv2.resize(corrected, (w, h), interpolation=cv2.INTER_LINEAR)

    return corrected


def _correct_single_channel(
    channel: np.ndarray,
    towfish_altitude_m: float,
    slant_range_max_m: float
) -> np.ndarray:
    """
    Internal: Apply ground-range correction to a single sonar channel.
    
    Uses precomputed LUT for efficient resampling. Each row (ping) is
    resampled independently because the correction depends only on the
    cross-track geometry, not on along-track position.
    """
    h, w = channel.shape[:2]
    
    # Build the slant→ground range lookup table
    ground_indices, valid_mask, nadir_cutoff = compute_ground_range_lut(
        num_samples=w,
        slant_range_max_m=slant_range_max_m,
        towfish_altitude_m=towfish_altitude_m
    )
    
    # Output width = number of valid ground-range bins
    output_width = np.sum(valid_mask)
    corrected = np.zeros((h, output_width), dtype=channel.dtype)
    
    # ── Resample each ping row using the LUT ──
    # For each valid slant-range sample, copy its intensity to the
    # corresponding ground-range bin. This is a nearest-neighbor resample.
    valid_samples = channel[:, valid_mask]
    
    for row in range(h):
        # Place each valid pixel at its ground-range corrected position
        corrected[row, ground_indices] = valid_samples[row]
    
    # ── Optional: Interpolate gaps from the non-linear resampling ──
    # Ground-range indices can have gaps (especially near nadir).
    # Fill these using linear interpolation along each row.
    for row in range(h):
        row_data = corrected[row].astype(np.float64)
        nonzero = row_data > 0
        if np.sum(nonzero) > 2:
            indices = np.arange(output_width)
            row_data = np.interp(indices, indices[nonzero], row_data[nonzero])
            corrected[row] = row_data.astype(channel.dtype)
    
    return corrected
