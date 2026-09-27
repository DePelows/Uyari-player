// ============================================================
// Uyari Player — Renderizado de UI
// ============================================================

window.currentLyricIndex = -1;
window.currentVideoPath = "";
window.currentVideoUrl = null;

// ============================================================
// LISTA DE CANCIONES
// ============================================================
window.renderTrackList = function (filteredTracks = null) {
  const container = document.getElementById("trackListContainer");
  if (!container) return;
  container.innerHTML = "";

  const tracksToRender = filteredTracks || window.App.playlist;

  if (tracksToRender.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <p>No se encontraron canciones.</p>
        <button type="button" class="btn-empty-load" onclick="document.getElementById('btnLoadMusic').click()">
          Cargar Música
        </button>
      </div>`;
    return;
  }

  const defaultCover = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='48' height='48' fill='%23282828'><rect width='48' height='48'/></svg>";

  tracksToRender.forEach((track) => {
    const originalIndex = window.App.playlist.indexOf(track);
    const isActive = originalIndex === window.App.currentIndex;

    const card = document.createElement("div");
    card.className = `track-card ${isActive ? "active" : ""}`;
    card.innerHTML = `
      <img src="${track.coverUrl || defaultCover}" class="track-thumb" alt="Cover" loading="lazy">
      <div class="track-card-info">
        <span class="track-card-title">${escapeHtml(track.name)}</span>
        <span class="track-card-artist">${escapeHtml(track.artist)}${track.lrcContent ? " • ✓ Letra" : ""}</span>
      </div>
    `;

    card.addEventListener("click", async () => {
      const videoEl = document.getElementById("mainVideoPlayer");
      if (videoEl && !videoEl.paused) videoEl.pause();
      await window.loadTrack(originalIndex, true);
    });

    container.appendChild(card);
  });
};

// ============================================================
// LISTA DE ARTISTAS
// ============================================================
window.renderArtistList = function () {
  const container = document.getElementById("trackListContainer");
  if (!container) return;
  container.innerHTML = "";

  if (window.App.playlist.length === 0) {
    container.innerHTML = `<div class="empty-state"><p>No hay artistas en la biblioteca.</p></div>`;
    return;
  }

  const artistsMap = {};

  window.App.playlist.forEach((track) => {
    const rawArtistString = track.artist || "Desconocido";
    const individualArtists = rawArtistString
      .split(/(?:,|\s+&\s+|\s+y\s+|\s+ft\.?\s+|\s+feat\.?\s+)/i)
      .map((a) => a.trim())
      .filter((a) => a.length > 0);

    individualArtists.forEach((artistName) => {
      if (!artistsMap[artistName]) artistsMap[artistName] = [];
      if (!artistsMap[artistName].includes(track)) {
        artistsMap[artistName].push(track);
      }
    });
  });

  Object.keys(artistsMap)
    .sort((a, b) => a.localeCompare(b, "es"))
    .forEach((artist) => {
      const card = document.createElement("div");
      card.className = "artist-card";
      const initial = artist.charAt(0).toUpperCase();

      card.innerHTML = `
        <div class="artist-icon">${escapeHtml(initial)}</div>
        <div class="track-card-info">
          <span class="track-card-title">${escapeHtml(artist)}</span>
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

// ============================================================
// LISTA DE VIDEOS
// ============================================================
window.renderVideoList = function (path = "") {
  window.currentVideoPath = path;
  const container = document.getElementById("videoGridContainer");
  const breadcrumbs = document.getElementById("videoBreadcrumbs");
  if (!container) return;
  container.innerHTML = "";

  if (breadcrumbs) {
    let bcHTML = `<span class="breadcrumb-item" onclick="window.renderVideoList('')">Inicio</span>`;
    if (path !== "") {
      const parts = path.split("/").filter((p) => p !== "");
      let buildPath = "";
      parts.forEach((part) => {
        buildPath += part + "/";
        bcHTML += ` <span class="breadcrumb-separator">/</span> <span class="breadcrumb-item" onclick="window.renderVideoList('${buildPath.replace(/'/g, "\\'")}')">${escapeHtml(part)}</span>`;
      });
    }
    breadcrumbs.innerHTML = bcHTML;
  }

  if (window.App.videoList.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <p>No se han cargado videos.</p>
        <button type="button" class="btn-empty-load" onclick="document.getElementById('btnLoadVideo').click()">
          Cargar Videos
        </button>
      </div>`;
    return;
  }

  const folders = new Set();
  const files = [];

  window.App.videoList.forEach((videoItem) => {
    if (videoItem.path.startsWith(path)) {
      const remainingPath = videoItem.path.substring(path.length);
      const slashIndex = remainingPath.indexOf("/");

      if (slashIndex !== -1) {
        folders.add(remainingPath.substring(0, slashIndex));
      } else {
        files.push(videoItem);
      }
    }
  });

  Array.from(folders)
    .sort((a, b) => a.localeCompare(b, "es"))
    .forEach((folder) => {
      const card = document.createElement("div");
      card.className = "folder-card";
      card.innerHTML = `
        <div class="folder-icon">
          <svg viewBox="0 0 24 24" width="32" height="32" fill="currentColor"><path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/></svg>
        </div>
        <div class="folder-name">${escapeHtml(folder)}</div>
      `;
      card.onclick = () => window.renderVideoList(path + folder + "/");
      container.appendChild(card);
    });

  files
    .sort((a, b) => a.name.localeCompare(b.name, "es"))
    .forEach((videoItem) => {
      const card = document.createElement("div");
      card.className = "video-card";
      card.innerHTML = `
        <div class="video-thumb">
          <svg viewBox="0 0 24 24" width="48" height="48" fill="rgba(255,255,255,0.2)"><path d="M8 5v14l11-7z"/></svg>
        </div>
        <div class="video-info-box">${escapeHtml(videoItem.name)}</div>
      `;

      card.addEventListener("click", async () => {
        if (window.pauseAudioPlayer) window.pauseAudioPlayer();

        const videoWrapper = document.getElementById("videoPlayerWrapper");
        const videoPlayer = document.getElementById("mainVideoPlayer");
        const videoTitle = document.getElementById("videoTitleDisplay");

        videoPlayer.pause();
        videoPlayer.removeAttribute("src");
        videoPlayer.load();
        if (window.currentVideoUrl) {
          try { URL.revokeObjectURL(window.currentVideoUrl); } catch (e) {}
          window.currentVideoUrl = null;
        }

        videoWrapper.style.display = "block";
        videoTitle.textContent = videoItem.name;

        let file = null;
        if (videoItem.fileBlob instanceof Blob) {
          file = videoItem.fileBlob;
        } else {
          try {
            file = await getVideoFileFromHandle(videoItem.path);
          } catch (err) {
            console.warn("[UI] No se pudo obtener el video:", err);
            showReconnectBanner();
            return;
          }
        }

        if (!file) {
          showReconnectBanner();
          return;
        }

        try {
          window.currentVideoUrl = URL.createObjectURL(file);
          videoPlayer.src = window.currentVideoUrl;
          videoPlayer.play();
        } catch (err) {
          console.error("[UI] Error al reproducir video:", err);
        }

        window.scrollTo({ top: 0, behavior: "smooth" });
      });

      container.appendChild(card);
    });

  if (folders.size === 0 && files.length === 0) {
    container.innerHTML = `<div class="empty-state"><p>Carpeta vacía.</p></div>`;
  }
};

async function getVideoFileFromHandle(relativePath) {
  const rootHandle = await window.loadHandleFromDB("video");
  if (!rootHandle) return null;

  const perm = await rootHandle.queryPermission({ mode: "read" });
  if (perm !== "granted") {
    console.log("[UI] Permiso de video no concedido");
    return null;
  }

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
    console.warn("[UI] Error navegando handle de video:", relativePath, err);
    return null;
  }
}

function showReconnectBanner() {
  const banner = document.getElementById("reconnectBanner");
  if (banner) banner.style.display = "flex";
}

// ============================================================
// BUSCADOR
// ============================================================
document.addEventListener("DOMContentLoaded", () => {
  const searchInput = document.getElementById("searchInput");
  if (searchInput) {
    searchInput.addEventListener("input", (e) => {
      const term = e.target.value.toLowerCase().trim();
      document.getElementById("tabSongs").classList.add("active");
      document.getElementById("tabArtists").classList.remove("active");

      if (!term) {
        window.renderTrackList();
        return;
      }

      const filtered = window.App.playlist.filter((track) => {
        return (
          (track.name && track.name.toLowerCase().includes(term)) ||
          (track.artist && track.artist.toLowerCase().includes(term))
        );
      });
      window.renderTrackList(filtered);
    });
  }
});

// ============================================================
// LETRAS
// ============================================================
window.renderLyricsView = function () {
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
      if (audio && audio.duration) {
        audio.currentTime = line.time;
        if (audio.paused) audio.play();
      }
    });
    return p;
  };

  window.App.parsedLyrics.forEach((line) => {
    if (lyricsScroll) lyricsScroll.appendChild(createLyricElement(line));
    if (expandedLyricsScroll) expandedLyricsScroll.appendChild(createLyricElement(line));
  });
};

window.syncLyrics = function (currentTime) {
  if (!window.App.parsedLyrics || window.App.parsedLyrics.length === 0) return;

  let activeIndex = -1;
  for (let i = 0; i < window.App.parsedLyrics.length; i++) {
    if (currentTime >= window.App.parsedLyrics[i].time) activeIndex = i;
    else break;
  }

  if (activeIndex !== window.currentLyricIndex) {
    window.currentLyricIndex = activeIndex;

    const updateLines = (id) => {
      const c = document.getElementById(id);
      if (!c) return;
      c.querySelectorAll(".lyric-line").forEach((l, idx) => {
        if (idx === activeIndex) {
          l.classList.add("active");
          try { l.scrollIntoView({ block: "center" }); } catch (e) {}
        } else {
          l.classList.remove("active");
        }
      });
    };

    updateLines("lyricsScroll");
    updateLines("expandedLyricsScroll");
  }
};

// ============================================================
// PLAYER UI
// ============================================================
window.updatePlayerUI = function (track) {
  const pTitle = document.getElementById("playerTitle");
  const pArtist = document.getElementById("playerArtist");
  const coverImg = document.getElementById("currentCoverArt");

  if (pTitle) {
    pTitle.textContent = track.name || "Selecciona una pista";
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

  if (pArtist) {
    pArtist.textContent = track.artist || "-";
  }

  if (coverImg) {
    coverImg.src = track.coverUrl
      ? track.coverUrl
      : "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='56' height='56' fill='%23282828'><rect width='56' height='56'/></svg>";
  }
};

// ============================================================
// Utilidades
// ============================================================
function escapeHtml(str) {
  if (str == null) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
