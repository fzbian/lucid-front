export function formatCLP(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return String(value ?? '');
  return `$${n.toLocaleString('es-CL')}`;
}
