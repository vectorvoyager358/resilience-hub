# Push reminders (FCM Web) + Cloud Scheduler

This project can send **one daily push notification per user** at **(local midnight − 2 hours)** listing all **active challenges** that are not yet logged for the day (no note content for today’s day index).

## 1) Firebase / FCM prerequisites

### Web Push (VAPID) key
- In Firebase Console → **Project settings** → **Cloud Messaging** → **Web configuration**, generate a **Web Push certificate key pair**.
- Put the public key into the frontend env:
  - `VITE_FIREBASE_VAPID_KEY=...`

### Service account permissions (Cloud Run)
The Cloud Run service account must be able to:
- Read `users` collection from Firestore.
- Send FCM messages (Firebase Admin SDK).

In practice this usually means granting roles such as:
- Firestore access (e.g. `roles/datastore.user` or narrower, depending on your setup)
- Firebase Admin / FCM permissions appropriate for Admin SDK usage.

## 2) Data stored in Firestore

In `users/{uid}` (written by the frontend on dashboard load):
- `timezone`: IANA timezone string (e.g. `Asia/Kolkata`)
- `fcmTokens`: array of strings (tokens for the user’s browsers/devices)

Set by the reminder job:
- `lastReminderSentLocalDate`: `YYYY-MM-DD` in user timezone (idempotency)

## 3) Backend endpoint

The backend exposes:
- `POST /tasks/send-daily-reminders`

It is protected by a required header:
- `X-CRON-KEY: <CRON_KEY>`

Configure these env vars on Cloud Run:
- `CRON_KEY`: secret string
- `REMINDER_WINDOW_MINUTES`: default `10` (how wide the trigger window is around “2 hours before midnight”)

## 4) Cloud Scheduler job (recommended cadence)

Because users live in different timezones, run the job **every 10 minutes** so each timezone gets hit near its 22:00 local window.

Example `gcloud` command (HTTP target + header auth):

```bash
gcloud scheduler jobs create http resilience-hub-daily-reminders \
  --schedule="*/10 * * * *" \
  --time-zone="UTC" \
  --uri="https://YOUR_CLOUD_RUN_URL/tasks/send-daily-reminders" \
  --http-method=POST \
  --headers="X-CRON-KEY=YOUR_CRON_KEY" \
  --attempt-deadline=300s
```

Notes:
- Keep the job timezone at UTC; the backend computes per-user local time using `users/{uid}.timezone`.
- If you prefer stronger auth, use Scheduler OIDC auth instead of a header secret.

