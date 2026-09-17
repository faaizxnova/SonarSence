"""
SIH26057 — Configuration & Physical Constants
=============================================

All values are grounded in real-world side-scan sonar survey parameters.
These constants drive the preprocessing pipeline, simulated inference,
and GeoJSON coordinate generation.
"""

import numpy as np

# ─────────────────────────────────────────────────────────────
# SONAR HARDWARE PARAMETERS
# Modeled after a typical 600 kHz side-scan (e.g., EdgeTech 4125)
# ─────────────────────────────────────────────────────────────
SONAR_FREQUENCY_KHZ = 600               # Operating frequency (kHz)
TOWFISH_ALTITUDE_M = 8.0                 # Height of towfish above seabed (meters)
SLANT_RANGE_MAX_M = 75.0                 # Maximum slant range per channel (meters)
SPEED_OF_SOUND_MS = 1500.0               # Speed of sound in seawater (m/s)
PING_RATE_HZ = 10.0                      # Ping repetition rate (Hz)
ALONG_TRACK_SPEED_MS = 1.5              # Survey vessel speed (m/s) — ~3 knots

# ─────────────────────────────────────────────────────────────
# IMAGE GEOMETRY
# Defines the pixel-to-physical mapping of the sonar waterfall
# ─────────────────────────────────────────────────────────────
WATERFALL_WIDTH_PX = 1024                # Cross-track pixels (both channels combined)
WATERFALL_HEIGHT_PX = 512                # Along-track pixels (scroll buffer depth)
PIXEL_RESOLUTION_M = (2 * SLANT_RANGE_MAX_M) / WATERFALL_WIDTH_PX  # ~0.146 m/px

# ─────────────────────────────────────────────────────────────
# SURVEY AREA — Simulated WGS84 Origin
# Set to a realistic coastal survey zone in the Bay of Bengal
# (off the coast of Visakhapatnam, India — relevant for MoES)
# ─────────────────────────────────────────────────────────────
SURVEY_ORIGIN_LAT = 17.7215              # Latitude (degrees N)
SURVEY_ORIGIN_LON = 83.3119              # Longitude (degrees E)
SURVEY_HEADING_DEG = 45.0                # Survey line bearing (degrees from N)

# Approximate meters-per-degree at this latitude
METERS_PER_DEG_LAT = 111_320.0
METERS_PER_DEG_LON = 111_320.0 * np.cos(np.radians(SURVEY_ORIGIN_LAT))

# ─────────────────────────────────────────────────────────────
# DEBRIS CLASSIFICATION TAXONOMY (12 Expanded Classes)
# Based on UNEP/NOAA/MoES marine debris classification standards
# ─────────────────────────────────────────────────────────────
DEBRIS_CLASSES = {
    0:  {"label": "ghost_net",              "description": "Derelict fishing gear / mono-filament net cluster", "threat": "HIGH"},
    1:  {"label": "shipping_container",     "description": "ISO 20ft/40ft intermodal freight container",       "threat": "HIGH"},
    2:  {"label": "unexploded_ordnance_uxo","description": "Submerged naval projectile / aerial bomb",         "threat": "HIGH"},
    3:  {"label": "moored_sea_mine",        "description": "Naval contact / moored spherical sea mine",        "threat": "HIGH"},
    4:  {"label": "aircraft_fuselage",      "description": "Submerged aircraft fuselage & engine nacelle",     "threat": "HIGH"},
    5:  {"label": "chemical_drum",          "description": "Corroded 55-gallon hazardous chemical drum",       "threat": "HIGH"},
    6:  {"label": "mooring_anchor_chain",   "description": "Heavy ship fluke anchor & stud-link chain",        "threat": "MEDIUM"},
    7:  {"label": "pipeline_trench_scour",  "description": "Subsea transmission pipeline & scour trench",      "threat": "MEDIUM"},
    8:  {"label": "wooden_shipwreck",       "description": "Sunken wooden/composite vessel hull & ribs",       "threat": "MEDIUM"},
    9:  {"label": "submerged_vehicle",      "description": "Automotive chassis / sunken motor vehicle",        "threat": "MEDIUM"},
    10: {"label": "plastic_debris_bales",   "description": "Compacted plastic waste bale accumulation",        "threat": "MEDIUM"},
    11: {"label": "discarded_tires_reef",   "description": "Artificial tire reef / heavy vehicle tires",       "threat": "LOW"},
    12: {"label": "unknown_anomaly",        "description": "Unclassified anthropogenic acoustic target",        "threat": "UNKNOWN"},
}

# ─────────────────────────────────────────────────────────────
# PREPROCESSING ALGORITHM CONFIGURATIONS
# ─────────────────────────────────────────────────────────────
LEE_FILTER_WINDOW_SIZE = 7               # Kernel size (must be odd)
LEE_FILTER_NOISE_VAR = None              # None = auto-estimate from image

# TVG (Time-Varying Gain)
TVG_ALPHA_DB_M = 0.05                    # Acoustic seawater absorption at 600 kHz (dB/m)
TVG_GAIN_SCALE = 1.6                     # TVG intensity scale

# SRAD (Speckle Reducing Anisotropic Diffusion)
SRAD_NUM_ITERS = 5                       # Diffusion iterations
SRAD_LAMBDA = 0.15                       # Numerical stability step size

# ─────────────────────────────────────────────────────────────
# SIMULATED DETECTIONS SEED
# ─────────────────────────────────────────────────────────────
RANDOM_SEED = 42

