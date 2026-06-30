/**
 * app.js — Entry point. Orquesta Store + Budget + UI:
 * inicialización, routing de pestañas, primera apertura y todos los eventos.
 */
(function (global) {
  'use strict';

  var Store = global.Store;
  var B = global.Budget;
  var UI = global.UI;

  var currentTab = 'today';

  // ---- Utilidades ---------------------------------------------------------

  function genId() {
    if (global.crypto && typeof global.crypto.randomUUID === 'function') {
      return global.crypto.randomUUID();
    }
    return Date.now().toString(36) + Math.random().toString(36).slice(2);
  }

  /** Lee un formulario de viaje (onboarding o ajustes) a un objeto trip. */
  function readTripForm(form) {
    var code = form.currency.value;
    return {
      name: form.name.value.trim(),
      totalBudget: parseFloat(form.totalBudget.value),
      totalDays: parseInt(form.totalDays.value, 10),
      startDate: form.startDate.value,
      currency: B.symbolFor(code),
      currencyCode: code
    };
  }

  /** Valida un trip; devuelve un mapa de errores (vacío si es válido). */
  function validateTrip(trip) {
    var errors = {};
    if (!trip.name) errors.name = 'Ingresa un nombre.';
    if (!isFinite(trip.totalBudget) || trip.totalBudget <= 0) errors.totalBudget = 'Ingresa un presupuesto mayor a 0.';
    if (!isFinite(trip.totalDays) || trip.totalDays < 1 || trip.totalDays > 365) errors.totalDays = 'Entre 1 y 365 días.';
    if (!trip.startDate) errors.startDate = 'Selecciona una fecha.';
    if (!trip.currencyCode) errors.currency = 'Selecciona una moneda.';
    return errors;
  }

  function hasErrors(errors) {
    for (var k in errors) { if (errors.hasOwnProperty(k)) return true; }
    return false;
  }

  // ---- Render dispatch ----------------------------------------------------

  function renderTab(name) {
    var trip = Store.getTrip();
    var expenses = Store.getExpenses();
    if (name === 'today') UI.renderToday(trip, expenses);
    else if (name === 'history') UI.renderHistory(trip, expenses);
    else if (name === 'settings') UI.renderSettings(trip, expenses);
  }

  function switchTab(name) {
    currentTab = name;
    UI.showScreen(name);
    renderTab(name);
  }

  /** Re-renderiza la pestaña activa (tras agregar/eliminar gastos). */
  function refresh() { renderTab(currentTab); }

  // ---- Onboarding ---------------------------------------------------------

  function handleOnboardingSubmit(e) {
    e.preventDefault();
    var form = e.target;
    var trip = readTripForm(form);
    var errors = validateTrip(trip);
    UI.setFormErrors(form, errors);
    if (hasErrors(errors)) return;

    try {
      Store.saveTrip(trip);
      Store.clearExpenses(); // inicializa expenses = []
    } catch (err) {
      UI.showFormMessage('onboarding-message', err.message, true);
      return;
    }
    switchTab('today');
  }

  // ---- Ajustes ------------------------------------------------------------

  function handleSettingsSubmit(e) {
    e.preventDefault();
    var form = e.target;
    var trip = readTripForm(form);
    var errors = validateTrip(trip);
    UI.setFormErrors(form, errors);
    if (hasErrors(errors)) return;

    try {
      Store.saveTrip(trip);
    } catch (err) {
      UI.showFormMessage('settings-message', err.message, true);
      return;
    }

    // Avisar si quedan gastos fuera del rango del nuevo viaje (no se borran).
    var expenses = Store.getExpenses();
    var stranded = expenses.filter(function (ex) {
      var d = B.dayNumberForDate(trip.startDate, ex.date);
      return d < 1 || d > trip.totalDays;
    }).length;

    if (stranded > 0) {
      UI.showFormMessage('settings-message',
        'Cambios guardados. Atención: ' + stranded + ' gasto(s) quedan fuera del rango del viaje y no aparecen en el historial.', true);
    } else {
      UI.showFormMessage('settings-message', 'Cambios guardados.', false);
    }

    renderTab('settings');
  }

  function handleResetTrip() {
    UI.openConfirm({
      title: '¿Confirmas?',
      text: 'Todos los gastos serán eliminados permanentemente. La configuración del viaje se mantiene.',
      okLabel: 'Eliminar gastos',
      onConfirm: function () {
        Store.clearExpenses();
        refresh();
      }
    });
  }

  // ---- Backup: exportar / importar ---------------------------------------

  function handleExport() {
    var trip = Store.getTrip();
    var data = { version: 1, exportedAt: new Date().toISOString(), trip: trip, expenses: Store.getExpenses() };
    var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var slug = (trip && trip.name ? trip.name : 'viaje').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'viaje';
    var a = document.createElement('a');
    a.href = url;
    a.download = 'presupuesto-' + slug + '.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function handleImportFile(e) {
    var file = e.target.files && e.target.files[0];
    e.target.value = ''; // permite reimportar el mismo archivo
    if (!file) return;

    var reader = new FileReader();
    reader.onload = function () {
      var data;
      try { data = JSON.parse(reader.result); }
      catch (err) { UI.showFormMessage('settings-message', 'Archivo inválido: no es JSON.', true); return; }

      if (!data || !data.trip || typeof data.trip !== 'object' || !Array.isArray(data.expenses)) {
        UI.showFormMessage('settings-message', 'El archivo no contiene datos de viaje válidos.', true);
        return;
      }
      if (hasErrors(validateTrip(data.trip))) {
        UI.showFormMessage('settings-message', 'La configuración del viaje en el archivo no es válida.', true);
        return;
      }
      UI.openConfirm({
        title: 'Importar datos',
        text: 'Se reemplazará tu viaje y gastos actuales por los del archivo. ¿Continuar?',
        okLabel: 'Importar',
        onConfirm: function () {
          try {
            Store.saveTrip(data.trip);
            Store.saveExpenses(data.expenses);
          } catch (err) {
            UI.showFormMessage('settings-message', err.message, true);
            return;
          }
          switchTab('today');
        }
      });
    };
    reader.readAsText(file);
  }

  // ---- Agregar / eliminar gastos -----------------------------------------

  function handleAddExpenseToday() {
    UI.openExpenseSheet({
      date: B.todayISO(),
      title: 'Agregar gasto',
      symbol: Store.getTrip().currency,
      last: B.getLastExpense(Store.getExpenses()),
      suggestions: B.getExpenseSuggestions(Store.getExpenses(), 5)
    });
  }

  function handleExpenseSubmit(e) {
    e.preventDefault();
    var form = e.target;
    var amount = parseFloat(form.amount.value);
    var name = form.name.value.trim();

    if (!isFinite(amount) || amount <= 0) {
      UI.showFormMessage('expense-message', 'Ingresa un monto mayor a 0.', true);
      return;
    }

    var editId = UI.getEditId();
    try {
      if (editId) {
        Store.updateExpense(editId, { name: name || 'Gasto', amount: amount });
      } else {
        Store.addExpense({ id: genId(), date: UI.getSheetDate(), name: name || 'Gasto', amount: amount });
      }
    } catch (err) {
      UI.showFormMessage('expense-message', err.message, true);
      return;
    }
    UI.closeExpenseSheet();
    refresh();
  }

  function editExpense(id) {
    var list = Store.getExpenses(), ex = null;
    for (var i = 0; i < list.length; i++) { if (list[i].id === id) { ex = list[i]; break; } }
    if (!ex) return;
    UI.openExpenseSheet({
      editId: ex.id,
      date: ex.date,
      name: ex.name,
      amount: ex.amount,
      title: 'Editar gasto',
      symbol: Store.getTrip().currency
    });
  }

  function requestDeleteExpense(id) {
    UI.openConfirm({
      title: 'Eliminar gasto',
      text: '¿Seguro que quieres eliminar este gasto?',
      okLabel: 'Eliminar',
      onConfirm: function () {
        Store.removeExpense(id);
        refresh();
      }
    });
  }

  // ---- Delegación de clicks (listas dinámicas) ---------------------------

  function handleDelegatedClick(e) {
    var delBtn = e.target.closest('.expense-delete');
    if (delBtn) { requestDeleteExpense(delBtn.dataset.id); return; }

    var editBtn = e.target.closest('.expense-edit');
    if (editBtn) { editExpense(editBtn.dataset.id); return; }

    var forgotten = e.target.closest('.add-forgotten');
    if (forgotten) {
      UI.openExpenseSheet({
        date: forgotten.dataset.date,
        title: 'Agregar gasto olvidado',
        symbol: Store.getTrip().currency,
        last: B.getLastExpense(Store.getExpenses()),
        suggestions: B.getExpenseSuggestions(Store.getExpenses(), 5)
      });
      return;
    }

    var header = e.target.closest('.day-header');
    if (header && !header.disabled) {
      UI.toggleHistoryDay(header.closest('.day-item'));
      return;
    }
  }

  // ---- Inicialización -----------------------------------------------------

  function init() {
    UI.init();

    // Tabs
    Array.prototype.forEach.call(document.querySelectorAll('.tab'), function (tab) {
      tab.addEventListener('click', function () { switchTab(tab.dataset.tab); });
    });

    // Formularios
    document.getElementById('onboarding-form').addEventListener('submit', handleOnboardingSubmit);
    document.getElementById('settings-form').addEventListener('submit', handleSettingsSubmit);
    document.getElementById('expense-form').addEventListener('submit', handleExpenseSubmit);

    // Botones
    document.getElementById('add-expense-btn').addEventListener('click', handleAddExpenseToday);
    document.getElementById('reset-trip-btn').addEventListener('click', handleResetTrip);
    document.getElementById('export-btn').addEventListener('click', handleExport);
    document.getElementById('import-btn').addEventListener('click', function () {
      document.getElementById('import-file').click();
    });
    document.getElementById('import-file').addEventListener('change', handleImportFile);

    // Clicks delegados para listas (gastos de hoy + historial)
    document.getElementById('app').addEventListener('click', handleDelegatedClick);

    // Primera apertura
    if (!Store.hasTrip()) {
      document.querySelector('#onboarding-form [name="startDate"]').value = B.todayISO();
      UI.showScreen('onboarding');
    } else {
      Store.initExpenses();
      switchTab('today');
    }

    // Service worker para uso offline (requiere https o localhost)
    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').catch(function (err) {
        console.warn('No se pudo registrar el service worker:', err);
      });
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})(window);
