# Ontario Lease

A private, browser-based version of Ontario’s Residential Tenancy Agreement, based on the supplied form **2229E (2020/12)**. Fill in all 17 sections, add landlords and tenants, review the agreement, and print or save it as a PDF. The general-information appendix and signature lines are included. The printable layout differs from the Adobe form; the original is available under `public/original-lease.pdf`.

## Run

Use Node.js 20 or newer (validated with Node 24):

```sh
npm ci
npm start
```

The server uses port 3000; set `PORT` to change it. `npm run dev` restarts the server when server files change. Refresh the browser to see frontend changes. There is no build step, database, API key, or account setup.

## Drafts and printing

- Enter information section by section. Rent totals update automatically.
- **Save on device** opts into browser local storage. Before opting in, information is held in memory and is lost on refresh. After opting in, edits save automatically. Shared-device users should clear their draft when finished.
- **Export draft** downloads a JSON file; **Import** restores an exported file. These files contain the entered personal information.
- **Review & print** shows the complete agreement. Use **Print / Save as PDF** and select your printer or the browser’s PDF destination. The print stylesheet uses Letter paper and excludes navigation and editing controls. Disable browser headers/footers for a clean copy.
- Signature lines are intended for signing after printing. This app does not collect electronic signatures.
- Additional terms entered in Section 15 print as a separate attachment.

Information is not submitted to the server. There are no third-party scripts, fonts, or analytics. A previously saved draft remains on that browser until cleared.

## Verify

```sh
npm test
npm run test:browser
```

Server tests check all sections and appendix parts, the original PDF, and file access boundaries. Browser checks exercise repeated tenants, local saving/restoration, rent calculations, NSF amount validation, review, signature lines, PDF generation, and mobile overflow. They require Chromium at `/usr/bin/chromium`, or set `CHROMIUM_PATH` to another executable. With Playwright-managed browsers, install Chromium using `npx playwright install chromium` first.

The web form transcribes the supplied 2020/12 document; it does not automatically update when Ontario revises the form. The source PDF is retained for comparison. This app is not an official government website.

## GitHub Pages

The `public/` directory is a complete static website. Relative asset paths support the repository's GitHub Pages URL. The `gh-pages` branch contains the contents of that directory. In repository **Settings → Pages**, choose **Deploy from a branch**, select **gh-pages** and **/ (root)**, then save. GitHub will display the published URL when deployment completes.

To publish later edits, commit the app changes and push `git subtree split --prefix public HEAD` to `gh-pages` without force pushing. No entered lease data is included in the deployment; drafts exist only in the user's browser or exported JSON file.
