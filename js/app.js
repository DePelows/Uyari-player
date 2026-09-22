document.addEventListener("DOMContentLoaded", () => {
  // =========================================================
  // 1. GESTIÓN DE TEMA Y COLORES DE ACENTO
  // =========================================================
  const THEME_STORAGE_KEY = "spotify_theme_accent";
  const DEFAULT_THEME = "verde";
  const colorSwatches = document.querySelectorAll(".color-swatch");

  function aplicarColorAcento(color) {
    document.body.setAttribute("data-theme", color);
    localStorage.setItem(THEME_STORAGE_KEY, color);

    colorSwatches.forEach((swatch) => {
      if (swatch.dataset.color === color) {
        swatch.classList.add("selected");
      } else {
        swatch.classList.remove("selected");
      }
    });
  }

  const temaGuardado = localStorage.getItem(THEME_STORAGE_KEY) || DEFAULT_THEME;
  aplicarColorAcento(temaGuardado);

  colorSwatches.forEach((swatch) => {
    swatch.addEventListener("click", () => {
      aplicarColorAcento(swatch.dataset.color);
    });
  });

  // =========================================================
  // 2. NAVEGACIÓN BLINDADA (BIBLIOTECA VS CONFIGURACIÓN)
  // =========================================================
  const btnNavHome = document.getElementById("btnNavHome");
  const btnNavSettings = document.getElementById("btnNavSettings");
  const viewHome = document.getElementById("viewHome");
  const viewSettings = document.getElementById("viewSettings");

  function switchView(target) {
    if (!viewHome || !viewSettings) return;

    if (target === "settings") {
      // Activar botón de configuración
      btnNavSettings.classList.add("active");
      btnNavHome.classList.remove("active");

      // Mostrar vista de configuración y ocultar home
      viewHome.classList.remove("active");
      viewHome.style.display = "none";

      viewSettings.classList.add("active");
      viewSettings.style.display = "block";
    } else {
      // Activar botón de biblioteca
      btnNavHome.classList.add("active");
      btnNavSettings.classList.remove("active");

      // Mostrar vista de home y ocultar configuración
      viewSettings.classList.remove("active");
      viewSettings.style.display = "none";

      viewHome.classList.add("active");
      viewHome.style.display = "block";
    }
  }

  if (btnNavHome) {
    btnNavHome.addEventListener("click", (e) => {
      e.preventDefault();
      switchView("home");
    });
  }

  if (btnNavSettings) {
    btnNavSettings.addEventListener("click", (e) => {
      e.preventDefault();
      switchView("settings");
    });
  }

  // =========================================================
  // 3. REPRODUCTOR EXPANDIDO (AL HACER CLIC EN LA CARÁTULA)
  // =========================================================
  const playerBar = document.getElementById("playerBar");
  const expandPlayerArea = document.getElementById("expandPlayerArea");
  const btnMinimize = document.getElementById("btnMinimize");

  if (expandPlayerArea && playerBar && btnMinimize) {
    expandPlayerArea.addEventListener("click", () => {
      if (!playerBar.classList.contains("expanded")) {
        playerBar.classList.add("expanded");
        setTimeout(() => {
          if (window.scrollToActiveLyric) window.scrollToActiveLyric();
        }, 300);
      }
    });

    btnMinimize.addEventListener("click", (e) => {
      e.stopPropagation();
      playerBar.classList.remove("expanded");
    });
  }
});
