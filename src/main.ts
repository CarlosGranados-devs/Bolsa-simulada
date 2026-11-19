import "./styles/styles.css";
import { TerminalController } from "./controllers/terminalController";
import { Database } from "./db/database";
import { IntroView } from "./views/notifications";

function showBootError(): void {
  const main = document.querySelector<HTMLElement>("main");
  if (!main) {
    return;
  }

  const panel = document.createElement("div");
  panel.className = "boot-error";

  const title = document.createElement("h2");
  title.textContent = "No se pudo abrir el mercado";

  const message = document.createElement("p");
  message.textContent =
    "La base de datos local no pudo inicializarse. Recarga la página o comprueba que el navegador permita almacenamiento local.";

  panel.append(title, message);
  main.replaceChildren(panel);
}

async function bootstrap(): Promise<void> {
  const introElement = document.querySelector<HTMLElement>("#intro");
  if (introElement) {
    new IntroView(introElement).start();
  }

  try {
    const database = await Database.create();
    const controller = new TerminalController(database);
    controller.start();

    window.addEventListener("pagehide", (event) => {
      if (!event.persisted) {
        controller.dispose();
      }
    });
  } catch {
    showBootError();
  }
}

void bootstrap();
