const NORMAL = JSON.parse(document.getElementById("normal-data").textContent);

const PALETTE = {
  heart: "#d4ff00",   // Lime Green matching OBSIDIAN PULSE
  spo2: "#ee2424",    // Crimson Red matching SpO2 sensor
  sys: "#30b3d4",     // Electric Blue
  dia: "#a855f7",     // Neon Purple
  sleep: "#30b3d4",   // Electric Blue
  ref: "rgba(148, 163, 184, 0.45)",
  muted: "#94a3b8",
  grid: "rgba(255, 255, 255, 0.07)",
  ink: "#0f172a",
};

Chart.defaults.font.family = "'Inter', system-ui, sans-serif";
Chart.defaults.font.size = 11;
Chart.defaults.color = PALETTE.muted;
Chart.defaults.borderColor = PALETTE.grid;

let days = 7;

function makeChart(id, { type = "line", series, refs = [], min, max }) {
  const datasets = series.map((s) =>
    type === "bar"
      ? { label: s.label, data: [], backgroundColor: s.color, borderRadius: 4, maxBarThickness: 18 }
      : {
          label: s.label,
          data: [],
          borderColor: s.color,
          backgroundColor: s.color,
          borderWidth: 2,
          pointRadius: 2,
          pointHoverRadius: 4,
          tension: 0.35,
          spanGaps: true,
        }
  );

  // Dashed reference lines mark the healthy range boundaries
  refs.forEach((value) =>
    datasets.push({
      type: "line",
      label: "Normal",
      isRef: true,
      refValue: value,
      data: [],
      borderColor: PALETTE.ref,
      borderDash: [4, 4],
      borderWidth: 1,
      pointRadius: 0,
      fill: false,
    })
  );

  return new Chart(document.getElementById(id), {
    type,
    data: { labels: [], datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 250 },
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: {
          display: series.length > 1,
          position: "top",
          align: "end",
          labels: {
            usePointStyle: true,
            boxWidth: 8,
            font: { size: 10 },
            filter: (item, data) => !data.datasets[item.datasetIndex].isRef,
          },
        },
        tooltip: {
          backgroundColor: PALETTE.ink,
          padding: 8,
          cornerRadius: 6,
          displayColors: false,
          titleFont: { size: 11 },
          bodyFont: { size: 12, weight: "600" },
          filter: (item) => !item.dataset.isRef,
        },
      },
      scales: {
        x: {
          grid: { display: false },
          border: { display: false },
          ticks: { maxTicksLimit: 6, maxRotation: 0, font: { size: 10 } },
        },
        y: {
          min,
          max,
          border: { display: false },
          ticks: { maxTicksLimit: 4, font: { size: 10 } },
        },
      },
    },
  });
}

const charts = {
  hr: makeChart("hr", {
    series: [{ label: "Heart rate", color: PALETTE.heart }],
    refs: [NORMAL.heart_rate.min, NORMAL.heart_rate.max],
    min: 40,
    max: 160,
  }),
  spo2: makeChart("spo2", {
    series: [{ label: "Blood oxygen", color: PALETTE.spo2 }],
    refs: [NORMAL.spo2.min],
    min: 85,
    max: 100,
  }),
  bp: makeChart("bp", {
    series: [
      { label: "Systolic", color: PALETTE.sys },
      { label: "Diastolic", color: PALETTE.dia },
    ],
    refs: [NORMAL.systolic.max, NORMAL.diastolic.max],
    min: 40,
    max: 180,
  }),
  sleep: makeChart("sleep", {
    type: "bar",
    series: [{ label: "Sleep", color: PALETTE.sleep }],
    refs: [NORMAL.sleep_hours.min, NORMAL.sleep_hours.max],
    min: 0,
    max: 12,
  }),
};

function setData(chart, labels, seriesValues) {
  chart.data.labels = labels;
  chart.data.datasets.forEach((ds, i) => {
    ds.data = ds.isRef ? labels.map(() => ds.refValue) : seriesValues[i];
  });
  chart.update();
}

function formatTime(ts) {
  const date = new Date(ts);
  return days <= 1
    ? date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : date.toLocaleDateString([], { month: "short", day: "numeric" });
}

