// A package that wraps Leaflet for Tada sites. Its default export is a mount
// function, so a site can list it in scripts as npm:tada-leaflet.
//
// It turns each <div data-leaflet-map="lat,lng,zoom"> into a map. The page
// writes a fallback, such as a link, inside the div for visitors without
// JavaScript.
import 'leaflet/dist/leaflet.css';
import './tada-leaflet.css';

// Leaflet finds its marker icon's URL from a CSS class whose background image
// must end in "marker-icon.png", but Tada adds a hash to the file name
function getMarkerIconUrl(window) {
  const probe = window.document.createElement('div');
  probe.className = 'leaflet-default-icon-path';
  window.document.body.append(probe);
  const image = window.getComputedStyle(probe).backgroundImage;
  probe.remove();
  return image.replace(/^url\(["']?/, '').replace(/["']?\)$/, '');
}

/** @type {import('@abreen/tada').Mount} */
export default async function mount({ window, signal }) {
  const elements = [...window.document.querySelectorAll('[data-leaflet-map]')];
  if (elements.length === 0) {
    return;
  }

  // Only pages with a map download Leaflet
  const { default: L } = await import('leaflet');
  if (signal.aborted) {
    return;
  }

  const icon = L.icon({
    iconUrl: getMarkerIconUrl(window),
    iconSize: [25, 41],
    iconAnchor: [12, 41],
  });

  const maps = elements.map(element => {
    const [lat, lng, zoom] = element.dataset.leafletMap.split(',').map(Number);
    element.replaceChildren();
    element.classList.add('tada-leaflet-map');
    const map = L.map(element).setView([lat, lng], zoom);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map);
    L.marker([lat, lng], { icon }).addTo(map);
    return map;
  });

  return () => {
    for (const map of maps) {
      map.remove();
    }
  };
}
