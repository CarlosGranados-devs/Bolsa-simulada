import type {
  Account,
  Company,
  CompanyInput,
  NewsItem,
  PortfolioSnapshot,
  PricePoint,
  Trade,
} from "../models/types";
import { PriceChart } from "./chart";
import {
  changePercent,
  formatClock,
  formatMoney,
  formatPercent,
  formatPrice,
  formatSignedMoney,
  formatTime,
  trendClass,
} from "./format";
import { ConfirmDialog, ToastView, type ConfirmOptions, type ToastTone } from "./notifications";

export type TradeSide = "BUY" | "SELL";

export interface TerminalHandlers {
  onSelectCompany: (companyId: number) => void;
  onEditCompany: (companyId: number) => void;
  onDeleteCompany: (companyId: number) => void;
  onSubmitCompany: (values: CompanyInput) => void;
  onCancelEdit: () => void;
  onOrderSubmit: (side: TradeSide, qty: number) => void;
  onOrderSideChange: (side: TradeSide) => void;
  onResetRequest: () => void;
}

interface CompanyRowRefs {
  row: HTMLTableRowElement;
  price: HTMLTableCellElement;
  change: HTMLTableCellElement;
}

interface TickerRefs {
  price: HTMLSpanElement;
  change: HTMLSpanElement;
}

interface PortfolioRowRefs {
  row: HTMLTableRowElement;
  qty: HTMLTableCellElement;
  average: HTMLTableCellElement;
  value: HTMLTableCellElement;
  pl: HTMLTableCellElement;
}

function byId<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`No se encontró el elemento ${id}`);
  }
  return element as T;
}

export class TerminalView {
  private readonly statCash = byId<HTMLElement>("stat-cash");
  private readonly statPortfolio = byId<HTMLElement>("stat-portfolio");
  private readonly statPl = byId<HTMLElement>("stat-pl");
  private readonly marketClock = byId<HTMLElement>("market-clock");
  private readonly tickerTrack = byId<HTMLElement>("ticker-track");
  private readonly chartContainer = byId<HTMLElement>("chart");
  private readonly chartEmpty = byId<HTMLElement>("chart-empty");
  private readonly chartTitle = byId<HTMLElement>("chart-title");
  private readonly chartPrice = byId<HTMLElement>("chart-price");
  private readonly chartChange = byId<HTMLElement>("chart-change");
  private readonly newsFeed = byId<HTMLUListElement>("news-feed");
  private readonly companiesBody = byId<HTMLTableSectionElement>("companies-body");
  private readonly companiesCount = byId<HTMLElement>("companies-count");
  private readonly orderCompany = byId<HTMLElement>("order-company");
  private readonly sideBuy = byId<HTMLButtonElement>("side-buy");
  private readonly sideSell = byId<HTMLButtonElement>("side-sell");
  private readonly orderForm = byId<HTMLFormElement>("order-form");
  private readonly orderQty = byId<HTMLInputElement>("order-qty");
  private readonly orderPrice = byId<HTMLOutputElement>("order-price");
  private readonly orderAvailable = byId<HTMLElement>("order-available");
  private readonly orderTotal = byId<HTMLElement>("order-total");
  private readonly orderMessage = byId<HTMLElement>("order-message");
  private readonly orderSubmit = byId<HTMLButtonElement>("order-submit");
  private readonly companyForm = byId<HTMLFormElement>("company-form");
  private readonly companyTicker = byId<HTMLInputElement>("company-ticker");
  private readonly companyName = byId<HTMLInputElement>("company-name");
  private readonly companySector = byId<HTMLSelectElement>("company-sector");
  private readonly companyPrice = byId<HTMLInputElement>("company-price");
  private readonly companyVolatility = byId<HTMLInputElement>("company-volatility");
  private readonly companyFormEyebrow = byId<HTMLElement>("company-form-eyebrow");
  private readonly companyFormTitle = byId<HTMLElement>("company-form-title");
  private readonly companyFormMessage = byId<HTMLElement>("company-form-message");
  private readonly companySubmit = byId<HTMLButtonElement>("company-submit");
  private readonly cancelEdit = byId<HTMLButtonElement>("cancel-edit");
  private readonly portfolioBody = byId<HTMLTableSectionElement>("portfolio-body");
  private readonly portfolioEmpty = byId<HTMLElement>("portfolio-empty");
  private readonly portfolioTotal = byId<HTMLElement>("portfolio-total");
  private readonly tradesList = byId<HTMLOListElement>("trades-list");
  private readonly tradesEmpty = byId<HTMLElement>("trades-empty");
  private readonly tradesCount = byId<HTMLElement>("trades-count");
  private readonly resetButton = byId<HTMLButtonElement>("reset-button");
  private readonly toastRegion = byId<HTMLElement>("toast-region");
  private readonly dialog = byId<HTMLDialogElement>("confirm-dialog");
  private readonly dialogTitle = byId<HTMLElement>("dialog-title");
  private readonly dialogMessage = byId<HTMLElement>("dialog-message");
  private readonly dialogConfirm = byId<HTMLButtonElement>("dialog-confirm");