function classify(value, range) {
  if (value == null) return { text: "No data", tone: "" };
  if (value < range.min) return { text: "Below range", tone: "low" };
  if (value > range.max) return { text: "Above range", tone: "high" };
  return { text: "Normal", tone: "ok" };
}

function setStat(key, valueText, state) {
  const el = document.querySelector(`[data-key="${key}"]`);
  if (!el) return;
  el.querySelector(".value").textContent = valueText;
  const status = el.querySelector(".status");
  status.textContent = state.text;
  status.dataset.tone = state.tone;
}

function renderStats(latest) {
  const hr = latest.heart_rate?.value;
  const spo2 = latest.spo2?.value;
  const sys = latest.systolic?.value;
  const dia = latest.diastolic?.value;
  const sleep = latest.sleep_hours?.value;

  setStat("heart_rate", hr ?? "--", classify(hr, NORMAL.heart_rate));
  setStat("spo2", spo2 ?? "--", classify(spo2, NORMAL.spo2));
  setStat(
    "bp",
    `${sys ?? "--"}/${dia ?? "--"}`,
    [classify(sys, NORMAL.systolic), classify(dia, NORMAL.diastolic)].find((s) => s.tone !== "ok") ??
      classify(sys, NORMAL.systolic)
  );
  setStat("sleep_hours", sleep ?? "--", classify(sleep, NORMAL.sleep_hours));
}

// Push real-time slider adjustments directly onto the end of the active graphs
function pushLiveChartPoint(chart, valuesArray) {
  if (!chart.data.labels.length) return;
  const lastIdx = chart.data.labels.length - 1;
  chart.data.labels[lastIdx] = "Now";
  let seriesIdx = 0;
  chart.data.datasets.forEach((ds) => {
    if (!ds.isRef) {
      ds.data[lastIdx] = valuesArray[seriesIdx++];
    }
  });
  chart.update("none");
}

// Fallback generator so charts render immediately even if Flask API is offline
function generateFallbackHistory(numDays) {
  const points = numDays === 1 ? 8 : Math.min(numDays, 14);
  const now = Date.now();
  const stepMs = numDays === 1 ? 3 * 3600 * 1000 : 24 * 3600 * 1000;
  const rows = [];

  for (let i = points - 1; i >= 0; i--) {
    const isLast = i === 0;
    rows.push({
      recorded_at: new Date(now - i * stepMs).toISOString(),
      heart_rate: isLast ? watchState.heartRate : Math.round(72 + Math.sin(i) * 12),
      spo2: isLast ? watchState.spo2 : Math.round(97 + Math.cos(i) * 2),
      systolic: isLast ? watchState.systolic : Math.round(118 + Math.sin(i) * 6),
      diastolic: isLast ? watchState.diastolic : Math.round(78 + Math.cos(i) * 4),
      sleep_hours: isLast ? watchState.sleepHours : Number((7.2 + Math.sin(i) * 1.1).toFixed(1)),
    });
  }
  return rows;
}

async function load() {
  try {
    const [rows, latest] = await Promise.all([
      fetch(`/api/readings?days=${days}`).then((r) => {
        if (!r.ok) throw new Error("API unavailable");
        return r.json();
      }),
      fetch("/api/latest").then((r) => {
        if (!r.ok) throw new Error("API unavailable");
        return r.json();
      }),
    ]);

    const labels = rows.map((r) => formatTime(r.recorded_at));
    setData(charts.hr, labels, [rows.map((r) => r.heart_rate)]);
    setData(charts.spo2, labels, [rows.map((r) => r.spo2)]);
    setData(charts.bp, labels, [rows.map((r) => r.systolic), rows.map((r) => r.diastolic)]);
    setData(charts.sleep, labels, [rows.map((r) => r.sleep_hours)]);
    renderStats(latest);
  } catch (err) {
    // Render simulated history when running standalone without Flask backend
    const rows = generateFallbackHistory(days);
    const labels = rows.map((r) => formatTime(r.recorded_at));
    setData(charts.hr, labels, [rows.map((r) => r.heart_rate)]);
    setData(charts.spo2, labels, [rows.map((r) => r.spo2)]);
    setData(charts.bp, labels, [rows.map((r) => r.systolic), rows.map((r) => r.diastolic)]);
    setData(charts.sleep, labels, [rows.map((r) => r.sleep_hours)]);
  }
}

