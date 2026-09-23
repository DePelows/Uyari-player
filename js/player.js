const audioElement = document.getElementById("audioElement");
const btnPlayPause = document.getElementById("btnPlayPause");
const playIcon = document.getElementById("playIcon");
const pauseIcon = document.getElementById("pauseIcon");
const btnPrev = document.getElementById("btnPrev");
const btnNext = document.getElementById("btnNext");
const btnShuffle = document.getElementById("btnShuffle");
const btnRepeat = document.getElementById("btnRepeat");

const timelineBar = document.getElementById("timelineBar");
const timelineFill = document.getElementById("timelineFill");
const currentTimeLabel = document.getElementById("currentTime");
const totalDurationLabel = document.getElementById("totalDuration");
const volumeSlider = document.getElementById("volumeSlider");

// Estados de reproducción
window.currentLyricIndex = -1;
let isShuffle = false;
let repeatMode = "off"; // "off" | "all" | "one"

// =========================================================
// 1. INTEGRACIÓN CON MEDIASESSION API
// =========================================================
function updateMediaSession(track) {
  if (!("mediaSession" in navigator)) return;

  const artworkList = [];
  if (track.coverUrl && track.coverUrl !== "default") {
    artworkList.push({
      src: track.coverUrl,
      sizes: "512x512",
      type: "image/jpeg"
    });
  }

  navigator.mediaSession.metadata = new MediaMetadata({
    title: track.name || "Pista desconocida",
    artist: track.artist || "Artista desconocido",
    album: "Uyari",
    artwork: artworkList
  });

  navigator.mediaSession.setActionHandler("play", () => audioElement.play());
  navigator.mediaSession.setActionHandler("pause", () => audioElement.pause());
  navigator.mediaSession.setActionHandler("previoustrack", () => playPrevTrack());
  navigator.mediaSession.setActionHandler("nexttrack", () => playNextTrack(false));
  navigator.mediaSession.setActionHandler("seekto", (details) => {
    if (details.seekTime && audioElement.duration) {
      audioElement.currentTime = details.seekTime;
      updateMediaSessionPositionState();
    }
  });
}

function updateMediaSessionPositionState() {
  if (!("mediaSession" in navigator) || !("setPositionState" in navigator.mediaSession)) return;
  if (!audioElement.duration || isNaN(audioElement.duration)) return;

  try {
    navigator.mediaSession.setPositionState({
      duration: audioElement.duration,
      playbackRate: audioElement.playbackRate,
      position: audioElement.currentTime
    });
  } catch (err) {}
}

// =========================================================
// 2. CARGA Y REPRODUCCIÓN DE PISTAS
// =========================================================
window.loadTrack = function(index, autoPlay = false) {
  if (index < 0 || index >= window.App.playlist.length) return;
  window.App.currentIndex = index;
  const track = window.App.playlist[index];

  // Asignar nueva fuente
  audioElement.src = track.url;
  audioElement.load(); // Forzar carga limpia en móvil
  window.currentLyricIndex = -1;

  if (track.lrcContent) {
    window.App.parsedLyrics = window.parseLRC(track.lrcContent);
    window.renderLyricsView();
  } else {
    window.App.parsedLyrics = [];
    document.getElementById("lyricsScroll").innerHTML = `<p class="no-lyrics">No hay archivo .lrc para esta pista.</p>`;
    const exp = document.getElementById("expandedLyricsScroll");
    if (exp) exp.innerHTML = `<p class="no-lyrics">No hay archivo .lrc para esta pista.</p>`;
  }

  window.updatePlayerUI(track);
  window.renderTrackList();
  updateMediaSession(track);

  // Si debe reproducirse automáticamente (al terminar la anterior o cambiar de pista)
  if (autoPlay) {
    // Esperar a que el audio esté listo para sonar sin trabarse
    const onCanPlay = () => {
      audioElement.removeEventListener("canplay", onCanPlay);
      const playPromise = audioElement.play();
      if (playPromise !== undefined) {
        playPromise.catch((error) => {
          console.warn("Autoplay bloqueado por el navegador móvil:", error);
        });
      }
    };
    audioElement.addEventListener("canplay", onCanPlay);
  }
};

// =========================================================
// 3. LÓGICA DE SHUFFLE, PREV Y NEXT
// =========================================================
function getRandomIndex() {
  const total = window.App.playlist.length;
  if (total <= 1) return 0;

  let newIndex = window.App.currentIndex;
  while (newIndex === window.App.currentIndex) {
    newIndex = Math.floor(Math.random() * total);
  }
  return newIndex;
}

