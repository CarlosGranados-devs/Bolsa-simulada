export function formatMoney(value: number, decimals = 2): string {
  const safe = Number.isFinite(value) ? value : 0;
  const sign = safe < 0 ? "-" : "";
  const absolute = Math.abs(safe).toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return `${sign}$${absolute}`;
}

export function formatSignedMoney(value: number): string {
  const sign = value > 0 ? "+" : value < 0 ? "-" : "";
  return `${sign}${formatMoney(Math.abs(value))}`;
}

export function formatPercent(value: number, decimals = 2): string {
  const safe = Number.isFinite(value) ? value : 0;
  const sign = safe > 0 ? "+" : safe < 0 ? "-" : "";
  return `${sign}${Math.abs(safe).toFixed(decimals)}%`;
}

export function formatPrice(value: number): string {
  return formatMoney(value);
}

export function changePercent(price: number, reference: number): number {
  if (!Number.isFinite(price) || !Number.isFinite(reference) || reference <= 0) {
    return 0;
  }
  return ((price - reference) / reference) * 100;
}

export function trendClass(value: number): string {
  if (value > 0.0001) {
    return "is-up";
  }
  if (value < -0.0001) {
    return "is-down";
  }
  return "is-flat";
}

export function formatClock(date = new Date()): string {
  return date.toLocaleTimeString("es-SV", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

export function formatTime(timestampSeconds: number): string {
  return formatClock(new Date(timestampSeconds * 1000));
}