document.querySelectorAll(".range button").forEach((btn) => {
  btn.addEventListener("click", () => {
    document
      .querySelectorAll(".range button")
      .forEach((b) => b.classList.toggle("active", b === btn));
    days = Number(btn.dataset.days);
    load();
  });
});

const watchState = {
  activeMode: "heart",
  heartRate: 85,
  systolic: 120,
  diastolic: 80,
  spo2: 98,
  steps: 6420,
  sleepHours: 7.5,
  isFlippedToBack: false
};

window.ObsidianPulseAPI = {
  getTelemetryPayload() {
    return {
      heart_rate_bpm: watchState.heartRate,
      blood_pressure: {
        systolic: watchState.systolic,
        diastolic: watchState.diastolic
      },
      spo2_percent: watchState.spo2,
      steps_count: watchState.steps,
      sleep_hours: watchState.sleepHours,
      active_sensor_mode: watchState.activeMode
    };
  },

  updateFromBackend(data) {
    if (data.heart_rate_bpm !== undefined) {
      hrSlider.value = data.heart_rate_bpm;
      hrSlider.dispatchEvent(new Event("input"));
    }
    if (data.systolic !== undefined && data.diastolic !== undefined) {
      sysSlider.value = data.systolic;
      diaSlider.value = data.diastolic;
      updateBP();
    }
    if (data.spo2_percent !== undefined) {
      spo2Slider.value = data.spo2_percent;
      spo2Slider.dispatchEvent(new Event("input"));
    }
    if (data.steps_count !== undefined) {
      updateSteps(data.steps_count);
    }
    if (data.sleep_hours !== undefined) {
      sleepSlider.value = data.sleep_hours;
      sleepSlider.dispatchEvent(new Event("input"));
    }
  }
};

const container = document.getElementById("watch3dContainer");
const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(
  40,
  container.clientWidth / container.clientHeight,
  0.1,
  100
);
camera.position.set(0, 0, 7.2);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setSize(container.clientWidth, container.clientHeight);
renderer.setPixelRatio(window.devicePixelRatio);
container.appendChild(renderer.domElement);

const ambientLight = new THREE.AmbientLight(0xffffff, 0.85);
scene.add(ambientLight);

const blueRimLight = new THREE.PointLight(0x00d2ff, 2.2, 20);
blueRimLight.position.set(4, 4, 5);
scene.add(blueRimLight);

const limeRimLight = new THREE.PointLight(0x39ff14, 1.2, 20);
limeRimLight.position.set(-4, -3, 4);
scene.add(limeRimLight);

const watchGroup = new THREE.Group();
scene.add(watchGroup);

const caseGeometry = new THREE.CylinderGeometry(1.75, 1.75, 0.48, 64);
caseGeometry.rotateX(Math.PI / 2);
const caseMaterial = new THREE.MeshStandardMaterial({
  color: 0x111827,
  metalness: 0.85,
  roughness: 0.25
});
const watchCase = new THREE.Mesh(caseGeometry, caseMaterial);
watchGroup.add(watchCase);

const bezelGeometry = new THREE.TorusGeometry(1.72, 0.06, 24, 64);
const bezelMaterial = new THREE.MeshStandardMaterial({
  color: 0x00d2ff,
  emissive: 0x006688,
  metalness: 0.7,
  roughness: 0.2
});
const bezelRing = new THREE.Mesh(bezelGeometry, bezelMaterial);
bezelRing.position.z = 0.24;
watchGroup.add(bezelRing);

const crownGeometry = new THREE.CylinderGeometry(0.16, 0.16, 0.28, 24);
crownGeometry.rotateZ(Math.PI / 2);
const crownMesh = new THREE.Mesh(crownGeometry, bezelMaterial);
crownMesh.position.set(1.85, 0.2, 0);
watchGroup.add(crownMesh);

const strapMaterial = new THREE.MeshStandardMaterial({
  color: 0x090d16,
  roughness: 0.7
});
const topStrap = new THREE.Mesh(new THREE.BoxGeometry(1.3, 1.6, 0.18), strapMaterial);
topStrap.position.set(0, 2.3, -0.05);
topStrap.rotation.x = 0.18;
watchGroup.add(topStrap);

