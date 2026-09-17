import argparse
import requests
import json
import csv
import sys
from pathlib import Path

# API Endpoint
API_BASE_URL = "http://127.0.0.1:8000/api/v1"

def check_backend():
    try:
        res = requests.get(f"{API_BASE_URL}/health", timeout=5)
        res.raise_for_status()
        print("[+] Backend is accessible.")
        return True
    except Exception as e:
        print(f"[-] Backend connection failed: {e}")
        print("Please ensure the FastAPI backend is running (python main.py).")
        return False

def process_and_get_report(file_path=None, scenario="gost_net1"):
    url = f"{API_BASE_URL}/upload"
    params = {"scenario": scenario}
    
    try:
        if file_path:
            with open(file_path, "rb") as f:
                files = {"file": f}
                print(f"[*] Uploading and processing file: {file_path}")
                res = requests.post(url, params=params, files=files)
        else:
            print(f"[*] Triggering processing for scenario: {scenario}")
            res = requests.post(url, params=params)
        
        res.raise_for_status()
        print("[+] Pipeline execution successful.")
        
        geojson = res.json()
        
        # Build the structured report from the geojson response
        report = {
            "title": "SIH26057 — Marine Debris Clearance Dossier",
            "system": "AI-Powered Automated Underwater Marine Debris Detection",
            "total_detections": len(geojson.get("features", [])),
            "detections": []
        }
        
        for idx, feature in enumerate(geojson.get("features", [])):
            props = feature.get("properties", {})
            geom = feature.get("geometry", {})
            coords = geom.get("coordinates", [0, 0])
            
            report["detections"].append({
                "id": idx,
                "class": props.get("class_label"),
                "threat": props.get("threat_level"),
                "confidence": props.get("confidence"),
                "dimensions": props.get("dimensions", {}),
                "h_target_m": props.get("h_target_m"),
                "mvb": props.get("mvb", {}),
                "coordinates": coords,
                "slant_range_m": props.get("slant_range_m")
            })
            
        return report
    except Exception as e:
        print(f"[-] Error during upload/processing: {e}")
        sys.exit(1)

def save_json(report, out_path):
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2)
    print(f"[+] JSON report saved to: {out_path}")

def save_csv(report, out_path):
    detections = report.get("detections", [])
    if not detections:
        print("[-] No detections found to save in CSV.")
        return
    
    headers = [
        "id", "class", "threat", "confidence",
        "latitude", "longitude", 
        "length_m", "width_m", "height_m", "volume_m3", "slant_range_m"
    ]
    
    with open(out_path, "w", encoding="utf-8", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(headers)
        
        for det in detections:
            coords = det.get("coordinates", [0, 0])
            dims = det.get("dimensions", {})
            mvb = det.get("mvb", {})
            
            row = [
                det.get("id"),
                det.get("class"),
                det.get("threat"),
                det.get("confidence"),
                coords[1], # lat
                coords[0], # lon
                dims.get("length_m"),
                dims.get("width_m"),
                dims.get("height_m"),
                mvb.get("volume_m3", ""),
                det.get("slant_range_m")
            ]
            writer.writerow(row)
    print(f"[+] CSV report saved to: {out_path}")

def main():
    parser = argparse.ArgumentParser(description="SIH26057 Sonar Data Parsing Script")
    parser.add_argument("--file", type=str, help="Path to raw sonar image to upload (optional).")
    parser.add_argument("--scenario", type=str, default="gost_net1", help="Pre-built scenario to use if no file is uploaded (default: gost_net1).")
    parser.add_argument("--format", type=str, choices=["json", "csv"], default="json", help="Output format: json or csv (default: json).")
    parser.add_argument("--out", type=str, help="Output file path (default: report.[format])")
    
    args = parser.parse_args()
    
    if not check_backend():
        sys.exit(1)
        
    report = process_and_get_report(args.file, args.scenario)
    
    out_file = args.out or f"report.{args.format}"
    
    if args.format == "json":
        save_json(report, out_file)
    else:
        save_csv(report, out_file)

if __name__ == "__main__":
    main()
