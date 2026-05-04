const SATELLITE_URL = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
const WATER_URL = 'https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}.png';
const WATER_SUBDOMAINS = ['a', 'b', 'c', 'd'];
const EARTH_RADIUS = 6378137;
const MAX_ZOOM = 18;
const TURN_ACCEL_DEG = 34;
const MAX_YAW_DEG = 30;
const WATER_SAMPLE_INTERVAL = 360;
const SAVE_KEY = 'boat-map-save-v2';
const ARES = L.latLng(43.426485, -8.23205);

const BOATS = {
  yacht: {
    id: 'yacht',
    name: 'Yate',
    cargoType: 'pasajeros',
    capacity: 12,
    maxSpeed: 183.6,
    fuelMax: 520,
    fuelBurn: 0.030,
    sprite: 'assets/boats/yacht/yacht',
    color: '#f2c85b',
  },
  speedboat: {
    id: 'speedboat',
    name: 'Lancha',
    cargoType: 'pasajeros',
    capacity: 6,
    maxSpeed: 22.5,
    fuelMax: 260,
    fuelBurn: 0.050,
    sprite: 'assets/boats/speedboat/speedboat',
    color: '#ff6f61',
  },
  cargo: {
    id: 'cargo',
    name: 'Barco de carga',
    cargoType: 'mercancia',
    capacity: 180,
    maxSpeed: 8.8,
    fuelMax: 1500,
    fuelBurn: 0.046,
    sprite: 'assets/boats/cargo/cargo',
    color: '#44d4ca',
  },
  oceanliner: {
    id: 'oceanliner',
    name: 'Transatlántico',
    cargoType: 'pasajeros',
    capacity: 420,
    maxSpeed: 10.8,
    fuelMax: 2200,
    fuelBurn: 0.058,
    sprite: 'assets/boats/oceanliner/oceanliner',
    color: '#d8eef0',
  },
};

const PORTS = [
  { id: 'ares', name: 'Ares', lat: 43.4261, lng: -8.2457, radius: 760 },
  { id: 'mugardos', name: 'Mugardos', lat: 43.4592, lng: -8.2541, radius: 680 },
  { id: 'ferrol', name: 'Ferrol', lat: 43.4794, lng: -8.2427, radius: 900 },
  { id: 'sada', name: 'Sada', lat: 43.3562, lng: -8.2555, radius: 760 },
  { id: 'coruna', name: 'A Coruña', lat: 43.3684, lng: -8.3894, radius: 1100 },
  { id: 'cedeira', name: 'Cedeira', lat: 43.6610, lng: -8.0566, radius: 900 },
  { id: 'pontedeume', name: 'Pontedeume', lat: 43.4076, lng: -8.1702, radius: 620 },
];

const state = {
  boatLatLng: ARES,
  heading: 18,
  rudder: 0,
  targetRudder: 0,
  throttle: 0,
  velocityMps: 0,
  yawVelocity: 0,
  anchored: true,
  boatId: 'yacht',
  fuel: BOATS.yacht.fuelMax,
  money: 650,
  mission: null,
  currentPortId: 'ares',
  dockOpen: true,
  lastTime: performance.now(),
  lastWaterCheck: 0,
  lastWater: true,
  spriteFrame: 1,
  spriteTime: 0,
  toastTimer: 0,
  saveTimer: 0,
  started: false,
};

const map = L.map('map', {
  zoomControl: false,
  attributionControl: true,
  minZoom: 3,
  maxZoom: MAX_ZOOM,
  worldCopyJump: true,
  inertia: true,
  preferCanvas: false,
}).setView(ARES, 15);

L.tileLayer(SATELLITE_URL, {
  maxZoom: MAX_ZOOM,
  crossOrigin: true,
  className: 'satellite-tile',
  attribution: 'Sources: Esri, DigitalGlobe, GeoEye, USDA FSA, USGS, IGN, swisstopo, and the GIS User Community | Water sampling: CARTO',
}).addTo(map);

const portLayer = L.layerGroup().addTo(map);

