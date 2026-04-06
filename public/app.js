const students = window.studentsData || [];

const searchInput = document.getElementById("searchInput");
const studentGrid = document.getElementById("studentGrid");
const resultCount = document.getElementById("resultCount");
const themeToggleButton = document.querySelector("[data-theme-toggle]");
const themeLabel = document.querySelector("[data-theme-label]");
const suggestionPopup = document.getElementById("suggestionPopup");
const suggestedSongsSection = document.getElementById("suggestedSongsSection");

const THEME_ORDER = ["system", "light", "dark"];
const THEME_TEXT = {
  system: "System",
  light: "Light",
  dark: "Dark"
};

function getStoredThemeMode() {
  return window.localStorage.getItem("themeMode") || "system";
}

function resolveTheme(mode) {
  if (mode === "dark" || mode === "light") {
    return mode;
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyTheme(mode) {
  const resolvedTheme = resolveTheme(mode);
  document.documentElement.dataset.theme = resolvedTheme;
  document.documentElement.dataset.themeMode = mode;

  if (themeToggleButton) {
    themeToggleButton.dataset.mode = mode;
    themeToggleButton.title = `Theme: ${THEME_TEXT[mode]}`;
  }

  if (themeLabel) {
    themeLabel.textContent = THEME_TEXT[mode];
  }
}

function initThemeControls() {
  const storedThemeMode = getStoredThemeMode();
  applyTheme(storedThemeMode);

  if (!themeToggleButton) {
    return;
  }

  themeToggleButton.addEventListener("click", () => {
    const currentMode = getStoredThemeMode();
    const currentIndex = THEME_ORDER.indexOf(currentMode);
    const nextMode = THEME_ORDER[(currentIndex + 1) % THEME_ORDER.length];
    window.localStorage.setItem("themeMode", nextMode);
    applyTheme(nextMode);
  });

  const colorSchemeMatcher = window.matchMedia("(prefers-color-scheme: dark)");
  const handleSystemThemeChange = () => {
    if (getStoredThemeMode() === "system") {
      applyTheme("system");
    }
  };

  if (typeof colorSchemeMatcher.addEventListener === "function") {
    colorSchemeMatcher.addEventListener("change", handleSystemThemeChange);
  } else if (typeof colorSchemeMatcher.addListener === "function") {
    colorSchemeMatcher.addListener(handleSystemThemeChange);
  }
}

function scrollToSuggestedSongs() {
  if (!suggestedSongsSection) {
    return;
  }

  suggestedSongsSection.scrollIntoView({ behavior: "smooth", block: "start" });
}

function initSuggestionPopup() {
  if (!suggestionPopup || !window.pageToastMessage) {
    return;
  }

  let dismissTimer = null;
  let dismissed = false;

  const dismissPopup = () => {
    if (dismissed) {
      return;
    }

    dismissed = true;

    if (dismissTimer) {
      window.clearTimeout(dismissTimer);
    }

    suggestionPopup.classList.remove("is-visible");

    window.setTimeout(() => {
      suggestionPopup.remove();
      scrollToSuggestedSongs();
    }, 260);
  };

  suggestionPopup.addEventListener("click", dismissPopup);
  suggestionPopup.addEventListener("keydown", (event) => {
    if (event.key === "Escape" || event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      dismissPopup();
    }
  });

  requestAnimationFrame(() => {
    suggestionPopup.classList.add("is-visible");
    suggestionPopup.focus({ preventScroll: true });
  });

  dismissTimer = window.setTimeout(dismissPopup, 120000);
}

function initPopupFromPage() {
  const message = window.pageToastMessage;
  if (!message) {
    return;
  }

  initSuggestionPopup();

  const currentUrl = new URL(window.location.href);
  currentUrl.searchParams.delete("saved");
  history.replaceState({}, "", currentUrl.toString());
}

function updateDropZoneLabel(dropZone, input) {
  const fileLabel = dropZone.querySelector("[data-drop-file]");
  if (!fileLabel) {
    return;
  }

  fileLabel.textContent = input.files && input.files[0] ? input.files[0].name : "No file selected";
}

function initDropZones() {
  const dropZones = document.querySelectorAll("[data-drop-zone]");
  if (!dropZones.length) {
    return;
  }

  dropZones.forEach((dropZone) => {
    const input = dropZone.querySelector("[data-drop-input]");
    if (!input) {
      return;
    }

    input.addEventListener("change", () => {
      updateDropZoneLabel(dropZone, input);
    });

    ["dragenter", "dragover"].forEach((eventName) => {
      dropZone.addEventListener(eventName, (event) => {
        event.preventDefault();
        dropZone.classList.add("is-dragging");
      });
    });

    ["dragleave", "dragend"].forEach((eventName) => {
      dropZone.addEventListener(eventName, () => {
        dropZone.classList.remove("is-dragging");
      });
    });

    dropZone.addEventListener("drop", (event) => {
      event.preventDefault();
      dropZone.classList.remove("is-dragging");

      const files = event.dataTransfer?.files;
      if (!files || !files.length) {
        return;
      }

      try {
        const dataTransfer = new DataTransfer();
        dataTransfer.items.add(files[0]);
        input.files = dataTransfer.files;
      } catch (_error) {
        return;
      }

      updateDropZoneLabel(dropZone, input);
    });
  });
}

function createCard(student) {
  return `
    <article class="student-card" data-roll="${student.roll}" tabindex="0" role="link" aria-label="Open ${student.name} profile">
      <h3>${student.name}</h3>
      <p class="roll">${student.roll}</p>
    </article>
  `;
}

function renderStudents(list) {
  if (!studentGrid || !resultCount) {
    return;
  }

  studentGrid.innerHTML = list.map(createCard).join("");
  resultCount.textContent = `Showing ${list.length} of ${students.length} students`;
}

function filterStudents(term) {
  const query = term.trim().toLowerCase();

  if (!query) {
    renderStudents(students);
    return;
  }

  const filtered = students.filter((student) => {
    return (
      student.name.toLowerCase().includes(query) ||
      student.roll.toLowerCase().includes(query)
    );
  });

  renderStudents(filtered);
}

initThemeControls();
initPopupFromPage();
initDropZones();

if (searchInput && studentGrid && resultCount) {
  searchInput.addEventListener("input", (event) => {
    filterStudents(event.target.value);
  });

  studentGrid.addEventListener("click", (event) => {
    const card = event.target.closest(".student-card");
    if (!card) return;

    window.location.href = `/student/${card.dataset.roll}`;
  });

  studentGrid.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;

    const card = event.target.closest(".student-card");
    if (!card) return;

    event.preventDefault();
    window.location.href = `/student/${card.dataset.roll}`;
  });

  renderStudents(students);
}
