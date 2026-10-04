# Prime Harbor
Bilingual static corporate website. English / Russian, mobile navigation, accessible form, supplied brand assets.

Preview: https://iemtsov-cyber.github.io/primeharbor-site/

## Local preview
Run `python -m http.server 8080` in this folder, then open http://localhost:8080.
No build or dependencies required.

## GitHub Pages
Publish the main branch, repository root, under Settings → Pages. Only this site directory belongs in the public repository. Original supplied assets and the handoff brief are retained locally outside the publishing folder.

## Before the main-domain launch
1. Confirm contact@primeharbor.ru is monitored. The form prepares an email draft; the visitor must send it.
2. Replace the featured-opportunity placeholder with an approved mandate.
3. Agree privacy wording and a backend before accepting form submissions directly.
4. Change canonical, og:url and og:image to the production domain.
5. Remove the preview-only noindex,nofollow meta tag.
6. Set the custom domain in GitHub Pages and update DNS; enable HTTPS. Do not add CNAME during preview.

## Content and assets
No metrics, client names, legal services or corporate registration details have been invented.
Optimized WebP derivatives retain the full supplied artwork. Local originals: ../source/primeharbor-codex-handoff/assets/brand/.
