"use client";

import { useEffect, useRef, type RefObject } from "react";
import * as maplibregl from "maplibre-gl";
import type { GeoJSONSource, Map as MapLibreMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

/**
 * Ops maps on MapLibre with OpenFreeMap's free OpenStreetMap tiles: no key, no billing, same
 * style as the app. Kept tiny and imperative; the two editors below are all ops needs.
 */
const STYLE = "https://tiles.openfreemap.org/styles/liberty";
const BRAND = "#15803D";

/** Always true now there's no API key to configure. Kept so pages can still check. */
export const mapsAvailable = true;

export const AKURE_CENTRE = { lat: 7.2526, lng: 5.1931 };

export type LatLng = { lat: number; lng: number };
/** [lng, lat], the order settings.geofence stores (GeoJSON). */
export type Ring = [number, number][];

const round6 = (n: number) => Math.round(n * 1e6) / 1e6;

/** Creates the map once for a container and tears it down on unmount. */
function useMap(container: RefObject<HTMLDivElement | null>, centre: LatLng, zoom: number, onReady: (map: MapLibreMap) => void) {
  const mapRef = useRef<MapLibreMap | null>(null);
  const ready = useRef(onReady);
  ready.current = onReady;
  useEffect(() => {
    if (!container.current) return;
    const map = new maplibregl.Map({
      container: container.current,
      style: STYLE,
      center: [centre.lng, centre.lat],
      zoom,
      dragRotate: false,
      pitchWithRotate: false,
      attributionControl: { compact: true },
    });
    map.touchZoomRotate.disableRotation();
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    map.on("load", () => ready.current(map));
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
    // The map is created once; later centre changes move markers, not the camera.
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return mapRef;
}

function Frame({ height, refEl }: { height: number; refEl: RefObject<HTMLDivElement | null> }) {
  return <div ref={refEl} className="overflow-hidden rounded-card ring-1 ring-line-strong" style={{ height }} />;
}

function dot(size: number, filled: boolean): HTMLDivElement {
  const el = document.createElement("div");
  el.style.cssText = `width:${size}px;height:${size}px;border-radius:999px;border:2px solid ${BRAND};background:${filled ? "#FFFFFF" : "rgba(255,255,255,0.7)"};cursor:${filled ? "grab" : "copy"};box-shadow:0 1px 3px rgba(0,0,0,0.25)`;
  return el;
}

/** Drag the pin, or click the map, to place a market. */
export function PinPicker({ value, onChange }: { value: LatLng; onChange: (p: LatLng) => void }) {
  const el = useRef<HTMLDivElement>(null);
  const marker = useRef<maplibregl.Marker | null>(null);
  const change = useRef(onChange);
  change.current = onChange;

  useMap(el, value, 16, (map) => {
    const m = new maplibregl.Marker({ color: BRAND, draggable: true }).setLngLat([value.lng, value.lat]).addTo(map);
    m.on("dragend", () => {
      const p = m.getLngLat();
      change.current({ lat: round6(p.lat), lng: round6(p.lng) });
    });
    map.on("click", (e) => change.current({ lat: round6(e.lngLat.lat), lng: round6(e.lngLat.lng) }));
    marker.current = m;
  });

  useEffect(() => {
    marker.current?.setLngLat([value.lng, value.lat]);
  }, [value.lat, value.lng]);

  return <Frame height={320} refEl={el} />;
}

/**
 * The delivery area: drag a corner to move it, click a faint midpoint to add a corner, and
 * double-click a corner to remove it (a ring keeps at least three).
 */
export function GeofenceMap({ ring, onChange, markers = [] }: { ring: Ring; onChange: (ring: Ring) => void; markers?: LatLng[] }) {
  const el = useRef<HTMLDivElement>(null);
  const handles = useRef<maplibregl.Marker[]>([]);
  const pins = useRef<maplibregl.Marker[]>([]);
  const latest = useRef({ ring, onChange });
  latest.current = { ring, onChange };
  const loaded = useRef<MapLibreMap | null>(null);

  const centre = ring.length
    ? { lat: ring.reduce((s, p) => s + p[1], 0) / ring.length, lng: ring.reduce((s, p) => s + p[0], 0) / ring.length }
    : AKURE_CENTRE;

  const draw = (map: MapLibreMap) => {
    const r = latest.current.ring;
    const closed = r.length ? [...r, r[0]!] : [];
    (map.getSource("area") as GeoJSONSource | undefined)?.setData({
      type: "Feature",
      properties: {},
      geometry: { type: "Polygon", coordinates: [closed] },
    });

    for (const h of handles.current) h.remove();
    handles.current = [];
    r.forEach(([lng, lat], i) => {
      const h = new maplibregl.Marker({ element: dot(16, true), draggable: true }).setLngLat([lng, lat]).addTo(map);
      h.getElement().title = "Drag to move. Double-click to remove.";
      h.on("dragend", () => {
        const p = h.getLngLat();
        const next = latest.current.ring.map((pt, k) => (k === i ? ([round6(p.lng), round6(p.lat)] as [number, number]) : pt));
        latest.current.onChange(next);
      });
      h.getElement().addEventListener("dblclick", (e) => {
        e.stopPropagation();
        const cur = latest.current.ring;
        if (cur.length > 3) latest.current.onChange(cur.filter((_, k) => k !== i));
      });
      handles.current.push(h);

      const [nlng, nlat] = r[(i + 1) % r.length]!;
      const mid = new maplibregl.Marker({ element: dot(10, false) }).setLngLat([(lng + nlng) / 2, (lat + nlat) / 2]).addTo(map);
      mid.getElement().title = "Click to add a corner here";
      mid.getElement().addEventListener("click", (e) => {
        e.stopPropagation();
        const cur = latest.current.ring;
        const at: [number, number] = [round6((lng + nlng) / 2), round6((lat + nlat) / 2)];
        latest.current.onChange([...cur.slice(0, i + 1), at, ...cur.slice(i + 1)]);
      });
      handles.current.push(mid);
    });
  };

  /** Markets, in pepper, so ops can see the area covers them. */
  const drawPins = (map: MapLibreMap) => {
    for (const p of pins.current) p.remove();
    pins.current = markers.map((m) => new maplibregl.Marker({ color: "#B8401A", scale: 0.7 }).setLngLat([m.lng, m.lat]).addTo(map));
  };

  useMap(el, centre, 12, (map) => {
    map.addSource("area", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
    map.addLayer({ id: "area-fill", type: "fill", source: "area", paint: { "fill-color": BRAND, "fill-opacity": 0.12 } });
    map.addLayer({ id: "area-line", type: "line", source: "area", paint: { "line-color": BRAND, "line-width": 2 } });
    loaded.current = map;
    draw(map);
    drawPins(map);
  });

  // Redraw when the ring changes (drags, added or removed corners, or the form's undo).
  useEffect(() => {
    if (loaded.current) draw(loaded.current);
  }, [ring]); // eslint-disable-line react-hooks/exhaustive-deps

  const markersKey = markers.map((m) => `${m.lat},${m.lng}`).join(";");
  useEffect(() => {
    if (loaded.current) drawPins(loaded.current);
  }, [markersKey]); // eslint-disable-line react-hooks/exhaustive-deps

  return <Frame height={520} refEl={el} />;
}
