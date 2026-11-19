export type ToastTone = "success" | "error" | "info";

export class ToastView {
  constructor(private readonly region: HTMLElement) {}

  show(message: string, tone: ToastTone = "info"): void {
    const toast = document.createElement("div");
    toast.className = `toast toast--${tone}`;
    toast.setAttribute("role", tone === "error" ? "alert" : "status");

    const mark = document.createElement("span");
    mark.className = "toast-mark";
    mark.setAttribute("aria-hidden", "true");

    const text = document.createElement("p");
    text.textContent = message;

    toast.append(mark, text);
    this.region.append(toast);

    while (this.region.childElementCount > 4) {
      this.region.firstElementChild?.remove();
    }

    requestAnimationFrame(() => {
      toast.classList.add("is-visible");
    });

    window.setTimeout(() => {
      toast.classList.remove("is-visible");
      window.setTimeout(() => toast.remove(), 220);
    }, 4200);
  }
}

export interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
}

export class ConfirmDialog {
  private resolver: ((value: boolean) => void) | null = null;

  constructor(
    private readonly dialog: HTMLDialogElement,
    private readonly titleElement: HTMLElement,
    private readonly messageElement: HTMLElement,
    private readonly confirmButton: HTMLButtonElement,
  ) {
    this.dialog.querySelector("form")?.addEventListener("submit", this.onSubmit);
    this.dialog.addEventListener("cancel", (event) => {
      event.preventDefault();
      this.finish(false);
    });
    this.dialog.addEventListener("close", () => {
      if (this.resolver) {
        this.finish(this.dialog.returnValue === "confirm");
      }
    });
  }

  ask(options: ConfirmOptions): Promise<boolean> {
    this.titleElement.textContent = options.title;
    this.messageElement.textContent = options.message;
    this.confirmButton.textContent = options.confirmLabel ?? "Confirmar";
    this.confirmButton.classList.toggle("btn-red", options.danger !== false);
    this.confirmButton.classList.toggle("btn-solid", options.danger === false);
    this.dialog.returnValue = "cancel";

    if (!this.dialog.open) {
      this.dialog.showModal();
    }

    return new Promise((resolve) => {
      this.resolver = resolve;
    });
  }

  private readonly onSubmit = (event: Event): void => {
    event.preventDefault();
    const submitter = (event as SubmitEvent).submitter;
    const value = submitter instanceof HTMLButtonElement ? submitter.value : "cancel";
    this.finish(value === "confirm");
  };

  private finish(result: boolean): void {
    const resolver = this.resolver;
    this.resolver = null;
    if (this.dialog.open) {
      this.dialog.close(result ? "confirm" : "cancel");
    }
    resolver?.(result);
  }
}

const INTRO_KEY = "bolsa-sv-intro-v1";
const INTRO_DURATION_MS = 1850;

export class IntroView {
  private timer: number | null = null;
  private closed = false;

  constructor(private readonly element: HTMLElement) {}

  start(): void {
    if (this.wasSeen()) {
      this.element.remove();
      return;
    }

    try {
      sessionStorage.setItem(INTRO_KEY, "1");
    } catch {
      // sessionStorage puede estar bloqueado; la intro se muestra igual.
    }

    this.element.hidden = false;
    this.element.setAttribute("aria-hidden", "false");
    requestAnimationFrame(() => this.element.classList.add("is-visible"));

    this.element.addEventListener("click", this.skip);
    window.addEventListener("keydown", this.skip);
    this.timer = window.setTimeout(this.skip, INTRO_DURATION_MS);
  }

  private wasSeen(): boolean {
    try {
      return sessionStorage.getItem(INTRO_KEY) === "1";
    } catch {
      return false;
    }
  }

  private readonly skip = (): void => {
    if (this.closed) {
      return;
    }
    this.closed = true;
    if (this.timer !== null) {
      window.clearTimeout(this.timer);
      this.timer = null;
    }
    this.element.removeEventListener("click", this.skip);
    window.removeEventListener("keydown", this.skip);
    this.element.classList.add("is-leaving");
    window.setTimeout(() => this.element.remove(), 180);
  };
}
