window.currentLyricIndex = -1;
window.currentVideoPath = ""; // Ruta actual en la vista de video

window.renderTrackList = function(filteredTracks = null) {
  const container = document.getElementById("trackListContainer");
  if (!container) return;
  container.innerHTML = "";

  const tracksToRender = filteredTracks || window.App.playlist;

  if (tracksToRender.length === 0) {
    container.innerHTML = `<div class="empty-state"><p>No se encontraron canciones.</p></div>`;
    return;
  }

  const defaultCover = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='48' height='48' fill='%23282828'><rect width='48' height='48'/></svg>";

  tracksToRender.forEach((track) => {
    const originalIndex = window.App.playlist.indexOf(track);
    const isActive = originalIndex === window.App.currentIndex;

    const card = document.createElement("div");
    card.className = `track-card ${isActive ? "active" : ""}`;
    card.innerHTML = `
      <img src="${track.coverUrl || defaultCover}" class="track-thumb" alt="Cover">
      <div class="track-card-info">
        <span class="track-card-title">${track.name}</span>
        <span class="track-card-artist">${track.artist}${track.lrcContent ? " • ✓ Letra" : ""}</span>
      </div>
    `;

    card.addEventListener("click", () => {
      if (window.pauseAudioPlayer) window.pauseAudioPlayer(); // Usamos la global para matar videos
      const videoEl = document.getElementById("mainVideoPlayer");
      if (videoEl && !videoEl.paused) videoEl.pause();
      
      window.loadTrack(originalIndex, true);
    });

    container.appendChild(card);
  });
};

window.renderArtistList = function() {
  const container = document.getElementById("trackListContainer");
  if (!container) return;
  container.innerHTML = "";

  if (window.App.playlist.length === 0) {
    container.innerHTML = `<div class="empty-state"><p>No hay artistas en la biblioteca.</p></div>`;
    return;
  }

  const artistsMap = {};
  window.App.playlist.forEach(track => {
    const artistName = track.artist || "Desconocido";
    if (!artistsMap[artistName]) artistsMap[artistName] = [];
    artistsMap[artistName].push(track);
  });

  Object.keys(artistsMap).sort().forEach(artist => {
    const card = document.createElement("div");
    card.className = "artist-card";
    const initial = artist.charAt(0).toUpperCase();
    
    card.innerHTML = `
      <div class="artist-icon">${initial}</div>
      <div class="track-card-info">
        <span class="track-card-title">${artist}</span>
        <span class="track-card-artist">${artistsMap[artist].length} canciones</span>
      </div>
    `;

    card.addEventListener("click", () => {
      document.getElementById("tabSongs").classList.add("active");
      document.getElementById("tabArtists").classList.remove("active");
      window.renderTrackList(artistsMap[artist]);
    });

    container.appendChild(card);
  });
};

