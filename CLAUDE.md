# ellie's homepage

static site at elliexcenteno.com, hosted on github pages. shows ellie's recent spotify listens and on-repeat tracks.

## structure
- `index.html` — single page, has `<!-- SPOTIFY_START -->` / `<!-- ONREPEAT_START -->` markers that get rewritten by the build script
- `style.css` — all styles
- `spotify-callback.html` — used during one-time spotify oauth setup
- `scripts/build-page.js` — fetches spotify data, inlines album art as base64 into index.html
- `scripts/spotify-auth-step1.js` / `step2.js` — one-time setup for getting a refresh token
- `.github/workflows/update-page.yml` — hourly cron rebuilds the page

## how spotify data gets in
1. github action runs hourly with secrets `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`, `SPOTIFY_REFRESH_TOKEN`
2. `build-page.js` uses refresh token to get a fresh access token, fetches recently-played and top-tracks
3. album art is downloaded and inlined as base64 (so the page is fully self-contained, no external image requests)
4. the file is rewritten between the marker comments and pushed back to the repo

## deploy
push to main. github pages deploys automatically. cache-bust `?v=N` on css/js links in `index.html` if you change them.

## local edits
edit `index.html` and `style.css` directly. don't touch the content between `<!-- SPOTIFY_START -->` / `<!-- SPOTIFY_END -->` (and the on-repeat equivalents) — that gets overwritten on every cron run.
