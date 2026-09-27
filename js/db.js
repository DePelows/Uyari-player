// ============================================================
// Uyari Player — Capa de persistencia (IndexedDB)
// Maneja:
//   - Metadatos de pistas (audio + video)
//   - Handles de carpetas (File System Access API)
//   - Deduplicación por path
//   - Reconexión automática si la DB se cierra
// ============================================================

const DB_NAME = "UyariDB";
const DB_VERSION = 1;
const STORE_TRACKS = "tracks";
const STORE_HANDLES = "handles";

let dbInstance = null;

// ------------------------------------------------------------
// initDB: abre (o crea) la base de datos
// ------------------------------------------------------------
window.initDB = function () {
  return new Promise((resolve, reject) => {
    // Si ya hay una instancia abierta y válida, resolver directo
    if (dbInstance && dbInstance.objectStoreNames) {
      return resolve(dbInstance);
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (e) => {
      const db = e.target.result;

      // Store de pistas (audio + video)
      if (!db.objectStoreNames.contains(STORE_TRACKS)) {
        const store = db.createObjectStore(STORE_TRACKS, { keyPath: "path" });
        store.createIndex("type", "type", { unique: false });
      }

      // Store de handles de carpetas
      if (!db.objectStoreNames.contains(STORE_HANDLES)) {
        db.createObjectStore(STORE_HANDLES, { keyPath: "id" });
      }
    };

    request.onsuccess = (e) => {
      dbInstance = e.target.result;

      // Manejar cierre inesperado de la conexión
      dbInstance.onclose = () => {
        console.warn("[DB] Conexión cerrada inesperadamente");
        dbInstance = null;
      };

      // Manejar upgrade desde otra pestaña
      dbInstance.onversionchange = () => {
        console.warn("[DB] Otra pestaña actualizó el esquema. Cerrando...");
        dbInstance.close();
        dbInstance = null;
        alert("La base de datos fue actualizada. Recarga la página.");
      };

      resolve(dbInstance);
    };

    request.onerror = (e) => {
      console.error("[DB] Error al abrir:", e.target.error);
      reject(e.target.error);
    };

    request.onblocked = () => {
      console.warn("[DB] Apertura bloqueada por otra pestaña abierta");
    };
  });
};

// ------------------------------------------------------------
// ensureDB: garantiza que dbInstance esté abierta y válida
// ------------------------------------------------------------
async function ensureDB() {
  if (!dbInstance || !dbInstance.objectStoreNames) {
    await window.initDB();
  }
  return dbInstance;
}

// ------------------------------------------------------------
// saveTrackToDB: guarda o actualiza una pista
// Usa put() con keyPath=path → inserta o actualiza, nunca duplica
// ------------------------------------------------------------
window.saveTrackToDB = async function (track) {
  try {
    const db = await ensureDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_TRACKS], "readwrite");
      const store = transaction.objectStore(STORE_TRACKS);

      const record = {
        path: track.path,                         // clave única
        type: track.type || "audio",              // "audio" | "video"
        name: track.name,
        artist: track.artist || "Desconocido",
        coverUrl: track.coverUrl || null,
        lrcContent: track.lrcContent || null,
        // No guardamos fileBlob — se obtiene bajo demanda desde el handle
      };

      const request = store.put(record);
      request.onsuccess = () => resolve();
      request.onerror = (e) => reject(e.target.error);
      transaction.onabort = (e) => reject(e.target.error);
    });
  } catch (err) {
    console.error("[DB] Error en saveTrackToDB:", err);
    throw err;
  }
};

// ------------------------------------------------------------
// saveManyTracksToDB: guarda varias pistas en una sola transacción
// (mucho más rápido que llamar saveTrackToDB en bucle)
// ------------------------------------------------------------
window.saveManyTracksToDB = async function (tracks) {
  if (!tracks || tracks.length === 0) return;
  try {
    const db = await ensureDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_TRACKS], "readwrite");
      const store = transaction.objectStore(STORE_TRACKS);

      tracks.forEach((track) => {
        const record = {
          path: track.path,
          type: track.type || "audio",
          name: track.name,
          artist: track.artist || "Desconocido",
          coverUrl: track.coverUrl || null,
          lrcContent: track.lrcContent || null,
        };
        store.put(record);
      });

      transaction.oncomplete = () => resolve();
      transaction.onerror = (e) => reject(e.target.error);
      transaction.onabort = (e) => reject(e.target.error);
    });
  } catch (err) {
    console.error("[DB] Error en saveManyTracksToDB:", err);
    throw err;
  }
};

