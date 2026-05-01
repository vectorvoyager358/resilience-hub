# Resilience Hub

## What this app is

**Resilience Hub** is a web app for tracking personal **resilience challenges**—habits or goals you commit to for a set number of days—and reflecting on your progress over time. You sign in, define challenges with a duration, log completed days on a calendar-style view, attach notes to days or challenges, and browse history. A **built-in chat assistant** (powered by Google Gemini) can answer in context of your journey; **vector search** (Pinecone) keeps challenge and note text synced so replies can draw on what you have actually written.

The experience is aimed at **solo use**: your data is scoped to your Firebase account. The UI is a single-page React app (Material UI) with **installable PWA** support for a more app-like feel on mobile and desktop.

## Features

- **Accounts**: Email/password auth with Firebase, protected routes, profile and email verification flows.
- **Challenges**: Create timed challenges, track progress by day, archive completed ones, milestones and gentle progress feedback.
- **Journaling**: Daily and per-challenge notes, editing, search (including fuzzy search via Fuse.js), and a dedicated notes history area.
- **Assistant chat**: Personalized greetings and suggested prompts based on your active challenges; uses Gemini for conversation.
- **RAG-style context**: Embeddings (Gemini on the client) can be sent to a small Flask API that **upserts** and **deletes** vectors in Pinecone so the assistant can retrieve relevant snippets of your notes and challenge text. Core tracking still works in **Firestore** if the backend or Pinecone is unavailable.
- **Progressive Web App**: Configured via `vite-plugin-pwa` with app manifest and icons.

## Tech stack

| Area | Technology |
|------|------------|
| Frontend | React 18, TypeScript, Vite, MUI, React Router, Framer Motion |
| Auth & data | Firebase Authentication, Cloud Firestore |
| AI | Google Generative AI (Gemini) for chat and text embeddings |
| Vector store API | Flask + `pinecone` (`app.py`, `server/routes/`) |
| Charts | Chart.js / react-chartjs-2 |

## Local setup

### 1. Clone and install (frontend)

```bash
git clone <repository-url>
cd resilience-hub
npm install
```

### 2. Environment variables (frontend)

Copy the example file and fill in real values:

```bash
cp .env.example .env
```

At minimum, set the **Firebase** `VITE_*` variables so auth and Firestore work. For the chat assistant and client-side embeddings, set **`VITE_GEMINI_API_KEY`**. Do not commit `.env`.

### 3. Run the Vite dev server

```bash
npm run dev
```

The dev server defaults to port **5173** and proxies **`/api`** to **`http://localhost:5001`** (see `vite.config.ts`), so Pinecone routes work locally when the Flask app is running.

### 4. Run the Flask API (optional, for Pinecone)

If you want vector upserts/deletes and richer assistant context:

```bash
python3 -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

Create or extend a **`.env`** file in the project root (same file as the frontend or a dedicated backend env—`app.py` uses `python-dotenv`) with:

```env
PINECONE_API_KEY=
PINECONE_INDEX_NAME=
```

Then start the server:

```bash
python app.py
```

Health check: open `http://localhost:5001/api/test` or the root URL for a simple status message.

## Available scripts

- `npm start` / `npm run dev` — Vite development server
- `npm run build` — TypeScript check + production build to `dist/`
- `npm run preview` — Preview the production build locally
- `npm run lint` — ESLint
- `npm run lint:fix` — ESLint with auto-fix
- `npm run lint:watch` — ESLint in watch mode

## Environment variables reference

**Frontend (Vite — `VITE_*` is exposed to the browser):**

```env
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
VITE_GEMINI_API_KEY=
```

**Backend (Flask — server-side only, not prefixed with `VITE_`):**

```env
PINECONE_API_KEY=
PINECONE_INDEX_NAME=
# Optional: restrict CORS in production (comma-separated). Required for credentialed browser requests from a real origin (e.g. GitHub Pages).
# ALLOWED_ORIGINS=https://YOURNAME.github.io/resilience-hub,http://localhost:5173
```

Never commit secrets; use `.env.example` as the template only.

## Deployment

The app can be hosted as static files (e.g. **`dist/`** after `npm run build`). Firebase Hosting is configured in-repo as one option.

### Google Cloud Run (Flask API)

The repo includes a **`Dockerfile`** that builds only the Python API (`app.py` + `server/`). Below is what **you** need on your side, then a typical deploy flow.

#### What you need

1. **Google account** with a **GCP project** and [**billing enabled**](https://cloud.google.com/billing/docs/how-to/modify-project) (Cloud Run’s free tier still usually requires a billing account).
2. **APIs turned on** (the console prompts you, or enable manually): **Cloud Run**, **Artifact Registry**, **Cloud Build**.
3. [**Google Cloud SDK**](https://cloud.google.com/sdk/docs/install) (`gcloud`) installed locally, then:
   - `gcloud auth login`
   - `gcloud config set project YOUR_PROJECT_ID`
4. **Secrets for the service**
   - **`PINECONE_API_KEY`** and **`PINECONE_INDEX_NAME`** (same values you use locally). Prefer [Secret Manager](https://cloud.google.com/secret-manager) for the API key; at minimum set them as Cloud Run env vars in the console or via `--set-env-vars` (avoid logging them).
5. **CORS**: The browser sends **cookies/credentials** with some `/api` calls. That **does not work** with `Access-Control-Allow-Origin: *`. Set **`ALLOWED_ORIGINS`** on the service to your real site origins, comma-separated, e.g. `https://YOURNAME.github.io`, `https://YOURNAME.github.io/resilience-hub`, and `http://localhost:5173` for local testing.
6. **Frontend URL**: After deploy, note the **service URL** (e.g. `https://resilience-hub-api-xxxxx-uc.a.run.app`). The React app currently calls **`/api/...`** relative to the page origin. For GitHub Pages you will need a **full API base URL** in the frontend (e.g. a `VITE_` variable and `fetch` updates)—plan that when you ship the static site.

#### Deploy from your machine (source build)

From the **repository root** (where `Dockerfile` lives):

```bash
gcloud run deploy resilience-hub-api \
  --source . \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars "PINECONE_INDEX_NAME=your-index-name,ALLOWED_ORIGINS=https://YOURNAME.github.io"
```

Add **`PINECONE_API_KEY`** via the Cloud Run UI, or `--set-secrets` once the secret exists in Secret Manager, for example:

```bash
echo -n 'YOUR_PINECONE_KEY' | gcloud secrets create pinecone-api-key --data-file=-
gcloud run deploy resilience-hub-api \
  --source . \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars "PINECONE_INDEX_NAME=your-index-name,ALLOWED_ORIGINS=https://YOURNAME.github.io" \
  --set-secrets "PINECONE_API_KEY=pinecone-api-key:latest"
```

Replace **`us-central1`**, service name, index name, and origins with yours. First deploy may take several minutes while Cloud Build creates the image.

Smoke test: `curl -sS "https://YOUR-SERVICE-URL/api/test"`.

### Firebase Hosting

1. Install the CLI: `npm install -g firebase-tools`
2. Log in: `firebase login`
3. If needed: `firebase init hosting` — public directory **`dist`**, SPA **yes**, do not overwrite `index.html` if prompted to keep your entry.
4. Build: `npm run build`
5. Deploy: `firebase deploy`

The live URL will look like `https://<your-project-id>.web.app`.

If the API is on **Cloud Run**, set **`ALLOWED_ORIGINS`** on the backend to match your Firebase **or** GitHub Pages URL, and point the frontend at the Cloud Run base URL for `/api` routes (see the Cloud Run section above).
