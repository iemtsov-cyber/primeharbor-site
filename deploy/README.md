# Production publication and recovery

Production is hosted by nginx at https://primeharbor.ru/, separately from the GitHub Pages preview. A commit alone does not prove production publication.

## Publish

Push a reviewed change to `main`. The **Prime Harbor production** workflow validates tracked static files, local references, the approved proposal, RU/EN contact details, the fullscreen hero and fallback poster. It creates a unique public release containing only `site.zip` and `manifest.json`.

Only the release job has `contents: write`. Checkout does not persist credentials. No hosting password, PAT, SSH key, or hosting secret is stored in GitHub. Repository-wide default token permissions remain read-only.

The fixed hosting controller polls public GitHub releases every five minutes. It checks the current main commit, an allowlist of static paths, byte limits and SHA-256 hashes. It refuses server-side drift and low disk space. It stages a full release outside the document root, atomically switches the document-root symlink, verifies every public file, and then marks the release healthy.

The workflow succeeds only after this marker reports its version as healthy:

https://primeharbor.ru/.well-known/primeharbor-release.json

The first migration retains the original document-root directory under the existing private backups folder. It has a brief directory-to-symlink transition; later switches use an atomic rename. The existing legacy `/www/` URL tree is preserved by reference to the original directory. Other hosted domains are never targets of the controller.

## Roll back from GitHub

In **Actions → Prime Harbor production → Run workflow**, keep branch `main` and enter a previously published production tag, such as `primeharbor-RUN-ATTEMPT`, in `rollback_release`. The workflow downloads that existing artifact, validates its hashes and current acceptance checks, and publishes it as a new version. Source scripts from the old release are never executed. The public marker records both the restored source commit and the publication commit. Update or revert `main` before the next normal content release if the restored content should remain the source of truth.

If public checks fail immediately after a server switch, the fixed controller automatically restores the previous directory pointer and retains the failed version without retrying it. Interrupted switches are recovered under the deployment lock. A failure before the switch leaves production untouched. Inspect the private `last-result.json`, `state.json` and transaction record if confirmation fails; do not treat release creation as a successful deployment.

## Retention and golden version

All production releases, failed versions, the original directory and the independent working backup are retained. There is no automatic deletion or pruning. Stop on low disk space and obtain explicit owner approval before any cleanup.

The initial working backup is **not** a golden version. The private `state.json` field `golden` starts as `null` and normal publication/rollback never changes it. Assigning or changing a golden version requires a separate explicit approval identifying the exact checked version. No automatic golden-promotion workflow exists.

Initial working backup: https://github.com/iemtsov-cyber/primeharbor-site/releases/tag/working-baseline-2026-10-17

ZIP SHA-256: `9ac36071eaba570347f6f3b30aac1db72f1ff8a97e3ff3e7b04a4941d20f4a79`

## Fixed controller maintenance

`deploy/controller.py` is an auditable source copy. Normal artifacts cannot update the private installed controller or configuration. An authorized maintainer must review, test and install controller changes through the existing hosting administration path. The hosting account itself also contains another domain; isolation is enforced by fixed paths and validation, not by a newly created OS account.

Run `python3 deploy/test_controller.py` on Linux to test successful switches, retention, rollback after injected HTTP failures, hash/path/symlink rejection, server drift, and interrupted initial migration. These tests use disposable temporary directories, never production. `controller.py --selftest` also tests a real symlink swap and restoration locally on the hosting server before its first deployment.
