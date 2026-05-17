# Third-party assets

## Audio

### `public/sounds/typewriter.ogg`

- **Source**: BigSoundBank — "Typewriter #1" (sound #1065)
- **URL**: https://bigsoundbank.com/detail-1065-typewriter.html
- **License**: CC0 (public domain — no attribution legally required;
  this credit is courtesy)
- **Description**: Several keystrokes and spacebar of a mechanical
  typewriter, 25 s, mono, 48 kHz.
- **Used by**: the `typewriter` keyboard sound pack
  (`src/io/sound-packs.ts`). Played as random ~120 ms slices per
  keystroke so each keypress sounds subtly different.

---

## Bundled corpus

Text passages in `src/io/corpus/data/` carry per-entry `license` fields.
Most are public domain (Twain, Thoreau, Emerson, Marcus Aurelius, etc.);
a handful are short fair-use snippets from modern authors. See the
individual `quotes.json` and `code/*.json` entries for attribution.
