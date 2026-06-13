/* ═══════════════════════════════════════════════════════════════════
   EcoTrack — Carbon Footprint Awareness Platform
   Main Application JavaScript
   ═══════════════════════════════════════════════════════════════════ */

'use strict';

// ─── App State ────────────────────────────────────────────────────────────────
const STATE = {
  sessionId: null,
  carbonData: null,
  insightsData: null,
  map: null,
  mapMarkers: [],
  mapService: null,
  directionsService: null,
  directionsRenderer: null,
  activeMapLayers: { ev: true, parks: false, transit: false, bike: false },
  activityLog: [],
  streak: 0,
  lastActivityDate: null,
  totalSaved: 0,
  mapsLoaded: false,
  chartsLoaded: false,
  currentSection: 'calculator',
};

const API = 'http://localhost:8000/api';

// ─── Initialization ───────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  initSession();
  loadLocalStorage();
  spawnParticles();
  await loadConfig();
  initGoogleCharts();
  await loadPlatformStats();
  updateBadges();
  renderActivityLog();
  renderProgressChart();
  updateStreakDisplay();
  updateNavScore();
  updateChatContext();

  // Hide loader with delay for polish
  setTimeout(() => {
    document.getElementById('loader').classList.add('hidden');
  }, 1200);

  // Animate hero counters
  setTimeout(animateHeroCounters, 1500);

  trackEvent('page_view', { page: 'home' });
});

// ─── Session Management ───────────────────────────────────────────────────────
function initSession() {
  let sid = localStorage.getItem('eco_session_id');
  if (!sid) {
    sid = 'eco_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9);
    localStorage.setItem('eco_session_id', sid);
  }
  STATE.sessionId = sid;
}

function loadLocalStorage() {
  const saved = localStorage.getItem('eco_carbon_data');
  if (saved) STATE.carbonData = JSON.parse(saved);

  const log = localStorage.getItem('eco_activity_log');
  if (log) STATE.activityLog = JSON.parse(log);

  const streak = localStorage.getItem('eco_streak');
  if (streak) STATE.streak = parseInt(streak, 10);

  const lastDate = localStorage.getItem('eco_last_activity');
  if (lastDate) STATE.lastActivityDate = lastDate;

  const saved2 = localStorage.getItem('eco_total_saved');
  if (saved2) STATE.totalSaved = parseFloat(saved2);

  // Check streak continuity
  if (STATE.lastActivityDate) {
    const today = new Date().toDateString();
    const yesterday = new Date(Date.now() - 86400000).toDateString();
    const last = new Date(STATE.lastActivityDate).toDateString();
    if (last !== today && last !== yesterday) {
      STATE.streak = 0;
      localStorage.setItem('eco_streak', '0');
    }
  }
}

// ─── Config + Google Maps Dynamic Load ───────────────────────────────────────
async function loadConfig() {
  try {
    const res = await fetch(`${API}/config`);
    const config = await res.json();
    const key = config.maps_api_key;
    // Load Google Maps JS API dynamically
    await loadGoogleMapsScript(key);
  } catch (e) {
    console.warn('Config fetch failed, using fallback', e);
  }
}

