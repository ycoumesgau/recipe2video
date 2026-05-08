
# Recipe2Video — Runway API Hackathon

### TL;DR

Recipe2Video is an internal Licorn production tool that turns a food recipe into a repeatable, agent-assisted workflow for producing short vertical cooking videos featuring the Licorn mascot. It uses the Runway API with Seedance 2 as the default video generation model, GPT-Image 2 for recipe-specific reference images, GPT-5.5 High for planning and prompt iteration, Inngest for durable workflows, Supabase Auth/Postgres/Storage for access control, state and original media masters, Mux Pay-as-you-go Basic for playback and review, Remotion for assembly preview/export, and shadcn/ui for fast interface delivery.

The hackathon goal is to ship a real internal production workflow for Licorn, not a generic model wrapper or throwaway proof of concept. The first milestone focuses on the highest-value end-to-end path: recipe input, storyboard, Seedance segment planning, reference validation, Runway generation, durable storage, Mux playback, feedback-driven prompt diffs, cost tracking, and final assembly preview.

---

## Goals

### Business Goals

* Submit a working, publicly viewable Runway API Hackathon project before Monday, May 11, 2026 at 9:00 AM ET, which is 3:00 PM Paris time.
* Use the 50,000 Runway API credits productively during the hackathon weekend, with a stretch target of preparing or generating around 20 recipe video projects if the credits appear time-limited.
* Establish a repeatable internal Licorn workflow capable of producing at least 2 short marketing videos per week after the hackathon.
* Enable batch production so one Licorn team member can launch, monitor, and iterate on multiple recipe videos in parallel instead of completing each video sequentially.
* Reduce the manual production burden of a short recipe video from several fragmented hours across Runway, Recraft, Suno, and local editing tools to a checkpointed, agent-assisted workflow.
* Demonstrate deep use of Runway’s API by orchestrating recipe understanding, reference planning, Seedance generation, polling, persistence, cost tracking, review, prompt iteration, and assembly.

### User Goals

* Create a new recipe video from a phone, including while traveling, without manually managing every generation step.
* Upload recipe photos, multiple recipe pages, dish images, pasted recipe text, or a recipe URL, then let the agent structure the recipe into a video-ready plan.
* Review and approve a storyboard before spending expensive video generation credits.
* Generate Seedance 2 segments with the correct kitchen, mascot, utensil, and recipe-state references without manually selecting every asset in Runway.
* Switch between multiple video projects while generations continue in the background.
* Compare generated variants for the same segment, select the best output, and regenerate only what needs correction.
* Give natural-language feedback to the agent on a failed generation and review the prompt diff before spending more credits.
* Import a manually generated Suno music file and align it with the final assembly.
* Track Runway, OpenAI, Supabase Storage, and Mux-related costs by project, segment, model, and provider.

### Non-Goals

* Build a creator platform, marketplace, or public-facing user tool. Recipe2Video is an internal Licorn marketing production tool.
* Build functionality for Licorn end users or culinary creators. There are no creator-side user stories in the hackathon scope.
* Reuse the old first-frame / last-frame / Kling 2.5 Turbo Pro workflow as the main product flow. That historical workflow informed the current rules, but the hackathon product is Seedance-first.
* Build a full professional video editor comparable to CapCut, Premiere, or Runway’s editor. Recipe2Video only needs review, variant selection, lightweight ordering, optional trim-lite, music alignment, and final assembly preview/export.
* Build a custom Licorn design system. The UI must be assembled from shadcn/ui, dnd-kit, Mux Player, Remotion Player, and minimal supporting libraries.
* Automate Suno through an unofficial or unsupported API. The app generates Suno prompts and accepts manual audio uploads.
* Use Modal just because it sponsors the hackathon. Modal is not required by the official rules and is not needed for the current compute profile.

---

## User Stories

Persona: Licorn Marketing Operator

* As a Licorn marketing operator, I want to create a new video project from a recipe URL, uploaded photos, or pasted recipe text, so that I can start production quickly from any source.
* As a Licorn marketing operator, I want the agent to produce a storyboard with logical scenes and compressed Seedance segments, so that I can validate the creative direction before spending Runway credits.
* As a Licorn marketing operator, I want to see which visual states need reference images, so that complex dishes do not get misinterpreted by Seedance.
* As a Licorn marketing operator, I want to launch multiple video projects and switch between them, so that I can batch-produce content rather than waiting for one video to finish before starting another.
* As a Licorn marketing operator, I want to review generated variants for a segment, so that I can select the strongest take and discard weak generations.
* As a Licorn marketing operator, I want to give natural-language feedback on a generated segment, so that the agent can rewrite the prompt instead of forcing me to manually edit it.
* As a Licorn marketing operator, I want to see a prompt diff before regeneration, so that I understand what the agent changed and can prevent bad prompt edits from wasting credits.
* As a Licorn marketing operator, I want successful and corrected prompts to be stored, so that future generations improve from prior iteration history.
* As a Licorn marketing operator, I want to import a Suno audio file and align it in the final composition, so that the final output is closer to a publishable social video.
* As a Licorn marketing operator, I want to see cost per video, segment, model, and provider, so that I can manage the hackathon credit budget intelligently.

Persona: Internal Licorn Collaborator

* As an internal Licorn collaborator, I want to log in with an allowlisted email, so that I can access the app without exposing Runway credits publicly.
* As an internal Licorn collaborator, I want to see shared project status, so that two internal users can coordinate without overwriting each other’s work.
* As an internal Licorn collaborator, I want project ownership and activity to be visible, so that we understand who launched or approved each costly generation.

Persona: Runway Hackathon Judge

* As a Runway hackathon judge, I want to see a working end-to-end app, so that I can assess polish and practical product potential.
* As a Runway hackathon judge, I want to understand how Runway’s API is orchestrated beyond a single model call, so that I can assess technical depth.
* As a Runway hackathon judge, I want to see the system respond to user feedback and improve prompts, so that I can understand the agentic workflow and real-world usefulness.

---

## Functional Requirements

