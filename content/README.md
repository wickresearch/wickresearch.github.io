# content/

Files you edit by hand. No code changes are needed.

* **`articles.yaml`**: the research library. Add one block per article (title, url, date, platform, category, tags, description, featured). Medium posts are also picked up automatically from the RSS feed. Add an entry here to give a post a category, description or `featured: true`. LinkedIn articles must be added here because LinkedIn has no public feed or API.
* **`calendar.yaml`**: central-bank policy meeting dates, transcribed from each bank's official calendar. Update when banks publish next year's schedule (usually mid-year) and change `verified_on`. FOMC dates also drive the FOMC event study.

Commit to `main` and the site rebuilds automatically.
