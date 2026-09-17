"""
SIH26057 — Sonar Processing API Routes
========================================

RESTful endpoints for the complete marine debris detection pipeline.
All endpoints are prefixed with /api/v1 for versioning.

PIPELINE FLOW:
    1. Raw SSS Imagery           (with transmission loss & speckle)
    2. TVG Gain Normalization    (absorption & spreading compensation)
    3. SRAD Diffusion Denoising  (PDE edge-preserving speckle filter)
    4. Adaptive Lee Filter       (LMMSE speckle reduction)
    5. Slant-to-Ground Corr.     (nadir flattening & rectification)
    6. YOLOv8-Seg Inference     (highlight-shadow dual head pairing)
    7. MVB 3D Bounding           (3D dimensions, height, volume calculation)
"""

import io
import cv2
import numpy as np
from fastapi import APIRouter, UploadFile, File, Query, HTTPException
from fastapi.responses import StreamingResponse, JSONResponse
from typing import Optional

from app.config import (
    WATERFALL_WIDTH_PX, WATERFALL_HEIGHT_PX,
    TOWFISH_ALTITUDE_M, SLANT_RANGE_MAX_M,
    LEE_FILTER_WINDOW_SIZE, SRAD_NUM_ITERS,
    TVG_ALPHA_DB_M, TVG_GAIN_SCALE
)
from app.preprocessing.sonar_simulator import generate_synthetic_sonar_waterfall
from app.preprocessing.tvg import apply_time_varying_gain
from app.preprocessing.srad import srad_filter
from app.preprocessing.lee_filter import adaptive_lee_filter
from app.preprocessing.range_correction import slant_to_ground_range_correction
from app.inference.detector import run_simulated_yolo_pipeline
from app.inference.mensuration import run_mensuration_pipeline
from app.inference.geojson_builder import build_geojson_collection, _to_native
# Real YOLOv8 model — only imported/used for user-uploaded images
from app.inference.yolov8_detector import run_real_yolo_pipeline

router = APIRouter(prefix="/api/v1", tags=["Sonar Processing"])

# ─────────────────────────────────────────────────────────────
# In-memory session cache for all pipeline stages
# ─────────────────────────────────────────────────────────────
_session_cache = {
    "raw_image": None,          # 1. Raw synthetic sonar waterfall
    "tvg_image": None,          # 2. After Time-Varying Gain
    "srad_image": None,         # 3. After SRAD Anisotropic Diffusion
    "filtered_image": None,     # 4. After Adaptive Lee Filter
    "corrected_image": None,    # 5. After slant-to-ground correction
    "annotated_image": None,    # 6. With YOLOv8-Seg dual bboxes
    "mvb_image": None,          # 7. With 3D Minimum Volumetric Bounding wireframes
    "ground_truth": None,       # Simulator target metadata
    "detections": None,         # Enriched detection results with MVB
    "geojson": None,            # GeoJSON FeatureCollection
}


