# UI kit (Game Artist)
- `theme.css`: load after the inline styles in index.html; it overrides colors, radius, spacing, font, meters, tabs, motion. Tokens in `:root`.
- `icons/*.svg`: 24px line icons, `stroke="currentColor"` so they take the button's text color. Inline them (fetch or paste) so color works; `<img>` will render them black.
- Tab bar icon map: log -> log.svg, discoveries -> discoveries.svg, prayers (step 21) -> prayers.svg, powers (step 22) -> powers.svg. Suggest adding `icon` to each config.ui.panels entry.
- Top bar: menu.svg (World), save.svg, load.svg, pause/play/fast/superfast for the 4 speeds, zoom_in/zoom_out, close.svg for the info card.
- Meters: works with the existing `bar()` markup and classes (hot, trait, water, energy, warm); only colors, rounding and a width transition change.
- Personal log: wrap the person's events in `.plog`; add `death`/`birth`/`disc` classes on `.ev` for color.
- Rules kept: text >= 16px, tap targets >= 44px (tab bar 56px), map stays pixel art, no speech-bubble art.
