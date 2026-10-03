"use client";

import { useMemo, type ReactNode } from "react";
import { APIProvider, Map, Marker, Polygon } from "@vis.gl/react-google-maps";

const KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY ?? "";
export const mapsAvailable = KEY.length > 0;

export const AKURE_CENTRE = { lat: 7.2526, lng: 5.1931 };

export type LatLng = { lat: number; lng: number };
/** [lng, lat], the order settings.geofence stores (GeoJSON). */
export type Ring = [number, number][];

function MapFrame({ children, height = 320 }: { children: ReactNode; height?: number }) {
  return (
    <div className="overflow-hidden rounded-card ring-1 ring-line-strong" style={{ height }}>
      <APIProvider apiKey={KEY}>{children}</APIProvider>
    </div>
  );
}

/** Drag the pin to place a market. Callers fall back to number inputs when maps are unavailable. */
export function PinPicker({ value, onChange }: { value: LatLng; onChange: (p: LatLng) => void }) {
  return (
    <MapFrame>
      <Map
        defaultCenter={value}
        defaultZoom={16}
        gestureHandling="greedy"
        disableDefaultUI
        zoomControl
        onClick={(e) => e.detail.latLng && onChange(e.detail.latLng)}
      >
        <Marker
          position={value}
          draggable
          onDragEnd={(e) => {
            const p = e.latLng;
            if (p) onChange({ lat: p.lat(), lng: p.lng() });
          }}
        />
      </Map>
    </MapFrame>
  );
}

/** Drag the polygon's corners; click an edge midpoint to add a corner. */
export function GeofenceMap({ ring, onChange, markers = [] }: { ring: Ring; onChange: (ring: Ring) => void; markers?: LatLng[] }) {
  const paths = useMemo(() => ring.map(([lng, lat]) => ({ lat, lng })), [ring]);
  const centre = useMemo(() => {
    if (!ring.length) return AKURE_CENTRE;
    const lat = ring.reduce((s, p) => s + p[1], 0) / ring.length;
    const lng = ring.reduce((s, p) => s + p[0], 0) / ring.length;
    return { lat, lng };
  }, [ring]);

  return (
    <MapFrame height={520}>
      <Map defaultCenter={centre} defaultZoom={12} gestureHandling="greedy" disableDefaultUI zoomControl>
        <Polygon
          paths={paths}
          editable
          strokeColor="#15803D"
          strokeWeight={2}
          fillColor="#15803D"
          fillOpacity={0.12}
          onPathsChanged={(next) => {
            const outer = next[0];
            if (outer) onChange(outer.map((p) => [round6(p.lng()), round6(p.lat())]));
          }}
        />
        {markers.map((m, i) => (
          <Marker key={i} position={m} />
        ))}
      </Map>
    </MapFrame>
  );
}

const round6 = (n: number) => Math.round(n * 1e6) / 1e6;
