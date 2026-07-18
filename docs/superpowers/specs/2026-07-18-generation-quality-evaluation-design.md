# Generation Quality Evaluation Design

## Goal

Build a repeatable quality benchmark for InkFirst concept generation. The benchmark must show whether four candidates contain at least one usable tattoo direction and make prompt or model regressions measurable.

## Scope

The first version covers four subject families:

- Animals and creatures
- Plants and botanical designs
- Lettering
- Geometric designs

Each benchmark case defines the idea, style, placement, size, complexity, and expected or forbidden content. The fixed set is versioned in the repository.

## Evaluation Model

Quality is split into objective automated checks and explicit manual review.

### Automated checks

Each candidate is inspected for:

- valid decodable image and minimum dimensions
- predominantly dark or black background
- visible foreground touching the canvas edge, indicating likely cropping
- insufficient whitespace around the tattoo subject
- duplicate or near-identical candidates within the same batch

A candidate is automatically usable when it decodes successfully and passes the dark-background and clipping checks. Duplicate status is reported separately because one usable duplicate is still technically usable, but low diversity.

### Manual checks

The report contains review fields for:

- unrequested decorative elements
- incomplete anatomy or missing body parts
- composition quality
- Concept and Linework subject consistency
- tattoo-reference usability

These checks are not guessed with simple pixel rules. A reviewer records pass, fail, or not-reviewed plus a note.

## Metrics

The report calculates:

- candidate automated pass rate
- batches with at least one automated-pass candidate
- dark-background rate
- clipping-risk rate
- duplicate-candidate rate
- manual review completion rate
- reviewed batches with at least one usable candidate

The primary KPI is the percentage of four-candidate batches with at least one usable result. Initial target: at least 90%.

## Inputs and Outputs

The evaluator reads a manifest containing benchmark case metadata and four image references per run. Image references may be local files or HTTP(S) URLs.

The CLI writes:

- a machine-readable JSON report
- a Markdown summary for product review

Reports are generated under `quality-reports/` and are ignored by Git. Secrets, API tokens, signed query strings, and full user data are never written.

## Live Generation

Live Replicate generation is opt-in because it spends provider balance. The default command evaluates an existing manifest. A separate `--generate` mode runs the fixed benchmark prompts through the existing generation provider and writes a manifest containing the resulting Storage or provider URLs.

## Failure Handling

- A failed image fetch becomes a failed candidate, not a crashed benchmark.
- A failed benchmark case is retained in the report with its error.
- Live generation stops with a clear configuration error when Replicate is not configured.
- Report output is atomic enough that a failed run does not overwrite a previous report.

## Testing

Tests use generated image fixtures rather than live Replicate calls. They cover black backgrounds, white backgrounds, edge clipping, candidate duplicates, four-candidate aggregation, fixed prompt coverage, and CLI report generation.

