# ellie's homepage

static site at elliexcenteno.com, hosted on github pages. shows ellie's spotify (recent listens + on repeat) and goodreads (currently reading + recently read) activity.

## structure
- `index.html` — single page, has `<!-- SPOTIFY_START -->` / `<!-- ONREPEAT_START -->` / `<!-- READING_START -->` / `<!-- READ_START -->` markers that get rewritten by the build script
- `style.css` — all styles
- `spotify-callback.html` — used during one-time spotify oauth setup
- `scripts/build-page.js` — fetches spotify + goodreads data, inlines images as base64 into index.html
- `scripts/spotify-auth-step1.js` / `step2.js` — one-time setup for getting a refresh token
- `.github/workflows/update-page.yml` — hourly cron rebuilds the page

## how spotify data gets in
1. github action runs hourly with secrets `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`, `SPOTIFY_REFRESH_TOKEN`
2. `build-page.js` uses refresh token to get a fresh access token, fetches recently-played and top-tracks
3. album art is downloaded and inlined as base64 (so the page is fully self-contained, no external image requests)
4. the file is rewritten between the marker comments and pushed back to the repo

## how goodreads data gets in
goodreads has no working public api — instead we hit their public RSS endpoint:
`https://www.goodreads.com/review/list_rss/<user_id>?shelf=<shelf>`. it works without auth, but ellie's profile + shelves must be public (settings → privacy → "anyone").

1. the user id is hardcoded as `GOODREADS_USER_ID` at the top of `build-page.js`
2. `build-page.js` fetches RSS for `currently-reading` and `read` shelves, extracts title/author/cover/link from each `<item>`
3. covers are inlined as base64 like spotify
4. if `GOODREADS_USER_ID` is empty, the goodreads sections are skipped silently

## deploy
push to main. github pages deploys automatically. cache-bust `?v=N` on css/js links in `index.html` if you change them.

## local edits
edit `index.html` and `style.css` directly. don't touch the content between `<!-- SPOTIFY_START -->` / `<!-- SPOTIFY_END -->` (and the on-repeat equivalents) — that gets overwritten on every cron run.
