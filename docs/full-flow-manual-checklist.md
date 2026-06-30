# InkFirst Full Flow Manual Checklist

Use this checklist after auth, payment, generation, download, storage, or Billing changes. It is written for a real browser run, because Google login and Creem checkout cannot be fully verified by unit tests.

## Pre-flight

- [ ] Local server is running at `http://localhost:3000`.
- [ ] `NEXT_PUBLIC_APP_URL` matches the active public URL, usually the current ngrok HTTPS URL.
- [ ] Creem webhook URL points to `${NEXT_PUBLIC_APP_URL}/api/webhooks/creem`.
- [ ] Supabase Auth redirect URL includes `${NEXT_PUBLIC_APP_URL}/api/auth/google/callback`.
- [ ] Google OAuth origin includes `${NEXT_PUBLIC_APP_URL}`.
- [ ] `GENERATION_PROVIDER=replicate` and `REPLICATE_API_TOKEN` are set for real image generation.
- [ ] Run `npm run check:full-flow` before starting manual browser work.

## Google login

- [ ] Open `${NEXT_PUBLIC_APP_URL}` in a normal browser.
- [ ] Click `Sign in`.
- [ ] Click `Continue with Google`.
- [ ] Complete Google account selection.
- [ ] Confirm the top-right button changes to `Account`.
- [ ] Open the Account menu and confirm the email is visible.
- [ ] Open `My Designs` from the navigation or Account menu.
- [ ] Open `Billing` from the navigation or Account menu.

## Generate a concept

- [ ] Go back to the Generator.
- [ ] Enter a new idea that is easy to recognize, such as `small tiger head`.
- [ ] Select style, placement, size, and complexity.
- [ ] Click `Generate Tattoo Ideas`.
- [ ] Confirm the Hero Concept image updates to the new generated image.
- [ ] Confirm quota decreases only after success.
- [ ] Confirm no old sample image appears in Concept, Linework, or Placement.

## My Designs

- [ ] Open `My Designs`.
- [ ] Confirm the new design appears at the top.
- [ ] Confirm card text shows idea, style, placement, and size.
- [ ] If linework has not been generated, the card should not imply linework is ready.
- [ ] Click `View details`.

## Design detail

- [ ] Confirm Concept shows the generated concept.
- [ ] Confirm Linework shows `Linework has not been generated yet.` before linework exists.
- [ ] Confirm Placement uses the current design, not an old sample.
- [ ] Confirm metadata matches the generator selections.
- [ ] Confirm prompt is visible.

## Free download state

Before purchase or without high-resolution access:

- [ ] Concept button says `Download watermarked`.
- [ ] Placement button says `Download watermarked`.
- [ ] Linework button says `Generate linework` if no linework exists.
- [ ] Downloaded watermarked files keep the original image visible.
- [ ] `Upgrade` links appear where high-resolution files require payment.

## Generate linework

- [ ] Click `Generate linework`.
- [ ] Confirm status says it uses 1 generation credit.
- [ ] If generation fails, confirm the message says the credit was not used.
- [ ] If generation succeeds, confirm Linework image appears.
- [ ] After linework succeeds, the Linework button should become a download button according to access state.

## Creem checkout

- [ ] From Pricing or the detail page, start Creator Pack checkout while signed in.
- [ ] Complete Creem test payment.
- [ ] Confirm payment returns to `/success`, not an old ngrok URL.
- [ ] Confirm success page eventually says `High-resolution downloads unlocked`.
- [ ] If it says confirmation is delayed, wait and click `Check again`.

## Payment and download

- [ ] Return to the paid design detail page.
- [ ] Concept button says `Download high-res`.
- [ ] Placement button says `Download high-res`.
- [ ] Linework button says `Download high-res` only when linework exists.
- [ ] Concept high-resolution download works.
- [ ] Linework high-resolution download works after linework exists.
- [ ] Placement high-resolution download works.

## Billing verification

- [ ] Open `Billing`.
- [ ] Confirm signed-in email is shown.
- [ ] Confirm current plan matches the purchased plan.
- [ ] Confirm paid credits increased.
- [ ] Confirm high-resolution download access is unlocked.
- [ ] Confirm payment history shows date, plan, status, credits, provider, and event ID.
- [ ] Confirm no raw webhook payload or secret is shown.

## Expected final state

- [ ] Logged-in account owns the generated design.
- [ ] My Designs shows the design after refresh.
- [ ] Detail page downloads are permission-aware.
- [ ] Billing reflects the paid event.
- [ ] Supabase Storage contains the generated concept and linework assets when both exist.
- [ ] No page shows duplicate navigation items, stale sample art, or old ngrok links.
