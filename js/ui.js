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
