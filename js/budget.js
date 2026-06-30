/**
 * budget.js — Lógica de cálculo PURA (sin DOM, sin efectos secundarios).
 * Expone un objeto global `Budget`.
 *
 * Modelo central (decisión del proyecto): el presupuesto dinámico de un día se
 * calcula con los gastos de días ANTERIORES a ese día. Así el número de "hoy"
 * es estable durante el día y queda unificado con el historial.
 *
 *   presupuesto(día N) = (totalBudget - gastos de días < N) / (totalDays - N + 1)
 */
(function (global) {
  'use strict';

  // Símbolo por código de moneda (varias monedas comparten "$").
  var CURRENCIES = {
    EUR: '€', USD: '$', GBP: '£', CHF: 'Fr',
    ARS: '$', MXN: '$', PEN: 'S/', COP: 'Col$'
  };

  // ---- Fechas (DST-safe, por componentes de fecha) ------------------------

  /** Convierte "YYYY-MM-DD" en milisegundos UTC de medianoche (sin DST). */
  function parseISO(iso) {
    var p = String(iso).split('-');
    return Date.UTC(+p[0], +p[1] - 1, +p[2]);
  }

  /** Fecha local de hoy en formato ISO "YYYY-MM-DD". */
  function todayISO() {
    return new Date().toLocaleDateString('en-CA');
  }

  /** Diferencia en días enteros entre dos fechas ISO (b - a). */
  function daysBetween(isoA, isoB) {
    return Math.round((parseISO(isoB) - parseISO(isoA)) / 86400000);
  }

  // ---- Días del viaje -----------------------------------------------------

  /** Número de día del viaje para hoy (1-indexed). <=0 si el viaje es futuro. */
  function getCurrentDay(startDate) {
    return daysBetween(startDate, todayISO()) + 1;
  }

  /** Día del viaje (1-indexed) al que pertenece una fecha de gasto. */
  function dayNumberForDate(startDate, isoDate) {
    return daysBetween(startDate, isoDate) + 1;
  }

  /** Fecha ISO "YYYY-MM-DD" del día N del viaje (1-indexed). DST-safe. */
  function isoForDay(startDate, dayNumber) {
    var d = new Date(parseISO(startDate) + (dayNumber - 1) * 86400000);
    return d.toISOString().slice(0, 10);
  }

  /** Días restantes incluyendo hoy. Puede ser <=0 si el viaje terminó. */
  function getRemainingDays(startDate, totalDays) {
    return totalDays - getCurrentDay(startDate) + 1;
  }

  // ---- Sumas de gastos ----------------------------------------------------

  /** Suma de montos de los gastos de una fecha ISO concreta. */
  function sumExpensesForDate(expenses, isoDate) {
    return expenses.reduce(function (acc, e) {
      return e.date === isoDate ? acc + e.amount : acc;
    }, 0);
  }

  /** Suma total de todos los gastos. */
  function sumAll(expenses) {
    return expenses.reduce(function (acc, e) { return acc + e.amount; }, 0);
  }

  // ---- Presupuesto dinámico ----------------------------------------------

  /**
   * Presupuesto dinámico de un día N concreto, calculado con los gastos de los
   * días ANTERIORES a N. Devuelve null si el denominador (días restantes desde
   * ese día) es <= 0, para nunca dividir por cero.
   */
  function getDynamicBudgetForDay(dayNumber, allExpenses, trip) {
    var remaining = trip.totalDays - dayNumber + 1;
    if (remaining <= 0) return null;
    var spentBefore = allExpenses.reduce(function (acc, e) {
      return dayNumberForDate(trip.startDate, e.date) < dayNumber ? acc + e.amount : acc;
    }, 0);
    return (trip.totalBudget - spentBefore) / remaining;
  }

  /**
   * EL número principal de la app: presupuesto dinámico de hoy.
   * Es exactamente getDynamicBudgetForDay aplicado al día actual.
   * Devuelve null si el viaje ya terminó (remainingDays <= 0).
   */
  function getDynamicDailyBudget(trip, expenses) {
    return getDynamicBudgetForDay(getCurrentDay(trip.startDate), expenses, trip);
  }

  /** Gasto total de hoy. */
  function getTodaySpent(expenses) {
    return sumExpensesForDate(expenses, todayISO());
  }

  /** Cuánto queda hoy del presupuesto dinámico. */
  function getTodayRemaining(dynamicDaily, todaySpent) {
    return dynamicDaily - todaySpent;
  }

  // ---- Estadísticas -------------------------------------------------------

  function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }

  /**
   * Estadísticas para Ajustes.
   *  - totalSpent: gastado total.
   *  - daysCompleted: días transcurridos antes de hoy (0..totalDays).
   *  - daysRemaining: días restantes incluyendo hoy (0..totalDays).
   *  - avgDailySpend: gasto diario promedio sobre días completados.
   *  - projectedDifference: totalBudget - (avg * totalDays).
   *      positivo => terminarás por debajo; negativo => por encima.
   */
  function getStats(trip, expenses) {
    var totalSpent = sumAll(expenses);
    var currentDay = getCurrentDay(trip.startDate);
    var daysCompleted = clamp(currentDay - 1, 0, trip.totalDays);
    var daysRemaining = clamp(getRemainingDays(trip.startDate, trip.totalDays), 0, trip.totalDays);
    var avgDailySpend = daysCompleted > 0 ? totalSpent / daysCompleted : 0;
    var projectedDifference = trip.totalBudget - (avgDailySpend * trip.totalDays);
    return {
      totalSpent: totalSpent,
      daysCompleted: daysCompleted,
      daysRemaining: daysRemaining,
      avgDailySpend: avgDailySpend,
      projectedDifference: projectedDifference
    };
  }

  /**
   * Saldo acumulado: superávit (+) o déficit (-) generado por los días ANTERIORES
   * a hoy, respecto al presupuesto plano por día. Es lo que el modelo dinámico
   * reparte entre los días restantes; sirve para explicar por qué el número de hoy
   * sube o baja respecto al promedio.
   *   = (totalBudget / totalDays) * díasCompletados - gastos de días anteriores a hoy
   */
  function getAccruedBalance(trip, expenses) {
    var currentDay = getCurrentDay(trip.startDate);
    var daysCompleted = clamp(currentDay - 1, 0, trip.totalDays);
    var flatDaily = trip.totalBudget / trip.totalDays;
    var spentBefore = expenses.reduce(function (acc, e) {
      return dayNumberForDate(trip.startDate, e.date) < currentDay ? acc + e.amount : acc;
    }, 0);
    return flatDaily * daysCompleted - spentBefore;
  }

  /**
   * Sugerencias para agregar un gasto, derivadas de los gastos ya guardados
   * (sin persistencia extra). Dedup case-insensitive. Cada item:
   *   { name, amount, count }
   * donde `name`/`amount` son los de la ocurrencia MÁS RECIENTE y `count` la
   * frecuencia. Ordenadas por frecuencia desc, desempate por recencia.
   */
  function getExpenseSuggestions(expenses, limit) {
    limit = limit || 5;
    var map = {}, list = [], k;
    for (var i = 0; i < expenses.length; i++) {
      var name = (expenses[i].name || '').trim();
      if (!name) continue;
      var key = name.toLowerCase();
      var entry = map[key];
      if (!entry) { entry = map[key] = { name: name, amount: expenses[i].amount, count: 0, lastIndex: i }; }
      entry.count++;
      // i crece, así que la última pasada deja nombre/monto de la ocurrencia más reciente
      entry.name = name;
      entry.amount = expenses[i].amount;
      entry.lastIndex = i;
    }
    for (k in map) { if (map.hasOwnProperty(k)) list.push(map[k]); }
    list.sort(function (a, b) {
      if (b.count !== a.count) return b.count - a.count; // más frecuente primero
      return b.lastIndex - a.lastIndex;                  // empate: más reciente primero
    });
    return list.slice(0, limit);
  }

  /** El gasto más reciente (con nombre no vacío) para el chip "repetir último". */
  function getLastExpense(expenses) {
    for (var i = expenses.length - 1; i >= 0; i--) {
      var name = (expenses[i].name || '').trim();
      if (name) return { name: name, amount: expenses[i].amount };
    }
    return null;
  }

  // ---- Formato / moneda ---------------------------------------------------

  /** Símbolo para un código de moneda. */
  function symbolFor(code) {
    return CURRENCIES[code] || code || '';
  }

  /**
   * Formatea un importe con símbolo y SIEMPRE 2 decimales (toFixed).
   * Nunca expone artefactos de floating point. Negativos como "-€5.00".
   */
  function money(amount, symbol) {
    symbol = symbol || '';
    var n = Number(amount);
    if (!isFinite(n)) n = 0;
    if (n < 0) return '-' + symbol + Math.abs(n).toFixed(2);
    return symbol + n.toFixed(2);
  }

  global.Budget = {
    CURRENCIES: CURRENCIES,
    todayISO: todayISO,
    daysBetween: daysBetween,
    getCurrentDay: getCurrentDay,
    dayNumberForDate: dayNumberForDate,
    isoForDay: isoForDay,
    getRemainingDays: getRemainingDays,
    sumExpensesForDate: sumExpensesForDate,
    sumAll: sumAll,
    getDynamicBudgetForDay: getDynamicBudgetForDay,
    getDynamicDailyBudget: getDynamicDailyBudget,
    getTodaySpent: getTodaySpent,
    getTodayRemaining: getTodayRemaining,
    getStats: getStats,
    getAccruedBalance: getAccruedBalance,
    getExpenseSuggestions: getExpenseSuggestions,
    getLastExpense: getLastExpense,
    symbolFor: symbolFor,
    money: money
  };
})(window);
