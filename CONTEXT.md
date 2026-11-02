# Domain Model — Tessera (BookMarksman)

## Glossary

- **Bookmark**: A saved web reference consisting of a normalized URL, title, description, notes, tags, optional collection association, timestamps, vector clock causality metadata, and a privacy flag (`isVault`).
- **Private Vault**: An encrypted sub-space within the library protected by a 7-digit numeric PIN and optional multi-device Sync Passphrase. Vault records are encrypted with a dedicated Vault Master Key separate from the library Master Key.
- **Master Key**: A 256-bit cryptographic root key (Base64 encoded) held exclusively on the client, used to derive deterministic record keys for sealing regular library bookmarks and establishing zero-knowledge synchronization.
- **Sync Delta**: An encrypted mutation payload (`bookmark` create/update or `tombstone` deletion) containing a vector clock, Lamport timestamp, ciphertext, and nonce sent to or pulled from the relay server.
- **Tombstone**: A persistent deletion record representing an intentionally removed entity with a timestamp, preventing historical or out-of-order deltas from resurfacing deleted bookmarks.
- **Collection**: A named category hierarchy for organizing related bookmarks with custom color tokens and sorting order.
- **Tag**: A flat keyword label attached to bookmarks for multidimensional filtering and fast search indexing.
- **Relay Server**: A zero-knowledge synchronization relay that accepts encrypted deltas, assigns global monotonic sequence cursors, and persists the append-only changelog to disk without ability to decrypt payloads.
- **Extension**: A sandboxed add-on module declaring explicit permission capabilities (e.g. `bookmarks.read`, `tags.write`) executed through an isolated RPC dispatcher.
