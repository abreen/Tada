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
styles, or 24-hour) and preserves it when converting. AM/PM periods use
OpenType small-cap glyphs for both uppercase and lowercase letters when the
active font provides them. Synthetic small caps are disabled, so a font without
the necessary glyphs retains ordinary capitals rather than showing scaled-down
counterfeits. The chooser select is explicitly labeled for assistive
technology, and the reset button is removed from keyboard and screen-reader
access whenever the current selection already matches the site's default time
zone. Converted times that display an AM/PM period show the selected time-zone
abbreviation inline after that period and before any next-day or previous-day
note. A time range shows the abbreviation only after its final endpoint. Its
first endpoint keeps the period compact when both converted endpoints share
one, but displays the period when the converted range crosses noon or midnight.
Each time's title retains the original time and default-zone abbreviation.

If JavaScript is disabled, times are displayed in the site's default time zone.
