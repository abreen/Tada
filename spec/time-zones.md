# Time Zones

Each site has a default time zone set in the config. A client-side time zone
chooser lets visitors select their preferred zone. The selection is stored in
the browser's local storage.

To place the time zone chooser on a page:

```
<%= renderTimeZoneChooser() %>
```

All `<time>` elements on the page are reformatted to display in the chosen time
zone. The chooser detects the existing time format (12-hour with various period
styles, or 24-hour) and preserves it when converting.

If JavaScript is disabled, times are displayed in the site's default time zone.
