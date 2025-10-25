import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Lot } from '@/types/parking';

interface MapViewProps {
  lots: Lot[];
  onLotClick?: (lotId: string) => void;
  userLocation?: { lat: number; lng: number };
}

const MapView = ({ lots, onLotClick, userLocation }: MapViewProps) => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<L.Map | null>(null);
  const markersRef = useRef<L.Marker[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!mapContainer.current || mapInstance.current) return;

    // Initialize map centered on OSU campus
    const map = L.map(mapContainer.current, {
      zoomControl: true,
    }).setView([40.0067, -83.0305], 15);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(map);

    mapInstance.current = map;
    setIsLoading(false);

    return () => {
      map.remove();
      mapInstance.current = null;
    };
  }, []);

  useEffect(() => {
    if (!mapInstance.current || isLoading) return;

    // Clear existing markers
    markersRef.current.forEach(marker => marker.remove());
    markersRef.current = [];

    // Add lot markers
    lots.forEach(lot => {
      const occupancyRate = lot.capacity > 0 ? lot.occupied / lot.capacity : 0;
      const iconColor = occupancyRate > 0.9 ? '#D14343' : occupancyRate > 0.7 ? '#FF8C42' : '#2DA44E';

      const icon = L.divIcon({
        className: 'custom-lot-marker',
        html: `
          <div style="
            background: ${iconColor};
            border: 3px solid white;
            border-radius: 50%;
            width: 40px;
            height: 40px;
            display: flex;
            align-items: center;
            justify-content: center;
            box-shadow: 0 2px 8px rgba(0,0,0,0.3);
            cursor: pointer;
            transition: transform 0.2s;
          ">
            <span style="color: white; font-weight: bold; font-size: 14px;">${lot.open}</span>
          </div>
        `,
        iconSize: [40, 40],
        iconAnchor: [20, 20],
      });

      const marker = L.marker([lot.location.lat, lot.location.lng], { icon })
        .addTo(mapInstance.current!)
        .bindPopup(`
          <div style="padding: 8px; min-width: 180px;">
            <strong style="font-size: 14px; color: #1a1a1a;">${lot.name}</strong>
            <div style="margin-top: 8px; font-size: 13px; color: #666;">
              <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
                <span>Open:</span>
                <strong style="color: ${iconColor};">${lot.open} / ${lot.capacity}</strong>
              </div>
              <div style="font-size: 11px; color: #999; margin-top: 4px;">
                Updated ${getTimeAgo(lot.updatedAt)}
              </div>
            </div>
          </div>
        `);

      marker.on('click', () => {
        if (onLotClick) {
          onLotClick(lot.id);
        }
      });

      markersRef.current.push(marker);
    });

    // Add user location marker if available
    if (userLocation) {
      const userIcon = L.divIcon({
        className: 'user-location-marker',
        html: `
          <div style="
            background: #4A90E2;
            border: 4px solid white;
            border-radius: 50%;
            width: 20px;
            height: 20px;
            box-shadow: 0 2px 8px rgba(74, 144, 226, 0.6);
          "></div>
        `,
        iconSize: [20, 20],
        iconAnchor: [10, 10],
      });

      const userMarker = L.marker([userLocation.lat, userLocation.lng], { icon: userIcon })
        .addTo(mapInstance.current!)
        .bindPopup('<strong>Your Location</strong>');

      markersRef.current.push(userMarker);
    }
  }, [lots, onLotClick, userLocation, isLoading]);

  return <div ref={mapContainer} className="w-full h-full rounded-lg shadow-md" />;
};

function getTimeAgo(isoString: string): string {
  const now = new Date();
  const then = new Date(isoString);
  const diffMs = now.getTime() - then.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${Math.floor(diffHours / 24)}d ago`;
}

export default MapView;
