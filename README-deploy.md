Deployment instructions (Render / Railway)

1) Prepare and push repo to GitHub (PowerShell)

```powershell
Set-Location 'C:\Users\hp\OneDrive\Desktop\hack'
git init
git add .
git commit -m "Initial StuHealth app"
git branch -M main
# Create remote on GitHub (use gh CLI) or add remote manually:
# gh repo create <your-username>/fed-finalproject --public --source=. --remote=origin --push
# OR
# git remote add origin https://github.com/<your-username>/fed-finalproject.git
# git push -u origin main
```

2) Render (recommended)

- Go to https://dashboard.render.com and create an account or sign in.
- Click New -> Web Service -> Connect a repository and choose this GitHub repo.
- If you added `render.yaml`, Render will read it. Otherwise set:
  - Build command: `npm install`
  - Start command: `npm start`
  - Environment: `Node`, Port `3000` (Render supplies `PORT` automatically)
- Add environment variables in the Render dashboard:
  - `SESSION_SECRET` = (random string)
  - Any other variables used in your `.env`.
- Deploy. Render will provide a live URL (e.g., `https://stuhealth.onrender.com`).

3) Railway

- Go to https://railway.app and create a new project.
- Choose Deploy from GitHub and select this repo.
- Railway will detect Node. Ensure the start command is `npm start`.
- Add `SESSION_SECRET` in Railway project settings.

4) Docker-based hosting (optional)

- We added a `Dockerfile`. You can build and run locally:
```powershell
docker build -t stuhealth:latest .
docker run -p 3000:3000 --env SESSION_SECRET=secretvalue stuhealth:latest
```

5) Notes

- This app uses EJS server-side templates; hosts like Surge/Vercel (static) are not suitable without a static export.
- If you want, I can add a GitHub Actions workflow that deploys to Render automatically on push.
