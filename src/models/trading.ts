import type { Database } from "../db/database";
import type { Account, HoldingRow, PortfolioSnapshot, Trade } from "./types";
import { round2, validateQuantity, ValidationError } from "./validation";

interface HoldingQueryRow {
  company_id: number;
  qty: number;
  avg_cost: number;
  ticker: string;
  name: string;
  price: number;
}

interface TradeRow {
  id: number;
  company_id: number | null;
  ticker: string;
  side: "BUY" | "SELL";
  qty: number;
  price: number;
  ts: number;
}

function mapTrade(row: TradeRow): Trade {
  return {
    id: Number(row.id),
    company_id: row.company_id === null ? null : Number(row.company_id),
    ticker: row.ticker,
    side: row.side,
    qty: Number(row.qty),
    price: Number(row.price),
    ts: Number(row.ts),
  };
}

export class TradingModel {
  constructor(private readonly db: Database) {}

  getAccount(): Account {
    const row = this.db.get<{ cash: number; initial_cash: number }>(
      "SELECT cash, initial_cash FROM account WHERE id = 1",
    );
    return {
      cash: row ? Number(row.cash) : 0,
      initialCash: row ? Number(row.initial_cash) : 0,
    };
  }

  getHolding(companyId: number): { qty: number; avgCost: number } | null {
    const row = this.db.get<{ qty: number; avg_cost: number }>(
      "SELECT qty, avg_cost FROM holdings WHERE company_id = ?",
      [companyId],
    );
    return row ? { qty: Number(row.qty), avgCost: Number(row.avg_cost) } : null;
  }

  buy(companyId: number, rawQty: number): Trade {
    const qty = validateQuantity(rawQty);

    return this.db.transaction(() => {
      const company = this.db.get<{ ticker: string; price: number }>(
        "SELECT ticker, price FROM companies WHERE id = ?",
        [companyId],
      );
      if (!company) {
        throw new ValidationError("Selecciona una empresa válida para comprar.");
      }

      const price = Number(company.price);
      const total = round2(price * qty);
      const account = this.getAccount();
      if (total > account.cash + 0.001) {
        throw new ValidationError(
          `No hay efectivo suficiente: necesitas $${total.toFixed(2)} y tienes $${account.cash.toFixed(2)}.`,
        );
      }

      this.db.run("UPDATE account SET cash = ROUND(cash - ?, 2) WHERE id = 1", [total]);

      const holding = this.getHolding(companyId);
      if (holding) {
        const newQty = holding.qty + qty;
        const newAverage = round2(
          (holding.qty * holding.avgCost + qty * price) / Math.max(newQty, 1),
        );
        this.db.run(
          "UPDATE holdings SET qty = ?, avg_cost = ? WHERE company_id = ?",
          [newQty, newAverage, companyId],
        );
      } else {
        this.db.run(
          "INSERT INTO holdings (company_id, qty, avg_cost) VALUES (?, ?, ?)",
          [companyId, qty, price],
        );
      }

      const ts = Math.floor(Date.now() / 1000);
      this.db.run(
        `INSERT INTO trades (company_id, ticker, side, qty, price, ts)
         VALUES (?, ?, 'BUY', ?, ?, ?)`,
        [companyId, company.ticker, qty, price, ts],
      );
      const inserted = this.db.get<{ id: number }>("SELECT last_insert_rowid() AS id");

      return {
        id: Number(inserted?.id ?? 0),
        company_id: companyId,
        ticker: company.ticker,
        side: "BUY",
        qty,
        price,
        ts,
      };
    });
  }

  sell(companyId: number, rawQty: number): Trade {
    const qty = validateQuantity(rawQty);

    return this.db.transaction(() => {
      const company = this.db.get<{ ticker: string; price: number }>(
        "SELECT ticker, price FROM companies WHERE id = ?",
        [companyId],
      );
      if (!company) {
        throw new ValidationError("Selecciona una empresa válida para vender.");
      }

      const holding = this.getHolding(companyId);
      if (!holding || holding.qty <= 0) {
        throw new ValidationError("No tienes acciones de esta empresa para vender.");
      }
      if (qty > holding.qty) {
        throw new ValidationError(
          `No puedes vender ${qty} acciones: solo tienes ${holding.qty}.`,
        );
      }

      const price = Number(company.price);
      const proceeds = round2(price * qty);
      this.db.run("UPDATE account SET cash = ROUND(cash + ?, 2) WHERE id = 1", [proceeds]);

      const remaining = holding.qty - qty;
      if (remaining === 0) {
        this.db.run("DELETE FROM holdings WHERE company_id = ?", [companyId]);
      } else {
        this.db.run("UPDATE holdings SET qty = ? WHERE company_id = ?", [
          remaining,
          companyId,
        ]);
      }

      const ts = Math.floor(Date.now() / 1000);
      this.db.run(
        `INSERT INTO trades (company_id, ticker, side, qty, price, ts)
         VALUES (?, ?, 'SELL', ?, ?, ?)`,
        [companyId, company.ticker, qty, price, ts],
      );
      const inserted = this.db.get<{ id: number }>("SELECT last_insert_rowid() AS id");

      return {
        id: Number(inserted?.id ?? 0),
        company_id: companyId,
        ticker: company.ticker,
        side: "SELL",
        qty,
        price,
        ts,
      };
    });
  }

  portfolio(): PortfolioSnapshot {
    const rows = this.db.all<HoldingQueryRow>(
      `SELECT h.company_id, h.qty, h.avg_cost, c.ticker, c.name, c.price
       FROM holdings h
       JOIN companies c ON c.id = h.company_id
       WHERE h.qty > 0
       ORDER BY c.ticker ASC`,
    );

    const holdings: HoldingRow[] = rows.map((row) => {
      const qty = Number(row.qty);
      const avgCost = Number(row.avg_cost);
      const price = Number(row.price);
      const value = round2(qty * price);
      const cost = round2(qty * avgCost);
      const pl = round2(value - cost);
      return {
        companyId: Number(row.company_id),
        ticker: row.ticker,
        name: row.name,
        qty,
        avgCost,
        price,
        value,
        cost,
        pl,
        plPercent: cost > 0 ? (pl / cost) * 100 : 0,
      };
    });

    const account = this.getAccount();
    const investedValue = round2(
      holdings.reduce((total, holding) => total + holding.value, 0),
    );
    const totalValue = round2(account.cash + investedValue);
    const totalPl = round2(totalValue - account.initialCash);
    return {
      holdings,
      cash: account.cash,
      investedValue,
      totalValue,
      totalPl,
      totalPlPercent: account.initialCash > 0 ? (totalPl / account.initialCash) * 100 : 0,
    };
  }

  trades(limit = 60): Trade[] {
    const rows = this.db.all<TradeRow>(
      `SELECT id, company_id, ticker, side, qty, price, ts
       FROM trades
       ORDER BY ts DESC, id DESC
       LIMIT ?`,
      [limit],
    );
    return rows.map(mapTrade);
  }
}
