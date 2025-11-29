# JobHunter - Hybrid (integrated)

This package includes a decision module (`tools/decider.js`) that decides whether a source should be fetched via API/RSS or scraped.
- `tools/fetcher.js` uses decider to classify sources and writes:
  - `data/api_jobs.json` (from APIs/RSS)
  - `data/sources_to_scrape.json` (sources marked for scraping)
  - `data/manual_review.json` (sources needing manual review)
- `tools/scraper.js` reads `data/sources_to_scrape.json` and runs built-in scrapers for known hosts.

Workflow:
1. Run `node tools/fetcher.js`
2. Run `npx playwright install --with-deps` then `node tools/scraper.js`
3. Run `node tools/build_index.js` to merge results

