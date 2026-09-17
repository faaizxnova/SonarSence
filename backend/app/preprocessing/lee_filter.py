"""
SIH26057 — Adaptive Lee Filter for Speckle Noise Suppression
=============================================================

Side-scan sonar imagery suffers from multiplicative speckle noise caused by
coherent interference of backscattered acoustic waves from the rough seabed.
The Adaptive Lee Filter (Lee, 1980) is the standard technique for suppressing
this noise while preserving target edges — critical for detecting debris
highlights and their associated acoustic shadows.

PHYSICS RATIONALE:
    In a side-scan sonar image, a target on the seabed produces:
      1. A BRIGHT specular highlight (strong backscatter from the target face)
      2. A DARK acoustic shadow (no returns behind the target)
    
    A naive low-pass filter would blur these features, destroying the
    highlight-shadow pair that is the primary detection signature.
    The Lee filter's adaptive weighting preserves these high-contrast edges
    by applying minimal smoothing in heterogeneous (high-variance) regions.

ALGORITHM:
    For each pixel I(x,y) in a sliding window of size W×W:
    
    1. Compute local mean:      μ_L = mean(window)
    2. Compute local variance:  σ²_L = var(window)
    3. Estimate noise variance:  σ²_n (from homogeneous region or global CoV)
    4. Adaptive weight:         K = σ²_L / (σ²_L + σ²_n)
       - Homogeneous region:   σ²_L ≈ σ²_n → K ≈ 0 → output ≈ μ_L (smoothed)
       - Edge / target region: σ²_L >> σ²_n → K ≈ 1 → output ≈ I(x,y) (preserved)
    5. Filtered pixel:          Î(x,y) = μ_L + K · (I(x,y) − μ_L)

REFERENCE:
    J.S. Lee, "Digital Image Enhancement and Noise Filtering by Use of
    Local Statistics," IEEE TPAMI, vol. 2, no. 2, pp. 165-168, 1980.
"""

import numpy as np
import cv2
from typing import Optional, Tuple


