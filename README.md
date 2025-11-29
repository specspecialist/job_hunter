# JobHunter — Deploy Package

This package is ready to be pushed to GitHub and deployed on Netlify.

Key steps:
1. Fill `.env.template` and set Netlify environment variables.
2. Add GitHub Actions secrets for JOB_SOURCES, GS_CREDS_B64, GS_SHEET_ID, etc.
3. Configure Netlify to deploy the `main` branch.
4. Run the Fetch & Scrape workflow once to generate `data/index.json`.

Files included:
- index.html (homepage with dark/light + chart)
- admin.html (admin with login + quick filters + delete UI)
- tools/ (fetcher, scraper, decider, build_index, export_sheets)
- netlify/functions (jobs, export_sheets, login, delete_job)
- .github/workflows (fetch-and-scrape.yml, export-to-sheets.yml, remove-job.yml)
