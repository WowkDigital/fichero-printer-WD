// Small UI helpers: DOM shortcuts, toasts, slider fill, settings persistence

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

const TOAST_ICONS = { success: 'i-check', error: 'i-alert', warn: 'i-alert', info: 'i-info' };

/**
 * Shows a non-blocking notification.
 * @param {string} message
 * @param {{type?: 'success'|'error'|'warn'|'info', duration?: number}} [opts]
 */
export function toast(message, { type = 'info', duration = 3500 } = {}) {
  const host = document.getElementById('toasts');
  if (!host) return;
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.setAttribute('role', type === 'error' ? 'alert' : 'status');
  el.innerHTML = `<svg class="ic"><use href="#${TOAST_ICONS[type] || 'i-info'}"/></svg><span></span>`;
  el.querySelector('span').textContent = message;
  host.appendChild(el);

  // Keep at most 3 toasts on screen
  while (host.children.length > 3) host.firstElementChild.remove();

  const remove = () => {
    el.classList.add('leaving');
    el.addEventListener('animationend', () => el.remove(), { once: true });
  };
  const t = setTimeout(remove, duration);
  el.addEventListener('click', () => {
    clearTimeout(t);
    remove();
  });
}

/** Paints the filled part of a range slider track (WebKit/Blink). */
export function paintRange(input) {
  const min = parseFloat(input.min) || 0;
  const max = parseFloat(input.max) || 100;
  const val = parseFloat(input.value);
  const pct = ((val - min) / (max - min)) * 100;
  input.style.setProperty('--fill', `${pct}%`);
}

/** Marks one button of a group as active (and sets aria-checked / aria-selected). */
export function setActive(buttons, predicate) {
  for (const b of buttons) {
    const on = !!predicate(b);
    b.classList.toggle('active', on);
    if (b.hasAttribute('aria-checked')) b.setAttribute('aria-checked', String(on));
    if (b.hasAttribute('aria-selected')) b.setAttribute('aria-selected', String(on));
  }
}

export function debounce(fn, ms) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

const SETTINGS_KEY = 'fichero-studio-settings-v1';

export function loadSettings() {
  try {
    return JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') || {};
  } catch {
    return {};
  }
}

export function saveSettings(obj) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(obj));
  } catch {
    /* storage full or disabled */
  }
}
