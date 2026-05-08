# Recipe2Video — UX Contract

### Purpose

This document defines the user experience contract for Recipe2Video. It exists to prevent Cursor agents from inventing inconsistent screens, layouts, labels, or interaction patterns during the hackathon build.

Recipe2Video is not a video editor. It is an AI production cockpit for internal Licorn marketing videos.

---

## UX Principles

* Batch-first: the user can manage multiple video projects in parallel.
* Status-first: every background task has a visible status and next action.
* Checkpoint-first: the agent does the work, the human validates costly decisions.
* Diff-first: prompt changes must be reviewed before regeneration.
* Mobile-resilient: the user can progress from a phone with unstable connectivity.
* Component-first: use shadcn/ui and existing components; do not build a custom design system.
* Internal-tool clarity: optimize for speed, transparency, and reliability, not brand-heavy polish.

---

## Navigation

Primary navigation lives in a persistent shadcn sidebar.

Items:

* Dashboard
* New Video
* Active Generations
* Library
* Costs
* Settings
* Demo Mode

Header items:

* Project search
* Runway credits remaining
* Active task count
* User menu
* Settings shortcut

Mobile behavior:

* Sidebar collapses into a sheet.
* Header keeps only project title, active task badge, and menu trigger.
* Long multi-column screens collapse into tabs.

---

## Screen 1 — Login

Route: `/login`

Goal: restrict access to allowlisted internal Licorn users.

Layout:

* Centered card.
* App title: Recipe2Video.
* Subtitle: Internal Licorn access only.
* Email input.
* Primary button: Send magic link.
* Helper text: Only approved Licorn emails can access this application.

States:

* Empty: input ready.
* Loading: Sending magic link…
* Success: Check your email. The link expires shortly.
* Error: Unable to send magic link.
* Unauthorized: This email is not authorized to access Recipe2Video.

Rules:

* No public signup CTA.
* Do not expose implementation details to unauthorized users.
* Redirect authenticated allowlisted users to Dashboard.

Components:

* Card
* Input
* Button
* Alert
* Form

---

## Screen 2 — Dashboard

Route: `/`

Goal: show the full production state across all projects.

Top KPI cards:

* Active videos
* Segments generating
* Projects waiting for review
* Runway credits used
* Estimated credits remaining
* Videos completed

Main zones:

* Video project grid
* Active generation queue
* Recently updated projects
* Budget warning banner if needed

Project card content:

* Thumbnail from Mux if available.
* Project title.
* Recipe source indicator: URL, photos, pasted text, demo fixture.
* Status badge.
* Segment progress, such as 4 of 8 segments accepted.
* Active task count.
* Total cost so far.
* Last updated timestamp.
* Owner or last actor if multiple internal users exist.

Actions:

* Create video.
* Open project.
* Resume next action.
* Filter by status.
* Sort by updated date, cost, completion, or status.

Empty state:

* Title: No video projects yet.
* Copy: Create your first recipe video to start using Runway credits productively.
* CTA: Create video.
* Secondary CTA: Load demo project.

Components:

* Card
* Badge
* Progress
* DataTable
* Button
* DropdownMenu
* Mux thumbnail image
* Alert

---

## Screen 3 — New Video Wizard

Route: `/videos/new`

Goal: create a video project quickly from any recipe source.

Step 1: Recipe source

* URL input.
* Multi-photo upload.
* Paste recipe text area.
* Demo recipe selector.

Step 2: Production defaults

* Target duration: 45s, 60s, 90s.
* Style preset: ASMR food, playful mascot, dramatic texture, clean instructional.
* Video model dropdown, default `seedance2`.
* Image model dropdown, default `gpt_image_2`.
* TTS model dropdown, default `eleven_multilingual_v2`.
* SFX model dropdown, default `eleven_text_to_sound_v2`.

Step 3: Create

* Primary CTA: Create project and analyze recipe.
* Secondary CTA: Save draft.

Validation:

* Require at least one source: URL, photos, pasted text, or demo recipe.
* Warn if files are too large.
* Show selected model before creating.