const bottomStrap = new THREE.Mesh(new THREE.BoxGeometry(1.3, 1.6, 0.18), strapMaterial);
bottomStrap.position.set(0, -2.3, -0.05);
bottomStrap.rotation.x = -0.18;
watchGroup.add(bottomStrap);

const dialCanvas = document.createElement("canvas");
dialCanvas.width = 512;
dialCanvas.height = 512;
const dialCtx = dialCanvas.getContext("2d");

const dialTexture = new THREE.CanvasTexture(dialCanvas);
const screenGeometry = new THREE.CircleGeometry(1.64, 64);
const screenMaterial = new THREE.MeshBasicMaterial({ map: dialTexture });
const frontScreen = new THREE.Mesh(screenGeometry, screenMaterial);
frontScreen.position.z = 0.255;
watchGroup.add(frontScreen);

function drawWatchDial() {
  const ctx = dialCtx;
  ctx.clearRect(0, 0, 512, 512);

  ctx.fillStyle = "#04070f";
  ctx.beginPath();
  ctx.arc(256, 256, 256, 0, Math.PI * 2);
  ctx.fill();

  const ringColor = watchState.activeMode === "spo2" ? "#ff2a6d" : "#00d2ff";
  ctx.strokeStyle = ringColor;
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.arc(256, 256, 232, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = "#94a3b8";
  ctx.font = "bold 20px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("PULSECORE X1", 256, 95);

  let title = "";
  let mainText = "";
  let subText = "";
  let accent = "#39ff14";

  switch (watchState.activeMode) {
    case "heart":
      title = "HEART RATE";
      mainText = `${watchState.heartRate}`;
      subText = "BPM • GREEN PPG";
      accent = "#39ff14";
      break;
    case "spo2":
      title = "BLOOD OXYGEN";
      mainText = `${watchState.spo2}%`;
      subText = "SpO2 • RED LED ACTIVE";
      accent = "#ff2a6d";
      break;
    case "bp":
      title = "BLOOD PRESSURE";
      mainText = `${watchState.systolic}/${watchState.diastolic}`;
      subText = "mmHg • ESTIMATED";
      accent = "#00d2ff";
      break;
    case "steps":
      title = "DAILY STEPS";
      mainText = watchState.steps.toLocaleString();
      subText = "GOAL: 10,000";
      accent = "#39ff14";
      break;
    case "sleep":
      title = "SLEEP DURATION";
      mainText = `${watchState.sleepHours}h`;
      subText = "RESTORATIVE CYCLE";
      accent = "#00d2ff";
      break;
  }

  ctx.fillStyle = accent;
  ctx.font = "bold 24px sans-serif";
  ctx.fillText(title, 256, 175);

  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 88px sans-serif";
  ctx.fillText(mainText, 256, 280);

  ctx.fillStyle = accent;
  ctx.font = "bold 22px sans-serif";
  ctx.fillText(subText, 256, 355);

  dialTexture.needsUpdate = true;
}

const backPlateGeom = new THREE.CircleGeometry(1.62, 64);
backPlateGeom.rotateY(Math.PI);
const backPlateMat = new THREE.MeshStandardMaterial({
  color: 0x070b14,
  roughness: 0.3,
  metalness: 0.6
});
const backPlate = new THREE.Mesh(backPlateGeom, backPlateMat);
backPlate.position.z = -0.25;
watchGroup.add(backPlate);

const sensorDomeGeom = new THREE.CircleGeometry(0.75, 48);
sensorDomeGeom.rotateY(Math.PI);
const sensorDomeMat = new THREE.MeshBasicMaterial({ color: 0x39ff14 });
const sensorDome = new THREE.Mesh(sensorDomeGeom, sensorDomeMat);
sensorDome.position.z = -0.26;
watchGroup.add(sensorDome);

const sensorGlowLight = new THREE.PointLight(0x39ff14, 3.5, 6);
sensorGlowLight.position.set(0, 0, -1.2);
watchGroup.add(sensorGlowLight);

function updateSensorLightColor() {
  const ledBadge = document.getElementById("ledStatusText");
  if (watchState.activeMode === "spo2") {
    sensorDomeMat.color.setHex(0xff2a6d);
    sensorGlowLight.color.setHex(0xff2a6d);
    ledBadge.textContent = "Active Sensor: 660nm RED LED (SpO2)";
    ledBadge.classList.add("red-mode");
  } else {
    sensorDomeMat.color.setHex(0x39ff14);
    sensorGlowLight.color.setHex(0x39ff14);
    ledBadge.textContent = "Active Sensor: 530nm GREEN LED";
    ledBadge.classList.remove("red-mode");
  }
}

let isDragging = false;
let previousMousePosition = { x: 0, y: 0 };

container.addEventListener("mousedown", (e) => {
  isDragging = true;
  previousMousePosition = { x: e.clientX, y: e.clientY };
});

window.addEventListener("mouseup", () => {
  isDragging = false;
});

window.addEventListener("mousemove", (e) => {
  if (!isDragging) return;
  const deltaX = e.clientX - previousMousePosition.x;
  const deltaY = e.clientY - previousMousePosition.y;

  watchGroup.rotation.y += deltaX * 0.012;
  watchGroup.rotation.x += deltaY * 0.008;
  previousMousePosition = { x: e.clientX, y: e.clientY };
});

container.addEventListener("touchstart", (e) => {
  isDragging = true;
  previousMousePosition = { x: e.touches[0].clientX, y: e.touches[0].clientY };
});

window.addEventListener("touchend", () => {
  isDragging = false;
});

window.addEventListener("touchmove", (e) => {
  if (!isDragging) return;
  const deltaX = e.touches[0].clientX - previousMousePosition.x;
  const deltaY = e.touches[0].clientY - previousMousePosition.y;

  watchGroup.rotation.y += deltaX * 0.012;
  watchGroup.rotation.x += deltaY * 0.008;
  previousMousePosition = { x: e.touches[0].clientX, y: e.touches[0].clientY };
});

document.getElementById("flipWatchBtn").addEventListener("click", () => {
  watchState.isFlippedToBack = !watchState.isFlippedToBack;
  watchGroup.rotation.y = watchState.isFlippedToBack ? Math.PI : 0;
  watchGroup.rotation.x = 0;
});

/* =========================================================
   4. INTERACTIVE SLIDERS & LIVE CHART SYNC
   ========================================================= */
function setActiveMode(mode) {
  watchState.activeMode = mode;
  document.querySelectorAll(".mode-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.mode === mode);
  });
  updateSensorLightColor();
  drawWatchDial();
}

