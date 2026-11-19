import type { Database } from "../db/database";
import type { NewsItem } from "./types";

interface NewsRow {
  id: number;
  company_id: number | null;
  ticker: string;
  headline: string;
  impact: number;
  ts: number;
}

export class NewsModel {
  constructor(private readonly db: Database) {}

  list(limit = 8): NewsItem[] {
    const rows = this.db.all<NewsRow>(
      `SELECT n.id, n.company_id, COALESCE(c.ticker, '---') AS ticker,
              n.headline, n.impact, n.ts
       FROM news n
       LEFT JOIN companies c ON c.id = n.company_id
       ORDER BY n.ts DESC, n.id DESC
       LIMIT ?`,
      [limit],
    );

    return rows.map((row) => ({
      id: Number(row.id),
      company_id: row.company_id === null ? null : Number(row.company_id),
      ticker: row.ticker,
      headline: row.headline,
      impact: Number(row.impact),
      ts: Number(row.ts),
    }));
  }
}
