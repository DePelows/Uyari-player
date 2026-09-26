let audioA = null;
let audioB = null;
let activeAudio = null;
let inactiveAudio = null;

let isShuffle = false;
let repeatMode = "off"; // "off" | "all" | "one"

// Referencias a la UI
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

function formatTime(seconds) {
  if (isNaN(seconds)) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s < 10 ? "0" : ""}${s}`;
}

// Inicialización segura de los canales de audio
function initAudioElements() {
  if (!audioA || !audioB) {
    audioA = document.getElementById("audioA");
    audioB = document.getElementById("audioB");

    // Si por alguna razón no existen, los crea dinámicamente
    if (!audioA) {
      audioA = document.createElement("audio");
      audioA.id = "audioA";
      document.body.appendChild(audioA);
    }
    if (!audioB) {
      audioB = document.createElement("audio");
      audioB.id = "audioB";
      document.body.appendChild(audioB);
    }

    activeAudio = audioA;
    inactiveAudio = audioB;

    setupEvents(audioA);
    setupEvents(audioB);
  }
}

function setupEvents(audioEl) {
  audioEl.addEventListener("play", () => {
    if (audioEl === activeAudio) {
      playIcon.style.display = "none";
      pauseIcon.style.display = "block";
      if ("mediaSession" in navigator) navigator.mediaSession.playbackState = "playing";
    }
  });

  audioEl.addEventListener("pause", () => {
    if (audioEl === activeAudio) {
      playIcon.style.display = "block";
      pauseIcon.style.display = "none";
      if ("mediaSession" in navigator) navigator.mediaSession.playbackState = "paused";
    }
  });

  audioEl.addEventListener("timeupdate", () => {
    if (audioEl !== activeAudio) return;
    const cur = audioEl.currentTime;
    const dur = audioEl.duration;

    if (dur && document.visibilityState === "visible") {
      const pct = (cur / dur) * 100;
      timelineFill.style.width = `${pct}%`;
      currentTimeLabel.textContent = formatTime(cur);
      window.syncLyrics(cur);
    }
  });

  audioEl.addEventListener("loadedmetadata", () => {
    if (audioEl === activeAudio) {
      totalDurationLabel.textContent = formatTime(audioEl.duration);
    }
  });

  audioEl.addEventListener("ended", () => {
    if (audioEl === activeAudio) {
      playNextTrack(true);
    }
  });
}

// Carga y reproducción segura
window.loadTrack = function(index, autoPlay = false) {
  initAudioElements();

  if (index < 0 || index >= window.App.playlist.length) return;
  window.App.currentIndex = index;
  const track = window.App.playlist[index];

  // Si ya había una canción sonando, alternamos al otro elemento de audio
  const prevAudio = activeAudio;
  activeAudio = (activeAudio === audioA) ? audioB : audioA;
  inactiveAudio = prevAudio;

  // Asignar archivo
  activeAudio.src = track.url;

  if (autoPlay) {
    const playPromise = activeAudio.play();
    if (playPromise !== undefined) {
      playPromise.then(() => {
        // Pausar y resetear el anterior sólo cuando el nuevo ya arrancó
        if (prevAudio && prevAudio !== activeAudio) {
          prevAudio.pause();
          prevAudio.currentTime = 0;
        }
      }).catch((err) => {
        console.warn("Reproducción cancelada por el sistema:", err);
      });
    }
  } else {
    if (prevAudio && prevAudio !== activeAudio) {
      prevAudio.pause();
      prevAudio.currentTime = 0;
    }
  }

  updateMediaSession(track);

  // Actualización diferida de la interfaz para no congelar el evento de toque
  setTimeout(() => {
    window.currentLyricIndex = -1;

    if (track.lrcContent) {
      window.App.parsedLyrics = window.parseLRC(track.lrcContent);
      if (document.visibilityState === "visible") window.renderLyricsView();
    } else {
      window.App.parsedLyrics = [];
      const ls = document.getElementById("lyricsScroll");
      if (ls) ls.innerHTML = `<p class="no-lyrics">No hay archivo .lrc para esta pista.</p>`;
      const exp = document.getElementById("expandedLyricsScroll");
      if (exp) exp.innerHTML = `<p class="no-lyrics">No hay archivo .lrc para esta pista.</p>`;
    }

    if (document.visibilityState === "visible") {
      window.updatePlayerUI(track);
      window.renderTrackList();
    }
  }, 0);
};

function playNextTrack(isAutoEnded = false) {
  const total = window.App.playlist.length;
  if (total === 0) return;

  if (isAutoEnded && repeatMode === "one") {
    if (activeAudio) {
      activeAudio.currentTime = 0;
      activeAudio.play().catch(e => console.warn(e));
    }
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

  if (activeAudio && activeAudio.currentTime > 3) {
    activeAudio.currentTime = 0;
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
  if ("mediaSession" in navigator) {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: track.name || "Desconocido",
      artist: track.artist || "Desconocido",
      album: "Uyari",
      artwork: track.coverUrl
        ? [{ src: track.coverUrl, sizes: "512x512", type: "image/png" }]
        : [{ src: "icon.svg", sizes: "512x512", type: "image/svg+xml" }]
    });

    navigator.mediaSession.playbackState = "playing";

    navigator.mediaSession.setActionHandler("play", () => {
      initAudioElements();
      if (activeAudio) activeAudio.play();
    });
    navigator.mediaSession.setActionHandler("pause", () => {
      if (activeAudio) activeAudio.pause();
    });
    navigator.mediaSession.setActionHandler("previoustrack", () => playPrevTrack());
    navigator.mediaSession.setActionHandler("nexttrack", () => playNextTrack());
  }
}

// Botón Play/Pause principal
btnPlayPause.addEventListener("click", () => {
  initAudioElements();

  if (!activeAudio || activeAudio.paused) {
    if (window.App.currentIndex === -1 && window.App.playlist.length > 0) {
      window.loadTrack(0, true);
    } else if (activeAudio) {
      activeAudio.play();
    }
  } else {
    activeAudio.pause();
  }
});

btnNext.addEventListener("click", () => playNextTrack());
btnPrev.addEventListener("click", () => playPrevTrack());

btnShuffle.addEventListener("click", () => {
  isShuffle = !isShuffle;
  btnShuffle.classList.toggle("active", isShuffle);
});

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

timelineBar.addEventListener("click", (e) => {
  initAudioElements();
  if (!activeAudio || !activeAudio.duration) return;
  const rect = timelineBar.getBoundingClientRect();
  const clickX = e.clientX - rect.left;
  const pct = clickX / rect.width;
  activeAudio.currentTime = pct * activeAudio.duration;
});

if (volumeSlider) {
  volumeSlider.addEventListener("input", (e) => {
    initAudioElements();
    const val = parseFloat(e.target.value);
    if (audioA) audioA.volume = val;
    if (audioB) audioB.volume = val;
  });
}

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && window.App.currentIndex !== -1) {
    const currentTrack = window.App.playlist[window.App.currentIndex];
    if (currentTrack) {
      window.updatePlayerUI(currentTrack);
      window.renderTrackList();
      if (currentTrack.lrcContent) {
        window.renderLyricsView();
      }
    }
  }
});

// Inicializar al cargar el DOM
document.addEventListener("DOMContentLoaded", () => {
  initAudioElements();
});
