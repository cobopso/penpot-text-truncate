/*
 * Text Truncate Live 0.2.2
 *
 * Safe build: starts from the working v0.1 architecture and only attaches
 * documented shapechange listeners AFTER the user enables live truncation.
 * No polling, no startup page scan, no page/file listeners.
 */

const SOURCE = "penpot-text-truncate-live-022";
const UI_URL = "https://cobopso.github.io/penpot-text-truncate/index.html";
const KEY_STATE = "text-truncate-live:state:v022";
const DEFAULT_ELLIPSIS = "…";

const processing = new Set();
const targetWatchers = new Map();
const watcherRegistry = new Map();
const pendingTargets = new Set();
let flushQueued = false;

penpot.ui.open("Text Truncate Live", UI_URL + "?theme=" + encodeURIComponent(String(penpot.theme || "light")), {
  width: 390,
  height: 620
});

penpot.on("themechange", function (theme) {
  send({ type: "themechange", theme: theme });
});

penpot.on("selectionchange", function () {
  sendSelectionState();
});

penpot.ui.onMessage(async function (message) {
  if (!message || typeof message !== "object") return;

  try {
    if (message.type === "request-state") {
      sendSelectionState();
      sendLiveState();
      return;
    }

    if (message.type === "apply") {
      await runApply(message.options || {});
      return;
    }

    if (message.type === "restore") {
      await runRestore(message.options || {});
      return;
    }

    if (message.type === "refresh") {
      await refreshLiveTargets();
      return;
    }
  } catch (error) {
    send({ type: "fatal-error", error: errorMessage(error) });
  }
});

function send(message) {
  message.source = SOURCE;
  try { penpot.ui.sendMessage(message); } catch (_) {}
}

function errorMessage(error) {
  if (error && typeof error.message === "string") return error.message;
  return String(error);
}

function getSelection() {
  try { return Array.isArray(penpot.selection) ? penpot.selection : []; }
  catch (_) { return []; }
}

function childrenOf(shape) {
  if (!shape) return [];
  try { return Array.isArray(shape.children) ? shape.children : []; }
  catch (_) { return []; }
}

function collectTextShapes(shapes, includeDescendants) {
  const result = [];
  const seen = new Set();

  function visit(shape) {
    if (!shape || !shape.id || seen.has(shape.id)) return;
    seen.add(shape.id);

    if (shape.type === "text") {
      result.push(shape);
      return;
    }

    if (!includeDescendants) return;
    const children = childrenOf(shape);
    for (let i = 0; i < children.length; i += 1) visit(children[i]);
  }

  const source = shapes || [];
  for (let i = 0; i < source.length; i += 1) visit(source[i]);
  return result;
}

function sendSelectionState() {
  const selection = getSelection();
  const texts = collectTextShapes(selection, true);
  send({
    type: "selection-state",
    selected: selection.length,
    descendantText: texts.length
  });
}

function sendLiveState() {
  send({ type: "live-state", liveCount: targetWatchers.size });
}

function normalizeOptions(raw) {
  const lines = Math.max(1, Math.min(12, parseInt(raw.lines, 10) || 1));
  return {
    lines: lines,
    ellipsis: typeof raw.ellipsis === "string" && raw.ellipsis.length ? raw.ellipsis : DEFAULT_ELLIPSIS,
    breakMode: raw.breakMode === "character" ? "character" : "word",
    includeDescendants: raw.includeDescendants !== false,
    layerName: String(raw.layerName || "").trim().toLowerCase(),
    keepBoxHeight: raw.keepBoxHeight !== false,
    useCurrentAsSource: raw.useCurrentAsSource === true,
    live: raw.live !== false
  };
}

function matchesLayerName(shape, filter) {
  if (!filter) return true;
  return String(shape.name || "").toLowerCase().indexOf(filter) >= 0;
}

function parseState(shape) {
  try {
    const raw = shape.getPluginData(KEY_STATE);
    if (!raw) return null;
    const state = JSON.parse(raw);
    if (!state || typeof state.sourceText !== "string") return null;
    return state;
  } catch (_) {
    return null;
  }
}