* Authentication and access control (Priority: P0)
  * Supabase Magic Link login: Provide an email-based login flow using Supabase Auth magic links.
  * Email allowlist: Restrict access to emails stored in an `allowed_users` table.
  * No public signup: Users who are not allowlisted must see a clear “not authorized” screen and must not access the dashboard.
  * Protected costly actions: All routes/actions that can trigger Runway, OpenAI, Mux, Remotion, or Inngest jobs must verify authentication and allowlist status server-side.
  * Internal collaboration: Support 1-2 simultaneous internal Licorn users without corrupting shared project state.
  * Created-by tracking: Store authenticated user IDs on videos, media assets, feedback entries, cost logs, and workflow triggers.

* Video project library (Priority: P0)
  * Project dashboard: Display all video projects with title, recipe source, status, thumbnail, progress, cost estimate, active task count, and last update.
  * Batch-first status view: Show all active projects and background generations on the dashboard, not only inside each project.
  * Project switching: Allow the user to switch between projects while Inngest workflows continue in the background.
  * Status taxonomy: Track project status as `draft`, `recipe_ingested`, `clarification_needed`, `storyboard_ready`, `storyboard_approved`, `references_ready`, `generating`, `review`, `assembling`, `exported`, or `failed`.
  * Demo-ready seed data: Provide a fixture-backed demo project, ideally based on Paris-Brest, to reduce live demo risk.

* Recipe ingestion (Priority: P0)
  * URL ingest: Accept a recipe URL and extract recipe title, ingredients, steps, timing, critical transformations, visual texture opportunities, and possible hooks.
  * Photo ingest: Accept multiple recipe photos, including dish photo, ingredient photo, step photos, and multiple photos for the same step.
  * Text ingest: Accept pasted recipe text as a fallback.
  * Clarifying questions: Ask only questions that materially change the video plan, such as desired tone, dish geometry, target duration, complex states, or missing references.
  * Recipe normalization: Store extracted recipe data as structured JSON in Supabase for repeatability and debugging.

* Storyboard and Seedance segmentation (Priority: P0)
  * Logical storyboard: Generate a 30-48 logical scene storyboard using useful creative rules from the existing `ycoumesgau/videos` repo.
  * Seedance segmentation: Compress logical scenes into approximately 5-10 Seedance generation segments, each containing multiple short shots with hard cuts and mandatory timing.
  * Logical-to-segment mapping: Store which logical scenes belong to each Seedance segment.
  * Micro-arc opening: Ensure the opening is a 2-3 scene texture-first micro-arc and that its payoff happens immediately.
  * Texture cadence: Ensure that every 3-5 logical scenes includes a texture payoff or strong material contrast.
  * Final hero shot: Preserve the rule that the final shot shows the finished dish in the Licorn kitchen context with the character visible and satisfied.
  * Validation checkpoint: Stop after storyboard and segment proposal. Do not spend video generation credits before explicit user approval.
  * TTS storyboard pitch: Optionally generate an audio pitch of the storyboard through Runway’s ElevenLabs TTS model.

* Reference asset management (Priority: P0)
  * Global references: Register and reuse canonical kitchen, mascot, expression, pose, and utensil references from the existing `videos` repo.
  * Seedance reference rules: Enforce a maximum of 9 references per Seedance segment and require a global kitchen reference, ideally equivalent to `@KitchenIslandDefault`.
  * Runway upload: Upload required references to Runway and store their `runway://` URIs.
  * Complex dish detection: Detect fragile visual structures such as repetitive crowns, choux pastry, caramel shards, glazing, fillings, cut states, layered assemblies, and unusual geometry.
  * Recipe-specific reference images: Generate additional images with GPT-Image 2 through Runway when Seedance needs explicit raw, baked, filled, cut, glazed, or final states.
  * Reference approval: Let the user approve, reject, regenerate, or manually upload references before video generation.

* Media asset persistence (Priority: P0)
  * Central media metadata: Use a `media_assets` table as the central metadata layer for source uploads, reference images, Runway outputs, accepted clips, Suno audio, and final exports.
  * Supabase Storage source of truth: Store original generated media, accepted segment masters, final exports, uploaded Suno audio, approved reference images, and recipe source uploads in Supabase Storage.
  * Mux playback layer: Upload playback copies from Supabase Storage to Mux Pay-as-you-go Basic for review, streaming, and thumbnails.
  * No Mux-only archive: Do not treat Mux as the durable archive. If Mux assets are lost, media must be recoverable by re-uploading from Supabase Storage.
  * Retention policy: During the hackathon, keep all generated files. Post-hackathon, retain accepted clips, final exports, approved references, source uploads, and Suno audio indefinitely; allow rejected variants and unused references to be deleted or archived after 7-30 days.

* Model selection and generation control (Priority: P0)
  * Default video model: Use `seedance2` as the default video model and assume it is available during the hackathon unless runtime tests prove otherwise.
  * Model selectors: Provide dropdown selectors for video, image, TTS, and SFX models at project level and per-regeneration level.
  * No silent fallback: If the selected model fails or is unavailable, do not automatically switch to another model. Show the failure and let the user retry, select another model, or pause.
  * Segment-level regeneration: Allow regeneration of a single Seedance segment with modified prompt, references, duration, or model.
  * Concurrency control: Use configurable Runway task concurrency. Start conservatively, then increase after validating actual API tier limits.
  * Cost estimate before launch: Show selected model, number of segments, estimated cost, and concurrency setting before launching generation.
  * Global pause: Provide a global pause for new generation tasks if budget, rate limit, or quality issues arise.

* Seedance generation workflow (Priority: P0)
  * References mode: Use Seedance in References mode as the primary video workflow.
  * Prompt format: Build concise English Seedance prompts with explicit reference roles, total duration, exact number of shots, mandatory timing, hard cuts, ASMR audio guidance, and short negatives.
  * Prompt QA checklist: Before generation, validate that references are no more than 9, a kitchen reference is present, prompt length is within limits, hard cuts are specified, timing is explicit, no speech or music is requested, and fragile food physics are handled.
  * Multi-shot segments: Generate fewer segments than logical scenes. Each generated segment should contain several tightly timed shots.
  * Audio policy: Video generation prompts should request integrated kitchen ASMR sounds only, with no speech, no voiceover, and no music unless explicitly changed.

