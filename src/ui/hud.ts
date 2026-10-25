import type { Shortcut } from "../input/bindings";
import type { Row } from "./debug";

export const createHud = (parent: HTMLElement, shortcuts: readonly Shortcut[], help: string) => {
  const panel = document.createElement("aside");
  panel.className = "hud";
  const table = document.createElement("dl");
  const hint = document.createElement("p");
  hint.textContent = help;
  table.hidden = true;
  hint.hidden = true;
  const buttons = document.createElement("menu");
  buttons.append(
    ...shortcuts.map(({ hint, command }) => {
      const button = document.createElement("button");
      button.textContent = `${hint} ${command.name}`;
      button.addEventListener("click", command.run);
      return button;
    }),
  );
  panel.append(buttons, table, hint);
  parent.append(panel);
  const values = new Map<string, HTMLElement>();

  const show = (rows: readonly Row[]) => {
    for (const [label, value] of rows) {
      let dd = values.get(label);
      if (!dd) {
        const dt = document.createElement("dt");
        dt.textContent = label;
        dd = document.createElement("dd");
        values.set(label, dd);
        table.append(dt, dd);
      }
      if (dd.textContent !== value) dd.textContent = value;
    }
  };

  const toggle = () => {
    table.hidden = !table.hidden;
    hint.hidden = table.hidden;
  };

  return { show, toggle, isOpen: () => !table.hidden };
};
