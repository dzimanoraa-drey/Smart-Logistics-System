import { useEffect, useRef } from "react";
import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import { WAREHOUSE_ADDRESS, WAREHOUSE_LOCATION } from "./constants";

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

async function reverseGeocode(lat, lng) {
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`);
    const data = await res.json();
    return data.display_name || `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  } catch (err) {
    return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  }
}

function ClickHandler({ setDeliveryLocation, setDeliveryAddress }) {
  useMapEvents({
    async click(e) {
      const { lat, lng } = e.latlng;
      const address = await reverseGeocode(lat, lng);
      setDeliveryLocation([lat, lng]);
      setDeliveryAddress(address);
    },
  });
  return null;
}

function SizeFix() {
  const map = useMap();
  useEffect(() => {
    const timer = setTimeout(() => map.invalidateSize(), 150);
    return () => clearTimeout(timer);
  }, [map]);
  return null;
}

export default function MapPicker({ deliveryLocation, setDeliveryLocation, setDeliveryAddress }) {
  const instanceId = useRef(Math.random().toString(36).slice(2));

  return (
    <div>
      <p style={{ fontSize: "12.5px", color: "#6b7280", margin: "0 0 8px" }}>
        The warehouse is fixed as the pickup point: <strong>{WAREHOUSE_ADDRESS}</strong>.
        Click the map to set or change the delivery location.
      </p>
      <MapContainer
        key={instanceId.current}
        center={deliveryLocation || WAREHOUSE_LOCATION}
        zoom={12}
        style={{ height: "300px", width: "100%", borderRadius: "10px" }}
      >
        <TileLayer
          attribution="&copy; OpenStreetMap contributors"
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <SizeFix />
        <ClickHandler
          setDeliveryLocation={setDeliveryLocation}
          setDeliveryAddress={setDeliveryAddress}
        />
        <Marker position={WAREHOUSE_LOCATION} />
        {deliveryLocation && <Marker position={deliveryLocation} />}
      </MapContainer>
    </div>
  );
}
