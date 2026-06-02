# Ironhold Arena

First playable browser prototype for a 2D isometric action RPG arena.

## Play

- Move: `WASD` or arrow keys
- Strike: `J` or left mouse
- Dash: `Space`
- Cleave: `Q` or `K`
- Restart after defeat: `R` or the restart button

## Cloudflare Deploy

This repo is set up for Cloudflare Workers.

```powershell
wrangler deploy
```

The deploy entry is `worker.js`, configured in `wrangler.jsonc`. Because this repository is public, the Worker serves the app shell and proxies `/src/*.js` plus `/src/*.css` from GitHub raw URLs.

## Assets

Character art is based on `2D Top Down Character by RgsDev` by Raphael Goncalves (`@rgs_dev`). The included license allows public-domain/free personal or commercial use; credit is appreciated by the author.

## Notes

The prototype starts directly in the arena and uses Phaser from jsDelivr, so the repository stays small and does not need a checked-in vendor bundle.
