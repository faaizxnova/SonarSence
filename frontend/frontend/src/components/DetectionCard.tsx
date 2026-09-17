"use client";

/**
 * Detection Card — full metadata for a selected debris detection:
 * classification, threat badge, physical dimensions & 3D MVB volume,
 * WGS84 coordinates, acoustic parameters, and confidence score.
 */

import React from "react";
import type { DetectionFeature } from "@/lib/types";

interface DetectionCardProps {
  detection: DetectionFeature;
  onClose?: () => void;
  onOpenMVB?: () => void;
}

export default function DetectionCard({ detection, onClose, onOpenMVB }: DetectionCardProps) {
  const props = detection.properties;
  const [lon, lat] = detection.geometry.coordinates;

  const threatClass = `threat-${props.threat_level.toLowerCase()}`;
  const volumeM3 = props.mvb?.volume_m3 || (props.dimensions.width_m * props.dimensions.length_m * props.h_target_m);
  const footprintM2 = props.mvb?.footprint_area_m2 || (props.dimensions.width_m * props.dimensions.length_m);

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm" style={{ maxWidth: 320 }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div
            className="w-3 h-3 rounded-full"
            style={{
              background: props.marker_color,
              boxShadow: `0 0 6px ${props.marker_color}`,
            }}
          />
          <span className="text-sm font-bold uppercase tracking-wide font-mono text-slate-900">
            {props.class_label.replace(/_/g, " ")}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className={`status-badge ${threatClass} !text-[10px]`}>
            {props.threat_level}
          </span>
          {onClose && (
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-slate-700 transition-colors cursor-pointer text-sm p-1"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Confidence Bar */}
      <div className="mb-3">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-mono text-slate-500">
            YOLOv8-Seg Confidence
          </span>
          <span className="text-xs font-bold font-mono text-sky-700">
            {(props.confidence * 100).toFixed(1)}%
          </span>
        </div>
        <div className="h-1.5 rounded-full overflow-hidden bg-slate-100">
          <div
            className="h-full rounded-full transition-all duration-500 bg-sky-600"
            style={{
              width: `${props.confidence * 100}%`,
            }}
          />
        </div>
      </div>

      {/* Data Grid */}
      <div className="space-y-2 font-mono text-xs">
        {/* Target Height & 3D Volume Banner */}
        <div className="p-2.5 rounded-lg bg-sky-50 border border-sky-200">
          <div className="flex items-center justify-between">
            <span className="text-xs text-amber-800 font-bold">
              H_relief: {props.h_target_m.toFixed(3)} m
            </span>
            <span className="text-xs text-sky-800 font-bold">
              3D Vol: {volumeM3.toFixed(2)} m³
            </span>
          </div>
          <div className="text-[10px] mt-1 text-slate-600">
            Seabed Footprint: {footprintM2.toFixed(2)} m² • {props.channel.toUpperCase()} Swath
          </div>
        </div>

        {/* 3D MVB Inspector Launch Button */}
        {onOpenMVB && (
          <button
            onClick={onOpenMVB}
            className="w-full py-1.5 px-3 rounded-lg text-xs font-mono font-semibold bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
            </svg>
            Inspect 3D MVB Box
          </button>
        )}

        {/* Dimensions */}
        <DataRow
          label="Physical Size (L×W×H)"
          value={`${props.dimensions.length_m} × ${props.dimensions.width_m} × ${props.dimensions.height_m} m`}
        />

        {/* Acoustic Parameters */}
        <DataRow
          label="Slant Range (R_slant)"
          value={`${props.slant_range_m.toFixed(1)} m`}
        />
        <DataRow label="Sonar Channel" value={props.channel.toUpperCase()} />
        <DataRow label="Seabed Depth" value={`${props.depth_m} m`} />

        {/* Coordinates */}
        <DataRow
          label="Latitude (WGS84)"
          value={`${lat.toFixed(6)}° N`}
        />
        <DataRow
          label="Longitude (WGS84)"
          value={`${lon.toFixed(6)}° E`}
        />

        {/* Mensuration Parameters */}
        <div className="pt-2 mt-2 border-t border-slate-100">
          <span className="text-[10px] font-bold uppercase tracking-wider block mb-1 text-slate-400">
            Acoustic Ray-Trace Provenance
          </span>
          <DataRow
            label="L_shadow"
            value={`${props.mensuration.parameters.L_shadow_m.toFixed(2)} m (${props.mensuration.parameters.L_shadow_px} px)`}
          />
          <DataRow
            label="H_towfish"
            value={`${props.mensuration.parameters.H_towfish_m} m`}
          />
          <DataRow
            label="R_slant"
            value={`${props.mensuration.parameters.R_slant_m.toFixed(1)} m`}
          />
        </div>
      </div>
    </div>
  );
}

function DataRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-0.5 text-xs">
      <span className="text-slate-500">{label}</span>
      <span className="font-semibold text-slate-800">{value}</span>
    </div>
  );
}
