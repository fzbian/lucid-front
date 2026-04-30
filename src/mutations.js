// Simple mutation notifier to inform other views that data changed
export function notifyMutation() {
  try {
    const key = 'atm_mutation';
    localStorage.setItem(key, String(Date.now()));
    if (typeof window !== 'undefined' && window.dispatchEvent) {
      const ev = new CustomEvent('atm:mutation');
      window.dispatchEvent(ev);
    }
  } catch {
    // ignore storage errors (private mode, etc.)
  }
}
