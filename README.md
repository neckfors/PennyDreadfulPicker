# Penny Dreadful Card Picker

## First use

1. Each **Period** box holds comma-separated years. **Random** picks one year from its box. **Templates** save and load named sets of the three boxes.
2. Press **Fetch all** once. It downloads every Penny Dreadful card with all its printings and every card image. The first time takes 10–15 minutes and about 1.7 GB of browser storage. The images carry on where they stopped if you interrupt them, but the card data download has to finish in one go, so keep the tab open.
3. **Fetch all** also fills the grid for the years you have picked. After you press **Random** again, press **Fetch cards** to show the new years. It is instant.
4. Press **Fetch all** again from time to time. It then only checks for new cards and printings, which is quick.

## Easy to miss

- **Hold Shift** over a card to see it at full image size. Let go and it disappears. The name tooltip says so too.
- **Click** a card to select it, and click again to unselect. **Selected only** shows just your picks. **Clear selected** empties the selection after you type `clear`.
- **Search** runs on Enter. While a search is active, the box turns blue and shows the number of matches. Emptying the box (or its ✕) removes the search at once. To refine a search, add to the text and press Enter.
- **Shift-click Fetch all** throws away the stored catalogue and downloads everything again. You rarely need it.
- The **version number** is at the end of the top bar. When a new version is online, a bar at the top says "New version available". Press **Update** to load it. Nothing reloads by itself.
- **Colour buttons** show cards you can cast with only the selected colours. Hybrid and Phyrexian mana count either way. **Multicolor**, **Colorless** and **Lands** are separate filters. **Sort** has many keys, and the arrow flips the direction.

## Search

Common searches run instantly on the cards you have. You can use:

- words, and quoted names: `goblin`, `"lightning bolt"`
- `t:` type, `o:` rules text, `is:dfc` for double-faced cards
- `c:` colour and `id:` (or `ci:`) colour identity, with `:`, `=`, `>=`, `<=`, `>`, `<`, for example `c>=ub`, `id<=g`, `c:c` (colorless), `c:m` (multicolor)
- `cmc` (or `mv`), `pow`, `tou` with `=`, `>`, `<`, `>=`, `<=`
- `r:` rarity (`r>=rare`), `s:` set code, `a:` artist
- `and`, `or`, `-` for "not", and brackets: `(t:elf or t:goblin) -c:g`

Text in brackets in rules text (reminder text) is not searched.

If a search uses anything below, the whole search goes to [Scryfall](https://scryfall.com/docs/syntax) instead. It still works, but takes a few seconds and only finds cards from the years you fetched:

- **Other keys:** `year:`, `date:`, `f:` / `format:`, `legal:`, `banned:`, `restricted:`, `game:`, `lang:`, `border:`, `frame:`, `layout:`, `number:` / `cn:`, `block:`, `st:`, `new:`, `in:`, `has:`, `not:`
- **Other `is:` words:** everything except `is:dfc`, for example `is:split`, `is:commander`, `is:reprint`
- **Mana and stats:** `m:` / `mana:`, `devotion:`, `produces:`, `loy:`, `cmc:even` / `cmc:odd`, and comparing two stats such as `pow>tou`
- **Text and art:** `ft:` / `flavor:`, `wm:` (watermark), `art:` / `atag:`, `otag:` / `function:`, `kw:` / `keyword:`
- **Prices and ranks:** `usd`, `eur`, `tix`, `edhrec`, `penny`
- **Other forms:** exact name `!"Name"`, regular expressions `/.../`, `~` inside `o:`, colour names such as `c:azorius`, and `c>=m` style tests with `m` or `c`
- **Display options:** `unique:`, `order:`, `direction:`, `prefer:`, `include:`

## Banned list

**Banned: add file** and **Banned: replace** read text files with one card per line.

- Each file is read until the first empty row, so a sideboard after it is skipped.
- Counts such as `2 Swords to Plowshares` are ignored, and rows with count 0 are skipped.
- For double-faced rows (`A // B`) only the front name is read. A card whose faces are all lands is skipped.
- Banned cards are struck through. **Hide banned** removes them from view.
- The **⊘ Banned** button shows every banned card, whatever the years. Only the colour and land filters apply there, so search and Selected only are switched off. A line under the top bar lists the files read, names not found, lands skipped and rows with count 0. Click a name to see the card.

## Which printing you see

Each card is shown with its newest plain printing: not a promo, Secret Lair, showcase, borderless or full-art version, so the text is readable. If a card only has special printings, you see the newest of those. Prices and set shown follow that printing.

## Where your data lives

Everything is stored in your browser, on this computer: cards, images, selection, banned list and settings. Another browser or computer starts empty.

- **Export** saves your settings, selection, banned list and card list to a file, and **Import** loads one. Images and the full catalogue are not included.
- Clearing the browser's site data for this page deletes everything.

## If something goes wrong

- **Fetching stops or shows errors:** Scryfall limits how fast it answers. The app waits and retries by itself. If it still fails, wait ten minutes and press the button again.
- **The version is old:** reload the page and press Update if the bar shows.
- **Cards look wrong after a long time:** press Fetch all again.

## Hosting

The GitHub Action in `.github/workflows/pages.yml` encrypts `index.html` with [StatiCrypt](https://github.com/robinmoisson/staticrypt) and deploys to GitHub Pages:

1. Add a repository secret `STATICRYPT_PASSWORD`.
2. In Settings → Pages, set the source to **GitHub Actions**.
3. Push to `main`.

Run locally with any static server, for example `python -m http.server`.
