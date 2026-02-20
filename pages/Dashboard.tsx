import React, { useState, useEffect } from 'react';
import { 
  TrendingUp, 
  TrendingDown, 
  AlertTriangle, 
  CheckCircle, 
  DollarSign,
  Activity
} from 'lucide-react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell
} from 'recharts';
import { getUserData } from '../services/mockDb';

const Dashboard = () => {
  const [metrics, setMetrics] = useState({
    dsr: 0,
    runway: 0,
    netCashflow: 0,
    totalDebt: 0,
    totalSavings: 0
  });

  useEffect(() => {
    const userId = localStorage.getItem('paydone_active_user');
    if (userId) {
      const data = getUserData(userId);
      
      // Calculate metrics from mock data
      // This is simplified logic based on the types
      const totalIncome = data.incomes.reduce((sum, item) => sum + item.amount, 0);
      const totalDebtPayments = data.debts.reduce((sum, item) => sum + item.monthlyPayment, 0);
      const totalExpenses = data.dailyExpenses.reduce((sum, item) => sum + item.amount, 0); // Simplified
      
      const dsr = totalIncome > 0 ? (totalDebtPayments / totalIncome) * 100 : 0;
      const netCashflow = totalIncome - totalDebtPayments - totalExpenses;
      const totalSavings = data.sinkingFunds.reduce((sum, item) => sum + item.currentAmount, 0);
      const runway = totalExpenses > 0 ? totalSavings / totalExpenses : 0;

      setMetrics({
        dsr,
        runway,
        netCashflow,
        totalDebt: data.debts.reduce((sum, item) => sum + item.remainingPrincipal, 0),
        totalSavings
      });
    }
  }, []);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0
    }).format(amount);
  };

  const COLORS = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b'];

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-slate-900">Dashboard Overview</h1>
        <p className="text-slate-500">Apa yang ingin kamu selesaikan hari ini?</p>
      </header>

      {/* Key Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* DSR Card */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
          <div className="flex justify-between items-start mb-4">
            <div>
              <p className="text-sm font-medium text-slate-500">Debt Service Ratio</p>
              <h3 className={`text-2xl font-bold mt-1 ${metrics.dsr > 40 ? 'text-red-500' : 'text-slate-900'}`}>
                {metrics.dsr.toFixed(1)}%
              </h3>
            </div>
            <div className={`p-2 rounded-lg ${metrics.dsr > 40 ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-600'}`}>
              <Activity className="w-5 h-5" />
            </div>
          </div>
          <p className="text-xs text-slate-500">
            {metrics.dsr > 40 ? '⚠️ Bahaya! Kurangi hutang.' : '✅ Cashflow sehat.'}
          </p>
        </div>

        {/* Runway Card */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
          <div className="flex justify-between items-start mb-4">
            <div>
              <p className="text-sm font-medium text-slate-500">Financial Runway</p>
              <h3 className="text-2xl font-bold mt-1 text-slate-900">
                {metrics.runway.toFixed(1)} Bln
              </h3>
            </div>
            <div className="p-2 rounded-lg bg-blue-50 text-blue-600">
              <TrendingUp className="w-5 h-5" />
            </div>
          </div>
          <p className="text-xs text-slate-500">
            Total Liquid: {formatCurrency(metrics.totalSavings)}
          </p>
        </div>

        {/* Net Cashflow Card */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
          <div className="flex justify-between items-start mb-4">
            <div>
              <p className="text-sm font-medium text-slate-500">Net Cashflow / Bulan</p>
              <h3 className={`text-2xl font-bold mt-1 ${metrics.netCashflow < 0 ? 'text-red-500' : 'text-slate-900'}`}>
                {formatCurrency(metrics.netCashflow)}
              </h3>
            </div>
            <div className="p-2 rounded-lg bg-emerald-50 text-emerald-600">
              <DollarSign className="w-5 h-5" />
            </div>
          </div>
          <p className="text-xs text-slate-500">
            Available for savings or debt payoff
          </p>
        </div>

        {/* Total Debt Card */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
          <div className="flex justify-between items-start mb-4">
            <div>
              <p className="text-sm font-medium text-slate-500">Total Debt</p>
              <h3 className="text-2xl font-bold mt-1 text-slate-900">
                {formatCurrency(metrics.totalDebt)}
              </h3>
            </div>
            <div className="p-2 rounded-lg bg-orange-50 text-orange-600">
              <TrendingDown className="w-5 h-5" />
            </div>
          </div>
          <p className="text-xs text-slate-500">
            Principal remaining
          </p>
        </div>
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Freedom Matrix */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 lg:col-span-2">
          <h3 className="text-lg font-semibold text-slate-900 mb-4">Freedom Matrix</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={[
                { name: 'Month 1', snowball: 4000, avalanche: 4200 },
                { name: 'Month 2', snowball: 3000, avalanche: 3500 },
                { name: 'Month 3', snowball: 2000, avalanche: 2800 },
                { name: 'Month 4', snowball: 1000, avalanche: 1500 },
              ]}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="snowball" fill="#3b82f6" name="Snowball" radius={[4, 4, 0, 0]} />
                <Bar dataKey="avalanche" fill="#10b981" name="Avalanche" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Crossing Analysis */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
          <h3 className="text-lg font-semibold text-slate-900 mb-4">Crossing Analysis</h3>
          <div className="space-y-4">
            <div className="p-4 bg-slate-50 rounded-lg">
              <h4 className="font-medium text-slate-900 mb-2">The "Which Pain" Decision</h4>
              <p className="text-sm text-slate-600 mb-2">
                Saran sistem berdasarkan DSR {metrics.dsr.toFixed(1)}%:
              </p>
              <div className="flex items-center gap-2 text-sm text-brand-600 font-medium">
                <CheckCircle className="w-4 h-4" />
                {metrics.dsr > 40 ? 'Fokus Lunasi Hutang' : 'Fokus Investasi'}
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 border border-slate-200 rounded-lg">
                <p className="text-xs text-slate-500">Target Income</p>
                <p className="font-semibold text-slate-900">+2.5jt</p>
              </div>
              <div className="p-3 border border-slate-200 rounded-lg">
                <p className="text-xs text-slate-500">Potensi Hemat</p>
                <p className="font-semibold text-green-600">150rb/bln</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
