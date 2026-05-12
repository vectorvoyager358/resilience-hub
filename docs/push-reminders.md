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

In `users/{uid}` (written by the frontend when push is enabled, e.g. from the dashboard flow):
- `timezone`: IANA timezone string (e.g. `America/Chicago`) — used by the scheduler job to compute “local midnight − 2h”
- `fcmTokens`: array of strings (FCM registration tokens for the user’s browsers/devices)

Optional opt-out (checked by the reminder job):
- `pushRemindersEnabled`: if set to **`false`**, that user is skipped (`reason: "disabled"`).

Set by the reminder job:
- `lastReminderSentLocalDate`: `YYYY-MM-DD` in user timezone (idempotency)

## 3) Backend endpoint

The backend exposes:
- `POST /tasks/send-daily-reminders`

It is protected by a required header:
- `X-CRON-KEY: <CRON_KEY>`

Configure these env vars on Cloud Run:
- **`CRON_KEY`**: secret string (**required**). If unset, the handler returns **`500`** with `CRON_KEY is not configured` so the route is not accidentally public without auth.
- **`REMINDER_WINDOW_MINUTES`**: default `10` (how wide the trigger window is around “2 hours before midnight”)

Firebase Admin initializes from **`GOOGLE_CLOUD_PROJECT`** when set (see `server/routes/reminders.py`); align with your GCP / Cloud Run project.

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

## 5) Browser registration (how tokens reach Firestore)

After the user grants notification permission, the client obtains an FCM token and calls **`POST /api/push/register`** with the Firebase **`Authorization`** header. The backend validates the token and persists **`fcmTokens`** / **`timezone`** on `users/{uid}` (see `src/services/push.ts` and `server/routes/push.py`). The frontend needs **`VITE_FIREBASE_VAPID_KEY`** (see §1).