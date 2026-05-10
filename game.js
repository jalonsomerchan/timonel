const SATELLITE_URL = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
const WATER_URL = 'https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}.png';
const WATER_SUBDOMAINS = ['a', 'b', 'c', 'd'];
const EARTH_RADIUS = 6378137;
const MAX_ZOOM = 18;
const START_ZOOM = 16;
const PLACE_ZOOM = 17;
const SPEED_MULTIPLIER = 12;
const TURN_ACCEL_DEG = 58;
const MAX_YAW_DEG = 44;
const WATER_SAMPLE_INTERVAL = 360;
const OSM_PORT_RADIUS_M = 130000;
const OSM_PORT_REFRESH_M = 18000;
const OVERPASS_URLS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.openstreetmap.ru/api/interpreter',
];
const GROUND_ESCAPE_ANGLE_DEG = 35;
const MIN_PORT_SEPARATION_M = 2500;
const MIN_MISSION_DISTANCE_M = 20000;
const FUEL_BURN_MULTIPLIER = 4;
const TRAFFIC_BOAT_COUNT = 8;
const TRAFFIC_RESPAWN_DISTANCE_M = 3600;
const TRAFFIC_COLLISION_COOLDOWN_MS = 1300;
const TRAFFIC_WATER_SAMPLE_INTERVAL = 850;
const FISH_PICKUP_RADIUS_M = 85;
const FISH_SPAWN_INTERVAL_MS = 1400;
const FISH_SCHOOL_MAX = 5;
const FISH_SCHOOL_TTL_MS = 28000;
const SAVE_KEY = 'boat-map-save-v2';
const ARES = L.latLng(43.424399, -8.23971);

const BOATS = {
  yacht: {
    id: 'yacht',
    name: 'Yate',
    cargoType: 'pasajeros',
    capacity: 12,
    maxSpeed: 13.6 * SPEED_MULTIPLIER,
    fuelMax: 520,
    fuelBurn: 0.030,
    sprite: 'assets/boats/yacht/yacht',
    spriteScale: 1.05,
    color: '#f2c85b',
  },
  speedboat: {
    id: 'speedboat',
    name: 'Lancha',
    cargoType: 'pasajeros',
    capacity: 6,
    maxSpeed: 22.5 * SPEED_MULTIPLIER,
    fuelMax: 260,
    fuelBurn: 0.050,
    sprite: 'assets/boats/speedboat/speedboat',
    spriteScale: 0.72,
    color: '#ff6f61',
  },
  cargo: {
    id: 'cargo',
    name: 'Barco de carga',
    cargoType: 'mercancia',
    capacity: 180,
    maxSpeed: 8.8 * SPEED_MULTIPLIER,
    fuelMax: 1500,
    fuelBurn: 0.046,
    sprite: 'assets/boats/cargo/cargo',
    spriteScale: 1.42,
    color: '#44d4ca',
  },
  oceanliner: {
    id: 'oceanliner',
    name: 'Transatlántico',
    cargoType: 'pasajeros',
    capacity: 420,
    maxSpeed: 10.8 * SPEED_MULTIPLIER,
    fuelMax: 2200,
    fuelBurn: 0.058,
    sprite: 'assets/boats/oceanliner/oceanliner',
    spriteScale: 1.72,
    color: '#d8eef0',
  },
  fishing: {
    id: 'fishing',
    name: 'Pesquero',
    cargoType: 'pescado',
    capacity: 80,
    maxSpeed: 9.6 * SPEED_MULTIPLIER,
    fuelMax: 980,
    fuelBurn: 0.040,
    sprite: 'assets/boats/fishing/fishing',
    spriteScale: 1.16,
    color: '#6fb7ff',
    fishing: true,
  },
};

const BASE_PORTS = [
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
  osmPorts: [],
  lastOsmFetchLatLng: null,
  osmFetchInFlight: false,
  osmFetchAttempt: 0,
  portLoading: false,
  dockOpen: true,
  grounded: false,
  lastTime: performance.now(),
  lastWaterCheck: 0,
  lastWater: true,
  spriteFrame: 1,
  spriteTime: 0,
  toastTimer: 0,
  saveTimer: 0,
  started: false,
  trafficBoats: [],
  lastTrafficCollision: 0,
  lastMissionWarning: 0,
  fishSchools: [],
  lastFishSpawn: 0,
};

