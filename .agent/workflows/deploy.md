---
description: Deploy the bookmark manager to Cloudflare Workers
---

1.  **Login to Cloudflare**
    If you haven't logged in yet:
    ```bash
    npx wrangler login
    ```

2.  **Create Remote Database**
    Create the D1 database on Cloudflare:
    ```bash
    npx wrangler d1 create bookmarks-db
    ```
    *Copy the `database_id` from the output.*

3.  **Update Configuration**
    Edit `wrangler.toml` and replace the `database_id` with the one you just copied.

4.  **Initialize Remote Database**
    Apply the schema to the remote database:
    ```bash
    npx wrangler d1 execute DB --remote --file=./schema.sql
    ```

5.  **Deploy Worker**
    Deploy the application code:
    ```bash
    npx wrangler deploy
    ```

6.  **Visit Your Site**
    The output of the deploy command will show your Worker's URL (e.g., `https://web-bookmarks.<your-subdomain>.workers.dev`).