def estimate_noise_variance(image: np.ndarray, method: str = "cov") -> float:
    """
    Estimate the variance of multiplicative speckle noise in the sonar image.
    
    For multiplicative noise, the coefficient of variation (CoV = σ/μ) in a
    homogeneous region is approximately equal to 1/sqrt(N_looks), where
    N_looks is the number of independent looks in the sonar system.
    
    Args:
        image:  Input sonar image (float64, intensity values)
        method: Estimation method — "cov" uses the global coefficient of
                variation; "patch" uses a manually selected homogeneous patch.
    
    Returns:
        Estimated noise variance (σ²_n)
    """
    if method == "cov":
        # Global CoV-based estimation (assumes the image is mostly seabed)
        # σ²_n ≈ (σ_global / μ_global)² × μ_local² — for multiplicative noise
        # Simplified: we use the global variance as the noise floor
        global_mean = np.mean(image)
        global_var = np.var(image)
        # The noise variance in the Lee model (additive form after log-transform
        # or direct intensity domain) is approximated as:
        noise_var = global_var * 0.25  # Conservative: assume 25% of total variance is noise
        return max(noise_var, 1e-10)  # Avoid division by zero
    
    elif method == "patch":
        # Use the top-left 64×64 patch as a "homogeneous seabed" reference
        h, w = image.shape[:2]
        patch_size = min(64, h // 4, w // 4)
        patch = image[:patch_size, :patch_size]
        return max(np.var(patch), 1e-10)
    
    else:
        raise ValueError(f"Unknown noise estimation method: {method}")


def adaptive_lee_filter(
    image: np.ndarray,
    window_size: int = 7,
    noise_var: Optional[float] = None,
    noise_method: str = "cov"
) -> np.ndarray:
    """
    Apply the Adaptive Lee Filter to suppress speckle noise while preserving
    target edges (highlights and shadows) in side-scan sonar imagery.
    
    This is the core preprocessing step before any detection algorithm runs.
    Without despeckling, the YOLO detector would produce excessive false
    positives from noise-induced bright spots.
    
    Args:
        image:       Input sonar waterfall image (grayscale, uint8 or float)
        window_size: Size of the sliding window (must be odd, typically 5-9)
        noise_var:   Known noise variance. If None, auto-estimated from image.
        noise_method: Method for noise estimation if noise_var is None.
    
    Returns:
        Filtered image (same dtype as input)
    
    ACOUSTIC PHYSICS NOTE:
        The window size should be chosen relative to the sonar's across-track
        resolution. For a 600 kHz system with ~0.15 m/px resolution:
        - 7×7 window ≈ 1.05 m × 1.05 m ground coverage
        - This smooths features < 1 m (noise speckle) while preserving
          debris targets typically > 0.3 m in their highlight signature.
    """
    # Validate window size
    if window_size % 2 == 0:
        raise ValueError(f"Window size must be odd, got {window_size}")
    
    # Convert to float64 for precision in statistical calculations
    original_dtype = image.dtype
    img_float = image.astype(np.float64)
    
    # ── Step 1: Estimate noise variance if not provided ──
    if noise_var is None:
        noise_var = estimate_noise_variance(img_float, method=noise_method)
    
    # ── Step 2: Compute local statistics using uniform box filter ──
    # cv2.blur computes the local mean efficiently via integral images
    # This is O(1) per pixel regardless of window size — critical for
    # real-time processing on AUV embedded systems.
    half_w = window_size // 2
    
    # Local mean: μ_L(x,y) = (1/W²) Σ I(i,j) over the window
    local_mean = cv2.blur(img_float, (window_size, window_size))
    
    # Local mean of squares: E[I²] over the window
    local_mean_sq = cv2.blur(img_float ** 2, (window_size, window_size))
    
    # Local variance: σ²_L = E[I²] − (E[I])² (by the variance formula)
    local_var = local_mean_sq - local_mean ** 2
    # Clamp to zero (numerical precision can produce tiny negatives)
    local_var = np.maximum(local_var, 0.0)
    
    # ── Step 3: Compute adaptive weighting factor K ──
    # K = σ²_L / (σ²_L + σ²_n)
    # - When σ²_L ≈ σ²_n (homogeneous seabed): K → 0.5 → heavy smoothing
    # - When σ²_L >> σ²_n (target edge):       K → 1.0 → preserve original
    # - When σ²_L << σ²_n (deep shadow):       K → 0.0 → replace with mean
    K = local_var / (local_var + noise_var)
    
    # ── Step 4: Apply the Lee filter equation ──
    # Î(x,y) = μ_L + K · (I(x,y) − μ_L)
    # This is a weighted blend between the local mean and the original pixel.
    filtered = local_mean + K * (img_float - local_mean)
    
    # ── Step 5: Clamp and convert back to original dtype ──
    if original_dtype == np.uint8:
        filtered = np.clip(filtered, 0, 255).astype(np.uint8)
    else:
        filtered = filtered.astype(original_dtype)
    
    return filtered


def apply_enhanced_lee_filter(
    image: np.ndarray,
    window_size: int = 7,
    damping_factor: float = 1.0,
    noise_var: Optional[float] = None
) -> np.ndarray:
    """
    Enhanced Lee Filter with three-region classification.
    
    Extends the standard Lee filter by classifying each pixel neighborhood
    into one of three regions for more aggressive speckle suppression:
    
    1. HOMOGENEOUS (CoV < Cu):  Replace with local mean (full smoothing)
    2. HETEROGENEOUS (Cu ≤ CoV ≤ Cmax): Apply weighted Lee filter
    3. POINT TARGET (CoV > Cmax): Preserve original (no smoothing)
    
    This is particularly useful for side-scan sonar where point scatterers
    (rocks, small debris) should be fully preserved while sand ripples
    and mud textures should be smoothed.
    
    Args:
        image:          Input sonar image (grayscale)
        window_size:    Sliding window size (odd)
        damping_factor: Controls the transition between regions (1.0 = standard)
        noise_var:      Known noise variance (None = auto-estimate)
    
    Returns:
        Enhanced-Lee filtered image
    """
    original_dtype = image.dtype
    img_float = image.astype(np.float64)
    
    if noise_var is None:
        noise_var = estimate_noise_variance(img_float)
    
    local_mean = cv2.blur(img_float, (window_size, window_size))
    local_mean_sq = cv2.blur(img_float ** 2, (window_size, window_size))
    local_var = np.maximum(local_mean_sq - local_mean ** 2, 0.0)
    
    # Coefficient of variation thresholds
    # Cu: lower bound (below this = homogeneous)
    # Cmax: upper bound (above this = point target)
    global_mean = np.mean(img_float)
    Cu = np.sqrt(noise_var) / max(global_mean, 1e-10)  # Noise-only CoV
    Cmax = np.sqrt(2.0) * Cu  # Empirical upper bound
    
    # Local coefficient of variation
    local_std = np.sqrt(local_var)
    local_cov = local_std / np.maximum(local_mean, 1e-10)
    
    # Region classification
    filtered = np.copy(img_float)
    
    # Region 1: Homogeneous — full smoothing
    mask_homo = local_cov < Cu
    filtered[mask_homo] = local_mean[mask_homo]
    
    # Region 2: Heterogeneous — weighted Lee filter
    mask_hetero = (local_cov >= Cu) & (local_cov <= Cmax)
    K_hetero = np.exp(
        -damping_factor * (Cmax - local_cov[mask_hetero]) / 
        np.maximum(local_cov[mask_hetero] - Cu, 1e-10)
    )
    K_hetero = np.clip(K_hetero, 0.0, 1.0)
    filtered[mask_hetero] = (
        local_mean[mask_hetero] + 
        K_hetero * (img_float[mask_hetero] - local_mean[mask_hetero])
    )
    
    # Region 3: Point target — preserve original (no change needed)
    # filtered[mask_point] = img_float[mask_point]  (already copied)
    
    if original_dtype == np.uint8:
        filtered = np.clip(filtered, 0, 255).astype(np.uint8)
    else:
        filtered = filtered.astype(original_dtype)
    
    return filtered
