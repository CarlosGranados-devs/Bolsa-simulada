import type { Database } from "../db/database";
import { CompanyModel } from "../models/company";
import { MarketModel } from "../models/market";
import { NewsModel } from "../models/news";
import { TradingModel } from "../models/trading";
import type { CompanyInput } from "../models/types";
import { ValidationError } from "../models/validation";
import { formatMoney, formatPrice } from "../views/format";
import { TerminalView, type TerminalHandlers, type TradeSide } from "../views/terminalView";

const TICK_MS = 2000;
const PERSIST_EVERY_TICKS = 10;

function errorMessage(error: unknown): string {
  if (error instanceof ValidationError) {
    return error.message;
  }
  return "No se pudo completar la operación. Intenta de nuevo.";
}

export class TerminalController implements TerminalHandlers {
  private readonly view: TerminalView;
  private readonly companies: CompanyModel;
  private readonly trading: TradingModel;
  private readonly market: MarketModel;
  private readonly news: NewsModel;

  private selectedId: number | null = null;
  private editingId: number | null = null;
  private marketTimer: number | null = null;
  private tickCount = 0;

  constructor(private readonly db: Database) {
    this.companies = new CompanyModel(db);
    this.trading = new TradingModel(db);
    this.market = new MarketModel(db);
    this.news = new NewsModel(db);
    this.view = new TerminalView(this);
  }

  start(): void {
    this.view.setSide("BUY");
    this.refreshAll();
    const first = this.companies.list()[0];
    if (first) {
      this.selectCompany(first.id);
    }
    this.startMarket();
  }

  dispose(): void {
    this.stopMarket();
    this.view.dispose();
    void this.db.persistNow();
  }

  onSelectCompany(companyId: number): void {
    this.selectCompany(companyId);
  }

  onEditCompany(companyId: number): void {
    const company = this.companies.find(companyId);
    if (!company) {
      this.view.toast("La empresa ya no existe en el mercado.", "error");
      return;
    }
    this.selectCompany(companyId);
    this.editingId = companyId;
    this.view.startEditing(company);
  }

  onDeleteCompany(companyId: number): void {
    void this.delistCompany(companyId);
  }

  onSubmitCompany(values: CompanyInput): void {
    try {
      if (this.editingId !== null) {
        const updated = this.companies.update(this.editingId, values);
        this.editingId = null;
        this.view.resetCompanyForm();
        this.refreshAll();
        this.selectCompany(updated.id);
        void this.db.persistNow();
        this.view.toast(`Empresa ${updated.ticker} actualizada.`, "success");
        return;
      }

      const created = this.companies.create(values);
      this.view.resetCompanyForm();
      this.refreshAll();
      this.selectCompany(created.id);
      void this.db.persistNow();
      this.view.toast(
        `IPO registrada: ${created.ticker}. La empresa ya cotiza en el mercado.`,
        "success",
      );
    } catch (error) {
      const message = errorMessage(error);
      this.view.showCompanyFormError(message);
      this.view.toast(message, "error");
    }
  }

  onCancelEdit(): void {
    this.editingId = null;
    this.view.resetCompanyForm();
    this.view.toast("Edición cancelada.", "info");
  }

  onOrderSubmit(side: TradeSide, qty: number): void {
    if (this.selectedId === null) {
      this.view.showOrderMessage("Selecciona una empresa antes de operar.", "error");
      return;
    }

    try {
      const trade =
        side === "BUY"
          ? this.trading.buy(this.selectedId, qty)
          : this.trading.sell(this.selectedId, qty);

      const snapshot = this.trading.portfolio();
      const companies = this.companies.list();
      this.view.updateMarket(companies, snapshot);
      this.view.renderTrades(this.trading.trades());

      const company = this.companies.find(this.selectedId);
      const holding = this.trading.getHolding(this.selectedId);
      this.view.setSelected(company, holding ? holding.qty : 0);

      const label = trade.side === "BUY" ? "Compra" : "Venta";
      void this.db.persistNow();
      this.view.showOrderMessage(
        `${label} ejecutada: ${trade.qty} acciones de ${trade.ticker} a ${formatPrice(trade.price)}.`,
        "success",
      );
      this.view.toast(
        `${label} de ${trade.qty} ${trade.ticker} por ${formatMoney(trade.qty * trade.price)}.`,
        "success",
      );
    } catch (error) {
      const message = errorMessage(error);
      this.view.showOrderMessage(message, "error");
      this.view.toast(message, "error");
    }
  }

  onOrderSideChange(_side: TradeSide): void {
    this.view.updateOrderContext(this.trading.portfolio());
  }

  onResetRequest(): void {
    void this.resetSimulation();
  }

  private startMarket(): void {
    this.stopMarket();
    this.marketTimer = window.setInterval(() => this.runTick(), TICK_MS);
  }

