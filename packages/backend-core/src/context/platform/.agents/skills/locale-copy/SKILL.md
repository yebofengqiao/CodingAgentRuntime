---
name: locale-copy
description: Update locale keys and copy files together when tasks mention locale, i18n, translation, or copy review.
triggers:
  - locale
  - i18n
  - translation
---

# locale-copy

Use this skill when UI text changes are tied to localization.

- Update source copy and locale bundles in the same patch.
- Prefer existing translation keys over introducing inline literals.
- If new keys are added, note the fallback locale and any missing translations.
