# Submission checklist

## One-time account setup

- [ ] Chrome Web Store developer account registered (one-time US$5 fee).
- [ ] 2-Step Verification enabled on the Google account.
- [ ] Developer contact email verified (`contact@mrkazemi.com`).
- [ ] Publisher name and trader/non-trader declaration completed for the EU.
- [ ] GitHub repository public and GitHub Pages enabled:
  - Settings → Pages → Deploy from a branch → `main` / `/docs`
  - Privacy URL: https://morekaccino.github.io/browser-agent-for-opencode/privacy.html
  - Homepage: https://morekaccino.github.io/browser-agent-for-opencode/

## Before building

- [ ] `PRIVACY.md` and `docs/privacy.html` match.
- [ ] Store listing copy matches the manifest name and current version.
- [ ] No personal email in git history (`git log --format='%an <%ae>'`).
- [ ] No `.env`, keys, certificates, logs, or local paths in the repo.
- [ ] Version in `extension/package.json` and `package.json` is 0.2.0.

## Build and verify

- [ ] `npm run compile` passes.
- [ ] `npm run store:package` passes.
- [ ] `store/browser-agent-for-opencode-0.2.0-chrome.zip` exists.
- [ ] `store/SHA256SUMS.txt` matches the zip.
- [ ] The verifier reports no secrets, no `eval()`/`new Function()`, no source maps, and no dev files.
- [ ] The zip contains `manifest.json` at its root.
- [ ] The zip contains `bridge/browser-bridge.ts` for the setup download.
- [ ] The zip does not contain `store/`, `docs/`, `node_modules/`, `.git/`, or `desktop.ini`.

## Manual test on a clean profile

- [ ] Load the zip/unpacked build in a clean Chrome profile.
- [ ] First-run privacy screen appears; the policy link opens.
- [ ] Accepting the disclosure stores consent and does not show the screen again.
- [ ] Setup screen appears when opencode is not running.
- [ ] “Download bridge plugin” saves `browser-bridge.ts`.
- [ ] With opencode running and the plugin installed, both status dots turn green.
- [ ] Chat sends a prompt and streams a response.
- [ ] Page snapshot, click, type, navigate, console read/exec, screenshot, tabs, and downloads work.
- [ ] `console.exec` works in hook mode and leaves no debugger attached.
- [ ] Workflows are read-only by default; the submission opt-in works.
- [ ] “Clear stored data” clears extension data.
- [ ] No personal tabs, sessions, emails, or local paths appear in screenshots.

## Store listing

- [ ] Name: **Browser Agent for opencode**
- [ ] Short description ≤ 132 characters.
- [ ] Detailed description includes requirements and the independence disclaimer.
- [ ] Category: Developer Tools.
- [ ] Homepage URL set.
- [ ] Support URL set.
- [ ] Privacy policy URL set.
- [ ] Icon: `store/icon/icon-128.png` (96×96 artwork + 16 px transparent padding).
- [ ] Small promo: `store/promo/small-440x280.png`.
- [ ] Screenshots: `01-chat.png`, `02-privacy.png`, `03-workflows.png` (1280×800).
- [ ] Optional: 1400×560 marquee and a 30–60 second unlisted demo video.

## Privacy practices

- [ ] Single purpose entered.
- [ ] Every permission justified (`store/permissions.md`).
- [ ] Remote code declared **Yes** with the Debugger API explanation.
- [ ] Data usage checkboxes match `store/privacy-practices.md`.
- [ ] Limited Use certifications selected.
- [ ] Privacy policy URL returns 200 and is readable while logged out.

## Review and publish

- [ ] Test instructions pasted from `store/review-notes.md`.
- [ ] Visibility: **Unlisted** for the first review.
- [ ] Submit.
- [ ] Monitor the developer email for review questions.
- [ ] After approval: switch visibility to **Public**.
- [ ] Update the docs “Chrome Web Store” link and README with the live listing URL.
- [ ] Tag the release in git and attach the zip/checksum to the GitHub release.

## Post-launch

- [ ] Respond to support issues.
- [ ] Keep the bridge pairing and privacy disclosures in sync with future versions.
- [ ] If data practices change, update the policy and prompt users to review the disclosure.