const boatLayer = document.getElementById('boatLayer');
const boatSprite = document.getElementById('boatSprite');
const wake = document.getElementById('wake');
const helm = document.getElementById('helm');
const helmWheel = document.getElementById('helmWheel');
const throttle = document.getElementById('throttle');
const throttleKnob = document.getElementById('throttleKnob');
const speedLabel = document.getElementById('speedLabel');
const headingLabel = document.getElementById('headingLabel');
const coordLabel = document.getElementById('coordLabel');
const zoneLabel = document.getElementById('zoneLabel');
const anchorButton = document.getElementById('anchorButton');
const fleetButton = document.getElementById('fleetButton');
const toast = document.getElementById('toast');
const startModal = document.getElementById('startModal');
const continueButton = document.getElementById('continueButton');
const newGameButton = document.getElementById('newGameButton');
const dockPanel = document.getElementById('dockPanel');
const closeDockButton = document.getElementById('closeDockButton');
const fuelButton = document.getElementById('fuelButton');
const missionsButton = document.getElementById('missionsButton');
const missionsList = document.getElementById('missionsList');
const portLabel = document.getElementById('portLabel');
const fleetPanel = document.getElementById('fleetPanel');
const closeFleetButton = document.getElementById('closeFleetButton');
const fleetList = document.getElementById('fleetList');
const boatNameLabel = document.getElementById('boatNameLabel');
const moneyLabel = document.getElementById('moneyLabel');
const fuelBar = document.getElementById('fuelBar');
const cargoLabel = document.getElementById('cargoLabel');
const gps = document.getElementById('gps');
const gpsArrow = document.getElementById('gpsArrow');
const gpsLabel = document.getElementById('gpsLabel');
const gpsModal = document.getElementById('gpsModal');
const gpsMapEl = document.getElementById('gpsMap');
const closeGpsButton = document.getElementById('closeGpsButton');
const gpsMapTitle = document.getElementById('gpsMapTitle');
const gpsMapInfo = document.getElementById('gpsMapInfo');

let gpsMap = null;
let gpsRouteLayer = null;

const samplerCanvas = document.createElement('canvas');
const samplerCtx = samplerCanvas.getContext('2d', { willReadFrequently: true });
const waterTileCache = new Map();
samplerCanvas.width = 256;
samplerCanvas.height = 256;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function wrapDegrees(value) {
  return (value % 360 + 360) % 360;
}

function toRadians(value) {
  return value * Math.PI / 180;
}

function toDegrees(value) {
  return value * 180 / Math.PI;
}

function distanceMeters(a, b) {
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS * Math.asin(Math.sqrt(h));
}

function bearingTo(a, b) {
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);
  const dLng = toRadians(b.lng - a.lng);
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return wrapDegrees(toDegrees(Math.atan2(y, x)));
}

function latLngFromDistance(latLng, heading, meters) {
  const angularDistance = meters / EARTH_RADIUS;
  const bearing = toRadians(heading);
  const lat1 = toRadians(latLng.lat);
  const lng1 = toRadians(latLng.lng);
  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(angularDistance) +
    Math.cos(lat1) * Math.sin(angularDistance) * Math.cos(bearing)
  );
  const lng2 = lng1 + Math.atan2(
    Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(lat1),
    Math.cos(angularDistance) - Math.sin(lat1) * Math.sin(lat2)
  );
  return L.latLng(toDegrees(lat2), toDegrees(lng2));
}

function tilePointForLatLng(latLng, zoom) {
  const latRad = toRadians(latLng.lat);
  const scale = 2 ** zoom;
  const rawX = (latLng.lng + 180) / 360 * scale;
  const rawY = (1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * scale;
  const floorX = Math.floor(rawX);
  const floorY = Math.floor(rawY);
  return {
    z: zoom,
    x: (floorX % scale + scale) % scale,
    y: clamp(floorY, 0, scale - 1),
    px: Math.floor((rawX - floorX) * 256),
    py: Math.floor((rawY - floorY) * 256),
  };
}

function waterTileUrl(z, x, y) {
  const subdomain = WATER_SUBDOMAINS[Math.abs(x + y + z) % WATER_SUBDOMAINS.length];
  let url = WATER_URL
    .replace('{s}', subdomain)
    .replace('{z}', z)
    .replace('{x}', x)
    .replace('{y}', y);
    console.log('water_url', url)
    return url;
}

function loadWaterTile(z, x, y) {
  const key = `${z}/${x}/${y}`;
  if (waterTileCache.has(key)) {
    return waterTileCache.get(key);
  }

  const promise = new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = waterTileUrl(z, x, y);
  });

  waterTileCache.set(key, promise);
  if (waterTileCache.size > 128) {
    waterTileCache.delete(waterTileCache.keys().next().value);
  }
  return promise;
}

