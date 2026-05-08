# Recipe2Video — Demo Runbook

### Purpose

This runbook is the operating guide for recording the Runway API Hackathon demo video. It is not meant to replace the product. It helps Yoann record a clear, concise, judge-friendly demo that shows Recipe2Video as a real internal production tool for Licorn.

The demo video will be recorded manually by Yoann, potentially edited in CapCut or another video editor. The app should provide the product screens, assets, clips, and reliable demo states needed for that recording.

---

## Demo Goal

Show that Recipe2Video is a real agentic production workflow for turning food recipes into short vertical cooking videos using Runway API orchestration.

The demo should communicate four points quickly:

* Recipe2Video solves a real Licorn marketing workflow.
* Runway API is central to the product, not a superficial add-on.
* The system coordinates expensive media generation through checkpoints, references, variants, cost tracking, and feedback loops.
* The product is usable beyond the hackathon as an internal production tool.

---

## Target Demo Length

Recommended length: 2 to 3 minutes.

Absolute maximum: 4 minutes.

If time is short, prioritize clarity over completeness.

---

## Narrative Arc

### Opening message

Suggested voiceover:

```txt
Recipe2Video is an internal Licorn production tool that turns recipes into short vertical cooking videos using Runway’s API. It is designed for a real marketing workflow: producing social videos with our mascot while controlling creative quality, API cost, and iteration speed.
```

### Core demo story

The demo should follow this flow:

1. Start from a recipe.
2. Generate a storyboard.
3. Compress the storyboard into Seedance segments.
4. Validate references.
5. Generate or review a Runway segment.
6. Give feedback to the agent.
7. Show a prompt diff.
8. Show cost tracking.
9. Show final assembly preview.
10. Close with business impact.

### Closing message

Suggested voiceover:

```txt
The result is not just a video generation script. It is a production cockpit for repeatable, cost-aware, agent-assisted media creation. For Licorn, this means moving from manual one-off experiments to a scalable weekly video workflow.
```

---

## Before Recording Checklist

Complete these before recording the final demo.

### App readiness

* App is deployed and accessible.
* Auth works or an authenticated session is already open.
* Dashboard loads quickly.
* No visible console errors on key pages.
* Demo Mode works.
* At least one project has complete or fixture data.

### Demo project readiness

Use Paris-Brest if available.

Required demo data:

* Recipe data is present.
* Logical storyboard is present.
* Seedance segments are present.
* References are present.
* At least one segment has a playable video.
* At least one segment has multiple variants or simulated variants.
* At least one prompt feedback and diff example exists.
* Cost logs exist.
* Assembly preview works or fixture final video exists.

### Media readiness

* At least one Mux playback works.
* Supabase Storage original file exists for the demo clip.
* Optional Suno audio file is uploaded.
* Optional final preview/export is available.

### Budget readiness

* Credit state is visible.
* Cost dashboard has data.
* No unexpected live generation will run during recording unless intended.

---

## Recommended Recording Sequence

### Scene 1 — Dashboard

Goal: show this is a production cockpit, not a toy.

Show:

* project library
* active generation queue
* cost cards
* project statuses

Voiceover:

```txt
This is the Recipe2Video dashboard. It lets us manage multiple recipe video projects in parallel, see active generations, monitor costs, and jump directly to the next required action.
```

Do not spend time on login unless auth is part of the story.

---

### Scene 2 — Create or open a recipe project

Goal: show the input flow.

Show either:

* creating a new project from a recipe source, or
* opening the Paris-Brest demo project.

Voiceover:

```txt
A project can start from a recipe URL, uploaded photos, pasted text, or a prepared demo fixture. The app stores the recipe, selected models, and production settings immediately so work is never lost.
```

If live recipe ingest is slow, use the prepared project.

---

### Scene 3 — Storyboard and Seedance segmentation

Goal: show the product’s intelligence.

Show:

* logical scenes view
* Seedance segments view
* mapping between logical scenes and generation segments

Voiceover:

```txt
The agent first creates a logical storyboard, then compresses it into fewer Seedance segments. This preserves the creative structure while reducing the number of expensive video generations.
```

Critical point to communicate:

* 30-48 logical scenes are not 30-48 generated videos.
* They become around 5-10 Seedance multi-shot segments.

---

### Scene 4 — References

Goal: show quality control before generation.

Show:

* global references
* recipe-specific references
* approved / missing states

Voiceover:

```txt
Before spending credits, Recipe2Video identifies the references Seedance needs: kitchen, character, utensils, and recipe-specific states like baked, filled, glazed, or cut versions.
```

If possible, show a complex Paris-Brest reference state.

---

### Scene 5 — Segment generation and playback

Goal: show Runway-generated media in the app.

Show:

* segment review screen
* MuxPlayer playback
* prompt panel
* references panel
* generation metadata

Voiceover:

```txt
Each segment is generated through the Runway API and then persisted. The original file is stored in Supabase Storage, and a playback copy is uploaded to Mux for fast review.
```

If live generation is not available, show fixture playback and state that this is the review workflow.

---

### Scene 6 — Feedback and prompt diff

Goal: show the agent loop.

Show:

* user feedback message
* agent response
* prompt diff
* apply and regenerate button

Example feedback:

```txt
The caramel should crack into brittle shards, not bend like a soft sheet. The rolling pin should be held vertically with both hands.
```

