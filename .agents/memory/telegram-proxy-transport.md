---
name: Telegram proxy transport
description: Constraint and follow-on for using assigned HTTP/SOCKS5 proxies with GramJS.
---

Proxy assignment is a persistent, owner-scoped account setting that must be enforced through the dedicated HTTP/SOCKS5 GramJS socket adapter for every Telegram connection.

**Why:** GramJS exposes direct proxy support for MTProxy only. HTTP and SOCKS5 require a custom network socket implementation; without it, login, sync, and campaign sends can silently bypass the configured proxy or stall on a broken handshake.

**How to apply:** Keep the adapter in every login, sync, saved-message, send, forward, reconnect, and data-center connection path. Resolve the proxy to a public IP before connecting, never fall back to direct traffic, and preserve an absolute handshake deadline independent of incoming bytes.