function saveState(shape, state) {
  shape.setPluginData(KEY_STATE, JSON.stringify(state));
}

function clearState(shape) {
  try { shape.setPluginData(KEY_STATE, ""); } catch (_) {}
}

function snapshot(shape, options) {
  return {
    sourceText: String(shape.characters || ""),
    originalGrowType: shape.growType,
    originalWidth: Number(shape.width) || 1,
    originalHeight: Number(shape.height) || 1,
    lastWidth: Number(shape.width) || 1,
    lastHeight: Number(shape.height) || 1,
    lastRendered: String(shape.characters || ""),
    lines: options.lines,
    ellipsis: options.ellipsis,
    breakMode: options.breakMode,
    keepBoxHeight: options.keepBoxHeight,
    live: options.live
  };
}

function optionsFromState(state) {
  return {
    lines: Math.max(1, Math.min(12, parseInt(state.lines, 10) || 1)),
    ellipsis: typeof state.ellipsis === "string" && state.ellipsis.length ? state.ellipsis : DEFAULT_ELLIPSIS,
    breakMode: state.breakMode === "character" ? "character" : "word",
    keepBoxHeight: state.keepBoxHeight !== false,
    live: state.live === true,
    includeDescendants: true,
    layerName: "",
    useCurrentAsSource: false
  };
}

function isMixedTypography(shape) {
  const values = [shape.fontSize, shape.fontFamily, shape.fontWeight, shape.lineHeight];
  for (let i = 0; i < values.length; i += 1) {
    if (String(values[i]) === "mixed") return true;
  }
  return false;
}

async function waitForLayout() {
  try { await penpot.waitForLayoutUpdate(1000); }
  catch (_) {}
}

function renderedHeight(shape) {
  try {
    const bounds = shape.textBounds;
    const height = bounds ? Number(bounds.height) : 0;
    if (Number.isFinite(height) && height > 0) return height;
  } catch (_) {}
  return Math.max(0.1, Number(shape.height) || 0.1);
}

async function measure(shape, text, width) {
  shape.characters = text || " ";
  shape.growType = "auto-height";
  try { shape.resize(Math.max(1, width), Math.max(1, Number(shape.height) || 1)); }
  catch (_) {}
  await waitForLayout();
  return renderedHeight(shape);
}

function wordCutPoints(text) {
  const points = [0];
  const re = /\S+(?:\s+|$)/g;
  let match;
  while ((match = re.exec(text))) points.push(match.index + match[0].length);
  if (points[points.length - 1] !== text.length) points.push(text.length);
  const unique = [];
  for (let i = 0; i < points.length; i += 1) {
    if (i === 0 || points[i] !== points[i - 1]) unique.push(points[i]);
  }
  return unique;
}

function characterCutPoints(text) {
  const points = [0];
  for (let i = 1; i <= text.length; i += 1) points.push(i);
  return points;
}

function candidate(source, cut, ellipsis) {
  const head = source.slice(0, cut).replace(/\s+$/, "");
  return head ? head + ellipsis : ellipsis;
}