// ------------------------------------------------------------
// loadTracksFromDB: devuelve todas las pistas guardadas
// ------------------------------------------------------------
window.loadTracksFromDB = async function () {
  try {
    const db = await ensureDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_TRACKS], "readonly");
      const store = transaction.objectStore(STORE_TRACKS);
      const request = store.getAll();

      request.onsuccess = (e) => {
        const records = e.target.result || [];
        const tracks = records.map((r) => ({
          type: r.type || "audio",
          name: r.name,
          path: r.path,
          artist: r.artist,
          coverUrl: r.coverUrl,
          lrcContent: r.lrcContent,
          fileBlob: null,   // se rellenará bajo demanda desde el handle
          url: "",
        }));
        resolve(tracks);
      };

      request.onerror = (e) => reject(e.target.error);
      transaction.onerror = (e) => reject(e.target.error);
    });
  } catch (err) {
    console.error("[DB] Error en loadTracksFromDB:", err);
    return [];
  }
};

// ------------------------------------------------------------
// getTrackByPath: busca una pista concreta por su path
// ------------------------------------------------------------
window.getTrackByPath = async function (path) {
  try {
    const db = await ensureDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_TRACKS], "readonly");
      const store = transaction.objectStore(STORE_TRACKS);
      const request = store.get(path);

      request.onsuccess = (e) => resolve(e.target.result || null);
      request.onerror = (e) => reject(e.target.error);
    });
  } catch (err) {
    console.error("[DB] Error en getTrackByPath:", err);
    return null;
  }
};

// ------------------------------------------------------------
// deleteTracksByPrefix: borra todas las pistas cuyo path empieza por un prefijo
// Útil si el usuario recarga una carpeta y hay archivos borrados en disco
// ------------------------------------------------------------
window.deleteTracksByPrefix = async function (prefix) {
  try {
    const db = await ensureDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_TRACKS], "readwrite");
      const store = transaction.objectStore(STORE_TRACKS);
      const request = store.openCursor();
      let deleted = 0;

      request.onsuccess = (e) => {
        const cursor = e.target.result;
        if (cursor) {
          if (cursor.key.startsWith(prefix)) {
            cursor.delete();
            deleted++;
          }
          cursor.continue();
        } else {
          resolve(deleted);
        }
      };

      request.onerror = (e) => reject(e.target.error);
      transaction.onerror = (e) => reject(e.target.error);
    });
  } catch (err) {
    console.error("[DB] Error en deleteTracksByPrefix:", err);
    return 0;
  }
};

// ============================================================
// HANDLES DE CARPETAS (File System Access API)
// ============================================================

// ------------------------------------------------------------
// saveHandleToDB: guarda un FileSystemDirectoryHandle
// id: "music" o "video"
// ------------------------------------------------------------
window.saveHandleToDB = async function (id, handle) {
  try {
    const db = await ensureDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_HANDLES], "readwrite");
      const store = transaction.objectStore(STORE_HANDLES);
      const request = store.put({ id, handle });

      request.onsuccess = () => resolve();
      request.onerror = (e) => reject(e.target.error);
      transaction.onerror = (e) => reject(e.target.error);
    });
  } catch (err) {
    console.error("[DB] Error en saveHandleToDB:", err);
    throw err;
  }
};

// ------------------------------------------------------------
// loadHandleFromDB: recupera un FileSystemDirectoryHandle
// ------------------------------------------------------------
window.loadHandleFromDB = async function (id) {
  try {
    const db = await ensureDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_HANDLES], "readonly");
      const store = transaction.objectStore(STORE_HANDLES);
      const request = store.get(id);

      request.onsuccess = (e) => {
        const record = e.target.result;
        resolve(record ? record.handle : null);
      };
      request.onerror = (e) => reject(e.target.error);
    });
  } catch (err) {
    console.error("[DB] Error en loadHandleFromDB:", err);
    return null;
  }
};

