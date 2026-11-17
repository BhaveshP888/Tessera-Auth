# Tessera

A fast, private, end-to-end encrypted bookmark manager.

Tessera lets you save, organize, and search your bookmarks across all your devices. Everything is encrypted on your device before it syncs, meaning no one—not even the server hosting your data—can read your links, titles, or notes.

---

## Highlights

- **Private by Design**: Your data is encrypted locally using keys derived from your password. Plaintext links, tags, and passwords never leave your device.
- **Private Vault**: A PIN-protected section for sensitive bookmarks with automatic locking and wipe protection.
- **Instant Search**: Fast, typo-tolerant search that runs entirely on your device. No cloud indexing, no tracking, and no AI.
- **Multi-Device Sync**: Sign in on your phone, tablet, or laptop. Changes sync and merge automatically across devices.
- **Clean Links**: Automatically strips tracking parameters (`utm_*`, `fbclid`, etc.) when saving URLs.
- **Browser Extension**: Save links in one click or with a right-click in Chrome, Firefox, Brave, and Edge.
- **Import & Export**: Easily import existing bookmarks from Chrome, Firefox, Safari, Edge, or Arc via standard HTML export files.
- **Backup Support**: Optional encrypted backups directly to a private GitHub Gist.

---

## Project Structure

This repository is organized as a lightweight monorepo:

```text
├── apps/
│   ├── web/            # Web application (React, Vite)
│   └── extension/      # Browser extension for Chrome and Firefox (Manifest V3)
├── packages/
│   ├── core/           # Local storage engine, encryption, and search
│   ├── schemas/        # Data validation schemas
│   └── sdk/            # Extension API and sandbox
├── server/             # Sync relay server (Fastify, SQLite / Turso)
└── extensions/         # Built-in extensions (HTML import/export, Markdown export)
```

---

## Quick Start

### Prerequisites
- [Bun](https://bun.sh) (v1.2+)

### 1. Install Dependencies
```bash
bun install
```

### 2. Run the Development Servers
Starts both the web app and the local sync server:
```bash
bun run dev
```

- **Web App**: `http://localhost:3000`
- **Sync Server**: `http://localhost:8787`

### 3. Run Tests
```bash
bun test
```
Runs the full suite of 55 automated unit and integration tests across encryption, storage, sync, and search.

---

## Browser Extension

Tessera includes a browser extension for one-click saving and quick access to your library.

### Build
```bash
bun run build
```
This compiles the extension files into `apps/extension/dist/`.

### Install in Chrome, Brave, or Edge
1. Open `chrome://extensions` in your browser.
2. Turn on **Developer mode** (top-right corner).
3. Click **Load unpacked** and select the `apps/extension/dist` folder.

### Install in Firefox
1. Open `about:debugging#/runtime/this-firefox` in Firefox.
2. Click **Load Temporary Add-on...**.
3. Select `apps/extension/dist/manifest.json`.

---

## Deployment & Self-Hosting

### Deploy to Vercel
Tessera is ready for Vercel deployment out of the box with zero configuration required.

1. Push your repository to GitHub.
2. Import the project in Vercel.
3. Configure the following environment variables in your Vercel project settings:
   - `TURSO_DATABASE_URL`: Your Turso or cloud SQLite URL (`libsql://...` or `https://...`)
   - `TURSO_AUTH_TOKEN`: Your database authentication token
   - `JWT_SECRET`: A secure random string for session tokens
   - `RESEND_API_KEY`: Your Resend API key for email verification
   - `SMTP_FROM`: Sender address (e.g. `Tessera <onboarding@resend.dev>` or your custom domain)

### Self-Host with Docker
Tessera can also run as a single container serving both the API and the web app:

```bash
docker compose up -d
```
The app will be accessible at `http://localhost:8787`.

---

## Security Model

- **Device-Side Derivation**: Your master key and authentication token are derived locally on your device using standard password-based key derivation (PBKDF2) and Web Cryptography hardware acceleration.
- **Zero-Knowledge**: The server only receives an authentication hash to verify your account and encrypted data blobs to relay between your devices. It never holds your encryption keys.
- **SSRF & Privacy Hardening**: Link metadata previews are sanitized through a server-side proxy that strips tracking tags and blocks requests to private or internal network addresses.

---

## License

MIT © Tessera
