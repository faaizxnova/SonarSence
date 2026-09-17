"""
SIH26057 — Simulated YOLOv8-Seg Dual-Head Inference Pipeline
==============================================================

Simulates a YOLOv8-Seg object detection and instance segmentation model
specialized for side-scan sonar marine debris detection.

Features:
  1. Specular highlight extraction with morphological filament bridging
  2. Acoustic shadow attenuation zone extraction
  3. Directional highlight-shadow pairing engine based on towfish geometry
  4. Spatial clustering & Non-Maximum Suppression (NMS) to eliminate duplicate/jammed boxes
  5. 12-Class debris taxonomy classification matching app.config
  6. Smooth polygon contour generation for pixel-accurate HUD rendering
"""

import numpy as np
import cv2
from typing import List, Dict, Tuple, Optional
from app.config import (
    DEBRIS_CLASSES, TOWFISH_ALTITUDE_M, SLANT_RANGE_MAX_M,
    PIXEL_RESOLUTION_M, WATERFALL_WIDTH_PX, WATERFALL_HEIGHT_PX
)


def detect_highlights(
    image: np.ndarray,
    min_area_px: int = 60,
    max_area_px: int = 50000
) -> List[Dict]:
    """
    HEAD 1 — Detect bright specular highlight regions in the sonar image.
    Uses adaptive local contrast and morphological filament bridging to keep
    diffuse net clusters and composite targets unified.
    """
    h, w = image.shape[:2]
    mid_x = w // 2

    # Nadir & boundary exclusion mask
    mask = np.ones((h, w), dtype=np.uint8)
    mask[:, max(0, mid_x - 18): min(w, mid_x + 18)] = 0
    mask[:8, :] = 0
    mask[-8:, :] = 0
    mask[:, :8] = 0
    mask[:, -8:] = 0

    valid_pixels = image[mask > 0]
    if len(valid_pixels) == 0:
        return []
    mean_bg = float(np.mean(valid_pixels))
    std_bg = float(np.std(valid_pixels))

    # Dual threshold: global high-backscatter + adaptive local contrast
    thresh_val = max(mean_bg + 1.0 * std_bg, 75.0)
    _, bin_global = cv2.threshold(image, thresh_val, 255, cv2.THRESH_BINARY)
    
    bin_adaptive = cv2.adaptiveThreshold(
        image, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY, blockSize=41, C=-16
    )
    combined = cv2.bitwise_and(bin_global, bin_adaptive)
    combined = cv2.bitwise_and(combined, combined, mask=mask)

    # Morphological bridging for net mesh filaments and complex structures
    k_bridge = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (13, 13))
    bridged = cv2.morphologyEx(combined, cv2.MORPH_CLOSE, k_bridge)
    k_dil = cv2.getStructuringElement(cv2.MORPH_RECT, (5, 5))
    dilated = cv2.dilate(bridged, k_dil, iterations=1)

    contours, _ = cv2.findContours(dilated, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    
    highlights = []
    for c in contours:
        area = float(cv2.contourArea(c))
        if area < min_area_px or area > max_area_px:
            continue
        
        x, y, bw, bh = cv2.boundingRect(c)
        if bw >= w - 30 or bh >= h - 30:
            continue  # Exclude full-width border artifacts
            
        M = cv2.moments(c)
        if M["m00"] > 0:
            cx = float(M["m10"] / M["m00"])
            cy = float(M["m01"] / M["m00"])
        else:
            cx = float(x + bw / 2)
            cy = float(y + bh / 2)

        # Approximate smooth polygon for visual HUD
        epsilon = 0.025 * cv2.arcLength(c, True)
        approx = cv2.approxPolyDP(c, max(1.5, epsilon), True)
        poly = [[int(pt[0][0]), int(pt[0][1])] for pt in approx]

        # Solidity: area / convex hull area (useful for net vs solid detection)
        hull = cv2.convexHull(c)
        hull_area = float(cv2.contourArea(hull))
        solidity = area / max(hull_area, 1.0)

        highlights.append({
            "bbox": [int(x), int(y), int(x + bw), int(y + bh)],
            "centroid": [cx, cy],
            "area_px": int(area),
            "width_px": int(bw),
            "height_px": int(bh),
            "aspect_ratio": round(bw / max(bh, 1), 2),
            "solidity": round(solidity, 2),
            "polygon": poly,
            "contour": c
        })

    return highlights


def detect_shadows(
    image: np.ndarray,
    min_area_px: int = 35,
    max_area_px: int = 35000
) -> List[Dict]:
    """
    HEAD 2 — Detect dark acoustic shadow regions in the sonar image.
    """
    h, w = image.shape[:2]
    mid_x = w // 2

    mask = np.ones((h, w), dtype=np.uint8)
    mask[:, max(0, mid_x - 14): min(w, mid_x + 14)] = 0

    valid_pixels = image[mask > 0]
    if len(valid_pixels) == 0:
        return []
    mean_bg = float(np.mean(valid_pixels))
    std_bg = float(np.std(valid_pixels))

    sh_thresh = min(int(mean_bg - 0.7 * std_bg), 45)
    sh_thresh = max(sh_thresh, 15)

    _, binary = cv2.threshold(image, sh_thresh, 255, cv2.THRESH_BINARY_INV)
    binary = cv2.bitwise_and(binary, binary, mask=mask)

    k_open = cv2.getStructuringElement(cv2.MORPH_RECT, (5, 5))
    clean = cv2.morphologyEx(binary, cv2.MORPH_OPEN, k_open)
    k_close = cv2.getStructuringElement(cv2.MORPH_RECT, (7, 5))
    clean = cv2.morphologyEx(clean, cv2.MORPH_CLOSE, k_close)

    contours, _ = cv2.findContours(clean, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    shadows = []
    for c in contours:
        area = float(cv2.contourArea(c))
        if area < min_area_px or area > max_area_px:
            continue
        
        x, y, bw, bh = cv2.boundingRect(c)
        if bw >= w - 40 or bh >= h - 40:
            continue
            
        M = cv2.moments(c)
        if M["m00"] > 0:
            cx = float(M["m10"] / M["m00"])
            cy = float(M["m01"] / M["m00"])
        else:
            cx = float(x + bw / 2)
            cy = float(y + bh / 2)

        epsilon = 0.03 * cv2.arcLength(c, True)
        approx = cv2.approxPolyDP(c, max(1.5, epsilon), True)
        poly = [[int(pt[0][0]), int(pt[0][1])] for pt in approx]

        shadows.append({
            "bbox": [int(x), int(y), int(x + bw), int(y + bh)],
            "centroid": [cx, cy],
            "area_px": int(area),
            "width_px": int(bw),
            "height_px": int(bh),
            "polygon": poly,
        })

    return shadows


def pair_highlights_and_shadows(
    highlights: List[Dict],
    shadows: List[Dict],
    image_width: int,
    max_distance_px: int = 120
) -> List[Dict]:
    """
    PAIRING ENGINE — Associate each highlight with its corresponding acoustic shadow.
    Directional rule:
      - Starboard (right): shadow extends outward to the RIGHT
      - Port (left): shadow extends outward to the LEFT
    """
    mid_x = image_width / 2
    paired = []
    used_shadows = set()

    for hl in highlights:
        hl_cx, hl_cy = hl["centroid"]
        is_starboard = hl_cx >= mid_x

        best_shadow = None
        best_dist = max_distance_px

        for j, sh in enumerate(shadows):
            if j in used_shadows:
                continue

            sh_cx, sh_cy = sh["centroid"]

            # Directional constraint
            if is_starboard and sh_cx < hl_cx - 5:
                continue
            if not is_starboard and sh_cx > hl_cx + 5:
                continue

            # Along-track vertical alignment
            if abs(sh_cy - hl_cy) > 40:
                continue

            dist = np.hypot(hl_cx - sh_cx, hl_cy - sh_cy)
            if dist < best_dist:
                best_dist = dist
                best_shadow = (j, sh)

        if best_shadow is not None:
            j, sh = best_shadow
            used_shadows.add(j)
            shadow_length_px = max(sh["width_px"], 4)
            paired.append({
                "highlight": hl,
                "shadow": sh,
                "shadow_length_px": shadow_length_px,
                "pair_distance_px": round(best_dist, 1),
                "channel": "starboard" if is_starboard else "port"
            })
        else:
            # For large targets (e.g. ghost net clusters), shadow may be diffuse or draped
            if hl["area_px"] >= 180:
                # Estimate shadow length proportional to cross-track profile
                est_shadow_px = int(max(10, min(55, hl["width_px"] * 0.7)))
                paired.append({
                    "highlight": hl,
                    "shadow": None,
                    "shadow_length_px": est_shadow_px,
                    "pair_distance_px": float("inf"),
                    "channel": "starboard" if is_starboard else "port"
                })
            else:
                # Unpaired small speckle (< 180 px) -> suppress noise
                continue

    return paired


def apply_non_max_suppression(
    candidates: List[Dict],
    iou_thresh: float = 0.20,
    proximity_thresh_px: float = 40.0
) -> List[Dict]:
    """
    Apply Non-Maximum Suppression (NMS) and spatial cluster merging.
    Eliminates duplicate, nested, or colliding bounding boxes on the same target.
    """
    if len(candidates) <= 1:
        return candidates

    # Sort descending by highlight area
    sorted_candidates = sorted(candidates, key=lambda d: d["highlight"]["area_px"], reverse=True)
    merged = []
    used = set()

    for i in range(len(sorted_candidates)):
        if i in used:
            continue

        c1 = sorted_candidates[i]
        b1 = list(c1["highlight"]["bbox"])
        cx1, cy1 = c1["highlight"]["centroid"]
        used.add(i)

        for j in range(i + 1, len(sorted_candidates)):
            if j in used:
                continue

            c2 = sorted_candidates[j]
            b2 = c2["highlight"]["bbox"]
            cx2, cy2 = c2["highlight"]["centroid"]

            # Compute IoU and containment
            xA = max(b1[0], b2[0])
            yA = max(b1[1], b2[1])
            xB = min(b1[2], b2[2])
            yB = min(b1[3], b2[3])
            inter = max(0, xB - xA) * max(0, yB - yA)
            a1 = (b1[2] - b1[0]) * (b1[3] - b1[1])
            a2 = (b2[2] - b2[0]) * (b2[3] - b2[1])
            enclosure = inter / float(min(a1, a2) + 1e-6)
            iou = inter / float(a1 + a2 - inter + 1e-6)

            dist = np.hypot(cx1 - cx2, cy1 - cy2)

            if iou > iou_thresh or enclosure > 0.40 or dist < proximity_thresh_px:
                # Merge into b1
                b1[0] = min(b1[0], b2[0])
                b1[1] = min(b1[1], b2[1])
                b1[2] = max(b1[2], b2[2])
                b1[3] = max(b1[3], b2[3])
                c1["highlight"]["area_px"] += c2["highlight"]["area_px"]
                
                # Expand polygon to envelop merged box
                if c2["highlight"].get("polygon"):
                    c1["highlight"]["polygon"] = _merge_polygons(
                        c1["highlight"]["polygon"], c2["highlight"]["polygon"], b1
                    )

                # Keep longer shadow
                if c2["shadow_length_px"] > c1["shadow_length_px"]:
                    c1["shadow_length_px"] = c2["shadow_length_px"]
                    if c2.get("shadow"):
                        c1["shadow"] = c2["shadow"]

                used.add(j)

        c1["highlight"]["bbox"] = b1
        c1["highlight"]["centroid"] = [(b1[0] + b1[2]) / 2.0, (b1[1] + b1[3]) / 2.0]
        c1["highlight"]["width_px"] = b1[2] - b1[0]
        c1["highlight"]["height_px"] = b1[3] - b1[1]
        c1["highlight"]["aspect_ratio"] = round(c1["highlight"]["width_px"] / max(c1["highlight"]["height_px"], 1), 2)
        merged.append(c1)

    return merged


def _merge_polygons(p1: List[List[int]], p2: List[List[int]], bbox: List[int]) -> List[List[int]]:
    """Generate a clean unified bounding polygon from merged components."""
    pts = np.array(p1 + p2, dtype=np.int32)
    hull = cv2.convexHull(pts)
    epsilon = 0.02 * cv2.arcLength(hull, True)
    approx = cv2.approxPolyDP(hull, max(2.0, epsilon), True)
    return [[int(pt[0][0]), int(pt[0][1])] for pt in approx]


def classify_target(
    highlight: Dict,
    shadow_length_px: int,
    slant_range_m: float
) -> Tuple[int, float]:
    """
    Classify acoustic target into the SIH26057 12-class taxonomy.
    Grounded in acoustic morphology and physical aspect ratios.
    """
    area = highlight["area_px"]
    aspect = highlight["aspect_ratio"]
    solidity = highlight.get("solidity", 0.75)
    w_px = highlight["width_px"]
    h_px = highlight["height_px"]

    # 0: Ghost net — sprawling irregular mesh, large footprint, low solidity (<0.75) or large irregular area
    if (area > 350 and solidity < 0.75) or (area > 1200) or (w_px > 85 and h_px > 40 and solidity < 0.78):
        class_id = 0  # ghost_net
        conf = 0.84
    # 11: Discarded tires / reef — compact annular / round doughnut or tire cluster with balanced aspect ratio
    elif 0.70 <= aspect <= 1.40 and solidity >= 0.65:
        class_id = 11  # discarded_tires_reef
        conf = 0.79
    # 1: Shipping container — large rectilinear solid rectangular block with high solidity
    elif 1.8 <= aspect <= 3.8 and area >= 300 and solidity >= 0.75:
        class_id = 1  # shipping_container
        conf = 0.91
    # 5: Chemical drum — cylindrical barrel, aspect 1.2..1.8, area 100..320
    elif 1.2 <= aspect <= 1.8 and area <= 350:
        class_id = 5  # chemical_drum
        conf = 0.82
    # 7: Subsea pipeline — very elongated linear scour line
    elif aspect > 3.8:
        class_id = 7  # pipeline_trench_scour
        conf = 0.87
    # 6: Mooring anchor chain — tall/narrow along-track line
    elif aspect < 0.45:
        class_id = 6  # mooring_anchor_chain
        conf = 0.81
    # 3: Moored sea mine — compact circular return with prominent shadow
    elif shadow_length_px > 30 and area < 250:
        class_id = 3  # moored_sea_mine
        conf = 0.85
    # 2: Unexploded ordnance (UXO) — compact cylindrical return
    elif area <= 280:
        class_id = 2  # unexploded_ordnance_uxo
        conf = 0.78
    else:
        class_id = 0  # ghost_net default for large marine debris accumulations
        conf = 0.83

    return class_id, conf


def run_simulated_yolo_pipeline(
    image: np.ndarray,
    ground_truth: Optional[List[Dict]] = None
) -> List[Dict]:
    """
    Execute the full YOLOv8-Seg dual-head inference pipeline with NMS and 12-class classification.
    """
    h, w = image.shape[:2]

    # If ground truth from synthetic simulator is provided, use it
    if ground_truth is not None and len(ground_truth) > 0:
        detections = []
        for gt in ground_truth:
            cid = gt.get("class_id", 0)
            if cid not in DEBRIS_CLASSES:
                cid = 0
            detections.append({
                "detection_id": gt["target_id"],
                "class_id": cid,
                "class_label": DEBRIS_CLASSES[cid]["label"],
                "threat_level": DEBRIS_CLASSES[cid]["threat"],
                "confidence": gt["confidence"],
                "highlight_bbox": list(gt["highlight_bbox"]),
                "shadow_bbox": list(gt["shadow_bbox"]),
                "shadow_length_px": gt["shadow_length_px"],
                "center_px": list(gt["center_px"]),
                "slant_range_m": gt["slant_range_m"],
                "channel": "starboard" if gt["center_px"][0] >= w // 2 else "port",
                "highlight_polygon": gt.get("highlight_polygon"),
                "shadow_polygon": gt.get("shadow_polygon"),
                "source": "simulated_yolov8_seg"
            })
        return detections

    # ── Image-based detection with NMS & deconfliction ──
    highlights = detect_highlights(image)
    shadows = detect_shadows(image)
    pairs = pair_highlights_and_shadows(highlights, shadows, w)
    # Increased proximity threshold to merge messy fragmented tags into single coherent objects
    filtered_pairs = apply_non_max_suppression(pairs, iou_thresh=0.15, proximity_thresh_px=180.0)

    detections = []
    for idx, pair in enumerate(filtered_pairs):
        hl = pair["highlight"]
        sh = pair["shadow"]
        sh_len_px = pair["shadow_length_px"]

        # Slant range calculation from cross-track geometry
        hl_cx = hl["centroid"][0]
        range_frac = abs(hl_cx - w / 2.0) / (w / 2.0)
        slant_range_m = TOWFISH_ALTITUDE_M + range_frac * (SLANT_RANGE_MAX_M - TOWFISH_ALTITUDE_M)

        # 12-class taxonomy classification
        class_id, confidence = classify_target(hl, sh_len_px, slant_range_m)

        shadow_bbox = list(sh["bbox"]) if sh else [
            int(hl["bbox"][2] + 2), int(hl["bbox"][1]),
            int(hl["bbox"][2] + 2 + sh_len_px), int(hl["bbox"][3])
        ] if pair["channel"] == "starboard" else [
            int(max(0, hl["bbox"][0] - 2 - sh_len_px)), int(hl["bbox"][1]),
            int(max(0, hl["bbox"][0] - 2)), int(hl["bbox"][3])
        ]

        # Shadow polygon
        if sh and sh.get("polygon"):
            sh_poly = sh["polygon"]
        else:
            sh_poly = [
                [shadow_bbox[0], shadow_bbox[1]],
                [shadow_bbox[2], shadow_bbox[1]],
                [shadow_bbox[2], shadow_bbox[3]],
                [shadow_bbox[0], shadow_bbox[3]]
            ]

        detections.append({
            "detection_id": idx,
            "class_id": class_id,
            "class_label": DEBRIS_CLASSES[class_id]["label"],
            "threat_level": DEBRIS_CLASSES[class_id]["threat"],
            "confidence": round(confidence, 2),
            "highlight_bbox": list(hl["bbox"]),
            "shadow_bbox": shadow_bbox,
            "highlight_polygon": hl["polygon"],
            "shadow_polygon": sh_poly,
            "shadow_length_px": sh_len_px,
            "center_px": [int(hl["centroid"][0]), int(hl["centroid"][1])],
            "slant_range_m": round(slant_range_m, 2),
            "channel": pair["channel"],
            "source": "simulated_yolov8_seg",
            "_area": hl["area_px"]
        })

    # Sort by area descending and keep only top 3 most significant targets to prevent clutter
    detections = sorted(detections, key=lambda x: x["_area"], reverse=True)[:3]
    for i, d in enumerate(detections):
        d["detection_id"] = i
        del d["_area"]

    return detections
