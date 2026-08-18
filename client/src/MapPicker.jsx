import {
  MapContainer,
  TileLayer,
  Marker,
  useMapEvents,
} from "react-leaflet";

import L from "leaflet";
import "leaflet/dist/leaflet.css";

const pickupIcon = new L.Icon({
  iconUrl:
    "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-green.png",
  shadowUrl:
    "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});

const deliveryIcon = new L.Icon({
  iconUrl:
    "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png",
  shadowUrl:
    "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});

function MapClickHandler({
  active,
  setPickupLocation,
  setDeliveryLocation,
  setPickupAddress,
  setDeliveryAddress,
}) {
  useMapEvents({
    async click(e) {
      const location = [e.latlng.lat, e.latlng.lng];

      try {
        const response = await fetch(
          `https://nominatim.openstreetmap.org/reverse?format=json&lat=${location[0]}&lon=${location[1]}`
        );

        const data = await response.json();
        const address = data.display_name || "Selected map location";

        if (active === "pickup") {
          setPickupLocation(location);
          setPickupAddress(address);
        } else {
          setDeliveryLocation(location);
          setDeliveryAddress(address);
        }
      } catch (error) {
        console.error("Reverse geocoding failed:", error);

        if (active === "pickup") {
          setPickupLocation(location);
        } else {
          setDeliveryLocation(location);
        }
      }
    },
  });

  return null;
}

function MapPicker({
  active,
  pickupLocation,
  deliveryLocation,
  setPickupLocation,
  setDeliveryLocation,
  setPickupAddress,
  setDeliveryAddress,
}) {
  const defaultPosition = [-27.4698, 153.0251];

  return (
    <MapContainer
      center={pickupLocation || deliveryLocation || defaultPosition}
      zoom={11}
      style={{
        height: "350px",
        width: "100%",
        borderRadius: "12px",
      }}
    >
      <TileLayer
        attribution="&copy; OpenStreetMap contributors"
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      <MapClickHandler
        active={active}
        setPickupLocation={setPickupLocation}
        setDeliveryLocation={setDeliveryLocation}
        setPickupAddress={setPickupAddress}
        setDeliveryAddress={setDeliveryAddress}
      />

      {pickupLocation && (
        <Marker position={pickupLocation} icon={pickupIcon} />
      )}

      {deliveryLocation && (
        <Marker position={deliveryLocation} icon={deliveryIcon} />
      )}
    </MapContainer>
  );
}

export default MapPicker;