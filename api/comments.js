const { get, put, BlobPreconditionFailedError } = require("@vercel/blob");

const STORE_PATH = "comments/luke-jio-wiki.json";
const LEGACY_STORE_PATH = "comments/luke-gio-wiki.json";
const ALLOWED_ORIGINS = new Set([
  "https://luke-gio-wiki.vercel.app",
  "https://luke-jio-wiki.vercel.app",
  "https://lukealwaysawake.github.io",
]);
const ALLOWED_THREADS = new Set([
  "date-2026-05-19",
  "date-2026-05-21",
  "date-2026-05-22",
  "date-2026-06-23",
  "date-2026-06-27",
  "jio-note",
  "_healthcheck",
]);
const MAX_COMMENTS_PER_THREAD = 200;

function setCorsHeaders(req, res) {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Accept");
}

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.end(JSON.stringify(payload));
}

function normalizeText(value, maxLength) {
  return String(value || "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function isValidThread(thread) {
  return typeof thread === "string" && ALLOWED_THREADS.has(thread);
}

function emptyStore() {
  return { version: 1, threads: {} };
}

function normalizeStore(value) {
  const store = emptyStore();
  if (!value || typeof value !== "object" || !value.threads || typeof value.threads !== "object") {
    return store;
  }

  for (const thread of ALLOWED_THREADS) {
    const comments = Array.isArray(value.threads[thread]) ? value.threads[thread] : [];
    store.threads[thread] = comments
      .filter((comment) => comment && typeof comment === "object")
      .map((comment) => ({
        id: normalizeText(comment.id, 80) || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
        name: normalizeText(comment.name, 20) || "익명",
        message: normalizeText(comment.message, 600),
        createdAt: normalizeText(comment.createdAt, 40) || new Date().toISOString(),
      }))
      .filter((comment) => comment.message)
      .slice(-MAX_COMMENTS_PER_THREAD);
  }

  return store;
}

async function streamToText(stream) {
  if (!stream) return "";
  return new Response(stream).text();
}

async function readStoreFrom(pathname) {
  const result = await get(pathname, { access: "public" });
  if (!result || result.statusCode !== 200) {
    return { store: emptyStore(), etag: null, exists: false };
  }

  const raw = await streamToText(result.stream);
  if (!raw) return { store: emptyStore(), etag: result.blob?.etag || null, exists: true };

  try {
    return {
      store: normalizeStore(JSON.parse(raw)),
      etag: result.blob?.etag || null,
      exists: true,
    };
  } catch {
    return { store: emptyStore(), etag: result.blob?.etag || null, exists: true };
  }
}

function hasAnyComments(store) {
  return Object.values(store.threads || {}).some((comments) => Array.isArray(comments) && comments.length > 0);
}

async function readStore() {
  const primary = await readStoreFrom(STORE_PATH);
  if (primary.exists || hasAnyComments(primary.store)) return primary;

  const legacy = await readStoreFrom(LEGACY_STORE_PATH);
  if (hasAnyComments(legacy.store)) {
    return { store: legacy.store, etag: null, exists: false };
  }

  return primary;
}

async function writeStore(store, etag) {
  const options = {
    access: "public",
    allowOverwrite: true,
    contentType: "application/json; charset=utf-8",
    cacheControlMaxAge: 60,
  };

  if (etag) options.ifMatch = etag;

  await put(STORE_PATH, JSON.stringify(store, null, 2), options);
}

async function readJsonBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") return JSON.parse(req.body || "{}");

  let raw = "";
  for await (const chunk of req) raw += chunk;
  return raw ? JSON.parse(raw) : {};
}

function getThreadFromRequest(req) {
  const url = new URL(req.url || "/api/comments", "https://luke-jio-wiki.vercel.app");
  return url.searchParams.get("thread");
}

async function appendComment(input) {
  const thread = normalizeText(input.thread, 40);
  if (!isValidThread(thread)) {
    return { status: 400, payload: { error: "invalid_thread" } };
  }

  const name = normalizeText(input.name, 20) || "익명";
  const message = normalizeText(input.message, 600);
  if (!message) {
    return { status: 400, payload: { error: "empty_message" } };
  }

  const comment = {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
    name,
    message,
    createdAt: new Date().toISOString(),
  };

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const { store, etag } = await readStore();
    const current = Array.isArray(store.threads[thread]) ? store.threads[thread] : [];
    store.threads[thread] = [...current, comment].slice(-MAX_COMMENTS_PER_THREAD);

    try {
      await writeStore(store, etag);
      return { status: 201, payload: { comments: store.threads[thread] } };
    } catch (error) {
      if (error instanceof BlobPreconditionFailedError && attempt < 2) continue;
      throw error;
    }
  }

  return { status: 409, payload: { error: "write_conflict" } };
}

module.exports = async function handler(req, res) {
  setCorsHeaders(req, res);

  try {
    if (req.method === "OPTIONS") {
      res.statusCode = 204;
      res.end();
      return;
    }

    if (req.method === "GET") {
      const thread = getThreadFromRequest(req);
      if (!isValidThread(thread)) {
        return sendJson(res, 400, { error: "invalid_thread" });
      }

      const { store } = await readStore();
      return sendJson(res, 200, { comments: store.threads[thread] || [] });
    }

    if (req.method === "POST") {
      const body = await readJsonBody(req);
      const result = await appendComment(body);
      return sendJson(res, result.status, result.payload);
    }

    res.setHeader("Allow", "GET, POST, OPTIONS");
    return sendJson(res, 405, { error: "method_not_allowed" });
  } catch (error) {
    console.error("comments_api_error", error);
    return sendJson(res, 500, { error: "server_error" });
  }
};