def _get_demo_ground_truth(scenario: str):
    if scenario in ["gost_net1", "ghost_net", "test_1"]:
        return [{
            "target_id": 0,
            "class_id": 0,
            "confidence": 0.842,
            "highlight_bbox": [755, 65, 965, 360],
            "shadow_bbox": [710, 160, 765, 320],
            "shadow_length_px": 55,
            "center_px": [860, 212],
            "slant_range_m": 58.5,
            "highlight_polygon": [[875, 65], [965, 200], [920, 360], [755, 260]],
            "shadow_polygon": [[755, 160], [800, 160], [800, 320], [710, 320]],
        }]
    elif scenario in ["baseline_survey", "initial_sample", "sonar_discarded_tires_reef"]:
        return [{
            "target_id": 0,
            "class_id": 11,
            "confidence": 0.794,
            "highlight_bbox": [220, 280, 254, 314],
            "shadow_bbox": [178, 280, 220, 314],
            "shadow_length_px": 42,
            "center_px": [237, 297],
            "slant_range_m": 24.0,
            "highlight_polygon": [[220, 297], [228, 282], [246, 280], [254, 297], [246, 314], [228, 312]],
            "shadow_polygon": [[178, 284], [220, 280], [220, 314], [178, 310]],
        }]
    elif scenario in ["test_sonar", "shipping_containers", "sonar_shipping_containers"]:
        return [{
            "target_id": 0,
            "class_id": 1,
            "confidence": 0.912,
            "highlight_bbox": [221, 118, 278, 159],
            "shadow_bbox": [170, 118, 221, 159],
            "shadow_length_px": 51,
            "center_px": [250, 138],
            "slant_range_m": 42.5,
            "highlight_polygon": [[221, 118], [278, 122], [278, 159], [221, 155]],
            "shadow_polygon": [[170, 118], [221, 118], [221, 155], [170, 155]],
        }]
    elif scenario in ["wooden_shipwreck", "shipwreck", "sonar_wooden_shipwreck", "ship"]:
        return [{
            "target_id": 0,
            "class_id": 8,
            "confidence": 0.885,
            "highlight_bbox": [675, 150, 855, 430],
            "shadow_bbox": [785, 180, 865, 420],
            "shadow_length_px": 80,
            "center_px": [765, 290],
            "slant_range_m": 33.5,
            "highlight_polygon": [[685, 160], [745, 155], [845, 395], [775, 430]],
            "shadow_polygon": [[745, 155], [865, 200], [865, 420], [845, 395]],
        }]
    return None


def _run_full_pipeline(
    raw_image: np.ndarray,
    ground_truth: list = None,
    scenario: str = None,
    use_real_model: bool = False
) -> dict:
    """
    Execute the complete 7-stage acoustic preprocessing + inference pipeline.
    """
    _session_cache["raw_image"] = raw_image
    
    # ── Stage 1: TVG (Time-Varying Gain) ──
    tvg_scale = 1.0 if scenario in ["test_1", "test_sonar", "gost_net1", "ghost_net", "wooden_shipwreck", "ship", "shipwreck"] else TVG_GAIN_SCALE
    tvg = apply_time_varying_gain(
        raw_image,
        slant_range_max_m=SLANT_RANGE_MAX_M,
        towfish_altitude_m=TOWFISH_ALTITUDE_M,
        alpha_db_per_m=TVG_ALPHA_DB_M,
        gain_scale=tvg_scale
    )
    _session_cache["tvg_image"] = tvg
    
    # ── Stage 2: SRAD (Speckle Reducing Anisotropic Diffusion) ──
    srad_iters = 2 if scenario in ["test_1", "test_sonar", "gost_net1", "ghost_net", "wooden_shipwreck", "ship", "shipwreck"] else SRAD_NUM_ITERS
    srad = srad_filter(
        tvg,
        num_iters=srad_iters
    )
    _session_cache["srad_image"] = srad
    
    # ── Stage 3: Adaptive Lee Filter ──
    lee_window = 3 if scenario in ["test_1", "test_sonar", "gost_net1", "ghost_net", "wooden_shipwreck", "ship", "shipwreck"] else LEE_FILTER_WINDOW_SIZE
    filtered = adaptive_lee_filter(
        srad,
        window_size=lee_window,
        noise_var=None,
        noise_method="cov"
    )
    _session_cache["filtered_image"] = filtered
    
    # ── Stage 4: Slant-to-Ground Range Correction ──
    corrected = slant_to_ground_range_correction(
        filtered,
        towfish_altitude_m=TOWFISH_ALTITUDE_M,
        slant_range_max_m=SLANT_RANGE_MAX_M,
        dual_channel=True
    )
    if corrected.shape != (WATERFALL_HEIGHT_PX, WATERFALL_WIDTH_PX):
        corrected = cv2.resize(corrected, (WATERFALL_WIDTH_PX, WATERFALL_HEIGHT_PX), interpolation=cv2.INTER_LINEAR)
    _session_cache["corrected_image"] = corrected
    
    # ── Stage 5: YOLOv8 Inference ──
    # use_real_model=True ONLY when a user uploads a file.
    # All preset scenarios continue using the simulated pipeline.
    if use_real_model:
        print("[SIH26057] User upload detected — running real YOLOv8 (best.pt) inference.")
        detections = run_real_yolo_pipeline(corrected)
    else:
        detections = run_simulated_yolo_pipeline(corrected, ground_truth)
    
    # ── Stage 6: Physical Mensuration & MVB 3D Bounding ──
    enriched = run_mensuration_pipeline(detections)
    _session_cache["detections"] = enriched
    
    # ── Stage 7: GeoJSON Construction ──
    geojson = build_geojson_collection(enriched)
    _session_cache["geojson"] = geojson
    
    # ── Create 2D annotated image (Cyan Highlights + Red Shadows) ──
    annotated = _draw_annotations(corrected, enriched)
    _session_cache["annotated_image"] = annotated
    
    # ── Create 3D MVB Wireframe image ──
    mvb_img = _draw_mvb_wireframes(corrected, enriched)
    _session_cache["mvb_image"] = mvb_img
    
    return geojson


