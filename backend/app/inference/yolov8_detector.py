"""
SIH26057 — Real YOLOv8 Inference Module
=========================================

This module handles real inference using the trained best.pt weights.
It is ONLY called when a user uploads a raw sonar image. All existing
preset scenarios continue to use the simulated pipeline in detector.py.

Model trained classes:
    {0: "ghost_net", 1: "shipwreck", 2: "mine_cylinder", 3: "submarine_pipeline"}

Pipeline:
    1. Receive preprocessed (TVG → SRAD → Lee → Slant-corrected) grayscale image
    2. Convert grayscale → 3-channel BGR for YOLO input compatibility
    3. CLAHE contrast enhancement for sonar-specific low-contrast images
    4. Run YOLOv8 detection inference at conf=0.25
    5. Parse bounding boxes from detections
    6. Estimate slant range from cross-track centroid position
    7. Estimate acoustic shadow length geometrically from bbox dimensions
    8. Return detections in exact same dict format as run_simulated_yolo_pipeline()
       so mensuration, MVB, GeoJSON, and all exports work unchanged
"""

import os
import cv2
import numpy as np
from typing import List, Dict, Optional
from app.config import (
    TOWFISH_ALTITUDE_M, SLANT_RANGE_MAX_M,
    WATERFALL_WIDTH_PX, WATERFALL_HEIGHT_PX,
    DEBRIS_CLASSES, PIXEL_RESOLUTION_M
)

# ─────────────────────────────────────────────────────────────
# Model Class ID → Existing DEBRIS_CLASSES mapping
# Maps the 4 trained model classes to the full 12-class taxonomy
# ─────────────────────────────────────────────────────────────
YOLO_CLASS_MAP = {
    0: {
        "debris_class_id": 0,
        "label": "ghost_net",
        "threat": "HIGH",
        "description": "Derelict fishing gear / mono-filament net cluster"
    },
    1: {
        "debris_class_id": 8,
        "label": "wooden_shipwreck",
        "threat": "MEDIUM",
        "description": "Sunken vessel hull & ribs (shipwreck)"
    },
    2: {
        "debris_class_id": 3,
        "label": "moored_sea_mine",
        "threat": "HIGH",
        "description": "Cylindrical mine / naval ordnance"
    },
    3: {
        "debris_class_id": 7,
        "label": "pipeline_trench_scour",
        "threat": "MEDIUM",
        "description": "Subsea transmission pipeline & scour trench"
    },
}

# Singleton model holder — loaded once on first upload, reused after
_yolo_model = None
_model_load_error: Optional[str] = None


def _get_weights_path() -> str:
    """Resolve path to best.pt from multiple possible locations."""
    candidates = [
        os.path.join(os.path.dirname(__file__), "..", "..", "best.pt"),     # backend/best.pt
        os.path.join(os.path.dirname(__file__), "..", "..", "..", "best.pt"),  # project root
        "best.pt",
        "../best.pt",
    ]
    for path in candidates:
        resolved = os.path.abspath(path)
        if os.path.isfile(resolved):
            return resolved
    raise FileNotFoundError(
        "best.pt not found. Place it in the backend/ folder (d:\\prototype\\backend\\best.pt)."
    )


def load_yolo_model():
    """
    Load the YOLOv8 model from best.pt once and cache globally.
    Raises an exception if weights are not found.
    """
    global _yolo_model, _model_load_error

    if _yolo_model is not None:
        return _yolo_model

    if _model_load_error:
        raise RuntimeError(_model_load_error)

    try:
        from ultralytics import YOLO
        weights_path = _get_weights_path()
        print(f"[SIH26057-YOLO] Loading real model weights from: {weights_path}")
        _yolo_model = YOLO(weights_path)
        print(f"[SIH26057-YOLO] Model loaded successfully — classes: {_yolo_model.names}")
        return _yolo_model
    except Exception as e:
        _model_load_error = str(e)
        raise RuntimeError(f"Failed to load YOLOv8 model: {e}")


