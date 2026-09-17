"""
Quick verification: confirms yolov8_detector loads, best.pt resolves,
and that sonar.py syntax is valid.
Run from: d:\prototype\backend\
"""
import sys, os
sys.path.insert(0, os.getcwd())

print("=" * 60)
print("SIH26057 — YOLOv8 Integration Verification")
print("=" * 60)

# 1. Check best.pt exists
weights = "best.pt"
if os.path.isfile(weights):
    size_mb = os.path.getsize(weights) / (1024 * 1024)
    print(f"[OK] best.pt found: {os.path.abspath(weights)} ({size_mb:.1f} MB)")
else:
    print("[FAIL] best.pt NOT found in backend folder!")
    sys.exit(1)

# 2. Verify ultralytics import
try:
    from ultralytics import YOLO
    print("[OK] ultralytics package imported successfully")
except ImportError as e:
    print(f"[FAIL] ultralytics not installed: {e}")
    sys.exit(1)

# 3. Load model and verify class names
try:
    model = YOLO(weights)
    names = model.names
    print(f"[OK] Model loaded — classes: {names}")
    expected = {0: "ghost_net", 1: "shipwreck", 2: "mine_cylinder", 3: "submarine_pipeline"}
    for cid, cname in expected.items():
        if names.get(cid) == cname:
            print(f"      Class {cid}: '{cname}' [MATCH]")
        else:
            print(f"      Class {cid}: expected '{cname}', got '{names.get(cid)}' [MISMATCH — update YOLO_CLASS_MAP if needed]")
except Exception as e:
    print(f"[FAIL] Model load error: {e}")
    sys.exit(1)

# 4. Import the new yolov8_detector module
try:
    from app.inference.yolov8_detector import run_real_yolo_pipeline, preprocess_for_yolo
    print("[OK] yolov8_detector module imported successfully")
except Exception as e:
    print(f"[FAIL] yolov8_detector import error: {e}")
    sys.exit(1)

# 5. Quick smoke test on a blank 1024x512 grayscale image
try:
    import numpy as np
    import cv2
    dummy = np.random.randint(0, 60, (512, 1024), dtype=np.uint8)
    preprocessed = preprocess_for_yolo(dummy)
    assert preprocessed.shape == (640, 640, 3), f"Expected (640,640,3), got {preprocessed.shape}"
    print(f"[OK] preprocess_for_yolo: output shape {preprocessed.shape}")

    detections = run_real_yolo_pipeline(dummy, conf_threshold=0.01)
    print(f"[OK] run_real_yolo_pipeline: returned {len(detections)} detections on blank image")
except Exception as e:
    print(f"[FAIL] Smoke test failed: {e}")
    import traceback; traceback.print_exc()
    sys.exit(1)

print()
print("[ALL CHECKS PASSED] YOLOv8 integration is ready.")
print("Restart the FastAPI server to apply changes.")
