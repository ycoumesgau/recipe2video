---
name: suno-music-generation
description: Produce Recipe2Video Suno Custom Mode artifacts (structured JSON + markdown) for full-length songs (2–3 minutes) with a short-form edit plan.
---

# Suno music generation (Recipe2Video)

## Outputs (required)

Write **both** files in the project workspace:

1. `suno-prompt.json` — validated by Recipe2Video (`SunoPromptV2Schema`). Use `schemaVersion: 1`.
2. `suno-prompt.md` — human-readable mirror with the same five Custom Mode fields as in `references/suno-music-prompt-template.md`.

## Rules

- **Length:** Target a **full song of about 2–3 minutes** for streaming (Spotify, etc.). The vertical cooking video uses a **trimmed excerpt (often 45–90 seconds)** — never treat the video runtime as the song length.
- **Separation:** Production/genre/mix instructions belong in `fields.styleOfMusic` and `fields.excludeStyles`. The `fields.autoLyricsPrompt` must focus on **lyrics and story only** (sections, mood, imagery). Do not embed recipe-tutorial steps, quantities, brands, or social handles in lyrics instructions.
- **Safety:** No imitation of protected artists or voices; no trademarked artist names as vocal targets.
- **Size:** Keep `fields.autoLyricsPrompt` under **3000 characters** when possible so operators can paste into Suno.
- **Quality:** Update `changelog.md` with a short checklist (genre fit, hook clarity, streaming length, short-version plan present).

## JSON shape

Use this structure (all `fields` strings are required; other keys optional):

```json
{
  "schemaVersion": 1,
  "status": {
    "recipeName": "string",
    "goal": "string",
    "model": "Custom Mode",
    "targetDuration": "2-3 minutes full song; 45-90s excerpt for vertical edit"
  },
  "fields": {
    "styleOfMusic": "…",
    "excludeStyles": "…",
    "title": "…",
    "autoLyricsPrompt": "…",
    "shortVersionPlan": "…"
  },
  "instructions": {
    "voice": "optional",
    "structure": "optional",
    "workflowNotes": "optional"
  },
  "qualityChecks": ["…"]
}
```

## Reference

Copy section order and tone from `references/suno-music-prompt-template.md`, replacing placeholders with recipe-specific content.
