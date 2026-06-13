import pytest
from app import calculate_carbon, CarbonInput, generate_offline_insights, get_offline_response

def test_health_check(client):
    """Test the liveness/readiness health check endpoint."""
    response = client.get("/api/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert "gemini_configured" in data
    assert "maps_configured" in data


def test_calculate_carbon_function():
    """Test the core calculator logic directly."""
    inputs = CarbonInput(
        session_id="test_session",
        car_km_per_week=100.0,
        car_type="petrol",
        flights_per_year=1,
        flight_type="short",
        public_transport_km=50.0,
        electricity_kwh=150.0,
        natural_gas_cubic_m=10.0,
        renewable_energy_pct=20.0,
        diet_type="vegetarian",
        food_waste_kg=5.0,
        new_clothes_per_year=10,
        online_orders_per_month=5,
        streaming_hours_per_day=4.0
    )
    result = calculate_carbon(inputs)
    assert result["session_id"] == "test_session"
    assert result["total_kg_per_year"] > 0
    assert "breakdown" in result
    assert "eco_score" in result
    assert 0 <= result["eco_score"] <= 100


def test_calculate_endpoint(client):
    """Test the POST /api/calculate endpoint."""
    payload = {
        "session_id": "test_session_api",
        "car_km_per_week": 50,
        "car_type": "hybrid",
        "flights_per_year": 0,
        "flight_type": "short",
        "public_transport_km": 20,
        "electricity_kwh": 100,
        "natural_gas_cubic_m": 5,
        "renewable_energy_pct": 50,
        "diet_type": "vegan",
        "food_waste_kg": 2,
        "new_clothes_per_year": 2,
        "online_orders_per_month": 1,
        "streaming_hours_per_day": 2
    }
    response = client.post("/api/calculate", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["session_id"] == "test_session_api"
    assert "eco_score" in data
    assert "breakdown" in data


def test_get_history(client):
    """Test retrieving activity history for a session."""
    session_id = "test_history_session"
    # First, make a calculation to populate history
    payload = {"session_id": session_id}
    client.post("/api/calculate", json=payload)
    
    # Retrieve history
    response = client.get(f"/api/history/{session_id}")
    assert response.status_code == 200
    data = response.json()
    assert "activities" in data
    assert data["count"] > 0


def test_leaderboard(client):
    """Test community leaderboard retrieval."""
    response = client.get("/api/leaderboard")
    assert response.status_code == 200
    data = response.json()
    assert "leaderboard" in data
    assert "total_users" in data


def test_stats(client):
    """Test platform-wide stats caching and aggregation."""
    response = client.get("/api/stats")
    assert response.status_code == 200
    data = response.json()
    assert "total_users" in data
    assert "total_co2_saved_kg" in data
    assert "calculations_done" in data


def test_generate_offline_insights():
    """Test the rule-based dynamic fallback insights logic."""
    carbon_data = {
        "total_kg_per_year": 5000.0,
        "breakdown": {
            "transport": {"total": 2000.0},
            "energy": {"total": 1500.0},
            "food": {"total": 1000.0},
            "lifestyle": {"total": 500.0}
        },
        "eco_score": 60,
        "trees_to_offset": 238
    }
    insights = generate_offline_insights(carbon_data)
    assert "summary" in insights
    assert "top_actions" in insights
    assert len(insights["top_actions"]) > 0
    assert "biggest_win" in insights
    assert "quick_win" in insights


def test_get_offline_response():
    """Test the rule-based fallback chat assistant."""
    context = {
        "total_kg_per_year": 4500.0,
        "eco_score": 65,
        "trees_to_offset": 214,
        "breakdown": {
            "transport": {"total": 1200.0},
            "energy": {"total": 1800.0},
            "food": {"total": 1000.0},
            "lifestyle": {"total": 500.0}
        }
    }
    # Check greeting response
    res_greet = get_offline_response("hi", context)
    assert "Hello" in res_greet
    assert "Eco Score" in res_greet

    # Check transport keywords
    res_trans = get_offline_response("tell me about electric cars", context)
    assert "Transport" in res_trans
    assert "EV" in res_trans or "Electric" in res_trans

    # Check fallback/notice trigger
    res_fallback = get_offline_response("help", context, is_fallback=True)
    assert "Google Gemini API rate limit exceeded" in res_fallback
