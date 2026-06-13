# 🌍 EcoTrack — Carbon Footprint Awareness Platform

> **PromptWar Challenge 3** | AI-powered platform to help individuals understand, track, and reduce their carbon footprint through smart insights, interactive maps, and personalized action plans.

---

## 🚀 Quick Start

```bash
# 1. Install dependencies
pip install -r requirements.txt

# 2. Run (serves everything on http://localhost:8000)
python app.py
```

Open **http://localhost:8000** in your browser. That's it.

---

## 🎯 Chosen Vertical

**Individual Carbon Footprint Awareness** — targeting everyday users who want to understand their personal environmental impact and take meaningful action through data-driven, AI-personalized guidance.

---

## 🧠 Approach & Logic

### Architecture
```
python app.py
    └── FastAPI (port 8000)
         ├── GET  /              → Serves index.html (SPA)
         ├── GET  /static/*      → CSS, JS, assets
         ├── POST /api/calculate → Carbon footprint calculator
         ├── POST /api/chat      → Gemini AI assistant (EcoGuide)
         ├── POST /api/insights  → AI personalized action plan
         ├── POST /api/log-activity → Track green actions
         ├── GET  /api/leaderboard  → Community ranking
         ├── GET  /api/history/:id  → User activity history
         ├── GET  /api/stats        → Platform-wide stats
         └── GET  /api/config       → Frontend config (API keys)
```

### Emission Calculation Logic
Emissions are computed using **IPCC & IEA 2023 emission factors** across 4 categories:

| Category | Factors Used |
|----------|-------------|
| 🚗 Transport | Car type (petrol/diesel/hybrid/EV), km/week, flights, public transit |
| ⚡ Energy | kWh electricity × grid factor, natural gas m³, renewable % offset |
| 🥗 Food | Diet type (vegan→heavy meat), monthly food waste kg |
| 🛍️ Lifestyle | New clothes/year, online orders/month, streaming hours/day |

**Eco Score (0–100)**: Normalized against US average (14,000 kg/yr). Higher = greener.

### AI Decision Logic (Gemini)
- EcoGuide maintains **per-session chat history** for contextual conversations
- Insights endpoint uses **structured JSON prompting** for consistent action plan output
- Carbon context is injected into every Gemini prompt for **personalized advice**
- Fallback responses ensure graceful degradation if AI is unavailable

---

## ✨ How the Solution Works

### 1. 🧮 Carbon Calculator
Fill in 4 lifestyle categories → get instant CO₂ breakdown, Eco Score, and comparisons vs global/US averages.

### 2. 🤖 AI Insights (Google Gemini)
Gemini 1.5 Flash analyzes your footprint and returns:
- Executive summary of your impact
- Top 3 highest-impact actions (with difficulty & timeframe)
- Quick win (do today) + biggest opportunity
- Personalized reduction goal recommendation

### 3. 🗺️ Eco Explorer Map (Google Maps + Places + Directions)
- Auto-detects your location via browser geolocation
- Shows nearby **EV charging stations**, **green spaces**, **transit stops**
- **Route Carbon Comparator**: Enter origin & destination → see CO₂ cost for car, bus, train, cycling
- Dark-themed custom map style

### 4. 📈 Progress Tracker (Google Charts)
- Log green actions (presets + custom)
- 14-day CO₂ savings chart
- **Badge system** (9 badges: First Step, Eco Hero, Streak master, etc.)
- **Streak counter** with daily continuity tracking

### 5. 🏆 Community Leaderboard
- Anonymous ranking by total CO₂ saved
- Platform-wide impact statistics
- Google Charts **Geo Chart** showing global impact distribution

### 6. 💬 EcoGuide AI Chat (Google Gemini)
- Real-time chat with context-aware AI assistant
- Maintains conversation history per session
- Markdown formatting in responses
- Suggestion chips for common questions

---

## 🔧 Google Products Used (8 Total)

| Product | Integration |
|---------|-------------|
| **Google Gemini AI** | EcoGuide chat assistant + personalized insights generation |
| **Google Maps JavaScript API** | Interactive dark-themed eco map |
| **Google Places API** | Nearby EV stations, parks, transit stops |
| **Google Directions API** | Multi-modal route carbon cost comparison |
| **Google Charts** | Emission breakdown (bar), progress (column), geo (world map) |
| **Google Fonts** | Outfit + Inter + JetBrains Mono typography |
| **Google Analytics 4** | User behavior tracking (section views, calculations, chat events) |
| **Google Tag Manager** | Tag management and conversion event tracking |

---

## 📁 Project Structure

