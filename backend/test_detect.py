import cv2
import sys
sys.path.append('d:/prototype/backend')
from app.inference.detector import detect_highlights, detect_shadows, pair_highlights_and_shadows, apply_non_max_suppression

img = cv2.imread('d:/prototype/test_1.png', cv2.IMREAD_GRAYSCALE)
img = cv2.resize(img, (1024, 512))
hl = detect_highlights(img)
sh = detect_shadows(img)
pairs = pair_highlights_and_shadows(hl, sh, 1024)
filtered = apply_non_max_suppression(pairs, iou_thresh=0.15, proximity_thresh_px=45.0)
print(len(filtered))
for p in filtered:
    print(f'Box: {p["highlight"]["bbox"]} Area: {p["highlight"]["area_px"]}')
