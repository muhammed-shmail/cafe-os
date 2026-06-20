'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { formatINR } from '@cafeos/core';
import { BrandMark } from '@/components/BrandMark';
import type { DashboardData } from '@/lib/analytics';
import { SECTION_KEY, SectionView } from './Sections';
import CustomerManagement from './CustomerManagement';
import { ROLE_LABELS, ROLE_DESCRIPTIONS, assignableRoles, ALL_ROLES } from '@/lib/rbac';
import { DEVICE_TYPES, DEVICE_CONNECTIONS, type Device } from '@/lib/devices';
import { tableOrderUrl, tableQrImageUrl } from '@/lib/qr';
import { FEATURED_LABELS, DEFAULT_GAME_KEYS, type PwaConfig } from '@/lib/pwa';
import { prettyAction } from '@/lib/audit-labels';
import {
  ThemeToggle, Bell, Table2, LogOut, LayoutDashboard, Wifi, ChefHat,
  ClipboardList, UtensilsCrossed, Package, Truck, Users, Settings, type LucideIcon,
} from '@/components/ui';

type FloorTable = { id: string; label: string; seats: number; state: string; qrToken: string; floorId: string | null; activeOrders: number };
type Floor = { id: string; name: string; sort: number };

type Msg = { who: 'ai' | 'me'; html: string };

