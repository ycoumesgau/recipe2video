# Recipe agent GitHub checkpoints

Recipe2Video synchronizes planning artifacts from the `recipe2video-agent-workspace` GitHub repository when Cursor Cloud does not expose full file contents in SDK `run.conversation()` for large JSON files.

## Prerequisites

- `CURSOR_AGENT_REPO_URL` points at the GitHub repo the cloud agent edits (e.g. `https://github.com/ycoumesgau/recipe2video-agent-workspace`).
- `RECIPE_AGENT_GITHUB_TOKEN` (or `GITHUB_TOKEN`) is a PAT with `Contents: Read` for that repository. Grant `Contents: Write` as well if you want the `/library` admin page to auto-commit regenerated `SKILL.md` files (otherwise the library mutation succeeds but the skill push is reported as `skipped`).
- The agent must push checkpoints to a deterministic branch per video (see `recipe-agent.instructions.ts`) and record the commit in `checkpoint-manifest.json`.

## Verification

Use Contents API with the commit SHA from the manifest:

`GET /repos/{owner}/{repo}/contents/{path}?ref={commitSha}`

The server-side fetcher is `fetchGithubRecipeWorkspaceFile` in `modules/recipe-agent/services/github-recipe-artifacts.service.ts`.

## Spike checklist

- [ ] Run the agent once; confirm commits appear on the recipe branch on GitHub.
- [ ] Confirm `checkpoint-manifest.json` exists under `agent-recipes/{videoId}/`.
- [ ] Call the Contents API with `ref` = manifest `commitSha` and verify JSON payloads match the repository.
