import { useState, useEffect } from 'react'
import { FaTruck } from 'react-icons/fa'
import './App.css'
import MapPicker from "./MapPicker";
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  Polyline,
} from "react-leaflet";

import L from "leaflet";

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

const defaultDeliveries = [
  {
    id: "RR001",
    customer: "ABC Pty Ltd",
    driver: "John",
    status: "Assigned",
    priority: "High",
  },
  {
    id: "RR002",
    customer: "Metro Supplies",
    driver: "Sarah",
    status: "In Transit",
    priority: "Medium",
  },
  {
    id: "RR003",
    customer: "Brisbane Retail",
    driver: "Michael",
    status: "Pending",
    priority: "High",
  },
];

function calculateDistance(start, end) {

  if (!start || !end) return null;

  const R = 6371;

  const dLat =
    ((end[0] - start[0]) * Math.PI) / 180;

  const dLon =
    ((end[1] - start[1]) * Math.PI) / 180;

  const lat1 =
    (start[0] * Math.PI) / 180;

  const lat2 =
    (end[0] * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) *
      Math.sin(dLat / 2) +
    Math.cos(lat1) *
      Math.cos(lat2) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c =
    2 *
    Math.atan2(
      Math.sqrt(a),
      Math.sqrt(1 - a)
    );

  return (R * c).toFixed(2);
}
function estimateTime(distance) {

  if (!distance) return "";

  const averageSpeed = 40;

  const hours = distance / averageSpeed;

  const minutes = Math.round(hours * 60);

  return `${minutes} mins`;

}


