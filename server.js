const express = require("express");
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const { Readable } = require("stream");
const dotenv = require("dotenv");
const { google } = require("googleapis");

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const UPLOAD_DIR = path.join(__dirname, "public", "uploads");
const GOOGLE_SERVICE_ACCOUNT_EMAIL =
  process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || process.env.VITE_GOOGLE_SERVICE_ACCOUNT_EMAIL;
const GOOGLE_PRIVATE_KEY_RAW =
  process.env.GOOGLE_PRIVATE_KEY || process.env.VITE_GOOGLE_PRIVATE_KEY;
const GOOGLE_PRIVATE_KEY = GOOGLE_PRIVATE_KEY_RAW
  ? GOOGLE_PRIVATE_KEY_RAW.replace(/\\n/g, "\n").replace(/^"|"$/g, "")
  : "";
const GOOGLE_SPREADSHEET_ID =
  process.env.GOOGLE_SPREADSHEET_ID || process.env.VITE_GOOGLE_SPREADSHEET_ID;

const SHEET_NAMES = {
  students: "Students",
  songs: "Songs"
};

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase();
    const safeExt = ext || (file.mimetype.startsWith("image/") ? ".jpg" : ".mp3");
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${safeExt}`);
  }
});

const upload = multer({ storage });

app.use(express.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname, "public")));

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function createSheetsClient() {
  if (!GOOGLE_SERVICE_ACCOUNT_EMAIL || !GOOGLE_PRIVATE_KEY || !GOOGLE_SPREADSHEET_ID) {
    throw new Error("Missing Google Sheets environment configuration");
  }

  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: GOOGLE_PRIVATE_KEY
    },
    scopes: ["https://www.googleapis.com/auth/spreadsheets"]
  });

  return google.sheets({ version: "v4", auth });
}

async function fetchStudentsFromSheet() {
  const sheets = createSheetsClient();
  const result = await sheets.spreadsheets.values.get({
    spreadsheetId: GOOGLE_SPREADSHEET_ID,
    range: `${SHEET_NAMES.students}!A2:B`
  });

  return (result.data.values || [])
    .map((row) => ({
      roll: (row[0] || "").trim(),
      name: (row[1] || "").trim()
    }))
    .filter((item) => item.roll && item.name);
}

async function fetchSongsFromSheetByRoll(roll) {
  const sheets = createSheetsClient();
  const result = await sheets.spreadsheets.values.get({
    spreadsheetId: GOOGLE_SPREADSHEET_ID,
    range: `${SHEET_NAMES.songs}!A2:D`
  });

  return (result.data.values || [])
    .map((row) => ({
      roll: (row[0] || "").trim(),
      title: (row[1] || "").trim(),
      image: (row[2] || "").trim(),
      songUrl: (row[3] || "").trim()
    }))
    .filter((item) => item.roll === roll && item.title && item.image && item.songUrl)
    .map((item) => ({
      title: item.title,
      image: item.image,
      songUrl: item.songUrl
    }));
}

async function appendSongToSheet(roll, title, image, songUrl) {
  const sheets = createSheetsClient();
  const result = await sheets.spreadsheets.values.append({
    spreadsheetId: GOOGLE_SPREADSHEET_ID,
    range: `${SHEET_NAMES.songs}!A:D`,
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: [[roll, title, image, songUrl]]
    }
  });

  const updatedRows = result.data?.updates?.updatedRows || 0;
  return updatedRows > 0;
}

function getThemeBootstrapScript() {
  return `
    <script>
      (function () {
        try {
          var mode = window.localStorage.getItem('themeMode') || 'system';
          var isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
          var resolvedTheme = mode === 'dark' || mode === 'light' ? mode : (isDark ? 'dark' : 'light');
          document.documentElement.dataset.theme = resolvedTheme;
          document.documentElement.dataset.themeMode = mode;
        } catch (error) {}
      })();
    </script>`;
}

function getResolvedThemeMarkup() {
  return `
    <button class="theme-toggle" type="button" data-theme-toggle aria-label="Change theme" title="Theme: System">
      <span class="theme-logo" aria-hidden="true"></span>
      <span class="theme-toggle-text" data-theme-label>System</span>
    </button>`;
}

function getSheetStatusMarkup(isConnected) {
  const statusClass = isConnected ? "connected" : "disconnected";
  const statusText = isConnected ? "Google Sheet Connected" : "Google Sheet Disconnected";

  return `
    <span class="sheet-status ${statusClass}">
      <span class="sheet-dot" aria-hidden="true"></span>
      <span>${statusText}</span>
    </span>`;
}

function isHttpUrl(value) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch (_error) {
    return false;
  }
}

function getYoutubeEmbedUrl(source) {
  const parsedUrl = new URL(source);
  const host = parsedUrl.hostname.replace(/^www\./, "").toLowerCase();

  if (host === "youtu.be") {
    const videoId = parsedUrl.pathname.split("/").filter(Boolean)[0] || "";
    return videoId ? `https://www.youtube.com/embed/${videoId}` : "";
  }

  const videoId = parsedUrl.searchParams.get("v") || "";
  return videoId ? `https://www.youtube.com/embed/${videoId}` : "";
}

