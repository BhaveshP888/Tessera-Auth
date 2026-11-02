# Tessera — Privacy-First, Zero-Knowledge Bookmark Manager

A high-performance, local-first, end-to-end encrypted bookmark manager with a typed extension system, isolated private vault, and zero AI.

![Architecture Status](https://img.shields.io/badge/Architecture-Clean-0891b2?style=flat-square)
![Tests](https://img.shields.io/badge/Tests-47%20passed-16a34a?style=flat-square)
![Privacy](https://img.shields.io/badge/Zero--AI%20%26%20E2E%20Encrypted-rose?style=flat-square)
![Local First](https://img.shields.io/badge/Storage-Local--First-8b5cf6?style=flat-square)
![License](https://img.shields.io/badge/License-MIT-blue?style=flat-square)

---

## 🔑 Core Guarantees & Architecture

1. **Deterministic & Zero AI**: Search is powered by pure SQLite FTS5 prefix indexing and Sørensen–Dice character trigram fuzzy matching. No embeddings, no vector stores, and zero remote inference.
2. **Zero-Knowledge E2E Encryption**: 256-bit master keys are generated on-device. Per-record encryption keys are derived using `HKDF-SHA256` and encrypted with authenticated `XChaCha20-Poly1305`. The relay server never sees plaintext URLs, titles, notes, or tags.
3. **Isolated Private Vault**: Sensitive bookmarks are protected by a dedicated 7-digit numeric PIN, encrypted at rest in storage with a separate isolated Vault Master Key (`PBKDF2-SHA256` 100k rounds), featuring auto-lock timers, zero plaintext leakage in browser storage, and automatic local wipe protection after configured failed attempts.
4. **Multi-Device Conflict Resolution**: Field-level Last-Write-Wins (LWW) causality with vector clocks, state reconciliation, and persistent tombstones to prevent resurrection of deleted items.
5. **Universal Browser HTML Import & Export**: 1-click import and export supporting standard Netscape Bookmark HTML files from Chrome, Firefox, Apple Safari, Microsoft Edge, Brave, and Arc, automatically mapping folder hierarchies into Collections and extracting tags.
6. **Privacy-Hardened Metadata Proxy**: Strips URL tracking parameters (`utm_*`, `fbclid`, `gclid`, etc.) and defends against SSRF and DNS rebinding attacks (blocking loopbacks, private subnets, decimal/hexadecimal IP encodings, cloud metadata endpoints, and inspecting step-by-step redirect hops).
7. **Sandboxed & Capability-Gated Extensions**: Extensions communicate through typed RPC over `postMessage` with strict permission boundary enforcement (`bookmarks.read`, `bookmarks.write`, `tags.write`, etc.).
8. **Encrypted GitHub Gist Backups**: Zero-knowledge backup and restore directly to private GitHub Gists, encrypted client-side with the user's Master Key before network transmission.

---

## 🏛️ Monorepo Structure

```text
.
├── packages/
│   ├── schemas/        # Zod models for Bookmarks, Tags, Collections, Sync Deltas, Manifests
│   ├── core/           # Local core: Engine, XChaCha20-Poly1305 Crypto, Vault Session, Vector Clocks, FTS5/Trigram Search
│   └── sdk/            # Typed Extension SDK, capability gatekeeper & sandbox RPC dispatcher
├── apps/
│   ├── web/            # React 19 + Vite SPA with local-first persistence, Private Vault, & Master Key UI
│   └── extension/      # Manifest V3 browser extension (Firefox & Chrome popup, background service worker, context menus)
├── server/             # Fastify zero-knowledge relay, Passkeys (WebAuthn), Privacy Reader proxy, Extension Registry
├── extensions/
│   ├── html-import     # Standard Netscape HTML browser bookmarks importer & exporter
│   └── markdown-export # Reference extension for structured Markdown export
├── docker-compose.yml  # Docker Compose definition for single-container deployment
├── Dockerfile          # Multi-stage Alpine container packaging Fastify backend & compiled web SPA
├── turbo.json          # Turborepo pipeline configuration
└── package.json        # Bun workspaces root
```

---

## 🚀 Quick Start

### Prerequisites
- [Bun](https://bun.sh) (v1.2+)

### 1. Install Dependencies
```bash
bun install
```

### 2. Run Test Suite
```bash
bun test
```

### 3. Start Development Servers
Starts the Web App, Relay Server, and Extensions concurrently:
```bash
bun run dev
```

- **Web App**: `http://localhost:3000`
- **Sync Relay & Privacy Proxy**: `http://localhost:8787`

---

## 🧩 Browser Extension (Firefox & Chrome)

Tessera includes a Manifest V3 browser extension for quick-saving bookmarks, right-click context menu capture, and instant synchronization.

### Build the Extension
```bash
bun run build
```
The compiled extension artifacts will be generated in `apps/extension/dist/` (and packaged as `tessera.zip`).

### Installing in Mozilla Firefox
1. Open Firefox and navigate to `about:debugging#/runtime/this-firefox`.
2. Click **"Load Temporary Add-on..."**.
3. Select `apps/extension/dist/manifest.json` (or select `tessera.zip`).

### Installing in Google Chrome / Chromium / Brave / Edge
1. Open your browser and navigate to `chrome://extensions`.
2. Enable **"Developer mode"** in the top-right corner.
3. Click **"Load unpacked"** and select the `apps/extension/dist` directory.

---

## 🐳 Self-Hosting with Docker

Tessera ships with a multi-stage Alpine Docker image that serves both the Fastify Zero-Knowledge Relay API and the compiled React SPA web bundle on a single port.

### Run with Docker Compose (Recommended)
```bash
docker compose up -d
```
Access the application at `http://localhost:8787`.

### Run with Docker CLI
```bash
# Build the image
docker build -t tessera .

# Run container with persistent data volume
docker run -d \
  --name tessera-app \
  -p 8787:8787 \
  -v tessera-data:/app/data \
  --restart unless-stopped \
  tessera
```

---

## 🧪 Testing

Run all 47 unit and integration tests across crypto primitives, vault session memory safety, vector clock causality, search trigram indexing, server relay, SSRF defense, and extension capabilities:

```bash
bun test
```

---

## 📄 License

MIT © Tessera Contributors
