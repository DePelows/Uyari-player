// ============================================================
// Uyari Player — Reproductor de audio
// - Reproducción bajo demanda desde FileSystemFileHandle
// - Throttle de timeupdate (250ms) para ahorrar batería
// - Manejo robusto de object URLs (revocación)
// - Media Session API
// ============================================================

const audioElement = document.getElementById("audioElement");
const btnPlayPause = document.getElementById("btnPlayPause");
const playIcon = document.getElementById("playIcon");
const pauseIcon = document.getElementById("pauseIcon");
const btnNext = document.getElementById("btnNext");
const btnPrev = document.getElementById("btnPrev");
const btnShuffle = document.getElementById("btnShuffle");
const btnRepeat = document.getElementById("btnRepeat");
const repeatBadgeOne = document.getElementById("repeatBadgeOne");
const timelineBar = document.getElementById("timelineBar");
const timelineFill = document.getElementById("timelineFill");
const currentTimeLabel = document.getElementById("currentTime");
const totalDurationLabel = document.getElementById("totalDuration");
const volumeSlider = document.getElementById("volumeSlider");

// Estado del reproductor
let isShuffle = false;
let repeatMode = "off"; // "off" | "all" | "one"
window.currentAudioUrl = null; // expuesto globalmente para que clearLibrary lo revoque

// Throttle de UI
let lastUITime = 0;

// ============================================================
// Utilidades
// ============================================================

