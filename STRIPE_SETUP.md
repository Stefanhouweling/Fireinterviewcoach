# Stripe Setup Guide

This guide will help you set up Stripe payment processing for credit purchases.

## Step 1: Create a Stripe Account

1. Go to [https://stripe.com](https://stripe.com) and create an account
2. Complete the account setup (business details, bank account, etc.)

## Step 2: Get Your API Keys

1. Log into your Stripe Dashboard
2. Go to **Developers** → **API keys**
3. You'll see two keys:
   - **Publishable key** (starts with `pk_test_` or `pk_live_`)
   - **Secret key** (starts with `sk_test_` or `sk_live_`)

**For testing, use the TEST keys** (they have `_test_` in them)

## Step 3: Set Up Webhook Endpoint

1. In Stripe Dashboard, go to **Developers** → **Webhooks**
2. Click **Add endpoint**
3. Set the endpoint URL to:
   ```
   https://fire-interview-coach-api.onrender.com/api/credits/webhook
   ```
   (Replace with your actual backend URL if different)
4. Select events to listen to:
   - `checkout.session.completed`
5. Click **Add endpoint**
6. **Copy the webhook signing secret** (starts with `whsec_`) - you'll need this!

## Step 4: Add Environment Variables to Render

In your Render dashboard for the backend service:

1. Go to **Environment** tab
2. Add these variables:

### Required Variables:

```
STRIPE_SECRET_KEY=sk_test_your_secret_key_here
```

Replace `sk_test_your_secret_key_here` with your actual Stripe secret key from Step 2.

```
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret_here
```

Replace `whsec_your_webhook_secret_here` with the webhook signing secret from Step 3.

```
FRONTEND_URL=https://fire-interview-coach.onrender.com
```

Replace with your actual frontend URL (where users will be redirected after payment).

### Example Format:

```
STRIPE_SECRET_KEY=sk_test_your_actual_secret_key_here
STRIPE_WEBHOOK_SECRET=whsec_your_actual_webhook_secret_here
FRONTEND_URL=https://fire-interview-coach.onrender.com
```

**Note**: Replace the placeholder values with your actual keys from Stripe Dashboard.

## Step 5: Restart Your Render Service

After adding the environment variables:
1. Go to your Render service dashboard
2. Click **Manual Deploy** → **Deploy latest commit** (or just wait for auto-deploy)
3. The service will restart and pick up the new environment variables

## Step 6: Test the Integration

1. **Test Mode**: Make sure you're using `sk_test_` keys (not `sk_live_`)
2. Try purchasing credits from your app
3. Use Stripe's test card numbers:
   - **Card**: `4242 4242 4242 4242`
   - **Expiry**: Any future date (e.g., `12/34`)
   - **CVC**: Any 3 digits (e.g., `123`)
   - **ZIP**: Any 5 digits (e.g., `12345`)
4. Check your Stripe Dashboard → **Payments** to see the test payment
5. Check your app - credits should be added automatically via webhook

## Step 7: Go Live (Production)

When you're ready for real payments:

1. **Switch to Live Keys**:
   - In Stripe Dashboard, toggle from **Test mode** to **Live mode**
   - Copy your **Live** secret key (starts with `sk_live_`)
   - Update `STRIPE_SECRET_KEY` in Render with the live key

2. **Set Up Production Webhook**:
   - Create a new webhook endpoint in **Live mode**
   - Use the same URL: `https://fire-interview-coach-api.onrender.com/api/credits/webhook`
   - Copy the new webhook signing secret
   - Update `STRIPE_WEBHOOK_SECRET` in Render

3. **Update Frontend URL**:
   - Make sure `FRONTEND_URL` points to your production frontend URL

## Troubleshooting

### "Stripe not configured" error
- Check that `STRIPE_SECRET_KEY` is set in Render
- Make sure you restarted the service after adding the variable
- Check the logs for any errors

### Webhook not working
- Verify the webhook URL is correct in Stripe Dashboard
- Check that `STRIPE_WEBHOOK_SECRET` matches the one in Stripe
- Look at Render logs for webhook errors
- In Stripe Dashboard → Webhooks, you can see webhook delivery attempts and errors

### Credits not being added after payment
- Check the webhook logs in Stripe Dashboard
- Check your backend logs for webhook processing errors
- Verify the webhook secret is correct

### Payment succeeds but credits don't appear
- The webhook might be failing
- Check Stripe Dashboard → Webhooks → [Your endpoint] → Recent events
- Look for failed delivery attempts
- Check backend logs for webhook processing errors

## Security Notes

- **Never commit** your Stripe keys to git
- **Never share** your secret keys publicly
- Use **test keys** during development
- Only switch to **live keys** when ready for production
- The webhook secret is critical for security - keep it secret!

## Support

If you encounter issues:
1. Check the Render service logs
2. Check Stripe Dashboard → Webhooks for delivery status
3. Verify all environment variables are set correctly
4. Make sure you're using the correct keys (test vs. live)