* Review, feedback, and prompt diffs (Priority: P0)
  * Segment review: Display each generated segment with Mux playback, prompt, references, model, cost, status, and variants.
  * Variant comparison: Allow multiple generations per segment and mark one variant as selected.
  * Natural-language correction: Let the user provide feedback like “the caramel is not brittle” or “the rolling pin is held the wrong way”.
  * Agent prompt editing: The agent must translate feedback into prompt changes rather than requiring the user to edit prompts manually.
  * Prompt diff viewer: Show before/after prompt changes and require user approval before regeneration.
  * Iteration logging: Store feedback message, prompt_before, prompt_after, diff, applied status, generation ID, and user ID.
  * Positive learning signal: Treat accepted first-pass generations as examples of successful prompts.

* Agent learning and memory (Priority: P1)
  * Feedback capture: Store all correction conversations and prompt diffs from day one.
  * Embedding storage: Add embeddings to feedback entries for future retrieval.
  * RAG retrieval: Retrieve relevant prior feedback when generating prompts for similar culinary actions or materials.
  * Correction pattern extraction: Identify repeated corrections, such as brittle caramel handling, rolling pin orientation, choux topology, or glazing behavior.
  * Skill evolution proposal: Post-hackathon, propose updates to Seedance and food-video rules based on accumulated feedback, with human validation before changing repo rules.

* Cost tracking (Priority: P0)
  * Runway credit logs: Log every Runway operation with model, task ID, video ID, segment ID, estimated credits, and actual credits when available.
  * OpenAI cost logs: Log GPT-5.5 High token usage and estimated dollar cost.
  * Mux and storage metadata: Track media asset count, storage size, upload status, playback IDs, and estimated storage/delivery cost.
  * Per-video aggregation: Show cost by video, segment, model, and provider.
  * Budget alerts: Warn when Runway credits fall below configured thresholds, especially 20% and 10% remaining.
  * Budget hard stop: Allow the user to pause all new generations when budget thresholds are reached.

* Suno music workflow (Priority: P1)
  * Suno prompt generation: Generate a copy-ready Suno prompt using the existing `suno-music-generation` logic from the `videos` repo.
  * Manual Suno execution: Clearly guide the user to paste the prompt into Suno manually.
  * Audio upload: Let the user upload the generated Suno audio file back into the project and store it in Supabase Storage.
  * Music alignment: Use Remotion to align the music with selected video segments, including start offset, cut point, fade in, and fade out.
  * Export with music: Include the uploaded Suno track in final preview and export when available.

* Assembly and export (Priority: P1)
  * Remotion preview: Use `@remotion/player` to preview selected segments and optional Suno audio.
  * Original media input: Remotion must use original files from Supabase Storage, not Mux HLS playback streams.
  * Segment timeline: Use dnd-kit for lightweight segment ordering.
  * Trim-lite: Allow simple start/end selection for variants when feasible, but avoid building a full editor.
  * Client-side render: Use Remotion client-side rendering for hackathon export if performance is acceptable.
  * Vercel Sandbox backup: Keep Vercel Sandbox as an optional backup if client-side export is too slow or unreliable.
  * Final persistence: Store final MP4 in Supabase Storage, then upload a playback copy to Mux.

* GitHub-based execution workflow (Priority: P0)
  * GitHub Issues: Use GitHub Issues, not Linear, as the execution system for the hackathon repository.
  * Agent-ready issues: Each issue must include goal, scope, out-of-scope, contracts, acceptance criteria, test/demo instructions, dependencies, and critical-path marker.
  * Branch per agent: Each Cursor agent should work on a dedicated branch to reduce merge conflicts.
  * Dependency graph: Maintain a dependency graph and critical path in the GitHub Issues backlog.
  * UX contract: Create `docs/ux-contract.md` before UI implementation and require agents to follow it.
  * Technical contracts: Create shared types, status enums, service interfaces, and route conventions before launching parallel agents.

* Fixtures and demo mode (Priority: P0)
  * Paris-Brest fixture: Use the private `ycoumesgau/videos` repo as source material for a minimal public-safe Paris-Brest fixture.
  * Public-safe extraction: Copy only minimal fixture data. Do not copy obsolete first-frame / last-frame / Kling workflow, secrets, internal notes, or unnecessary large assets.
  * Demo mode: Provide a fixture-backed demo path so the presentation does not depend on live generation timing.
  * Demo runbook: Maintain `docs/demo-runbook.md` with recording sequence, fallback strategy, and judge-facing value points.

* Google Drive export (Priority: P2)
  * Drive connector: Connect a Google Drive master folder after the hackathon.
  * Recipe folder creation: Create a subfolder per recipe/video project.
  * Asset export: Save final video, selected segments, prompts, references, Suno prompt, media files, and cost summary.

## User Experience

**Entry Point & First-Time User Experience**

* The app is accessed through a deployed public URL, but usage is restricted to internal Licorn users through Supabase Magic Link authentication.
* First-time login screen:
  * Title: “Recipe2Video”
  * Subtitle: “Internal Licorn access only.”
  * Email input
  * Button: “Send magic link”
  * Helper text: “Only approved Licorn emails can access this application.”
* Login states:
  * Loading: “Sending magic link…”
  * Success: “Check your email. The link expires shortly.”
  * Error: “Unable to send magic link.”
  * Unauthorized: “This email is not authorized to access Recipe2Video.”
* After authentication, the user lands on the dashboard/library, not on a blank creation form.
* The first screen must communicate the product’s operating model clearly:
  * create or resume video projects;
  * monitor active generations;
  * review blocked checkpoints;
  * track remaining credits.
* No custom design system should be created. The app uses shadcn/ui dashboard blocks with sidebar, header, cards, badges, progress bars, tabs, data tables, dialogs, toasts, and forms.

**Core Experience**

