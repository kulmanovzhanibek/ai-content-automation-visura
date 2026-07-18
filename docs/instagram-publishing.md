# Instagram publishing — Graph API (content publishing)

Post finished artifacts to an Instagram Business/Creator account:
- **Reels** — a rendered `jobs/<job>/out.mp4` → `media_type=REELS`
- **Carousel** — the `/slides` `slide_*.png` set → `media_type=CAROUSEL` (2–10 items)

Runs entirely on API keys (no browser, no MCP), so it works headless in the daily
scheduled session, exactly like the Telegram delivery step.

## Why a GCS bucket is required

Instagram **cannot accept a local file upload** — the Graph API publishes media by
fetching a **public URL** itself (`video_url` / `image_url`). So every asset is first
uploaded to Google Cloud Storage (`src/gcs.ts`) to get a public URL, then that URL is
handed to Instagram. We reuse the same `GCP_SERVICE_ACCOUNT` the image pipeline
already uses for Vertex — no new cloud account.

The publish flow (`src/instagram.ts`) is Meta's standard 3-step "container" dance:

1. `POST /{ig-user-id}/media` with `media_type` + the public url → a **creation container**
2. `GET /{container-id}?fields=status_code` — poll until `FINISHED` (Reels take ~30s–2min)
3. `POST /{ig-user-id}/media_publish` with `creation_id` → the published media id

For a carousel each slide is its own item container (`is_carousel_item=true`), then a
parent `CAROUSEL` container references them via `children`.

## One-time setup

### 1. Meta side (account + app + token)

You need an **Instagram Business or Creator** account (personal accounts can't use the
API), linked to a **Facebook Page**, and a **Meta app** with the
`instagram_content_publish` permission (plus `instagram_basic`,
`pages_read_engagement`). From those you generate a **long-lived access token** and read
the **IG user id** (the numeric business-account id, not the `@username`).

Long-lived user tokens last ~60 days — refresh before expiry, or use a Meta *system
user* token that doesn't expire. Rate limit: **100 published posts per rolling 24h**
(all types combined).

Put them in `.env` (or the environment's configured variables):

```
IG_USER_ID=178414...          # numeric business-account id
IG_ACCESS_TOKEN=EAAG...       # long-lived token, instagram_content_publish
# The token may instead be provided as VISURA_IG_API (an accepted alias).
```

### Network / egress policy (Claude Code on the web)

The Graph API host **`graph.facebook.com`** must be allowed by the environment's
outbound network policy. On a restricted policy the publish call fails with a proxy
`403 CONNECT` ("destination host is not allowed") and nothing is posted — the
credentials are fine, the host is simply not on the allowlist. Choose (or adjust) an
environment network policy that permits `graph.facebook.com`; see
https://code.claude.com/docs/en/claude-code-on-the-web. The GCS host
(`storage.googleapis.com`) used for hosting is a Google API and is typically already
allowed (the image pipeline uses Google APIs).

### 2. GCS bucket (hosting)

```
GCS_BUCKET=visura-reels-public   # name WITHOUT dots (a dotted name needs domain verification)
```

- Create the bucket (uniform bucket-level access is fine).
- Grant the service account (`client_email` in `GCP_SERVICE_ACCOUNT`) the
  **Storage Object Admin** role on it (write + read).

That's all. By default `src/gcs.ts` returns a **V4 signed URL** signed locally with the
service-account private key, so the **bucket can stay private** — this works even when
the organization enforces *public-access-prevention* / uniform access (you do NOT need
to grant `allUsers` anything). The link is time-limited (`GCS_SIGNED_URL_EXPIRES`,
default 3600s) — plenty for Instagram to fetch during container processing. *(Optional:
a lifecycle rule to auto-delete objects after 1 day — Instagram only fetches each once.)*

If instead you have a genuinely public bucket (`allUsers: Storage Object Viewer`), set
`GCS_PUBLIC=true` to use the plain public URL rather than a signed one.

### 3. Verify the connection (spends no post)

```bash
npx tsx src/instagram.ts --whoami
```

Prints `@username`, account type, follower/media counts. If this works, publishing will.

## Commands

```bash
# Publish a rendered reel (uploads out.mp4 to GCS, then posts as a Reel)
npx tsx src/instagram.ts jobs/<job>/out.mp4 "caption #hashtags"
npx tsx src/instagram.ts --reel <job_id> "caption"        # same, resolves out.mp4

# Publish a /slides carousel (uploads slide_*.png, posts as a CAROUSEL)
npx tsx src/instagram.ts --carousel <job_id> "caption"

# Just host a file and print its public URL (debug)
npx tsx src/gcs.ts jobs/<job>/out.mp4
```

Both `--reel` and `--carousel` are **idempotent**: a `.ig-sent` sentinel is written on
success so re-running the job (or a resumed daily run) never double-posts. Add `--force`
to repost intentionally.

## Where it fits in the pipeline

Instagram publishing is an **optional final delivery step, parallel to Telegram** — the
same `out.mp4` / `slide_*.png` that go to Telegram can also go to Instagram. Telegram
stays the primary "deliver as a file" sink; Instagram is the public-feed publish.

**Language routing: Instagram = Russian only.** Publish only the RU cut (`<job_id>-ru`)
to Instagram. The English cut is delivered to **Telegram only** — do not post it to
Instagram. Telegram still receives both languages.

## Caveats

- **Reels**: must be 9:16, 5–90s, H.264/HEVC — the renders already comply.
- **Carousel aspect**: Instagram crops every carousel slide to the FIRST slide's ratio
  (portrait max 4:5), so 9:16 slides are centre-cropped in the feed. If exact framing
  matters, post the slides as a Reel/video instead, or design slides for 4:5.
- **Token expiry**: a 401/190 error usually means the long-lived token expired —
  regenerate it and update `IG_ACCESS_TOKEN`.
- **API version**: defaults to `v23.0` / `graph.facebook.com`; override with
  `GRAPH_API_VERSION` / `GRAPH_API_HOST` if Meta deprecates it.