async function sampleWaterMap(latLng) {
  const zoom = Math.min(15, Math.max(8, Math.round(map.getZoom())));
  const point = tilePointForLatLng(latLng, zoom);
  const img = await loadWaterTile(point.z, point.x, point.y);
  samplerCtx.clearRect(0, 0, 256, 256);
  samplerCtx.drawImage(img, 0, 0, 256, 256);

  const sampleSize = 9;
  const sx = clamp(point.px - 4, 0, 256 - sampleSize);
  const sy = clamp(point.py - 4, 0, 256 - sampleSize);
  const pixels = samplerCtx.getImageData(sx, sy, sampleSize, sampleSize).data;
  let waterPixels = 0;
  let total = 0;

  for (let i = 0; i < pixels.length; i += 4) {
    const r = pixels[i];
    const g = pixels[i + 1];
    const b = pixels[i + 2];
    const brightness = (r + g + b) / 3;
    const blueGrayWater = brightness > 188 && brightness < 232 && b >= r + 3 && g >= r + 1 && b >= g - 4;
    const paleCartoWater = r >= 195 && r <= 222 && g >= 202 && g <= 228 && b >= 204 && b <= 232 && b >= r + 2;
    const harborWater = brightness > 145 && brightness < 214 && b >= g - 5 && g >= r - 8 && b >= r + 4;
    if (blueGrayWater || paleCartoWater || harborWater) {
      waterPixels += 1;
    }
    total += 1;
  }

  return waterPixels / total;
}

async function isWater(latLng) {
  try {
    return await sampleWaterMap(latLng) > 0.52;
  } catch (error) {
    showToast('No pude leer el mapa de agua.');
    return true;
  }
}

function getBoat() {
  return BOATS[state.boatId];
}

function getPort(id) {
  return PORTS.find((port) => port.id === id);
}

function getPortLatLng(port) {
  return L.latLng(port.lat, port.lng);
}

function findDockedPort() {
  if (!state.boatLatLng) {
    return null;
  }
  return PORTS.find((port) => distanceMeters(state.boatLatLng, getPortLatLng(port)) <= port.radius);
}

function missionSeed(fromPort, targetPort, index, boat) {
  const distanceKm = distanceMeters(getPortLatLng(fromPort), getPortLatLng(targetPort)) / 1000;
  const isPassengers = boat.cargoType === 'pasajeros';
  const amountBase = isPassengers ? Math.max(2, Math.round(boat.capacity * (0.28 + index * 0.12))) : Math.max(12, Math.round(boat.capacity * (0.22 + index * 0.08)));
  const reward = Math.round(distanceKm * (isPassengers ? 105 : 42) + amountBase * (isPassengers ? 18 : 5));
  return {
    id: `${fromPort.id}-${targetPort.id}-${boat.id}-${index}`,
    type: boat.cargoType,
    amount: Math.min(boat.capacity, amountBase),
    from: fromPort.id,
    to: targetPort.id,
    reward,
    distanceKm,
  };
}

