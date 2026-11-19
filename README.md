# Into the Mist ’26: Nuwara Eliya & Horton Plains trip site

A static one-page site with no build step. To deploy it on Vercel, import this folder and use the **Other** preset. You don't need a build command, and the output directory is `./`.

## Updating it after the trip
All content comes from the `TRIP` object at the top of the `<script>` in `index.html`.

1. Put your photos in `images/`, for example `images/horton-1.jpg`. Resize them to about 1600px wide.
2. Find the place in `stops` or `extraPlaces` and fill in:
   - `photos: ["images/horton-1.jpg", "images/horton-2.jpg"]`
   - `did: "Reached World's End at 7:40, clear view for 10 minutes before the mist rolled in"`
   - `spent: 18500` (actual Rs. at that location)
3. In `budget`, set `actual:` for each category. The striped bars and the "Actual spent" total update automatically.
4. In `stays`, replace the higher-rate hotel's sample figures (`total`, `rate`, `perks`) with the real quote.
5. Add `images/cover.jpg`. It's used as the preview image when the link is shared on WhatsApp or Facebook.

## Stay slideshows (10 photos each)
- **National Holiday Resort:** `images/nhr-1.jpg` … `nhr-10.jpg` (from the resort's official site).
- **Dream Cottage:** `images/dream-1.jpg` … `dream-9.jpg` (from its official site); add a 10th as `images/dream-10.jpg`.
- A photo that is missing or fails to load is skipped, so the slideshow only shows photos that load.

## Location photos (10 per place, free licence)
The place cards, map panel and Memories gallery fill themselves from Wikimedia Commons. Run this from the repo root on your machine:

```bash
python3 scripts/fetch-place-photos.py
git add images/places && git commit -m "Add location photos" && git push
```

The script downloads up to 10 photos per place into `images/places/` and writes `images/places/credits.js` with the author and licence of each one. It only keeps CC0, public domain, CC BY and CC BY-SA photos, and the site shows the credit on every photo. To change the search terms, edit `PLACES` at the top of the script. Your own trip photos (`photos:` in the `TRIP` data) always show before these.

## Pin comments (Supabase)
Anyone with the link can tap **＋ Add comment**, tap a spot on the page, type their name and a note. Comments are stored in the Supabase Postgres database through the Vercel function `api/comments.js`.

- **No setup needed:** the function uses the `POSTGRES_URL` that the Vercel ⇄ Supabase integration adds, and creates the `trip_comments` table on first use.
- **Security:** Row Level Security is on with no policies, so the public Supabase API can't read or change the table. Only the function can. Inputs are validated and length-limited, and there's a basic per-browser rate limit.
- **Who can do what:** anyone can comment, reply, resolve or reopen. Only the browser that wrote a comment can delete it. To remove spam, delete rows in Supabase → Table Editor → `trip_comments`.
- **Updates:** the page checks for new comments every 15 seconds.

## Memories (group photo uploads)
Tap **＋ Add photos** in the Memories section, pick photos, choose the place, and add a caption and your name. Each photo is resized in the browser (about 1600px full plus a 480px thumbnail, JPEG) and stored in the `trip_photos` table through `api/photos.js`. Images are served from `/api/photos?id=…` with long-lived CDN caching. Uploaders can delete their own photos, and anything else can be removed in Supabase → Table Editor → `trip_photos`. The free Supabase database holds 500 MB, which is roughly 1,500+ photos at these sizes.
