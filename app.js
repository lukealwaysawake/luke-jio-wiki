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

const COMMENT_NAME_KEY = "luke-jio-wiki-comment-name";
const COMMENT_ENDPOINT = window.location.hostname.endsWith("github.io")
  ? "https://luke-gio-wiki.vercel.app/api/comments"
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
    meta.appendChild(makeTextNode("strong", "comment-author", comment.name || "익명"));
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
  const nameInput = box.querySelector('input[name="name"]');
  const messageInput = box.querySelector('textarea[name="message"]');

  if (!thread) return;
  const defaultName = box.dataset.defaultName || "동현";
  const savedName = safeStorage.get(COMMENT_NAME_KEY);
  if (nameInput) nameInput.value = box.dataset.defaultName || savedName || defaultName;

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

    const name = (nameInput?.value || defaultName).trim() || defaultName;
    const message = (messageInput?.value || "").trim();

    if (!message) {
      messageInput?.focus();
      return;
    }

    setFormBusy(form, true);
    setCommentStatus(box, "남기는 중...");

    try {
      const comments = await postComment(thread, { name, message });
      safeStorage.set(COMMENT_NAME_KEY, name);
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
