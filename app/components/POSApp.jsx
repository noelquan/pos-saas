"use client";
import React, { useEffect, useState } from "react";
import {
  X,
  Calendar,
  Edit2,
  Trash2,
  Save,
  Receipt,
  FileText,
  List,
  Package,
  Settings,
  Sun,
  Moon,
} from "lucide-react";

import {
  ensureShop,
  loadItems,
  replaceItems,
  loadTransactions,
  insertTransaction,
  updateTransaction,
  nextDailyNumber,
} from "../../lib/storage";

export default function POSApp() {
  const [items, setItems] = useState([]);
  const [transactions, setTransactions] = useState([]);

  const [showItemManager, setShowItemManager] = useState(false);
  const [showCalendar, setShowCalendar] = useState(false);
  const [showTransactions, setShowTransactions] = useState(false);
  const [showReceiptsView, setShowReceiptsView] = useState(false);
  const [showInvoicesView, setShowInvoicesView] = useState(false);

  const [selectedDate, setSelectedDate] = useState(null);
  const [calendarMonth, setCalendarMonth] = useState(new Date());

  const [viewingTransaction, setViewingTransaction] = useState(null);
  const [editingTransaction, setEditingTransaction] = useState(null);

  const [showReceipt, setShowReceipt] = useState(false);
  const [showInvoice, setShowInvoice] = useState(false);

  // New item form
  const [newItem, setNewItem] = useState({ name: "", price: "", category: "" });

  // Current sale
  const [currentSale, setCurrentSale] = useState([]);
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [customerName, setCustomerName] = useState("");

  const [showQuickItem, setShowQuickItem] = useState(false);
  const [quickItem, setQuickItem] = useState({ name: "", price: "", quantity: 1 });

  const [showCashModal, setShowCashModal] = useState(false);
  const [cashTransaction, setCashTransaction] = useState({ type: "out", reason: "", amount: "" });

  const [isProcessing, setIsProcessing] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [darkMode, setDarkMode] = useState(false);

  const [shop, setShop] = useState(null);
  const [loading, setLoading] = useState(true);

  // -----------------------------
  // Small utils
  // -----------------------------
  const clampInt = (value, min, fallback) => {
    const n = parseInt(value, 10);
    if (Number.isNaN(n)) return fallback;
    return Math.max(min, n);
  };

  const toNum = (v, fallback = 0) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  };

  const money = (v) => toNum(v, 0).toFixed(2);

  const makeId = (prefix = "id") => {
    try {
      if (typeof crypto !== "undefined" && crypto.randomUUID) return `${prefix}_${crypto.randomUUID()}`;
    } catch (_) {
      // ignore
    }
    return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  };

  const persistThemeLocal = (value) => {
    try {
      localStorage.setItem("pos-dark-mode", JSON.stringify(!!value));
    } catch (_) {
      // non-fatal
    }
  };

  const loadThemeLocal = () => {
    try {
      const raw = localStorage.getItem("pos-dark-mode");
      if (!raw) return null;
      return Boolean(JSON.parse(raw));
    } catch (_) {
      return null;
    }
  };

  const refreshAll = async (shopId) => {
    const [loadedItems, loadedTxs] = await Promise.all([loadItems(shopId), loadTransactions(shopId)]);
    setItems(Array.isArray(loadedItems) ? loadedItems : []);
    setTransactions(
      (Array.isArray(loadedTxs) ? loadedTxs : []).slice().sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
    );
  };

  // -----------------------------
  // Ledger helper (recompute from scratch every render)
  // -----------------------------
  const computeDailySummary = (txs) => {
    const sorted = [...txs].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    let runningBalance = 0;
    const rows = [];

    sorted.forEach((tx) => {
      const itemsArr = Array.isArray(tx.items) ? tx.items : [];
      const cancelled = !!tx.cancelled;
      const isCash = tx.paymentMethod === "cash" && !cancelled;

      // If a tx somehow has no items, still show a single row so it’s clickable/visible.
      const safeItems = itemsArr.length > 0 ? itemsArr : [{ name: "(no items)", quantity: 0, price: 0, subtotal: toNum(tx.total, 0) }];

      safeItems.forEach((item, idx) => {
        const sub = toNum(item.subtotal, toNum(item.price, 0) * toNum(item.quantity, 0));
        if (isCash) runningBalance += sub;

        rows.push({
          txId: tx.id,
          timestamp: tx.timestamp,
          item: {
            ...item,
            quantity: toNum(item.quantity, 0),
            price: toNum(item.price, 0),
            subtotal: sub,
          },
          itemIndex: idx,
          totalItems: safeItems.length,
          paymentMethod: tx.paymentMethod,
          cancelled,
          edited: (tx.editHistory || []).length > 0,
          type: tx.type || "sale",
          runningBalance: isCash ? runningBalance : null,
        });
      });
    });

    return { sortedTxs: sorted, rows };
  };

  // -----------------------------
  // Init: shop + items + txs
  // -----------------------------
  useEffect(() => {
    (async () => {
      try {
        const localTheme = loadThemeLocal();
        if (localTheme !== null) setDarkMode(localTheme);

        const s = await ensureShop();
        setShop(s);

        await refreshAll(s.id);
      } catch (err) {
        alert(err?.message || String(err));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    persistThemeLocal(darkMode);
  }, [darkMode]);

  if (loading) return <div className="p-6">Loading...</div>;

  // -----------------------------
  // Items CRUD (Supabase)
  // -----------------------------
  const saveItemsSupabase = async (newItems) => {
    if (!shop) throw new Error("Shop not ready");
    const prev = items;
    setItems(newItems);
    try {
      await replaceItems(shop.id, newItems);
      // Keep canonical (in case server normalizes)
      await refreshAll(shop.id);
    } catch (e) {
      setItems(prev); // rollback UI if save fails
      throw e;
    }
  };

  const addItem = async () => {
    if (!newItem.name || !newItem.price) {
      alert("Please enter item name and price");
      return;
    }

    const item = {
      id: makeId("item"),
      name: newItem.name,
      price: toNum(newItem.price, 0),
      category: newItem.category || "General",
    };

    try {
      await saveItemsSupabase([...items, item]);
      setNewItem({ name: "", price: "", category: "" });
    } catch (e) {
      alert("Error saving items: " + (e?.message || String(e)));
    }
  };

  const deleteItem = async (id) => {
    try {
      const newItems = items.filter((i) => i.id !== id);
      await saveItemsSupabase(newItems);
    } catch (e) {
      alert("Error deleting item: " + (e?.message || String(e)));
    }
  };

  // -----------------------------
  // Sale helpers
  // -----------------------------
  const addToSale = (item) => {
    const existing = currentSale.find((i) => i.id === item.id);
    if (existing) {
      setCurrentSale(currentSale.map((i) => (i.id === item.id ? { ...i, quantity: i.quantity + 1 } : i)));
    } else {
      setCurrentSale([...currentSale, { ...item, quantity: 1 }]);
    }
  };

  const updateQuantity = (id, quantity) => {
    if (quantity <= 0) {
      setCurrentSale(currentSale.filter((i) => i.id !== id));
    } else {
      setCurrentSale(currentSale.map((i) => (i.id === id ? { ...i, quantity } : i)));
    }
  };

  const addQuickItemToSale = () => {
    if (!quickItem.name || !quickItem.price || !quickItem.quantity) {
      alert("Please fill in all fields");
      return;
    }

    const tempItem = {
      id: makeId("quick"),
      name: quickItem.name,
      price: toNum(quickItem.price, 0),
      quantity: clampInt(quickItem.quantity, 1, 1),
      category: "Quick Sale",
    };

    setCurrentSale([...currentSale, tempItem]);
    setQuickItem({ name: "", price: "", quantity: 1 });
    setShowQuickItem(false);
  };

  // -----------------------------
  // Cash In/Out (Supabase tx)
  // -----------------------------
  const recordCashTransaction = async () => {
    if (!shop) return alert("Shop not ready yet");
    if (!cashTransaction.reason || !cashTransaction.amount) {
      alert("Please enter reason and amount");
      return;
    }

    const amount = toNum(cashTransaction.amount, NaN);
    if (!Number.isFinite(amount) || amount <= 0) {
      alert("Please enter a valid amount");
      return;
    }

    setIsProcessing(true);

    try {
      const number = await nextDailyNumber(shop.id);
      const txId = makeId("tx");

      const isOut = cashTransaction.type === "out";
      const signed = isOut ? -amount : amount;

      const transaction = {
        id: txId,
        timestamp: new Date().toISOString(),
        customerName: "",
        items: [
          {
            name: `Cash ${isOut ? "Out" : "In"}: ${cashTransaction.reason}`,
            price: signed,
            quantity: 1,
            subtotal: signed,
          },
        ],
        total: signed,
        paymentMethod: "cash",
        receiptNumber: number,
        invoiceNumber: null,
        editHistory: [],
        cancelled: false,
        isCashTransaction: true,
        cashType: cashTransaction.type,
        type: isOut ? "cash-out" : "cash-in",
      };

      await insertTransaction(shop.id, transaction);
      await refreshAll(shop.id);

      setCashTransaction({ type: "out", reason: "", amount: "" });
      setShowCashModal(false);
      alert(`Cash ${cashTransaction.type} recorded! Receipt #${number}`);
    } catch (error) {
      console.error("Error saving cash transaction:", error);
      alert("Failed to save cash transaction: " + (error?.message || String(error)));
    } finally {
      setIsProcessing(false);
    }
  };

  // -----------------------------
  // Complete Sale (Supabase tx)
  // -----------------------------
  const completeSale = async () => {
    if (!shop) return alert("Shop not ready yet");
    if (currentSale.length === 0) {
      alert("No items in sale");
      return;
    }

    if (paymentMethod === "credit" && !customerName.trim()) {
      alert("Customer name is required for credit sales");
      return;
    }

    setIsProcessing(true);

    try {
      const number = await nextDailyNumber(shop.id);
      const txId = makeId("tx");

      const txItems = currentSale.map((i) => {
        const price = toNum(i.price, 0);
        const qty = toNum(i.quantity, 0);
        return {
          name: i.name,
          price,
          quantity: qty,
          subtotal: price * qty,
        };
      });

      const total = txItems.reduce((sum, i) => sum + toNum(i.subtotal, 0), 0);

      const transaction = {
        id: txId,
        timestamp: new Date().toISOString(),
        customerName: customerName.trim(),
        items: txItems,
        total,
        paymentMethod,
        receiptNumber: paymentMethod === "cash" ? number : null,
        invoiceNumber: paymentMethod === "credit" ? number : null,
        editHistory: [],
        cancelled: false,
        type: "sale",
      };

      await insertTransaction(shop.id, transaction);
      await refreshAll(shop.id);

      setCurrentSale([]);
      setPaymentMethod("cash");
      setCustomerName("");
      alert(`${paymentMethod === "cash" ? "Receipt" : "Invoice"} #${number} created!`);
    } catch (error) {
      console.error("Error saving transaction:", error);
      alert("Failed to save transaction: " + (error?.message || String(error)));
    } finally {
      setIsProcessing(false);
    }
  };

  // -----------------------------
  // Edit / Cancel Tx (Supabase)
  // -----------------------------
  const saveEditedTransaction = async () => {
    if (!shop) return alert("Shop not ready yet");
    if (!editingTransaction || !viewingTransaction) return;

    setIsProcessing(true);

    try {
      const changes = [];
      const original = viewingTransaction;

      if (original.timestamp !== editingTransaction.timestamp) {
        changes.push({
          field: "Time",
          from: new Date(original.timestamp).toLocaleString(),
          to: new Date(editingTransaction.timestamp).toLocaleString(),
        });
      }

      if ((original.customerName || "") !== (editingTransaction.customerName || "")) {
        changes.push({
          field: "Customer Name",
          from: original.customerName || "(none)",
          to: editingTransaction.customerName || "(none)",
        });
      }

      if (JSON.stringify(original.items) !== JSON.stringify(editingTransaction.items)) {
        (original.items || []).forEach((oldItem, idx) => {
          const newIt = (editingTransaction.items || [])[idx];
          if (!newIt) return;
          if (oldItem.name !== newIt.name) changes.push({ field: `Item ${idx + 1} Name`, from: oldItem.name, to: newIt.name });
          if (oldItem.price !== newIt.price) changes.push({ field: `Item ${idx + 1} Price`, from: `$${oldItem.price}`, to: `$${newIt.price}` });
          if (oldItem.quantity !== newIt.quantity) changes.push({ field: `Item ${idx + 1} Quantity`, from: oldItem.quantity, to: newIt.quantity });
        });

        if ((editingTransaction.items || []).length !== (original.items || []).length) {
          changes.push({ field: "Items Count", from: (original.items || []).length, to: (editingTransaction.items || []).length });
        }
      }

      const normalizedItems = (editingTransaction.items || []).map((it) => {
        const price = toNum(it.price, 0);
        const qty = toNum(it.quantity, 0);
        const subtotal = Number.isFinite(toNum(it.subtotal, NaN)) ? toNum(it.subtotal, 0) : price * qty;
        return { ...it, price, quantity: qty, subtotal };
      });

      const newTotal = normalizedItems.reduce((sum, i) => sum + toNum(i.subtotal, 0), 0);

      const editRecord = {
        timestamp: new Date().toISOString(),
        changes,
        oldTotal: toNum(original.total, 0),
        newTotal,
      };

      const updated = {
        ...editingTransaction,
        items: normalizedItems,
        editHistory: [...(editingTransaction.editHistory || []), editRecord],
        total: newTotal,
      };

      await updateTransaction(shop.id, updated);
      await refreshAll(shop.id);

      setEditingTransaction(null);
      setViewingTransaction(null);
      alert("Transaction updated!");
    } catch (error) {
      console.error("Error updating transaction:", error);
      alert("Failed to update transaction: " + (error?.message || String(error)));
    } finally {
      setIsProcessing(false);
    }
  };

  const cancelTransaction = async () => {
    if (!shop) return alert("Shop not ready yet");
    if (!viewingTransaction) return;

    setIsProcessing(true);

    try {
      const cancelled = { ...viewingTransaction, cancelled: true };
      await updateTransaction(shop.id, cancelled);
      await refreshAll(shop.id);

      setViewingTransaction(null);
      alert("Transaction cancelled!");
    } catch (error) {
      console.error("Error cancelling:", error);
      alert("Failed to cancel transaction: " + (error?.message || String(error)));
    } finally {
      setIsProcessing(false);
    }
  };

  // -----------------------------
  // Date helpers (for views)
  // -----------------------------
  const getTodayTransactions = () => {
    const today = new Date().toDateString();
    return transactions.filter((tx) => new Date(tx.timestamp).toDateString() === today);
  };

  const getDateTransactions = (date) => {
    const dateStr = date.toDateString();
    return transactions.filter((tx) => new Date(tx.timestamp).toDateString() === dateStr);
  };

  const getCalendarDays = () => {
    const year = calendarMonth.getFullYear();
    const month = calendarMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startingDayOfWeek = firstDay.getDay();
    const days = [];

    for (let i = 0; i < startingDayOfWeek; i++) days.push(null);

    for (let day = 1; day <= lastDay.getDate(); day++) {
      const date = new Date(year, month, day);
      const txs = getDateTransactions(date);
      days.push({
        date,
        day,
        txCount: txs.length,
        isToday: date.toDateString() === new Date().toDateString(),
      });
    }

    return days;
  };

  // -----------------------------
  // MODALS / VIEWS
  // -----------------------------

  // CALENDAR MODAL
  if (showCalendar) {
    const calendarDays = getCalendarDays();
    const monthNames = ["January","February","March","April","May","June","July","August","September","October","November","December"];

    return (
      <div className="min-h-screen bg-gray-900 bg-opacity-50 fixed inset-0 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-xl p-6 max-w-4xl w-full">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold text-indigo-600">Select Date</h2>
            <button onClick={() => setShowCalendar(false)} className="p-2 hover:bg-gray-100 rounded">
              <X size={24} />
            </button>
          </div>

          <div className="flex justify-between items-center mb-4">
            <button
              onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1))}
              className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300"
            >
              ← Previous
            </button>
            <h3 className="text-xl font-bold">
              {monthNames[calendarMonth.getMonth()]} {calendarMonth.getFullYear()}
            </h3>
            <button
              onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1))}
              className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300"
            >
              Next →
            </button>
          </div>

          <div className="grid grid-cols-7 gap-2">
            {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map((day) => (
              <div key={day} className="text-center font-bold py-2">{day}</div>
            ))}

            {calendarDays.map((dayData, idx) => {
              if (!dayData) return <div key={`empty-${idx}`}></div>;

              return (
                <button
                  key={idx}
                  onClick={() => {
                    if (dayData.txCount > 0) {
                      setSelectedDate(dayData.date);
                      setShowCalendar(false);
                      setShowTransactions(true);
                    }
                  }}
                  disabled={dayData.txCount === 0}
                  className={`aspect-square p-2 rounded ${dayData.isToday ? "ring-2 ring-indigo-500" : ""} ${
                    dayData.txCount > 0 ? "bg-indigo-50 hover:bg-indigo-100 cursor-pointer" : "bg-gray-100 cursor-not-allowed opacity-50"
                  }`}
                >
                  <div className="font-bold">{dayData.day}</div>
                  {dayData.txCount > 0 && <div className="text-xs text-indigo-600">{dayData.txCount} tx</div>}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // RECEIPT MODAL
  if (showReceipt && viewingTransaction) {
    const tx = viewingTransaction;

    return (
      <div className="min-h-screen bg-gray-900 bg-opacity-50 fixed inset-0 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-xl p-8 max-w-md w-full">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-3xl font-bold text-indigo-600">Receipt</h2>
            <button onClick={() => setShowReceipt(false)} className="p-2 hover:bg-gray-100 rounded">
              <X size={24} />
            </button>
          </div>

          <div className="border-b-2 border-dashed pb-4 mb-4">
            <p className="text-center text-gray-600 text-sm">Thank you for your purchase!</p>
            {tx.receiptNumber && <p className="text-center font-bold text-lg mt-2">Receipt #: {tx.receiptNumber}</p>}
            <p className="text-center text-xs text-gray-500 mt-2">{new Date(tx.timestamp).toLocaleString()}</p>
            {tx.customerName && <p className="text-center font-semibold mt-2">Customer: {tx.customerName}</p>}
          </div>

          <div className="space-y-2 mb-6">
            {(tx.items || []).map((item, idx) => (
              <div key={idx} className="flex justify-between text-sm">
                <span>{item.name} x{toNum(item.quantity, 0)}</span>
                <span className="font-semibold">${money(item.subtotal)}</span>
              </div>
            ))}
          </div>

          <div className="border-t-2 pt-4">
            <div className="flex justify-between text-2xl font-bold">
              <span>Total:</span>
              <span className="text-indigo-600">${money(tx.total)}</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // INVOICE MODAL
  if (showInvoice && viewingTransaction) {
    const tx = viewingTransaction;

    return (
      <div className="min-h-screen bg-gray-900 bg-opacity-50 fixed inset-0 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-xl p-8 max-w-md w-full">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-3xl font-bold text-orange-600">Invoice</h2>
            <button onClick={() => setShowInvoice(false)} className="p-2 hover:bg-gray-100 rounded">
              <X size={24} />
            </button>
          </div>

          <div className="border-b-2 border-dashed pb-4 mb-4">
            <p className="text-center text-gray-600 text-sm">Payment Due</p>
            {tx.invoiceNumber && <p className="text-center font-bold text-lg mt-2">Invoice #: {tx.invoiceNumber}</p>}
            <p className="text-center text-xs text-gray-500 mt-2">{new Date(tx.timestamp).toLocaleString()}</p>
            {tx.customerName && <p className="text-center font-semibold mt-2 text-lg">Customer: {tx.customerName}</p>}
          </div>

          <div className="space-y-2 mb-6">
            {(tx.items || []).map((item, idx) => (
              <div key={idx} className="flex justify-between text-sm">
                <span>{item.name} x{toNum(item.quantity, 0)}</span>
                <span className="font-semibold">${money(item.subtotal)}</span>
              </div>
            ))}
          </div>

          <div className="border-t-2 pt-4">
            <div className="flex justify-between text-2xl font-bold">
              <span>Amount Due:</span>
              <span className="text-orange-600">${money(tx.total)}</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // TRANSACTION MODAL
  if (viewingTransaction && !editingTransaction) {
    const tx = viewingTransaction;

    return (
      <div className="min-h-screen bg-gray-900 bg-opacity-50 fixed inset-0 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-xl p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-2xl font-bold text-indigo-600">Transaction Details</h2>
            <button onClick={() => setViewingTransaction(null)} className="p-2 hover:bg-gray-100 rounded">
              <X size={24} />
            </button>
          </div>

          <div className="mb-4">
            <p className="text-sm text-gray-600">{new Date(tx.timestamp).toLocaleString()}</p>
            {tx.customerName && <p className="font-semibold mt-1">Customer: {tx.customerName}</p>}
            <div className="flex gap-2 mt-2">
              <span
                className={`px-2 py-1 rounded text-xs font-semibold ${
                  tx.paymentMethod === "cash" ? "bg-green-100 text-green-800" : "bg-orange-100 text-orange-800"
                }`}
              >
                {(tx.paymentMethod || "").toUpperCase()}
              </span>

              {(tx.type === "cash-in" || tx.type === "cash-out") && (
                <span
                  className={`px-2 py-1 rounded text-xs font-semibold text-white ${
                    tx.type === "cash-out" ? "bg-red-600" : "bg-emerald-600"
                  }`}
                >
                  {tx.type === "cash-out" ? "CASH OUT" : "CASH IN"}
                </span>
              )}

              {tx.cancelled && (
                <span className="px-2 py-1 rounded text-xs font-semibold bg-red-100 text-red-800">CANCELLED</span>
              )}

              {(tx.editHistory || []).length > 0 && (
                <span className="px-2 py-1 rounded text-xs font-semibold bg-yellow-100 text-yellow-800">
                  ✏️ EDITED ({tx.editHistory.length})
                </span>
              )}
            </div>
          </div>

          <div className="mb-4">
            <h3 className="font-semibold mb-2">Items:</h3>
            {(tx.items || []).map((item, idx) => (
              <div key={idx} className={`flex justify-between py-2 border-b ${tx.cancelled ? "line-through opacity-60" : ""}`}>
                <span>
                  {item.name} x{toNum(item.quantity, 0)} @ ${money(item.price)}
                </span>
                <span className="font-semibold">${money(item.subtotal)}</span>
              </div>
            ))}
            <div className="flex justify-between py-2 font-bold text-lg">
              <span>Total:</span>
              <span className="text-indigo-600">${money(tx.total)}</span>
            </div>
          </div>

          {(tx.editHistory || []).length > 0 && (
            <div className="mb-4 p-3 bg-gray-50 rounded">
              <h3 className="font-semibold mb-2">Edit History:</h3>
              {tx.editHistory.map((edit, idx) => (
                <div key={idx} className="text-sm mb-3 pb-3 border-b last:border-b-0">
                  <div className="font-medium text-indigo-600">
                    Edit #{idx + 1} - {new Date(edit.timestamp).toLocaleString()}
                  </div>
                  <div className="ml-4 mt-1 space-y-1">
                    {edit.changes &&
                      edit.changes.map((change, cIdx) => (
                        <div key={cIdx} className="text-gray-700">
                          <span className="font-medium">{change.field}:</span>{" "}
                          <span className="line-through text-red-600">{change.from}</span> {" → "}
                          <span className="text-green-600">{change.to}</span>
                        </div>
                      ))}
                    {edit.oldTotal !== edit.newTotal && (
                      <div className="font-medium text-gray-700">
                        Total: ${money(edit.oldTotal)} → ${money(edit.newTotal)}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="grid grid-cols-2 gap-2 mb-2">
            {tx.paymentMethod === "cash" && (
              <button onClick={() => setShowReceipt(true)} className="bg-green-600 text-white py-2 rounded hover:bg-green-700">
                📄 View Receipt
              </button>
            )}
            {tx.paymentMethod === "credit" && (
              <button onClick={() => setShowInvoice(true)} className="bg-orange-600 text-white py-2 rounded hover:bg-orange-700">
                📋 View Invoice
              </button>
            )}
            <button
              onClick={() => setEditingTransaction(JSON.parse(JSON.stringify(tx)))}
              className="bg-indigo-600 text-white py-2 rounded hover:bg-indigo-700 flex items-center justify-center gap-2"
            >
              <Edit2 size={18} /> Edit
            </button>
          </div>

          {!tx.cancelled && (
            <button
              onClick={cancelTransaction}
              disabled={isProcessing}
              className={`w-full py-2 rounded flex items-center justify-center gap-2 ${
                isProcessing ? "bg-gray-400 text-white cursor-not-allowed" : "bg-red-600 text-white hover:bg-red-700"
              }`}
            >
              {isProcessing ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  Cancelling...
                </>
              ) : (
                "Cancel Transaction"
              )}
            </button>
          )}
        </div>
      </div>
    );
  }

  // EDIT TRANSACTION MODAL
  if (editingTransaction) {
    return (
      <div className="min-h-screen bg-gray-900 bg-opacity-50 fixed inset-0 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-xl p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-2xl font-bold text-indigo-600">Edit Transaction</h2>
            <button onClick={() => setEditingTransaction(null)} className="p-2 hover:bg-gray-100 rounded">
              <X size={24} />
            </button>
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium mb-1">Time</label>
            <input
              type="datetime-local"
              value={new Date(editingTransaction.timestamp).toISOString().slice(0, 16)}
              onChange={(e) =>
                setEditingTransaction({
                  ...editingTransaction,
                  timestamp: new Date(e.target.value).toISOString(),
                })
              }
              className="w-full px-3 py-2 border rounded"
            />
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium mb-1">Customer Name</label>
            <input
              type="text"
              value={editingTransaction.customerName || ""}
              onChange={(e) => setEditingTransaction({ ...editingTransaction, customerName: e.target.value })}
              className="w-full px-3 py-2 border rounded"
              placeholder="Customer name (optional)"
            />
          </div>

          <h3 className="font-semibold mb-2">Items:</h3>
          {(editingTransaction.items || []).map((item, idx) => (
            <div key={idx} className="grid grid-cols-12 gap-2 mb-2">
              <input
                type="text"
                value={item.name}
                onChange={(e) => {
                  const newItems = [...(editingTransaction.items || [])];
                  newItems[idx] = { ...newItems[idx], name: e.target.value };
                  setEditingTransaction({ ...editingTransaction, items: newItems });
                }}
                className="col-span-5 px-2 py-1 border rounded"
                placeholder="Item name"
              />
              <input
                type="number"
                step="0.01"
                value={item.price}
                onChange={(e) => {
                  const newItems = [...(editingTransaction.items || [])];
                  const price = toNum(e.target.value, 0);
                  const qty = toNum(newItems[idx].quantity, 0);
                  newItems[idx] = { ...newItems[idx], price, subtotal: price * qty };
                  setEditingTransaction({ ...editingTransaction, items: newItems });
                }}
                className="col-span-2 px-2 py-1 border rounded"
                placeholder="Price"
              />
              <input
                type="number"
                value={item.quantity}
                onChange={(e) => {
                  const newItems = [...(editingTransaction.items || [])];
                  const qty = clampInt(e.target.value, 1, 1);
                  const price = toNum(newItems[idx].price, 0);
                  newItems[idx] = { ...newItems[idx], quantity: qty, subtotal: price * qty };
                  setEditingTransaction({ ...editingTransaction, items: newItems });
                }}
                className="col-span-2 px-2 py-1 border rounded"
                placeholder="Qty"
              />
              <div className="col-span-2 px-2 py-1 text-sm font-semibold">${money(item.subtotal)}</div>
              <button
                onClick={() => {
                  const newItems = (editingTransaction.items || []).filter((_, i) => i !== idx);
                  setEditingTransaction({ ...editingTransaction, items: newItems });
                }}
                className="col-span-1 text-red-500 hover:text-red-700"
              >
                <Trash2 size={18} />
              </button>
            </div>
          ))}

          <div className="mt-4 pt-4 border-t">
            <div className="flex justify-between text-lg font-bold mb-4">
              <span>Total:</span>
              <span className="text-indigo-600">
                ${money((editingTransaction.items || []).reduce((sum, i) => sum + toNum(i.subtotal, 0), 0))}
              </span>
            </div>

            <div className="flex gap-2">
              <button
                onClick={saveEditedTransaction}
                disabled={isProcessing}
                className={`flex-1 py-2 rounded flex items-center justify-center gap-2 ${
                  isProcessing ? "bg-gray-400 text-white cursor-not-allowed" : "bg-green-600 text-white hover:bg-green-700"
                }`}
              >
                {isProcessing ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    Saving...
                  </>
                ) : (
                  <>
                    <Save size={18} /> Save Changes
                  </>
                )}
              </button>
              <button
                onClick={() => setEditingTransaction(null)}
                disabled={isProcessing}
                className={`flex-1 py-2 rounded ${
                  isProcessing ? "bg-gray-200 text-gray-400 cursor-not-allowed" : "bg-gray-300 text-gray-800 hover:bg-gray-400"
                }`}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // QUICK ITEM MODAL
  if (showQuickItem) {
    return (
      <div className="min-h-screen bg-gray-900 bg-opacity-50 fixed inset-0 flex items-center justify-center p-4 z-50">
        <div className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold text-indigo-600">Quick Sale Item</h2>
            <button onClick={() => setShowQuickItem(false)} className="p-2 hover:bg-gray-100 rounded">
              <X size={24} />
            </button>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Item Name</label>
              <input
                type="text"
                placeholder="Enter item name"
                value={quickItem.name}
                onChange={(e) => setQuickItem({ ...quickItem, name: e.target.value })}
                className="w-full px-3 py-2 border rounded"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Unit Price</label>
              <input
                type="number"
                step="0.01"
                placeholder="0.00"
                value={quickItem.price}
                onChange={(e) => setQuickItem({ ...quickItem, price: e.target.value })}
                className="w-full px-3 py-2 border rounded"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Quantity</label>
              <input
                type="number"
                min="1"
                placeholder="1"
                value={quickItem.quantity}
                onChange={(e) => setQuickItem({ ...quickItem, quantity: e.target.value })}
                className="w-full px-3 py-2 border rounded"
              />
            </div>

            <div className="flex gap-2">
              <button onClick={addQuickItemToSale} className="flex-1 bg-indigo-600 text-white py-2 rounded hover:bg-indigo-700">
                Add to Sale
              </button>
              <button
                onClick={() => {
                  setShowQuickItem(false);
                  setQuickItem({ name: "", price: "", quantity: 1 });
                }}
                className="flex-1 bg-gray-300 text-gray-800 py-2 rounded hover:bg-gray-400"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // CASH IN/OUT MODAL
  if (showCashModal) {
    return (
      <div className="min-h-screen bg-gray-900 bg-opacity-50 fixed inset-0 flex items-center justify-center p-4 z-50">
        <div className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold text-green-600">Cash Transaction</h2>
            <button onClick={() => setShowCashModal(false)} className="p-2 hover:bg-gray-100 rounded">
              <X size={24} />
            </button>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">Transaction Type</label>
              <div className="flex gap-2">
                <button
                  onClick={() => setCashTransaction({ ...cashTransaction, type: "out" })}
                  className={`flex-1 py-3 rounded font-semibold ${
                    cashTransaction.type === "out" ? "bg-red-600 text-white" : "bg-gray-200 text-gray-800"
                  }`}
                >
                  Cash Out
                </button>
                <button
                  onClick={() => setCashTransaction({ ...cashTransaction, type: "in" })}
                  className={`flex-1 py-3 rounded font-semibold ${
                    cashTransaction.type === "in" ? "bg-green-600 text-white" : "bg-gray-200 text-gray-800"
                  }`}
                >
                  Cash In
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Reason</label>
              <input
                type="text"
                placeholder="e.g., Supplies, Owner withdrawal, Loan payment"
                value={cashTransaction.reason}
                onChange={(e) => setCashTransaction({ ...cashTransaction, reason: e.target.value })}
                className="w-full px-3 py-2 border rounded"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Amount</label>
              <input
                type="number"
                step="0.01"
                placeholder="0.00"
                value={cashTransaction.amount}
                onChange={(e) => setCashTransaction({ ...cashTransaction, amount: e.target.value })}
                className="w-full px-3 py-2 border rounded"
              />
            </div>

            <div className="flex gap-2">
              <button
                onClick={recordCashTransaction}
                disabled={isProcessing}
                className={`flex-1 text-white py-3 rounded font-semibold flex items-center justify-center gap-2 ${
                  isProcessing
                    ? "bg-gray-400 cursor-not-allowed"
                    : cashTransaction.type === "out"
                    ? "bg-red-600 hover:bg-red-700"
                    : "bg-green-600 hover:bg-green-700"
                }`}
              >
                {isProcessing ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    Processing...
                  </>
                ) : (
                  `Record Cash ${cashTransaction.type === "out" ? "Out" : "In"}`
                )}
              </button>
              <button
                onClick={() => {
                  setShowCashModal(false);
                  setCashTransaction({ type: "out", reason: "", amount: "" });
                }}
                className="flex-1 bg-gray-300 text-gray-800 py-3 rounded hover:bg-gray-400 font-semibold"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // SETTINGS MODAL
  if (showSettings) {
    return (
      <div className="min-h-screen bg-gray-900 bg-opacity-50 fixed inset-0 flex items-center justify-center p-4 z-50">
        <div className={`rounded-lg shadow-xl p-6 max-w-md w-full ${darkMode ? "bg-gray-800" : "bg-white"}`}>
          <div className="flex justify-between items-center mb-6">
            <h2 className={`text-2xl font-bold ${darkMode ? "text-indigo-400" : "text-indigo-600"}`}>Settings</h2>
            <button onClick={() => setShowSettings(false)} className={`p-2 rounded ${darkMode ? "hover:bg-gray-700" : "hover:bg-gray-100"}`}>
              <X size={24} className={darkMode ? "text-white" : "text-black"} />
            </button>
          </div>

          <div className="space-y-4">
            <div className={`p-4 rounded-lg ${darkMode ? "bg-gray-700" : "bg-gray-50"}`}>
              <div className="flex justify-between items-center">
                <div>
                  <h3 className={`font-semibold ${darkMode ? "text-white" : "text-gray-900"}`}>Theme</h3>
                  <p className={`text-sm ${darkMode ? "text-gray-400" : "text-gray-600"}`}>{darkMode ? "Dark Mode" : "Light Mode"}</p>
                </div>
                <button
                  onClick={() => setDarkMode(!darkMode)}
                  className={`relative inline-flex h-12 w-24 items-center rounded-full transition-colors ${darkMode ? "bg-indigo-600" : "bg-gray-300"}`}
                >
                  <span
                    className={`inline-block h-10 w-10 transform rounded-full bg-white shadow-lg transition-transform flex items-center justify-center ${
                      darkMode ? "translate-x-12" : "translate-x-1"
                    }`}
                  >
                    {darkMode ? <Moon size={20} className="text-indigo-600" /> : <Sun size={20} className="text-yellow-500" />}
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ITEM MANAGER MODAL
  if (showItemManager) {
    return (
      <div className="min-h-screen bg-gray-900 bg-opacity-50 fixed inset-0 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-xl p-6 max-w-4xl w-full max-h-[90vh] overflow-y-auto">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold text-indigo-600">Manage Items</h2>
            <button onClick={() => setShowItemManager(false)} className="p-2 hover:bg-gray-100 rounded">
              <X size={24} />
            </button>
          </div>

          <div className="mb-6 p-4 bg-gray-50 rounded">
            <h3 className="font-semibold mb-3">Add New Item</h3>
            <div className="grid grid-cols-3 gap-2">
              <input
                type="text"
                placeholder="Item name"
                value={newItem.name}
                onChange={(e) => setNewItem({ ...newItem, name: e.target.value })}
                className="px-3 py-2 border rounded"
              />
              <input
                type="number"
                step="0.01"
                placeholder="Price"
                value={newItem.price}
                onChange={(e) => setNewItem({ ...newItem, price: e.target.value })}
                className="px-3 py-2 border rounded"
              />
              <input
                type="text"
                placeholder="Category (optional)"
                value={newItem.category}
                onChange={(e) => setNewItem({ ...newItem, category: e.target.value })}
                className="px-3 py-2 border rounded"
              />
            </div>
            <button onClick={addItem} className="mt-2 w-full bg-indigo-600 text-white py-2 rounded hover:bg-indigo-700">
              Add Item
            </button>
          </div>

          <h3 className="font-semibold mb-3">Current Items</h3>
          <div className="space-y-2">
            {items.map((item) => (
              <div key={item.id} className="flex justify-between items-center p-3 bg-gray-50 rounded">
                <div>
                  <div className="font-medium">{item.name}</div>
                  <div className="text-sm text-gray-600">
                    ${money(item.price)} • {item.category}
                  </div>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteItem(item.id);
                  }}
                  className="text-red-500 hover:text-red-700"
                >
                  <Trash2 size={18} />
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // RECEIPTS VIEW
  if (showReceiptsView) {
    const receipts = transactions.filter((tx) => tx.paymentMethod === "cash");
    const receiptItems = [];
    receipts.forEach((tx) => (tx.items || []).forEach((item) => receiptItems.push({ tx, item })));

    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
        <div className="max-w-7xl mx-auto">
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-4xl font-bold text-indigo-600">All Receipts</h1>
            <button onClick={() => setShowReceiptsView(false)} className="px-4 py-2 bg-white rounded-lg shadow hover:shadow-md">
              ← Back to POS
            </button>
          </div>

          <div className="bg-white rounded-lg shadow-xl p-6">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b-2">
                    <th className="text-left py-2 px-2">Receipt #</th>
                    <th className="text-left py-2 px-2">Customer Name</th>
                    <th className="text-left py-2 px-2">Item</th>
                    <th className="text-right py-2 px-2">Quantity</th>
                    <th className="text-right py-2 px-2">Total Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {receiptItems.map((row, idx) => (
                    <tr key={idx} onClick={() => setViewingTransaction(row.tx)} className="border-b cursor-pointer hover:bg-indigo-50">
                      <td className="py-2 px-2 font-semibold">{row.tx.receiptNumber || "-"}</td>
                      <td className="py-2 px-2">{row.tx.customerName || "-"}</td>
                      <td className="py-2 px-2">{row.item.name}</td>
                      <td className="py-2 px-2 text-right">{toNum(row.item.quantity, 0)}</td>
                      <td className="py-2 px-2 text-right font-semibold">${money(row.item.subtotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {receiptItems.length === 0 && <p className="text-gray-500 text-center py-8">No receipts yet</p>}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // INVOICES VIEW
  if (showInvoicesView) {
    const invoices = transactions.filter((tx) => tx.paymentMethod === "credit");
    const invoiceItems = [];
    invoices.forEach((tx) => (tx.items || []).forEach((item) => invoiceItems.push({ tx, item })));

    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
        <div className="max-w-7xl mx-auto">
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-4xl font-bold text-orange-600">All Invoices</h1>
            <button onClick={() => setShowInvoicesView(false)} className="px-4 py-2 bg-white rounded-lg shadow hover:shadow-md">
              ← Back to POS
            </button>
          </div>

          <div className="bg-white rounded-lg shadow-xl p-6">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b-2">
                    <th className="text-left py-2 px-2">Invoice #</th>
                    <th className="text-left py-2 px-2">Customer Name</th>
                    <th className="text-left py-2 px-2">Item</th>
                    <th className="text-right py-2 px-2">Quantity</th>
                    <th className="text-right py-2 px-2">Total Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {invoiceItems.map((row, idx) => (
                    <tr key={idx} onClick={() => setViewingTransaction(row.tx)} className="border-b cursor-pointer hover:bg-orange-50">
                      <td className="py-2 px-2 font-semibold">{row.tx.invoiceNumber || "-"}</td>
                      <td className="py-2 px-2">{row.tx.customerName || "-"}</td>
                      <td className="py-2 px-2">{row.item.name}</td>
                      <td className="py-2 px-2 text-right">{toNum(row.item.quantity, 0)}</td>
                      <td className="py-2 px-2 text-right font-semibold">${money(row.item.subtotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {invoiceItems.length === 0 && <p className="text-gray-500 text-center py-8">No invoices yet</p>}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // TRANSACTIONS TABLE VIEW
  if (showTransactions) {
    const displayTxs = selectedDate ? getDateTransactions(selectedDate) : getTodayTransactions();
    const { sortedTxs, rows: dailyRows } = computeDailySummary(displayTxs);

    const cashSales = displayTxs
      .filter((tx) => !tx.cancelled && tx.paymentMethod === "cash")
      .reduce((sum, tx) => sum + toNum(tx.total, 0), 0);

    const creditSales = displayTxs
      .filter((tx) => !tx.cancelled && tx.paymentMethod === "credit")
      .reduce((sum, tx) => sum + toNum(tx.total, 0), 0);

    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
        <div className="max-w-7xl mx-auto">
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-4xl font-bold text-indigo-600">Transactions</h1>
            <button
              onClick={() => {
                setShowTransactions(false);
                setSelectedDate(null);
              }}
              className="px-4 py-2 bg-white rounded-lg shadow hover:shadow-md"
            >
              ← Back to POS
            </button>
          </div>

          <div className="bg-white rounded-lg shadow-xl p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-2xl font-semibold">
                {selectedDate
                  ? selectedDate.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })
                  : "Today's Transactions"}
              </h2>
              {selectedDate && (
                <button onClick={() => setSelectedDate(null)} className="text-sm text-indigo-600 hover:text-indigo-800">
                  View Today
                </button>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4 mb-4 p-4 bg-indigo-50 rounded">
              <div>
                <div className="text-sm text-gray-600">Total Cash Sales</div>
                <div className="text-2xl font-bold text-blue-600">${money(cashSales)}</div>
              </div>
              <div>
                <div className="text-sm text-gray-600">Total Credit Sales</div>
                <div className="text-2xl font-bold text-orange-600">${money(creditSales)}</div>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b-2">
                    <th className="text-left py-2 px-2">Time</th>
                    <th className="text-left py-2 px-2">Item</th>
                    <th className="text-right py-2 px-2">Qty</th>
                    <th className="text-right py-2 px-2">Cost</th>
                    <th className="text-right py-2 px-2">Running Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {dailyRows.map((row, idx) => {
                    const tx = sortedTxs.find((t) => t.id === row.txId);

                    return (
                      <tr
                        key={idx}
                        onClick={() => tx && setViewingTransaction(tx)}
                        className={`border-b cursor-pointer hover:bg-indigo-50 ${
                          row.cancelled
                            ? "bg-red-50"
                            : row.type === "cash-in" || row.type === "cash-out"
                            ? "bg-emerald-50"
                            : row.paymentMethod === "credit"
                            ? "bg-orange-50"
                            : ""
                        }`}
                      >
                        {row.itemIndex === 0 ? (
                          <td className="py-2 px-2" rowSpan={Math.max(1, row.totalItems)}>
                            {new Date(row.timestamp).toLocaleTimeString()}
                          </td>
                        ) : null}

                        <td className={`py-2 px-2 ${row.cancelled ? "line-through" : ""}`}>
                          {row.item.name}
                          {row.edited && <span className="text-orange-600"> *</span>}
                          {row.cancelled && <span className="ml-2 text-xs px-1 py-0.5 bg-red-500 text-white rounded">CANCELLED</span>}
                          {(row.type === "cash-in" || row.type === "cash-out") && !row.cancelled && (
                            <span className={`ml-2 text-xs px-1 py-0.5 text-white rounded ${row.type === "cash-out" ? "bg-red-600" : "bg-emerald-600"}`}>
                              {row.type === "cash-out" ? "CASH OUT" : "CASH IN"}
                            </span>
                          )}
                          {row.paymentMethod === "credit" && !row.cancelled && (
                            <span className="ml-2 text-xs px-1 py-0.5 bg-orange-500 text-white rounded">CREDIT</span>
                          )}
                        </td>

                        <td className={`py-2 px-2 text-right ${row.cancelled ? "line-through" : ""}`}>{toNum(row.item.quantity, 0)}</td>
                        <td className={`py-2 px-2 text-right font-semibold ${row.cancelled ? "line-through" : ""}`}>${money(row.item.subtotal)}</td>
                        <td className="py-2 px-2 text-right font-bold text-indigo-600">
                          {row.runningBalance !== null ? `$${money(row.runningBalance)}` : "-"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {dailyRows.length === 0 && <p className="text-gray-500 text-center py-8">No transactions for this date</p>}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // MAIN POS SCREEN
  const bgClass = darkMode ? "bg-gray-900" : "bg-gradient-to-br from-blue-50 to-indigo-100";
  const cardBg = darkMode ? "bg-gray-800" : "bg-white";
  const textPrimary = darkMode ? "text-white" : "text-gray-900";
  const btnBg = darkMode ? "bg-gray-700 hover:bg-gray-600" : "bg-white hover:shadow-md";
  const btnText = darkMode ? "text-white" : "text-gray-700";

  return (
    <div className={`min-h-screen ${bgClass} p-4`}>
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <h1 className={`text-4xl font-bold ${darkMode ? "text-indigo-400" : "text-indigo-600"}`}>POS System</h1>
          <div className="flex gap-1.5">
            <button
              onClick={() => setShowReceiptsView(true)}
              className={`px-3 py-2 ${btnBg} ${btnText} rounded-lg shadow transition-all flex items-center gap-1.5 text-sm font-medium`}
            >
              <Receipt size={18} />
              REC
            </button>
            <button
              onClick={() => setShowInvoicesView(true)}
              className={`px-3 py-2 ${btnBg} ${btnText} rounded-lg shadow transition-all flex items-center gap-1.5 text-sm font-medium`}
            >
              <FileText size={18} />
              INV
            </button>
            <button
              onClick={() => setShowTransactions(true)}
              className={`px-3 py-2 ${btnBg} ${btnText} rounded-lg shadow transition-all flex items-center gap-1.5 text-sm font-medium`}
            >
              <List size={18} />
              TRN
            </button>
            <button
              onClick={() => setShowItemManager(true)}
              className={`px-3 py-2 ${btnBg} ${btnText} rounded-lg shadow transition-all flex items-center gap-1.5 text-sm font-medium`}
            >
              <Package size={18} />
              ITEM
            </button>
            <button
              onClick={() => setShowCalendar(true)}
              className={`px-3 py-2 ${btnBg} ${btnText} rounded-lg shadow transition-all flex items-center gap-1.5 text-sm font-medium`}
            >
              <Calendar size={18} />
              CAL
            </button>
            <button
              onClick={() => setShowSettings(true)}
              className={`px-3 py-2 ${btnBg} ${btnText} rounded-lg shadow transition-all flex items-center justify-center`}
            >
              <Settings size={18} />
            </button>
          </div>
        </div>

        {/* Items Grid */}
        <div className={`${cardBg} rounded-lg shadow-xl p-6 mb-6`}>
          <h2 className={`text-2xl font-semibold mb-4 ${textPrimary}`}>Items for Sale</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
            <button
              onClick={() => setShowQuickItem(true)}
              className="bg-green-500 text-white p-4 rounded-lg hover:bg-green-600 transition-colors border-2 border-dashed border-green-300"
            >
              <div className="font-bold text-lg">+ New</div>
              <div className="text-sm">Quick Sale</div>
              <div className="text-xs opacity-75">One-time item</div>
            </button>

            <button
              onClick={() => setShowCashModal(true)}
              className="bg-emerald-500 text-white p-4 rounded-lg hover:bg-emerald-600 transition-colors border-2 border-dashed border-emerald-300"
            >
              <div className="font-bold text-lg">💵 Cash</div>
              <div className="text-sm">In/Out</div>
              <div className="text-xs opacity-75">Record cash</div>
            </button>

            {items.map((item) => (
              <button
                key={item.id}
                onClick={() => addToSale(item)}
                className="bg-indigo-500 text-white p-4 rounded-lg hover:bg-indigo-600 transition-colors"
              >
                <div className="font-bold text-lg">{item.name}</div>
                <div className="text-sm">${money(item.price)}</div>
                <div className="text-xs opacity-75">{item.category}</div>
              </button>
            ))}
          </div>

          {items.length === 0 && <p className="text-gray-500 text-center py-8">No items yet. Click "ITEM" to add items.</p>}
        </div>

        {/* Current Sale */}
        {currentSale.length > 0 && (
          <div className={`${cardBg} rounded-lg shadow-xl p-6`}>
            <h2 className={`text-2xl font-semibold mb-4 ${textPrimary}`}>Current Sale</h2>

            <div className="space-y-2 mb-4">
              {currentSale.map((item) => (
                <div key={item.id} className={`flex justify-between items-center p-3 rounded ${darkMode ? "bg-gray-700" : "bg-gray-50"}`}>
                  <span className={`font-medium ${textPrimary}`}>{item.name}</span>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => updateQuantity(item.id, toNum(item.quantity, 0) - 1)}
                      className={`w-8 h-8 rounded ${darkMode ? "bg-gray-600 hover:bg-gray-500" : "bg-gray-300 hover:bg-gray-400"} ${textPrimary}`}
                    >
                      -
                    </button>
                    <span className={`w-12 text-center font-semibold ${textPrimary}`}>{toNum(item.quantity, 0)}</span>
                    <button
                      onClick={() => updateQuantity(item.id, toNum(item.quantity, 0) + 1)}
                      className={`w-8 h-8 rounded ${darkMode ? "bg-gray-600 hover:bg-gray-500" : "bg-gray-300 hover:bg-gray-400"} ${textPrimary}`}
                    >
                      +
                    </button>
                    <span className={`w-24 text-right font-bold ${textPrimary}`}>${money(toNum(item.price, 0) * toNum(item.quantity, 0))}</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="mb-4">
              <label className={`block text-sm font-medium mb-1 ${textPrimary}`}>
                Customer Name {paymentMethod === "credit" && <span className="text-red-600">*</span>}
              </label>
              <input
                type="text"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder={paymentMethod === "credit" ? "Required for credit sales" : "Optional"}
                className={`w-full px-3 py-2 border rounded ${darkMode ? "bg-gray-700 border-gray-600 text-white" : "bg-white border-gray-300"}`}
              />
            </div>

            <div className="mb-4">
              <div className={`text-3xl font-bold mb-4 ${darkMode ? "text-indigo-400" : "text-indigo-600"}`}>
                Total: ${money(currentSale.reduce((sum, i) => sum + toNum(i.price, 0) * toNum(i.quantity, 0), 0))}
              </div>
            </div>

            <div className="flex gap-2 mb-4">
              <button
                onClick={() => setPaymentMethod("cash")}
                className={`flex-1 py-3 rounded font-semibold ${
                  paymentMethod === "cash" ? "bg-indigo-600 text-white" : darkMode ? "bg-gray-700 text-gray-300" : "bg-gray-200 text-gray-800"
                }`}
              >
                Cash
              </button>
              <button
                onClick={() => setPaymentMethod("credit")}
                className={`flex-1 py-3 rounded font-semibold ${
                  paymentMethod === "credit" ? "bg-indigo-600 text-white" : darkMode ? "bg-gray-700 text-gray-300" : "bg-gray-200 text-gray-800"
                }`}
              >
                Credit
              </button>
            </div>

            <button
              onClick={completeSale}
              disabled={isProcessing}
              className={`w-full py-4 rounded-lg font-bold text-lg flex items-center justify-center gap-2 ${
                isProcessing ? "bg-gray-400 cursor-not-allowed" : "bg-green-600 hover:bg-green-700 text-white"
              }`}
            >
              {isProcessing ? (
                <>
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  Processing...
                </>
              ) : (
                "Complete Sale"
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
