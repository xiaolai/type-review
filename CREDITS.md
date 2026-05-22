# Third-party assets

## Audio

### `public/sounds/typewriter.ogg`

- **Source**: BigSoundBank — "Typewriter #2" (sound #2835)
- **URL**: https://bigsoundbank.com/typewriter-2-s2835.html
- **License**: CC0 (public domain — no attribution legally required;
  this credit is courtesy)
- **Description**: Continuous typing session on a Hermes Precisa 305
  (Swiss 1960s desktop typewriter, known for crisp typebar action
  against a heavy steel frame), 83 s, stereo, 48 kHz / 24-bit.
  Recorded by Joseph SARDIN with a Tascam DR-40 + Sennheiser ME66.
- **Used by**: the `typewriter` keyboard sound pack
  (`src/io/sound-packs.ts`). Played as random ~80 ms slices per
  keystroke so each keypress sounds subtly different.

---

## Bundled corpus

Text passages in `src/io/corpus/data/` carry per-entry `license` fields.
Most are public domain (Twain, Thoreau, Emerson, Marcus Aurelius, etc.);
a handful are short fair-use snippets from modern authors. See the
individual `quotes.json` and `code/*.json` entries for attribution.

## DET Read and Complete drills

The practice items in `src/ui/det-practice-data.ts` are original
example sentences written for Duolingo English Test (DET) Read and
Complete practice. They are not official Duolingo English Test items and
are not copied from any test bank. The app does not call a remote
generator at runtime; the custom target score filters and presents the
bundled practice bank locally.
