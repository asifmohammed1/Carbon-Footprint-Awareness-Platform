# 🌍 EcoTrack — Carbon Footprint Awareness Platform

> **Hack2Skill AI Challenge** | An AI-powered platform designed to help individuals understand, track, and reduce their carbon footprint. Powered by Google Gemini AI, Google Charts, dynamic local fallback engines, and optimized microservices.

⚡ **Live Demo (Google Cloud Run)**: [https://ecotrack-app-391319301858.us-central1.run.app](https://ecotrack-app-391319301858.us-central1.run.app)

---

## 🚀 Quick Start

Follow these simple steps to run EcoTrack locally:

### 1. Configure Environment Variables
Create a `.env` file in the root directory (refer to `.env.example`):
```env
GEMINI_API_KEY=your_gemini_api_key_here
MAPS_API_KEY=your_google_maps_api_key_here
PORT=8000
DATA_FILE=data/user_data.json
ALLOWED_ORIGINS=http://localhost:8000,http://127.0.0.1:8000
```

### 2. Install Dependencies
Initialize and activate your virtual environment, then install the required libraries:
```bash
# Windows
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
```

### 3. Run the Server
Start the Uvicorn ASGI server (serves the SPA frontend and REST API on port 8000):
```bash
python app.py
```
Open **http://localhost:8000** in your browser.

---

## 🎯 Chosen Vertical

**Individual Carbon Footprint Awareness** — Targeting everyday consumers who want to calculate, understand, and reduce their personal carbon footprints. The platform bridges the gap between calculations and action by providing personalized AI-generated plans, community gamification, and interactive local eco-recommendations.

---

## 🧠 Approach & Logic

### Full-Stack Architecture
EcoTrack utilizes a unified, high-performance architecture:
```
python app.py
    └── FastAPI Server (port 8000)
         ├── GET  /              → Serves index.html (Single Page App)
         ├── GET  /static/*      → Serves CSS/JS assets
         ├── POST /api/calculate → Computes footprint and updates user profile
         ├── POST /api/chat      → Context-aware chat with Gemini AI (EcoGuide)
         ├── POST /api/insights  → Structured JSON personalized action plans
         ├── POST /api/log-activity → Logs an eco-friendly action
         ├── GET  /api/leaderboard  → Fetches top community rankings (anonymized)
         ├── GET  /api/history/:id  → Retrieves user session history (Indexed O(1))
         └── GET  /api/stats        → Platform-wide impact metrics (TTL Cached)
```

### 🧮 Emission Calculation Logic
Calculations are based on **IPCC AR6 & IEA 2023 emission factors** across four lifestyle sectors:
* **Transport**: Petrol, Diesel, Hybrid, or Electric vehicle emissions per kilometer + flights (scaled by distance category) + public transit passenger-kilometer indices.
* **Energy**: Monthly electricity usage (multiplied by grid emission factors and offset by renewable energy ratios) + natural gas volumes.
* **Food**: Daily diet carbon footprint intensities (ranging from Vegan at 1.5kg CO₂/day to Heavy Meat at 7.5kg CO₂/day) + food waste landfill factors.
* **Lifestyle**: Production carbon footprint of new apparel purchases + shipping factors for online orders + hourly data center and device energy usage for streaming.

**Eco Score (0–100)**: Normalized against the average US footprint (14,000 kg CO₂e/year) where higher scores represent a greener footprint.

### 🛡️ Smart API Rate-Limit Eco-Fallback
To guarantee uninterrupted operation even under severe network constraints or API quota limits (such as Google Gemini `429 ResourceExhausted` errors):
1. **Dynamic Heuristics Chat**: The backend intercepts connection and quota exceptions, falling back to a local rule-based conversational agent (`get_offline_response`). It analyzes user inputs (e.g., questions matching transport, food, shopping, or energy) and provides detailed, customized tips based on the user's highest emission categories.
2. **Offline Insights Planner**: If Gemini fails to construct an action plan, `generate_offline_insights` runs in the backend, programmatically assembling a custom structured JSON action plan tailored specifically to the user's primary emission sources.
3. **Visual Feedback**: The interface clearly indicates when Eco-Fallback Mode is active, ensuring transparent communication without breaking the user experience.

---

## ✨ Core Features

1. **Carbon Calculator**: Seamless inputs for weekly mileage, home utility consumption, diet preferences, shopping frequency, and streaming habits. Provides instant category breakdowns.
2. **AI Action Plan (Google Gemini)**: Analyzes results to suggest three high-impact reduction tasks (categorized by difficulty and timeframe), a quick win, a primary reduction target, and a personalized motivational message.
3. **Interactive Eco Explorer (Leaflet.js + OpenStreetMap)**:
   - Dynamic maps to search nearby EV charging stations, green parks, and transit terminals.
   - **Route Carbon Comparator**: Compares exact CO₂e costs across driving (petrol vs. EV), transit, and active commuting options (walking/cycling).
4. **Streak & Gamification Tracker**: Integrates 9 earnable milestone badges (e.g., *Eco Hero*, *Streak Master*) and a consecutive-day tracking script.
5. **Platform Impact Board**:
   - Dynamic **Google Charts** (column, bar, and progress charts) showing your savings trends.
   - A global **Google GeoChart** illustrating user distribution and community impact.

---

## 🔧 Google Products Integrated (6+)

* **Google Gemini AI API**: Powers the EcoGuide chatbot and creates structured action plans (1.5 Flash).
* **Google Charts**: Renders emission breakdowns, target progress bars, and localized distribution maps.
* **Google Fonts**: Custom, high-contrast typography (Outfit, Inter, JetBrains Mono).
* **Google Analytics 4**: Captures engagement metrics through custom events (e.g., `footprint_calculated`, `insights_viewed`, `chat_message`).
* **Google Tag Manager**: Standardized container tags with noscript fail-safes.
* **FastAPI + Python Backend**: Optimized backend using async routines, concurrency locks, and slowapi limiters.

---

## 🔒 Security & Performance Optimizations

* **Zero Hardcoded Secrets**: All keys are loaded dynamically from `.env` configurations.
* **Rate Limiting**: Configured `slowapi` decorators limiting chat to 15 requests/minute and insights to 10 requests/minute to prevent API exhaustion.
* **Thread-Safe Data Layer**: Writes to the JSON data file are queued via `asyncio.Lock` to eliminate concurrency issues.
* **CORS Whitelisting**: Restricted domains to prevent unauthorized API requests.
* **O(1) Data Retrieval**: Created `activity_index` mappings on load, shifting log queries from O(N) linear scans to instant indexed lookups.
* **TTL Caching**: Caches platform-wide aggregates for 30 seconds to minimize file read/write operations under high traffic.
* **Accessibility (WCAG 2.1 AA)**: Includes skip-to-main anchors, focus states (`:focus-visible`), ARIA landmarks, `aria-live` regions, and screen-reader alternatives.

---

## 🧪 Testing

### Automated Test Suite
The project includes a complete suite of automated backend tests under `tests/`.
To run the test suite:
```bash
# Verify all endpoints, calculation accuracy, and fallback logic
pytest -v
```

**Tested Components**:
- Health status and environment checking.
- Core math formulas (`calculate_carbon`) with boundary inputs.
- API calculation POST payload validations.
- Activity history index lookups and leaderboard ranks.
- Local eco-fallback rules and offline JSON insight schemas.

### Manual Endpoint Testing
You can manually query the API using `curl`:
```bash
# Health check
curl http://localhost:8000/api/health

# Calculate footprint
curl -X POST http://localhost:8000/api/calculate \
  -H "Content-Type: application/json" \
  -d '{"car_km_per_week":150,"car_type":"petrol","flights_per_year":2,"diet_type":"omnivore","electricity_kwh":300}'

# Fetch anonymized leaderboard
curl http://localhost:8000/api/leaderboard
```

---

## 🌱 Emission Factors Reference

| Factor Source | Value |
|---|---|
| Petrol Car | 0.21 kg CO₂e / km |
| Diesel Car | 0.17 kg CO₂e / km |
| Hybrid Car | 0.11 kg CO₂e / km |
| Electric Car | 0.05 kg CO₂e / km |
| Public Transit | 0.089 kg CO₂e / km |
| Grid Electricity | 0.233 kg CO₂e / kWh |
| Natural Gas | 2.04 kg CO₂e / m³ |
| Heavy Meat Diet | 7.5 kg CO₂e / day |
| Vegan Diet | 1.5 kg CO₂e / day |

*Sources: IPCC Sixth Assessment Report (AR6), International Energy Agency (IEA) 2023, Our World in Data.*

---

## 📜 License
MIT License — Hack2Skill Challenge | EcoTrack Carbon Footprint Awareness Platform
