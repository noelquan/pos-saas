import { supabase } from "./supabaseClient";

export async function getUser() {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  return data.user;
}

export async function ensureShop() {
  const user = await getUser();
  if (!user) throw new Error("Not logged in");

  const { data: shop, error: e1 } = await supabase
    .from("shops")
    .select("*")
    .eq("owner_id", user.id)
    .maybeSingle();
  if (e1) throw e1;

  if (shop) return shop;

  const { data: created, error: e2 } = await supabase
    .from("shops")
    .insert({ owner_id: user.id, name: "My Shop" })
    .select("*")
    .single();
  if (e2) throw e2;

  return created;
}

export async function loadItems(shopId) {
  const { data, error } = await supabase
    .from("items")
    .select("*")
    .eq("shop_id", shopId)
    .order("created_at", { ascending: true });
  if (error) throw error;

  return data.map((r) => ({
    id: r.id,
    name: r.name,
    price: Number(r.price),
    category: r.category,
  }));
}

export async function replaceItems(shopId, items) {
  const { error: delErr } = await supabase.from("items").delete().eq("shop_id", shopId);
  if (delErr) throw delErr;

  if (!items.length) return;

  const rows = items.map((i) => ({
    shop_id: shopId,
    name: i.name,
    price: i.price,
    category: i.category || "General",
  }));

  const { error: insErr } = await supabase.from("items").insert(rows);
  if (insErr) throw insErr;
}

export async function loadTransactions(shopId) {
  const { data, error } = await supabase
    .from("transactions")
    .select("*")
    .eq("shop_id", shopId)
    .order("timestamp", { ascending: true });
  if (error) throw error;

  return data.map((tx) => ({
    id: tx.id,
    timestamp: tx.timestamp,
    customerName: tx.customer_name || "",
    items: tx.items,
    total: Number(tx.total),
    paymentMethod: tx.payment_method,
    type: tx.type,
    receiptNumber: tx.receipt_number,
    invoiceNumber: tx.invoice_number,
    editHistory: tx.edit_history || [],
    cancelled: tx.cancelled,
  }));
}

export async function insertTransaction(shopId, tx) {
  const payload = {
    id: tx.id,
    shop_id: shopId,
    timestamp: tx.timestamp,
    customer_name: tx.customerName || "",
    payment_method: tx.paymentMethod,
    type: tx.type || "sale",
    receipt_number: tx.receiptNumber || null,
    invoice_number: tx.invoiceNumber || null,
    total: tx.total,
    items: tx.items,
    edit_history: tx.editHistory || [],
    cancelled: !!tx.cancelled,
  };

  const { error } = await supabase.from("transactions").insert(payload);
  if (error) throw error;
}

export async function updateTransaction(shopId, tx) {
  const payload = {
    timestamp: tx.timestamp,
    customer_name: tx.customerName || "",
    payment_method: tx.paymentMethod,
    type: tx.type || "sale",
    receipt_number: tx.receiptNumber || null,
    invoice_number: tx.invoiceNumber || null,
    total: tx.total,
    items: tx.items,
    edit_history: tx.editHistory || [],
    cancelled: !!tx.cancelled,
  };

  const { error } = await supabase
    .from("transactions")
    .update(payload)
    .eq("shop_id", shopId)
    .eq("id", tx.id);

  if (error) throw error;
}

export async function nextDailyNumber(shopId) {
  const now = new Date();
  const yy = String(now.getFullYear()).slice(-2);
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const yymmdd = `${yy}${mm}${dd}`;

  const { data: row, error: e1 } = await supabase
    .from("daily_counters")
    .select("*")
    .eq("shop_id", shopId)
    .eq("yymmdd", yymmdd)
    .maybeSingle();
  if (e1) throw e1;

  const nextSeq = row ? row.last_seq + 1 : 1;

  if (!row) {
    const { error: e2 } = await supabase
      .from("daily_counters")
      .insert({ shop_id: shopId, yymmdd, last_seq: nextSeq });
    if (e2) throw e2;
  } else {
    const { error: e3 } = await supabase
      .from("daily_counters")
      .update({ last_seq: nextSeq })
      .eq("shop_id", shopId)
      .eq("yymmdd", yymmdd);
    if (e3) throw e3;
  }

  return `${yymmdd}${String(nextSeq).padStart(4, "0")}`;
}
