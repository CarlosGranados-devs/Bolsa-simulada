import type { Database } from "../db/database";
import type { MarketTick, NewsItem } from "./types";
import { round2 } from "./validation";

const POSITIVE_HEADLINES = [
  (name: string) => `${name} supera las expectativas del mercado`,
  (name: string, sector: string) => `${name} anuncia una expansión en el sector ${sector}`,
  (name: string) => `Inversionistas aumentan su interés en ${name}`,
  (name: string) => `${name} firma un contrato clave para su crecimiento`,
  (name: string) => `Analistas elevan la perspectiva de ${name}`,
];

const NEGATIVE_HEADLINES = [
  (name: string) => `${name} revisa a la baja sus proyecciones del trimestre`,
  (name: string, sector: string) => `Presión en ${sector}: ${name} reporta costos más altos`,
  (name: string) => `Reguladores abren una revisión a ${name}`,
  (name: string) => `${name} registra ventas menores a las esperadas`,
  (name: string, sector: string) => `Incertidumbre en ${sector} golpea a ${name}`,
];

interface CompanyRow {
  id: number;
  ticker: string;
  name: string;
  sector: string;
  price: number;
  prev_close: number;
  volatility: number;
  created_at: string;
}

export class MarketModel {
  constructor(private readonly db: Database) {}

  tick(): MarketTick {
    return this.db.transaction(() => {
      const companies = this.db.all<CompanyRow>(
        "SELECT * FROM companies ORDER BY ticker ASC",
      );
      const now = Math.floor(Date.now() / 1000);

      for (const company of companies) {
        const price = Number(company.price);
        const anchor = Number(company.prev_close) > 0 ? Number(company.prev_close) : price;
        const volatility = Number(company.volatility);
        const reversion = ((anchor - price) / Math.max(anchor, 0.01)) * 0.004;
        const shock = (Math.random() * 2 - 1) * volatility;
        const change = Math.max(-0.12, Math.min(0.12, reversion + shock));
        const nextPrice = Math.max(0.5, round2(price * (1 + change)));

        this.db.run("UPDATE companies SET price = ? WHERE id = ?", [
          nextPrice,
          Number(company.id),
        ]);
        this.appendPoint(Number(company.id), nextPrice, now);
      }

      let news: NewsItem | null = null;
      if (companies.length > 0 && Math.random() < 0.05) {
        news = this.createNews(companies, now);
      }

      const updated = this.db.all<CompanyRow>(
        "SELECT * FROM companies ORDER BY ticker ASC",
      );
      return {
        companies: updated.map((company) => ({
          id: Number(company.id),
          ticker: company.ticker,
          name: company.name,
          sector: company.sector,
          price: Number(company.price),
          prev_close: Number(company.prev_close),
          volatility: Number(company.volatility),
          created_at: company.created_at,
        })),
        news,
      };
    });
  }

  private createNews(companies: CompanyRow[], now: number): NewsItem {
    const index = Math.floor(Math.random() * companies.length);
    const company = companies[index]!;
    const isPositive = Math.random() >= 0.42;
    const magnitude = 0.03 + Math.random() * 0.05;
    const impact = isPositive ? magnitude : -magnitude;
    const templates = isPositive ? POSITIVE_HEADLINES : NEGATIVE_HEADLINES;
    const template = templates[Math.floor(Math.random() * templates.length)]!;
    const headline = template(company.name, company.sector);

    const current = this.db.get<{ price: number }>(
      "SELECT price FROM companies WHERE id = ?",
      [company.id],
    );
    const currentPrice = Number(current?.price ?? company.price);
    const nextPrice = Math.max(0.5, round2(currentPrice * (1 + impact)));

    this.db.run("UPDATE companies SET price = ? WHERE id = ?", [
      nextPrice,
      Number(company.id),
    ]);
    this.appendPoint(Number(company.id), nextPrice, now + 1);

    this.db.run(
      "INSERT INTO news (company_id, headline, impact, ts) VALUES (?, ?, ?, ?)",
      [Number(company.id), headline, impact, now],
    );
    const inserted = this.db.get<{ id: number }>("SELECT last_insert_rowid() AS id");

    return {
      id: Number(inserted?.id ?? 0),
      company_id: Number(company.id),
      ticker: company.ticker,
      headline,
      impact,
      ts: now,
    };
  }

  private appendPoint(companyId: number, price: number, requestedTime: number): void {
    const last = this.db.get<{ ts: number }>(
      "SELECT ts FROM price_history WHERE company_id = ? ORDER BY ts DESC, id DESC LIMIT 1",
      [companyId],
    );
    const time = Math.max(requestedTime, Number(last?.ts ?? 0) + 1);

    this.db.run(
      "INSERT INTO price_history (company_id, price, ts) VALUES (?, ?, ?)",
      [companyId, price, time],
    );
    this.db.run(
      `DELETE FROM price_history
       WHERE company_id = ?
         AND id NOT IN (
           SELECT id FROM price_history
           WHERE company_id = ?
           ORDER BY ts DESC, id DESC
           LIMIT 500
         )`,
      [companyId, companyId],
    );
  }
}