function getSpotifyEmbedUrl(source) {
  const parsedUrl = new URL(source);
  const segments = parsedUrl.pathname.split("/").filter(Boolean);
  const type = segments[0] || "track";
  const id = segments[1] || "";

  if (!id) {
    return "";
  }

  if (type === "track" || type === "album" || type === "playlist" || type === "episode") {
    return `https://open.spotify.com/embed/${type}/${id}`;
  }

  return `https://open.spotify.com/embed/track/${id}`;
}

function getMediaKind(source) {
  if (!source) {
    return { kind: "none", downloadable: false };
  }

  if (source.startsWith("/uploads/")) {
    const cleanValue = source.toLowerCase();

    if (/\.(mp4|webm|ogv|mov)$/i.test(cleanValue)) {
      return { kind: "video", downloadable: true };
    }

    if (/\.(mp3|wav|ogg|m4a|aac|flac)$/i.test(cleanValue)) {
      return { kind: "audio", downloadable: true };
    }

    return { kind: "unknown", downloadable: true };
  }

  if (!isHttpUrl(source)) {
    return { kind: "unknown", downloadable: false };
  }

  const parsedUrl = new URL(source);
  const host = parsedUrl.hostname.replace(/^www\./, "").toLowerCase();
  const pathname = parsedUrl.pathname.toLowerCase();

  if (host === "youtu.be" || host.endsWith("youtube.com")) {
    const embedUrl = getYoutubeEmbedUrl(source);
    return embedUrl ? { kind: "youtube", embedUrl, downloadable: false } : { kind: "unknown", downloadable: false };
  }

  if (host.endsWith("spotify.com")) {
    const embedUrl = getSpotifyEmbedUrl(source);
    return embedUrl ? { kind: "spotify", embedUrl, downloadable: false } : { kind: "unknown", downloadable: false };
  }

  if (/\.(mp4|webm|ogv|mov)$/i.test(pathname)) {
    return { kind: "video", downloadable: true };
  }

  if (/\.(mp3|wav|ogg|m4a|aac|flac)$/i.test(pathname)) {
    return { kind: "audio", downloadable: true };
  }

  return { kind: "unknown", downloadable: false };
}

