// Calendar: its own tab - the month, the chosen day (appointments and tasks by time), the iPhone calendar.
// The view itself is in plan.js (it shares the calendar's state and helpers with Plan).

import { h } from "../ui.js";
import { calendar } from "./plan.js";

export function render(root) {
  root.append(h("div.head", h("h1.serif", "Calendar")));
  calendar(root);
}
