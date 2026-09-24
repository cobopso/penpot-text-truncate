const SOURCE = "penpot-text-truncate-live-030";
const qs = new URLSearchParams(location.search);
document.body.dataset.theme = qs.get("theme") || "light";

function el(id) { return document.getElementById(id); }
function send(type, extra) {
  const msg = extra || {};
  msg.type = type;
  parent.postMessage(msg, "*");
}
function options() {
  return {
    lines: Number(el("lines").value) || 1,
    layerName: el("layerName").value,
    breakMode: el("breakMode").value,
    ellipsis: el("ellipsis").value || "…",
    includeDescendants: el("includeDescendants").checked,
    keepBoxHeight: el("keepBoxHeight").checked,
    useCurrentAsSource: el("useCurrentAsSource").checked,
    live: el("live").checked
  };
}
function status(text, kind) {
  const node = el("status");
  node.textContent = text;
  node.className = "status " + (kind || "");
}
function busy(value) {
  el("applyBtn").disabled = value;
  el("restoreBtn").disabled = value;
  el("refreshBtn").disabled = value;
  el("backgroundBtn").disabled = value;
}

el("applyBtn").addEventListener("click", function () {
  busy(true);
  status("Measuring text…");
  send("apply", { options: options() });
});
el("restoreBtn").addEventListener("click", function () {
  busy(true);
  status("Restoring full text…");
  send("restore", { options: options() });
});
el("refreshBtn").addEventListener("click", function () {
  el("refreshBtn").disabled = true;
  status("Refreshing live text…");
  send("refresh");
});

el("backgroundBtn").addEventListener("click", function () {
  status("Starting background mode…", "success");
  send("background");
});
el("live").addEventListener("change", function () {
  el("applyBtn").textContent = el("live").checked ? "Enable live truncation" : "Apply once";
});

window.addEventListener("message", function (event) {
  const msg = event.data;
  if (!msg || msg.source !== SOURCE) return;

  if (msg.type === "themechange") {
    document.body.dataset.theme = msg.theme || "light";
    return;
  }
  if (msg.type === "selection-state") {
    el("selection").textContent = msg.selected ? (msg.selected + " selected · " + msg.descendantText + " text layer" + (msg.descendantText === 1 ? "" : "s") + " found") : "Nothing selected";
    return;
  }
  if (msg.type === "live-state") {
    el("liveState").textContent = "Live targets: " + msg.liveCount;
    return;
  }
  if (msg.type === "progress") {
    status("Measuring " + msg.current + "/" + msg.total + ": " + msg.name);
    return;
  }
  if (msg.type === "live-error") {
    status("Live update failed: " + msg.error, "error");
    return;
  }
  if (msg.type === "background-state") {
    if (msg.preparing) {
      status("Live truncation enabled. Hiding the plugin; it will keep running in the background.", "success");
    }
    return;
  }
  if (msg.type === "fatal-error") {
    busy(false);
    status("Plugin error: " + msg.error, "error");
    return;
  }
  if (msg.type === "refresh-result") {
    el("refreshBtn").disabled = false;
    status("Refreshed " + msg.refreshed + " live text layer" + (msg.refreshed === 1 ? "" : "s") + ".", "success");
    return;
  }
  if (msg.type === "result") {
    busy(false);
    if (!msg.ok) {
      status(msg.error || (msg.errors && msg.errors.join(" · ")) || "Operation failed.", "error");
      return;
    }
    if (msg.action === "apply") {
      const extra = msg.errors && msg.errors.length ? " · " + msg.errors.join(" · ") : "";
      status("Applied to " + msg.applied + " text layer" + (msg.applied === 1 ? "" : "s") + ". " + msg.truncated + " truncated." + (msg.live ? " Live resize is active; switching to background mode…" : "") + extra, "success");
      return;
    }
    if (msg.action === "restore") {
      status("Restored " + msg.restored + " text layer" + (msg.restored === 1 ? "" : "s") + ".", "success");
    }
  }
});

send("request-state");