function loadGoogleMapsScript(apiKey) {
  return new Promise((resolve) => {
    if (window.google && window.google.maps) { STATE.mapsLoaded = true; resolve(); return; }
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places,geometry&callback=onGoogleMapsLoaded`;
    script.async = true; script.defer = true;
    window.onGoogleMapsLoaded = () => { STATE.mapsLoaded = true; resolve(); };
    document.head.appendChild(script);
  });
}

// ─── Google Charts ────────────────────────────────────────────────────────────
function initGoogleCharts() {
  google.charts.load('current', { packages: ['corechart', 'geochart', 'bar'] });
  google.charts.setOnLoadCallback(() => {
    STATE.chartsLoaded = true;
    if (STATE.carbonData) renderBreakdownChart(STATE.carbonData);
    renderProgressChart();
    renderGeoChart();
  });
}

// ─── Navigation ───────────────────────────────────────────────────────────────
function showSection(name) {
  // Hide all sections
  document.querySelectorAll('.app-section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-link').forEach(l => { l.classList.remove('active'); l.removeAttribute('aria-current'); });

  // Show target
  const section = document.getElementById(`section-${name}`);
  const navBtn  = document.getElementById(`nav-${name}`);
  if (section) section.classList.add('active');
  if (navBtn)  { navBtn.classList.add('active'); navBtn.setAttribute('aria-current', 'page'); }

  STATE.currentSection = name;

  // Scroll to main content
  document.getElementById('main-content').scrollIntoView({ behavior: 'smooth', block: 'start' });

  // Lazy init
  if (name === 'map' && STATE.mapsLoaded && !STATE.map) initMap();
  if (name === 'community') loadLeaderboard();
  if (name === 'tracker') renderProgressChart();

  // Close mobile menu
  document.getElementById('nav-links')?.classList.remove('mobile-open');

  trackEvent('section_view', { section: name });
}

function toggleMobileMenu() {
  const links = document.querySelector('.nav-links');
  const btn = document.getElementById('hamburger-btn');
  const open = links.classList.toggle('mobile-open');
  btn.setAttribute('aria-expanded', open.toString());
}

// ─── Particle System ─────────────────────────────────────────────────────────
function spawnParticles() {
  const container = document.getElementById('hero-particles');
  for (let i = 0; i < 20; i++) {
    const p = document.createElement('div');
    p.className = 'particle';
    const size = Math.random() * 6 + 2;
    p.style.cssText = `
      width: ${size}px; height: ${size}px;
      left: ${Math.random() * 100}%;
      top: ${Math.random() * 100}%;
      animation-duration: ${Math.random() * 20 + 15}s;
      animation-delay: ${Math.random() * -20}s;
      --drift-x: ${(Math.random() - 0.5) * 200}px;
    `;
    container.appendChild(p);
  }
}

// ─── Carbon Calculator ────────────────────────────────────────────────────────
async function calculateFootprint() {
  const btn = document.getElementById('calculate-btn');
  const txt = document.getElementById('calc-btn-text');
  const spinner = document.getElementById('calc-spinner');

  // Collect form values
  const payload = {
    session_id: STATE.sessionId,
    car_km_per_week: parseFloat(document.getElementById('car_km').value) || 0,
    car_type: document.getElementById('car_type').value,
    flights_per_year: parseInt(document.getElementById('flights').value) || 0,
    flight_type: document.getElementById('flight_type').value,
    public_transport_km: parseFloat(document.getElementById('public_transport').value) || 0,
    electricity_kwh: parseFloat(document.getElementById('electricity').value) || 0,
    natural_gas_cubic_m: parseFloat(document.getElementById('gas').value) || 0,
    renewable_energy_pct: parseFloat(document.getElementById('renewable_pct').value) || 0,
    diet_type: document.getElementById('diet_type').value,
    food_waste_kg: parseFloat(document.getElementById('food_waste').value) || 0,
    new_clothes_per_year: parseInt(document.getElementById('clothes').value) || 0,
    online_orders_per_month: parseInt(document.getElementById('orders').value) || 0,
    streaming_hours_per_day: parseFloat(document.getElementById('streaming').value) || 0,
  };

  // UI: loading state
  btn.disabled = true;
  txt.textContent = 'Calculating...';
  spinner.classList.remove('hidden');

  try {
    const res = await fetch(`${API}/calculate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    STATE.carbonData = data;
    localStorage.setItem('eco_carbon_data', JSON.stringify(data));
    renderResults(data);
    updateNavScore(data.eco_score);
    updateChatContext(data);
    showToast('✅ Carbon footprint calculated!', 'success');
    trackEvent('footprint_calculated', { total_kg: data.total_kg_per_year, score: data.eco_score });
  } catch (err) {
    showToast('❌ Calculation failed. Is the server running?', 'error');
    console.error(err);
  } finally {
    btn.disabled = false;
    txt.textContent = 'Calculate My Carbon Footprint 🌍';
    spinner.classList.add('hidden');
  }
}

function renderResults(data) {
  document.getElementById('results-placeholder').classList.add('hidden');
  const content = document.getElementById('results-content');
  content.classList.remove('hidden');

  // Score ring animation
  const score = data.eco_score;
  const ring = document.getElementById('score-ring-fill');
  const circumference = 314;
  const offset = circumference - (score / 100) * circumference;
  setTimeout(() => { ring.style.strokeDashoffset = offset; }, 100);

  // Score color
  const color = score > 70 ? '#10b981' : score > 40 ? '#f59e0b' : '#ef4444';
  ring.style.stroke = color;
  document.getElementById('result-score').textContent = score;
  document.getElementById('result-score').style.color = color;

  // Totals
  animateNumber(document.getElementById('result-total'), data.total_kg_per_year, ' kg CO₂e/yr', 0);
  document.getElementById('result-trees').textContent = `🌳 ${data.trees_to_offset} trees to offset`;

  // Comparison chips
  const compDiv = document.getElementById('result-comparison');
  const vsGlobal = data.comparisons.vs_global_avg_pct;
  const vsUS = data.comparisons.vs_us_avg_pct;
  compDiv.innerHTML = `
    <span class="chip ${vsGlobal > 0 ? 'chip-above' : 'chip-below'}">
      ${vsGlobal > 0 ? '▲' : '▼'} ${Math.abs(vsGlobal)}% vs Global avg
    </span>
    <span class="chip ${vsUS > 0 ? 'chip-above' : 'chip-below'}">
      ${vsUS > 0 ? '▲' : '▼'} ${Math.abs(vsUS)}% vs US avg
    </span>
  `;

  // Chart
  if (STATE.chartsLoaded) renderBreakdownChart(data);

  // Category bars
  renderCategoryBars(data.breakdown);

  // Update insights prompt
  document.getElementById('insights-prompt').classList.add('hidden');
}

function renderBreakdownChart(data) {
  const b = data.breakdown;
  const chartData = google.visualization.arrayToDataTable([
    ['Category', 'kg CO₂e', { role: 'style' }, { role: 'annotation' }],
    ['🚗 Transport', b.transport.total, '#3b82f6', `${b.transport.total} kg`],
    ['⚡ Energy',    b.energy.total,    '#f59e0b', `${b.energy.total} kg`],
    ['🥗 Food',      b.food.total,      '#10b981', `${b.food.total} kg`],
    ['🛍️ Lifestyle', b.lifestyle.total, '#8b5cf6', `${b.lifestyle.total} kg`],
  ]);
  const options = {
    backgroundColor: 'transparent',
    chartArea: { width: '85%', height: '75%' },
    hAxis: { textStyle: { color: '#94a3b8', fontSize: 11 }, gridlines: { color: 'rgba(255,255,255,0.06)' } },
    vAxis: { textStyle: { color: '#94a3b8', fontSize: 11 } },
    legend: { position: 'none' },
    bar: { groupWidth: '55%' },
    annotations: { textStyle: { color: '#f0fdf4', fontSize: 11, bold: true } },
    animation: { startup: true, duration: 1000, easing: 'out' },
    tooltip: { isHtml: true },
  };
  const chart = new google.visualization.ColumnChart(document.getElementById('breakdown-chart'));
  chart.draw(chartData, options);
}

function renderCategoryBars(breakdown) {
  const container = document.getElementById('category-bars');
  const total = Object.values(breakdown).reduce((s, c) => s + (c.total || 0), 0);
  const cats = [
    { key: 'transport', label: '🚗 Transport', cls: 'bar-transport' },
    { key: 'energy',    label: '⚡ Energy',    cls: 'bar-energy' },
    { key: 'food',      label: '🥗 Food',      cls: 'bar-food' },
    { key: 'lifestyle', label: '🛍️ Lifestyle', cls: 'bar-lifestyle' },
  ];
  container.innerHTML = cats.map(c => {
    const pct = total > 0 ? ((breakdown[c.key].total / total) * 100).toFixed(1) : 0;
    return `
      <div class="cat-bar-item" role="listitem">
        <div class="cat-bar-label">
          <span class="cat-bar-name">${c.label}</span>
          <span class="cat-bar-value">${breakdown[c.key].total} kg (${pct}%)</span>
        </div>
        <div class="cat-bar-track">
          <div class="cat-bar-fill ${c.cls}" style="width:0%" data-width="${pct}%" 
               role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"
               aria-label="${c.label}: ${pct}%"></div>
        </div>
      </div>`;
  }).join('');

  // Animate bars
  setTimeout(() => {
    document.querySelectorAll('.cat-bar-fill').forEach(bar => {
      bar.style.width = bar.dataset.width;
    });
  }, 200);
}

// ─── Form Helpers ─────────────────────────────────────────────────────────────
function toggleCategory(name) {
  const fields = document.getElementById(`${name}-fields`);
  const arrow  = document.getElementById(`arrow-${name}`);
  const header = fields.previousElementSibling;
  const isCollapsed = fields.classList.toggle('collapsed');
  arrow.classList.toggle('collapsed', isCollapsed);
  header.setAttribute('aria-expanded', (!isCollapsed).toString());
}

function selectDiet(diet) {
  document.querySelectorAll('.diet-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.diet === diet);
    b.setAttribute('aria-pressed', (b.dataset.diet === diet).toString());
  });
  document.getElementById('diet_type').value = diet;
}

