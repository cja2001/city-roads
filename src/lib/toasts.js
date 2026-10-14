import {reactive} from 'vue';

let nextId = 1;

/**
 * Short notifications shown in the corner of the map (extraction finished,
 * file downloaded, errors).
 */
export const toasts = reactive([]);

export function notify(message, options = {}) {
  let toast = {
    id: nextId++,
    message,
    detail: options.detail || '',
    kind: options.kind || 'info' // info | success | error
  };
  toasts.push(toast);
  // Keep the map visible: only the latest few stay on screen.
  while (toasts.length > 3) toasts.shift();
  let timeout = options.timeout === undefined ? (toast.kind === 'error' ? 8000 : 4500) : options.timeout;
  if (timeout) setTimeout(() => dismiss(toast.id), timeout);
  return toast.id;
}

export function dismiss(id) {
  let index = toasts.findIndex(t => t.id === id);
  if (index >= 0) toasts.splice(index, 1);
}