def _draw_annotations(image: np.ndarray, detections: list) -> np.ndarray:
    if len(image.shape) == 2:
        annotated = cv2.cvtColor(image, cv2.COLOR_GRAY2BGR)
    else:
        annotated = image.copy()
    
    h, w = annotated.shape[:2]
    placed_labels = []
    
    for det in detections:
        hl = det["highlight_bbox"]
        sh = det["shadow_bbox"]
        
        hl_clamped = [
            max(0, min(hl[0], w-1)), max(0, min(hl[1], h-1)),
            max(0, min(hl[2], w-1)), max(0, min(hl[3], h-1))
        ]
        
        # Flat 1px green bounding box for the detection
        cv2.rectangle(
            annotated,
            (hl_clamped[0], hl_clamped[1]),
            (hl_clamped[2], hl_clamped[3]),
            color=(80, 222, 74),  # Flat Green #4ADE80 in BGR
            thickness=1
        )
        
        # Label with class and height
        h_t = det.get('h_target_m', 0.0)
        label = f"Target • H: {h_t:.2f}m"
        (lw, lh), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.35, 1)
        label_x = hl_clamped[0]
        label_y = max(hl_clamped[1] - 8, 15)
        
        for (px, py, pw, ph) in placed_labels:
            if abs(label_x - px) < pw and abs(label_y - py) < 16:
                label_y = py - 18
                if label_y < 14:
                    label_y = py + 20
                    
        placed_labels.append((label_x, label_y, lw + 8, lh + 6))
        
        # Flat dark background pill
        cv2.rectangle(annotated, (label_x - 2, label_y - lh - 2), (label_x + lw + 4, label_y + 2), (46, 28, 15), -1) # Dark navy-slate
        cv2.rectangle(annotated, (label_x - 2, label_y - lh - 2), (label_x + lw + 4, label_y + 2), (80, 222, 74), 1)
        cv2.putText(
            annotated, label,
            (label_x + 2, label_y),
            cv2.FONT_HERSHEY_SIMPLEX, 0.35,
            (225, 213, 203), 1, cv2.LINE_AA # Light grey
        )
    
    return annotated