async function renderTarget(shape, state, reason) {
  if (!shape || shape.type !== "text") return { status: "skipped", reason: "not text" };
  if (processing.has(shape.id)) return { status: "skipped", reason: "busy" };
  if (isMixedTypography(shape)) return { status: "skipped", reason: "mixed typography" };

  processing.add(shape.id);
  const options = optionsFromState(state);
  const currentWidth = Math.max(1, Number(shape.width) || Number(state.lastWidth) || 1);
  const currentHeight = Math.max(1, Number(shape.height) || Number(state.lastHeight) || 1);
  const beforeText = String(shape.characters || "");
  const beforeGrow = shape.growType;

  try {
    const sourceText = String(state.sourceText || "");
    if (!sourceText) return { status: "skipped", reason: "empty text" };

    const probes = [];
    for (let i = 0; i < options.lines; i += 1) probes.push("M");
    const maxHeight = await measure(shape, probes.join("\n"), currentWidth);
    const fullHeight = await measure(shape, sourceText, currentWidth);

    let finalText = sourceText;
    let truncated = false;

    if (fullHeight > maxHeight + 0.5) {
      const points = options.breakMode === "character" ? characterCutPoints(sourceText) : wordCutPoints(sourceText);
      let low = 0;
      let high = points.length - 1;
      let bestCut = 0;

      while (low <= high) {
        const mid = Math.floor((low + high) / 2);
        const cut = points[mid];
        const text = candidate(sourceText, cut, options.ellipsis);
        const height = await measure(shape, text, currentWidth);
        if (height <= maxHeight + 0.5) {
          bestCut = cut;
          low = mid + 1;
        } else {
          high = mid - 1;
        }
      }

      finalText = candidate(sourceText, bestCut, options.ellipsis);
      truncated = finalText !== sourceText;
    }

    shape.characters = finalText;
    shape.growType = "fixed";
    try { shape.resize(currentWidth, options.keepBoxHeight ? currentHeight : Math.max(1, maxHeight)); }
    catch (_) {}
    await waitForLayout();

    state.lastWidth = Number(shape.width) || currentWidth;
    state.lastHeight = Number(shape.height) || currentHeight;
    state.lastRendered = finalText;
    saveState(shape, state);

    return { status: "ok", truncated: truncated, reason: reason || "manual" };
  } catch (error) {
    try {
      shape.characters = beforeText;
      shape.growType = beforeGrow;
      shape.resize(currentWidth, currentHeight);
      await waitForLayout();
    } catch (_) {}
    throw error;
  } finally {
    processing.delete(shape.id);
  }
}

function getShapeById(id) {
  try {
    const page = penpot.currentPage;
    return page ? page.getShapeById(id) : null;
  } catch (_) {
    return null;
  }
}

function addWatcher(watcherShape, targetId) {
  if (!watcherShape || !watcherShape.id) return;
  const watcherId = watcherShape.id;
  let entry = watcherRegistry.get(watcherId);

  if (!entry) {
    const listenerId = penpot.on("shapechange", function () {
      const current = watcherRegistry.get(watcherId);
      if (!current) return;
      current.targets.forEach(function (id) {
        if (!processing.has(id)) queueTarget(id);
      });
    }, { shapeId: watcherId });

    entry = { listenerId: listenerId, targets: new Set() };
    watcherRegistry.set(watcherId, entry);
  }

  entry.targets.add(targetId);
  let watchers = targetWatchers.get(targetId);
  if (!watchers) {
    watchers = new Set();
    targetWatchers.set(targetId, watchers);
  }
  watchers.add(watcherId);
}

function watchTarget(shape) {
  unwatchTarget(shape.id);
  let cursor = shape;
  let depth = 0;
  while (cursor && depth < 8) {
    addWatcher(cursor, shape.id);
    cursor = cursor.parent || null;
    depth += 1;
  }
}

function unwatchTarget(targetId) {
  const watcherIds = targetWatchers.get(targetId);
  if (!watcherIds) return;

  watcherIds.forEach(function (watcherId) {
    const entry = watcherRegistry.get(watcherId);
    if (!entry) return;
    entry.targets.delete(targetId);
    if (!entry.targets.size) {
      try { penpot.off(entry.listenerId); } catch (_) {}
      watcherRegistry.delete(watcherId);
    }
  });

  targetWatchers.delete(targetId);
  pendingTargets.delete(targetId);
}

function queueTarget(targetId) {
  pendingTargets.add(targetId);
  if (flushQueued) return;
  flushQueued = true;
  Promise.resolve().then(flushPendingTargets);
}

async function flushPendingTargets() {
  flushQueued = false;
  const ids = Array.from(pendingTargets);
  pendingTargets.clear();
  await waitForLayout();

  for (let i = 0; i < ids.length; i += 1) {
    const id = ids[i];
    if (processing.has(id)) continue;
    const shape = getShapeById(id);
    if (!shape || shape.type !== "text") {
      unwatchTarget(id);
      continue;
    }

    const state = parseState(shape);
    if (!state || state.live !== true) {
      unwatchTarget(id);
      continue;
    }

    const width = Number(shape.width) || 1;
    const height = Number(shape.height) || 1;
    const widthChanged = Math.abs(width - Number(state.lastWidth || 0)) >= 0.25;
    const heightChanged = Math.abs(height - Number(state.lastHeight || 0)) >= 0.25;
    if (!widthChanged && !heightChanged) continue;

    try {
      await renderTarget(shape, state, "shapechange");
    } catch (error) {
      send({ type: "live-error", name: shape.name || "Text", error: errorMessage(error) });
    }
  }
  sendLiveState();
}

