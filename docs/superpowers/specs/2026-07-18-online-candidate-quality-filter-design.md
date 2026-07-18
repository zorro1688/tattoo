# Online Candidate Quality Filter Design

## Summary

InkFirst will add a server-side quality gate between Replicate concept generation and the response returned to the browser. Each generated candidate will first pass deterministic image checks and then an independent multimodal review. Rejected candidates remain available for internal quality reporting but are not exposed to users.

The gate will request one bounded refill batch when fewer than two candidates pass. The entire initial batch, review, and refill remain one user generation operation and consume at most one generation credit.

## Goals

- Prevent candidates with missing anatomy, unrelated decorative elements, severe cropping, invalid backgrounds, or poor tattoo readability from reaching the user.
- Rank acceptable candidates so the strongest result appears first.
- Return at least two acceptable candidates whenever possible.
- Keep reviewer failures from taking down the generation feature.
- Measure whether at least 85% of generation batches contain two usable candidates after one optional refill, using at least 100 production batches before treating the metric as representative.

## Non-Goals

- Guarantee medically or artistically perfect tattoo designs.
- Repeatedly regenerate until a target count is reached.
- Charge users for reviewer or refill calls.
- Delete rejected assets immediately or expose detailed internal reviewer output in the public UI.
- Replace the existing offline quality benchmark.

## Approaches Considered

### Deterministic checks only

This is fast and inexpensive, but pixel analysis cannot reliably identify missing legs, malformed anatomy, or unwanted leaves. It remains useful as the first stage but cannot satisfy the feature by itself.

### One contact-sheet review

Combining four candidates into one image reduces reviewer calls. However, small details become harder to inspect and the model can confuse candidate numbers. This creates unacceptable risk for anatomy and subject-fidelity decisions.

### Deterministic checks plus per-candidate multimodal review

This is the selected approach. Deterministic checks reject obvious technical failures. Remaining candidates are reviewed independently and in parallel, producing isolated decisions and stable candidate IDs. It costs more than a contact sheet but gives clearer failure reasons and ranking.

## Architecture

### `candidate-quality-core.mjs`

A provider-neutral module will:

- classify requested composition as `portrait`, `half_body`, or `full_body`;
- build the reviewer rubric;
- validate and normalize reviewer JSON;
- combine deterministic and visual scores;
- sort accepted candidates;
- aggregate batch metrics and failure reasons;
- decide whether one refill is needed.

The module will contain no network calls and will be covered with unit tests.

### `candidate-quality-provider.mjs`

A Replicate adapter will call a configurable multimodal model. The initial default will be `meta/llama-4-maverick-instruct`, configurable with `REPLICATE_QUALITY_MODEL`. Calls will use the existing `REPLICATE_API_TOKEN` and run independently in parallel for each candidate.

The adapter must tolerate provider output returned as a string, token array, nested output, or fenced JSON. Invalid output becomes `review_unavailable`, not an automatic rejection.

### Generation orchestration

The concept generation path will become a bounded orchestration operation:

1. Generate four candidates.
2. Normalize and persist candidate images using the existing Storage flow.
3. Run deterministic checks.
4. Review deterministic survivors with the vision provider.
5. Rank accepted candidates.
6. If fewer than two candidates pass, generate one refill batch and repeat steps 2-5 for the refill only.
7. Return up to four highest-ranked accepted candidates.
8. If the reviewer is unavailable, return deterministic survivors and record the degraded decision.
9. If no candidate survives either round, return a quality failure and do not consume a credit.

The refill limit is fixed at one. There is no unbounded retry loop.

## Composition Rules

Animal and creature prompts will default to portrait or half-body compositions because these produce more reliable anatomy for tattoo references. A full-body composition is allowed only when the normalized user request explicitly includes intent such as:

- `full body`
- `whole body`
- `entire body`
- equivalent explicit full-body wording supported by the prompt classifier

For portraits, the reviewer must not fail a candidate for hidden legs or tail. For full-body requests, expected visible anatomy includes the relevant legs, feet, tail, wings, horns, or claws for that subject. Occlusion is acceptable only when it is visually coherent and does not resemble malformed or missing anatomy.

## Reviewer Contract

Each candidate review will normalize to this internal structure:

```json
{
  "candidateId": "candidate-2",
  "accepted": false,
  "score": 42,
  "subjectMatch": true,
  "anatomyComplete": false,
  "unrequestedElements": ["leaves"],
  "cropped": false,
  "tattooUsable": false,
  "reasons": ["missing_hind_leg", "extra_botanical_elements"],
  "reviewStatus": "complete"
}
```

Allowed `reviewStatus` values are `complete`, `unavailable`, and `invalid_response`. Scores are clamped from 0 to 100. Unknown reason text is mapped to `other_quality_issue` so provider prose does not leak into application behavior.

The rubric will evaluate:

