
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { formatCurrency, safeDateISO } from '../services/financeUtils';
import { Wallet, Plus, Trash2, X, Save, Percent, DollarSign, GripVertical, CheckCircle2, Circle, PieChart, TrendingUp, AlertCircle, ArrowRight, Layers, Target, Calendar as CalendarIcon, Upload, FileText, Image as ImageIcon, FileSpreadsheet, Download, RefreshCw, ChevronLeft, ChevronRight, Landmark, CreditCard, Tag, Copy, Edit2, History, ShoppingBag, Coffee, Bus, Zap, Activity, Home, Gift, Book, Heart } from 'lucide-react';
import { ExpenseItem, DailyExpense, SinkingFund, BankAccount } from '../types';
import { getConfig } from '../services/mockDb';
import { saveItemToCloud, deleteFromCloud } from '../services/cloudSync';
import { parseTransactionAI } from '../services/geminiService';
import ConfirmDialog from '../components/ui/ConfirmDialog';

interface AllocationProps {
  monthlyExpenses: Record<string, ExpenseItem[]>;
  setMonthlyExpenses: React.Dispatch<React.SetStateAction<Record<string, ExpenseItem[]>>>;
  onAddToDailyLog: (expense: DailyExpense) => void;
  dailyExpenses: DailyExpense[]; 
  onToggleAllocation: (id: string) => void; 
  sinkingFunds: SinkingFund[];
  setSinkingFunds: React.Dispatch<React.SetStateAction<SinkingFund[]>>;
  userId: string;
  bankAccounts?: BankAccount[]; 
  setBankAccounts?: React.Dispatch<React.SetStateAction<BankAccount[]>>; 
}

const AVAILABLE_ICONS = [
    { id: 'shopping-bag', icon: ShoppingBag, label: 'Shopping' },
    { id: 'coffee', icon: Coffee, label: 'Food' },
    { id: 'bus', icon: Bus, label: 'Transport' },
    { id: 'zap', icon: Zap, label: 'Utility' },
    { id: 'activity', icon: Activity, label: 'Health' },
    { id: 'home', icon: Home, label: 'Home' },
    { id: 'gift', icon: Gift, label: 'Gift' },
    { id: 'book', icon: Book, label: 'Edu' },
    { id: 'heart', icon: Heart, label: 'Charity' },
    { id: 'tag', icon: Tag, label: 'Other' },
];

const AVAILABLE_COLORS = [
    'bg-slate-500', 'bg-red-500', 'bg-orange-500', 'bg-amber-500', 
    'bg-green-500', 'bg-emerald-500', 'bg-teal-500', 'bg-cyan-500',
    'bg-blue-500', 'bg-indigo-500', 'bg-violet-500', 'bg-purple-500', 
    'bg-fuchsia-500', 'bg-pink-500', 'bg-rose-500'
];

