# Prime Harbor
Bilingual static corporate website. English / Russian, mobile navigation, accessible form, supplied brand assets.

Preview: https://iemtsov-cyber.github.io/primeharbor-site/

## Local preview
Run `python -m http.server 8080` in this folder, then open http://localhost:8080.
No build or dependencies required.

## GitHub Pages
Publish the main branch, repository root, under Settings → Pages. Only this site directory belongs in the public repository. Original supplied assets and the handoff brief are retained locally outside the publishing folder.

## Production
The live domain https://primeharbor.ru/ is served by nginx on the existing hosting account, separately from GitHub Pages. The production workflow transforms preview metadata, validates the site and publishes a versioned static artifact. A fixed server controller polls it every five minutes; workflow success requires confirmation from the live domain. See [publication, rollback and retention](deploy/README.md).

The form prepares an email draft; the visitor must send it. There is no submission backend or external analytics counter.

## Content and assets
No metrics, client names, legal services or corporate registration details have been invented.
Optimized WebP derivatives retain the full supplied artwork. Local originals: ../source/primeharbor-codex-handoff/assets/brand/.