function availableMissions() {
  const currentPort = getPort(state.currentPortId);
  const boat = getBoat();
  if (!currentPort) {
    return [];
  }

  return PORTS
    .filter((port) => port.id !== currentPort.id)
    .map((port) => ({ port, distance: distanceMeters(getPortLatLng(currentPort), getPortLatLng(port)) }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 4)
    .map((item, index) => missionSeed(currentPort, item.port, index + 1, boat));
}

function saveGame() {
  if (!state.started) {
    return;
  }
  const payload = {
    boatLatLng: { lat: state.boatLatLng.lat, lng: state.boatLatLng.lng },
    heading: state.heading,
    boatId: state.boatId,
    fuel: state.fuel,
    money: state.money,
    mission: state.mission,
    currentPortId: state.currentPortId,
    velocityMps: state.velocityMps,
    yawVelocity: state.yawVelocity,
    savedAt: Date.now(),
  };
  localStorage.setItem(SAVE_KEY, JSON.stringify(payload));
}

function loadGame() {
  const raw = localStorage.getItem(SAVE_KEY);
  if (!raw) {
    return false;
  }
  try {
    const payload = JSON.parse(raw);
    if (!BOATS[payload.boatId] || !payload.boatLatLng) {
      return false;
    }
    state.boatLatLng = L.latLng(payload.boatLatLng.lat, payload.boatLatLng.lng);
    state.heading = Number(payload.heading) || 0;
    state.boatId = payload.boatId;
    state.fuel = clamp(Number(payload.fuel) || BOATS[payload.boatId].fuelMax, 0, BOATS[payload.boatId].fuelMax);
    state.money = Number(payload.money) || 0;
    state.mission = payload.mission || null;
    state.currentPortId = payload.currentPortId || null;
    state.velocityMps = Number(payload.velocityMps) || 0;
    state.yawVelocity = Number(payload.yawVelocity) || 0;
    return true;
  } catch (error) {
    return false;
  }
}

function newGame() {
  state.boatLatLng = ARES;
  state.heading = 18;
  state.boatId = 'yacht';
  state.fuel = BOATS.yacht.fuelMax;
  state.money = 650;
  state.mission = null;
  state.currentPortId = 'ares';
  state.throttle = 0;
  state.velocityMps = 0;
  state.yawVelocity = 0;
  state.anchored = true;
  state.dockOpen = true;
}

function startGame(useSave) {
  if (!useSave || !loadGame()) {
    newGame();
  }
  state.started = true;
  startModal.classList.add('is-hidden');
  map.setView(state.boatLatLng, 15, { animate: false });
  renderFleet();
  renderDock();
  updatePortState();
  updateBoatAsset();
  updateReadouts();
  saveGame();
}

function showToast(message) {
  window.clearTimeout(state.toastTimer);
  toast.textContent = message;
  toast.classList.add('is-visible');
  state.toastTimer = window.setTimeout(() => toast.classList.remove('is-visible'), 1800);
}

function setAnchored(value) {
  state.anchored = value;
  if (value) {
    state.throttle = 0;
    state.velocityMps = 0;
    state.yawVelocity = 0;
  }
  anchorButton.classList.toggle('is-on', value);
  boatLayer.classList.toggle('is-sailing', !value && Math.abs(state.throttle) > 0.02 && state.fuel > 0);
  saveSoon();
}

async function placeBoat(latLng) {
  if (state.mission) {
    showToast('Termina la misión antes de recolocar el barco.');
    return;
  }
  const water = await isWater(latLng);
  if (!water) {
    showToast('Ahí el mapa náutico marca tierra.');
    return;
  }
  state.boatLatLng = latLng;
  state.currentPortId = null;
  setAnchored(false);
  map.setView(latLng, Math.max(map.getZoom(), 15), { animate: true });
  saveSoon();
}

function renderPorts() {
  portLayer.clearLayers();
  PORTS.forEach((port) => {
    const isTarget = state.mission && state.mission.to === port.id;
    const isCurrent = state.currentPortId === port.id;
    const circle = L.circle([port.lat, port.lng], {
      radius: port.radius,
      color: isTarget ? '#f2c85b' : isCurrent ? '#44d4ca' : '#f5f7ec',
      weight: isTarget ? 3 : 1,
      opacity: isTarget ? 0.9 : 0.55,
      fillColor: isTarget ? '#f2c85b' : '#44d4ca',
      fillOpacity: isTarget ? 0.16 : 0.08,
    });
    circle.bindTooltip(port.name, { direction: 'top', opacity: 0.92 });
    circle.addTo(portLayer);
  });
}

function renderFleet() {
  fleetList.innerHTML = '';
  Object.values(BOATS).forEach((boat) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `fleet-card${boat.id === state.boatId ? ' is-selected' : ''}`;
    button.innerHTML = `
      <img src="${boat.sprite}-1.png" alt="">
      <span>
        <strong>${boat.name}</strong>
        <small>${boat.cargoType} · cap. ${boat.capacity} · ${(boat.maxSpeed * 1.94384).toFixed(0)} kn · ${boat.fuelMax} L</small>
      </span>
    `;
    button.addEventListener('click', () => {
      if (state.mission) {
        showToast('No cambies de barco con carga a bordo.');
        return;
      }
      const oldBoat = getBoat();
      state.boatId = boat.id;
      state.fuel = Math.min(boat.fuelMax, state.fuel / oldBoat.fuelMax * boat.fuelMax);
      updateBoatAsset();
      renderFleet();
      renderDock();
      updateReadouts();
      saveSoon();
    });
    fleetList.appendChild(button);
  });
}