Voiceover:

```txt
When a generation is wrong, I do not manually rewrite the prompt. I explain the issue to the agent, review the proposed diff, and only then regenerate the segment.
```

This is one of the most important parts of the demo.

---

### Scene 7 — Cost dashboard

Goal: show operational control.

Show:

* Runway credits used
* cost by model
* cost by segment
* failed/rejected spend
* budget threshold indicators

Voiceover:

```txt
Because video generation is expensive, every Runway and OpenAI call is logged. Recipe2Video tracks costs by project, segment, model, and provider.
```

---

### Scene 8 — Suno and Remotion assembly

Goal: show final production path.

Show:

* Suno prompt
* uploaded audio if available
* Remotion preview
* selected segments in order

Voiceover:

```txt
Music is currently generated manually in Suno. Recipe2Video generates the prompt, accepts the uploaded audio, and uses Remotion to preview the final sequence with music alignment.
```

If Remotion export is not working, show preview only.

---

### Scene 9 — Final output or near-final preview

Goal: close with tangible output.

Show:

* final preview
* generated clip montage
* selected segment outputs
* if needed, a CapCut-assembled final video using generated assets

Voiceover:

```txt
The output can be downloaded and reused for Licorn’s social channels. The workflow is designed to support at least two videos per week, and batch generation during the hackathon weekend.
```

---

## Demo Fallback Plan

### If Magic Link is slow

Use an already authenticated browser session.

Do not spend demo time waiting for email.

### If Runway generation is slow

Use the fixture project with preloaded segment outputs.

Say:

```txt
For demo speed, I am showing a previously generated segment inside the same review workflow.
```

### If Seedance 2 API is unavailable

Show:

* model selector
* Seedance segment prompt preparation
* fixture video playback
* explain that the app supports manual model switching but does not silently fallback.

Do not pretend another model is Seedance.

### If Mux upload fails

Show Supabase-stored original file playback if implemented, or use fixture clips.

Explain:

```txt
The durable original file is stored separately from the playback layer, so the system can recover from playback-provider issues.
```

### If Remotion export fails

Show Remotion Player preview only.

Say:

```txt
The preview is the core workflow. Export can be performed client-side or through a render worker after the hackathon.
```

### If cost dashboard has no live costs

Use seeded cost logs.

Do not fake provider-specific exact billing. Call it estimated cost tracking if needed.

---

## Assets to Prepare Before Monday Morning

Minimum assets:

* one complete Paris-Brest project fixture
* one playable segment video
* one prompt diff example
* one cost dashboard with data
* one reference image screen
* one assembly preview

Nice-to-have assets:

* two or three generated segment variants
* one uploaded Suno audio file
* one final assembled MP4
* one screen recording of live generation status changing

---

## Suggested Demo Script

```txt
Recipe2Video is an internal production tool for Licorn, built for the Runway API Hackathon.

```

`Our marketing workflow needs short vertical cooking videos featuring our mascot, but generating them manually is slow and expensive. Every recipe needs planning, references, model-specific prompts, review, regeneration, music, and final assembly.`

`Recipe2Video turns that into an agentic workflow.`

`I start from a recipe. The agent analyzes it, asks only the questions that matter, and creates a storyboard. The important part is that the storyboard is not one generation per scene. It creates 30 to 48 logical scenes for creative structure, then compresses them into a smaller number of Seedance segments.`

`Before spending credits, the app identifies the required references: kitchen, character, utensils, and recipe-specific food states.`

`Then the generation runs through Runway. Outputs are persisted to Supabase Storage as originals, and uploaded to Mux for review playback.`

`If a segment is wrong, I give feedback in natural language. The agent rewrites the prompt, shows me the diff, and only then do I regenerate.`

`The app also tracks cost across Runway and OpenAI, so I know what each project and segment costs.`

`Finally, I can import music generated manually in Suno and preview the final assembly in Remotion.`

`The result is a real internal production cockpit for Licorn, not a one-off generation demo. It lets us move toward repeatable weekly video production using Runway’s API.`  

---

## What Not to Show

Avoid spending time on:

* raw database schema
* long code walkthroughs
* waiting for a live task to finish
* full login flow unless very fast
* every single GitHub issue
* irrelevant settings
* old first-frame / last-frame workflow
* Kling references
* Linear or internal Licorn roadmap

---

## Final Submission Checklist

Before submitting:

* Demo video recorded.
* Demo video under acceptable length.
* Public repo contains README and docs.
* No secrets committed.
* App link works.
* If app requires login, provide judge-safe instructions if needed.
* README explains why the product is useful and how it uses Runway.
* PRD and contracts are available in repo.
* Known limitations are honest and framed as roadmap, not failures.

---

## Judge-Facing Value Points

Emphasize:

* Real internal Licorn marketing use case.
* Agentic orchestration, not single API call.
* Seedance segment planning with references.
* Cost-aware generation.
* Human checkpointing before expensive steps.
* Prompt diff feedback loop.
* Durable storage and playback pipeline.
* Batch production potential.

---

## Demo Success Standard

The demo is successful if a judge can understand within 3 minutes:

* what problem Recipe2Video solves;
* why Runway API is central;
* how the agent workflow works;
* how the user controls quality and cost;
* why this can become a real production tool for Licorn.