/**
 * ui.js — Renderizado y actualización del DOM. Expone el objeto global `UI`.
 * No accede a localStorage; recibe `trip` y `expenses` de quien lo llama (app.js).
 */
(function (global) {
  'use strict';

  var B = global.Budget;
  function $(id) { return document.getElementById(id); }

  // ---- Helpers de presentación -------------------------------------------

  /** "lunes 1 de julio" (capitalizado) a partir de una fecha ISO. */
  function formatDateLong(iso) {
    var p = iso.split('-');
    var d = new Date(+p[0], +p[1] - 1, +p[2]); // local, sin desfase de TZ
    var s = d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  function clearChildren(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  /** Construye un <li> de gasto con nombre, monto y botón eliminar. */
  function expenseItem(expense, symbol) {
    var li = document.createElement('li');
    li.className = 'expense-item';
    li.dataset.id = expense.id;

    var name = document.createElement('span');
    name.className = 'expense-name';
    name.textContent = expense.name || 'Gasto';

    var amount = document.createElement('span');
    amount.className = 'expense-amount';
    amount.textContent = B.money(expense.amount, symbol);

    var edit = document.createElement('button');
    edit.type = 'button';
    edit.className = 'expense-edit';
    edit.setAttribute('aria-label', 'Editar gasto');
    edit.dataset.id = expense.id;
    edit.textContent = '✎';

    var del = document.createElement('button');
    del.type = 'button';
    del.className = 'expense-delete';
    del.setAttribute('aria-label', 'Eliminar gasto');
    del.dataset.id = expense.id;
    del.textContent = '✕';

    li.appendChild(name);
    li.appendChild(amount);
    li.appendChild(edit);
    li.appendChild(del);
    return li;
  }

  // ---- Navegación entre pantallas ----------------------------------------

  var SCREENS = ['onboarding', 'today', 'history', 'settings'];

  function showScreen(name) {
    SCREENS.forEach(function (s) {
      var el = $(s);
      if (el) el.hidden = (s !== name);
    });
    // Tab bar solo en las pantallas con pestañas.
    $('tabbar').hidden = (name === 'onboarding');
    Array.prototype.forEach.call(document.querySelectorAll('.tab'), function (tab) {
      tab.classList.toggle('active', tab.dataset.tab === name);
    });
  }

  // ---- Pantalla HOY -------------------------------------------------------

  function renderToday(trip, expenses) {
    var symbol = trip.currency;
    var currentDay = B.getCurrentDay(trip.startDate);
    var remainingDays = B.getRemainingDays(trip.startDate, trip.totalDays);

    var stateBox = $('today-state');
    var hero = $('today-hero');
    var list = $('today-expense-list');
    var empty = $('today-empty');
    var addBtn = $('add-expense-btn');

    // --- Estados especiales: futuro / completado ---
    if (currentDay <= 0) {
      var daysUntil = 1 - currentDay;
      $('today-subheader').textContent = trip.name;
      stateBox.hidden = false;
      stateBox.textContent = daysUntil === 1
        ? 'El viaje comienza mañana'
        : 'El viaje comienza en ' + daysUntil + ' días';
      hero.hidden = true;
      list.hidden = true; empty.hidden = true;
      addBtn.disabled = true;
      return;
    }
    if (remainingDays <= 0) {
      $('today-subheader').textContent = 'Viaje finalizado · ' + trip.name;
      stateBox.hidden = false;
      stateBox.textContent = '¡Viaje completado!';
      hero.hidden = true;
      list.hidden = true; empty.hidden = true;
      addBtn.disabled = true;
      return;
    }

    // --- Estado normal ---
    stateBox.hidden = true;
    hero.hidden = false;
    list.hidden = false;
    addBtn.disabled = false;

    $('today-subheader').textContent = 'Día ' + currentDay + ' de ' + trip.totalDays + ' · ' + trip.name;

    var dynamicDaily = B.getDynamicDailyBudget(trip, expenses);
    var todaySpent = B.getTodaySpent(expenses);
    var remainingToday = dynamicDaily - todaySpent;
    var remainingBudget = trip.totalBudget - B.sumAll(expenses);

    // Anillo de progreso (clampeado) + color semántico
    var CIRC = 364.42; // 2 * PI * r (r = 58)
    var pct, level;
    if (dynamicDaily <= 0) {
      pct = 1; level = 'danger';
    } else {
      pct = Math.max(0, Math.min(1, todaySpent / dynamicDaily));
      if (todaySpent > dynamicDaily) level = 'danger';
      else if (todaySpent / dynamicDaily >= 0.70) level = 'warn';
      else level = 'ok';
    }
    var ring = $('ring-progress');
    ring.setAttribute('class', 'ring-progress ' + level);
    ring.style.strokeDashoffset = (CIRC * (1 - pct)).toFixed(2);

    var amountEl = $('ring-amount');
    amountEl.textContent = B.money(Math.max(remainingToday, 0), symbol);
    amountEl.style.fill = remainingToday < 0 ? 'var(--red-text)' : 'var(--text)';
    $('ring-spent').textContent = 'gastado: ' + B.money(todaySpent, symbol);

    // Alerta de presupuesto agotado
    $('budget-alert').hidden = remainingBudget > 0;

    // Saldo acumulado (superávit/déficit de días previos)
    var bal = B.getAccruedBalance(trip, expenses);
    var pos = bal >= 0;
    var card = $('balance-card');
    card.setAttribute('class', 'balance-card ' + (pos ? 'positive' : 'negative'));
    $('balance-label').textContent = pos ? 'Saldo acumulado' : 'Déficit acumulado';
    $('balance-amount').textContent = (pos ? '+' : '-') + B.money(Math.abs(bal), symbol);
    $('balance-icon').textContent = pos ? '▲' : '▼';

    // Lista de gastos de hoy
    var todays = expenses.filter(function (e) { return e.date === B.todayISO(); });
    clearChildren(list);
    if (todays.length === 0) {
      empty.hidden = false;
    } else {
      empty.hidden = true;
      todays.forEach(function (e) { list.appendChild(expenseItem(e, symbol)); });
    }
  }

  // ---- Pantalla HISTORIAL -------------------------------------------------

  function renderHistory(trip, expenses) {
    var symbol = trip.currency;
    var currentDay = B.getCurrentDay(trip.startDate);
    var listEl = $('history-list');
    var openEl = listEl.querySelector('.day-item.open');
    var openDate = openEl ? openEl.dataset.date : null;
    clearChildren(listEl);

    // De más reciente a más antiguo.
    for (var day = trip.totalDays; day >= 1; day--) {
      var iso = B.isoForDay(trip.startDate, day);
      var li = document.createElement('li');
      li.className = 'day-item';
      li.dataset.day = String(day);
      li.dataset.date = iso;

      var isFuture = day > currentDay;

      var header = document.createElement('button');
      header.type = 'button';
      header.className = 'day-header';

      var title = document.createElement('div');
      title.className = 'day-title';
      title.textContent = 'Día ' + day + ' · ' + formatDateLong(iso);
      header.appendChild(title);

      if (isFuture) {
        li.classList.add('future');
        var pend = document.createElement('span');
        pend.className = 'day-pending';
        pend.textContent = 'Pendiente';
        header.appendChild(pend);
        header.disabled = true;
        li.appendChild(header);
        listEl.appendChild(li);
        continue;
      }

      var spent = B.sumExpensesForDate(expenses, iso);
      var dynBudget = B.getDynamicBudgetForDay(day, expenses, trip);
      var withinBudget = dynBudget === null ? true : spent <= dynBudget;

      var meta = document.createElement('div');
      meta.className = 'day-meta';
      var spentLine = document.createElement('span');
      spentLine.className = 'day-spent';
      spentLine.textContent = B.money(spent, symbol);
      var budgetLine = document.createElement('span');
      budgetLine.className = 'day-budget';
      budgetLine.textContent = 'Presup. ' + (dynBudget === null ? '—' : B.money(dynBudget, symbol));
      meta.appendChild(spentLine);
      meta.appendChild(budgetLine);
      header.appendChild(meta);

      var badge = document.createElement('span');
      if (spent === 0) {
        badge.className = 'badge badge-neutral';
        badge.textContent = 'Sin gastos';
      } else {
        badge.className = 'badge ' + (withinBudget ? 'badge-ok' : 'badge-danger');
        badge.textContent = withinBudget ? 'Dentro del presupuesto' : 'Excedido';
      }
      header.appendChild(badge);

      li.appendChild(header);

      // Cuerpo colapsable
      var body = document.createElement('div');
      body.className = 'day-body';

      var dayExpenses = expenses.filter(function (e) { return e.date === iso; });
      if (dayExpenses.length === 0) {
        var emptyP = document.createElement('p');
        emptyP.className = 'empty-msg';
        emptyP.textContent = 'Sin gastos este día';
        body.appendChild(emptyP);
      } else {
        var ul = document.createElement('ul');
        ul.className = 'expense-list';
        dayExpenses.forEach(function (e) { ul.appendChild(expenseItem(e, symbol)); });
        body.appendChild(ul);
      }

      var addForgotten = document.createElement('button');
      addForgotten.type = 'button';
      addForgotten.className = 'btn btn-secondary btn-block add-forgotten';
      addForgotten.dataset.date = iso;
      addForgotten.textContent = 'Agregar gasto olvidado';
      body.appendChild(addForgotten);

      li.appendChild(body);
      listEl.appendChild(li);
    }

    // Mantener abierto el día que estaba expandido antes del re-render.
    if (openDate) {
      var reopen = listEl.querySelector('.day-item[data-date="' + openDate + '"]');
      if (reopen) reopen.classList.add('open');
    }
  }

  /** Abre/cierra un día del historial (solo uno abierto a la vez). */
  function toggleHistoryDay(dayItem) {
    var wasOpen = dayItem.classList.contains('open');
    Array.prototype.forEach.call(document.querySelectorAll('.day-item.open'), function (el) {
      el.classList.remove('open');
    });
    if (!wasOpen) dayItem.classList.add('open');
  }

  // ---- Pantalla AJUSTES ---------------------------------------------------

  function fillTripForm(form, trip) {
    form.name.value = trip.name;
    form.totalBudget.value = trip.totalBudget;
    form.totalDays.value = trip.totalDays;
    form.startDate.value = trip.startDate;
    form.currency.value = trip.currencyCode || 'EUR';
  }

  function renderStats(trip, expenses) {
    var symbol = trip.currency;
    var s = B.getStats(trip, expenses);
    var box = $('settings-stats');
    clearChildren(box);

    function row(label, value) {
      var r = document.createElement('div');
      r.className = 'stat-row';
      var l = document.createElement('span'); l.className = 'stat-label'; l.textContent = label;
      var v = document.createElement('span'); v.className = 'stat-value'; v.textContent = value;
      r.appendChild(l); r.appendChild(v);
      return r;
    }

    box.appendChild(row('Total gastado hasta hoy', B.money(s.totalSpent, symbol)));
    box.appendChild(row('Días completados / restantes', s.daysCompleted + ' / ' + s.daysRemaining));
    box.appendChild(row('Gasto diario promedio', B.money(s.avgDailySpend, symbol)));

    var proj = document.createElement('p');
    proj.className = 'stat-projection';
    if (s.daysCompleted === 0) {
      proj.textContent = 'Aún no hay días completados para proyectar tu ritmo de gasto.';
    } else {
      var diff = s.projectedDifference;
      var word = diff >= 0 ? 'por debajo' : 'por encima';
      proj.textContent = 'A este ritmo, terminarás el viaje ' + B.money(Math.abs(diff), symbol) + ' ' + word + ' del presupuesto.';
    }
    box.appendChild(proj);
  }

  function renderSettings(trip, expenses) {
    fillTripForm($('settings-form'), trip);
    renderStats(trip, expenses);
  }

  // ---- Validación de formularios -----------------------------------------

  function setFormErrors(form, errors) {
    Array.prototype.forEach.call(form.querySelectorAll('.field-error'), function (span) {
      var key = span.dataset.errorFor;
      span.textContent = errors && errors[key] ? errors[key] : '';
    });
  }

  function showFormMessage(id, text, isError) {
    var el = $(id);
    if (!text) { el.hidden = true; el.textContent = ''; return; }
    el.hidden = false;
    el.textContent = text;
    el.className = 'form-message ' + (isError ? 'error' : 'success');
  }

  // ---- Bottom sheet (agregar gasto) --------------------------------------

  var sheetDate = null;
  var editId = null;

  /** Construye un chip (nombre + monto). `isRepeat` lo destaca con el ícono ↺. */
  function buildChip(it, symbol, isRepeat) {
    var chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'chip' + (isRepeat ? ' chip-repeat' : '');
    chip.dataset.name = it.name;
    chip.dataset.amount = it.amount;

    if (isRepeat) {
      var ic = document.createElement('span');
      ic.className = 'chip-icon';
      ic.textContent = '↺';
      chip.appendChild(ic);
    }
    var n = document.createElement('span');
    n.className = 'chip-name';
    n.textContent = it.name;

    var a = document.createElement('span');
    a.className = 'chip-amount';
    a.textContent = B.money(it.amount, symbol);

    chip.appendChild(n);
    chip.appendChild(a);
    return chip;
  }

  /**
   * Pinta el chip "repetir último" + chips frecuentes + opciones de datalist.
   * El último gasto se excluye de los frecuentes para no duplicarlo.
   */
  function renderSuggestions(items, symbol, last) {
    var box = $('expense-suggestions');
    var datalist = $('expense-name-options');
    clearChildren(box);
    clearChildren(datalist);

    var frequents = items || [];
    if (last) {
      frequents = frequents.filter(function (it) {
        return it.name.toLowerCase() !== last.name.toLowerCase();
      });
    }
    if (!last && !frequents.length) { box.hidden = true; return; }
    box.hidden = false;

    var label = document.createElement('span');
    label.className = 'suggestions-label';
    label.textContent = 'Rápido:';
    box.appendChild(label);

    function addOption(name) {
      var opt = document.createElement('option');
      opt.value = name;
      datalist.appendChild(opt);
    }

    if (last) {
      box.appendChild(buildChip(last, symbol, true));
      addOption(last.name);
    }
    frequents.forEach(function (it) {
      box.appendChild(buildChip(it, symbol, false));
      addOption(it.name);
    });
  }

  function openExpenseSheet(opts) {
    sheetDate = opts.date;
    editId = opts.editId || null;
    $('sheet-title').textContent = opts.title || (editId ? 'Editar gasto' : 'Agregar gasto');
    $('expense-submit').textContent = editId ? 'Guardar' : 'Agregar';
    var form = $('expense-form');
    form.reset();
    showFormMessage('expense-message', '');

    if (editId) {
      form.name.value = opts.name || '';
      form.amount.value = opts.amount;
      renderSuggestions(null, opts.symbol, null); // sin sugerencias al editar
    } else {
      renderSuggestions(opts.suggestions, opts.symbol, opts.last);
    }

    var backdrop = $('sheet-backdrop');
    backdrop.hidden = false;
    requestAnimationFrame(function () { backdrop.classList.add('open'); });
    setTimeout(function () {
      if (editId) { form.amount.focus(); try { form.amount.select(); } catch (e) {} }
      else { form.name.focus(); }
    }, 60);
  }

  function closeExpenseSheet() {
    var backdrop = $('sheet-backdrop');
    backdrop.classList.remove('open');
    setTimeout(function () { backdrop.hidden = true; }, 300);
    sheetDate = null;
    editId = null;
  }

  function getSheetDate() { return sheetDate; }
  function getEditId() { return editId; }
  function isSheetOpen() { return !$('sheet-backdrop').hidden; }

  // ---- Modal de confirmación ---------------------------------------------

  var confirmCallback = null;

  function openConfirm(opts) {
    $('confirm-title').textContent = opts.title || '¿Confirmas?';
    $('confirm-text').textContent = opts.text || '';
    $('confirm-ok').textContent = opts.okLabel || 'Eliminar';
    confirmCallback = opts.onConfirm || null;
    var backdrop = $('confirm-backdrop');
    backdrop.hidden = false;
    requestAnimationFrame(function () { backdrop.classList.add('open'); });
  }

  function closeConfirm() {
    var backdrop = $('confirm-backdrop');
    backdrop.classList.remove('open');
    setTimeout(function () { backdrop.hidden = true; }, 200);
    confirmCallback = null;
  }

  function isConfirmOpen() { return !$('confirm-backdrop').hidden; }

  // ---- Wiring interno de overlays ----------------------------------------

  function init() {
    // Cerrar sheet: cancelar / click en backdrop
    $('expense-cancel').addEventListener('click', closeExpenseSheet);
    $('sheet-backdrop').addEventListener('click', function (e) {
      if (e.target === this) closeExpenseSheet();
    });

    // Chip de sugerencia -> rellena descripción y monto, y enfoca el monto
    $('expense-suggestions').addEventListener('click', function (e) {
      var chip = e.target.closest('.chip');
      if (!chip) return;
      var form = $('expense-form');
      form.name.value = chip.dataset.name;
      if (chip.dataset.amount) form.amount.value = chip.dataset.amount;
      form.amount.focus();
      try { form.amount.select(); } catch (err) {}
    });

    // Confirmación: ok / cancelar / backdrop
    $('confirm-ok').addEventListener('click', function () {
      var cb = confirmCallback;
      closeConfirm();
      if (cb) cb();
    });
    $('confirm-cancel').addEventListener('click', closeConfirm);
    $('confirm-backdrop').addEventListener('click', function (e) {
      if (e.target === this) closeConfirm();
    });

    // Escape cierra el overlay activo
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      if (isConfirmOpen()) closeConfirm();
      else if (isSheetOpen()) closeExpenseSheet();
    });
  }

  global.UI = {
    init: init,
    showScreen: showScreen,
    renderToday: renderToday,
    renderHistory: renderHistory,
    renderSettings: renderSettings,
    toggleHistoryDay: toggleHistoryDay,
    fillTripForm: fillTripForm,
    setFormErrors: setFormErrors,
    showFormMessage: showFormMessage,
    openExpenseSheet: openExpenseSheet,
    closeExpenseSheet: closeExpenseSheet,
    getSheetDate: getSheetDate,
    getEditId: getEditId,
    openConfirm: openConfirm,
    closeConfirm: closeConfirm
  };
})(window);
