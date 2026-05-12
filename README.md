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
