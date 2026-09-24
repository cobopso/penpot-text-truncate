# Text Truncate Live for Penpot

Figma-like live text truncation for Penpot. The plugin stores the full source text and recalculates the visible ellipsis when a text layer or its layout container changes size.

## Install

Install this manifest in Penpot:

`https://cobopso.github.io/penpot-text-truncate/manifest.json`

## Usage

1. Select a text layer, frame, component, or board.
2. Configure max lines and optional settings.
3. Click **Enable live truncation**.
4. Resize the text or its parent layout; the visible ellipsis updates automatically.
5. Use **Compact window** to reduce the plugin panel while keeping live resize active.

## Why compact mode?

Penpot currently exposes no native `text-overflow: ellipsis` property to plugins, so responsive truncation needs an active plugin runtime. Version 0.3.1 intentionally uses a small compact panel instead of trying to hide an already-open plugin UI, which can be unstable in Penpot.

After reloading Penpot or restarting the browser, open the plugin once to reconnect previously configured live text layers.

## License

MIT
