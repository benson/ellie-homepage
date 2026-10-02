# ellie's homepage

static site at elliexcenteno.com, hosted on github pages. shows a hand-picked listening shelf (from the studio) and goodreads (currently reading + recently read) activity.

## structure
- `index.html` — single page, has `<!-- SPOTIFY_START -->` / `<!-- ONREPEAT_START -->` / `<!-- READING_START -->` / `<!-- READ_START -->` markers that get rewritten by the build script
- `style.css` — all styles
- `scripts/build-page.js` — bakes the listening shelf + goodreads data into index.html (images inlined as base64)
- `.github/workflows/update-page.yml` — hourly cron rebuilds the page

## how the listening shelf gets in
the old spotify api feed was retired in 2026-10 (its refresh token kept expiring). now:
1. ellie picks items in the studio's "listening" tab (`studio/listening.js`) — any audio link (spotify, bandcamp, soundcloud, nts, youtube…). the backend's `?type=preview&url=` reads the link's og: title/cover; she can edit both or upload her own cover.
2. publish stores the whole list in the apps script's `LISTENING_ITEMS` script property (`studio/apps-script.gs` v4, `setListening`).
3. the homepage fetches `?type=listening` live (cached in localStorage `studio-latest-listening`), and the hourly build bakes the same list between the `SPOTIFY_START`/`SPOTIFY_END` markers as the no-js / cold-start fallback. the marker names and `#spotify-recent` id are historical.

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
edit `index.html` and `style.css` directly. don't touch the content between the `<!-- SPOTIFY_START -->` / `<!-- SPOTIFY_END -->`, `READING` or `READ` markers — that gets overwritten on every cron run.