const map = L.map('map', {
  zoomControl: false,
  attributionControl: true,
  minZoom: 3,
  maxZoom: MAX_ZOOM,
  worldCopyJump: true,
  inertia: true,
  preferCanvas: false,
}).setView(ARES, START_ZOOM);

L.tileLayer(SATELLITE_URL, {
  maxZoom: MAX_ZOOM,
  crossOrigin: true,
  className: 'satellite-tile',
  attribution: 'Sources: Esri, DigitalGlobe, GeoEye, USDA FSA, USGS, IGN, swisstopo, and the GIS User Community | Water sampling: CARTO',
}).addTo(map);

const portLayer = L.layerGroup().addTo(map);
const fishLayer = L.layerGroup().addTo(map);

const trafficLayer = document.getElementById('trafficLayer');
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
const portLoading = document.getElementById('portLoading');
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

function allPorts() {
  const accepted = [];
  [...BASE_PORTS, ...state.osmPorts].forEach((port) => {
    const isTooClose = accepted.some((kept) => distanceMeters(getPortLatLng(kept), getPortLatLng(port)) < MIN_PORT_SEPARATION_M);
    if (!isTooClose) {
      accepted.push(port);
    }
  });
  return accepted;
}

function getPort(id) {
  return allPorts().find((port) => port.id === id);
}

function getPortLatLng(port) {
  return L.latLng(port.lat, port.lng);
}

function nearestPort(latLng = state.boatLatLng) {
  return allPorts()
    .map((port) => ({ port, distance: distanceMeters(latLng, getPortLatLng(port)) }))
    .sort((a, b) => a.distance - b.distance)[0] || null;
}

function setPortLoading(value, message = 'Buscando puertos...') {
  state.portLoading = value;
  portLoading.textContent = message;
  portLoading.classList.toggle('is-visible', value);
}