```
Carbon Footprint Awareness Platform/
├── app.py              # FastAPI server — runs everything
├── requirements.txt    # Python dependencies
├── README.md           # This file
├── data/
│   └── user_data.json  # Auto-created: persistent activity storage
└── static/
    ├── index.html      # Single-page application (all 6 sections)
    ├── style.css       # Premium dark glassmorphism theme
    └── app.js          # Frontend logic (charts, maps, AI, tracker)
```

---

## 🎨 Design System

- **Theme**: Deep space dark (`#050b15`) with emerald green (`#10b981`) accents
- **Style**: Glassmorphism cards, smooth gradient backgrounds
- **Typography**: Outfit (display), Inter (body), JetBrains Mono (data)
- **Animations**: Floating globe, particle system, score ring, counter animations
- **Responsive**: Mobile-first, works on all screen sizes
- **Accessibility**: WCAG 2.1 AA — ARIA labels, keyboard nav, focus indicators, `role` attributes, `aria-live` regions

---

## 🔒 Security Practices

- API keys served via `/api/config` endpoint (not hardcoded in frontend HTML)
- CORS middleware configured for controlled access
- Input validation via **Pydantic** models on all POST endpoints
- Session IDs are client-generated random strings (no PII collected)
- Activity data anonymized before leaderboard display (only first 6 chars of session ID shown)
- No SQL injection risk (in-memory + JSON file storage, no SQL)

---

## ⚙️ Efficiency

- **Frontend**: Single HTML file, no build step, zero npm required
- **Backend**: FastAPI async endpoints, non-blocking Gemini calls
- **Storage**: JSON file with in-memory cache (no database overhead for demo)
- **Charts**: Google Charts loaded once and reused across sections
- **Maps**: Lazy-initialized only when Map section is first opened
- **Gemini**: Per-session chat object reuse (no repeated context setup)
- **LocalStorage**: All user data cached client-side for instant reload

---

## 🧪 Testing

### API Endpoints
```bash
# Health check
curl http://localhost:8000/api/health

# Calculate footprint
curl -X POST http://localhost:8000/api/calculate \
  -H "Content-Type: application/json" \
  -d '{"car_km_per_week":150,"car_type":"petrol","flights_per_year":2,"diet_type":"omnivore","electricity_kwh":300}'

# Chat with AI
curl -X POST http://localhost:8000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"session_id":"test123","message":"How can I reduce my carbon footprint?"}'

# Get leaderboard
curl http://localhost:8000/api/leaderboard

# API docs (interactive)
open http://localhost:8000/docs
```

### Manual Verification Checklist
- [ ] Calculator computes results and shows score ring animation
- [ ] AI Insights load after calculation (Gemini response)
- [ ] Google Map loads with EV stations near your location
- [ ] Route comparison shows CO₂ for different transport modes
- [ ] Activity logging updates chart and badges
- [ ] Chat responds with contextual Gemini AI answers
- [ ] Leaderboard shows community rankings
- [ ] Works on mobile (responsive layout)

---

## 📋 Assumptions

1. **Single-user demo**: Session is browser-based (localStorage); no auth system.
2. **Emission factors**: Global averages used (IPCC 2023). Real values vary by country/region.
3. **Grid electricity**: Default 0.233 kg CO₂/kWh (global average). Actual varies by energy mix.
4. **Flights**: Average distances assumed per category (short=500km, medium=3000km, long=9000km).
5. **Food waste**: 2.5 kg CO₂e per kg wasted (landfill average).
6. **Streaming**: Based on average device + network energy consumption.
7. **Persistence**: Data stored in `data/user_data.json` — resets if file deleted.
8. **Internet required**: Google Maps, Charts, Fonts, and Gemini AI need internet access.

---

## 🌱 Emission Factors Reference

| Source | Factor |
|--------|--------|
| Petrol car | 0.21 kg CO₂/km |
| Diesel car | 0.17 kg CO₂/km |
| Hybrid car | 0.11 kg CO₂/km |
| Electric car | 0.05 kg CO₂/km |
| Bus | 0.089 kg CO₂/km |
| Grid electricity | 0.233 kg CO₂/kWh |
| Natural gas | 2.04 kg CO₂/m³ |
| Vegan diet | 1.5 kg CO₂e/day |
| Omnivore diet | 5.0 kg CO₂e/day |
| Heavy meat diet | 7.5 kg CO₂e/day |

*Sources: IPCC AR6, IEA 2023, Our World in Data*

---

## 📜 License

MIT License — Built for PromptWar Challenge 3 | Carbon Footprint Awareness Platform

---

<div align="center">
  <strong>🌍 Built to make sustainability measurable, actionable, and community-driven.</strong>
</div>
