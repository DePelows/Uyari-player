// ============================================================
// Uyari Player — Orquestador principal
// - Carga de música y video con showDirectoryPicker (o fallback)
// - Lectura recursiva de carpetas
// - Emparejamiento automático de .lrc
// - Registro del Service Worker
// - Manejo del banner de reconexión
// ============================================================

// Estado global
window.App = {
  playlist: [],       // pistas de audio
  videoList: [],      // pistas de video
  currentIndex: -1,
  parsedLyrics: [],
};

// ============================================================
// INICIALIZACIÓN
// ============================================================
document.addEventListener("DOMContentLoaded", async () => {
  // 1. Inicializar DB
  await window.initDB();

  // 2. Pedir almacenamiento persistente (una vez)
  await window.requestPersistentStorage();

  // 3. Cargar pistas guardadas
  const storedTracks = await window.loadTracksFromDB();
  if (storedTracks && storedTracks.length > 0) {
    window.App.playlist = storedTracks.filter((t) => t.type === "audio");
    window.App.videoList = storedTracks.filter((t) => t.type === "video");
    window.renderTrackList();
    window.renderVideoList("");
    console.log(
      `[App] Cargadas ${window.App.playlist.length} pistas y ${window.App.videoList.length} videos`
    );
  }

  // 4. Detectar si necesitamos mostrar el banner de reconexión
  await checkHandlesStatus();

  // 5. Registrar listeners de UI
  setupNavigation();
  setupTabs();
  setupSettingsModal();
  setupThemeSelector();
  setupLoadButtons();
  setupReconnectBanner();
  setupPlayerExpand();

  // 6. Registrar Service Worker
  registerServiceWorker();
});

// ============================================================
// ESTADO DE HANDLES: ¿tenemos acceso a las carpetas?
// ============================================================
async function checkHandlesStatus() {
  const hasMusicHandle = (await window.loadHandleFromDB("music")) != null;
  const hasVideoHandle = (await window.loadHandleFromDB("video")) != null;

  // Si no hay ningún handle guardado, no mostramos banner
  // (es la primera vez, el usuario aún no ha cargado nada)
  if (!hasMusicHandle && !hasVideoHandle) {
    return;
  }

  // Si hay handles, verificar permisos
  let needsBanner = false;

  if (hasMusicHandle) {
    const handle = await window.loadHandleFromDB("music");
    const perm = await handle.queryPermission({ mode: "read" });
    if (perm !== "granted") needsBanner = true;
  }

  if (!needsBanner && hasVideoHandle) {
    const handle = await window.loadHandleFromDB("video");
    const perm = await handle.queryPermission({ mode: "read" });
    if (perm !== "granted") needsBanner = true;
  }

  if (needsBanner) {
    showReconnectBanner();
  }
}

// ============================================================
// NAVEGACIÓN
// ============================================================
function setupNavigation() {
  const btnNavAudio = document.getElementById("btnNavAudio");
  const btnNavVideo = document.getElementById("btnNavVideo");
  const viewAudio = document.getElementById("viewAudio");
  const viewVideo = document.getElementById("viewVideo");

  if (btnNavAudio) {
    btnNavAudio.addEventListener("click", () => {
      btnNavAudio.classList.add("active");
      btnNavVideo.classList.remove("active");
      viewAudio.classList.add("active");
      viewVideo.classList.remove("active");
    });
  }

  if (btnNavVideo) {
    btnNavVideo.addEventListener("click", () => {
      btnNavVideo.classList.add("active");
      btnNavAudio.classList.remove("active");
      viewVideo.classList.add("active");
      viewAudio.classList.remove("active");
    });
  }
}

// ============================================================
// TABS (Canciones / Artistas)
// ============================================================
function setupTabs() {
  const tabSongs = document.getElementById("tabSongs");
  const tabArtists = document.getElementById("tabArtists");

  if (tabSongs) {
    tabSongs.addEventListener("click", () => {
      tabSongs.classList.add("active");
      tabArtists.classList.remove("active");
      window.renderTrackList();
    });
  }

  if (tabArtists) {
    tabArtists.addEventListener("click", () => {
      tabArtists.classList.add("active");
      tabSongs.classList.remove("active");
      window.renderArtistList();
    });
  }
}

// ============================================================
// MODAL DE CONFIGURACIÓN
// ============================================================
function setupSettingsModal() {
  const btnOpenSettings = document.getElementById("btnOpenSettings");
  const btnCloseSettings = document.getElementById("btnCloseSettings");
  const settingsModal = document.getElementById("settingsModal");

  if (btnOpenSettings) {
    btnOpenSettings.addEventListener("click", () => {
      settingsModal.classList.add("active");
    });
  }

  if (btnCloseSettings) {
    btnCloseSettings.addEventListener("click", () => {
      settingsModal.classList.remove("active");
    });
  }

  if (settingsModal) {
    settingsModal.addEventListener("click", (e) => {
      if (e.target === settingsModal) settingsModal.classList.remove("active");
    });
  }
}

