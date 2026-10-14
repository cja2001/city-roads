const numberFormat = new Intl.NumberFormat('es');

export function formatNumber(x) {
  if (!Number.isFinite(x)) return '—';
  return numberFormat.format(x);
}

export function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return '—';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1).replace('.', ',') + ' KB';
  return (bytes / 1024 / 1024).toFixed(1).replace('.', ',') + ' MB';
}

export function formatDistance(meters) {
  if (!Number.isFinite(meters)) return '—';
  if (meters >= 1000) return (meters / 1000).toFixed(meters >= 10000 ? 0 : 1).replace('.', ',') + ' km';
  return Math.round(meters) + ' m';
}

export function formatArea(m2) {
  if (!Number.isFinite(m2)) return '—';
  if (m2 >= 1e6) return (m2 / 1e6).toFixed(2).replace('.', ',') + ' km²';
  if (m2 >= 1e4) return (m2 / 1e4).toFixed(2).replace('.', ',') + ' ha';
  return formatNumber(Math.round(m2)) + ' m²';
}

export function formatCoordinate(value, positive, negative) {
  if (!Number.isFinite(value)) return '—';
  return Math.abs(value).toFixed(5) + '° ' + (value >= 0 ? positive : negative);
}
