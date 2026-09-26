window.App = {
  playlist: [], // Audios
  videoList: [], // Videos
  currentIndex: -1,
  parsedLyrics: []
};

document.addEventListener("DOMContentLoaded", async () => {
  await window.initDB();

  const storedTracks = await window.loadTracksFromDB();
  if (storedTracks && storedTracks.length > 0) {
    window.App.playlist = storedTracks.filter(t => t.type === 'audio');
    window.App.videoList = storedTracks.filter(t => t.type === 'video');
    window.renderTrackList();
    window.renderVideoList();
  }

  // NAVEGACIÓN PRINCIPAL: AUDIO vs VIDEO
  const btnNavAudio = document.getElementById("btnNavAudio");
  const btnNavVideo = document.getElementById("btnNavVideo");
  const viewAudio = document.getElementById("viewAudio");
  const viewVideo = document.getElementById("viewVideo");

  btnNavAudio.addEventListener("click", () => {
    btnNavAudio.classList.add("active");
    btnNavVideo.classList.remove("active");
    viewAudio.classList.add("active");
    viewVideo.classList.remove("active");
  });

  btnNavVideo.addEventListener("click", () => {
    btnNavVideo.classList.add("active");
    btnNavAudio.classList.remove("active");
    viewVideo.classList.add("active");
    viewAudio.classList.remove("active");
  });

  // PESTAÑAS: CANCIONES vs ARTISTAS
  const tabSongs = document.getElementById("tabSongs");
  const tabArtists = document.getElementById("tabArtists");
  
  tabSongs.addEventListener("click", () => {
    tabSongs.classList.add("active");
    tabArtists.classList.remove("active");
    window.renderTrackList();
  });
  
  tabArtists.addEventListener("click", () => {
    tabArtists.classList.add("active");
    tabSongs.classList.remove("active");
    window.renderArtistList();
  });

  // MODAL DE CONFIGURACIÓN
  const btnOpenSettings = document.getElementById("btnOpenSettings");
  const btnCloseSettings = document.getElementById("btnCloseSettings");
  const settingsModal = document.getElementById("settingsModal");

  btnOpenSettings.addEventListener("click", () => settingsModal.classList.add("active"));
  btnCloseSettings.addEventListener("click", () => settingsModal.classList.remove("active"));
  settingsModal.addEventListener("click", (e) => {
    if (e.target === settingsModal) settingsModal.classList.remove("active");
  });

  // ACENTOS DE COLOR
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

  // LECTOR DE ARCHIVOS (Audio y Video)
  const folderInputs = [
    document.getElementById("folderInput"),
    document.getElementById("folderInputMobile"),
    document.getElementById("folderInputHeader")
  ];

  const handleFolderSelection = async (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;

    const audioFiles = files.filter(f => f.name.toLowerCase().match(/\.(mp3|m4a|wav|aac)$/));
    const videoFiles = files.filter(f => f.name.toLowerCase().match(/\.(mp4|webm|mkv|mov)$/));
    const lrcFiles = files.filter(f => f.name.toLowerCase().endsWith(".lrc"));

    const lrcMap = {};
    for (const lf of lrcFiles) {
      const baseName = lf.name.substring(0, lf.name.lastIndexOf(".")).toLowerCase().trim();
      lrcMap[baseName] = await lf.text();
    }

    // Procesar Audio
    for (const file of audioFiles) {
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
                for (let i = 0; i < data.length; i++) base64String += String.fromCharCode(data[i]);
                coverUrl = `data:${format};base64,${window.btoa(base64String)}`;
              }
              resolve({ title: tags.title || file.name, artist: tags.artist || "Desconocido", coverUrl });
            },
            onError: () => resolve({ title: file.name, artist: "Desconocido", coverUrl: null })
          });
        } else resolve({ title: file.name, artist: "Desconocido", coverUrl: null });
      });

      const trackItem = {
        type: 'audio',
        name: metadata.title,
        artist: metadata.artist,
        coverUrl: metadata.coverUrl,
        lrcContent: matchedLrc,
        fileBlob: file
      };
      window.App.playlist.push(trackItem);
      await window.saveTrackToDB(trackItem);
    }

    // Procesar Video
    for (const file of videoFiles) {
      const videoItem = {
        type: 'video',
        name: file.name.replace(/\.[^/.]+$/, ""),
        artist: "Video Local",
        coverUrl: null,
        lrcContent: null,
        fileBlob: file
      };
      window.App.videoList.push(videoItem);
      await window.saveTrackToDB(videoItem);
    }

    window.renderTrackList();
    window.renderVideoList();
  };

  folderInputs.forEach((input) => { if (input) input.addEventListener("change", handleFolderSelection); });

  // Expansión móvil del player
  const expandArea = document.getElementById("expandPlayerArea");
  const playerBar = document.getElementById("playerBar");
  const btnMinimize = document.getElementById("btnMinimize");

  expandArea.addEventListener("click", () => {
    if (window.innerWidth <= 768) playerBar.classList.add("expanded");
  });
  btnMinimize.addEventListener("click", (e) => {
    e.stopPropagation();
    playerBar.classList.remove("expanded");
  });

  if ("serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js");
});

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
      result.push({ time: timeInSec, text: line.replace(timeExp, "").trim() });
    }
  });
  return result.sort((a, b) => a.time - b.time);
};
