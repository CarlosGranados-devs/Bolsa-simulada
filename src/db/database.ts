import initSqlJs, { type Database as SqlJsDatabase, type SqlValue } from "sql.js";
import wasmUrl from "sql.js/dist/sql-wasm.wasm?url";

const IDB_NAME = "bolsa-simulada-sv";
const IDB_STORE = "state";
const IDB_KEY = "sqlite";
const SAVE_DEBOUNCE_MS = 700;
const IDB_TIMEOUT_MS = 1500;

const SCHEMA = `
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS companies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ticker TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    sector TEXT NOT NULL,
    price REAL NOT NULL,
    prev_close REAL NOT NULL,
    volatility REAL NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS price_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    price REAL NOT NULL,
    ts INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_price_history_company_ts
    ON price_history(company_id, ts);

  CREATE TABLE IF NOT EXISTS holdings (
    company_id INTEGER PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
    qty INTEGER NOT NULL CHECK(qty >= 0),
    avg_cost REAL NOT NULL
  );

  CREATE TABLE IF NOT EXISTS trades (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id INTEGER REFERENCES companies(id) ON DELETE SET NULL,
    ticker TEXT NOT NULL,
    side TEXT NOT NULL CHECK(side IN ('BUY', 'SELL')),
    qty INTEGER NOT NULL CHECK(qty > 0),
    price REAL NOT NULL,
    ts INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS account (
    id INTEGER PRIMARY KEY CHECK(id = 1),
    cash REAL NOT NULL,
    initial_cash REAL NOT NULL
  );

  CREATE TABLE IF NOT EXISTS news (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE,
    headline TEXT NOT NULL,
    impact REAL NOT NULL,
    ts INTEGER NOT NULL
  );
`;

interface SeedCompany {
  ticker: string;
  name: string;
  sector: string;
  price: number;
  volatility: number;
}

const SEED_COMPANIES: SeedCompany[] = [
  { ticker: "PPSA", name: "Pupusas S.A.", sector: "Alimentos", price: 34.8, volatility: 0.012 },
  { ticker: "B101", name: "Bus 101 Holdings", sector: "Transporte", price: 18.45, volatility: 0.016 },
  { ticker: "CCAF", name: "Café Cuscatlán", sector: "Bebidas", price: 52.3, volatility: 0.011 },
  { ticker: "VLCN", name: "Volcán Energy", sector: "Energía", price: 87.6, volatility: 0.022 },
  { ticker: "SURF", name: "Surf City Resorts", sector: "Turismo", price: 64.2, volatility: 0.026 },
  { ticker: "TRGZ", name: "Torogoz Airlines", sector: "Aviación", price: 29.9, volatility: 0.024 },
  { ticker: "IZTK", name: "Izalco Tech", sector: "Tecnología", price: 112.4, volatility: 0.03 },
  { ticker: "LAGO", name: "Lago Ilopango Water", sector: "Servicios", price: 12.75, volatility: 0.009 },
];

const SEED_NEWS: Array<{ ticker: string; headline: string; impact: number; minutesAgo: number }> = [
  {
    ticker: "PPSA",
    headline: "Pupusas S.A. reporta ventas récord en el oriente del país",
    impact: 0.045,
    minutesAgo: 92,
  },
  {
    ticker: "CCAF",
    headline: "Café Cuscatlán anuncia una nueva cosecha de altura",
    impact: 0.038,
    minutesAgo: 74,
  },
  {
    ticker: "VLCN",
    headline: "Volcán Energy firma contrato de energía geotérmica",
    impact: 0.062,
    minutesAgo: 55,
  },
  {
    ticker: "SURF",
    headline: "Surf City Resorts supera las expectativas de ocupación",
    impact: 0.051,
    minutesAgo: 41,
  },
  {
    ticker: "TRGZ",
    headline: "Torogoz Airlines suma una nueva ruta regional",
    impact: 0.033,
    minutesAgo: 26,
  },
  {
    ticker: "B101",
    headline: "Bus 101 Holdings reporta retrasos por mantenimiento",
    impact: -0.028,
    minutesAgo: 13,
  },
  {
    ticker: "IZTK",
    headline: "Izalco Tech presenta su plataforma de pagos",
    impact: 0.058,
    minutesAgo: 5,
  },
];

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function openIndexedDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (database: IDBDatabase | null): void => {
      if (settled) {
        return;
      }
      settled = true;
      resolve(database);
    };

    try {
      if (typeof indexedDB === "undefined") {
        finish(null);
        return;
      }
      window.setTimeout(() => finish(null), IDB_TIMEOUT_MS);
      const request = indexedDB.open(IDB_NAME, 1);
      request.onupgradeneeded = () => {
        try {
          const database = request.result;
          if (!database.objectStoreNames.contains(IDB_STORE)) {
            database.createObjectStore(IDB_STORE);
          }
        } catch {
          finish(null);
        }
      };
      request.onsuccess = () => finish(request.result);
      request.onerror = () => finish(null);
      request.onblocked = () => finish(null);
    } catch {
      finish(null);
    }
  });
}

