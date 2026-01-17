"use client";
import React, { useState, useEffect } from 'react';
import { X, Calendar, Edit2, Trash2, Save, Receipt, FileText, List, Package, Settings, Sun, Moon } from 'lucide-react';


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
  const [newItem, setNewItem] = useState({ name: '', price: '', category: '' });
  
  // Current sale
  const [currentSale, setCurrentSale] = useState([]);
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [customerName, setCustomerName] = useState('');
  const [showQuickItem, setShowQuickItem] = useState(false);
  const [quickItem, setQuickItem] = useState({ name: '', price: '', quantity: 1 });
  const [showCashModal, setShowCashModal] = useState(false);
  const [cashTransaction, setCashTransaction] = useState({ type: 'out', reason: '', amount: '' });
  const [isProcessing, setIsProcessing] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [darkMode, setDarkMode] = useState(false);

  // -----------------------------
  // Ledger helpers (keep UI lean)
  // -----------------------------

  const clampInt = (value, min, fallback) => {
    const n = parseInt(value, 10);
    if (Number.isNaN(n)) return fallback;
    return Math.max(min, n);
  };

  const makeId = (prefix = 'id') => {
    try {
      if (typeof crypto !== 'undefined' && crypto.randomUUID) return `${prefix}_${crypto.randomUUID()}`;
    } catch (_) {
      // ignore
    }
    return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  };

  const computeTransactionTotal = (tx) => (tx.items || []).reduce((sum, i) => sum + (Number(i.subtotal) || 0), 0);

  const computeDailySummary = (txs) => {
    // Always recompute from scratch each render.
    // Sort to ensure edits to timestamps are reflected in running balances.
    const sorted = [...txs].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    let runningBalance = 0;
    const summary = [];

    sorted.forEach((tx) => {
      tx.items.forEach((item, idx) => {
        const isCash = tx.paymentMethod === 'cash' && !tx.cancelled;
        if (isCash) runningBalance += item.subtotal;

        summary.push({
          txId: tx.id,
          timestamp: tx.timestamp,
          item,
          itemIndex: idx,
          totalItems: tx.items.length,
          paymentMethod: tx.paymentMethod,
          cancelled: tx.cancelled,
          edited: tx.editHistory.length > 0,
          type: tx.type || 'sale',
          runningBalance: isCash ? runningBalance : null
        });
      });
    });

    return { sortedTxs: sorted, rows: summary };
  };

  // Generate receipt/invoice number in format YYMMDDNNNN (safe counter per day)
  const generateNumber = async () => {
    const now = new Date();
    const year = now.getFullYear().toString().slice(-2);
    const month = (now.getMonth() + 1).toString().padStart(2, '0');
    const day = now.getDate().toString().padStart(2, '0');
    const prefix = `${year}${month}${day}`;

    const counterKey = `pos-counter:${prefix}`;
    const last = await window.storage.get(counterKey);
    const lastNum = last ? Number(last.value) : 0;
    const next = Number.isFinite(lastNum) ? lastNum + 1 : 1;
    await window.storage.set(counterKey, String(next));

    return `${prefix}${String(next).padStart(4, '0')}`;
  };

  // Load data on mount
  useEffect(() => {
    loadData();
  }, []);

  // Persist theme
  useEffect(() => {
    (async () => {
      try {
        await window.storage.set('pos-dark-mode', JSON.stringify(darkMode));
      } catch (e) {
        // Non-fatal
        console.warn('Failed to persist theme:', e);
      }
    })();
  }, [darkMode]);

  const loadData = async () => {
    try {
      const themeResult = await window.storage.get('pos-dark-mode');
      if (themeResult) setDarkMode(Boolean(JSON.parse(themeResult.value)));

      const itemsResult = await window.storage.get('pos-items');
      if (itemsResult) setItems(JSON.parse(itemsResult.value));
      
      const txResult = await window.storage.list('tx:');
      if (txResult && txResult.keys) {
        const txs = [];
        for (const key of txResult.keys) {
          const data = await window.storage.get(key);
          if (data) txs.push(JSON.parse(data.value));
        }
        txs.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
        setTransactions(txs);
      }
    } catch (error) {
      console.log('No data found:', error);
    }
  };

  // Persist theme choice
  useEffect(() => {
    (async () => {
      try {
        await window.storage.set('pos-dark-mode', JSON.stringify(darkMode));
      } catch (_) {
        // non-fatal
      }
    })();
  }, [darkMode]);

  const saveItems = async (newItems) => {
    try {
      console.log('Saving items:', newItems);
      await window.storage.set('pos-items', JSON.stringify(newItems));
      setItems(newItems);
      console.log('Items saved successfully');
    } catch (error) {
      console.error('Error saving items:', error);
      alert('Error saving items: ' + error.message);
    }
  };

  const addItem = () => {
    if (!newItem.name || !newItem.price) {
      alert('Please enter item name and price');
      return;
    }
    const item = {
      id: Date.now(),
      name: newItem.name,
      price: parseFloat(newItem.price),
      category: newItem.category || 'General'
    };
    saveItems([...items, item]);
    setNewItem({ name: '', price: '', category: '' });
  };

  const deleteItem = async (id) => {
    console.log('Delete item called with id:', id);
    console.log('Current items:', items);
    
    const newItems = items.filter(i => i.id !== id);
    console.log('New items after filter:', newItems);
    await saveItems(newItems);
  };

  const addToSale = (item) => {
    const existing = currentSale.find(i => i.id === item.id);
    if (existing) {
      setCurrentSale(currentSale.map(i => 
        i.id === item.id ? { ...i, quantity: i.quantity + 1 } : i
      ));
    } else {
      setCurrentSale([...currentSale, { ...item, quantity: 1 }]);
    }
  };

  const addQuickItemToSale = () => {
    if (!quickItem.name || !quickItem.price || !quickItem.quantity) {
      alert('Please fill in all fields');
      return;
    }

    const tempItem = {
      id: makeId('quick'),
      name: quickItem.name,
      price: parseFloat(quickItem.price),
      quantity: clampInt(quickItem.quantity, 1, 1),
      category: 'Quick Sale'
    };

    setCurrentSale([...currentSale, tempItem]);
    setQuickItem({ name: '', price: '', quantity: 1 });
    setShowQuickItem(false);
  };

  const recordCashTransaction = async () => {
    if (!cashTransaction.reason || !cashTransaction.amount) {
      alert('Please enter reason and amount');
      return;
    }

    const amount = parseFloat(cashTransaction.amount);
    if (isNaN(amount) || amount <= 0) {
      alert('Please enter a valid amount');
      return;
    }

    setIsProcessing(true);
    
    try {
      const number = await generateNumber();
      const txId = makeId('tx');
      
      const transaction = {
        id: txId,
        timestamp: new Date().toISOString(),
        customerName: '',
        items: [{
          name: `Cash ${cashTransaction.type === 'out' ? 'Out' : 'In'}: ${cashTransaction.reason}`,
          price: cashTransaction.type === 'out' ? -amount : amount,
          quantity: 1,
          subtotal: cashTransaction.type === 'out' ? -amount : amount
        }],
        total: cashTransaction.type === 'out' ? -amount : amount,
        paymentMethod: 'cash',
        receiptNumber: number,
        editHistory: [],
        cancelled: false,
        isCashTransaction: true,
        cashType: cashTransaction.type,
        type: cashTransaction.type === 'out' ? 'cash-out' : 'cash-in'
      };

      await window.storage.set(`tx:${transaction.id}`, JSON.stringify(transaction));
      await loadData();
      setCashTransaction({ type: 'out', reason: '', amount: '' });
      setShowCashModal(false);
      alert(`Cash ${cashTransaction.type} recorded! Receipt #${number}`);
    } catch (error) {
      console.error('Error saving cash transaction:', error);
      alert('Failed to save cash transaction');
    } finally {
      setIsProcessing(false);
    }
  };

  const updateQuantity = (id, quantity) => {
    if (quantity <= 0) {
      setCurrentSale(currentSale.filter(i => i.id !== id));
    } else {
      setCurrentSale(currentSale.map(i => 
        i.id === id ? { ...i, quantity } : i
      ));
    }
  };

  const completeSale = async () => {
    if (currentSale.length === 0) {
      alert('No items in sale');
      return;
    }

    if (paymentMethod === 'credit' && !customerName.trim()) {
      alert('Customer name is required for credit sales');
      return;
    }

    setIsProcessing(true);
    
    try {
      const number = await generateNumber();
      const txId = makeId('tx');
      
      const transaction = {
        id: txId,
        timestamp: new Date().toISOString(),
        customerName: customerName.trim(),
        items: currentSale.map(i => ({
          name: i.name,
          price: i.price,
          quantity: i.quantity,
          subtotal: i.price * i.quantity
        })),
        total: currentSale.reduce((sum, i) => sum + (i.price * i.quantity), 0),
        paymentMethod,
        receiptNumber: paymentMethod === 'cash' ? number : null,
        invoiceNumber: paymentMethod === 'credit' ? number : null,
        editHistory: [],
        cancelled: false,
        type: 'sale'
      };

      await window.storage.set(`tx:${transaction.id}`, JSON.stringify(transaction));
      await loadData();
      setCurrentSale([]);
      setPaymentMethod('cash');
      setCustomerName('');
      alert(`${paymentMethod === 'cash' ? 'Receipt' : 'Invoice'} #${number} created!`);
    } catch (error) {
      console.error('Error saving transaction:', error);
      alert('Failed to save transaction');
    } finally {
      setIsProcessing(false);
    }
  };

  const saveEditedTransaction = async () => {
    if (!editingTransaction) return;

    setIsProcessing(true);
    
    try {
      const changes = [];
      
      // Check timestamp change
      if (viewingTransaction.timestamp !== editingTransaction.timestamp) {
        changes.push({
          field: 'Time',
          from: new Date(viewingTransaction.timestamp).toLocaleString(),
          to: new Date(editingTransaction.timestamp).toLocaleString()
        });
      }
      
      // Check customer name change
      if (viewingTransaction.customerName !== editingTransaction.customerName) {
        changes.push({
          field: 'Customer Name',
          from: viewingTransaction.customerName || '(none)',
          to: editingTransaction.customerName || '(none)'
        });
      }
      
      // Check items changes
      if (JSON.stringify(viewingTransaction.items) !== JSON.stringify(editingTransaction.items)) {
        viewingTransaction.items.forEach((oldItem, idx) => {
          const newItem = editingTransaction.items[idx];
          if (newItem) {
            if (oldItem.name !== newItem.name) {
              changes.push({ field: `Item ${idx + 1} Name`, from: oldItem.name, to: newItem.name });
            }
            if (oldItem.price !== newItem.price) {
              changes.push({ field: `Item ${idx + 1} Price`, from: `$${oldItem.price}`, to: `$${newItem.price}` });
            }
            if (oldItem.quantity !== newItem.quantity) {
              changes.push({ field: `Item ${idx + 1} Quantity`, from: oldItem.quantity, to: newItem.quantity });
            }
          }
        });
        
        if (editingTransaction.items.length !== viewingTransaction.items.length) {
          changes.push({ 
            field: 'Items Count', 
            from: viewingTransaction.items.length, 
            to: editingTransaction.items.length 
          });
        }
      }

      const editRecord = {
        timestamp: new Date().toISOString(),
        changes: changes,
        oldTotal: viewingTransaction.total,
        newTotal: editingTransaction.items.reduce((sum, i) => sum + i.subtotal, 0)
      };

      editingTransaction.editHistory.push(editRecord);
      editingTransaction.total = editingTransaction.items.reduce((sum, i) => sum + i.subtotal, 0);

      await window.storage.set(`tx:${editingTransaction.id}`, JSON.stringify(editingTransaction));
      await loadData();
      setEditingTransaction(null);
      setViewingTransaction(null);
      alert('Transaction updated!');
    } catch (error) {
      console.error('Error updating transaction:', error);
      alert('Failed to update transaction');
    } finally {
      setIsProcessing(false);
    }
  };

  const cancelTransaction = async () => {
    setIsProcessing(true);
    
    try {
      const cancelled = { ...viewingTransaction, cancelled: true };
      
      await window.storage.set(`tx:${cancelled.id}`, JSON.stringify(cancelled));
      await loadData();
      setViewingTransaction(null);
      alert('Transaction cancelled!');
    } catch (error) {
      console.error('Error cancelling:', error);
      alert('Failed to cancel transaction');
    } finally {
      setIsProcessing(false);
    }
  };

  const getTodayTransactions = () => {
    const today = new Date().toDateString();
    return transactions.filter(tx => new Date(tx.timestamp).toDateString() === today);
  };

  const getDateTransactions = (date) => {
    const dateStr = date.toDateString();
    return transactions.filter(tx => new Date(tx.timestamp).toDateString() === dateStr);
  };

  const getCalendarDays = () => {
    const year = calendarMonth.getFullYear();
    const month = calendarMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startingDayOfWeek = firstDay.getDay();
    const days = [];
    
    for (let i = 0; i < startingDayOfWeek; i++) {
      days.push(null);
    }
    
    for (let day = 1; day <= lastDay.getDate(); day++) {
      const date = new Date(year, month, day);
      const txs = getDateTransactions(date);
      days.push({
        date,
        day,
        txCount: txs.length,
        isToday: date.toDateString() === new Date().toDateString()
      });
    }
    
    return days;
  };

  // CALENDAR MODAL
  if (showCalendar) {
    const calendarDays = getCalendarDays();
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 
                        'July', 'August', 'September', 'October', 'November', 'December'];
    
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
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
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
                  className={`aspect-square p-2 rounded ${
                    dayData.isToday ? 'ring-2 ring-indigo-500' : ''
                  } ${
                    dayData.txCount > 0
                      ? 'bg-indigo-50 hover:bg-indigo-100 cursor-pointer'
                      : 'bg-gray-100 cursor-not-allowed opacity-50'
                  }`}
                >
                  <div className="font-bold">{dayData.day}</div>
                  {dayData.txCount > 0 && (
                    <div className="text-xs text-indigo-600">{dayData.txCount} tx</div>
                  )}
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
            {tx.receiptNumber && (
              <p className="text-center font-bold text-lg mt-2">Receipt #: {tx.receiptNumber}</p>
            )}
            <p className="text-center text-xs text-gray-500 mt-2">
              {new Date(tx.timestamp).toLocaleString()}
            </p>
            {tx.customerName && (
              <p className="text-center font-semibold mt-2">Customer: {tx.customerName}</p>
            )}
          </div>
          
          <div className="space-y-2 mb-6">
            {tx.items.map((item, idx) => (
              <div key={idx} className="flex justify-between text-sm">
                <span>{item.name} x{item.quantity}</span>
                <span className="font-semibold">${item.subtotal.toFixed(2)}</span>
              </div>
            ))}
          </div>
          
          <div className="border-t-2 pt-4">
            <div className="flex justify-between text-2xl font-bold">
              <span>Total:</span>
              <span className="text-indigo-600">${tx.total.toFixed(2)}</span>
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
            {tx.invoiceNumber && (
              <p className="text-center font-bold text-lg mt-2">Invoice #: {tx.invoiceNumber}</p>
            )}
            <p className="text-center text-xs text-gray-500 mt-2">
              {new Date(tx.timestamp).toLocaleString()}
            </p>
            {tx.customerName && (
              <p className="text-center font-semibold mt-2 text-lg">Customer: {tx.customerName}</p>
            )}
          </div>
          
          <div className="space-y-2 mb-6">
            {tx.items.map((item, idx) => (
              <div key={idx} className="flex justify-between text-sm">
                <span>{item.name} x{item.quantity}</span>
                <span className="font-semibold">${item.subtotal.toFixed(2)}</span>
              </div>
            ))}
          </div>
          
          <div className="border-t-2 pt-4">
            <div className="flex justify-between text-2xl font-bold">
              <span>Amount Due:</span>
              <span className="text-orange-600">${tx.total.toFixed(2)}</span>
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
            <p className="text-sm text-gray-600">
              {new Date(tx.timestamp).toLocaleString()}
            </p>
            {tx.customerName && (
              <p className="font-semibold mt-1">Customer: {tx.customerName}</p>
            )}
            <div className="flex gap-2 mt-2">
              <span className={`px-2 py-1 rounded text-xs font-semibold ${
                tx.paymentMethod === 'cash' ? 'bg-green-100 text-green-800' : 'bg-orange-100 text-orange-800'
              }`}>
                {tx.paymentMethod.toUpperCase()}
              </span>
              {(tx.type === 'cash-in' || tx.type === 'cash-out') && (
                <span className={`px-2 py-1 rounded text-xs font-semibold text-white ${tx.type === 'cash-out' ? 'bg-red-600' : 'bg-emerald-600'}`}>
                  {tx.type === 'cash-out' ? 'CASH OUT' : 'CASH IN'}
                </span>
              )}
              {tx.cancelled && (
                <span className="px-2 py-1 rounded text-xs font-semibold bg-red-100 text-red-800">
                  CANCELLED
                </span>
              )}
              {tx.editHistory.length > 0 && (
                <span className="px-2 py-1 rounded text-xs font-semibold bg-yellow-100 text-yellow-800">
                  ✏️ EDITED ({tx.editHistory.length})
                </span>
              )}
            </div>
          </div>
          
          <div className="mb-4">
            <h3 className="font-semibold mb-2">Items:</h3>
            {tx.items.map((item, idx) => (
              <div key={idx} className={`flex justify-between py-2 border-b ${tx.cancelled ? 'line-through opacity-60' : ''}`}>
                <span>{item.name} x{item.quantity} @ ${item.price.toFixed(2)}</span>
                <span className="font-semibold">${item.subtotal.toFixed(2)}</span>
              </div>
            ))}
            <div className="flex justify-between py-2 font-bold text-lg">
              <span>Total:</span>
              <span className="text-indigo-600">${tx.total.toFixed(2)}</span>
            </div>
          </div>
          
          {tx.editHistory.length > 0 && (
            <div className="mb-4 p-3 bg-gray-50 rounded">
              <h3 className="font-semibold mb-2">Edit History:</h3>
              {tx.editHistory.map((edit, idx) => (
                <div key={idx} className="text-sm mb-3 pb-3 border-b last:border-b-0">
                  <div className="font-medium text-indigo-600">
                    Edit #{idx + 1} - {new Date(edit.timestamp).toLocaleString()}
                  </div>
                  <div className="ml-4 mt-1 space-y-1">
                    {edit.changes && edit.changes.map((change, cIdx) => (
                      <div key={cIdx} className="text-gray-700">
                        <span className="font-medium">{change.field}:</span>{' '}
                        <span className="line-through text-red-600">{change.from}</span>
                        {' → '}
                        <span className="text-green-600">{change.to}</span>
                      </div>
                    ))}
                    {edit.oldTotal !== edit.newTotal && (
                      <div className="font-medium text-gray-700">
                        Total: ${edit.oldTotal.toFixed(2)} → ${edit.newTotal.toFixed(2)}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
          
          <div className="grid grid-cols-2 gap-2 mb-2">
            {tx.paymentMethod === 'cash' && (
              <button
                onClick={() => setShowReceipt(true)}
                className="bg-green-600 text-white py-2 rounded hover:bg-green-700"
              >
                📄 View Receipt
              </button>
            )}
            {tx.paymentMethod === 'credit' && (
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
                isProcessing
                  ? 'bg-gray-400 text-white cursor-not-allowed'
                  : 'bg-red-600 text-white hover:bg-red-700'
              }`}
            >
              {isProcessing ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  Cancelling...
                </>
              ) : (
                'Cancel Transaction'
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
              onChange={(e) => setEditingTransaction({
                ...editingTransaction,
                timestamp: new Date(e.target.value).toISOString()
              })}
              className="w-full px-3 py-2 border rounded"
            />
          </div>
          
          <div className="mb-4">
            <label className="block text-sm font-medium mb-1">Customer Name</label>
            <input
              type="text"
              value={editingTransaction.customerName || ''}
              onChange={(e) => setEditingTransaction({
                ...editingTransaction,
                customerName: e.target.value
              })}
              className="w-full px-3 py-2 border rounded"
              placeholder="Customer name (optional)"
            />
          </div>
          
          <h3 className="font-semibold mb-2">Items:</h3>
          {editingTransaction.items.map((item, idx) => (
            <div key={idx} className="grid grid-cols-12 gap-2 mb-2">
              <input
                type="text"
                value={item.name}
                onChange={(e) => {
                  const newItems = [...editingTransaction.items];
                  newItems[idx].name = e.target.value;
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
                  const newItems = [...editingTransaction.items];
                  newItems[idx].price = parseFloat(e.target.value) || 0;
                  newItems[idx].subtotal = newItems[idx].price * newItems[idx].quantity;
                  setEditingTransaction({ ...editingTransaction, items: newItems });
                }}
                className="col-span-2 px-2 py-1 border rounded"
                placeholder="Price"
              />
              <input
                type="number"
                value={item.quantity}
                onChange={(e) => {
                  const newItems = [...editingTransaction.items];
                  newItems[idx].quantity = clampInt(e.target.value, 1, 1);
                  newItems[idx].subtotal = newItems[idx].price * newItems[idx].quantity;
                  setEditingTransaction({ ...editingTransaction, items: newItems });
                }}
                className="col-span-2 px-2 py-1 border rounded"
                placeholder="Qty"
              />
              <div className="col-span-2 px-2 py-1 text-sm font-semibold">
                ${item.subtotal.toFixed(2)}
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
          
          <div className="mt-4 pt-4 border-t">
            <div className="flex justify-between text-lg font-bold mb-4">
              <span>Total:</span>
              <span className="text-indigo-600">
                ${editingTransaction.items.reduce((sum, i) => sum + i.subtotal, 0).toFixed(2)}
              </span>
            </div>
            
            <div className="flex gap-2">
              <button
                onClick={saveEditedTransaction}
                disabled={isProcessing}
                className={`flex-1 py-2 rounded flex items-center justify-center gap-2 ${
                  isProcessing
                    ? 'bg-gray-400 text-white cursor-not-allowed'
                    : 'bg-green-600 text-white hover:bg-green-700'
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
                    ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                    : 'bg-gray-300 text-gray-800 hover:bg-gray-400'
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
              <button
                onClick={addQuickItemToSale}
                className="flex-1 bg-indigo-600 text-white py-2 rounded hover:bg-indigo-700"
              >
                Add to Sale
              </button>
              <button
                onClick={() => {
                  setShowQuickItem(false);
                  setQuickItem({ name: '', price: '', quantity: 1 });
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
                  onClick={() => setCashTransaction({ ...cashTransaction, type: 'out' })}
                  className={`flex-1 py-3 rounded font-semibold ${
                    cashTransaction.type === 'out' 
                      ? 'bg-red-600 text-white' 
                      : 'bg-gray-200 text-gray-800'
                  }`}
                >
                  Cash Out
                </button>
                <button
                  onClick={() => setCashTransaction({ ...cashTransaction, type: 'in' })}
                  className={`flex-1 py-3 rounded font-semibold ${
                    cashTransaction.type === 'in' 
                      ? 'bg-green-600 text-white' 
                      : 'bg-gray-200 text-gray-800'
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
                    ? 'bg-gray-400 cursor-not-allowed'
                    : cashTransaction.type === 'out'
                      ? 'bg-red-600 hover:bg-red-700'
                      : 'bg-green-600 hover:bg-green-700'
                }`}
              >
                {isProcessing ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    Processing...
                  </>
                ) : (
                  `Record Cash ${cashTransaction.type === 'out' ? 'Out' : 'In'}`
                )}
              </button>
              <button
                onClick={() => {
                  setShowCashModal(false);
                  setCashTransaction({ type: 'out', reason: '', amount: '' });
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
        <div className={`rounded-lg shadow-xl p-6 max-w-md w-full ${darkMode ? 'bg-gray-800' : 'bg-white'}`}>
          <div className="flex justify-between items-center mb-6">
            <h2 className={`text-2xl font-bold ${darkMode ? 'text-indigo-400' : 'text-indigo-600'}`}>Settings</h2>
            <button onClick={() => setShowSettings(false)} className={`p-2 rounded ${darkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-100'}`}>
              <X size={24} className={darkMode ? 'text-white' : 'text-black'} />
            </button>
          </div>
          
          <div className="space-y-4">
            <div className={`p-4 rounded-lg ${darkMode ? 'bg-gray-700' : 'bg-gray-50'}`}>
              <div className="flex justify-between items-center">
                <div>
                  <h3 className={`font-semibold ${darkMode ? 'text-white' : 'text-gray-900'}`}>Theme</h3>
                  <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                    {darkMode ? 'Dark Mode' : 'Light Mode'}
                  </p>
                </div>
                <button
                  onClick={() => setDarkMode(!darkMode)}
                  className={`relative inline-flex h-12 w-24 items-center rounded-full transition-colors ${
                    darkMode ? 'bg-indigo-600' : 'bg-gray-300'
                  }`}
                >
                  <span
                    className={`inline-block h-10 w-10 transform rounded-full bg-white shadow-lg transition-transform flex items-center justify-center ${
                      darkMode ? 'translate-x-12' : 'translate-x-1'
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
            <button
              onClick={addItem}
              className="mt-2 w-full bg-indigo-600 text-white py-2 rounded hover:bg-indigo-700"
            >
              Add Item
            </button>
          </div>
          
          <h3 className="font-semibold mb-3">Current Items</h3>
          <div className="space-y-2">
            {items.map(item => (
              <div key={item.id} className="flex justify-between items-center p-3 bg-gray-50 rounded">
                <div>
                  <div className="font-medium">{item.name}</div>
                  <div className="text-sm text-gray-600">
                    ${item.price.toFixed(2)} • {item.category}
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
    const receipts = transactions.filter(tx => tx.paymentMethod === 'cash');
    const receiptItems = [];
    
    receipts.forEach(tx => {
      tx.items.forEach(item => {
        receiptItems.push({
          tx: tx,
          item: item
        });
      });
    });
    
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
        <div className="max-w-7xl mx-auto">
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-4xl font-bold text-indigo-600">All Receipts</h1>
            <button
              onClick={() => setShowReceiptsView(false)}
              className="px-4 py-2 bg-white rounded-lg shadow hover:shadow-md"
            >
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
                    <tr 
                      key={idx}
                      onClick={() => setViewingTransaction(row.tx)}
                      className="border-b cursor-pointer hover:bg-indigo-50"
                    >
                      <td className="py-2 px-2 font-semibold">{row.tx.receiptNumber}</td>
                      <td className="py-2 px-2">{row.tx.customerName || '-'}</td>
                      <td className="py-2 px-2">{row.item.name}</td>
                      <td className="py-2 px-2 text-right">{row.item.quantity}</td>
                      <td className="py-2 px-2 text-right font-semibold">${row.item.subtotal.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {receiptItems.length === 0 && (
                <p className="text-gray-500 text-center py-8">No receipts yet</p>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // INVOICES VIEW
  if (showInvoicesView) {
    const invoices = transactions.filter(tx => tx.paymentMethod === 'credit');
    const invoiceItems = [];
    
    invoices.forEach(tx => {
      tx.items.forEach(item => {
        invoiceItems.push({
          tx: tx,
          item: item
        });
      });
    });
    
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
        <div className="max-w-7xl mx-auto">
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-4xl font-bold text-orange-600">All Invoices</h1>
            <button
              onClick={() => setShowInvoicesView(false)}
              className="px-4 py-2 bg-white rounded-lg shadow hover:shadow-md"
            >
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
                    <tr 
                      key={idx}
                      onClick={() => setViewingTransaction(row.tx)}
                      className="border-b cursor-pointer hover:bg-orange-50"
                    >
                      <td className="py-2 px-2 font-semibold">{row.tx.invoiceNumber}</td>
                      <td className="py-2 px-2">{row.tx.customerName || '-'}</td>
                      <td className="py-2 px-2">{row.item.name}</td>
                      <td className="py-2 px-2 text-right">{row.item.quantity}</td>
                      <td className="py-2 px-2 text-right font-semibold">${row.item.subtotal.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {invoiceItems.length === 0 && (
                <p className="text-gray-500 text-center py-8">No invoices yet</p>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // MAIN APP
  if (showTransactions) {
    const displayTxs = selectedDate ? getDateTransactions(selectedDate) : getTodayTransactions();
    const { sortedTxs, rows: dailyRows } = computeDailySummary(displayTxs);
    const cashSales = displayTxs.filter(tx => !tx.cancelled && tx.paymentMethod === 'cash').reduce((sum, tx) => sum + tx.total, 0);
    const creditSales = displayTxs.filter(tx => !tx.cancelled && tx.paymentMethod === 'credit').reduce((sum, tx) => sum + tx.total, 0);

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
                  ? selectedDate.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
                  : "Today's Transactions"
                }
              </h2>
              {selectedDate && (
                <button
                  onClick={() => setSelectedDate(null)}
                  className="text-sm text-indigo-600 hover:text-indigo-800"
                >
                  View Today
                </button>
              )}
            </div>
            
            <div className="grid grid-cols-2 gap-4 mb-4 p-4 bg-indigo-50 rounded">
              <div>
                <div className="text-sm text-gray-600">Total Cash Sales</div>
                <div className="text-2xl font-bold text-blue-600">${cashSales.toFixed(2)}</div>
              </div>
              <div>
                <div className="text-sm text-gray-600">Total Credit Sales</div>
                <div className="text-2xl font-bold text-orange-600">${creditSales.toFixed(2)}</div>
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
                    const tx = sortedTxs.find(t => t.id === row.txId);
                    
                    return (
                      <tr 
                        key={idx}
                        onClick={() => setViewingTransaction(tx)}
                        className={`border-b cursor-pointer hover:bg-indigo-50 ${
                          row.cancelled
                            ? 'bg-red-50'
                            : row.type === 'cash-in' || row.type === 'cash-out'
                              ? 'bg-emerald-50'
                              : row.paymentMethod === 'credit'
                                ? 'bg-orange-50'
                                : ''
                        }`}
                      >
                        {row.itemIndex === 0 ? (
                          <td className="py-2 px-2" rowSpan={row.totalItems}>
                            {new Date(row.timestamp).toLocaleTimeString()}
                          </td>
                        ) : null}
                        <td className={`py-2 px-2 ${row.cancelled ? 'line-through' : ''}`}>
                          {row.item.name}
                          {row.edited && <span className="text-orange-600"> *</span>}
                          {row.cancelled && <span className="ml-2 text-xs px-1 py-0.5 bg-red-500 text-white rounded">CANCELLED</span>}
                          {(row.type === 'cash-in' || row.type === 'cash-out') && !row.cancelled && (
                            <span className={`ml-2 text-xs px-1 py-0.5 text-white rounded ${row.type === 'cash-out' ? 'bg-red-600' : 'bg-emerald-600'}`}>
                              {row.type === 'cash-out' ? 'CASH OUT' : 'CASH IN'}
                            </span>
                          )}
                          {row.paymentMethod === 'credit' && !row.cancelled && (
                            <span className="ml-2 text-xs px-1 py-0.5 bg-orange-500 text-white rounded">CREDIT</span>
                          )}
                        </td>
                        <td className={`py-2 px-2 text-right ${row.cancelled ? 'line-through' : ''}`}>
                          {row.item.quantity}
                        </td>
                        <td className={`py-2 px-2 text-right font-semibold ${row.cancelled ? 'line-through' : ''}`}>
                          ${row.item.subtotal.toFixed(2)}
                        </td>
                        <td className="py-2 px-2 text-right font-bold text-indigo-600">
                          {row.runningBalance !== null ? `$${row.runningBalance.toFixed(2)}` : '-'}
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
  const bgClass = darkMode ? 'bg-gray-900' : 'bg-gradient-to-br from-blue-50 to-indigo-100';
  const cardBg = darkMode ? 'bg-gray-800' : 'bg-white';
  const textPrimary = darkMode ? 'text-white' : 'text-gray-900';
  const textSecondary = darkMode ? 'text-gray-300' : 'text-gray-600';
  const btnBg = darkMode ? 'bg-gray-700 hover:bg-gray-600' : 'bg-white hover:shadow-md';
  const btnText = darkMode ? 'text-white' : 'text-gray-700';
  
  return (
    <div className={`min-h-screen ${bgClass} p-4`}>
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <h1 className={`text-4xl font-bold ${darkMode ? 'text-indigo-400' : 'text-indigo-600'}`}>POS System</h1>
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
            {/* New Quick Item Button */}
            <button
              onClick={() => setShowQuickItem(true)}
              className="bg-green-500 text-white p-4 rounded-lg hover:bg-green-600 transition-colors border-2 border-dashed border-green-300"
            >
              <div className="font-bold text-lg">+ New</div>
              <div className="text-sm">Quick Sale</div>
              <div className="text-xs opacity-75">One-time item</div>
            </button>
            
            {/* Cash In/Out Button */}
            <button
              onClick={() => setShowCashModal(true)}
              className="bg-emerald-500 text-white p-4 rounded-lg hover:bg-emerald-600 transition-colors border-2 border-dashed border-emerald-300"
            >
              <div className="font-bold text-lg">💵 Cash</div>
              <div className="text-sm">In/Out</div>
              <div className="text-xs opacity-75">Record cash</div>
            </button>
            
            {/* Regular Items */}
            {items.map(item => (
              <button
                key={item.id}
                onClick={() => addToSale(item)}
                className="bg-indigo-500 text-white p-4 rounded-lg hover:bg-indigo-600 transition-colors"
              >
                <div className="font-bold text-lg">{item.name}</div>
                <div className="text-sm">${item.price.toFixed(2)}</div>
                <div className="text-xs opacity-75">{item.category}</div>
              </button>
            ))}
          </div>
          {items.length === 0 && (
            <p className="text-gray-500 text-center py-8">
              No items yet. Click "Manage Items" to add items.
            </p>
          )}
        </div>

        {/* Current Sale */}
        {currentSale.length > 0 && (
          <div className={`${cardBg} rounded-lg shadow-xl p-6`}>
            <h2 className={`text-2xl font-semibold mb-4 ${textPrimary}`}>Current Sale</h2>
            
            <div className="space-y-2 mb-4">
              {currentSale.map(item => (
                <div key={item.id} className={`flex justify-between items-center p-3 rounded ${darkMode ? 'bg-gray-700' : 'bg-gray-50'}`}>
                  <span className={`font-medium ${textPrimary}`}>{item.name}</span>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => updateQuantity(item.id, item.quantity - 1)}
                      className={`w-8 h-8 rounded ${darkMode ? 'bg-gray-600 hover:bg-gray-500' : 'bg-gray-300 hover:bg-gray-400'} ${textPrimary}`}
                    >
                      -
                    </button>
                    <span className={`w-12 text-center font-semibold ${textPrimary}`}>{item.quantity}</span>
                    <button
                      onClick={() => updateQuantity(item.id, item.quantity + 1)}
                      className={`w-8 h-8 rounded ${darkMode ? 'bg-gray-600 hover:bg-gray-500' : 'bg-gray-300 hover:bg-gray-400'} ${textPrimary}`}
                    >
                      +
                    </button>
                    <span className={`w-24 text-right font-bold ${textPrimary}`}>${(item.price * item.quantity).toFixed(2)}</span>
                  </div>
                </div>
              ))}
            </div>
            
            <div className="mb-4">
              <label className={`block text-sm font-medium mb-1 ${textPrimary}`}>
                Customer Name {paymentMethod === 'credit' && <span className="text-red-600">*</span>}
              </label>
              <input
                type="text"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder={paymentMethod === 'credit' ? 'Required for credit sales' : 'Optional'}
                className={`w-full px-3 py-2 border rounded ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300'}`}
              />
            </div>
            
            <div className="mb-4">
              <div className={`text-3xl font-bold mb-4 ${darkMode ? 'text-indigo-400' : 'text-indigo-600'}`}>
                Total: ${currentSale.reduce((sum, i) => sum + (i.price * i.quantity), 0).toFixed(2)}
              </div>
            </div>
            
            <div className="flex gap-2 mb-4">
              <button
                onClick={() => setPaymentMethod('cash')}
                className={`flex-1 py-3 rounded font-semibold ${
                  paymentMethod === 'cash' 
                    ? 'bg-indigo-600 text-white' 
                    : darkMode 
                      ? 'bg-gray-700 text-gray-300' 
                      : 'bg-gray-200 text-gray-800'
                }`}
              >
                Cash
              </button>
              <button
                onClick={() => setPaymentMethod('credit')}
                className={`flex-1 py-3 rounded font-semibold ${
                  paymentMethod === 'credit' 
                    ? 'bg-indigo-600 text-white' 
                    : darkMode 
                      ? 'bg-gray-700 text-gray-300' 
                      : 'bg-gray-200 text-gray-800'
                }`}
              >
                Credit
              </button>
            </div>
            
            <button
              onClick={completeSale}
              disabled={isProcessing}
              className={`w-full py-4 rounded-lg font-bold text-lg flex items-center justify-center gap-2 ${
                isProcessing 
                  ? 'bg-gray-400 cursor-not-allowed' 
                  : 'bg-green-600 hover:bg-green-700 text-white'
              }`}
            >
              {isProcessing ? (
                <>
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  Processing...
                </>
              ) : (
                'Complete Sale'
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
