# Generation Status and Retry Design

## Goal

Make Concept and Linework generation states predictable across the homepage,
My Designs, and the design detail page. Users must know whether InkFirst is
generating, saving, ready, or failed, while duplicate requests and premature
downloads are prevented.

This phase keeps the existing synchronous Replicate request model. It does not
add a background queue, prediction polling, or recovery of an in-flight request
after a browser refresh.

## User-Visible States

Concept and Linework use the same four UI states:

- `generating`: Replicate is creating the image.
- `saving`: the generated image and generation metadata are being persisted.
- `ready`: the durable Storage asset is available and the saved generation can
  be loaded again.
- `failed`: generation or persistence failed and the user may retry.

The UI may initially be idle before a Concept exists. Linework may also be
`not_generated` when a saved Concept exists but no Linework request has
completed.

## State Ownership

Transient states (`generating` and `saving`) are owned by the browser while the
current synchronous request is active. Durable state is derived from the saved
generation returned by the server:

- Concept is `ready` only when a saved Concept asset URL exists.
- Linework is `ready` only when a saved Linework asset URL exists.
- A saved failed status may restore the corresponding UI to `failed`.
- Asset presence takes precedence over stale status text.

Homepage, My Designs, and the detail page must use the same normalization rules
instead of interpreting fields independently.

## Interaction Rules

While Concept is `generating` or `saving`:

- Disable Generate/Regenerate, candidate selection, Concept download, and
  Linework generation.
- Show `Generating your tattoo...` during provider work.
- Show `Saving your designs...` while durable asset and record persistence is
  being finalized.

While Linework is `generating` or `saving`:

- Disable all Linework generation buttons on the active page.
- Keep Concept viewing available, but prevent changing the selected Concept.
- Show `Generating linework...` followed by `Saving linework...`.

When state becomes `ready`, download and navigation actions are enabled. When
state becomes `failed`, show the server error where useful and expose a single
`Try again` action. Repeated clicks while a request is active do nothing.

## Refresh Behavior

The current request is not recoverable after a refresh because this phase does
not persist a Replicate prediction ID. After reload:

- A saved Concept or Linework asset restores as `ready`.
- A saved Concept without Linework restores Linework as `not_generated`.
- An incomplete or failed operation restores as retryable, never as an endless
  loading state.

## Credits

Credits are charged only after successful generation and persistence according
to the existing server-side quota rules. Provider failure, Storage failure, or
record persistence failure must not leave the user charged for an unavailable
asset. The browser never decides whether a credit was consumed; it renders the
quota returned by the server.

## Implementation Boundaries

- Add one shared state-normalization module that can be used by homepage and
  detail-page scripts.
- Keep existing `/api/generate` and `/api/generate/linework` endpoints.
- Extend successful responses only where needed to return normalized saved
  generation data and an updated quota.
- Keep the static-server and Next.js routes behaviorally aligned.
- Do not add a database migration unless existing status fields cannot express
  a durable terminal state.

## Error Handling

- JSON/API errors produce a user-readable message rather than raw parsing text.
- A failed persistence step is treated as `failed`, not `ready`, even if the
  provider returned an image URL.
- Retry starts from a clean transient state and must not display an older asset
  as the result of the new attempt.
- Existing saved assets remain visible when a regeneration attempt fails, with
  the failure reported separately.

## Tests

Automated tests will cover:

- state normalization based on saved Concept and Linework assets;
- duplicate Concept and Linework requests being blocked;
- download and candidate-selection actions staying disabled during save;
- failed generation returning to a retryable state;
- saved Linework restoring as ready on the detail page;
- failure not reducing quota;
- parity between Next.js API handlers and the local static server where the
  affected behavior is shared.

The final verification runs focused status tests, the existing regression suite,
syntax checks, and the production build.

## Out of Scope

- Persistent background jobs.
- Replicate prediction polling after refresh.
- Automatic retry without user action.
- Push notifications or email completion alerts.
