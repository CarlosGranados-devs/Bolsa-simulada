export interface Company {
  id: number;
  ticker: string;
  name: string;
  sector: string;
  price: number;
  prev_close: number;
  volatility: number;
  created_at: string;
}

export interface CompanyInput {
  ticker: string;
  name: string;
  sector: string;
  price: number;
  volatility: number;
}

export interface PricePoint {
  time: number;
  value: number;
}

export interface HoldingRow {
  companyId: number;
  ticker: string;
  name: string;
  qty: number;
  avgCost: number;
  price: number;
  value: number;
  cost: number;
  pl: number;
  plPercent: number;
}

export interface Trade {
  id: number;
  company_id: number | null;
  ticker: string;
  side: "BUY" | "SELL";
  qty: number;
  price: number;
  ts: number;
}

export interface NewsItem {
  id: number;
  company_id: number | null;
  ticker: string;
  headline: string;
  impact: number;
  ts: number;
}

export interface Account {
  cash: number;
  initialCash: number;
}

export interface PortfolioSnapshot {
  holdings: HoldingRow[];
  cash: number;
  investedValue: number;
  totalValue: number;
  totalPl: number;
  totalPlPercent: number;
}

export interface MarketTick {
  companies: Company[];
  news: NewsItem | null;
}

export interface DelistResult {
  company: Company;
  liquidatedQty: number;
  proceeds: number;
}
