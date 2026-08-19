# lucidité — Site Direction

This file is the working design/architecture brief for Varun's personal web presence. It is intentionally human-facing and should be read by any AI/code assistant before making broad design or structural changes.

## 1. What this site is

This is a personal website / personal internet, not a portfolio, résumé site, commercial blog, or social-media replacement.

The site was migrated away from Cargo. The current structure deliberately uses small, independent static sites/repositories connected by subdomains:

- `blog.varunagarwal.com` — the hub / entrance
- `books.varunagarwal.com` — reading
- `wander.varunagarwal.com` — photographs, travel and visual field material
- `notes.varunagarwal.com` — gadgets, projects, writeups and miscellaneous interests
- `contact.varunagarwal.com` — contact

GitHub is currently the source/deployment substrate. Cloudflare handles the current web infrastructure/DNS layer. GoDaddy remains the domain registrar.

Do not introduce a framework, CMS, database, or other infrastructure merely because it is conventional. The current simplicity is a feature.

## 2. Authorship and AI role

The written material is Varun's. Claude/other AI tools may help with implementation, information architecture, labels, editing suggestions, code, image processing and design exploration.

Do not mistake AI-generated labels for settled editorial decisions. In particular, names such as `Field Notes`, `Notes`, `Filed`, `Awaiting`, etc. are implementation/design language that may evolve.

The site should feel human-authored even when AI has materially assisted its construction. Avoid generic AI-web aesthetics, excessive polish, filler copy, manufactured personality, or unnecessary interface elements.

## 3. Field Notes history

`Field Notes` was originally a name Claude gave to the first group of visual/location pages. It began with material such as the Shoreditch/London street-art walk and subsequently expanded outward as more of Varun's archive was added: Khajuraho, concerts, Udupi and other places/material.

The name is therefore provisional rather than a grand editorial thesis. The important idea is the archive itself: photographs, places, observations, concerts, travel and visual things Varun has encountered.

Current live material has included London street art, Khajuraho, concerts and Udupi, with future locations such as Glasgow and Isle of Skye already anticipated in the hub.

Do not force all future material into the original London-street-art conceptual frame. Let the archive grow naturally.

## 4. Current priority: solidity before expansion

The site is still very incomplete. Only a small fraction of the material Varun could eventually publish is currently online.

The immediate goal is NOT to build Stories, a CMS, a sophisticated media backend, or a large technical platform.

The priority is:

1. Establish a strong, coherent design language across the existing sections.
2. Make existing pages feel finished and intentional.
3. Add substantially more of Varun's existing content.
4. Improve navigation and cross-site continuity where useful.
5. Preserve the ability to evolve without architectural lock-in.
6. Add Stories later, once the existing system has enough solidity and content density.

## 5. Design principles

### A. One family, not one template

The separate sites should feel related through typography, spacing, navigation conventions, tone and craft, while each section is allowed to have its own visual character.

Do not flatten everything into an identical template.

### B. Editorial over dashboard

Prefer pages that feel like designed publications, notebooks, archives, galleries or small digital objects. Avoid SaaS/dashboard/card-grid conventions unless they genuinely suit the content.

### C. Content should dominate

The design should become quieter as the content becomes richer. Do not add visual effects simply because they are technically easy.

### D. Texture and imperfection are intentional, but restrained

Paper tones, serif/monospace combinations, subtle rules, archival/ticket/index-card references and small irregularities can work well. Avoid turning this into theatrical "vintage" styling everywhere.

### E. Mobile matters

Varun will frequently browse/edit/consume the site on a phone. Interactions should work naturally on touch screens. Desktop can provide additional spatial richness, but mobile should not feel like a reduced desktop layout.

### F. Accessibility and performance are part of design

Maintain sensible contrast, readable type, alt text, reduced-motion respect where appropriate, lightweight pages and sensible image sizing. Do not sacrifice these for visual gimmicks.

## 6. Media architecture

For now, keep the sites simple and static.

GitHub is appropriate for:
- HTML/CSS/JS
- written content
- small interface assets
- thumbnails/covers
- modestly sized media where appropriate

Do NOT build a large upload system yet.

As the archive grows, large original photographs and especially self-hosted video should move to object storage rather than becoming part of the Git repository. Cloudflare R2 is the leading candidate because the site already uses Cloudflare and the desired model is first-party/self-hosted media rather than YouTube/Vimeo embeds.

The eventual model should be:

`site/page/content -> media reference -> object storage/CDN`

rather than pages being tightly coupled to a particular storage provider.

Do not implement R2 merely for the sake of architecture. Implement it when media volume/requirements justify it, ideally first through one real Story/media prototype.

## 7. Stories

Stories are planned but deliberately deferred.

The concept is a permanent, first-party story format: sequences of Varun's own photographs, videos and short pieces of text. It should NOT depend on YouTube, Instagram, Vimeo or another platform. The point is to create a small personal publishing format that belongs to the site.

When the time comes, Stories should probably live naturally within the visual/travel side of the site rather than becoming a separate social network clone.

Do not let the future Stories system distort the current architecture prematurely.

## 8. Design review workflow

When proposing changes, distinguish between:

- **Editorial:** what Varun should say/show/name
- **Design:** typography, layout, colour, spacing, interaction
- **Architecture:** how content/media/code are stored and connected
- **Infrastructure:** hosting, storage, DNS, CDN, deployment

Prefer solving the smallest layer necessary.

Every decision (editorial, design, architecture, infrastructure) gets logged in `../DECISIONS.md` at the workspace root, tagged `[USER]` or `[AI]`. See `../CLAUDE.md` for the rule.

Before broad redesigns, inspect the existing pages and recent Git history. Preserve successful patterns unless there is a clear reason to change them.

When Varun asks for a design change, implement the requested change narrowly first rather than opportunistically redesigning unrelated parts.

## 9. Current visual direction

The hub currently uses Fraunces + Space Mono, warm paper tones, muted green/ink, gold and oxblood accents, restrained borders and a narrow editorial column. The Field Notes index uses a related but more archival/collage-like treatment with Fraunces + Courier Prime, paper, navy and brass, card-like "filed" material and subtle irregularity.

These are useful starting points, not immutable brand rules.

The objective is a coherent visual language that feels like Varun's site, not a rigid design system produced by a design agency.

## 10. A standing rule for AI assistants

Before changing the site, ask:

> Does this make Varun's actual archive more interesting, legible, personal and durable — or does it merely make the website look more "designed"?

Prefer the former.