* Step 1: Open dashboard and inspect production state
  * The dashboard shows KPI cards: active videos, active generations, Runway credits used, estimated credits remaining, videos completed, and projects requiring user action.
  * A video project grid shows project thumbnail, title, recipe source, status badge, segment progress, cost so far, and last update.
  * An active queue panel shows generation jobs across all projects, for example “Segment 4: polling Runway” or “Reference image: generating”.
  * The user can filter by status, sort by last updated, and jump directly to the next required action.

* Step 2: Create a new video project
  * The user clicks “Create video”.
  * The creation wizard accepts recipe URL, photo upload, pasted recipe text, or demo fixture.
  * Advanced options are collapsed by default but include target duration, video style, default video model, default image model, TTS model, and SFX model.
  * Defaults are preselected:
    * video: `seedance2`;
    * image: `gpt_image_2`;
    * TTS: `eleven_multilingual_v2`;
    * SFX: `eleven_text_to_sound_v2`.
  * The app creates a draft video record immediately to prevent lost work.

* Step 3: Agent ingests recipe and asks clarifying questions
  * The agent extracts structured recipe data and flags uncertainty.
  * The agent only asks questions that materially affect the output, such as:
    * “Should the opening focus on dessert texture or mascot action?”
    * “Does the final dish have a non-standard shape that must be preserved?”
    * “Should the target video be closer to 45, 60, or 90 seconds?”
  * The user answers in natural language.
  * The project status becomes `clarification_needed` until required answers are provided.

* Step 4: Review storyboard and Seedance segmentation
  * The storyboard screen has two views:
    * Logical scenes: 30-48 editorial scenes with scene type, arc, description, background, zoom, duration, and notes.
    * Seedance segments: approximately 5-10 generation units, each mapped to multiple logical scenes.
  * Each Seedance segment card shows title, included logical scenes, duration, planned references, prompt preview, readiness status, and estimated generation cost.
  * The user can approve, ask the agent to revise, or generate an optional TTS pitch.
  * The app must not start video generation before storyboard approval.

* Step 5: Review and approve references
  * The references screen shows global references and recipe-specific references separately.
  * Global references include kitchen, character, expressions, poses, and utensils imported or adapted from the existing `videos` repo.
  * Recipe-specific references include generated or uploaded states such as raw, baked, filled, final, cut, glazed, or broken.
  * Each reference card shows image, role, source, used-in segments, Supabase Storage status, Runway upload status, and actions.
  * The user can approve all references, regenerate one, edit the generation prompt, or upload a manual reference.

* Step 6: Launch Seedance generation
  * The user can launch all ready segments or only selected segments.
  * The launch action shows selected model, number of segments, estimated cost, and concurrency setting.
  * The generation view shows queued, running, succeeded, failed, and blocked jobs.
  * The user can leave the page or switch projects while Inngest continues the workflow.
  * No hidden background work is allowed; every job has a visible status and next action.

* Step 7: Persist and review generated media
  * After a Runway task succeeds, the system downloads the output and stores the original file in Supabase Storage.
  * The system creates or updates a `media_assets` record for the original file.
  * The system uploads a playback copy to Mux and stores the Mux playback ID.
  * The segment review screen displays Mux playback, prompt, references, model, cost, status, and variants.

* Step 8: Give feedback and approve prompt diffs
  * The user gives natural-language feedback, for example “the caramel should crack into brittle shards” or “the rolling pin should be held vertically with both hands”.
  * The agent proposes a prompt update.
  * The app displays a diff with removed and added lines.
  * The user can apply and regenerate, ask for another edit, or cancel.
  * Accepted diffs are stored as learning data.

* Step 9: Assemble final video
  * Accepted segments appear in a lightweight timeline.
  * The user can reorder selected segments using drag-and-drop.
  * If a Suno audio file exists, the user can set start offset, cut point, fade in, and fade out.
  * Remotion Player previews the assembled video with music.
  * Remotion uses original media files from Supabase Storage for final assembly.
  * Final exports are stored in Supabase Storage, then uploaded to Mux for playback.

* Step 10: Export and archive
  * The user can download individual accepted segments.
  * The user can download the assembled video.
  * All project data remains stored: recipe, storyboard, segments, prompts, references, media assets, variants, feedback, costs, Suno prompt, and final assembly settings.
  * Future P2: export the full project folder to Google Drive.

**Advanced Features & Edge Cases**

* Unauthorized access:
  * Non-allowlisted users must not access the dashboard or trigger any API calls.
* Model unavailable:
  * If `seedance2` fails or is unavailable, the app shows the error and lets the user manually select another model. It must not fallback automatically.
* Runway moderation or task failure:
  * Failed tasks remain visible with the failure reason, task ID, and retry options.
* Expiring Runway outputs:
  * Successful outputs must be downloaded and persisted to Supabase Storage before their temporary API URLs expire.
* Mux upload failure:
  * If Mux upload fails, the Supabase Storage original remains the source of truth and can be re-uploaded later.
* Mobile network interruption:
  * Project state, task state, and selected segment must survive refreshes and network loss.
* Multiple active projects:
  * The dashboard must make parallel background work visible and prevent tasks from becoming invisible.
* Two internal users:
  * Shared project state must remain consistent. If user-specific locking is not implemented, the app should at least show last updated timestamps and who triggered major actions.
* Missing Suno audio:
  * Assembly works without music but clearly marks the final preview as “no music uploaded”.
* Reference overflow:
  * If a segment exceeds 9 references, the app must warn and require the agent to reduce references before generation.

**UI/UX Highlights**

* Use a dashboard-first interface, not a linear wizard-only interface. The user must be able to manage many projects in parallel.
* Use shadcn/ui components and blocks as the default UI foundation.
* Use MuxPlayer for video playback cards and review screens.
* Use Remotion Player only for final assembly preview.
* Use dnd-kit for lightweight timeline ordering.
* Use a diff viewer for prompt changes. Prompt modifications must never be invisible.
* Use a persistent sidebar with these navigation items:
  * Dashboard
  * New Video
  * Active Generations
  * Library
  * Costs
  * Settings
  * Demo Mode
