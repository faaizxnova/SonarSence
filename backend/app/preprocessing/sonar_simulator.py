"""
SIH26057 — Synthetic Side-Scan Sonar Waterfall Generator
=========================================================

Since real .XTF (eXtended Triton Format) sonar data requires a licensed
sonar system, this module generates PHYSICALLY REALISTIC synthetic
sonar waterfall images for demonstration and testing.

The synthetic data models the following acoustic phenomena:

  1. SEABED TEXTURE:  Fractal Brownian motion (fBm) background simulating
                      sand ripples and sediment variation.
  
  2. SPECULAR HIGHLIGHTS: Bright blobs where debris targets produce strong
                          backscatter. Intensity follows the Lambert
                          cosine law approximation.
  
  3. ACOUSTIC SHADOWS: Dark zones trailing behind each target, caused by
                       the target blocking the sonar beam. Shadow length
                       is proportional to target height and inversely
                       proportional to incidence angle.
  
  4. MULTIPLICATIVE SPECKLE NOISE: Rayleigh-distributed noise characteristic
                                    of coherent imaging systems.

The generated imagery is designed to closely mimic real 600 kHz side-scan
sonar output so the preprocessing and detection pipeline can be validated.
"""

import numpy as np
import cv2
from typing import List, Dict, Tuple, Optional
from app.config import (
    WATERFALL_WIDTH_PX, WATERFALL_HEIGHT_PX,
    TOWFISH_ALTITUDE_M, SLANT_RANGE_MAX_M,
    PIXEL_RESOLUTION_M, RANDOM_SEED, DEBRIS_CLASSES
)