def warmup_yolo_model() -> bool:
    """
    Load the weights and run one throwaway inference so the first real request
    does not pay for the model load plus lazy torch kernel initialisation.
    Returns False if the model is unavailable — callers fall back to the
    classical CV detector rather than failing the request.
    """
    try:
        model = load_yolo_model()
        dummy = np.zeros((WATERFALL_HEIGHT_PX, WATERFALL_WIDTH_PX, 3), dtype=np.uint8)
        model.predict(source=dummy, imgsz=WATERFALL_WIDTH_PX, verbose=False)
        print("[SIH26057-YOLO] Warmup inference complete — model ready.")
        return True
    except Exception as e:
        print(f"[SIH26057-YOLO] Warmup skipped: {e}")
        return False


def preprocess_for_yolo(grayscale_image: np.ndarray) -> np.ndarray:
    """
    Prepare the preprocessed sonar waterfall image for YOLOv8 input.

    The image arriving here has already passed through:
        TVG → SRAD Diffusion → Adaptive Lee Filter → Slant-to-Ground Correction

    Resolution is deliberately left untouched: the waterfall is a 2:1 strip, so
    forcing it into a square input squashes every target and loses the smaller
    ones. Ultralytics letterboxes internally and reports boxes back in this
    array's own coordinate space.

    Args:
        grayscale_image: Float or uint8 grayscale numpy array (H×W)

    Returns:
        3-channel uint8 BGR numpy array at the input's native resolution
    """
    # Ensure uint8
    if grayscale_image.dtype != np.uint8:
        img = cv2.normalize(grayscale_image, None, 0, 255, cv2.NORM_MINMAX)
        img = img.astype(np.uint8)
    else:
        img = grayscale_image.copy()

    # CLAHE: boost sonar target contrast, tile grid matched to waterfall scale
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    img_enhanced = clahe.apply(img)

    return cv2.cvtColor(img_enhanced, cv2.COLOR_GRAY2BGR)


def _estimate_shadow_length_px(
    bbox: List[int],
    image_width: int,
    channel: str
) -> int:
    """
    Geometrically estimate acoustic shadow length from detection bbox.

    For a detection model (no segmentation masks), we approximate the shadow
    using the bbox cross-track extent as a proxy. The shadow length is estimated
    as a fraction of the along-track height of the bounding box.

    This follows the typical sonar target morphology where shadow length
    is proportional to target along-track extent and slant range.

    Args:
        bbox:        [x1, y1, x2, y2] in original image pixels
        image_width: Full waterfall width in pixels
        channel:     "starboard" or "port"

    Returns:
        Estimated shadow length in pixels
    """
    x1, y1, x2, y2 = bbox
    # Along-track extent of the detection (vertical dimension)
    along_track_px = max(1, abs(y2 - y1))
    # Cross-track extent
    cross_track_px = max(1, abs(x2 - x1))

    # Shadow is typically 0.5–1.5× the along-track height of the target.
    # Use cross-track width × 0.65 as a balanced geometric estimate.
    estimated_shadow = max(8, int(cross_track_px * 0.65))

    # Clamp to reasonable range for sonar targets (8px to 80px)
    return max(8, min(80, estimated_shadow))


def _clamp_bbox(bbox: List[float], orig_w: int, orig_h: int) -> List[int]:
    """Clamp a [x1, y1, x2, y2] box to the waterfall image bounds."""
    x1 = int(bbox[0])
    y1 = int(bbox[1])
    x2 = int(bbox[2])
    y2 = int(bbox[3])

    x1 = max(0, min(x1, orig_w - 1))
    x2 = max(0, min(x2, orig_w - 1))
    y1 = max(0, min(y1, orig_h - 1))
    y2 = max(0, min(y2, orig_h - 1))

    return [x1, y1, x2, y2]