function playNextTrack(isAutoEnded = false) {
  const total = window.App.playlist.length;
  if (total === 0) return;

  if (isAutoEnded && repeatMode === "one") {
    audioElement.currentTime = 0;
    audioElement.play();
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

// Botón Shuffle
if (btnShuffle) {
  btnShuffle.addEventListener("click", () => {
    isShuffle = !isShuffle;
    btnShuffle.classList.toggle("active", isShuffle);
    btnShuffle.title = isShuffle ? "Desactivar aleatorio" : "Activar aleatorio";
  });
}

// Botón Repeat (off -> all -> one -> off)
if (btnRepeat) {
  btnRepeat.addEventListener("click", () => {
    if (repeatMode === "off") {
      repeatMode = "all";
      btnRepeat.classList.add("active");
      btnRepeat.classList.remove("repeat-one");
      btnRepeat.title = "Repetir: Todo";
    } else if (repeatMode === "all") {
      repeatMode = "one";
      btnRepeat.classList.add("active", "repeat-one");
      btnRepeat.title = "Repetir: Canción actual";
    } else {
      repeatMode = "off";
      btnRepeat.classList.remove("active", "repeat-one");
      btnRepeat.title = "Repetición desactivada";
    }
  });
}

// =========================================================
// 4. SCROLL EXACTO DE LETRAS SINCRONIZADAS
// =========================================================
window.scrollToActiveLyric = function() {
  if (window.currentLyricIndex === -1) return;

  const updatePanel = (containerId) => {
    const container = document.getElementById(containerId);
    if (!container) return;

    const lines = container.querySelectorAll(".lyric-line");
    lines.forEach((el, idx) => {
      if (idx === window.currentLyricIndex) {
        el.classList.add("active");

        if (container.offsetParent !== null) {
          container.scrollTo({
            top: el.offsetTop - (container.clientHeight / 2) + (el.clientHeight / 2),
            behavior: "smooth"
          });
        }
      } else {
        el.classList.remove("active");
      }
    });
  };

  updatePanel("lyricsScroll");
  updatePanel("expandedLyricsScroll");
};

// =========================================================
// 5. EVENTOS DE AUDIO Y TIMELINE
// =========================================================
audioElement.addEventListener("timeupdate", () => {
  const cur = audioElement.currentTime;
  const dur = audioElement.duration || 0;

  if (dur > 0) {
    timelineFill.style.width = `${(cur / dur) * 100}%`;
    currentTimeLabel.textContent = formatTime(cur);
    totalDurationLabel.textContent = formatTime(dur);
    updateMediaSessionPositionState();
  }

  if (window.App.parsedLyrics && window.App.parsedLyrics.length > 0) {
    let activeIdx = -1;
    for (let i = 0; i < window.App.parsedLyrics.length; i++) {
      if (cur >= window.App.parsedLyrics[i].time) activeIdx = i;
      else break;
    }

    if (activeIdx !== window.currentLyricIndex) {
      window.currentLyricIndex = activeIdx;
      window.scrollToActiveLyric();
    }
  }
});

function formatTime(secs) {
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s < 10 ? "0" : ""}${s}`;
}

btnPlayPause.addEventListener("click", () => {
  if (audioElement.paused) audioElement.play();
  else audioElement.pause();
});

audioElement.addEventListener("play", () => {
  playIcon.style.display = "none";
  pauseIcon.style.display = "block";
  if ("mediaSession" in navigator) navigator.mediaSession.playbackState = "playing";
});

audioElement.addEventListener("pause", () => {
  playIcon.style.display = "block";
  pauseIcon.style.display = "none";
  if ("mediaSession" in navigator) navigator.mediaSession.playbackState = "paused";
});

btnNext.addEventListener("click", () => playNextTrack(false));
btnPrev.addEventListener("click", () => playPrevTrack());
audioElement.addEventListener("ended", () => playNextTrack(true));

timelineBar.addEventListener("click", (e) => {
  const rect = timelineBar.getBoundingClientRect();
  const pct = (e.clientX - rect.left) / rect.width;
  if (audioElement.duration) {
    audioElement.currentTime = pct * audioElement.duration;
    updateMediaSessionPositionState();
  }
});

volumeSlider.addEventListener("input", (e) => {
  audioElement.volume = parseFloat(e.target.value);
});
