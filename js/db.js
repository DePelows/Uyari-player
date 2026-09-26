const DB_NAME = "VorticeMusicDB";
const DB_VERSION = 2; // Subimos versión por precaución al añadir 'type'
const STORE_NAME = "tracks";

let dbInstance = null;

window.initDB = function() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id", autoIncrement: true });
      }
    };

    request.onsuccess = (e) => {
      dbInstance = e.target.result;
      resolve(dbInstance);
    };

    request.onerror = (e) => reject(e.target.error);
  });
};

window.saveTrackToDB = function(track) {
  return new Promise((resolve, reject) => {
    if (!dbInstance) return resolve();
    const transaction = dbInstance.transaction([STORE_NAME], "readwrite");
    const store = transaction.objectStore(STORE_NAME);

    const record = {
      type: track.type || 'audio', // Se guardan audios y videos marcados
      name: track.name,
      artist: track.artist,
      coverUrl: track.coverUrl,
      lrcContent: track.lrcContent,
      fileBlob: track.fileBlob
    };

    const request = store.add(record);
    request.onsuccess = () => resolve();
    request.onerror = (e) => reject(e.target.error);
  });
};

window.loadTracksFromDB = function() {
  return new Promise((resolve, reject) => {
    if (!dbInstance) return resolve([]);
    const transaction = dbInstance.transaction([STORE_NAME], "readonly");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();

    request.onsuccess = (e) => {
      const records = e.target.result || [];
      const tracks = records.map((r) => ({
        type: r.type || 'audio', // Por defecto audio si era viejo
        name: r.name,
        artist: r.artist,
        coverUrl: r.coverUrl,
        lrcContent: r.lrcContent,
        fileBlob: r.fileBlob,
        url: "" 
      }));
      resolve(tracks);
    };

    request.onerror = (e) => reject(e.target.error);
  });
};

window.clearLibrary = async function() {
  if (!confirm("¿Deseas vaciar todas las pistas y videos guardados en el dispositivo?")) return;
  if (dbInstance) {
    const transaction = dbInstance.transaction([STORE_NAME], "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    store.clear();
    transaction.oncomplete = () => {
      window.App.playlist = [];
      window.App.videoList = [];
      window.App.currentIndex = -1;
      window.App.parsedLyrics = [];
      window.renderTrackList();
      window.renderVideoList();
      
      const audio = document.getElementById("audioElement");
      if (audio) { audio.pause(); audio.src = ""; }
      
      const video = document.getElementById("mainVideoPlayer");
      if (video) { video.pause(); video.src = ""; }

      document.getElementById("settingsModal").classList.remove("active");
    };
  }
};
