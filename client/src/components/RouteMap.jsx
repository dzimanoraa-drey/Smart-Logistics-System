import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import { useEffect } from 'react';

const createStopIcon = (number, type) =>
  L.divIcon({
    className: 'route-stop-marker',
    html: `<div title="Delivery" style="width:30px;height:30px;border-radius:50%;background:#17324d;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.25);">${number}</div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
  });

const startIcon = L.divIcon({
  className: 'route-start-marker',
  html: '<div style="width:32px;height:32px;border-radius:50%;background:#198754;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.25);">S</div>',
  iconSize: [32, 32],
  iconAnchor: [16, 16],
});

function FitRouteBounds({ positions }) {
  const map = useMap();

  useEffect(() => {
    if (positions.length > 1) {
      map.fitBounds(L.latLngBounds(positions), { padding: [30, 30] });
    }
  }, [map, positions]);

  return null;
}

export default function RouteMap({ route, startLocation, routeCoordinates }) {
  if (!route?.length) return null;

  const markerPositions = [
    ...(startLocation ? [startLocation] : []),
    ...route.map((stop) => stop.location || stop.deliveryLocation),
  ];

  const roadRoute = routeCoordinates?.length > 1 ? routeCoordinates : markerPositions;
  const boundsPositions = routeCoordinates?.length > 1 ? routeCoordinates : markerPositions;
  const center = markerPositions[0];

  return (
    <MapContainer
      center={center}
      zoom={12}
      style={{ height: '350px', width: '100%', borderRadius: '12px' }}
      scrollWheelZoom
    >
      <TileLayer
        attribution='&copy; OpenStreetMap contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      <FitRouteBounds positions={boundsPositions} />

      {startLocation && (
        <Marker position={startLocation} icon={startIcon}>
          <Popup>Route Start</Popup>
        </Marker>
      )}

      {route.map((stop, index) => (
        <Marker
          key={`${stop.type}-${stop.jobId}-${index}`}
          position={stop.location || stop.deliveryLocation}
          icon={createStopIcon(index + 1, stop.type)}
        >
          <Popup>
            <strong>{stop.jobId}</strong><br />
            {stop.customer}<br />
            Delivery<br />
            Stop {index + 1}
          </Popup>
        </Marker>
      ))}

      <Polyline positions={roadRoute} color="blue" weight={5} opacity={0.85} />
    </MapContainer>
  );
}