// ------------------------------------------------------------
// deleteHandleFromDB: elimina un handle guardado
// ------------------------------------------------------------
window.deleteHandleFromDB = async function (id) {
  try {
    const db = await ensureDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_HANDLES], "readwrite");
      const store = transaction.objectStore(STORE_HANDLES);
      const request = store.delete(id);

      request.onsuccess = () => resolve();
      request.onerror = (e) => reject(e.target.error);
    });
  } catch (err) {
    console.error("[DB] Error en deleteHandleFromDB:", err);
  }
};

// ============================================================
// UTILIDADES
// ============================================================

// ------------------------------------------------------------
// clearLibrary: vacía TODA la base de datos
// ------------------------------------------------------------
window.clearLibrary = async function () {
  if (!confirm("¿Deseas vaciar todas las pistas y videos guardados en el dispositivo?")) return;

  try {
    const db = await ensureDB();

    // Limpiar stores
    await new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_TRACKS, STORE_HANDLES], "readwrite");
      transaction.objectStore(STORE_TRACKS).clear();
      transaction.objectStore(STORE_HANDLES).clear();
      transaction.oncomplete = () => resolve();
      transaction.onerror = (e) => reject(e.target.error);
    });

    // Resetear estado en memoria
    if (window.App) {
      window.App.playlist = [];
      window.App.videoList = [];
      window.App.currentIndex = -1;
      window.App.parsedLyrics = [];
    }

    // Detener reproductores
    const audio = document.getElementById("audioElement");
    if (audio) {
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
    }
    const video = document.getElementById("mainVideoPlayer");
    if (video) {
      video.pause();
      video.removeAttribute("src");
      video.load();
    }

    // Revocar URLs de objeto pendientes
    if (window.currentVideoUrl) {
      try { URL.revokeObjectURL(window.currentVideoUrl); } catch (e) {}
      window.currentVideoUrl = null;
    }
    if (window.currentAudioUrl) {
      try { URL.revokeObjectURL(window.currentAudioUrl); } catch (e) {}
      window.currentAudioUrl = null;
    }

    // Re-renderizar
    if (window.renderTrackList) window.renderTrackList();
    if (window.renderVideoList) window.renderVideoList("");
    if (window.updatePlayerUI) {
      window.updatePlayerUI({ name: "Selecciona una pista", artist: "-", coverUrl: null });
    }

    // Cerrar modal
    const modal = document.getElementById("settingsModal");
    if (modal) modal.classList.remove("active");

    // Ocultar banner de reconexión
    const banner = document.getElementById("reconnectBanner");
    if (banner) banner.style.display = "none";

    console.log("[DB] Biblioteca vaciada");
  } catch (err) {
    console.error("[DB] Error en clearLibrary:", err);
    alert("Error al vaciar la biblioteca: " + err.message);
  }
};

// ------------------------------------------------------------
// requestPersistentStorage: pide a Chrome que no borre los datos
// ------------------------------------------------------------
window.requestPersistentStorage = async function () {
  try {
    if (navigator.storage && navigator.storage.persist) {
      const already = await navigator.storage.persisted();
      if (already) {
        console.log("[Storage] Ya es persistente");
        return true;
      }
      const granted = await navigator.storage.persist();
      console.log("[Storage] Persistencia concedida:", granted);
      return granted;
    }
  } catch (err) {
    console.warn("[Storage] Error al pedir persistencia:", err);
  }
  return false;
};

// ------------------------------------------------------------
// estimateStorage: devuelve cuota y uso actual
// ------------------------------------------------------------
window.estimateStorage = async function () {
  try {
    if (navigator.storage && navigator.storage.estimate) {
      const { quota, usage } = await navigator.storage.estimate();
      return { quota, usage };
    }
  } catch (err) {
    console.warn("[Storage] Error al estimar:", err);
  }
  return null;
};