* Use a header with project search, Runway credits remaining, active task count, and user/settings controls.
* Use clear status badges and progress bars for all asynchronous work.
* Use toasts for transient updates, but never rely on toasts as the only status mechanism.
* The UX contract must be written in `docs/ux-contract.md` and followed by all Cursor agents.
* UX contract rules should include:
  * Every async action must produce visible status.
  * No generation may start without showing the selected model.
  * No model fallback may happen silently.
  * Segment review always shows video, prompt, references, variants, and chat.
  * Any prompt modification must show a diff before regeneration.
  * Project switching must never stop background generation.

---

## Narrative

Yoann is building Licorn, a culinary product that treats cooking as a shared lived experience rather than passive content consumption. To grow the brand, Licorn needs short, visually compelling social videos where its mascot cooks real recipes in a recognizable kitchen environment. The challenge is not ideation; recipes, assets, and AI models already exist. The bottleneck is orchestration: each video requires recipe understanding, creative sequencing, reference planning, Seedance prompts, expensive generations, feedback, variant selection, music, and final assembly.

Recipe2Video turns this fragmented process into an internal production cockpit. Yoann can upload a recipe from his phone, validate the agent’s storyboard, approve reference images, and launch multiple Seedance segments in parallel. While generations run, he can switch to another recipe project instead of waiting passively. When a segment fails, he does not rewrite prompts manually. He tells the agent what is wrong, reviews a diff, approves the fix, and regenerates only that segment. These corrections become memory for future projects.

By the end of the workflow, Recipe2Video has preserved the recipe, storyboard, references, generated variants, feedback history, media masters, costs, Suno prompt, and final Remotion assembly. The hackathon demo shows a real product, not a toy: an agentic media production system that helps Licorn produce two videos per week reliably and potentially batch-produce around 20 videos during the hackathon weekend.

---

## Success Metrics

### User-Centric Metrics

* Time to first storyboard: Under 5 minutes from recipe input to a reviewable storyboard.
* Time to first generated segment: Under 20 minutes from storyboard approval to first viewable Seedance segment, assuming model availability.
* Segment review efficiency: Average fewer than 2 regeneration iterations per accepted segment.
* Batch workflow usability: Ability to manage at least 5 active video projects without losing status or context.
* Mobile usability: Core actions work on mobile, including recipe upload, storyboard approval, segment review, feedback, prompt diff approval, and regeneration.
* Feedback usefulness: At least 80% of regeneration requests should be captured as structured feedback with prompt diffs.

### Business Metrics

* Hackathon submission: Working demo submitted before 9:00 AM ET on Monday, May 11, 2026.
* Hackathon production target: Around 20 recipe video projects generated or partially generated during the weekend if Runway credits appear time-limited.
* Post-hackathon production target: At least 2 publishable Licorn marketing videos per week.
* Cost visibility: 100% of Runway and OpenAI calls logged with estimated or actual cost.
* Useful output: At least 3 final or near-final videos strong enough for hackathon demo material or post-hackathon refinement.

### Technical Metrics

* Workflow durability: No active generation is lost after browser refresh, mobile network loss, or user navigation away from the page.
* Task tracking completeness: 100% of Runway task IDs are persisted and tracked to success, failure, cancellation, or timeout.
* Output persistence: 100% of successful Runway outputs are persisted to Supabase Storage before temporary API URLs expire.
* Playback availability: 100% of accepted clips should have either a working Mux playback ID or a visible fallback from Supabase Storage.
* Concurrency control: Runway generation concurrency is configurable and does not exceed actual account tier limits once known.
* Authentication enforcement: 100% of costly actions reject unauthorized or non-allowlisted users.
* UI responsiveness: Dashboard remains usable with 20 projects, 200+ segments, and hundreds of generated clips.

### Tracking Plan

* `auth_magic_link_requested`
* `auth_login_succeeded`
* `auth_access_denied`
* `video_created`
* `recipe_ingested`
* `clarifying_question_asked`
* `clarifying_question_answered`
* `storyboard_generated`
* `storyboard_approved`
* `tts_storyboard_pitch_generated`
* `reference_image_requested`
* `reference_image_generated`
* `reference_image_approved`
* `media_asset_created`
* `media_asset_stored_to_supabase`
* `media_asset_uploaded_to_mux`
* `seedance_segment_generation_started`
* `seedance_segment_generation_succeeded`
* `seedance_segment_generation_failed`
* `segment_variant_selected`
* `segment_feedback_submitted`
* `prompt_diff_generated`
* `prompt_diff_approved`
* `segment_regenerated`
* `suno_prompt_generated`
* `suno_audio_uploaded`
* `composition_previewed`
* `final_video_exported`
* `cost_logged`
* `budget_threshold_reached`
* `generation_queue_paused`

---

## Technical Considerations

### Technical Needs

Primary stack:

* Web app: Next.js App Router with TypeScript.
* UI system: shadcn/ui dashboard blocks and components.
* Drag-and-drop: dnd-kit.
* Agent chat: Vercel AI SDK or equivalent streaming chat primitives.
* Prompt diff: react-diff-viewer-continued or equivalent.
* Auth and database: Supabase Auth with Magic Link, Supabase Postgres, Supabase Storage, and pgvector.
* Workflow orchestration: Inngest.
* Video media architecture: Supabase Storage as durable media master storage; Mux Pay-as-you-go Basic for playback, thumbnails, review, and streaming.
* Video assembly: Remotion Player and client-side rendering for hackathon export, with Vercel Sandbox as backup.
* LLM: OpenAI GPT-5.5 High through direct OpenAI API.
* Runway API: Seedance 2, GPT-Image 2, ElevenLabs TTS/SFX, uploads, task polling.
* Work management: GitHub Issues and GitHub branches, not Linear.

Architecture approach:

* Use a feature-first modular architecture with lightweight application and infrastructure boundaries.
* Do not implement full DDD, full hexagonal architecture, or strict Clean Architecture. The project needs clear boundaries without excessive ceremony.
* Recommended top-level structure:

