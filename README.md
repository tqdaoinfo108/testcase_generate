<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/e212a87e-c493-42a4-89a4-a06e9b7329ab

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Deploy Frontend to GitHub Pages With Env

Important: This project is full-stack (`server.ts` + MongoDB + Gemini). GitHub Pages only hosts static files, so backend APIs cannot run on Pages.

Use this architecture:
- Frontend (Vite `dist`) -> GitHub Pages
- Backend (`server.ts`) -> Render/Railway/Fly.io/your VPS

### 1. Frontend env vars (safe/public)

Create `.env.production` for build-time frontend config:

```env
VITE_BASE_PATH=/<repo-name>/
VITE_API_BASE_URL=https://your-backend-domain.com
```

Notes:
- `VITE_BASE_PATH` is required for repo-based GitHub Pages URLs.
- `VITE_API_BASE_URL` points frontend requests to your deployed backend.
- Do not put secrets in any `VITE_*` variable (they are embedded into client JS).

### 2. Backend env vars (secret)

Set these on your backend host (not in GitHub Pages):

```env
GEMINI_API_KEY=...
MONGO_URI=...
GEMINI_MODEL=gemini-2.5-flash
```

### 3. Build and deploy to Pages

```bash
npm run build
```

Then publish the `dist` folder with one of these options:
- GitHub Actions deploy workflow
- `gh-pages` package
- Manual upload to `gh-pages` branch

### 4. GitHub Actions env mapping example

In workflow step `Build`, map repository variables/secrets:

```yaml
- name: Build
   run: npm ci && npm run build
   env:
      VITE_BASE_PATH: /${{ github.event.repository.name }}/
      VITE_API_BASE_URL: ${{ vars.VITE_API_BASE_URL }}
```

Use `Repository settings -> Secrets and variables -> Actions`:
- `vars.VITE_API_BASE_URL` for non-secret public backend URL
- `secrets.*` only for sensitive data (do not expose to frontend build unless intentionally public)