document.querySelectorAll(".mode-btn").forEach((btn) => {
  btn.addEventListener("click", () => setActiveMode(btn.dataset.mode));
});

// Heart Rate Slider
const hrSlider = document.getElementById("hrSlider");
hrSlider.addEventListener("input", (e) => {
  watchState.heartRate = Number(e.target.value);
  const state = classify(watchState.heartRate, NORMAL.heart_rate);
  setStat("heart_rate", watchState.heartRate, state);
  pushLiveChartPoint(charts.hr, [watchState.heartRate]);
  setActiveMode("heart");
});

// Blood Pressure Sliders
const sysSlider = document.getElementById("sysSlider");
const diaSlider = document.getElementById("diaSlider");

function updateBP() {
  watchState.systolic = Number(sysSlider.value);
  watchState.diastolic = Number(diaSlider.value);
  document.getElementById("sysLabel").textContent = watchState.systolic;
  document.getElementById("diaLabel").textContent = watchState.diastolic;

  const state =
    [classify(watchState.systolic, NORMAL.systolic), classify(watchState.diastolic, NORMAL.diastolic)]
      .find((s) => s.tone !== "ok") ?? classify(watchState.systolic, NORMAL.systolic);

  setStat("bp", `${watchState.systolic}/${watchState.diastolic}`, state);
  pushLiveChartPoint(charts.bp, [watchState.systolic, watchState.diastolic]);
  setActiveMode("bp");
}
sysSlider.addEventListener("input", updateBP);
diaSlider.addEventListener("input", updateBP);