function updateSliderLabel(sliderId, labelId) {
  const slider = document.getElementById(sliderId);
  const label  = document.getElementById(labelId);
  const val    = parseFloat(slider.value);
  if (labelId === 'renewable_label') {
    label.textContent = `${val}%`;
    // Update slider gradient
    slider.style.background = `linear-gradient(to right, #10b981 ${val}%, rgba(255,255,255,0.1) ${val}%)`;
  } else if (labelId === 'streaming_label') {
    label.textContent = `${val}h`;
    const pct = (val / 16) * 100;
    slider.style.background = `linear-gradient(to right, #10b981 ${pct}%, rgba(255,255,255,0.1) ${pct}%)`;
  } else if (labelId === 'goal-reduction-label') {
    label.textContent = `${val}%`;
    const pct = ((val - 5) / 75) * 100;
    slider.style.background = `linear-gradient(to right, #10b981 ${pct}%, rgba(255,255,255,0.1) ${pct}%)`;
  }
  slider.setAttribute('aria-valuenow', val);
}

// ─── AI Insights ──────────────────────────────────────────────────────────────
async function loadInsights() {
  if (!STATE.carbonData) {
    showToast('⚠️ Calculate your footprint first!', 'info');
    showSection('calculator');
    return;
  }

  const loading  = document.getElementById('insights-loading');
  const content  = document.getElementById('insights-content');
  const promptEl = document.getElementById('insights-prompt');

  promptEl.classList.add('hidden');
  loading.classList.remove('hidden');
  content.classList.add('hidden');

  try {
    const res = await fetch(`${API}/insights`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(STATE.carbonData),
    });
    const insights = await res.json();
    STATE.insightsData = insights;
    renderInsights(insights);
    trackEvent('insights_viewed', { eco_score: STATE.carbonData.eco_score });
  } catch (err) {
    showToast('❌ Failed to load insights', 'error');
  } finally {
    loading.classList.add('hidden');
  }
}

function renderInsights(data) {
  const content = document.getElementById('insights-content');
  content.classList.remove('hidden');

  // Summary
  document.getElementById('ai-summary-text').textContent = data.summary || '';
  document.getElementById('motivational-msg').innerHTML = `💬 "${data.motivational_message || ''}"`;

  // Top Actions
  const actionsList = document.getElementById('top-actions-list');
  actionsList.innerHTML = (data.top_actions || []).map((action, i) => `
    <div class="action-item" role="listitem" tabindex="0" onclick="logActionFromInsight('${action.action}', ${action.impact_kg})" 
         aria-label="${action.action}, saves ${action.impact_kg} kg CO2">
      <div class="action-impact">-${action.impact_kg} kg</div>
      <div class="action-text">
        <div class="action-title">${action.action}</div>
        <div class="action-meta">⏱ ${action.timeframe}</div>
      </div>
      <span class="diff-badge diff-${action.difficulty}">${action.difficulty}</span>
    </div>
  `).join('');

  // Quick Win & Biggest Win
  document.getElementById('quick-win-content').innerHTML = `
    <strong>⚡ Quick Win:</strong><br/>
    ${data.quick_win || 'Turn off unused devices and lights.'}
  `;
  document.getElementById('biggest-win-content').innerHTML = `
    <strong>🏆 Biggest Impact:</strong><br/>
    ${data.biggest_win || 'Reduce car usage by switching to public transport or cycling.'}
  `;

  // Goal preview
  updateGoalPreview(data.yearly_goal_kg);
}

