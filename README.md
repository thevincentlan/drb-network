# DRB Network Database

> *Continuing a legacy of success*

A private alumni network database for DRB members, built with vanilla HTML/CSS/JS and powered by Google Sheets + Apps Script.

**Live:** [thevincentlan.github.io/drb-network](https://thevincentlan.github.io/drb-network)

---

## Features

### 🔐 Authentication
- **Email OTP login** — members enter their email, receive a 6-digit code, and verify to access the database
- **Admin bypass** — local-only admin access via `secrets.js` (gitignored, not deployed to production)
- **Session persistence** — sessions last 2 hours via `sessionStorage`

### 📊 Dashboard View
- **Stat cards** — total alumni, cities, industries, class years with animated counters
- **Featured alumni carousel** — 3 random members with photos, highlighted on each load
- **Browse All Alumni** grid — sortable, searchable

### 🗂 Grid View
- Card-based layout with photo, name, class year, city, and occupation
- **Photo swap on hover** — shows DRB photo when hovering (if available)
- Supports search and sort

### 📋 Timeline View
- **Desktop:** grouped by class year with flip-card photo swap on hover
- **Mobile:** expandable cards with "Bio and Contact" toggle
- Filterable by class year, major, industry, Greek affiliation, and more

### 🗺 Map View
- **Dark-themed CartoDB tiles** for a polished look
- **200+ hardcoded US city coordinates** + **Nominatim geocoding fallback** for unlisted cities
- Circle markers sized by alumni count, with **count labels** for multi-alumni cities
- Clickable popups with alumni names linking to profiles
- Summary bar showing total cities and alumni mapped

### 👤 Profile View
- Full profile page with photo, class year, city, education, career, DRB stats, and contact info
- **Photo swap on hover** — front (current photo) ↔ back (DRB photo)
- **Edit My Profile** button for logged-in users to update their own info
- **Admin edit** — admins can edit any member's profile

### ✏️ Profile Editing
- Users can edit: city, occupation, phone, Instagram, social media, website, about/highlights
- **Writes back to Google Sheets** via Apps Script backend
- Admins can edit any profile (sends the profile owner's email to the backend)

### 🔍 Search & Sort
- **Global search** works across Dashboard, Grid, and Timeline views
- **Sort by Class Year** or **Alphabetical** — works across all views
- **Hierarchical filters** — class year, major category, industry, Greek org, state

### 📸 Photos
- **Face positioning** — `object-position: top center` keeps faces in frame on all cropped images
- **Photo swap on hover** — available on timeline cards, grid cards, featured cards, and profile view
- Default avatar for members without photos

---

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Frontend | HTML, CSS, JavaScript (vanilla) |
| Data | Google Sheets (2 tabs: old + new responses) |
| Backend | Google Apps Script (OTP auth, profile updates) |
| Maps | Leaflet.js + CartoDB dark tiles |
| CSV Parsing | PapaParse |
| Hosting | GitHub Pages |
| Geocoding | Nominatim (OpenStreetMap) |

## Architecture

```
index.html          → Main HTML structure
├── secrets.js      → Admin password (gitignored)
├── config.js       → Data normalization maps, social icons
└── app.js          → All application logic

backend.gs          → Google Apps Script (deployed as web app)
├── doGet()         → Handles login (request_otp, verify_otp, admin_login)
└── doPost()        → Handles profile updates (update_profile)
```

## Data Flow

1. **Login:** Frontend → Apps Script (`request_otp`) → sends email with code
2. **Verify:** Frontend → Apps Script (`verify_otp`) → returns both sheet CSVs
3. **Admin login:** Frontend → Apps Script (`admin_login`) → returns both CSVs (no email check)
4. **Edit profile:** Frontend → Apps Script (`update_profile`) → writes to Google Sheet → returns fresh CSVs
5. **Session:** CSVs cached in `sessionStorage` for 2-hour session

## Local Development

```bash
# Serve locally
python3 -m http.server 8080

# Admin login (local only)
# Use password from secrets.js
```

## Deployment

```bash
# Push frontend to GitHub Pages
git add -A && git commit -m "update" && git push

# Push backend to Apps Script
cd google_script
clasp push
clasp deploy -i <DEPLOYMENT_ID> -d "description"
```

## Security Notes

- `secrets.js` is gitignored — admin bypass only works locally
- The Apps Script URL and Google Sheet URL are in `app.js` (public)
- OTP codes expire after 15 minutes
- Profile edits go through the Apps Script backend which validates the request
