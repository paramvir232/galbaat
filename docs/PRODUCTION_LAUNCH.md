# Talkietiv Production Launch

This is the launch checklist for `talkietiv.com`. It intentionally keeps private room URLs out of search and treats SEO as a long-term quality and discovery effort, not a guaranteed ranking position.

## Search and content

The public site now targets these useful search-intent clusters naturally in its landing content and dedicated pages:

- online walkie-talkie
- browser walkie-talkie
- online voice chat
- voice chat without an account
- free group voice chat rooms
- push-to-talk voice chat
- private voice chat room link
- browser voice chat

Do not create room pages for search engines. Rooms are temporary, private collaboration spaces and are intentionally blocked from crawling through `robots.txt`, a `noindex` page tag, and an `X-Robots-Tag` response header. Add new public pages only when they contain distinct, useful content for a real audience; bulk keyword pages that repeat the same copy will hurt quality rather than improve ranking.

After deployment:

1. Verify the `talkietiv.com` domain property in Google Search Console.
2. Submit `https://talkietiv.com/sitemap.xml` in Search Console and inspect the first crawl results.
3. Verify the same domain in Bing Webmaster Tools and submit the sitemap there.
4. Check the rendered page title, description, canonical URL, structured data, mobile usability, and Core Web Vitals in Search Console after Google has crawled the live domain.
5. Publish genuinely useful content over time, such as concrete guides for remote team check-ins, study groups, events, and quick field coordination. Link each guide from the site only when it helps users navigate.

FAQ structured data is included to describe the page clearly. It should not be treated as a promise of a Google FAQ rich result, because Google limits that appearance for most commercial sites.

## Domain and frontend

1. In Vercel, add both `talkietiv.com` and `www.talkietiv.com` to the production project.
2. Use `talkietiv.com` as the canonical domain. The included Vercel redirect sends `www.talkietiv.com` to it with a permanent redirect.
3. Add the DNS records Vercel shows for the apex and `www` host. Do not leave conflicting records at the domain registrar.
4. Set `VITE_API_URL` in Vercel to the final HTTPS backend address. Until an API custom domain is ready, the existing Render HTTPS URL can remain in use.
5. If the backend host changes, add its HTTPS and WSS hosts to the `connect-src`, `img-src`, and `media-src` entries in [vercel.json](../vercel.json) before deploying.
6. Test `https://talkietiv.com/robots.txt`, `/sitemap.xml`, `/online-walkie-talkie`, and a new private `/r/<room-code>` URL after launch.

## Backend, security, and data

1. Set `NODE_ENV=production`, `MONGODB_URI`, and exact `ALLOWED_ORIGINS` values on Render. Use only `https://talkietiv.com`, `https://www.talkietiv.com`, and any temporary production frontend host that is still in service.
2. Keep all secrets in the Render and Vercel environment-variable dashboards. Do not commit `.env` files, database passwords, API keys, deployment hooks, or access tokens.
3. Rotate any credential that has ever been pasted into a chat, terminal capture, screenshot, issue, or commit history before launch.
4. Use a dedicated MongoDB Atlas database user with the minimum required role. Restrict Atlas network access to known backend egress addresses when your hosting arrangement supports stable outbound IPs.
5. Enable scheduled MongoDB backups and run a restore drill before launch. File uploads are stored in MongoDB GridFS, so include that data in backup verification.
6. Keep dependencies current and run `npm audit` in a controlled update cycle. Review dependency changes before deploying them.

## Reliability and uptime

1. Keep Render's `/api/health` HTTP health check enabled. It returns unhealthy while MongoDB is not connected.
2. Use a paid, non-sleeping Render instance for the API. For higher availability, run at least two instances in the same region and confirm that Socket.IO's scaling adapter and sticky-session strategy are configured before scaling horizontally.
3. Create an external uptime monitor for `https://talkietiv.com/` and the backend `/api/health` endpoint. Configure alerts to reach the person responsible for incidents.
4. Enable deploy notifications and keep automatic deploys tied to a protected production branch. Test release candidates on a preview URL first.
5. Check error logs, database connection health, API latency, and client-side Web Vitals after every release.

## Release gate

Do not make the domain public until all of these pass on the live URLs:

- HTTPS certificate is valid on the apex and `www` domains.
- The `www` redirect reaches the canonical apex URL in one hop.
- `robots.txt` and `sitemap.xml` return `200` and list only public pages.
- Browser security headers are present and voice, camera, screen sharing, uploads, and realtime chat still work.
- API health check reports `{ "ok": true }`.
- A backup is confirmed and an uptime alert test has been received.
- Search Console ownership is verified and the sitemap is submitted.
