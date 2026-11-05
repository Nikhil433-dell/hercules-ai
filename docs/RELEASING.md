# Build and share Hercules for macOS

The DMG installs the **desktop app** and connects automatically to the hosted Hercules API at `https://hercules-ai-red.vercel.app`. Users need an internet connection, with no separate backend setup or personal API keys. The app does not bundle Python or provider credentials; those credentials stay on the backend. `desktop/runtime-config.json` sets the default service URL for both source launches and packaged builds.

## Build locally

Use macOS, Node.js 22, and Xcode Command Line Tools. In `desktop/`:

```sh
npm ci
npm run typecheck
npm run lint
npm test
npm run make -- --platform=darwin --arch=arm64 --targets=@electron-forge/maker-dmg,@electron-forge/maker-zip
```

Use `--arch=x64` for an Intel build. Build and test each architecture on matching hardware before sharing widely. Output appears under `desktop/out/make/`; DMGs are named `Hercules-<version>-<arch>.dmg`. The ZIP is an alternate packaging format; automatic updates are not configured.

Open the DMG and drag Hercules to Applications. Launching the desktop leaves the app available through its H menu-bar icon. The installed app uses the hosted service. Confirm that its feed and quotes work from a normal Finder launch, with no local backend running. Never include `.env`, API keys, or private data in an installer.

For a backend at another address, set `HERCULES_API_URL` in the app's launch environment. Finder launches do not automatically inherit variables from a terminal or read the backend `.env` file. The current UI has no backend-address setting; a normal Finder launch uses the hosted default. Developers can opt into a local backend with `npm run start:local` from `desktop/`, after configuring their own backend keys as described in the README.

## Verify a candidate

```sh
hdiutil verify desktop/out/make/Hercules-1.0.2-arm64.dmg
shasum -a 256 desktop/out/make/Hercules-1.0.2-arm64.dmg
codesign --verify --deep --strict --verbose=2 desktop/out/Hercules-darwin-arm64/Hercules.app
spctl --assess --type execute --verbose=2 desktop/out/Hercules-darwin-arm64/Hercules.app
```

Adjust the version and architecture to match the output. A valid DMG checksum confirms image integrity, not Apple developer identity. The build uses ad-hoc signing to re-seal the app after packaging changes its metadata and fuses. It has no Developer ID signing or notarization configured. An ad-hoc signature is not a Developer ID signature; Gatekeeper can reject downloaded unsigned or unnotarized apps. Share these candidates only with testers who understand that limitation. Do not advise users to disable Gatekeeper globally.

For a public release, configure an Apple Developer ID certificate, sign the application and nested code, submit it for notarization, and staple the accepted ticket before publishing. Keep certificate passwords and Apple credentials in protected CI secrets. This workflow intentionally does not invent or require signing credentials. Follow the official [Electron Forge signing and notarization guide](https://www.electronforge.io/guides/code-signing/code-signing-macos).

## GitHub build workflow

`.github/workflows/release.yml` builds Apple silicon and Intel installers on macOS runners. It runs the desktop checks, builds DMG and ZIP files, verifies application signature integrity and the images, and uploads the installers and SHA-256 checksums as workflow artifacts for 30 days.

Start it manually from Actions → **macOS release candidates**, or push a `v*` tag matching the version in `desktop/package.json` (for example, `v1.0.2`). Manual runs optionally create a draft release for the package version; tag runs create a draft after both architecture builds pass. Existing published releases are never modified. Draft asset updates replace same-named assets.

The workflow never publishes a release automatically. Review both installers, confirm the hosted API connection and signing status, then explicitly publish a tested release in GitHub if it is ready to share. Draft releases and private workflow artifacts are not public download links. A public download page should link only to deliberately published release assets.

The DMG maker is documented in the official [Electron Forge DMG guide](https://www.electronforge.io/config/makers/dmg).

For an explicitly labeled preview, run the workflow manually and set
`release_tag` to a `preview-*` tag, such as `preview-1.0.2`. This also lets
GitHub build and upload large installers directly when a local connection cannot
transfer release assets reliably. The workflow keeps the release a draft until
it is deliberately published.
