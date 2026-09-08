# Private TechWiki authoring integration

TechWiki exposes a deliberately separate owner-only authoring surface for trusted automation and AI clients. It is not part of the public read-only content API or public MCP server.

## Security model

Set `TECHWIKI_AUTHORING_USER_ID` to the UUID of the single TechWiki account allowed to authorize or use private authoring credentials. Staff, moderator and superuser status do not grant access by themselves.

Publishing is intentionally unavailable. The integration can create and update drafts, create categories and tags, attach compatibility metadata, search existing content and validate drafts. Publication remains a human/admin action.

Every mutation is written to `AuthoringAuditLog`. Personal and OAuth access tokens are random bearer tokens whose raw values are displayed only when issued; only SHA-256 digests are stored.

## Direct REST access

Issue a personal authoring token:

```bash
python manage.py create_authoring_token "ChatGPT authoring" --user-id <owner-uuid>
```

The command prints the raw token once. Send it as:

```text
Authorization: Bearer tw_auth_...
```

The API root is:

```text
https://api.techwiki.co.uk/api/authoring/v1/
```

Mutating clients should send an `Idempotency-Key` header so retries do not create duplicate categories, tags or drafts.

## Private MCP server

The remote MCP endpoint is:

```text
https://api.techwiki.co.uk/admin-mcp
```

It supports the current stateless MCP protocol used by TechWiki (`2026-07-28`) and retains the previous initialize handshake for older clients.

Tools include:

- `search_articles`
- `get_article`
- `create_article_draft`
- `update_article_draft`
- `validate_article`
- `list_categories`
- `create_category`
- `list_tags`
- `create_tag`
- `set_article_compatibility`

There is deliberately no publish tool.

## OAuth / ChatGPT app access

Create a confidential OAuth client for ChatGPT or another agent:

```bash
python manage.py create_authoring_oauth_client "TechWiki ChatGPT" \
  --redirect-uri <registered-callback-url>
```

Store the emitted client secret immediately; only its hash is retained.

OAuth discovery is available at:

```text
https://api.techwiki.co.uk/.well-known/oauth-authorization-server
https://api.techwiki.co.uk/.well-known/oauth-protected-resource
```

The flow uses authorization code + PKCE (`S256`). Authorization requires a logged-in TechWiki session belonging to `TECHWIKI_AUTHORING_USER_ID`. `offline_access` enables rotating refresh tokens.

The auth frontend accepts API-origin `next` URLs so the normal TechWiki password/passkey/2FA login can return to the pending OAuth authorization request.

## ChatGPT Apps SDK

The private MCP server is the app backend: the Apps SDK is MCP-backed, so no second authoring implementation is required. Its MCP tool definitions include read/write annotations for ChatGPT's tool scanner. Once an app can be tested or submitted, configure its MCP endpoint as `/admin-mcp` and use the OAuth endpoints above.

Current OpenAI plan availability for private custom write-capable MCP apps changes independently of TechWiki. The server therefore also supports direct bearer access and is ready for a directory-published app without changing the authoring domain logic.
