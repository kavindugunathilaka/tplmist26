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
- **National Holiday Resort:** 10 photos load from the resort's official site. To use your own, put them in `images/` and change the paths in `stays[0].photos`.
- **Dream Cottage:** slides 1–9 load from the property's own website. Add a 10th as `images/dream-10.jpg`. To stop depending on their site, download the photos into `images/` and change the paths in `stays[1].photos`.
- A photo that is missing or fails to load is skipped, so the slideshow only shows photos that load.