```txt
app/
  (auth)/
  (dashboard)/
  api/
components/
  ui/
  layout/
modules/
  auth/
  videos/
  recipe-ingest/
  storyboard/
  references/
  generation/
  media-assets/
  feedback/
  costs/
  assembly/
shared/
  config/
  errors/
  utils/
  constants/
  logger/
supabase/
  migrations/
inngest/
  functions/
remotion/
  compositions/
fixtures/
  paris-brest/
docs/

```

Key architecture rules:

* UI components must not call external APIs directly.
* External API integrations live in module service or infrastructure files.
* Repositories handle Supabase database access.
* Use cases orchestrate domain operations.
* Inngest functions call application-level use cases.
* Media persistence is centralized in the `media-assets` module.

Core Supabase data model:

```sql
allowed_users
  id uuid primary key default gen_random_uuid()
  email text unique not null
  role text not null default 'member'
  created_at timestamptz default now()

profiles
  id uuid primary key references auth.users(id)
  email text not null
  role text not null default 'member'
  created_at timestamptz default now()

videos
  id uuid primary key
  title text
  slug text unique
  recipe_url text
  recipe_data jsonb
  status text
  storyboard jsonb
  seedance_segments jsonb
  selected_video_model text
  selected_image_model text
  selected_tts_model text
  selected_sfx_model text
  total_cost_credits integer
  total_cost_openai numeric
  created_by uuid references profiles(id)
  created_at timestamptz
  updated_at timestamptz

logical_scenes
  id uuid primary key
  video_id uuid references videos(id)
  segment_id uuid references segments(id)
  position integer
  scene_type text
  arc text
  description text
  bg text
  zoom text
  duration_target numeric
  note text

segments
  id uuid primary key
  video_id uuid references videos(id)
  position integer
  arc text
  title text
  logical_scene_ids jsonb
  description text
  prompt text
  prompt_initial text
  references jsonb
  duration_target numeric
  status text
  selected_generation_id uuid nullable
  created_by uuid references profiles(id) nullable
  created_at timestamptz
  updated_at timestamptz

media_assets
  id uuid primary key
  video_id uuid references videos(id) nullable
  segment_id uuid references segments(id) nullable
  generation_id uuid references generations(id) nullable
  type text
  provider text
  storage_bucket text nullable
  storage_path text nullable
  mux_asset_id text nullable
  mux_playback_id text nullable
  runway_output_url text nullable
  original_filename text nullable
  mime_type text nullable
  file_size_bytes bigint nullable
  duration_seconds numeric nullable
  width integer nullable
  height integer nullable
  status text
  metadata jsonb
  created_by uuid references profiles(id) nullable
  created_at timestamptz
  updated_at timestamptz

reference_assets
  id uuid primary key
  video_id uuid references videos(id) nullable
  media_asset_id uuid references media_assets(id) nullable
  type text
  canonical_name text
  source text
  runway_uri text nullable
  prompt text nullable
  status text
  created_at timestamptz

generations
  id uuid primary key
  segment_id uuid references segments(id)
  media_asset_id uuid references media_assets(id) nullable
  model text
  model_params jsonb
  runway_task_id text
  status text
  cost_credits integer
  duration_seconds numeric
  triggered_by uuid references profiles(id) nullable
  created_at timestamptz
  completed_at timestamptz

scene_feedbacks
  id uuid primary key
  segment_id uuid references segments(id)
  generation_id uuid references generations(id)
  message text
  prompt_before text
  prompt_after text
  diff jsonb
  applied boolean
  embedding vector(1536) nullable
  created_by uuid references profiles(id) nullable
  created_at timestamptz

cost_logs
  id uuid primary key
  video_id uuid references videos(id)
  segment_id uuid references segments(id) nullable
  provider text
  model text
  operation text
  credits_used integer nullable
  cost_dollars numeric nullable
  tokens_input integer nullable
  tokens_output integer nullable
  metadata jsonb
  created_by uuid references profiles(id) nullable
  created_at timestamptz

compositions
  id uuid primary key
  video_id uuid references videos(id)
  export_media_asset_id uuid references media_assets(id) nullable
  segment_order jsonb
  audio_media_asset_id uuid references media_assets(id) nullable
  audio_sync jsonb
  remotion_props jsonb
  export_status text
  created_by uuid references profiles(id) nullable
  created_at timestamptz
  updated_at timestamptz

```

Important data model clarification:

* `logical_scenes` are the editorial 30-48 scene plan used for narrative quality, hook structure, texture cadence, and final shot logic.
* `segments` are the actual Seedance generation units, usually around 5-10 per final video.
* `generations` are individual generated variants for a segment.
* `media_assets` is the central media metadata table for source uploads, references, Runway outputs, accepted clips, Suno audio, and final exports.
* The historical repo’s first-frame / last-frame / Kling workflow must not become the production path, but its useful recipe understanding, food physics, asset reference, TikTok pacing, Suno, and Seedance rules should be ported.

### Integration Points

* Existing private GitHub repo `ycoumesgau/videos`:
  * Use as source material for production rules and prior learning.
  * Keep useful skills and constraints: recipe ingest, food-video constraints, asset reference system, food physics references, TikTok food direction, Suno music generation, and Seedance workflow.
  * Exclude legacy production flow tied to first-frame / last-frame and Kling 2.5 Turbo Pro.
  * Use Paris-Brest as fixture source material, but copy only public-safe minimal fixture data into the public hackathon repo.
* New public hackathon repo:
  * Host README, PRD, UX contract, technical contracts, GitHub Issues backlog, demo runbook, fixture data, branches, and implementation code.
  * Use GitHub Issues for task orchestration and public execution trace.
* Runway API:
  * Upload references and input media, generate Seedance video segments, GPT-Image 2 reference images, TTS, and SFX.
  * Treat Runway outputs as temporary API output URLs; download and persist to Supabase Storage quickly.
  * Authoritative documentation: https://docs.dev.runwayml.com/ (guides) and https://docs.dev.runwayml.com/api (API reference).
  * Models page: https://docs.dev.runwayml.com/guides/models/.
  * Pricing page: https://docs.dev.runwayml.com/guides/pricing/.
  * Use the official Node.js SDK `@runwayml/sdk`.
  * Required environment variable: `RUNWAYML_API_SECRET`.
  * Note on Seedance 2: announced by Runway as available via API but not yet listed on the public Models page at the time of writing. Verify availability at hackathon kickoff. If Seedance 2 is web-app only, fall back to `gen4.5` as the default video model.