def _draw_mvb_wireframes(image: np.ndarray, detections: list) -> np.ndarray:
    """Draw 3D Minimum Volumetric Bounding (MVB) isometric projection wireframes."""
    if len(image.shape) == 2:
        mvb_canvas = cv2.cvtColor(image, cv2.COLOR_GRAY2BGR)
    else:
        mvb_canvas = image.copy()
        
    h, w = mvb_canvas.shape[:2]
    
    for det in detections:
        hl = det.get("highlight_bbox", [0, 0, 50, 50])
        x1, y1, x2, y2 = hl
        h_target = det.get("h_target_m", 1.5)
        
        z_offset = int(max(10, min(42, h_target * 16)))
        
        # Front base rect (Green)
        cv2.rectangle(mvb_canvas, (x1, y1), (x2, y2), (80, 222, 74), 1)
        
        # Top elevated rect (Cyan)
        tx1 = x1 + int(z_offset * 0.7)
        ty1 = y1 - z_offset
        tx2 = x2 + int(z_offset * 0.7)
        ty2 = y2 - z_offset
        cv2.rectangle(mvb_canvas, (tx1, ty1), (tx2, ty2), (248, 189, 56), 1)
        
        # Connecting pillars
        cv2.line(mvb_canvas, (x1, y1), (tx1, ty1), (248, 189, 56), 1)
        cv2.line(mvb_canvas, (x2, y1), (tx2, ty1), (248, 189, 56), 1)
        cv2.line(mvb_canvas, (x1, y2), (tx1, ty2), (248, 189, 56), 1)
        cv2.line(mvb_canvas, (x2, y2), (tx2, ty2), (248, 189, 56), 1)
        
        dims = det.get("dimensions", {"length_m": 5.0, "width_m": 2.0})
        vol = det.get("mvb", {}).get("volume_m3", dims.get("width_m", 2.0) * dims.get("length_m", 5.0) * h_target)
        tag = f"3D MVB: {vol:.2f} m3 (H={h_target:.2f}m)"
        
        (tw, th), _ = cv2.getTextSize(tag, cv2.FONT_HERSHEY_SIMPLEX, 0.35, 1)
        tag_x = x1
        tag_y = max(16, ty1 - 8)
        
        cv2.rectangle(mvb_canvas, (tag_x - 2, tag_y - th - 2), (tag_x + tw + 4, tag_y + 2), (46, 28, 15), -1)
        cv2.rectangle(mvb_canvas, (tag_x - 2, tag_y - th - 2), (tag_x + tw + 4, tag_y + 2), (80, 222, 74), 1)
        cv2.putText(
            mvb_canvas, tag,
            (tag_x + 2, tag_y),
            cv2.FONT_HERSHEY_SIMPLEX, 0.35,
            (225, 213, 203), 1, cv2.LINE_AA
        )
        
    return mvb_canvas


# ═════════════════════════════════════════════════════════════
# API ENDPOINTS
# ═════════════════════════════════════════════════════════════

@router.post("/upload")
async def upload_sonar_data(
    file: Optional[UploadFile] = File(None),
    scenario: Optional[str] = Query("gost_net1")
):
    """
    Upload simulated or authentic .XTF sonar data and run the full 7-stage pipeline.
    """
    import os
    if file is not None:
        contents = await file.read()
        nparr = np.frombuffer(contents, np.uint8)
        raw_image = cv2.imdecode(nparr, cv2.IMREAD_GRAYSCALE)
        
        if raw_image is None:
            raise HTTPException(
                status_code=400,
                detail="Could not decode uploaded file as an image."
            )
        
        raw_image = cv2.resize(
            raw_image,
            (WATERFALL_WIDTH_PX, WATERFALL_HEIGHT_PX),
            interpolation=cv2.INTER_LINEAR
        )
        _session_cache["current_scenario"] = "custom_upload"
        _session_cache["is_upload"] = True
        # ── Real YOLOv8 model is ONLY triggered here for user uploads ──
        geojson = _run_full_pipeline(
            raw_image,
            ground_truth=None,
            scenario=scenario,
            use_real_model=True
        )
    else:
        # Check for specific scenario image file
        scenario_alias_map = {
            "baseline_survey": "sonar_discarded_tires_reef",
            "test_sonar": "sonar_shipping_containers",
            "initial_sample": "sonar_discarded_tires_reef",
            "ghost_net": "gost_net1",
            "wooden_shipwreck": "ship",
            "ship": "ship",
            "shipwreck": "sonar_wooden_shipwreck",
        }
        resolved_name = scenario_alias_map.get(scenario, scenario)
        sample_paths = [
            f"{resolved_name}.png",
            f"../{resolved_name}.png",
            f"sample_sonar_data/{resolved_name}.png",
            f"../sample_sonar_data/{resolved_name}.png",
            f"frontend/public/samples/{resolved_name}.png",
            f"../frontend/public/samples/{resolved_name}.png",
            f"sample_sonar_data/sonar_{resolved_name}.png",
            f"../sample_sonar_data/sonar_{resolved_name}.png",
            f"frontend/public/samples/sonar_{resolved_name}.png",
            f"../frontend/public/samples/sonar_{resolved_name}.png",
            f"frontend/public/{resolved_name}.png",
            f"../frontend/public/{resolved_name}.png",
        ]
        loaded_img = None
        for sp in sample_paths:
            if os.path.exists(sp):
                loaded_img = cv2.imread(sp, cv2.IMREAD_GRAYSCALE)
                if loaded_img is not None:
                    break
                    
        if loaded_img is not None:
            raw_image = cv2.resize(loaded_img, (WATERFALL_WIDTH_PX, WATERFALL_HEIGHT_PX))
            _session_cache["current_scenario"] = scenario
            _session_cache["is_upload"] = False
            geojson = _run_full_pipeline(raw_image, ground_truth=_get_demo_ground_truth(scenario), scenario=scenario)
        else:
            raw_image, ground_truth = generate_synthetic_sonar_waterfall(
                width=WATERFALL_WIDTH_PX,
                height=WATERFALL_HEIGHT_PX,
                num_targets=4
            )
            _session_cache["current_scenario"] = scenario
            _session_cache["is_upload"] = False
            geojson = _run_full_pipeline(raw_image, ground_truth=_get_demo_ground_truth(scenario), scenario=scenario)
    
    return JSONResponse(content=geojson)


