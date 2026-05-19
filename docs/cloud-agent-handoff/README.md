# Cloud Agent Handoff

The Cursor cloud agent that implemented the **Cover & Canvas** feature
does not have write permission on the separate
`ycoumesgau/recipe2video-agent-workspace` repository.

The PR-A diff for that repository was therefore exported as a patch
file in this folder and must be applied manually by the operator before
the Cover & Canvas tab can produce real publication artifacts (the app
side ships in the same Cursor agent run and is gated on the agent
producing `song-cover-plan.json`, but it gracefully shows an empty-state
CTA when the artifact is absent — see PR-C).

## Apply

```bash
git clone https://github.com/ycoumesgau/recipe2video-agent-workspace.git
cd recipe2video-agent-workspace
git checkout -b cursor/spotify-publication-assets-2c89
git am < ../recipe2video/docs/cloud-agent-handoff/agent-workspace-spotify-publication-assets.patch
git push -u origin cursor/spotify-publication-assets-2c89
# then open a PR titled "Add song-cover-plan contract for Spotify publication assets"
```

## What the patch contains

- `contracts/song-cover.md` — new contract for the `song-cover-plan.json` artifact.
- `.cursor/skills/spotify-publication-assets/SKILL.md` — new creative skill.
- `examples/paris-brest/song-cover-plan.json` — worked example.
- Pointers added to:
  - `.cursor/skills/seedance-workflow/SKILL.md`
  - `.cursor/skills/asset-reference-system/SKILL.md`
  - `.cursor/agents/recipe-researcher.md`
  - `AGENTS.md`
  - `README.md`
  - `contracts/artifact-schemas.md`
  - `examples/paris-brest/README.md`

Every JSON file in the workspace was validated with `python3 -c
"import json; json.load(open(f))"` before the commit.