function logActionFromInsight(action, impactKg) {
  showSection('tracker');
  document.getElementById('custom-activity-desc').value = action;
  document.getElementById('custom-co2-saved').value = (impactKg / 365).toFixed(2);
  showToast('📝 Action pre-filled in tracker!', 'success');
}

// ─── Goal Setting ─────────────────────────────────────────────────────────────
function updateGoalPreview(suggestedKg) {
  const slider   = document.getElementById('goal-reduction');
  const label    = document.getElementById('goal-reduction-label');
  const timeline = document.getElementById('goal-timeline');
  const preview  = document.getElementById('goal-preview');

  const pct     = parseFloat(slider.value);
  const months  = parseInt(timeline.value);
  label.textContent = `${pct}%`;

  // Update slider gradient
  const gradPct = ((pct - 5) / 75) * 100;
  slider.style.background = `linear-gradient(to right, #10b981 ${gradPct}%, rgba(255,255,255,0.1) ${gradPct}%)`;

  if (!STATE.carbonData) {
    preview.innerHTML = '<em>Calculate your footprint first to see goal details.</em>';
    return;
  }

  const current = STATE.carbonData.total_kg_per_year;
  const reduction = (current * pct / 100).toFixed(0);
  const target = (current - reduction).toFixed(0);
  const monthly = (reduction / months).toFixed(0);
  const trees = Math.round(reduction / 21);

  preview.innerHTML = `
    📊 <strong>Current:</strong> ${current.toLocaleString()} kg/yr &nbsp;→&nbsp; 
    <strong>Target:</strong> ${parseInt(target).toLocaleString()} kg/yr<br/>
    💪 Reduce by <strong>${parseInt(reduction).toLocaleString()} kg</strong> over <strong>${months} months</strong> 
    (~${monthly} kg/month)<br/>
    🌳 Equivalent to planting <strong>${trees} trees</strong>
  `;
}

async function commitToGoal() {
  if (!STATE.carbonData) { showToast('⚠️ Calculate your footprint first!', 'info'); return; }
  const pct     = parseFloat(document.getElementById('goal-reduction').value);
  const months  = parseInt(document.getElementById('goal-timeline').value);
  const reduction = (STATE.carbonData.total_kg_per_year * pct / 100).toFixed(0);

  localStorage.setItem('eco_goal', JSON.stringify({ pct, months, reduction, date: new Date().toISOString() }));
  showToast(`🎯 Goal set! Reduce ${reduction} kg over ${months} months 🌱`, 'success');
  trackEvent('goal_set', { reduction_pct: pct, months });
}

// ─── Google Maps ──────────────────────────────────────────────────────────────
function initMap() {
  const mapEl = document.getElementById('google-map');

  // Default: Hyderabad, India (adjust as needed)
  const center = { lat: 17.3850, lng: 78.4867 };

  STATE.map = new google.maps.Map(mapEl, {
    center,
    zoom: 13,
    styles: getDarkMapStyle(),
    disableDefaultUI: false,
    zoomControl: true,
    mapTypeControl: false,
    streetViewControl: false,
    fullscreenControl: true,
  });

  STATE.mapService        = new google.maps.places.PlacesService(STATE.map);
  STATE.directionsService  = new google.maps.DirectionsService();
  STATE.directionsRenderer = new google.maps.DirectionsRenderer({
    polylineOptions: { strokeColor: '#10b981', strokeWeight: 4 },
  });
  STATE.directionsRenderer.setMap(STATE.map);

  // Try geolocation
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      pos => {
        const userPos = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        STATE.map.setCenter(userPos);
        new google.maps.Marker({
          position: userPos, map: STATE.map,
          title: 'You are here',
          icon: { path: google.maps.SymbolPath.CIRCLE, scale: 8, fillColor: '#10b981', fillOpacity: 1, strokeColor: '#fff', strokeWeight: 2 },
        });
        searchNearbyEV(userPos);
      },
      () => searchNearbyEV(center)
    );
  } else {
    searchNearbyEV(center);
  }
}

function searchNearbyEV(location) {
  if (!STATE.mapService) return;
  const request = {
    location, radius: 5000,
    type: ['electric_vehicle_charging_station'],
  };
  STATE.mapService.nearbySearch(request, (results, status) => {
    if (status === google.maps.places.PlacesServiceStatus.OK) {
      clearMarkers();
      renderPlacesList(results.slice(0, 8), '⚡');
      results.slice(0, 15).forEach(place => addMarker(place, '⚡', '#3b82f6'));
    }
  });
}

function searchNearbyParks(location) {
  if (!STATE.mapService) return;
  const center = location || STATE.map.getCenter();
  STATE.mapService.nearbySearch({ location: center, radius: 5000, type: ['park'] }, (results, status) => {
    if (status === google.maps.places.PlacesServiceStatus.OK) {
      clearMarkers();
      renderPlacesList(results.slice(0, 8), '🌳');
      results.slice(0, 15).forEach(place => addMarker(place, '🌳', '#10b981'));
    }
  });
}

