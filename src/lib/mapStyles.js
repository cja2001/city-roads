import tinycolor from 'tinycolor2';

/**
 * Colors of the map itself for the light and dark modes. Streets are strong
 * and neutral, parcels thin and discreet, and cyan is kept for the selection.
 */
export const MAP_STYLES = {
  light: {
    background: '#F4F1EA',
    roads: 'rgba(11, 20, 36, 0.85)',
    parcels: 'rgba(217, 119, 6, 0.6)',
    labels: '#0B1424',
    title: '#0B1424',
    baseMap: 'overture'
  },
  dark: {
    background: '#0B1424',
    roads: 'rgba(226, 232, 240, 0.82)',
    parcels: 'rgba(251, 191, 36, 0.5)',
    labels: '#E2E8F0',
    title: '#F1F5F9',
    baseMap: 'none'
  }
};

export const SELECTION_COLOR = '#4DE1D2';

let current = 'light';

export function setMapStyle(name) {
  if (MAP_STYLES[name]) current = name;
}

export function getMapStyleName() {
  return current;
}

export function getMapStyle(name) {
  return MAP_STYLES[name || current];
}

export function color(key, name) {
  return tinycolor(getMapStyle(name)[key]);
}
