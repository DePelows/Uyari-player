// ============================================================
// Uyari Player — Reproductor de audio
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

let isShuffle = false;
let repeatMode = "off";
window.currentAudioUrl = null;
let lastUITime = 0;

function formatTime(seconds) {
  if (isNaN(seconds) || !isFinite(seconds)) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s < 10 ? "0" : ""}${s}`;
}

window.pauseAudioPlayer = function () {
  if (audioElement && !audioElement.paused) {
    audioElement.pause();
  }
};

function revokeCurrentAudioUrl() {
  if (window.currentAudioUrl) {
    try { URL.revokeObjectURL(window.currentAudioUrl); } catch (e) {}
    window.currentAudioUrl = null;
  }
}

window.loadTrack = async function (index, autoPlay = false) {
  if (index < 0 || index >= window.App.playlist.length) return;

  window.App.currentIndex = index;
  const track = window.App.playlist[index];

  revokeCurrentAudioUrl();

  let file = null;

  if (track.fileBlob instanceof Blob) {
    file = track.fileBlob;
  } else {
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

  try {
    window.currentAudioUrl = URL.createObjectURL(file);
    audioElement.src = window.currentAudioUrl;
  } catch (err) {
    console.error("[Player] Error al crear object URL:", err);
    return;
  }

  if (autoPlay) {
    const playPromise = audioElement.play();
    if (playPromise !== undefined) {
      playPromise.catch((err) => {
        console.warn("[Player] play() falló:", err.name, err.message);
      });
    }
  }

  updateMediaSession(track);

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

  window.updatePlayerUI(track);
  if (window.renderTrackList) window.renderTrackList();
};

async function getFileFromHandle(type, relativePath) {
  const handleId = type === "video" ? "video" : "music";
  const rootHandle = await window.loadHandleFromDB(handleId);
  if (!rootHandle) return null;

  // Solo comprobar permiso. No pedir aquí.
  const perm = await rootHandle.queryPermission({ mode: "read" });
  if (perm !== "granted") {
    console.log("[Player] Permiso no concedido para", handleId);
    return null;
  }

  // Navegar el path
  const parts = relativePath.split("/").filter((p) => p.length > 0);
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

function showReconnectBanner() {
  const banner = document.getElementById("reconnectBanner");
  if (banner) banner.style.display = "flex";
}

function playNextTrack(isAutoEnded = false) {
  const total = window.App.playlist.length;
  if (total === 0) return;

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
  } catch (err) {}
}

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

audioElement.addEventListener("error", () => {
  console.error("[Player] Error del audio:", audioElement.error);
});

if (btnPlayPause) {
  btnPlayPause.addEventListener("click", async () => {
    if (audioElement.paused) {
      if (window.App.currentIndex === -1 && window.App.playlist.length > 0) {
        window.loadTrack(0, true);
        return;
      }
      try {
        await audioElement.play();
      } catch (err) {
        console.warn("[Player] play() falló:", err.name, err.message);
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

if (timelineBar) {
  timelineBar.addEventListener("click", (e) => {
    if (!audioElement.duration) return;
    const rect = timelineBar.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    audioElement.currentTime = pct * audioElement.duration;
  });
}

if (volumeSlider) {
  audioElement.volume = parseFloat(volumeSlider.value);
  volumeSlider.addEventListener("input", (e) => {
    audioElement.volume = parseFloat(e.target.value);
  });
}