function addMarker(place, emoji, color) {
  const marker = new google.maps.Marker({
    position: place.geometry.location,
    map: STATE.map,
    title: place.name,
    icon: {
      url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`
        <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36">
          <circle cx="18" cy="18" r="16" fill="${color}" fill-opacity="0.9" stroke="white" stroke-width="2"/>
          <text x="18" y="23" text-anchor="middle" font-size="14">${emoji}</text>
        </svg>`)}`,
      scaledSize: new google.maps.Size(36, 36),
    },
  });

  const infoWindow = new google.maps.InfoWindow({
    content: `
      <div style="background:#0a1020;color:#f0fdf4;padding:12px;border-radius:8px;font-family:Inter,sans-serif;max-width:220px;">
        <strong style="color:#10b981">${emoji} ${place.name}</strong><br/>
        <small style="color:#94a3b8">${place.vicinity || ''}</small><br/>
        ${place.rating ? `<span style="color:#f59e0b">★ ${place.rating}</span>` : ''}
      </div>`,
  });
  marker.addListener('click', () => infoWindow.open(STATE.map, marker));
  STATE.mapMarkers.push(marker);
}

function clearMarkers() {
  STATE.mapMarkers.forEach(m => m.setMap(null));
  STATE.mapMarkers = [];
}

function renderPlacesList(places, emoji) {
  const list = document.getElementById('nearby-places-list');
  list.innerHTML = places.length
    ? places.map(p => `
        <div class="place-item" role="listitem" 
             onclick="panToPlace(${p.geometry.location.lat()}, ${p.geometry.location.lng()})"
             aria-label="${p.name}">
          <strong>${emoji} ${p.name}</strong><br/>
          <small style="color:#64748b">${p.vicinity || ''}</small>
          ${p.rating ? `<span style="color:#f59e0b;font-size:0.75rem"> ★${p.rating}</span>` : ''}
        </div>`).join('')
    : '<p style="color:#64748b;font-size:0.8rem;padding:8px">No places found nearby.</p>';
}

function panToPlace(lat, lng) {
  STATE.map.panTo({ lat, lng });
  STATE.map.setZoom(16);
}

function toggleMapLayer(layer) {
  STATE.activeMapLayers[layer] = !STATE.activeMapLayers[layer];
  const chip = document.getElementById(`chip-${layer}`);
  chip.classList.toggle('active', STATE.activeMapLayers[layer]);
  chip.setAttribute('aria-pressed', STATE.activeMapLayers[layer].toString());

  if (!STATE.map) return;
  const center = STATE.map.getCenter();

  if (layer === 'ev' && STATE.activeMapLayers.ev) searchNearbyEV(center);
  if (layer === 'parks' && STATE.activeMapLayers.parks) searchNearbyParks(center);
  if (layer === 'transit') {
    STATE.map.setOptions({ styles: STATE.activeMapLayers.transit ? getLightMapStyle() : getDarkMapStyle() });
  }
  if (layer === 'bike') {
    STATE.map.setOptions({
      mapTypeId: STATE.activeMapLayers.bike ? 'terrain' : 'roadmap',
    });
  }
}

function searchMapLocation() {
  const input = document.getElementById('map-search-input').value.trim();
  if (!input || !STATE.map) return;

  const geocoder = new google.maps.Geocoder();
  geocoder.geocode({ address: input }, (results, status) => {
    if (status === 'OK' && results[0]) {
      const pos = results[0].geometry.location;
      STATE.map.setCenter(pos);
      STATE.map.setZoom(14);
      searchNearbyEV(pos);
    } else {
      showToast('❌ Location not found', 'error');
    }
  });
}

async function compareRoutes() {
  const from = document.getElementById('route-from').value.trim();
  const to   = document.getElementById('route-to').value.trim();
  if (!from || !to) { showToast('⚠️ Enter both From and To locations', 'info'); return; }
  if (!STATE.directionsService) { showToast('⚠️ Map not loaded yet', 'info'); return; }

  const resultsDiv = document.getElementById('route-results');
  resultsDiv.innerHTML = '<p style="color:#64748b;font-size:0.82rem">Calculating routes...</p>';

  STATE.directionsService.route({
    origin: from, destination: to,
    travelMode: google.maps.TravelMode.DRIVING,
    provideRouteAlternatives: true,
  }, (result, status) => {
    if (status !== 'OK') { resultsDiv.innerHTML = `<p style="color:#f87171">Route not found: ${status}</p>`; return; }
    STATE.directionsRenderer.setDirections(result);

    const distKm = result.routes[0].legs[0].distance.value / 1000;
    const duration = result.routes[0].legs[0].duration.text;

    // CO₂ estimates per mode
    const modes = [
      { name: '🚗 Car (Petrol)', co2: distKm * 0.21, best: false },
      { name: '🔋 Electric Car', co2: distKm * 0.05, best: false },
      { name: '🚌 Bus',          co2: distKm * 0.089, best: false },
      { name: '🚂 Train',        co2: distKm * 0.041, best: false },
      { name: '🚲 Cycling',      co2: 0,               best: true },
    ];

    modes.sort((a, b) => a.co2 - b.co2);
    resultsDiv.innerHTML = `
      <div style="font-size:0.8rem;color:#94a3b8;margin-bottom:8px">
        📍 ${(distKm).toFixed(1)} km · ${duration}
      </div>
      ${modes.map((m, i) => `
        <div class="route-option ${i === 0 ? 'best' : ''}">
          ${m.name} — <strong style="color:${i === 0 ? '#10b981' : '#94a3b8'}">${m.co2.toFixed(2)} kg CO₂</strong>
          ${i === 0 ? ' ✅ Best' : ''}
        </div>`).join('')}
    `;
    trackEvent('route_compared', { distance_km: distKm });
  });
}

// ─── Map Styles ───────────────────────────────────────────────────────────────
function getDarkMapStyle() {
  return [
    { elementType: 'geometry', stylers: [{ color: '#0a1020' }] },
    { elementType: 'labels.text.stroke', stylers: [{ color: '#050b15' }] },
    { elementType: 'labels.text.fill', stylers: [{ color: '#94a3b8' }] },
    { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#1e293b' }] },
    { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#0f172a' }] },
    { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0c1a2e' }] },
    { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#0d1f0d' }] },
    { featureType: 'poi.park', elementType: 'labels.text.fill', stylers: [{ color: '#34d399' }] },
    { featureType: 'transit', elementType: 'geometry', stylers: [{ color: '#1e3a5f' }] },
    { featureType: 'administrative', elementType: 'geometry', stylers: [{ color: '#1e293b' }] },
    { featureType: 'administrative.country', elementType: 'labels.text.fill', stylers: [{ color: '#94a3b8' }] },
  ];
}

function getLightMapStyle() {
  return [];
}

// ─── Progress Tracker ─────────────────────────────────────────────────────────
function logPreset(description, type, co2Saved) {
  logActivity(description, type, co2Saved);
}

function logCustomActivity() {
  const desc = document.getElementById('custom-activity-desc').value.trim();
  const type = document.getElementById('custom-activity-type').value;
  const saved = parseFloat(document.getElementById('custom-co2-saved').value) || 0;

  if (!desc) { showToast('⚠️ Enter an activity description', 'info'); return; }
  if (saved <= 0) { showToast('⚠️ Enter CO₂ saved (> 0)', 'info'); return; }

  logActivity(desc, type, saved);
  document.getElementById('custom-activity-desc').value = '';
  document.getElementById('custom-co2-saved').value = '';
}

async function logActivity(description, type, co2Saved) {
  const entry = {
    session_id: STATE.sessionId,
    activity_type: type,
    description,
    co2_saved_kg: co2Saved,
    date: new Date().toISOString(),
  };

  // Local update first
  STATE.activityLog.unshift(entry);
  STATE.totalSaved = parseFloat((STATE.totalSaved + co2Saved).toFixed(2));
  localStorage.setItem('eco_activity_log', JSON.stringify(STATE.activityLog.slice(0, 100)));
  localStorage.setItem('eco_total_saved', STATE.totalSaved.toString());

  // Update streak
  const today = new Date().toDateString();
  if (STATE.lastActivityDate !== today) {
    STATE.streak++;
    STATE.lastActivityDate = today;
    localStorage.setItem('eco_streak', STATE.streak.toString());
    localStorage.setItem('eco_last_activity', today);
  }

  renderActivityLog();
  updateBadges();
  updateStreakDisplay();
  renderProgressChart();
  showToast(`🌱 Logged! Saved ${co2Saved} kg CO₂`, 'success');

  // Persist to server
  try {
    await fetch(`${API}/log-activity`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(entry),
    });
    loadPlatformStats();
  } catch (e) { /* offline gracefully */ }

  trackEvent('activity_logged', { type, co2_saved: co2Saved });
}

function renderActivityLog() {
  const list = document.getElementById('activity-log-list');
  if (!STATE.activityLog.length) {
    list.innerHTML = '<p style="color:#475569;font-size:0.85rem;padding:8px">No activities logged yet. Start with a preset above!</p>';
    return;
  }
  const icons = { transport: '🚗', energy: '⚡', food: '🥗', lifestyle: '🛍️' };
  list.innerHTML = STATE.activityLog.slice(0, 20).map(a => `
    <div class="log-entry" role="listitem">
      <span class="log-entry-icon">${icons[a.activity_type] || '🌱'}</span>
      <div class="log-entry-text">
        <div>${a.description}</div>
        <small style="color:#475569">${new Date(a.date).toLocaleDateString()}</small>
      </div>
      <span class="log-entry-saved">-${a.co2_saved_kg} kg</span>
    </div>`).join('');
}

function renderProgressChart() {
  if (!STATE.chartsLoaded || !document.getElementById('progress-chart')) return;

  // Aggregate saved by day (last 14 days)
  const today = new Date();
  const days = [];
  const saved = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const dateStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const dayTotal = STATE.activityLog
      .filter(a => new Date(a.date).toDateString() === d.toDateString())
      .reduce((s, a) => s + a.co2_saved_kg, 0);
    days.push(dateStr);
    saved.push(parseFloat(dayTotal.toFixed(2)));
  }

  const chartData = new google.visualization.DataTable();
  chartData.addColumn('string', 'Date');
  chartData.addColumn('number', 'CO₂ Saved (kg)');
  chartData.addColumn({ type: 'string', role: 'style' });
  chartData.addRows(days.map((d, i) => [d, saved[i], saved[i] > 0 ? 'color:#10b981' : 'color:#1e293b']));

  const options = {
    backgroundColor: 'transparent',
    chartArea: { width: '88%', height: '72%' },
    hAxis: { textStyle: { color: '#64748b', fontSize: 10 }, gridlines: { color: 'transparent' } },
    vAxis: { textStyle: { color: '#64748b', fontSize: 10 }, gridlines: { color: 'rgba(255,255,255,0.06)' }, minValue: 0 },
    legend: { position: 'none' },
    bar: { groupWidth: '65%' },
    animation: { startup: true, duration: 800, easing: 'out' },
    tooltip: { isHtml: false },
  };
  new google.visualization.ColumnChart(document.getElementById('progress-chart')).draw(chartData, options);
}

function updateStreakDisplay() {
  document.getElementById('streak-count').textContent = STATE.streak;
}

// ─── Badges System ────────────────────────────────────────────────────────────
const BADGES = [
  { id: 'first_step',  emoji: '🌱', name: 'First Step',    condition: () => STATE.activityLog.length >= 1 },
  { id: 'eco5',        emoji: '♻️', name: '5 Actions',     condition: () => STATE.activityLog.length >= 5 },
  { id: 'eco20',       emoji: '🌍', name: '20 Actions',    condition: () => STATE.activityLog.length >= 20 },
  { id: 'saver10',     emoji: '💚', name: '10 kg Saved',   condition: () => STATE.totalSaved >= 10 },
  { id: 'saver100',    emoji: '🏆', name: '100 kg Saved',  condition: () => STATE.totalSaved >= 100 },
  { id: 'streak3',     emoji: '🔥', name: '3-Day Streak',  condition: () => STATE.streak >= 3 },
  { id: 'streak7',     emoji: '⭐', name: '7-Day Streak',  condition: () => STATE.streak >= 7 },
  { id: 'calculator',  emoji: '📊', name: 'Measured',      condition: () => !!STATE.carbonData },
  { id: 'eco_score80', emoji: '🌟', name: 'Eco Hero',      condition: () => STATE.carbonData && STATE.carbonData.eco_score >= 80 },
];

function updateBadges() {
  const grid = document.getElementById('badges-grid');
  const earned = JSON.parse(localStorage.getItem('eco_badges') || '[]');

  BADGES.forEach(badge => {
    if (badge.condition() && !earned.includes(badge.id)) {
      earned.push(badge.id);
      showToast(`🏅 Badge earned: ${badge.name}!`, 'success');
    }
  });

  localStorage.setItem('eco_badges', JSON.stringify(earned));

  grid.innerHTML = BADGES.map(badge => `
    <div class="badge-item ${earned.includes(badge.id) ? 'earned' : 'locked'}" 
         role="listitem" title="${badge.name}" 
         aria-label="${badge.name}: ${earned.includes(badge.id) ? 'earned' : 'locked'}">
      <span class="badge-emoji">${badge.emoji}</span>
      <span class="badge-name">${badge.name}</span>
    </div>`).join('');
}

// ─── Community Leaderboard ────────────────────────────────────────────────────
async function loadLeaderboard() {
  const list = document.getElementById('leaderboard-list');
  list.innerHTML = '<p style="color:#64748b;padding:16px;text-align:center">Loading...</p>';

  try {
    const res = await fetch(`${API}/leaderboard`);
    const data = await res.json();
    const lb = data.leaderboard;

    if (!lb.length) {
      list.innerHTML = '<p style="color:#64748b;padding:16px;text-align:center">No data yet. Be the first! 🌱</p>';
      return;
    }

    list.innerHTML = lb.map((entry, i) => `
      <div class="lb-entry ${i < 3 ? 'top-3' : ''}" role="listitem">
        <span class="lb-rank">${entry.rank}</span>
        <span class="lb-medal">${entry.medal || ''}</span>
        <span class="lb-name">${entry.user}</span>
        <div style="text-align:right">
          <div class="lb-saved">${entry.co2_saved_kg.toLocaleString()} kg saved</div>
          <div class="lb-actions">${entry.actions} action${entry.actions !== 1 ? 's' : ''}</div>
        </div>
      </div>`).join('');

    document.getElementById('comm-users').textContent = data.total_users || '--';
  } catch (e) {
    list.innerHTML = '<p style="color:#f87171;padding:16px">Failed to load leaderboard.</p>';
  }
}

// ─── Platform Stats ───────────────────────────────────────────────────────────
async function loadPlatformStats() {
  try {
    const res = await fetch(`${API}/stats`);
    const data = await res.json();

    // Hero stats
    animateNumber(document.getElementById('hero-users'), data.total_users, '');
    animateNumber(document.getElementById('hero-saved'), data.total_co2_saved_kg, '');
    animateNumber(document.getElementById('hero-trees'), data.total_trees_equivalent, '');
    animateNumber(document.getElementById('footer-saved'), data.total_co2_saved_kg, '');

    // Community stats
    setText('comm-users',  data.total_users);
    setText('comm-saved',  data.total_co2_saved_kg);
    setText('comm-trees',  data.total_trees_equivalent);
    setText('comm-calcs',  data.calculations_done);

    renderGeoChart();
  } catch (e) {
    // Server may not be running yet during initial load
  }
}

// ─── Google Charts Geo Chart ─────────────────────────────────────────────────
function renderGeoChart() {
  if (!STATE.chartsLoaded || !document.getElementById('geo-chart')) return;
  const data = google.visualization.arrayToDataTable([
    ['Country', 'CO₂ Reduction Impact'],
    ['United States', 80], ['China', 60], ['India', 75], ['Germany', 90],
    ['Brazil', 70], ['United Kingdom', 88], ['Canada', 65], ['Australia', 72],
    ['France', 91], ['Japan', 68], ['South Africa', 55], ['Mexico', 62],
  ]);
  const options = {
    backgroundColor: 'transparent',
    colorAxis: { colors: ['#0d9488', '#10b981', '#34d399'] },
    datalessRegionColor: '#1e293b',
    defaultColor: '#1e293b',
    tooltip: { textStyle: { color: '#0a1020' } },
  };
  new google.visualization.GeoChart(document.getElementById('geo-chart')).draw(data, options);
}

// ─── AI Chat ──────────────────────────────────────────────────────────────────
async function sendChatMessage() {
  const input = document.getElementById('chat-input');
  const msg   = input.value.trim();
  if (!msg) return;

  input.value = '';
  input.style.height = 'auto';
  addChatMessage(msg, 'user');
  hideSuggestions();

  const sendBtn = document.getElementById('chat-send-btn');
  const sendIcon = document.getElementById('send-icon');
  const spinner = document.getElementById('chat-spinner');
  sendBtn.disabled = true;
  sendIcon.classList.add('hidden');
  spinner.classList.remove('hidden');

  addTypingIndicator();

  try {
    const res = await fetch(`${API}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: STATE.sessionId,
        message: msg,
        carbon_context: STATE.carbonData,
      }),
    });
    const data = await res.json();
    removeTypingIndicator();
    addChatMessage(data.response, 'bot');
    trackEvent('chat_message_sent', {});
  } catch (err) {
    removeTypingIndicator();
    addChatMessage('Sorry, I\'m having trouble connecting. Please check the server is running.', 'bot');
  } finally {
    sendBtn.disabled = false;
    sendIcon.classList.remove('hidden');
    spinner.classList.add('hidden');
  }
}

