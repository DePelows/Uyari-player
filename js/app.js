window.App = {
  playlist: [],
  currentIndex: -1,
  parsedLyrics: []
};

document.addEventListener("DOMContentLoaded", async () => {
  // 1. Inicializar base de datos IndexedDB
  await window.initDB();

  // 2. Cargar pistas previamente guardadas
  const storedTracks = await window.loadTracksFromDB();
  if (storedTracks && storedTracks.length > 0) {
    window.App.playlist = storedTracks;
    window.renderTrackList();
  }

  // 3. Conmutador de Vistas (Biblioteca / Configuración)
  const btnNavHome = document.getElementById("btnNavHome");
  const btnNavSettings = document.getElementById("btnNavSettings");
  const viewHome = document.getElementById("viewHome");
  const viewSettings = document.getElementById("viewSettings");

  btnNavHome.addEventListener("click", () => {
    btnNavHome.classList.add("active");
    btnNavSettings.classList.remove("active");
    viewHome.classList.add("active");
    viewSettings.classList.remove("active");
  });

  btnNavSettings.addEventListener("click", () => {
    btnNavSettings.classList.add("active");
    btnNavHome.classList.remove("active");
    viewSettings.classList.add("active");
    viewHome.classList.remove("active");
  });

  // 4. Selector de Acento de Color
  const colorSwatches = document.querySelectorAll(".color-swatch");
  const savedColor = localStorage.getItem("vortice-theme") || "verde";
  document.body.setAttribute("data-theme", savedColor);

  colorSwatches.forEach((swatch) => {
    swatch.addEventListener("click", () => {
      const color = swatch.dataset.color;
      document.body.setAttribute("data-theme", color);
      localStorage.setItem("vortice-theme", color);
    });
  });

  // 5. Carga Unificada de Carpetas (Desktop, Móvil vacío y Botón de cabecera)
  const folderInputs = [
    document.getElementById("folderInput"),
    document.getElementById("folderInputMobile"),
    document.getElementById("folderInputHeader")
  ];

  const handleFolderSelection = async (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;

    const mp3Files = files.filter(f => f.name.toLowerCase().endsWith(".mp3"));
    const lrcFiles = files.filter(f => f.name.toLowerCase().endsWith(".lrc"));

    const lrcMap = {};
    for (const lf of lrcFiles) {
      const baseName = lf.name.substring(0, lf.name.lastIndexOf(".")).toLowerCase().trim();
      lrcMap[baseName] = await lf.text();
    }

    const newTracks = [];

    for (const file of mp3Files) {
      const baseName = file.name.substring(0, file.name.lastIndexOf(".")).toLowerCase().trim();
      const matchedLrc = lrcMap[baseName] || null;

      const metadata = await new Promise((resolve) => {
        if (window.jsmediatags) {
          window.jsmediatags.read(file, {
            onSuccess: (tag) => {
              const tags = tag.tags;
              let coverUrl = null;

              if (tags.picture) {
                const { data, format } = tags.picture;
                let base64String = "";
                for (let i = 0; i < data.length; i++) {
                  base64String += String.fromCharCode(data[i]);
                }
                coverUrl = `data:${format};base64,${window.btoa(base64String)}`;
              }

              resolve({
                title: tags.title || file.name.replace(/\.[^/.]+$/, ""),
                artist: tags.artist || "Artista Desconocido",
                coverUrl: coverUrl
              });
            },
            onError: () => {
              resolve({
                title: file.name.replace(/\.[^/.]+$/, ""),
                artist: "Artista Desconocido",
                coverUrl: null
              });
            }
          });
        } else {
          resolve({
            title: file.name.replace(/\.[^/.]+$/, ""),
            artist: "Artista Desconocido",
            coverUrl: null
          });
        }
      });

      const trackItem = {
        name: metadata.title,
        artist: metadata.artist,
        coverUrl: metadata.coverUrl,
        lrcContent: matchedLrc,
        fileBlob: file,
        url: URL.createObjectURL(file)
      };

      newTracks.push(trackItem);
      await window.saveTrackToDB(trackItem);
    }

    window.App.playlist = newTracks;
    window.renderTrackList();
    if (window.App.playlist.length > 0) {
      window.loadTrack(0, false);
    }
  };

  folderInputs.forEach((input) => {
    if (input) {
      input.addEventListener("change", handleFolderSelection);
    }
  });

  // 6. Expandir / Minimizar reproductor en móviles
  const expandArea = document.getElementById("expandPlayerArea");
  const playerBar = document.getElementById("playerBar");
  const btnMinimize = document.getElementById("btnMinimize");

  expandArea.addEventListener("click", () => {
    if (window.innerWidth <= 768) {
      playerBar.classList.add("expanded");
    }
  });

  btnMinimize.addEventListener("click", (e) => {
    e.stopPropagation();
    playerBar.classList.remove("expanded");
  });

  // 7. Registro de Service Worker para PWA Offline
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker
      .register("./sw.js")
      .then(() => console.log("Service Worker registrado con éxito."))
      .catch((err) => console.warn("Error al registrar SW:", err));
  }
});

// Parser de letras sincronizadas (.lrc)
window.parseLRC = function(lrcText) {
  if (!lrcText) return [];
  const lines = lrcText.split("\n");
  const result = [];
  const timeExp = /\[(\d{2}):(\d{2})\.(\d{2,3})\]/;

  lines.forEach((line) => {
    const match = timeExp.exec(line);
    if (match) {
      const minutes = parseInt(match[1], 10);
      const seconds = parseInt(match[2], 10);
      const millis = parseInt(match[3], 10);
      const timeInSec = minutes * 60 + seconds + (millis / (match[3].length === 3 ? 1000 : 100));
      const text = line.replace(timeExp, "").trim();
      result.push({ time: timeInSec, text: text });
    }
  });

  return result.sort((a, b) => a.time - b.time);
};