function formatTime(seconds) {
  if (isNaN(seconds) || !isFinite(seconds)) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s < 10 ? "0" : ""}${s}`;
}

// Pausa el audio (para usar desde video)
window.pauseAudioPlayer = function () {
  if (audioElement && !audioElement.paused) {
    audioElement.pause();
  }
};

// Revoca la URL anterior si existe
function revokeCurrentAudioUrl() {
  if (window.currentAudioUrl) {
    try {
      URL.revokeObjectURL(window.currentAudioUrl);
    } catch (e) {
      // Ignorar
    }
    window.currentAudioUrl = null;
  }
}

// ============================================================
// loadTrack — carga una pista por índice y opcionalmente reproduce
// ============================================================
window.loadTrack = async function (index, autoPlay = false) {
  if (index < 0 || index >= window.App.playlist.length) return;

  window.App.currentIndex = index;
  const track = window.App.playlist[index];

  // 1. Revocar URL anterior
  revokeCurrentAudioUrl();

  // 2. Obtener el archivo (desde handle o desde blob en memoria)
  let file = null;

  // Si ya tenemos el blob en memoria (cargado justo tras seleccionar carpeta)
  if (track.fileBlob instanceof Blob) {
    file = track.fileBlob;
  } else {
    // Pedir el archivo al handle bajo demanda
    try {
      file = await getFileFromHandle(track.type, track.path);
    } catch (err) {
      console.warn("[Player] No se pudo obtener el archivo:", track.path, err);
      showReconnectBanner();
      return;
    }
  }

  if (!file) {
    console.warn("[Player] Archivo no disponible:", track.name);
    showReconnectBanner();
    return;
  }

  // 3. Crear object URL y asignar
  try {
    window.currentAudioUrl = URL.createObjectURL(file);
    audioElement.src = window.currentAudioUrl;
  } catch (err) {
    console.error("[Player] Error al crear object URL:", err);
    return;
  }

  // 4. Auto-play si aplica
  if (autoPlay) {
    const playPromise = audioElement.play();
    if (playPromise !== undefined) {
      playPromise.catch((err) => {
        console.warn("[Player] play() falló:", err.name, err.message);
        // NotAllowedError = autoplay bloqueado
        if (err.name === "NotAllowedError") {
          console.warn("[Player] Autoplay bloqueado por el navegador");
        }
      });
    }
  }

  // 5. Media Session
  updateMediaSession(track);

  // 6. Letras
  window.currentLyricIndex = -1;
  if (track.lrcContent) {
    window.App.parsedLyrics = window.parseLRC(track.lrcContent);
    window.renderLyricsView();
  } else {
    window.App.parsedLyrics = [];
    const ls = document.getElementById("lyricsScroll");
    if (ls) ls.innerHTML = `<p class="no-lyrics">No hay archivo .lrc para esta pista.</p>`;
    const exp = document.getElementById("expandedLyricsScroll");
    if (exp) exp.innerHTML = `<p class="no-lyrics">No hay archivo .lrc para esta pista.</p>`;
  }

  // 7. UI
  window.updatePlayerUI(track);
  if (window.renderTrackList) window.renderTrackList();
};

// ============================================================
// getFileFromHandle — obtiene un File desde el handle guardado
// ============================================================
async function getFileFromHandle(type, relativePath) {
  const handleId = type === "video" ? "video" : "music";
  const rootHandle = await window.loadHandleFromDB(handleId);
  if (!rootHandle) return null;

  // Verificar permiso
  const perm = await rootHandle.queryPermission({ mode: "read" });
  if (perm !== "granted") {
    const req = await rootHandle.requestPermission({ mode: "read" });
    if (req !== "granted") return null;
  }

  // Navegar por el path relativo
  const parts = relativePath.split("/").filter((p) => p.length > 0);
  // Si el primer segmento coincide con el nombre de la carpeta raíz, quitarlo
  if (parts.length > 0 && parts[0] === rootHandle.name) {
    parts.shift();
  }

  if (parts.length === 0) return null;

  let currentDir = rootHandle;
  try {
    for (let i = 0; i < parts.length - 1; i++) {
      currentDir = await currentDir.getDirectoryHandle(parts[i]);
    }
    const fileHandle = await currentDir.getFileHandle(parts[parts.length - 1]);
    return await fileHandle.getFile();
  } catch (err) {
    console.warn("[Player] Error navegando handle:", relativePath, err);
    return null;
  }
}

// ============================================================
// Mostrar banner de reconexión
// ============================================================
function showReconnectBanner() {
  const banner = document.getElementById("reconnectBanner");
  if (banner) banner.style.display = "flex";
}

// ============================================================
// playNextTrack / playPrevTrack
// ============================================================
function playNextTrack(isAutoEnded = false) {
  const total = window.App.playlist.length;
  if (total === 0) return;

  // Repeat one: reiniciar la misma
  if (isAutoEnded && repeatMode === "one") {
    audioElement.currentTime = 0;
    audioElement.play().catch((e) => console.warn(e));
    return;
  }

  if (isShuffle) {
    window.loadTrack(getRandomIndex(), true);
    return;
  }

  if (window.App.currentIndex < total - 1) {
    window.loadTrack(window.App.currentIndex + 1, true);
  } else if (repeatMode === "all") {
    window.loadTrack(0, true);
  }
}

function playPrevTrack() {
  const total = window.App.playlist.length;
  if (total === 0) return;

  // Si lleva más de 3s, reiniciar
  if (audioElement.currentTime > 3) {
    audioElement.currentTime = 0;
    return;
  }

  if (isShuffle) {
    window.loadTrack(getRandomIndex(), true);
    return;
  }

  if (window.App.currentIndex > 0) {
    window.loadTrack(window.App.currentIndex - 1, true);
  } else if (repeatMode === "all") {
    window.loadTrack(total - 1, true);
  }
}

function getRandomIndex() {
  const total = window.App.playlist.length;
  if (total <= 1) return 0;
  let newIdx;
  do {
    newIdx = Math.floor(Math.random() * total);
  } while (newIdx === window.App.currentIndex);
  return newIdx;
}

// ============================================================
// Media Session API
// ============================================================
function updateMediaSession(track) {
  if (!("mediaSession" in navigator)) return;

  navigator.mediaSession.metadata = new MediaMetadata({
    title: track.name || "Desconocido",
    artist: track.artist || "Desconocido",
    album: "Uyari",
    artwork: track.coverUrl
      ? [{ src: track.coverUrl, sizes: "512x512", type: "image/png" }]
      : [{ src: "icon.svg", sizes: "512x512", type: "image/svg+xml" }],
  });

  navigator.mediaSession.playbackState = "playing";

  try {
    navigator.mediaSession.setActionHandler("play", () => audioElement.play());
    navigator.mediaSession.setActionHandler("pause", () => audioElement.pause());
    navigator.mediaSession.setActionHandler("previoustrack", () => playPrevTrack());
    navigator.mediaSession.setActionHandler("nexttrack", () => playNextTrack());
    navigator.mediaSession.setActionHandler("seekbackward", (d) => {
      audioElement.currentTime = Math.max(0, audioElement.currentTime - (d.seekOffset || 10));
    });
    navigator.mediaSession.setActionHandler("seekforward", (d) => {
      audioElement.currentTime = Math.min(audioElement.duration, audioElement.currentTime + (d.seekOffset || 10));
    });
    navigator.mediaSession.setActionHandler("seekto", (d) => {
      if (d.seekTime != null) audioElement.currentTime = d.seekTime;
    });
  } catch (err) {
    // Algunos handlers no soportados
  }
}

// ============================================================
// Eventos del elemento <audio>
// ============================================================
audioElement.addEventListener("play", () => {
  if (playIcon) playIcon.style.display = "none";
  if (pauseIcon) pauseIcon.style.display = "block";
  if ("mediaSession" in navigator) navigator.mediaSession.playbackState = "playing";
});

audioElement.addEventListener("pause", () => {
  if (playIcon) playIcon.style.display = "block";
  if (pauseIcon) pauseIcon.style.display = "none";
  if ("mediaSession" in navigator) navigator.mediaSession.playbackState = "paused";
});

// THROTTLE: solo actualizar UI cada 250ms (ahorra batería en móvil)
audioElement.addEventListener("timeupdate", () => {
  const now = performance.now();
  if (now - lastUITime < 250) return;
  lastUITime = now;

  const cur = audioElement.currentTime;
  const dur = audioElement.duration;
  if (dur && document.visibilityState === "visible") {
    const pct = (cur / dur) * 100;
    if (timelineFill) timelineFill.style.width = `${pct}%`;
    if (currentTimeLabel) currentTimeLabel.textContent = formatTime(cur);
    if (window.syncLyrics) window.syncLyrics(cur);
  }
});

audioElement.addEventListener("loadedmetadata", () => {
  if (totalDurationLabel) {
    totalDurationLabel.textContent = formatTime(audioElement.duration);
  }
});

audioElement.addEventListener("ended", () => {
  playNextTrack(true);
});

audioElement.addEventListener("error", (e) => {
  console.error("[Player] Error del audio:", audioElement.error);
});

// ============================================================
// Controles de UI
// ============================================================
if (btnPlayPause) {
  btnPlayPause.addEventListener("click", async () => {
    if (audioElement.paused) {
      // Si no hay nada cargado, cargar primera pista
      if (window.App.currentIndex === -1 && window.App.playlist.length > 0) {
        window.loadTrack(0, true);
        return;
      }
      try {
        await audioElement.play();
      } catch (err) {
        console.warn("[Player] play() falló:", err.name, err.message);
        // Si el src no está definido, cargar la pista actual
        if (!audioElement.src && window.App.currentIndex >= 0) {
          window.loadTrack(window.App.currentIndex, true);
        }
      }
    } else {
      audioElement.pause();
    }
  });
}

if (btnNext) btnNext.addEventListener("click", () => playNextTrack());
if (btnPrev) btnPrev.addEventListener("click", () => playPrevTrack());

if (btnShuffle) {
  btnShuffle.addEventListener("click", () => {
    isShuffle = !isShuffle;
    btnShuffle.classList.toggle("active", isShuffle);
  });
}

if (btnRepeat) {
  btnRepeat.addEventListener("click", () => {
    if (repeatMode === "off") {
      repeatMode = "all";
      btnRepeat.classList.add("active");
      repeatBadgeOne.classList.remove("active");
    } else if (repeatMode === "all") {
      repeatMode = "one";
      btnRepeat.classList.add("active");
      repeatBadgeOne.classList.add("active");
    } else {
      repeatMode = "off";
      btnRepeat.classList.remove("active");
      repeatBadgeOne.classList.remove("active");
    }
  });
}

// Timeline: click para buscar
if (timelineBar) {
  timelineBar.addEventListener("click", (e) => {
    if (!audioElement.duration) return;
    const rect = timelineBar.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    audioElement.currentTime = pct * audioElement.duration;
  });
}

// Volumen
if (volumeSlider) {
  audioElement.volume = parseFloat(volumeSlider.value);
  volumeSlider.addEventListener("input", (e) => {
    audioElement.volume = parseFloat(e.target.value);
  });
}
