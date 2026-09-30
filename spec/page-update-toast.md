# Page Update Toast

Tada includes a client-side page update toast that checks whether the current
page has changed on the server and offers an in-place refresh.

## Detection

The browser periodically sends a `HEAD` request for the current page URL,
including the query string and excluding any hash fragment.

The toast relies on standard HTTP freshness validators exposed by the server,
such as `ETag` or `Last-Modified`. If the page does not provide usable
validators, the toast stays inactive.

Initial page load performs a HEAD to establish the baseline. Successful SPA
navigation (including Back/Forward and in-place refresh) adopts the HTML GET's
`ETag` and `Last-Modified` as its baseline and schedules the next normal poll,
without an immediate HEAD. If the GET lacks usable validators, the next scheduled
check establishes a baseline. Navigation discards checks started before it,
including an A → B → A sequence, and cancels queued baseline checks superseded
by the GET.

The first successful check establishes the current version of the page without
showing any UI. A later successful check that indicates the server has a newer
version causes the toast to appear.

Polling runs only while the document is visible. When the page becomes hidden,
the client stops polling. When it becomes visible again, it immediately issues
a new `HEAD` request and then resumes periodic checks.

## UI

When a newer version is detected, the page shows a persistent floating toast
near the bottom of the viewport.

The toast is dismissable and remains hidden for the same detected validator
after dismissal. If the server later reports a different newer validator, the
toast appears again.

## Refresh behavior

Choosing `Reload` refreshes the current page through Tada's client-side
navigation pipeline instead of using a full browser reload.

If the refresh fetch fails or the response is not a Tada page, Tada falls back
to a normal navigation to the current URL.
