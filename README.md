# Penny Dreadful Card Picker

A small web app for picking Penny Dreadful cards from random release years, using [Scryfall](https://scryfall.com).

## Use

1. Each **Period** box holds comma-separated years (defaults 2003–2009, 2010–2018, 2019–2025). **Random** picks one year from its box.
2. **Templates** save and load named sets of the three boxes.
3. **Fetch cards** runs one Scryfall search: `f:pd ((year:A or year:B or year:C) or t:land)`. Card data and images are cached in the browser, so a reload doesn't need Scryfall. Only new images are downloaded; images of cards that dropped out are deleted.
4. Click a card to select it, click again to unselect. **Selected only** shows just your picks.

### Filter bar

- **W U G R B** show cards castable with only the selected colours (any way of paying hybrid or Phyrexian mana counts). For double-faced cards only castable faces count, and an MDFC shows the face that matches.
- **Multicolor**: two or more colours, or hybrid mana. **Colorless**: castable without coloured mana (lands never count). **Lands**: all PD-legal lands; turning it on fetches them from Scryfall, so it works without a year fetch.
- **Search** takes full [Scryfall syntax](https://scryfall.com/docs/syntax) and runs on Enter, limited to the fetched years.
- **Sort** by name, mana value, colour, rarity, set, release date, prices, power, toughness and more. The arrow button flips the direction.
- **Size** slider resizes the cards.

### Banned list

Upload text files with one card per line; you can pick several files at once. Each file is read row by row until the first empty row (so a sideboard after it is skipped). Counts like `2 Swords to Plowshares` are ignored, and rows with count 0 are skipped. Lands are never banned and are listed as ignored. **Banned: add file** adds to the current list, **Banned: replace** replaces it. Banned cards are struck through. **Hide banned** removes them from view, and the **⊘ Banned** button in the filter bar shows only banned cards (colour filters, search and sort still apply). It works without a fetch: banned cards that are not loaded are looked up on Scryfall by name.

### Saving

The version number (for example v1.3) is shown at the end of the top bar.

Everything is saved in the browser automatically. **Export** writes a file with everything (pools, picked years, card list, selection, banned list, filters, sort, search, size); **Import** loads one.

## Hosting

The GitHub Action in `.github/workflows/pages.yml` encrypts `index.html` with [StatiCrypt](https://github.com/robinmoisson/staticrypt) and deploys to GitHub Pages:

1. Add a repository secret `STATICRYPT_PASSWORD`.
2. In Settings → Pages, set the source to **GitHub Actions**.
3. Push to `main`.

Run locally with any static server, for example `python -m http.server`.

Mana symbols: [Mana font](https://mana.andrewgioia.com/). Card data and images: Scryfall.
