# Working with the owner of this repo

- **"dia"** means **"do it again"**. The owner sends it when a session was cut off midway (usually by a usage limit): pick up the last request that did not finish and redo or complete it, without asking what "dia" means.
- The owner writes in a mix of Japanese and English. Reply in Japanese.
- `SoundWalk/` is the 3D music-map game (see `SoundWalk/README.md`). Unreleased audio lives in `SoundWalk/audio/`, which is git-ignored on purpose: this repo is public, so never commit the mp3s.
- Local development (VS Code): see `SoundWalk/DEV.md`. Open `soundwalk.code-workspace` (this repo plus `../nshack`). After changing the game, run `npm test` in `SoundWalk/` (a real-browser smoke test, desktop and phone; screenshots in `SoundWalk/tests/out/`) and report PASS/FAIL. The shop is tested locally with Stripe test mode only: `?api=http://localhost:3000/api/soundwalk` on a localhost page.
