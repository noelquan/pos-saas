import React, { useState, useEffect } from "react";
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
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabaseClient";


// ✅ Adjust this import path if needed.
// Example alternatives:
//   import { ... } from "../lib/storage";
//   import { ... } from "../../lib/storage";
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
  const [shop, setShop] = useState(null);
  const [loading, setLoading] = useState(true);

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
  const router = useRouter();
  const [authChecking, setAuthChecking] = useState(true);


  // New item form
  const [newItem, setNewItem] = useState({
    name: "",
    price: "",
    category: "",
    color: "#6366f1",
  });
  const [editingItem, setEditingItem] = useState(null);
  const [deletingItemId, setDeletingItemId] = useState(null);
  const [categoryFilter, setCategoryFilter] = useState("all");

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

  // CSV Generation and Display Functions
  const [showCSVModal, setShowCSVModal] = useState(false);
  const [csvContent, setCSVContent] = useState("");
  const [csvFilename, setCSVFilename] = useState("");

  const generateCSV = (data) => data.map((row) => row.join(",")).join("\n");

  const copyCSVToClipboard = () => {
    navigator.clipboard
      .writeText(csvContent)
      .then(() => alert("CSV copied to clipboard! You can paste it into Excel or any text editor."))
      .catch(() => alert("Failed to copy. Please manually select and copy the text."));
  };

  // ---------- Supabase init + refresh ----------
  const refreshFromSupabase = async (shopId) => {
    const [loadedItems, loadedTxs] = await Promise.all([
      loadItems(shopId),
      loadTransactions(shopId),
    ]);

    setItems(loadedItems || []);
    const sorted = (loadedTxs || []).slice().sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    setTransactions(sorted);
  };

useEffect(() => {
  if (authChecking) return; // wait until auth is confirmed

  (async () => {
    try {
      const s = await ensureShop();
      setShop(s);
      await refreshFromSupabase(s.id);
    } catch (e) {
      console.error(e);
      alert(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  })();
}, [authChecking]);


useEffect(() => {
  let alive = true;

  (async () => {
    const { data, error } = await supabase.auth.getSession();
    if (!alive) return;

    if (error) {
      console.error(error);
      router.replace("/login");
      return;
    }

    if (!data?.session) {
      router.replace("/login");
      return;
    }

    setAuthChecking(false);
  })();

  const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
    if (!session) router.replace("/login");
  });

  return () => {
    alive = false;
    sub?.subscription?.unsubscribe();
  };
}, [router]);

