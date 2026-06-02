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

The deploy entry is `worker.js`, configured in `wrangler.jsonc`. The Worker serves `index.html` and loads the game source from `src/main.js` plus `src/styles.css`.

## Notes

The prototype starts directly in the arena and uses Phaser from jsDelivr, so the repository stays small and does not need a checked-in vendor bundle.