function addChatMessage(text, role) {
  const messages = document.getElementById('chat-messages');
  const div = document.createElement('div');
  div.className = `message ${role === 'bot' ? 'bot-message' : 'user-message'}`;
  div.setAttribute('role', 'article');

  const avatarHTML = role === 'bot'
    ? `<div class="message-avatar" aria-hidden="true">🌱</div>`
    : `<div class="message-avatar" aria-hidden="true">👤</div>`;

  // Convert markdown-lite: bold, newlines, bullets
  const formatted = text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br/>')
    .replace(/^• /gm, '• ');

  div.innerHTML = `
    ${avatarHTML}
    <div class="message-content"><p>${formatted}</p></div>
  `;
  messages.appendChild(div);
  messages.scrollTop = messages.scrollHeight;
}

function addTypingIndicator() {
  const messages = document.getElementById('chat-messages');
  const div = document.createElement('div');
  div.className = 'message bot-message'; div.id = 'typing-indicator';
  div.innerHTML = `
    <div class="message-avatar" aria-hidden="true">🌱</div>
    <div class="message-content">
      <div class="typing-indicator" aria-label="EcoGuide is typing">
        <div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div>
      </div>
    </div>`;
  messages.appendChild(div);
  messages.scrollTop = messages.scrollHeight;
}