- requested subject fidelity;
- composition-appropriate anatomy completeness;
- unrelated flowers, leaves, moons, symbols, text, or duplicate subjects;
- subject cropping;
- clean isolated tattoo-reference presentation;
- readable contour and silhouette;
- practical tattoo-reference usability.

## Acceptance and Ranking

A candidate is accepted when:

- deterministic checks pass;
- the visual review is complete and marks it accepted with a score at or above the configured threshold; or
- the visual reviewer is unavailable and the deterministic checks pass under the agreed fail-open policy.

Complete visual review failures cannot be overridden by deterministic checks. Accepted candidates are ranked by visual score, deterministic cleanliness, and original candidate order as a stable tie-breaker.

Rejected candidates are omitted from the browser response. Their candidate ID, sanitized reason codes, score, provider prediction ID, and review status are retained in internal quality telemetry.

## Credit Semantics

- One browser generation request represents one billable operation.
- Initial generation, quality review, and one refill use at most one user credit in total.
- A successful response with at least one accepted candidate consumes one credit, preserving current product behavior when the target of two cannot be reached.
- A provider failure or zero accepted candidates after the refill consumes no credit.
- Quality reviewer calls never independently consume InkFirst credits.
- Existing provider costs still apply internally and will be measured separately.

## Failure Handling

### Reviewer unavailable

The system uses deterministic survivors, records `review_unavailable`, and returns a normal response. This prevents a reviewer outage from disabling generation.

### Some candidate reviews fail

Successfully reviewed candidates use their visual decisions. Candidates with unavailable reviews follow fail-open deterministic acceptance. Batch telemetry records the degraded count.

### Refill generation fails

The system returns accepted candidates from the first batch. If none exist, the operation fails without consuming a credit.

### Storage upload fails

That candidate is rejected with `storage_upload_failed`. Other candidates continue through the gate. A batch with no persistable candidate fails without consuming a credit.

### Timeout budget

Reviewer calls run in parallel with an explicit timeout. The refill is bounded to one call so the Vercel function cannot enter an uncontrolled retry sequence. Exact timeout values remain configuration defaults rather than user-facing controls.

## Persistence and API Shape

The existing public generation response will keep `conceptCandidates`, but it will contain accepted, ranked candidates only. Each public candidate may include a stable candidate ID and display rank; internal scores and rejection reasons remain server-side.

Quality telemetry will include:

- generation ID;
- owner ID in the existing privacy-safe format;
- generation and reviewer prediction IDs;
- requested category and composition;
- initial candidate count;
- accepted count before refill;
- whether refill was attempted;
- final accepted count;
- reviewer-unavailable count;
- normalized rejection reason counts;
- duration per phase;
- provider/model identifiers.

No API tokens, signed Storage query strings, complete payment data, or raw model reasoning will be logged.

## Metrics

The production report will calculate:

- initial two-usable-candidate rate;
- final two-usable-candidate rate after refill;
- zero-usable-candidate rate;
- refill rate;
- degraded reviewer rate;
- average accepted candidates per batch;
- rejection counts by normalized reason;
- generation, review, refill, and total latency;
- provider cost metadata where available.

The quality target is a final two-usable-candidate rate of at least 85% across a minimum of 100 representative batches. The target is measured, not assumed.

## Configuration and Rollout

New server-side configuration:

- `QUALITY_REVIEW_ENABLED`
- `REPLICATE_QUALITY_MODEL`
- `QUALITY_REVIEW_MIN_SCORE`
- `QUALITY_REVIEW_TIMEOUT_MS`
- `QUALITY_REFILL_ENABLED`

The feature will be introduced behind `QUALITY_REVIEW_ENABLED`. Local mock mode remains deterministic and does not require Replicate. Production can enable visual review first with refill disabled, inspect telemetry, then enable one refill after reviewer output is stable.

## Testing

### Unit tests

- classify portrait, half-body, and explicit full-body requests;
- parse valid, fenced, partial, malformed, and token-array reviewer output;
- reject missing anatomy only when required by composition;
- reject unrequested botanical elements;
- preserve deterministic survivors when review is unavailable;
- rank accepted candidates stably;
- request no more than one refill;
- prevent refill from consuming an additional credit;
- normalize telemetry without sensitive URLs or provider prose.

### Integration tests

- four candidates with two passes return those two in score order;
- one pass triggers one refill and returns combined accepted results;
- reviewer timeout degrades without failing generation;
- zero accepted results return a non-billable failure;
- Storage failure removes only the affected candidate;
- API responses never include rejected candidates or internal reviewer details.

### Regression checks

- existing generation, quota, Storage, My Designs, linework, placement, download, authentication, and billing tests remain green;
- `npm run test:quality`, `npm run test:regression`, and `npm run build` pass;
- a controlled live Replicate smoke test verifies the reviewer schema before production rollout.

