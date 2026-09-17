"""
SIH26057 — FastAPI Application Entry Point
============================================

AI-Powered Automated Underwater Marine Debris Detection System
using Side-Scan Sonar Imagery.

Architecture:
    - FastAPI backend serving the acoustic preprocessing + AI inference pipeline
    - CORS enabled for Next.js frontend on localhost:3000
    - All endpoints under /api/v1 prefix
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routers import sonar

# ─────────────────────────────────────────────────────────────
# Application Factory
# ─────────────────────────────────────────────────────────────
app = FastAPI(
    title="SIH26057 — Marine Debris Detection API",
    description=(
        "AI-Powered Automated Underwater Marine Debris Detection System "
        "using Side-Scan Sonar Imagery. Implements Adaptive Lee Filter, "
        "Slant-to-Ground Range Correction, and simulated YOLOv8-Seg "
        "dual-head inference for highlight-shadow pair detection."
    ),
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

# ─────────────────────────────────────────────────────────────
# CORS Middleware
# Allows the Next.js frontend to communicate with this backend
# ─────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",     # Next.js dev server
        "http://127.0.0.1:3000",
        "http://localhost:3001",     # Alternate port
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─────────────────────────────────────────────────────────────
# Register Routers
# ─────────────────────────────────────────────────────────────
app.include_router(sonar.router)


# ─────────────────────────────────────────────────────────────
# Root Endpoint
# ─────────────────────────────────────────────────────────────
@app.get("/")
async def root():
    return {
        "system": "SIH26057 — AI-Powered Marine Debris Detection",
        "status": "operational",
        "docs": "/docs",
        "endpoints": {
            "upload": "POST /api/v1/upload",
            "detections": "GET /api/v1/detections",
            "sonar_image": "GET /api/v1/sonar-image",
            "report": "POST /api/v1/report",
            "health": "GET /api/v1/health",
        }
    }


if __name__ == "__main__":
    import uvicorn
    print("[SIH26057] Starting FastAPI Backend on http://127.0.0.1:8000 ...")
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)