function removeTypingIndicator() {
  document.getElementById('typing-indicator')?.remove();
}

function hideSuggestions() {
  document.getElementById('chat-suggestions').style.display = 'none';
}

function sendSuggestion(text) {
  document.getElementById('chat-input').value = text;
  sendChatMessage();
}

function handleChatKey(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendChatMessage();
  }
}

function autoResizeTextarea(el) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 120) + 'px';
}

// ─── Chat Context Display ─────────────────────────────────────────────────────
function updateChatContext(data) {
  data = data || STATE.carbonData;
  const div = document.getElementById('chat-context-display');
  if (!data) {
    div.innerHTML = '<p class="context-empty">Calculate your footprint first to give EcoGuide personalized context!</p>';
    return;
  }
  div.innerHTML = `
    <div class="context-stat"><span class="context-stat-label">Annual footprint</span><span class="context-stat-value">${data.total_kg_per_year} kg</span></div>
    <div class="context-stat"><span class="context-stat-label">Eco Score</span><span class="context-stat-value">${data.eco_score}/100</span></div>
    <div class="context-stat"><span class="context-stat-label">Trees to offset</span><span class="context-stat-value">${data.trees_to_offset} 🌳</span></div>
    <div class="context-stat"><span class="context-stat-label">Transport</span><span class="context-stat-value">${data.breakdown.transport.total} kg</span></div>
    <div class="context-stat"><span class="context-stat-label">Energy</span><span class="context-stat-value">${data.breakdown.energy.total} kg</span></div>
    <div class="context-stat"><span class="context-stat-label">Food</span><span class="context-stat-value">${data.breakdown.food.total} kg</span></div>
  `;
}

