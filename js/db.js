const DB_NAME = "VorticeMusicDB";
const DB_VERSION = 1;
const STORE_NAME = "tracks";

let dbInstance = null;

// Inicializa IndexedDB
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

    request.onerror = (e) => {
      console.error("Error al abrir IndexedDB:", e.target.error);
      reject(e.target.error);
    };
  });
};

// Guarda una pista en la base de datos local
window.saveTrackToDB = function(track) {
  return new Promise((resolve, reject) => {
    if (!dbInstance) return resolve();

    const transaction = dbInstance.transaction([STORE_NAME], "readwrite");
    const store = transaction.objectStore(STORE_NAME);

    const record = {
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

// Carga todas las pistas guardadas y reconstruye sus ObjectURLs
window.loadTracksFromDB = function() {
  return new Promise((resolve, reject) => {
    if (!dbInstance) return resolve([]);

    const transaction = dbInstance.transaction([STORE_NAME], "readonly");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();

    request.onsuccess = (e) => {
      const records = e.target.result || [];
      const tracks = records.map((r) => ({
        name: r.name,
        artist: r.artist,
        coverUrl: r.coverUrl,
        lrcContent: r.lrcContent,
        fileBlob: r.fileBlob,
        url: r.fileBlob ? URL.createObjectURL(r.fileBlob) : ""
      }));
      resolve(tracks);
    };

    request.onerror = (e) => reject(e.target.error);
  });
};

// Vacía el almacén de datos
window.clearLibrary = async function() {
  if (!confirm("¿Deseas vaciar todas las pistas guardadas en el dispositivo?")) return;

  if (dbInstance) {
    const transaction = dbInstance.transaction([STORE_NAME], "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    store.clear();
    transaction.oncomplete = () => {
      window.App.playlist = [];
      window.App.currentIndex = -1;
      window.App.parsedLyrics = [];
      window.renderTrackList();
      const audio = document.getElementById("audioElement");
      if (audio) {
        audio.pause();
        audio.src = "";
      }
      location.reload();
    };
  }
};
