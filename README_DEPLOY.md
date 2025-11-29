Deployment notes:
- Push this repo to GitHub.
- Set up GitHub Secrets: JOB_SOURCES, GS_CREDS_B64, GS_SHEET_ID, SCRAPE_WHITELIST, SCRAPE_BLACKLIST.
- Configure Netlify to deploy from gh-pages branch OR main. The workflow pushes to gh-pages by default.
- In Netlify, set environment variables if using S3: STORAGE_TYPE=s3, S3_BUCKET, AWS_* credentials.
