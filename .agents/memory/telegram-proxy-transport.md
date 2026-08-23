---
name: Telegram proxy transport
description: Constraint and follow-on for using assigned HTTP/SOCKS5 proxies with GramJS.
---

Proxy assignment is a persistent, owner-scoped account setting, but it must not be described as changing Telegram network traffic until a dedicated HTTP/SOCKS5 socket adapter is in use.

**Why:** GramJS exposes direct proxy support for MTProxy only. HTTP and SOCKS5 require a custom network socket implementation so login, sync, and campaign sends cannot silently bypass the configured proxy.

**How to apply:** Treat the proxy CRUD and account association as configuration management. Before enabling a proxy for Telegram operations, implement and test the adapter with explicit connection failures and no direct-connection fallback.