# First Tattoo Ideas baseline

Recorded on 2026-09-20 before the first content upgrade.

## Search baseline

- Search Console reporting window: 2026-08-21 through 2026-09-17.
- Site total: 423 impressions and 0 clicks.
- `/guides/first-tattoo-ideas`: 223 impressions and an average position of 72.36.
- Page-specific clicks were not supplied separately from the site total.
- The production page and the local guide were confirmed to contain the same content before this change.

These values are a reference point, not evidence that later changes caused a ranking movement. Record the actual production publish date and Google's next confirmed crawl date before comparing results.

## First-stage scope

- Remove the current-page link from the related-guides navigation.
- Add contextual links to Small First Tattoo Ideas, First Tattoo Size, and First Tattoo Placement.
- Preserve the URL, canonical URL, title, H1, description, and existing generator behavior.

## Event names reserved for the next implementation stage

The following event names are defined but are not implemented by this first-stage change:

- `guide_prompt_copy`: a guide prompt is successfully copied.
- `guide_generator_entry`: a visitor follows a guide entry point to the generator.
- `generation_started`: a generation request is actually submitted.
- `generation_succeeded`: a generated result is successfully shown to the visitor.

For guide events, retain the guide slug, case identifier, entry position, and campaign attribution when available. Do not send full prompts, uploaded images, or unnecessary personal information to the analytics service.