function renderDock() {
  const port = getPort(state.currentPortId);
  dockPanel.classList.toggle('is-open', Boolean(port && state.dockOpen));
  if (!port) {
    return;
  }

  portLabel.textContent = `Puerto de ${port.name}`;
  fuelButton.textContent = `Repostar €${fuelCost()}`;
  renderMissions(false);
}

function renderMissions(forceOpen = true) {
  missionsList.innerHTML = '';
  missionsList.classList.toggle('is-open', forceOpen);
  if (!forceOpen) {
    return;
  }
  if (state.mission) {
    const target = getPort(state.mission.to);
    missionsList.innerHTML = `<p>Misión activa hacia ${target.name}. ${state.mission.amount} ${state.mission.type}.</p>`;
    return;
  }

  availableMissions().forEach((mission) => {
    const target = getPort(mission.to);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'mission-card';
    button.innerHTML = `
      <strong>${target.name}</strong>
      <span>${mission.amount} ${mission.type} · ${mission.distanceKm.toFixed(1)} km · €${mission.reward}</span>
    `;
    button.addEventListener('click', () => acceptMission(mission));
    missionsList.appendChild(button);
  });
}

function acceptMission(mission) {
  if (state.mission) {
    return;
  }
  state.mission = mission;
  state.dockOpen = false;
  setAnchored(false);
  renderDock();
  renderPorts();
  updateReadouts();
  showToast(`Rumbo a ${getPort(mission.to).name}.`);
  saveSoon();
}

function completeMission() {
  if (!state.mission) {
    return;
  }
  const mission = state.mission;
  const target = getPort(mission.to);
  state.money += mission.reward;
  state.mission = null;
  state.currentPortId = target.id;
  state.dockOpen = true;
  setAnchored(true);
  renderDock();
  renderPorts();
  showToast(`Entrega completada: +€${mission.reward}.`);
  saveSoon();
}

function fuelCost() {
  const boat = getBoat();
  return Math.ceil((boat.fuelMax - state.fuel) * 1.8);
}

function refuel() {
  const cost = fuelCost();
  if (cost <= 0) {
    showToast('Depósito lleno.');
    return;
  }
  if (state.money < cost) {
    showToast('No tienes dinero suficiente para repostar.');
    return;
  }
  state.money -= cost;
  state.fuel = getBoat().fuelMax;
  updateReadouts();
  renderDock();
  saveSoon();
}

function updateBoatAsset() {
  const boat = getBoat();
  state.spriteFrame = 1;
  boatSprite.src = `${boat.sprite}-1.png`;
  boatNameLabel.textContent = boat.name;
  document.documentElement.style.setProperty('--accent-boat', boat.color);
}

