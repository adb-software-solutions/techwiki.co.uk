# Ezoic setup for TechWiki

The Ezoic Setup MCP server is configured locally as `ezoic-setup` at
`https://setup-agent.ezoic.com/mcp` (streamable HTTP, no authentication). It gives
public setup guidance; it cannot access or update your Ezoic account.

## Dashboard setup

1. Select `techwiki.co.uk` in your [Ezoic dashboard](https://login.ezoic.com/).
2. Under **EzoicAds → Ad Transparency → Ads.txt**, choose JavaScript integration
   and publish the managed seller file. Import any existing AdSense seller entry
   from the live `/ads.txt` before replacing it.
3. Check that `https://srv.adstxtmanager.com/19390/techwiki.co.uk` returns HTTP 200
   with seller records. It returned HTTP 404 during setup; resolve this before
   enabling the redirect. If Ezoic supplies a different manager account ID,
   update the destination in `website/src/app/ads.txt/route.ts`.
4. Choose Ezoic consent management in **Settings → Privacy → Consent Management**,
   and supply the required privacy policy URL and Ezoic wording. The SDK uses
   Gatekeeper by default. Do not also inject another CMP. If retaining another
   CMP, explicitly change the provider to `consent="third-party"` and select that
   CMP in the dashboard.
5. Configure Google Ad Manager MCM in **EzoicAds → Ad Transparency** after ads.txt
   is live. Accept Google's invitation and check both account and domain approval.
   An existing Ezoic account alone does not confirm site approval.
6. Optionally link AdSense through Ezoic Mediation. Direct AdSense scripts are
   suppressed when Ezoic is enabled; retain existing seller rows in the manager.

## Deployment

The two flags are independent because ads.txt must be live before MCM approval:

| Build variable                      | Default         | Effect                                                                                              |
| ----------------------------------- | --------------- | --------------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_EZOIC_ADS_TXT_ENABLED` | unset / `false` | Set `true` to return a 301 from `/ads.txt` to the managed file.                                     |
| `NEXT_PUBLIC_EZOIC_ENABLED`         | unset / `false` | Set `true` to load the Ezoic provider and show article placements; disables direct AdSense loading. |

Set these in the website's Infisical application environment used by the GitHub
Actions build. For local work, use `website/.env.local`. Rebuild the website image
after changing either flag. To connect the site, set `NEXT_PUBLIC_EZOIC_ENABLED=true`, rebuild, and deploy
the website, then run the connection check in Ezoic. This loads the SDK and
requests article placements; actual ad fill can remain pending during approval.
Leave `NEXT_PUBLIC_EZOIC_ADS_TXT_ENABLED=false` until Ezoic publishes the managed
file and its URL returns seller records, then enable that flag and redeploy.
Complete MCM after ads.txt is live. No production flags or dashboard settings were changed during code
setup.

The provider manages script order and SPA mode. Article placements use named
`top_of_page` and `bottom_of_page` locations, which allocate runtime IDs; do not
create 900-series placeholder IDs manually. Each placement is keyed by pathname,
so navigating between articles cleans up the departing ad and requests a new
one without an additional pageview hook. Placements appear only in article pages.
Review Ezoic dashboard settings for any site-wide formats and page exclusions.

## Verification

- `curl -I https://techwiki.co.uk/ads.txt` should show 301 and the intended Location.
- `curl -L https://techwiki.co.uk/ads.txt` should return the managed seller list.
- Open a published article with `?ez_js_debugger=1` and inspect the Ezoic debugger.
- Check consent behavior and navigate between two articles without reloading.
  Check mobile and desktop layouts and confirm the old placements are removed.
- Confirm the direct `adsbygoogle.js` script is absent when Ezoic is enabled.
- Local checks can verify rendering and navigation, but actual ad fill requires
  the registered domain and approvals. An ad blocker or no-fill decision can
  prevent an otherwise correctly configured placement from displaying an ad.

To roll back ads, set `NEXT_PUBLIC_EZOIC_ENABLED=false` and rebuild. Manage the
ads.txt flag separately; do not remove authorized seller records unintentionally.

Sources: [official SDK](https://github.com/ezoic/ezoic-react-sdk),
[framework integration](https://docs.ezoic.com/docs/ezoicadsadvanced/framework-sdks/),
and project-specific guidance returned by the Ezoic Setup MCP server.