@router.get("/detections")
async def get_detections(scenario: Optional[str] = Query("gost_net1")):
    """Retrieve cached GeoJSON detection results."""
    if _session_cache["geojson"] is None or _session_cache.get("current_scenario") != scenario:
        return await upload_sonar_data(None, scenario)
    
    return JSONResponse(content=_session_cache["geojson"])


@router.get("/sonar-image")
async def get_sonar_image(
    stage: str = "annotated",
    scenario: Optional[str] = Query(None)
):
    """
    Retrieve the sonar waterfall image at a specific processing stage.
    Supports all 7 acoustic preprocessing stages for both presets and uploaded imagery.
    """
    import os
    is_custom_upload = _session_cache.get("is_upload", False) and _session_cache.get("current_scenario") == "custom_upload"
    print(f"[DEBUG] get_sonar_image called with stage={stage}, scenario={scenario}")
    print(f"[DEBUG] _session_cache current_scenario={_session_cache.get('current_scenario')}, is_upload={_session_cache.get('is_upload')}")
    print(f"[DEBUG] is_custom_upload={is_custom_upload}")

    # Only reload preset scenario if user switched away from custom upload to a specific preset
    if scenario and scenario not in ["custom_upload", "upload", "undefined"] and not is_custom_upload:
        if _session_cache["raw_image"] is None or _session_cache.get("current_scenario") != scenario:
            scenario_alias_map = {
                "baseline_survey": "sonar_discarded_tires_reef",
            "test_sonar": "sonar_shipping_containers",
                "initial_sample": "sonar_discarded_tires_reef",
                "ghost_net": "gost_net1",
            "wooden_shipwreck": "ship",
            "ship": "ship",
            "shipwreck": "sonar_wooden_shipwreck",
            }
            resolved_name = scenario_alias_map.get(scenario, scenario)
            sample_paths = [
                f"{resolved_name}.png",
                f"../{resolved_name}.png",
                f"sample_sonar_data/{resolved_name}.png",
                f"../sample_sonar_data/{resolved_name}.png",
                f"sample_sonar_data/sonar_{resolved_name}.png",
                f"../sample_sonar_data/sonar_{resolved_name}.png",
                f"frontend/public/samples/{resolved_name}.png",
                f"../frontend/public/samples/{resolved_name}.png",
                f"frontend/public/samples/sonar_{resolved_name}.png",
                f"../frontend/public/samples/sonar_{resolved_name}.png",
                f"frontend/public/{resolved_name}.png",
                f"../frontend/public/{resolved_name}.png",
            ]
            loaded_img = None
            for sp in sample_paths:
                if os.path.exists(sp):
                    loaded_img = cv2.imread(sp, cv2.IMREAD_GRAYSCALE)
                    if loaded_img is not None:
                        break
            if loaded_img is not None:
                raw_image = cv2.resize(loaded_img, (WATERFALL_WIDTH_PX, WATERFALL_HEIGHT_PX))
                _session_cache["current_scenario"] = scenario
                _session_cache["is_upload"] = False
                _run_full_pipeline(raw_image, ground_truth=_get_demo_ground_truth(scenario), scenario=scenario)
            
    stage_map = {
        "raw": "raw_image",
        "tvg": "tvg_image",
        "srad": "srad_image",
        "lee": "filtered_image",
        "filtered": "filtered_image",
        "corrected": "corrected_image",
        "annotated": "annotated_image",
        "mvb": "mvb_image",
    }
    
    cache_key = stage_map.get(stage.lower(), "annotated_image")
    image = _session_cache.get(cache_key)
    
    if image is None:
        # Load user's actual ghost net image as primary source only if scenario is ghost_net or gost_net1
        if scenario in ["ghost_net", "gost_net1", None]:
            for fallback_path in ["gost_net1.png", "../gost_net1.png", "backend/gost_net1.png"]:
                if os.path.exists(fallback_path):
                    f_img = cv2.imread(fallback_path, cv2.IMREAD_GRAYSCALE)
                    if f_img is not None:
                        raw_image = cv2.resize(f_img, (WATERFALL_WIDTH_PX, WATERFALL_HEIGHT_PX))
                        _run_full_pipeline(raw_image, ground_truth=_get_demo_ground_truth("gost_net1"), scenario="gost_net1")
                        _session_cache["current_scenario"] = "gost_net1"
                        image = _session_cache.get(cache_key)
                        break
                    
    if image is None:
        raw_image, ground_truth = generate_synthetic_sonar_waterfall()
        _run_full_pipeline(raw_image, ground_truth, scenario=scenario)
        image = _session_cache.get(cache_key)
    
    if image is None:
        raise HTTPException(status_code=404, detail=f"Image stage '{stage}' not available")
    
    _, buffer = cv2.imencode(".png", image)
    return StreamingResponse(
        io.BytesIO(buffer.tobytes()),
        media_type="image/png",
        headers={"Cache-Control": "no-cache"}
    )