// ============================================================
// SELECTOR DE TEMA
// ============================================================
function setupThemeSelector() {
  const colorSwatches = document.querySelectorAll(".color-swatch");
  const savedColor = localStorage.getItem("uyari-theme") || "morado";
  document.body.setAttribute("data-theme", savedColor);

  colorSwatches.forEach((swatch) => {
    swatch.addEventListener("click", () => {
      const color = swatch.dataset.color;
      document.body.setAttribute("data-theme", color);
      localStorage.setItem("uyari-theme", color);
    });
  });
}

// ============================================================
// BOTONES DE CARGA (música / video)
// ============================================================
function setupLoadButtons() {
  const btnLoadMusic = document.getElementById("btnLoadMusic");
  const btnLoadMusicHeader = document.getElementById("btnLoadMusicHeader");
  const btnLoadVideo = document.getElementById("btnLoadVideo");
  const btnLoadVideoHeader = document.getElementById("btnLoadVideoHeader");

  if (btnLoadMusic) btnLoadMusic.addEventListener("click", () => loadMusicFolder());
  if (btnLoadMusicHeader) btnLoadMusicHeader.addEventListener("click", () => loadMusicFolder());
  if (btnLoadVideo) btnLoadVideo.addEventListener("click", () => loadVideoFolder());
  if (btnLoadVideoHeader) btnLoadVideoHeader.addEventListener("click", () => loadVideoFolder());
}

// ============================================================
// BANNER DE RECONEXIÓN
// ============================================================
function setupReconnectBanner() {
  const btnReconnect = document.getElementById("btnReconnect");
  if (!btnReconnect) return;

  btnReconnect.addEventListener("click", async () => {
    // Intentar reconectar ambos handles
    let reconnected = false;

    for (const id of ["music", "video"]) {
      const handle = await window.loadHandleFromDB(id);
      if (!handle) continue;

      try {
        const perm = await handle.requestPermission({ mode: "read" });
        if (perm === "granted") reconnected = true;
      } catch (err) {
        console.warn(`[App] Error reconectando ${id}:`, err);
      }
    }

    if (reconnected) {
      hideReconnectBanner();
      // Refrescar la app
      await window.initDB();
      const storedTracks = await window.loadTracksFromDB();
      window.App.playlist = storedTracks.filter((t) => t.type === "audio");
      window.App.videoList = storedTracks.filter((t) => t.type === "video");
      window.renderTrackList();
      window.renderVideoList("");
    } else {
      alert("No se pudo obtener el permiso. Intenta de nuevo.");
    }
  });
}

function showReconnectBanner() {
  const banner = document.getElementById("reconnectBanner");
  if (banner) banner.style.display = "flex";
}

function hideReconnectBanner() {
  const banner = document.getElementById("reconnectBanner");
  if (banner) banner.style.display = "none";
}

// ============================================================
// PLAYER EXPANDIDO (móvil)
// ============================================================
function setupPlayerExpand() {
  const expandArea = document.getElementById("expandPlayerArea");
  const playerBar = document.getElementById("playerBar");
  const btnMinimize = document.getElementById("btnMinimize");

  if (expandArea) {
    expandArea.addEventListener("click", () => {
      if (window.innerWidth <= 768) playerBar.classList.add("expanded");
    });
  }

  if (btnMinimize) {
    btnMinimize.addEventListener("click", (e) => {
      e.stopPropagation();
      playerBar.classList.remove("expanded");
    });
  }
}

// ============================================================
// CARGA DE MÚSICA
// ============================================================
async function loadMusicFolder() {
  if (!window.showDirectoryPicker) {
    // Fallback a webkitdirectory
    return fallbackLoadMusic();
  }

  try {
    const dirHandle = await window.showDirectoryPicker({ mode: "read" });
    await window.saveHandleToDB("music", dirHandle);
    hideReconnectBanner();
    await processMusicDirectory(dirHandle);
  } catch (err) {
    if (err.name === "AbortError") return; // usuario canceló
    console.error("[App] Error al cargar música:", err);
    alert("Error al cargar la carpeta de música: " + err.message);
  }
}

