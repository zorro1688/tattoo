# InkFirst Legal Pages Design

## Goal

Replace the broken footer legal links with public English pages for Privacy Policy, Terms of Service, and Refund Policy. InkFirst is operated by an individual, and support and deletion requests use `hello@inkfirst.ai`.

## Public pages

- `/privacy`: explains the account, anonymous identifier, prompt, generated-image, entitlement, and payment-history data InkFirst processes. It identifies Supabase, Vercel, Replicate, Google OAuth, and Creem as service providers as applicable, and provides email-based requests for access, correction, and deletion.
- `/terms`: defines InkFirst as an AI tattoo-idea and artist-communication tool. Generated output is creative reference material, not a tattooing, medical, safety, or professional-artistry guarantee. It covers acceptable use, user responsibility, account access, intellectual-property expectations, service availability, and the relationship to the refund policy.
- `/refunds`: states that credits, download access, and subscriptions are immediate digital services and are generally non-refundable after payment, except where mandatory law applies. Duplicate charges, technical payment errors, and non-delivery are reviewed through the support email.

## Page and footer behavior

- Create static Next App Router pages at `/privacy`, `/terms`, and `/refunds`, using the site's existing typography and responsive layout.
- Each page has a simple InkFirst header link home, a clear title, a `Last updated: August 8, 2026` label, readable sections, and the support email.
- Change the footer links from FAQ anchors to these routes, add the Refund Policy link, and replace the malformed `?` copyright character with `©`.

## Boundaries and safeguards

- Do not invent a company, registered address, operating country, guarantees, retention period, or self-service deletion mechanism.
- Do not promise legal compliance for an unspecified jurisdiction. The pages use plain international language and state that mandatory consumer rights remain unaffected.
- Keep payment-card details out of InkFirst: Creem processes checkout; InkFirst retains only payment status, plan, entitlement, and safe payment-history identifiers.

## Verification

- Automated tests verify each route, title, support contact, footer target, copyright symbol, and the prominent AI-reference/refund terms.
- Production build succeeds and the deployed pages load on desktop and mobile widths.
