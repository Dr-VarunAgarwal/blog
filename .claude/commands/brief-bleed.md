---
description: Remove brief bleed (briefing text that leaked onto the page)
---

Do a "brief bleed" pass on this project.

Brief bleed = text I gave you as context, instructions or private background (a brief)
that ended up on the page as visitor-facing content.

Look for three kinds:
1. Narrating an instruction. I told you to do something (e.g. "use a fake brand name")
   and the page now says it was done ("from a made-up brand").
2. Exposing private status or context. Background that was only there to guide you
   shows up as a label or line (e.g. "Locked", "draft", "pending", "as discussed").
3. Explaining to nobody. Explainer text, captions or notes that exist only because
   the topic came up in our chat, with no real reader who needs them.

Look at everything a visitor or user can see, not just the main copy: page text, labels
and tags, captions, tooltips, alt text, page titles, meta and social descriptions,
placeholder or empty-state text, error and help text, README or about text, changelogs,
and any generated files (feeds, indexes, sitemaps) that repeat that text. Also check
code comments and HTML comments that someone could read via view-source, and tell me
about them separately.

Rules:
- Keep the RESULT of our decisions. Remove only the commentary ABOUT them. If I asked
  for mock brands, the mock brands stay; the sentence saying they're mock goes.
- Don't over-cut. Don't delete useful content, features, instructions or disclaimers just
  because they came up in conversation. If unsure, keep it and flag it.
- Jokes and personality I asked for are fine.
- Text I wrote myself is mine. Check the git history, and leave my copy alone.
- Don't rewrite wording for style. This is only a bleed pass.

Process:
1. First read the visible text of every page and file, and list what you find.
2. Fix the clear cases. For borderline ones, keep them and flag them.
3. Tell me what you removed or changed, what you kept on purpose, and any stale or
   wrong text you noticed but didn't touch. Then wait for my go-ahead on those.
4. Run the project's checks, then ship the way this project normally ships.