function updatePortState() {
  const port = findDockedPort();
  const previousPort = state.currentPortId;
  state.currentPortId = port ? port.id : null;

  if (port && state.mission && state.mission.to === port.id) {
    completeMission();
  } else if (port && previousPort !== port.id) {
    state.dockOpen = true;
    showToast(`Atracando en ${port.name}.`);
    renderDock();
  } else if (!port && previousPort) {
    state.dockOpen = false;
    renderDock();
  }

  renderPorts();
}

function updateReadouts() {
  const boat = getBoat();
  const speedMps = currentSpeedMps();
  const speedPrefix = speedMps < -0.05 ? '-' : '';
  speedLabel.textContent = `${speedPrefix}${Math.abs(speedMps * 1.94384).toFixed(1)} kn`;
  headingLabel.textContent = `${String(Math.round(state.heading)).padStart(3, '0')}°`;
  coordLabel.textContent = `${state.boatLatLng.lat.toFixed(4)}, ${state.boatLatLng.lng.toFixed(4)}`;
  moneyLabel.textContent = `€${Math.round(state.money)}`;
  fuelBar.style.width = `${clamp(state.fuel / boat.fuelMax * 100, 0, 100)}%`;

  const port = getPort(state.currentPortId);
  if (port) {
    zoneLabel.textContent = `Puerto de ${port.name}`;
  } else {
    zoneLabel.textContent = state.lastWater ? 'Agua abierta' : 'Costa';
  }

  if (state.mission) {
    const target = getPort(state.mission.to);
    const distanceKm = distanceMeters(state.boatLatLng, getPortLatLng(target)) / 1000;
    cargoLabel.textContent = `${state.mission.amount} ${state.mission.type} → ${target.name}`;
    gps.classList.add('is-active');
    gpsLabel.textContent = `${target.name} · ${distanceKm.toFixed(1)} km`;
    const relativeBearing = wrapDegrees(bearingTo(state.boatLatLng, getPortLatLng(target)) - state.heading);
    gpsArrow.style.transform = `rotate(${relativeBearing}deg)`;
  } else {
    cargoLabel.textContent = `Cap. ${boat.capacity} ${boat.cargoType} · ${(boat.maxSpeed * 1.94384).toFixed(0)} kn`;
    gps.classList.remove('is-active');
    gpsLabel.textContent = 'Sin destino';
    gpsArrow.style.transform = 'rotate(0deg)';
  }

  throttleKnob.style.top = `${50 - state.throttle * 42}%`;
  throttle.setAttribute('aria-valuenow', state.throttle.toFixed(2));
}

function currentSpeedMps() {
  return state.velocityMps;
}

function targetSpeedMps() {
  if (state.anchored || state.fuel <= 0) {
    return 0;
  }
  const reverseFactor = state.throttle < 0 ? 0.38 : 1;
  return getBoat().maxSpeed * state.throttle * reverseFactor;
}

function updateBoatVisual(deltaMs) {
  boatSprite.style.transform = `rotate(${state.heading}deg)`;
  wake.style.transform = `rotate(${state.heading}deg)`;
  boatLayer.classList.toggle('is-sailing', Math.abs(currentSpeedMps()) > 0.2);
}

async function checkNextWater(latLng) {
  const now = performance.now();
  if (now - state.lastWaterCheck < WATER_SAMPLE_INTERVAL) {
    return state.lastWater;
  }
  state.lastWaterCheck = now;
  state.lastWater = await isWater(latLng);
  if (!state.lastWater) {
    showToast('Tierra detectada en el mapa náutico.');
  }
  return state.lastWater;
}

