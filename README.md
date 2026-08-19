# Cover Page Generator

Make cover page PDF from `data/data.json`.

## Install

```bash
npm install
```

## Website flow

Run site:

```bash
npm run web
```

Then open:

```bash
http://localhost:3000
```

What you do:

- choose type
- choose student
- choose course
- date is optional
- press `Generate PDF`
- PDF downloads as `cover-page.pdf`

## Cloudflare Pages (GitHub deployment)

This project is ready for Cloudflare Pages with Pages Functions and the Browser Rendering binding. The build step copies the editable source data and logo into `public/`, which is the Pages deployment directory.

1. Push this repository to GitHub.
2. In Cloudflare, go to **Workers & Pages → Create → Pages → Connect to Git** and select the repository.
3. Set **Framework preset** to `None`, **Build command** to `npm run build`, and **Build output directory** to `public`.
4. Enable the Browser Rendering binding named `BROWSER` in **Settings → Functions → Bindings** if Cloudflare has not applied `wrangler.jsonc` automatically.
5. Deploy. Pushes to `main` become production deployments; other branches receive previews.

For local Cloudflare development, run `npm install`, then `npm run build` and `npm run cf:dev`. Browser Rendering uses Cloudflare remotely, so authenticate first with `npx wrangler login`.

## Command flow

Run:

```bash
node generate_pdf.js <profileIndex> <courseIndexOrCourseCode> [submissionDate]
```

Or:

```bash
npm run generate -- <profileIndex> <courseIndexOrCourseCode> [submissionDate]
```

Examples:

```bash
node generate_pdf.js 0 3
node generate_pdf.js 1 "CSE 4101"
node generate_pdf.js 1 "CSE 4101" "10 May 2026"
```

## Notes

- profile index starts from `0`
- course can be index or exact course code
- if date is not passed, submission date stays blank
- if command args are missing, script shows the valid list
