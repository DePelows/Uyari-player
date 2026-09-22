const jsmediatags = window.jsmediatags;

// Dibuja la lista de canciones en la Biblioteca (con soporte de filtro)
window.renderTrackList = function(filteredTracks = null) {
  const container = document.getElementById("trackListContainer");
  if (!container) return;
  container.innerHTML = "";

  const tracksToRender = filteredTracks || window.App.playlist;

  if (tracksToRender.length === 0) {
    const isSearching = document.getElementById("searchInput") && document.getElementById("searchInput").value.trim() !== "";
    container.innerHTML = `
      <div class="empty-state">
        <p>${isSearching ? "No se encontraron canciones que coincidan con la búsqueda." : "No se han cargado canciones aún."}</p>
      </div>
    `;
    return;
  }

  const defaultCover = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='48' height='48' fill='%23282828'><rect width='48' height='48'/></svg>";

  tracksToRender.forEach((track) => {
    // Buscamos el índice absoluto dentro de la playlist original
    const originalIndex = window.App.playlist.indexOf(track);
    const isActive = originalIndex === window.App.currentIndex;

    const card = document.createElement("div");
    card.className = `track-card ${isActive ? "active" : ""}`;

    const imgSrc = track.coverUrl ? track.coverUrl : defaultCover;
    const lrcIndicator = track.lrcContent ? " • ✓ Letra" : "";

    card.innerHTML = `
      <img src="${imgSrc}" class="track-thumb" alt="Cover">
      <div class="track-card-info">
        <span class="track-card-title">${track.name}</span>
        <span class="track-card-artist">${track.artist}${lrcIndicator}</span>
      </div>
    `;

    card.addEventListener("click", () => {
      window.loadTrack(originalIndex);
      document.getElementById("audioElement").play();
    });

    container.appendChild(card);
  });
};

// Conexión del buscador en tiempo real
document.addEventListener("DOMContentLoaded", () => {
  const searchInput = document.getElementById("searchInput");
  if (searchInput) {
    searchInput.addEventListener("input", (e) => {
      const term = e.target.value.toLowerCase().trim();

      if (!term) {
        window.renderTrackList();
        return;
      }

      const filtered = window.App.playlist.filter((track) => {
        const titleMatch = track.name && track.name.toLowerCase().includes(term);
        const artistMatch = track.artist && track.artist.toLowerCase().includes(term);
        return titleMatch || artistMatch;
      });

      window.renderTrackList(filtered);
    });
  }
});

// Dibuja la letra en el panel derecho y en el panel expandido
// Dibuja la letra en el panel derecho y en el panel expandido con interactividad
window.renderLyricsView = function() {
  const lyricsScroll = document.getElementById("lyricsScroll");
  const expandedLyricsScroll = document.getElementById("expandedLyricsScroll");

  if (lyricsScroll) lyricsScroll.innerHTML = "";
  if (expandedLyricsScroll) expandedLyricsScroll.innerHTML = "";

  if (!window.App.parsedLyrics || window.App.parsedLyrics.length === 0) {
    const emptyMsg = '<p class="no-lyrics">No hay archivo .lrc para esta pista.</p>';
    if (lyricsScroll) lyricsScroll.innerHTML = emptyMsg;
    if (expandedLyricsScroll) expandedLyricsScroll.innerHTML = emptyMsg;
    return;
  }

  const audio = document.getElementById("audioElement");

  // Función para crear la línea interactiva
  const createLyricElement = (line) => {
    const p = document.createElement("p");
    p.className = "lyric-line interactive";
    p.textContent = line.text || "♪";

    // Al hacer clic, saltar a ese segundo
    p.addEventListener("click", () => {
      if (audio && audio.duration) {
        audio.currentTime = line.time;
        if (audio.paused) {
          audio.play();
        }
      }
    });

    return p;
  };

  window.App.parsedLyrics.forEach((line) => {
    // 1. Línea para el panel normal
    if (lyricsScroll) {
      lyricsScroll.appendChild(createLyricElement(line));
    }

    // 2. Línea para la pantalla completa
    if (expandedLyricsScroll) {
      expandedLyricsScroll.appendChild(createLyricElement(line));
    }
  });
};

// Actualiza el título, artista y carátula del reproductor inferior
window.updatePlayerUI = function(track) {
  const pTitle = document.getElementById("playerTitle");
  const pArtist = document.getElementById("playerArtist");
  const coverImg = document.getElementById("currentCoverArt");
  const defaultSvg = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='56' height='56' fill='%23282828'><rect width='56' height='56'/></svg>";

  if (pTitle) pTitle.textContent = track.name;
  if (pArtist) pArtist.textContent = track.artist;
  if (coverImg) coverImg.src = track.coverUrl ? track.coverUrl : defaultSvg;
};