# Pagination test suite

These scripts call the API at `http://localhost:3000`. Start the app first:

```bash
npm start
```

## Files

- **`test-natural-length-pagination.js`** — Creates a 10K-record paginated session, checks natural string length variation and deterministic repeat fetches for the same page.
- **`test-configurable-page-size.js`** — Exercises `recordsPerPage` (10–1000), pagination math, and navigation.
- **`run-all-tests.js`** — Runs the two tests above in sequence (used by `npm test`).

## Commands

```bash
npm test
npm run test:natural
npm run test:pagesize
```