async function runApply(rawOptions) {
  const options = normalizeOptions(rawOptions);
  const selection = getSelection();
  let targets = collectTextShapes(selection, options.includeDescendants);
  targets = targets.filter(function (shape) { return matchesLayerName(shape, options.layerName); });

  if (!selection.length) {
    send({ type: "result", ok: false, error: "Select at least one text layer, board, group, or component first." });
    return;
  }
  if (!targets.length) {
    send({ type: "result", ok: false, error: "No matching text layers were found in the selection." });
    return;
  }

  let applied = 0;
  let truncated = 0;
  const skipped = [];
  const errors = [];

  for (let i = 0; i < targets.length; i += 1) {
    const shape = targets[i];
    send({ type: "progress", current: i + 1, total: targets.length, name: shape.name || "Text" });
    try {
      let state = parseState(shape);
      if (!state || options.useCurrentAsSource) state = snapshot(shape, options);
      state.lines = options.lines;
      state.ellipsis = options.ellipsis;
      state.breakMode = options.breakMode;
      state.keepBoxHeight = options.keepBoxHeight;
      state.live = options.live;
      saveState(shape, state);

      const result = await renderTarget(shape, state, "apply");
      if (result.status === "ok") {
        applied += 1;
        if (result.truncated) truncated += 1;
        if (options.live) watchTarget(shape);
        else unwatchTarget(shape.id);
      } else {
        skipped.push((shape.name || "Text") + ": " + result.reason);
      }
    } catch (error) {
      errors.push((shape.name || "Text") + ": " + errorMessage(error));
    }
  }

  send({
    type: "result",
    ok: applied > 0,
    action: "apply",
    applied: applied,
    truncated: truncated,
    live: options.live,
    skipped: skipped,
    errors: errors
  });
  sendSelectionState();
  sendLiveState();
}

async function restoreOne(shape) {
  const state = parseState(shape);
  if (!state) return false;
  unwatchTarget(shape.id);
  processing.add(shape.id);
  try {
    shape.characters = String(state.sourceText || "");
    if (state.originalGrowType === "fixed" || state.originalGrowType === "auto-width" || state.originalGrowType === "auto-height") {
      shape.growType = state.originalGrowType;
    }
    try {
      shape.resize(Math.max(1, Number(state.originalWidth) || 1), Math.max(1, Number(state.originalHeight) || 1));
    } catch (_) {}
    await waitForLayout();
    clearState(shape);
    return true;
  } finally {
    processing.delete(shape.id);
  }
}

async function runRestore(rawOptions) {
  const options = normalizeOptions(rawOptions);
  const selection = getSelection();
  let targets = collectTextShapes(selection, options.includeDescendants);
  targets = targets.filter(function (shape) { return matchesLayerName(shape, options.layerName); });

  if (!selection.length) {
    send({ type: "result", ok: false, error: "Select the text, board, group, or component to restore." });
    return;
  }

  let restored = 0;
  const errors = [];
  for (let i = 0; i < targets.length; i += 1) {
    try {
      if (await restoreOne(targets[i])) restored += 1;
    } catch (error) {
      errors.push((targets[i].name || "Text") + ": " + errorMessage(error));
    }
  }

  send({ type: "result", ok: errors.length === 0, action: "restore", restored: restored, errors: errors });
  sendSelectionState();
  sendLiveState();
}

async function refreshLiveTargets() {
  const ids = Array.from(targetWatchers.keys());
  let refreshed = 0;
  for (let i = 0; i < ids.length; i += 1) {
    const shape = getShapeById(ids[i]);
    const state = shape ? parseState(shape) : null;
    if (!shape || !state) continue;
    try {
      await renderTarget(shape, state, "refresh");
      refreshed += 1;
    } catch (_) {}
  }
  send({ type: "refresh-result", refreshed: refreshed });
}
