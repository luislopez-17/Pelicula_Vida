/* Mi Película de Vida con Deezer API
   Permite buscar canciones desde Deezer, elegir una y reproducirla junto a las imágenes.
*/

const state = {
  slides: [],
  audio: null,
  totalDuration: 0,
  playing: false,
  startTime: 0,
  pausedAt: 0,
  audioElement: null,
  raf: null,
};

// DOM
const imageInput = document.getElementById("imageInput");
const audioInput = document.getElementById("audioInput");
const slidesList = document.getElementById("slidesList");
const previewImage = document.getElementById("previewImage");
const previewOverlay = document.getElementById("previewOverlay");
const playBtn = document.getElementById("playBtn");
const stopBtn = document.getElementById("stopBtn");
const exportBtn = document.getElementById("exportBtn");
const saveBtn = document.getElementById("saveBtn");
const loadProjectInput = document.getElementById("loadProjectInput");
const progress = document.getElementById("progress");
const log = document.getElementById("log");
const audioInfo = document.getElementById("audioInfo");
const exportCanvas = document.getElementById("exportCanvas");
const deezerQuery = document.getElementById("deezerQuery");
const deezerSearchBtn = document.getElementById("deezerSearchBtn");
const deezerResults = document.getElementById("deezerResults");
exportCanvas.width = 1280;
exportCanvas.height = 720;

// helpers
function logMsg(msg) {
  log.textContent = msg;
}
function recomputeTotal() {
  state.totalDuration = state.slides.reduce(
    (s, it) => s + Number(it.duration || 3),
    0
  );
}
function formatTime(s) {
  const sec = Math.floor(s % 60).toString().padStart(2, "0");
  const min = Math.floor(s / 60).toString().padStart(2, "0");
  return `${min}:${sec}`;
}

// Render slides
function renderSlides() {
  slidesList.innerHTML = "";
  state.slides.forEach((slide, index) => {
    const el = document.createElement("div");
    el.className = "slide";
    el.draggable = true;
    el.dataset.index = index;

    el.addEventListener("dragstart", (e) => {
      e.dataTransfer.setData("text/plain", String(index));
    });
    el.addEventListener("dragover", (e) => {
      e.preventDefault();
      el.style.outline = "2px dashed #2563eb";
    });
    el.addEventListener("dragleave", () => (el.style.outline = ""));
    el.addEventListener("drop", (e) => {
      e.preventDefault();
      el.style.outline = "";
      const from = Number(e.dataTransfer.getData("text/plain"));
      const to = index;
      if (!Number.isNaN(from)) {
        const item = state.slides.splice(from, 1)[0];
        state.slides.splice(to, 0, item);
        recomputeTotal();
        renderSlides();
      }
    });

    const img = document.createElement("img");
    img.className = "thumb";
    img.src = slide.url;

    const meta = document.createElement("div");
    meta.className = "meta";
    const title = document.createElement("div");
    title.textContent = slide.file?.name || "imagen";

    const controls = document.createElement("div");
    controls.style.display = "flex";
    controls.style.gap = "6px";
    controls.style.alignItems = "center";

    const durationInput = document.createElement("input");
    durationInput.type = "number";
    durationInput.value = slide.duration || 3;
    durationInput.min = 1;
    durationInput.style.width = "64px";
    durationInput.addEventListener("change", () => {
      slide.duration = Number(durationInput.value);
      recomputeTotal();
    });

    const removeBtn = document.createElement("button");
    removeBtn.textContent = "Eliminar";
    removeBtn.addEventListener("click", () => {
      state.slides.splice(index, 1);
      recomputeTotal();
      renderSlides();
    });

    controls.appendChild(durationInput);
    controls.appendChild(removeBtn);
    meta.appendChild(title);
    meta.appendChild(controls);
    el.appendChild(img);
    el.appendChild(meta);
    slidesList.appendChild(el);
  });
}

// Añadir imágenes
imageInput.addEventListener("change", (e) => {
  const files = Array.from(e.target.files || []);
  for (const f of files) {
    if (!f.type.startsWith("image/")) continue;
    const url = URL.createObjectURL(f);
    state.slides.push({ id: crypto.randomUUID(), file: f, url, duration: 3 });
  }
  recomputeTotal();
  renderSlides();
});

