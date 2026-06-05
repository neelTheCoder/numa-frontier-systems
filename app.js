/* ───────────────────────── NUMA Frontier Systems — frontend logic ─────────────────────────
 * Uploads a .bdf to the predict_numa API and shows the predicted concept's picture.
 *
 * API contract (predict_numa.py  →  POST {API_BASE}/predict, multipart field "file"):
 *   { prediction, confidence, top_k:[{label,confidence}], n_windows_used, n_windows_total, chance }
 *
 * Configure the API URL with, in order of priority:
 *   1) ?api=https://your-host   in the page URL  (persisted to localStorage)
 *   2) <meta name="numa-api-base" content="https://your-host">
 */
(() => {
  "use strict";

  // ── resolve API base ──────────────────────────────────────────────────────
  const qp = new URLSearchParams(location.search);
  if (qp.get("api")) localStorage.setItem("numa_api", qp.get("api").replace(/\/+$/, ""));
  const META = (document.querySelector('meta[name="numa-api-base"]')?.content || "").replace(/\/+$/, "");
  const API_BASE = (localStorage.getItem("numa_api") || META || "").replace(/\/+$/, "");

  // ── elements ──────────────────────────────────────────────────────────────
  const $ = (id) => document.getElementById(id);
  const drop = $("drop"), file = $("file"), go = $("go"),
        fileName = $("fileName"), status = $("status"), error = $("error"),
        apiWarn = $("apiWarn");
  const modal = $("modal"), modalClose = $("modalClose"),
        mImg = $("mImg"), mLabel = $("mLabel"), mCat = $("mCat"),
        mConf = $("mConf"), mTopk = $("mTopk"), mWindows = $("mWindows");

  let manifest = {};
  let chosen = null;

  if (!API_BASE) apiWarn.hidden = false;

  // ── load class → image manifest ───────────────────────────────────────────
  fetch("manifest.json")
    .then((r) => r.json())
    .then((m) => { manifest = m; })
    .catch(() => { error.textContent = "Could not load image manifest."; });

  const pretty = (s) => s.replace(/_/g, " ");

  // ── file selection (click + drag/drop) ────────────────────────────────────
  drop.addEventListener("click", () => file.click());
  file.addEventListener("change", (e) => setFile(e.target.files[0]));
  ["dragover", "dragenter"].forEach((ev) =>
    drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add("drag"); }));
  ["dragleave", "dragend"].forEach((ev) =>
    drop.addEventListener(ev, () => drop.classList.remove("drag")));
  drop.addEventListener("drop", (e) => {
    e.preventDefault(); drop.classList.remove("drag");
    setFile(e.dataTransfer.files[0]);
  });

  function setFile(f) {
    error.textContent = ""; status.textContent = "";
    if (!f) { chosen = null; fileName.textContent = ""; go.disabled = true; return; }
    if (!f.name.toLowerCase().endsWith(".bdf")) {
      chosen = null; go.disabled = true; fileName.textContent = "";
      error.textContent = "Please choose a .bdf file."; return;
    }
    chosen = f;
    fileName.innerHTML = `Selected: <b>${escapeHtml(f.name)}</b> · ${(f.size / 1e6).toFixed(1)} MB`;
    go.disabled = false;
  }

  // ── predict ───────────────────────────────────────────────────────────────
  go.addEventListener("click", async () => {
    if (!chosen) return;
    if (!API_BASE) {
      error.textContent = "No prediction server configured — set the API URL (see the note above).";
      return;
    }
    go.disabled = true; error.textContent = "";
    status.innerHTML = `<span class="spin"></span>Uploading & decoding — this can take up to a minute…`;

    const fd = new FormData();
    fd.append("file", chosen);

    try {
      const res = await fetch(`${API_BASE}/predict`, { method: "POST", body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Server returned HTTP ${res.status}`);
      status.textContent = "";
      showResult(data);
    } catch (err) {
      status.textContent = "";
      error.textContent = `Error: ${err.message}`;
    } finally {
      go.disabled = false;
    }
  });

  // ── render prediction modal ───────────────────────────────────────────────
  function showResult(data) {
    const label = data.prediction;
    const info = manifest[label] || {};
    mLabel.textContent = pretty(label);
    mCat.textContent = info.category || "concept";
    mConf.textContent = data.confidence != null
      ? `${(data.confidence * 100).toFixed(1)}% confidence` : "";

    if (info.src) {
      mImg.src = info.src;
      mImg.alt = pretty(label);
      mImg.parentElement.style.display = "flex";
    } else {
      mImg.removeAttribute("src");
      mImg.parentElement.style.display = "none";
    }

    // top-k bars
    mTopk.innerHTML = "";
    (data.top_k || []).forEach((p, i) => {
      const pct = (p.confidence * 100).toFixed(1);
      const row = document.createElement("div");
      row.className = "row" + (i === 0 ? " top" : "");
      row.innerHTML =
        `<span class="name">${escapeHtml(pretty(p.label))}</span>` +
        `<span class="bar"><div style="width:${pct}%"></div></span>` +
        `<span class="pct">${pct}%</span>`;
      mTopk.appendChild(row);
    });

    if (data.n_windows_used != null) {
      const chance = data.chance != null ? ` · chance ${(data.chance * 100).toFixed(1)}%` : "";
      mWindows.textContent =
        `Decision pooled over ${data.n_windows_used} of ${data.n_windows_total} EEG windows${chance}`;
    } else {
      mWindows.textContent = "";
    }

    openModal();
  }

  // ── modal controls ────────────────────────────────────────────────────────
  function openModal() { modal.hidden = false; document.body.style.overflow = "hidden"; }
  function closeModal() { modal.hidden = true; document.body.style.overflow = ""; }
  modalClose.addEventListener("click", closeModal);
  modal.addEventListener("click", (e) => { if (e.target === modal) closeModal(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !modal.hidden) closeModal(); });

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
})();