* Runway agent skill (Cursor):
  * The official Runway API skills are hosted at https://github.com/runwayml/skills under `skills/`, in the same SKILL.md format used by Claude Code skills.
  * Recipe2Video stores a mirror of those skills at `.cursor/skills/` so Cursor Cloud Agents read them as in-repo context.
  * `use-runway-api` and `rw-api-reference` are the authoritative low-level references for endpoints, parameter names, request/response shapes, polling cadence, and error handling.
  * Setup is part of Phase 0 / Issue 01 of the GitHub Issues backlog. `.cursor/skills/` must be tracked in git.
* OpenAI API:
  * Use GPT-5.5 High for reasoning, planning, prompt editing, prompt diffs, and feedback interpretation.
  * Use embeddings for feedback RAG if implemented.
* Supabase:
  * Auth, allowlist, profiles, project data, workflow state, feedback logs, cost logs, pgvector memory, and durable media masters in Supabase Storage.
* Mux:
  * Use as playback, streaming, thumbnail, and review layer only.
  * Use Mux Pay-as-you-go with Basic on-demand video.
  * Avoid Plus/Premium quality, DRM, custom domains, live streaming, and systematic static MP4 renditions during the hackathon.
* Inngest:
  * Durable background orchestration for long-running media workflows, step-level retries, workflow state, and concurrency control.
* Suno:
  * Manual external music generation with prompt copy and audio upload back into Recipe2Video.
* Remotion:
  * Preview selected segments with optional music using original files from Supabase Storage.
  * Store final MP4 in Supabase Storage and upload a playback copy to Mux.

### Data Storage & Privacy

* Use a separate Supabase project from the main Licorn application to isolate the public hackathon repo and avoid mixing experimental production data with the main product.
* Use Supabase Auth Magic Link with `allowed_users` email allowlist.
* Do not allow public self-serve signups.
* Store API keys only in environment variables for Vercel, Inngest, and local development. Never commit API keys.
* Enforce server-side authorization checks before any costly action.
* Store recipe inputs, generated prompts, feedback logs, reference metadata, generation metadata, cost logs, and final assembly settings in Supabase Postgres.
* Store original media masters in Supabase Storage, including generated Runway outputs, accepted clips, final exports, approved references, source recipe uploads, and uploaded Suno audio.
* Treat Runway output URLs as temporary API output URLs that must be downloaded quickly and persisted; do not rely on Runway web UI visibility as application persistence.
* Use Mux for playback and review only; do not treat Mux as the primary storage or source of truth.
* Enable RLS if the app is deployed publicly. For the hackathon, a simple allowlist model is acceptable if server-side checks are implemented consistently.
* User feedback may contain operational know-how and should be stored as product learning data, but not exposed publicly unless deliberately included in a fixture or demo.

### Scalability & Performance

Expected hackathon scale:

* 1-2 internal users.
* Up to around 20 video projects over the weekend.
* 30-48 logical scenes per video.
* 5-10 Seedance segments per video.
* Multiple variants per segment where necessary.
* Hundreds of clips if aggressively using the 50,000 Runway credits.

Performance strategy:

* Use Inngest for all long-running workflows. Do not rely on long-running Vercel or Supabase serverless functions.
* Use configurable Runway concurrency. Start low, then increase after confirming actual tier limits.
* Show cost estimate and selected model before launching generation.
* Provide global pause/resume for new generation tasks.
* Persist every task and status transition so project state survives browser refreshes, mobile network loss, and user navigation.
* Use Mux thumbnails in the library and lazy-load actual players.
* Use Remotion Player only on the assembly screen.
* Avoid loading all clips at once in dashboard views.
* Use GitHub Issues and branch isolation to parallelize build work across Cursor agents without agents overwriting each other.

### Potential Challenges

