# hero.mp4

Place your looping background video here as `hero.mp4`.

Requirements:
- Format: MP4 (H.264), ideally also provide `hero.webm` (VP9) for better compression
- Duration: 10–30 seconds, seamless loop
- Resolution: 1920×1080 minimum
- No audio track needed (the element uses `muted`)
- Keep file size under 8 MB for fast load

The `<video>` element in `landing-page.tsx` references `/videos/hero.mp4`.
If the file is absent the page falls back to the dark gradient background defined in `.heroPage`.
