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

const savedTheme = safeStorage.get("luke-gio-wiki-theme");
if (savedTheme === "dark") {
  root.classList.add("dark");
  if (button) button.textContent = "라이트";
}

button?.addEventListener("click", () => {
  root.classList.toggle("dark");
  const dark = root.classList.contains("dark");
  safeStorage.set("luke-gio-wiki-theme", dark ? "dark" : "light");
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

setActiveToc();
window.addEventListener("scroll", setActiveToc, { passive: true });

const COMMENT_PREFIX = "luke-gio-wiki-comments:";
const COMMENT_NAME_KEY = "luke-gio-wiki-comment-name";

function loadComments(thread) {
  const raw = safeStorage.get(COMMENT_PREFIX + thread);
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveComments(thread, comments) {
  return safeStorage.set(COMMENT_PREFIX + thread, JSON.stringify(comments));
}

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

function renderCommentBox(box) {
  const thread = box.dataset.commentThread;
  const list = box.querySelector(".comment-list");
  const count = box.querySelector(".comment-count");
  const comments = loadComments(thread);

  if (count) count.textContent = `${comments.length}개`;
  if (!list) return;

  list.replaceChildren();

  if (comments.length === 0) {
    const empty = makeTextNode("li", "comment-empty", "아직 댓글 없음.");
    list.appendChild(empty);
    return;
  }

  for (const comment of comments) {
    const item = document.createElement("li");
    item.className = "comment-item";

    const meta = document.createElement("div");
    meta.className = "comment-meta";
    meta.appendChild(makeTextNode("strong", "comment-author", comment.name || "익명"));
    meta.appendChild(makeTextNode("time", "comment-time", formatCommentTime(comment.createdAt)));

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "comment-delete";
    deleteButton.dataset.commentId = comment.id;
    deleteButton.textContent = "삭제";
    meta.appendChild(deleteButton);

    const message = makeTextNode("p", "comment-message", comment.message || "");

    item.append(meta, message);
    list.appendChild(item);
  }
}

function initCommentBox(box) {
  const thread = box.dataset.commentThread;
  const form = box.querySelector(".comment-form");
  const nameInput = box.querySelector('input[name="name"]');
  const messageInput = box.querySelector('textarea[name="message"]');

  if (nameInput) nameInput.value = safeStorage.get(COMMENT_NAME_KEY) || "동현";

  form?.addEventListener("submit", (event) => {
    event.preventDefault();
    const name = (nameInput?.value || "동현").trim() || "동현";
    const message = (messageInput?.value || "").trim();

    if (!message) {
      messageInput?.focus();
      return;
    }

    const comments = loadComments(thread);
    comments.push({
      id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      name,
      message,
      createdAt: new Date().toISOString(),
    });

    safeStorage.set(COMMENT_NAME_KEY, name);
    saveComments(thread, comments);
    if (messageInput) messageInput.value = "";
    renderCommentBox(box);
    messageInput?.focus();
  });

  box.querySelector(".comment-list")?.addEventListener("click", (event) => {
    const deleteButton = event.target.closest(".comment-delete");
    if (!deleteButton) return;

    const id = deleteButton.dataset.commentId;
    const comments = loadComments(thread).filter((comment) => comment.id !== id);
    saveComments(thread, comments);
    renderCommentBox(box);
  });

  renderCommentBox(box);
}

Array.from(document.querySelectorAll(".comment-box")).forEach(initCommentBox);
