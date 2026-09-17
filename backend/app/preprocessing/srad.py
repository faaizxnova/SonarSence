"""
SIH26057 — Speckle Reducing Anisotropic Diffusion (SRAD)
=========================================================

SRAD is an advanced PDE-based edge-preserving filter designed specifically
for multiplicative acoustic speckle noise in sonar and ultrasound imagery.

Unlike linear filters (Gaussian/Box) which blur target boundaries, SRAD
suppresses homogeneous speckle in seabed reverberation while preserving
sharp target highlight edges and acoustic shadow boundaries.

MATHEMATICAL FORMULATION (Yu & Acton, IEEE TIP 2002):
  ∂I/∂t = div( c(q) ∇I )

Where:
  - c(q) is the diffusion coefficient:
      c(q) = 1 / (1 + [q^2(x,y;t) - q0^2(t)] / [q0^2(t) * (1 + q0^2(t))])
  - q(x,y;t) is the instantaneous coefficient of variation:
      q(x,y;t) = sqrt( (1/2 * |∇I|^2 - 1/16 * (∇^2 I)^2) / (I + 1/4 * ∇^2 I)^2 )
  - q0(t) is the speckle scale factor estimated from homogeneous regions.
"""

import cv2
import numpy as np


def srad_filter(
    image: np.ndarray,
    num_iters: int = 5,
    lambda_param: float = 0.15,
    rect_homo: tuple = None
) -> np.ndarray:
    """
    Apply Speckle Reducing Anisotropic Diffusion (SRAD) to a sonar image.
    
    Args:
        image: Grayscale sonar image (H x W)
        num_iters: Number of diffusion iterations (typically 3..8 for real-time)
        lambda_param: Time step size (0 < lambda <= 0.25 for numerical stability)
        rect_homo: Optional (x, y, w, h) bounding box of homogeneous seabed region
        
    Returns:
        Denoised edge-preserved image (uint8, 0..255)
    """
    if len(image.shape) == 3:
        img = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    else:
        img = image.copy()
        
    I = img.astype(np.float32) + 1.0  # Prevent log/div by zero
    h, w = I.shape
    
    # Estimate initial speckle noise coefficient of variation q0
    if rect_homo is not None:
        rx, ry, rw, rh = rect_homo
        roi = I[ry:ry+rh, rx:rx+rw]
        q0 = np.std(roi) / (np.mean(roi) + 1e-5)
    else:
        # Auto-estimate from center-right homogeneous band
        roi = I[int(h*0.3):int(h*0.7), int(w*0.6):int(w*0.8)]
        q0 = np.std(roi) / (np.mean(roi) + 1e-5)
        
    q0 = max(0.05, min(q0, 0.8))
    
    for it in range(num_iters):
        # 1. Compute directional gradients (North, South, East, West)
        # Periodic / duplicate boundary padding
        In = np.roll(I, -1, axis=0) - I
        Is = np.roll(I, 1, axis=0) - I
        Ie = np.roll(I, -1, axis=1) - I
        Iw = np.roll(I, 1, axis=1) - I
        
        # 2. Normalized discrete gradient magnitude squared
        grad2 = (In**2 + Is**2 + Ie**2 + Iw**2) / (I**2 + 1e-5)
        
        # 3. Normalized Laplacian
        laplacian = (In + Is + Ie + Iw) / (I + 1e-5)
        
        # 4. Instantaneous coefficient of variation q(x,y)
        num_q = 0.5 * grad2 - (1.0 / 16.0) * (laplacian**2)
        den_q = (1.0 + 0.25 * laplacian)**2
        q2 = np.maximum(0.0, num_q / (den_q + 1e-5))
        
        # 5. Diffusion coefficient c(q)
        q0_iter = q0 * np.exp(-0.08 * it)
        q0_iter2 = q0_iter**2
        
        c_num = q2 - q0_iter2
        c_den = q0_iter2 * (1.0 + q0_iter2) + 1e-5
        c = 1.0 / (1.0 + np.maximum(0.0, c_num / c_den))
        
        # 6. Flux divergence update
        cn = np.roll(c, -1, axis=0)
        cs = np.roll(c, 1, axis=0)
        ce = np.roll(c, -1, axis=1)
        cw = np.roll(c, 1, axis=1)
        
        div = (cn * In + cs * Is + ce * Ie + cw * Iw)
        I = I + lambda_param * div
        I = np.maximum(1.0, I)
        
    # Scale back to uint8
    norm = cv2.normalize(I, None, 0, 255, cv2.NORM_MINMAX)
    return norm.astype(np.uint8)
