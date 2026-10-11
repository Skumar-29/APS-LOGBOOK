# Upload beta 8 manually

The source package is for [Skumar-29/APS-LOGBOOK](https://github.com/Skumar-29/APS-LOGBOOK). This session has not pushed code or deployed the app. The existing live link stays on its current version until you publish the changes.

These steps run on your computer or in GitHub and do not require another ChatGPT request. They do not use an OpenAI API key.

## On a computer with GitHub Desktop

1. Download and extract `APS-LOGBOOK-beta8-source.zip`.
2. In GitHub Desktop, clone **Skumar-29/APS-LOGBOOK**, or open your existing copy of that repository.
3. Create a branch named `fix/nhvr-engine-beta8`.
4. Copy the **contents** of the extracted `APS-LOGBOOK-beta8` folder into the repository folder, beside its existing `package.json`. Include the `src`, `public`, `tests`, `scripts`, `docs` and `.github` folders and the root configuration files. Do not put the whole extracted folder inside the repository. Keep the repository's existing `.git` folder.
5. If the repository contains `CNAME` or `public/CNAME`, remove those two legacy domain files; they are intentionally absent from this source package.
6. Run the checks below. Review the Changes list, use the commit message `Fix shared NHVR hours engine and add plain-language guide`, then click **Commit** and **Publish branch**.
7. Open a pull request into `main`. Wait for **Build and test** to pass and review the app on a phone before merging. GitHub Actions already runs the unit tests, production build and both browser projects.

## Local checks

Open a terminal inside the repository folder, where `package.json` is:

```sh
npm ci
npm test
npm run build
npx playwright install chromium
npm run test:e2e
npm run preview
```

Use the local address printed by the final command. These are ordinary local build/test commands; there is no ChatGPT or AI request in them. Node.js 24 is used by the included GitHub workflow.

The browser tests could not run in this workspace because the Chromium executable was missing. Do not count earlier versions' browser results as a pass for beta 8. If Chromium requires operating-system dependencies on Linux, use `npx playwright install --with-deps chromium`.

## Quick phone checks before release

Use test data and your normal rules settings:

- Enter work **20:15 on 10 October → 03:00 on 11 October**. It must total **6h 45m** across both pages. Assuming the required earlier rest and no other work, the first overdue block is **01:30 for Standard solo** or **02:15 for BFM solo**.
- At 13:00, enter 00:00–12:00 work and later 20:00–22:00 planned work. Today must show **12h work / 1h rest**. The future work is hatched and does not count yet.
- Check the running timer in Diary, Driving and Stats. Export CSV and PDF; their assessed totals must agree with the screen at the same cutoff.
- Open **More → NHVR guide**. Check its examples, hours tables and official links. Check 320px layout, scrolling, day/night appearance, offline reload and saved records.

AFM/ACH certificates, WA/NT rules, exemptions and conditional BFM split rests remain explicit review cases. This is a personal checker, not an approved EWD.

## Existing hosting

The existing app is [work-diary-beta-mu.vercel.app](https://work-diary-beta-mu.vercel.app/). If that Vercel project is connected to APS-LOGBOOK, merging a reviewed branch may trigger a deployment. Confirm the repository, production branch and successful deployment in Vercel. Keep the same origin to retain the browser's saved records; export a backup before installing an update.

If your deployment uses GitHub Pages, the included **Publish reviewed production build** workflow is manually dispatched after the checks pass. Do not upload a ZIP as a single repository file and expect it to run: the extracted source files must be committed, and hosting must build the app.
