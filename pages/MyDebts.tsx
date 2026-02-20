
import React, { useState, useEffect, useMemo } from 'react';
import { DebtItem, LoanType, PaymentRecord, DebtInstallment, StepUpRange } from '../types';
import { formatCurrency } from '../services/financeUtils';
import { saveItemToCloud, deleteFromCloud } from '../services/cloudSync';
import { getConfig } from '../services/mockDb';
import { Plus, Trash2, Edit2, X, Loader2, TrendingUp, Save, CreditCard, Calendar, Calculator, AlertCircle, ArrowRight, Layers, PieChart, Landmark, Percent, ChevronDown, ChevronUp } from 'lucide-react';
import ConfirmDialog from '../components/ui/ConfirmDialog';

interface MyDebtsProps {
  debts: DebtItem[];
  setDebts: React.Dispatch<React.SetStateAction<DebtItem[]>>;
  paymentRecords: PaymentRecord[];
  setPaymentRecords: React.Dispatch<React.SetStateAction<PaymentRecord[]>>;
  userId: string;
  debtInstallments?: DebtInstallment[];
  setDebtInstallments?: React.Dispatch<React.SetStateAction<DebtInstallment[]>>;
}

export default function MyDebts({ debts = [], setDebts, userId, debtInstallments = [], setDebtInstallments }: MyDebtsProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  
  // Confirmation Modal State
  const [confirmConfig, setConfirmConfig] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  }>({ isOpen: false, title: '', message: '', onConfirm: () => {} });

  // Smart Form State
  const [formData, setFormData] = useState({ 
    name: '', 
    type: LoanType.KPR, 
    bankName: '', 
    originalPrincipal: 0,
    monthlyInstallment: 0,
    startDate: new Date().toISOString().split('T')[0], 
    endDate: new Date(new Date().setFullYear(new Date().getFullYear() + 5)).toISOString().split('T')[0], 
    dueDate: 5,
    interestStrategy: 'Fixed' as 'Fixed' | 'StepUp',
    stepUpSchedule: [] as StepUpRange[]
  });

  // Step Up UI Helper State
  const [stepUpRows, setStepUpRows] = useState<{start: string, end: string, amount: string}[]>([
      { start: '1', end: '12', amount: '0' }
  ]);

  // Realtime Analysis State
  const [analysis, setAnalysis] = useState({
      tenorMonths: 0,
      impliedInterestRate: 0,
      totalOverpayment: 0,
      currentRemaining: 0,
      monthsPassed: 0,
      progress: 0
  });

  const activeDebts = useMemo(() => (debts || []).filter(d => !d._deleted), [debts]);

  // SMART CALCULATION EFFECT (FIXED FOR STEP UP)
  useEffect(() => {
      const start = new Date(formData.startDate);
      const end = new Date(formData.endDate);
      const today = new Date();
      
      let months = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
      if (months < 1) months = 1;

      let monthsPassed = (today.getFullYear() - start.getFullYear()) * 12 + (today.getMonth() - start.getMonth());
      if (monthsPassed < 0) monthsPassed = 0;
      if (monthsPassed > months) monthsPassed = months;

      const principal = Number(formData.originalPrincipal) || 0;
      const baseInstallment = Number(formData.monthlyInstallment) || 0;
      
      // Calculate Liability based on Strategy
      let totalLiability = 0;
      
      if (formData.interestStrategy === 'StepUp') {
          // Iterate through every month of the tenor to sum up exact payments from rows
          let stepUpTotal = 0;
          for (let m = 1; m <= months; m++) {
              // Find matching row for month 'm'
              const matchingRow = stepUpRows.find(row => {
                  const s = Number(row.start);
                  const e = Number(row.end);
                  return m >= s && m <= e;
              });

              if (matchingRow) {
                  stepUpTotal += Number(matchingRow.amount);
              } else {
                  // Fallback if gaps exist in schedule
                  stepUpTotal += baseInstallment;
              }
          }
          totalLiability = stepUpTotal;
      } else {
          // Fixed / Flat Calculation
          totalLiability = baseInstallment * months;
      }

      const totalOverpayment = Math.max(0, totalLiability - principal);
      
      // Est. Flat Rate per year
      const yearlyInterest = (totalOverpayment / months) * 12;
      const impliedRate = principal > 0 ? (yearlyInterest / principal) * 100 : 0;

      // Linear Amortization for "Remaining" (Simple Smart Logic)
      const avgMonthlyPayment = totalLiability / months;
      const amountPaidEst = avgMonthlyPayment * monthsPassed;
      const currentRemaining = Math.max(0, totalLiability - amountPaidEst); // Remaining Liability
      const principalRemaining = Math.max(0, principal - (principal / months * monthsPassed)); // Remaining Principal Proxy

      const progress = principal > 0 ? ((principal - principalRemaining) / principal) * 100 : 0;

      setAnalysis({
          tenorMonths: months,
          impliedInterestRate: impliedRate,
          totalOverpayment,
          currentRemaining: principalRemaining, // Use principal for tracking standard outstanding
          monthsPassed,
          progress
      });

  }, [formData.startDate, formData.endDate, formData.originalPrincipal, formData.monthlyInstallment, formData.interestStrategy, stepUpRows]);

  const handleEdit = (debt: DebtItem) => {
      setEditingId(debt.id);
      
      // Robust Parsing for StepUp Schedule (Handle both string from legacy DB and array)
      let parsedSchedule: StepUpRange[] = [];
      if (debt.stepUpSchedule) {
          if (Array.isArray(debt.stepUpSchedule)) {
              parsedSchedule = debt.stepUpSchedule;
          } else if (typeof debt.stepUpSchedule === 'string') {
              try { parsedSchedule = JSON.parse(debt.stepUpSchedule); } catch(e) {}
          }
      }

      setFormData({
          name: debt.name, 
          type: debt.type, 
          bankName: debt.bankName || '', 
          originalPrincipal: debt.originalPrincipal, 
          monthlyInstallment: debt.monthlyPayment,
          startDate: debt.startDate ? new Date(debt.startDate).toISOString().split('T')[0] : new Date().toISOString().split('T')[0], 
          endDate: debt.endDate ? new Date(debt.endDate).toISOString().split('T')[0] : new Date().toISOString().split('T')[0], 
          dueDate: debt.dueDate || 5,
          interestStrategy: (debt.interestStrategy as 'Fixed' | 'StepUp') || 'Fixed',
          stepUpSchedule: parsedSchedule
      });

      // Populate UI Rows for Step Up
      if (parsedSchedule.length > 0) {
          setStepUpRows(parsedSchedule.map(s => ({
              start: s.startMonth.toString(),
              end: s.endMonth.toString(),
              amount: s.amount.toString()
          })));
      } else {
          // Default Row
          setStepUpRows([{ start: '1', end: '12', amount: debt.monthlyPayment.toString() }]);
      }

      setIsModalOpen(true);
  };

  const handleAddStepUpRow = () => {
      // Auto increment start month based on last row
      const lastRow = stepUpRows[stepUpRows.length - 1];
      const nextStart = lastRow ? (Number(lastRow.end) + 1).toString() : '1';
      const nextEnd = (Number(nextStart) + 11).toString();
      
      setStepUpRows([...stepUpRows, { start: nextStart, end: nextEnd, amount: '0' }]);
  };

  const handleStepUpChange = (index: number, field: keyof typeof stepUpRows[0], value: string) => {
      const newRows = [...stepUpRows];
      newRows[index][field] = value;
      setStepUpRows(newRows);
  };

  const handleRemoveStepUpRow = (index: number) => {
      setStepUpRows(stepUpRows.filter((_, i) => i !== index));
  };

  // FIXED DELETE LOGIC: Optimistic Update
  const handleDeleteClick = (id: string) => { 
      setConfirmConfig({
          isOpen: true,
          title: "Hapus Kontrak Hutang?",
          message: "Apakah Anda yakin ingin menghapus kontrak hutang ini selamanya? Data yang dihapus tidak dapat dikembalikan.",
          onConfirm: () => {
              executeDelete(id);
              setConfirmConfig(prev => ({ ...prev, isOpen: false }));
          }
      });
  };

  const executeDelete = async (id: string) => {
      const prevDebts = [...debts];
      setIsSyncing(true);

      // 1. Optimistic UI Update (Instant)
      setDebts(prev => prev.filter(d => d.id !== id));

      try {
          // 2. Cloud Sync
          const success = await deleteFromCloud(userId, 'debts', id);
          
          if (!success) {
              throw new Error("Gagal menghapus di server");
          }
      } catch (e) {
          // 3. Rollback on Error
          console.error(e);
          setDebts(prevDebts);
          alert("Gagal menghapus data. Koneksi bermasalah.");
      } finally {
          setIsSyncing(false);
      }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // QA VALIDATION: Prevent Negative Numbers
    if (formData.originalPrincipal < 0 || formData.monthlyInstallment < 0) {
        alert("Nominal tidak boleh negatif!");
        return;
    }

    setIsSyncing(true);
    const strategy = getConfig().advancedConfig?.syncStrategy || 'background';
    const tempId = `temp-debt-${Date.now()}`;
    const targetId = editingId || tempId;

    // Process Step Up Data (Correct Array Formatting)
    let finalStepUpSchedule: StepUpRange[] = [];
    if (formData.interestStrategy === 'StepUp') {
        finalStepUpSchedule = stepUpRows.map(r => ({
            startMonth: Number(r.start),
            endMonth: Number(r.end),
            amount: Number(r.amount)
        }));
    }

    // Preserve existing fields if editing (QA Requirement: Don't delete fields)
    const existingDebt = editingId ? debts.find(d => d.id === editingId) : null;

    // Smart logic assigns the calculated values automatically
    const newDebt: DebtItem = {
        id: targetId, 
        userId, 
        name: formData.name, 
        type: formData.type as LoanType, 
        bankName: formData.bankName,
        originalPrincipal: Number(formData.originalPrincipal), 
        // IMPORTANT: Use analysis totalLiability which is now correct for StepUp
        totalLiability: analysis.totalLiability, 
        monthlyPayment: Number(formData.monthlyInstallment),
        
        // Auto-calculated fields from Analysis State (Smart Form)
        interestRate: Number(analysis.impliedInterestRate.toFixed(2)), 
        remainingPrincipal: Number(analysis.currentRemaining.toFixed(0)), 
        remainingMonths: Math.max(0, analysis.tenorMonths - analysis.monthsPassed),
        
        startDate: formData.startDate, 
        endDate: formData.endDate,
        dueDate: Number(formData.dueDate), 
        interestStrategy: formData.interestStrategy,
        
        // Save as ARRAY in local object for UI consistency
        stepUpSchedule: finalStepUpSchedule, 
        
        updatedAt: new Date().toISOString(), 
        _deleted: false, 
        
        // Preserve existing or Default
        payoffMethod: existingDebt?.payoffMethod || 'direct_extra',
        allocatedExtraBudget: existingDebt?.allocatedExtraBudget || 0,
        currentSavedAmount: existingDebt?.currentSavedAmount || 0,
        earlySettlementDiscount: existingDebt?.earlySettlementDiscount || 0
    };

    // 1. Optimistic UI Update
    if (strategy === 'manual_only') {
        setDebts(prev => editingId ? prev.map(d => d.id === editingId ? newDebt : d) : [...prev, newDebt]);
        setIsModalOpen(false);
        setIsSyncing(false);
    }

    try {
        // 2. Server Sync
        // Prepare Payload: Convert array to string for backend TEXT column compatibility
        const payload = {
            ...newDebt,
            stepUpSchedule: JSON.stringify(finalStepUpSchedule)
        };

        const result = await saveItemToCloud('debts', payload, !editingId);

        if (result.success) {
            const savedItem = result.data || newDebt;
            // IMPORTANT: Parse stepUpSchedule back if server returned it as string (legacy backend compatibility)
            if (typeof savedItem.stepUpSchedule === 'string') {
                try { savedItem.stepUpSchedule = JSON.parse(savedItem.stepUpSchedule); } catch(e) {}
            }

            if (strategy === 'background') {
                setDebts(prev => editingId ? prev.map(d => d.id === editingId ? savedItem : d) : [...prev, savedItem]);
                setIsModalOpen(false);
                setIsSyncing(false);
            } else if (!editingId) {
                // If it was a temp ID, replace with real one
                setDebts(prev => prev.map(d => d.id === tempId ? savedItem : d));
            }
        } else {
            throw new Error(result.error);
        }
    } catch (e) {
        if (strategy === 'manual_only') {
            if (!editingId) setDebts(prev => prev.filter(d => d.id !== tempId));
            alert("Sync Failed: Debt not saved.");
        } else {
            alert("Failed to save debt to cloud.");
            setIsSyncing(false);
        }
    }
  };

  const totalOutstanding = activeDebts.reduce((a,b) => a + Number(b.remainingPrincipal || 0), 0);
  const totalMonthly = activeDebts.reduce((a,b) => a + Number(b.monthlyPayment || 0), 0);
  const totalPrincipalStart = activeDebts.reduce((a,b) => a + Number(b.originalPrincipal || 0), 0);
  const totalPaid = totalPrincipalStart - totalOutstanding;
  const overallProgress = totalPrincipalStart > 0 ? (totalPaid / totalPrincipalStart) * 100 : 0;

  const getCurrentInstallment = (debt: DebtItem) => {
      if (debt.interestStrategy !== 'StepUp' || !debt.stepUpSchedule) return debt.monthlyPayment;
      
      // Calculate months passed since start date
      const start = new Date(debt.startDate);
      const today = new Date();
      const monthsPassed = (today.getFullYear() - start.getFullYear()) * 12 + (today.getMonth() - start.getMonth()) + 1; // +1 because month 1 is the first month
      
      let schedule: StepUpRange[] = [];
      if (Array.isArray(debt.stepUpSchedule)) {
          schedule = debt.stepUpSchedule;
      } else if (typeof debt.stepUpSchedule === 'string') {
          try { schedule = JSON.parse(debt.stepUpSchedule); } catch(e) {}
      }

      const currentPeriod = schedule.find(s => monthsPassed >= s.startMonth && monthsPassed <= s.endMonth);
      return currentPeriod ? currentPeriod.amount : debt.monthlyPayment;
  };

  return (
    <div className="space-y-8 pb-24 animate-fade-in font-sans">
      
      {/* PROFESSIONAL SUMMARY CARD */}
      <div className="bg-slate-900 rounded-[2.5rem] p-8 text-white relative overflow-hidden shadow-2xl border border-slate-800">
          <div className="absolute top-0 right-0 p-12 opacity-10"><Landmark size={200}/></div>
          
          <div className="relative z-10 flex flex-col md:flex-row justify-between items-end gap-8">
              <div className="flex-1">
                  <div className="flex items-center gap-3 mb-4">
                      <div className="p-3 bg-brand-600 rounded-2xl shadow-lg shadow-brand-500/30 border border-white/10">
                          <TrendingUp size={24} className="text-white"/>
                      </div>
                      <div>
                          <h2 className="text-2xl font-black tracking-tight leading-none">Portfolio Kewajiban</h2>
                          <p className="text-slate-400 text-xs mt-1 font-medium tracking-wide uppercase">Realtime Debt Tracking</p>
                      </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-6 mt-6">
                      <div>
                          <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">Total Outstanding</p>
                          <p className="text-3xl font-black text-white tracking-tight">{formatCurrency(totalOutstanding)}</p>
                      </div>
                      <div>
                          <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">Beban Bulanan</p>
                          <p className="text-3xl font-black text-red-400 tracking-tight">{formatCurrency(totalMonthly)}</p>
                      </div>
                  </div>
              </div>

              {/* Progress Circle Visual */}
              <div className="flex items-center gap-6 bg-white/5 p-6 rounded-[2rem] border border-white/10 backdrop-blur-sm">
                  <div className="relative h-20 w-20">
                      <svg className="h-full w-full transform -rotate-90" viewBox="0 0 36 36">
                          <path className="text-slate-700" strokeWidth="3" stroke="currentColor" fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                          <path className="text-brand-500" strokeDasharray={`${overallProgress}, 100`} strokeWidth="3" strokeLinecap="round" stroke="currentColor" fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                      </svg>
                      <div className="absolute inset-0 flex items-center justify-center flex-col">
                          <span className="text-xs font-black text-white">{overallProgress.toFixed(0)}%</span>
                          <span className="text-[8px] text-slate-400 uppercase">Paid</span>
                      </div>
                  </div>
                  <div>
                      <p className="text-xs text-slate-300 mb-2">Health Score</p>
                      <button onClick={() => { setEditingId(null); setIsModalOpen(true); }} className="bg-white text-slate-900 px-5 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-brand-50 transition shadow-lg flex items-center gap-2 transform active:scale-95">
                          <Plus size={14}/> Add New
                      </button>
                  </div>
              </div>
          </div>
      </div>

      {/* PRO DEBT LIST */}
      <div className="grid grid-cols-1 gap-4">
          {activeDebts.map(debt => {
              const progress = debt.originalPrincipal > 0 ? ((debt.originalPrincipal - debt.remainingPrincipal) / debt.originalPrincipal) * 100 : 0;
              const isStepUp = debt.interestStrategy === 'StepUp';
              
              return (
                  <div key={debt.id} className="group bg-white rounded-[2rem] p-6 border border-slate-200 shadow-sm hover:shadow-xl transition-all relative overflow-hidden flex flex-col md:flex-row gap-6 items-center">
                      
                      {/* Left: Icon & Info */}
                      <div className="flex-1 flex items-start gap-5 w-full">
                          <div className={`p-4 rounded-2xl shrink-0 border ${debt.type === 'KPR' ? 'bg-blue-50 text-blue-600 border-blue-100' : debt.type === 'KKB' ? 'bg-orange-50 text-orange-600 border-orange-100' : 'bg-slate-50 text-slate-600 border-slate-200'}`}>
                              {debt.type === 'KPR' ? <Landmark size={24}/> : <CreditCard size={24}/>}
                          </div>
                          <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-3 mb-1">
                                  <h3 className="text-lg font-black text-slate-900 truncate" title={debt.name}>{debt.name}</h3>
                                  <span className="text-[10px] font-bold bg-slate-100 text-slate-500 px-2 py-0.5 rounded border border-slate-200 uppercase tracking-wide">{debt.type}</span>
                                  {isStepUp && <span className="text-[10px] font-bold bg-purple-100 text-purple-600 px-2 py-0.5 rounded border border-purple-200 uppercase tracking-wide flex items-center gap-1"><Layers size={10}/> Step Up</span>}
                              </div>
                              <p className="text-xs text-slate-500 font-medium mb-3 flex items-center gap-2">
                                  {debt.bankName || 'Bank/Lender'} • <span className="text-slate-400">{debt.remainingMonths} Bulan Lagi</span>
                              </p>
                              
                              {/* Mini Progress */}
                              <div className="flex items-center gap-3 w-full max-w-xs">
                                  <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                                      <div className="h-full bg-brand-600 rounded-full" style={{width: `${progress}%`}}></div>
                                  </div>
                                  <span className="text-[10px] font-bold text-slate-400">{progress.toFixed(0)}%</span>
                              </div>
                          </div>
                      </div>

                      {/* Middle: Financials */}
                      <div className="flex gap-8 border-l border-slate-100 pl-8 md:pr-8 w-full md:w-auto justify-between md:justify-start">
                          <div>
                              <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Outstanding</p>
                              <p className="text-lg font-black text-slate-900">{formatCurrency(debt.remainingPrincipal)}</p>
                          </div>
                          <div>
                              <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Cicilan</p>
                              <p className="text-lg font-black text-red-600">{formatCurrency(getCurrentInstallment(debt))}</p>
                              {isStepUp && <p className="text-[9px] text-slate-400 italic">Current Step</p>}
                          </div>
                          <div className="hidden lg:block">
                              <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Bunga</p>
                              <p className="text-lg font-black text-slate-700">{debt.interestRate}%</p>
                          </div>
                      </div>

                      {/* Right: Actions */}
                      <div className="flex gap-2 w-full md:w-auto justify-end opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                          <button onClick={() => handleEdit(debt)} className="p-3 rounded-xl border border-slate-200 text-slate-400 hover:text-brand-600 hover:bg-brand-50 transition"><Edit2 size={18}/></button>
                          <button onClick={() => handleDeleteClick(debt.id)} className="p-3 rounded-xl border border-slate-200 text-slate-400 hover:text-red-600 hover:bg-red-50 transition"><Trash2 size={18}/></button>
                      </div>
                  </div>
              );
          })}
      </div>

      {/* SMART MODAL */}
      {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-md p-4 animate-fade-in">
              <div className="bg-white rounded-[2.5rem] w-full max-w-5xl p-0 shadow-2xl border border-white/20 h-fit max-h-[95vh] overflow-hidden flex flex-col md:flex-row">
                  
                  {/* LEFT: INPUTS */}
                  <div className="p-8 md:w-3/5 overflow-y-auto custom-scrollbar bg-white">
                      <div className="flex justify-between items-center mb-6">
                          <h3 className="text-xl font-black text-slate-900 tracking-tighter flex items-center gap-2">
                              {editingId ? <Edit2 size={20}/> : <Plus size={20}/>}
                              {editingId ? 'Edit Kontrak' : 'Input Smart Hutang'}
                          </h3>
                          <button onClick={()=>setIsModalOpen(false)} className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-400 md:hidden"><X size={24}/></button>
                      </div>
                      
                      <form id="debtForm" onSubmit={handleSubmit} className="space-y-5">
                          {/* BASIC INFO */}
                          <div className="grid grid-cols-2 gap-4">
                              <div className="col-span-2">
                                  <label className="block text-[10px] font-black text-slate-500 uppercase mb-1.5 ml-1">Nama & Bank</label>
                                  <div className="flex gap-2">
                                      <input className="flex-[2] border-2 border-slate-100 p-3 rounded-2xl focus:border-brand-500 outline-none font-bold text-slate-800 text-sm" placeholder="Misal: KPR Rumah" value={formData.name} onChange={e=>setFormData({...formData, name: e.target.value})} required />
                                      <input className="flex-1 border-2 border-slate-100 p-3 rounded-2xl focus:border-brand-500 outline-none font-bold text-slate-800 text-sm" placeholder="Bank" value={formData.bankName} onChange={e=>setFormData({...formData, bankName: e.target.value})} />
                                  </div>
                              </div>
                              <div className="col-span-1">
                                  <label className="block text-[10px] font-black text-slate-500 uppercase mb-1.5 ml-1">Jenis</label>
                                  <select className="w-full border-2 border-slate-100 p-3 rounded-2xl focus:border-brand-500 outline-none font-bold text-slate-800 text-sm bg-white" value={formData.type} onChange={e=>setFormData({...formData, type: e.target.value as LoanType})}>
                                      <option value={LoanType.KPR}>KPR (Rumah)</option>
                                      <option value={LoanType.KKB}>KKB (Kendaraan)</option>
                                      <option value={LoanType.KTA}>KTA (Cash)</option>
                                      <option value={LoanType.CC}>Kartu Kredit</option>
                                  </select>
                              </div>
                              <div className="col-span-1">
                                  <label className="block text-[10px] font-black text-slate-500 uppercase mb-1.5 ml-1">Tgl Jatuh Tempo</label>
                                  <div className="flex items-center gap-2 bg-slate-50 p-3 rounded-2xl border border-slate-100">
                                      <Calendar size={16} className="text-slate-400"/>
                                      <input type="number" min="1" max="31" className="w-full bg-transparent outline-none font-bold text-sm" value={formData.dueDate} onChange={e=>setFormData({...formData, dueDate: Number(e.target.value)})} />
                                  </div>
                              </div>
                          </div>

                          <div className="grid grid-cols-2 gap-4">
                              <div>
                                  <label className="block text-[10px] font-black text-slate-500 uppercase mb-1.5 ml-1">Mulai Kredit</label>
                                  <input type="date" className="w-full border-2 border-slate-100 p-3 rounded-2xl focus:border-brand-500 outline-none font-bold text-slate-600 text-sm" value={formData.startDate} onChange={e=>setFormData({...formData, startDate: e.target.value})} required />
                              </div>
                              <div>
                                  <label className="block text-[10px] font-black text-slate-500 uppercase mb-1.5 ml-1">Selesai Kredit</label>
                                  <input type="date" className="w-full border-2 border-slate-100 p-3 rounded-2xl focus:border-brand-500 outline-none font-bold text-slate-600 text-sm" value={formData.endDate} onChange={e=>setFormData({...formData, endDate: e.target.value})} required />
                              </div>
                          </div>

                          <div>
                              <label className="block text-[10px] font-black text-slate-500 uppercase mb-1.5 ml-1">Plafon Awal (Pokok)</label>
                              <div className="relative">
                                  <span className="absolute left-4 top-3.5 text-slate-400 font-bold text-sm">Rp</span>
                                  <input type="number" min="0" className="w-full border-2 border-slate-100 p-3 pl-10 rounded-2xl focus:border-brand-500 outline-none font-black text-slate-900 tracking-wide" value={formData.originalPrincipal} onChange={e=>setFormData({...formData, originalPrincipal: Number(e.target.value)})} required />
                              </div>
                          </div>

                          {/* STRATEGY SWITCHER */}
                          <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                              <div className="flex justify-between items-center mb-4">
                                  <label className="text-[10px] font-black text-slate-500 uppercase">Strategi Bunga & Cicilan</label>
                                  <div className="flex bg-white rounded-lg p-1 border border-slate-200 shadow-sm">
                                      <button type="button" onClick={()=>setFormData({...formData, interestStrategy: 'Fixed'})} className={`px-3 py-1 rounded text-[10px] font-bold transition ${formData.interestStrategy === 'Fixed' ? 'bg-slate-900 text-white' : 'text-slate-500'}`}>Flat/Fixed</button>
                                      <button type="button" onClick={()=>setFormData({...formData, interestStrategy: 'StepUp'})} className={`px-3 py-1 rounded text-[10px] font-bold transition ${formData.interestStrategy === 'StepUp' ? 'bg-purple-600 text-white' : 'text-slate-500'}`}>Step-Up</button>
                                  </div>
                              </div>

                              {formData.interestStrategy === 'Fixed' ? (
                                  <div>
                                      <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1.5">Cicilan Tetap per Bulan</label>
                                      <div className="relative">
                                          <span className="absolute left-4 top-3.5 text-slate-400 font-bold text-sm">Rp</span>
                                          <input type="number" min="0" className="w-full border-2 border-slate-200 bg-white p-3 pl-10 rounded-xl focus:border-brand-500 outline-none font-black text-slate-900" value={formData.monthlyInstallment} onChange={e=>setFormData({...formData, monthlyInstallment: Number(e.target.value)})} required />
                                      </div>
                                  </div>
                              ) : (
                                  <div className="space-y-3 animate-fade-in">
                                      <div className="flex justify-between items-center">
                                          <p className="text-xs text-purple-700 font-bold flex items-center gap-1"><Layers size={12}/> Jenjang Kenaikan Cicilan</p>
                                          <button type="button" onClick={handleAddStepUpRow} className="text-[10px] bg-purple-100 text-purple-700 px-2 py-1 rounded font-bold hover:bg-purple-200">+ Add Period</button>
                                      </div>
                                      
                                      <div className="space-y-2">
                                          {stepUpRows.map((row, idx) => (
                                              <div key={idx} className="flex gap-2 items-center">
                                                  <input type="number" placeholder="Start" className="w-16 border p-2 rounded-lg text-xs text-center font-bold" value={row.start} onChange={e => handleStepUpChange(idx, 'start', e.target.value)} />
                                                  <span className="text-slate-400 text-xs">-</span>
                                                  <input type="number" placeholder="End" className="w-16 border p-2 rounded-lg text-xs text-center font-bold" value={row.end} onChange={e => handleStepUpChange(idx, 'end', e.target.value)} />
                                                  <span className="text-slate-400 text-xs text-right w-8">Bulan</span>
                                                  <input type="number" placeholder="Amount (Rp)" className="flex-1 border p-2 rounded-lg text-xs font-bold" value={row.amount} onChange={e => handleStepUpChange(idx, 'amount', e.target.value)} />
                                                  <button type="button" onClick={() => handleRemoveStepUpRow(idx)} className="text-red-400 hover:text-red-600"><X size={14}/></button>
                                              </div>
                                          ))}
                                      </div>
                                      <p className="text-[10px] text-slate-400 italic mt-2">*Cicilan akan mengikuti tabel ini sesuai periode bulan berjalan.</p>
                                  </div>
                              )}
                          </div>
                      </form>
                  </div>

                  {/* RIGHT: SMART PREVIEW */}
                  <div className="p-8 md:w-2/5 bg-slate-900 text-white flex flex-col justify-between relative overflow-hidden">
                      <div className="absolute top-0 right-0 p-12 opacity-5 pointer-events-none"><Calculator size={200}/></div>
                      
                      <div className="relative z-10">
                          <h4 className="text-xs font-black uppercase tracking-[0.2em] text-slate-500 mb-6 flex items-center gap-2"><Calculator size={14}/> AI Calculation Preview</h4>
                          
                          <div className="space-y-6">
                              <div className="flex justify-between items-center border-b border-slate-800 pb-4">
                                  <span className="text-slate-400 text-sm">Estimasi Bunga (Flat Eq.)</span>
                                  <span className="font-mono font-bold text-xl text-yellow-400">{analysis.impliedInterestRate.toFixed(2)}% <span className="text-xs text-slate-500">p.a</span></span>
                              </div>
                              <div className="flex justify-between items-center border-b border-slate-800 pb-4">
                                  <span className="text-slate-400 text-sm">Durasi Tenor</span>
                                  <span className="font-mono font-bold text-xl">{analysis.tenorMonths} <span className="text-xs text-slate-500">Bulan</span></span>
                              </div>
                              <div className="flex justify-between items-center border-b border-slate-800 pb-4">
                                  <span className="text-slate-400 text-sm">Total Bunga Dibayar</span>
                                  <span className="font-mono font-bold text-xl text-red-400">{formatCurrency(analysis.totalOverpayment)}</span>
                              </div>
                              
                              <div className="bg-slate-800/50 p-4 rounded-2xl border border-slate-700">
                                  <p className="text-[10px] font-bold text-slate-500 uppercase mb-2">Posisi Hutang Saat Ini</p>
                                  <div className="flex justify-between items-end mb-2">
                                      <span className="text-xs text-slate-400">Sudah Jalan {analysis.monthsPassed} Bulan</span>
                                      <span className="font-black text-2xl">{formatCurrency(analysis.currentRemaining)}</span>
                                  </div>
                                  <div className="w-full bg-slate-700 h-2 rounded-full overflow-hidden">
                                      <div className="h-full bg-gradient-to-r from-blue-500 to-cyan-400" style={{ width: `${analysis.progress}%` }}></div>
                                  </div>
                              </div>
                          </div>
                      </div>

                      <div className="flex gap-3 mt-8 relative z-10">
                          <button type="button" onClick={()=>setIsModalOpen(false)} className="px-6 py-4 rounded-2xl font-bold text-slate-400 hover:text-white hover:bg-white/10 transition">Batal</button>
                          <button 
                            type="submit" 
                            form="debtForm"
                            disabled={isSyncing || (formData.interestStrategy === 'Fixed' && formData.monthlyInstallment <= 0)} 
                            className="flex-1 py-4 bg-white text-slate-900 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-brand-50 transition shadow-xl flex items-center justify-center gap-2 disabled:opacity-50"
                          >
                              {isSyncing ? <Loader2 className="animate-spin" size={16}/> : <Save size={16}/>}
                              Simpan Kontrak
                          </button>
                      </div>
                  </div>
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