async function tick(now) {
  if (!state.started) {
    state.lastTime = now;
    requestAnimationFrame(tick);
    return;
  }

  const deltaMs = clamp(now - state.lastTime, 0, 48);
  const deltaSeconds = deltaMs / 1000;
  state.lastTime = now;

  state.rudder += (state.targetRudder - state.rudder) * 0.18;
  const targetSpeed = targetSpeedMps();
  const acceleration = targetSpeed === 0 ? 2.2 : targetSpeed > state.velocityMps ? 1.25 : 1.85;
  const speedDelta = clamp(targetSpeed - state.velocityMps, -acceleration * deltaSeconds, acceleration * deltaSeconds);
  state.velocityMps += speedDelta;
  if (Math.abs(state.velocityMps) < 0.025 && targetSpeed === 0) {
    state.velocityMps = 0;
  }

  const boat = getBoat();
  const speedRatio = clamp(Math.abs(state.velocityMps) / boat.maxSpeed, 0, 1);
  const steerSign = state.velocityMps < -0.05 ? -1 : 1;
  const yawTarget = state.rudder * steerSign * MAX_YAW_DEG * (0.18 + speedRatio * 0.82);
  const yawDelta = clamp(yawTarget - state.yawVelocity, -TURN_ACCEL_DEG * deltaSeconds, TURN_ACCEL_DEG * deltaSeconds);
  state.yawVelocity += yawDelta;
  state.yawVelocity *= 1 - clamp(deltaSeconds * 1.15, 0, 0.18);
  state.heading = wrapDegrees(state.heading + state.yawVelocity * deltaSeconds);

  const speedMps = currentSpeedMps();
  if (Math.abs(speedMps) > 0.05) {
    const heading = speedMps >= 0 ? state.heading : wrapDegrees(state.heading + 180);
    const next = latLngFromDistance(state.boatLatLng, heading, Math.abs(speedMps) * deltaSeconds);
    if (await checkNextWater(next) || findDockedPort()) {
      state.boatLatLng = next;
      map.panTo(next, { animate: false });
      const burn = boat.fuelBurn * Math.max(0.18, Math.abs(state.throttle)) * deltaSeconds * (1 + Math.abs(state.rudder) * 0.22);
      state.fuel = clamp(state.fuel - burn, 0, boat.fuelMax);
      if (state.fuel <= 0.01) {
        state.throttle = 0;
        state.velocityMps = 0;
        showToast('Sin combustible. Busca puerto para repostar.');
      }
    } else {
      state.velocityMps = 0;
      state.throttle = 0;
    }
  }

  helmWheel.style.transform = `rotate(${state.targetRudder * 78}deg)`;
  helm.setAttribute('aria-valuenow', state.targetRudder.toFixed(2));
  updatePortState();
  updateBoatVisual(deltaMs);
  updateReadouts();
  saveTick(now);
  requestAnimationFrame(tick);
}

function saveSoon() {
  window.clearTimeout(state.saveTimer);
  state.saveTimer = window.setTimeout(saveGame, 250);
}

function saveTick(now) {
  if (!state._lastAutoSave || now - state._lastAutoSave > 2800) {
    state._lastAutoSave = now;
    saveGame();
  }
}

function setRudderFromPointer(event) {
  const rect = helm.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const dx = event.clientX - cx;
  const dy = event.clientY - cy;
  const angle = Math.atan2(dy, dx) + Math.PI / 2;
  state.targetRudder = clamp(Math.sin(angle), -1, 1);
}

function setThrottleFromPointer(event) {
  const rect = throttle.getBoundingClientRect();
  const ratio = clamp((event.clientY - rect.top) / rect.height, 0, 1);
  state.throttle = clamp((0.5 - ratio) * 2, -1, 1);
  if (Math.abs(state.throttle) < 0.08) {
    state.throttle = 0;
  }
  if (Math.abs(state.throttle) > 0.02) {
    state.anchored = false;
    anchorButton.classList.remove('is-on');
  }
  saveSoon();
}

