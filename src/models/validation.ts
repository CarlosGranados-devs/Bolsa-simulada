import type { CompanyInput } from "./types";

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function normalizeTicker(raw: string): string {
  return raw.trim().toUpperCase();
}

export function validateTicker(ticker: string): string {
  const normalized = normalizeTicker(ticker);
  if (!/^[A-Z]{2,5}$/.test(normalized)) {
    throw new ValidationError("El ticker debe tener entre 2 y 5 letras mayúsculas, sin números ni símbolos.");
  }
  return normalized;
}

export function validateCompanyInput(input: CompanyInput): CompanyInput {
  const ticker = validateTicker(input.ticker);
  const name = input.name.trim();
  if (name.length < 2) {
    throw new ValidationError("El nombre de la empresa debe tener al menos 2 caracteres.");
  }
  if (name.length > 48) {
    throw new ValidationError("El nombre de la empresa no puede superar los 48 caracteres.");
  }
  if (!Number.isFinite(input.price) || input.price <= 0) {
    throw new ValidationError("El precio inicial debe ser un número mayor que cero.");
  }
  if (input.price > 100000) {
    throw new ValidationError("El precio inicial no puede superar los 100000 USD.");
  }
  if (!Number.isFinite(input.volatility) || input.volatility < 0.1 || input.volatility > 8) {
    throw new ValidationError("La volatilidad debe estar entre 0.1% y 8%.");
  }

  return {
    ticker,
    name,
    sector: input.sector.trim() || "Servicios",
    price: round2(input.price),
    volatility: input.volatility / 100,
  };
}

export function validateQuantity(raw: number): number {
  if (!Number.isInteger(raw) || raw < 1) {
    throw new ValidationError("La cantidad debe ser un número entero mayor o igual a 1.");
  }
  if (raw > 1000000) {
    throw new ValidationError("La cantidad máxima por operación es 1000000 de acciones.");
  }
  return raw;
}
