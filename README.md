# StuHealth

StuHealth is a minimal prototype web application providing student health and wellness resources: mental health support, fitness programs, and nutrition advice. This scaffold is professional-looking and includes admin CRUD for resources and simple usage metrics.

## Features

- Public pages: Home, Resources, Programs, Support
- Admin dashboard: Add / Edit / Delete resources
- Simple JSON-backed storage (`data/resources.json`)
- Metrics endpoint: `/metrics` (JSON)
- Responsive UI using Bootstrap

## Quick start (Windows PowerShell)

Open PowerShell in the project folder (`c:\Users\hp\OneDrive\Desktop\hack`) and run:

```powershell
npm install
npm start
```

Then open `http://localhost:3000` in your browser.

## Notes & Next steps

- This prototype uses a JSON file for storage. For production, migrate to a database (Postgres, SQLite, MongoDB).
- For real admin access, add authentication and authorization.
- Add file/image uploads and richer program scheduling.
- I can run `npm install` and start the server for you, or add authentication — tell me which next.