  private stopMarket(): void {
    if (this.marketTimer !== null) {
      window.clearInterval(this.marketTimer);
      this.marketTimer = null;
    }
  }

  private runTick(): void {
    try {
      const tick = this.market.tick();
      const snapshot = this.trading.portfolio();
      this.view.updateMarket(tick.companies, snapshot);

      if (tick.news) {
        this.view.renderNews(this.news.list());
      }

      if (this.selectedId !== null) {
        const history = this.companies.history(this.selectedId);
        const last = history[history.length - 1];
        if (last) {
          this.view.appendChartPoint(last);
        }
      }

      this.tickCount += 1;
      if (this.tickCount % PERSIST_EVERY_TICKS === 0) {
        void this.db.persistNow();
      }
    } catch {
      this.stopMarket();
      this.view.toast("El motor de mercado se detuvo por un error inesperado.", "error");
    }
  }

  private selectCompany(companyId: number): void {
    const company = this.companies.find(companyId);
    if (!company) {
      return;
    }
    this.selectedId = company.id;
    const account = this.trading.getAccount();
    const holding = this.trading.getHolding(company.id);
    this.view.setAccount(account);
    this.view.setSelected(company, holding ? holding.qty : 0);
    this.view.setChartData(this.companies.history(company.id));
  }

  private refreshAll(): void {
    const companies = this.companies.list();
    const account = this.trading.getAccount();
    const snapshot = this.trading.portfolio();

    this.view.setAccount(account);
    this.view.renderCompanies(companies, this.selectedId);

    if (this.selectedId !== null && !companies.some((company) => company.id === this.selectedId)) {
      this.selectedId = null;
    }

    const selected =
      this.selectedId === null
        ? null
        : companies.find((company) => company.id === this.selectedId) ?? null;
    const holding = selected ? this.trading.getHolding(selected.id) : null;

    this.view.updateMarket(companies, snapshot);
    this.view.setSelected(selected, holding ? holding.qty : 0);
    this.view.setChartData(selected ? this.companies.history(selected.id) : []);
    this.view.renderTrades(this.trading.trades());
    this.view.renderNews(this.news.list());
  }

  private async delistCompany(companyId: number): Promise<void> {
    const company = this.companies.find(companyId);
    if (!company) {
      this.view.toast("La empresa ya no existe en el mercado.", "error");
      return;
    }

    const holding = this.trading.getHolding(companyId);
    const liquidation =
      holding && holding.qty > 0
        ? ` Tus ${holding.qty} acciones se venderán al último precio de ${formatPrice(company.price)} y el efectivo volverá a tu cuenta.`
        : " No tienes acciones de esta empresa.";

    const confirmed = await this.view.askConfirmation({
      title: `Sacar ${company.ticker} de bolsa`,
      message: `Se eliminarán la empresa, su historial de precios y sus noticias.${liquidation}`,
      confirmLabel: "Sacar de bolsa",
      danger: true,
    });
    if (!confirmed) {
      return;
    }

    try {
      const result = this.companies.delist(companyId);
      const wasSelected = this.selectedId === companyId;
      if (this.editingId === companyId) {
        this.editingId = null;
        this.view.resetCompanyForm();
      }
      if (wasSelected) {
        this.selectedId = null;
      }

      this.refreshAll();
      if (wasSelected) {
        const first = this.companies.list()[0];
        if (first) {
          this.selectCompany(first.id);
        }
      }
      void this.db.persistNow();

      const liquidationMessage =
        result.liquidatedQty > 0
          ? ` Se liquidaron ${result.liquidatedQty} acciones por ${formatMoney(result.proceeds)}.`
          : "";
      this.view.toast(
        `${result.company.ticker} salió de bolsa.${liquidationMessage}`,
        "success",
      );
    } catch (error) {
      this.view.toast(errorMessage(error), "error");
    }
  }

  private async resetSimulation(): Promise<void> {
    const confirmed = await this.view.askConfirmation({
      title: "Reiniciar simulación",
      message:
        "Se borrarán todas las empresas, posiciones, noticias y operaciones. Se restauran las 8 empresas iniciales y un efectivo de $10,000.00.",
      confirmLabel: "Reiniciar todo",
      danger: true,
    });
    if (!confirmed) {
      return;
    }

    try {
      this.db.reset();
      this.selectedId = null;
      this.editingId = null;
      this.tickCount = 0;
      this.view.resetCompanyForm();
      this.refreshAll();
      const first = this.companies.list()[0];
      if (first) {
        this.selectCompany(first.id);
      }
      this.view.toast("Simulación reiniciada con el mercado inicial.", "success");
    } catch {
      this.view.toast("No se pudo reiniciar la simulación.", "error");
    }
  }
}