function openGpsMap() {
  if (!state.mission) {
    showToast('No hay misión activa.');
    return;
  }

  const target = getPort(state.mission.to);
  const destination = getPortLatLng(target);
  gpsModal.classList.remove('is-hidden');
  gpsMapTitle.textContent = `Ruta a ${target.name}`;
  gpsMapInfo.textContent = `${distanceMeters(state.boatLatLng, destination).toFixed(0)} m hasta destino`;

  window.setTimeout(() => {
    if (!gpsMap) {
      gpsMap = L.map(gpsMapEl, {
        zoomControl: false,
        attributionControl: false,
        dragging: true,
        scrollWheelZoom: false,
        doubleClickZoom: false,
      });
      L.tileLayer(SATELLITE_URL, {
        maxZoom: MAX_ZOOM,
        crossOrigin: true,
      }).addTo(gpsMap);
      gpsRouteLayer = L.layerGroup().addTo(gpsMap);
    }

    gpsMap.invalidateSize();
    gpsRouteLayer.clearLayers();
    const here = L.circleMarker(state.boatLatLng, {
      radius: 7,
      color: '#44d4ca',
      fillColor: '#44d4ca',
      fillOpacity: 0.95,
      weight: 2,
    }).bindTooltip('Tú', { permanent: true, direction: 'top' });
    const there = L.circleMarker(destination, {
      radius: 7,
      color: '#f2c85b',
      fillColor: '#f2c85b',
      fillOpacity: 0.95,
      weight: 2,
    }).bindTooltip(target.name, { permanent: true, direction: 'top' });
    const line = L.polyline([state.boatLatLng, destination], {
      color: '#f2c85b',
      weight: 3,
      opacity: 0.9,
      dashArray: '8 8',
    });

    gpsRouteLayer.addLayer(line);
    gpsRouteLayer.addLayer(here);
    gpsRouteLayer.addLayer(there);
    gpsMap.fitBounds(L.latLngBounds([state.boatLatLng, destination]).pad(0.35), { animate: false });
  }, 80);
}

function closeGpsMap() {
  gpsModal.classList.add('is-hidden');
}

helm.addEventListener('pointerdown', (event) => {
  helm.setPointerCapture(event.pointerId);
  setRudderFromPointer(event);
});

helm.addEventListener('pointermove', (event) => {
  if (helm.hasPointerCapture(event.pointerId)) {
    setRudderFromPointer(event);
  }
});

helm.addEventListener('pointerup', (event) => {
  if (helm.hasPointerCapture(event.pointerId)) {
    helm.releasePointerCapture(event.pointerId);
  }
  state.targetRudder = 0;
});

helm.addEventListener('pointercancel', () => {
  state.targetRudder = 0;
});

throttle.addEventListener('pointerdown', (event) => {
  throttle.setPointerCapture(event.pointerId);
  setThrottleFromPointer(event);
});

throttle.addEventListener('pointermove', (event) => {
  if (throttle.hasPointerCapture(event.pointerId)) {
    setThrottleFromPointer(event);
  }
});

throttle.addEventListener('keydown', (event) => {
  if (event.key === 'ArrowUp') {
    state.throttle = clamp(state.throttle + 0.08, -1, 1);
  }
  if (event.key === 'ArrowDown') {
    state.throttle = clamp(state.throttle - 0.08, -1, 1);
  }
  if (event.key === 'Home') {
    state.throttle = 1;
  }
  if (event.key === 'End') {
    state.throttle = -1;
  }
  if (event.key === ' ' || event.key === 'Enter') {
    state.throttle = 0;
  }
});

map.on('click', (event) => {
  placeBoat(event.latlng);
});

anchorButton.addEventListener('click', () => setAnchored(!state.anchored));
fleetButton.addEventListener('click', () => fleetPanel.classList.add('is-open'));
closeFleetButton.addEventListener('click', () => fleetPanel.classList.remove('is-open'));
closeDockButton.addEventListener('click', () => {
  state.dockOpen = false;
  renderDock();
});
missionsButton.addEventListener('click', () => renderMissions(!missionsList.classList.contains('is-open')));
fuelButton.addEventListener('click', refuel);
continueButton.addEventListener('click', () => startGame(true));
newGameButton.addEventListener('click', () => startGame(false));
gps.addEventListener('click', openGpsMap);
closeGpsButton.addEventListener('click', closeGpsMap);
gpsModal.addEventListener('click', (event) => {
  if (event.target === gpsModal) {
    closeGpsMap();
  }
});

window.addEventListener('resize', () => map.invalidateSize());
window.addEventListener('beforeunload', saveGame);

if (!localStorage.getItem(SAVE_KEY)) {
  continueButton.disabled = true;
}

renderPorts();
renderFleet();
updateBoatAsset();
updateReadouts();
requestAnimationFrame(tick);
