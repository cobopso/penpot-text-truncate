# Text Truncate Live for Penpot — GitHub Pages build

This folder is ready to upload directly to the root of the GitHub repository:

`cobopso/penpot-text-truncate`

After GitHub Pages is enabled, install the plugin in Penpot with:

`https://cobopso.github.io/penpot-text-truncate/manifest.json`

## One-time GitHub setup

1. Create a **Public** repository named exactly `penpot-text-truncate`.
2. Upload **the contents of this folder** to the repository root (not the folder itself).
3. Open **Settings → Pages**.
4. Under **Build and deployment**, choose **Deploy from a branch**.
5. Choose branch **main** and folder **/(root)**, then **Save**.
6. Wait for GitHub Pages to publish.
7. Check this URL in a browser:
   `https://cobopso.github.io/penpot-text-truncate/manifest.json`
8. In Penpot Plugin Manager, remove the localhost build if desired, then install the URL above.

## Important behavior

Live truncation still requires the plugin window to remain open because Penpot does not currently expose a native text-overflow/ellipsis property. GitHub Pages only removes the need to run a local server.

## Files

- `manifest.json` — Penpot plugin manifest v2
- `plugin.js` — Penpot-side plugin logic
- `index.html` — plugin UI
- `main.js` — plugin UI logic
- `styles.css` — plugin UI styles
- `icon.svg` — plugin icon
- `.nojekyll` — prevents GitHub Pages/Jekyll processing
