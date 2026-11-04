# Interface languages

The interface supports the 22 validated BCP-47 codes in `src/lib/locales.ts`.
Urdu (`ur`) covers Pakistan; Bengali (`bn`) covers Bangladesh.

The selector stays in the existing sidebar footer and public authentication
header. It searches native names, country names, codes and language names
translated into the current interface language. Arabic and Urdu use readable
paragraph direction without reversing navigation, columns or action positions.

## Scope and privacy

Translate application-owned interface copy, hints, validation messages,
progress labels and known system notifications. Never translate identifiers,
API payloads, campaign names, customer messages, uploaded files, key material or
URLs. Admin-authored announcements retain their provided VI/EN content; they
are not sent to a translation service.

Catalogs are static, reviewed build inputs. Runtime selection does not call AI,
send customer content elsewhere, or require the VPS to install or build anything.
Only the selected language catalog is loaded. Persist a validated selection in
the account, retain a local choice when browser storage is available, and carry
an explicitly chosen anonymous language through sign-in. A load/save failure is
reported in the selected language; do not silently switch to English.

## Adding copy

Prefer `t("English source")` or `ti("English {{0}}", {0: value})`.
Existing bilingual presentation records are adapted at build time by the Babel
plugin; IDs, customer values, CSS, requests and numerical configuration remain
unchanged. Use `interfaceCopy` for an explicit bilingual presentation record.
Do not pass domain records or user-written text to it.

1. Run `node scripts/collect-interface-catalog.mjs`.
2. Add every new key to all committed JSON catalogs under
   `artifacts/telecampaign/src/lib/locale-catalogs`, retaining interpolation tokens.
3. Run the four `interface-*.test.mjs` suites and the collector's `--check`.
4. Run the normal full typecheck/build and disposable PostgreSQL integration
   suite before deployment.

Committed catalogs are the source of truth. `scripts/locale-drafts` is ignored,
optional authoring cache; never regenerate or send the whole catalog to a model
to add a few new strings. The assembler accepts small incremental overrides,
validates complete coverage and placeholder parity, then writes all catalogs.
CI rejects missing, stale and visibly untranslated interface sources.