// ─── Nav Score ────────────────────────────────────────────────────────────────
function updateNavScore(score) {
  score = score ?? STATE.carbonData?.eco_score ?? null;
  const el = document.getElementById('nav-eco-score');
  if (score !== null) {
    el.textContent = score;
    el.style.color = score > 70 ? '#10b981' : score > 40 ? '#f59e0b' : '#ef4444';
  }
}

// ─── Toast Notifications ──────────────────────────────────────────────────────
let toastTimer = null;
function showToast(message, type = 'info') {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.className = `toast show ${type}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.classList.remove('show'); }, 3500);
}

// ─── Number Animation ─────────────────────────────────────────────────────────
function animateNumber(el, target, suffix = '', decimals = 0) {
  if (!el) return;
  const start = 0;
  const dur = 1500;
  const startTime = performance.now();
  const step = (now) => {
    const elapsed = now - startTime;
    const progress = Math.min(elapsed / dur, 1);
    const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
    const current = start + (target - start) * eased;
    el.textContent = (decimals > 0 ? current.toFixed(decimals) : Math.round(current)).toLocaleString() + suffix;
    if (progress < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function animateHeroCounters() {
  loadPlatformStats();
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = (value || '--').toLocaleString();
}

// ─── Google Analytics Event Tracking ─────────────────────────────────────────
function trackEvent(name, params) {
  if (typeof gtag === 'function') gtag('event', name, params);
  // Also push to dataLayer for GTM
  if (window.dataLayer) {
    window.dataLayer.push({ event: `ecotrack_${name}`, ...params });
  }
}

// ─── Keyboard Shortcuts ───────────────────────────────────────────────────────
document.addEventListener('keydown', (e) => {
  // Alt+C = Calculator, Alt+I = Insights, Alt+M = Map, Alt+T = Tracker
  if (e.altKey) {
    const map = { c: 'calculator', i: 'insights', m: 'map', t: 'tracker', l: 'community', h: 'chat' };
    if (map[e.key.toLowerCase()]) { e.preventDefault(); showSection(map[e.key.toLowerCase()]); }
  }
});

// ─── Responsive: nav-links id fix ─────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const links = document.querySelector('.nav-links');
  if (links && !links.id) links.id = 'nav-links';
});