export default function Allocation({ monthlyExpenses, setMonthlyExpenses, onToggleAllocation, userId, sinkingFunds, setSinkingFunds, bankAccounts = [], setBankAccounts, dailyExpenses = [] }: AllocationProps) {
  const [currentDate, setCurrentDate] = useState(new Date());
  
  const getMonthKey = (date: Date) => {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      return `${year}-${month}`;
  };

  const currentMonthKey = getMonthKey(currentDate);
  
  const [localList, setLocalList] = useState<ExpenseItem[]>([]);
  
  // Confirmation Modal State
  const [confirmConfig, setConfirmConfig] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  }>({ isOpen: false, title: '', message: '', onConfirm: () => {} });
  
  useEffect(() => {
      setLocalList(monthlyExpenses[currentMonthKey] || []);
  }, [monthlyExpenses, currentMonthKey]);

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  
  const [isSfFormOpen, setIsSfFormOpen] = useState(false);
  const [editingSfId, setEditingSfId] = useState<string | null>(null);
  const [showSfHistoryId, setShowSfHistoryId] = useState<string | null>(null);
  const [showAllocHistoryId, setShowAllocHistoryId] = useState<string | null>(null); // New State for Alloc History
  
  // DnD State
  const [draggedItemIndex, setDraggedItemIndex] = useState<number | null>(null);
  const dragItemNode = useRef<any>(null);
  
  // Smart Form State
  const [mode, setMode] = useState<'fixed' | 'percent'>('fixed');
  const [formData, setFormData] = useState({ 
      name: '', amount: 0, percent: 0, category: 'needs', priority: 1, 
      isRecurring: true, assignedAccountId: '', icon: 'tag', color: 'bg-slate-500' 
  });
  const [isSaving, setIsSaving] = useState(false);

  // Sinking Fund State
  const [sfFormData, setSfFormData] = useState<{
      name: string;
      target: number;
      current: number;
      deadline: string;
      category: string;
      assignedAccountId: string;
  }>({ name: '', target: 0, current: 0, deadline: '', category: 'Other', assignedAccountId: '' });

  const BASE_INCOME = 15000000; 

  // --- METRICS ---
  const metrics = useMemo(() => {
      const total = localList.reduce((a,b) => a + Number(b.amount), 0);
      const needs = localList.filter(i => i.category === 'needs').reduce((a,b) => a + Number(b.amount), 0);
      const wants = localList.filter(i => i.category === 'wants').reduce((a,b) => a + Number(b.amount), 0);
      const savings = localList.filter(i => i.category === 'debt' || i.category === 'savings').reduce((a,b) => a + Number(b.amount), 0);
      
      return { total, needs, wants, savings };
  }, [localList]);

  // --- CALENDAR HANDLERS ---
  const handleYearChange = (increment: number) => {
      const newDate = new Date(currentDate);
      newDate.setFullYear(newDate.getFullYear() + increment);
      setCurrentDate(newDate);
  };

  const handleMonthSelect = (monthIndex: number) => {
      const newDate = new Date(currentDate);
      newDate.setMonth(monthIndex);
      setCurrentDate(newDate);
  };

  // --- DRAG AND DROP ---
  const handleDragStart = (e: React.DragEvent, index: number) => {
      setDraggedItemIndex(index);
      dragItemNode.current = index;
      e.dataTransfer.effectAllowed = "move";
  };

  const handleDragEnter = (e: React.DragEvent, index: number) => {
      if (dragItemNode.current !== null && dragItemNode.current !== index) {
          const newList = [...localList];
          const item = newList[dragItemNode.current];
          newList.splice(dragItemNode.current, 1);
          newList.splice(index, 0, item);
          setDraggedItemIndex(index);
          dragItemNode.current = index;
          setLocalList(newList);
      }
  };

  const handleDragEnd = async () => {
      setDraggedItemIndex(null);
      dragItemNode.current = null;
      setMonthlyExpenses(prev => ({ ...prev, [currentMonthKey]: localList }));
  };

  // --- HELPERS ---
  const getUsedAmount = (allocId: string) => {
      return dailyExpenses
          .filter(e => e.allocationId === allocId)
          .reduce((sum, e) => sum + Number(e.amount), 0);
  };

  // --- CRUD OPERATIONS ---
  const handleSave = async (e: React.FormEvent) => {
      e.preventDefault(); 
      if (!formData.name || !formData.amount) return;
      
      // Validation: Cannot set amount lower than used
      if (editingId) {
          const used = getUsedAmount(editingId);
          if (Number(formData.amount) < used) {
              alert(`Gagal: Nominal tidak boleh lebih kecil dari dana yang sudah terpakai (${formatCurrency(used)})`);
              return;
          }
      }

      setIsSaving(true);

      const newItem: any = {
          id: editingId || `alloc-${Date.now()}`,
          userId: userId, 
          name: formData.name, 
          amount: Number(formData.amount), 
          category: formData.category || 'needs',
          priority: localList.length + 1, 
          isTransferred: false, 
          isRecurring: formData.isRecurring,
          assignedAccountId: formData.assignedAccountId, // Link Bank ID
          monthKey: currentMonthKey,
          
          // NEW FIELDS
          percentage: Number(formData.percent),
          icon: formData.icon,
          color: formData.color,
          
          updatedAt: new Date().toISOString()
      };

      // 1. Optimistic UI Update (Current Month)
      const updatedList = editingId 
          ? localList.map(i => i.id === editingId ? { ...newItem, isTransferred: i.isTransferred } : i) // Preserve isTransferred on edit
          : [...localList, newItem];
      
      setLocalList(updatedList);
      setMonthlyExpenses(prev => ({ ...prev, [currentMonthKey]: updatedList }));
      setIsFormOpen(false);

      try {
          // 2. Server Sync (Current Month)
          await saveItemToCloud('allocations', newItem, !editingId);

          // 3. Handle Recurring (Future Months) - Create copies for the rest of year
          if (formData.isRecurring && !editingId) {
              const currentMonthIdx = currentDate.getMonth();
              const year = currentDate.getFullYear();
              
              const recurringPromises = [];
              // Start from next month until December
              for (let m = currentMonthIdx + 1; m < 12; m++) {
                  const futureMonthKey = `${year}-${String(m+1).padStart(2,'0')}`;
                  const futureItem = {
                      ...newItem,
                      id: `alloc-${Date.now()}-${m}`, // Unique ID
                      monthKey: futureMonthKey,
                      updatedAt: new Date().toISOString()
                  };
                  
                  // Update Local State for future month if loaded
                  setMonthlyExpenses(prev => ({
                      ...prev,
                      [futureMonthKey]: [...(prev[futureMonthKey] || []), futureItem]
                  }));

                  recurringPromises.push(saveItemToCloud('allocations', futureItem, true));
              }
              
              if (recurringPromises.length > 0) {
                  await Promise.all(recurringPromises);
              }
          }

      } catch (e) {
          alert("Gagal menyimpan ke cloud. Perubahan tersimpan lokal.");
      } finally {
          setIsSaving(false);
      }
  };

  const handleDeleteAllocationClick = (id: string) => {
      const used = getUsedAmount(id);
      if (used > 0) {
          alert(`Tidak dapat menghapus pos ini karena sudah ada transaksi sebesar ${formatCurrency(used)}.`);
          return;
      }

      setConfirmConfig({
          isOpen: true,
          title: "Hapus Pos Anggaran?",
          message: "Apakah Anda yakin ingin menghapus pos anggaran ini?",
          onConfirm: () => {
              executeDeleteAllocation(id);
              setConfirmConfig(prev => ({ ...prev, isOpen: false }));
          }
      });
  };

  const executeDeleteAllocation = async (id: string) => {
      // 1. Optimistic Update
      const updatedList = localList.filter(i => i.id !== id);
      setLocalList(updatedList);
      setMonthlyExpenses(prev => ({ ...prev, [currentMonthKey]: updatedList }));
      
      // 2. Server Sync
      await deleteFromCloud(userId, 'allocations', id);
  };

  const handleToggle = async (id: string) => {
      const updatedList = localList.map(i => i.id === id ? { ...i, isTransferred: !i.isTransferred } : i);
      setLocalList(updatedList);
      const item = updatedList.find(i => i.id === id);
      if(item) await saveItemToCloud('allocations', item, false);
  };

  // --- SINKING FUND HANDLERS ---
  const openSfModal = (sf?: SinkingFund) => {
      if (sf) {
          setEditingSfId(sf.id);
          setSfFormData({
              name: sf.name,
              target: sf.targetAmount,
              current: sf.currentAmount, // This will be read-only
              deadline: sf.deadline,
              category: sf.category || 'Other',
              assignedAccountId: sf.assignedAccountId || ''
          });
      } else {
          setEditingSfId(null);
          setSfFormData({ name: '', target: 0, current: 0, deadline: '', category: 'Other', assignedAccountId: '' });
      }
      setIsSfFormOpen(true);
  };

  const handleSaveSF = async (e: React.FormEvent) => {
      e.preventDefault();
      
      // Maintain ID if editing
      const sfId = editingSfId || `sf-${Date.now()}`;
      
      const newSf: SinkingFund = {
          id: sfId,
          userId,
          name: sfFormData.name,
          targetAmount: Number(sfFormData.target),
          currentAmount: Number(sfFormData.current),
          deadline: sfFormData.deadline,
          category: sfFormData.category as any,
          assignedAccountId: sfFormData.assignedAccountId,
          icon: 'target',
          color: 'bg-blue-500',
          updatedAt: new Date().toISOString()
      };

      if (editingSfId) {
          setSinkingFunds(prev => prev.map(s => s.id === editingSfId ? newSf : s));
      } else {
          setSinkingFunds(prev => [...prev, newSf]);
      }
      
      setIsSfFormOpen(false);
      await saveItemToCloud('sinkingFunds', newSf, !editingSfId);
  };

  const handleDeleteSFClick = (id: string) => {
      setConfirmConfig({
          isOpen: true,
          title: "Hapus Kantong?",
          message: "Apakah Anda yakin ingin menghapus kantong ini? Dana yang sudah terkumpul akan hilang dari tracking.",
          onConfirm: () => {
              executeDeleteSF(id);
              setConfirmConfig(prev => ({ ...prev, isOpen: false }));
          }
      });
  };

  const executeDeleteSF = async (id: string) => {
      setSinkingFunds(prev => prev.filter(s => s.id !== id));
      await deleteFromCloud(userId, 'sinkingFunds', id);
  };

  // --- UI HELPERS ---
  const getCategoryColor = (cat: string) => {
      switch(cat) {
          case 'needs': return 'bg-blue-500';
          case 'wants': return 'bg-amber-500';
          case 'debt': return 'bg-red-500';
          default: return 'bg-slate-500';
      }
  };

  const renderIcon = (iconName: string | undefined, size: number = 16) => {
      const found = AVAILABLE_ICONS.find(i => i.id === iconName);
      const IconComp = found ? found.icon : Tag;
      return <IconComp size={size} />;
  };

  const getMonthlyTotal = (year: number, monthIdx: number) => {
      const key = `${year}-${String(monthIdx+1).padStart(2,'0')}`;
      const items = monthlyExpenses[key] || [];
      return items.reduce((a,b) => a + Number(b.amount || 0), 0);
  };

  const calculateMonthlySaving = () => {
      if (!sfFormData.target || !sfFormData.deadline) return 0;
      const targetDate = new Date(sfFormData.deadline);
      const today = new Date();
      const months = (targetDate.getFullYear() - today.getFullYear()) * 12 + (targetDate.getMonth() - today.getMonth());
      if (months <= 0) return sfFormData.target - sfFormData.current;
      return Math.ceil((sfFormData.target - sfFormData.current) / months);
  };

  const monthNames = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

  return (
    <div className="space-y-8 pb-24 animate-fade-in font-sans">
       
       {/* 1. SMART BUDGET COCKPIT HEADER */}
       <div className="bg-slate-900 rounded-[2.5rem] p-8 text-white relative overflow-hidden shadow-2xl border border-slate-800">
          <div className="absolute top-0 right-0 p-12 opacity-5"><PieChart size={200}/></div>
          
          <div className="relative z-10 grid grid-cols-1 md:grid-cols-2 gap-8 items-end">
              <div>
                  <h2 className="text-3xl font-black tracking-tight mb-1">Budget Cockpit</h2>
                  <p className="text-slate-400 text-sm font-medium mb-6">Atur pos pengeluaran sebelum uang habis tak berbekas.</p>
                  
                  <div className="flex flex-col gap-1">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Total Alokasi</span>
                      <div className="text-5xl font-black tracking-tighter text-white">
                          {formatCurrency(metrics.total)}
                      </div>
                      <div className="flex items-center gap-2 mt-2">
                          <span className="text-xs font-bold text-slate-400">Dari Income:</span>
                          <span className="text-xs font-bold text-brand-400">{formatCurrency(BASE_INCOME)}</span>
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-black uppercase ${metrics.total > BASE_INCOME ? 'bg-red-500 text-white' : 'bg-green-500 text-green-900'}`}>
                              {metrics.total > BASE_INCOME ? 'Over Budget!' : `${((metrics.total/BASE_INCOME)*100).toFixed(0)}% Used`}
                          </span>
                      </div>
                  </div>
              </div>

              {/* VISUAL BREAKDOWN BAR */}
              <div className="bg-slate-800/50 p-6 rounded-3xl border border-white/10 backdrop-blur-md">
                  <div className="flex justify-between items-center mb-4">
                      <h3 className="text-xs font-black uppercase tracking-widest text-slate-400">Smart Split</h3>
                      <div className="flex gap-2">
                          <button onClick={() => { setEditingId(null); setFormData({ name: '', amount: 0, percent: 0, category: 'needs', priority: 1, isRecurring: true, assignedAccountId: '', icon: 'tag', color: 'bg-slate-500' }); setIsFormOpen(true); }} className="bg-white text-slate-900 px-4 py-2 rounded-xl font-bold text-[10px] uppercase tracking-widest hover:bg-brand-50 transition shadow-lg flex items-center gap-2 transform active:scale-95">
                              <Plus size={14}/> New Post
                          </button>
                      </div>
                  </div>
                  
                  {/* The Bar */}
                  <div className="flex h-4 w-full rounded-full overflow-hidden bg-slate-900 mb-3">
                      <div className="bg-blue-500 h-full transition-all duration-500" style={{ width: `${(metrics.needs / (metrics.total || 1)) * 100}%` }}></div>
                      <div className="bg-amber-500 h-full transition-all duration-500" style={{ width: `${(metrics.wants / (metrics.total || 1)) * 100}%` }}></div>
                      <div className="bg-red-500 h-full transition-all duration-500" style={{ width: `${(metrics.savings / (metrics.total || 1)) * 100}%` }}></div>
                  </div>

                  {/* Legend */}
                  <div className="flex justify-between text-[10px] font-bold text-slate-300">
                      <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-blue-500"></div> Needs ({formatCurrency(metrics.needs)})</div>
                      <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-amber-500"></div> Wants ({formatCurrency(metrics.wants)})</div>
                      <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-red-500"></div> Debt/Sav ({formatCurrency(metrics.savings)})</div>
                  </div>
              </div>
          </div>
       </div>

       <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
           {/* LEFT: SINKING FUNDS & CALENDAR */}
           <div className="lg:col-span-1 space-y-6">
               
               {/* 2. SINKING FUNDS & BANK TAGS POCKET */}
               <div className="bg-white rounded-[2rem] border border-slate-200 shadow-sm p-6 relative overflow-hidden">
                   <div className="flex justify-between items-center mb-4">
                       <h3 className="font-bold text-slate-900 flex items-center gap-2">
                           <Target className="text-brand-600" size={18}/> Kantong & Identitas
                       </h3>
                       <div className="flex gap-2">
                           <button onClick={() => openSfModal()} className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-[10px] font-bold uppercase tracking-wider transition flex items-center gap-1 border border-slate-200">
                               <Plus size={12}/> Goal
                           </button>
                       </div>
                   </div>
                   
                   <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pb-4">
                       
                       {/* BANK ACCOUNTS (SOURCE IDENTITIES) - READ ONLY */}
                       {bankAccounts.map(acc => (
                           <div key={acc.id} className={`p-5 rounded-3xl border relative group flex flex-col justify-between text-white shadow-xl transform hover:-translate-y-1 transition-all min-h-[160px] ${acc.color || 'bg-slate-900'}`}>
                               <div className="absolute top-0 right-0 p-4 opacity-20"><Landmark size={80}/></div>
                               
                               <div className="relative z-10 flex justify-between items-start">
                                   <div className="flex items-center gap-1.5 bg-black/20 px-2 py-1 rounded-lg backdrop-blur-sm">
                                       <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse"></div>
                                       <span className="text-[10px] font-black uppercase tracking-widest">SOURCE ID</span>
                                   </div>
                               </div>

                               <div className="relative z-10 mt-4">
                                   <p className="font-black text-lg tracking-wide mb-1 truncate shadow-sm">{acc.bankName}</p>
                                   <p className="font-mono text-xs opacity-80 truncate tracking-wider mb-2">{acc.accountNumber || '**** ****'}</p>
                                   <p className="text-[10px] font-bold uppercase opacity-60">{acc.holderName}</p>
                               </div>
                           </div>
                       ))}

                       {/* Sinking Funds (GOALS) */}
                       {sinkingFunds.map(sf => {
                           const progress = sf.targetAmount > 0 ? Math.min(100, (sf.currentAmount / sf.targetAmount) * 100) : 0;
                           const linkedBank = bankAccounts.find(b => b.id === sf.assignedAccountId);
                           
                           // Smart Calc
                           const targetDate = new Date(sf.deadline);
                           const today = new Date();
                           const daysLeft = Math.ceil((targetDate.getTime() - today.getTime()) / (1000 * 3600 * 24));
                           const remaining = sf.targetAmount - sf.currentAmount;
                           const dailySaving = daysLeft > 0 ? remaining / daysLeft : 0;

                           return (
                               <div key={sf.id} className="bg-white p-5 rounded-3xl border-2 border-slate-100 relative group flex flex-col justify-between shadow-sm hover:border-brand-200 hover:shadow-lg transition-all min-h-[180px]">
                                   <div className="absolute top-3 right-3 flex gap-1 opacity-0 group-hover:opacity-100 transition z-20">
                                       <button onClick={() => openSfModal(sf)} className="p-1.5 bg-slate-100 text-slate-400 hover:text-brand-600 rounded-lg hover:bg-slate-200"><Edit2 size={12}/></button>
                                       <button onClick={() => setShowSfHistoryId(sf.id)} className="p-1.5 bg-slate-100 text-slate-400 hover:text-blue-600 rounded-lg hover:bg-slate-200"><History size={12}/></button>
                                       <button onClick={() => handleDeleteSFClick(sf.id)} className="p-1.5 bg-red-50 text-red-400 hover:text-red-600 rounded-lg hover:bg-red-100"><Trash2 size={12}/></button>
                                   </div>
                                   
                                   <div>
                                       <div className="flex justify-between items-start mb-3">
                                           <span className="text-[10px] font-black uppercase bg-brand-50 text-brand-600 px-2 py-1 rounded-lg tracking-wider border border-brand-100">GOAL</span>
                                           {daysLeft > 0 && <span className="text-[10px] font-bold text-slate-400 bg-slate-50 px-2 py-1 rounded-lg">{daysLeft} Hari Lagi</span>}
                                       </div>
                                       <p className="text-lg font-black text-slate-800 truncate mb-1" title={sf.name}>{sf.name}</p>
                                       
                                       <div className="flex flex-col gap-1 mt-2">
                                            <div className="flex justify-between items-center">
                                                <p className="text-xs text-slate-500 font-medium">Target</p>
                                                <span className="font-bold text-slate-700 text-sm">{formatCurrency(sf.targetAmount)}</span>
                                            </div>
                                            {remaining > 0 && (
                                                <div className="flex justify-between items-center">
                                                    <p className="text-[10px] text-slate-400 italic">Perlu Nabung</p>
                                                    <span className="text-[10px] font-bold text-brand-600 bg-brand-50 px-1.5 py-0.5 rounded">{formatCurrency(dailySaving)}/hari</span>
                                                </div>
                                            )}
                                       </div>
                                   </div>

                                   <div className="mt-4">
                                       <div className="flex justify-between text-[10px] font-bold mb-1">
                                           <span className="text-brand-600">{progress.toFixed(0)}%</span>
                                           <span className="text-slate-400">{formatCurrency(sf.currentAmount)}</span>
                                       </div>
                                       <div className="w-full bg-slate-100 h-3 rounded-full overflow-hidden mb-2 border border-slate-200">
                                           <div className="bg-brand-500 h-full transition-all duration-500 relative" style={{ width: `${progress}%` }}>
                                               <div className="absolute inset-0 bg-white/20 animate-pulse"></div>
                                           </div>
                                       </div>
                                       
                                       {linkedBank && (
                                           <div className="flex items-center gap-1.5 text-[10px] text-slate-400 bg-slate-50 px-2 py-1 rounded-lg w-fit">
                                               <CreditCard size={10}/> Sumber: {linkedBank.bankName}
                                           </div>
                                       )}
                                   </div>
                               </div>
                           );
                       })}

                       {(sinkingFunds.length === 0 && bankAccounts.length === 0) && (
                           <div className="col-span-1 md:col-span-2 text-center py-12 text-slate-400 text-sm italic border-2 border-dashed border-slate-100 rounded-3xl bg-slate-50/50 flex flex-col items-center justify-center gap-2">
                               <Target size={32} className="opacity-20"/>
                               <p>Belum ada identitas bank atau target tabungan.</p>
                               <button onClick={() => openSfModal()} className="text-brand-600 font-bold hover:underline text-xs">Buat Target Baru</button>
                           </div>
                       )}
                   </div>
               </div>

               {/* 3. MONTHLY CALENDAR SELECTOR */}
               <div className="bg-white rounded-[2rem] border border-slate-200 shadow-sm p-6">
                   <div className="flex justify-between items-center mb-6">
                       <h3 className="font-bold text-slate-900 flex items-center gap-2">
                           <CalendarIcon className="text-purple-600" size={18}/> Periode Budget
                       </h3>
                       <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-xl">
                           <button onClick={() => handleYearChange(-1)} className="p-1.5 hover:bg-white rounded-lg transition shadow-sm text-slate-500"><ChevronLeft size={16}/></button>
                           <span className="text-xs font-black text-slate-700 px-2">{currentDate.getFullYear()}</span>
                           <button onClick={() => handleYearChange(1)} className="p-1.5 hover:bg-white rounded-lg transition shadow-sm text-slate-500"><ChevronRight size={16}/></button>
                       </div>
                   </div>
                   
                   <div className="grid grid-cols-4 gap-3">
                       {monthNames.map((month, index) => {
                           const isSelected = index === currentDate.getMonth();
                           const totalAllocated = getMonthlyTotal(currentDate.getFullYear(), index);
                           const hasData = totalAllocated > 0;

                           return (
                               <button 
                                   key={month} 
                                   onClick={() => handleMonthSelect(index)}
                                   className={`relative py-2 rounded-xl flex flex-col items-center justify-center transition-all ${
                                       isSelected 
                                       ? 'bg-slate-900 text-white shadow-lg scale-105 z-10' 
                                       : 'bg-slate-50 text-slate-500 hover:bg-slate-100 hover:text-slate-900'
                                   }`}
                               >
                                   <span className="text-xs font-bold">{month}</span>
                                   {hasData && (
                                       <span className={`text-[10px] font-bold mt-1 ${isSelected ? 'text-green-300' : 'text-green-600'}`}>
                                           {totalAllocated >= 1000000 ? `${(totalAllocated/1000000).toFixed(1)}jt` : `${(totalAllocated/1000).toFixed(0)}k`}
                                       </span>
                                   )}
                               </button>
                           );
                       })}
                   </div>
                   <p className="text-[10px] text-center text-slate-400 mt-4 italic">
                       Pilih bulan untuk mengatur alokasi spesifik
                   </p>
               </div>

           </div>

           {/* RIGHT: ALLOCATIONS LIST */}
           <div className="lg:col-span-2 space-y-4">
               {localList.length === 0 ? (
                   <div className="text-center py-20 bg-white rounded-[2rem] border-2 border-dashed border-slate-200 opacity-60">
                       <Layers size={48} className="mx-auto mb-4 text-slate-300"/>
                       <p className="font-bold text-slate-400">Belum ada pos anggaran di {currentDate.toLocaleDateString('id-ID', {month:'long', year:'numeric'})}.</p>
                       <p className="text-xs text-slate-300">Klik "New Post" atau "Import" untuk mulai.</p>
                   </div>
               ) : (
                   localList.map((item, index) => {
                       const linkedBank = bankAccounts.find(b => b.id === item.assignedAccountId);
                       const usedAmount = getUsedAmount(item.id);
                       const usagePercent = item.amount > 0 ? Math.min(100, (usedAmount / item.amount) * 100) : 0;
                       
                       return (
                           <div 
                                key={item.id} 
                                draggable
                                onDragStart={(e) => handleDragStart(e, index)}
                                onDragEnter={(e) => handleDragEnter(e, index)}
                                onDragEnd={handleDragEnd}
                                onDragOver={(e) => e.preventDefault()}
                                className={`group relative bg-white p-5 rounded-2xl border border-slate-200 shadow-sm hover:shadow-lg transition-all flex flex-col gap-3 ${draggedItemIndex === index ? 'opacity-20 bg-slate-50 scale-95 border-brand-500 border-dashed' : ''} ${item.isTransferred ? 'opacity-90 bg-slate-50/50' : ''}`}
                           >
                               <div className="flex items-center gap-4">
                                   {/* Drag Handle */}
                                   <div className="cursor-grab active:cursor-grabbing text-slate-300 hover:text-slate-500 p-2 -ml-2">
                                       <GripVertical size={20}/>
                                   </div>

                                   {/* Custom Icon */}
                                   <div className={`p-3 rounded-xl shrink-0 ${item.color || 'bg-slate-500'} text-white shadow-sm`}>
                                       {renderIcon(item.icon, 20)}
                                   </div>

                                   {/* Status Toggle */}
                                   <button onClick={() => handleToggle(item.id)} className={`transition-transform active:scale-90 ${item.isTransferred ? 'text-green-500' : 'text-slate-300 hover:text-brand-500'}`}>
                                       {item.isTransferred ? <CheckCircle2 size={24} className="fill-green-100"/> : <Circle size={24}/>}
                                   </button>

                                   {/* Content */}
                                   <div className="flex-1 min-w-0 cursor-pointer" onClick={() => { setEditingId(item.id); setFormData({ name: item.name, amount: item.amount, percent: item.percentage || 0, category: item.category || 'needs', priority: item.priority, isRecurring: item.isRecurring || false, assignedAccountId: item.assignedAccountId || '', icon: item.icon || 'tag', color: item.color || 'bg-slate-500' }); setIsFormOpen(true); }}>
                                       <div className="flex items-center gap-2 mb-1">
                                           <h4 className={`font-bold text-lg truncate ${item.isTransferred ? 'text-slate-700' : 'text-slate-900'}`}>{item.name}</h4>
                                           <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded text-white ${getCategoryColor(item.category)}`}>
                                               {item.category}
                                           </span>
                                       </div>
                                       <div className="flex items-center gap-3 flex-wrap">
                                           {item.percentage ? <span className="text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded font-bold">{item.percentage}%</span> : null}
                                           {item.isRecurring && <span className="text-[9px] bg-purple-50 text-purple-600 px-2 py-0.5 rounded font-bold border border-purple-100 flex items-center gap-1"><Target size={10}/> Rutin</span>}
                                           {linkedBank && (
                                               <span className="text-[9px] bg-slate-900 text-white px-2 py-0.5 rounded font-bold flex items-center gap-1 border border-slate-700 shadow-sm">
                                                   <CreditCard size={10} className="text-yellow-400"/> {linkedBank.bankName}
                                               </span>
                                           )}
                                       </div>
                                   </div>

                                   {/* Amount & Actions */}
                                   <div className="flex flex-col items-end gap-1">
                                       <span className={`text-xl font-black ${item.isTransferred ? 'text-slate-600' : 'text-slate-900'}`}>
                                           {formatCurrency(item.amount)}
                                       </span>
                                       <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                           {item.isTransferred && (
                                               <button onClick={() => setShowAllocHistoryId(item.id)} className="p-2 bg-blue-50 text-blue-500 rounded-lg hover:bg-blue-100 transition" title="Lihat Riwayat"><History size={14}/></button>
                                           )}
                                           <button onClick={() => handleDeleteAllocationClick(item.id)} className={`p-2 rounded-lg transition ${usedAmount > 0 ? 'bg-slate-100 text-slate-300 cursor-not-allowed' : 'bg-red-50 text-red-500 hover:bg-red-100'}`} disabled={usedAmount > 0}><Trash2 size={14}/></button>
                                       </div>
                                   </div>
                               </div>

                               {/* USAGE PROGRESS BAR */}
                               {usedAmount > 0 && (
                                   <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden relative mt-1">
                                       <div className={`h-full transition-all duration-500 ${usagePercent >= 100 ? 'bg-red-500' : 'bg-brand-500'}`} style={{ width: `${usagePercent}%` }}></div>
                                   </div>
                               )}
                               {usedAmount > 0 && (
                                   <div className="flex justify-between w-full text-[10px] font-bold text-slate-400 px-1">
                                       <span>Terpakai: {formatCurrency(usedAmount)}</span>
                                       <span className={usagePercent >= 100 ? 'text-red-500' : 'text-brand-600'}>{usagePercent.toFixed(0)}%</span>
                                   </div>
                               )}
                           </div>
                       );
                   })
               )}
           </div>
       </div>

       {/* ALLOCATION HISTORY MODAL */}
       {showAllocHistoryId && (
           <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
               <div className="bg-white rounded-[2rem] w-full max-w-lg p-6 shadow-2xl overflow-hidden flex flex-col max-h-[80vh]">
                   <div className="flex justify-between items-center mb-4 border-b pb-4">
                       <div>
                           <h3 className="text-lg font-black text-slate-900">Riwayat Penggunaan</h3>
                           <p className="text-xs text-slate-500">{localList.find(a=>a.id===showAllocHistoryId)?.name}</p>
                       </div>
                       <button onClick={() => setShowAllocHistoryId(null)} className="p-2 bg-slate-100 rounded-full text-slate-500 hover:text-slate-900"><X size={18}/></button>
                   </div>
                   
                   <div className="flex-1 overflow-y-auto custom-scrollbar space-y-2 pr-2">
                       {dailyExpenses.filter(e => e.allocationId === showAllocHistoryId).length === 0 ? (
                           <div className="text-center py-10 text-slate-400 text-sm italic">Belum ada transaksi.</div>
                       ) : (
                           dailyExpenses.filter(e => e.allocationId === showAllocHistoryId).map(exp => (
                               <div key={exp.id} className="flex justify-between items-center p-3 bg-slate-50 rounded-xl border border-slate-100">
                                   <div>
                                       <p className="font-bold text-slate-800 text-sm">{exp.title}</p>
                                       <p className="text-[10px] text-slate-400">{safeDateISO(exp.date)}</p>
                                   </div>
                                   <span className="font-mono font-bold text-red-600">-{formatCurrency(exp.amount)}</span>
                               </div>
                           ))
                       )}
                   </div>
               </div>
           </div>
       )}

       {/* SINKING FUND FORM MODAL */}
       {isSfFormOpen && (
           <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-md p-4 animate-fade-in">
               <div className="bg-white rounded-[2rem] w-full max-w-md p-8 shadow-2xl border border-white/20">
                   <h3 className="text-xl font-black text-slate-900 mb-6 flex items-center gap-2"><Target size={20} className="text-brand-600"/> {editingSfId ? 'Edit Kantong' : 'Smart Sinking Fund'}</h3>
                   
                   <form onSubmit={handleSaveSF} className="space-y-5">
                       {/* ... Existing SF Form Fields ... */}
                       <div>
                           <label className="block text-[10px] font-black text-slate-500 uppercase mb-1">Nama Tujuan</label>
                           <input className="w-full border-2 border-slate-100 p-3 rounded-xl font-bold text-slate-800 outline-none focus:border-brand-500" placeholder="Misal: Liburan Jepang" value={sfFormData.name} onChange={e => setSfFormData({...sfFormData, name: e.target.value})} required />
                       </div>

                       <div className="grid grid-cols-2 gap-4">
                           <div>
                               <label className="block text-[10px] font-black text-slate-500 uppercase mb-1">Target (Rp)</label>
                               <input className="w-full border-2 border-slate-100 p-3 rounded-xl font-mono text-sm font-bold outline-none focus:border-brand-500" type="number" placeholder="0" value={sfFormData.target} onChange={e => setSfFormData({...sfFormData, target: Number(e.target.value)})} required />
                           </div>
                           <div>
                               <label className="block text-[10px] font-black text-slate-500 uppercase mb-1">Terkumpul</label>
                               <input 
                                   className={`w-full border-2 border-slate-100 p-3 rounded-xl font-mono text-sm font-bold outline-none ${editingSfId ? 'bg-slate-100 text-slate-500 cursor-not-allowed' : 'focus:border-brand-500'}`} 
                                   type="number" 
                                   placeholder="0" 
                                   value={sfFormData.current} 
                                   onChange={e => setSfFormData({...sfFormData, current: Number(e.target.value)})} 
                                   disabled={!!editingSfId} // Disable editing once created, rely on transactions
                               />
                               {editingSfId && <p className="text-[9px] text-slate-400 mt-1 italic">Update saldo lewat Daily Expenses</p>}
                           </div>
                       </div>

                       <div>
                           <label className="block text-[10px] font-black text-slate-500 uppercase mb-1">Kategori</label>
                           <div className="flex flex-wrap gap-2">
                               {['Emergency', 'Holiday', 'Gadget', 'Vehicle', 'Education', 'Other'].map(cat => (
                                   <button 
                                     key={cat}
                                     type="button" 
                                     onClick={() => setSfFormData({...sfFormData, category: cat})}
                                     className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition ${sfFormData.category === cat ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'}`}
                                   >
                                       {cat}
                                   </button>
                               ))}
                           </div>
                       </div>

                       <div>
                           <label className="block text-[10px] font-black text-slate-500 uppercase mb-1">Target Tanggal (Deadline)</label>
                           <input type="date" className="w-full border-2 border-slate-100 p-3 rounded-xl text-sm font-medium outline-none focus:border-brand-500 text-slate-600" value={sfFormData.deadline} onChange={e => setSfFormData({...sfFormData, deadline: e.target.value})} required />
                       </div>

                       {/* Smart Prediction */}
                       {sfFormData.target > 0 && sfFormData.deadline && (
                           <div className="bg-brand-50 p-4 rounded-xl border border-brand-100 flex items-center justify-between">
                               <div>
                                   <p className="text-[10px] font-bold text-brand-400 uppercase">Perlu Nabung</p>
                                   <p className="text-lg font-black text-brand-700">{formatCurrency(calculateMonthlySaving())} <span className="text-xs text-brand-500 font-medium">/ bulan</span></p>
                               </div>
                               <TrendingUp size={24} className="text-brand-300"/>
                           </div>
                       )}

                       <div>
                           <label className="block text-[10px] font-black text-slate-500 uppercase mb-1">Hubungkan Rekening (Opsional)</label>
                           <select 
                               className="w-full border-2 border-slate-100 p-3 rounded-xl text-sm font-bold bg-white outline-none focus:border-brand-500 text-slate-700"
                               value={sfFormData.assignedAccountId}
                               onChange={e => setSfFormData({...sfFormData, assignedAccountId: e.target.value})}
                           >
                               <option value="">-- Pilih Sumber Dana --</option>
                               {bankAccounts.map(acc => (
                                   <option key={acc.id} value={acc.id}>{acc.bankName} - {acc.accountNumber}</option>
                               ))}
                           </select>
                       </div>

                       <div className="flex gap-3 pt-2">
                           <button type="button" onClick={() => setIsSfFormOpen(false)} className="flex-1 py-3 border-2 border-slate-100 rounded-xl font-bold text-slate-500 hover:bg-slate-50 text-xs uppercase tracking-widest">Batal</button>
                           <button type="submit" className="flex-1 py-3 bg-brand-600 text-white rounded-xl font-bold hover:bg-brand-700 shadow-lg text-xs uppercase tracking-widest">Simpan</button>
                       </div>
                   </form>
               </div>
           </div>
       )}

       {/* SINKING FUND HISTORY MODAL */}
       {showSfHistoryId && (
           <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
               <div className="bg-white rounded-[2rem] w-full max-w-lg p-6 shadow-2xl overflow-hidden flex flex-col max-h-[80vh]">
                   <div className="flex justify-between items-center mb-4 border-b pb-4">
                       <div>
                           <h3 className="text-lg font-black text-slate-900">Riwayat Tabungan</h3>
                           <p className="text-xs text-slate-500">{sinkingFunds.find(s=>s.id===showSfHistoryId)?.name}</p>
                       </div>
                       <button onClick={() => setShowSfHistoryId(null)} className="p-2 bg-slate-100 rounded-full text-slate-500 hover:text-slate-900"><X size={18}/></button>
                   </div>
                   
                   <div className="flex-1 overflow-y-auto custom-scrollbar space-y-2 pr-2">
                       {dailyExpenses.filter(e => e.sinkingFundId === showSfHistoryId).length === 0 ? (
                           <div className="text-center py-10 text-slate-400 text-sm italic">Belum ada transaksi tabungan.</div>
                       ) : (
                           dailyExpenses.filter(e => e.sinkingFundId === showSfHistoryId).map(exp => (
                               <div key={exp.id} className="flex justify-between items-center p-3 bg-slate-50 rounded-xl border border-slate-100">
                                   <div>
                                       <p className="font-bold text-slate-800 text-sm">{exp.title}</p>
                                       <p className="text-[10px] text-slate-400">{safeDateISO(exp.date)}</p>
                                   </div>
                                   <span className="font-mono font-bold text-green-600">+{formatCurrency(exp.amount)}</span>
                               </div>
                           ))
                       )}
                   </div>
               </div>
           </div>
       )}

       {/* Allocation Form Modal */}
       {isFormOpen && (
           <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-md p-4 animate-fade-in">
               <div className="bg-white rounded-[2.5rem] w-full max-w-md p-8 shadow-2xl border border-white/20 overflow-y-auto max-h-[90vh] custom-scrollbar">
                   <div className="flex justify-between items-center mb-6">
                       <h3 className="text-xl font-black text-slate-900 flex items-center gap-2">
                           {editingId ? <ArrowRight size={20} className="text-brand-600"/> : <Plus size={20} className="text-brand-600"/>}
                           {editingId ? 'Edit Pos' : 'Pos Baru'}
                       </h3>
                       <button onClick={()=>setIsFormOpen(false)} className="text-slate-400 hover:text-slate-600"><X size={24}/></button>
                   </div>
                   
                   <form onSubmit={handleSave} className="space-y-6">
                       {/* ... Allocation Form Inputs ... */}
                       <div>
                           <label className="block text-[10px] font-black text-slate-500 uppercase mb-2 ml-1">Nama Pos</label>
                           <input className="w-full border-2 border-slate-100 p-4 rounded-2xl focus:border-brand-500 outline-none font-bold text-slate-800" placeholder="Misal: Belanja Bulanan" value={formData.name} onChange={e=>setFormData({...formData, name: e.target.value})} autoFocus />
                       </div>

                       <div>
                           <div className="flex justify-between items-center mb-2 ml-1">
                               <label className="text-[10px] font-black text-slate-500 uppercase">Target Budget</label>
                               <div className="flex bg-slate-100 rounded-lg p-0.5">
                                   <button type="button" onClick={() => setMode('fixed')} className={`px-2 py-0.5 rounded-md text-[10px] font-bold transition ${mode === 'fixed' ? 'bg-white shadow text-slate-900' : 'text-slate-400'}`}><DollarSign size={12}/></button>
                                   <button type="button" onClick={() => setMode('percent')} className={`px-2 py-0.5 rounded-md text-[10px] font-bold transition ${mode === 'percent' ? 'bg-white shadow text-slate-900' : 'text-slate-400'}`}><Percent size={12}/></button>
                               </div>
                           </div>
                           
                           {mode === 'fixed' ? (
                               <input type="number" className="w-full border-2 border-slate-100 p-4 rounded-2xl focus:border-brand-500 outline-none font-black text-2xl text-slate-900" value={formData.amount} onChange={e=>setFormData({...formData, amount: Number(e.target.value)})} />
                           ) : (
                               <div className="flex gap-2">
                                   <div className="relative flex-1">
                                       <input type="number" className="w-full border-2 border-slate-100 p-4 rounded-2xl focus:border-brand-500 outline-none font-black text-2xl text-slate-900" value={formData.percent} onChange={e=>setFormData({...formData, percent: Number(e.target.value)})} />
                                       <span className="absolute right-4 top-5 font-bold text-slate-400">%</span>
                                   </div>
                                   <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 flex items-center justify-center min-w-[120px]">
                                       <span className="font-bold text-slate-600 text-sm">{formatCurrency(formData.amount)}</span>
                                   </div>
                               </div>
                           )}
                       </div>

                       {/* ICON SELECTOR */}
                       <div>
                           <label className="block text-[10px] font-black text-slate-500 uppercase mb-2 ml-1">Icon Style</label>
                           <div className="flex flex-wrap gap-2">
                               {AVAILABLE_ICONS.map(i => (
                                   <button 
                                     key={i.id}
                                     type="button"
                                     onClick={() => setFormData({...formData, icon: i.id})}
                                     className={`p-2 rounded-xl border transition ${formData.icon === i.id ? 'bg-slate-900 text-white border-slate-900' : 'bg-white border-slate-100 text-slate-400 hover:border-slate-300'}`}
                                     title={i.label}
                                   >
                                       <i.icon size={18} />
                                   </button>
                               ))}
                           </div>
                       </div>

                       {/* COLOR SELECTOR */}
                       <div>
                           <label className="block text-[10px] font-black text-slate-500 uppercase mb-2 ml-1">Theme Color</label>
                           <div className="flex flex-wrap gap-2">
                               {AVAILABLE_COLORS.map(c => (
                                   <button 
                                     key={c}
                                     type="button"
                                     onClick={() => setFormData({...formData, color: c})}
                                     className={`w-6 h-6 rounded-full transition ${c} ${formData.color === c ? 'ring-2 ring-offset-2 ring-slate-400 scale-110' : 'hover:scale-110'}`}
                                   />
                               ))}
                           </div>
                       </div>

                       <div className="grid grid-cols-2 gap-4">
                           <div>
                               <label className="block text-[10px] font-black text-slate-500 uppercase mb-2 ml-1">Kategori</label>
                               <select className="w-full border-2 border-slate-100 p-4 rounded-2xl focus:border-brand-500 outline-none font-bold text-sm bg-white" value={formData.category} onChange={e=>setFormData({...formData, category: e.target.value})}>
                                   <option value="needs">Needs (Wajib)</option>
                                   <option value="wants">Wants (Hiburan)</option>
                                   <option value="debt">Debt/Saving</option>
                               </select>
                           </div>
                           <div>
                               <label className="block text-[10px] font-black text-slate-500 uppercase mb-2 ml-1">Sumber Dana</label>
                               <select 
                                   className="w-full border-2 border-slate-100 p-4 rounded-2xl focus:border-brand-500 outline-none font-bold text-sm bg-white"
                                   value={formData.assignedAccountId}
                                   onChange={e => setFormData({...formData, assignedAccountId: e.target.value})}
                               >
                                   <option value="">-- Pilih Akun --</option>
                                   {bankAccounts.map(acc => (
                                       <option key={acc.id} value={acc.id}>{acc.bankName}</option>
                                   ))}
                               </select>
                           </div>
                       </div>
                       
                       <div className="flex items-center">
                           <label className="flex items-center gap-3 cursor-pointer p-4 border-2 border-slate-100 rounded-2xl w-full hover:bg-slate-50 transition">
                               <input type="checkbox" className="w-5 h-5 accent-brand-600" checked={formData.isRecurring} onChange={e=>setFormData({...formData, isRecurring: e.target.checked})} />
                               <span className="text-xs font-bold text-slate-600">Rutin Hingga Akhir Tahun</span>
                           </label>
                       </div>

                       <div className="flex gap-3 pt-4">
                           <button type="button" onClick={()=>setIsFormOpen(false)} className="flex-1 py-4 border-2 border-slate-100 rounded-2xl font-bold text-slate-500 text-xs uppercase tracking-widest hover:bg-slate-50 transition">Batal</button>
                           <button type="submit" disabled={isSaving} className="flex-1 py-4 bg-slate-900 text-white rounded-2xl font-bold text-xs uppercase tracking-widest shadow-xl hover:bg-slate-800 transition transform active:scale-95 flex items-center justify-center gap-2">
                               {isSaving ? 'Menyimpan...' : <><Save size={16}/> Simpan</>}
                           </button>
                       </div>
                   </form>
               </div>
           </div>
       )}

       {/* CONFIRMATION DIALOG */}
       <ConfirmDialog
         isOpen={confirmConfig.isOpen}
         title={confirmConfig.title}
         message={confirmConfig.message}
         onConfirm={confirmConfig.onConfirm}
         onCancel={() => setConfirmConfig(prev => ({ ...prev, isOpen: false }))}
         confirmText="Hapus"
         cancelText="Batal"
         variant="danger"
       />
    </div>
  );
}
