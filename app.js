const root = document.documentElement;
const button = document.querySelector(".theme-button");

const safeStorage = {
  get(key) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, value);
      return true;
    } catch {
      return false;
    }
  },
};

const THEME_KEY = "luke-jio-wiki-theme";
const LEGACY_THEME_KEY = "luke-gio-wiki-theme";
const savedTheme = safeStorage.get(THEME_KEY) || safeStorage.get(LEGACY_THEME_KEY);
if (savedTheme === "dark") {
  root.classList.add("dark");
  if (button) button.textContent = "라이트";
}

button?.addEventListener("click", () => {
  root.classList.toggle("dark");
  const dark = root.classList.contains("dark");
  safeStorage.set(THEME_KEY, dark ? "dark" : "light");
  button.textContent = dark ? "라이트" : "다크";
});

const tocLinks = Array.from(document.querySelectorAll(".toc a"));
const sectionTargets = Array.from(
  new Map(
    tocLinks
      .map((link) => [link.getAttribute("href"), document.querySelector(link.getAttribute("href"))])
      .filter(([, target]) => Boolean(target)),
  ).values(),
);

function setActiveToc() {
  let activeId = sectionTargets[0]?.id;
  for (const section of sectionTargets) {
    const rect = section.getBoundingClientRect();
    if (rect.top <= 112) activeId = section.id;
  }

  tocLinks.forEach((link) => {
    link.classList.toggle("active", link.getAttribute("href") === `#${activeId}`);
  });
}

function openHashTarget() {
  const hash = decodeURIComponent(window.location.hash || "");
  if (!hash || hash === "#") return;

  const target = document.querySelector(hash);
  if (!target) return;

  const dateEntry = target.matches(".date-entry") ? target : target.closest(".date-entry");
  if (dateEntry instanceof HTMLDetailsElement) {
    dateEntry.open = true;
  }
}

setActiveToc();
openHashTarget();
window.addEventListener("scroll", setActiveToc, { passive: true });
window.addEventListener("hashchange", openHashTarget);
tocLinks.forEach((link) => link.addEventListener("click", () => setTimeout(openHashTarget, 0)));

const COMMENT_AUTHOR_KEY = "luke-jio-wiki-comment-author";
const ALLOWED_COMMENT_AUTHORS = new Set(["동현", "Jio"]);
const COMMENT_ENDPOINT = window.location.hostname.endsWith("github.io")
  ? "https://luke-jio-wiki.vercel.app/api/comments"
  : "/api/comments";

function formatCommentTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "방금";

  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

function makeTextNode(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  node.textContent = text;
  return node;
}

function normalizeCommentAuthor(value) {
  const raw = String(value || "").trim();
  if (ALLOWED_COMMENT_AUTHORS.has(raw)) return raw;
  if (raw === "지오") return "Jio";
  if (raw === "Donghyun" || raw === "Luke") return "동현";
  return "";
}


function setCommentStatus(box, text, state = "") {
  const status = box.querySelector(".comment-status");
  if (!status) return;

  status.textContent = text;
  status.hidden = !text;
  status.dataset.state = state;
}

async function fetchComments(thread) {
  const response = await fetch(`${COMMENT_ENDPOINT}?thread=${encodeURIComponent(thread)}`, {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "댓글을 불러오지 못했어.");
  return Array.isArray(data.comments) ? data.comments : [];
}

async function postComment(thread, payload) {
  const response = await fetch(COMMENT_ENDPOINT, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ thread, ...payload }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "댓글을 남기지 못했어.");
  return Array.isArray(data.comments) ? data.comments : [];
}

function renderCommentBox(box, comments) {
  const list = box.querySelector(".comment-list");
  const count = box.querySelector(".comment-count");

  if (count) count.textContent = `${comments.length}개`;
  if (!list) return;

  list.replaceChildren();

  if (comments.length === 0) {
    list.appendChild(makeTextNode("li", "comment-empty", "아직 댓글 없음."));
    return;
  }

  for (const comment of comments) {
    const item = document.createElement("li");
    item.className = "comment-item";

    const meta = document.createElement("div");
    meta.className = "comment-meta";
    meta.appendChild(makeTextNode("strong", "comment-author", normalizeCommentAuthor(comment.name) || "동현"));
    meta.appendChild(makeTextNode("time", "comment-time", formatCommentTime(comment.createdAt)));

    const message = makeTextNode("p", "comment-message", comment.message || "");
    item.append(meta, message);
    list.appendChild(item);
  }
}

function setFormBusy(form, busy) {
  const fields = Array.from(form.elements || []);
  fields.forEach((field) => {
    field.disabled = busy;
  });
}

function initCommentBox(box) {
  const thread = box.dataset.commentThread;
  const form = box.querySelector(".comment-form");
  const authorSelect = box.querySelector('select[name="name"]');
  const messageInput = box.querySelector('textarea[name="message"]');

  if (!thread) return;
  const defaultName = normalizeCommentAuthor(box.dataset.defaultName) || "동현";
  const savedName = normalizeCommentAuthor(safeStorage.get(COMMENT_AUTHOR_KEY));
  const initialName = box.dataset.defaultName ? defaultName : savedName || defaultName;
  if (authorSelect) authorSelect.value = initialName;

  fetchComments(thread)
    .then((comments) => {
      renderCommentBox(box, comments);
      setCommentStatus(box, "");
    })
    .catch(() => {
      renderCommentBox(box, []);
      setCommentStatus(box, "댓글 서버 연결 안 됨.", "error");
    });

  form?.addEventListener("submit", async (event) => {
    event.preventDefault();

    const name = normalizeCommentAuthor(authorSelect?.value) || defaultName;
    const message = (messageInput?.value || "").trim();

    if (!message) {
      messageInput?.focus();
      return;
    }

    setFormBusy(form, true);
    setCommentStatus(box, "남기는 중...");

    try {
      const comments = await postComment(thread, { name, message });
      safeStorage.set(COMMENT_AUTHOR_KEY, name);
      if (messageInput) messageInput.value = "";
      renderCommentBox(box, comments);
      setCommentStatus(box, "남겼어.", "ok");
      window.setTimeout(() => setCommentStatus(box, ""), 1800);
    } catch {
      setCommentStatus(box, "댓글 저장 실패. 잠깐 뒤에 다시 시도해줘.", "error");
    } finally {
      setFormBusy(form, false);
      messageInput?.focus();
    }
  });
}