async function processMusicDirectory(dirHandle) {
  const musicTracks = [];
  const lrcMap = {}; // baseName → contenido LRC

  // 1. Recorrer la carpeta (música es plana, no hay subcarpetas profundas)
  const entries = [];
  for await (const entry of dirHandle.values()) {
    entries.push(entry);
  }

  // 2. Primero procesar todos los .lrc
  for (const entry of entries) {
    if (entry.kind === "file" && entry.name.toLowerCase().endsWith(".lrc")) {
      const file = await entry.getFile();
      const text = await file.text();
      const baseName = entry.name.substring(0, entry.name.lastIndexOf(".")).toLowerCase().trim();
      lrcMap[baseName] = text;
    }
  }

  // 3. Procesar archivos de audio
  const audioEntries = entries.filter(
    (e) => e.kind === "file" && /\.(mp3|m4a|wav|aac)$/i.test(e.name)
  );

  let processed = 0;
  const total = audioEntries.length;

  for (const entry of audioEntries) {
    const file = await entry.getFile();
    const baseName = entry.name.substring(0, entry.name.lastIndexOf(".")).toLowerCase().trim();
    const matchedLrc = lrcMap[baseName] || null;

    const metadata = await readAudioMetadata(file);

    const trackItem = {
      type: "audio",
      name: metadata.title || file.name.replace(/\.[^/.]+$/, ""),
      path: `Musica/${entry.name}`, // path lógico
      artist: metadata.artist || "Desconocido",
      coverUrl: metadata.coverUrl || null,
      lrcContent: matchedLrc,
      fileBlob: file, // en memoria mientras la sesión esté abierta
    };

    musicTracks.push(trackItem);

    processed++;
    if (processed % 10 === 0) {
      await new Promise((r) => setTimeout(r, 0)); // ceder hilo
      console.log(`[App] Procesando ${processed}/${total}...`);
    }
  }

  // 4. Guardar en DB y actualizar UI
  await window.saveManyTracksToDB(musicTracks);

  // Fusionar con playlist actual (evitando duplicados)
  const existingPaths = new Set(window.App.playlist.map((t) => t.path));
  musicTracks.forEach((t) => {
    if (!existingPaths.has(t.path)) {
      window.App.playlist.push(t);
    } else {
      // Actualizar el existente con el nuevo blob en memoria
      const idx = window.App.playlist.findIndex((x) => x.path === t.path);
      if (idx >= 0) window.App.playlist[idx] = t;
    }
  });

  window.renderTrackList();
  console.log(`[App] ${musicTracks.length} pistas procesadas`);
}

// ============================================================
// CARGA DE VIDEOS (con subcarpetas recursivas)
// ============================================================
async function loadVideoFolder() {
  if (!window.showDirectoryPicker) {
    return fallbackLoadVideo();
  }

  try {
    const dirHandle = await window.showDirectoryPicker({ mode: "read" });
    await window.saveHandleToDB("video", dirHandle);
    hideReconnectBanner();
    await processVideoDirectory(dirHandle);
  } catch (err) {
    if (err.name === "AbortError") return;
    console.error("[App] Error al cargar videos:", err);
    alert("Error al cargar la carpeta de videos: " + err.message);
  }
}

async function processVideoDirectory(dirHandle) {
  const videoTracks = [];
  await walkVideoDir(dirHandle, dirHandle.name, videoTracks);

  // Guardar en DB
  await window.saveManyTracksToDB(videoTracks);

  // Fusionar con lista actual
  const existingPaths = new Set(window.App.videoList.map((t) => t.path));
  videoTracks.forEach((t) => {
    if (!existingPaths.has(t.path)) {
      window.App.videoList.push(t);
    } else {
      const idx = window.App.videoList.findIndex((x) => x.path === t.path);
      if (idx >= 0) window.App.videoList[idx] = t;
    }
  });

  window.renderVideoList("");
  console.log(`[App] ${videoTracks.length} videos procesados`);
}

async function walkVideoDir(dirHandle, currentPath, result) {
  for await (const entry of dirHandle.values()) {
    if (entry.kind === "file") {
      if (/\.(mp4|webm|mkv|mov)$/i.test(entry.name)) {
        result.push({
          type: "video",
          name: entry.name.replace(/\.[^/.]+$/, ""),
          path: `${currentPath}/${entry.name}`, // "Videos/Anime/Serie/Naruto/cap01.mp4"
          artist: "Video Local",
          coverUrl: null,
          lrcContent: null,
          fileBlob: null, // los videos se piden al handle bajo demanda
        });
      }
    } else if (entry.kind === "directory") {
      await walkVideoDir(entry, `${currentPath}/${entry.name}`, result);
    }
  }
}

