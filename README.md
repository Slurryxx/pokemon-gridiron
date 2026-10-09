# Pokémon Gridiron — Online Draft Night

A fan-made two-player Pokémon football simulation featuring the original 151 Pokémon.

## Play locally
Requires Node.js 20+. Run `npm start` and open http://localhost:3000.

1. Player 1 creates a private room and shares the invite URL.
2. Player 2 joins. The server enforces a **44-pick snake draft** (1–2–2–1) across a shared pool of 151 Pokémon. Each player drafts 22 unique Pokémon.
3. Each player assigns 11 offense and 11 defense starters.
4. When both players lock their lineups, the server simulates four quarters and displays a shared score and play-by-play.

Pokémon performance ratings and base stats remain server-side. The client only sees names, types, sprites, height and weight.

## Pokémon database
On startup, the server downloads original 151 Pokémon records from [PokéAPI](https://pokeapi.co/): **moves, height, weight, types, abilities, and all six base stats**. It caches records to `pokemon_151.json` when the filesystem is writable. This file is ignored by Git and never exposed by the web server. First startup requires PokéAPI network access and may take several minutes. Drafting is disabled until all records are loaded.

## Public deployment (Render)
This repository includes `render.yaml`. In [Render](https://dashboard.render.com), select **New → Blueprint** and connect this GitHub repository. Render will create a Node.js web service and supply a public `https://…onrender.com` URL. Alternatively create a Web Service with build command `npm install` and start command `npm start`.

**Deployment is not automatic when the code is pushed.** A Render account must be connected and the service created before a public URL exists.

## Prototype limitations
- Private rooms and results are in-memory only; server restarts erase them.
- Render's free service can sleep; restarting requires reloading PokéAPI data if the cache is not persisted.
- Game results are generated immediately rather than streamed as live animation.
- Ratings and simulation are experimental; no user accounts, ranked games, or persistent database yet.
- Pokémon and sprites are third-party IP. Review relevant permissions before public/commercial launch.