Components:

* Form
* Input
* Textarea
* Upload dropzone
* Select
* Button
* Card
* Alert

---

## Screen 4 — Project Overview

Route: `/videos/[videoId]`

Goal: provide a project cockpit.

Tabs:

* Overview
* Storyboard
* References
* Segments
* Assembly
* Costs and Logs

Overview content:

* Project title and status.
* Recipe source.
* Selected models.
* Pipeline progress:
  * Recipe ingested
  * Storyboard approved
  * References ready
  * Segments generated
  * Assembly ready
  * Export completed
* Next required action.
* Active tasks for this project.
* Cost summary.

Primary next-action button examples:

* Answer clarification questions.
* Review storyboard.
* Approve references.
* Review Segment 3.
* Assemble final video.

Rules:

* The overview must always answer: what is happening, what is blocked, what should the user do next?

---

## Screen 5 — Storyboard

Route: `/videos/[videoId]/storyboard`

Goal: validate creative direction before spending video generation credits.

Two view modes:

* Logical scenes
* Seedance segments

Logical scenes view:

* 30-48 rows.
* Fields: position, type, arc, description, background, zoom, duration, note.
* Shows the editorial plan, not the generation plan.

Seedance segments view:

* 5-10 cards.
* Each card shows:
  * segment title
  * included logical scene IDs
  * duration
  * planned references
  * prompt preview
  * readiness status
  * estimated generation cost if available

Actions:

* Approve storyboard.
* Ask agent to revise.
* Generate TTS pitch.
* Edit segment instructions with agent.

Rules:

* No Seedance generation before storyboard approval.
* The distinction between logical scenes and generated segments must be visually explicit.
* The user must see that one Seedance segment contains multiple logical shots.

Components:

* Tabs
* DataTable
* Card
* Badge
* Button
* Dialog
* ScrollArea

---

## Screen 6 — References

Route: `/videos/[videoId]/references`

Goal: validate visual references before generation.

Sections:

* Global references
* Recipe-specific references
* Missing references
* Rejected references

Reference card content:

* Image preview.
* Reference name.
* Role in prompts.
* Source: existing asset, uploaded file, generated image, recipe photo.
* Used in segments.
* Storage status.
* Runway upload status.

Actions:

* Approve reference.
* Reject reference.
* Regenerate reference.
* Edit prompt.
* Upload manual reference.
* Re-upload to Runway.

Rules:

* Approved references must be persisted in Supabase Storage.
* Generated references must not rely only on temporary Runway URLs.
* No segment should exceed 9 references.

Components:

* Card
* Image preview
* Badge
* Button
* Dialog
* Alert
* Upload dropzone

---

## Screen 7 — Active Generations

Route: `/active-generations`

Goal: monitor all background work across projects.

Table columns:

* Project
* Segment or reference
* Operation
* Model
* Status
* Started at
* Progress if available
* Cost estimate
* Triggered by
* Actions

Actions:

* Open project.
* Retry failed task.
* Cancel pending or running task if supported.
* Pause all new generations.
* Resume queue.

Rules:

* This screen is essential for batch production.
* It must expose hidden failures.
* It must show tasks across all projects.

Components:

* DataTable
* Badge
* Progress
* Button
* DropdownMenu
* AlertDialog

---

## Screen 8 — Segment Review

Route: `/videos/[videoId]/segments/[segmentId]`

Goal: review, select, fix, and regenerate a Seedance segment.

Desktop layout:

* Left column: variants and playback.
* Middle column: prompt, references, and model settings.
* Right column: agent chat and prompt diff.

Mobile layout:

* Tabs:
  * Video
  * Prompt
  * Chat
  * Variants

Variant card:

* MuxPlayer.
* Generation status.
* Model.
* Cost.
* Duration.
* Created time.
* Actions: accept, reject, regenerate, change model.

Prompt panel:

* Current prompt.
* Prompt version history.
* Model selector.
* Reference list.
* Copy prompt button.

Chat panel:

* Contextual chat with the selected segment.
* User feedback input.
* Agent response.
* Diff proposal.