function prettifyText(value) {
  return String(value || "")
    .replace(/[_-]+/g, " ")
    .replace(/\.[^.]+$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function deriveSongTitle(songUrl, songFile) {
  if (songFile?.originalname) {
    const fileTitle = prettifyText(songFile.originalname);
    if (fileTitle) {
      return fileTitle;
    }
  }

  if (!songUrl) {
    return "Suggested Song";
  }

  const media = getMediaKind(songUrl);

  if (media.kind === "youtube") {
    return "YouTube Song";
  }

  if (media.kind === "spotify") {
    return "Spotify Song";
  }

  if (songUrl.startsWith("/uploads/")) {
    const uploadTitle = prettifyText(path.basename(songUrl));
    if (uploadTitle) {
      return uploadTitle;
    }
  }

  try {
    const parsedUrl = new URL(songUrl);
    const baseName = prettifyText(path.basename(parsedUrl.pathname));
    if (baseName) {
      return baseName;
    }

    const videoId = parsedUrl.searchParams.get("v") || parsedUrl.pathname.split("/").filter(Boolean).pop();
    if (videoId) {
      return prettifyText(videoId);
    }
  } catch (_error) {
    // Fall back below.
  }

  return "Suggested Song";
}

function getYoutubeVideoId(source) {
  try {
    const parsedUrl = new URL(source);
    const host = parsedUrl.hostname.replace(/^www\./, "").toLowerCase();

    if (host === "youtu.be") {
      return parsedUrl.pathname.split("/").filter(Boolean)[0] || "";
    }

    return parsedUrl.searchParams.get("v") || "";
  } catch (_error) {
    return "";
  }
}

function deriveCoverFromMedia(songUrl, songFile, title) {
  if (songUrl) {
    const media = getMediaKind(songUrl);

    if (media.kind === "youtube") {
      const videoId = getYoutubeVideoId(songUrl);
      if (videoId) {
        return `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
      }
    }

    if (songUrl.startsWith("/uploads/")) {
      return `https://picsum.photos/seed/${encodeURIComponent(path.basename(songUrl))}/400/400`;
    }

    if (media.kind === "audio" || media.kind === "video" || media.kind === "spotify") {
      return `https://picsum.photos/seed/${encodeURIComponent(songUrl)}/400/400`;
    }
  }

  if (songFile?.originalname) {
    return `https://picsum.photos/seed/${encodeURIComponent(songFile.originalname)}/400/400`;
  }

  return `https://picsum.photos/seed/${encodeURIComponent(title || "default-song-cover")}/400/400`;
}

function buildDownloadUrl(source) {
  return `/download-song?src=${encodeURIComponent(source)}`;
}

function renderMediaPlayer(song, index) {
  const media = getMediaKind(song.songUrl);
  const safeSongUrl = escapeHtml(song.songUrl);
  const mediaId = `song-player-${index}`;
  const downloadUrl = media.downloadable ? buildDownloadUrl(song.songUrl) : "";

  if (media.kind === "youtube" || media.kind === "spotify") {
    return `
      <div class="player-wrap">
        <div class="song-actions">
          <a class="download-btn" href="${safeSongUrl}" target="_blank" rel="noopener noreferrer">Open</a>
        </div>
        <iframe class="media-embed" src="${escapeHtml(media.embedUrl)}" title="${escapeHtml(song.title)} player" loading="lazy" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"></iframe>
      </div>`;
  }

  if (media.kind === "video") {
    return `
      <div class="player-wrap">
        <div class="song-actions">
          <button type="button" class="play-btn" data-media-id="${mediaId}">Play</button>
          ${downloadUrl ? `<a class="download-btn" href="${downloadUrl}">Download</a>` : ""}
        </div>
        <video id="${mediaId}" class="media-player" preload="none" src="${safeSongUrl}"></video>
      </div>`;
  }

  if (media.kind === "audio") {
    return `
      <div class="player-wrap">
        <div class="song-actions">
          <button type="button" class="play-btn" data-media-id="${mediaId}">Play</button>
          ${downloadUrl ? `<a class="download-btn" href="${downloadUrl}">Download</a>` : ""}
        </div>
        <audio id="${mediaId}" preload="none" src="${safeSongUrl}"></audio>
      </div>`;
  }

  return `<p class="no-song">Unsupported media source. Please upload the file instead.</p>`;
}

function renderSongCard(song, index) {
  const safeTitle = escapeHtml(song.title);
  const safeImage = escapeHtml(song.image);

  return `
    <article class="song-card">
      <img src="${safeImage}" alt="${safeTitle} cover" loading="lazy" />
      <div class="song-meta">
        <div class="song-title">${safeTitle}</div>
        ${renderMediaPlayer(song, index)}
      </div>
    </article>`;
}

async function renderHomePage(res) {
  let students = [];
  let isSheetConnected = true;

  try {
    students = await fetchStudentsFromSheet();
  } catch (_error) {
    isSheetConnected = false;
  }

  const payload = JSON.stringify(students).replace(/</g, "\\u003c");

  res.send(`<!DOCTYPE html>
  <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>Suggest a Song for Your Friend</title>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
      ${getThemeBootstrapScript()}
      <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Sora:wght@600;700;800&display=swap" rel="stylesheet" />
      <link rel="stylesheet" href="/styles.css" />
    </head>
    <body>
      <main class="page-wrap">
        <header class="hero">
          <div class="hero-topbar">
            <p class="eyebrow">Music Sharing Platform</p>
            <div class="topbar-actions">
              ${getSheetStatusMarkup(isSheetConnected)}
              ${getResolvedThemeMarkup()}
            </div>
          </div>
          <h1>Suggest a Song for Your Friend</h1>
          <p class="subtitle">Find your classmate and suggest them a song which you think, fit for them</p>
          ${!isSheetConnected ? '<p class="form-error">Unable to connect to Google Sheet. Please check service account permission.</p>' : ""}
          <div class="search-row">
            <input id="searchInput" class="search-input" type="text" placeholder="Search by name or roll number" aria-label="Search students" />
          </div>
        </header>

        <section>
          <div id="resultCount" class="result-count"></div>
          <div id="studentGrid" class="student-grid"></div>
        </section>
      </main>

      <script>window.studentsData = ${payload};</script>
      <script src="/app.js"></script>
    </body>
  </html>`);
}

async function renderStudentPage(req, res) {
  let students = [];
  let suggestedSongs = [];

  try {
    students = await fetchStudentsFromSheet();
    suggestedSongs = await fetchSongsFromSheetByRoll(req.params.roll);
  } catch (_error) {
    res.status(500).send("Unable to load student profile from Google Sheets");
    return;
  }

  const student = students.find((item) => item.roll === req.params.roll);

  if (!student) {
    res.status(404).send("Student not found");
    return;
  }

  const errorType = req.query.error || "";
  const errorMessage =
    errorType === "unsupported-url"
      ? "Unsupported URL. Please download the file and upload it instead."
      : errorType === "missing-song"
        ? "Please provide Song URL or Upload Song."
        : errorType === "save-failed"
          ? "Could not save to Google Sheet. Please check sheet connection/permission and try again."
          : "";
  const popupMessage = req.query.saved === "1" ? `You have suggested a song to ${student.name}.` : "";
  const songsMarkup = suggestedSongs.map((song, index) => renderSongCard(song, index)).join("");

  res.send(`<!DOCTYPE html>
  <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>Suggest a Song for Your Friend</title>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
      ${getThemeBootstrapScript()}
      <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Sora:wght@600;700;800&display=swap" rel="stylesheet" />
      <link rel="stylesheet" href="/styles.css" />
    </head>
    <body>
      <main class="page-wrap detail-page">
        <a href="/" class="back-link">Back to Student Grid</a>

        <section class="student-hero">
          <div class="hero-topbar">
            <p class="eyebrow">Suggest a Song for Your Friend</p>
            <div class="topbar-actions">
              ${getSheetStatusMarkup(true)}
              ${getResolvedThemeMarkup()}
            </div>
          </div>
          <p class="roll-pill">${escapeHtml(student.roll)}</p>
          <h1>${escapeHtml(student.name)}</h1>
          <p class="subtitle">This person has ${suggestedSongs.length} suggested songs.</p>
        </section>

        <section class="form-card">
          <h2>Suggest a Song</h2>
          ${errorMessage ? `<p class="form-error">${escapeHtml(errorMessage)}</p>` : ""}
          <form method="POST" action="/student/${escapeHtml(student.roll)}/songs" class="suggest-form" enctype="multipart/form-data">
            <label>
              Song Title (optional)
              <input type="text" name="title" maxlength="80" placeholder="Enter song title or leave blank" />
            </label>
            <label>
              Cover Image URL
              <input type="url" name="coverUrl" placeholder="https://example.com/cover.jpg" />
            </label>
            <label>
              Upload Cover Image
              <div class="drop-zone" data-drop-zone>
                <input type="file" name="coverFile" accept="image/*" data-drop-input />
                <p class="drop-zone-title">Drag and drop cover image here, or click to browse</p>
                <p class="drop-zone-file" data-drop-file>No file selected</p>
              </div>
            </label>
            <label>
              Song URL
              <input type="url" name="songUrl" placeholder="https://example.com/song.mp3, YouTube, Spotify, or video link" />
            </label>
            <label>
              Upload Song
              <div class="drop-zone" data-drop-zone>
                <input type="file" name="songFile" accept="audio/*,video/*" data-drop-input />
                <p class="drop-zone-title">Drag and drop song or video here, or click to browse</p>
                <p class="drop-zone-file" data-drop-file>No file selected</p>
              </div>
            </label>
            <button type="submit">Suggest a Song</button>
          </form>
        </section>

        <section id="suggestedSongsSection">
          <h2 class="section-title">Suggested Songs</h2>
          <div class="song-grid">${songsMarkup || '<p class="no-results">No songs yet. Be the first to suggest one.</p>'}</div>
        </section>
      </main>

      ${popupMessage ? `
      <div id="suggestionPopup" class="success-popup" role="dialog" aria-modal="true" aria-labelledby="suggestionPopupTitle" tabindex="0">
        <div class="success-popup-card">
          <p class="success-popup-eyebrow">Song Suggested</p>
          <h2 id="suggestionPopupTitle">Suggestion saved successfully</h2>
          <p class="success-popup-message">${escapeHtml(popupMessage)}</p>
          <p class="success-popup-note">Tap anywhere to close, then you will jump to Suggested Songs.</p>
        </div>
      </div>` : ""}

      <script>
        window.pageToastMessage = ${JSON.stringify(popupMessage)};

        const buttons = document.querySelectorAll('.play-btn');
        buttons.forEach((button) => {
          button.addEventListener('click', () => {
            const media = document.getElementById(button.dataset.mediaId);
            if (!media) return;

            const isPlaying = !media.paused;
            document.querySelectorAll('audio, video').forEach((item) => {
              if (item !== media) {
                item.pause();
                item.currentTime = 0;
              }
            });
            document.querySelectorAll('.play-btn').forEach((btn) => {
              if (btn !== button) btn.textContent = 'Play';
            });

            if (isPlaying) {
              media.pause();
              button.textContent = 'Play';
            } else {
              media.play();
              button.textContent = 'Pause';
            }
          });

          const media = document.getElementById(button.dataset.mediaId);
          if (media) {
            media.addEventListener('ended', () => {
              button.textContent = 'Play';
            });
          }
        });
      </script>
      <script src="/app.js"></script>
    </body>
  </html>`);
}

app.get("/", async (_req, res) => {
  try {
    await renderHomePage(res);
  } catch (_error) {
    res.status(500).send("Unable to load students from Google Sheets");
  }
});

app.get("/student/:roll", async (req, res) => {
  await renderStudentPage(req, res);
});

app.get("/download-song", async (req, res) => {
  const source = typeof req.query.src === "string" ? req.query.src : "";

  if (!source) {
    res.status(400).send("Missing song source");
    return;
  }

  const media = getMediaKind(source);

  if (!media.downloadable) {
    res.status(400).send("Unsupported source");
    return;
  }

  if (source.startsWith("/uploads/")) {
    const filePath = path.join(__dirname, "public", source);
    if (!filePath.startsWith(UPLOAD_DIR) || !fs.existsSync(filePath)) {
      res.status(404).send("File not found");
      return;
    }

    res.download(filePath);
    return;
  }

  try {
    const response = await fetch(source);

    if (!response.ok || !response.body) {
      res.status(502).send("Unable to download song");
      return;
    }

    const parsedUrl = new URL(source);
    const filename = (decodeURIComponent(path.basename(parsedUrl.pathname) || "song.mp3") || "song.mp3").replace(/["\r\n]/g, "");
    const contentType = response.headers.get("content-type");

    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    if (contentType) {
      res.setHeader("Content-Type", contentType);
    }

    Readable.fromWeb(response.body).pipe(res);
  } catch (_error) {
    res.status(500).send("Unable to download song");
  }
});

app.post(
  "/student/:roll/songs",
  upload.fields([
    { name: "coverFile", maxCount: 1 },
    { name: "songFile", maxCount: 1 }
  ]),
  async (req, res) => {
    let students = [];

    try {
      students = await fetchStudentsFromSheet();
    } catch (_error) {
      res.status(500).send("Unable to connect to Google Sheets");
      return;
    }

    const student = students.find((item) => item.roll === req.params.roll);

    if (!student) {
      res.status(404).send("Student not found");
      return;
    }

    const titleInput = (req.body.title || "").trim();
    const coverUrl = (req.body.coverUrl || "").trim();
    const songUrl = (req.body.songUrl || "").trim();
    const coverFile = req.files?.coverFile?.[0];
    const songFile = req.files?.songFile?.[0];
    const mediaType = songUrl ? getMediaKind(songUrl) : { kind: "none" };

    if (coverUrl && !isHttpUrl(coverUrl)) {
      res.redirect(`/student/${student.roll}?error=unsupported-url`);
      return;
    }

    if (songUrl && mediaType.kind === "unknown") {
      res.redirect(`/student/${student.roll}?error=unsupported-url`);
      return;
    }

    const image = coverFile ? `/uploads/${coverFile.filename}` : coverUrl;
    const playableSong = songFile ? `/uploads/${songFile.filename}` : songUrl;
    const title = titleInput || deriveSongTitle(playableSong, songFile);
    const resolvedImage = image || deriveCoverFromMedia(playableSong, songFile, title);

    if (!playableSong) {
      res.redirect(`/student/${student.roll}?error=missing-song`);
      return;
    }

    try {
      const saved = await appendSongToSheet(student.roll, title, resolvedImage, playableSong);
      if (!saved) {
        res.redirect(`/student/${student.roll}?error=save-failed`);
        return;
      }
    } catch (_error) {
      res.redirect(`/student/${student.roll}?error=save-failed`);
      return;
    }

    res.redirect(`/student/${student.roll}?saved=1`);
  }
);

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
