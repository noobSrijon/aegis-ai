"use client";

import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix for default marker icon issue in Leaflet with Next.js
const DefaultIcon = L.icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});

L.Marker.prototype.options.icon = DefaultIcon;

function ChangeView({ center }: { center: [number, number] }) {
  const map = useMap();
  useEffect(() => {
    map.setView(center, 15);
  }, [center, map]);
  return null;
}

interface MapProps {
  location: { lat: number; lon: number } | null;
}

export default function Map({ location }: MapProps) {
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  if (!isMounted || !location) {
    return (
      <div className="w-full h-full bg-slate-100 flex items-center justify-center rounded-2xl border border-border">
        <p className="text-slate-400 font-mono text-[10px] uppercase tracking-widest">
          {!location ? "Awaiting Signal..." : "Initializing Map..."}
        </p>
      </div>
    );
  }

  const center: [number, number] = [location.lat, location.lon];

  return (
    <div className="w-full h-full rounded-2xl overflow-hidden border border-border bg-white">
      <MapContainer 
        center={center} 
        zoom={15} 
        scrollWheelZoom={false}
        style={{ height: '100%', width: '100%' }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <Marker position={center}>
          <Popup>
            User's Last Location
          </Popup>
        </Marker>
        <ChangeView center={center} />
      </MapContainer>
    </div>
  );
}