Array.from(document.querySelectorAll(".comment-box")).forEach(initCommentBox);

const VIEW_MODE_KEY = "luke-jio-wiki-view-mode";
const viewButtons = Array.from(document.querySelectorAll("[data-view-mode]"));

function setViewMode(mode) {
  const nextMode = mode === "timeline" ? "timeline" : "wiki";
  document.body.classList.toggle("view-mode-timeline", nextMode === "timeline");
  document.body.classList.toggle("view-mode-wiki", nextMode === "wiki");
  viewButtons.forEach((viewButton) => {
    const active = viewButton.dataset.viewMode === nextMode;
    viewButton.classList.toggle("is-active", active);
    viewButton.setAttribute("aria-pressed", active ? "true" : "false");
  });
  safeStorage.set(VIEW_MODE_KEY, nextMode);
}

viewButtons.forEach((viewButton) => {
  viewButton.addEventListener("click", () => setViewMode(viewButton.dataset.viewMode));
});
setViewMode(safeStorage.get(VIEW_MODE_KEY) || "wiki");

function getKoreanDateOnly(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return new Date(Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day)));
}

function initDdayCounter() {
  const counter = document.querySelector("[data-start-date]");
  if (!counter) return;

  const [year, month, day] = counter.dataset.startDate.split("-").map(Number);
  const startDate = new Date(Date.UTC(year, month - 1, day));
  const today = getKoreanDateOnly();
  const days = Math.floor((today - startDate) / 86400000) + 1;
  counter.textContent = days > 0 ? `D+${days}` : `D${days}`;
}

initDdayCounter();

const lightbox = document.querySelector("#media-lightbox");
const lightboxImage = lightbox?.querySelector("img");
const lightboxCaption = lightbox?.querySelector("figcaption");
const lightboxClose = lightbox?.querySelector(".lightbox-close");
const lightboxPrev = lightbox?.querySelector(".lightbox-prev");
const lightboxNext = lightbox?.querySelector(".lightbox-next");
const lightboxItems = Array.from(document.querySelectorAll(".media-gallery .media-item img, .photo-card img"));
let lightboxIndex = 0;
let touchStartX = null;

function getMediaCaption(image) {
  const caption = image.closest("figure")?.querySelector("figcaption");
  if (!caption) return image.alt || "";
  return caption.textContent.replace(/\s+/g, " ").trim();
}

function showLightbox(index) {
  if (!lightbox || !lightboxImage || !lightboxCaption || lightboxItems.length === 0) return;
  lightboxIndex = (index + lightboxItems.length) % lightboxItems.length;
  const current = lightboxItems[lightboxIndex];
  lightboxImage.src = current.currentSrc || current.src;
  lightboxImage.alt = current.alt || "데이트 사진";
  lightboxCaption.textContent = getMediaCaption(current);
  lightbox.hidden = false;
  lightbox.setAttribute("aria-hidden", "false");
  document.body.classList.add("lightbox-open");
  lightboxClose?.focus();
}

function hideLightbox() {
  if (!lightbox) return;
  lightbox.hidden = true;
  lightbox.setAttribute("aria-hidden", "true");
  document.body.classList.remove("lightbox-open");
}

function moveLightbox(direction) {
  showLightbox(lightboxIndex + direction);
}

lightboxItems.forEach((image, index) => {
  image.classList.add("is-lightboxable");
  image.tabIndex = 0;
  image.setAttribute("role", "button");
  image.setAttribute("aria-label", "사진 크게 보기");
  image.addEventListener("click", () => showLightbox(index));
  image.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      showLightbox(index);
    }
  });
});

lightboxClose?.addEventListener("click", hideLightbox);
lightboxPrev?.addEventListener("click", () => moveLightbox(-1));
lightboxNext?.addEventListener("click", () => moveLightbox(1));
lightbox?.addEventListener("click", (event) => {
  if (event.target === lightbox) hideLightbox();
});
lightbox?.addEventListener("touchstart", (event) => {
  touchStartX = event.changedTouches[0]?.clientX ?? null;
}, { passive: true });
lightbox?.addEventListener("touchend", (event) => {
  if (touchStartX === null) return;
  const touchEndX = event.changedTouches[0]?.clientX ?? touchStartX;
  const diff = touchEndX - touchStartX;
  touchStartX = null;
  if (Math.abs(diff) < 45) return;
  moveLightbox(diff > 0 ? -1 : 1);
}, { passive: true });
window.addEventListener("keydown", (event) => {
  if (!lightbox || lightbox.hidden) return;
  if (event.key === "Escape") hideLightbox();
  if (event.key === "ArrowLeft") moveLightbox(-1);
  if (event.key === "ArrowRight") moveLightbox(1);
});