  private readonly chart: PriceChart;
  private readonly toasts: ToastView;
  private readonly confirmDialog: ConfirmDialog;
  private readonly clockTimer: number;

  private selected: Company | null = null;
  private editingId: number | null = null;
  private side: TradeSide = "BUY";
  private initialCash = 0;
  private cash = 0;
  private holdingQty = 0;

  private companyRows = new Map<number, CompanyRowRefs>();
  private tickerRefs = new Map<number, TickerRefs[]>();
  private portfolioRows = new Map<number, PortfolioRowRefs>();
  private lastNewsId = 0;

  constructor(private readonly handlers: TerminalHandlers) {
    this.chart = new PriceChart(this.chartContainer);
    this.toasts = new ToastView(this.toastRegion);
    this.confirmDialog = new ConfirmDialog(
      this.dialog,
      this.dialogTitle,
      this.dialogMessage,
      this.dialogConfirm,
    );

    this.bindEvents();
    this.marketClock.textContent = formatClock();
    this.clockTimer = window.setInterval(() => {
      this.marketClock.textContent = formatClock();
    }, 1000);
  }

  renderCompanies(companies: Company[], selectedId: number | null): void {
    this.companyRows.clear();
    this.companiesBody.replaceChildren();
    this.companiesCount.textContent = String(companies.length);

    if (companies.length === 0) {
      const row = document.createElement("tr");
      const cell = document.createElement("td");
      cell.colSpan = 5;
      cell.className = "table-empty";
      cell.textContent = "No hay empresas en el mercado. Lanza una IPO para empezar.";
      row.append(cell);
      this.companiesBody.append(row);
      this.renderTicker(companies);
      return;
    }

    for (const company of companies) {
      const row = document.createElement("tr");
      row.className = "company-row";
      row.dataset.companyId = String(company.id);
      row.tabIndex = 0;
      row.setAttribute("aria-selected", String(company.id === selectedId));
      if (company.id === selectedId) {
        row.classList.add("is-selected");
      }

      const tickerCell = document.createElement("td");
      const ticker = document.createElement("span");
      ticker.className = "ticker-code";
      ticker.textContent = company.ticker;
      const mobileName = document.createElement("span");
      mobileName.className = "ticker-name";
      mobileName.textContent = company.name;
      tickerCell.append(ticker, mobileName);

      const nameCell = document.createElement("td");
      const name = document.createElement("span");
      name.className = "company-name";
      name.textContent = company.name;
      const sector = document.createElement("span");
      sector.className = "company-sector";
      sector.textContent = company.sector;
      nameCell.append(name, sector);

      const priceCell = document.createElement("td");
      priceCell.className = "num price-cell";
      priceCell.textContent = formatPrice(company.price);

      const percent = changePercent(company.price, company.prev_close);
      const changeCell = document.createElement("td");
      changeCell.className = `num change-cell ${trendClass(percent)}`;
      changeCell.textContent = formatPercent(percent);

      const actionsCell = document.createElement("td");
      actionsCell.className = "actions-col";
      const actions = document.createElement("div");
      actions.className = "row-actions";

      const edit = document.createElement("button");
      edit.type = "button";
      edit.className = "btn btn-mini";
      edit.textContent = "Editar";
      edit.addEventListener("click", (event) => {
        event.stopPropagation();
        this.handlers.onEditCompany(company.id);
      });

      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "btn btn-mini btn-danger-ghost";
      remove.textContent = "Eliminar";
      remove.addEventListener("click", (event) => {
        event.stopPropagation();
        this.handlers.onDeleteCompany(company.id);
      });

      actions.append(edit, remove);
      actionsCell.append(actions);
      row.append(tickerCell, nameCell, priceCell, changeCell, actionsCell);

      row.addEventListener("click", () => this.handlers.onSelectCompany(company.id));
      row.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          this.handlers.onSelectCompany(company.id);
        }
      });

      this.companiesBody.append(row);
      this.companyRows.set(company.id, {
        row,
        price: priceCell,
        change: changeCell,
      });
    }

    this.renderTicker(companies);
  }

  updateMarket(companies: Company[], snapshot: PortfolioSnapshot): void {
    this.cash = snapshot.cash;
    const byIdMap = new Map(companies.map((company) => [company.id, company]));

    for (const company of companies) {
      const refs = this.companyRows.get(company.id);
      if (!refs) {
        continue;
      }
      const percent = changePercent(company.price, company.prev_close);
      refs.price.textContent = formatPrice(company.price);
      refs.change.textContent = formatPercent(percent);
      refs.change.classList.remove("is-up", "is-down", "is-flat");
      refs.change.classList.add(trendClass(percent));
    }

    for (const [companyId, refsList] of this.tickerRefs) {
      const company = byIdMap.get(companyId);
      if (!company) {
        continue;
      }
      const percent = changePercent(company.price, company.prev_close);
      for (const refs of refsList) {
        refs.price.textContent = formatPrice(company.price);
        refs.change.textContent = formatPercent(percent);
        refs.change.classList.remove("is-up", "is-down", "is-flat");
        refs.change.classList.add(trendClass(percent));
      }
    }

    this.updateStats(snapshot);
    this.renderPortfolio(snapshot);

    if (this.selected) {
      const current = byIdMap.get(this.selected.id);
      if (current) {
        this.selected = current;
        this.updateChartQuote(current);
        this.updateOrderContext(snapshot);
      }
    }
  }

  setSelected(company: Company | null, holdingQty: number): void {
    this.selected = company;
    this.holdingQty = holdingQty;
    this.orderMessage.textContent = "";
    this.orderMessage.className = "form-message";

    for (const [companyId, refs] of this.companyRows) {
      const isSelected = company !== null && companyId === company.id;
      refs.row.classList.toggle("is-selected", isSelected);
      refs.row.setAttribute("aria-selected", String(isSelected));
    }

    if (!company) {
      this.chartTitle.textContent = "Selecciona una empresa";
      this.chartPrice.textContent = "--";
      this.chartChange.textContent = "--";
      this.chartChange.className = "muted";
      this.orderCompany.textContent = "Sin selección";
      this.orderCompany.classList.add("muted");
      this.orderPrice.textContent = "--";
      this.orderTotal.textContent = formatMoney(0);
      this.orderAvailable.textContent = "Selecciona una empresa para operar.";
      this.orderSubmit.disabled = true;
      this.chart.clear();
      this.chartEmpty.hidden = false;
      return;
    }

    this.chartTitle.textContent = `${company.ticker} / ${company.name}`;
    this.updateChartQuote(company);
    this.orderCompany.textContent = company.ticker;
    this.orderCompany.classList.remove("muted");
    this.chartEmpty.hidden = true;
    this.updateOrderContext(null);
  }

  setChartData(points: PricePoint[]): void {
    this.chart.setData(points);
    this.chartEmpty.hidden = points.length > 0;
  }

  appendChartPoint(point: PricePoint): void {
    this.chart.update(point);
  }

  setAccount(account: Account): void {
    this.initialCash = account.initialCash;
    this.cash = account.cash;
    this.updateOrderContext(null);
  }

  updateOrderContext(snapshot: PortfolioSnapshot | null): void {
    if (snapshot) {
      this.cash = snapshot.cash;
      if (this.selected) {
        const holding = snapshot.holdings.find(
          (item) => item.companyId === this.selected?.id,
        );
        this.holdingQty = holding ? holding.qty : 0;
      }
    }

    if (!this.selected) {
      this.orderPrice.textContent = "--";
      this.orderTotal.textContent = formatMoney(0);
      this.orderAvailable.textContent = "Selecciona una empresa para operar.";
      this.orderSubmit.disabled = true;
      return;
    }

    this.orderPrice.textContent = formatPrice(this.selected.price);
    this.updateOrderPreview();
  }

  setSide(side: TradeSide): void {
    this.side = side;
    const buy = side === "BUY";
    this.sideBuy.classList.toggle("is-active", buy);
    this.sideSell.classList.toggle("is-active", !buy);
    this.sideBuy.setAttribute("aria-pressed", String(buy));
    this.sideSell.setAttribute("aria-pressed", String(!buy));
    this.orderSubmit.textContent = buy ? "Ejecutar compra" : "Ejecutar venta";
    this.orderMessage.textContent = "";
    this.orderMessage.className = "form-message";
    this.updateOrderPreview();
  }

  renderPortfolio(snapshot: PortfolioSnapshot): void {
    const holdings = snapshot.holdings;
    const sameRows =
      holdings.length === this.portfolioRows.size &&
      holdings.every((holding) => this.portfolioRows.has(holding.companyId));

    if (!sameRows) {
      this.portfolioRows.clear();
      this.portfolioBody.replaceChildren();

      for (const holding of holdings) {
        const row = document.createElement("tr");
        const ticker = document.createElement("td");
        const tickerBadge = document.createElement("span");
        tickerBadge.className = "ticker-code";
        tickerBadge.textContent = holding.ticker;
        ticker.append(tickerBadge);

        const qty = document.createElement("td");
        qty.className = "num";
        const average = document.createElement("td");
        average.className = "num";
        const value = document.createElement("td");
        value.className = "num";
        const pl = document.createElement("td");
        pl.className = "num";

        row.append(ticker, qty, average, value, pl);
        this.portfolioBody.append(row);
        this.portfolioRows.set(holding.companyId, {
          row,
          qty,
          average,
          value,
          pl,
        });
      }
    }

    for (const holding of holdings) {
      const refs = this.portfolioRows.get(holding.companyId);
      if (!refs) {
        continue;
      }
      refs.qty.textContent = String(holding.qty);
      refs.average.textContent = formatPrice(holding.avgCost);
      refs.value.textContent = formatPrice(holding.value);
      refs.pl.textContent = `${formatSignedMoney(holding.pl)} (${formatPercent(holding.plPercent)})`;
      refs.pl.classList.remove("is-up", "is-down", "is-flat");
      refs.pl.classList.add(trendClass(holding.pl));
    }

    this.portfolioTotal.textContent = formatMoney(snapshot.totalValue);
    this.portfolioEmpty.hidden = holdings.length > 0;
  }

  renderTrades(trades: Trade[]): void {
    this.tradesList.replaceChildren();
    this.tradesCount.textContent = String(trades.length);
    this.tradesEmpty.hidden = trades.length > 0;

    for (const trade of trades) {
      const item = document.createElement("li");
      item.className = "trade-item";

      const side = document.createElement("span");
      const isBuy = trade.side === "BUY";
      side.className = `trade-side ${isBuy ? "is-buy" : "is-sell"}`;
      side.textContent = isBuy ? "COMPRA" : "VENTA";

      const ticker = document.createElement("span");
      ticker.className = "trade-ticker";
      ticker.textContent = trade.ticker;

      const detail = document.createElement("span");
      detail.className = "trade-detail";
      detail.textContent = `${trade.qty} x ${formatPrice(trade.price)}`;

      const total = document.createElement("span");
      total.className = `trade-total ${isBuy ? "is-down" : "is-up"}`;
      total.textContent = formatMoney(trade.qty * trade.price);

      const time = document.createElement("time");
      time.className = "trade-time";
      time.dateTime = new Date(trade.ts * 1000).toISOString();
      time.textContent = formatTime(trade.ts);

      item.append(side, ticker, detail, total, time);
      this.tradesList.append(item);
    }
  }

  renderNews(news: NewsItem[]): void {
    if (news.length > 0 && news[0]!.id === this.lastNewsId) {
      return;
    }
    this.lastNewsId = news.length > 0 ? news[0]!.id : 0;
    this.newsFeed.replaceChildren();

    for (const item of news) {
      const row = document.createElement("li");
      row.className = "news-item";

      const meta = document.createElement("div");
      meta.className = "news-meta";

      const ticker = document.createElement("span");
      ticker.className = "news-ticker";
      ticker.textContent = item.ticker;

      const time = document.createElement("span");
      time.className = "news-time";
      time.textContent = formatTime(item.ts);

      const impact = document.createElement("span");
      impact.className = `news-impact ${trendClass(item.impact)}`;
      impact.textContent = formatPercent(item.impact * 100);

      meta.append(ticker, time, impact);

      const headline = document.createElement("p");
      headline.className = "news-headline";
      headline.textContent = item.headline;

      row.append(meta, headline);
      this.newsFeed.append(row);
    }
  }

  readCompanyForm(): CompanyInput {
    return {
      ticker: this.companyTicker.value,
      name: this.companyName.value,
      sector: this.companySector.value,
      price: Number(this.companyPrice.value),
      volatility: Number(this.companyVolatility.value),
    };
  }

  getOrderQty(): number {
    return Number(this.orderQty.value);
  }

  getEditingId(): number | null {
    return this.editingId;
  }

  startEditing(company: Company): void {
    this.editingId = company.id;
    this.companyFormEyebrow.textContent = "EDICIÓN DE EMPRESA";
    this.companyFormTitle.textContent = "Editar empresa";
    this.companySubmit.textContent = "Guardar cambios";
    this.cancelEdit.hidden = false;
    this.companyTicker.value = company.ticker;
    this.companyName.value = company.name;
    this.companySector.value = company.sector;
    this.companyPrice.value = company.price.toFixed(2);
    this.companyVolatility.value = (company.volatility * 100).toFixed(1);
    this.clearCompanyFormMessage();
    this.companyForm.scrollIntoView({ behavior: "smooth", block: "nearest" });
    this.companyTicker.focus({ preventScroll: true });
  }

  resetCompanyForm(): void {
    this.editingId = null;
    this.companyFormEyebrow.textContent = "NUEVA EMISIÓN";
    this.companyFormTitle.textContent = "Lanzar empresa (IPO)";
    this.companySubmit.textContent = "Lanzar empresa";
    this.cancelEdit.hidden = true;
    this.companyTicker.value = "";
    this.companyName.value = "";
    this.companySector.value = "Alimentos";
    this.companyPrice.value = "";
    this.companyVolatility.value = "1.5";
    this.clearCompanyFormMessage();
  }

  showCompanyFormError(message: string): void {
    this.companyFormMessage.textContent = message;
    this.companyFormMessage.className = "form-message is-error";
  }

  clearCompanyFormMessage(): void {
    this.companyFormMessage.textContent = "";
    this.companyFormMessage.className = "form-message";
    this.companyTicker.removeAttribute("aria-invalid");
  }

  showOrderMessage(message: string, tone: "error" | "success"): void {
    this.orderMessage.textContent = message;
    this.orderMessage.className = `form-message ${tone === "error" ? "is-error" : "is-success"}`;
  }

  clearOrderMessage(): void {
    this.orderMessage.textContent = "";
    this.orderMessage.className = "form-message";
  }

  toast(message: string, tone: ToastTone = "info"): void {
    this.toasts.show(message, tone);
  }

  askConfirmation(options: ConfirmOptions): Promise<boolean> {
    return this.confirmDialog.ask(options);
  }

  dispose(): void {
    window.clearInterval(this.clockTimer);
    this.chart.dispose();
  }

  private bindEvents(): void {
    this.resetButton.addEventListener("click", () => this.handlers.onResetRequest());

    this.sideBuy.addEventListener("click", () => {
      this.setSide("BUY");
      this.handlers.onOrderSideChange("BUY");
    });
    this.sideSell.addEventListener("click", () => {
      this.setSide("SELL");
      this.handlers.onOrderSideChange("SELL");
    });

    this.orderQty.addEventListener("input", () => this.updateOrderPreview());

    this.orderForm.addEventListener("submit", (event) => {
      event.preventDefault();
      if (!this.selected) {
        this.showOrderMessage("Selecciona una empresa antes de operar.", "error");
        return;
      }
      this.handlers.onOrderSubmit(this.side, this.getOrderQty());
    });

    this.companyForm.addEventListener("submit", (event) => {
      event.preventDefault();
      this.handlers.onSubmitCompany(this.readCompanyForm());
    });

    this.cancelEdit.addEventListener("click", () => this.handlers.onCancelEdit());
  }

  private updateOrderPreview(): void {
    if (!this.selected) {
      this.orderTotal.textContent = formatMoney(0);
      this.orderAvailable.textContent = "Selecciona una empresa para operar.";
      this.orderSubmit.disabled = true;
      return;
    }

    const qty = this.getOrderQty();
    const validQty = Number.isInteger(qty) && qty >= 1;
    const total = validQty ? qty * this.selected.price : 0;
    this.orderTotal.textContent = formatMoney(total);

    if (this.side === "BUY") {
      const affordable = this.selected.price > 0 ? Math.floor(this.cash / this.selected.price) : 0;
      this.orderAvailable.textContent = `Efectivo disponible: ${formatMoney(this.cash)}. Máximo aproximado: ${affordable} acciones.`;
      this.orderSubmit.disabled = !validQty;
    } else {
      this.orderAvailable.textContent = `Posición actual: ${this.holdingQty} acciones.`;
      this.orderSubmit.disabled = !validQty || this.holdingQty <= 0;
    }
  }

  private updateStats(snapshot: PortfolioSnapshot): void {
    this.statCash.textContent = formatMoney(snapshot.cash);
    this.statPortfolio.textContent = formatMoney(snapshot.totalValue);
    this.statPl.textContent = `${formatSignedMoney(snapshot.totalPl)} (${formatPercent(snapshot.totalPlPercent)})`;
    this.statPl.classList.remove("is-up", "is-down", "is-flat");
    this.statPl.classList.add(trendClass(snapshot.totalPl));

    const relativeToInitial =
      this.initialCash > 0 ? (snapshot.totalValue / this.initialCash - 1) * 100 : 0;
    this.statPl.title = `Capital inicial: ${formatMoney(this.initialCash)}. Variacion: ${formatPercent(relativeToInitial)}.`;
  }

  private updateChartQuote(company: Company): void {
    const percent = changePercent(company.price, company.prev_close);
    this.chartPrice.textContent = formatPrice(company.price);
    this.chartChange.textContent = formatPercent(percent);
    this.chartChange.className = trendClass(percent);
  }

  private renderTicker(companies: Company[]): void {
    this.tickerTrack.replaceChildren();
    this.tickerRefs.clear();

    if (companies.length === 0) {
      const empty = document.createElement("span");
      empty.className = "ticker-empty";
      empty.textContent = "SIN EMPRESAS EN EL MERCADO";
      this.tickerTrack.append(empty);
      return;
    }

    this.tickerTrack.style.setProperty(
      "--ticker-duration",
      `${Math.max(28, companies.length * 6)}s`,
    );

    const first = this.buildTickerGroup(companies, false);
    const second = this.buildTickerGroup(companies, true);
    this.tickerTrack.append(first, second);
  }

  private buildTickerGroup(companies: Company[], duplicate: boolean): HTMLDivElement {
    const group = document.createElement("div");
    group.className = "ticker-group";
    if (duplicate) {
      group.setAttribute("aria-hidden", "true");
    }

    for (const company of companies) {
      const item = document.createElement("span");
      item.className = "ticker-item";

      const symbol = document.createElement("span");
      symbol.className = "ticker-symbol";
      symbol.textContent = company.ticker;

      const price = document.createElement("span");
      price.className = "ticker-price";
      price.textContent = formatPrice(company.price);

      const percent = changePercent(company.price, company.prev_close);
      const change = document.createElement("span");
      change.className = `ticker-change ${trendClass(percent)}`;
      change.textContent = formatPercent(percent);

      item.append(symbol, price, change);
      group.append(item);

      const refs = this.tickerRefs.get(company.id) ?? [];
      refs.push({ price, change });
      this.tickerRefs.set(company.id, refs);
    }

    return group;
  }
}
