# InkFirst Regression Checklist

Use this checklist before a release, after payment/auth changes, or after touching generation and download code.

## 1. Local setup

- [ ] Supabase local project is running, or production Supabase env vars are configured.
- [ ] `NEXT_PUBLIC_APP_URL` matches the current public URL, such as the active `ngrok` URL.
- [ ] `GENERATION_PROVIDER=replicate` and `REPLICATE_API_TOKEN` are set when testing real image generation.
- [ ] Creem webhook URL points to the current public `/api/webhooks/creem` endpoint.
- [ ] Google OAuth callback URL matches `/api/auth/google/callback` on the current public URL.

## 2. Automated regression

Run:

```bash
npm run test:regression
```

Expected result:

- [ ] Auth, quota, generation, My Designs, design detail, download, billing, success page, and storage migration tests pass.
- [ ] Server and browser scripts pass syntax checks.
- [ ] TypeScript check passes.

## 3. Google login

- [ ] Open the current public URL.
- [ ] Click `Sign in`.
- [ ] Click `Continue with Google`.
- [ ] After login, the top-right button shows `Account`.
- [ ] Account menu shows the signed-in email.
- [ ] `My Designs` opens normally.
- [ ] `Billing` opens normally.

## 4. Concept generation

- [ ] Enter a tattoo idea in the homepage generator.
- [ ] Generate a Concept image.
- [ ] Hero right panel updates to the new generated Concept image.
- [ ] Quota decreases only after a successful generation.
- [ ] The saved design appears in `My Designs`.

## 5. Linework generation

- [ ] Open the saved design from `My Designs`.
- [ ] Click `Generate linework`.
- [ ] Linework generation uses 1 credit only when it succeeds.
- [ ] On failure, the page says the credit was not used.
- [ ] On success, the Linework image appears in the detail page and in My Designs state.

## 6. Placement preview

- [ ] Placement preview uses the current generated concept/linework, not an old default sample.
- [ ] Size and placement metadata match the design.
- [ ] Placement image does not overflow on desktop or mobile.

## 7. Download permissions

Before purchase:

- [ ] Detail page shows `Download watermarked` for Concept and Placement.
- [ ] Detail page shows `Upgrade` for high-resolution files.
- [ ] Watermarked download keeps the original image visible with a simple InkFirst watermark.

After purchase:

- [ ] Detail page shows `Download high-res`.
- [ ] Concept high-res download works.
- [ ] Linework high-res download works when linework exists.
- [ ] Placement high-res download works.

## 8. Creem payment

- [ ] Logged-out users are asked to sign in before upgrade checkout.
- [ ] Logged-in users can start Creator Pack checkout.
- [ ] Creem payment returns to `/success`.
- [ ] Success page shows high-resolution downloads unlocked after webhook confirmation.
- [ ] If webhook confirmation is delayed, the page explains what to do next.

## 9. Billing & Credits

- [ ] Billing page is centered and card-based, not left-aligned.
- [ ] Current plan is correct.
- [ ] Free credits, paid credits, and total credits are correct.
- [ ] Download access shows high-res unlocked after payment.
- [ ] Payment history shows paid time, plan, status, credits, provider, and event ID.

## 10. Final browser checks

- [ ] Homepage loads without console errors.
- [ ] My Designs loads without console errors.
- [ ] Design detail page loads without console errors.
- [ ] Billing page loads without console errors.
- [ ] Mobile viewport does not show horizontal overflow in Hero, Pricing, My Designs, Detail, or Billing.
