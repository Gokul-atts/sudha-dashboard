# sudha-dashboard

Run locally with `npm run dev`. Verify with `node --test src/*.test.js` and `npm run build`.

## Google Sheet loading

The dashboard waits up to 90 seconds for the Apps Script response and shows a progress message after 15 seconds. Initial requests can use the server's one-minute response cache; **Refresh data** bypasses it to read the latest sheet values. The displayed update time comes from the server when available.

To activate the server optimization:

1. Open the Google Sheet's **Extensions → Apps Script** project serving the API URL in `src/api.js`.
2. Replace its dashboard script with `Google-Sheet-API.gs` and save.
3. Choose **Deploy → Manage deployments**, edit the existing web app, select **New version**, and deploy. Keep the existing deployment URL and access settings.

Editing this local `.gs` file does not update the deployed Google web app. Until redeployed, only the frontend timeout and loading messages take effect. Successful server responses are cached for up to 60 seconds when below the CacheService value limit; larger responses remain uncached. No dashboard data is persisted in browser storage.