const MENUS: { key: string; label: string; icon: LucideIcon }[] = [
  { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { key: 'monitor', label: 'Monitor', icon: Wifi },
  { key: 'orders', label: 'Orders', icon: ClipboardList },
  { key: 'tables', label: 'Tables', icon: UtensilsCrossed },
  { key: 'staff', label: 'Staff', icon: ChefHat },
  { key: 'inventory', label: 'Inventory', icon: Package },
  { key: 'suppliers', label: 'Suppliers', icon: Truck },
  { key: 'customers', label: 'Customer Management', icon: Users },
  { key: 'menu', label: 'Menu Items', icon: UtensilsCrossed },
  { key: 'settings', label: 'Settings', icon: Settings },
];

/** Field-level diff of an audit entry's before/after JSON — only keys whose value changed. */
function auditDiff(before: Record<string, unknown> | null, after: Record<string, unknown> | null): { key: string; before: string; after: string }[] {
  const b = before ?? {};
  const a = after ?? {};
  const fmt = (v: unknown) => (v === undefined ? '—' : typeof v === 'string' ? v : JSON.stringify(v));
  return Array.from(new Set([...Object.keys(b), ...Object.keys(a)]))
    .filter((k) => JSON.stringify(b[k]) !== JSON.stringify(a[k]))
    .map((k) => ({ key: k, before: fmt(b[k]), after: fmt(a[k]) }));
}

export default function DashboardClient({
  outlet,
  staff,
  data,
}: {
  outlet: { name: string; brand: string; plan: string; gstin: string | null };
  staff: { name: string; role: string };
  data: DashboardData;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const { kpi, trend, hourly, topItems, menuQuadrant, lowStock, loyalty, briefing } = data;

  // 1. Beginner vs Advanced Mode (stored in localStorage)
  const [isAdvanced, setIsAdvanced] = useState(false);
  useEffect(() => {
    const stored = localStorage.getItem('cafeos_advanced');
    if (stored === 'true') {
      setIsAdvanced(true);
    }
  }, []);

  const handleToggleAdvanced = (val: boolean) => {
    setIsAdvanced(val);
    localStorage.setItem('cafeos_advanced', String(val));
    flashMessage(val ? 'Advanced Mode unlocked!' : 'Beginner Mode active (simple layout).');
  };

  // 2. Navigation State
  const [activeMenu, setActiveMenu] = useState('dashboard');
  const [activeSubTab, setActiveSubTab] = useState('overview');

  // Sync sub tab when menu changes
  useEffect(() => {
    if (activeMenu === 'dashboard') setActiveSubTab('overview');
    else if (activeMenu === 'monitor') setActiveSubTab('live');
    else if (activeMenu === 'orders') setActiveSubTab('active');
    else if (activeMenu === 'inventory') setActiveSubTab('stock');
    else if (activeMenu === 'suppliers') setActiveSubTab('ledger');
    else if (activeMenu === 'tables') setActiveSubTab('floor');
    else if (activeMenu === 'staff') setActiveSubTab('activity');
    else if (activeMenu === 'customers') setActiveSubTab('list');
    else if (activeMenu === 'reports') setActiveSubTab('daily');
    else if (activeMenu === 'menu') setActiveSubTab('menu');
    else if (activeMenu === 'settings') setActiveSubTab('general');
  }, [activeMenu]);

  // 3. Realtime Stream
  const [liveOrders, setLiveOrders] = useState(0);
  const [connected, setConnected] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const liveDot = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const es = new EventSource('/api/stream');
    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);
    es.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.type === 'order.new') {
        setLiveOrders((n) => n + 1);
        flashMessage(`New Order Received: #${msg.ticket.number}`);
        if (liveDot.current) {
          liveDot.current.style.animation = 'none';
          void liveDot.current.offsetWidth;
          liveDot.current.style.animation = '';
        }
      } else if (msg.type === 'notify') {
        // live alert → bump the bell + prepend to the feed
        setUnread((u) => u + 1);
        setNotifs((prev) => [{ ...msg.notification, readAt: null, at: new Date(msg.notification.at).toISOString() }, ...prev].slice(0, 40));
        flashMessage(`🔔 ${msg.notification.title}`);
      }
    };
    return () => es.close();
  }, []);

  function flashMessage(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }

  // 4. Settle / Advance Orders logic
  const [ordersList, setOrdersList] = useState<any[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);

  const loadOrders = async () => {
    setOrdersLoading(true);
    try {
      const res = await fetch('/api/orders');
      if (res.ok) {
        const d = await res.json();
        setOrdersList(d.orders || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setOrdersLoading(false);
    }
  };

  useEffect(() => {
    if (activeMenu === 'orders') {
      loadOrders();
    }
  }, [activeMenu]);

  const handleBumpOrder = async (id: string, nextStatus?: string) => {
    try {
      const body = nextStatus ? JSON.stringify({ status: nextStatus }) : '{}';
      const res = await fetch(`/api/orders/${id}/status`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body,
      });
      if (res.ok) {
        flashMessage('Order status updated!');
        loadOrders();
        router.refresh();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleSettleOrder = async (id: string, method: 'cash' | 'upi') => {
    try {
      const res = await fetch(`/api/orders/${id}/status`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'settled' }),
      });
      if (res.ok) {
        // Mock payment receipt trigger
        flashMessage(`Bill settled via ${method.toUpperCase()}!`);
        loadOrders();
        router.refresh();
      }
    } catch (err) {
      console.error(err);
    }
  };

  // 5. Inventory Operations logic
  const [stockItems, setStockItems] = useState<any[]>([]);
  const [consumption, setConsumption] = useState<any[]>([]);
  const [stockAlerts, setStockAlerts] = useState<any[]>([]);
  const [recipes, setRecipes] = useState<any[]>([]);
  const [inventoryLoading, setInventoryLoading] = useState(false);
  const [menuItems, setMenuItems] = useState<any[]>([]);

  const loadInventoryData = async () => {
    setInventoryLoading(true);
    try {
      // Lazy load via section API
      const [invRes, menuRes] = await Promise.all([
        fetch('/api/dashboard/section?s=inventory'),
        fetch('/api/dashboard/section?s=menu'),
      ]);
      if (invRes.ok) {
        const d = await invRes.json();
        setStockItems(d.data?.items || []);
        setConsumption(d.data?.consumption || []);
        setStockAlerts(d.data?.alerts || []);
        setRecipes(d.data?.recipes || []);
      }
      if (menuRes.ok) {
        const d = await menuRes.json();
        const flatItems = (d.data?.categories || []).flatMap((c: any) => c.items || []);
        setMenuItems(flatItems);
        setMenuCategories(d.data?.categoryList || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setInventoryLoading(false);
    }
  };

  useEffect(() => {
    if (activeMenu === 'inventory' || activeMenu === 'settings' || activeMenu === 'menu') {
      loadInventoryData();
    }
  }, [activeMenu]);

  // 6. Action Handlers for Inventory
  const [purchItemId, setPurchItemId] = useState('');
  const [purchQty, setPurchQty] = useState('');
  const [purchPrice, setPurchPrice] = useState(''); // in rupees

  const handleAddPurchase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!purchItemId || !purchQty || !purchPrice) return;
    try {
      const res = await fetch('/api/dashboard/inventory', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'purchase',
          stockItemId: purchItemId,
          qty: parseFloat(purchQty),
          unitCostPaise: Math.round(parseFloat(purchPrice) * 100),
        }),
      });
      if (res.ok) {
        flashMessage('Purchase added! Stock and costs updated.');
        setPurchQty('');
        setPurchPrice('');
        loadInventoryData();
        router.refresh();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const [adjustItemId, setAdjustItemId] = useState('');
  const [adjustQty, setAdjustQty] = useState('');

  const handleAdjustStock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjustItemId || !adjustQty) return;
    try {
      const res = await fetch('/api/dashboard/inventory', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'adjust',
          stockItemId: adjustItemId,
          qtyOnHand: parseFloat(adjustQty),
        }),
      });
      if (res.ok) {
        flashMessage('Stock level adjusted successfully.');
        setAdjustQty('');
        loadInventoryData();
        router.refresh();
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Recipe Wizard Logic
  const [recipeMenuItemId, setRecipeMenuItemId] = useState('');
  const [recipeStockItemId, setRecipeStockItemId] = useState('');
  const [recipeQty, setRecipeQty] = useState('');
  const [recipeUnit, setRecipeUnit] = useState('');

  const handleLinkRecipe = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!recipeMenuItemId || !recipeStockItemId || !recipeQty) return;
    try {
      const res = await fetch('/api/dashboard/inventory', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'recipe',
          itemId: recipeMenuItemId,
          stockItemId: recipeStockItemId,
          qty: parseFloat(recipeQty),
          unit: recipeUnit.trim() || undefined,
        }),
      });
      if (res.ok) {
        flashMessage('Ingredient linked to recipe!');
        setRecipeStockItemId('');
        setRecipeQty('');
        setRecipeUnit('');
        loadInventoryData(); // refresh the recipe list
      } else {
        const errorData = await res.json();
        flashMessage(`Error: ${errorData.error || 'Failed to link recipe'}`);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteRecipe = async (recipeId: string) => {
    try {
      const res = await fetch('/api/dashboard/inventory', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'recipe_delete', recipeId }),
      });
      if (res.ok) { flashMessage('Ingredient removed from recipe'); loadInventoryData(); }
    } catch (err) {
      console.error(err);
    }
  };

  // 6b. Suppliers & Credit (Phase B)
  const [suppliers, setSuppliers] = useState<any>(null);
  const [suppliersLoading, setSuppliersLoading] = useState(false);
  const [statement, setStatement] = useState<any>(null);

  const loadSuppliers = async () => {
    setSuppliersLoading(true);
    try {
      const res = await fetch('/api/dashboard/section?s=suppliers');
      if (res.ok) {
        const d = await res.json();
        setSuppliers(d.data || null);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSuppliersLoading(false);
    }
  };

  useEffect(() => {
    if (activeMenu === 'suppliers') loadSuppliers();
  }, [activeMenu]);

  const postSupplier = async (payload: any, okMsg: string) => {
    try {
      const res = await fetch('/api/suppliers', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (res.ok) {
        flashMessage(okMsg);
        loadSuppliers();
        return true;
      }
      flashMessage(`Error: ${data.error || 'failed'}`);
      return false;
    } catch (err) {
      console.error(err);
      flashMessage('Network error');
      return false;
    }
  };

  // add-vendor form
  const [vName, setVName] = useState('');
  const [vPhone, setVPhone] = useState('');
  const [vGstin, setVGstin] = useState('');
  const [vOpening, setVOpening] = useState('');
  const handleAddVendor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vName.trim()) return;
    const ok = await postSupplier(
      { action: 'vendor', name: vName, phone: vPhone || null, gstin: vGstin || null, openingBalancePaise: vOpening ? Math.round(parseFloat(vOpening) * 100) : 0 },
      'Supplier added.',
    );
    if (ok) { setVName(''); setVPhone(''); setVGstin(''); setVOpening(''); }
  };

  // invoice form
  const [invVendorId, setInvVendorId] = useState('');
  const [invNo, setInvNo] = useState('');
  const [invDate, setInvDate] = useState('');
  const [invDue, setInvDue] = useState('');
  const [invTotal, setInvTotal] = useState('');
  const [invPaidNow, setInvPaidNow] = useState('');
  const [invMethod, setInvMethod] = useState('cash');
  const handleAddInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!invVendorId || !invTotal) return;
    const ok = await postSupplier(
      {
        action: 'invoice',
        vendorId: invVendorId,
        invoiceNo: invNo || null,
        invoiceDate: invDate || null,
        dueDate: invDue || null,
        totalPaise: Math.round(parseFloat(invTotal) * 100),
        paidNowPaise: invPaidNow ? Math.round(parseFloat(invPaidNow) * 100) : 0,
        paymentMethod: invMethod,
      },
      'Purchase invoice recorded.',
    );
    if (ok) { setInvNo(''); setInvDate(''); setInvDue(''); setInvTotal(''); setInvPaidNow(''); }
  };

  // payment form
  const [payVendorId, setPayVendorId] = useState('');
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState('cash');
  const [payRef, setPayRef] = useState('');
  const handleAddPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payVendorId || !payAmount) return;
    const ok = await postSupplier(
      { action: 'payment', vendorId: payVendorId, amountPaise: Math.round(parseFloat(payAmount) * 100), method: payMethod, reference: payRef || null },
      'Payment recorded.',
    );
    if (ok) { setPayAmount(''); setPayRef(''); }
  };

  const openStatement = async (vendorId: string) => {
    try {
      const res = await fetch(`/api/suppliers?vendorId=${vendorId}`);
      if (res.ok) setStatement(await res.json());
    } catch (err) {
      console.error(err);
    }
  };

  // 6c. Tables — occupancy & revenue (Phase D)
  const [tablesData, setTablesData] = useState<any>(null);
  const [tablesLoading, setTablesLoading] = useState(false);
  const [cfgMinutes, setCfgMinutes] = useState('');
  const [cfgMinBill, setCfgMinBill] = useState('');

  const loadTables = async () => {
    setTablesLoading(true);
    try {
      const res = await fetch('/api/dashboard/section?s=tables');
      if (res.ok) {
        const d = await res.json();
        setTablesData(d.data || null);
        if (d.data?.config) {
          setCfgMinutes(String(d.data.config.minutes));
          setCfgMinBill(String(Math.round(d.data.config.minBillPaise / 100)));
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setTablesLoading(false);
    }
  };

  // refresh live occupancy every 30s while the Tables view is open
  useEffect(() => {
    if (activeMenu !== 'tables') return;
    loadTables();
    const t = setInterval(loadTables, 30000);
    return () => clearInterval(t);
  }, [activeMenu]);

  const handleSaveTableConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/dashboard/tables', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'config', minutes: parseInt(cfgMinutes || '90', 10), minBillPaise: Math.round(parseFloat(cfgMinBill || '500') * 100) }),
      });
      if (res.ok) { flashMessage('Occupancy alert thresholds saved.'); loadTables(); }
    } catch (err) {
      console.error(err);
    }
  };

  // 6d. Owner Monitor + notification bell (Phase E)
  const [monitor, setMonitor] = useState<any>(null);
  const [monitorLoading, setMonitorLoading] = useState(false);
  const [notifs, setNotifs] = useState<any[]>([]);
  const [unread, setUnread] = useState(0);
  const [bellOpen, setBellOpen] = useState(false);

  const loadMonitor = async () => {
    setMonitorLoading(true);
    try {
      const res = await fetch('/api/dashboard/section?s=monitor');
      if (res.ok) { const d = await res.json(); setMonitor(d.data || null); setUnread(d.data?.alertCount ?? 0); }
    } catch (err) { console.error(err); } finally { setMonitorLoading(false); }
  };

  const loadNotifs = async () => {
    try {
      const res = await fetch('/api/notifications');
      if (res.ok) { const d = await res.json(); setNotifs(d.items ?? []); setUnread(d.unread ?? 0); }
    } catch (err) { console.error(err); }
  };

  // unread count on mount; live bumps come from the SSE 'notify' handler
  useEffect(() => { loadNotifs(); }, []);

  useEffect(() => {
    if (activeMenu !== 'monitor') return;
    loadMonitor();
    const t = setInterval(loadMonitor, 20000);
    return () => clearInterval(t);
  }, [activeMenu]);

  const markRead = async (id: string) => {
    setNotifs((prev) => prev.map((n) => (n.id === id ? { ...n, readAt: 'now' } : n)));
    setUnread((u) => Math.max(0, u - 1));
    await fetch('/api/notifications', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'read', id }) }).catch(() => {});
  };
  const markAllRead = async () => {
    setNotifs((prev) => prev.map((n) => ({ ...n, readAt: 'now' })));
    setUnread(0);
    await fetch('/api/notifications', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'read_all' }) }).catch(() => {});
  };

  // 6e. Staff & Access — user management (Phase F)
  const [staffMembers, setStaffMembers] = useState<any[]>([]);
  const [staffAssignable, setStaffAssignable] = useState<string[]>(assignableRoles(staff.role));
  const [staffLoading, setStaffLoading] = useState(false);
  const [nuName, setNuName] = useState('');
  const [nuPhone, setNuPhone] = useState('');
  const [nuRole, setNuRole] = useState<string>(assignableRoles(staff.role)[0] ?? 'waiter');
  const [nuPin, setNuPin] = useState('');

  const loadStaff = async () => {
    setStaffLoading(true);
    try {
      const res = await fetch('/api/staff');
      if (res.ok) { const d = await res.json(); setStaffMembers(d.members ?? []); setStaffAssignable(d.assignable ?? []); }
    } catch (err) { console.error(err); } finally { setStaffLoading(false); }
  };

  useEffect(() => { if (activeMenu === 'settings' || activeMenu === 'staff') loadStaff(); }, [activeMenu]);

  // ---- Staff/HR board (activity · attendance · shifts · payroll) ----
  const [staffBoard, setStaffBoard] = useState<any>(null);
  const [staffBoardLoading, setStaffBoardLoading] = useState(false);
  const loadStaffBoard = async () => {
    setStaffBoardLoading(true);
    try {
      const res = await fetch('/api/dashboard/section?s=staff');
      if (res.ok) setStaffBoard((await res.json()).data || null);
    } catch (err) { console.error(err); } finally { setStaffBoardLoading(false); }
  };
  useEffect(() => {
    if (activeMenu !== 'staff') return;
    loadStaffBoard();
    const t = setInterval(loadStaffBoard, 20000); // live-ish refresh
    return () => clearInterval(t);
  }, [activeMenu]);

  // shift + payroll forms
  const [shiftForm, setShiftForm] = useState({ staffId: '', date: '', start: '09:00', end: '17:00', role: '' });
  const [payDraftId, setPayDraftId] = useState<string | null>(null);
  const [payDraft, setPayDraft] = useState({ payType: 'monthly', rate: '' });
  const [payRecId, setPayRecId] = useState<string | null>(null);
  const [payRec, setPayRec] = useState({ amount: '', method: 'cash', note: '' });

  const staffApi = async (payload: Record<string, unknown>, ok: string) => {
    const res = await fetch('/api/staff', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
    const d = await res.json().catch(() => ({}));
    if (res.ok) { flashMessage(ok); loadStaff(); loadStaffBoard(); }
    else flashMessage(`Failed: ${(d.error ?? 'error').replace(/_/g, ' ')}`);
    return res.ok;
  };

  const handleSetPay = async (id: string) => {
    const rupees = payDraft.rate.trim() === '' ? null : parseFloat(payDraft.rate);
    if (rupees !== null && (!Number.isFinite(rupees) || rupees < 0)) { flashMessage('Enter a valid rate'); return; }
    if (await staffApi({ action: 'set_pay', id, payType: payDraft.payType, payRatePaise: rupees === null ? null : Math.round(rupees * 100) }, 'Pay updated')) setPayDraftId(null);
  };
  const handleRecordPay = async (id: string) => {
    const rupees = parseFloat(payRec.amount);
    if (!Number.isFinite(rupees) || rupees <= 0) { flashMessage('Enter a valid amount'); return; }
    if (await staffApi({ action: 'pay_record', id, amountPaise: Math.round(rupees * 100), method: payRec.method, note: payRec.note.trim() || undefined, periodLabel: staffBoard?.period }, 'Payment recorded')) { setPayRecId(null); setPayRec({ amount: '', method: 'cash', note: '' }); }
  };
  const handleAddShift = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!shiftForm.staffId || !shiftForm.date) { flashMessage('Pick a staff member and date'); return; }
    const startsAt = new Date(`${shiftForm.date}T${shiftForm.start}`).toISOString();
    const endsAt = new Date(`${shiftForm.date}T${shiftForm.end}`).toISOString();
    if (await staffApi({ action: 'shift_add', staffId: shiftForm.staffId, startsAt, endsAt, role: shiftForm.role || undefined }, 'Shift added')) setShiftForm((f) => ({ ...f, role: '' }));
  };
  const handleRemoveShift = async (shiftId: string) => { await staffApi({ action: 'shift_remove', shiftId }, 'Shift removed'); };
  const handlePunch = async (staffId: string, action: 'in' | 'out') => {
    const res = await fetch('/api/attendance', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action, staffId }) });
    if (res.ok) { flashMessage(action === 'in' ? 'Clocked in' : 'Clocked out'); loadStaffBoard(); }
    else flashMessage('Punch failed');
  };
  const handleSetPinFor = async (id: string, name: string) => {
    const pin = window.prompt(`Set a new login PIN for ${name} (4–6 digits):`);
    if (pin === null) return;
    if (!/^\d{4,6}$/.test(pin)) { flashMessage('PIN must be 4–6 digits'); return; }
    await staffApi({ action: 'setpin', id, pin }, 'PIN updated');
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nuName.trim() || !nuPin) return;
    const res = await fetch('/api/staff', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'create', name: nuName.trim(), phone: nuPhone.trim() || undefined, role: nuRole, pin: nuPin }),
    });
    const d = await res.json().catch(() => ({}));
    if (res.ok) { flashMessage(`Added ${nuName} (${ROLE_LABELS[nuRole as keyof typeof ROLE_LABELS]})`); setNuName(''); setNuPhone(''); setNuPin(''); loadStaff(); }
    else flashMessage(`Could not add user: ${(d.error ?? 'failed').replace(/_/g, ' ')}`);
  };

  const handleStaffUpdate = async (id: string, patch: { role?: string; active?: boolean }) => {
    const res = await fetch('/api/staff', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'update', id, ...patch }) });
    const d = await res.json().catch(() => ({}));
    if (res.ok) { flashMessage('Staff updated'); loadStaff(); }
    else flashMessage(`Update failed: ${(d.error ?? 'failed').replace(/_/g, ' ')}`);
  };

  const handleRemoveUser = async (id: string, name: string) => {
    if (!confirm(`Remove ${name}? They will no longer be able to log in. History is preserved.`)) return;
    const res = await fetch('/api/staff', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'remove', id }) });
    const d = await res.json().catch(() => ({}));
    if (res.ok) { flashMessage(`${name} removed`); loadStaff(); }
    else flashMessage(`Could not remove: ${(d.error ?? 'failed').replace(/_/g, ' ')}`);
  };

  const canManageMember = (memberRole: string) =>
    staff.role === 'owner' || (staff.role === 'manager' && ['cashier', 'waiter', 'kitchen'].includes(memberRole));

  // 7. Menu item Availability toggles
  const handleToggleMenuAvailability = async (itemId: string, isAvailable: boolean) => {
    try {
      const res = await fetch('/api/dashboard/menu', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'availability', itemId, isAvailable }),
      });
      if (res.ok) { flashMessage(`Item marked ${isAvailable ? 'Available' : 'Sold Out'}`); loadInventoryData(); }
      else flashMessage('Could not update item');
    } catch (err) {
      console.error(err);
    }
  };

  // inline price editing
  const [priceEditId, setPriceEditId] = useState<string | null>(null);
  const [priceDraft, setPriceDraft] = useState('');
  const [menuSearch, setMenuSearch] = useState('');

  // product management (add + full customize)
  const GST_OPTIONS = [0, 5, 12, 18, 28];
  const STATION_OPTIONS = ['kitchen', 'bar', 'dessert'];
  const [menuCategories, setMenuCategories] = useState<{ id: string; name: string }[]>([]);
  const [menuCatFilter, setMenuCatFilter] = useState('all'); // 'all' | category id | 'none'
  const blankProduct = { name: '', price: '', gstRate: '5', station: 'kitchen', categoryId: '', description: '' };
  const [showAddProduct, setShowAddProduct] = useState(false);
  const [newProduct, setNewProduct] = useState({ ...blankProduct });
  const [newCategory, setNewCategory] = useState('');
  const [editProductId, setEditProductId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState({ ...blankProduct });

  const handleCreateCategory = async () => {
    const name = newCategory.trim();
    if (!name) return;
    try {
      const res = await fetch('/api/dashboard/menu', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'category_create', name }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok && d.category) {
        flashMessage('Category added');
        setNewCategory('');
        setMenuCategories((prev) => [...prev, d.category]);
        setNewProduct((p) => ({ ...p, categoryId: d.category.id }));
      } else flashMessage('Could not add category');
    } catch (err) { console.error(err); }
  };

  const handleCreateProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    const rupees = parseFloat(newProduct.price);
    if (!newProduct.name.trim()) { flashMessage('Enter a product name'); return; }
    if (!Number.isFinite(rupees) || rupees < 0) { flashMessage('Enter a valid price'); return; }
    try {
      const res = await fetch('/api/dashboard/menu', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'create',
          name: newProduct.name.trim(),
          pricePaise: Math.round(rupees * 100),
          gstRate: Number(newProduct.gstRate),
          station: newProduct.station,
          categoryId: newProduct.categoryId || undefined,
          description: newProduct.description.trim() || undefined,
        }),
      });
      if (res.ok) {
        flashMessage('Product added');
        setNewProduct({ ...blankProduct });
        setShowAddProduct(false);
        loadInventoryData();
      } else flashMessage('Could not add product');
    } catch (err) { console.error(err); }
  };

  const startEditProduct = (item: any) => {
    setEditProductId(item.id);
    setEditDraft({
      name: item.name ?? '',
      price: ((item.pricePaise ?? 0) / 100).toString(),
      gstRate: String(item.gstRate ?? 5),
      station: item.station ?? 'kitchen',
      categoryId: item.categoryId ?? '',
      description: item.description ?? '',
    });
  };

  const handleUpdateProduct = async (itemId: string) => {
    const rupees = parseFloat(editDraft.price);
    if (!editDraft.name.trim()) { flashMessage('Enter a product name'); return; }
    if (!Number.isFinite(rupees) || rupees < 0) { flashMessage('Enter a valid price'); return; }
    try {
      const res = await fetch('/api/dashboard/menu', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'update',
          itemId,
          name: editDraft.name.trim(),
          pricePaise: Math.round(rupees * 100),
          gstRate: Number(editDraft.gstRate),
          station: editDraft.station,
          categoryId: editDraft.categoryId || null,
          description: editDraft.description.trim(),
        }),
      });
      if (res.ok) { flashMessage('Product updated'); setEditProductId(null); loadInventoryData(); }
      else flashMessage('Could not update product');
    } catch (err) { console.error(err); }
  };

  const handleDeleteProduct = async (itemId: string, name: string) => {
    if (!window.confirm(`Delete “${name}”? This cannot be undone.`)) return;
    try {
      const res = await fetch('/api/dashboard/menu', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'delete', itemId }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok) { flashMessage('Product deleted'); setEditProductId(null); loadInventoryData(); }
      else flashMessage(d.message || 'Could not delete product');
    } catch (err) { console.error(err); }
  };

  // order detail + print (Orders view)
  const [orderDetail, setOrderDetail] = useState<any>(null);

  function printOrderDoc(title: string, inner: string) {
    const w = window.open('', '_blank', 'width=380,height=660');
    if (!w) { flashMessage('Allow pop-ups to print'); return; }
    const close = '<' + '/script>';
    w.document.write(`<html><head><title>${title}</title><style>
      *{font-family:ui-monospace,Menlo,monospace;color:#000;box-sizing:border-box}
      body{width:300px;margin:0 auto;padding:14px;font-size:12px}
      h2{text-align:center;margin:0 0 2px;font-size:15px}
      .muted{color:#555;text-align:center;font-size:11px;margin-bottom:4px}
      table{width:100%;border-collapse:collapse} td{padding:2px 0;vertical-align:top} .r{text-align:right}
      .line{border-top:1px dashed #000;margin:8px 0} .tot{font-weight:700;font-size:14px}
    </style></head><body>${inner}<script>window.onload=function(){window.print();setTimeout(function(){window.close()},300)}${close}</body></html>`);
    w.document.close();
  }

  function printOrderBill(o: any) {
    const rows = o.items.map((i: any) => `<tr><td>${i.qty}× ${i.nameSnapshot}</td><td class="r">${formatINR(i.unitPricePaise * i.qty)}</td></tr>`).join('');
    const row = (label: string, val: number) => `<tr><td>${label}</td><td class="r">${formatINR(val)}</td></tr>`;
    printOrderDoc(`Bill #${o.number}`, `
      <h2>${outlet.brand}</h2>
      ${outlet.gstin ? `<div class="muted">GSTIN ${outlet.gstin}</div>` : ''}
      <div class="muted">Bill #${o.number} · ${o.table?.label ? 'Table ' + o.table.label : o.type} · ${new Date(o.placedAt).toLocaleString('en-IN')}</div>
      <div class="line"></div><table>${rows}</table><div class="line"></div>
      <table>
        ${row('Subtotal', o.subtotalPaise)}
        ${o.discountPaise > 0 ? row('Discount', -o.discountPaise) : ''}
        ${o.cgstPaise > 0 ? row('CGST', o.cgstPaise) : ''}
        ${o.sgstPaise > 0 ? row('SGST', o.sgstPaise) : ''}
        ${o.igstPaise > 0 ? row('IGST', o.igstPaise) : ''}
        ${o.serviceChargePaise > 0 ? row('Service charge', o.serviceChargePaise) : ''}
        ${row('Round off', o.roundOffPaise)}
        <tr class="tot"><td>Total</td><td class="r">${formatINR(o.totalPaise)}</td></tr>
      </table>
      <div class="line"></div><div class="muted">Status: ${o.status} · Thank you!</div>`);
  }

  function printOrderKOT(o: any) {
    const rows = o.items.map((i: any) => `<tr><td>${i.qty}×</td><td>${i.nameSnapshot}</td><td class="r">${i.station ?? ''}</td></tr>`).join('');
    printOrderDoc(`KOT #${o.number}`, `
      <h2>KOT · #${o.number}</h2>
      <div class="muted">${o.table?.label ? 'Table ' + o.table.label : o.type}</div>
      <div class="line"></div><table>${rows}</table>`);
  }

  const handleSavePrice = async (itemId: string) => {
    const rupees = parseFloat(priceDraft);
    if (!Number.isFinite(rupees) || rupees < 0) { flashMessage('Enter a valid price'); return; }
    try {
      const res = await fetch('/api/dashboard/menu', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'price', itemId, pricePaise: Math.round(rupees * 100) }),
      });
      if (res.ok) { flashMessage('Price updated'); setPriceEditId(null); setPriceDraft(''); loadInventoryData(); }
      else flashMessage('Could not update price');
    } catch (err) {
      console.error(err);
    }
  };

  // Store profile editing (Settings → General)
  const [profile, setProfile] = useState({ name: '', gstin: '', stateCode: '', line1: '', city: '', pincode: '', gstEnabled: false, gstRate: '', gstType: 'exclusive' as 'exclusive' | 'inclusive' });
  const [gstSaving, setGstSaving] = useState(false);
  const [salesGst, setSalesGst] = useState<any>(null);
  const [profileLoaded, setProfileLoaded] = useState(false);

  // Settings panel navigation (vertical sub-nav)
  const [settingsPanel, setSettingsPanel] = useState<'general' | 'tax' | 'floor' | 'devices' | 'pwa' | 'audit' | 'multibranch'>('general');

  // Devices & printers (Settings → Devices)
  const [devices, setDevices] = useState<Device[]>([]);
  const blankDevice = { id: '', name: '', type: 'receipt_printer', connection: 'network', target: '', station: 'kitchen', copies: '1', isDefault: false };
  const [deviceForm, setDeviceForm] = useState<typeof blankDevice>({ ...blankDevice });
  const [showDeviceForm, setShowDeviceForm] = useState(false);

  // Floor & QR (Settings → Floor & QR) — table roster + per-table QR for the PWA
  const [floorTables, setFloorTables] = useState<FloorTable[]>([]);
  const [floors, setFloors] = useState<Floor[]>([]);
  const [newFloorName, setNewFloorName] = useState('');
  const [editFloorId, setEditFloorId] = useState<string | null>(null);
  const [editFloorName, setEditFloorName] = useState('');
  const [tableForm, setTableForm] = useState({ label: '', seats: '4', floorId: '' });
  const [bulkForm, setBulkForm] = useState({ count: '5', prefix: 'T', seats: '4', floorId: '' });
  const [showBulk, setShowBulk] = useState(false);
  const [editTableId, setEditTableId] = useState<string | null>(null);
  const [editTableDraft, setEditTableDraft] = useState({ label: '', seats: '4' });
  const [qrTable, setQrTable] = useState<FloorTable | null>(null); // QR preview/print modal
  const [floorBusy, setFloorBusy] = useState(false);

  // ── PWA Settings (customer app config) ──
  type PwaMenuItem = { id: string; name: string; pricePaise: number; imageUrl: string | null; categoryName: string | null };
  const [pwaCfg, setPwaCfg] = useState<PwaConfig | null>(null);
  const [pwaItems, setPwaItems] = useState<PwaMenuItem[]>([]);
  const [pwaTab, setPwaTab] = useState<'featured' | 'banners' | 'home' | 'gamification' | 'points' | 'wallet' | 'loyalty' | 'table' | 'registration' | 'theme'>('featured');
  const [pwaBusy, setPwaBusy] = useState(false);

  const loadPwa = async () => {
    try {
      const res = await fetch('/api/dashboard/section?s=pwa');
      if (res.ok) { const d = await res.json(); setPwaCfg(d.data?.config ?? null); setPwaItems(d.data?.menuItems ?? []); }
    } catch (err) { console.error(err); }
  };
  const setCfg = (fn: (c: PwaConfig) => PwaConfig) => setPwaCfg((prev) => (prev ? fn(prev) : prev));
  useEffect(() => { if (activeMenu === 'settings' && settingsPanel === 'pwa' && !pwaCfg) loadPwa(); }, [activeMenu, settingsPanel, pwaCfg]);

  // ── Audit Logs (Settings → Audit Logs, owner-only) ──
  type AuditEntry = { id: string; at: string; actorName: string; action: string; entity: string; entityId: string | null; before: Record<string, unknown> | null; after: Record<string, unknown> | null };
  type AuditOptions = { actions: string[]; entities: string[]; staff: { id: string; name: string }[] };
  const [auditEntries, setAuditEntries] = useState<AuditEntry[]>([]);
  const [auditOptions, setAuditOptions] = useState<AuditOptions>({ actions: [], entities: [], staff: [] });
  const [auditFilters, setAuditFilters] = useState<{ action: string; entity: string; actorId: string }>({ action: '', entity: '', actorId: '' });
  const [auditPage, setAuditPage] = useState(1);
  const [auditHasMore, setAuditHasMore] = useState(false);
  const [auditBusy, setAuditBusy] = useState(false);
  const [expandedAuditId, setExpandedAuditId] = useState<string | null>(null);

  const loadAudit = async (page = 1, append = false) => {
    setAuditBusy(true);
    try {
      const qs = new URLSearchParams({ page: String(page) });
      if (auditFilters.action) qs.set('action', auditFilters.action);
      if (auditFilters.entity) qs.set('entity', auditFilters.entity);
      if (auditFilters.actorId) qs.set('actorId', auditFilters.actorId);
      const res = await fetch(`/api/dashboard/audit?${qs.toString()}`);
      if (res.ok) {
        const d = await res.json();
        setAuditEntries((prev) => (append ? [...prev, ...(d.entries ?? [])] : (d.entries ?? [])));
        setAuditHasMore(!!d.hasMore);
        setAuditPage(d.page ?? page);
        if (d.filterOptions) setAuditOptions(d.filterOptions);
      }
    } catch (err) { console.error(err); }
    finally { setAuditBusy(false); }
  };
  // first open → load; any filter change → reset to page 1
  useEffect(() => {
    if (activeMenu === 'settings' && settingsPanel === 'audit') { setExpandedAuditId(null); loadAudit(1); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeMenu, settingsPanel, auditFilters.action, auditFilters.entity, auditFilters.actorId]);

  // POST one sub-block to /api/dashboard/pwa; server returns the normalized config
  const pwaSave = async (payload: Record<string, unknown>, okMsg = 'Saved') => {
    setPwaBusy(true);
    try {
      const res = await fetch('/api/dashboard/pwa', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
      const d = await res.json().catch(() => ({}));
      if (res.ok) { setPwaCfg(d.config ?? null); flashMessage(okMsg); return true; }
      flashMessage(`Could not save (${d.error ?? 'error'})`);
      return false;
    } catch (err) { console.error(err); flashMessage('Network error'); return false; }
    finally { setPwaBusy(false); }
  };

  // upload an image file → returns its public URL (or null)
  const uploadImage = async (file: File): Promise<string | null> => {
    const fd = new FormData();
    fd.append('image', file);
    try {
      const res = await fetch('/api/dashboard/upload', { method: 'POST', body: fd });
      const d = await res.json().catch(() => ({}));
      if (res.ok && d.url) return d.url as string;
      flashMessage(`Upload failed (${d.error ?? 'error'})`);
      return null;
    } catch { flashMessage('Upload failed'); return null; }
  };

  const loadProfile = async () => {
    try {
      const res = await fetch('/api/dashboard/section?s=settings');
      if (res.ok) {
        const d = await res.json();
        const o = d.data?.outlet;
        const a = (o?.address ?? {}) as any;
        setProfile({ name: o?.name ?? '', gstin: o?.gstin ?? '', stateCode: o?.stateCode ?? '', line1: a.line1 ?? '', city: a.city ?? '', pincode: a.pincode ?? '', gstEnabled: o?.gstEnabled ?? false, gstRate: o?.gstRate != null ? String(o.gstRate) : '', gstType: o?.gstType === 'inclusive' ? 'inclusive' : 'exclusive' });
        setDevices(d.data?.devices ?? []);
        setFloorTables(d.data?.tables ?? []);
        setFloors(d.data?.floors ?? []);
        setProfileLoaded(true);
      }
    } catch (err) { console.error(err); }
  };

  // --- Floor & QR actions ---------------------------------------------------
  const ERR_MSG: Record<string, string> = {
    duplicate_label: 'A table with that name already exists.',
    missing_label: 'Enter a table name.',
    table_in_use: 'This table has live or past orders — it can’t be deleted. Edit it instead.',
    forbidden: 'Only owners and managers can change the floor.',
  };

  const floorApi = async (payload: Record<string, unknown>, okMsg: string) => {
    setFloorBusy(true);
    try {
      const res = await fetch('/api/dashboard/floor', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok) { flashMessage(okMsg); await loadProfile(); return true; }
      flashMessage(ERR_MSG[d.error as string] ?? `Could not save (${d.error ?? 'error'})`);
      return false;
    } catch (err) { console.error(err); flashMessage('Network error'); return false; }
    finally { setFloorBusy(false); }
  };

  const handleAddTable = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tableForm.label.trim()) { flashMessage('Enter a table name'); return; }
    if (await floorApi({ action: 'create', label: tableForm.label.trim(), seats: Number(tableForm.seats) || 2, floorId: tableForm.floorId || undefined }, `Table ${tableForm.label.trim()} added`)) {
      setTableForm({ label: '', seats: tableForm.seats, floorId: tableForm.floorId });
    }
  };
  const handleBulkAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (await floorApi({ action: 'bulk', count: Number(bulkForm.count) || 0, prefix: bulkForm.prefix.trim() || 'T', seats: Number(bulkForm.seats) || 2, floorId: bulkForm.floorId || undefined }, 'Tables added')) {
      setShowBulk(false);
    }
  };
  // --- floors / areas ---
  const handleAddFloor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFloorName.trim()) { flashMessage('Enter a floor name'); return; }
    if (await floorApi({ action: 'floor_add', name: newFloorName.trim() }, `Floor “${newFloorName.trim()}” added`)) setNewFloorName('');
  };
  const handleRenameFloor = async (floorId: string) => {
    if (!editFloorName.trim()) { flashMessage('Enter a floor name'); return; }
    if (await floorApi({ action: 'floor_rename', floorId, name: editFloorName.trim() }, 'Floor renamed')) setEditFloorId(null);
  };
  const handleDeleteFloor = (f: Floor) => {
    const n = floorTables.filter((t) => t.floorId === f.id).length;
    if (!window.confirm(`Delete floor “${f.name}”?${n ? ` Its ${n} table${n === 1 ? '' : 's'} will become Unassigned.` : ''}`)) return;
    floorApi({ action: 'floor_delete', floorId: f.id }, `Floor “${f.name}” deleted`);
  };
  const handleAssignFloor = (tableId: string, floorId: string) => {
    floorApi({ action: 'assign', id: tableId, floorId: floorId || undefined }, 'Table moved');
  };

  const renderTableCard = (t: FloorTable) => {
    const occupied = t.activeOrders > 0;
    return (
      <div key={t.id} className="rounded-2xl border p-3 flex gap-3" style={{ background: 'var(--paper-3)', borderColor: 'var(--line)' }}>
        <button onClick={() => setQrTable(t)} className="shrink-0 rounded-xl overflow-hidden bg-white grid place-items-center" style={{ width: 76, height: 76, border: '1px solid var(--line-2)' }} title="View / print QR" aria-label={`View QR for ${t.label}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={tableQrImageUrl(t.qrToken, 150)} alt={`QR for ${t.label}`} width={68} height={68} loading="lazy" />
        </button>
        <div className="min-w-0 flex-1">
          {editTableId === t.id ? (
            <div className="flex flex-col gap-2">
              <input value={editTableDraft.label} onChange={(e) => setEditTableDraft((p) => ({ ...p, label: e.target.value }))} className="w-full p-2 rounded-lg border text-sm outline-none" style={{ background: 'var(--paper-2)', borderColor: 'var(--line-2)' }} />
              <div className="flex items-center gap-2">
                <input type="number" min={1} max={50} value={editTableDraft.seats} onChange={(e) => setEditTableDraft((p) => ({ ...p, seats: e.target.value }))} className="w-16 p-2 rounded-lg border text-sm outline-none" style={{ background: 'var(--paper-2)', borderColor: 'var(--line-2)' }} />
                <span className="text-xs text-ink-3">seats</span>
                <button onClick={() => handleSaveTable(t.id)} disabled={floorBusy} className="btn btn-primary py-1 px-2.5 text-xs ml-auto disabled:opacity-50">Save</button>
                <button onClick={() => setEditTableId(null)} className="btn py-1 px-2.5 text-xs" style={{ background: 'var(--paper-2)', border: '1px solid var(--line)' }}>Cancel</button>
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <b className="text-base truncate">{t.label}</b>
                <span className="pill text-[10px]" style={{ color: occupied ? 'var(--clay)' : 'var(--cardamom-d)', background: occupied ? 'rgba(192,57,43,.10)' : 'rgba(90,138,90,.12)' }}>
                  {occupied ? `● ${t.activeOrders} order${t.activeOrders === 1 ? '' : 's'}` : '○ free'}
                </span>
              </div>
              <span className="block text-xs text-ink-3 mt-0.5">{t.seats} seat{t.seats === 1 ? '' : 's'}</span>
              {floors.length > 0 && (
                <select value={t.floorId ?? ''} onChange={(e) => handleAssignFloor(t.id, e.target.value)} className="mt-1.5 w-full p-1.5 rounded-lg border text-xs outline-none" style={{ background: 'var(--paper-2)', borderColor: 'var(--line-2)' }} aria-label={`Floor for ${t.label}`}>
                  <option value="">Unassigned</option>
                  {floors.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                </select>
              )}
              <div className="flex flex-wrap gap-1.5 mt-2">
                <button onClick={() => setQrTable(t)} className="btn py-1 px-2.5 text-xs" style={{ background: 'var(--paper-2)', border: '1px solid var(--line)' }}>QR</button>
                <button onClick={() => copyTableLink(t)} className="btn py-1 px-2.5 text-xs" style={{ background: 'var(--paper-2)', border: '1px solid var(--line)' }}>Copy link</button>
                <button onClick={() => startEditTable(t)} className="btn py-1 px-2.5 text-xs" style={{ background: 'var(--paper-2)', border: '1px solid var(--line)' }}>Edit</button>
                <button onClick={() => handleDeleteTable(t)} disabled={occupied} title={occupied ? 'Free the table before deleting' : 'Delete table'} className="btn py-1 px-2.5 text-xs disabled:opacity-40" style={{ background: 'var(--paper-2)', border: '1px solid var(--chilli, #c0392b)', color: 'var(--chilli, #c0392b)' }}>Delete</button>
              </div>
            </>
          )}
        </div>
      </div>
    );
  };
  const startEditTable = (t: FloorTable) => { setEditTableId(t.id); setEditTableDraft({ label: t.label, seats: String(t.seats) }); };
  const handleSaveTable = async (id: string) => {
    if (!editTableDraft.label.trim()) { flashMessage('Enter a table name'); return; }
    if (await floorApi({ action: 'update', id, label: editTableDraft.label.trim(), seats: Number(editTableDraft.seats) || 2 }, 'Table updated')) {
      setEditTableId(null);
    }
  };
  const handleDeleteTable = (t: FloorTable) => {
    if (!window.confirm(`Delete table “${t.label}”? This can’t be undone.`)) return;
    floorApi({ action: 'delete', id: t.id }, `Table ${t.label} deleted`);
  };
  const handleRegenerateQr = (t: FloorTable) => {
    if (!window.confirm(`Rotate the QR for “${t.label}”? Any printed code for this table will stop working.`)) return;
    floorApi({ action: 'regenerate', id: t.id }, `New QR generated for ${t.label}`).then((ok) => { if (ok) setQrTable(null); });
  };
  const copyTableLink = async (t: FloorTable) => {
    try { await navigator.clipboard.writeText(tableOrderUrl(t.qrToken)); flashMessage(`Link for ${t.label} copied`); }
    catch { flashMessage('Could not copy link'); }
  };
  const printTableQr = (t: FloorTable) => {
    const url = tableOrderUrl(t.qrToken);
    const img = tableQrImageUrl(t.qrToken, 600);
    const w = window.open('', '_blank', 'width=420,height=560');
    if (!w) { flashMessage('Allow pop-ups to print'); return; }
    const close = '<' + '/script>';
    w.document.write(`<html><head><title>QR · ${t.label}</title><style>
      *{font-family:ui-sans-serif,system-ui,sans-serif;color:#1e120a;box-sizing:border-box}
      body{width:300px;margin:0 auto;padding:24px;text-align:center}
      h1{font-size:22px;margin:0 0 2px} .sub{color:#6b5b4d;font-size:13px;margin-bottom:16px}
      img{width:260px;height:260px} .lbl{font-size:34px;font-weight:800;margin:14px 0 2px}
      .tap{font-size:13px;color:#6b5b4d} .url{font-size:10px;color:#9a8a7c;word-break:break-all;margin-top:10px}
    </style></head><body>
      <h1>${outlet.brand}</h1><div class="sub">Scan to view the menu &amp; order</div>
      <img src="${img}" alt="QR for ${t.label}" />
      <div class="lbl">${t.label}</div><div class="tap">Point your camera here</div>
      <div class="url">${url}</div>
      <script>var i=document.images[0];function go(){window.print();setTimeout(function(){window.close()},300)}i.complete?go():(i.onload=go,i.onerror=go)${close}
    </body></html>`);
    w.document.close();
  };

  useEffect(() => { if (activeMenu === 'settings' && !profileLoaded) loadProfile(); }, [activeMenu, profileLoaded]);

  const openDeviceForm = (dev?: Device) => {
    if (dev) {
      setDeviceForm({ id: dev.id, name: dev.name, type: dev.type, connection: dev.connection, target: dev.target, station: dev.station ?? 'kitchen', copies: String(dev.copies), isDefault: dev.isDefault });
    } else {
      setDeviceForm({ ...blankDevice });
    }
    setShowDeviceForm(true);
  };

  const handleSaveDevice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!deviceForm.name.trim()) { flashMessage('Enter a device name'); return; }
    try {
      const res = await fetch('/api/dashboard/settings', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'device_save',
          device: {
            id: deviceForm.id || undefined,
            name: deviceForm.name.trim(),
            type: deviceForm.type,
            connection: deviceForm.connection,
            target: deviceForm.target.trim(),
            station: deviceForm.station,
            copies: Number(deviceForm.copies) || 1,
            isDefault: deviceForm.isDefault,
          },
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok) { flashMessage(deviceForm.id ? 'Device updated' : 'Device added'); setDevices(d.devices ?? []); setShowDeviceForm(false); }
      else flashMessage('Could not save device');
    } catch (err) { console.error(err); }
  };

  const handleDeleteDevice = async (id: string, name: string) => {
    if (!window.confirm(`Remove “${name}”?`)) return;
    try {
      const res = await fetch('/api/dashboard/settings', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'device_delete', id }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok) { flashMessage('Device removed'); setDevices(d.devices ?? []); }
      else flashMessage('Could not remove device');
    } catch (err) { console.error(err); }
  };

  const handleSetDefaultDevice = async (dev: Device) => {
    try {
      const res = await fetch('/api/dashboard/settings', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'device_save', device: { ...dev, isDefault: true } }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok) { setDevices(d.devices ?? []); flashMessage('Default set'); }
    } catch (err) { console.error(err); }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      // GST is managed in its own Tax & GST panel; profile save leaves it untouched.
      const res = await fetch('/api/dashboard/settings', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'outlet', name: profile.name, gstin: profile.gstin || null, stateCode: profile.stateCode || null, address: { line1: profile.line1, city: profile.city, pincode: profile.pincode } }),
      });
      if (res.ok) { flashMessage('Store profile saved'); router.refresh(); }
      else flashMessage('Could not save profile');
    } catch (err) {
      console.error(err);
    }
  };

  // Settings → Tax & GST — saves only the GST config block
  const handleSaveGst = async (e: React.FormEvent) => {
    e.preventDefault();
    setGstSaving(true);
    try {
      const res = await fetch('/api/dashboard/settings', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'outlet',
          gstEnabled: profile.gstEnabled,
          gstRate: profile.gstRate.trim() === '' ? null : Number(profile.gstRate),
          gstType: profile.gstType,
        }),
      });
      if (res.ok) { flashMessage(profile.gstEnabled ? 'GST settings saved' : 'GST turned off — bills are now tax-free'); router.refresh(); }
      else flashMessage('Could not save GST settings');
    } catch (err) { console.error(err); }
    finally { setGstSaving(false); }
  };

  // GST report data (exact figures) loaded when the Reports → GST tab opens
  useEffect(() => {
    if (activeMenu === 'reports' && activeSubTab === 'gst' && !salesGst) {
      fetch('/api/dashboard/section?s=sales').then((r) => (r.ok ? r.json() : null)).then((d) => setSalesGst(d?.data ?? null)).catch(() => {});
    }
  }, [activeMenu, activeSubTab, salesGst]);

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
    router.replace('/login');
    router.refresh();
  }

  // Calculated estimated profit (70% margin default)
  const totalSales = kpi.todaySalesPaise;
  const estimatedProfit = Math.round(totalSales * 0.70);

  return (
    <div className="grid min-h-screen lg:grid-cols-[248px_1fr]" style={{ background: 'var(--paper)' }}>
      {/* sidebar rail */}
      <aside className="hidden lg:flex flex-col gap-1 p-4 border-r" style={{ borderColor: 'var(--line)', background: 'var(--paper-2)' }}>
        <div className="flex items-center gap-2.5 px-2 py-3 mb-2">
          <img src="/logo chaya one.png" alt="ChayaOne" style={{ width: 104, height: 'auto', margin: 0, maxWidth: '100%' }} className="shrink-0 object-contain" />
          <div className="leading-tight min-w-0">
            <b className="block text-sm truncate">{outlet.brand}</b>
            <span className="text-xs capitalize" style={{ color: 'var(--ink-3)' }}>{staff.role}</span>
          </div>
        </div>

        <nav className="flex flex-col gap-0.5 flex-1">
          {MENUS.map((m) => {
            // Reports now lives under Settings — keep Settings lit while viewing it
            const on = activeMenu === m.key || (m.key === 'settings' && activeMenu === 'reports');
            const Ic = m.icon;
            return (
              <button
                key={m.key}
                onClick={() => {
                  setActiveMenu(m.key);
                  setLiveOrders(0);
                }}
                aria-current={on ? 'page' : undefined}
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-left transition"
                style={on
                  ? { background: 'var(--turmeric)', color: '#2A1607', fontWeight: 700 }
                  : { color: 'var(--ink-2)' }}
              >
                <Ic size={18} aria-hidden className="shrink-0" />
                {m.label}
                {m.key === 'dashboard' && liveOrders > 0 && (
                  <span className="ml-auto bg-[var(--clay)] text-white text-[10px] px-2 py-0.5 rounded-full font-bold">
                    {liveOrders}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <a href="/pos" target="_blank" className="flex items-center gap-2 px-3 py-2 text-sm rounded-xl transition font-bold" style={{ color: 'var(--turmeric-d)' }}>
          <Table2 size={16} aria-hidden /> Open Till (POS)
        </a>

        <div className="card p-3 mt-1" style={{ background: 'var(--paper-3)' }}>
          <b className="text-sm capitalize">{outlet.plan} plan</b>
          <span className="block text-xs mb-2" style={{ color: 'var(--ink-3)' }}>14 days left in trial</span>
          <button className="btn btn-primary w-full" style={{ padding: '8px' }}>Upgrade</button>
        </div>

        <button onClick={logout} className="flex items-center gap-2 px-3 py-2 mt-1 text-sm text-left rounded-xl transition" style={{ color: 'var(--ink-3)' }}>
          <LogOut size={16} aria-hidden /> Log out
        </button>
      </aside>

      <main className="min-w-0 p-5 md:p-7 flex flex-col gap-4">
        {/* Header */}
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="font-display text-3xl md:text-4xl leading-tight">
              {activeMenu === 'menu' ? 'Menu Items' : activeMenu.charAt(0).toUpperCase() + activeMenu.slice(1)}
            </h1>
            <p className="text-xs" style={{ color: 'var(--ink-3)' }}>
              {outlet.name} · {isAdvanced ? 'Advanced Mode' : 'Beginner Mode'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* Mobile Nav Switcher */}
            <select
              value={activeMenu}
              onChange={(e) => setActiveMenu(e.target.value)}
              className="lg:hidden btn py-2"
              aria-label="Navigate"
            >
              {MENUS.map((m) => (
                <option key={m.key} value={m.key}>{m.label}</option>
              ))}
              {/* Reports lives under Settings but keep it selectable on mobile when active */}
              {activeMenu === 'reports' && <option value="reports">Reports</option>}
            </select>

            <span className="pill" style={{ color: connected ? 'var(--cardamom-d)' : 'var(--ink-3)' }}>
              <span
                ref={liveDot}
                className="inline-block w-2 h-2 rounded-full"
                style={{ background: connected ? 'var(--cardamom)' : 'var(--ink-3)', animation: connected ? 'pulse 2s infinite' : 'none' }}
              />
              {connected ? 'Live' : 'Offline'}
            </span>

            <ThemeToggle />

            {/* notification bell */}
            <div className="relative">
              <button onClick={() => { setBellOpen((o) => !o); if (!bellOpen) loadNotifs(); }} className="relative w-9 h-9 rounded-xl grid place-items-center" style={{ background: 'var(--paper-2)', border: '1px solid var(--line)', color: 'var(--ink-2)' }} aria-label={unread > 0 ? `Alerts, ${unread} unread` : 'Alerts'}>
                <Bell size={18} aria-hidden />
                {unread > 0 && <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 grid place-items-center rounded-full text-[10px] font-extrabold text-white tnum" style={{ background: 'var(--clay)' }}>{unread > 99 ? '99+' : unread}</span>}
              </button>
              {bellOpen && (
                <>
                  <div className="fixed inset-0 z-[40]" onClick={() => setBellOpen(false)} />
                  <div className="absolute right-0 mt-2 w-[320px] max-h-[440px] overflow-auto z-[50] rounded-2xl shadow-3" style={{ background: 'var(--paper-2)', border: '1px solid var(--line)' }}>
                    <div className="flex items-center justify-between px-4 py-3 border-b sticky top-0" style={{ borderColor: 'var(--line)', background: 'var(--paper-2)' }}>
                      <b className="text-sm">Alerts</b>
                      {unread > 0 && <button onClick={markAllRead} className="text-xs font-bold" style={{ color: 'var(--turmeric-d)' }}>Mark all read</button>}
                    </div>
                    {notifs.length === 0 ? (
                      <p className="text-sm text-ink-3 p-5 text-center">No alerts. You’re all caught up. ✨</p>
                    ) : (
                      <div className="flex flex-col">
                        {notifs.map((n) => (
                          <button key={n.id} onClick={() => !n.readAt && markRead(n.id)} className="text-left px-4 py-3 border-b flex gap-3 items-start transition" style={{ borderColor: 'var(--line)', background: n.readAt ? 'transparent' : 'color-mix(in srgb, var(--turmeric) 7%, transparent)' }}>
                            <span className="text-base leading-none mt-0.5">{n.severity === 'critical' ? '🔴' : n.severity === 'warn' ? '🟠' : '🔵'}</span>
                            <div className="min-w-0">
                              <div className="text-[13px] font-bold leading-snug">{n.title}</div>
                              {n.body && <div className="text-[11.5px] text-ink-3 leading-snug">{n.body}</div>}
                              <div className="text-[10px] text-ink-3 mt-0.5">{new Date(n.at).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</div>
                            </div>
                            {!n.readAt && <span className="ml-auto w-2 h-2 rounded-full mt-1" style={{ background: 'var(--clay)' }} />}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </header>

        {/* ── 1b. Owner Monitor (live ops) ── */}
        {activeMenu === 'monitor' && (
          <div className="flex flex-col gap-4">
            {monitorLoading && !monitor ? (
              <p className="text-sm">Loading live metrics…</p>
            ) : (
              <>
                {/* live metric tiles */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  <KpiCard label="Today's sales" value={formatINR(monitor?.today?.salesPaise ?? 0)} tone="cardamom" />
                  <section className="card p-4">
                    <span className="block text-xs mb-2 text-ink-3">Orders in progress</span>
                    <span className="block text-2xl md:text-3xl font-bold tnum font-mono">{(monitor?.ordersInProgress?.pendingApproval ?? 0) + (monitor?.ordersInProgress?.inKitchen ?? 0) + (monitor?.ordersInProgress?.ready ?? 0)}</span>
                    <span className="text-[11px] text-ink-3">{monitor?.ordersInProgress?.pendingApproval ?? 0} approval · {monitor?.ordersInProgress?.inKitchen ?? 0} kitchen · {monitor?.ordersInProgress?.ready ?? 0} ready</span>
                  </section>
                  <KpiCard label="Cash today" value={formatINR(monitor?.today?.cashPaise ?? 0)} />
                  <KpiCard label="UPI today" value={formatINR(monitor?.today?.upiPaise ?? 0)} />
                </div>

                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  <section className="card p-4">
                    <span className="block text-xs mb-2 text-ink-3">Active tables</span>
                    <span className="block text-2xl font-bold tnum font-mono">{monitor?.tables?.occupied ?? 0}<span className="text-sm text-ink-3"> / {monitor?.tables?.total ?? 0}</span></span>
                    {(monitor?.tables?.lowRevenue ?? 0) > 0 && <span className="text-[11px] font-bold" style={{ color: 'var(--clay)' }}>{monitor.tables.lowRevenue} low-revenue</span>}
                  </section>
                  <section className="card p-4">
                    <span className="block text-xs mb-2 text-ink-3">Inventory status</span>
                    <span className="block text-2xl font-bold tnum font-mono" style={{ color: (monitor?.inventory?.critical ?? 0) > 0 ? 'var(--clay)' : undefined }}>{(monitor?.inventory?.low ?? 0) + (monitor?.inventory?.critical ?? 0)}</span>
                    <span className="text-[11px] text-ink-3">{monitor?.inventory?.critical ?? 0} critical · {monitor?.inventory?.low ?? 0} low</span>
                  </section>
                  <section className="card p-4">
                    <span className="block text-xs mb-2 text-ink-3">Staff on duty</span>
                    <span className="block text-2xl font-bold tnum font-mono">{monitor?.staffOnDuty ?? 0}</span>
                  </section>
                  <KpiCard label="Supplier dues" value={formatINR(monitor?.supplierOutstandingPaise ?? 0)} tone="gold" />
                </div>

                {/* sales-vs-usual + channels */}
                <div className="grid lg:grid-cols-2 gap-4">
                  <section className="card p-5">
                    <h4 className="font-bold mb-2">Sales vs usual</h4>
                    <div className="flex items-end gap-3">
                      <span className="text-3xl font-bold font-mono">{formatINR(monitor?.salesTrend?.todayPaise ?? 0)}</span>
                      <span className="text-sm font-bold mb-1" style={{ color: (monitor?.salesTrend?.deltaPct ?? 0) < 0 ? 'var(--clay)' : 'var(--cardamom-d)' }}>
                        {(monitor?.salesTrend?.deltaPct ?? 0) >= 0 ? '▲' : '▼'} {Math.abs(monitor?.salesTrend?.deltaPct ?? 0)}%
                      </span>
                    </div>
                    <span className="text-xs text-ink-3">vs ~{formatINR(monitor?.salesTrend?.avg7Paise ?? 0)} typical (7-day avg)</span>
                  </section>
                  <section className="card p-5">
                    <h4 className="font-bold mb-2">Notification channels</h4>
                    <div className="flex flex-wrap gap-2">
                      {[['In-app', monitor?.channels?.inApp], ['Push', monitor?.channels?.push], ['WhatsApp', monitor?.channels?.whatsapp], ['Email', monitor?.channels?.email]].map(([label, on]) => (
                        <span key={label as string} className="pill text-xs" style={{ color: on ? 'var(--cardamom-d)' : 'var(--ink-3)' }}>
                          {on ? '● ' : '○ '}{label}{on ? '' : ' (ready)'}
                        </span>
                      ))}
                    </div>
                    <p className="text-[11px] text-ink-3 mt-2">WhatsApp & email fire automatically once their API keys are set in the environment.</p>
                  </section>
                </div>

                {/* live alert feed */}
                <section className="card p-5">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="font-bold">Live Alerts {unread > 0 && <span className="text-xs font-bold" style={{ color: 'var(--clay)' }}>· {unread} unread</span>}</h4>
                    {unread > 0 && <button onClick={markAllRead} className="text-xs font-bold" style={{ color: 'var(--turmeric-d)' }}>Mark all read</button>}
                  </div>
                  {!monitor?.alerts?.length ? (
                    <p className="text-sm text-ink-3">No open alerts. Stock, occupancy, discounts and cancellations will surface here in real time.</p>
                  ) : (
                    <div className="grid gap-2">
                      {monitor.alerts.map((a: any) => (
                        <div key={a.id} className="flex items-start gap-3 text-sm p-3 rounded-xl" style={{ background: 'var(--paper-3)' }}>
                          <span className="mt-0.5">{a.severity === 'critical' ? '🔴' : a.severity === 'warn' ? '🟠' : '🔵'}</span>
                          <div className="flex-1">
                            <div className="font-bold">{a.title}</div>
                            {a.body && <div className="text-xs text-ink-3">{a.body}</div>}
                          </div>
                          <span className="text-[10px] text-ink-3">{new Date(a.at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              </>
            )}
          </div>
        )}

        {/* ── 1. Dashboard View ── */}
        {activeMenu === 'dashboard' && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {/* AI Briefing */}
            <section className="card col-span-2 p-5 flex flex-col justify-between">
              <div>
                <span className="font-bold text-xs" style={{ color: 'var(--berry)' }}>✦ AI Morning Briefing</span>
                <div className="grid gap-2.5 mt-3">
                  {briefing.length === 0 ? (
                    <p className="text-sm text-ink-3">Briefing updates instantly as sales come in.</p>
                  ) : (
                    briefing.map((b, i) => (
                      <div key={i} className="flex gap-2 text-sm leading-snug">
                        <span style={{ color: b.tone === 'up' ? 'var(--cardamom)' : 'var(--clay)' }}>●</span>
                        <p>{b.text}</p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </section>

            {/* Constraints display: Sales, Orders, Profit, Low Stock, Top Sellers */}
            <KpiCard label="Today's Sales" value={formatINR(totalSales)} />
            <KpiCard label="Orders" value={String(kpi.todayOrders)} />
            <KpiCard label="Profit (est. 70%)" value={formatINR(estimatedProfit)} tone="cardamom" />
            <KpiCard label="Low Stock Items" value={String(lowStock.length)} tone={lowStock.length > 0 ? 'gold' : undefined} />

            {/* Low Stock Alerts list */}
            <section className="card col-span-2 p-5">
              <h4 className="text-base font-bold mb-3">⚠ Low Stock Alerts</h4>
              {lowStock.length === 0 ? (
                <p className="text-sm text-ink-3">All ingredients look healthy!</p>
              ) : (
                <div className="grid gap-2">
                  {lowStock.map((s) => (
                    <div key={s.id} className="flex justify-between items-center text-sm py-1 border-b" style={{ borderColor: 'var(--line-2)' }}>
                      <span>{s.name}</span>
                      <span className="pill py-0.5">{s.qty} ({s.level})</span>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Top Selling Items */}
            <section className="card col-span-2 p-5">
              <h4 className="text-base font-bold mb-3">⭐ Top Selling Items</h4>
              {topItems.length === 0 ? (
                <p className="text-sm text-ink-3">Not enough orders to rank bestsellers.</p>
              ) : (
                <div className="grid gap-2">
                  {topItems.map((item, idx) => (
                    <div key={idx} className="flex justify-between items-center text-sm py-1 border-b" style={{ borderColor: 'var(--line-2)' }}>
                      <span><b>{idx + 1}.</b> {item.name}</span>
                      <span className="font-mono text-ink-2">{item.qty} sold</span>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* AI Assistant grounded box */}
            <Assistant />
          </div>
        )}

        {/* ── 2. Orders View ── */}
        {activeMenu === 'orders' && (
          <div className="flex flex-col gap-4">
            {/* Quick launcher cards */}
            <div className="grid grid-cols-2 gap-4">
              <a href="/pos" target="_blank" className="card p-6 flex flex-col justify-between hover:-translate-y-0.5 transition">
                <span className="text-3xl">⊞</span>
                <div className="mt-3">
                  <h3 className="text-lg font-bold">Take Order (POS)</h3>
                  <p className="text-xs text-ink-3">Open interactive cashier till</p>
                </div>
              </a>
              <a href="/kds" target="_blank" className="card p-6 flex flex-col justify-between hover:-translate-y-0.5 transition">
                <span className="text-3xl">⊟</span>
                <div className="mt-3">
                  <h3 className="text-lg font-bold">Kitchen Display (KDS)</h3>
                  <p className="text-xs text-ink-3">Track live cooking queues</p>
                </div>
              </a>
            </div>

            {/* Tabs */}
            <div className="flex gap-2 border-b" style={{ borderColor: 'var(--line)' }}>
              <button className={`pb-2 px-3 text-sm font-bold ${activeSubTab === 'active' ? 'border-b-2 border-turmeric text-ink' : 'text-ink-3'}`} onClick={() => setActiveSubTab('active')}>Active Orders</button>
              <button className={`pb-2 px-3 text-sm font-bold ${activeSubTab === 'bills' ? 'border-b-2 border-turmeric text-ink' : 'text-ink-3'}`} onClick={() => setActiveSubTab('bills')}>Billing & Bills</button>
            </div>

            {activeSubTab === 'active' && (
              <section className="card p-5">
                <div className="flex justify-between items-center mb-3">
                  <h4 className="font-bold">Live Order Queue</h4>
                  <button onClick={loadOrders} className="btn py-1 px-3 text-xs">↻ Refresh</button>
                </div>
                {ordersLoading ? (
                  <p className="text-sm">Loading orders...</p>
                ) : ordersList.filter((o) => o.status !== 'settled' && o.status !== 'cancelled').length === 0 ? (
                  <p className="text-sm text-ink-3">No active orders right now.</p>
                ) : (
                  <div className="grid gap-3">
                    {ordersList
                      .filter((o) => o.status !== 'settled' && o.status !== 'cancelled')
                      .map((o) => (
                        <div key={o.id} className="card p-4 flex flex-wrap justify-between items-center gap-3" style={{ background: 'var(--paper-3)' }}>
                          <button onClick={() => setOrderDetail(o)} className="text-left flex-1 min-w-0">
                            <span className="font-bold text-base">#{o.number} ({o.type === 'takeaway' ? 'Takeaway' : `Table ${o.table?.label ?? '—'}`}) <span className="text-xs font-normal" style={{ color: 'var(--turmeric-d)' }}>· details ▸</span></span>
                            <div className="text-xs text-ink-3 mt-1 truncate">
                              {o.items.map((i: any) => `${i.qty}× ${i.nameSnapshot}`).join(', ')}
                            </div>
                          </button>
                          <div className="flex items-center gap-2">
                            <span className="pill text-[10px] uppercase">{o.status}</span>
                            {o.status === 'in_kitchen' && (
                              <button onClick={() => handleBumpOrder(o.id, 'ready')} className="btn py-1.5 px-3 text-xs btn-primary">Mark Ready</button>
                            )}
                            {o.status === 'ready' && (
                              <button onClick={() => handleBumpOrder(o.id, 'served')} className="btn py-1.5 px-3 text-xs btn-primary">Mark Served</button>
                            )}
                            {o.status === 'served' && (
                              <div className="flex gap-1">
                                <button onClick={() => handleSettleOrder(o.id, 'cash')} className="btn py-1.5 px-3 text-xs btn-dark">Settle Cash</button>
                                <button onClick={() => handleSettleOrder(o.id, 'upi')} className="btn py-1.5 px-3 text-xs btn-primary">Settle UPI</button>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                  </div>
                )}
              </section>
            )}

            {activeSubTab === 'bills' && (
              <section className="card p-5">
                <h4 className="font-bold mb-3">Recent Invoices / Bills</h4>
                {ordersList.filter((o) => o.status === 'settled').length === 0 ? (
                  <p className="text-sm text-ink-3">No settled invoices recorded yet.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm border-collapse text-left">
                      <thead>
                        <tr className="border-b" style={{ borderColor: 'var(--line)' }}>
                          <th className="pb-2">Bill No.</th>
                          <th className="pb-2">Table</th>
                          <th className="pb-2">Amount</th>
                          <th className="pb-2">Settled At</th>
                          <th className="pb-2">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ordersList
                          .filter((o) => o.status === 'settled')
                          .slice(0, 15)
                          .map((o) => (
                            <tr key={o.id} onClick={() => setOrderDetail(o)} className="border-b cursor-pointer hover:bg-[var(--paper-3)]" style={{ borderColor: 'var(--line-2)' }}>
                              <td className="py-2.5 font-bold">#{o.number}</td>
                              <td className="py-2.5">{o.table?.label ?? 'Takeaway'}</td>
                              <td className="py-2.5 font-mono">{formatINR(o.totalPaise)}</td>
                              <td className="py-2.5 text-xs">{new Date(o.settledAt || o.placedAt).toLocaleString()}</td>
                              <td className="py-2.5"><span className="pill text-[9px] bg-green-100 text-green-800">PAID</span></td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            )}
          </div>
        )}

        {/* ── Staff View ── */}
        {activeMenu === 'staff' && (
          <SectionView section="staff" />
        )}

        {/* ── Customer Management (CRM) ── */}
        {activeMenu === 'customers' && (
          <CustomerManagement role={staff.role} flash={flashMessage} />
        )}

        {/* ── 3. Inventory View ── */}
        {activeMenu === 'inventory' && (
          <div className="flex flex-col gap-4">
            {/* Tabs */}
            <div className="flex flex-wrap gap-2 border-b" style={{ borderColor: 'var(--line)' }}>
              <button className={`pb-2 px-3 text-sm font-bold ${activeSubTab === 'stock' ? 'border-b-2 border-turmeric text-ink' : 'text-ink-3'}`} onClick={() => setActiveSubTab('stock')}>Basic Stock</button>
              <button className={`pb-2 px-3 text-sm font-bold ${activeSubTab === 'consumption' ? 'border-b-2 border-turmeric text-ink' : 'text-ink-3'}`} onClick={() => setActiveSubTab('consumption')}>Consumption {consumption.length > 0 && <span className="ml-1 text-[10px] align-top">●</span>}</button>
              <button className={`pb-2 px-3 text-sm font-bold ${activeSubTab === 'purchase' ? 'border-b-2 border-turmeric text-ink' : 'text-ink-3'}`} onClick={() => setActiveSubTab('purchase')}>Purchase Entry</button>
              <button className={`pb-2 px-3 text-sm font-bold ${activeSubTab === 'adjust' ? 'border-b-2 border-turmeric text-ink' : 'text-ink-3'}`} onClick={() => setActiveSubTab('adjust')}>Adjustment</button>
              <button className={`pb-2 px-3 text-sm font-bold ${activeSubTab === 'recipes' ? 'border-b-2 border-turmeric text-ink' : 'text-ink-3'}`} onClick={() => setActiveSubTab('recipes')}>Recipes 🧪</button>
              {isAdvanced && (
                <>
                  <button className={`pb-2 px-3 text-sm font-bold ${activeSubTab === 'vendors' ? 'border-b-2 border-turmeric text-ink' : 'text-ink-3'}`} onClick={() => setActiveSubTab('vendors')}>Vendors</button>
                  <button className={`pb-2 px-3 text-sm font-bold ${activeSubTab === 'autopo' ? 'border-b-2 border-turmeric text-ink' : 'text-ink-3'}`} onClick={() => setActiveSubTab('autopo')}>Auto POs</button>
                </>
              )}
            </div>

            {activeSubTab === 'stock' && (
              <section className="card p-5">
                {/* low-stock alerts raised automatically as recipes consume stock */}
                {stockAlerts.length > 0 && (
                  <div className="mb-4 grid gap-2">
                    {stockAlerts.map((a) => (
                      <div key={a.id} className="flex items-center gap-3 text-sm p-3 rounded-xl border"
                        style={{ background: a.severity === 'critical' ? 'rgba(195,73,47,.12)' : 'rgba(217,138,43,.12)', borderColor: a.severity === 'critical' ? 'var(--clay)' : 'var(--turmeric)' }}>
                        <span>{a.severity === 'critical' ? '🔴' : '🟠'}</span>
                        <div className="flex-1">
                          <div className="font-bold">{a.title}</div>
                          {a.body && <div className="text-xs text-ink-3">{a.body}</div>}
                        </div>
                        <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full"
                          style={{ color: a.severity === 'critical' ? 'var(--clay)' : 'var(--turmeric-d)' }}>{a.type.replace('_', ' ')}</span>
                      </div>
                    ))}
                  </div>
                )}
                <h4 className="font-bold mb-3">Current Stock Levels</h4>
                {inventoryLoading ? (
                  <p className="text-sm">Loading stock list...</p>
                ) : stockItems.length === 0 ? (
                  <p className="text-sm text-ink-3">No stock items tracked yet.</p>
                ) : (
                  <div className="grid gap-2">
                    {stockItems.map((item) => (
                      <div key={item.id} className="flex justify-between items-center text-sm p-3 rounded-xl" style={{ background: 'var(--paper-3)' }}>
                        <div className="flex items-center gap-2">
                          {item.status !== 'ok' && <span className="w-2 h-2 rounded-full" style={{ background: item.status === 'critical' ? 'var(--clay)' : 'var(--turmeric)' }} />}
                          <span className="font-bold">{item.name}</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="font-mono text-ink-2">{item.onHand} {item.unit}</span>
                          <span className="text-xs text-ink-3">Cost: {formatINR(item.valuePaise)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            )}

            {activeSubTab === 'consumption' && (
              <section className="card p-5">
                <h4 className="font-bold mb-1">Stock Consumption History</h4>
                <p className="text-xs text-ink-3 mb-3">Raw materials auto-deducted from recipes as menu items are sold.</p>
                {inventoryLoading ? (
                  <p className="text-sm">Loading…</p>
                ) : consumption.length === 0 ? (
                  <p className="text-sm text-ink-3">No consumption yet. Link recipes in the Recipes Wizard, then sell items on the POS — deductions appear here.</p>
                ) : (
                  <div className="grid gap-2">
                    {consumption.map((c) => (
                      <div key={c.id} className="flex justify-between items-center text-sm p-3 rounded-xl" style={{ background: 'var(--paper-3)' }}>
                        <span className="font-bold">{c.name}</span>
                        <div className="flex items-center gap-3">
                          <span className="font-mono" style={{ color: 'var(--clay)' }}>− {c.qty} {c.unit}</span>
                          <span className="text-xs text-ink-3">{new Date(c.at).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            )}

            {activeSubTab === 'purchase' && (
              <section className="card p-5 max-w-md">
                <h4 className="font-bold mb-3">Record Purchase</h4>
                <form onSubmit={handleAddPurchase} className="grid gap-3">
                  <div>
                    <label className="block text-xs font-bold mb-1">Select Ingredient</label>
                    <select
                      value={purchItemId}
                      onChange={(e) => setPurchItemId(e.target.value)}
                      className="w-full p-2.5 rounded-xl border text-sm outline-none"
                      style={{ background: 'var(--paper-3)', borderColor: 'var(--line-2)' }}
                      required
                    >
                      <option value="">-- Choose Item --</option>
                      {stockItems.map((s) => (
                        <option key={s.id} value={s.id}>{s.name} ({s.unit})</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold mb-1">Purchase Quantity</label>
                    <input
                      type="number"
                      step="0.01"
                      placeholder="e.g. 5"
                      value={purchQty}
                      onChange={(e) => setPurchQty(e.target.value)}
                      className="w-full p-2.5 rounded-xl border text-sm outline-none"
                      style={{ background: 'var(--paper-3)', borderColor: 'var(--line-2)' }}
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold mb-1">Unit Cost (₹)</label>
                    <input
                      type="number"
                      step="0.01"
                      placeholder="e.g. 150"
                      value={purchPrice}
                      onChange={(e) => setPurchPrice(e.target.value)}
                      className="w-full p-2.5 rounded-xl border text-sm outline-none"
                      style={{ background: 'var(--paper-3)', borderColor: 'var(--line-2)' }}
                      required
                    />
                  </div>
                  <button type="submit" className="btn btn-primary mt-2">Submit Purchase</button>
                </form>
              </section>
            )}

            {activeSubTab === 'adjust' && (
              <section className="card p-5 max-w-md">
                <h4 className="font-bold mb-3">Adjust Stock Count</h4>
                <form onSubmit={handleAdjustStock} className="grid gap-3">
                  <div>
                    <label className="block text-xs font-bold mb-1">Select Ingredient</label>
                    <select
                      value={adjustItemId}
                      onChange={(e) => setAdjustItemId(e.target.value)}
                      className="w-full p-2.5 rounded-xl border text-sm outline-none"
                      style={{ background: 'var(--paper-3)', borderColor: 'var(--line-2)' }}
                      required
                    >
                      <option value="">-- Choose Item --</option>
                      {stockItems.map((s) => (
                        <option key={s.id} value={s.id}>{s.name} ({s.unit})</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold mb-1">Actual Qty On Hand</label>
                    <input
                      type="number"
                      step="0.01"
                      placeholder="e.g. 4.2"
                      value={adjustQty}
                      onChange={(e) => setAdjustQty(e.target.value)}
                      className="w-full p-2.5 rounded-xl border text-sm outline-none"
                      style={{ background: 'var(--paper-3)', borderColor: 'var(--line-2)' }}
                      required
                    />
                  </div>
                  <button type="submit" className="btn btn-primary mt-2">Save Stock Level</button>
                </form>
              </section>
            )}

            {activeSubTab === 'recipes' && (
              <div className="flex flex-col gap-4">
                <section className="card p-5">
                  <h4 className="font-bold mb-1">Add Ingredient to a Recipe</h4>
                  <p className="text-xs text-ink-3 mb-3">Link raw materials to a menu item. Each sale auto-deducts these quantities from stock.</p>
                  <form onSubmit={handleLinkRecipe} className="grid gap-3 max-w-md">
                    <div>
                      <label className="block text-xs font-bold mb-1">Menu Item (POS)</label>
                      <select value={recipeMenuItemId} onChange={(e) => setRecipeMenuItemId(e.target.value)} className="w-full p-2.5 rounded-xl border text-sm outline-none" style={{ background: 'var(--paper-3)', borderColor: 'var(--line-2)' }} required>
                        <option value="">-- Choose Menu Item --</option>
                        {menuItems.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-bold mb-1">Raw Material</label>
                      <select value={recipeStockItemId} onChange={(e) => setRecipeStockItemId(e.target.value)} className="w-full p-2.5 rounded-xl border text-sm outline-none" style={{ background: 'var(--paper-3)', borderColor: 'var(--line-2)' }} required>
                        <option value="">-- Choose Material --</option>
                        {stockItems.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.unit})</option>)}
                      </select>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-bold mb-1">Quantity per item</label>
                        <input type="number" step="0.001" placeholder="e.g. 100" value={recipeQty} onChange={(e) => setRecipeQty(e.target.value)} className="w-full p-2.5 rounded-xl border text-sm outline-none" style={{ background: 'var(--paper-3)', borderColor: 'var(--line-2)' }} required />
                      </div>
                      <div>
                        <label className="block text-xs font-bold mb-1">Unit (optional)</label>
                        <input value={recipeUnit} onChange={(e) => setRecipeUnit(e.target.value)} placeholder="defaults to stock unit" className="w-full p-2.5 rounded-xl border text-sm outline-none" style={{ background: 'var(--paper-3)', borderColor: 'var(--line-2)' }} />
                      </div>
                    </div>
                    <button type="submit" className="btn btn-primary mt-1">Link Ingredient</button>
                  </form>
                </section>

                <section className="card p-5">
                  <h4 className="font-bold mb-3">Existing Recipes</h4>
                  {inventoryLoading && recipes.length === 0 ? (
                    <p className="text-sm">Loading…</p>
                  ) : recipes.length === 0 ? (
                    <p className="text-sm text-ink-3">No recipes yet. Link ingredients above — or run <span className="font-mono">activate:inventory</span> to seed them.</p>
                  ) : (
                    <div className="grid gap-3 sm:grid-cols-2">
                      {recipes.map((r) => (
                        <div key={r.itemId} className="p-3 rounded-xl" style={{ background: 'var(--paper-3)' }}>
                          <b className="block text-sm mb-2">{r.itemName}</b>
                          <div className="grid gap-1">
                            {r.lines.map((l: any) => (
                              <div key={l.id} className="flex items-center justify-between text-sm">
                                <span>{l.material}</span>
                                <div className="flex items-center gap-2">
                                  <span className="font-mono text-ink-2">{l.qty} {l.unit}</span>
                                  <button onClick={() => handleDeleteRecipe(l.id)} title="Remove" className="w-6 h-6 grid place-items-center rounded-lg text-xs" style={{ background: 'rgba(195,73,47,.12)', color: 'var(--clay)' }}>✕</button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              </div>
            )}

            {isAdvanced && activeSubTab === 'vendors' && (
              <section className="card p-5">
                <h4 className="font-bold mb-3">Vendor Management</h4>
                <div className="grid gap-2">
                  <div className="p-3 rounded-xl text-sm" style={{ background: 'var(--paper-3)' }}>
                    <b>Milk supplier</b> · Rating: 4.8 ★ · Contact: +91 9000100010
                  </div>
                  <div className="p-3 rounded-xl text-sm" style={{ background: 'var(--paper-3)' }}>
                    <b>Groceries vendor</b> · Rating: 4.5 ★ · Contact: +91 9000100020
                  </div>
                </div>
              </section>
            )}

            {isAdvanced && activeSubTab === 'autopo' && (
              <section className="card p-5">
                <h4 className="font-bold mb-3">Auto Purchase Orders</h4>
                <div className="p-4 rounded-xl" style={{ background: 'var(--paper-3)' }}>
                  <p className="text-sm">Auto replenishment is enabled. Draft purchase orders will automatically generate when items drop below reorder thresholds.</p>
                </div>
              </section>
            )}
          </div>
        )}

        {/* ── 3b. Suppliers & Credit View ── */}
        {activeMenu === 'suppliers' && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap gap-2 border-b" style={{ borderColor: 'var(--line)' }}>
              <button className={`pb-2 px-3 text-sm font-bold ${activeSubTab === 'ledger' ? 'border-b-2 border-turmeric text-ink' : 'text-ink-3'}`} onClick={() => setActiveSubTab('ledger')}>Ledger & Dues</button>
              <button className={`pb-2 px-3 text-sm font-bold ${activeSubTab === 'invoice' ? 'border-b-2 border-turmeric text-ink' : 'text-ink-3'}`} onClick={() => setActiveSubTab('invoice')}>New Invoice</button>
              <button className={`pb-2 px-3 text-sm font-bold ${activeSubTab === 'payment' ? 'border-b-2 border-turmeric text-ink' : 'text-ink-3'}`} onClick={() => setActiveSubTab('payment')}>Record Payment</button>
              <button className={`pb-2 px-3 text-sm font-bold ${activeSubTab === 'addvendor' ? 'border-b-2 border-turmeric text-ink' : 'text-ink-3'}`} onClick={() => setActiveSubTab('addvendor')}>Add Supplier</button>
            </div>

            {activeSubTab === 'ledger' && (
              <div className="flex flex-col gap-4">
                {/* summary */}
                <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
                  <KpiCard label="Total outstanding" value={formatINR(suppliers?.summary?.outstandingPaise ?? 0)} tone="gold" />
                  <KpiCard label="Paid (30 days)" value={formatINR(suppliers?.summary?.paid30Paise ?? 0)} tone="cardamom" />
                  <section className="card p-4">
                    <span className="block text-xs mb-2 text-ink-3">Overdue invoices</span>
                    <span className="block text-2xl md:text-3xl font-bold tnum font-mono" style={{ color: (suppliers?.summary?.overdueCount ?? 0) > 0 ? 'var(--clay)' : undefined }}>
                      {suppliers?.summary?.overdueCount ?? 0}
                    </span>
                    {(suppliers?.summary?.overduePaise ?? 0) > 0 && <span className="text-xs" style={{ color: 'var(--clay)' }}>{formatINR(suppliers.summary.overduePaise)} due</span>}
                  </section>
                </div>

                {/* vendor balances */}
                <section className="card p-5">
                  <h4 className="font-bold mb-3">Supplier Balances</h4>
                  {suppliersLoading ? (
                    <p className="text-sm">Loading…</p>
                  ) : !suppliers?.vendors?.length ? (
                    <p className="text-sm text-ink-3">No suppliers yet. Add one under “Add Supplier”.</p>
                  ) : (
                    <div className="grid gap-2">
                      {suppliers.vendors.map((v: any) => (
                        <button key={v.id} onClick={() => openStatement(v.id)} className="flex justify-between items-center text-sm p-3 rounded-xl text-left transition hover:-translate-y-0.5" style={{ background: 'var(--paper-3)' }}>
                          <div>
                            <span className="font-bold">{v.name}</span>
                            {v.phone && <span className="text-xs text-ink-3 ml-2">{v.phone}</span>}
                            <span className="block text-[11px] text-ink-3">Invoiced {formatINR(v.invoicedPaise)} · Paid {formatINR(v.paidPaise)}</span>
                          </div>
                          <div className="text-right">
                            <span className="font-mono font-bold" style={{ color: v.balancePaise > 0 ? 'var(--clay)' : 'var(--cardamom-d)' }}>{formatINR(v.balancePaise)}</span>
                            <span className="block text-[10px] text-ink-3 uppercase">{v.balancePaise > 0 ? 'payable' : 'settled'}</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </section>

                <div className="grid lg:grid-cols-2 gap-4">
                  {/* recent invoices */}
                  <section className="card p-5">
                    <h4 className="font-bold mb-3">Recent Invoices</h4>
                    {!suppliers?.invoices?.length ? (
                      <p className="text-sm text-ink-3">No invoices recorded yet.</p>
                    ) : (
                      <div className="grid gap-2">
                        {suppliers.invoices.map((inv: any) => (
                          <div key={inv.id} className="flex justify-between items-center text-sm p-3 rounded-xl" style={{ background: 'var(--paper-3)' }}>
                            <div>
                              <span className="font-bold">{inv.vendorName}</span>
                              <span className="block text-[11px] text-ink-3">{inv.invoiceNo ? `#${inv.invoiceNo} · ` : ''}{new Date(inv.at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}{inv.dueDate ? ` · due ${new Date(inv.dueDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}` : ''}</span>
                            </div>
                            <div className="text-right">
                              <span className="font-mono">{formatINR(inv.totalPaise)}</span>
                              <span className="block text-[10px] font-bold uppercase" style={{ color: inv.overdue ? 'var(--clay)' : inv.payStatus === 'paid' ? 'var(--cardamom-d)' : 'var(--turmeric-d)' }}>
                                {inv.overdue ? 'overdue' : inv.payStatus}{inv.balancePaise > 0 ? ` · ${formatINR(inv.balancePaise)} left` : ''}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </section>

                  {/* recent payments */}
                  <section className="card p-5">
                    <h4 className="font-bold mb-3">Recent Payments</h4>
                    {!suppliers?.payments?.length ? (
                      <p className="text-sm text-ink-3">No payments recorded yet.</p>
                    ) : (
                      <div className="grid gap-2">
                        {suppliers.payments.map((p: any) => (
                          <div key={p.id} className="flex justify-between items-center text-sm p-3 rounded-xl" style={{ background: 'var(--paper-3)' }}>
                            <div>
                              <span className="font-bold">{p.vendorName}</span>
                              <span className="block text-[11px] text-ink-3 capitalize">{p.method}{p.reference ? ` · ${p.reference}` : ''} · {new Date(p.at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</span>
                            </div>
                            <span className="font-mono" style={{ color: 'var(--cardamom-d)' }}>− {formatINR(p.amountPaise)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </section>
                </div>
              </div>
            )}

            {activeSubTab === 'invoice' && (
              <section className="card p-5 max-w-md">
                <h4 className="font-bold mb-3">Record Purchase Invoice</h4>
                <form onSubmit={handleAddInvoice} className="grid gap-3">
                  <div>
                    <label className="block text-xs font-bold mb-1">Supplier</label>
                    <select value={invVendorId} onChange={(e) => setInvVendorId(e.target.value)} required className="w-full p-2.5 rounded-xl border text-sm outline-none" style={{ background: 'var(--paper-3)', borderColor: 'var(--line-2)' }}>
                      <option value="">-- Choose Supplier --</option>
                      {(suppliers?.vendors ?? []).map((v: any) => <option key={v.id} value={v.id}>{v.name}</option>)}
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold mb-1">Invoice No.</label>
                      <input value={invNo} onChange={(e) => setInvNo(e.target.value)} placeholder="INV-001" className="w-full p-2.5 rounded-xl border text-sm outline-none" style={{ background: 'var(--paper-3)', borderColor: 'var(--line-2)' }} />
                    </div>
                    <div>
                      <label className="block text-xs font-bold mb-1">Total (₹)</label>
                      <input type="number" step="0.01" value={invTotal} onChange={(e) => setInvTotal(e.target.value)} placeholder="1000" required className="w-full p-2.5 rounded-xl border text-sm outline-none" style={{ background: 'var(--paper-3)', borderColor: 'var(--line-2)' }} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold mb-1">Invoice date</label>
                      <input type="date" value={invDate} onChange={(e) => setInvDate(e.target.value)} className="w-full p-2.5 rounded-xl border text-sm outline-none" style={{ background: 'var(--paper-3)', borderColor: 'var(--line-2)' }} />
                    </div>
                    <div>
                      <label className="block text-xs font-bold mb-1">Due date</label>
                      <input type="date" value={invDue} onChange={(e) => setInvDue(e.target.value)} className="w-full p-2.5 rounded-xl border text-sm outline-none" style={{ background: 'var(--paper-3)', borderColor: 'var(--line-2)' }} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold mb-1">Paid now (₹)</label>
                      <input type="number" step="0.01" value={invPaidNow} onChange={(e) => setInvPaidNow(e.target.value)} placeholder="0" className="w-full p-2.5 rounded-xl border text-sm outline-none" style={{ background: 'var(--paper-3)', borderColor: 'var(--line-2)' }} />
                    </div>
                    <div>
                      <label className="block text-xs font-bold mb-1">Pay method</label>
                      <select value={invMethod} onChange={(e) => setInvMethod(e.target.value)} className="w-full p-2.5 rounded-xl border text-sm outline-none" style={{ background: 'var(--paper-3)', borderColor: 'var(--line-2)' }}>
                        {['cash', 'upi', 'bank', 'card', 'cheque'].map((m) => <option key={m} value={m}>{m}</option>)}
                      </select>
                    </div>
                  </div>
                  <p className="text-[11px] text-ink-3">Leave “Paid now” at 0 to record a full-credit purchase. The unpaid balance shows up under Ledger & Dues.</p>
                  <button type="submit" className="btn btn-primary mt-1">Save Invoice</button>
                </form>
              </section>
            )}

            {activeSubTab === 'payment' && (
              <section className="card p-5 max-w-md">
                <h4 className="font-bold mb-3">Record Payment to Supplier</h4>
                <form onSubmit={handleAddPayment} className="grid gap-3">
                  <div>
                    <label className="block text-xs font-bold mb-1">Supplier</label>
                    <select value={payVendorId} onChange={(e) => setPayVendorId(e.target.value)} required className="w-full p-2.5 rounded-xl border text-sm outline-none" style={{ background: 'var(--paper-3)', borderColor: 'var(--line-2)' }}>
                      <option value="">-- Choose Supplier --</option>
                      {(suppliers?.vendors ?? []).map((v: any) => <option key={v.id} value={v.id}>{v.name} · {formatINR(v.balancePaise)} due</option>)}
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold mb-1">Amount (₹)</label>
                      <input type="number" step="0.01" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} placeholder="500" required className="w-full p-2.5 rounded-xl border text-sm outline-none" style={{ background: 'var(--paper-3)', borderColor: 'var(--line-2)' }} />
                    </div>
                    <div>
                      <label className="block text-xs font-bold mb-1">Method</label>
                      <select value={payMethod} onChange={(e) => setPayMethod(e.target.value)} className="w-full p-2.5 rounded-xl border text-sm outline-none" style={{ background: 'var(--paper-3)', borderColor: 'var(--line-2)' }}>
                        {['cash', 'upi', 'bank', 'card', 'cheque'].map((m) => <option key={m} value={m}>{m}</option>)}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-bold mb-1">Reference (txn / cheque no.)</label>
                    <input value={payRef} onChange={(e) => setPayRef(e.target.value)} placeholder="optional" className="w-full p-2.5 rounded-xl border text-sm outline-none" style={{ background: 'var(--paper-3)', borderColor: 'var(--line-2)' }} />
                  </div>
                  <button type="submit" className="btn btn-primary mt-1">Save Payment</button>
                </form>
              </section>
            )}

            {activeSubTab === 'addvendor' && (
              <section className="card p-5 max-w-md">
                <h4 className="font-bold mb-3">Add Supplier</h4>
                <form onSubmit={handleAddVendor} className="grid gap-3">
                  <div>
                    <label className="block text-xs font-bold mb-1">Supplier name</label>
                    <input value={vName} onChange={(e) => setVName(e.target.value)} placeholder="e.g. Friends Vegetables" required className="w-full p-2.5 rounded-xl border text-sm outline-none" style={{ background: 'var(--paper-3)', borderColor: 'var(--line-2)' }} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold mb-1">Phone</label>
                      <input value={vPhone} onChange={(e) => setVPhone(e.target.value)} placeholder="+91…" className="w-full p-2.5 rounded-xl border text-sm outline-none" style={{ background: 'var(--paper-3)', borderColor: 'var(--line-2)' }} />
                    </div>
                    <div>
                      <label className="block text-xs font-bold mb-1">GSTIN</label>
                      <input value={vGstin} onChange={(e) => setVGstin(e.target.value)} placeholder="optional" className="w-full p-2.5 rounded-xl border text-sm outline-none" style={{ background: 'var(--paper-3)', borderColor: 'var(--line-2)' }} />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-bold mb-1">Opening balance owed (₹)</label>
                    <input type="number" step="0.01" value={vOpening} onChange={(e) => setVOpening(e.target.value)} placeholder="0" className="w-full p-2.5 rounded-xl border text-sm outline-none" style={{ background: 'var(--paper-3)', borderColor: 'var(--line-2)' }} />
                    <p className="text-[11px] text-ink-3 mt-1">Existing dues carried over when onboarding this supplier.</p>
                  </div>
                  <button type="submit" className="btn btn-primary mt-1">Add Supplier</button>
                </form>
              </section>
            )}
          </div>
        )}

        {/* ── 3c. Tables: occupancy & revenue ── */}
        {activeMenu === 'tables' && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap gap-2 border-b" style={{ borderColor: 'var(--line)' }}>
              <button className={`pb-2 px-3 text-sm font-bold ${activeSubTab === 'floor' ? 'border-b-2 border-turmeric text-ink' : 'text-ink-3'}`} onClick={() => setActiveSubTab('floor')}>Live Floor</button>
              <button className={`pb-2 px-3 text-sm font-bold ${activeSubTab === 'profit' ? 'border-b-2 border-turmeric text-ink' : 'text-ink-3'}`} onClick={() => setActiveSubTab('profit')}>Profitability</button>
              <button className={`pb-2 px-3 text-sm font-bold ${activeSubTab === 'peak' ? 'border-b-2 border-turmeric text-ink' : 'text-ink-3'}`} onClick={() => setActiveSubTab('peak')}>Peak Hours</button>
              <button className={`pb-2 px-3 text-sm font-bold ${activeSubTab === 'tcfg' ? 'border-b-2 border-turmeric text-ink' : 'text-ink-3'}`} onClick={() => setActiveSubTab('tcfg')}>Alert Settings</button>
            </div>

            {/* KPI row (shared) */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <section className="card p-4">
                <span className="block text-xs mb-2 text-ink-3">Occupied now</span>
                <span className="block text-2xl md:text-3xl font-bold tnum font-mono">{tablesData?.totals?.occupied ?? 0}<span className="text-base text-ink-3"> / {tablesData?.totals?.tables ?? 0}</span></span>
                {(tablesData?.totals?.lowRevenueCount ?? 0) > 0 && <span className="text-xs font-bold" style={{ color: 'var(--clay)' }}>{tablesData.totals.lowRevenueCount} low-revenue ⚠</span>}
              </section>
              <KpiCard label="Avg stay (visit)" value={`${tablesData?.totals?.avgStayMin ?? 0} min`} />
              <KpiCard label="Avg spend / visit" value={formatINR(tablesData?.totals?.avgSpendPaise ?? 0)} tone="cardamom" />
              <KpiCard label="Revenue / occupied hr" value={formatINR(tablesData?.totals?.revenuePerOccupiedHourPaise ?? 0)} tone="gold" />
            </div>

            {activeSubTab === 'floor' && (() => {
              const occMap = new Map<string, any>((tablesData?.occupancy ?? []).map((o: any) => [o.id, o]));
              const STATUS = {
                free: { label: 'Free', color: '#34C759' },
                occupied: { label: 'Occupied', color: '#3B82F6' },
                long: { label: 'Long stay', color: '#E8A22B' },
                low: { label: 'Low revenue', color: '#C3492F' },
              };
              const minutes = tablesData?.config?.minutes ?? 90;
              const statusOf = (id: string): keyof typeof STATUS => {
                const o = occMap.get(id);
                if (!o) return 'free';
                if (o.lowRevenue) return 'low';
                if (o.durationMin >= minutes) return 'long';
                return 'occupied';
              };
              const roster = tablesData?.roster ?? [];
              const floorList = tablesData?.floors ?? [];
              // group tables under their floor (mirrors the POS floor map); a missing/stale floorId falls under "Unassigned"
              const floorIds = new Set(floorList.map((f: any) => f.id));
              const groups: { key: string; name: string; tables: any[] }[] = [
                ...floorList.map((f: any) => ({ key: f.id, name: f.name, tables: roster.filter((t: any) => t.floorId === f.id) })),
                { key: 'unassigned', name: 'Unassigned', tables: roster.filter((t: any) => !t.floorId || !floorIds.has(t.floorId)) },
              ].filter((g) => g.tables.length > 0);
              const renderTile = (t: any) => {
                const st = statusOf(t.id);
                const s = STATUS[st];
                const o = occMap.get(t.id);
                return (
                  <div key={t.id} className="rounded-xl border p-3 flex flex-col gap-1" style={{ background: `color-mix(in srgb, ${s.color} 8%, var(--paper-3))`, borderColor: s.color, borderTopWidth: 3, borderTopColor: s.color }}>
                    <div className="flex items-center justify-between">
                      <span className="font-display font-bold text-lg">{t.label}</span>
                      <span className="w-2.5 h-2.5 rounded-full" style={{ background: s.color }} />
                    </div>
                    <span className="text-[10px] font-extrabold uppercase tracking-wide" style={{ color: s.color }}>{s.label}</span>
                    {o ? (
                      <div className="text-[11px] mt-0.5" style={{ color: 'var(--ink-3)' }}>
                        <div className="flex justify-between"><span>{o.durationMin} min</span><span className="font-mono">{formatINR(o.billPaise)}</span></div>
                        <span>{o.orders} order{o.orders > 1 ? 's' : ''}</span>
                      </div>
                    ) : (
                      <span className="text-[11px] mt-0.5" style={{ color: 'var(--ink-3)' }}>{'•'.repeat(t.seats)} · open</span>
                    )}
                  </div>
                );
              };
              return (
                <section className="card p-5">
                  <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                    <h4 className="font-bold">Live Floor</h4>
                    {/* top status legend */}
                    <div className="flex flex-wrap gap-3">
                      {Object.entries(STATUS).map(([k, s]) => (
                        <span key={k} className="inline-flex items-center gap-1.5 text-xs font-bold" style={{ color: 'var(--ink-2)' }}>
                          <span className="w-2.5 h-2.5 rounded-full" style={{ background: s.color }} />{s.label}
                        </span>
                      ))}
                    </div>
                  </div>
                  {tablesLoading && !tablesData ? (
                    <p className="text-sm">Loading…</p>
                  ) : roster.length === 0 ? (
                    <p className="text-sm text-ink-3">No tables configured yet.</p>
                  ) : (
                    <div className="flex flex-col gap-5">
                      {groups.map((g) => (
                        <div key={g.key}>
                          {floorList.length > 0 && (
                            <div className="flex items-center gap-2 mb-2">
                              <span className="text-xs font-extrabold uppercase tracking-wide" style={{ color: 'var(--ink-3)' }}>{g.name}</span>
                              <span className="text-[11px]" style={{ color: 'var(--ink-3)' }}>· {g.tables.length} table{g.tables.length > 1 ? 's' : ''}</span>
                            </div>
                          )}
                          <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))' }}>
                            {g.tables.map(renderTile)}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              );
            })()}

            {activeSubTab === 'profit' && (
              <section className="card p-5">
                <h4 className="font-bold mb-1">Table Profitability</h4>
                <p className="text-xs text-ink-3 mb-3">Revenue per table over the last 30 days — most profitable at the top.</p>
                {!tablesData?.profitability?.length ? (
                  <p className="text-sm text-ink-3">No table revenue yet.</p>
                ) : (() => {
                  const maxRev = Math.max(1, ...tablesData.profitability.map((p: any) => p.revenuePaise));
                  return (
                    <div className="grid gap-2">
                      {tablesData.profitability.map((p: any, idx: number) => {
                        const last = idx === tablesData.profitability.length - 1;
                        return (
                          <div key={p.id} className="text-sm p-3 rounded-xl" style={{ background: 'var(--paper-3)' }}>
                            <div className="flex justify-between items-center mb-1.5">
                              <span className="font-bold">{p.label}
                                {idx === 0 && p.revenuePaise > 0 && <span className="ml-2 text-[10px] font-extrabold uppercase" style={{ color: 'var(--cardamom-d)' }}>★ top</span>}
                                {last && p.revenuePaise === 0 && <span className="ml-2 text-[10px] font-extrabold uppercase" style={{ color: 'var(--clay)' }}>idle</span>}
                              </span>
                              <span className="font-mono font-bold">{formatINR(p.revenuePaise)}</span>
                            </div>
                            <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--line)' }}>
                              <div style={{ width: `${Math.round((p.revenuePaise / maxRev) * 100)}%`, height: '100%', background: 'var(--turmeric)' }} />
                            </div>
                            <div className="flex justify-between text-[11px] mt-1" style={{ color: 'var(--ink-3)' }}>
                              <span>{p.orders} orders</span><span>avg {p.avgStayMin} min</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </section>
            )}

            {activeSubTab === 'peak' && (
              <div className="flex flex-col gap-4">
                <section className="card p-5">
                  <h4 className="font-bold mb-3">Peak Hours (revenue, 30 days)</h4>
                  {!tablesData?.peakHours?.length ? (
                    <p className="text-sm text-ink-3">Not enough data yet.</p>
                  ) : (() => {
                    const maxRev = Math.max(1, ...tablesData.peakHours.map((h: any) => h.revenuePaise));
                    return (
                      <div className="flex items-end gap-1.5 h-40">
                        {tablesData.peakHours.map((h: any) => (
                          <div key={h.hour} className="flex-1 flex flex-col items-center gap-1 justify-end" title={`${h.hour}:00 · ${formatINR(h.revenuePaise)}`}>
                            <div className="w-full rounded-t" style={{ height: `${Math.max(2, Math.round((h.revenuePaise / maxRev) * 130))}px`, background: 'var(--turmeric)' }} />
                            <span className="text-[9px]" style={{ color: 'var(--ink-3)' }}>{h.hour}</span>
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                </section>

                <section className="card p-5 overflow-x-auto">
                  <h4 className="font-bold mb-3">Revenue Heatmap (day × hour)</h4>
                  {!tablesData?.heatmap?.length ? (
                    <p className="text-sm text-ink-3">Not enough data yet.</p>
                  ) : (() => {
                    const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
                    const hours = Array.from(new Set(tablesData.heatmap.map((c: any) => c.hour))).sort((a: any, b: any) => a - b) as number[];
                    const cell = new Map<string, number>();
                    let maxRev = 1;
                    for (const c of tablesData.heatmap) { cell.set(`${c.dow}-${c.hour}`, c.revenuePaise); maxRev = Math.max(maxRev, c.revenuePaise); }
                    return (
                      <table className="text-[10px]" style={{ borderCollapse: 'separate', borderSpacing: 2 }}>
                        <thead>
                          <tr><th></th>{hours.map((h) => <th key={h} className="font-bold text-ink-3 px-1">{h}</th>)}</tr>
                        </thead>
                        <tbody>
                          {DOW.map((d, dow) => (
                            <tr key={d}>
                              <td className="font-bold text-ink-3 pr-2">{d}</td>
                              {hours.map((h) => {
                                const rev = cell.get(`${dow}-${h}`) ?? 0;
                                const intensity = rev / maxRev;
                                return <td key={h} title={rev ? formatINR(rev) : ''} style={{ width: 22, height: 20, borderRadius: 4, background: rev ? `color-mix(in srgb, var(--turmeric) ${Math.round(15 + intensity * 85)}%, var(--paper-3))` : 'var(--paper-3)' }} />;
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    );
                  })()}
                </section>
              </div>
            )}

            {activeSubTab === 'tcfg' && (
              <section className="card p-5 max-w-md">
                <h4 className="font-bold mb-1">Low-Revenue Occupancy Alert</h4>
                <p className="text-xs text-ink-3 mb-3">Flag a table when it has been occupied beyond this many minutes while the bill is still under the amount below.</p>
                <form onSubmit={handleSaveTableConfig} className="grid gap-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold mb-1">Occupied over (minutes)</label>
                      <input type="number" value={cfgMinutes} onChange={(e) => setCfgMinutes(e.target.value)} placeholder="90" className="w-full p-2.5 rounded-xl border text-sm outline-none" style={{ background: 'var(--paper-3)', borderColor: 'var(--line-2)' }} />
                    </div>
                    <div>
                      <label className="block text-xs font-bold mb-1">Bill under (₹)</label>
                      <input type="number" value={cfgMinBill} onChange={(e) => setCfgMinBill(e.target.value)} placeholder="500" className="w-full p-2.5 rounded-xl border text-sm outline-none" style={{ background: 'var(--paper-3)', borderColor: 'var(--line-2)' }} />
                    </div>
                  </div>
                  <button type="submit" className="btn btn-primary mt-1">Save thresholds</button>
                </form>
              </section>
            )}
          </div>
        )}

        {/* ── 4. Reports View ── */}
        {activeMenu === 'reports' && (
          <div className="flex flex-col gap-4">
            {/* Tabs */}
            <div className="flex gap-2 border-b" style={{ borderColor: 'var(--line)' }}>
              <button className={`pb-2 px-3 text-sm font-bold ${activeSubTab === 'daily' ? 'border-b-2 border-turmeric text-ink' : 'text-ink-3'}`} onClick={() => setActiveSubTab('daily')}>Daily Sales</button>
              <button className={`pb-2 px-3 text-sm font-bold ${activeSubTab === 'best' ? 'border-b-2 border-turmeric text-ink' : 'text-ink-3'}`} onClick={() => setActiveSubTab('best')}>Top Items</button>
              <button className={`pb-2 px-3 text-sm font-bold ${activeSubTab === 'gst' ? 'border-b-2 border-turmeric text-ink' : 'text-ink-3'}`} onClick={() => setActiveSubTab('gst')}>GST Report</button>
              {isAdvanced && (
                <>
                  <button className={`pb-2 px-3 text-sm font-bold ${activeSubTab === 'analytics' ? 'border-b-2 border-turmeric text-ink' : 'text-ink-3'}`} onClick={() => setActiveSubTab('analytics')}>Advanced Analytics 📊</button>
                  <button className={`pb-2 px-3 text-sm font-bold ${activeSubTab === 'forecast' ? 'border-b-2 border-turmeric text-ink' : 'text-ink-3'}`} onClick={() => setActiveSubTab('forecast')}>Demand Forecast</button>
                </>
              )}
            </div>

            {activeSubTab === 'daily' && (
              <section className="card p-5">
                <h4 className="font-bold mb-3">Daily Sales Ledger</h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm border-collapse text-left">
                    <thead>
                      <tr className="border-b" style={{ borderColor: 'var(--line)' }}>
                        <th className="pb-2">Date</th>
                        <th className="pb-2">Orders</th>
                        <th className="pb-2">Revenue</th>
                        <th className="pb-2">Discount</th>
                        <th className="pb-2">Tax</th>
                      </tr>
                    </thead>
                    <tbody>
                      {trend.map((t, idx) => (
                        <tr key={idx} className="border-b" style={{ borderColor: 'var(--line-2)' }}>
                          <td className="py-2">{t.date} ({t.label})</td>
                          <td className="py-2 font-mono">{t.orders}</td>
                          <td className="py-2 font-mono">{formatINR(t.grossPaise)}</td>
                          <td className="py-2 font-mono">{formatINR(0)}</td>
                          <td className="py-2 font-mono">{formatINR(Math.round(t.grossPaise * 0.05))}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            {activeSubTab === 'best' && (
              <section className="card p-5">
                <h4 className="font-bold mb-3">Top Selling Products</h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm border-collapse text-left">
                    <thead>
                      <tr className="border-b" style={{ borderColor: 'var(--line)' }}>
                        <th className="pb-2">Product Name</th>
                        <th className="pb-2">Quantity Sold</th>
                        <th className="pb-2">Gross Revenue</th>
                      </tr>
                    </thead>
                    <tbody>
                      {topItems.map((item, idx) => (
                        <tr key={idx} className="border-b" style={{ borderColor: 'var(--line-2)' }}>
                          <td className="py-2 font-bold">{item.name}</td>
                          <td className="py-2 font-mono">{item.qty}</td>
                          <td className="py-2 font-mono">{formatINR(item.revenuePaise)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            {activeSubTab === 'gst' && (
              <div className="flex flex-col gap-4">
                {!salesGst ? (
                  <section className="card p-5"><p className="text-sm text-ink-3">Loading GST summary…</p></section>
                ) : (
                  <>
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                      <section className="card p-4">
                        <span className="block text-xs mb-2" style={{ color: 'var(--ink-3)' }}>Tax collected · 30d</span>
                        <span className="block text-2xl font-bold font-mono">{formatINR(salesGst.gst.taxCollectedPaise)}</span>
                      </section>
                      <section className="card p-4">
                        <span className="block text-xs mb-2" style={{ color: 'var(--ink-3)' }}>Taxable sales</span>
                        <span className="block text-2xl font-bold font-mono">{formatINR(salesGst.gst.taxableSalesPaise)}</span>
                      </section>
                      <section className="card p-4">
                        <span className="block text-xs mb-2" style={{ color: 'var(--ink-3)' }}>Non-taxable sales</span>
                        <span className="block text-2xl font-bold font-mono">{formatINR(salesGst.gst.nonTaxableSalesPaise)}</span>
                      </section>
                      <section className="card p-4">
                        <span className="block text-xs mb-2" style={{ color: 'var(--ink-3)' }}>Net tax rate</span>
                        <span className="block text-2xl font-bold font-mono">
                          {salesGst.gst.taxableSalesPaise > 0 ? `${((salesGst.gst.taxCollectedPaise / salesGst.gst.taxableSalesPaise) * 100).toFixed(1)}%` : '—'}
                        </span>
                      </section>
                    </div>

                    <section className="card p-5">
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="font-bold">GST by rate</h4>
                        <span className="text-xs text-ink-3">last 30 days · by item slab</span>
                      </div>
                      {salesGst.gst.byRate.length === 0 ? (
                        <p className="text-sm text-ink-3 py-4 text-center">No sales in this window yet.</p>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm border-collapse text-left">
                            <thead>
                              <tr className="border-b" style={{ borderColor: 'var(--line)' }}>
                                <th className="pb-2">GST slab</th>
                                <th className="pb-2 text-right">Revenue</th>
                                <th className="pb-2 text-right">Est. tax</th>
                              </tr>
                            </thead>
                            <tbody>
                              {salesGst.gst.byRate.map((r: any) => (
                                <tr key={r.rate} className="border-b" style={{ borderColor: 'var(--line-2)' }}>
                                  <td className="py-2 font-bold">{r.rate === 0 ? 'Tax-free (0%)' : `${r.rate}%`}</td>
                                  <td className="py-2 font-mono text-right">{formatINR(r.revenuePaise)}</td>
                                  <td className="py-2 font-mono text-right">{r.rate === 0 ? '—' : formatINR(r.estTaxPaise)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                      <p className="text-[11px] mt-3" style={{ color: 'var(--ink-3)' }}>
                        “Tax collected” above is the exact amount billed (CGST+SGST+IGST). “Est. tax” per slab is a revenue×rate estimate for reconciliation.
                      </p>
                    </section>
                  </>
                )}
              </div>
            )}

            {isAdvanced && activeSubTab === 'analytics' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* 7-day trend bar chart */}
                <section className="card p-5">
                  <h4 className="font-bold mb-3">7-Day Sales Trend</h4>
                  <div className="flex items-end justify-between gap-2 h-40 mt-6">
                    {trend.map((t, i) => (
                      <div key={i} className="flex-1 flex flex-col items-center justify-end h-full gap-1.5">
                        <div
                          className="w-full max-w-[28px] rounded-t-md relative"
                          style={{ height: `${(t.orders / Math.max(...trend.map((x) => x.orders), 1)) * 100}%`, minHeight: t.orders > 0 ? 6 : 2, background: 'var(--turmeric)' }}
                        />
                        <span className="text-[10px]">{t.label}</span>
                      </div>
                    ))}
                  </div>
                </section>

                {/* hour-of-day heatmap */}
                <section className="card p-5">
                  <h4 className="font-bold mb-3">Hour-of-day Heatmap</h4>
                  <div className="grid grid-cols-24 gap-0.5 h-10 mt-6">
                    {hourly.map((v, idx) => (
                      <div
                        key={idx}
                        className="h-full rounded-sm"
                        style={{ background: v > 0 ? `rgba(232,144,42, ${v / Math.max(...hourly, 1)})` : 'var(--paper-3)', border: '1px solid var(--line-2)' }}
                        title={`${v} orders`}
                      />
                    ))}
                  </div>
                  <div className="flex justify-between mt-2 text-[10px]" style={{ color: 'var(--ink-3)' }}>
                    <span>12a</span><span>6a</span><span>12p</span><span>6p</span><span>11p</span>
                  </div>
                </section>

                {/* menu engineering quadrant */}
                <section className="card p-5 md:col-span-2">
                  <h4 className="font-bold mb-3">Menu Engineering Quadrant</h4>
                  <div className="relative h-48 border rounded-xl mt-2" style={{ background: 'var(--paper-3)' }}>
                    {menuQuadrant.map((d) => (
                      <span
                        key={d.itemId}
                        className="absolute w-2.5 h-2.5 rounded-full ring-2 ring-white"
                        style={{ left: `${d.pop}%`, bottom: `${d.profit}%`, background: d.quad === 'star' ? 'var(--cardamom)' : 'var(--turmeric)' }}
                        title={d.name}
                      />
                    ))}
                    <div className="absolute top-1 left-2 text-[10px] text-ink-3">High Margin / Low Vol (Puzzles)</div>
                    <div className="absolute top-1 right-2 text-[10px] text-cardamom-d">High Margin / High Vol (Stars)</div>
                  </div>
                </section>
              </div>
            )}

            {isAdvanced && activeSubTab === 'forecast' && (
              <section className="card p-5">
                <h4 className="font-bold mb-3">AI Demand Forecasting</h4>
                <div className="p-4 rounded-xl" style={{ background: 'var(--paper-3)' }}>
                  <p className="text-sm">Based on recent sales ledger trends, Milk is expected to reach critical levels in <b>2 days</b>. Suggest raising PO today.</p>
                </div>
              </section>
            )}
          </div>
        )}

        {/* ── 5. Settings View (also hosts the top-level Menu Items page) ── */}
        {(activeMenu === 'settings' || activeMenu === 'menu') && (
          <div className="flex flex-col gap-4">
            {/* Settings nav cards — only on the Settings page; the Menu Items page renders bare */}
            {activeMenu === 'settings' && (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {([
                { key: 'general', icon: '⚙️', label: 'General', sub: 'Store profile & mode' },
                { key: 'tax', icon: '🧾', label: 'Tax & GST', sub: 'GST toggle, rate & type' },
                { key: 'floor', icon: '🍽️', label: 'Floor & QR', sub: 'Tables & scan-to-order' },
                { key: 'pwa', icon: '📱', label: 'PWA Settings', sub: 'Customer app & loyalty' },
                { key: 'devices', icon: '🖨️', label: 'Devices & Printers', sub: 'Receipt, KOT & more' },
                ...(staff.role === 'owner' ? [{ key: 'audit', icon: '📜', label: 'Audit Logs', sub: 'Activity & changes' }] : []),
                ...(isAdvanced ? [{ key: 'multibranch', icon: '🏢', label: 'Multi Branch', sub: 'Other outlets' }] : []),
              ] as { key: 'general' | 'tax' | 'floor' | 'devices' | 'pwa' | 'audit' | 'multibranch'; icon: string; label: string; sub: string }[]).map((t) => {
                const on = settingsPanel === t.key;
                return (
                  <button
                    key={t.key}
                    onClick={() => setSettingsPanel(t.key)}
                    className="flex items-center gap-3 px-4 py-3 rounded-2xl text-left transition border"
                    style={on
                      ? { background: 'var(--turmeric)', color: '#2A1607', borderColor: 'transparent' }
                      : { background: 'var(--paper-2)', borderColor: 'var(--line)' }}
                  >
                    <span className="text-xl shrink-0">{t.icon}</span>
                    <span className="leading-tight min-w-0">
                      <b className="block text-sm truncate">{t.label}</b>
                      <span className="text-xs block truncate" style={{ color: on ? '#5a3a14' : 'var(--ink-3)' }}>{t.sub}</span>
                    </span>
                  </button>
                );
              })}
              <button
                onClick={() => { setActiveMenu('reports'); setActiveSubTab('daily'); }}
                className="flex items-center gap-3 px-4 py-3 rounded-2xl text-left transition border"
                style={{ background: 'var(--paper-2)', borderColor: 'var(--line)' }}
              >
                <span className="text-xl shrink-0">📊</span>
                <span className="leading-tight min-w-0">
                  <b className="block text-sm truncate">Reports</b>
                  <span className="text-xs block truncate" style={{ color: 'var(--ink-3)' }}>Sales & analytics ↗</span>
                </span>
              </button>
            </div>
            )}

            {activeMenu === 'settings' && settingsPanel === 'general' && (
              <section className="card p-5 max-w-md flex flex-col gap-4">
                {/* Advanced Mode toggle switch */}
                <div className="flex justify-between items-center p-3 rounded-xl border" style={{ borderColor: 'var(--line)' }}>
                  <div>
                    <h4 className="font-bold text-sm">Advanced Mode</h4>
                    <p className="text-xs text-ink-3">Enable recipes, vendors, forecasting, and deep stats.</p>
                  </div>
                  <button
                    onClick={() => handleToggleAdvanced(!isAdvanced)}
                    className="btn py-2 px-4"
                    style={{ background: isAdvanced ? 'var(--turmeric)' : 'var(--paper-3)', color: isAdvanced ? '#2A1607' : 'var(--ink)' }}
                  >
                    {isAdvanced ? 'ON' : 'OFF'}
                  </button>
                </div>

                {/* Store Profile — editable */}
                <form onSubmit={handleSaveProfile}>
                  <h4 className="font-bold mb-3">Store Profile</h4>
                  <div className="grid gap-3">
                    <div>
                      <label className="block text-xs font-bold mb-1">Outlet Name</label>
                      <input value={profile.name} onChange={(e) => setProfile((p) => ({ ...p, name: e.target.value }))} required className="w-full p-2.5 rounded-xl border text-sm outline-none" style={{ background: 'var(--paper-3)', borderColor: 'var(--line-2)' }} />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-bold mb-1">GSTIN</label>
                        <input value={profile.gstin} onChange={(e) => setProfile((p) => ({ ...p, gstin: e.target.value }))} placeholder="None" className="w-full p-2.5 rounded-xl border text-sm outline-none" style={{ background: 'var(--paper-3)', borderColor: 'var(--line-2)' }} />
                      </div>
                      <div>
                        <label className="block text-xs font-bold mb-1">State Code</label>
                        <input value={profile.stateCode} onChange={(e) => setProfile((p) => ({ ...p, stateCode: e.target.value }))} placeholder="KA" maxLength={2} className="w-full p-2.5 rounded-xl border text-sm outline-none uppercase" style={{ background: 'var(--paper-3)', borderColor: 'var(--line-2)' }} />
                      </div>
                    </div>

                    {/* GST now lives in its own Tax & GST panel */}
                    <button type="button" onClick={() => setSettingsPanel('tax')} className="rounded-xl border p-3 text-left flex items-center justify-between gap-3 hover:brightness-105 transition" style={{ borderColor: 'var(--line)', background: 'var(--paper-3)' }}>
                      <span>
                        <span className="block text-sm font-bold">Tax &amp; GST</span>
                        <span className="block text-xs" style={{ color: 'var(--ink-3)' }}>{profile.gstEnabled ? `GST on · ${profile.gstType === 'inclusive' ? 'inclusive' : 'exclusive'}${profile.gstRate ? ` · ${profile.gstRate}%` : ' · per-item'}` : 'GST off — bills are tax-free'}</span>
                      </span>
                      <span className="text-ink-3">Manage →</span>
                    </button>

                    <div>
                      <label className="block text-xs font-bold mb-1">Address</label>
                      <input value={profile.line1} onChange={(e) => setProfile((p) => ({ ...p, line1: e.target.value }))} placeholder="Street / area" className="w-full p-2.5 rounded-xl border text-sm outline-none mb-2" style={{ background: 'var(--paper-3)', borderColor: 'var(--line-2)' }} />
                      <div className="grid grid-cols-2 gap-3">
                        <input value={profile.city} onChange={(e) => setProfile((p) => ({ ...p, city: e.target.value }))} placeholder="City" className="w-full p-2.5 rounded-xl border text-sm outline-none" style={{ background: 'var(--paper-3)', borderColor: 'var(--line-2)' }} />
                        <input value={profile.pincode} onChange={(e) => setProfile((p) => ({ ...p, pincode: e.target.value }))} placeholder="Pincode" className="w-full p-2.5 rounded-xl border text-sm outline-none" style={{ background: 'var(--paper-3)', borderColor: 'var(--line-2)' }} />
                      </div>
                    </div>
                    <button type="submit" className="btn btn-primary mt-1 w-fit">Save profile</button>
                  </div>
                </form>
              </section>
            )}

            {activeMenu === 'menu' && (() => {
              const q = menuSearch.trim().toLowerCase();
              // search + category filter
              const filtered = menuItems.filter((m) => {
                if (q && !m.name.toLowerCase().includes(q)) return false;
                if (menuCatFilter === 'all') return true;
                if (menuCatFilter === 'none') return !m.categoryId;
                return m.categoryId === menuCatFilter;
              });
              // only offer the "Uncategorised" chip when such items exist
              const hasUncategorised = menuItems.some((m) => !m.categoryId);
              // group the filtered items by category, following the category sort order
              const groups: { id: string; name: string; items: any[] }[] = [];
              for (const c of menuCategories) {
                const items = filtered.filter((m) => m.categoryId === c.id);
                if (items.length) groups.push({ id: c.id, name: c.name, items });
              }
              const loose = filtered.filter((m) => !m.categoryId);
              if (loose.length) groups.push({ id: 'none', name: 'Uncategorised', items: loose });
              return (
              <section className="card p-5">
                <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                  <h4 className="font-bold">Menu Management</h4>
                  <div className="flex items-center gap-2">
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm" style={{ color: 'var(--ink-3)' }}>🔍</span>
                      <input
                        value={menuSearch}
                        onChange={(e) => setMenuSearch(e.target.value)}
                        placeholder="Search items…"
                        className="pl-8 pr-3 py-2 rounded-xl border text-sm outline-none w-44"
                        style={{ background: 'var(--paper-3)', borderColor: 'var(--line-2)' }}
                      />
                    </div>
                    <button onClick={() => setShowAddProduct((v) => !v)} className={`btn py-2 px-3 text-sm shrink-0 ${showAddProduct ? '' : 'btn-primary'}`} style={showAddProduct ? { background: 'var(--paper-2)', border: '1px solid var(--line)' } : undefined}>
                      {showAddProduct ? '✕ Cancel' : '+ Add Product'}
                    </button>
                  </div>
                </div>

                {/* category filter chips */}
                {menuCategories.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-4">
                    {[{ id: 'all', name: 'All' }, ...menuCategories, ...(hasUncategorised ? [{ id: 'none', name: 'Uncategorised' }] : [])].map((c) => {
                      const active = menuCatFilter === c.id;
                      return (
                        <button
                          key={c.id}
                          onClick={() => setMenuCatFilter(c.id)}
                          className="px-3 py-1.5 rounded-full text-xs font-bold transition"
                          style={active
                            ? { background: 'var(--turmeric)', color: '#2A1607' }
                            : { background: 'var(--paper-3)', color: 'var(--ink-2)', border: '1px solid var(--line-2)' }}
                        >
                          {c.name}
                        </button>
                      );
                    })}
                  </div>
                )}

                {showAddProduct && (
                  <form onSubmit={handleCreateProduct} className="grid gap-3 p-4 mb-4 rounded-xl" style={{ background: 'var(--paper-3)', border: '1px solid var(--line-2)' }}>
                    <div className="grid sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-bold mb-1">Product name</label>
                        <input value={newProduct.name} onChange={(e) => setNewProduct((p) => ({ ...p, name: e.target.value }))} required placeholder="e.g. Masala Chai" className="w-full p-2.5 rounded-xl border text-sm outline-none" style={{ background: 'var(--paper-2)', borderColor: 'var(--line-2)' }} />
                      </div>
                      <div>
                        <label className="block text-xs font-bold mb-1">Price (₹)</label>
                        <input value={newProduct.price} onChange={(e) => setNewProduct((p) => ({ ...p, price: e.target.value }))} required type="number" step="0.01" min="0" placeholder="0.00" className="w-full p-2.5 rounded-xl border text-sm outline-none" style={{ background: 'var(--paper-2)', borderColor: 'var(--line-2)' }} />
                      </div>
                    </div>
                    <div className="grid sm:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-xs font-bold mb-1">Category</label>
                        <select value={newProduct.categoryId} onChange={(e) => setNewProduct((p) => ({ ...p, categoryId: e.target.value }))} className="w-full p-2.5 rounded-xl border text-sm outline-none" style={{ background: 'var(--paper-2)', borderColor: 'var(--line-2)' }}>
                          <option value="">— Uncategorised —</option>
                          {menuCategories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-bold mb-1">GST rate</label>
                        <select value={newProduct.gstRate} onChange={(e) => setNewProduct((p) => ({ ...p, gstRate: e.target.value }))} className="w-full p-2.5 rounded-xl border text-sm outline-none" style={{ background: 'var(--paper-2)', borderColor: 'var(--line-2)' }}>
                          {GST_OPTIONS.map((g) => <option key={g} value={g}>{g}%</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-bold mb-1">Station</label>
                        <select value={newProduct.station} onChange={(e) => setNewProduct((p) => ({ ...p, station: e.target.value }))} className="w-full p-2.5 rounded-xl border text-sm outline-none capitalize" style={{ background: 'var(--paper-2)', borderColor: 'var(--line-2)' }}>
                          {STATION_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-bold mb-1">Description (optional)</label>
                      <input value={newProduct.description} onChange={(e) => setNewProduct((p) => ({ ...p, description: e.target.value }))} placeholder="Short description shown to customers" className="w-full p-2.5 rounded-xl border text-sm outline-none" style={{ background: 'var(--paper-2)', borderColor: 'var(--line-2)' }} />
                    </div>
                    <div className="flex flex-wrap items-end gap-2">
                      <div className="flex-1 min-w-[180px]">
                        <label className="block text-xs font-bold mb-1">New category (optional)</label>
                        <div className="flex gap-2">
                          <input value={newCategory} onChange={(e) => setNewCategory(e.target.value)} placeholder="e.g. Beverages" className="flex-1 p-2.5 rounded-xl border text-sm outline-none" style={{ background: 'var(--paper-2)', borderColor: 'var(--line-2)' }} />
                          <button type="button" onClick={handleCreateCategory} className="btn py-2 px-3 text-sm" style={{ background: 'var(--paper-2)', border: '1px solid var(--line)' }}>Add</button>
                        </div>
                      </div>
                      <button type="submit" className="btn btn-primary">Create product</button>
                    </div>
                  </form>
                )}
                {inventoryLoading ? (
                  <p className="text-sm">Loading Menu...</p>
                ) : menuItems.length === 0 ? (
                  <p className="text-sm text-ink-3">No menu items found.</p>
                ) : filtered.length === 0 ? (
                  <p className="text-sm text-ink-3">{menuSearch ? `No items match “${menuSearch}”.` : 'No items in this category.'}</p>
                ) : (
                  <div className="flex flex-col gap-5">
                    {groups.map((g) => (
                      <div key={g.id}>
                        <div className="flex items-center gap-2 mb-2">
                          <h5 className="font-bold text-sm">{g.name}</h5>
                          <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'var(--paper-3)', color: 'var(--ink-3)' }}>{g.items.length}</span>
                        </div>
                        <div className="grid gap-2">
                    {g.items.map((item) => (
                      <div key={item.id} className="rounded-xl" style={{ background: 'var(--paper-3)' }}>
                        <div className="flex justify-between items-center gap-2 text-sm p-3">
                          <div className="min-w-0">
                            <b className="block truncate">{item.name}</b>
                            {priceEditId === item.id ? (
                              <div className="flex items-center gap-1 mt-1">
                                <span className="text-xs text-ink-3">₹</span>
                                <input autoFocus type="number" step="0.01" value={priceDraft} onChange={(e) => setPriceDraft(e.target.value)}
                                  onKeyDown={(e) => { if (e.key === 'Enter') handleSavePrice(item.id); if (e.key === 'Escape') setPriceEditId(null); }}
                                  className="w-24 p-1 rounded-lg border text-xs outline-none" style={{ background: 'var(--paper-2)', borderColor: 'var(--line-2)' }} />
                                <button onClick={() => handleSavePrice(item.id)} className="btn py-1 px-2 text-xs btn-primary">Save</button>
                                <button onClick={() => setPriceEditId(null)} className="btn py-1 px-2 text-xs" style={{ background: 'var(--paper-2)', border: '1px solid var(--line)' }}>✕</button>
                              </div>
                            ) : (
                              <span className="text-xs text-ink-3">
                                <button onClick={() => { setPriceEditId(item.id); setPriceDraft((item.pricePaise / 100).toString()); }} className="underline decoration-dotted">
                                  {formatINR(item.pricePaise)}
                                </button>
                                {item.station ? <span className="capitalize"> · {item.station}</span> : null} · GST {item.gstRate}%
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              onClick={() => (editProductId === item.id ? setEditProductId(null) : startEditProduct(item))}
                              className="btn py-1 px-3 text-xs"
                              style={{ background: 'var(--paper-2)', border: '1px solid var(--line)' }}
                            >
                              {editProductId === item.id ? 'Close' : 'Customize'}
                            </button>
                            <button
                              onClick={() => handleToggleMenuAvailability(item.id, !item.isAvailable)}
                              className={`btn py-1 px-3 text-xs ${item.isAvailable ? 'btn-primary' : 'btn-dark'}`}
                            >
                              {item.isAvailable ? 'Available' : 'Sold Out'}
                            </button>
                          </div>
                        </div>

                        {editProductId === item.id && (
                          <div className="grid gap-3 px-3 pb-3 pt-1 border-t" style={{ borderColor: 'var(--line-2)' }}>
                            <div className="grid sm:grid-cols-2 gap-3">
                              <div>
                                <label className="block text-xs font-bold mb-1">Name</label>
                                <input value={editDraft.name} onChange={(e) => setEditDraft((p) => ({ ...p, name: e.target.value }))} className="w-full p-2.5 rounded-xl border text-sm outline-none" style={{ background: 'var(--paper-2)', borderColor: 'var(--line-2)' }} />
                              </div>
                              <div>
                                <label className="block text-xs font-bold mb-1">Price (₹)</label>
                                <input value={editDraft.price} onChange={(e) => setEditDraft((p) => ({ ...p, price: e.target.value }))} type="number" step="0.01" min="0" className="w-full p-2.5 rounded-xl border text-sm outline-none" style={{ background: 'var(--paper-2)', borderColor: 'var(--line-2)' }} />
                              </div>
                            </div>
                            <div className="grid sm:grid-cols-3 gap-3">
                              <div>
                                <label className="block text-xs font-bold mb-1">Category</label>
                                <select value={editDraft.categoryId} onChange={(e) => setEditDraft((p) => ({ ...p, categoryId: e.target.value }))} className="w-full p-2.5 rounded-xl border text-sm outline-none" style={{ background: 'var(--paper-2)', borderColor: 'var(--line-2)' }}>
                                  <option value="">— Uncategorised —</option>
                                  {menuCategories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                                </select>
                              </div>
                              <div>
                                <label className="block text-xs font-bold mb-1">GST rate</label>
                                <select value={editDraft.gstRate} onChange={(e) => setEditDraft((p) => ({ ...p, gstRate: e.target.value }))} className="w-full p-2.5 rounded-xl border text-sm outline-none" style={{ background: 'var(--paper-2)', borderColor: 'var(--line-2)' }}>
                                  {GST_OPTIONS.map((g) => <option key={g} value={g}>{g}%</option>)}
                                </select>
                              </div>
                              <div>
                                <label className="block text-xs font-bold mb-1">Station</label>
                                <select value={editDraft.station} onChange={(e) => setEditDraft((p) => ({ ...p, station: e.target.value }))} className="w-full p-2.5 rounded-xl border text-sm outline-none capitalize" style={{ background: 'var(--paper-2)', borderColor: 'var(--line-2)' }}>
                                  {STATION_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                                </select>
                              </div>
                            </div>
                            <div>
                              <label className="block text-xs font-bold mb-1">Description</label>
                              <input value={editDraft.description} onChange={(e) => setEditDraft((p) => ({ ...p, description: e.target.value }))} placeholder="Short description" className="w-full p-2.5 rounded-xl border text-sm outline-none" style={{ background: 'var(--paper-2)', borderColor: 'var(--line-2)' }} />
                            </div>
                            <div className="flex flex-wrap justify-between gap-2">
                              <button onClick={() => handleDeleteProduct(item.id, item.name)} className="btn py-2 px-3 text-sm" style={{ background: 'var(--paper-2)', border: '1px solid var(--chilli, #c0392b)', color: 'var(--chilli, #c0392b)' }}>Delete</button>
                              <div className="flex gap-2">
                                <button onClick={() => setEditProductId(null)} className="btn py-2 px-3 text-sm" style={{ background: 'var(--paper-2)', border: '1px solid var(--line)' }}>Cancel</button>
                                <button onClick={() => handleUpdateProduct(item.id)} className="btn btn-primary py-2 px-4 text-sm">Save changes</button>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
              );
            })()}



            {/* ── Tax & GST ── */}
            {activeMenu === 'settings' && settingsPanel === 'tax' && (
              <form onSubmit={handleSaveGst} className="card p-5 max-w-md flex flex-col gap-4">
                <div>
                  <h4 className="font-bold">Tax &amp; GST</h4>
                  <p className="text-xs text-ink-3">Turn GST on only if your outlet is GST-registered. While off, every bill, KOT and receipt shows item prices and totals with no tax.</p>
                </div>

                {/* Enable GST */}
                <button
                  type="button"
                  role="switch"
                  aria-checked={profile.gstEnabled}
                  onClick={() => setProfile((p) => ({ ...p, gstEnabled: !p.gstEnabled }))}
                  className="rounded-xl border p-3 w-full flex items-center justify-between gap-3"
                  style={{ borderColor: 'var(--line)', background: 'var(--paper-3)' }}
                >
                  <span className="text-left">
                    <span className="block text-sm font-bold">Enable GST</span>
                    <span className="block text-xs" style={{ color: 'var(--ink-3)' }}>{profile.gstEnabled ? 'Tax is calculated on bills' : 'Off — bills are tax-free'}</span>
                  </span>
                  <span className="relative shrink-0 rounded-full transition-colors" style={{ width: 44, height: 26, background: profile.gstEnabled ? 'var(--cardamom)' : 'var(--line-2)' }}>
                    <span className="absolute top-[3px] rounded-full bg-white transition-all" style={{ width: 20, height: 20, left: profile.gstEnabled ? 21 : 3, boxShadow: 'var(--sh-1)' }} />
                  </span>
                </button>

                {profile.gstEnabled && (
                  <>
                    {/* Tax type */}
                    <div>
                      <label className="block text-xs font-bold mb-1.5">Tax type</label>
                      <div className="grid grid-cols-2 gap-2">
                        {([
                          { key: 'exclusive', title: 'Exclusive', sub: 'GST added on top of price' },
                          { key: 'inclusive', title: 'Inclusive', sub: 'GST already in the price' },
                        ] as const).map((o) => {
                          const on = profile.gstType === o.key;
                          return (
                            <button type="button" key={o.key} onClick={() => setProfile((p) => ({ ...p, gstType: o.key }))}
                              className="rounded-xl border p-3 text-left transition"
                              style={on ? { background: 'var(--turmeric)', color: '#2A1607', borderColor: 'transparent' } : { background: 'var(--paper-3)', borderColor: 'var(--line-2)' }}>
                              <b className="block text-sm">{o.title}</b>
                              <span className="block text-[11px]" style={{ color: on ? '#5a3a14' : 'var(--ink-3)' }}>{o.sub}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* GST percentage */}
                    <div>
                      <label className="block text-xs font-bold mb-1.5">GST percentage</label>
                      <div className="flex flex-wrap gap-2 mb-2">
                        {['', '0', '5', '12', '18', '28'].map((r) => {
                          const on = profile.gstRate === r;
                          return (
                            <button type="button" key={r || 'per-item'} onClick={() => setProfile((p) => ({ ...p, gstRate: r }))}
                              className="px-3 py-2 rounded-xl border text-sm font-semibold transition"
                              style={on ? { background: 'var(--turmeric)', color: '#2A1607', borderColor: 'transparent' } : { background: 'var(--paper-3)', borderColor: 'var(--line-2)' }}>
                              {r === '' ? 'Per-item' : `${r}%`}
                            </button>
                          );
                        })}
                      </div>
                      <input
                        value={profile.gstRate}
                        onChange={(e) => setProfile((p) => ({ ...p, gstRate: e.target.value.replace(/[^0-9.]/g, '') }))}
                        inputMode="decimal"
                        placeholder="Custom rate %, or leave blank for per-item"
                        className="w-full p-2.5 rounded-xl border text-sm outline-none"
                        style={{ background: 'var(--paper-2)', borderColor: 'var(--line-2)' }}
                      />
                      <span className="block text-[11px] mt-1" style={{ color: 'var(--ink-3)' }}>
                        <b>Per-item</b> keeps each menu item’s own GST rate (set 0% on an item to make it tax-free). A flat rate overrides every item.
                      </span>
                    </div>

                    <div className="rounded-xl border p-3 text-[11px]" style={{ borderColor: 'var(--line)', background: 'var(--paper-3)', color: 'var(--ink-3)' }}>
                      Intra-state bills split into CGST + SGST automatically; inter-state orders use IGST. Multi-slab and country-specific tax stay supported.
                    </div>
                  </>
                )}

                <button type="submit" disabled={gstSaving} className="btn btn-primary w-fit disabled:opacity-50">{gstSaving ? 'Saving…' : 'Save GST settings'}</button>
              </form>
            )}

            {/* ── Floor & QR ── */}
            {activeMenu === 'settings' && settingsPanel === 'floor' && (
              <div className="flex flex-col gap-4">
                <section className="card p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h4 className="font-bold">Floor &amp; QR codes</h4>
                      <p className="text-xs text-ink-3 max-w-md">Add the tables in your café and print a QR for each. Guests scan it to open the menu and order from their phone — orders land in the approval queue for a waiter to confirm.</p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0 text-right">
                      <div>
                        <b className="block text-lg font-mono leading-none">{floorTables.length}</b>
                        <span className="text-[11px] text-ink-3">tables</span>
                      </div>
                      <div>
                        <b className="block text-lg font-mono leading-none" style={{ color: 'var(--cardamom-d)' }}>{floorTables.filter((t) => t.activeOrders > 0).length}</b>
                        <span className="text-[11px] text-ink-3">occupied</span>
                      </div>
                    </div>
                  </div>
                </section>

                {/* floors / areas */}
                <section className="card p-5">
                  <h4 className="font-bold mb-1">Floors &amp; areas</h4>
                  <p className="text-xs text-ink-3 mb-3">Group tables into areas like Ground Floor, Rooftop or AC Hall. Optional — tables without a floor show under “Unassigned”.</p>
                  <form onSubmit={handleAddFloor} className="flex flex-wrap items-end gap-2 mb-3">
                    <div className="flex-1 min-w-[160px]">
                      <label className="block text-xs font-bold mb-1">New floor / area</label>
                      <input value={newFloorName} onChange={(e) => setNewFloorName(e.target.value)} placeholder="e.g. Rooftop" className="w-full p-2.5 rounded-xl border text-sm outline-none" style={{ background: 'var(--paper-3)', borderColor: 'var(--line-2)' }} />
                    </div>
                    <button type="submit" disabled={floorBusy} className="btn btn-primary py-2.5 px-4 text-sm disabled:opacity-50">+ Add floor</button>
                  </form>
                  {floors.length === 0 ? (
                    <p className="text-xs text-ink-3">No floors yet — that’s fine for a single-area café.</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {floors.map((f) => {
                        const n = floorTables.filter((t) => t.floorId === f.id).length;
                        return editFloorId === f.id ? (
                          <span key={f.id} className="flex items-center gap-1 rounded-xl border px-2 py-1.5" style={{ background: 'var(--paper-3)', borderColor: 'var(--line-2)' }}>
                            <input value={editFloorName} onChange={(e) => setEditFloorName(e.target.value)} className="w-28 p-1 rounded-lg border text-sm outline-none" style={{ background: 'var(--paper-2)', borderColor: 'var(--line-2)' }} autoFocus />
                            <button onClick={() => handleRenameFloor(f.id)} disabled={floorBusy} className="btn btn-primary py-1 px-2 text-xs disabled:opacity-50">Save</button>
                            <button onClick={() => setEditFloorId(null)} className="btn py-1 px-2 text-xs" style={{ background: 'var(--paper-2)', border: '1px solid var(--line)' }}>✕</button>
                          </span>
                        ) : (
                          <span key={f.id} className="flex items-center gap-2 rounded-xl border px-3 py-1.5 text-sm" style={{ background: 'var(--paper-3)', borderColor: 'var(--line-2)' }}>
                            <b>{f.name}</b>
                            <span className="text-[11px] text-ink-3">{n} table{n === 1 ? '' : 's'}</span>
                            <button onClick={() => { setEditFloorId(f.id); setEditFloorName(f.name); }} className="text-xs text-ink-3 hover:text-ink" title="Rename" aria-label={`Rename ${f.name}`}>✎</button>
                            <button onClick={() => handleDeleteFloor(f)} className="text-xs" style={{ color: 'var(--chilli, #c0392b)' }} title="Delete" aria-label={`Delete ${f.name}`}>🗑</button>
                          </span>
                        );
                      })}
                    </div>
                  )}
                </section>

                {/* add a table + bulk */}
                <section className="card p-5">
                  <form onSubmit={handleAddTable} className="flex flex-wrap items-end gap-3">
                    <div className="flex-1 min-w-[140px]">
                      <label className="block text-xs font-bold mb-1">Table name</label>
                      <input value={tableForm.label} onChange={(e) => setTableForm((p) => ({ ...p, label: e.target.value }))} placeholder="e.g. T7 or Patio 2" className="w-full p-2.5 rounded-xl border text-sm outline-none" style={{ background: 'var(--paper-3)', borderColor: 'var(--line-2)' }} />
                    </div>
                    <div className="w-24">
                      <label className="block text-xs font-bold mb-1">Seats</label>
                      <input type="number" min={1} max={50} value={tableForm.seats} onChange={(e) => setTableForm((p) => ({ ...p, seats: e.target.value }))} className="w-full p-2.5 rounded-xl border text-sm outline-none" style={{ background: 'var(--paper-3)', borderColor: 'var(--line-2)' }} />
                    </div>
                    {floors.length > 0 && (
                      <div className="w-36">
                        <label className="block text-xs font-bold mb-1">Floor</label>
                        <select value={tableForm.floorId} onChange={(e) => setTableForm((p) => ({ ...p, floorId: e.target.value }))} className="w-full p-2.5 rounded-xl border text-sm outline-none" style={{ background: 'var(--paper-3)', borderColor: 'var(--line-2)' }}>
                          <option value="">Unassigned</option>
                          {floors.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                        </select>
                      </div>
                    )}
                    <button type="submit" disabled={floorBusy} className="btn btn-primary py-2.5 px-4 text-sm disabled:opacity-50">+ Add table</button>
                    <button type="button" onClick={() => setShowBulk((v) => !v)} className="btn py-2.5 px-3 text-sm" style={{ background: 'var(--paper-3)', border: '1px solid var(--line)' }}>{showBulk ? 'Close bulk' : 'Bulk add'}</button>
                  </form>

                  {showBulk && (
                    <form onSubmit={handleBulkAdd} className="mt-4 pt-4 border-t flex flex-wrap items-end gap-3" style={{ borderColor: 'var(--line)' }}>
                      <div className="w-28">
                        <label className="block text-xs font-bold mb-1">How many</label>
                        <input type="number" min={1} max={50} value={bulkForm.count} onChange={(e) => setBulkForm((p) => ({ ...p, count: e.target.value }))} className="w-full p-2.5 rounded-xl border text-sm outline-none" style={{ background: 'var(--paper-3)', borderColor: 'var(--line-2)' }} />
                      </div>
                      <div className="w-28">
                        <label className="block text-xs font-bold mb-1">Name prefix</label>
                        <input value={bulkForm.prefix} onChange={(e) => setBulkForm((p) => ({ ...p, prefix: e.target.value }))} placeholder="T" className="w-full p-2.5 rounded-xl border text-sm outline-none" style={{ background: 'var(--paper-3)', borderColor: 'var(--line-2)' }} />
                      </div>
                      <div className="w-24">
                        <label className="block text-xs font-bold mb-1">Seats</label>
                        <input type="number" min={1} max={50} value={bulkForm.seats} onChange={(e) => setBulkForm((p) => ({ ...p, seats: e.target.value }))} className="w-full p-2.5 rounded-xl border text-sm outline-none" style={{ background: 'var(--paper-3)', borderColor: 'var(--line-2)' }} />
                      </div>
                      {floors.length > 0 && (
                        <div className="w-36">
                          <label className="block text-xs font-bold mb-1">Floor</label>
                          <select value={bulkForm.floorId} onChange={(e) => setBulkForm((p) => ({ ...p, floorId: e.target.value }))} className="w-full p-2.5 rounded-xl border text-sm outline-none" style={{ background: 'var(--paper-3)', borderColor: 'var(--line-2)' }}>
                            <option value="">Unassigned</option>
                            {floors.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                          </select>
                        </div>
                      )}
                      <button type="submit" disabled={floorBusy} className="btn btn-primary py-2.5 px-4 text-sm disabled:opacity-50">Create tables</button>
                      <span className="text-[11px] text-ink-3 self-center">Numbers continue after your highest existing one.</span>
                    </form>
                  )}
                </section>

                {/* table grid — grouped by floor */}
                <section className="card p-5">
                  <h4 className="font-bold mb-3">Tables {floorTables.length > 0 && <span className="text-xs text-ink-3">({floorTables.length})</span>}</h4>
                  {floorTables.length === 0 ? (
                    <div className="text-sm text-ink-3 p-6 rounded-xl text-center" style={{ background: 'var(--paper-3)' }}>
                      No tables yet. Add your first table above to start printing QR codes.
                    </div>
                  ) : floors.length === 0 ? (
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {floorTables.map(renderTableCard)}
                    </div>
                  ) : (
                    <div className="flex flex-col gap-5">
                      {[...floors, { id: '', name: 'Unassigned', sort: 999 }].map((f) => {
                        const group = floorTables.filter((t) => (t.floorId ?? '') === f.id);
                        if (group.length === 0) return null;
                        return (
                          <div key={f.id || 'unassigned'}>
                            <div className="flex items-center gap-2 mb-2">
                              <h5 className="font-bold text-sm">{f.name}</h5>
                              <span className="text-[11px] text-ink-3">{group.length} table{group.length === 1 ? '' : 's'}</span>
                            </div>
                            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                              {group.map(renderTableCard)}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>
              </div>
            )}

            {/* ── PWA Settings (customer app) ── */}
            {activeMenu === 'settings' && settingsPanel === 'pwa' && (
              <div className="flex flex-col gap-4">
                <section className="card p-5">
                  <h4 className="font-bold">PWA Settings</h4>
                  <p className="text-xs text-ink-3">Configure the customer scan-to-order app: home content, games, wallet and loyalty. Changes are live for new customer sessions; nothing here affects the POS or KDS.</p>
                </section>

                {/* sub-tabs */}
                <div className="flex gap-1.5 overflow-x-auto pb-1">
                  {([
                    ['featured', 'Featured Dishes'], ['banners', 'Banners'], ['home', 'Home Layout'],
                    ['gamification', 'Gamification'], ['points', 'Reward Points'], ['wallet', 'Wallet'],
                    ['loyalty', 'Loyalty'], ['table', 'QR Table'], ['registration', 'Registration'], ['theme', 'Theme'],
                  ] as [typeof pwaTab, string][]).map(([key, label]) => (
                    <button key={key} onClick={() => setPwaTab(key)} className="px-3 py-2 rounded-xl text-sm font-semibold whitespace-nowrap border transition"
                      style={pwaTab === key ? { background: 'var(--turmeric)', color: '#2A1607', borderColor: 'transparent' } : { background: 'var(--paper-2)', borderColor: 'var(--line)' }}>
                      {label}
                    </button>
                  ))}
                </div>

                {!pwaCfg ? (
                  <section className="card p-5"><p className="text-sm text-ink-3">Loading…</p></section>
                ) : (
                  <>
                    {/* FEATURED DISHES */}
                    {pwaTab === 'featured' && (
                      <section className="card p-5 flex flex-col gap-4">
                        <div>
                          <h4 className="font-bold">Featured Dishes</h4>
                          <p className="text-xs text-ink-3">Pick dishes to spotlight on the app home with a label and priority.</p>
                        </div>
                        <PwaFeaturedForm items={pwaItems} busy={pwaBusy} uploadImage={uploadImage} onAdd={(dish) => pwaSave({ action: 'featured_save', dish }, 'Featured dish saved')} />
                        {pwaCfg.featured.length === 0 ? (
                          <p className="text-sm text-ink-3 p-4 rounded-xl text-center" style={{ background: 'var(--paper-3)' }}>No featured dishes yet.</p>
                        ) : (
                          <div className="grid gap-2">
                            {pwaCfg.featured.map((f) => {
                              const it = pwaItems.find((x) => x.id === f.itemId);
                              const img = f.imageUrl || it?.imageUrl;
                              return (
                                <div key={f.itemId} className="flex items-center gap-3 p-2.5 rounded-xl" style={{ background: 'var(--paper-3)' }}>
                                  {img ? <img src={img} alt="" width={44} height={44} className="rounded-lg object-cover" style={{ width: 44, height: 44 }} /> : <span className="w-11 h-11 rounded-lg grid place-items-center text-lg" style={{ background: 'var(--paper-2)' }}>🍽️</span>}
                                  <div className="min-w-0 flex-1">
                                    <b className="text-sm block truncate">{it?.name ?? 'Unknown item'}</b>
                                    <span className="text-xs text-ink-3">{FEATURED_LABELS.find((l) => l.value === f.label)?.label ?? 'No label'} · priority {f.priority}</span>
                                  </div>
                                  <button onClick={() => pwaSave({ action: 'featured_delete', itemId: f.itemId }, 'Removed')} className="btn py-1 px-2.5 text-xs" style={{ background: 'var(--paper-2)', border: '1px solid var(--chilli, #c0392b)', color: 'var(--chilli, #c0392b)' }}>Remove</button>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </section>
                    )}

                    {/* PROMOTIONAL BANNERS */}
                    {pwaTab === 'banners' && (
                      <section className="card p-5 flex flex-col gap-4">
                        <div>
                          <h4 className="font-bold">Promotional Banners</h4>
                          <p className="text-xs text-ink-3">Auto-sliding carousel on the app home. Upload a poster, set an optional schedule and order.</p>
                        </div>
                        <PwaBannerForm busy={pwaBusy} uploadImage={uploadImage} onAdd={(banner) => pwaSave({ action: 'banner_save', banner }, 'Banner saved')} />
                        {pwaCfg.banners.length === 0 ? (
                          <p className="text-sm text-ink-3 p-4 rounded-xl text-center" style={{ background: 'var(--paper-3)' }}>No banners yet.</p>
                        ) : (
                          <div className="grid gap-2">
                            {pwaCfg.banners.map((b) => (
                              <div key={b.id} className="flex items-center gap-3 p-2.5 rounded-xl" style={{ background: 'var(--paper-3)' }}>
                                <img src={b.imageUrl} alt="" className="rounded-lg object-cover" style={{ width: 64, height: 40 }} />
                                <div className="min-w-0 flex-1">
                                  <b className="text-sm block truncate">{b.title || '(untitled)'}</b>
                                  <span className="text-xs text-ink-3">order {b.order}{b.startAt ? ` · from ${b.startAt}` : ''}{b.endAt ? ` · to ${b.endAt}` : ''}</span>
                                </div>
                                <button onClick={() => pwaSave({ action: 'banner_delete', id: b.id }, 'Removed')} className="btn py-1 px-2.5 text-xs" style={{ background: 'var(--paper-2)', border: '1px solid var(--chilli, #c0392b)', color: 'var(--chilli, #c0392b)' }}>Remove</button>
                              </div>
                            ))}
                          </div>
                        )}
                      </section>
                    )}

                    {/* HOME LAYOUT */}
                    {pwaTab === 'home' && (
                      <section className="card p-5 flex flex-col gap-3 max-w-md">
                        <div><h4 className="font-bold">Home Layout</h4><p className="text-xs text-ink-3">Tap to toggle sections; click order sets the display order.</p></div>
                        {(['banners', 'featured', 'track', 'loyalty'] as const).map((s) => {
                          const idx = pwaCfg.home.sections.indexOf(s);
                          const on = idx >= 0;
                          const label = { banners: 'Promo banners', featured: 'Featured dishes', track: 'Order tracking', loyalty: 'Loyalty snapshot' }[s];
                          return (
                            <button key={s} onClick={() => setCfg((c) => ({ ...c, home: { sections: on ? c.home.sections.filter((x) => x !== s) : [...c.home.sections, s] } }))}
                              className="flex items-center justify-between p-3 rounded-xl border text-left" style={{ borderColor: 'var(--line)', background: on ? 'var(--paper-2)' : 'var(--paper-3)' }}>
                              <span className="text-sm font-semibold">{label}</span>
                              <span className="text-xs" style={{ color: on ? 'var(--cardamom-d)' : 'var(--ink-3)' }}>{on ? `● shown · #${idx + 1}` : '○ hidden'}</span>
                            </button>
                          );
                        })}
                        <button onClick={() => pwaSave({ action: 'home_save', sections: pwaCfg.home.sections }, 'Home layout saved')} disabled={pwaBusy} className="btn btn-primary w-fit disabled:opacity-50">Save layout</button>
                      </section>
                    )}

                    {/* GAMIFICATION */}
                    {pwaTab === 'gamification' && (
                      <section className="card p-5 flex flex-col gap-4">
                        <div><h4 className="font-bold">Gamification</h4><p className="text-xs text-ink-3">Enable games, gate them by order value, cap plays and set availability hours (IST).</p></div>
                        <Toggle label="Games enabled" on={pwaCfg.gamification.enabledGlobal} onChange={(v) => setCfg((c) => ({ ...c, gamification: { ...c.gamification, enabledGlobal: v } }))} />
                        <div className="grid grid-cols-2 gap-3 max-w-md">
                          <Field label="Max games / day (0 = unlimited)"><input type="number" min={0} value={pwaCfg.gamification.maxGamesPerDay} onChange={(e) => setCfg((c) => ({ ...c, gamification: { ...c.gamification, maxGamesPerDay: Number(e.target.value) || 0 } }))} className={PWA_INPUT} /></Field>
                          <Field label="Spin points multiplier"><input type="number" min={0} step={0.1} value={pwaCfg.gamification.spin.pointsMultiplier} onChange={(e) => setCfg((c) => ({ ...c, gamification: { ...c.gamification, spin: { ...c.gamification.spin, pointsMultiplier: Number(e.target.value) || 0 } } }))} className={PWA_INPUT} /></Field>
                        </div>
                        <div className="grid grid-cols-2 gap-3 max-w-md">
                          <Field label="Available from (IST hour, blank = always)"><input type="number" min={0} max={23} value={pwaCfg.gamification.availability?.startHour ?? ''} onChange={(e) => setCfg((c) => ({ ...c, gamification: { ...c.gamification, availability: e.target.value === '' ? null : { startHour: Number(e.target.value) || 0, endHour: c.gamification.availability?.endHour ?? 23 } } }))} className={PWA_INPUT} /></Field>
                          <Field label="Available to (IST hour)"><input type="number" min={0} max={23} value={pwaCfg.gamification.availability?.endHour ?? ''} onChange={(e) => setCfg((c) => ({ ...c, gamification: { ...c.gamification, availability: c.gamification.availability ? { ...c.gamification.availability, endHour: Number(e.target.value) || 0 } : { startHour: 0, endHour: Number(e.target.value) || 0 } } }))} className={PWA_INPUT} /></Field>
                        </div>
                        <div className="grid gap-2">
                          <b className="text-sm">Per-game controls</b>
                          {DEFAULT_GAME_KEYS.map((key) => {
                            const g = pwaCfg.gamification.games.find((x) => x.key === key) ?? { key, enabled: true, minOrderPaise: 0, pointsMultiplier: 1 };
                            const upd = (patch: Partial<typeof g>) => setCfg((c) => ({ ...c, gamification: { ...c.gamification, games: c.gamification.games.some((x) => x.key === key) ? c.gamification.games.map((x) => (x.key === key ? { ...x, ...patch } : x)) : [...c.gamification.games, { ...g, ...patch }] } }));
                            return (
                              <div key={key} className="flex flex-wrap items-center gap-3 p-2.5 rounded-xl" style={{ background: 'var(--paper-3)' }}>
                                <b className="text-sm w-32 capitalize">{key.replace(/_/g, ' ')}</b>
                                <label className="flex items-center gap-1.5 text-xs"><input type="checkbox" checked={g.enabled} onChange={(e) => upd({ enabled: e.target.checked })} /> on</label>
                                <label className="flex items-center gap-1.5 text-xs">min order ₹<input type="number" min={0} value={Math.round(g.minOrderPaise / 100)} onChange={(e) => upd({ minOrderPaise: (Number(e.target.value) || 0) * 100 })} className="w-20 p-1.5 rounded-lg border text-sm" style={{ background: 'var(--paper-2)', borderColor: 'var(--line-2)' }} /></label>
                                <label className="flex items-center gap-1.5 text-xs">×pts<input type="number" min={0} step={0.1} value={g.pointsMultiplier} onChange={(e) => upd({ pointsMultiplier: Number(e.target.value) || 0 })} className="w-16 p-1.5 rounded-lg border text-sm" style={{ background: 'var(--paper-2)', borderColor: 'var(--line-2)' }} /></label>
                              </div>
                            );
                          })}
                        </div>
                        <button onClick={() => pwaSave({ action: 'gamification_save', ...pwaCfg.gamification }, 'Gamification saved')} disabled={pwaBusy} className="btn btn-primary w-fit disabled:opacity-50">Save gamification</button>
                      </section>
                    )}

                    {/* REWARD POINTS */}
                    {pwaTab === 'points' && (
                      <section className="card p-5 flex flex-col gap-3 max-w-md">
                        <div><h4 className="font-bold">Reward Points</h4><p className="text-xs text-ink-3">How fast customers earn points from spend (applied at order settlement).</p></div>
                        <Field label="₹ spent to earn 1 point">
                          <input type="number" min={1} value={Math.round(pwaCfg.points.earnRatePaisePerPoint / 100)} onChange={(e) => setCfg((c) => ({ ...c, points: { earnRatePaisePerPoint: Math.max(1, Number(e.target.value) || 1) * 100 } }))} className={PWA_INPUT} />
                        </Field>
                        <p className="text-[11px] text-ink-3">e.g. 10 = 1 point per ₹10 spent (the current default).</p>
                        <button onClick={() => pwaSave({ action: 'points_save', earnRatePaisePerPoint: pwaCfg.points.earnRatePaisePerPoint }, 'Points rate saved')} disabled={pwaBusy} className="btn btn-primary w-fit disabled:opacity-50">Save</button>
                      </section>
                    )}

                    {/* WALLET */}
                    {pwaTab === 'wallet' && (
                      <section className="card p-5 flex flex-col gap-3 max-w-md">
                        <div><h4 className="font-bold">Wallet Conversion</h4><p className="text-xs text-ink-3">Let customers spend points as a ₹ discount at checkout.</p></div>
                        <Toggle label="Wallet redemption enabled" on={pwaCfg.wallet.enabled} onChange={(v) => setCfg((c) => ({ ...c, wallet: { ...c.wallet, enabled: v } }))} />
                        <Field label="Points per ₹1 of discount"><input type="number" min={1} value={pwaCfg.wallet.pointsPerRupee} onChange={(e) => setCfg((c) => ({ ...c, wallet: { ...c.wallet, pointsPerRupee: Math.max(1, Number(e.target.value) || 1) } }))} className={PWA_INPUT} /></Field>
                        <Field label="Max discount (% of bill)"><input type="number" min={0} max={100} value={pwaCfg.wallet.maxRedeemPctOfBill} onChange={(e) => setCfg((c) => ({ ...c, wallet: { ...c.wallet, maxRedeemPctOfBill: Number(e.target.value) || 0 } }))} className={PWA_INPUT} /></Field>
                        <Field label="Min points to redeem"><input type="number" min={0} value={pwaCfg.wallet.minPointsToRedeem} onChange={(e) => setCfg((c) => ({ ...c, wallet: { ...c.wallet, minPointsToRedeem: Number(e.target.value) || 0 } }))} className={PWA_INPUT} /></Field>
                        <button onClick={() => pwaSave({ action: 'wallet_save', ...pwaCfg.wallet }, 'Wallet saved')} disabled={pwaBusy} className="btn btn-primary w-fit disabled:opacity-50">Save wallet</button>
                      </section>
                    )}

                    {/* LOYALTY */}
                    {pwaTab === 'loyalty' && (
                      <section className="card p-5 flex flex-col gap-3">
                        <div><h4 className="font-bold">Loyalty Program</h4><p className="text-xs text-ink-3">Tier names and thresholds (qualify by spend OR visits). The stored “vip” tier is shown as your top-tier name.</p></div>
                        <div className="grid gap-2 max-w-2xl">
                          {pwaCfg.loyalty.tiers.map((t, i) => (
                            <div key={t.tier} className="flex flex-wrap items-center gap-2 p-2.5 rounded-xl" style={{ background: 'var(--paper-3)' }}>
                              <span className="text-xs w-14 capitalize text-ink-3">{t.tier}</span>
                              <input value={t.displayName} onChange={(e) => setCfg((c) => ({ ...c, loyalty: { rewards: c.loyalty.rewards, tiers: c.loyalty.tiers.map((x, j) => (j === i ? { ...x, displayName: e.target.value } : x)) } }))} className="w-32 p-1.5 rounded-lg border text-sm" style={{ background: 'var(--paper-2)', borderColor: 'var(--line-2)' }} />
                              <label className="flex items-center gap-1.5 text-xs">min spend ₹<input type="number" min={0} value={Math.round(t.minSpendPaise / 100)} onChange={(e) => setCfg((c) => ({ ...c, loyalty: { rewards: c.loyalty.rewards, tiers: c.loyalty.tiers.map((x, j) => (j === i ? { ...x, minSpendPaise: (Number(e.target.value) || 0) * 100 } : x)) } }))} className="w-24 p-1.5 rounded-lg border text-sm" style={{ background: 'var(--paper-2)', borderColor: 'var(--line-2)' }} /></label>
                              <label className="flex items-center gap-1.5 text-xs">min visits<input type="number" min={0} value={t.minVisits} onChange={(e) => setCfg((c) => ({ ...c, loyalty: { rewards: c.loyalty.rewards, tiers: c.loyalty.tiers.map((x, j) => (j === i ? { ...x, minVisits: Number(e.target.value) || 0 } : x)) } }))} className="w-20 p-1.5 rounded-lg border text-sm" style={{ background: 'var(--paper-2)', borderColor: 'var(--line-2)' }} /></label>
                            </div>
                          ))}
                        </div>
                        <button onClick={() => pwaSave({ action: 'loyalty_save', tiers: pwaCfg.loyalty.tiers }, 'Loyalty saved')} disabled={pwaBusy} className="btn btn-primary w-fit disabled:opacity-50">Save loyalty</button>
                      </section>
                    )}

                    {/* QR TABLE */}
                    {pwaTab === 'table' && (
                      <section className="card p-5 flex flex-col gap-3 max-w-md">
                        <div><h4 className="font-bold">QR Table Configuration</h4><p className="text-xs text-ink-3">What the customer sees when they scan a table QR.</p></div>
                        <Field label="Welcome prefix"><input value={pwaCfg.table.welcomePrefix} onChange={(e) => setCfg((c) => ({ ...c, table: { ...c.table, welcomePrefix: e.target.value } }))} className={PWA_INPUT} /></Field>
                        <p className="text-[11px] text-ink-3">Shown as “{pwaCfg.table.welcomePrefix} 12”.</p>
                        <Toggle label="Allow manual table pick when QR has no table" on={pwaCfg.table.allowManualPick} onChange={(v) => setCfg((c) => ({ ...c, table: { ...c.table, allowManualPick: v } }))} />
                        <button onClick={() => pwaSave({ action: 'table_save', ...pwaCfg.table }, 'Table config saved')} disabled={pwaBusy} className="btn btn-primary w-fit disabled:opacity-50">Save</button>
                      </section>
                    )}

                    {/* REGISTRATION */}
                    {pwaTab === 'registration' && (
                      <section className="card p-5 flex flex-col gap-3 max-w-md">
                        <div><h4 className="font-bold">Customer Registration</h4><p className="text-xs text-ink-3">Ask the customer for name &amp; mobile before they use the app. Returning customers are recognised by phone.</p></div>
                        <Toggle label="Require registration" on={pwaCfg.registration.enabled} onChange={(v) => setCfg((c) => ({ ...c, registration: { ...c.registration, enabled: v } }))} />
                        <Toggle label="Collect name (else mobile only)" on={pwaCfg.registration.collectName} onChange={(v) => setCfg((c) => ({ ...c, registration: { ...c.registration, collectName: v } }))} />
                        <button onClick={() => pwaSave({ action: 'registration_save', ...pwaCfg.registration }, 'Registration saved')} disabled={pwaBusy} className="btn btn-primary w-fit disabled:opacity-50">Save</button>
                      </section>
                    )}

                    {/* THEME */}
                    {pwaTab === 'theme' && (
                      <section className="card p-5 flex flex-col gap-3 max-w-md">
                        <div><h4 className="font-bold">PWA Theme</h4><p className="text-xs text-ink-3">Accent colour, logo and a hero tagline for the app home.</p></div>
                        <Field label="Accent colour"><input type="color" value={pwaCfg.theme.accent || '#E8902A'} onChange={(e) => setCfg((c) => ({ ...c, theme: { ...c.theme, accent: e.target.value } }))} className="w-16 h-10 rounded-lg border" style={{ borderColor: 'var(--line-2)' }} /></Field>
                        <Field label="Hero tagline"><input value={pwaCfg.theme.heroTagline} onChange={(e) => setCfg((c) => ({ ...c, theme: { ...c.theme, heroTagline: e.target.value } }))} placeholder="Freshly brewed, just for you" className={PWA_INPUT} /></Field>
                        <div>
                          <label className="block text-xs font-bold mb-1">Logo</label>
                          <div className="flex items-center gap-3">
                            {pwaCfg.theme.logoUrl && <img src={pwaCfg.theme.logoUrl} alt="" className="rounded-lg object-contain" style={{ width: 44, height: 44, background: 'var(--paper-3)' }} />}
                            <input type="file" accept="image/*" onChange={async (e) => { const f = e.target.files?.[0]; if (f) { const url = await uploadImage(f); if (url) setCfg((c) => ({ ...c, theme: { ...c.theme, logoUrl: url } })); } }} className="text-xs" />
                          </div>
                        </div>
                        <button onClick={() => pwaSave({ action: 'theme_save', ...pwaCfg.theme }, 'Theme saved')} disabled={pwaBusy} className="btn btn-primary w-fit disabled:opacity-50">Save theme</button>
                      </section>
                    )}
                  </>
                )}
              </div>
            )}

            {activeMenu === 'settings' && isAdvanced && settingsPanel === 'multibranch' && (
              <section className="card p-5">
                <h4 className="font-bold mb-3">Multi Branch Configuration</h4>
                <div className="p-4 rounded-xl" style={{ background: 'var(--paper-3)' }}>
                  <p className="text-sm">Add other outlets to sync settings and consolidate brand reporting.</p>
                </div>
              </section>
            )}

            {/* ── Devices & Printers ── */}
            {activeMenu === 'settings' && settingsPanel === 'devices' && (
              <div className="flex flex-col gap-4">
                <section className="card p-5">
                  <div className="flex flex-wrap items-center justify-between gap-3 mb-1">
                    <div>
                      <h4 className="font-bold">Devices &amp; Printers</h4>
                      <p className="text-xs text-ink-3">Register receipt &amp; KOT printers, cash drawers and displays. The default printer of each type is used automatically.</p>
                    </div>
                    <button onClick={() => openDeviceForm()} className="btn btn-primary py-2 px-3 text-sm shrink-0">+ Add Device</button>
                  </div>
                </section>

                {showDeviceForm && (
                  <section className="card p-5">
                    <h4 className="font-bold mb-3">{deviceForm.id ? 'Edit device' : 'New device'}</h4>
                    <form onSubmit={handleSaveDevice} className="grid gap-3">
                      <div className="grid sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-bold mb-1">Device name</label>
                          <input value={deviceForm.name} onChange={(e) => setDeviceForm((p) => ({ ...p, name: e.target.value }))} required placeholder="e.g. Counter receipt printer" className="w-full p-2.5 rounded-xl border text-sm outline-none" style={{ background: 'var(--paper-3)', borderColor: 'var(--line-2)' }} />
                        </div>
                        <div>
                          <label className="block text-xs font-bold mb-1">Type</label>
                          <select value={deviceForm.type} onChange={(e) => setDeviceForm((p) => ({ ...p, type: e.target.value }))} className="w-full p-2.5 rounded-xl border text-sm outline-none" style={{ background: 'var(--paper-3)', borderColor: 'var(--line-2)' }}>
                            {DEVICE_TYPES.map((t) => <option key={t.value} value={t.value}>{t.icon} {t.label}</option>)}
                          </select>
                        </div>
                      </div>
                      <div className="grid sm:grid-cols-3 gap-3">
                        <div>
                          <label className="block text-xs font-bold mb-1">Connection</label>
                          <select value={deviceForm.connection} onChange={(e) => setDeviceForm((p) => ({ ...p, connection: e.target.value }))} className="w-full p-2.5 rounded-xl border text-sm outline-none" style={{ background: 'var(--paper-3)', borderColor: 'var(--line-2)' }}>
                            {DEVICE_CONNECTIONS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-bold mb-1">{deviceForm.connection === 'network' ? 'IP address : port' : 'Device path / id'}</label>
                          <input value={deviceForm.target} onChange={(e) => setDeviceForm((p) => ({ ...p, target: e.target.value }))} placeholder={deviceForm.connection === 'network' ? '192.168.1.50:9100' : 'optional'} className="w-full p-2.5 rounded-xl border text-sm outline-none font-mono" style={{ background: 'var(--paper-3)', borderColor: 'var(--line-2)' }} />
                        </div>
                        <div>
                          <label className="block text-xs font-bold mb-1">Copies</label>
                          <input type="number" min={1} max={5} value={deviceForm.copies} onChange={(e) => setDeviceForm((p) => ({ ...p, copies: e.target.value }))} className="w-full p-2.5 rounded-xl border text-sm outline-none" style={{ background: 'var(--paper-3)', borderColor: 'var(--line-2)' }} />
                        </div>
                      </div>
                      {deviceForm.type === 'kot_printer' && (
                        <div className="sm:max-w-[200px]">
                          <label className="block text-xs font-bold mb-1">Kitchen station</label>
                          <select value={deviceForm.station} onChange={(e) => setDeviceForm((p) => ({ ...p, station: e.target.value }))} className="w-full p-2.5 rounded-xl border text-sm outline-none capitalize" style={{ background: 'var(--paper-3)', borderColor: 'var(--line-2)' }}>
                            {['kitchen', 'bar', 'dessert'].map((s) => <option key={s} value={s}>{s}</option>)}
                          </select>
                        </div>
                      )}
                      <label className="flex items-center gap-2 text-sm cursor-pointer">
                        <input type="checkbox" checked={deviceForm.isDefault} onChange={(e) => setDeviceForm((p) => ({ ...p, isDefault: e.target.checked }))} />
                        Set as default for this device type
                      </label>
                      <div className="flex gap-2">
                        <button type="submit" className="btn btn-primary">{deviceForm.id ? 'Save device' : 'Add device'}</button>
                        <button type="button" onClick={() => setShowDeviceForm(false)} className="btn" style={{ background: 'var(--paper-3)', border: '1px solid var(--line)' }}>Cancel</button>
                      </div>
                    </form>
                  </section>
                )}

                <section className="card p-5">
                  <h4 className="font-bold mb-3">Registered devices {devices.length > 0 && <span className="text-xs text-ink-3">({devices.length})</span>}</h4>
                  {devices.length === 0 ? (
                    <div className="text-sm text-ink-3 p-4 rounded-xl text-center" style={{ background: 'var(--paper-3)' }}>
                      No devices yet. Click <b>+ Add Device</b> to register your first printer.
                    </div>
                  ) : (
                    <div className="grid gap-2">
                      {devices.map((dev) => {
                        const meta = DEVICE_TYPES.find((t) => t.value === dev.type);
                        return (
                          <div key={dev.id} className="flex flex-wrap items-center gap-3 text-sm p-3 rounded-xl" style={{ background: 'var(--paper-3)' }}>
                            <span className="text-2xl shrink-0">{meta?.icon ?? '🖨️'}</span>
                            <div className="min-w-[140px] flex-1">
                              <b className="block">{dev.name}{dev.isDefault && <span className="ml-2 pill" style={{ color: 'var(--cardamom-d)' }}>● default</span>}</b>
                              <span className="text-xs text-ink-3">
                                {meta?.label ?? dev.type}
                                {dev.station ? <span className="capitalize"> · {dev.station}</span> : null}
                                {' · '}{DEVICE_CONNECTIONS.find((c) => c.value === dev.connection)?.label ?? dev.connection}
                                {dev.target ? <span className="font-mono"> · {dev.target}</span> : null}
                                {' · '}{dev.copies} cop{dev.copies === 1 ? 'y' : 'ies'}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              {!dev.isDefault && <button onClick={() => handleSetDefaultDevice(dev)} className="btn py-1 px-3 text-xs" style={{ background: 'var(--paper-2)', border: '1px solid var(--line)' }}>Set default</button>}
                              <button onClick={() => openDeviceForm(dev)} className="btn py-1 px-3 text-xs" style={{ background: 'var(--paper-2)', border: '1px solid var(--line)' }}>Edit</button>
                              <button onClick={() => handleDeleteDevice(dev.id, dev.name)} className="btn py-1 px-3 text-xs" style={{ background: 'var(--paper-2)', border: '1px solid var(--chilli, #c0392b)', color: 'var(--chilli, #c0392b)' }}>Remove</button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>
              </div>
            )}

            {activeMenu === 'settings' && settingsPanel === 'audit' && (
              <div className="flex flex-col gap-4">
                <section className="card p-5">
                  <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                    <div>
                      <h4 className="font-bold">Audit Logs</h4>
                      <p className="text-xs text-ink-3">Who changed what, and when — across orders, staff, customers, settings and more. Newest first; click a row to see the change.</p>
                    </div>
                    <button onClick={() => loadAudit(1)} disabled={auditBusy} className="btn py-2 px-3 text-sm shrink-0 disabled:opacity-50" style={{ background: 'var(--paper-3)', border: '1px solid var(--line)' }}>↻ Refresh</button>
                  </div>
                  <div className="grid sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-bold mb-1">Action</label>
                      <select value={auditFilters.action} onChange={(e) => setAuditFilters((f) => ({ ...f, action: e.target.value }))} className="w-full p-2.5 rounded-xl border text-sm outline-none" style={{ background: 'var(--paper-3)', borderColor: 'var(--line-2)' }}>
                        <option value="">All actions</option>
                        {auditOptions.actions.map((a) => <option key={a} value={a}>{prettyAction(a)}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-bold mb-1">Entity</label>
                      <select value={auditFilters.entity} onChange={(e) => setAuditFilters((f) => ({ ...f, entity: e.target.value }))} className="w-full p-2.5 rounded-xl border text-sm outline-none capitalize" style={{ background: 'var(--paper-3)', borderColor: 'var(--line-2)' }}>
                        <option value="">All entities</option>
                        {auditOptions.entities.map((en) => <option key={en} value={en}>{en}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-bold mb-1">Staff</label>
                      <select value={auditFilters.actorId} onChange={(e) => setAuditFilters((f) => ({ ...f, actorId: e.target.value }))} className="w-full p-2.5 rounded-xl border text-sm outline-none" style={{ background: 'var(--paper-3)', borderColor: 'var(--line-2)' }}>
                        <option value="">All staff</option>
                        {auditOptions.staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                      </select>
                    </div>
                  </div>
                  {(auditFilters.action || auditFilters.entity || auditFilters.actorId) && (
                    <button onClick={() => setAuditFilters({ action: '', entity: '', actorId: '' })} className="btn mt-3 py-1.5 px-3 text-xs" style={{ background: 'var(--paper-2)', border: '1px solid var(--line)' }}>Clear filters</button>
                  )}
                </section>

                <section className="card p-5">
                  {auditEntries.length === 0 ? (
                    <div className="text-sm text-ink-3 p-4 rounded-xl text-center" style={{ background: 'var(--paper-3)' }}>
                      {auditBusy ? 'Loading…' : 'No audit entries match these filters yet.'}
                    </div>
                  ) : (
                    <div className="grid gap-2">
                      <div className="hidden sm:grid grid-cols-[150px_140px_1fr_130px] gap-3 text-[10px] font-bold uppercase text-ink-3 px-3">
                        <span>Time</span><span>Staff</span><span>Action</span><span>Entity</span>
                      </div>
                      {auditEntries.map((en) => {
                        const open = expandedAuditId === en.id;
                        const diff = auditDiff(en.before, en.after);
                        return (
                          <div key={en.id} className="rounded-xl overflow-hidden" style={{ background: 'var(--paper-3)' }}>
                            <button onClick={() => setExpandedAuditId(open ? null : en.id)} className="w-full text-left grid sm:grid-cols-[150px_140px_1fr_130px] gap-1 sm:gap-3 text-sm p-3 items-center hover:brightness-105 transition">
                              <span className="text-xs text-ink-3 font-mono">{new Date(en.at).toLocaleString()}</span>
                              <span className="font-bold truncate">{en.actorName}</span>
                              <span className="truncate">{prettyAction(en.action)}</span>
                              <span className="text-xs text-ink-3 truncate">{en.entity}{en.entityId ? <span className="font-mono"> · {en.entityId.slice(0, 8)}</span> : null}</span>
                            </button>
                            {open && (
                              <div className="px-3 pb-3 border-t" style={{ borderColor: 'var(--line)' }}>
                                {diff.length === 0 ? (
                                  <p className="text-xs text-ink-3 pt-3">No field-level change recorded for this entry.</p>
                                ) : (
                                  <div className="grid gap-1 pt-3">
                                    {diff.map((row) => (
                                      <div key={row.key} className="grid sm:grid-cols-[160px_1fr] gap-1 sm:gap-3 items-start">
                                        <span className="text-xs font-bold">{row.key}</span>
                                        <span className="text-xs font-mono break-all">
                                          <span style={{ color: 'var(--chilli, #c0392b)' }}>{row.before}</span>
                                          <span className="text-ink-3"> → </span>
                                          <span style={{ color: 'var(--cardamom-d)' }}>{row.after}</span>
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                      {auditHasMore && (
                        <button onClick={() => loadAudit(auditPage + 1, true)} disabled={auditBusy} className="btn mt-1 py-2 text-sm disabled:opacity-50" style={{ background: 'var(--paper-2)', border: '1px solid var(--line)' }}>
                          {auditBusy ? 'Loading…' : 'Load more'}
                        </button>
                      )}
                    </div>
                  )}
                </section>
              </div>
            )}
          </div>
        )}
      </main>

      {/* table QR preview / print modal */}
      {qrTable && (
        <div onClick={() => setQrTable(null)} className="fixed inset-0 z-[8500] grid place-items-center p-5" style={{ background: 'rgba(30,18,10,.5)', backdropFilter: 'blur(6px)' }}>
          <div onClick={(e) => e.stopPropagation()} className="w-[min(380px,100%)]" style={{ background: 'var(--paper-2)', borderRadius: 24, boxShadow: 'var(--sh-3)', border: '1px solid var(--line)' }}>
            <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: 'var(--line)' }}>
              <div>
                <h3 className="text-lg font-bold">Table {qrTable.label}</h3>
                <span className="text-xs text-ink-3">{qrTable.seats} seat{qrTable.seats === 1 ? '' : 's'} · scan to order</span>
              </div>
              <button onClick={() => setQrTable(null)} aria-label="Close" className="btn py-1.5 px-3 text-sm" style={{ background: 'var(--paper-3)', border: '1px solid var(--line)' }}>✕</button>
            </div>
            <div className="p-5 flex flex-col items-center gap-3">
              <div className="rounded-2xl bg-white p-3" style={{ border: '1px solid var(--line-2)' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={tableQrImageUrl(qrTable.qrToken, 480)} alt={`QR code for table ${qrTable.label}`} width={240} height={240} />
              </div>
              <code className="text-[11px] text-ink-3 break-all text-center px-2">{tableOrderUrl(qrTable.qrToken)}</code>
              <div className="grid grid-cols-2 gap-2 w-full mt-1">
                <button onClick={() => printTableQr(qrTable)} className="btn btn-primary py-2.5 text-sm">Print</button>
                <a href={tableQrImageUrl(qrTable.qrToken, 800)} download={`qr-${qrTable.label}.png`} target="_blank" rel="noopener noreferrer" className="btn py-2.5 text-sm text-center" style={{ background: 'var(--paper-3)', border: '1px solid var(--line)' }}>Download</a>
                <button onClick={() => copyTableLink(qrTable)} className="btn py-2.5 text-sm" style={{ background: 'var(--paper-3)', border: '1px solid var(--line)' }}>Copy link</button>
                <button onClick={() => handleRegenerateQr(qrTable)} disabled={floorBusy} className="btn py-2.5 text-sm disabled:opacity-50" style={{ background: 'var(--paper-3)', border: '1px solid var(--chilli, #c0392b)', color: 'var(--chilli, #c0392b)' }}>Rotate QR</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* supplier statement modal */}
      {statement && (
        <div onClick={() => setStatement(null)} className="fixed inset-0 z-[8500] grid place-items-center p-5" style={{ background: 'rgba(30,18,10,.5)', backdropFilter: 'blur(6px)' }}>
          <div onClick={(e) => e.stopPropagation()} className="w-[min(640px,100%)] max-h-[88vh] overflow-auto" style={{ background: 'var(--paper-2)', borderRadius: 24, boxShadow: 'var(--sh-3)', border: '1px solid var(--line)' }}>
            <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: 'var(--line)' }}>
              <div>
                <h3 className="text-lg font-bold">{statement.vendor.name}</h3>
                <span className="text-xs text-ink-3">{statement.vendor.phone ?? ''}{statement.vendor.gstin ? ` · ${statement.vendor.gstin}` : ''}</span>
              </div>
              <div className="text-right">
                <span className="block text-[11px] text-ink-3 uppercase">Balance</span>
                <span className="font-mono font-bold text-lg" style={{ color: statement.balancePaise > 0 ? 'var(--clay)' : 'var(--cardamom-d)' }}>{formatINR(statement.balancePaise)}</span>
              </div>
            </div>
            <div className="p-5">
              <h4 className="font-bold text-sm mb-2">Statement</h4>
              {!statement.ledger?.length ? (
                <p className="text-sm text-ink-3">No transactions yet.</p>
              ) : (
                <div className="grid gap-1.5">
                  <div className="grid grid-cols-[1fr_auto_auto_auto] gap-3 text-[10px] font-bold uppercase text-ink-3 px-3">
                    <span>Entry</span><span className="text-right">Debit</span><span className="text-right">Credit</span><span className="text-right">Balance</span>
                  </div>
                  {statement.ledger.map((e: any) => (
                    <div key={e.id} className="grid grid-cols-[1fr_auto_auto_auto] gap-3 text-sm p-3 rounded-xl items-center" style={{ background: 'var(--paper-3)' }}>
                      <div>
                        <span className="font-bold">{e.label}</span>
                        <span className="block text-[11px] text-ink-3">{new Date(e.at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' })}</span>
                      </div>
                      <span className="text-right font-mono" style={{ color: e.debitPaise ? 'var(--clay)' : 'var(--ink-3)' }}>{e.debitPaise ? formatINR(e.debitPaise) : '—'}</span>
                      <span className="text-right font-mono" style={{ color: e.creditPaise ? 'var(--cardamom-d)' : 'var(--ink-3)' }}>{e.creditPaise ? formatINR(e.creditPaise) : '—'}</span>
                      <span className="text-right font-mono font-bold">{formatINR(e.balancePaise)}</span>
                    </div>
                  ))}
                </div>
              )}
              <button onClick={() => setStatement(null)} className="btn btn-dark w-full mt-4">Close</button>
            </div>
          </div>
        </div>
      )}

      {/* order detail modal — full bill, printable */}
      {orderDetail && (
        <div onClick={() => setOrderDetail(null)} className="fixed inset-0 z-[8500] grid place-items-center p-5" style={{ background: 'rgba(30,18,10,.5)', backdropFilter: 'blur(6px)' }}>
          <div onClick={(e) => e.stopPropagation()} className="w-[min(560px,100%)] max-h-[88vh] overflow-auto" style={{ background: 'var(--paper-2)', borderRadius: 24, boxShadow: 'var(--sh-3)', border: '1px solid var(--line)' }}>
            <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: 'var(--line)' }}>
              <div>
                <h3 className="text-lg font-bold">Order #{orderDetail.number}</h3>
                <span className="text-xs text-ink-3">
                  {orderDetail.table?.label ? `Table ${orderDetail.table.label}` : orderDetail.type} · {new Date(orderDetail.placedAt).toLocaleString('en-IN')}
                </span>
              </div>
              <span className="pill text-[10px] uppercase">{orderDetail.status}</span>
            </div>
            <div className="p-5">
              <div className="flex flex-col gap-1.5 border-b pb-3 mb-3" style={{ borderColor: 'var(--line)' }}>
                {orderDetail.items.map((i: any, idx: number) => (
                  <div key={idx} className="flex justify-between text-sm">
                    <span><b className="mr-1.5" style={{ color: 'var(--turmeric-d)' }}>{i.qty}×</b>{i.nameSnapshot}{i.station ? <span className="text-[10px] text-ink-3 ml-1.5 uppercase">{i.station}</span> : null}</span>
                    <span className="tnum" style={{ fontFamily: 'var(--font-mono)' }}>{formatINR(i.unitPricePaise * i.qty)}</span>
                  </div>
                ))}
              </div>
              <div className="grid gap-1 text-sm">
                <Line label="Subtotal" val={formatINR(orderDetail.subtotalPaise)} />
                {orderDetail.discountPaise > 0 && <Line label="Discount" val={`− ${formatINR(orderDetail.discountPaise)}`} />}
                {orderDetail.cgstPaise > 0 && <Line label="CGST" val={formatINR(orderDetail.cgstPaise)} />}
                {orderDetail.sgstPaise > 0 && <Line label="SGST" val={formatINR(orderDetail.sgstPaise)} />}
                {orderDetail.igstPaise > 0 && <Line label="IGST" val={formatINR(orderDetail.igstPaise)} />}
                {orderDetail.serviceChargePaise > 0 && <Line label="Service charge" val={formatINR(orderDetail.serviceChargePaise)} />}
                <Line label="Round off" val={formatINR(orderDetail.roundOffPaise)} />
                <div className="flex justify-between font-extrabold font-display text-lg mt-1 pt-2 border-t" style={{ borderColor: 'var(--line)' }}>
                  <span>Total</span><span className="tnum" style={{ fontFamily: 'var(--font-mono)' }}>{formatINR(orderDetail.totalPaise)}</span>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 mt-5">
                <button onClick={() => printOrderBill(orderDetail)} className="btn btn-primary">🖨 Print bill</button>
                <button onClick={() => printOrderKOT(orderDetail)} className="btn" style={{ background: 'var(--paper-3)', border: '1px solid var(--line)' }}>🧾 Print KOT</button>
                <button onClick={() => setOrderDetail(null)} className="btn btn-dark">Close</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div role="status" aria-live="polite" className="anim-slide-in fixed left-1/2 -translate-x-1/2 bottom-7 z-[9000] px-5 py-3 rounded-full font-bold text-sm shadow-3" style={{ background: 'var(--ink)', color: 'var(--paper-2)' }}>
          {toast}
        </div>
      )}
    </div>
  );
}

function Line({ label, val }: { label: string; val: string }) {
  return (
    <div className="flex justify-between py-0.5" style={{ color: 'var(--ink-2)' }}>
      <span>{label}</span><span className="tnum" style={{ fontFamily: 'var(--font-mono)' }}>{val}</span>
    </div>
  );
}

function KpiCard({ label, value, tone }: { label: string; value: string; tone?: 'cardamom' | 'gold' }) {
  const color = tone === 'cardamom' ? 'var(--cardamom-d)' : tone === 'gold' ? 'var(--gold)' : undefined;
  return (
    <section className="card p-4">
      <span className="block text-xs mb-2 text-ink-3">{label}</span>
      <span className="block text-2xl md:text-3xl font-bold tnum font-mono" style={{ color }}>{value}</span>
    </section>
  );
}

// quick-prompt chips per language
const PROMPTS: Record<'en' | 'ml', string[]> = {
  en: ['Why up today?', 'Promote tonight?', 'Who to win back?', 'Busiest hours?'],
  ml: ['ഇന്നത്തെ വിൽപ്പന?', 'എന്ത് പ്രമോട്ട് ചെയ്യണം?', 'ആരെ തിരികെ കൊണ്ടുവരണം?', 'തിരക്കുള്ള സമയം?'],
};

function Assistant() {
  const [msgs, setMsgs] = useState<Msg[]>([
    { who: 'ai', html: 'Ask me anything — “why are sales down?”, “what to promote?” · മലയാളത്തിലും ചോദിക്കാം 🎙️' },
  ]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [uiLang, setUiLang] = useState<'en' | 'ml'>('en'); // drives quick chips + mic locale
  const [speakOn, setSpeakOn] = useState(true); // read replies aloud
  const [listening, setListening] = useState(false);
  const [voiceOk, setVoiceOk] = useState(false); // speech-recognition support (set client-side)
  const scroll = useRef<HTMLDivElement>(null);
  const recRef = useRef<any>(null);

  useEffect(() => {
    scroll.current?.scrollTo({ top: scroll.current.scrollHeight, behavior: 'smooth' });
  }, [msgs, busy]);

  // feature-detect the Web Speech API on the client (avoids SSR hydration mismatch)
  useEffect(() => {
    setVoiceOk(typeof window !== 'undefined' && ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window));
    return () => { try { window.speechSynthesis?.cancel(); } catch {} };
  }, []);

  // read an AI reply aloud in the language the server answered in
  function speak(html: string, lang: 'en' | 'ml') {
    if (!speakOn || typeof window === 'undefined' || !window.speechSynthesis) return;
    const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (!text) return;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang === 'ml' ? 'ml-IN' : 'en-IN';
    const match = window.speechSynthesis.getVoices().find((v) => v.lang === u.lang);
    if (match) u.voice = match;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  }

  async function ask(q: string) {
    if (!q.trim() || busy) return;
    setMsgs((m) => [...m, { who: 'me', html: q }]);
    setInput('');
    setBusy(true);
    try {
      const res = await fetch('/api/dashboard/assistant', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ q }),
      });
      const { reply, lang } = await res.json();
      const safe = reply ?? 'Sorry, I couldn’t read that.';
      setMsgs((m) => [...m, { who: 'ai', html: safe }]);
      speak(safe, lang === 'ml' ? 'ml' : 'en');
    } catch {
      setMsgs((m) => [...m, { who: 'ai', html: 'Network hiccup — try again in a moment.' }]);
    } finally {
      setBusy(false);
    }
  }

  // mic: dictate the question (Malayalam or English per the language toggle)
  function toggleMic() {
    const SR: any = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;
    if (listening) { recRef.current?.stop(); return; }
    const rec = new SR();
    rec.lang = uiLang === 'ml' ? 'ml-IN' : 'en-IN';
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.onresult = (e: any) => {
      const said = e.results?.[0]?.[0]?.transcript ?? '';
      if (said) ask(said);
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recRef.current = rec;
    setListening(true);
    try { rec.start(); } catch { setListening(false); }
  }

  return (
    <section className="card col-span-2 p-5 flex flex-col" style={{ minHeight: 320 }}>
      <div className="flex items-center justify-between mb-3">
        <span className="font-bold text-xs" style={{ color: 'var(--berry)' }}>🤖 Sales Assistant</span>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setUiLang((l) => (l === 'en' ? 'ml' : 'en'))}
            className="text-[10px] font-bold px-2 py-1 rounded-full"
            style={{ background: 'var(--paper-3)', border: '1px solid var(--line)', color: 'var(--ink-2)' }}
            title="Question language for the mic"
          >{uiLang === 'en' ? 'EN' : 'മ'}</button>
          <button
            onClick={() => { setSpeakOn((s) => { if (s) window.speechSynthesis?.cancel(); return !s; }); }}
            className="text-[12px] px-2 py-1 rounded-full"
            style={{ background: speakOn ? 'color-mix(in srgb, var(--berry) 16%, var(--paper-3))' : 'var(--paper-3)', border: '1px solid var(--line)' }}
            title={speakOn ? 'Voice replies on' : 'Voice replies off'}
          >{speakOn ? '🔊' : '🔇'}</button>
        </div>
      </div>

      <div ref={scroll} className="flex-1 overflow-y-auto flex flex-col gap-2.5 mb-3 pr-1" style={{ maxHeight: 220 }}>
        {msgs.map((m, i) => (
          <div
            key={i}
            className="text-sm px-3 py-2 rounded-2xl max-w-[88%]"
            style={m.who === 'me'
              ? { alignSelf: 'flex-end', background: 'var(--turmeric)', color: '#2A1607', fontWeight: 600 }
              : { alignSelf: 'flex-start', background: 'var(--paper-3)', color: 'var(--ink-2)', border: '1px solid var(--line)' }}
            dangerouslySetInnerHTML={{ __html: m.html }}
          />
        ))}
        {busy && (
          <div className="text-sm px-3 py-2.5 rounded-2xl self-start flex gap-1" style={{ background: 'var(--paper-3)', border: '1px solid var(--line)' }}>
            <span className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: 'var(--ink-3)' }} />
            <span className="w-1.5 h-1.5 rounded-full animate-bounce delay-150" style={{ background: 'var(--ink-3)' }} />
            <span className="w-1.5 h-1.5 rounded-full animate-bounce delay-300" style={{ background: 'var(--ink-3)' }} />
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5 mb-2.5">
        {PROMPTS[uiLang].map((q) => (
          <button key={q} onClick={() => ask(q)} disabled={busy} className="pill text-xs disabled:opacity-50 hover:-translate-y-0.5 transition">{q}</button>
        ))}
      </div>

      <div className="flex gap-2">
        {voiceOk && (
          <button
            onClick={toggleMic}
            disabled={busy}
            className="btn"
            style={{ padding: '0 14px', background: listening ? 'var(--clay)' : 'var(--paper-3)', color: listening ? '#fff' : 'var(--ink)', border: '1px solid var(--line-2)' }}
            title={listening ? 'Listening… tap to stop' : `Speak (${uiLang === 'ml' ? 'മലയാളം' : 'English'})`}
          >{listening ? '⏺' : '🎙️'}</button>
        )}
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && ask(input)}
          placeholder={uiLang === 'ml' ? 'ചോദിക്കൂ…' : 'Ask the assistant…'}
          className="flex-1 px-3 py-2.5 rounded-xl text-sm outline-none"
          style={{ background: 'var(--paper-3)', border: '1px solid var(--line-2)', color: 'var(--ink)' }}
        />
        <button onClick={() => ask(input)} disabled={busy || !input.trim()} className="btn btn-dark" style={{ padding: '0 16px' }}>↑</button>
      </div>
    </section>
  );
}

/* ============================ PWA settings helpers ============================ */
const PWA_INPUT = 'w-full p-2.5 rounded-xl border text-sm outline-none bg-[var(--paper-3)] border-[var(--line-2)]';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-bold mb-1">{label}</label>
      {children}
    </div>
  );
}

function Toggle({ label, on, onChange }: { label: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={on} onClick={() => onChange(!on)} className="flex items-center justify-between gap-3 p-3 rounded-xl border w-full text-left" style={{ borderColor: 'var(--line)', background: 'var(--paper-3)' }}>
      <span className="text-sm font-semibold">{label}</span>
      <span className="relative shrink-0 rounded-full transition-colors" style={{ width: 44, height: 26, background: on ? 'var(--cardamom)' : 'var(--line-2)' }}>
        <span className="absolute top-[3px] rounded-full bg-white transition-all" style={{ width: 20, height: 20, left: on ? 21 : 3, boxShadow: 'var(--sh-1)' }} />
      </span>
    </button>
  );
}

function PwaFeaturedForm({ items, busy, uploadImage, onAdd }: {
  items: { id: string; name: string; pricePaise: number; categoryName: string | null }[];
  busy: boolean;
  uploadImage: (f: File) => Promise<string | null>;
  onAdd: (dish: { itemId: string; label: string | null; priority: number; imageUrl: string | null }) => Promise<boolean>;
}) {
  const [itemId, setItemId] = useState('');
  const [label, setLabel] = useState<string>('best_seller');
  const [priority, setPriority] = useState('0');
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  return (
    <div className="flex flex-wrap items-end gap-3 p-3 rounded-xl" style={{ background: 'var(--paper-3)' }}>
      <Field label="Dish">
        <select value={itemId} onChange={(e) => setItemId(e.target.value)} className="p-2.5 rounded-xl border text-sm outline-none min-w-[180px]" style={{ background: 'var(--paper-2)', borderColor: 'var(--line-2)' }}>
          <option value="">Select a dish…</option>
          {items.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
        </select>
      </Field>
      <Field label="Label">
        <select value={label} onChange={(e) => setLabel(e.target.value)} className="p-2.5 rounded-xl border text-sm outline-none" style={{ background: 'var(--paper-2)', borderColor: 'var(--line-2)' }}>
          {FEATURED_LABELS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
        </select>
      </Field>
      <Field label="Priority"><input type="number" value={priority} onChange={(e) => setPriority(e.target.value)} className="w-20 p-2.5 rounded-xl border text-sm outline-none" style={{ background: 'var(--paper-2)', borderColor: 'var(--line-2)' }} /></Field>
      <Field label="Image override (optional)"><input type="file" accept="image/*" onChange={async (e) => { const f = e.target.files?.[0]; if (f) setImageUrl(await uploadImage(f)); }} className="text-xs" /></Field>
      <button
        disabled={busy || !itemId}
        onClick={async () => { if (await onAdd({ itemId, label, priority: Number(priority) || 0, imageUrl })) { setItemId(''); setImageUrl(null); } }}
        className="btn btn-primary py-2.5 px-4 text-sm disabled:opacity-50"
      >+ Add featured</button>
    </div>
  );
}

function PwaBannerForm({ busy, uploadImage, onAdd }: {
  busy: boolean;
  uploadImage: (f: File) => Promise<string | null>;
  onAdd: (banner: { imageUrl: string; title: string; link: string | null; startAt: string | null; endAt: string | null; order: number }) => Promise<boolean>;
}) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [link, setLink] = useState('');
  const [startAt, setStartAt] = useState('');
  const [endAt, setEndAt] = useState('');
  const [order, setOrder] = useState('0');
  return (
    <div className="grid sm:grid-cols-2 gap-3 p-3 rounded-xl" style={{ background: 'var(--paper-3)' }}>
      <Field label="Poster image">
        <div className="flex items-center gap-2">
          {imageUrl && <img src={imageUrl} alt="" className="rounded object-cover" style={{ width: 56, height: 34 }} />}
          <input type="file" accept="image/*" onChange={async (e) => { const f = e.target.files?.[0]; if (f) setImageUrl(await uploadImage(f)); }} className="text-xs" />
        </div>
      </Field>
      <Field label="Title"><input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Buy 2 Get 1 Free" className={PWA_INPUT} /></Field>
      <Field label="Link (optional)"><input value={link} onChange={(e) => setLink(e.target.value)} placeholder="/app or https://…" className={PWA_INPUT} /></Field>
      <Field label="Display order"><input type="number" value={order} onChange={(e) => setOrder(e.target.value)} className={PWA_INPUT} /></Field>
      <Field label="Start date (optional)"><input type="date" value={startAt} onChange={(e) => setStartAt(e.target.value)} className={PWA_INPUT} /></Field>
      <Field label="End date (optional)"><input type="date" value={endAt} onChange={(e) => setEndAt(e.target.value)} className={PWA_INPUT} /></Field>
      <div className="sm:col-span-2">
        <button
          disabled={busy || !imageUrl}
          onClick={async () => { if (imageUrl && (await onAdd({ imageUrl, title, link: link || null, startAt: startAt || null, endAt: endAt || null, order: Number(order) || 0 }))) { setImageUrl(null); setTitle(''); setLink(''); setStartAt(''); setEndAt(''); } }}
          className="btn btn-primary py-2.5 px-4 text-sm disabled:opacity-50"
        >+ Add banner</button>
      </div>
    </div>
  );
}
