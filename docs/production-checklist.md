# InkFirst Production Checklist

Use this before deploying InkFirst to a real domain or before switching traffic from an ngrok test URL to production.

## 1. Required command

Run:

```bash
npm run check:prod
```

Then run:

```bash
npm run test:regression
```

Both should pass before release.

## 2. App URL

- [ ] `NEXT_PUBLIC_APP_URL` is the final public HTTPS URL.
- [ ] It is not `localhost`, `127.0.0.1`, or an expired `ngrok` URL.
- [ ] The same domain is used in Google OAuth and Creem settings.

## 3. Replicate

- [ ] `GENERATION_PROVIDER=replicate`.
- [ ] `REPLICATE_API_TOKEN` is set in production.
- [ ] `GENERATION_MODEL` is set or intentionally using the server default.
- [ ] `REPLICATE_LINEWORK_MODEL` is set or intentionally using the server default.
- [ ] Real Concept generation has been tested once on the production URL.
- [ ] Real Linework generation has been tested once on the production URL.

## 4. Supabase

- [ ] `NEXT_PUBLIC_SUPABASE_URL` points to the production Supabase project.
- [ ] `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` is set.
- [ ] `SUPABASE_SERVICE_ROLE_KEY` is set only server-side.
- [ ] `SUPABASE_STORAGE_BUCKET=inkfirst-designs` or the intended production bucket.
- [ ] Database migrations are applied.
- [ ] Storage bucket and policies are configured.

## 5. Creem

- [ ] `PAYMENT_PROVIDER=creem`.
- [ ] `CREEM_API_KEY` is set.
- [ ] `CREEM_CREATOR_PACK_PRODUCT_ID` is set.
- [ ] `CREEM_PRO_MONTHLY_PRODUCT_ID` is set.
- [ ] `CREEM_PRO_YEARLY_PRODUCT_ID` is set.
- [ ] `CREEM_WEBHOOK_SECRET` is set.
- [ ] Webhook URL points to `https://your-domain.com/api/webhooks/creem`.
- [ ] A real test payment unlocks high-resolution downloads.

## 6. Google OAuth

- [ ] `GOOGLE_CLIENT_ID` is set.
- [ ] `GOOGLE_CLIENT_SECRET` is set.
- [ ] Supabase Auth Google Provider is enabled.
- [ ] Google OAuth callback / Redirect URL points to `https://your-domain.com/api/auth/google/callback`.
- [ ] Sign in with Google returns to InkFirst and shows the Account menu.

## 7. Final release check

- [ ] Homepage loads with no console errors.
- [ ] My Designs loads with the signed-in account.
- [ ] Billing & Credits shows plan, credits, access, and payment history.
- [ ] Free users can download watermarked files only.
- [ ] Paid users can download high-resolution Concept, Linework, and Placement files.
