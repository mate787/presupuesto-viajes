/**
 * storage.js — CRUD sobre localStorage para `trip` y `expenses`.
 * Expone un objeto global `Store`. Sin dependencias de DOM.
 */
(function (global) {
  'use strict';

  var TRIP_KEY = 'trip';
  var EXPENSES_KEY = 'expenses';

  /** Lee y parsea una clave. Devuelve `fallback` si no existe o está corrupta. */
  function read(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      if (raw === null) return fallback;
      return JSON.parse(raw);
    } catch (e) {
      console.error('Store.read falló para "' + key + '":', e);
      return fallback;
    }
  }

  /**
   * Escribe un valor serializado. Lanza un Error con mensaje amigable si
   * localStorage no está disponible o está lleno (quota).
   */
  function write(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      console.error('Store.write falló para "' + key + '":', e);
      throw new Error('No se pudieron guardar los datos. Es posible que el almacenamiento esté lleno o no disponible.');
    }
  }

  var Store = {
    // ---- Trip -------------------------------------------------------------
    getTrip: function () {
      return read(TRIP_KEY, null);
    },
    saveTrip: function (trip) {
      write(TRIP_KEY, trip);
    },
    hasTrip: function () {
      return this.getTrip() !== null;
    },

    // ---- Expenses ---------------------------------------------------------
    getExpenses: function () {
      var list = read(EXPENSES_KEY, []);
      return Array.isArray(list) ? list : [];
    },
    saveExpenses: function (expenses) {
      write(EXPENSES_KEY, expenses);
    },
    addExpense: function (expense) {
      var list = this.getExpenses();
      list.push(expense);
      this.saveExpenses(list);
      return list;
    },
    removeExpense: function (id) {
      var list = this.getExpenses().filter(function (e) { return e.id !== id; });
      this.saveExpenses(list);
      return list;
    },
    /** Actualiza nombre/monto de un gasto, conservando id y fecha. */
    updateExpense: function (id, fields) {
      var list = this.getExpenses().map(function (e) {
        if (e.id !== id) return e;
        return { id: e.id, date: e.date, name: fields.name, amount: fields.amount };
      });
      this.saveExpenses(list);
      return list;
    },
    /** Reinicia solo los gastos (mantiene la configuración del viaje). */
    clearExpenses: function () {
      this.saveExpenses([]);
    },
    /** Inicializa expenses como [] si aún no existe la clave. */
    initExpenses: function () {
      if (localStorage.getItem(EXPENSES_KEY) === null) {
        this.saveExpenses([]);
      }
    }
  };

  global.Store = Store;
})(window);