// SpO2 Slider
const spo2Slider = document.getElementById("spo2Slider");
spo2Slider.addEventListener("input", (e) => {
  watchState.spo2 = Number(e.target.value);
  document.getElementById("spo2Bar").style.width = `${watchState.spo2}%`;
  const state = classify(watchState.spo2, NORMAL.spo2);
  setStat("spo2", watchState.spo2, state);
  pushLiveChartPoint(charts.spo2, [watchState.spo2]);
  setActiveMode("spo2");
});

document.getElementById("activateSpo2Btn").addEventListener("click", () => {
  setActiveMode("spo2");
  watchState.isFlippedToBack = true;
  watchGroup.rotation.y = Math.PI;
});

// Step Counter
const stepsSlider = document.getElementById("stepsSlider");
function updateSteps(newSteps) {
  watchState.steps = Math.max(0, Math.min(25000, newSteps));
  stepsSlider.value = watchState.steps;
  document.getElementById("stepsValue").textContent = watchState.steps.toLocaleString();
  document.getElementById("distValue").textContent = `${(watchState.steps * 0.00075).toFixed(1)} km`;
  document.getElementById("calValue").textContent = `${Math.round(watchState.steps * 0.04)} kcal`;
  setActiveMode("steps");
}

stepsSlider.addEventListener("input", (e) => updateSteps(Number(e.target.value)));
document.getElementById("addStepsBtn").addEventListener("click", () => updateSteps(watchState.steps + 500));
document.getElementById("subStepsBtn").addEventListener("click", () => updateSteps(watchState.steps - 500));

// Sleep Slider
const sleepSlider = document.getElementById("sleepSlider");
sleepSlider.addEventListener("input", (e) => {
  watchState.sleepHours = Number(e.target.value);
  const state = classify(watchState.sleepHours, NORMAL.sleep_hours);
  setStat("sleep_hours", watchState.sleepHours.toFixed(1), state);
  pushLiveChartPoint(charts.sleep, [watchState.sleepHours]);
  setActiveMode("sleep");
});

// Modal Controls
const widgetModal = document.getElementById("widgetModal");
document.getElementById("manageWidgetsBtn").addEventListener("click", () => {
  widgetModal.classList.remove("hidden");
});
document.getElementById("closeModalBtn").addEventListener("click", () => {
  widgetModal.classList.add("hidden");
});
document.getElementById("doneModalBtn").addEventListener("click", () => {
  widgetModal.classList.add("hidden");
});

document.querySelectorAll(".widget-toggle").forEach((checkbox) => {
  checkbox.addEventListener("change", (e) => {
    const widgetName = e.target.value;
    const card = document.getElementById(`widget-${widgetName}`);
    if (card) {
      card.classList.toggle("hidden-widget", !e.target.checked);
    }
  });
});

// System Logic Modal Controls
function openLogicModal() {
  document.getElementById("logicModal").style.display = "flex";
}

function closeLogicModal() {
  document.getElementById("logicModal").style.display = "none";
}

function outsideClick(event) {
  if (event.target.id === "logicModal") {
    closeLogicModal();
  }
}

document.addEventListener("keydown", function (event) {
  if (event.key === "Escape") {
    closeLogicModal();
  }
});

/* =========================================================
   5. RENDER LOOP & INITIALIZATION
   ========================================================= */
let clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);

  const elapsed = clock.getElapsedTime();
  const pulseFrequency = (watchState.heartRate / 60) * Math.PI * 2;
  const pulseIntensity = 2.0 + Math.sin(elapsed * pulseFrequency) * 1.6;
  sensorGlowLight.intensity = Math.max(0.5, pulseIntensity);

  renderer.render(scene, camera);
}

window.addEventListener("resize", () => {
  if (!container.clientWidth || !container.clientHeight) return;
  camera.aspect = container.clientWidth / container.clientHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(container.clientWidth, container.clientHeight);
});

// Initialize 3D Watch, Charts, and Backend Polling
drawWatchDial();
updateSensorLightColor();
animate();
load();
setInterval(load, 30000);

fetch("http://127.0.0.1:5000/api/sensor_data")
  .then((response) => response.json())
  .then((data) => {
    window.ObsidianPulseAPI.updateFromBackend(data);
  })
  .catch(() => {
    // Running in standalone simulation mode
  });