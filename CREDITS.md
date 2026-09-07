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

## Acknowledgement

### Mechvibes — https://github.com/hainguyents13/mechvibes (MIT)

Where the idea came from, and where the `mechvibe` pack's name came from.
Mechvibes is a keyboard sound simulator with swappable packs; this app
borrowed that shape and nothing else. Its packs are recordings mapped per
key, with a separate release file per key (`soundup` and the `-up`
entries in its `config.json`); every synthesised pack here is generated
from a noise burst and an oscillator described in `src/io/sound-packs.ts`,
so no Mechvibes audio and no Mechvibes code is present. Nothing is
legally owed — this is a courtesy, and an accurate one is worth more than
a generous one.

---

## Bundled corpus

Text passages in `src/io/corpus/data/` carry per-entry `license` fields.
Most are public domain (Twain, Thoreau, Emerson, Marcus Aurelius, etc.);
a handful are short fair-use snippets from modern authors. See the
individual `quotes.json` and `code/*.json` entries for attribution.
