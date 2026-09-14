# Workspace usability review — September 14, 2026

Implemented in the existing React app and deployed to https://gmbfrontend.pages.dev on September 14, 2026. No additional Google posts were published during deployment verification.

## What made the app difficult to use

- The post composer appeared after business defaults and two image-generation panels.
- Eleven navigation items mixed daily tasks, automation, channels, and technical tools in a narrow sidebar.
- Labels such as CTA, Tick, Bulk access, and Run once required technical knowledge.
- Dashboard publishing actions did not show the post being sent.
- Single-post controls sat beside actions affecting multiple profiles.
- An optional branding overlay was marked as needing setup.
- Shared service presets included Calgary wording regardless of the selected business.

## Revised layout

```text
Google Business workspace
├── Workspace: Overview · Create a post · Posts & drafts · Photo planner · Results
├── Automation: Automatic posting · Included profiles
├── Channels: YouTube · Blog to Google
└── Tools: Integration details · Connection checks

Create a post
┌──────────────────────────────────────────────────────────┐
│ Selected business and city                               │
├─────────────────────────────┬────────────────────────────┤
│ 1. Write your update        │ 2. Choose a photo & button │
│ Service and post type       │ Gallery, upload, link      │
│ Draft with AI or write      │ Customer action            │
│ Publish now / schedule      │ 3. Review your post        │
│ Multiple-post tools ▸       │ Text + photo + button      │
├─────────────────────────────┴────────────────────────────┤
│ Business settings ▸                                      │
│ AI image studio ▸                                        │
└──────────────────────────────────────────────────────────┘
```

The composer columns stack at narrower widths. The layout uses calmer backgrounds, wider navigation, clearer spacing, visible keyboard focus, a skip link, an accessible business selector, and larger mobile controls. Gallery/upload handlers and all settings remain available. Existing tab IDs and saved navigation preferences are preserved.

The dashboard now opens the post editor or history rather than sending unseen content. Actual publishing, scheduling, Google requests, and saved business data are unchanged by the redesign.

## Targeted functional correction

The existing `autoScheduleWithAi` handler referred to an undefined `images` variable. It now uses its existing `queuedImages` collection when validating input and limiting scheduled slots. Stubbed checks cover no images, a single selected photo, and a batch limited by posting frequency.

Location-neutral presets affect newly added services only; saved services and posts were not rewritten.

## Verification

- `node scripts/check-workspace.cjs`: all 11 screens render; standard/event/offer composer states render; publishing and scheduling are disabled without a selected business; three scheduling scenarios pass with a stub API.
- `npm run build`: production build passes.
- `git diff --check`: passes.
- No live services are called by the workspace check script.

Browser access was unavailable in this session. Interactive browser behavior, actual responsive appearance, and screenshot comparison have not been verified. Render checks are not a substitute for that visual review. The tested build is deployed. Production JavaScript and CSS hashes match the local build. Twelve read-only backend checks and both OAuth route checks passed.
