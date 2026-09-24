# Text Truncate Live for Penpot

Figma-like live text truncation for Penpot. The plugin stores the full source text, recalculates the visible ellipsis when the text or its parent resizes, and can keep its runtime active in **hidden background mode** so the plugin window does not occupy the canvas.

## Install from GitHub Pages

After enabling GitHub Pages for this repository, install this manifest in Penpot:

`https://cobopso.github.io/penpot-text-truncate/manifest.json`

## v0.3 workflow

1. Select a text layer, frame, component, or board.
2. Configure max lines and other options.
3. Click **Enable live truncation**.
4. After a successful apply, the plugin automatically hides and continues running in the background.
5. You can also reopen the plugin and click **Run in background** to reconnect previously configured live layers without applying settings again.

### Important limitation

Penpot does not currently expose a native text-overflow/ellipsis property to plugins. The live behavior therefore depends on the plugin runtime. Hidden background mode keeps that runtime active without a visible panel. After reloading Penpot, restarting the browser, or reopening the file in another session, launch the plugin once to reconnect saved live layers, then send it to background again.
