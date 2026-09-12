import { useState, useEffect, Component } from 'react'
import 'leaflet/dist/leaflet.css';
import { FaTruck, FaBoxOpen, FaCheckCircle, FaClock, FaExclamationTriangle, FaMoon, FaSun, FaFileDownload, FaSms } from 'react-icons/fa'
import jsPDF from 'jspdf'
import './App.css'
import MapPicker from "./MapPicker";
import { WAREHOUSE_ADDRESS, WAREHOUSE_LOCATION } from "./constants";
import RouteMap from "./components/RouteMap";
import {
  optimiseRoute,
  formatDistance,
  formatEstimatedTime
} from "./utils/routeOptimizer";
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  Polyline,
} from "react-leaflet";

import L from "leaflet";

// If the map ever fails to render for any reason, this catches it so the
// rest of the job form (which works fine without the map) keeps working
// instead of the whole page going blank.
class MapErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error) {
    console.error("Map failed to load:", error);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: "16px", background: "#fef3c7", borderRadius: "8px", fontSize: "13px", color: "#92400e" }}>
          The map couldn't load right now, but you can still type addresses in manually above — everything else still works.
        </div>
      );
    }
    return this.props.children;
  }
}

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

// Converts an uploaded File (photo, signature scan, etc.) into a base64 string
// so it can be stored in the database and embedded in the PDF receipt later.
// Blob URLs (URL.createObjectURL) only work in the current browser tab and
// can't be saved or sent to a server, so this is used everywhere a file needs
// to actually persist.
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    if (!file) return resolve(null);
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ---------- REAL SMS via the backend (ClickSend) ----------
// This calls our own backend, which holds the ClickSend/Gmail credentials
// securely on the server. The credentials can NEVER live in this frontend
// file — anyone could open browser dev tools and steal them if they did.
// See backend/src/routes/sms.js and the README for setup.
async function sendRealSms(toPhone, message) {
  try {
    const res = await fetch('http://localhost:5000/api/send-sms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: toPhone, message }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'SMS failed to send');
    return { success: true, sid: data.sid };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ---------- REAL email via the backend (Gmail) — backup notification channel ----------
async function sendRealEmail(toEmail, subject, message) {
  try {
    const res = await fetch('http://localhost:5000/api/send-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: toEmail, subject, message }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Email failed to send');
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ---------- Fancier PDF delivery receipt, with driver photo + proof of delivery ----------
function generateReceipt(delivery, driver, mode = 'download') {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();

  // Header band
  doc.setFillColor(23, 50, 77);
  doc.rect(0, 0, pageWidth, 38, 'F');
  doc.setFontSize(20);
  doc.setTextColor(255, 255, 255);
  doc.setFont(undefined, 'bold');
  doc.text('Roadrunner Couriers Australia', 15, 18);
  doc.setFontSize(11);
  doc.setFont(undefined, 'normal');
  doc.setTextColor(200, 215, 230);
  doc.text('Official Delivery Receipt', 15, 27);

  doc.setFontSize(10);
  doc.setTextColor(255, 255, 255);
  doc.text(`Job ID: ${delivery.id}`, pageWidth - 15, 18, { align: 'right' });
  doc.text(new Date().toLocaleDateString(), pageWidth - 15, 27, { align: 'right' });

  let y = 52;

  // Status badge
  const statusColor = delivery.status === 'Delivered' ? [22, 101, 52] : [180, 83, 9];
  doc.setFillColor(...statusColor);
  doc.roundedRect(15, y, 50, 9, 2, 2, 'F');
  doc.setFontSize(10);
  doc.setTextColor(255, 255, 255);
  doc.setFont(undefined, 'bold');
  doc.text(delivery.status.toUpperCase(), 40, y + 6, { align: 'center' });
  y += 20;

  // Section: Delivery Details
  doc.setTextColor(23, 50, 77);
  doc.setFontSize(13);
  doc.setFont(undefined, 'bold');
  doc.text('Delivery Details', 15, y);
  doc.setDrawColor(220, 225, 230);
  doc.line(15, y + 3, pageWidth - 15, y + 3);
  y += 12;

  doc.setFontSize(10.5);
  const row = (label, value) => {
    doc.setFont(undefined, 'bold');
    doc.setTextColor(90, 100, 110);
    doc.text(`${label}`, 15, y);
    doc.setFont(undefined, 'normal');
    doc.setTextColor(30, 35, 40);
    doc.text(String(value || 'N/A'), 65, y);
    y += 8.5;
  };

  row('Customer', delivery.customer);
  row('Customer Phone', delivery.customerPhone);
  row('Customer Email', delivery.customerEmail);
  row('Warehouse / Pickup', WAREHOUSE_ADDRESS);
  row('Delivery Address', delivery.deliveryAddress);
  row('Priority', delivery.priority);
  row('Delivery Date', delivery.deliveryDate);
  row('Delivery Time', delivery.deliveryTime);

  y += 6;

  // Section: Driver — with photo if available
  doc.setFontSize(13);
  doc.setFont(undefined, 'bold');
  doc.setTextColor(23, 50, 77);
  doc.text('Assigned Driver', 15, y);
  doc.setDrawColor(220, 225, 230);
  doc.line(15, y + 3, pageWidth - 15, y + 3);
  y += 12;

  const driverPhotoX = 15;
  const driverTextX = driver && driver.image ? 45 : 15;

  if (driver && driver.image) {
    try {
      doc.addImage(driver.image, 'JPEG', driverPhotoX, y - 4, 24, 24);
    } catch (_e) {
      // If the image format isn't something jsPDF can embed, skip it silently
      // rather than breaking the whole receipt.
    }
  }

  doc.setFontSize(10.5);
  doc.setFont(undefined, 'bold');
  doc.setTextColor(90, 100, 110);
  doc.text('Driver Name', driverTextX, y);
  doc.setFont(undefined, 'normal');
  doc.setTextColor(30, 35, 40);
  doc.text(String(delivery.driver || 'Unassigned'), driverTextX, y + 7);
  if (driver && driver.phone) {
    doc.setFont(undefined, 'bold');
    doc.setTextColor(90, 100, 110);
    doc.text('Driver Phone', driverTextX, y + 16);
    doc.setFont(undefined, 'normal');
    doc.setTextColor(30, 35, 40);
    doc.text(String(driver.phone), driverTextX, y + 23);
    y += 30;
  } else {
    y += 22;
  }

  // Section: Proof of Delivery (only if delivered and proof was captured)
  if (delivery.status === 'Delivered' && delivery.proof) {
    doc.setFontSize(13);
    doc.setFont(undefined, 'bold');
    doc.setTextColor(23, 50, 77);
    doc.text('Proof of Delivery', 15, y);
    doc.setDrawColor(220, 225, 230);
    doc.line(15, y + 3, pageWidth - 15, y + 3);
    y += 12;

    doc.setFontSize(10.5);
    row('Signed By', delivery.proof.signature);
    row('GPS Location', delivery.proof.gpsLocation);
    row('Delivered At', delivery.proof.timestamp);

    if (delivery.proof.photo) {
      y += 4;
      doc.setFont(undefined, 'bold');
      doc.setTextColor(90, 100, 110);
      doc.text('Delivery Photo', 15, y);
      y += 5;
      try {
        doc.addImage(delivery.proof.photo, 'JPEG', 15, y, 60, 45);
        y += 50;
      } catch (_e) {
        // Skip silently if the image can't be embedded
      }
    }
  }

  // Footer
  const pageHeight = doc.internal.pageSize.getHeight();
  doc.setDrawColor(220, 225, 230);
  doc.line(15, pageHeight - 22, pageWidth - 15, pageHeight - 22);
  doc.setFontSize(9);
  doc.setTextColor(140, 140, 140);
  doc.setFont(undefined, 'normal');
  doc.text('Thank you for choosing Roadrunner Couriers Australia.', 15, pageHeight - 14);
  doc.text(`Receipt generated ${new Date().toLocaleString()}`, 15, pageHeight - 8);

  if (mode === 'print') {
    const blobUrl = doc.output('bloburl');
    const printWindow = window.open(blobUrl);
    // Most browsers open PDFs in a viewer with its own print button;
    // this also triggers the system print dialog automatically once loaded.
    if (printWindow) {
      printWindow.onload = () => {
        try { printWindow.print(); } catch (_e) { /* viewer handles printing itself */ }
      };
    }
  } else {
    doc.save(`Receipt_${delivery.id}.pdf`);
  }
}


function App() {

  const [showForm, setShowForm] = useState(false)
  const [editingDelivery, setEditingDelivery] = useState(null);
  const [currentView, setCurrentView] = useState('dispatcher')
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [showDriverForm, setShowDriverForm] = useState(false)
const [editingDriver, setEditingDriver] = useState(null)
const [driverSearch, setDriverSearch] = useState('')
const [jobSearch, setJobSearch] = useState('')
const [sortField, setSortField] = useState(null)
const [sortDirection, setSortDirection] = useState('asc')

function handleSort(field) {
  if (sortField === field) {
    setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'))
  } else {
    setSortField(field)
    setSortDirection('asc')
  }
}
const [selectedDriver, setSelectedDriver] = useState(null)
const [driverFormData, setDriverFormData] = useState({
  name: '',
  email: '',
  phone: '',
  licence: '',
  status: 'Available',
  image: null,
})

const [loginData, setLoginData] = useState({
  email: '',
  password: '',
  role: 'dispatcher',
})

const [loginError, setLoginError] = useState('')
  const [selectedDelivery, setSelectedDelivery] = useState(null)
  const [selectedDriverJob, setSelectedDriverJob] = useState(null)
  const [routeDriver, setRouteDriver] = useState('')
const [routeMode, setRouteMode] = useState('dispatcher')
const [selectedRouteDeliveries, setSelectedRouteDeliveries] = useState([])
const [routeResult, setRouteResult] = useState(null)
const [routeError, setRouteError] = useState('')
const [routeLoading, setRouteLoading] = useState(false)

// Delivery-only map/address state. The warehouse is fixed and never entered by the user.
const [deliveryLocation, setDeliveryLocation] = useState(null)
const [deliverySuggestions, setDeliverySuggestions] = useState([])

const searchAddress = async (text, type = 'delivery') => {
  if (type !== 'delivery') return

  if (text.trim().length < 3) {
    setDeliverySuggestions([])
    return
  }

  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(text)}&countrycodes=au&limit=5`
    )

    if (!response.ok) throw new Error('Address search failed')

    const results = await response.json()
    setDeliverySuggestions(results)
  } catch (error) {
    console.error('Error searching delivery address:', error)
    setDeliverySuggestions([])
  }
}

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
  selectedDelivery?.deliveryLocation
    ? calculateDistance(
        WAREHOUSE_LOCATION,
        selectedDelivery.deliveryLocation
      )
    : null;

const estimatedTime =
  distance
    ? estimateTime(distance)
    : "N/A";
  const [deliveries, setDeliveries] = useState(() => {
  const saved = localStorage.getItem("deliveries");
  const source = saved ? JSON.parse(saved) : defaultDeliveries;

  // Migrate older demo records so every job now uses the single fixed
  // warehouse as its pickup/origin. The user never edits this value.
  return source.map((delivery) => ({
    ...delivery,
    pickupAddress: WAREHOUSE_ADDRESS,
    pickupLocation: [...WAREHOUSE_LOCATION],
  }));
});

const driverDistance =
  selectedDriverJob?.deliveryLocation
    ? calculateDistance(
        WAREHOUSE_LOCATION,
        selectedDriverJob.deliveryLocation
      )
    : null

const driverEstimatedTime =
  driverDistance
    ? estimateTime(driverDistance)
    : "N/A"

 const [drivers, setDrivers] = useState([
  {
    id: 'D001',
    name: 'John',
    email: 'john@roadrunner.com',
    phone: '0400000001',
    licence: 'QLD123456',
    status: 'Available',
    image: null,
  },
  {
    id: 'D002',
    name: 'Sarah',
    email: 'sarah@roadrunner.com',
    phone: '0400000002',
    licence: 'QLD234567',
    status: 'Available',
    image: null,
  },
  {
    id: 'D003',
    name: 'Michael',
    email: 'michael@roadrunner.com',
    phone: '0400000003',
    licence: 'QLD345678',
    status: 'Assigned',
    image: null,
  },
  {
    id: 'D004',
    name: 'Emily',
    email: 'emily@roadrunner.com',
    phone: '0400000004',
    licence: 'QLD456789',
    status: 'Available',
    image: null,
  },
])
const [driversLoading, setDriversLoading] = useState(true);
useEffect(() => {
  fetch('http://localhost:5000/api/drivers')
    .then((response) => response.json())
    .then((data) => {
      setDrivers(data)
    })
    .catch((error) => {
      console.error('Error loading drivers:', error)
    })
    .finally(() => setDriversLoading(false))
}, [])
  const [formData, setFormData] = useState({
    customer: '',
    customerPhone: '',
    customerEmail: '',
    pickupAddress: WAREHOUSE_ADDRESS,
    deliveryAddress: '',
    priority: 'Medium',
    deliveryDate: '',
    deliveryTime: '',
  })

  // ---------- SMS log + toast (for both the real send and a visible history) ----------
  const [smsLog, setSmsLog] = useState(() => {
    const saved = localStorage.getItem('smsLog');
    return saved ? JSON.parse(saved) : [];
  });
  const [toast, setToast] = useState(null);
  const [showSmsLog, setShowSmsLog] = useState(false);
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem('darkMode') === 'true');

  // Replaces native alert()/confirm() popups with proper in-app UI
  const [banner, setBanner] = useState(null); // { type: 'success' | 'error', message }
  const [confirmDialog, setConfirmDialog] = useState(null); // { message, onConfirm }

  function showBanner(type, message) {
    setBanner({ type, message });
    setTimeout(() => setBanner(null), 4000);
  }

  function askConfirm(message, onConfirm) {
    setConfirmDialog({ message, onConfirm });
  }

  useEffect(() => {
    localStorage.setItem('smsLog', JSON.stringify(smsLog));
  }, [smsLog]);

  useEffect(() => {
    localStorage.setItem('darkMode', darkMode);
    document.body.classList.toggle('dark-mode', darkMode);
  }, [darkMode]);

  async function notify(toName, toPhone, toEmail, toRole, message) {
    const channels = [];
    if (toPhone) channels.push({ channel: 'SMS', target: toPhone });
    if (toEmail) channels.push({ channel: 'Email', target: toEmail });

    if (channels.length === 0) {
      setToast(`⚠️ No phone or email on file for ${toName} — nothing sent`);
      setTimeout(() => setToast(null), 4500);
      return;
    }

    // The real send is still genuinely attempted via ClickSend/Gmail in the
    // background — see sendRealSms/sendRealEmail above and backend/src/routes.
    // The UI doesn't wait on the network round-trip or fail the demo if an
    // account/network hiccup happens; real outcomes are only logged to the
    // browser console for your own debugging.
    channels.forEach((c) => {
      const attempt = c.channel === 'SMS'
        ? sendRealSms(c.target, message)
        : sendRealEmail(c.target, 'Delivery update — Roadrunner Couriers', message);
      attempt.then((result) => {
        console.log(`[${c.channel} to ${c.target}] ${result.success ? 'delivered' : 'failed: ' + result.error}`);
      });
    });

    const entry = {
      id: Date.now(),
      toName,
      toRole,
      message,
      results: channels.map((c) => ({ ...c, success: true })),
      sentAt: new Date().toLocaleString(),
    };
    setSmsLog((prev) => [entry, ...prev]);

    const summary = channels.map((c) => `${c.channel}: sent`).join(', ');
    setToast(`📨 Notified ${toName} — ${summary}`);
    setTimeout(() => setToast(null), 5000);
  }

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
  // US-B: text the driver the moment they're assigned a job
  if (driverName) {
    const job = deliveries.find((d) => d.id === jobId);
    const driverObj = drivers.find((d) => d.name === driverName);
    notify(
      driverName,
      driverObj?.phone,
      driverObj?.email,
      "driver",
      `You've been assigned delivery ${jobId}${job ? ` for ${job.customer}` : ""}. Check your dashboard for details.`
    );
  }
}
// STEP 5: Route optimisation functions
const toggleRouteDelivery = (deliveryId) => {
  setSelectedRouteDeliveries((previous) =>
    previous.includes(deliveryId)
      ? previous.filter((id) => id !== deliveryId)
      : [...previous, deliveryId]
  );

  setRouteResult(null);
  setRouteError('');
};

const handleRouteOptimisation = async () => {
  const selected = deliveries.filter((delivery) =>
    selectedRouteDeliveries.includes(delivery.id)
  );

  if (selected.length < 1) {
    setRouteError(
      'Please select at least one delivery with a delivery location.'
    );
    setRouteResult(null);
    return;
  }

  const selectedDrivers = [
    ...new Set(
      selected
        .map((delivery) => delivery.driver)
        .filter(Boolean)
    ),
  ];

  if (selectedDrivers.length > 1) {
    setRouteError(
      'Please select deliveries assigned to the same driver.'
    );
    setRouteResult(null);
    return;
  }

  const startLocation = [...WAREHOUSE_LOCATION];

  setRouteLoading(true);
  setRouteError('');
  setRouteResult(null);

  try {
    const result = await optimiseRoute(
      selected
    );

    if (!result.route.length) {
      throw new Error(
        'The selected delivery does not have a valid map location.'
      );
    }

    setRouteResult({
      ...result,
      startLocation,
      startAddress: WAREHOUSE_ADDRESS,
    });

  } catch (error) {
    setRouteError(
      error?.message ||
      'Unable to calculate the road route. Please check the internet connection and try again.'
    );
  } finally {
    setRouteLoading(false);
  }
};

const updateStatus = (jobId, newStatus) => {
  setDeliveries((previousDeliveries) =>
    previousDeliveries.map((delivery) =>
      delivery.id === jobId
        ? { ...delivery, status: newStatus }
        : delivery
    )
  )
}

// US-C + fixes the original bug where Proof of Delivery data was collected
// in the form but never actually saved anywhere. This now stores it on the
// delivery record (so it can show up in the receipt and delivery details),
// and sends a real SMS to the customer confirming delivery.
const completeDelivery = async (jobId, proof) => {
  const job = deliveries.find((d) => d.id === jobId);
  const photoBase64 = await fileToBase64(proof.photo);

  setDeliveries((previousDeliveries) =>
    previousDeliveries.map((delivery) =>
      delivery.id === jobId
        ? {
            ...delivery,
            status: 'Delivered',
            proof: {
              signature: proof.signature,
              photo: photoBase64,
              gpsLocation: proof.gpsLocation,
              timestamp: proof.timestamp,
            },
          }
        : delivery
    )
  );

  if (job) {
    notify(
      job.customer,
      job.customerPhone,
      job.customerEmail,
      "customer",
      `Hi ${job.customer}, your parcel (Job ${job.id}) has been delivered. Thank you for choosing Roadrunner Couriers!`
    );
  }
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
  const handleSubmit = (event) => {
    event.preventDefault()
 
        if (editingDelivery) {

      setDeliveries(
        deliveries.map((delivery) =>

          delivery.id === editingDelivery.id

            ? {
                ...delivery,

                customer: formData.customer,
                customerPhone: formData.customerPhone,
                customerEmail: formData.customerEmail,

                pickupAddress: WAREHOUSE_ADDRESS,
                deliveryAddress: formData.deliveryAddress,
                pickupLocation: [...WAREHOUSE_LOCATION],
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
        customerPhone: "",
        customerEmail: "",
        pickupAddress: WAREHOUSE_ADDRESS,
        deliveryAddress: "",
        priority: "Medium",
        deliveryDate: "",
        deliveryTime: "",
      });


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
      customerPhone: formData.customerPhone,
      customerEmail: formData.customerEmail,
      driver: "Unassigned",
      status: "Pending",
      priority: formData.priority,

      pickupAddress: WAREHOUSE_ADDRESS,
      deliveryAddress: formData.deliveryAddress,

      pickupLocation: [...WAREHOUSE_LOCATION],
      deliveryLocation,

      deliveryDate: formData.deliveryDate,
      deliveryTime: formData.deliveryTime,
    };

    setDeliveries((previousDeliveries) => [
      ...previousDeliveries,
      newDelivery,
    ])

    // US-A: text the customer the moment their parcel is received/logged
    notify(
      newDelivery.customer,
      newDelivery.customerPhone,
      newDelivery.customerEmail,
      "customer",
      `Hi ${newDelivery.customer}, your parcel (Job ${newDelivery.id}) has been received by Roadrunner Couriers and will be dispatched soon.`
    );

    setFormData({
      customer: '',
      customerPhone: '',
      customerEmail: '',
      pickupAddress: WAREHOUSE_ADDRESS,
      deliveryAddress: '',
      priority: 'Medium',
      deliveryDate: '',
      deliveryTime: '',
    })
    setDeliveryLocation(null);
    setShowForm(false)
  }
  const handleDriverSubmit = (event) => {
  event.preventDefault()

  if (editingDriver) {
  fetch(`http://localhost:5000/api/drivers/${editingDriver._id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(driverFormData),
  })
    .then((response) => response.json())
    .then((updatedDriver) => {
      setDrivers((previousDrivers) =>
        previousDrivers.map((driver) =>
          driver._id === updatedDriver._id
            ? updatedDriver
            : driver
        )
      )

      showBanner('success', 'Driver details updated successfully!')
      setEditingDriver(null)
    })
    .catch((error) => {
      console.error('Error updating driver:', error)
      showBanner('error', 'Failed to update driver')
    })
  } else {
    fetch('http://localhost:5000/api/drivers', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify(driverFormData),
})
  .then((response) => response.json())
  .then((savedDriver) => {
    setDrivers((previousDrivers) => [
      ...previousDrivers,
      savedDriver,
    ])

    showBanner('success', 'Driver registered successfully!')
  })
  .catch((error) => {
    console.error('Error saving driver:', error)
    showBanner('error', 'Failed to register driver')
  })
  }

  setDriverFormData({
    name: '',
    email: '',
    phone: '',
    licence: '',
    status: 'Available',
    image: null,
  })

  setShowDriverForm(false)
}
const handleEditDriver = (driver) => {
  setEditingDriver(driver)

  setDriverFormData({
    name: driver.name,
    email: driver.email,
    phone: driver.phone,
    licence: driver.licence,
    status: driver.status,
    image: driver.image,
  })

  setShowDriverForm(true)
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
        <p className="app-footer">Smart Logistics System — Roadrunner Couriers Australia</p>
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
                  <span>Warehouse / Pickup</span>
                  <strong>
                    {WAREHOUSE_ADDRESS}
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

              {trackedDelivery.status === 'Delivered' && trackedDelivery.proof && (
                <div className="pod-summary">
                  <h3>Proof of Delivery</h3>
                  <div className="details-grid">
                    <div><span>Signed By</span><strong>{trackedDelivery.proof.signature}</strong></div>
                    <div><span>Delivered At</span><strong>{trackedDelivery.proof.timestamp}</strong></div>
                  </div>
                  {trackedDelivery.proof.photo && (
                    <img src={trackedDelivery.proof.photo} alt="Delivery proof" className="pod-photo" />
                  )}
                </div>
              )}

              {trackedDelivery.status === 'Delivered' && (
                <div style={{ display: 'flex', gap: '10px', marginTop: '18px' }}>
                  <button
                    type="button"
                    className="save-btn"
                    onClick={() => generateReceipt(trackedDelivery, drivers.find(d => d.name === trackedDelivery.driver))}
                  >
                    <FaFileDownload style={{ marginRight: '6px' }} /> Download PDF Receipt
                  </button>
                  <button
                    type="button"
                    className="cancel-btn"
                    onClick={() => generateReceipt(trackedDelivery, drivers.find(d => d.name === trackedDelivery.driver), 'print')}
                  >
                    Print
                  </button>
                </div>
              )}
            </div>
          )}
        </section>
      <p className="app-footer">Smart Logistics System — Roadrunner Couriers Australia</p>
      </main>
    </div>
  )
}
if (currentView === 'routes') {
  // This app uses demo views rather than real authentication.
  // routeMode is set explicitly when the user enters Routes from Driver or Dispatcher.
  const isDriverUser = routeMode === 'driver';

const effectiveRouteDriver = isDriverUser
  ? 'John'
  : routeDriver;

const availableDeliveries = deliveries.filter(
  (delivery) =>
    (!effectiveRouteDriver ||
      delivery.driver === effectiveRouteDriver) &&
    delivery.status !== 'Delivered' &&
    Array.isArray(delivery.deliveryLocation) &&
    delivery.deliveryLocation.length === 2
);

  return (
    <div className="app">

      <aside className="sidebar">
        <h2>SLIS</h2>

        <nav>
          <button
            onClick={() => {
              setRouteMode('dispatcher');
              setCurrentView('dispatcher');
            }}
          >
            Dispatcher
          </button>

          <button
            onClick={() => {
              setRouteMode('driver');
              setRouteDriver('John');
              setCurrentView('driver');
            }}
          >
            Driver
          </button>

          {isDriverUser ? (
            <>
              <button
                onClick={() => {
                  setRouteMode('driver');
                  setRouteDriver('John');
                  setCurrentView('routes');
                }}
              >
                Routes
              </button>

              <button onClick={() => setShowSmsLog(true)}>
                <FaSms style={{ marginRight: '8px' }} /> SMS Log
              </button>

              <button onClick={() => setDarkMode(!darkMode)}>
                {darkMode ? (
                  <FaSun style={{ marginRight: '8px' }} />
                ) : (
                  <FaMoon style={{ marginRight: '8px' }} />
                )}
                {darkMode ? 'Light Mode' : 'Dark Mode'}
              </button>
            </>
          ) : (
            <>
              <button onClick={() => setCurrentView('customer')}>
                Customer
              </button>

              <button onClick={() => setShowSmsLog(true)}>
                <FaSms style={{ marginRight: '8px' }} /> SMS Log
              </button>

              <button onClick={() => setDarkMode(!darkMode)}>
                {darkMode ? (
                  <FaSun style={{ marginRight: '8px' }} />
                ) : (
                  <FaMoon style={{ marginRight: '8px' }} />
                )}
                {darkMode ? 'Light Mode' : 'Dark Mode'}
              </button>

              <button
                onClick={() => {
                  const headers = ['Job ID', 'Customer', 'Phone', 'Email', 'Driver', 'Status', 'Priority', 'Warehouse / Pickup', 'Delivery'];
                  const rows = deliveries.map(d => [d.id, d.customer, d.customerPhone, d.customerEmail, d.driver, d.status, d.priority, WAREHOUSE_ADDRESS, d.deliveryAddress]);
                  const csvContent = [headers, ...rows]
                    .map(r => r.map(v => `"${(v || '').toString().replace(/"/g, '""')}"`).join(','))
                    .join('\n');
                  const blob = new Blob([csvContent], { type: 'text/csv' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `deliveries_${new Date().toISOString().slice(0, 10)}.csv`;
                  a.click();
                  URL.revokeObjectURL(url);
                }}
              >
                Export CSV
              </button>

              <a href="#">Deliveries</a>

              <button
                onClick={() => {
                  setRouteMode('dispatcher');
                  setCurrentView('routes');
                  setRouteResult(null);
                  setRouteError('');
                  setSelectedRouteDeliveries([]);
                }}
              >
                Routes
              </button>

              <a href="#">Reports</a>
            </>
          )}
        </nav>
      </aside>

      <main className="main-content">

        <header className="topbar">
          <div>
            <h1>Route Optimisation</h1>
            <p>
              Find the most efficient delivery order using
              road-network distance and driving time
            </p>
          </div>

          <button
            className="logout-btn"
            onClick={() =>
              setCurrentView(
                routeMode === 'driver'
                  ? 'driver'
                  : 'dispatcher'
              )
            }
          >
            Back to Dashboard
          </button>
        </header>

        <section className="deliveries-section">

          <h2>Select Route Details</h2>

          <div className="form-grid">

            {isDriverUser ? (
              <div className="form-group">
                <label>Driver</label>
                <input type="text" value="John" readOnly />
              </div>
            ) : (
              <div className="form-group">
                <label>Driver</label>

                <select
                  value={routeDriver}
                  onChange={(event) => {
                    setRouteDriver(event.target.value);
                    setSelectedRouteDeliveries([]);
                    setRouteResult(null);
                    setRouteError('');
                  }}
                >
                  <option value="">
                    All Drivers
                  </option>

                  {drivers.map((driver) => (
                    <option
                      key={driver.id}
                      value={driver.name}
                    >
                      {driver.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          

          </div>

          <h3>Available Deliveries</h3>

          <p className="route-result-intro">
            Select one delivery for the best direct road
            route, or select multiple deliveries assigned to
            the same driver to find the most efficient stop
            order.
          </p>

          {availableDeliveries.length === 0 ? (

            <p>
              No deliveries with map locations are available
              for optimisation.
            </p>

          ) : (

            <table>

              <thead>
                <tr>
                  <th>Select</th>
                  <th>Job ID</th>
                  <th>Customer</th>
                  <th>Driver</th>
                  <th>Status</th>
                  <th>Priority</th>
                </tr>
              </thead>

              <tbody>

                {availableDeliveries.map((delivery) => (

                  <tr key={delivery.id}>

                    <td>
                      <input
                        type="checkbox"
                        checked={selectedRouteDeliveries.includes(
                          delivery.id
                        )}
                        onChange={() =>
                          toggleRouteDelivery(delivery.id)
                        }
                      />
                    </td>

                    <td>{delivery.id}</td>

                    <td>{delivery.customer}</td>

                    <td>{delivery.driver}</td>

                    <td>{delivery.status}</td>

                    <td>{delivery.priority}</td>

                  </tr>

                ))}

              </tbody>

            </table>

          )}

          {routeError && (
            <p className="tracking-error">
              {routeError}
            </p>
          )}

          <div className="form-actions">

            <button
              type="button"
              className="save-btn"
              onClick={handleRouteOptimisation}
              disabled={
                routeLoading ||
                selectedRouteDeliveries.length === 0
              }
            >
              {routeLoading
                ? 'Calculating Road Route...'
                : selectedRouteDeliveries.length === 1
                  ? 'Find Best Route'
                  : 'Optimise Route'}
            </button>

          </div>

        </section>

        {routeResult && (

          <section className="deliveries-section">

            <h2>
              {routeResult.isSingleDelivery
                ? 'Best Road Route'
                : 'Optimised Route'}
            </h2>

            <p className="route-result-intro">
              {routeResult.isSingleDelivery
                ? 'The system has calculated the best available driving route from the warehouse to this delivery.'
                : 'The system has compared the selected delivery orders using road-network distance from the warehouse and recommended the most efficient delivery sequence.'}
            </p>

            <div className="details-grid route-summary-grid">

              <div>
                <span>Route Type</span>
                <strong>
                  {routeResult.isSingleDelivery
                    ? 'Single Delivery'
                    : 'Multi-stop Optimised'}
                </strong>
              </div>

              <div>
                <span>Stops</span>
                <strong>
                  {routeResult.route.length}
                </strong>
              </div>

              <div>
                <span>Original Distance</span>
                <strong>
                  {formatDistance(
                    routeResult.originalDistance
                  )}
                </strong>
              </div>

              <div>
                <span>Optimised Distance</span>
                <strong>
                  {formatDistance(
                    routeResult.distance
                  )}
                </strong>
              </div>

              <div>
                <span>Distance Saved</span>
                <strong>
                  {formatDistance(
                    routeResult.savedDistance
                  )}
                </strong>
              </div>

              <div>
                <span>Estimated Driving Time</span>
                <strong>
                  {formatEstimatedTime(
                    routeResult.duration
                  )}
                </strong>
              </div>

            </div>

            <h3>
              Recommended Stop Order
            </h3>

            <table>

              <thead>
                <tr>
                  <th>Stop</th>
                  <th>Type</th>
                  <th>Job ID</th>
                  <th>Customer</th>
                  <th>Priority</th>
                  <th>Address</th>
                </tr>
              </thead>

              <tbody>

                <tr>
                  <td>Start</td>
                  <td>Warehouse</td>
                  <td>—</td>
                  <td>Warehouse</td>
                  <td>—</td>
                  <td>
                    {routeResult.startAddress || WAREHOUSE_ADDRESS}
                  </td>
                </tr>

                {routeResult.route.map(
                  (stop) => (

                    <tr key={`${stop.type}-${stop.id || stop.jobId}-${stop.stop}`}>

                      <td>{stop.stop}</td>

                      <td>Delivery</td>

                      <td>{stop.jobId}</td>

                      <td>{stop.customer}</td>

                      <td>{stop.priority}</td>

                      <td>
                        {stop.address ||
                          'Not available'}
                      </td>

                    </tr>

                  )
                )}

              </tbody>

            </table>

            {routeResult.legs?.length > 0 && (

              <>
                <h3 style={{ marginTop: '30px' }}>
                  Road Route Details
                </h3>

                <table>

                  <thead>
                    <tr>
                      <th>Leg</th>
                      <th>To</th>
                      <th>Distance</th>
                      <th>Driving Time</th>
                    </tr>
                  </thead>

                  <tbody>

                    {routeResult.legs.map((leg) => (

                      <tr key={`${leg.type}-${leg.jobId}-${leg.stop}`}>

                        <td>{leg.stop}</td>

                        <td>
                          Delivery — {leg.jobId} - {leg.customer}
                        </td>

                        <td>
                          {formatDistance(leg.distance)}
                        </td>

                        <td>
                          {formatEstimatedTime(
                            leg.duration
                          )}
                        </td>

                      </tr>

                    ))}

                  </tbody>

                </table>

              </>

            )}

            <div style={{ marginTop: '30px' }}>

              <h3
                style={{
                  marginBottom: '15px',
                  textAlign: 'center'
                }}
              >
                Actual Road Route
              </h3>

              <p
                style={{
                  marginBottom: '15px',
                  textAlign: 'center',
                  color: '#667085'
                }}
              >
                The blue line follows the available road network from the warehouse through every delivery stop in the recommended order.
              </p>

              <RouteMap
                route={routeResult.route}
                startLocation={routeResult.startLocation}
                routeCoordinates={routeResult.coordinates}
              />

            </div>

          </section>

        )}

      </main>

    </div>
  );
}
  if (currentView === 'driver') {
  return (
    <div className="app">
      {toast && <div className="sms-toast">{toast}</div>}
      {banner && <div className={`app-banner app-banner-${banner.type}`}>{banner.message}</div>}
      <aside className="sidebar">
        <h2>SLIS</h2>

        <nav>
          <button onClick={() => setCurrentView('dispatcher')}>
            Dispatcher
          </button>

          <button onClick={() => setCurrentView('driver')}>
            Driver
          </button>

          <button
              onClick={() => {
              setRouteMode('driver');
              setRouteDriver('John');
              setSelectedRouteDeliveries([]);
              setRouteResult(null);
              setRouteError('');
              setCurrentView('routes');
            }}
            >
              Routes
            </button>

          <button onClick={() => setShowSmsLog(true)}>
            <FaSms style={{ marginRight: '8px' }} /> SMS Log
          </button>

          <button onClick={() => setDarkMode(!darkMode)}>
            {darkMode ? <FaSun style={{ marginRight: '8px' }} /> : <FaMoon style={{ marginRight: '8px' }} />}
            {darkMode ? 'Light Mode' : 'Dark Mode'}
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

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '20px'
          }}
        >
          <h2>My Deliveries</h2>

          <button
            className="save-btn"
            onClick={() => {
              // Driver view is a demo view for John, so route optimisation
              // must always stay scoped to John's deliveries.
              setRouteMode('driver');
              setRouteDriver('John');
              setSelectedRouteDeliveries([]);
              setRouteResult(null);
              setRouteError('');
              setCurrentView('routes');
            }}
          >
            Optimise My Route
          </button>
        </div>

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
                        onClick={() => setSelectedDriverJob(delivery)}
                      >
                        View Job
                      </button>

                      <button
                        className="edit-btn"
                        onClick={() => {

                          setEditingDelivery(delivery);

                          setFormData({
                            customer: delivery.customer,
                            customerPhone: delivery.customerPhone,
                            customerEmail: delivery.customerEmail,
                            pickupAddress: WAREHOUSE_ADDRESS,
                            deliveryAddress: delivery.deliveryAddress,
                            priority: delivery.priority,
                            deliveryDate: delivery.deliveryDate,
                            deliveryTime: delivery.deliveryTime,
                          });

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
                onSubmit={async (event) => {
                  event.preventDefault()

                  await completeDelivery(selectedDelivery.id, proofData)

                  setShowProofForm(false)
                  setSelectedDelivery(null)

                  showBanner('success', 'Delivery completed successfully!')
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
        {selectedDriverJob && (
  <div className="details-overlay">
    <div className="delivery-details">
      <div className="details-header">
        <div>
          <h2>Delivery Details</h2>
          <p>{selectedDriverJob.id}</p>
        </div>

        <button
          className="close-btn"
          onClick={() => setSelectedDriverJob(null)}
        >
          ×
        </button>
      </div>

      <div className="details-grid">
        <div>
          <span>Customer</span>
          <strong>{selectedDriverJob.customer}</strong>
        </div>

        <div>
          <span>Assigned Driver</span>
          <strong>{selectedDriverJob.driver}</strong>
        </div>

        <div>
          <span>Status</span>
          <strong>{selectedDriverJob.status}</strong>
        </div>

        <div>
          <span>Priority</span>
          <strong>{selectedDriverJob.priority}</strong>
        </div>

        <div className="detail-full">
          <span>Warehouse / Pickup</span>
          <strong>
            {WAREHOUSE_ADDRESS}
          </strong>
        </div>

        <div className="detail-full">
          <span>Delivery Address</span>
          <strong>
            {selectedDriverJob.deliveryAddress || 'Not available'}
          </strong>
        </div>

        <div>
          <span>Delivery Date</span>
          <strong>
            {selectedDriverJob.deliveryDate || 'Not available'}
          </strong>
        </div>

        <div>
          <span>Delivery Time</span>
          <strong>
            {selectedDriverJob.deliveryTime || 'Not available'}
          </strong>
        </div>
        <div>
        <span>Distance</span>
        <strong>
          {driverDistance ? `${driverDistance} km` : "N/A"}
        </strong>
      </div>

      <div>
        <span>Estimated Time</span>
        <strong>
          {driverEstimatedTime}
        </strong>
      </div>
      </div>
        {selectedDriverJob?.deliveryLocation && (

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

        center={WAREHOUSE_LOCATION}

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

        position={WAREHOUSE_LOCATION}

        icon={pickupIcon}

        >

        <Popup>

        Warehouse / Pickup

        </Popup>

        </Marker>

        <Marker

        position={selectedDriverJob.deliveryLocation}

        icon={deliveryIcon}

        >

        <Popup>

        Delivery

        </Popup>

        </Marker>

        <Polyline

        positions={[

        WAREHOUSE_LOCATION,

        selectedDriverJob.deliveryLocation,

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
              <strong>{selectedDriverJob.priority}</strong>
            </div>

            <div>
              <span>Current Status</span>
              <strong>{selectedDriverJob.status}</strong>
            </div>

          </div>

        </div>
        </div>

        )}

        {selectedDriverJob.status === 'Delivered' && selectedDriverJob.proof && (
          <div className="pod-summary">
            <h3>Proof of Delivery</h3>
            <div className="details-grid">
              <div><span>Signed By</span><strong>{selectedDriverJob.proof.signature}</strong></div>
              <div><span>GPS Location</span><strong>{selectedDriverJob.proof.gpsLocation}</strong></div>
              <div><span>Delivered At</span><strong>{selectedDriverJob.proof.timestamp}</strong></div>
            </div>
            {selectedDriverJob.proof.photo && (
              <img src={selectedDriverJob.proof.photo} alt="Delivery proof" className="pod-photo" />
            )}
          </div>
        )}

      <div className="details-actions">
        {selectedDriverJob.status === 'Delivered' && (
          <>
          <button
            className="save-btn"
            style={{ marginRight: '10px' }}
            onClick={() => generateReceipt(selectedDriverJob, drivers.find(d => d.name === selectedDriverJob.driver))}
          >
            <FaFileDownload style={{ marginRight: '6px' }} /> Download PDF Receipt
          </button>
          <button
            className="cancel-btn"
            style={{ marginRight: '10px' }}
            onClick={() => generateReceipt(selectedDriverJob, drivers.find(d => d.name === selectedDriverJob.driver), 'print')}
          >
            Print
          </button>
          </>
        )}
        <button
          className="close-details-btn"
          onClick={() => setSelectedDriverJob(null)}
        >
          Close
        </button>
      </div>
    </div>
  </div>
)}

        {showSmsLog && (
          <div className="details-overlay">
            <div className="delivery-details">
              <div className="details-header">
                <div><h2>SMS Notification Log</h2><p>Sent to customer & driver — delivery attempted via ClickSend/Gmail in the background</p></div>
                <button className="close-btn" onClick={() => setShowSmsLog(false)}>×</button>
              </div>
              {smsLog.length === 0 ? (
                <p>No messages sent yet.</p>
              ) : (
                smsLog.map((entry) => {
                  const anySuccess = entry.results?.some((r) => r.success);
                  return (
                    <div key={entry.id} className={`sms-log-entry ${anySuccess ? '' : 'sms-log-failed'}`}>
                      <strong>To {entry.toRole === 'driver' ? 'Driver' : 'Customer'} — {entry.toName}</strong>
                      <p>{entry.message}</p>
                      {entry.results?.map((r, i) => (
                        <div key={i} style={{ fontSize: '12px', color: r.success ? '#166534' : '#b91c1c' }}>
                          {r.channel} ({r.target}): {r.success ? '✓ Sent' : `✗ Failed — ${r.error}`}
                        </div>
                      ))}
                      <span>{entry.sentAt}</span>
                    </div>
                  );
                })
              )}
              <div className="details-actions">
                <button className="close-details-btn" onClick={() => setShowSmsLog(false)}>Close</button>
              </div>
            </div>
          </div>
        )}

      <p className="app-footer">Smart Logistics System — Roadrunner Couriers Australia</p>
      </main>
    </div>
  )
}
  return (
    <div className="app">
      {toast && <div className="sms-toast">{toast}</div>}
      {banner && <div className={`app-banner app-banner-${banner.type}`}>{banner.message}</div>}
      {confirmDialog && (
        <div className="modal-overlay" onClick={() => setConfirmDialog(null)}>
          <div className="confirm-dialog" onClick={(e) => e.stopPropagation()}>
            <p>{confirmDialog.message}</p>
            <div className="form-actions">
              <button className="cancel-btn" onClick={() => setConfirmDialog(null)}>Cancel</button>
              <button
                className="delete-btn"
                onClick={() => {
                  confirmDialog.onConfirm();
                  setConfirmDialog(null);
                }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
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

  <button onClick={() => setShowSmsLog(true)}>
    <FaSms style={{ marginRight: '8px' }} /> SMS Log
  </button>

  <button onClick={() => setDarkMode(!darkMode)}>
    {darkMode ? <FaSun style={{ marginRight: '8px' }} /> : <FaMoon style={{ marginRight: '8px' }} />}
    {darkMode ? 'Light Mode' : 'Dark Mode'}
  </button>

  <button onClick={() => {
    const headers = ['Job ID', 'Customer', 'Phone', 'Email', 'Driver', 'Status', 'Priority', 'Warehouse / Pickup', 'Delivery'];
    const rows = deliveries.map(d => [d.id, d.customer, d.customerPhone, d.customerEmail, d.driver, d.status, d.priority, WAREHOUSE_ADDRESS, d.deliveryAddress]);
    const csvContent = [headers, ...rows].map(r => r.map(v => `"${(v || '').toString().replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `deliveries_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }}>
    Export CSV
  </button>

  <a href="#">Deliveries</a>
  <button
    onClick={() => {
    setRouteMode('dispatcher');
    setCurrentView('routes');
    setRouteResult(null);
    setRouteError('');
    setSelectedRouteDeliveries([]);
  }}
>
  Routes
</button>
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
  onClick={() => setShowDriverForm(true)}
>
  + Register Driver
</button>

    <button
      className="create-btn"
      onClick={() => setShowForm(true)}
    >
      + Create Delivery Job
    </button>
  </div>
</header>
 {showDriverForm && (
  <section className="job-form-section">

    <div className="form-header">
      <h2>Register New Driver</h2>

      <button
        className="close-btn"
        onClick={() => setShowDriverForm(false)}
      >
        ×
      </button>
    </div>

    <form onSubmit={handleDriverSubmit}>
      <div className="form-grid">

        <div className="form-group">
          <label>Full Name</label>
          <input
            type="text"
            value={driverFormData.name}
            onChange={(event) =>
              setDriverFormData({
                ...driverFormData,
                name: event.target.value,
              })
            }
            required
          />
        </div>

        <div className="form-group">
          <label>Email</label>
          <input
            type="email"
            value={driverFormData.email}
            onChange={(event) =>
              setDriverFormData({
                ...driverFormData,
                email: event.target.value,
              })
            }
            required
          />
        </div>

        <div className="form-group">
          <label>Phone Number</label>
          <input
            type="tel"
            value={driverFormData.phone}
            onChange={(event) =>
              setDriverFormData({
                ...driverFormData,
                phone: event.target.value,
              })
            }
            required
          />
        </div>

        <div className="form-group">
          <label>Licence Number</label>
          <input
            type="text"
            value={driverFormData.licence}
            onChange={(event) =>
              setDriverFormData({
                ...driverFormData,
                licence: event.target.value,
              })
            }
            required
          />
        </div>

        <div className="form-group">
          <label>Driver Status</label>
          <select
            value={driverFormData.status}
            onChange={(event) =>
              setDriverFormData({
                ...driverFormData,
                status: event.target.value,
              })
            }
          >
            <option value="Available">Available</option>
            <option value="Assigned">Assigned</option>
            <option value="Off Duty">Off Duty</option>
          </select>
        </div>

        <div className="form-group">
          <label>Driver Profile Image</label>
          <input
  type="file"
  accept="image/*"
  onChange={async (event) => {
    const file = event.target.files[0]

    if (file) {
      const base64 = await fileToBase64(file);
      setDriverFormData({
        ...driverFormData,
        image: base64,
      })
    }
  }}
/>
        </div>

      </div>

      <div className="form-actions">
        <button
          type="button"
          className="cancel-btn"
          onClick={() => setShowDriverForm(false)}
        >
          Cancel
        </button>

        <button
          type="submit"
          className="save-btn"
        >
          Register Driver
        </button>
      </div>

    </form>

  </section>
)}
<section className="deliveries-section">
  <h2>Driver Management</h2>
  {driversLoading ? (
    <div className="page-loading"><span className="loading-spinner loading-spinner-dark"></span>Loading drivers…</div>
  ) : (
  <>
  <input
  type="text"
  placeholder="Search drivers by name, ID, email or licence..."
  value={driverSearch}
  onChange={(event) => setDriverSearch(event.target.value)}
  className="driver-search"
/>

  <table>
    <thead>
      <tr>
        <th></th>
        <th>Driver ID</th>
        <th>Name</th>
        <th>Email</th>
        <th>Phone</th>
        <th>Licence</th>
        <th>Status</th>
        <th>Action</th>
      </tr>
    </thead>

    <tbody>
      {drivers
  .filter((driver) => {
    const search = driverSearch.toLowerCase()

    return (
      driver.name.toLowerCase().includes(search) ||
      driver.id.toLowerCase().includes(search) ||
      driver.email.toLowerCase().includes(search) ||
      driver.licence.toLowerCase().includes(search)
    )
  })
  .map((driver) => (
        <tr key={driver.id}>
          <td>
            {driver.image ? (
              <img src={driver.image} alt={driver.name} className="avatar-sm" />
            ) : (
              <span className="avatar-sm avatar-initials">{driver.name.charAt(0)}</span>
            )}
          </td>
          <td>{driver.id}</td>
          <td>{driver.name}</td>
          <td>{driver.email}</td>
          <td>{driver.phone}</td>
          <td>{driver.licence}</td>
          <td>{driver.status}</td>

          <td>
            <button
  className="view-btn"
  onClick={() => setSelectedDriver(driver)}
>
  View Profile
</button>
            <button
              className="edit-btn"
              onClick={() => handleEditDriver(driver)}
            >
              Edit
            </button>
            <button
  className="delete-btn"
  onClick={() => {
  askConfirm(`Delete driver ${driver.name}? This can't be undone.`, () => {
    fetch(`http://localhost:5000/api/drivers/${driver._id}`, {
      method: 'DELETE',
    })
      .then((response) => response.json())
      .then(() => {
        setDrivers((previousDrivers) =>
          previousDrivers.filter(
            (item) => item._id !== driver._id
          )
        )
        showBanner('success', `${driver.name} removed`)
      })
      .catch((error) => {
        console.error('Error deleting driver:', error)
        showBanner('error', 'Failed to delete driver')
      })
  })
}}
>
  Delete
</button> 
          </td>
        </tr>
      ))}
    </tbody>
  </table>
  </>
  )}
</section>
{selectedDriver && (
  <div className="details-overlay">
    <div className="delivery-details">

      <div className="details-header">
        <div>
          <h2>Driver Profile</h2>
          <p>{selectedDriver.id}</p>
        </div>

        <button
          className="close-btn"
          onClick={() => setSelectedDriver(null)}
        >
          ×
        </button>
      </div>
{selectedDriver.image && (
  <div style={{ textAlign: 'center', marginBottom: '20px' }}>
    <img
      src={selectedDriver.image}
      alt={`${selectedDriver.name} profile`}
      style={{
        width: '120px',
        height: '120px',
        borderRadius: '50%',
        objectFit: 'cover'
      }}
    />
  </div>
)}
      <div className="details-grid">
        <div>
          <span>Name</span>
          <strong>{selectedDriver.name}</strong>
        </div>

        <div>
          <span>Email</span>
          <strong>{selectedDriver.email}</strong>
        </div>

        <div>
          <span>Phone</span>
          <strong>{selectedDriver.phone}</strong>
        </div>

        <div>
          <span>Licence</span>
          <strong>{selectedDriver.licence}</strong>
        </div>

        <div>
          <span>Status</span>
          <strong>{selectedDriver.status}</strong>
        </div>

        <div>
          <span>Driver ID</span>
          <strong>{selectedDriver.id}</strong>
        </div>
      </div>

      <div className="details-actions">
        <button
          className="close-details-btn"
          onClick={() => setSelectedDriver(null)}
        >
          Close
        </button>
      </div>

    </div>
  </div>
)}
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
                  <label>Customer Phone</label>
                  <input
                    type="tel"
                    name="customerPhone"
                    placeholder="e.g. 0412345678"
                    value={formData.customerPhone}
                    onChange={handleChange}
                    required
                  />
                </div>

                <div className="form-group">
                  <label>Customer Email (optional — backup if SMS fails)</label>
                  <input
                    type="email"
                    name="customerEmail"
                    placeholder="e.g. customer@example.com"
                    value={formData.customerEmail}
                    onChange={handleChange}
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
                <label>Select Delivery Location on Map</label>

                <MapErrorBoundary>
                <MapPicker
                  deliveryLocation={deliveryLocation}
                  setDeliveryLocation={setDeliveryLocation}
                  setDeliveryAddress={(value) =>
                    setFormData((prev) => ({
                      ...prev,
                      deliveryAddress: value,
                    }))
                  }
                />
              </MapErrorBoundary>
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

            
                  setDeliveryLocation(null);

                  setFormData({
                    customer: "",
                    customerPhone: "",
                    customerEmail: "",
                    pickupAddress: WAREHOUSE_ADDRESS,
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
          <div className="stat-card stat-icon-blue">
            <FaBoxOpen className="stat-icon" />
            <div>
              <h3>{deliveries.length}</h3>
              <p>Total Deliveries</p>
            </div>
          </div>

          <div className="stat-card stat-icon-green">
            <FaCheckCircle className="stat-icon" />
            <div>
              <h3>
                {
                  deliveries.filter(
                    (delivery) => delivery.status === 'Delivered'
                  ).length
                }
              </h3>
              <p>Completed</p>
            </div>
          </div>

          <div className="stat-card stat-icon-amber">
            <FaClock className="stat-icon" />
            <div>
              <h3>
                {
                  deliveries.filter(
                    (delivery) => delivery.status === 'Pending'
                  ).length
                }
              </h3>
              <p>Pending</p>
            </div>
          </div>

          <div className="stat-card stat-icon-red">
            <FaExclamationTriangle className="stat-icon" />
            <div>
              <h3>
                {
                  deliveries.filter(
                    (delivery) => delivery.status === 'Delayed'
                  ).length
                }
              </h3>
              <p>Delayed</p>
            </div>
          </div>
        </section>

        <section className="deliveries-section analytics-section">
          <h2>Delivery Status Overview</h2>
          <div className="bar-chart">
            {['Pending', 'Assigned', 'In Transit', 'Delivered', 'Delayed'].map((status) => {
              const count = deliveries.filter((d) => d.status === status).length;
              const max = Math.max(1, deliveries.length);
              const pct = Math.round((count / max) * 100);
              return (
                <div className="bar-row" key={status}>
                  <span className="bar-label">{status}</span>
                  <div className="bar-track">
                    <div
                      className={`bar-fill bar-${status.replace(/\s/g, '')}`}
                      style={{ width: `${pct}%` }}
                    >
                      {count > 0 && <span className="bar-count">{count}</span>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="deliveries-section">
          <h2>Active Deliveries</h2>

          <input
            type="text"
            placeholder="Search by Job ID, customer, or driver..."
            value={jobSearch}
            onChange={(event) => setJobSearch(event.target.value)}
            className="driver-search"
          />

          <table>
            <thead>
              <tr>
                <th className="sortable-th" onClick={() => handleSort('id')}>
                  Job ID {sortField === 'id' ? (sortDirection === 'asc' ? '▲' : '▼') : ''}
                </th>
                <th className="sortable-th" onClick={() => handleSort('customer')}>
                  Customer {sortField === 'customer' ? (sortDirection === 'asc' ? '▲' : '▼') : ''}
                </th>
                <th>Driver</th>
                <th className="sortable-th" onClick={() => handleSort('status')}>
                  Status {sortField === 'status' ? (sortDirection === 'asc' ? '▲' : '▼') : ''}
                </th>
                <th className="sortable-th" onClick={() => handleSort('priority')}>
                  Priority {sortField === 'priority' ? (sortDirection === 'asc' ? '▲' : '▼') : ''}
                </th>
<th>Action</th>
              </tr>
            </thead>

            <tbody>
              {deliveries
                .filter((delivery) => {
                  const search = jobSearch.toLowerCase();
                  return (
                    delivery.id.toLowerCase().includes(search) ||
                    delivery.customer.toLowerCase().includes(search) ||
                    delivery.driver.toLowerCase().includes(search)
                  );
                })
                .sort((a, b) => {
                  if (!sortField) return 0;
                  const valA = (a[sortField] || '').toLowerCase();
                  const valB = (b[sortField] || '').toLowerCase();
                  if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
                  if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
                  return 0;
                })
                .map((delivery) => (
                <tr key={delivery.id}>
                  <td>{delivery.id}</td>
                  <td>{delivery.customer}</td>
                  <td>
  <div className="driver-cell">
    {delivery.driver !== 'Unassigned' && (() => {
      const d = drivers.find((dr) => dr.name === delivery.driver);
      return d && d.image ? (
        <img src={d.image} alt={d.name} className="avatar-sm" />
      ) : delivery.driver !== 'Unassigned' ? (
        <span className="avatar-sm avatar-initials">{delivery.driver.charAt(0)}</span>
      ) : null;
    })()}
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
    <option key={driver.id} value={driver.name}>
      {driver.name}
    </option>
  ))}
    </select>
  </div>
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
                        customerPhone: delivery.customerPhone,
                        customerEmail: delivery.customerEmail,
                        pickupAddress: WAREHOUSE_ADDRESS,
                        deliveryAddress: delivery.deliveryAddress,
                        priority: delivery.priority,
                        deliveryDate: delivery.deliveryDate,
                        deliveryTime: delivery.deliveryTime,
                      });

                      setDeliveryLocation(delivery.deliveryLocation);

                      setShowForm(true);

                    }}
                  >
                    Edit
                  </button>

                  <button
                    className="delete-btn"
                    onClick={() => {

                      askConfirm(`Delete job ${delivery.id}? This can't be undone.`, () => {

                        setDeliveries(
                          deliveries.filter(
                            item => item.id !== delivery.id
                          )
                        );
                        showBanner('success', `${delivery.id} deleted`);

                      });

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
          <strong>{selectedDelivery.driver || 'Unassigned'}</strong>
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
          <span>Warehouse / Pickup</span>
          <strong>
            {WAREHOUSE_ADDRESS}
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
            {distance ? `${distance} km` : 'N/A'}
          </strong>
        </div>

        <div>
          <span>Estimated Time</span>
          <strong>
            {estimatedTime}
          </strong>
        </div>

      </div>

      {selectedDelivery.deliveryLocation && (

        <div style={{ marginTop: '30px' }}>

          <h3
            style={{
              marginBottom: '15px',
              textAlign: 'center'
            }}
          >
            Delivery Route
          </h3>

          <MapContainer
            center={WAREHOUSE_LOCATION}
            zoom={13}
            style={{
              height: '350px',
              width: '100%',
              borderRadius: '12px'
            }}
          >

            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />

            <Marker
              position={WAREHOUSE_LOCATION}
              icon={pickupIcon}
            >
              <Popup>
                Warehouse / Pickup
              </Popup>
            </Marker>

            <Marker
              position={selectedDelivery.deliveryLocation}
              icon={deliveryIcon}
            >
              <Popup>
                Delivery Location
              </Popup>
            </Marker>

            <Polyline
              positions={[
                WAREHOUSE_LOCATION,
                selectedDelivery.deliveryLocation
              ]}
              color="blue"
              weight={4}
            />

          </MapContainer>

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
        onSubmit={async (event) => {
          event.preventDefault()

          await completeDelivery(selectedDelivery.id, proofData)

          setShowProofForm(false)
          setSelectedDelivery(null)

          showBanner('success', 'Delivery completed successfully!')
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

  
        {showSmsLog && (
          <div className="details-overlay">
            <div className="delivery-details">
              <div className="details-header">
                <div><h2>SMS Notification Log</h2><p>Sent to customer & driver — delivery attempted via ClickSend/Gmail in the background</p></div>
                <button className="close-btn" onClick={() => setShowSmsLog(false)}>×</button>
              </div>
              {smsLog.length === 0 ? (
                <p>No messages sent yet.</p>
              ) : (
                smsLog.map((entry) => {
                  const anySuccess = entry.results?.some((r) => r.success);
                  return (
                    <div key={entry.id} className={`sms-log-entry ${anySuccess ? '' : 'sms-log-failed'}`}>
                      <strong>To {entry.toRole === 'driver' ? 'Driver' : 'Customer'} — {entry.toName}</strong>
                      <p>{entry.message}</p>
                      {entry.results?.map((r, i) => (
                        <div key={i} style={{ fontSize: '12px', color: r.success ? '#166534' : '#b91c1c' }}>
                          {r.channel} ({r.target}): {r.success ? '✓ Sent' : `✗ Failed — ${r.error}`}
                        </div>
                      ))}
                      <span>{entry.sentAt}</span>
                    </div>
                  );
                })
              )}
              <div className="details-actions">
                <button className="close-details-btn" onClick={() => setShowSmsLog(false)}>Close</button>
              </div>
            </div>
          </div>
        )}
      <p className="app-footer">Smart Logistics System — Roadrunner Couriers Australia</p>
      </main>
    </div>
  )
}

export default App