* Seedance 2 API availability may not be fully documented. The product assumes it is available and exposes model selection if runtime behavior differs.
* Model fallback must not be silent. Lower-quality models can waste credits and damage output quality.
* Reference limits are strict. Seedance segments must fit within practical reference and prompt constraints.
* Prompt quality depends heavily on useful rules from the existing `videos` repo. Generic food prompts are not acceptable.
* UI complexity can balloon quickly. The UX must remain a cockpit, not a full editor.
* Supabase free-tier storage may be insufficient if many Seedance variants are generated. This should not change the architecture; upgrade Supabase or add R2/Drive later if needed.
* Mux free plan asset limits may be too low for batch production. Use Mux Pay-as-you-go Basic instead.
* Supabase Magic Link deliverability must be tested early to avoid auth delays during demo preparation.
* Two internal users create concurrency risks. At minimum, show who triggered actions and when.
* Demo preparation is a real deliverable. Reserve Monday morning Paris time for recording, editing, and submission.
* Seedance 2 API access has been announced by Runway but is not yet documented on the public Models page (https://docs.dev.runwayml.com/guides/models/). If access is not actually exposed via API at hackathon kickoff, the default video model must be switched to `gen4.5` and the storyboard segment compression should be re-tuned for that model's constraints.

---

## Milestones & Sequencing

### Project Estimate

Small but intense hackathon build: 10-15 focused human hours, supported by Cursor Max / Cursor 3 cloud agents and multiple parallel branches. The scope is feasible only if the project is decomposed into clear agent-ready issues and the UX/technical contracts are created before parallel implementation begins.

### Team Size & Composition

* Core human team: 1 person, Yoann, acting as product lead, engineering lead, QA, and demo lead.
* Optional internal users: 1 additional allowlisted Licorn collaborator for testing or review.
* Cursor agents:
  * Agent 1: repo scaffold, shadcn layout, and baseline docs.
  * Agent 2: Supabase schema, Auth Magic Link, allowlist, and media asset model.
  * Agent 3: Runway, OpenAI, model selectors, and prompt engine.
  * Agent 4: Inngest workflows, task polling, and concurrency control.
  * Agent 5: Supabase Storage and Mux playback integration.
  * Agent 6: project detail UI, storyboard, references, and segment review.
  * Agent 7: agent chat, prompt diffs, feedback logging, and learning memory.
  * Agent 8: fixtures, Suno prompt, Remotion preview, assembly, and demo support.

### Suggested Phases

**Phase 0 — Agentic build setup and contracts (1-2h)**

* Key Deliverables:
  * Create new public GitHub repo for the hackathon project.
  * Add `README.md`, `PRD.md`, `docs/ux-contract.md`, `docs/technical-contracts.md`, `docs/agent-workflow.md`, `docs/github-issues-backlog.md`, and `docs/demo-runbook.md` in English.
  * Copy the Runway API skills from `runwayml/skills/skills/` (https://github.com/runwayml/skills/tree/main/skills) into `.cursor/skills/`, keeping the upstream folder names and SKILL.md format unchanged. Track `.cursor/skills/` in git.
  * Define shared TypeScript types and status enums before launching parallel agents.
  * Create initial GitHub labels and issues with dependency fields.
  * Define branch naming convention.
* Dependencies:
  * GitHub repo created.
  * Cursor agents available.
  * Read access to https://github.com/runwayml/skills (public repo).

**Phase 1 — Scaffold, auth, and data foundation (3-4h)**

* Key Deliverables:
  * Next.js App Router project scaffolded.
  * shadcn/ui initialized with dashboard layout components.
  * Supabase project created.
  * Supabase Magic Link login implemented.
  * `allowed_users`, `profiles`, core domain tables, and `media_assets` implemented.
  * Protected dashboard routes implemented.
  * Video project library renders from Supabase.
* Dependencies:
  * Supabase URL and keys.
  * Magic Link email settings tested.

**Phase 2 — Agent planning and Seedance segmentation (4-5h)**

* Key Deliverables:
  * Port useful rules from `ycoumesgau/videos` into the new repo.
  * Implement recipe ingestion for URL/text/photo inputs.
  * Implement GPT-5.5 High storyboard generation.
  * Generate 30-48 logical scenes.
  * Compress logical scenes into 5-10 Seedance segments.
  * Implement storyboard approval checkpoint.
  * Implement model selectors and prompt QA checklist.
* Dependencies:
  * OpenAI API key.
  * Repo rules ported.

**Phase 3 — Runway, Inngest, and media persistence workflow (5-7h)**

* Key Deliverables:
  * Implement Runway client and upload handling.
  * Implement Seedance segment generation task creation.
  * Implement Inngest event flow and polling.
  * Store task states and generation outputs.
  * Persist successful Runway outputs to Supabase Storage.
  * Create `media_assets` rows for generated media.
  * Implement configurable concurrency, cost estimate before launch, and global pause.
  * Log costs for Runway and OpenAI.
* Dependencies:
  * Runway API key and hackathon credits active.
  * Runtime test of selected video model.

**Phase 4 — Mux playback and segment review UX (4-6h)**

* Key Deliverables:
  * Upload playback copies from Supabase Storage to Mux Pay-as-you-go Basic.
  * Store Mux asset and playback IDs on media assets.
  * Implement segment review page with variants, prompt, references, model, status, and cost.
  * Implement accept, reject, regenerate, and change model actions.
* Dependencies:
  * Supabase Storage persistence works.
  * Mux Pay-as-you-go account configured.
  * At least one generation output or fixture clip available.

**Phase 5 — Feedback chat, diffs, and learning memory (3-5h)**

* Key Deliverables:
  * Add segment-contextual agent chat.
  * Generate prompt edits from user feedback.
  * Show prompt diffs before regeneration.
  * Store feedback logs and prompt diffs.
  * Add embeddings for feedback if time allows.
* Dependencies:
  * Segment review UI implemented.
  * OpenAI API available.

**Phase 6 — Fixtures, Suno, and Remotion assembly (3-5h)**

* Key Deliverables:
  * Extract public-safe Paris-Brest fixture from the private `videos` repo.
  * Generate Suno prompt from storyboard.
  * Allow Suno audio upload and store uploaded audio in Supabase Storage.
  * Implement Remotion Player preview using original files from Supabase Storage.
  * Implement lightweight segment ordering with dnd-kit.
  * Add audio offset, cut, fade in, and fade out controls.
  * Attempt client-side export; after export, store final MP4 in Supabase Storage and upload playback copy to Mux.
* Dependencies:
  * Accepted segment variants or fixture clips available.
  * User manually generates Suno audio if music is included in demo.

**Phase 7 — Demo polish and submission (Monday morning, 3-6h)**

* Key Deliverables:
  * Produce at least one strong end-to-end demo project or fixture-backed walkthrough.
  * Record demo video for Runway submission.
  * Prepare short English description of the objective, technical depth, and product impact.
  * Submit before 9:00 AM ET / 3:00 PM Paris time.
* Dependencies:
  * Deployed app working.
  * Demo runbook ready.
  * At least one playable segment and one assembly preview available.

**GitHub Issue Template for Cursor Agents**

```md
## Goal
Describe the exact outcome this issue must deliver.

## Scope
List files, folders, components, services, or routes that are in scope.

## Out of Scope
List what the agent must not touch.

## Contracts
List required types, service interfaces, event names, route names, DB tables, and status enums.

## Dependencies
Depends on: #X, #Y
Unblocks: #Z
Critical path: yes/no

## Acceptance Criteria
- Clear, testable criterion 1
- Clear, testable criterion 2
- Clear, testable criterion 3

## Test / Demo
Explain how to verify the work locally or in a Vercel preview.

```

**Parallelization Rules**

* Do not launch all agents before Phase 0 contracts exist.
* Every agent must work on a dedicated branch.
* Every branch must stay within its issue scope.
* Any shared type change must be made deliberately and communicated in the issue or PR.
* UI agents must follow `docs/ux-contract.md`.
* Backend agents must follow `docs/technical-contracts.md`.
* One integration pass is required after each wave of parallel work.