Rules:

* User should not manually rewrite prompts as the primary workflow.
* User gives feedback in natural language.
* Agent proposes the diff.
* User approves before regeneration.

---

## Screen 9 — Prompt Diff

Goal: make agent prompt edits explicit and auditable.

Content:

* Prompt before.
* Prompt after.
* Diff visualization.
* User feedback that triggered the diff.
* Buttons:
  * Apply and regenerate
  * Ask for another edit
  * Cancel

Rules:

* No regeneration from feedback without showing a diff.
* Store prompt_before, prompt_after, diff, user message, and applied status.
* If user rejects the diff, do not update the prompt.

Components:

* Diff viewer
* Card
* Button
* AlertDialog
* ScrollArea

---

## Screen 10 — Assembly

Route: `/videos/[videoId]/assembly`

Goal: preview and export the selected segment sequence with optional Suno music.

Sections:

* Selected segments timeline.
* Remotion preview.
* Suno music panel.
* Export panel.

Timeline:

* Segment cards in order.
* Drag-and-drop ordering.
* Selected variant shown per segment.
* Optional trim-lite controls.

Suno panel:

* Generated Suno prompt.
* Copy prompt button.
* Upload audio file.
* Audio start offset.
* End cut.
* Fade in.
* Fade out.

Export panel:

* Preview final composition.
* Render client-side.
* Save final export to Supabase Storage.
* Upload final export to Mux for playback.
* Download final MP4.

Rules:

* Remotion should use original files from Supabase Storage, not Mux playback streams, for final assembly.
* Mux is used after export for playback.

---

## Screen 11 — Costs and Logs

Route: `/videos/[videoId]/costs` and `/costs`

Goal: make API spending visible.

Project-level metrics:

* Total Runway credits used.
* Credits by model.
* Credits by segment.
* Failed or rejected generation spend.
* OpenAI token cost.
* Mux storage and delivery estimate.

Global metrics:

* Total Runway credits used.
* Credits remaining.
* Budget thresholds.
* Cost per accepted video.
* Cost per accepted segment.

Actions:

* Export CSV.
* Filter by provider.
* Filter by model.
* Open related generation.

Rules:

* Cost logs must be append-only.
* Cost display can be estimated when exact provider data is not available.
* Budget warnings must be visible on dashboard and cost pages.

---

## Error States

Required error states:

* Unauthorized user.
* Magic Link sending failed.
* Recipe extraction failed.
* Storyboard generation failed.
* Reference generation failed.
* Runway task failed.
* Runway output expired before persistence.
* Supabase Storage upload failed.
* Mux upload failed.
* Remotion preview failed.
* Suno audio upload failed.
* Budget threshold reached.

Every error state must show:

* what failed;
* whether credits were likely consumed;
* what the user can do next;
* retry or cancel action if relevant.

---

## Loading States

Required loading states:

* Sending magic link.
* Analyzing recipe.
* Generating storyboard.
* Generating reference image.
* Uploading to Runway.
* Waiting for Runway task.
* Downloading Runway output.
* Uploading to Supabase Storage.
* Uploading to Mux.
* Generating prompt diff.
* Rendering Remotion preview.

No loading state should be a generic spinner only. It must include a human-readable label.

---

## Demo Mode

Goal: protect the hackathon presentation.

Demo Mode should provide:

* a preloaded sample project;
* fixture storyboard;
* fixture references;
* fixture segment outputs if live generation is slow;
* cost dashboard sample data;
* feedback diff example;
* assembly preview path.

Rules:

* Demo Mode should not hide the real product flow.
* Demo Mode is a backup, not the primary workflow.

---

## Non-Negotiable UX Rules

* No generation starts without showing the selected model.
* No model fallback happens silently.
* No costly action is available to unauthorized users.
* No async task is invisible.
* No prompt feedback regeneration happens without a diff.
* Project switching must not stop background work.
* Logical scenes and Seedance segments must never be confused.
* Mux playback is for review; Supabase Storage is the durable source of original media.