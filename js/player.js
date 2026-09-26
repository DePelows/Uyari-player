let audioA = document.getElementById("audioA");
let audioB = document.getElementById("audioB");

// Referencia al audio que está sonando actualmente
let activeAudio = audioA;
let inactiveAudio = audioB;

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
let repeatMode = "off"; // "off" | "all" | "one"

function formatTime(seconds) {
  if (isNaN(seconds)) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s < 10 ? "0" : ""}${s}`;
}

// Configuración de eventos de los dos canales de audio
function attachAudioEvents(audioEl) {
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

  // Al terminar la canción, dispara la siguiente de forma fluida
  audioEl.addEventListener("ended", () => {
    if (audioEl === activeAudio) {
      playNextTrack(true);
    }
  });
}

attachAudioEvents(audioA);
attachAudioEvents(audioB);

// Carga y reproducción usando el canal alterno
window.loadTrack = function(index, autoPlay = false) {
  if (index < 0 || index >= window.App.playlist.length) return;
  window.App.currentIndex = index;
  const track = window.App.playlist[index];

  // Alternar el canal inactivo para convertirlo en el nuevo canal activo
  const prevAudio = activeAudio;
  activeAudio = inactiveAudio;
  inactiveAudio = prevAudio;

  // Asignar el nuevo track al nuevo canal activo
  activeAudio.src = track.url;

  if (autoPlay) {
    const playPromise = activeAudio.play();
    if (playPromise !== undefined) {
      playPromise.then(() => {
        // Detener el canal anterior solo cuando el nuevo ya arrancó
        prevAudio.pause();
        prevAudio.currentTime = 0;
      }).catch((err) => {
        console.warn("Error en reproducción:", err);
      });
    }
  } else {
    prevAudio.pause();
    prevAudio.currentTime = 0;
  }

  updateMediaSession(track);

  // Actualizar la interfaz sin bloquear el proceso de audio
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
    activeAudio.currentTime = 0;
    activeAudio.play().catch(e => console.warn(e));
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

  if (activeAudio.currentTime > 3) {
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
      activeAudio.play();
      navigator.mediaSession.playbackState = "playing";
    });
    navigator.mediaSession.setActionHandler("pause", () => {
      activeAudio.pause();
      navigator.mediaSession.playbackState = "paused";
    });
    navigator.mediaSession.setActionHandler("previoustrack", () => playPrevTrack());
    navigator.mediaSession.setActionHandler("nexttrack", () => playNextTrack());
  }
}

// Controles
btnPlayPause.addEventListener("click", () => {
  if (activeAudio.paused) {
    if (window.App.currentIndex === -1 && window.App.playlist.length > 0) {
      window.loadTrack(0, true);
    } else {
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
  const rect = timelineBar.getBoundingClientRect();
  const clickX = e.clientX - rect.left;
  const pct = clickX / rect.width;
  if (activeAudio.duration) {
    activeAudio.currentTime = pct * activeAudio.duration;
  }
});

if (volumeSlider) {
  volumeSlider.addEventListener("input", (e) => {
    const val = parseFloat(e.target.value);
    audioA.volume = val;
    audioB.volume = val;
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