def run_real_yolo_pipeline(
    corrected_image: np.ndarray,
    conf_threshold: float = 0.15
) -> List[Dict]:
    """
    Run the real YOLOv8 best.pt model on a preprocessed sonar waterfall image.

    The output format is IDENTICAL to run_simulated_yolo_pipeline() so that
    run_mensuration_pipeline() and build_geojson_collection() work unchanged.

    Args:
        corrected_image:  Slant-corrected grayscale numpy array (H×W)
        conf_threshold:   Minimum confidence threshold for detections

    Returns:
        List of detection dicts compatible with the mensuration pipeline.
    """
    model = load_yolo_model()

    orig_h, orig_w = corrected_image.shape[:2]

    # Preprocess: CLAHE + 3-channel, native resolution
    yolo_input = preprocess_for_yolo(corrected_image)

    # ── Run YOLOv8 inference ──
    # imgsz matches the waterfall's long edge so the 2:1 strip is letterboxed
    # rather than squashed, and boxes come back in `yolo_input` coordinates.
    results = model.predict(
        source=yolo_input,
        imgsz=max(orig_w, orig_h),
        conf=conf_threshold,
        iou=0.45,          # NMS IoU threshold
        max_det=50,        # Allow a full debris field, not just the largest target
        verbose=False
    )

    detections = []

    if not results or len(results) == 0:
        print("[SIH26057-YOLO] No detections from model.")
        return []

    result = results[0]  # Single image

    if result.boxes is None or len(result.boxes) == 0:
        print("[SIH26057-YOLO] No bounding boxes detected.")
        return []

    boxes_data = result.boxes
    mid_x = orig_w / 2.0

    for idx, box in enumerate(boxes_data):
        # Extract raw values — already in waterfall pixel coordinates
        xyxy = box.xyxy[0].tolist()
        conf = float(box.conf[0])
        yolo_cls_id = int(box.cls[0])

        # Map YOLO class to our debris taxonomy
        cls_info = YOLO_CLASS_MAP.get(yolo_cls_id, YOLO_CLASS_MAP[0])
        debris_class_id = cls_info["debris_class_id"]

        hl_bbox = _clamp_bbox(xyxy, orig_w, orig_h)
        x1, y1, x2, y2 = hl_bbox

        # Guard against degenerate boxes
        if (x2 - x1) < 4 or (y2 - y1) < 4:
            continue

        # Centroid in original image space
        cx = (x1 + x2) / 2.0
        cy = (y1 + y2) / 2.0

        # Determine sonar channel
        channel = "starboard" if cx >= mid_x else "port"

        # ── Slant Range Calculation ──
        # Cross-track fraction determines slant range from towfish geometry
        range_frac = abs(cx - orig_w / 2.0) / (orig_w / 2.0)
        slant_range_m = TOWFISH_ALTITUDE_M + range_frac * (SLANT_RANGE_MAX_M - TOWFISH_ALTITUDE_M)

        # ── Acoustic Shadow Estimation ──
        shadow_length_px = _estimate_shadow_length_px(hl_bbox, orig_w, channel)

        # Shadow bbox: opposite side of highlight from nadir
        if channel == "starboard":
            sh_bbox = [x2 + 2, y1, x2 + 2 + shadow_length_px, y2]
        else:
            sh_bbox = [max(0, x1 - 2 - shadow_length_px), y1, max(0, x1 - 2), y2]

        # Clip shadow bbox to image bounds
        sh_bbox[0] = max(0, min(sh_bbox[0], orig_w - 1))
        sh_bbox[2] = max(0, min(sh_bbox[2], orig_w - 1))

        # Simple rectangular polygons (no segmentation masks available)
        hl_polygon = [[x1, y1], [x2, y1], [x2, y2], [x1, y2]]
        sh_polygon = [
            [sh_bbox[0], sh_bbox[1]], [sh_bbox[2], sh_bbox[1]],
            [sh_bbox[2], sh_bbox[3]], [sh_bbox[0], sh_bbox[3]]
        ]

        print(
            f"[SIH26057-YOLO] Detection {idx}: class={cls_info['label']} "
            f"conf={conf:.2f} bbox={hl_bbox} slant={slant_range_m:.1f}m"
        )

        detections.append({
            "detection_id":     idx,
            "class_id":         debris_class_id,
            "class_label":      cls_info["label"],
            "threat_level":     cls_info["threat"],
            "confidence":       round(conf, 3),
            "highlight_bbox":   hl_bbox,
            "shadow_bbox":      sh_bbox,
            "shadow_length_px": shadow_length_px,
            "center_px":        [int(cx), int(cy)],
            "slant_range_m":    round(slant_range_m, 2),
            "channel":          channel,
            "highlight_polygon": hl_polygon,
            "shadow_polygon":   sh_polygon,
            "source":           "yolov8_real_best_pt",
            "orientation_deg":  0.0,
        })

    print(f"[SIH26057-YOLO] Total verified detections: {len(detections)}")
    return detections