function findDockedPort() {
  if (!state.boatLatLng) {
    return null;
  }
  return allPorts().find((port) => distanceMeters(state.boatLatLng, getPortLatLng(port)) <= port.radius);
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

function fishingMissionSeed(fromPort, boat) {
  const amount = boat.capacity;
  return {
    id: `fish-${fromPort.id}-${boat.id}`,
    kind: 'fishing',
    type: boat.cargoType,
    amount,
    from: fromPort.id,
    to: fromPort.id,
    caught: 0,
    reward: Math.round(amount * 11),
    distanceKm: 0,
  };
}

function availableMissions() {
  const currentPort = getPort(state.currentPortId);
  const boat = getBoat();
  if (!currentPort) {
    return [];
  }

  if (boat.fishing) {
    return [fishingMissionSeed(currentPort, boat)];
  }

  return allPorts()
    .filter((port) => port.id !== currentPort.id)
    .map((port) => ({ port, distance: distanceMeters(getPortLatLng(currentPort), getPortLatLng(port)) }))
    .filter((item) => item.distance >= MIN_MISSION_DISTANCE_M)
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
    osmPorts: state.osmPorts,
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
    if (state.mission?.kind === 'fishing') {
      state.mission.caught = clamp(Number(state.mission.caught) || (state.mission.pickedUp ? state.mission.amount : 0), 0, state.mission.amount);
      delete state.mission.pickup;
      delete state.mission.pickedUp;
    }
    state.currentPortId = payload.currentPortId || null;
    state.osmPorts = Array.isArray(payload.osmPorts) ? payload.osmPorts.slice(0, 120) : [];
    state.velocityMps = clamp(Number(payload.velocityMps) || 0, -BOATS[payload.boatId].maxSpeed * 0.38, BOATS[payload.boatId].maxSpeed);
    state.yawVelocity = clamp(Number(payload.yawVelocity) || 0, -MAX_YAW_DEG, MAX_YAW_DEG);
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
  state.osmPorts = [];
  state.lastOsmFetchLatLng = null;
  state.osmFetchAttempt = 0;
  state.throttle = 0;
  state.velocityMps = 0;
  state.yawVelocity = 0;
  state.grounded = false;
  state.anchored = true;
  state.dockOpen = true;
  state.trafficBoats = [];
  trafficLayer.innerHTML = '';
  state.fishSchools = [];
  state.lastFishSpawn = 0;
  fishLayer.clearLayers();
}

function startGame(useSave) {
  if (!useSave || !loadGame()) {
    newGame();
  }
  state.started = true;
  startModal.classList.add('is-hidden');
  map.setView(state.boatLatLng, START_ZOOM, { animate: false });
  renderFleet();
  renderDock();
  updatePortState();
  updateBoatAsset();
  updateReadouts();
  discoverPortsNearBoat(true);
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
  map.setView(latLng, Math.max(map.getZoom(), PLACE_ZOOM), { animate: true });
  saveSoon();
}

function renderPorts() {
  portLayer.clearLayers();
  allPorts().forEach((port) => {
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

function osmPortName(tags, fallback) {
  return tags.name || tags['name:es'] || tags['name:en'] || tags.harbour || tags.seamark_name || fallback;
}

function osmElementLatLng(element) {
  if (typeof element.lat === 'number' && typeof element.lon === 'number') {
    return { lat: element.lat, lng: element.lon };
  }
  if (element.center && typeof element.center.lat === 'number' && typeof element.center.lon === 'number') {
    return { lat: element.center.lat, lng: element.center.lon };
  }
  return null;
}

function normalizeOsmPorts(elements) {
  return elements
    .map((element) => {
      const position = osmElementLatLng(element);
      if (!position) {
        return null;
      }
      const tags = element.tags || {};
      const fallback = tags.leisure === 'marina' ? 'Marina' : tags.amenity === 'ferry_terminal' ? 'Terminal ferry' : 'Puerto';
      return {
        id: `osm-${element.type}-${element.id}`,
        name: osmPortName(tags, fallback),
        lat: position.lat,
        lng: position.lng,
        radius: tags.leisure === 'marina' ? 520 : 760,
        source: 'osm',
      };
    })
    .filter(Boolean)
    .filter((port) => Number.isFinite(port.lat) && Number.isFinite(port.lng));
}

function mergeOsmPorts(newPorts) {
  const accepted = [...BASE_PORTS, ...state.osmPorts];
  newPorts.forEach((port) => {
    const isTooClose = accepted.some((kept) => distanceMeters(getPortLatLng(kept), getPortLatLng(port)) < MIN_PORT_SEPARATION_M);
    if (!isTooClose) {
      accepted.push(port);
    }
  });
  state.osmPorts = accepted
    .filter((port) => port.source === 'osm')
    .sort((a, b) => distanceMeters(state.boatLatLng, getPortLatLng(a)) - distanceMeters(state.boatLatLng, getPortLatLng(b)))
    .slice(0, 120);
}

async function discoverPortsNearBoat(force = false) {
  if (state.osmFetchInFlight || !state.boatLatLng) {
    return;
  }
  if (!force && state.lastOsmFetchLatLng && distanceMeters(state.boatLatLng, state.lastOsmFetchLatLng) < OSM_PORT_REFRESH_M) {
    return;
  }

  state.osmFetchInFlight = true;
  state.lastOsmFetchLatLng = L.latLng(state.boatLatLng.lat, state.boatLatLng.lng);
  setPortLoading(true, force ? 'Cargando puertos cercanos...' : 'Actualizando puertos...');
  const { lat, lng } = state.boatLatLng;
  const query = `
    [out:json][timeout:14];
    (
      node(around:${OSM_PORT_RADIUS_M},${lat},${lng})["leisure"="marina"];
      way(around:${OSM_PORT_RADIUS_M},${lat},${lng})["leisure"="marina"];
      relation(around:${OSM_PORT_RADIUS_M},${lat},${lng})["leisure"="marina"];
      node(around:${OSM_PORT_RADIUS_M},${lat},${lng})["harbour"];
      way(around:${OSM_PORT_RADIUS_M},${lat},${lng})["harbour"];
      relation(around:${OSM_PORT_RADIUS_M},${lat},${lng})["harbour"];
      node(around:${OSM_PORT_RADIUS_M},${lat},${lng})["amenity"="ferry_terminal"];
      way(around:${OSM_PORT_RADIUS_M},${lat},${lng})["amenity"="ferry_terminal"];
      relation(around:${OSM_PORT_RADIUS_M},${lat},${lng})["amenity"="ferry_terminal"];
      node(around:${OSM_PORT_RADIUS_M},${lat},${lng})["seamark:type"="harbour"];
      way(around:${OSM_PORT_RADIUS_M},${lat},${lng})["seamark:type"="harbour"];
      relation(around:${OSM_PORT_RADIUS_M},${lat},${lng})["seamark:type"="harbour"];
    );
    out tags center 80;
  `;

  try {
    let data = null;
    let lastError = null;
    const startIndex = state.osmFetchAttempt % OVERPASS_URLS.length;
    for (let attempt = 0; attempt < OVERPASS_URLS.length; attempt += 1) {
      const url = OVERPASS_URLS[(startIndex + attempt) % OVERPASS_URLS.length];
      try {
        const response = await fetch(`${url}?data=${encodeURIComponent(query)}`);
        if (!response.ok) {
          throw new Error(`Overpass ${response.status}`);
        }
        data = await response.json();
        state.osmFetchAttempt = startIndex + attempt;
        break;
      } catch (error) {
        lastError = error;
      }
    }

    if (!data) {
      throw lastError || new Error('Overpass no respondió');
    }
    const discovered = normalizeOsmPorts(data.elements || []);
    if (discovered.length) {
      mergeOsmPorts(discovered);
      renderPorts();
      renderDock();
      if (!state.mission && state.currentPortId) {
        renderMissions(missionsList.classList.contains('is-open'));
      }
      saveSoon();
    } else if (force) {
      showToast('No encontré puertos nuevos por aquí.');
    }
  } catch (error) {
    console.warn('OSM port discovery failed', error);
    showToast('No pude cargar puertos online. Mantengo los conocidos.');
  } finally {
    state.osmFetchInFlight = false;
    setPortLoading(false);
  }
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
    const detail = state.mission.kind === 'fishing' && !isFishingHoldFull()
      ? `Navega y recoge pescado: ${Math.floor(state.mission.caught || 0)}/${state.mission.amount}.`
      : `Rumbo a ${target.name}. ${state.mission.amount} ${state.mission.type}.`;
    missionsList.innerHTML = `<p>${detail}</p>`;
    return;
  }

  const missions = availableMissions();
  if (!missions.length) {
    missionsList.innerHTML = getBoat().fishing
      ? '<p>Cargando puertos o sin destinos cercanos todavía.</p>'
      : '<p>Cargando puertos o sin destinos a 20 km todavía.</p>';
    return;
  }

  missions.forEach((mission) => {
    const target = getPort(mission.to);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'mission-card';
    const title = mission.kind === 'fishing' ? `Pescar desde ${target.name}` : target.name;
    const detail = mission.kind === 'fishing'
      ? `${mission.amount} ${mission.type} · vuelve al mismo puerto · €${mission.reward}`
      : `${mission.amount} ${mission.type} · ${mission.distanceKm.toFixed(1)} km · €${mission.reward}`;
    button.innerHTML = `
      <strong>${title}</strong>
      <span>${detail}</span>
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
  showToast(mission.kind === 'fishing' ? 'Navega por agua abierta: irán apareciendo peces.' : `Rumbo a ${getPort(mission.to).name}.`);
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
  clearFishSchools();
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
  document.documentElement.style.setProperty('--boat-scale', boat.spriteScale);
  state.trafficBoats.forEach((traffic) => {
    traffic.el.style.setProperty('--traffic-scale', boat.spriteScale);
  });
}

function isFishingHoldFull() {
  return state.mission?.kind === 'fishing' && (state.mission.caught || 0) >= state.mission.amount;
}

function updatePortState() {
  const port = findDockedPort();
  const previousPort = state.currentPortId;
  state.currentPortId = port ? port.id : null;

  const canCompleteMission = state.mission && state.mission.to === port?.id && (state.mission.kind !== 'fishing' || isFishingHoldFull());
  if (port && canCompleteMission) {
    completeMission();
  } else if (port && state.mission?.kind === 'fishing' && state.mission.to === port.id && !isFishingHoldFull()) {
    state.dockOpen = false;
    const now = performance.now();
    if (now - state.lastMissionWarning > 2500) {
      state.lastMissionWarning = now;
      showToast('Llena el pesquero antes de entregar.');
    }
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

function gpsTarget() {
  if (state.mission) {
    const target = getPort(state.mission.to);
    return {
      name: target.name,
      latLng: getPortLatLng(target),
      active: true,
      routeTitle: `Ruta a ${target.name}`,
    };
  }

  const nearest = nearestPort();
  if (!nearest) {
    return null;
  }
  return {
    name: nearest.port.name,
    latLng: getPortLatLng(nearest.port),
    active: false,
    routeTitle: `Puerto más cercano: ${nearest.port.name}`,
  };
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
  } else if (state.grounded) {
    zoneLabel.textContent = 'Varado';
  } else {
    zoneLabel.textContent = state.lastWater ? 'Agua abierta' : 'Costa';
  }

  const target = gpsTarget();
  if (state.mission && target) {
    const destinationName = getPort(state.mission.to).name;
    const distanceKm = distanceMeters(state.boatLatLng, target.latLng) / 1000;
    const cargoText = state.mission.kind === 'fishing' && !isFishingHoldFull()
      ? `${Math.floor(state.mission.caught || 0)}/${state.mission.amount} ${state.mission.type} · pescando`
      : `${state.mission.amount} ${state.mission.type} → ${destinationName}`;
    cargoLabel.textContent = cargoText;
    gps.classList.add('is-active');
    gpsLabel.textContent = state.mission.kind === 'fishing' && !isFishingHoldFull()
      ? `${destinationName} · llena bodega`
      : `${target.name} · ${distanceKm.toFixed(1)} km`;
  } else {
    cargoLabel.textContent = `Cap. ${boat.capacity} ${boat.cargoType} · ${(boat.maxSpeed * 1.94384).toFixed(0)} kn`;
    gps.classList.remove('is-active');
    gpsLabel.textContent = target ? `${target.name} cerca` : 'Sin destino';
  }

  if (target) {
    const targetBearing = bearingTo(state.boatLatLng, target.latLng);
    const relativeBearing = wrapDegrees(targetBearing - state.heading - 90);
    gpsArrow.style.transform = `rotate(${relativeBearing}deg)`;
  } else {
    gpsArrow.style.transform = 'rotate(-90deg)';
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

function fishIconHtml(frame = 1) {
  return `<img src="assets/fish/fish-${frame}.png" alt="">`;
}

function makeFishMarker(school) {
  const icon = L.divIcon({
    className: 'fish-marker',
    html: fishIconHtml(school.frame),
    iconSize: [54, 54],
    iconAnchor: [27, 27],
  });
  return L.marker(school.latLng, { icon }).bindTooltip(`${school.amount} pescado`, { direction: 'top', opacity: 0.92 });
}

function renderFishSchools() {
  fishLayer.clearLayers();
  state.fishSchools.forEach((school) => {
    school.marker = makeFishMarker(school);
    school.marker.addTo(fishLayer);
  });
}

function clearFishSchools() {
  state.fishSchools = [];
  fishLayer.clearLayers();
}

async function spawnFishSchool(now) {
  const speedRatio = clamp(Math.abs(currentSpeedMps()) / Math.max(1, getBoat().maxSpeed), 0, 1);
  const chance = 0.16 + speedRatio * 0.28;
  if (Math.random() > chance || state.fishSchools.length >= FISH_SCHOOL_MAX) {
    return;
  }

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const ahead = state.velocityMps >= 0 ? state.heading : wrapDegrees(state.heading + 180);
    const angle = wrapDegrees(ahead + (Math.random() - 0.5) * 115);
    const distance = 520 + Math.random() * 1150;
    const latLng = latLngFromDistance(state.boatLatLng, angle, distance);
    const tooCloseToPort = allPorts().some((port) => distanceMeters(latLng, getPortLatLng(port)) < port.radius + 360);
    const tooCloseToFish = state.fishSchools.some((school) => distanceMeters(latLng, school.latLng) < 520);
    if (!tooCloseToPort && !tooCloseToFish && await isWater(latLng)) {
      state.fishSchools.push({
        id: `fish-${Math.round(now)}-${Math.round(Math.random() * 99999)}`,
        latLng,
        amount: 8 + Math.floor(Math.random() * 13),
        frame: 1 + Math.floor(Math.random() * 4),
        createdAt: now,
      });
      renderFishSchools();
      return;
    }
  }
}

async function updateFishing(deltaSeconds, now) {
  if (state.mission?.kind !== 'fishing') {
    if (state.fishSchools.length) {
      clearFishSchools();
    }
    return;
  }

  if (isFishingHoldFull()) {
    if (state.fishSchools.length) {
      clearFishSchools();
    }
    return;
  }

  const beforeCount = state.fishSchools.length;
  state.fishSchools = state.fishSchools.filter((school) => now - school.createdAt < FISH_SCHOOL_TTL_MS);
  if (state.fishSchools.length !== beforeCount) {
    renderFishSchools();
  }

  for (const school of [...state.fishSchools]) {
    if (distanceMeters(state.boatLatLng, school.latLng) <= FISH_PICKUP_RADIUS_M) {
      const remaining = state.mission.amount - (state.mission.caught || 0);
      const caught = Math.min(remaining, school.amount);
      state.mission.caught = Math.min(state.mission.amount, (state.mission.caught || 0) + caught);
      state.fishSchools = state.fishSchools.filter((item) => item.id !== school.id);
      renderFishSchools();
      showToast(`+${caught} pescado (${Math.floor(state.mission.caught)}/${state.mission.amount}).`);
      saveSoon();

      if (isFishingHoldFull()) {
        clearFishSchools();
        showToast(`Bodega llena. Vuelve a ${getPort(state.mission.to).name}.`);
      }
      break;
    }
  }

  if (Math.abs(currentSpeedMps()) > 0.8 && state.lastWater && now - state.lastFishSpawn > FISH_SPAWN_INTERVAL_MS) {
    state.lastFishSpawn = now;
    await spawnFishSchool(now);
  }
}

function trafficBoatTypes() {
  return ['yacht', 'speedboat', 'cargo', 'oceanliner', 'fishing']
    .filter((id) => !(state.boatId === 'fishing' && id === 'fishing'));
}

async function trafficSpawnPoint() {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const distance = 900 + Math.random() * 2300;
    const bearing = Math.random() * 360;
    const latLng = latLngFromDistance(state.boatLatLng, bearing, distance);
    if (await isWater(latLng)) {
      return { latLng, bearing };
    }
  }

  return { latLng: state.boatLatLng, bearing: Math.random() * 360 };
}

async function createTrafficBoat(index) {
  const ids = trafficBoatTypes();
  const boatId = ids[index % ids.length];
  const { latLng, bearing } = await trafficSpawnPoint();
  const heading = wrapDegrees(bearing + 70 + Math.random() * 220);
  const boat = BOATS[boatId];
  const el = document.createElement('img');
  el.className = 'traffic-boat';
  el.src = `${boat.sprite}-1.png`;
  el.alt = '';
  el.style.setProperty('--traffic-scale', getBoat().spriteScale);
  trafficLayer.appendChild(el);
  return {
    id: `traffic-${Date.now()}-${index}-${Math.round(Math.random() * 9999)}`,
    boatId,
    latLng,
    heading,
    speed: boat.maxSpeed * (0.16 + Math.random() * 0.18),
    turn: (Math.random() - 0.5) * 4,
    lastWaterCheck: 0,
    el,
  };
}

async function ensureTrafficBoats() {
  while (state.trafficBoats.length < TRAFFIC_BOAT_COUNT) {
    state.trafficBoats.push(await createTrafficBoat(state.trafficBoats.length));
  }
}

async function respawnTrafficBoat(traffic, index) {
  traffic.el.remove();
  state.trafficBoats[index] = await createTrafficBoat(index);
}

function handleTrafficCollision(traffic, now) {
  const ownRadius = 42 * getBoat().spriteScale;
  const otherRadius = 38 * getBoat().spriteScale;
  if (distanceMeters(state.boatLatLng, traffic.latLng) > ownRadius + otherRadius) {
    return;
  }

  const away = bearingTo(traffic.latLng, state.boatLatLng);
  state.boatLatLng = latLngFromDistance(state.boatLatLng, away, 18);
  map.panTo(state.boatLatLng, { animate: false });
  state.heading = wrapDegrees(away + 18);
  state.velocityMps *= -0.24;
  state.throttle = 0;
  traffic.heading = wrapDegrees(away + 180);
  traffic.speed *= 0.72;

  if (now - state.lastTrafficCollision > TRAFFIC_COLLISION_COOLDOWN_MS) {
    state.lastTrafficCollision = now;
    showToast('Choque con tráfico marítimo. Timón al centro.');
  }
}

async function waterSafeTrafficStep(traffic, distance, now) {
  const next = latLngFromDistance(traffic.latLng, traffic.heading, distance);
  if (now - traffic.lastWaterCheck < TRAFFIC_WATER_SAMPLE_INTERVAL) {
    return next;
  }

  traffic.lastWaterCheck = now;
  if (await isWater(next)) {
    return next;
  }

  const headingOptions = [45, -45, 90, -90, 135, -135, 180];
  for (const offset of headingOptions) {
    const candidateHeading = wrapDegrees(traffic.heading + offset);
    const candidate = latLngFromDistance(traffic.latLng, candidateHeading, distance);
    if (await isWater(candidate)) {
      traffic.heading = candidateHeading;
      traffic.turn *= -0.45;
      return candidate;
    }
  }

  return null;
}

async function updateTrafficBoats(deltaSeconds, now) {
  await ensureTrafficBoats();
  for (let index = 0; index < state.trafficBoats.length; index += 1) {
    const traffic = state.trafficBoats[index];
    traffic.heading = wrapDegrees(traffic.heading + traffic.turn * deltaSeconds);
    const next = await waterSafeTrafficStep(traffic, traffic.speed * deltaSeconds, now);

    if (!next || distanceMeters(state.boatLatLng, traffic.latLng) > TRAFFIC_RESPAWN_DISTANCE_M) {
      await respawnTrafficBoat(traffic, index);
      continue;
    }

    traffic.latLng = next;
    handleTrafficCollision(traffic, now);
  }
  renderTrafficBoats();
}

function renderTrafficBoats() {
  state.trafficBoats.forEach((traffic) => {
    const point = map.latLngToContainerPoint(traffic.latLng);
    const isVisible = point.x > -120 && point.y > -120 && point.x < map.getSize().x + 120 && point.y < map.getSize().y + 120;
    traffic.el.style.display = isVisible ? 'block' : 'none';
    traffic.el.style.transform = `translate(${point.x}px, ${point.y}px) translate(-50%, -50%) rotate(${traffic.heading}deg)`;
  });
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
  const acceleration = targetSpeed === 0 ? 28 : targetSpeed > state.velocityMps ? 18 : 24;
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
    const baseHeading = speedMps >= 0 ? state.heading : wrapDegrees(state.heading + 180);
    const normalNext = latLngFromDistance(state.boatLatLng, baseHeading, Math.abs(speedMps) * deltaSeconds);
    const canSailNormally = await checkNextWater(normalNext) || findDockedPort();
    let next = normalNext;
    let effectiveSpeed = Math.abs(speedMps);

    if (!canSailNormally) {
      state.grounded = true;
      const steer = Math.abs(state.rudder) > 0.08 ? Math.sign(state.rudder) : 1;
      const escapeHeading = wrapDegrees(baseHeading + steer * GROUND_ESCAPE_ANGLE_DEG);
      effectiveSpeed = Math.min(Math.abs(speedMps), boat.maxSpeed * 0.08);
      state.velocityMps = Math.sign(speedMps) * effectiveSpeed;
      next = latLngFromDistance(state.boatLatLng, escapeHeading, effectiveSpeed * deltaSeconds);
    } else {
      state.grounded = false;
    }

    if (effectiveSpeed > 0.01) {
      state.boatLatLng = next;
      map.panTo(next, { animate: false });
      const burn = boat.fuelBurn * FUEL_BURN_MULTIPLIER * Math.max(0.18, Math.abs(state.throttle)) * deltaSeconds * (1 + Math.abs(state.rudder) * 0.22);
      state.fuel = clamp(state.fuel - burn, 0, boat.fuelMax);
      if (state.fuel <= 0.01) {
        state.throttle = 0;
        state.velocityMps = 0;
        showToast('Sin combustible. Busca puerto para repostar.');
      }
    }
  }

  helmWheel.style.transform = `rotate(${state.rudder * 118}deg)`;
  helm.setAttribute('aria-valuenow', state.targetRudder.toFixed(2));
  updatePortState();
  await updateFishing(deltaSeconds, now);
  discoverPortsNearBoat(false);
  await updateTrafficBoats(deltaSeconds, now);
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
  const dx = event.clientX - cx;
  const raw = clamp(dx / (rect.width * 0.42), -1, 1);
  const fineControl = Math.sign(raw) * Math.abs(raw) ** 0.82;
  state.targetRudder = Math.abs(fineControl) < 0.05 ? 0 : fineControl;
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
  }
  saveSoon();
}

function openGpsMap() {
  const target = gpsTarget();
  if (!target) {
    showToast('Todavía no hay puertos cargados.');
    return;
  }

  const destination = target.latLng;
  gpsModal.classList.remove('is-hidden');
  gpsMapTitle.textContent = target.routeTitle;
  gpsMapInfo.textContent = `${distanceMeters(state.boatLatLng, destination).toFixed(0)} m hasta ${target.name}`;

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
    const boundsPoints = [state.boatLatLng, destination];
    const targetPort = state.mission ? getPort(state.mission.to) : null;
    const nearbyPorts = allPorts()
      .filter((port) => port.id !== targetPort?.id)
      .map((port) => ({ port, distance: Math.min(distanceMeters(state.boatLatLng, getPortLatLng(port)), distanceMeters(destination, getPortLatLng(port))) }))
      .filter((item) => item.distance <= OSM_PORT_RADIUS_M)
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 16);

    nearbyPorts.forEach(({ port }) => {
      const portLatLng = getPortLatLng(port);
      boundsPoints.push(portLatLng);
      const marker = L.circleMarker(portLatLng, {
        radius: 4,
        color: '#f5f7ec',
        fillColor: port.source === 'osm' ? '#9fb6bd' : '#f5f7ec',
        fillOpacity: 0.74,
        weight: 1,
      }).bindTooltip(port.name, { direction: 'top', opacity: 0.9 });
      gpsRouteLayer.addLayer(marker);
    });

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
    gpsMap.fitBounds(L.latLngBounds(boundsPoints).pad(0.24), { animate: false });
  }, 80);
}

function closeGpsMap() {
  gpsModal.classList.add('is-hidden');
}

helm.addEventListener('pointerdown', (event) => {
  event.preventDefault();
  helm.classList.add('is-steering');
  helm.setPointerCapture(event.pointerId);
  setRudderFromPointer(event);
});

helm.addEventListener('pointermove', (event) => {
  if (helm.hasPointerCapture(event.pointerId)) {
    event.preventDefault();
    setRudderFromPointer(event);
  }
});

helm.addEventListener('pointerup', (event) => {
  if (helm.hasPointerCapture(event.pointerId)) {
    helm.releasePointerCapture(event.pointerId);
  }
  helm.classList.remove('is-steering');
  state.targetRudder = 0;
});

helm.addEventListener('pointercancel', () => {
  helm.classList.remove('is-steering');
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

map.on('moveend', () => {
  if (!state.started) {
    return;
  }
  const center = map.getCenter();
  const previousPosition = state.boatLatLng;
  state.boatLatLng = center;
  discoverPortsNearBoat(false);
  state.boatLatLng = previousPosition;
  renderTrafficBoats();
});

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
