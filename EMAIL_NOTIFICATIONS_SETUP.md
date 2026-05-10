# Reservation Email Notifications Setup

This project now includes a Supabase Edge Function that sends customer emails for restaurant reservations using Resend.

## What It Sends

- `Reservation received` when a new reservation is created
- `Reservation confirmed` when the admin changes `status` to `confirmed`
- `Reservation cancelled` when the admin changes `status` to `cancelled`

Each email includes:

- Restaurant name
- Customer name
- Reservation date
- Reservation time
- Number of guests
- Reservation status

## Files

- Edge Function: `supabase/functions/send-reservation-email/index.ts`
- Function config: `supabase/functions/send-reservation-email/config.toml`
- SQL setup: `supabase_email_setup.sql`

## 1. Create a Resend Account

1. Go to [https://resend.com](https://resend.com)
2. Create a free account
3. Verify a sending domain or use a tested sender identity
4. Copy your API key

## 2. Set the Required Environment Variables

In your Supabase project, open `Project Settings` -> `Edge Functions` -> `Environment Variables` and add:

```text
RESEND_API_KEY=re_xxxxxxxxx
RESEND_FROM_EMAIL=Restaurant Montreal <reservations@yourdomain.com>
RESTAURANT_NAME=Restaurant Montreal
RESTAURANT_PHONE=+1 514 555 0100
RESTAURANT_CONTACT_EMAIL=abbassimohammed012@gmail.com
RESERVATION_WEBHOOK_SECRET=replace-with-a-long-random-secret
SUPABASE_URL=https://vxbxrkoeioakqrxvbnym.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

Notes:

- `RESEND_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, and `RESERVATION_WEBHOOK_SECRET` must stay server-side only.
- Never put these values in `index.html`, `admin.html`, or any frontend script.
- `RESTAURANT_PHONE` and `RESTAURANT_CONTACT_EMAIL` are optional, but they improve the email footer.

## 3. Deploy the Edge Function

From the project root:

```bash
npx supabase@latest login
npx supabase@latest link --project-ref vxbxrkoeioakqrxvbnym
npx supabase@latest functions deploy send-reservation-email --no-verify-jwt
```

If you want to test locally first:

```bash
npx supabase@latest start
npx supabase@latest functions serve send-reservation-email --no-verify-jwt
```

## 4. Run the Database SQL

Open the Supabase SQL Editor and run the contents of `supabase_email_setup.sql`.

Before running it, replace:

- `YOUR_WEBHOOK_SECRET`

What this SQL does:

- Adds tracking columns to the `reservations` table
- Adds temporary processing lock columns to prevent duplicate sends
- Creates an `INSERT` trigger for new reservations
- Creates an `UPDATE OF status` trigger for confirmations and cancellations

## 5. How Duplicate Protection Works

The Edge Function uses two checks:

1. Event detection:
   - `INSERT` -> send `received`
   - `status = confirmed` -> send `confirmed`
   - `status = cancelled` -> send `cancelled`
2. Processing lock:
   - Each email event has its own `*_processing_at` column
   - Only one function invocation can claim that event at a time
   - Once the email sends successfully, the matching `*_sent_at` column is filled

This prevents the same reservation event from being emailed multiple times by overlapping webhook calls.

## 6. Test the Full Flow

### Test new reservation email

1. Create a reservation from the public booking form
2. Confirm the row was inserted in `public.reservations`
3. Check that `notification_received_sent_at` is filled
4. Confirm the customer received the `Reservation received` email

### Test confirmation email

1. Open the admin page
2. Change a reservation status from `pending` to `confirmed`
3. Confirm `notification_confirmed_sent_at` is filled
4. Confirm the customer received the `Reservation confirmed` email

### Test cancellation email

1. Change a reservation status to `cancelled`
2. Confirm `notification_cancelled_sent_at` is filled
3. Confirm the customer received the `Reservation cancelled` email

## 7. Troubleshooting

If an email fails:

- Check the function logs in Supabase `Edge Functions`
- Check `notification_last_error` in the `reservations` table
- Confirm the sender email is allowed in Resend
- Confirm `RESEND_API_KEY` is valid
- Confirm the reservation row has a customer email address

If a reservation is stuck with a processing timestamp and no sent timestamp:

```sql
update public.reservations
set
  notification_received_processing_at = null,
  notification_confirmed_processing_at = null,
  notification_cancelled_processing_at = null
where id = 'YOUR_RESERVATION_ID';
```

Then retry the reservation event by creating a new reservation or changing the status again.

## 8. Production Notes

- The frontend stays unchanged because the database trigger handles sending automatically.
- The admin panel already updates reservation statuses, so confirmation and cancellation emails are triggered automatically after status changes.
- The function is designed for customer emails only. If you later want staff alerts, add a second email call to an internal address.
