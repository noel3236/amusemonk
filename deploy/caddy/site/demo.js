(() => {
  "use strict";

  const COLUMNS = ["reference", "account_number", "bank_code", "amount", "date", "beneficiary"];
  const MIN_CENTS = 100;
  const MAX_CENTS = 5_000_000;
  const WINDOW_DAYS = 7;
  const MAX_ROWS = 200;
  const MAX_BYTES = 100 * 1024;
  const STEPS = ["choose", "check", "review", "track"];
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
  const dayFormat = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  const money = (cents) => usd.format(cents / 100);
  const showDate = (iso) => dayFormat.format(new Date(`${iso}T00:00:00Z`));
  const plural = (n, one, many = `${one}s`) => `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;

  const pad = (n) => String(n).padStart(2, "0");
  const daysAgo = (n) => {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  };
  const today = daysAgo(0);

  const SAMPLES = {
    clean: {
      name: "supplier-payouts.csv",
      title: "Clean file",
      rows: [
        ["PAY-0411", "40211876", "NWFB0031", "1250.00", daysAgo(0), "Amara Okafor"],
        ["PAY-0412", "71830042", "MNTX0107", "8400.00", daysAgo(0), "Northwind Supplies"],
        ["PAY-0413", "55519270", "NWFB0031", "12000.00", daysAgo(1), "Lucas Meyer"],
        ["PAY-0414", "90034517", "BRDG0412", "3725.50", daysAgo(1), "Sofia Rossi"],
        ["PAY-0415", "18820493", "HLMK0009", "15000.00", daysAgo(2), "Bluefin Logistics"],
        ["PAY-0416", "66403128", "MNTX0107", "8374.50", daysAgo(2), "Kenji Watanabe"],
      ],
    },
    messy: {
      name: "march-batch.csv",
      title: "File with problems",
      rows: [
        ["PAY-0511", "40211876", "NWFB0031", "1250.00", daysAgo(0), "Amara Okafor"],
        ["PAY-0512", "71830042", "MNTX0107", "8400.00", daysAgo(0), "Northwind Supplies"],
        ["PAY-0512", "55519270", "NWFB0031", "2100.00", daysAgo(1), "Lucas Meyer"],
        ["PAY-0514", "9003-45X", "BRDG0412", "3725.50", daysAgo(1), "Sofia Rossi"],
        ["PAY-0515", "18820493", "HLMK0009", "0.00", daysAgo(2), "Bluefin Logistics"],
        ["PAY-0516", "40211876", "NWFB0031", "1250.00", daysAgo(0), "Amara Okafor"],
        ["PAY-0517", "66403128", "MNTX0107", "830.00", daysAgo(-5), "Kenji Watanabe"],
      ],
    },
  };

  const CHECKS = [
    { key: "columns", name: "Columns", desc: "The six columns are there, and nothing else." },
    { key: "format", name: "Row format", desc: "References, accounts, bank codes, amounts, dates and names are well formed." },
    { key: "dupRef", name: "Duplicate reference", desc: "No reference appears twice in the file." },
    { key: "dupPay", name: "Duplicate payment", desc: "The same payment isn't listed twice under different references." },
    { key: "amount", name: "Amount limits", desc: "Each payout is between $1.00 and $50,000.00." },
    { key: "date", name: "Date window", desc: `Each date is today or within the last ${WINDOW_DAYS} days.` },
  ];

  // ---------- parsing and checks ----------

  function parseCsv(text) {
    const rows = [];
    let row = [];
    let field = "";
    let quoted = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (quoted) {
        if (c !== '"') field += c;
        else if (text[i + 1] === '"') { field += '"'; i++; }
        else quoted = false;
      } else if (c === '"') quoted = true;
      else if (c === ",") { row.push(field); field = ""; }
      else if (c === "\n" || c === "\r") {
        if (c === "\r" && text[i + 1] === "\n") i++;
        row.push(field);
        rows.push(row);
        row = [];
        field = "";
      } else field += c;
    }
    if (field !== "" || row.length) { row.push(field); rows.push(row); }
    return rows.filter((r) => r.some((v) => v.trim() !== ""));
  }

  function toCents(raw) {
    const m = /^(\d{1,9})(?:\.(\d{1,2}))?$/.exec(raw);
    return m ? Number(m[1]) * 100 + Number((m[2] || "0").padEnd(2, "0")) : null;
  }

  function isRealDate(s) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
    const d = new Date(`${s}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
  }

  const daysBetween = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);

  function checkFile(file) {
    const problems = Object.fromEntries(CHECKS.map((c) => [c.key, []]));
    const add = (key, row, text, fix) => problems[key].push({ row, text, fix });
    const header = file.header.map((h) => h.trim().toLowerCase());
    const missing = COLUMNS.filter((c) => !header.includes(c));
    for (const c of missing) add("columns", 1, `Column "${c}" is missing.`, `Add a column named ${c}.`);
    for (const c of header.filter((h) => h && !COLUMNS.includes(h))) {
      add("columns", 1, `Column "${c}" isn't one we read.`, "Remove it, or rename it to one of the six columns.");
    }
    if (!file.rows.length) add("columns", 2, "There are no payouts under the header.", "Add one row per payout.");
    if (missing.length) return { problems, payouts: [], skipped: true };

    const at = Object.fromEntries(COLUMNS.map((c) => [c, header.indexOf(c)]));
    const seenRef = new Map();
    const seenPayment = new Map();
    const payouts = file.rows.map((cells, i) => {
      const row = i + 2;
      const get = (c) => (cells[at[c]] ?? "").trim();
      const p = {
        row,
        reference: get("reference"),
        account: get("account_number"),
        bank: get("bank_code"),
        amount: get("amount"),
        date: get("date"),
        beneficiary: get("beneficiary"),
      };
      p.cents = toCents(p.amount);
      const validDate = isRealDate(p.date);

      if (!/^[A-Za-z0-9_-]{4,40}$/.test(p.reference)) add("format", row, `Reference "${p.reference}" isn't valid.`, "Use 4 to 40 letters, digits, - or _.");
      if (!/^\d{6,17}$/.test(p.account)) add("format", row, `Account number "${p.account}" isn't valid.`, "Use 6 to 17 digits, with no spaces or dashes.");
      if (!/^[A-Za-z0-9]{4,11}$/.test(p.bank)) add("format", row, `Bank code "${p.bank}" isn't valid.`, "Use 4 to 11 letters and digits.");
      if (p.cents === null) add("format", row, `Amount "${p.amount}" isn't a number.`, "Write it like 1250.00, without a currency sign.");
      if (!validDate) add("format", row, `Date "${p.date}" isn't a date.`, "Write it as YYYY-MM-DD.");
      if (!/^\p{L}[\p{L} .,'&-]{1,79}$/u.test(p.beneficiary)) add("format", row, `Beneficiary "${p.beneficiary}" isn't valid.`, "Use the account holder's name, 2 to 80 letters.");

      const refKey = p.reference.toLowerCase();
      if (p.reference && seenRef.has(refKey)) {
        add("dupRef", row, `Reference ${p.reference} is already used in row ${seenRef.get(refKey)}.`, "Give each row its own reference.");
      } else if (p.reference) seenRef.set(refKey, row);

      if (p.cents !== null && validDate) {
        const key = [p.account, p.bank.toUpperCase(), p.cents, p.date].join("|");
        if (seenPayment.has(key)) {
          add("dupPay", row, `Same account, amount and date as row ${seenPayment.get(key)}.`, "Remove the repeat, or change it if it's a separate payment.");
        } else seenPayment.set(key, row);
      }

      if (p.cents !== null && (p.cents < MIN_CENTS || p.cents > MAX_CENTS)) {
        const where = p.cents < MIN_CENTS ? "below the $1.00 minimum" : "above the $50,000.00 limit";
        add("amount", row, `${money(p.cents)} is ${where}.`, "Use an amount from $1.00 to $50,000.00.");
      }

      if (validDate) {
        const age = daysBetween(p.date, today);
        if (age < 0) add("date", row, `${showDate(p.date)} is in the future.`, `Use today's date or one from the last ${WINDOW_DAYS} days.`);
        else if (age > WINDOW_DAYS) add("date", row, `${showDate(p.date)} is more than ${WINDOW_DAYS} days ago.`, `Use today's date or one from the last ${WINDOW_DAYS} days.`);
      }
      return p;
    });
    return { problems, payouts, skipped: false };
  }

  // ---------- DOM helpers ----------

  const SVG = "http://www.w3.org/2000/svg";

  function h(tag, props, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
      if (v === null || v === undefined || v === false) continue;
      if (k === "class") el.className = v;
      else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? "" : String(v));
    }
    for (const kid of kids.flat()) {
      if (kid === null || kid === undefined || kid === false) continue;
      el.append(kid instanceof Node ? kid : String(kid));
    }
    return el;
  }

  function icon(id) {
    const svg = document.createElementNS(SVG, "svg");
    svg.setAttribute("class", "icon");
    svg.setAttribute("aria-hidden", "true");
    const use = document.createElementNS(SVG, "use");
    use.setAttribute("href", `#${id}`);
    svg.append(use);
    return svg;
  }

  const put = (el, ...kids) => el.replaceChildren(...kids.flat().filter((k) => k !== null && k !== undefined && k !== false));
  const COL = {
    row: { label: "Row", cls: "muted num", cell: (p) => p.row },
    reference: { label: "Reference", cls: "mono", cell: (p) => p.reference },
    beneficiary: { label: "Beneficiary", cell: (p) => p.beneficiary },
    account: { label: "Account", cls: "mono", cell: (p) => p.account },
    bank: { label: "Bank code", cls: "mono", cell: (p) => p.bank },
    date: { label: "Date", cell: (p) => showDate(p.date) },
    amount: { label: "Amount", align: "r", cls: "num", cell: (p) => money(p.cents) },
  };

  function payoutTable(columns, payouts) {
    const amountAt = columns.indexOf(COL.amount);
    const td = (c, kid) => h("td", { class: [c.align, c.cls].filter(Boolean).join(" ") || null }, kid);
    return h(
      "div",
      { class: "table-wrap" },
      h(
        "table",
        { class: "table" },
        h("thead", null, h("tr", null, columns.map((c) => h("th", { scope: "col", class: c.align }, c.label)))),
        h("tbody", null, payouts.map((p, i) => h("tr", null, columns.map((c) => td(c, c.cell(p, i)))))),
        h(
          "tfoot",
          null,
          h(
            "tr",
            null,
            h("td", { colspan: String(amountAt) }, `Total · ${plural(payouts.length, "payout")}`),
            td(COL.amount, money(totalOf(payouts))),
            columns.slice(amountAt + 1).map(() => h("td")),
          ),
        ),
      ),
    );
  }

  const chip = (tone, text) => h("span", { class: `chip tone-${tone}` }, text);
  const totalOf = (payouts) => payouts.reduce((sum, p) => sum + p.cents, 0);

  // ---------- the dialog ----------

  const dialog = document.getElementById("demo");
  const body = document.getElementById("demo-body");
  const foot = document.getElementById("demo-foot");
  const live = document.getElementById("demo-live");
  const stepItems = dialog.querySelectorAll(".demo-steps li");

  let state;
  let opener = null;
  let timers = [];

  const later = (fn, ms) => timers.push(setTimeout(fn, reducedMotion.matches ? 0 : ms));
  const clearTimers = () => { timers.forEach(clearTimeout); timers = []; };
  const announce = (text) => { live.textContent = text; };

  function reset() {
    clearTimers();
    state = { step: "choose", file: null, result: null, error: "" };
  }

  function go(step) {
    clearTimers();
    state.step = step;
    const current = STEPS.indexOf(step);
    stepItems.forEach((li) => {
      const i = STEPS.indexOf(li.dataset.step);
      if (i === current) li.setAttribute("aria-current", "step");
      else li.removeAttribute("aria-current");
      if (i < current) li.dataset.state = "done";
      else delete li.dataset.state;
    });
    ({ choose: renderChoose, check: renderCheck, review: renderReview, track: renderTrack })[step]();
    body.scrollTop = 0;
    body.querySelector(".step-heading")?.focus({ preventScroll: true });
  }

  function open(button) {
    opener = button;
    reset();
    document.documentElement.classList.add("demo-open");
    dialog.showModal();
    const from = button.getBoundingClientRect();
    const to = dialog.getBoundingClientRect();
    dialog.style.setProperty("transform-origin", `${from.left + from.width / 2 - to.left}px ${from.top + from.height / 2 - to.top}px`);
    go("choose");
  }

  dialog.addEventListener("close", () => {
    reset();
    document.documentElement.classList.remove("demo-open");
    opener?.focus();
  });

  dialog.addEventListener("click", (e) => {
    if (e.target !== dialog) return;
    const r = dialog.getBoundingClientRect();
    const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
    if (!inside) dialog.close();
  });

  dialog.querySelector("[data-close-demo]").addEventListener("click", () => dialog.close());
  document.querySelectorAll("[data-open-demo]").forEach((b) => b.addEventListener("click", () => open(b)));

  function chooseFile(file) {
    state.file = file;
    state.error = "";
    state.result = checkFile(file);
    go("check");
  }

  function sampleFile(key) {
    const s = SAMPLES[key];
    return { name: s.name, header: COLUMNS.slice(), rows: s.rows.map((r) => r.slice()) };
  }

  async function readOwnFile(f) {
    if (!f) return;
    const fail = (msg) => { state.error = msg; renderChoose(); };
    if (!/\.csv$/i.test(f.name)) return fail(`${f.name} isn't a CSV. Save the spreadsheet as CSV, then choose it again.`);
    if (f.size > MAX_BYTES) return fail(`${f.name} is ${Math.ceil(f.size / 1024)} KB. The demo reads files up to 100 KB.`);
    const rows = parseCsv((await f.text()).replace(/^﻿/, ""));
    if (!rows.length) return fail(`${f.name} is empty. Add a header row and one row per payout.`);
    if (rows.length - 1 > MAX_ROWS) return fail(`${f.name} has ${plural(rows.length - 1, "row")}. The demo reads up to ${MAX_ROWS}.`);
    chooseFile({ name: f.name, header: rows[0], rows: rows.slice(1) });
  }

  function downloadSample() {
    const csv = [COLUMNS, ...SAMPLES.clean.rows].map((r) => r.join(",")).join("\n") + "\n";
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = h("a", { href: url, download: "sample-payouts.csv" });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // ---------- step 1: choose ----------

  function renderChoose() {
    const input = h("input", { type: "file", accept: ".csv,text/csv", hidden: true, onchange: (e) => readOwnFile(e.target.files[0]) });
    const pick = (key, toneText, tone) => {
      const s = SAMPLES[key];
      const payouts = s.rows.map((r) => ({ cents: toCents(r[3]) ?? 0 }));
      return h(
        "button",
        { type: "button", class: "pick", onclick: () => chooseFile(sampleFile(key)) },
        icon("i-file"),
        h("span", { class: "pick-title" }, s.title),
        h("span", { class: "pick-meta" }, `${plural(s.rows.length, "payout")} · ${money(totalOf(payouts))}`),
        chip(tone, toneText),
      );
    };
    const drop = h(
      "div",
      { class: "drop" },
      icon("i-upload"),
      h("p", { class: "drop-title" }, "Or drop your own CSV here"),
      h("p", { class: "drop-hint" }, `Columns: ${COLUMNS.join(", ")} · up to ${MAX_ROWS} rows, 100 KB`),
      h("button", { type: "button", class: "btn btn-outline btn-sm", onclick: () => input.click() }, "Choose a CSV"),
      input,
    );
    drop.addEventListener("dragover", (e) => { e.preventDefault(); drop.classList.add("is-over"); });
    drop.addEventListener("dragleave", () => drop.classList.remove("is-over"));
    drop.addEventListener("drop", (e) => {
      e.preventDefault();
      drop.classList.remove("is-over");
      readOwnFile(e.dataTransfer.files[0]);
    });

    put(body, h("h3", { class: "step-heading", tabindex: "-1" }, "Choose a payout file"),
      h("p", { class: "step-sub" }, "Start with a sample, or try your own file. Made-up data that stays in this browser: nothing is uploaded or sent."),
      h("div", { class: "pick-grid" }, pick("clean", "Passes every check", "ok"), pick("messy", "5 problems to find", "bad")),
      drop,
      state.error ? h("p", { class: "field-error", role: "alert" }, state.error) : null,
    );
    put(foot, h("button", { type: "button", class: "link-btn", onclick: downloadSample }, icon("i-download"), "Download the sample CSV"));
  }

  // ---------- step 2: checks ----------

  function renderCheck() {
    const { problems, payouts, skipped } = state.result;
    const count = CHECKS.reduce((n, c) => n + problems[c.key].length, 0);
    const accepted = count === 0;
    const rows = CHECKS.map((c) =>
      h(
        "li",
        { class: "check" },
        h("span", { class: "check-mark" }),
        h("span", null, h("span", { class: "check-name" }, c.name), h("span", { class: "check-desc" }, ` · ${c.desc}`)),
        h("span", { class: "check-result" }, "Waiting"),
      ),
    );
    const outcomeSlot = h("div");

    put(body, h("h3", { class: "step-heading", tabindex: "-1" }, `Checking ${state.file.name}`),
      h("p", { class: "step-sub" }, `${plural(state.file.rows.length, "row")}. A file is accepted whole or not at all.`),
      h("ol", { class: "check-list", "aria-label": "Checks" }, rows),
      outcomeSlot,
    );
    put(foot, h("span", { class: "foot-note" }, "Running checks…"));

    CHECKS.forEach((c, i) => later(() => {
      const li = rows[i];
      const n = problems[c.key].length;
      const notRun = skipped && c.key !== "columns";
      li.dataset.result = notRun ? "skip" : n ? "fail" : "pass";
      put(li.querySelector(".check-mark"), icon(n && !notRun ? "i-x" : "i-check"));
      li.querySelector(".check-result").replaceWith(
        notRun ? h("span", { class: "check-result" }, "Not run") : n ? chip("bad", plural(n, "problem")) : chip("ok", "Passed"),
      );
    }, 160 * (i + 1)));

    later(() => {
      if (accepted) {
        put(outcomeSlot, h(
            "div",
            { class: "outcome outcome-ok" },
            h("p", { class: "outcome-title" }, icon("i-check"), "File accepted"),
            h("p", null, `${plural(payouts.length, "payout")}, ${money(totalOf(payouts))} in total. Nothing has been sent yet.`),
          ),
        );
        put(foot, h("button", { type: "button", class: "btn btn-outline", onclick: () => go("choose") }, "Choose another file"),
          h("span", { class: "spacer" }),
          h("button", { type: "button", class: "btn btn-brand", onclick: () => go("review") }, `Review ${plural(payouts.length, "payout")}`, icon("i-arrow")),
        );
        announce(`File accepted: ${plural(payouts.length, "payout")}, ${money(totalOf(payouts))}.`);
      } else {
        const list = CHECKS.flatMap((c) => problems[c.key]).sort((a, b) => a.row - b.row);
        const rowsHit = new Set(list.map((p) => p.row)).size;
        put(outcomeSlot, h(
            "div",
            { class: "outcome outcome-bad" },
            h("p", { class: "outcome-title" }, icon("i-x"), "File rejected: nothing will be paid"),
            h("p", null, `Fix ${plural(count, "problem")} in ${plural(rowsHit, "row")}, then upload the file again. Row numbers match the spreadsheet, where the header is row 1.`),
            h(
              "ul",
              { class: "problems" },
              list.map((p) => h("li", null, h("span", { class: "row-tag" }, p.row === 1 ? "Header" : `Row ${p.row}`), h("span", null, p.text, h("span", { class: "fix" }, p.fix)))),
            ),
          ),
        );
        put(foot, h("span", { class: "spacer" }),
          h("button", { type: "button", class: "btn btn-primary", onclick: () => go("choose") }, "Choose another file"),
        );
        announce(`File rejected: ${plural(count, "problem")} in ${plural(rowsHit, "row")}.`);
      }
    }, 160 * (CHECKS.length + 1));
  }

  // ---------- step 3: review ----------

  function renderReview() {
    const payouts = state.result.payouts;
    const total = money(totalOf(payouts));
    let confirming = false;
    const confirm = h("button", { type: "button", class: "btn btn-brand" }, `Confirm payment of ${total}`);
    confirm.addEventListener("click", () => {
      if (confirming) return;
      confirming = true;
      confirm.setAttribute("aria-busy", "true");
      confirm.textContent = "Confirming…";
      later(() => go("track"), 450);
    });

    put(body, h("h3", { class: "step-heading", tabindex: "-1" }, "Review before paying"),
      h("p", { class: "step-sub" }, `${plural(payouts.length, "payout")}, ${total} in total. Nothing has been sent yet.`),
      payoutTable([COL.row, COL.reference, COL.beneficiary, COL.account, COL.bank, COL.date, COL.amount], payouts),
      h("p", { class: "note" }, h("strong", null, "Each payout is sent once, keyed by its reference."), " Uploading this file again would be refused."),
    );
    put(foot, h("button", { type: "button", class: "btn btn-outline", onclick: () => go("choose") }, "Choose another file"),
      h("span", { class: "spacer" }),
      confirm,
    );
  }

  // ---------- step 4: track ----------

  const STATUS = {
    pending: ["muted", "Pending"],
    processing: ["info", "Processing"],
    paid: ["ok", "Paid"],
    failed: ["bad", "Failed"],
  };

  function renderTrack() {
    const payouts = state.result.payouts;
    const failIndex = payouts.length >= 4 ? 3 : -1;
    const statuses = payouts.map(() => "pending");
    const cells = [];

    const heading = h("h3", { class: "step-heading", tabindex: "-1" }, `Sending ${plural(payouts.length, "payout")}`);
    const sub = h(
      "p",
      { class: "step-sub" },
      failIndex >= 0
        ? "Statuses update as the bank answers. In this sample one payout is returned, to show what a failure looks like."
        : "Statuses update as the bank answers. You can close this at any time.",
    );
    const fill = h("span", { class: "meter-fill" });
    const meter = h("span", { class: "meter", role: "progressbar", "aria-label": "Payouts settled", "aria-valuemin": "0", "aria-valuemax": String(payouts.length), "aria-valuenow": "0" }, fill);
    const progressText = h("span", { class: "progress-label" });
    const counts = h("span", { class: "summary-counts" });
    const doneSlot = h("div");

    const statusCol = { label: "Status", cell: (_, i) => (cells[i] = h("div", { class: "status-cell" })) };

    function paint() {
      statuses.forEach((s, i) => {
        const [tone, label] = STATUS[s];
        put(cells[i], chip(tone, label), s === "failed" ? h("span", { class: "status-note" }, "Returned: account closed") : null);
      });
      const settled = statuses.filter((s) => s === "paid" || s === "failed").length;
      fill.style.setProperty("transform", `scaleX(${payouts.length ? settled / payouts.length : 1})`);
      meter.setAttribute("aria-valuenow", String(settled));
      progressText.textContent = `${settled} of ${payouts.length} settled`;
      put(counts, ...["paid", "processing", "failed"]
          .map((s) => [s, statuses.filter((x) => x === s).length])
          .filter(([, n]) => n > 0)
          .map(([s, n]) => chip(STATUS[s][0], `${n} ${STATUS[s][1].toLowerCase()}`)),
      );
    }

    // A pipeline: row i starts processing a step before row i-1 settles.
    const events = [];
    payouts.forEach((_, i) => {
      events.push([i, "processing"]);
      if (i > 0) events.push([i - 1, i - 1 === failIndex ? "failed" : "paid"]);
    });
    if (payouts.length) events.push([payouts.length - 1, payouts.length - 1 === failIndex ? "failed" : "paid"]);
    const perTick = Math.max(1, Math.ceil(events.length / 12));

    function finish() {
      clearTimers();
      const focusWasInFoot = foot.contains(document.activeElement);
      for (const [i, s] of events) statuses[i] = s;
      paint();
      const paid = statuses.filter((s) => s === "paid").length;
      const failed = statuses.length - paid;
      heading.textContent = "All payouts settled";
      sub.textContent = `${plural(paid, "payout")} paid${failed ? `, ${failed} failed` : ""}, ${money(totalOf(payouts.filter((_, i) => statuses[i] === "paid")))} sent.`;
      if (failed) {
        put(doneSlot, h(
            "p",
            { class: "note" },
            h("strong", null, `Row ${payouts[failIndex].row} was returned by the bank because the account is closed.`),
            " Nothing left your balance for it. To retry, send it in a new file with a new reference.",
          ),
        );
      }
      put(foot, h("button", { type: "button", class: "btn btn-outline", onclick: () => dialog.close() }, "Close"),
        h("span", { class: "spacer" }),
        h("button", { type: "button", class: "btn btn-brand", onclick: () => go("choose") }, "Try another file"),
      );
      announce(`Done: ${plural(paid, "payout")} paid${failed ? `, ${failed} failed` : ""}.`);
      if (focusWasInFoot) heading.focus({ preventScroll: true });
    }

    let next = 0;
    function tick() {
      for (let k = 0; k < perTick && next < events.length; k++, next++) {
        const [i, s] = events[next];
        statuses[i] = s;
      }
      paint();
      if (next < events.length) later(tick, 420);
      else finish();
    }

    put(body, heading,
      sub,
      h("div", { class: "summary" }, progressText, meter, counts),
      payoutTable([COL.row, COL.reference, COL.beneficiary, COL.amount, statusCol], payouts),
      doneSlot,
    );
    put(foot, h("span", { class: "spacer" }),
      h("button", { type: "button", class: "btn btn-outline", onclick: finish }, "Show the final result"),
    );
    paint();
    announce(`Payment confirmed. Sending ${plural(payouts.length, "payout")}.`);
    later(tick, 500);
  }
})();
