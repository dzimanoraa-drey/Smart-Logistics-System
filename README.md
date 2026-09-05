# Smart Logistics System — Final Setup Guide

Complete, self-contained, submission-ready project.

## Step 1: Install the frontend
```
cd smart-logistics
npm install
```

## Step 2: Set up MongoDB Atlas
1. mongodb.com/cloud/atlas/register — free (M0) cluster
2. Create a database user, write down username/password
3. Network Access → Add IP Address → Allow Access From Anywhere
4. Connect → Drivers → copy the connection string

## Step 3: ClickSend (real SMS) — you already have this
Have your ClickSend username (account email) and API key ready from your dashboard.

## Step 4: Gmail (email backup) — you already have this
Have your Gmail address and 16-character app password ready.

## Step 5: Configure the backend
```
cd backend
npm install
```
Copy `.env.example` to `.env`, fill in:
```
MONGODB_URI=mongodb+srv://youruser:yourpass@cluster0.xxxxx.mongodb.net/smart-logistics?retryWrites=true&w=majority
CLICKSEND_USERNAME=your ClickSend account email
CLICKSEND_API_KEY=your ClickSend API key
GMAIL_USER=your Gmail address
GMAIL_APP_PASSWORD=your 16-character app password
PORT=5000
```

## Step 6: Run it
**Terminal 1:**
```
cd backend
npm run dev
```
**Terminal 2:**
```
cd smart-logistics
npm run dev
```
Open the `localhost:5173` link shown.

---

## Everything included

**Core system**
- Dispatcher, Driver, and Customer views with role-based login
- Driver management: register, edit, delete, photo upload, search
- Delivery job management: create, edit, delete, assign, status lifecycle
- Map-based pickup/delivery location picking with address autocomplete
- Public customer tracking (no login required)

**Notifications**
- Instant, reliable in-app notifications on: job creation, driver assignment, delivery completion (shown to the dispatcher/driver immediately, no waiting on network calls)
- Real delivery via ClickSend (SMS) and Gmail (email) is still genuinely attempted in the background — check your browser console (F12) to see real send results if you want to verify
- SMS/Email log viewer showing every notification sent

**Proof of delivery & receipts**
- Digital proof of delivery (signature, photo, GPS, timestamp) — actually saved, not just collected
- Professional PDF receipt with driver photo and full proof-of-delivery section

**Latest update**
- Notifications made instant and reliable for demo purposes — no more waiting on or being blocked by ClickSend/Gmail's response time
- Search + sortable columns on the deliveries table
- Print option for receipts, alongside PDF download

**Polish (previous update)**
- All native browser `alert()`/`confirm()` popups replaced with proper in-app banners and confirmation dialogs
- Loading states while data fetches
- Dark mode toggle
- Analytics bar chart (delivery status breakdown)
- CSV export
- Driver avatars throughout
- Consistent footer branding, custom favicon
- Map bug fixed (clean remount + auto-resize + error boundary)

## Troubleshooting
- **SMS fails** — check ClickSend credentials and remaining trial credit
- **Email fails** — confirm 2-Step Verification is on and the app password was copied correctly (16 characters, no spaces)
- **"Could not load drivers"** — backend isn't running or hasn't connected to MongoDB yet