// ============================================================
// FALLBACK: webkitdirectory (para navegadores sin showDirectoryPicker)
// ============================================================
function fallbackLoadMusic() {
  const input = document.createElement("input");
  input.type = "file";
  input.webkitdirectory = true;
  input.directory = true;
  input.multiple = true;
  input.accept = ".mp3,.m4a,.wav,.aac,.lrc";

  input.addEventListener("change", async (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;

    const audioFiles = files.filter((f) => /\.(mp3|m4a|wav|aac)$/i.test(f.name));
    const lrcFiles = files.filter((f) => f.name.toLowerCase().endsWith(".lrc"));

    const lrcMap = {};
    for (const lf of lrcFiles) {
      const baseName = lf.name.substring(0, lf.name.lastIndexOf(".")).toLowerCase().trim();
      lrcMap[baseName] = await lf.text();
    }

    const tracks = [];
    for (const file of audioFiles) {
      const baseName = file.name.substring(0, file.name.lastIndexOf(".")).toLowerCase().trim();
      const matchedLrc = lrcMap[baseName] || null;
      const metadata = await readAudioMetadata(file);

      tracks.push({
        type: "audio",
        name: metadata.title || file.name.replace(/\.[^/.]+$/, ""),
        path: file.webkitRelativePath || file.name,
        artist: metadata.artist || "Desconocido",
        coverUrl: metadata.coverUrl || null,
        lrcContent: matchedLrc,
        fileBlob: file,
      });
    }

    await window.saveManyTracksToDB(tracks);
    window.App.playlist = tracks;
    window.renderTrackList();
  });

  input.click();
}

function fallbackLoadVideo() {
  const input = document.createElement("input");
  input.type = "file";
  input.webkitdirectory = true;
  input.directory = true;
  input.multiple = true;
  input.accept = ".mp4,.webm,.mkv,.mov";

  input.addEventListener("change", async (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;

    const videos = files
      .filter((f) => /\.(mp4|webm|mkv|mov)$/i.test(f.name))
      .map((file) => ({
        type: "video",
        name: file.name.replace(/\.[^/.]+$/, ""),
        path: file.webkitRelativePath || file.name,
        artist: "Video Local",
        coverUrl: null,
        lrcContent: null,
        fileBlob: file,
      }));

    await window.saveManyTracksToDB(videos);
    window.App.videoList = videos;
    window.renderVideoList("");
  });

  input.click();
}

// ============================================================
// LECTURA DE METADATOS DE AUDIO (con jsmediatags)
// ============================================================
function readAudioMetadata(file) {
  return new Promise((resolve) => {
    if (!window.jsmediatags) {
      return resolve({ title: file.name, artist: "Desconocido", coverUrl: null });
    }

    window.jsmediatags.read(file, {
      onSuccess: (tag) => {
        const tags = tag.tags;
        let coverUrl = null;

        if (tags.picture) {
          const { data, format } = tags.picture;
          let base64String = "";
          const chunkSize = 8192;
          for (let i = 0; i < data.length; i += chunkSize) {
            base64String += String.fromCharCode.apply(
              null,
              data.slice(i, i + chunkSize)
            );
          }
          coverUrl = `data:${format};base64,${window.btoa(base64String)}`;
        }

        resolve({
          title: tags.title || null,
          artist: tags.artist || null,
          coverUrl,
        });
      },
      onError: () => {
        resolve({ title: null, artist: null, coverUrl: null });
      },
    });
  });
}

// ============================================================
// PARSER DE LRC
// ============================================================
window.parseLRC = function (lrcText) {
  if (!lrcText) return [];
  const lines = lrcText.split("\n");
  const result = [];
  const timeExp = /\[(\d{2}):(\d{2})\.(\d{2,3})\]/g;

  lines.forEach((line) => {
    // Buscar todas las marcas de tiempo en la línea
    const times = [];
    let match;
    while ((match = timeExp.exec(line)) !== null) {
      const minutes = parseInt(match[1], 10);
      const seconds = parseInt(match[2], 10);
      const millis = parseInt(match[3], 10);
      const timeInSec =
        minutes * 60 + seconds + millis / (match[3].length === 3 ? 1000 : 100);
      times.push(timeInSec);
    }
    timeExp.lastIndex = 0;

    if (times.length > 0) {
      const text = line.replace(timeExp, "").trim();
      times.forEach((time) => {
        result.push({ time, text });
      });
    }
  });

  return result.sort((a, b) => a.time - b.time);
};

// ============================================================
// SERVICE WORKER
// ============================================================
function registerServiceWorker() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker
      .register("./sw.js")
      .then((reg) => {
        console.log("[App] SW registrado:", reg.scope);
      })
      .catch((err) => {
        console.warn("[App] Error registrando SW:", err);
      });
  }
}

// ============================================================
// REFRESCO MANUAL (por si acaso)
// ============================================================
window.refreshLibrary = async function () {
  await window.initDB();
  const storedTracks = await window.loadTracksFromDB();
  window.App.playlist = storedTracks.filter((t) => t.type === "audio");
  window.App.videoList = storedTracks.filter((t) => t.type === "video");
  window.renderTrackList();
  window.renderVideoList("");
};