// MOTOR DE CARPETAS PARA VIDEOS
window.renderVideoList = function(path = "") {
  window.currentVideoPath = path;
  const container = document.getElementById("videoGridContainer");
  const breadcrumbs = document.getElementById("videoBreadcrumbs");
  if (!container) return;
  container.innerHTML = "";

  // 1. DIBUJAR BREADCRUMBS (Migas de pan)
  if (breadcrumbs) {
    let bcHTML = `<span class="breadcrumb-item" onclick="window.renderVideoList('')">Inicio</span>`;
    if (path !== "") {
      const parts = path.split('/').filter(p => p !== "");
      let buildPath = "";
      parts.forEach((part) => {
        buildPath += part + "/";
        bcHTML += ` <span class="breadcrumb-separator">/</span> <span class="breadcrumb-item" onclick="window.renderVideoList('${buildPath}')">${part}</span>`;
      });
    }
    breadcrumbs.innerHTML = bcHTML;
  }

  if (window.App.videoList.length === 0) {
    container.innerHTML = `<div class="empty-state"><p>No se han cargado videos.</p></div>`;
    return;
  }

  // 2. AGRUPAR CARPETAS VS ARCHIVOS
  const folders = new Set();
  const files = [];

  window.App.videoList.forEach((videoItem) => {
    if (videoItem.path.startsWith(path)) {
      const remainingPath = videoItem.path.substring(path.length);
      const slashIndex = remainingPath.indexOf('/');
      
      if (slashIndex !== -1) {
        // Es una sub-carpeta
        folders.add(remainingPath.substring(0, slashIndex));
      } else {
        // Es un archivo en este nivel
        files.push(videoItem);
      }
    }
  });

  // 3. DIBUJAR CARPETAS
  Array.from(folders).sort().forEach(folder => {
    const card = document.createElement("div");
    card.className = "folder-card";
    card.innerHTML = `
      <div class="folder-icon">
        <svg viewBox="0 0 24 24" width="32" height="32" fill="currentColor"><path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/></svg>
      </div>
      <div class="folder-name">${folder}</div>
    `;
    card.onclick = () => window.renderVideoList(path + folder + "/");
    container.appendChild(card);
  });

  // 4. DIBUJAR ARCHIVOS DE VIDEO
  files.sort((a,b) => a.name.localeCompare(b.name)).forEach(videoItem => {
    const card = document.createElement("div");
    card.className = "video-card";
    card.innerHTML = `
      <div class="video-thumb">
        <svg viewBox="0 0 24 24" width="48" height="48" fill="rgba(255,255,255,0.2)"><path d="M8 5v14l11-7z"/></svg>
      </div>
      <div class="video-info-box">${videoItem.name}</div>
    `;

    card.addEventListener("click", () => {
      if (window.pauseAudioPlayer) window.pauseAudioPlayer();
      const videoWrapper = document.getElementById("videoPlayerWrapper");
      const videoPlayer = document.getElementById("mainVideoPlayer");
      const videoTitle = document.getElementById("videoTitleDisplay");
      
      videoWrapper.style.display = "block";
      videoTitle.textContent = videoItem.name;
      
      if (window.currentVideoUrl) URL.revokeObjectURL(window.currentVideoUrl);
      window.currentVideoUrl = URL.createObjectURL(videoItem.fileBlob);
      videoPlayer.src = window.currentVideoUrl;
      videoPlayer.play();
      
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
    container.appendChild(card);
  });

  if (folders.size === 0 && files.length === 0) {
    container.innerHTML = `<div class="empty-state"><p>Carpeta vacía.</p></div>`;
  }
};

// BUSCADOR EN VIVO
document.addEventListener("DOMContentLoaded", () => {
  const searchInput = document.getElementById("searchInput");
  if (searchInput) {
    searchInput.addEventListener("input", (e) => {
      const term = e.target.value.toLowerCase().trim();
      document.getElementById("tabSongs").classList.add("active");
      document.getElementById("tabArtists").classList.remove("active");

      if (!term) { window.renderTrackList(); return; }

      const filtered = window.App.playlist.filter((track) => {
        return (track.name && track.name.toLowerCase().includes(term)) || 
               (track.artist && track.artist.toLowerCase().includes(term));
      });
      window.renderTrackList(filtered);
    });
  }
});

window.renderLyricsView = function() {
  const lyricsScroll = document.getElementById("lyricsScroll");
  const expandedLyricsScroll = document.getElementById("expandedLyricsScroll");
  if (lyricsScroll) lyricsScroll.innerHTML = "";
  if (expandedLyricsScroll) expandedLyricsScroll.innerHTML = "";
  if (!window.App.parsedLyrics || window.App.parsedLyrics.length === 0) return;
  const audio = document.getElementById("audioElement");

  const createLyricElement = (line) => {
    const p = document.createElement("p");
    p.className = "lyric-line interactive";
    p.textContent = line.text || "♪";
    p.addEventListener("click", () => {
      if (audio && audio.duration) { audio.currentTime = line.time; if (audio.paused) audio.play(); }
    });
    return p;
  };
  window.App.parsedLyrics.forEach((line) => {
    if (lyricsScroll) lyricsScroll.appendChild(createLyricElement(line));
    if (expandedLyricsScroll) expandedLyricsScroll.appendChild(createLyricElement(line));
  });
};

window.syncLyrics = function(currentTime) {
  if (!window.App.parsedLyrics || window.App.parsedLyrics.length === 0) return;
  let activeIndex = -1;
  for (let i = 0; i < window.App.parsedLyrics.length; i++) {
    if (currentTime >= window.App.parsedLyrics[i].time) activeIndex = i; else break;
  }
  if (activeIndex !== window.currentLyricIndex) {
    window.currentLyricIndex = activeIndex;
    const updateLines = (id) => {
      const c = document.getElementById(id);
      if (!c) return;
      c.querySelectorAll(".lyric-line").forEach((l, idx) => {
        if (idx === activeIndex) { l.classList.add("active"); l.scrollIntoView({ behavior: "smooth", block: "center" }); } 
        else l.classList.remove("active");
      });
    };
    updateLines("lyricsScroll");
    updateLines("expandedLyricsScroll");
  }
};

window.updatePlayerUI = function(track) {
  const pTitle = document.getElementById("playerTitle");
  const pArtist = document.getElementById("playerArtist");
  const coverImg = document.getElementById("currentCoverArt");
  if (pTitle) {
    pTitle.textContent = track.name;
    pTitle.classList.remove("is-scrolling");
    pTitle.style.removeProperty("--marquee-container-width");
    setTimeout(() => {
      const container = pTitle.parentElement;
      if (container && pTitle.scrollWidth > container.clientWidth) {
        pTitle.style.setProperty("--marquee-container-width", `${container.clientWidth}px`);
        pTitle.classList.add("is-scrolling");
      }
    }, 100);
  }
  if (pArtist) pArtist.textContent = track.artist;
  if (coverImg) coverImg.src = track.coverUrl ? track.coverUrl : "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='56' height='56' fill='%23282828'><rect width='56' height='56'/></svg>";
};