function App() {

  const [showForm, setShowForm] = useState(false)
  const [editingDelivery, setEditingDelivery] = useState(null);
  const [currentView, setCurrentView] = useState('dispatcher')
  const [isLoggedIn, setIsLoggedIn] = useState(false)

const [loginData, setLoginData] = useState({
  email: '',
  password: '',
  role: 'dispatcher',
})

const [loginError, setLoginError] = useState('')
  const [selectedDelivery, setSelectedDelivery] = useState(null)
const [showProofForm, setShowProofForm] = useState(false)
const [trackingId, setTrackingId] = useState('')
const [trackedDelivery, setTrackedDelivery] = useState(null)
const [trackingError, setTrackingError] = useState('')
const [proofData, setProofData] = useState({
  signature: '',
  photo: null,
  gpsLocation: '',
  timestamp: '',
})
const distance =
  selectedDelivery?.pickupLocation &&
  selectedDelivery?.deliveryLocation
    ? calculateDistance(
        selectedDelivery.pickupLocation,
        selectedDelivery.deliveryLocation
      )
    : null;

const estimatedTime =
  distance
    ? estimateTime(distance)
    : "N/A";
  const [deliveries, setDeliveries] = useState(() => {

  const saved = localStorage.getItem("deliveries");

  return saved
    ? JSON.parse(saved)
    : defaultDeliveries;

});
  const drivers = [
  'John',
  'Sarah',
  'Michael',
  'Emily',
]

  const [formData, setFormData] = useState({
    customer: '',
    pickupAddress: '',
    deliveryAddress: '',
    priority: 'Medium',
    deliveryDate: '',
    deliveryTime: '',
  })

  const [pickupLocation, setPickupLocation] = useState(null);

const [deliveryLocation, setDeliveryLocation] = useState(null);

const [activePin, setActivePin] = useState("pickup");

const [pickupSuggestions, setPickupSuggestions] = useState([]);
const [deliverySuggestions, setDeliverySuggestions] = useState([]);

const searchAddress = async (text, type) => {

  if (text.length < 3) {

    if (type === "pickup")
      setPickupSuggestions([]);

    else
      setDeliverySuggestions([]);

    return;
  }

  const response = await fetch(
    `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
      text
    )}&countrycodes=au&limit=5`
  );

  const results = await response.json();

  if (type === "pickup")
    setPickupSuggestions(results);

  else
    setDeliverySuggestions(results);

};
  useEffect(() => {

    localStorage.setItem(
      "deliveries",
      JSON.stringify(deliveries)
    );

  }, [deliveries]);
  const handleChange = (event) => {
    const { name, value } = event.target

    setFormData((previousData) => ({
      ...previousData,
      [name]: value,
    }))
  }

  const handleLoginChange = (event) => {
  const { name, value } = event.target

  setLoginData((previousData) => ({
    ...previousData,
    [name]: value,
  }))
}

const handleLogin = (event) => {
  event.preventDefault()

  const dispatcherLogin =
    loginData.role === 'dispatcher' &&
    loginData.email === 'dispatcher@roadrunner.com' &&
    loginData.password === 'admin123'

  const driverLogin =
    loginData.role === 'driver' &&
    loginData.email === 'driver@roadrunner.com' &&
    loginData.password === 'driver123'

  if (dispatcherLogin || driverLogin) {
    setCurrentView(loginData.role)
    setIsLoggedIn(true)
    setLoginError('')
  } else {
    setLoginError('Incorrect email, password, or role.')
  }
}
  const assignDriver = (jobId, driverName) => {
  setDeliveries((previousDeliveries) =>
    previousDeliveries.map((delivery) =>
      delivery.id === jobId
        ? {
            ...delivery,
            driver: driverName,
            status: driverName ? 'Assigned' : 'Pending',
          }
        : delivery
    )
  )
}

const updateStatus = (jobId, newStatus) => {
  setDeliveries((previousDeliveries) =>
    previousDeliveries.map((delivery) =>
      delivery.id === jobId
        ? { ...delivery, status: newStatus }
        : delivery
    )
  )
}

const trackDelivery = (event) => {
  event.preventDefault()

  const foundDelivery = deliveries.find(
    (delivery) =>
      delivery.id.toLowerCase() === trackingId.trim().toLowerCase()
  )

  if (foundDelivery) {
    setTrackedDelivery(foundDelivery)
    setTrackingError('')
  } else {
    setTrackedDelivery(null)
    setTrackingError('Delivery not found. Please check the Job ID.')
  }
}
    const reverseGeocode = async (location,type)=>{

    const response = await fetch(

    `https://nominatim.openstreetmap.org/reverse?format=json&lat=${location[0]}&lon=${location[1]}`

    );

    const data = await response.json();

    if(type==="pickup"){

    setFormData(prev=>({

    ...prev,

    pickupAddress:data.display_name

    }));

    }

    else{

    setFormData(prev=>({

    ...prev,

    deliveryAddress:data.display_name

    }));

    }

    };
  const handleSubmit = (event) => {
    event.preventDefault()
 
        if (editingDelivery) {

      setDeliveries(
        deliveries.map((delivery) =>

          delivery.id === editingDelivery.id

            ? {
                ...delivery,

                customer: formData.customer,

                pickupAddress: formData.pickupAddress,

                deliveryAddress: formData.deliveryAddress,

                pickupLocation,

                deliveryLocation,

                priority: formData.priority,

                deliveryDate: formData.deliveryDate,

                deliveryTime: formData.deliveryTime,
              }

            : delivery

        )
      );

      setEditingDelivery(null);

      setShowForm(false);

      setFormData({
        customer: "",
        pickupAddress: "",
        deliveryAddress: "",
        priority: "Medium",
        deliveryDate: "",
        deliveryTime: "",
      });

      setPickupLocation(null);

      setDeliveryLocation(null);

      return;
    }
      const nextNumber =
      deliveries.length > 0
        ? Math.max(
            ...deliveries.map((delivery) =>
              Number(delivery.id.replace("RR", ""))
            )
          ) + 1
        : 1;

    const newDelivery = {
      id: `RR${String(nextNumber).padStart(3, "0")}`,
      customer: formData.customer,
      driver: "Unassigned",
      status: "Pending",
      priority: formData.priority,

      pickupAddress: formData.pickupAddress,
      deliveryAddress: formData.deliveryAddress,

      pickupLocation,
      deliveryLocation,

      deliveryDate: formData.deliveryDate,
      deliveryTime: formData.deliveryTime,
    };

    setDeliveries((previousDeliveries) => [
      ...previousDeliveries,
      newDelivery,
    ])

    setFormData({
      customer: '',
      pickupAddress: '',
      deliveryAddress: '',
      priority: 'Medium',
      deliveryDate: '',
      deliveryTime: '',
    })
    setPickupLocation(null);
    setDeliveryLocation(null);
    setShowForm(false)
  }
  if (!isLoggedIn) {
  return (
    <div className="login-page">
      <div className="login-card">
        <h1 className="login-title">
  <FaTruck className="login-icon" />
  Smart Logistics System
</h1>
        <p>Sign in as a dispatcher or driver</p>

        <form onSubmit={handleLogin}>
          <label>
            Role
            <select
              name="role"
              value={loginData.role}
              onChange={handleLoginChange}
            >
              <option value="dispatcher">Dispatcher</option>
              <option value="driver">Driver</option>
            </select>
          </label>

          <label>
            Email
            <input
              type="email"
              name="email"
              value={loginData.email}
              onChange={handleLoginChange}
              placeholder="Enter your email"
              required
            />
          </label>

          <label>
            Password
            <input
              type="password"
              name="password"
              value={loginData.password}
              onChange={handleLoginChange}
              placeholder="Enter your password"
              required
            />
          </label>

          {loginError && (
            <p className="login-error">{loginError}</p>
          )}

          <button type="submit" className="login-btn">
            Login
          </button>
        </form>

        <div className="customer-access">
          <p>Customer tracking does not require an account.</p>

          <button
            type="button"
            className="tracking-btn"
            onClick={() => {
              setCurrentView('customer')
              setIsLoggedIn(true)
            }}
          >
            Track a Delivery
          </button>
        </div>
      </div>
    </div>
  )
}
  if (currentView === 'customer') {
  return (
    <div className="app">
      <aside className="sidebar">
        <h2>SLIS</h2>

        <nav>
          <button onClick={() => setCurrentView('dispatcher')}>
            Dispatcher
          </button>

          <button onClick={() => setCurrentView('driver')}>
            Driver
          </button>

          <button onClick={() => setCurrentView('customer')}>
            Customer
          </button>
        </nav>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div>
            <h1>Track Your Delivery</h1>
            <p>Enter your Job ID to check your delivery status</p>
          </div>
        </header>

        <section className="tracking-section">
          <form onSubmit={trackDelivery}>
            <div className="tracking-search">
              <input
                type="text"
                placeholder="Enter Job ID e.g. RR001"
                value={trackingId}
                onChange={(event) =>
                  setTrackingId(event.target.value)
                }
                required
              />

              <button type="submit" className="save-btn">
                Track Delivery
              </button>
            </div>
          </form>

          {trackingError && (
            <p className="tracking-error">
              {trackingError}
            </p>
          )}

          {trackedDelivery && (
            <div className="tracking-result">
              <h2>Delivery Information</h2>

              <div className="details-grid">
                <div>
                  <span>Job ID</span>
                  <strong>{trackedDelivery.id}</strong>
                </div>

                <div>
                  <span>Status</span>
                  <strong>{trackedDelivery.status}</strong>
                </div>

                <div>
                  <span>Driver</span>
                  <strong>{trackedDelivery.driver}</strong>
                </div>

                <div>
                  <span>Priority</span>
                  <strong>{trackedDelivery.priority}</strong>
                </div>

                <div className="detail-full">
                  <span>Pickup Address</span>
                  <strong>
                    {trackedDelivery.pickupAddress || 'Not available'}
                  </strong>
                </div>

                <div className="detail-full">
                  <span>Delivery Address</span>
                  <strong>
                    {trackedDelivery.deliveryAddress || 'Not available'}
                  </strong>
                </div>

                <div>
                  <span>Delivery Date</span>
                  <strong>
                    {trackedDelivery.deliveryDate || 'Not available'}
                  </strong>
                </div>

                <div>
                  <span>Delivery Time</span>
                  <strong>
                    {trackedDelivery.deliveryTime || 'Not available'}
                  </strong>
                </div>
              </div>
            </div>
          )}
        </section>
      </main>
    </div>
  )
}
  if (currentView === 'driver') {
  return (
    <div className="app">
      <aside className="sidebar">
        <h2>SLIS</h2>

        <nav>
          <button onClick={() => setCurrentView('dispatcher')}>
            Dispatcher
          </button>

          <button onClick={() => setCurrentView('driver')}>
            Driver
          </button>
        </nav>
      </aside>

      <main className="main-content">
        <header className="topbar">
  <div>
    <h1>Driver Dashboard</h1>
    <p>Welcome, John</p>
  </div>

  <button
    className="logout-btn"
    onClick={() => {
      setIsLoggedIn(false)
      setLoginData({
        email: '',
        password: '',
        role: 'driver',
      })
    }}
  >
    Logout
  </button>
</header>

        <section className="deliveries-section">
          <h2>My Deliveries</h2>

          <table>
            <thead>
              <tr>
                <th>Job ID</th>
                <th>Customer</th>
                <th>Status</th>
                <th>Priority</th>
                <th>Action</th>
              </tr>
            </thead>

            <tbody>
              {deliveries
                .filter((delivery) => delivery.driver === 'John')
                .map((delivery) => (
                  <tr key={delivery.id}>
                    <td>{delivery.id}</td>
                    <td>{delivery.customer}</td>
                    <td>{delivery.status}</td>
                    <td>{delivery.priority}</td>

                    <td>
                      <button
                        className="view-btn"
                        onClick={() => setSelectedDelivery(delivery)}
                      >
                        View Job
                      </button>

                      <button
                        className="edit-btn"
                        onClick={() => {

                          setEditingDelivery(delivery);

                          setFormData({
                            customer: delivery.customer,
                            pickupAddress: delivery.pickupAddress,
                            deliveryAddress: delivery.deliveryAddress,
                            priority: delivery.priority,
                            deliveryDate: delivery.deliveryDate,
                            deliveryTime: delivery.deliveryTime,
                          });

                          setPickupLocation(delivery.pickupLocation);

                          setDeliveryLocation(delivery.deliveryLocation);

                          setShowForm(true);

                        }}
                      >
                        Edit
                      </button>
                      {delivery.status === 'Assigned' && (
                        <button
                          className="start-btn"
                          onClick={() =>
                            updateStatus(delivery.id, 'In Transit')
                          }
                        >
                          Start Delivery
                        </button>
                      )}

                      {delivery.status === 'In Transit' && (
                        <button
                          className="complete-btn"
                          onClick={() => {
                            setSelectedDelivery(delivery)
                            setShowProofForm(true)

                            setProofData({
                              signature: '',
                              photo: null,
                              gpsLocation: '',
                              timestamp: new Date().toLocaleString(),
                            })
                          }}
                        >
                          Complete Delivery
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </section>

        {showProofForm && selectedDelivery && (
          <div className="details-overlay">
            <div className="delivery-details">

              <div className="details-header">
                <div>
                  <h2>Proof of Delivery</h2>
                  <p>{selectedDelivery.id}</p>
                </div>

                <button
                  className="close-btn"
                  onClick={() => setShowProofForm(false)}
                >
                  ×
                </button>
              </div>

              <form
                onSubmit={(event) => {
                  event.preventDefault()

                  updateStatus(selectedDelivery.id, 'Delivered')

                  setShowProofForm(false)
                  setSelectedDelivery(null)

                  alert('Delivery completed successfully!')
                }}
              >
                <div className="form-group">
                  <label>Customer Signature</label>

                  <input
                    type="text"
                    placeholder="Enter customer name/signature"
                    value={proofData.signature}
                    onChange={(event) =>
                      setProofData({
                        ...proofData,
                        signature: event.target.value,
                      })
                    }
                    required
                  />
                </div>

                <div className="form-group">
                  <label>Delivery Photo</label>

                  <input
                    type="file"
                    accept="image/*"
                    onChange={(event) =>
                      setProofData({
                        ...proofData,
                        photo: event.target.files[0],
                      })
                    }
                    required
                  />
                </div>

                <div className="form-group">
                  <label>GPS Location</label>

                  <input
                    type="text"
                    placeholder="Enter GPS location"
                    value={proofData.gpsLocation}
                    onChange={(event) =>
                      setProofData({
                        ...proofData,
                        gpsLocation: event.target.value,
                      })
                    }
                    required
                  />
                </div>

                <div className="form-group">
                  <label>Timestamp</label>

                  <input
                    type="text"
                    value={proofData.timestamp}
                    readOnly
                  />
                </div>

                <div className="form-actions">
                  <button
                    type="button"
                    className="cancel-btn"
                    onClick={() => setShowProofForm(false)}
                  >
                    Cancel
                  </button>

                  <button
                    type="submit"
                    className="save-btn"
                  >
                    Confirm Delivery
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

      </main>
    </div>
  )
}
  return (
    <div className="app">
      <aside className="sidebar">
        <h2>SLIS</h2>

        <nav>
  <button onClick={() => setCurrentView('dispatcher')}>
    Dispatcher
  </button>

  <button onClick={() => setCurrentView('driver')}>
    Driver
  </button>

  <button onClick={() => setCurrentView('customer')}>
  Customer
</button>

  <a href="#">Deliveries</a>
  <a href="#">Routes</a>
  <a href="#">Reports</a>
</nav>
      </aside>

      <main className="main-content">
        <header className="topbar">
  <div>
    <h1>Dispatcher Dashboard</h1>
    <p>Smart Logistics System</p>
  </div>

  <div className="topbar-actions">
    <button
      className="logout-btn"
      onClick={() => {
        setIsLoggedIn(false)
        setLoginData({
          email: '',
          password: '',
          role: 'dispatcher',
        })
      }}
    >
      Logout
    </button>

    <button
      className="create-btn"
      onClick={() => setShowForm(true)}
    >
      + Create Delivery Job
    </button>
  </div>
</header>

        {showForm && (
          <section className="job-form-section">
            <div className="form-header">
              <h2>
                {editingDelivery
                  ? "Edit Delivery Job"
                  : "Create Delivery Job"}
              </h2>
              <button
                className="close-btn"
                onClick={() => setShowForm(false)}
              >
                ×
              </button>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="form-grid">
                <div className="form-group">
                  <label>Customer Name</label>
                  <input
                    type="text"
                    name="customer"
                    value={formData.customer}
                    onChange={handleChange}
                    required
                  />
                </div>

                <div className="form-group">
                  <label>Priority</label>
                  <select
                    name="priority"
                    value={formData.priority}
                    onChange={handleChange}
                  >
                    <option value="Low">Low</option>
                    <option value="Medium">Medium</option>
                    <option value="High">High</option>
                  </select>
                </div>

                <div className="form-group full-width">

                <label>Pickup Address</label>

                <input
                type="text"
                value={formData.pickupAddress}
                placeholder="Search pickup address..."

                onChange={(e)=>{

                setFormData({

                ...formData,

                pickupAddress:e.target.value,

                });

                searchAddress(e.target.value,"pickup");

                }}
                onFocus={() => setActivePin("pickup")}
                />

                {pickupSuggestions.length>0 && (

                <div className="suggestions">

                {pickupSuggestions.map(place=>(

                <div

                key={place.place_id}

                className="suggestion"

                onClick={()=>{

                setFormData({

                ...formData,

                pickupAddress:place.display_name,

                });

                setPickupLocation([
                Number(place.lat),
                Number(place.lon)
                ]);

                setPickupSuggestions([]);

                }}

                >

                {place.display_name}

                </div>

                ))}

                </div>

                )}

                </div>

              <div className="form-group full-width">

              <label>Delivery Address</label>

              <input
              type="text"
              value={formData.deliveryAddress}
              placeholder="Search delivery address..."

              onChange={(e)=>{

              setFormData({

              ...formData,

              deliveryAddress:e.target.value,

              });

              searchAddress(e.target.value,"delivery");

              }}
              onFocus={() => setActivePin("delivery")}
              />

              {deliverySuggestions.length>0 && (

              <div className="suggestions">

              {deliverySuggestions.map(place=>(

              <div

              key={place.place_id}

              className="suggestion"

              onClick={()=>{

              setFormData({

              ...formData,

              deliveryAddress:place.display_name,

              });

              setDeliveryLocation([
              Number(place.lat),
              Number(place.lon)
              ]);

              setDeliverySuggestions([]);

              }}

              >

              {place.display_name}

              </div>

              ))}

              </div>

              )}

              </div>
                <div className="form-group full-width">
                <label>Select Locations on Map</label>

                <MapPicker
                active={activePin}

                pickupLocation={pickupLocation}
                deliveryLocation={deliveryLocation}

                setPickupLocation={setPickupLocation}
                setDeliveryLocation={setDeliveryLocation}

                pickupAddress={formData.pickupAddress}
                deliveryAddress={formData.deliveryAddress}

                setPickupAddress={(value) =>
                  setFormData((prev) => ({
                    ...prev,
                    pickupAddress: value,
                  }))
                }

                setDeliveryAddress={(value) =>
                  setFormData((prev) => ({
                    ...prev,
                    deliveryAddress: value,
                  }))
                }
              />
              </div>

                <div className="form-group">
                  <label>Delivery Date</label>
                  <input
                    type="date"
                    name="deliveryDate"
                    value={formData.deliveryDate}
                    onChange={handleChange}
                    required
                  />
                </div>

                <div className="form-group">
                  <label>Delivery Time</label>
                  <input
                    type="time"
                    name="deliveryTime"
                    value={formData.deliveryTime}
                    onChange={handleChange}
                    required
                  />
                </div>
              </div>

              <div className="form-actions">
                <button
                  type="button"
                  className="cancel-btn"
                  onClick={() => {

                  setShowForm(false);

                  setEditingDelivery(null);

                  setPickupLocation(null);

                  setDeliveryLocation(null);

                  setFormData({
                    customer: "",
                    pickupAddress: "",
                    deliveryAddress: "",
                    priority: "Medium",
                    deliveryDate: "",
                    deliveryTime: "",
                  });

                }}
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  className="save-btn"
                >
                  {editingDelivery
                  ? "Save Changes"
                  : "Create Job"}
                </button>
              </div>
            </form>
          </section>
        )}

        <section className="stats">
          <div className="stat-card">
            <h3>{deliveries.length}</h3>
            <p>Total Deliveries</p>
          </div>

          <div className="stat-card">
            <h3>
              {
                deliveries.filter(
                  (delivery) => delivery.status === 'Delivered'
                ).length
              }
            </h3>
            <p>Completed</p>
          </div>

          <div className="stat-card">
            <h3>
              {
                deliveries.filter(
                  (delivery) => delivery.status === 'Pending'
                ).length
              }
            </h3>
            <p>Pending</p>
          </div>

          <div className="stat-card">
            <h3>
              {
                deliveries.filter(
                  (delivery) => delivery.status === 'Delayed'
                ).length
              }
            </h3>
            <p>Delayed</p>
          </div>
        </section>

        <section className="deliveries-section">
          <h2>Active Deliveries</h2>

          <table>
            <thead>
              <tr>
                <th>Job ID</th>
                <th>Customer</th>
                <th>Driver</th>
                <th>Status</th>
                <th>Priority</th>
<th>Action</th>
              </tr>
            </thead>

            <tbody>
              {deliveries.map((delivery) => (
                <tr key={delivery.id}>
                  <td>{delivery.id}</td>
                  <td>{delivery.customer}</td>
                  <td>
  <select
    className="driver-select"
    value={
      delivery.driver === 'Unassigned'
        ? ''
        : delivery.driver
    }
    onChange={(event) =>
      assignDriver(delivery.id, event.target.value)
    }
  >
    <option value="">Unassigned</option>

    {drivers.map((driver) => (
      <option key={driver} value={driver}>
        {driver}
      </option>
    ))}
  </select>
</td>
                  <td>
  <select
    className="status-select"
    value={delivery.status}
    onChange={(event) =>
      updateStatus(delivery.id, event.target.value)
    }
  >
    <option value="Pending">Pending</option>
    <option value="Assigned">Assigned</option>
    <option value="In Transit">In Transit</option>
    <option value="Delivered">Delivered</option>
  </select>
</td>
                  <td>{delivery.priority}</td>
                  <td className="action-buttons">

                  <button
                    className="view-btn"
                    onClick={() => setSelectedDelivery(delivery)}
                  >
                    View
                  </button>

                  <button
                    className="edit-btn"
                    onClick={() => {

                      setEditingDelivery(delivery);

                      setFormData({
                        customer: delivery.customer,
                        pickupAddress: delivery.pickupAddress,
                        deliveryAddress: delivery.deliveryAddress,
                        priority: delivery.priority,
                        deliveryDate: delivery.deliveryDate,
                        deliveryTime: delivery.deliveryTime,
                      });

                      setPickupLocation(delivery.pickupLocation);
                      setDeliveryLocation(delivery.deliveryLocation);

                      setShowForm(true);

                    }}
                  >
                    Edit
                  </button>

                  <button
                    className="delete-btn"
                    onClick={() => {

                      if (window.confirm(`Delete ${delivery.id}?`)) {

                        setDeliveries(
                          deliveries.filter(
                            item => item.id !== delivery.id
                          )
                        );

                      }

                    }}
                  >
                    Delete
                  </button>

                  {delivery.status === "Assigned" && (

                    <button
                      className="start-btn"
                      onClick={() =>
                        updateStatus(delivery.id, "In Transit")
                      }
                    >
                      Start
                    </button>

                  )}

                  {delivery.status === "In Transit" && (

                    <button
                      className="complete-btn"
                      onClick={() => {

                        setSelectedDelivery(delivery);

                        setShowProofForm(true);

                        setProofData({
                          signature: "",
                          photo: null,
                          gpsLocation: "",
                          timestamp: new Date().toLocaleString(),
                        });

                      }}
                    >
                      Complete
                    </button>

                  )}

                </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        {showProofForm && selectedDelivery && (
  <div className="details-overlay">
    <div className="delivery-details">

      <div className="details-header">
        <div>
          <h2>Proof of Delivery</h2>
          <p>{selectedDelivery.id}</p>
        </div>

        <button
          className="close-btn"
          onClick={() => setShowProofForm(false)}
        >
          ×
        </button>
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault()

          updateStatus(selectedDelivery.id, 'Delivered')

          setShowProofForm(false)
          setSelectedDelivery(null)

          alert('Delivery completed successfully!')
        }}
      >

        <div className="form-group">
          <label>Customer Signature</label>

          <input
            type="text"
            placeholder="Enter customer name/signature"
            value={proofData.signature}
            onChange={(event) =>
              setProofData({
                ...proofData,
                signature: event.target.value,
              })
            }
            required
          />
        </div>

        <div className="form-group">
          <label>Delivery Photo</label>

          <input
            type="file"
            accept="image/*"
            onChange={(event) =>
              setProofData({
                ...proofData,
                photo: event.target.files[0],
              })
            }
            required
          />
        </div>

        <div className="form-group">
          <label>GPS Location</label>

          <input
            type="text"
            placeholder="GPS location"
            value={proofData.gpsLocation}
            onChange={(event) =>
              setProofData({
                ...proofData,
                gpsLocation: event.target.value,
              })
            }
            required
          />
        </div>

        <div className="form-group">
          <label>Timestamp</label>

          <input
            type="text"
            value={proofData.timestamp}
            readOnly
          />
        </div>

        <div className="form-actions">
          <button
            type="button"
            className="cancel-btn"
            onClick={() => setShowProofForm(false)}
          >
            Cancel
          </button>

          <button
            type="submit"
            className="save-btn"
          >
            Confirm Delivery
          </button>
        </div>

      </form>
    </div>
  </div>
)}

  
        {selectedDelivery && (
  <div className="details-overlay">
    <div className="delivery-details">
      <div className="details-header">
        <div>
          <h2>Delivery Details</h2>
          <p>{selectedDelivery.id}</p>
        </div>

        <button
          className="close-btn"
          onClick={() => setSelectedDelivery(null)}
        >
          ×
        </button>
      </div>

      <div className="details-grid">
        <div>
          <span>Customer</span>
          <strong>{selectedDelivery.customer}</strong>
        </div>

        <div>
          <span>Assigned Driver</span>
          <strong>{selectedDelivery.driver}</strong>
        </div>

        <div>
          <span>Status</span>
          <strong>{selectedDelivery.status}</strong>
        </div>

        <div>
          <span>Priority</span>
          <strong>{selectedDelivery.priority}</strong>
        </div>

        <div className="detail-full">
          <span>Pickup Address</span>
          <strong>
            {selectedDelivery.pickupAddress || 'Not available'}
          </strong>
        </div>

        <div className="detail-full">
          <span>Delivery Address</span>
          <strong>
            {selectedDelivery.deliveryAddress || 'Not available'}
          </strong>
        </div>

        <div>
          <span>Delivery Date</span>
          <strong>
            {selectedDelivery.deliveryDate || 'Not available'}
          </strong>
        </div>

        <div>
          <span>Delivery Time</span>
          <strong>
            {selectedDelivery.deliveryTime || 'Not available'}
          </strong>
        </div>
        <div>
        <span>Distance</span>
        <strong>
          {distance ? `${distance} km` : "N/A"}
        </strong>
      </div>

      <div>
        <span>Estimated Time</span>
        <strong>
          {estimatedTime}
        </strong>
      </div>
      </div>
        {selectedDelivery?.pickupLocation &&
        selectedDelivery?.deliveryLocation && (

        <div
        style={{
        marginTop:"30px"
        }}
        >

        <h3
        style={{
        marginBottom:"15px",
        textAlign:"center"
        }}
        >
        Delivery Route
        </h3>

        <MapContainer

        center={selectedDelivery.pickupLocation}

        zoom={12}

        style={{

        height:"350px",

        width:"100%",

        borderRadius:"12px"

        }}

        >

        <TileLayer

        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"

        />

        <Marker

        position={selectedDelivery.pickupLocation}

        icon={pickupIcon}

        >

        <Popup>

        Pickup

        </Popup>

        </Marker>

        <Marker

        position={selectedDelivery.deliveryLocation}

        icon={deliveryIcon}

        >

        <Popup>

        Delivery

        </Popup>

        </Marker>

        <Polyline

        positions={[

        selectedDelivery.pickupLocation,

        selectedDelivery.deliveryLocation,

        ]}

        color="blue"

        weight={4}

        />

        </MapContainer>

        <div
          style={{
            marginTop: "20px",
            background: "#f8fafc",
            borderRadius: "12px",
            padding: "18px",
          }}
        >

          <h3
            style={{
              marginBottom: "15px",
            }}
          >
            Route Summary
          </h3>

          <div className="details-grid">

            <div>
              <span>Distance</span>
              <strong>{distance} km</strong>
            </div>

            <div>
              <span>Estimated Time</span>
              <strong>{estimatedTime}</strong>
            </div>

            <div>
              <span>Priority</span>
              <strong>{selectedDelivery.priority}</strong>
            </div>

            <div>
              <span>Current Status</span>
              <strong>{selectedDelivery.status}</strong>
            </div>

          </div>

        </div>
        </div>

        )}
      <div className="details-actions">
        <button
          className="close-details-btn"
          onClick={() => setSelectedDelivery(null)}
        >
          Close
        </button>
      </div>
    </div>
  </div>
)}
      </main>
    </div>
  )
}

export default App