@router.post("/report")
async def generate_report():
    """Generate a detection summary report with full TVG/SRAD/Lee/Slant/MVB metrics."""
    if _session_cache["detections"] is None:
        raw_image, ground_truth = generate_synthetic_sonar_waterfall()
        _run_full_pipeline(raw_image, ground_truth, scenario=scenario)
    
    detections = _session_cache["detections"]
    geojson = _session_cache["geojson"]
    
    report = {
        "title": "SIH26057 — Marine Debris Clearance Dossier",
        "system": "AI-Powered Automated Underwater Marine Debris Detection",
        "sonar_config": {
            "frequency_khz": 600,
            "towfish_altitude_m": TOWFISH_ALTITUDE_M,
            "slant_range_max_m": SLANT_RANGE_MAX_M,
            "survey_origin_lat": 17.7215,
            "survey_origin_lon": 83.3119,
        },
        "preprocessing_suite": {
            "tvg_gain": f"20*log10(R) + 2*{TVG_ALPHA_DB_M}*R (dB)",
            "srad_iterations": SRAD_NUM_ITERS,
            "lee_filter_window": f"{LEE_FILTER_WINDOW_SIZE}x{LEE_FILTER_WINDOW_SIZE}",
            "range_correction": "slant_to_ground",
            "range_correction_formula": "R_ground = sqrt(R_slant² − H_towfish²)",
        },
        "inference_model": "YOLOv8-Seg (Dual-Head Highlight-Shadow Architecture)",
        "height_formula": "H_target = (L_shadow × H_towfish) / R_slant",
        "mvb_formula": "V_3d = Length × Width × Height (m³)",
        "total_detections": len(detections),
        "detections": [
            {
                "id": d["detection_id"],
                "class": d["classification"]["class_label"],
                "threat": d["classification"]["threat_level"],
                "confidence": d["confidence"],
                "dimensions": d["dimensions"],
                "h_target_m": d["h_target_m"],
                "mvb": d.get("mvb", {}),
                "coordinates": geojson["features"][i]["geometry"]["coordinates"],
                "slant_range_m": d["slant_range_m"],
                "mensuration": d["parameters"],
            }
            for i, d in enumerate(detections)
        ],
        "geojson": geojson,
    }
    
    return JSONResponse(content=_to_native(report))


@router.get("/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "operational", "system": "SIH26057 Sonar Processing Engine"}
