"""
Carbon Footprint Awareness Platform
=====================================
Run with: python app.py
Serves frontend + API on http://localhost:8000
"""

import os
import json
import uuid
import asyncio
import datetime
from pathlib import Path
from typing import Optional, List, Dict, Any

import google.generativeai as genai
import uvicorn
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

# ─── Configuration ────────────────────────────────────────────────────────────

GEMINI_API_KEY = "AQ.Ab8RN6IyJX9iQg6wz0BmzPXPArJdpSLBKQfV3ZfQOABRXVqJFQ"
MAPS_API_KEY   = "AIzaSyB7iRw2B4y3ipsO_4zlWamewOFYkfsVDXM"
PORT           = 8000
DATA_FILE      = Path("data/user_data.json")

# Configure Gemini
genai.configure(api_key=GEMINI_API_KEY)
model = genai.GenerativeModel("gemini-1.5-flash")

# ─── FastAPI App ───────────────────────────────────────────────────────────────

app = FastAPI(
    title="Carbon Footprint Awareness Platform",
    description="AI-powered platform to track and reduce carbon footprint",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount static files
static_dir = Path("static")
static_dir.mkdir(exist_ok=True)
app.mount("/static", StaticFiles(directory="static"), name="static")

# Ensure data directory exists
DATA_FILE.parent.mkdir(exist_ok=True)

# ─── In-Memory Storage ─────────────────────────────────────────────────────────

def load_data() -> Dict:
    if DATA_FILE.exists():
        try:
            with open(DATA_FILE, "r") as f:
                return json.load(f)
        except Exception:
            pass
    return {"users": {}, "activities": [], "leaderboard": []}

def save_data(data: Dict):
    with open(DATA_FILE, "w") as f:
        json.dump(data, f, indent=2, default=str)

DB = load_data()

# Chat sessions stored in memory
chat_sessions: Dict[str, Any] = {}

# ─── Pydantic Models ──────────────────────────────────────────────────────────

class CarbonInput(BaseModel):
    session_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    # Transport
    car_km_per_week: float = 0
    car_type: str = "petrol"          # petrol, diesel, electric, hybrid
    flights_per_year: int = 0
    flight_type: str = "short"        # short, medium, long
    public_transport_km: float = 0
    # Home Energy
    electricity_kwh: float = 0
    natural_gas_cubic_m: float = 0
    renewable_energy_pct: float = 0   # 0-100
    # Food
    diet_type: str = "omnivore"       # vegan, vegetarian, pescatarian, omnivore, heavy_meat
    food_waste_kg: float = 0
    # Shopping & Lifestyle
    new_clothes_per_year: int = 0
    online_orders_per_month: int = 0
    streaming_hours_per_day: float = 0

class ChatMessage(BaseModel):
    session_id: str
    message: str
    carbon_context: Optional[Dict] = None

class ActivityLog(BaseModel):
    session_id: str
    activity_type: str
    description: str
    co2_saved_kg: float
    date: Optional[str] = None

class GoalInput(BaseModel):
    session_id: str
    target_reduction_pct: float
    timeline_months: int

# ─── Emission Factors (kg CO₂e) ───────────────────────────────────────────────

EMISSION_FACTORS = {
    "car": {
        "petrol":   0.21,   # per km
        "diesel":   0.17,
        "hybrid":   0.11,
        "electric": 0.05,
    },
    "flight": {
        "short":    0.255,  # per km, short-haul (<1500km avg 500km)
        "medium":   0.195,  # medium-haul
        "long":     0.150,  # long-haul (more efficient per km)
    },
    "flight_distance": {
        "short":  500,
        "medium": 3000,
        "long":   9000,
    },
    "public_transport": 0.089,   # per km (bus average)
    "electricity": 0.233,         # per kWh (global average grid)
    "natural_gas": 2.04,          # per cubic metre
    "diet": {
        "vegan":        1.5,    # kg CO2e per day
        "vegetarian":   2.5,
        "pescatarian":  3.0,
        "omnivore":     5.0,
        "heavy_meat":   7.5,
    },
    "food_waste":         2.5,   # per kg wasted
    "clothing":           33.4,  # per new item (average)
    "online_order":       0.5,   # per delivery
    "streaming":          0.036, # per hour (kWh × 0.233)
}

GLOBAL_AVERAGE_ANNUAL_KG = 4_000   # ~4 tonnes CO2e per person (world average)
UK_AVERAGE_ANNUAL_KG     = 5_500
US_AVERAGE_ANNUAL_KG     = 14_000

# ─── Carbon Calculation Logic ─────────────────────────────────────────────────

def calculate_carbon(data: CarbonInput) -> Dict:
    results = {}

    # Transport
    car_weekly  = data.car_km_per_week * EMISSION_FACTORS["car"].get(data.car_type, 0.21)
    car_annual  = car_weekly * 52
    
    flight_dist = EMISSION_FACTORS["flight_distance"].get(data.flight_type, 500)
    flight_ef   = EMISSION_FACTORS["flight"].get(data.flight_type, 0.255)
    flight_annual = data.flights_per_year * flight_dist * 2 * flight_ef  # round trip

    pt_annual   = data.public_transport_km * 52 * EMISSION_FACTORS["public_transport"]
    transport_total = car_annual + flight_annual + pt_annual

    # Home Energy
    renewable_factor = 1 - (data.renewable_energy_pct / 100)
    electricity_annual = data.electricity_kwh * 12 * EMISSION_FACTORS["electricity"] * renewable_factor
    gas_annual = data.natural_gas_cubic_m * 12 * EMISSION_FACTORS["natural_gas"]
    energy_total = electricity_annual + gas_annual

    # Food
    diet_daily  = EMISSION_FACTORS["diet"].get(data.diet_type, 5.0)
    food_annual = diet_daily * 365
    waste_annual = data.food_waste_kg * 12 * EMISSION_FACTORS["food_waste"]
    food_total  = food_annual + waste_annual

    # Lifestyle
    clothing_annual  = data.new_clothes_per_year * EMISSION_FACTORS["clothing"]
    shopping_annual  = data.online_orders_per_month * 12 * EMISSION_FACTORS["online_order"]
    streaming_annual = data.streaming_hours_per_day * 365 * EMISSION_FACTORS["streaming"]
    lifestyle_total  = clothing_annual + shopping_annual + streaming_annual

    total = transport_total + energy_total + food_total + lifestyle_total

    # Comparison
    vs_global = round((total / GLOBAL_AVERAGE_ANNUAL_KG - 1) * 100, 1)
    vs_us     = round((total / US_AVERAGE_ANNUAL_KG - 1) * 100, 1)

    # Score (0-100, lower footprint = higher score)
    score = max(0, min(100, int(100 - (total / US_AVERAGE_ANNUAL_KG) * 50)))

    results = {
        "total_kg_per_year": round(total, 1),
        "total_tonnes": round(total / 1000, 2),
        "breakdown": {
            "transport": {
                "total": round(transport_total, 1),
                "car":   round(car_annual, 1),
                "flights": round(flight_annual, 1),
                "public_transport": round(pt_annual, 1),
            },
            "energy": {
                "total": round(energy_total, 1),
                "electricity": round(electricity_annual, 1),
                "gas": round(gas_annual, 1),
            },
            "food": {
                "total": round(food_total, 1),
                "diet": round(food_annual, 1),
                "waste": round(waste_annual, 1),
            },
            "lifestyle": {
                "total": round(lifestyle_total, 1),
                "clothing": round(clothing_annual, 1),
                "shopping": round(shopping_annual, 1),
                "streaming": round(streaming_annual, 1),
            },
        },
        "comparisons": {
            "vs_global_avg_pct": vs_global,
            "vs_us_avg_pct": vs_us,
            "global_avg_kg": GLOBAL_AVERAGE_ANNUAL_KG,
            "us_avg_kg": US_AVERAGE_ANNUAL_KG,
        },
        "eco_score": score,
        "trees_to_offset": round(total / 21, 0),  # avg tree absorbs 21kg/yr
        "session_id": data.session_id,
        "timestamp": datetime.datetime.utcnow().isoformat(),
    }

    # Persist
    DB["activities"].append({
        "session_id": data.session_id,
        "type": "calculation",
        "data": results,
        "timestamp": results["timestamp"],
    })
    save_data(DB)

    return results

# ─── Gemini AI Helper ─────────────────────────────────────────────────────────

SYSTEM_PROMPT = """You are EcoGuide, an expert AI assistant for the Carbon Footprint Awareness Platform.
You help users understand their carbon footprint, provide personalized actionable tips, and motivate them to live more sustainably.

Key principles:
- Be encouraging, not preachy
- Give specific, practical advice
- Quantify impact when possible (e.g., "switching to LED bulbs saves ~150kg CO2/year")
- Reference local/regional options when known
- Keep responses concise (2-4 paragraphs max unless detailed analysis requested)
- Use emojis sparingly but effectively
- Always end with one concrete next action the user can take TODAY

You have access to the user's carbon footprint data when provided. Use it to personalize advice.
Format numbers clearly. Use metric units (kg, km) with imperial equivalents when helpful."""

async def get_gemini_response(session_id: str, user_message: str, context: Optional[Dict] = None) -> str:
    """Get response from Gemini AI, maintaining chat history per session."""
    try:
        if session_id not in chat_sessions:
            chat_sessions[session_id] = model.start_chat(history=[])

        chat = chat_sessions[session_id]

        # Build context-enriched message
        if context:
            context_str = f"""
[User's Carbon Data]
- Annual footprint: {context.get('total_kg_per_year', 'N/A')} kg CO2e
- Eco Score: {context.get('eco_score', 'N/A')}/100
- Biggest source: {max(context.get('breakdown', {}).items(), key=lambda x: x[1].get('total', 0) if isinstance(x[1], dict) else 0)[0] if context.get('breakdown') else 'unknown'}
- Trees needed to offset: {context.get('trees_to_offset', 'N/A')}

[User's Question]
{user_message}"""
        else:
            context_str = user_message

        full_prompt = f"{SYSTEM_PROMPT}\n\n{context_str}"

        response = chat.send_message(full_prompt)
        return response.text

    except Exception as e:
        return f"I'm having trouble connecting right now. Please try again. Error: {str(e)}"


async def get_ai_insights(carbon_data: Dict) -> Dict:
    """Generate structured AI insights from carbon calculation."""
    try:
        breakdown = carbon_data.get("breakdown", {})
        total = carbon_data.get("total_kg_per_year", 0)

        prompt = f"""Analyze this carbon footprint and provide structured insights:

Annual footprint: {total} kg CO2e ({carbon_data.get('total_tonnes')} tonnes)
Transport: {breakdown.get('transport', {}).get('total', 0)} kg
Energy: {breakdown.get('energy', {}).get('total', 0)} kg  
Food: {breakdown.get('food', {}).get('total', 0)} kg
Lifestyle: {breakdown.get('lifestyle', {}).get('total', 0)} kg
Eco Score: {carbon_data.get('eco_score')}/100

Return ONLY a valid JSON object (no markdown, no code blocks) with this exact structure:
{{
  "summary": "2-sentence overview",
  "top_actions": [
    {{"action": "action title", "impact_kg": 500, "difficulty": "easy|medium|hard", "timeframe": "immediate|weekly|monthly"}},
    {{"action": "action title", "impact_kg": 300, "difficulty": "easy|medium|hard", "timeframe": "immediate|weekly|monthly"}},
    {{"action": "action title", "impact_kg": 200, "difficulty": "easy|medium|hard", "timeframe": "immediate|weekly|monthly"}}
  ],
  "biggest_win": "the single highest-impact change",
  "quick_win": "something they can do today with minimal effort",
  "yearly_goal_kg": 1500,
  "motivational_message": "brief encouraging message"
}}"""

        response = model.generate_content(prompt)
        text = response.text.strip()
        
        # Clean up if model adds markdown
        if text.startswith("```"):
            text = text.split("```")[1]
            if text.startswith("json"):
                text = text[4:]
        text = text.strip().rstrip("```")

        return json.loads(text)
    except Exception as e:
        return {
            "summary": "Your carbon footprint analysis is complete. Focus on your highest-emission areas first.",
            "top_actions": [
                {"action": "Switch to public transport 2 days/week", "impact_kg": 400, "difficulty": "medium", "timeframe": "weekly"},
                {"action": "Reduce meat consumption by 50%", "impact_kg": 600, "difficulty": "medium", "timeframe": "monthly"},
                {"action": "Switch to LED lighting", "impact_kg": 150, "difficulty": "easy", "timeframe": "immediate"},
            ],
            "biggest_win": "Reduce car usage",
            "quick_win": "Turn off lights and unplug unused devices",
            "yearly_goal_kg": 1000,
            "motivational_message": "Every action counts! You're on the right path. 🌱",
        }

# ─── API Routes ────────────────────────────────────────────────────────────────

@app.get("/", response_class=HTMLResponse)
async def serve_index():
    """Serve the main application."""
    index_file = Path("static/index.html")
    if index_file.exists():
        return HTMLResponse(content=index_file.read_text(encoding="utf-8"))
    return HTMLResponse("<h1>Loading... Please wait for static files.</h1>")


@app.post("/api/calculate")
async def calculate_footprint(data: CarbonInput):
    """Calculate carbon footprint from user inputs."""
    try:
        result = calculate_carbon(data)
        return JSONResponse(content=result)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/chat")
async def chat_with_ai(msg: ChatMessage):
    """Chat with EcoGuide AI assistant."""
    if not msg.message.strip():
        raise HTTPException(status_code=400, detail="Message cannot be empty")
    
    response = await get_gemini_response(
        msg.session_id,
        msg.message,
        msg.carbon_context
    )
    return {
        "response": response,
        "session_id": msg.session_id,
        "timestamp": datetime.datetime.utcnow().isoformat(),
    }


@app.post("/api/insights")
async def get_insights(data: dict):
    """Get AI-powered personalized insights."""
    insights = await get_ai_insights(data)
    return insights


@app.post("/api/log-activity")
async def log_activity(activity: ActivityLog):
    """Log a green activity completed by the user."""
    if not activity.date:
        activity.date = datetime.datetime.utcnow().isoformat()

    entry = activity.dict()
    DB["activities"].append(entry)

    # Update leaderboard
    session = activity.session_id
    existing = next((x for x in DB["leaderboard"] if x["session_id"] == session), None)
    if existing:
        existing["co2_saved_kg"] = round(existing["co2_saved_kg"] + activity.co2_saved_kg, 2)
        existing["actions"] = existing.get("actions", 0) + 1
    else:
        DB["leaderboard"].append({
            "session_id": session,
            "co2_saved_kg": round(activity.co2_saved_kg, 2),
            "actions": 1,
            "joined": activity.date,
        })

    save_data(DB)
    return {"success": True, "message": f"Logged: {activity.description}"}


@app.get("/api/history/{session_id}")
async def get_history(session_id: str):
    """Get activity history for a session."""
    user_activities = [
        a for a in DB["activities"]
        if a.get("session_id") == session_id
    ]
    return {"activities": user_activities, "count": len(user_activities)}


@app.get("/api/leaderboard")
async def get_leaderboard():
    """Get community leaderboard."""
    sorted_lb = sorted(
        DB["leaderboard"],
        key=lambda x: x.get("co2_saved_kg", 0),
        reverse=True
    )
    # Anonymize session IDs for privacy
    anonymized = []
    medals = ["🥇", "🥈", "🥉"]
    for i, entry in enumerate(sorted_lb[:20]):
        sid = entry["session_id"]
        anonymized.append({
            "rank": i + 1,
            "medal": medals[i] if i < 3 else "",
            "user": f"EcoHero #{sid[:6].upper()}",
            "co2_saved_kg": entry["co2_saved_kg"],
            "actions": entry.get("actions", 0),
        })
    return {"leaderboard": anonymized, "total_users": len(DB["leaderboard"])}


@app.get("/api/stats")
async def get_platform_stats():
    """Get platform-wide statistics."""
    total_saved = sum(x.get("co2_saved_kg", 0) for x in DB["leaderboard"])
    return {
        "total_users": len(DB["leaderboard"]),
        "total_co2_saved_kg": round(total_saved, 1),
        "total_trees_equivalent": round(total_saved / 21, 0),
        "calculations_done": len([a for a in DB["activities"] if a.get("type") == "calculation"]),
    }


@app.get("/api/config")
async def get_config():
    """Expose non-sensitive config to frontend."""
    return {
        "maps_api_key": MAPS_API_KEY,
        "version": "1.0.0",
    }


@app.get("/api/health")
async def health_check():
    return {"status": "ok", "timestamp": datetime.datetime.utcnow().isoformat()}


# ─── Entry Point ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    print("=" * 60)
    print("🌱 Carbon Footprint Awareness Platform")
    print("=" * 60)
    print(f"🚀 Starting server on http://localhost:{PORT}")
    print(f"📊 API Docs: http://localhost:{PORT}/docs")
    print(f"🌐 App:      http://localhost:{PORT}")
    print("=" * 60)
    
    uvicorn.run(
        app,
        host="0.0.0.0",
        port=PORT,
        reload=False,
        log_level="info",
    )