async function readStoredDatabase(): Promise<Uint8Array | null> {
  const database = await openIndexedDb();
  if (!database) {
    return null;
  }

  return new Promise((resolve) => {
    let settled = false;
    const finish = (value: Uint8Array | null): void => {
      if (settled) {
        return;
      }
      settled = true;
      resolve(value);
    };
    window.setTimeout(() => finish(null), IDB_TIMEOUT_MS);

    try {
      const transaction = database.transaction(IDB_STORE, "readonly");
      const request = transaction.objectStore(IDB_STORE).get(IDB_KEY);
      request.onsuccess = () => {
        const value: unknown = request.result;
        try {
          database.close();
        } catch {
          // La base local ya no está disponible.
        }
        if (value instanceof Uint8Array) {
          finish(value);
          return;
        }
        if (value instanceof ArrayBuffer) {
          finish(new Uint8Array(value));
          return;
        }
        finish(null);
      };
      request.onerror = () => {
        try {
          database.close();
        } catch {
          // La base local ya no está disponible.
        }
        finish(null);
      };
    } catch {
      try {
        database.close();
      } catch {
        // La base local ya no está disponible.
      }
      finish(null);
    }
  });
}

async function writeStoredDatabase(bytes: Uint8Array): Promise<boolean> {
  const database = await openIndexedDb();
  if (!database) {
    return false;
  }

  return new Promise((resolve) => {
    let settled = false;
    const finish = (success: boolean): void => {
      if (settled) {
        return;
      }
      settled = true;
      resolve(success);
    };
    window.setTimeout(() => finish(false), IDB_TIMEOUT_MS);

    try {
      const transaction = database.transaction(IDB_STORE, "readwrite");
      transaction.objectStore(IDB_STORE).put(bytes, IDB_KEY);
      transaction.oncomplete = () => {
        try {
          database.close();
        } catch {
          // La base local ya no está disponible.
        }
        finish(true);
      };
      transaction.onerror = () => {
        try {
          database.close();
        } catch {
          // La base local ya no está disponible.
        }
        finish(false);
      };
      transaction.onabort = () => {
        try {
          database.close();
        } catch {
          // La base local ya no está disponible.
        }
        finish(false);
      };
    } catch {
      try {
        database.close();
      } catch {
        // La base local ya no está disponible.
      }
      finish(false);
    }
  });
}

export class Database {
  private readonly sql: SqlJsDatabase;
  private readonly lifecycleHandler: () => void;
  private saveTimer: number | null = null;
  private dirty = false;
  private saving = false;
  private transactionDepth = 0;