def generate_seabed_texture(
    height: int,
    width: int,
    rng: np.random.Generator,
    base_intensity: int = 120,
    texture_strength: float = 30.0
) -> np.ndarray:
    """
    Generate a realistic seabed background texture using multi-octave
    Perlin-like noise (fractal Brownian motion approximation).
    
    The seabed in side-scan sonar imagery appears as a textured grayscale
    surface with intensity variations caused by:
      - Sediment grain size (fine sand = smooth, gravel = rough)
      - Micro-topography (ripples, scour marks)
      - Beam pattern fall-off (decreasing intensity at far range)
    
    Args:
        height:           Image height (along-track pings)
        width:            Image width (cross-track samples)
        rng:              Numpy random generator for reproducibility
        base_intensity:   Mean seabed backscatter level (0-255)
        texture_strength: Amplitude of texture variation
    
    Returns:
        Seabed texture image (uint8)
    """
    texture = np.zeros((height, width), dtype=np.float64)
    
    # Multi-octave noise for natural-looking texture
    for octave in range(4):
        freq = 2 ** octave
        amplitude = texture_strength / (2 ** octave)
        noise = rng.normal(0, 1, (height // freq + 1, width // freq + 1))
        # Upsample with bilinear interpolation
        noise_upsampled = cv2.resize(
            noise.astype(np.float32), (width, height),
            interpolation=cv2.INTER_LINEAR
        )
        texture += amplitude * noise_upsampled
    
    # Add base intensity
    texture += base_intensity
    
    # ── Apply beam pattern fall-off ──
    # Sonar returns weaken with range (spreading loss + absorption)
    # This creates the characteristic brightness gradient across-track
    range_axis = np.linspace(0.3, 1.0, width)
    # Apply a ~1/R² intensity decay (simplified sonar equation)
    beam_pattern = np.tile(range_axis, (height, 1))
    texture *= beam_pattern
    
    return np.clip(texture, 0, 255).astype(np.uint8)


def embed_debris_targets(
    image: np.ndarray,
    rng: np.random.Generator,
    num_targets: int = 4,
    towfish_alt_m: float = TOWFISH_ALTITUDE_M,
    slant_range_max_m: float = SLANT_RANGE_MAX_M,
    pixel_res_m: float = PIXEL_RESOLUTION_M
) -> Tuple[np.ndarray, List[Dict]]:
    """
    Embed synthetic debris targets with physically correct highlight-shadow pairs.
    
    ACOUSTIC PHYSICS:
        When the sonar beam hits a raised object on the seabed:
        
        1. The FRONT FACE facing the towfish produces a strong specular return
           (HIGHLIGHT) — appears as a bright region in the image.
        
        2. The area BEHIND the object receives no acoustic energy because the
           object blocks the beam — this creates an ACOUSTIC SHADOW (dark zone).
        
        The shadow length depends on:
          - Target height (H_target)
          - Towfish altitude (H_towfish)
          - Slant range to the target (R_slant)
        
        Formula: L_shadow = H_target × R_slant / H_towfish
        (Rearranged from: H_target = L_shadow × H_towfish / R_slant)
    
    Args:
        image:            Background seabed texture to embed targets in
        rng:              Random generator
        num_targets:      Number of debris targets to embed
        towfish_alt_m:    Towfish altitude (meters)
        slant_range_max_m: Max slant range (meters)
        pixel_res_m:      Pixel resolution (meters/pixel)
    
    Returns:
        Tuple of (image_with_targets, target_metadata_list)
    """
    h, w = image.shape[:2]
    result = image.copy().astype(np.float64)
    targets = []
    
    # Define debris target prototypes (realistic dimensions in meters)
    debris_prototypes = [
        {"class_id": 0, "width_m": 3.5,  "length_m": 5.0,  "height_m": 0.4},  # Ghost net
        {"class_id": 1, "width_m": 0.7,  "length_m": 0.7,  "height_m": 0.6},  # Tire
        {"class_id": 2, "width_m": 0.6,  "length_m": 0.9,  "height_m": 0.8},  # Drum
        {"class_id": 3, "width_m": 0.3,  "length_m": 4.0,  "height_m": 0.3},  # Pipe
        {"class_id": 4, "width_m": 1.2,  "length_m": 1.0,  "height_m": 0.15}, # Pallet
        {"class_id": 5, "width_m": 0.4,  "length_m": 3.0,  "height_m": 0.35}, # Anchor chain
    ]
    
    for i in range(num_targets):
        # Select a random debris prototype
        proto = debris_prototypes[rng.integers(0, len(debris_prototypes))]
        
        # Random position (avoid edges and nadir zone)
        margin_x = int(15 / pixel_res_m)  # 15m from edge
        margin_y = int(5 / pixel_res_m)
        cx = rng.integers(margin_x, w - margin_x)
        cy = rng.integers(margin_y, h - margin_y)
        
        # Convert physical dimensions to pixels
        target_width_px = max(int(proto["width_m"] / pixel_res_m), 3)
        target_length_px = max(int(proto["length_m"] / pixel_res_m), 3)
        target_height_m = proto["height_m"]
        
        # ── Compute the slant range at this cross-track position ──
        # Pixel position maps linearly to slant range
        half_w = w // 2
        range_fraction = abs(cx - half_w) / half_w
        slant_range_at_target = towfish_alt_m + range_fraction * (slant_range_max_m - towfish_alt_m)
        
        # ── Compute shadow length using sonar geometry ──
        # L_shadow = H_target × R_slant / H_towfish
        shadow_length_m = target_height_m * slant_range_at_target / towfish_alt_m
        shadow_length_px = max(int(shadow_length_m / pixel_res_m), 2)
        
        # Shadow direction: always extends AWAY from the nadir (towfish track)
        # Port channel: shadow extends left; Starboard: shadow extends right
        shadow_direction = 1 if cx >= half_w else -1
        
        # ── Draw the HIGHLIGHT (bright specular return) ──
        hl_x1 = max(cx - target_width_px // 2, 0)
        hl_x2 = min(cx + target_width_px // 2, w - 1)
        hl_y1 = max(cy - target_length_px // 2, 0)
        hl_y2 = min(cy + target_length_px // 2, h - 1)
        
        # Highlight intensity: strong backscatter (220-255)
        highlight_intensity = rng.integers(210, 255)
        # Use a Gaussian blob for realistic highlight shape
        for py in range(hl_y1, hl_y2 + 1):
            for px in range(hl_x1, hl_x2 + 1):
                # Gaussian fall-off from center
                dx = (px - cx) / max(target_width_px / 2, 1)
                dy = (py - cy) / max(target_length_px / 2, 1)
                intensity = highlight_intensity * np.exp(-0.5 * (dx**2 + dy**2))
                result[py, px] = max(result[py, px], intensity)
        
        # ── Draw the ACOUSTIC SHADOW (dark zone behind target) ──
        if shadow_direction > 0:
            sh_x1 = hl_x2 + 1
            sh_x2 = min(hl_x2 + shadow_length_px, w - 1)
        else:
            sh_x2 = hl_x1 - 1
            sh_x1 = max(hl_x1 - shadow_length_px, 0)
        
        sh_y1 = hl_y1
        sh_y2 = hl_y2
        
        # Shadow intensity: near-zero (acoustic void)
        shadow_intensity = rng.integers(5, 25)
        if sh_x1 < sh_x2 and sh_y1 < sh_y2:
            result[sh_y1:sh_y2 + 1, sh_x1:sh_x2 + 1] = shadow_intensity
        
        # ── Store target metadata ──
        targets.append({
            "target_id": i,
            "class_id": proto["class_id"],
            "class_label": DEBRIS_CLASSES[proto["class_id"]]["label"],
            "threat_level": DEBRIS_CLASSES[proto["class_id"]]["threat"],
            "center_px": (cx, cy),
            "highlight_bbox": (hl_x1, hl_y1, hl_x2, hl_y2),
            "shadow_bbox": (sh_x1, sh_y1, sh_x2, sh_y2),
            "shadow_direction": shadow_direction,
            "target_height_m": target_height_m,
            "target_width_m": proto["width_m"],
            "target_length_m": proto["length_m"],
            "shadow_length_px": shadow_length_px,
            "shadow_length_m": shadow_length_m,
            "slant_range_m": slant_range_at_target,
            "confidence": round(float(rng.uniform(0.82, 0.98)), 2),
        })
    
    return np.clip(result, 0, 255).astype(np.uint8), targets


def apply_speckle_noise(
    image: np.ndarray,
    rng: np.random.Generator,
    noise_level: float = 0.3
) -> np.ndarray:
    """
    Apply multiplicative speckle noise to simulate coherent sonar imaging.
    
    PHYSICS:
        Speckle noise in sonar/SAR imagery is MULTIPLICATIVE, not additive.
        It arises from constructive/destructive interference of acoustic
        wavelets scattered by the rough seabed surface.
        
        The noisy image model: I_noisy = I_clean × N
        where N follows a Rayleigh distribution (for single-look data).
    
    Args:
        image:       Clean sonar image
        rng:         Random generator
        noise_level: Standard deviation of the noise multiplier
    
    Returns:
        Image with multiplicative speckle noise
    """
    img_float = image.astype(np.float64)
    
    # Generate Rayleigh-distributed multiplicative noise
    # Rayleigh(σ) has mean = σ√(π/2) ≈ 1.25σ, so normalize to unit mean
    noise = rng.rayleigh(scale=1.0, size=image.shape)
    noise = noise / np.mean(noise)  # Normalize so mean multiplier = 1.0
    
    # Blend: control the noise strength
    noise_multiplier = 1.0 + noise_level * (noise - 1.0)
    
    noisy = img_float * noise_multiplier
    return np.clip(noisy, 0, 255).astype(np.uint8)


def generate_synthetic_sonar_waterfall(
    width: int = WATERFALL_WIDTH_PX,
    height: int = WATERFALL_HEIGHT_PX,
    num_targets: int = 4,
    seed: Optional[int] = RANDOM_SEED,
    apply_noise: bool = True
) -> Tuple[np.ndarray, List[Dict]]:
    """
    Generate a complete synthetic sonar waterfall image with embedded debris
    targets, highlight-shadow pairs, and realistic speckle noise.
    
    This is the primary entry point for the simulation module.
    
    Returns:
        Tuple of:
          - Sonar waterfall image (uint8, H×W)
          - List of target metadata dictionaries
    """
    rng = np.random.default_rng(seed)
    
    # Step 1: Generate seabed texture background
    seabed = generate_seabed_texture(height, width, rng)
    
    # Step 2: Embed debris targets with highlight-shadow pairs
    with_targets, target_meta = embed_debris_targets(seabed, rng, num_targets)
    
    # Step 3: Apply multiplicative speckle noise
    if apply_noise:
        noisy = apply_speckle_noise(with_targets, rng, noise_level=0.3)
    else:
        noisy = with_targets
    
    return noisy, target_meta
