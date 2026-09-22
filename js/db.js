// Variable global para compartir estado entre los scripts
window.App = {
  playlist: [],
  currentIndex: -1,
  parsedLyrics: []
};

const DB_NAME = "SpotifyLocalDB";
const DB_VERSION = 1;
const STORE_NAME = "tracks";

const folderInput = document.getElementById("folderInput");
const trackListContainer = document.getElementById("trackListContainer");

// =========================================================
// 1. MANEJO DE INDEXEDDB
// =========================================================
function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function saveTracksToDB(tracks) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);

    // Limpiar anteriores para mantener la biblioteca sincronizada
    store.clear();

    tracks.forEach((track) => {
      // Guardamos el objeto sin URL temporal para no corromper referencias blob
      store.put({
        id: track.id,
        name: track.name,
        artist: track.artist,
        fileBlob: track.file, // IndexedDB soporta Blob / File directamente
        lrcContent: track.lrcContent,
        coverUrl: track.coverUrl
      });
    });

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function loadTracksFromDB() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const request = store.getAll();

    request.onsuccess = () => {
      const records = request.result || [];
      const restoredTracks = records.map((item) => ({
        id: item.id,
        name: item.name,
        artist: item.artist,
        file: item.fileBlob,
        lrcContent: item.lrcContent,
        coverUrl: item.coverUrl,
        url: URL.createObjectURL(item.fileBlob) // Creamos una URL de blob fresca
      }));
      resolve(restoredTracks);
    };

    request.onerror = () => reject(request.error);
  });
}

// Función global para borrar la biblioteca si el usuario lo desea
window.clearLibrary = async function() {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, "readwrite");
  tx.objectStore(STORE_NAME).clear();
  tx.oncomplete = () => {
    window.App.playlist = [];
    window.App.currentIndex = -1;
    window.App.parsedLyrics = [];
    if (window.renderTrackList) window.renderTrackList();
    const audio = document.getElementById("audioElement");
    if (audio) {
      audio.pause();
      audio.src = "";
    }
    document.getElementById("playerTitle").textContent = "Selecciona una pista";
    document.getElementById("playerArtist").textContent = "-";
  };
};

// =========================================================
// 2. CARGA AUTOMÁTICA AL INICIAR LA APP
// =========================================================
window.addEventListener("DOMContentLoaded", async () => {
  try {
    const cachedTracks = await loadTracksFromDB();
    if (cachedTracks.length > 0) {
      window.App.playlist = cachedTracks;
      if (window.renderTrackList) window.renderTrackList();
      if (window.loadTrack) window.loadTrack(0);
    }
  } catch (err) {
    console.error("Error al cargar la biblioteca guardada:", err);
  }
});

// =========================================================
// 3. PROCESAMIENTO Y GUARDADO AL SELECCIONAR CARPETA
// =========================================================
folderInput.addEventListener("change", async (event) => {
  const files = Array.from(event.target.files);
  const mp3Files = files.filter((f) => f.name.toLowerCase().endsWith(".mp3"));
  const lrcFiles = files.filter((f) => f.name.toLowerCase().endsWith(".lrc"));

  if (mp3Files.length === 0) {
    trackListContainer.innerHTML = `<div class="empty-state"><p>No se encontraron pistas .mp3 en esta carpeta.</p></div>`;
    return;
  }

  trackListContainer.innerHTML = `<div class="empty-state"><p>Guardando biblioteca y carátulas...</p></div>`;

  const trackPromises = mp3Files.map(async (mp3, index) => {
    const baseName = mp3.name.slice(0, mp3.name.lastIndexOf("."));
    const matchingLrc = lrcFiles.find(
      (l) => l.name.slice(0, l.name.lastIndexOf(".")) === baseName
    );

    let lrcContent = matchingLrc ? await matchingLrc.text() : "";
    let artist = "Artista desconocido";
    let title = baseName;
    let coverUrl = null;

    if (window.jsmediatags) {
      const tags = await new Promise((resolve) => {
        window.jsmediatags.read(mp3, {
          onSuccess: (tag) => resolve(tag.tags),
          onError: () => resolve(null)
        });
      });

      if (tags) {
        if (tags.artist) artist = tags.artist;
        if (tags.title) title = tags.title;
        if (tags.picture) {
          const data = tags.picture.data;
          const format = tags.picture.format;
          let base64String = "";
          for (let i = 0; i < data.length; i++) {
            base64String += String.fromCharCode(data[i]);
          }
          coverUrl = `data:${format};base64,${window.btoa(base64String)}`;
        }
      }
    }

    return {
      id: `${baseName}_${index}`,
      file: mp3,
      name: title,
      lrcContent: lrcContent,
      url: URL.createObjectURL(mp3),
      coverUrl: coverUrl,
      artist: artist
    };
  });

  const processedTracks = await Promise.all(trackPromises);
  window.App.playlist = processedTracks;

  // Persistir en IndexedDB
  await saveTracksToDB(processedTracks);

  if (window.renderTrackList) window.renderTrackList();
  if (window.App.playlist.length > 0 && window.loadTrack) window.loadTrack(0);
});

// Función auxiliar para letras sincronizadas
window.parseLRC = function (lrcText) {
  const lines = lrcText.split("\n");
  const timeRegex = /\[(\d{2}):(\d{2})\.(\d{2,3})\]/;
  const result = [];

  for (const line of lines) {
    const match = timeRegex.exec(line);
    if (match) {
      const minutes = parseInt(match[1], 10);
      const seconds = parseInt(match[2], 10);
      const ms = parseFloat("0." + match[3]);
      const totalSeconds = minutes * 60 + seconds + ms;
      const text = line.replace(timeRegex, "").trim();
      result.push({ time: totalSeconds, text });
    }
  }
  return result.sort((a, b) => a.time - b.time);
};