  private constructor(sql: SqlJsDatabase) {
    this.sql = sql;
    this.lifecycleHandler = () => {
      void this.persistNow();
    };
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", this.onVisibilityChange);
      window.addEventListener("pagehide", this.lifecycleHandler);
    }
  }

  static async create(): Promise<Database> {
    const SQL = await initSqlJs({
      locateFile: () => wasmUrl,
    });

    const stored = await readStoredDatabase();
    let sql: SqlJsDatabase;
    let isNew = false;

    if (stored) {
      try {
        sql = new SQL.Database(stored);
      } catch {
        sql = new SQL.Database();
        isNew = true;
      }
    } else {
      sql = new SQL.Database();
      isNew = true;
    }

    const database = new Database(sql);
    database.sql.exec(SCHEMA);
    database.sql.run("PRAGMA foreign_keys = ON;");

    const account = database.get<{ total: number }>("SELECT COUNT(*) AS total FROM account");
    if (isNew || !account || Number(account.total) === 0) {
      if (isNew) {
        database.seed();
      } else {
        database.run(
          "INSERT INTO account (id, cash, initial_cash) VALUES (1, 10000, 10000)",
        );
      }
    }

    if (isNew) {
      await database.persistNow(true);
    }

    return database;
  }

  private readonly onVisibilityChange = (): void => {
    if (document.visibilityState === "hidden") {
      void this.persistNow();
    }
  };

  all<T>(query: string, params: SqlValue[] = []): T[] {
    const statement = this.sql.prepare(query);
    try {
      if (params.length > 0) {
        statement.bind(params);
      }
      const rows: T[] = [];
      while (statement.step()) {
        rows.push(statement.getAsObject() as unknown as T);
      }
      return rows;
    } finally {
      statement.free();
    }
  }

  get<T>(query: string, params: SqlValue[] = []): T | null {
    const rows = this.all<T>(query, params);
    return rows.length > 0 ? rows[0]! : null;
  }

  run(query: string, params: SqlValue[] = []): void {
    this.sql.run(query, params);
    this.markDirty();
  }

  transaction<T>(operation: () => T): T {
    if (this.transactionDepth > 0) {
      return operation();
    }

    this.sql.run("BEGIN");
    this.transactionDepth += 1;
    try {
      const result = operation();
      this.sql.run("COMMIT");
      this.transactionDepth -= 1;
      this.markDirty();
      return result;
    } catch (error) {
      this.transactionDepth = Math.max(0, this.transactionDepth - 1);
      try {
        this.sql.run("ROLLBACK");
      } catch {
        // La transacción ya fue descartada por SQLite.
      }
      throw error;
    }
  }

  reset(): void {
    this.transaction(() => {
      this.sql.run("DELETE FROM trades");
      this.sql.run("DELETE FROM news");
      this.sql.run("DELETE FROM holdings");
      this.sql.run("DELETE FROM price_history");
      this.sql.run("DELETE FROM companies");
      this.sql.run("DELETE FROM account");
      this.sql.run(
        "DELETE FROM sqlite_sequence WHERE name IN ('companies', 'price_history', 'trades', 'news')",
      );
      this.seed();
    });
    this.markDirty();
    void this.persistNow();
  }

  async persistNow(force = false): Promise<void> {
    if (this.saveTimer !== null) {
      window.clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    if (!force && !this.dirty) {
      return;
    }
    if (this.saving) {
      this.dirty = true;
      return;
    }

    this.dirty = false;
    this.saving = true;
    try {
      const bytes = this.sql.export();
      await writeStoredDatabase(bytes);
    } catch {
      // IndexedDB puede no estar disponible; se continúa en memoria.
    } finally {
      this.saving = false;
      if (this.dirty) {
        this.scheduleSave();
      }
    }
  }

  dispose(): void {
    if (typeof document !== "undefined") {
      document.removeEventListener("visibilitychange", this.onVisibilityChange);
      window.removeEventListener("pagehide", this.lifecycleHandler);
    }
    if (this.saveTimer !== null) {
      window.clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    this.sql.close();
  }

  private markDirty(): void {
    this.dirty = true;
    this.scheduleSave();
  }

  private scheduleSave(): void {
    if (this.saveTimer !== null) {
      window.clearTimeout(this.saveTimer);
    }
    this.saveTimer = window.setTimeout(() => {
      this.saveTimer = null;
      void this.persistNow();
    }, SAVE_DEBOUNCE_MS);
  }

  private seed(): void {
    this.transaction(() => {
      const nowSeconds = Math.floor(Date.now() / 1000);
      const createdAt = new Date().toISOString();

      for (const company of SEED_COMPANIES) {
        this.sql.run(
          `INSERT INTO companies (ticker, name, sector, price, prev_close, volatility, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            company.ticker,
            company.name,
            company.sector,
            company.price,
            company.price,
            company.volatility,
            createdAt,
          ],
        );
        const row = this.get<{ id: number }>("SELECT last_insert_rowid() AS id");
        const companyId = Number(row?.id ?? 0);
        if (companyId === 0) {
          continue;
        }

        const history: number[] = [company.price];
        for (let index = 1; index < 120; index += 1) {
          const latest = history[history.length - 1]!;
          const shock = (Math.random() * 2 - 1) * company.volatility * 0.55;
          const previous = Math.max(0.5, round2(latest / (1 + shock)));
          history.push(previous);
        }
        history.reverse();

        const start = nowSeconds - 119 * 60;
        for (let index = 0; index < history.length; index += 1) {
          this.sql.run(
            "INSERT INTO price_history (company_id, price, ts) VALUES (?, ?, ?)",
            [companyId, history[index]!, start + index * 60],
          );
        }

        this.sql.run("UPDATE companies SET prev_close = ? WHERE id = ?", [
          history[0]!,
          companyId,
        ]);
      }

      for (const item of SEED_NEWS) {
        const company = this.get<{ id: number }>(
          "SELECT id FROM companies WHERE ticker = ?",
          [item.ticker],
        );
        if (company) {
          this.sql.run(
            "INSERT INTO news (company_id, headline, impact, ts) VALUES (?, ?, ?, ?)",
            [
              Number(company.id),
              item.headline,
              item.impact,
              nowSeconds - item.minutesAgo * 60,
            ],
          );
        }
      }

      this.sql.run(
        "INSERT INTO account (id, cash, initial_cash) VALUES (1, 10000, 10000)",
      );
    });
  }
}
