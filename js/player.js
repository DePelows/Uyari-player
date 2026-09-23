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
let repeatMode = "off"; // "off" | "all" | "one"

// Formateador de tiempo mm:ss
function formatTime(seconds) {
  if (isNaN(seconds)) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s < 10 ? "0" : ""}${s}`;
}

// Carga una pista esperando canplay para prevenir bloqueos de autoplay en móviles
window.loadTrack = function(index, autoPlay = false) {
  if (index < 0 || index >= window.App.playlist.length) return;
  window.App.currentIndex = index;
  const track = window.App.playlist[index];

  audioElement.src = track.url;
  audioElement.load();
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

  if (autoPlay) {
    const onCanPlay = () => {
      audioElement.removeEventListener("canplay", onCanPlay);
      const playPromise = audioElement.play();
      if (playPromise !== undefined) {
        playPromise.catch((err) => console.warn("Autoplay controlado por navegador móvil:", err));
      }
    };
    audioElement.addEventListener("canplay", onCanPlay);
  }
};

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

function getRandomIndex() {
  const total = window.App.playlist.length;
  if (total <= 1) return 0;
  let newIdx;
  do {
    newIdx = Math.floor(Math.random() * total);
  } while (newIdx === window.App.currentIndex);
  return newIdx;
}

// MediaSession API para pantalla de bloqueo y barra de notificaciones del celular
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

    navigator.mediaSession.setActionHandler("play", () => audioElement.play());
    navigator.mediaSession.setActionHandler("pause", () => audioElement.pause());
    navigator.mediaSession.setActionHandler("previoustrack", () => playPrevTrack());
    navigator.mediaSession.setActionHandler("nexttrack", () => playNextTrack());
  }
}

// Controles y eventos
btnPlayPause.addEventListener("click", () => {
  if (audioElement.paused) {
    if (window.App.currentIndex === -1 && window.App.playlist.length > 0) {
      window.loadTrack(0, true);
    } else {
      audioElement.play();
    }
  } else {
    audioElement.pause();
  }
});

audioElement.addEventListener("play", () => {
  playIcon.style.display = "none";
  pauseIcon.style.display = "block";
});

audioElement.addEventListener("pause", () => {
  playIcon.style.display = "block";
  pauseIcon.style.display = "none";
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

audioElement.addEventListener("timeupdate", () => {
  const cur = audioElement.currentTime;
  const dur = audioElement.duration;

  if (dur) {
    const pct = (cur / dur) * 100;
    timelineFill.style.width = `${pct}%`;
    currentTimeLabel.textContent = formatTime(cur);
  }

  window.syncLyrics(cur);
});

audioElement.addEventListener("loadedmetadata", () => {
  totalDurationLabel.textContent = formatTime(audioElement.duration);
});

audioElement.addEventListener("ended", () => {
  playNextTrack(true);
});

timelineBar.addEventListener("click", (e) => {
  const rect = timelineBar.getBoundingClientRect();
  const clickX = e.clientX - rect.left;
  const pct = clickX / rect.width;
  if (audioElement.duration) {
    audioElement.currentTime = pct * audioElement.duration;
  }
});

if (volumeSlider) {
  volumeSlider.addEventListener("input", (e) => {
    audioElement.volume = parseFloat(e.target.value);
  });
}
