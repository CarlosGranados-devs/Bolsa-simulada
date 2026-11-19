import type { Database } from "../db/database";
import { round2, validateCompanyInput } from "./validation";
import { ValidationError } from "./validation";
import type { Company, CompanyInput, DelistResult, PricePoint } from "./types";

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

function mapCompany(row: CompanyRow): Company {
  return {
    id: Number(row.id),
    ticker: row.ticker,
    name: row.name,
    sector: row.sector,
    price: Number(row.price),
    prev_close: Number(row.prev_close),
    volatility: Number(row.volatility),
    created_at: row.created_at,
  };
}

export class CompanyModel {
  constructor(private readonly db: Database) {}

  list(): Company[] {
    const rows = this.db.all<CompanyRow>("SELECT * FROM companies ORDER BY ticker ASC");
    return rows.map(mapCompany);
  }

  find(id: number): Company | null {
    const row = this.db.get<CompanyRow>("SELECT * FROM companies WHERE id = ?", [id]);
    return row ? mapCompany(row) : null;
  }

  findByTicker(ticker: string): Company | null {
    const row = this.db.get<CompanyRow>("SELECT * FROM companies WHERE ticker = ?", [ticker]);
    return row ? mapCompany(row) : null;
  }

  history(companyId: number): PricePoint[] {
    const rows = this.db.all<{ price: number; ts: number }>(
      "SELECT price, ts FROM price_history WHERE company_id = ? ORDER BY ts ASC, id ASC",
      [companyId],
    );
    let lastTime = 0;
    return rows.map((row) => {
      const rawTime = Number(row.ts);
      const time = rawTime > lastTime ? rawTime : lastTime + 1;
      lastTime = time;
      return { time, value: Number(row.price) };
    });
  }

  create(input: CompanyInput): Company {
    const normalized = validateCompanyInput(input);

    return this.db.transaction(() => {
      if (this.findByTicker(normalized.ticker)) {
        throw new ValidationError(`El ticker ${normalized.ticker} ya está registrado.`);
      }

      const createdAt = new Date().toISOString();
      this.db.run(
        `INSERT INTO companies (ticker, name, sector, price, prev_close, volatility, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          normalized.ticker,
          normalized.name,
          normalized.sector,
          normalized.price,
          normalized.price,
          normalized.volatility,
          createdAt,
        ],
      );

      const inserted = this.db.get<{ id: number }>("SELECT last_insert_rowid() AS id");
      const id = Number(inserted?.id ?? 0);
      if (id === 0) {
        throw new ValidationError("No se pudo registrar la empresa.");
      }

      this.db.run(
        "INSERT INTO price_history (company_id, price, ts) VALUES (?, ?, ?)",
        [id, normalized.price, Math.floor(Date.now() / 1000)],
      );

      return {
        id,
        ticker: normalized.ticker,
        name: normalized.name,
        sector: normalized.sector,
        price: normalized.price,
        prev_close: normalized.price,
        volatility: normalized.volatility,
        created_at: createdAt,
      };
    });
  }

  update(id: number, input: CompanyInput): Company {
    const normalized = validateCompanyInput(input);

    return this.db.transaction(() => {
      const current = this.find(id);
      if (!current) {
        throw new ValidationError("La empresa ya no existe en el mercado.");
      }
      const duplicate = this.findByTicker(normalized.ticker);
      if (duplicate && duplicate.id !== id) {
        throw new ValidationError(`El ticker ${normalized.ticker} ya está registrado.`);
      }

      const priceChanged = Math.abs(current.price - normalized.price) >= 0.01;
      const prevClose = priceChanged ? normalized.price : current.prev_close;

      this.db.run(
        `UPDATE companies
         SET ticker = ?, name = ?, sector = ?, price = ?, prev_close = ?, volatility = ?
         WHERE id = ?`,
        [
          normalized.ticker,
          normalized.name,
          normalized.sector,
          normalized.price,
          prevClose,
          normalized.volatility,
          id,
        ],
      );

      if (priceChanged) {
        this.db.run(
          "INSERT INTO price_history (company_id, price, ts) VALUES (?, ?, ?)",
          [id, normalized.price, Math.floor(Date.now() / 1000)],
        );
        this.trimHistory(id);
      }

      return {
        ...current,
        ticker: normalized.ticker,
        name: normalized.name,
        sector: normalized.sector,
        price: normalized.price,
        prev_close: prevClose,
        volatility: normalized.volatility,
      };
    });
  }

  delist(id: number): DelistResult {
    return this.db.transaction(() => {
      const company = this.find(id);
      if (!company) {
        throw new ValidationError("La empresa ya no existe en el mercado.");
      }

      const holding = this.db.get<{ qty: number; avg_cost: number }>(
        "SELECT qty, avg_cost FROM holdings WHERE company_id = ?",
        [id],
      );
      const qty = holding ? Number(holding.qty) : 0;
      const proceeds = qty > 0 ? round2(qty * company.price) : 0;

      if (qty > 0) {
        this.db.run("UPDATE account SET cash = ROUND(cash + ?, 2) WHERE id = 1", [proceeds]);
        this.db.run(
          `INSERT INTO trades (company_id, ticker, side, qty, price, ts)
           VALUES (?, ?, 'SELL', ?, ?, ?)`,
          [id, company.ticker, qty, company.price, Math.floor(Date.now() / 1000)],
        );
      }

      this.db.run("DELETE FROM holdings WHERE company_id = ?", [id]);
      this.db.run("DELETE FROM price_history WHERE company_id = ?", [id]);
      this.db.run("DELETE FROM news WHERE company_id = ?", [id]);
      this.db.run("DELETE FROM companies WHERE id = ?", [id]);

      return { company, liquidatedQty: qty, proceeds };
    });
  }

  private trimHistory(companyId: number): void {
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