if (authChecking) {
  return <div className="min-h-screen p-6">Checking login...</div>;
}

  // ---------- Items (Supabase) ----------
  const saveItems = async (newItems) => {
    if (!shop) return alert("Shop not ready yet");
    try {
      await replaceItems(shop.id, newItems);
      setItems(newItems);
    } catch (error) {
      console.error("Error saving items:", error);
      alert("Error saving items: " + (error?.message || String(error)));
    }
  };

  const addItem = () => {
    if (!newItem.name || !newItem.price) {
      alert("Please enter item name and price");
      return;
    }
    const item = {
      id: Date.now(),
      name: newItem.name,
      price: parseFloat(newItem.price),
      category: newItem.category || "General",
      color: newItem.color || "#6366f1",
    };
    saveItems([...items, item]);
    setNewItem({ name: "", price: "", category: "", color: "#6366f1" });
  };

  const updateItem = () => {
    if (!editingItem?.name || editingItem.price === "" || editingItem.price === null) {
      alert("Please enter item name and price");
      return;
    }
    const updatedItems = items.map((i) => (i.id === editingItem.id ? editingItem : i));
    saveItems(updatedItems);
    setEditingItem(null);
  };

  const confirmDeleteItem = async (id) => {
    const newItems = items.filter((i) => i.id !== id);
    await saveItems(newItems);
    setDeletingItemId(null);
  };

  // ---------- CSV helpers ----------
  const showReceiptsCSV = () => {
    const receipts = transactions.filter((tx) => tx.paymentMethod === "cash");
    const csvData = [["Receipt #", "Date", "Time", "Customer Name", "Item", "Quantity", "Price", "Subtotal", "Total", "Status"]];

    receipts.forEach((tx) => {
      const date = new Date(tx.timestamp);
      const dateStr = date.toLocaleDateString();
      const timeStr = date.toLocaleTimeString();
      const status = tx.cancelled ? "CANCELLED" : "COMPLETED";

      (tx.items || []).forEach((item, idx) => {
        csvData.push([
          tx.receiptNumber || "",
          dateStr,
          timeStr,
          tx.customerName || "",
          item.name,
          item.quantity,
          Number(item.price).toFixed(2),
          Number(item.subtotal).toFixed(2),
          idx === 0 ? Number(tx.total).toFixed(2) : "",
          idx === 0 ? status : "",
        ]);
      });
    });

    setCSVContent(generateCSV(csvData));
    setCSVFilename(`receipts_${new Date().toISOString().slice(0, 10)}.csv`);
    setShowCSVModal(true);
  };

  const showInvoicesCSV = () => {
    const invoices = transactions.filter((tx) => tx.paymentMethod === "credit");
    const csvData = [["Invoice #", "Date", "Time", "Customer Name", "Item", "Quantity", "Price", "Subtotal", "Total", "Status"]];

    invoices.forEach((tx) => {
      const date = new Date(tx.timestamp);
      const dateStr = date.toLocaleDateString();
      const timeStr = date.toLocaleTimeString();
      const status = tx.cancelled ? "CANCELLED" : "PENDING";

      (tx.items || []).forEach((item, idx) => {
        csvData.push([
          tx.invoiceNumber || "",
          dateStr,
          timeStr,
          tx.customerName || "",
          item.name,
          item.quantity,
          Number(item.price).toFixed(2),
          Number(item.subtotal).toFixed(2),
          idx === 0 ? Number(tx.total).toFixed(2) : "",
          idx === 0 ? status : "",
        ]);
      });
    });

    setCSVContent(generateCSV(csvData));
    setCSVFilename(`invoices_${new Date().toISOString().slice(0, 10)}.csv`);
    setShowCSVModal(true);
  };

  const getTodayTransactions = () => {
    const today = new Date().toDateString();
    return transactions.filter((tx) => new Date(tx.timestamp).toDateString() === today);
  };

  const getDateTransactions = (date) => {
    const dateStr = date.toDateString();
    return transactions.filter((tx) => new Date(tx.timestamp).toDateString() === dateStr);
  };

  const showTransactionsCSV = () => {
    const displayTxs = selectedDate ? getDateTransactions(selectedDate) : getTodayTransactions();
    const csvData = [["Date", "Time", "Payment Method", "Customer Name", "Item", "Quantity", "Price", "Subtotal", "Total", "Receipt/Invoice #", "Status"]];

    displayTxs.forEach((tx) => {
      const date = new Date(tx.timestamp);
      const dateStr = date.toLocaleDateString();
      const timeStr = date.toLocaleTimeString();
      const status = tx.cancelled ? "CANCELLED" : "COMPLETED";
      const number = tx.receiptNumber || tx.invoiceNumber || "";

      (tx.items || []).forEach((item, idx) => {
        csvData.push([
          dateStr,
          timeStr,
          (tx.paymentMethod || "").toUpperCase(),
          tx.customerName || "",
          item.name,
          item.quantity,
          Number(item.price).toFixed(2),
          Number(item.subtotal).toFixed(2),
          idx === 0 ? Number(tx.total).toFixed(2) : "",
          idx === 0 ? number : "",
          idx === 0 ? status : "",
        ]);
      });
    });

    const dateLabel = selectedDate ? selectedDate.toISOString().slice(0, 10) : "today";
    setCSVContent(generateCSV(csvData));
    setCSVFilename(`transactions_${dateLabel}.csv`);
    setShowCSVModal(true);
  };

  // ---------- Sale helpers ----------
  const addToSale = (item) => {
    const existing = currentSale.find((i) => i.id === item.id);
    if (existing) {
      setCurrentSale(currentSale.map((i) => (i.id === item.id ? { ...i, quantity: i.quantity + 1 } : i)));
    } else {
      setCurrentSale([...currentSale, { ...item, quantity: 1 }]);
    }
  };

  const addQuickItemToSale = () => {
    if (!quickItem.name || !quickItem.price || !quickItem.quantity) {
      alert("Please fill in all fields");
      return;
    }

    const tempItem = {
      id: Date.now(),
      name: quickItem.name,
      price: parseFloat(quickItem.price),
      quantity: parseInt(quickItem.quantity, 10),
      category: "Quick Sale",
    };

    setCurrentSale([...currentSale, tempItem]);
    setQuickItem({ name: "", price: "", quantity: 1 });
    setShowQuickItem(false);
  };

  const updateQuantity = (id, quantity) => {
    if (quantity <= 0) {
      setCurrentSale(currentSale.filter((i) => i.id !== id));
    } else {
      setCurrentSale(currentSale.map((i) => (i.id === id ? { ...i, quantity } : i)));
    }
  };

  // ---------- Transactions (Supabase) ----------
  const recordCashTransaction = async () => {
    if (!shop) return alert("Shop not ready yet");
    if (!cashTransaction.reason || !cashTransaction.amount) {
      alert("Please enter reason and amount");
      return;
    }

    const amount = parseFloat(cashTransaction.amount);
    if (isNaN(amount) || amount <= 0) {
      alert("Please enter a valid amount");
      return;
    }

    setIsProcessing(true);
    try {
      const number = await nextDailyNumber(shop.id);

      const signed = cashTransaction.type === "out" ? -amount : amount;

      const transaction = {
        id: `tx_${Date.now()}_${Math.random().toString(16).slice(2)}`,
        timestamp: new Date().toISOString(),
        customerName: "",
        items: [
          {
            name: `Cash ${cashTransaction.type === "out" ? "Out" : "In"}: ${cashTransaction.reason}`,
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
      };

      await insertTransaction(shop.id, transaction);
      setTransactions((prev) =>
        [...prev, transaction].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
      );

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

      const lineItems = currentSale.map((i) => {
        const price = Number(i.price) || 0;
        const qty = Number(i.quantity) || 1;
        return {
          name: i.name,
          price,
          quantity: qty,
          subtotal: price * qty,
        };
      });

      const total = lineItems.reduce((sum, i) => sum + i.subtotal, 0);

      const transaction = {
        id: `tx_${Date.now()}_${Math.random().toString(16).slice(2)}`,
        timestamp: new Date().toISOString(),
        customerName: customerName.trim(),
        items: lineItems,
        total,
        paymentMethod,
        receiptNumber: paymentMethod === "cash" ? number : null,
        invoiceNumber: paymentMethod === "credit" ? number : null,
        editHistory: [],
        cancelled: false,
      };

      await insertTransaction(shop.id, transaction);
      setTransactions((prev) =>
        [...prev, transaction].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
      );

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

  const saveEditedTransaction = async () => {
    if (!shop) return alert("Shop not ready yet");
    if (!editingTransaction || !viewingTransaction) return;

    setIsProcessing(true);
    try {
      const changes = [];

      if (viewingTransaction.timestamp !== editingTransaction.timestamp) {
        changes.push({
          field: "Time",
          from: new Date(viewingTransaction.timestamp).toLocaleString(),
          to: new Date(editingTransaction.timestamp).toLocaleString(),
        });
      }

      if (viewingTransaction.customerName !== editingTransaction.customerName) {
        changes.push({
          field: "Customer Name",
          from: viewingTransaction.customerName || "(none)",
          to: editingTransaction.customerName || "(none)",
        });
      }

      // Normalize + recalc subtotals
      const newItems = (editingTransaction.items || []).map((it) => {
        const price = Number(it.price) || 0;
        const qty = Number(it.quantity) || 0;
        return { ...it, price, quantity: qty, subtotal: price * qty };
      });

      const oldItems = viewingTransaction.items || [];
      if (JSON.stringify(oldItems) !== JSON.stringify(newItems)) {
        oldItems.forEach((oldItem, idx) => {
          const ni = newItems[idx];
          if (!ni) return;
          if (oldItem.name !== ni.name) changes.push({ field: `Item ${idx + 1} Name`, from: oldItem.name, to: ni.name });
          if (oldItem.price !== ni.price) changes.push({ field: `Item ${idx + 1} Price`, from: `$${oldItem.price}`, to: `$${ni.price}` });
          if (oldItem.quantity !== ni.quantity) changes.push({ field: `Item ${idx + 1} Quantity`, from: oldItem.quantity, to: ni.quantity });
        });
        if (newItems.length !== oldItems.length) {
          changes.push({ field: "Items Count", from: oldItems.length, to: newItems.length });
        }
      }

      const newTotal = newItems.reduce((sum, i) => sum + (Number(i.subtotal) || 0), 0);

      const editRecord = {
        timestamp: new Date().toISOString(),
        changes,
        oldTotal: Number(viewingTransaction.total) || 0,
        newTotal,
      };

      const updated = {
        ...editingTransaction,
        items: newItems,
        total: newTotal,
        editHistory: Array.isArray(editingTransaction.editHistory) ? [...editingTransaction.editHistory, editRecord] : [editRecord],
      };

      await updateTransaction(shop.id, updated);

      setTransactions((prev) =>
        prev
          .map((t) => (t.id === updated.id ? updated : t))
          .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
      );

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

      setTransactions((prev) => prev.map((t) => (t.id === cancelled.id ? cancelled : t)));
      setViewingTransaction(null);
      alert("Transaction cancelled!");
    } catch (error) {
      console.error("Error cancelling:", error);
      alert("Failed to cancel transaction: " + (error?.message || String(error)));
    } finally {
      setIsProcessing(false);
    }
  };

  // ---------- Summaries ----------
  const getDailySummary = (txs) => {
    let runningBalance = 0;
    const summary = [];

    txs.forEach((tx) => {
      (tx.items || []).forEach((item, idx) => {
        if (!tx.cancelled && tx.paymentMethod === "cash") {
          runningBalance += Number(item.subtotal) || 0;
        }

        summary.push({
          txId: tx.id,
          timestamp: tx.timestamp,
          item,
          itemIndex: idx,
          totalItems: (tx.items || []).length,
          paymentMethod: tx.paymentMethod,
          cancelled: tx.cancelled,
          edited: (tx.editHistory || []).length > 0,
          runningBalance: tx.paymentMethod === "cash" && !tx.cancelled ? runningBalance : null,
        });
      });
    });

    return summary;
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

  // Theme variables
  const bgClass = darkMode ? "bg-gray-900" : "bg-gradient-to-br from-blue-50 to-indigo-100";
  const cardBg = darkMode ? "bg-gray-800" : "bg-white";
  const textPrimary = darkMode ? "text-white" : "text-gray-900";
  const textSecondary = darkMode ? "text-gray-300" : "text-gray-600";
  const textMuted = darkMode ? "text-gray-400" : "text-gray-500";
  const btnBg = darkMode ? "bg-gray-700 hover:bg-gray-600" : "bg-white hover:shadow-md";
  const btnText = darkMode ? "text-white" : "text-gray-700";
  const border = darkMode ? "border-gray-700" : "border-gray-200";
  const hoverBg = darkMode ? "hover:bg-gray-700" : "hover:bg-indigo-50";
  const titleColor = darkMode ? "text-indigo-400" : "text-indigo-600";
  const inputBg = darkMode ? "bg-gray-700 border-gray-600 text-white" : "bg-white border-gray-300";

  // ---------- Loading gate ----------
  if (loading) {
    return <div className="min-h-screen p-6">Loading...</div>;
  }

  // -------------------------
  // Everything below this point is your UI exactly as provided (unchanged),
  // except it now uses Supabase-backed state + functions above.
  // -------------------------


  

  // CALENDAR VIEW
  if (showCalendar) {
    const calendarDays = getCalendarDays();
    const monthNames = [
      "January","February","March","April","May","June",
      "July","August","September","October","November","December"
    ];

    return (
      <div className={`min-h-screen ${bgClass} p-4`}>
        <div className="max-w-7xl mx-auto">
          <div className="flex justify-between items-center mb-6">
            <h1 className={`text-4xl font-bold ${titleColor}`}>Calendar</h1>
            <button
              onClick={() => setShowCalendar(false)}
              className={`px-4 py-2 ${btnBg} ${btnText} rounded-lg shadow`}
            >
              ← Back to POS
            </button>
          </div>

          <div className={`${cardBg} rounded-lg shadow-xl p-6`}>
            <div className="flex justify-between items-center mb-4">
              <button
                onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1))}
                className={`px-4 py-2 rounded ${darkMode ? "bg-gray-700 hover:bg-gray-600 text-white" : "bg-gray-200 hover:bg-gray-300"}`}
              >
                ← Previous
              </button>
              <h3 className={`text-xl font-bold ${textPrimary}`}>
                {monthNames[calendarMonth.getMonth()]} {calendarMonth.getFullYear()}
              </h3>
              <button
                onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1))}
                className={`px-4 py-2 rounded ${darkMode ? "bg-gray-700 hover:bg-gray-600 text-white" : "bg-gray-200 hover:bg-gray-300"}`}
              >
                Next →
              </button>
            </div>

            <div className="grid grid-cols-7 gap-2">
              {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map((day) => (
                <div key={day} className={`text-center font-bold py-2 ${textPrimary}`}>{day}</div>
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
                    className={`aspect-square p-2 rounded ${
                      dayData.isToday ? (darkMode ? "ring-2 ring-indigo-400" : "ring-2 ring-indigo-500") : ""
                    } ${
                      dayData.txCount > 0
                        ? darkMode
                          ? "bg-indigo-900 hover:bg-indigo-800 cursor-pointer text-white"
                          : "bg-indigo-50 hover:bg-indigo-100 cursor-pointer"
                        : darkMode
                          ? "bg-gray-700 cursor-not-allowed opacity-50 text-gray-500"
                          : "bg-gray-100 cursor-not-allowed opacity-50"
                    }`}
                  >
                    <div className="font-bold">{dayData.day}</div>
                    {dayData.txCount > 0 && (
                      <div className={`text-xs ${darkMode ? "text-indigo-300" : "text-indigo-600"}`}>{dayData.txCount} tx</div>
                    )}
                  </button>
                );
              })}
            </div>
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
        <div className={`${cardBg} rounded-lg shadow-xl p-8 max-w-md w-full`}>
          <div className="flex justify-between items-center mb-4">
            <h2 className={`text-3xl font-bold ${titleColor}`}>Receipt</h2>
            <button onClick={() => setShowReceipt(false)} className={`p-2 rounded ${darkMode ? "hover:bg-gray-700" : "hover:bg-gray-100"}`}>
              <X size={24} className={textPrimary} />
            </button>
          </div>

          <div className={`border-b-2 border-dashed pb-4 mb-4 ${border}`}>
            <p className={`text-center text-sm ${textSecondary}`}>Thank you for your purchase!</p>
            {tx.receiptNumber && (
              <p className={`text-center font-bold text-lg mt-2 ${textPrimary}`}>Receipt #: {tx.receiptNumber}</p>
            )}
            <p className={`text-center text-xs mt-2 ${textMuted}`}>
              {new Date(tx.timestamp).toLocaleString()}
            </p>
            {tx.customerName && (
              <p className={`text-center font-semibold mt-2 ${textPrimary}`}>Customer: {tx.customerName}</p>
            )}
          </div>

          <div className="space-y-2 mb-6">
            {(tx.items || []).map((item, idx) => (
              <div key={idx} className={`flex justify-between text-sm ${textPrimary}`}>
                <span>{item.name} x{item.quantity}</span>
                <span className="font-semibold">${Number(item.subtotal).toFixed(2)}</span>
              </div>
            ))}
          </div>

          <div className={`border-t-2 pt-4 ${border}`}>
            <div className={`flex justify-between text-2xl font-bold ${textPrimary}`}>
              <span>Total:</span>
              <span className={titleColor}>${Number(tx.total).toFixed(2)}</span>
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
        <div className={`${cardBg} rounded-lg shadow-xl p-8 max-w-md w-full`}>
          <div className="flex justify-between items-center mb-4">
            <h2 className={`text-3xl font-bold ${darkMode ? "text-orange-400" : "text-orange-600"}`}>Invoice</h2>
            <button onClick={() => setShowInvoice(false)} className={`p-2 rounded ${darkMode ? "hover:bg-gray-700" : "hover:bg-gray-100"}`}>
              <X size={24} className={textPrimary} />
            </button>
          </div>

          <div className={`border-b-2 border-dashed pb-4 mb-4 ${border}`}>
            <p className={`text-center text-sm ${textSecondary}`}>Payment Due</p>
            {tx.invoiceNumber && (
              <p className={`text-center font-bold text-lg mt-2 ${textPrimary}`}>Invoice #: {tx.invoiceNumber}</p>
            )}
            <p className={`text-center text-xs mt-2 ${textMuted}`}>
              {new Date(tx.timestamp).toLocaleString()}
            </p>
            {tx.customerName && (
              <p className={`text-center font-semibold mt-2 text-lg ${textPrimary}`}>Customer: {tx.customerName}</p>
            )}
          </div>

          <div className="space-y-2 mb-6">
            {(tx.items || []).map((item, idx) => (
              <div key={idx} className={`flex justify-between text-sm ${textPrimary}`}>
                <span>{item.name} x{item.quantity}</span>
                <span className="font-semibold">${Number(item.subtotal).toFixed(2)}</span>
              </div>
            ))}
          </div>

          <div className={`border-t-2 pt-4 ${border}`}>
            <div className={`flex justify-between text-2xl font-bold ${textPrimary}`}>
              <span>Amount Due:</span>
              <span className={darkMode ? "text-orange-400" : "text-orange-600"}>${Number(tx.total).toFixed(2)}</span>
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
      <div className="min-h-screen bg-gray-900 bg-opacity-50 fixed inset-0 flex items-center justify-center p-2 md:p-4">
        <div className={`${cardBg} rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] flex flex-col`}>
          <div className={`sticky top-0 z-10 flex justify-between items-center p-4 border-b ${darkMode ? "border-gray-700 bg-gray-800" : "border-gray-300 bg-white"} flex-shrink-0`}>
            <h2 className={`text-xl md:text-2xl font-bold ${titleColor}`}>Transaction Details</h2>
            <button onClick={() => setViewingTransaction(null)} className={`p-2 rounded ${darkMode ? "hover:bg-gray-700" : "hover:bg-gray-100"}`}>
              <X size={24} className={textPrimary} />
            </button>
          </div>

          <div className="overflow-y-auto p-4 flex-1">
            <div className="mb-4">
              <p className={`text-sm ${textSecondary}`}>
                {new Date(tx.timestamp).toLocaleString()}
              </p>
              {tx.customerName && (
                <p className={`font-semibold mt-1 ${textPrimary}`}>Customer: {tx.customerName}</p>
              )}
              <div className="flex gap-2 mt-2">
                <span className={`px-2 py-1 rounded text-xs font-semibold ${
                  tx.paymentMethod === "cash" ? "bg-green-100 text-green-800" : "bg-orange-100 text-orange-800"
                }`}>
                  {(tx.paymentMethod || "").toUpperCase()}
                </span>
                {tx.cancelled && (
                  <span className="px-2 py-1 rounded text-xs font-semibold bg-red-100 text-red-800">
                    CANCELLED
                  </span>
                )}
                {(tx.editHistory || []).length > 0 && (
                  <span className="px-2 py-1 rounded text-xs font-semibold bg-yellow-100 text-yellow-800">
                    ✏️ EDITED ({(tx.editHistory || []).length})
                  </span>
                )}
              </div>
            </div>

            <div className="mb-4">
              <h3 className={`font-semibold mb-2 ${textPrimary}`}>Items:</h3>
              {(tx.items || []).map((item, idx) => (
                <div key={idx} className={`flex justify-between py-2 border-b ${border} ${textPrimary} ${tx.cancelled ? "line-through opacity-60" : ""}`}>
                  <span>{item.name} x{item.quantity} @ ${Number(item.price).toFixed(2)}</span>
                  <span className="font-semibold">${Number(item.subtotal).toFixed(2)}</span>
                </div>
              ))}
              <div className={`flex justify-between py-2 font-bold text-lg ${textPrimary}`}>
                <span>Total:</span>
                <span className={titleColor}>${Number(tx.total).toFixed(2)}</span>
              </div>
            </div>

            {(tx.editHistory || []).length > 0 && (
              <div className={`mb-4 p-3 rounded ${darkMode ? "bg-gray-700" : "bg-gray-50"}`}>
                <h3 className={`font-semibold mb-2 ${textPrimary}`}>Edit History:</h3>
                {(tx.editHistory || []).map((edit, idx) => (
                  <div key={idx} className={`text-sm mb-3 pb-3 border-b last:border-b-0 ${border}`}>
                    <div className={`font-medium ${titleColor}`}>
                      Edit #{idx + 1} - {new Date(edit.timestamp).toLocaleString()}
                    </div>
                    <div className="ml-4 mt-1 space-y-1">
                      {edit.changes && edit.changes.map((change, cIdx) => (
                        <div key={cIdx} className={textSecondary}>
                          <span className="font-medium">{change.field}:</span>{" "}
                          <span className="line-through text-red-600">{change.from}</span>
                          {" → "}
                          <span className="text-green-600">{change.to}</span>
                        </div>
                      ))}
                      {typeof edit.oldTotal === "number" && typeof edit.newTotal === "number" && edit.oldTotal !== edit.newTotal && (
                        <div className={`font-medium ${textSecondary}`}>
                          Total: ${edit.oldTotal.toFixed(2)} → ${edit.newTotal.toFixed(2)}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="grid grid-cols-2 gap-2 mb-2">
              {tx.paymentMethod === "cash" && (
                <button
                  onClick={() => setShowReceipt(true)}
                  className="bg-green-600 text-white py-2 rounded hover:bg-green-700"
                >
                  📄 View Receipt
                </button>
              )}
              {tx.paymentMethod === "credit" && (
                <button
                  onClick={() => setShowInvoice(true)}
                  className="bg-orange-600 text-white py-2 rounded hover:bg-orange-700"
                >
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
      </div>
    );
  }

  // EDIT TRANSACTION MODAL
  if (editingTransaction) {
    return (
      <div className="min-h-screen bg-gray-900 bg-opacity-50 fixed inset-0 flex items-center justify-center p-2 md:p-4">
        <div className={`${cardBg} rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] flex flex-col`}>
          <div className={`sticky top-0 z-10 flex justify-between items-center p-4 border-b ${darkMode ? "border-gray-700 bg-gray-800" : "border-gray-300 bg-white"} flex-shrink-0`}>
            <h2 className={`text-xl md:text-2xl font-bold ${titleColor}`}>Edit Transaction</h2>
            <button onClick={() => setEditingTransaction(null)} className={`p-2 rounded ${darkMode ? "hover:bg-gray-700" : "hover:bg-gray-100"}`}>
              <X size={24} className={textPrimary} />
            </button>
          </div>

          <div className="overflow-y-auto p-4 flex-1">
            <div className="mb-4">
              <label className={`block text-sm font-medium mb-1 ${textPrimary}`}>Time</label>
              <input
                type="datetime-local"
                value={new Date(editingTransaction.timestamp).toISOString().slice(0, 16)}
                onChange={(e) =>
                  setEditingTransaction({
                    ...editingTransaction,
                    timestamp: new Date(e.target.value).toISOString(),
                  })
                }
                className={`w-full px-3 py-2 border rounded ${inputBg}`}
              />
            </div>

            <div className="mb-4">
              <label className={`block text-sm font-medium mb-1 ${textPrimary}`}>Customer Name</label>
              <input
                type="text"
                value={editingTransaction.customerName || ""}
                onChange={(e) =>
                  setEditingTransaction({
                    ...editingTransaction,
                    customerName: e.target.value,
                  })
                }
                className={`w-full px-3 py-2 border rounded ${inputBg}`}
                placeholder="Customer name (optional)"
              />
            </div>

            <h3 className={`font-semibold mb-2 ${textPrimary}`}>Items:</h3>
            {(editingTransaction.items || []).map((item, idx) => (
              <div key={idx} className="grid grid-cols-12 gap-2 mb-2">
                <input
                  type="text"
                  value={item.name}
                  onChange={(e) => {
                    const newItems = [...editingTransaction.items];
                    newItems[idx].name = e.target.value;
                    setEditingTransaction({ ...editingTransaction, items: newItems });
                  }}
                  className={`col-span-5 px-2 py-1 border rounded ${inputBg}`}
                  placeholder="Item name"
                />
                <input
                  type="number"
                  step="0.01"
                  value={item.price}
                  onChange={(e) => {
                    const newItems = [...editingTransaction.items];
                    newItems[idx].price = parseFloat(e.target.value) || 0;
                    newItems[idx].subtotal = (Number(newItems[idx].price) || 0) * (Number(newItems[idx].quantity) || 0);
                    setEditingTransaction({ ...editingTransaction, items: newItems });
                  }}
                  className={`col-span-2 px-2 py-1 border rounded ${inputBg}`}
                  placeholder="Price"
                />
                <input
                  type="number"
                  value={item.quantity}
                  onChange={(e) => {
                    const newItems = [...editingTransaction.items];
                    newItems[idx].quantity = parseInt(e.target.value, 10) || 0;
                    newItems[idx].subtotal = (Number(newItems[idx].price) || 0) * (Number(newItems[idx].quantity) || 0);
                    setEditingTransaction({ ...editingTransaction, items: newItems });
                  }}
                  className={`col-span-2 px-2 py-1 border rounded ${inputBg}`}
                  placeholder="Qty"
                />
                <div className={`col-span-2 px-2 py-1 text-sm font-semibold ${textPrimary}`}>
                  ${Number(item.subtotal || 0).toFixed(2)}
                </div>
                <button
                  onClick={() => {
                    const newItems = editingTransaction.items.filter((_, i) => i !== idx);
                    setEditingTransaction({ ...editingTransaction, items: newItems });
                  }}
                  className="col-span-1 text-red-500 hover:text-red-700"
                >
                  <Trash2 size={18} />
                </button>
              </div>
            ))}

            <button
              onClick={() => {
                const newItems = [
                  ...(editingTransaction.items || []),
                  { name: "", price: 0, quantity: 1, subtotal: 0 },
                ];
                setEditingTransaction({ ...editingTransaction, items: newItems });
              }}
              className={`w-full py-2 rounded mb-4 flex items-center justify-center gap-2 ${
                darkMode ? "bg-indigo-700 hover:bg-indigo-600 text-white" : "bg-indigo-100 hover:bg-indigo-200 text-indigo-700"
              }`}
            >
              + Add Item
            </button>

            <div className={`mt-4 pt-4 border-t ${border}`}>
              <div className={`flex justify-between text-lg font-bold mb-4 ${textPrimary}`}>
                <span>Total:</span>
                <span className={titleColor}>
                  $
                  {(editingTransaction.items || [])
                    .reduce((sum, i) => sum + (Number(i.subtotal) || 0), 0)
                    .toFixed(2)}
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
                    isProcessing
                      ? "bg-gray-200 text-gray-400 cursor-not-allowed"
                      : darkMode
                        ? "bg-gray-700 text-gray-300 hover:bg-gray-600"
                        : "bg-gray-300 text-gray-800 hover:bg-gray-400"
                  }`}
                >
                  Cancel
                </button>
              </div>
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
        <div className={`${cardBg} rounded-lg shadow-xl p-6 max-w-md w-full`}>
          <div className="flex justify-between items-center mb-6">
            <h2 className={`text-2xl font-bold ${titleColor}`}>Quick Sale Item</h2>
            <button onClick={() => setShowQuickItem(false)} className={`p-2 rounded ${darkMode ? "hover:bg-gray-700" : "hover:bg-gray-100"}`}>
              <X size={24} className={textPrimary} />
            </button>
          </div>

          <div className="space-y-4">
            <div>
              <label className={`block text-sm font-medium mb-1 ${textPrimary}`}>Item Name</label>
              <input
                type="text"
                placeholder="Enter item name"
                value={quickItem.name}
                onChange={(e) => setQuickItem({ ...quickItem, name: e.target.value })}
                className={`w-full px-3 py-2 border rounded ${inputBg}`}
              />
            </div>

            <div>
              <label className={`block text-sm font-medium mb-1 ${textPrimary}`}>Unit Price</label>
              <input
                type="number"
                step="0.01"
                placeholder="0.00"
                value={quickItem.price}
                onChange={(e) => setQuickItem({ ...quickItem, price: e.target.value })}
                className={`w-full px-3 py-2 border rounded ${inputBg}`}
              />
            </div>

            <div>
              <label className={`block text-sm font-medium mb-1 ${textPrimary}`}>Quantity</label>
              <input
                type="number"
                min="1"
                placeholder="1"
                value={quickItem.quantity}
                onChange={(e) => setQuickItem({ ...quickItem, quantity: e.target.value })}
                className={`w-full px-3 py-2 border rounded ${inputBg}`}
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
                className={`flex-1 py-2 rounded ${darkMode ? "bg-gray-700 text-white hover:bg-gray-600" : "bg-gray-300 text-gray-800 hover:bg-gray-400"}`}
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
        <div className={`${cardBg} rounded-lg shadow-xl p-6 max-w-md w-full`}>
          <div className="flex justify-between items-center mb-6">
            <h2 className={`text-2xl font-bold ${darkMode ? "text-green-400" : "text-green-600"}`}>Cash Transaction</h2>
            <button onClick={() => setShowCashModal(false)} className={`p-2 rounded ${darkMode ? "hover:bg-gray-700" : "hover:bg-gray-100"}`}>
              <X size={24} className={textPrimary} />
            </button>
          </div>

          <div className="space-y-4">
            <div>
              <label className={`block text-sm font-medium mb-2 ${textPrimary}`}>Transaction Type</label>
              <div className="flex gap-2">
                <button
                  onClick={() => setCashTransaction({ ...cashTransaction, type: "out" })}
                  className={`flex-1 py-3 rounded font-semibold ${
                    cashTransaction.type === "out"
                      ? "bg-red-600 text-white"
                      : darkMode
                        ? "bg-gray-700 text-gray-300"
                        : "bg-gray-200 text-gray-800"
                  }`}
                >
                  Cash Out
                </button>
                <button
                  onClick={() => setCashTransaction({ ...cashTransaction, type: "in" })}
                  className={`flex-1 py-3 rounded font-semibold ${
                    cashTransaction.type === "in"
                      ? "bg-green-600 text-white"
                      : darkMode
                        ? "bg-gray-700 text-gray-300"
                        : "bg-gray-200 text-gray-800"
                  }`}
                >
                  Cash In
                </button>
              </div>
            </div>

            <div>
              <label className={`block text-sm font-medium mb-1 ${textPrimary}`}>Reason</label>
              <input
                type="text"
                placeholder="e.g., Supplies, Owner withdrawal, Loan payment"
                value={cashTransaction.reason}
                onChange={(e) => setCashTransaction({ ...cashTransaction, reason: e.target.value })}
                className={`w-full px-3 py-2 border rounded ${inputBg}`}
              />
            </div>

            <div>
              <label className={`block text-sm font-medium mb-1 ${textPrimary}`}>Amount</label>
              <input
                type="number"
                step="0.01"
                placeholder="0.00"
                value={cashTransaction.amount}
                onChange={(e) => setCashTransaction({ ...cashTransaction, amount: e.target.value })}
                className={`w-full px-3 py-2 border rounded ${inputBg}`}
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
                className={`flex-1 py-3 rounded font-semibold ${darkMode ? "bg-gray-700 text-white hover:bg-gray-600" : "bg-gray-300 text-gray-800 hover:bg-gray-400"}`}
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
                  <p className={`text-sm ${darkMode ? "text-gray-400" : "text-gray-600"}`}>
                    {darkMode ? "Dark Mode" : "Light Mode"}
                  </p>
                </div>
                <button
                  onClick={() => setDarkMode(!darkMode)}
                  className={`relative inline-flex h-12 w-24 items-center rounded-full transition-colors ${
                    darkMode ? "bg-indigo-600" : "bg-gray-300"
                  }`}
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

  // CSV MODAL
  if (showCSVModal) {
    return (
      <div className="min-h-screen bg-gray-900 bg-opacity-50 fixed inset-0 flex items-center justify-center p-4 z-50">
        <div className={`${cardBg} rounded-lg shadow-xl p-6 max-w-4xl w-full max-h-[80vh] flex flex-col`}>
          <div className="flex justify-between items-center mb-4">
            <div>
              <h2 className={`text-2xl font-bold ${titleColor}`}>CSV Export</h2>
              <p className={`text-sm ${textSecondary}`}>{csvFilename}</p>
            </div>
            <button onClick={() => setShowCSVModal(false)} className={`p-2 rounded ${darkMode ? "hover:bg-gray-700" : "hover:bg-gray-100"}`}>
              <X size={24} className={textPrimary} />
            </button>
          </div>

          <div className={`flex-1 overflow-y-auto mb-4 p-4 rounded border ${darkMode ? "bg-gray-900 border-gray-700" : "bg-gray-50 border-gray-300"}`}>
            <pre className={`text-xs ${textPrimary} whitespace-pre font-mono`}>{csvContent}</pre>
          </div>

          <div className="flex gap-2">
            <button onClick={copyCSVToClipboard} className="flex-1 bg-indigo-600 text-white py-3 rounded hover:bg-indigo-700 font-semibold">
              📋 Copy to Clipboard
            </button>
            <button
              onClick={() => setShowCSVModal(false)}
              className={`flex-1 py-3 rounded font-semibold ${darkMode ? "bg-gray-700 text-white hover:bg-gray-600" : "bg-gray-300 text-gray-800 hover:bg-gray-400"}`}
            >
              Close
            </button>
          </div>

          <p className={`text-sm ${textMuted} mt-3 text-center`}>
            Copy the CSV data above and paste it into Excel, Google Sheets, or save as a .csv file
          </p>
        </div>
      </div>
    );
  }

  // DELETE CONFIRMATION MODAL
  if (deletingItemId) {
    const itemToDelete = items.find((i) => i.id === deletingItemId);

    return (
      <div className="min-h-screen bg-gray-900 bg-opacity-50 fixed inset-0 flex items-center justify-center p-4 z-50">
        <div className={`${cardBg} rounded-lg shadow-xl p-6 max-w-md w-full`}>
          <h2 className={`text-xl font-bold mb-4 ${textPrimary}`}>Delete Item?</h2>
          <p className={`mb-6 ${textSecondary}`}>
            Are you sure you want to delete "{itemToDelete?.name}"? This action cannot be undone.
          </p>
          <div className="flex gap-2">
            <button onClick={() => confirmDeleteItem(deletingItemId)} className="flex-1 bg-red-600 text-white py-2 rounded hover:bg-red-700">
              Delete
            </button>
            <button
              onClick={() => setDeletingItemId(null)}
              className={`flex-1 py-2 rounded ${darkMode ? "bg-gray-700 text-white hover:bg-gray-600" : "bg-gray-300 text-gray-800 hover:bg-gray-400"}`}
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ITEM MANAGER VIEW
  if (showItemManager) {
    const predefinedColors = ["#6366f1","#ef4444","#f59e0b","#10b981","#3b82f6","#8b5cf6","#ec4899","#06b6d4"];

    return (
      <div className={`min-h-screen ${bgClass} p-4`}>
        <div className="max-w-7xl mx-auto">
          <div className="flex justify-between items-center mb-6">
            <h1 className={`text-4xl font-bold ${titleColor}`}>Manage Items</h1>
            <button onClick={() => setShowItemManager(false)} className={`px-4 py-2 ${btnBg} ${btnText} rounded-lg shadow`}>
              ← Back to POS
            </button>
          </div>

          <div className={`${cardBg} rounded-lg shadow-xl p-6 mb-6`}>
            {!editingItem && (
              <div className={`mb-6 p-4 rounded ${darkMode ? "bg-gray-700" : "bg-gray-50"}`}>
                <h3 className={`font-semibold mb-3 ${textPrimary}`}>Add New Item</h3>
                <div className="grid grid-cols-4 gap-2 mb-2">
                  <input
                    type="text"
                    placeholder="Item name"
                    value={newItem.name}
                    onChange={(e) => setNewItem({ ...newItem, name: e.target.value })}
                    className={`px-3 py-2 border rounded ${inputBg}`}
                  />
                  <input
                    type="number"
                    step="0.01"
                    placeholder="Price"
                    value={newItem.price}
                    onChange={(e) => setNewItem({ ...newItem, price: e.target.value })}
                    className={`px-3 py-2 border rounded ${inputBg}`}
                  />
                  <input
                    type="text"
                    placeholder="Category"
                    value={newItem.category}
                    onChange={(e) => setNewItem({ ...newItem, category: e.target.value })}
                    className={`px-3 py-2 border rounded ${inputBg}`}
                  />
                  <input
                    type="text"
                    placeholder="HEX (#6366f1)"
                    value={newItem.color}
                    onChange={(e) => setNewItem({ ...newItem, color: e.target.value })}
                    className={`px-3 py-2 border rounded ${inputBg}`}
                    maxLength={7}
                  />
                </div>
                <div className="flex gap-2 mb-2">
                  {predefinedColors.map((color) => (
                    <button
                      key={color}
                      onClick={() => setNewItem({ ...newItem, color })}
                      className={`w-10 h-10 rounded border-2 ${newItem.color === color ? "border-white ring-2 ring-indigo-500" : "border-gray-300"}`}
                      style={{ backgroundColor: color }}
                      title={color}
                    />
                  ))}
                </div>
                <button onClick={addItem} className="w-full bg-indigo-600 text-white py-2 rounded hover:bg-indigo-700">
                  Add Item
                </button>
              </div>
            )}

            {editingItem && (
              <div className={`mb-6 p-4 rounded ${darkMode ? "bg-gray-700" : "bg-gray-50"}`}>
                <h3 className={`font-semibold mb-3 ${textPrimary}`}>Edit Item</h3>
                <div className="grid grid-cols-4 gap-2 mb-2">
                  <input
                    type="text"
                    placeholder="Item name"
                    value={editingItem.name ?? ""}
                    onChange={(e) => setEditingItem({ ...editingItem, name: e.target.value })}
                    className={`px-3 py-2 border rounded ${inputBg}`}
                  />
                  <input
                    type="number"
                    step="0.01"
                    placeholder="Price"
                    value={editingItem.price ?? ""}
                    onChange={(e) => setEditingItem({ ...editingItem, price: parseFloat(e.target.value) || 0 })}
                    className={`px-3 py-2 border rounded ${inputBg}`}
                  />
                  <input
                    type="text"
                    placeholder="Category"
                    value={editingItem.category ?? ""}
                    onChange={(e) => setEditingItem({ ...editingItem, category: e.target.value })}
                    className={`px-3 py-2 border rounded ${inputBg}`}
                  />
                  <input
                    type="text"
                    placeholder="HEX (#6366f1)"
                    value={editingItem.color ?? ""}
                    onChange={(e) => setEditingItem({ ...editingItem, color: e.target.value })}
                    className={`px-3 py-2 border rounded ${inputBg}`}
                    maxLength={7}
                  />
                </div>
                <div className="flex gap-2 mb-2">
                  {predefinedColors.map((color) => (
                    <button
                      key={color}
                      onClick={() => setEditingItem(prev => ({ ...(prev || {}), color }))}
                      className={`w-10 h-10 rounded border-2 ${editingItem.color === color ? "border-white ring-2 ring-indigo-500" : "border-gray-300"}`}
                      style={{ backgroundColor: color }}
                      title={color}
                    />
                  ))}
                </div>
                <div className="flex gap-2">
                  <button onClick={updateItem} className="flex-1 bg-green-600 text-white py-2 rounded hover:bg-green-700">
                    Save Changes
                  </button>
                  <button
                    onClick={() => setEditingItem(null)}
                    className={`flex-1 py-2 rounded ${darkMode ? "bg-gray-600 text-white hover:bg-gray-500" : "bg-gray-300 text-gray-800 hover:bg-gray-400"}`}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            <h3 className={`font-semibold mb-3 ${textPrimary}`}>Current Items ({items.length})</h3>
            <div className="space-y-2">
              {items.map((item) => (
                <div
                  key={item.id}
                  className="flex justify-between items-center p-3 rounded border-l-4"
                  style={{
                    borderLeftColor: item.color || "#6366f1",
                    backgroundColor: darkMode ? "#374151" : "#f9fafb",
                  }}
                >
                  <div>
                    <div className={`font-medium ${textPrimary}`}>{item.name}</div>
                    <div className={textSecondary}>
                      ${Number(item.price).toFixed(2)} • {item.category}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => setEditingItem({ ...item })} className={`p-2 rounded ${darkMode ? "hover:bg-gray-600" : "hover:bg-gray-200"}`}>
                      <Edit2 size={18} className="text-indigo-500" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeletingItemId(item.id);
                      }}
                      className={`p-2 rounded ${darkMode ? "hover:bg-gray-600" : "hover:bg-gray-200"}`}
                    >
                      <Trash2 size={18} className="text-red-500" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
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
      <div className={`min-h-screen ${bgClass} p-4`}>
        <div className="max-w-7xl mx-auto">
          <div className="flex justify-between items-center mb-6">
            <h1 className={`text-4xl font-bold ${titleColor}`}>All Receipts</h1>
            <div className="flex gap-2">
              <button onClick={showReceiptsCSV} className={`px-4 py-2 ${btnBg} ${btnText} rounded-lg shadow flex items-center gap-2`}>
                📥 Export CSV
              </button>
              <button onClick={() => setShowReceiptsView(false)} className={`px-4 py-2 ${btnBg} ${btnText} rounded-lg shadow`}>
                ← Back to POS
              </button>
            </div>
          </div>

          <div className={`${cardBg} rounded-lg shadow-xl p-6`}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className={`border-b-2 ${border}`}>
                    <th className={`text-left py-2 px-2 ${textPrimary}`}>Receipt #</th>
                    <th className={`text-left py-2 px-2 ${textPrimary}`}>Customer Name</th>
                    <th className={`text-left py-2 px-2 ${textPrimary}`}>Item</th>
                    <th className={`text-right py-2 px-2 ${textPrimary}`}>Quantity</th>
                    <th className={`text-right py-2 px-2 ${textPrimary}`}>Total Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {receiptItems.map((row, idx) => (
                    <tr
                      key={idx}
                      onClick={() => setViewingTransaction(row.tx)}
                      className={`border-b ${border} cursor-pointer ${hoverBg}`}
                    >
                      <td className={`py-2 px-2 font-semibold ${textPrimary}`}>{row.tx.receiptNumber}</td>
                      <td className={`py-2 px-2 ${textSecondary}`}>{row.tx.customerName || "-"}</td>
                      <td className={`py-2 px-2 ${textPrimary}`}>{row.item.name}</td>
                      <td className={`py-2 px-2 text-right ${textPrimary}`}>{row.item.quantity}</td>
                      <td className={`py-2 px-2 text-right font-semibold ${textPrimary}`}>${Number(row.item.subtotal).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {receiptItems.length === 0 && <p className={`${textMuted} text-center py-8`}>No receipts yet</p>}
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
      <div className={`min-h-screen ${bgClass} p-4`}>
        <div className="max-w-7xl mx-auto">
          <div className="flex justify-between items-center mb-6">
            <h1 className={`text-4xl font-bold ${darkMode ? "text-orange-400" : "text-orange-600"}`}>All Invoices</h1>
            <div className="flex gap-2">
              <button onClick={showInvoicesCSV} className={`px-4 py-2 ${btnBg} ${btnText} rounded-lg shadow flex items-center gap-2`}>
                📥 Export CSV
              </button>
              <button onClick={() => setShowInvoicesView(false)} className={`px-4 py-2 ${btnBg} ${btnText} rounded-lg shadow`}>
                ← Back to POS
              </button>
            </div>
          </div>

          <div className={`${cardBg} rounded-lg shadow-xl p-6`}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className={`border-b-2 ${border}`}>
                    <th className={`text-left py-2 px-2 ${textPrimary}`}>Invoice #</th>
                    <th className={`text-left py-2 px-2 ${textPrimary}`}>Customer Name</th>
                    <th className={`text-left py-2 px-2 ${textPrimary}`}>Item</th>
                    <th className={`text-right py-2 px-2 ${textPrimary}`}>Quantity</th>
                    <th className={`text-right py-2 px-2 ${textPrimary}`}>Total Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {invoiceItems.map((row, idx) => (
                    <tr
                      key={idx}
                      onClick={() => setViewingTransaction(row.tx)}
                      className={`border-b ${border} cursor-pointer ${hoverBg}`}
                    >
                      <td className={`py-2 px-2 font-semibold ${textPrimary}`}>{row.tx.invoiceNumber}</td>
                      <td className={`py-2 px-2 ${textSecondary}`}>{row.tx.customerName || "-"}</td>
                      <td className={`py-2 px-2 ${textPrimary}`}>{row.item.name}</td>
                      <td className={`py-2 px-2 text-right ${textPrimary}`}>{row.item.quantity}</td>
                      <td className={`py-2 px-2 text-right font-semibold ${textPrimary}`}>${Number(row.item.subtotal).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {invoiceItems.length === 0 && <p className={`${textMuted} text-center py-8`}>No invoices yet</p>}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // MAIN APP (Transactions view)
  if (showTransactions) {
    const displayTxs = selectedDate ? getDateTransactions(selectedDate) : getTodayTransactions();
    const dailySummary = getDailySummary(displayTxs);
    const cashSales = displayTxs.filter((tx) => !tx.cancelled && tx.paymentMethod === "cash").reduce((sum, tx) => sum + (Number(tx.total) || 0), 0);
    const creditSales = displayTxs.filter((tx) => !tx.cancelled && tx.paymentMethod === "credit").reduce((sum, tx) => sum + (Number(tx.total) || 0), 0);

    return (
      <div className={`min-h-screen ${bgClass} p-4`}>
        <div className="max-w-7xl mx-auto">
          <div className="flex justify-between items-center mb-6">
            <h1 className={`text-4xl font-bold ${titleColor}`}>Transactions</h1>
            <div className="flex gap-2">
              <button onClick={showTransactionsCSV} className={`px-4 py-2 ${btnBg} ${btnText} rounded-lg shadow flex items-center gap-2`}>
                📥 Export CSV
              </button>
              <button
                onClick={() => {
                  setShowTransactions(false);
                  setSelectedDate(null);
                }}
                className={`px-4 py-2 ${btnBg} ${btnText} rounded-lg shadow`}
              >
                ← Back to POS
              </button>
            </div>
          </div>

          <div className={`${cardBg} rounded-lg shadow-xl p-6`}>
            <div className="flex justify-between items-center mb-4">
              <h2 className={`text-2xl font-semibold ${textPrimary}`}>
                {selectedDate
                  ? selectedDate.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })
                  : "Today's Transactions"}
              </h2>
              {selectedDate && (
                <button onClick={() => setSelectedDate(null)} className={`text-sm ${titleColor} ${darkMode ? "hover:text-indigo-300" : "hover:text-indigo-800"}`}>
                  View Today
                </button>
              )}
            </div>

            <div className={`grid grid-cols-2 gap-4 mb-4 p-4 rounded ${darkMode ? "bg-gray-700" : "bg-indigo-50"}`}>
              <div>
                <div className={textSecondary}>Total Cash Sales</div>
                <div className={`text-2xl font-bold ${darkMode ? "text-blue-400" : "text-blue-600"}`}>${cashSales.toFixed(2)}</div>
              </div>
              <div>
                <div className={textSecondary}>Total Credit Sales</div>
                <div className={`text-2xl font-bold ${darkMode ? "text-orange-400" : "text-orange-600"}`}>${creditSales.toFixed(2)}</div>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className={`border-b-2 ${border}`}>
                    <th className={`text-left py-2 px-2 ${textPrimary}`}>Time</th>
                    <th className={`text-left py-2 px-2 ${textPrimary}`}>Item</th>
                    <th className={`text-right py-2 px-2 ${textPrimary}`}>Qty</th>
                    <th className={`text-right py-2 px-2 ${textPrimary}`}>Cost</th>
                    <th className={`text-right py-2 px-2 ${textPrimary}`}>Running Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {dailySummary.map((row, idx) => {
                    const tx = displayTxs.find((t) => t.id === row.txId);
                    return (
                      <tr
                        key={idx}
                        onClick={() => setViewingTransaction(tx)}
                        className={`border-b ${border} cursor-pointer ${hoverBg} ${
                          row.cancelled
                            ? darkMode ? "bg-red-900 bg-opacity-20" : "bg-red-50"
                            : row.paymentMethod === "credit"
                              ? darkMode ? "bg-orange-900 bg-opacity-20" : "bg-orange-50"
                              : ""
                        }`}
                      >
                        {row.itemIndex === 0 ? (
                          <td className={`py-2 px-2 ${textPrimary}`} rowSpan={row.totalItems}>
                            {new Date(row.timestamp).toLocaleTimeString()}
                          </td>
                        ) : null}
                        <td className={`py-2 px-2 ${textPrimary} ${row.cancelled ? "line-through" : ""}`}>
                          {row.item.name}
                          {row.edited && <span className={darkMode ? "text-orange-400" : "text-orange-600"}> *</span>}
                          {row.cancelled && <span className="ml-2 text-xs px-1 py-0.5 bg-red-500 text-white rounded">CANCELLED</span>}
                          {row.paymentMethod === "credit" && !row.cancelled && (
                            <span className="ml-2 text-xs px-1 py-0.5 bg-orange-500 text-white rounded">CREDIT</span>
                          )}
                        </td>
                        <td className={`py-2 px-2 text-right ${textPrimary} ${row.cancelled ? "line-through" : ""}`}>{row.item.quantity}</td>
                        <td className={`py-2 px-2 text-right font-semibold ${textPrimary} ${row.cancelled ? "line-through" : ""}`}>
                          ${Number(row.item.subtotal).toFixed(2)}
                        </td>
                        <td className={`py-2 px-2 text-right font-bold ${titleColor}`}>
                          {row.runningBalance !== null ? `$${row.runningBalance.toFixed(2)}` : "-"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

          </div>
        </div>
      </div>
    );
  }

  // MAIN POS SCREEN
  return (
    <div className={`min-h-screen ${bgClass} p-4`}>
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h1 className={`text-4xl font-bold ${darkMode ? "text-indigo-400" : "text-indigo-600"}`}>POS</h1>
          <div className="flex gap-1.5">
            <button onClick={() => setShowReceiptsView(true)} className={`px-3 py-2 ${btnBg} ${btnText} rounded-lg shadow transition-all flex items-center gap-1.5 text-sm font-medium`}>
              <Receipt size={18} />
              REC
            </button>
            <button onClick={() => setShowInvoicesView(true)} className={`px-3 py-2 ${btnBg} ${btnText} rounded-lg shadow transition-all flex items-center gap-1.5 text-sm font-medium`}>
              <FileText size={18} />
              INV
            </button>
            <button onClick={() => setShowTransactions(true)} className={`px-3 py-2 ${btnBg} ${btnText} rounded-lg shadow transition-all flex items-center gap-1.5 text-sm font-medium`}>
              <List size={18} />
              TRN
            </button>
            <button onClick={() => setShowItemManager(true)} className={`px-3 py-2 ${btnBg} ${btnText} rounded-lg shadow transition-all flex items-center gap-1.5 text-sm font-medium`}>
              <Package size={18} />
              ITEM
            </button>
            <button onClick={() => setShowCalendar(true)} className={`px-3 py-2 ${btnBg} ${btnText} rounded-lg shadow transition-all flex items-center gap-1.5 text-sm font-medium`}>
              <Calendar size={18} />
              CAL
            </button>
            <button onClick={() => setShowSettings(true)} className={`px-3 py-2 ${btnBg} ${btnText} rounded-lg shadow transition-all flex items-center justify-center`}>
              <Settings size={18} />
            </button>
          </div>
        </div>

        <div className={`${cardBg} rounded-lg shadow-xl p-6 mb-6`}>
          <div className="flex justify-between items-center mb-4">
            <h2 className={`text-2xl font-semibold ${textPrimary}`}>Transaction</h2>
            <div className="flex gap-2 flex-wrap">
              {["all", ...new Set(items.map((i) => i.category))].map((cat) => (
                <button
                  key={cat}
                  onClick={() => setCategoryFilter(cat)}
                  className={`px-3 py-1 rounded text-sm font-medium ${
                    categoryFilter === cat
                      ? "bg-indigo-600 text-white"
                      : darkMode
                        ? "bg-gray-700 text-gray-300 hover:bg-gray-600"
                        : "bg-gray-200 text-gray-700 hover:bg-gray-300"
                  }`}
                >
                  {cat === "all" ? "All" : cat}
                </button>
              ))}
            </div>
          </div>

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

            {items
              .filter((item) => categoryFilter === "all" || item.category === categoryFilter)
              .map((item) => (
                <button
                  key={item.id}
                  onClick={() => addToSale(item)}
                  className="text-white p-4 rounded-lg transition-colors shadow-md"
                  style={{ backgroundColor: item.color || "#6366f1" }}
                  onMouseEnter={(e) => (e.currentTarget.style.filter = "brightness(0.9)")}
                  onMouseLeave={(e) => (e.currentTarget.style.filter = "brightness(1)")}
                >
                  <div className="font-bold text-lg">{item.name}</div>
                  <div className="text-sm">${Number(item.price).toFixed(2)}</div>
                  <div className="text-xs opacity-75">{item.category}</div>
                </button>
              ))}
          </div>

          {items.length === 0 && (
            <p className={`${textMuted} text-center py-8`}>
              No items yet. Click "Manage Items" to add items.
            </p>
          )}
        </div>

        {currentSale.length > 0 && (
          <div className={`${cardBg} rounded-lg shadow-xl p-6`}>
            <h2 className={`text-2xl font-semibold mb-4 ${textPrimary}`}>Current Sale</h2>

            <div className="space-y-2 mb-4">
              {currentSale.map((item) => (
                <div key={item.id} className={`flex justify-between items-center p-3 rounded ${darkMode ? "bg-gray-700" : "bg-gray-50"}`}>
                  <span className={`font-medium ${textPrimary}`}>{item.name}</span>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => updateQuantity(item.id, item.quantity - 1)}
                      className={`w-8 h-8 rounded ${darkMode ? "bg-gray-600 hover:bg-gray-500" : "bg-gray-300 hover:bg-gray-400"} ${textPrimary}`}
                    >
                      -
                    </button>
                    <span className={`w-12 text-center font-semibold ${textPrimary}`}>{item.quantity}</span>
                    <button
                      onClick={() => updateQuantity(item.id, item.quantity + 1)}
                      className={`w-8 h-8 rounded ${darkMode ? "bg-gray-600 hover:bg-gray-500" : "bg-gray-300 hover:bg-gray-400"} ${textPrimary}`}
                    >
                      +
                    </button>
                    <span className={`w-24 text-right font-bold ${textPrimary}`}>
                      ${(Number(item.price) * Number(item.quantity)).toFixed(2)}
                    </span>
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
                Total: $
                {currentSale.reduce((sum, i) => sum + (Number(i.price) * Number(i.quantity)), 0).toFixed(2)}
              </div>
            </div>

            <div className="flex gap-2 mb-4">
              <button
                onClick={() => setPaymentMethod("cash")}
                className={`flex-1 py-3 rounded font-semibold ${
                  paymentMethod === "cash"
                    ? "bg-indigo-600 text-white"
                    : darkMode
                      ? "bg-gray-700 text-gray-300"
                      : "bg-gray-200 text-gray-800"
                }`}
              >
                Cash
              </button>
              <button
                onClick={() => setPaymentMethod("credit")}
                className={`flex-1 py-3 rounded font-semibold ${
                  paymentMethod === "credit"
                    ? "bg-indigo-600 text-white"
                    : darkMode
                      ? "bg-gray-700 text-gray-300"
                      : "bg-gray-200 text-gray-800"
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