// Audio local
audioInput.addEventListener("change", (e) => {
  const f = e.target.files && e.target.files[0];
  if (!f) return;
  if (!f.type.startsWith("audio/")) {
    alert("Formato de audio no soportado");
    return;
  }
  if (state.audio?.url) URL.revokeObjectURL(state.audio.url);
  const url = URL.createObjectURL(f);
  state.audio = { type: "file", file: f, url };
  audioInfo.textContent = `Audio: ${f.name}`;
  if (state.audioElement) state.audioElement.src = url;
});

// 🔍 Búsqueda en Deezer
deezerSearchBtn.addEventListener("click", async () => {
  const query = deezerQuery.value.trim();
  if (!query) return alert("Escribe algo para buscar");
  logMsg("Buscando en Deezer...");

  try {
    const res = await fetch(`https://corsproxy.io/?https://api.deezer.com/search?q=${encodeURIComponent(query)}`);

    const data = await res.json();
    if (!data.data || data.data.length === 0) {
      deezerResults.innerHTML = "<p>No se encontraron resultados.</p>";
      return;
    }

    deezerResults.innerHTML = "";
    data.data.slice(0, 10).forEach((track) => {
      const div = document.createElement("div");
      div.className = "deezer-item";
      div.innerHTML = `
        <img src="${track.album.cover_small}" alt="cover">
        <div class="info">
          <strong>${track.title}</strong><br>
          <span>${track.artist.name}</span>
        </div>
        <button class="use-btn">Usar audio</button>
      `;
      div.querySelector(".use-btn").addEventListener("click", () => {
        useDeezerTrack(track);
      });
      deezerResults.appendChild(div);
    });
    logMsg("Resultados de Deezer listos.");
  } catch (err) {
    logMsg("Error al buscar en Deezer.");
  }
});

// Usar una canción de Deezer
function useDeezerTrack(track) {
  const previewUrl = track.preview; // mp3 de 30 segundos
  state.audio = {
    type: "deezer",
    title: track.title,
    artist: track.artist.name,
    url: previewUrl,
  };
  if (!state.audioElement) state.audioElement = new Audio();
  state.audioElement.src = previewUrl;
  audioInfo.textContent = `🎧 ${track.title} — ${track.artist.name}`;
  logMsg("Canción cargada desde Deezer.");
}

// Reproducción
function buildTimelineMap() {
  const map = [];
  let acc = 0;
  for (const s of state.slides) {
    const dur = Number(s.duration || 3);
    map.push({ start: acc, end: acc + dur, slide: s });
    acc += dur;
  }
  return { map, total: acc };
}

function updatePreviewAt(t) {
  const { map, total } = buildTimelineMap();
  if (total === 0) return;
  let found = map.find((m) => t >= m.start && t < m.end);
  if (!found && t >= total) found = map[map.length - 1];
  if (!found) return;
  previewImage.src = found.slide.url;
  previewOverlay.textContent = `${formatTime(t)} / ${formatTime(total)}`;
}

function startPlayback() {
  if (state.slides.length === 0) return alert("Añade imágenes primero");
  recomputeTotal();
  const { total } = buildTimelineMap();
  stopPlayback();
  state.playing = true;
  state.startTime = performance.now();

  if (!state.audioElement) state.audioElement = new Audio();

  if (state.audio?.url) {
    state.audioElement.src = state.audio.url;
    state.audioElement.play().catch(() => {});
  }

  const tick = () => {
    if (!state.playing) return;
    const elapsed = (performance.now() - state.startTime) / 1000;
    updatePreviewAt(elapsed);
    state.raf = requestAnimationFrame(tick);
    if (elapsed >= total) stopPlayback();
  };
  tick();
}

function stopPlayback() {
  state.playing = false;
  if (state.raf) cancelAnimationFrame(state.raf);
  if (state.audioElement) {
    try {
      state.audioElement.pause();
      state.audioElement.currentTime = 0;
    } catch {}
  }
}

playBtn.addEventListener("click", startPlayback);
stopBtn.addEventListener("click", stopPlayback);

recomputeTotal();
renderSlides();
logMsg("Listo.");
