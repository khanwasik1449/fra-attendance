import React, { useState, useEffect, useMemo } from 'react';
import { apiClient, extractErrorMessage } from '../../lib/api';
import { DashboardSummary, DailyReportResponse, Project, Employee, DailyReportRecord } from '../../types';
import { StatusBadge } from '../../components/StatusBadge';
import {
  Users,
  UserCheck,
  Clock,
  UserX,
  LogIn,
  LogOut,
  FileQuestion,
  ArrowRight,
  RefreshCw,
  FileSpreadsheet,
  Briefcase,
  KeyRound,
  Lock,
  CheckCircle2,
  MapPin,
  Copy,
  Check,
  Eye,
  EyeOff,
  X,
  Filter,
  FolderGit2,
  ShieldCheck,
  Sparkles,
  Radio,
  ArrowUpRight,
  Navigation,
  Activity,
  RotateCcw,
  UploadCloud,
  UserPlus
} from 'lucide-react';
import { Link } from 'react-router-dom';

export const AdminDashboard: React.FC = () => {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [dailyData, setDailyData] = useState<DailyReportResponse | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selectedProjectFilter, setSelectedProjectFilter] = useState<string | null>(null);
  const [statusTab, setStatusTab] = useState<'ALL' | 'ON_DUTY' | 'COMPLETED' | 'ABSENT'>('ALL');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Password Reset Modal State
  const [showResetModal, setShowResetModal] = useState(false);
  const [resetEmpId, setResetEmpId] = useState<string>('');
  const [newPassword, setNewPassword] = useState('');
  const [showPasswordText, setShowPasswordText] = useState(false);
  const [resetSubmitting, setResetSubmitting] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const [resetSuccess, setResetSuccess] = useState<{
    empName: string;
    empId: string;
    username: string;
    passwordText: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  // Reset Duty Confirmation State
  const [resetDutyTarget, setResetDutyTarget] = useState<{
    isOpen: boolean;
    employeeId?: string;
    employeeName: string;
    isAll: boolean;
  } | null>(null);
  const [resetDutySubmitting, setResetDutySubmitting] = useState(false);
  const [dutyNotification, setDutyNotification] = useState<string | null>(null);

  const fetchDashboardData = async () => {
    try {
      const [dailyRes, projRes, empRes] = await Promise.all([
        apiClient.get<DailyReportResponse>('/admin/reports/daily/'),
        apiClient.get('/auth/projects/'),
        apiClient.get('/auth/employees/')
      ]);
      setDailyData(dailyRes.data);
      setSummary(dailyRes.data.summary);
      setProjects(projRes.data.results || projRes.data || []);
      setEmployees(empRes.data.results || empRes.data || []);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchDashboardData();
  };

  // Helper to determine if an FA is currently On Duty (checked in and not checked out)
  const isOnDuty = (r: DailyReportRecord): boolean => {
    if (typeof r.is_on_duty === 'boolean') {
      return r.is_on_duty;
    }
    return Boolean(r.check_in && r.check_in !== '--' && (!r.check_out || r.check_out === '--'));
  };

  // All On-Duty FAs across entire system today
  const allOnDutyRecords = useMemo(() => {
    return (dailyData?.records || []).filter(isOnDuty);
  }, [dailyData]);

  // Compute Project-Wise FA Statistics
  const projectSummaries = useMemo(() => {
    const records = dailyData?.records || [];
    return projects.map((p) => {
      // Find records assigned to this project
      const matchingRecords = records.filter(
        (r) => r.project && (r.project.toLowerCase() === p.name.toLowerCase() || r.project.toLowerCase() === p.code.toLowerCase())
      );
      const onDutyCount = matchingRecords.filter(isOnDuty).length;
      const presentCount = matchingRecords.filter((r) => r.status === 'PRESENT' || r.status === 'LATE').length;
      const checkedOutCount = matchingRecords.filter((r) => r.check_out && r.check_out !== '--').length;
      const absentCount = matchingRecords.filter((r) => r.status === 'ABSENT').length;

      // Also count from employee list if records is empty for today
      const assignedEmps = employees.filter((e) => e.project === p.id || (e.project_name && e.project_name === p.name));
      const totalCount = Math.max(matchingRecords.length, assignedEmps.length);

      return {
        id: p.id,
        name: p.name,
        code: p.code,
        division: p.division || '',
        district: p.district || '',
        upazila: p.upazila || '',
        total_fas: totalCount,
        on_duty_count: onDutyCount,
        present_count: presentCount,
        checked_out_count: checkedOutCount,
        absent_count: absentCount,
      };
    });
  }, [projects, dailyData, employees]);

  // Filtered attendance roster based on selected project and status tab
  const displayedRecords = useMemo(() => {
    let list = dailyData?.records || [];
    if (selectedProjectFilter) {
      list = list.filter(
        (r) => r.project && r.project.toLowerCase() === selectedProjectFilter.toLowerCase()
      );
    }
    if (statusTab === 'ON_DUTY') {
      list = list.filter(isOnDuty);
    } else if (statusTab === 'COMPLETED') {
      list = list.filter((r) => r.check_out && r.check_out !== '--');
    } else if (statusTab === 'ABSENT') {
      list = list.filter((r) => r.status === 'ABSENT');
    }
    return list;
  }, [dailyData, selectedProjectFilter, statusTab]);

  // Counts for the active filter tab badge counters
  const tabCounts = useMemo(() => {
    let list = dailyData?.records || [];
    if (selectedProjectFilter) {
      list = list.filter(
        (r) => r.project && r.project.toLowerCase() === selectedProjectFilter.toLowerCase()
      );
    }
    return {
      all: list.length,
      on_duty: list.filter(isOnDuty).length,
      completed: list.filter((r) => r.check_out && r.check_out !== '--').length,
      absent: list.filter((r) => r.status === 'ABSENT').length,
    };
  }, [dailyData, selectedProjectFilter]);

  // Helper to open Password Reset Modal for an employee
  const handleOpenResetModal = (empId?: string) => {
    setResetError(null);
    setResetSuccess(null);
    setCopied(false);
    setNewPassword('');
    setShowPasswordText(false);
    if (empId) {
      setResetEmpId(empId);
    } else if (employees.length > 0) {
      setResetEmpId(employees[0].employee_id);
    }
    setShowResetModal(true);
  };

  // Password Generator
  const generateRandomPassword = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%';
    let pass = 'FA#';
    for (let i = 0; i < 6; i++) {
      pass += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setNewPassword(pass);
    setShowPasswordText(true);
  };

  // Execute Password Reset
  const handleExecuteResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetEmpId) {
      setResetError('Please select a Field Assistant.');
      return;
    }
    if (!newPassword || newPassword.trim().length < 6) {
      setResetError('Password must be at least 6 characters long.');
      return;
    }

    setResetSubmitting(true);
    setResetError(null);

    try {
      const res = await apiClient.post('/auth/employees/quick-reset-password/', {
        employee_id: resetEmpId,
        new_password: newPassword.trim(),
      });

      setResetSuccess({
        empName: res.data.full_name || 'Field Assistant',
        empId: res.data.employee_id || resetEmpId,
        username: res.data.username || '',
        passwordText: newPassword.trim(),
      });
    } catch (err) {
      setResetError(extractErrorMessage(err));
    } finally {
      setResetSubmitting(false);
    }
  };

  const handleCopyCredentials = () => {
    if (!resetSuccess) return;
    const textToCopy = `Field Assistant Login:\nUsername: ${resetSuccess.username}\nPassword: ${resetSuccess.passwordText}`;
    navigator.clipboard.writeText(textToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleOpenResetDutyModal = (employeeId?: string, employeeName?: string, isAll?: boolean) => {
    setResetDutyTarget({
      isOpen: true,
      employeeId,
      employeeName: employeeName || (isAll ? 'All Field Assistants' : 'Field Assistant'),
      isAll: Boolean(isAll),
    });
  };

  const handleConfirmResetDuty = async () => {
    if (!resetDutyTarget) return;
    setResetDutySubmitting(true);
    try {
      const res = await apiClient.post('/attendance/admin/reset-duty/', {
        employee_id: resetDutyTarget.isAll ? 'ALL' : resetDutyTarget.employeeId,
      });
      setDutyNotification(res.data.detail || 'Duty reset successfully.');
      setResetDutyTarget(null);
      await fetchDashboardData();
      setTimeout(() => setDutyNotification(null), 5000);
    } catch (err) {
      alert(extractErrorMessage(err));
    } finally {
      setResetDutySubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[70vh]">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-emerald-500"></div>
      </div>
    );
  }

  const statCards = [
    {
      title: 'Active Projects',
      value: projects.length,
      icon: FolderGit2,
      color: 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:border-emerald-400 cursor-pointer',
      iconColor: 'text-emerald-600',
      link: '/admin/projects',
      highlight: true,
      highlightText: 'Manage Projects',
    },
    {
      title: 'Total Field Assistants',
      value: summary?.total_assistants ?? employees.length,
      icon: Users,
      color: 'bg-blue-50 text-blue-800 border-blue-200 hover:border-blue-400 cursor-pointer',
      iconColor: 'text-blue-600',
      link: '/admin/employees',
      highlight: true,
      highlightText: 'Manage Accounts',
    },
    {
      title: 'Currently On Duty',
      value: allOnDutyRecords.length,
      icon: Radio,
      color: 'bg-emerald-50 text-emerald-950 border-emerald-300 ring-2 ring-emerald-400/50 shadow-sm cursor-pointer',
      iconColor: 'text-emerald-600 animate-pulse',
      highlight: allOnDutyRecords.length > 0,
      highlightText: 'Active in Field',
      onClick: () => {
        setStatusTab('ON_DUTY');
        const el = document.getElementById('attendance-roster-section');
        if (el) el.scrollIntoView({ behavior: 'smooth' });
      }
    },
    {
      title: 'Present Today',
      value: summary?.present ?? 0,
      icon: UserCheck,
      color: 'bg-emerald-50 text-emerald-800 border-emerald-200',
      iconColor: 'text-emerald-600',
    },
    {
      title: 'Shift Completed',
      value: summary?.checked_out ?? 0,
      icon: LogOut,
      color: 'bg-cyan-50 text-cyan-800 border-cyan-200',
      iconColor: 'text-cyan-600',
    },
    {
      title: 'Late Arrivals',
      value: summary?.late ?? 0,
      icon: Clock,
      color: 'bg-amber-50 text-amber-800 border-amber-200',
      iconColor: 'text-amber-600',
    },
    {
      title: 'Absent',
      value: summary?.absent ?? 0,
      icon: UserX,
      color: 'bg-rose-50 text-rose-800 border-rose-200',
      iconColor: 'text-rose-600',
    },
    {
      title: 'Pending Manual Requests',
      value: summary?.pending_manual_requests ?? 0,
      icon: FileQuestion,
      color: 'bg-orange-50 text-orange-800 border-orange-200',
      iconColor: 'text-orange-600',
      highlight: (summary?.pending_manual_requests ?? 0) > 0,
      highlightText: 'Action required',
      link: '/admin/manual-requests',
    },
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Top Header & Quick Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2.5">
            <span>Field Operations & Project Dashboard</span>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
              Project-Based Monitoring
            </span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Authoritative project-based Field Assistant attendance & real-time check-in/out tracking • Date: <strong className="text-slate-800">{summary?.date}</strong>
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50 shadow-2xs transition-all cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-slate-500 ${refreshing ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
          <Link
            to="/admin/daily"
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-2xs transition-all"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>Full Daily Report</span>
          </Link>
        </div>
      </div>

      {/* Quick Action Command Strip */}
      <div className="bg-white rounded-2xl border border-slate-200/90 p-3 shadow-xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[11px] font-black uppercase tracking-wider text-slate-400 pl-1 pr-1">
            Quick Actions:
          </span>
          <Link
            to="/admin/employees?action=add-assistant"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-2xs transition-all cursor-pointer"
            title="Register a new Field Assistant account"
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span>+ Add Assistant</span>
          </Link>
          <Link
            to="/admin/projects?action=add-project"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-2xs transition-all cursor-pointer"
            title="Create a new Project and Work Location"
          >
            <Briefcase className="w-3.5 h-3.5 text-blue-200" />
            <span>+ New Project Site</span>
          </Link>
          <Link
            to="/admin/employees?action=bulk-upload"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold shadow-2xs transition-all cursor-pointer"
            title="Bulk import Field Assistants from Excel or CSV"
          >
            <UploadCloud className="w-3.5 h-3.5 text-emerald-400" />
            <span>Bulk Upload FAs</span>
          </Link>
          <button
            type="button"
            onClick={() => handleOpenResetModal()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold shadow-2xs transition-all cursor-pointer"
            title="Generate a temporary password for any Field Assistant"
          >
            <KeyRound className="w-3.5 h-3.5" />
            <span>Reset FA Password</span>
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => handleOpenResetDutyModal(undefined, 'All Field Assistants', true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-bold shadow-2xs transition-all cursor-pointer"
            title="Reset today's attendance sessions for all field assistants"
          >
            <RotateCcw className="w-3.5 h-3.5 text-rose-600" />
            <span>Reset Duty Today</span>
          </button>
          <Link
            to="/admin/projects"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-200 text-xs font-bold text-slate-700 shadow-2xs transition-all"
          >
            <Briefcase className="w-3.5 h-3.5 text-slate-500" />
            <span>Projects ({projects.length})</span>
          </Link>
        </div>
      </div>

      {dutyNotification && (
        <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-sm font-bold flex items-center justify-between shadow-xs animate-in fade-in">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <span>{dutyNotification}</span>
          </div>
          <button
            type="button"
            onClick={() => setDutyNotification(null)}
            className="text-emerald-700 hover:text-emerald-900 p-1 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-800 text-sm font-medium">
          {error}
        </div>
      )}

      {/* 8 Responsive Metric Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {statCards.map((card, idx) => {
          const Icon = card.icon;
          const CardContent = (
            <div
              key={idx}
              onClick={card.onClick}
              className={`p-4 rounded-2xl border ${card.color} shadow-sm transition-all hover:shadow-md relative overflow-hidden`}
            >
              <div className="flex items-center justify-between">
                <div className="text-[11px] font-bold uppercase tracking-wider opacity-80">
                  {card.title}
                </div>
                <Icon className={`w-4 h-4 ${card.iconColor}`} />
              </div>
              <div className="mt-2 text-2xl sm:text-3xl font-black font-mono tracking-tight">
                {card.value}
              </div>
              {card.highlight && (
                <div className="mt-1.5 flex items-center gap-1 text-[11px] font-bold text-emerald-700">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping"></span>
                  <span>{card.highlightText || 'Active now'}</span>
                  {card.link && <ArrowRight className="w-3 h-3" />}
                </div>
              )}
            </div>
          );

          if (card.link) {
            return (
              <Link key={idx} to={card.link}>
                {CardContent}
              </Link>
            );
          }
          return CardContent;
        })}
      </div>

      {/* ========================================================= */}
      {/* 🟢 DEDICATED SECTION: CURRENTLY ON DUTY FIELD ASSISTANTS  */}
      {/* ========================================================= */}
      <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 rounded-3xl p-6 text-white shadow-xl border border-slate-700/80 space-y-4 relative overflow-hidden">
        {/* Subtle decorative glow */}
        <div className="absolute -right-12 -top-12 w-56 h-56 rounded-full bg-emerald-500/15 blur-3xl pointer-events-none" />

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-700/60 pb-4 relative z-10">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
              </span>
              <h2 className="text-lg font-black text-white tracking-tight flex items-center gap-2">
                <span>Currently On Duty Field Assistants</span>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  {allOnDutyRecords.length} Active in Field
                </span>
              </h2>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Real-time monitoring of assistants currently clocked in and active on site today.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setStatusTab('ON_DUTY');
                const el = document.getElementById('attendance-roster-section');
                if (el) el.scrollIntoView({ behavior: 'smooth' });
              }}
              className="px-3.5 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-slate-950 text-xs font-black shadow-md transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <Radio className="w-3.5 h-3.5 text-slate-950" />
              <span>Show On-Duty Roster</span>
            </button>
          </div>
        </div>

        {allOnDutyRecords.length === 0 ? (
          <div className="text-center py-8 px-4 bg-slate-800/60 rounded-2xl border border-slate-700/40 relative z-10 space-y-2">
            <div className="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center mx-auto text-slate-400">
              <UserCheck className="w-5 h-5 text-emerald-400" />
            </div>
            <div className="text-sm font-bold text-slate-200">
              No Field Assistants are currently on duty
            </div>
            <p className="text-xs text-slate-400 max-w-md mx-auto">
              All field assistants have either completed their shifts for today or haven't punched in yet. Assistants will appear here dynamically in real time as they check in.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 relative z-10">
            {allOnDutyRecords.map((r) => (
              <div
                key={r.employee_id}
                className="bg-slate-800/90 rounded-2xl p-4 border border-slate-700 shadow-md hover:border-emerald-500/60 transition-all space-y-3"
              >
                {/* Assistant Info Header */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-400 to-teal-600 flex items-center justify-center text-white font-black text-sm shadow-sm shrink-0">
                      {r.employee_name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div className="font-bold text-sm text-white leading-tight">
                        {r.employee_name}
                      </div>
                      <div className="text-[11px] font-mono text-slate-400">
                        {r.employee_id} • {r.department}
                      </div>
                    </div>
                  </div>

                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-950/90 text-emerald-400 border border-emerald-700/60 shadow-xs shrink-0">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping"></span>
                    ON DUTY
                  </span>
                </div>

                {/* Project Assignment */}
                <div className="p-2.5 rounded-xl bg-slate-900/80 border border-slate-700/50 space-y-1">
                  <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                    Assigned Project Site
                  </div>
                  <div className="text-xs font-bold text-emerald-300 truncate">
                    {r.project || 'General Field'}
                  </div>
                  {(r.district || r.upazila) && (
                    <div className="text-[11px] text-slate-400 flex items-center gap-1">
                      <MapPin className="w-3 h-3 text-emerald-400 shrink-0" />
                      <span>{r.district} {r.upazila ? `(${r.upazila})` : ''}</span>
                    </div>
                  )}
                </div>

                {/* Check In Details & Location */}
                <div className="space-y-1.5 text-xs">
                  <div className="flex items-center justify-between text-slate-300">
                    <span className="text-slate-400 text-[11px]">Punched In:</span>
                    <span className="font-mono font-bold text-white bg-slate-700/60 px-2 py-0.5 rounded text-[11px]">
                      {r.check_in}
                    </span>
                  </div>

                  {r.check_in_address && (
                    <div className="text-[11px] text-slate-300 leading-snug p-2 rounded-xl bg-slate-900/60 border border-slate-700/40">
                      <span className="text-slate-400 font-semibold block text-[10px] uppercase">Punch Location:</span>
                      <span className="text-slate-200">{r.check_in_address}</span>
                    </div>
                  )}

                  {r.check_in_latitude && r.check_in_longitude && (
                    <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 pt-0.5">
                      <span>GPS: {Number(r.check_in_latitude).toFixed(4)}, {Number(r.check_in_longitude).toFixed(4)}</span>
                      {r.check_in_accuracy && <span>±{r.check_in_accuracy}m</span>}
                    </div>
                  )}
                </div>

                {/* Action Buttons */}
                <div className="flex items-center gap-2 pt-2 border-t border-slate-700/60">
                  {r.check_in_latitude && r.check_in_longitude ? (
                    <a
                      href={`https://www.google.com/maps?q=${r.check_in_latitude},${r.check_in_longitude}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 inline-flex items-center justify-center gap-1 py-1.5 px-3 rounded-xl bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border border-blue-500/30 text-[11px] font-bold transition-all"
                    >
                      <MapPin className="w-3 h-3" />
                      <span>Google Maps</span>
                      <ArrowUpRight className="w-3 h-3" />
                    </a>
                  ) : null}

                  <button
                    type="button"
                    onClick={() => handleOpenResetDutyModal(r.employee_id, r.employee_name, false)}
                    className="inline-flex items-center justify-center gap-1 py-1.5 px-3 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/30 text-[11px] font-bold transition-all cursor-pointer"
                    title={`Reset today's duty for ${r.employee_name}`}
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>Reset Duty</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleOpenResetModal(r.employee_id)}
                    className="inline-flex items-center justify-center gap-1 py-1.5 px-3 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 text-[11px] font-bold transition-all cursor-pointer"
                    title={`Reset password for ${r.employee_name}`}
                  >
                    <KeyRound className="w-3 h-3" />
                    <span>Reset Key</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Project-Based Field Assistants Deployment Grid */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div>
            <h2 className="text-base font-black text-slate-900 flex items-center gap-2">
              <FolderGit2 className="w-5 h-5 text-emerald-600" />
              <span>Project-Based Field Assistants (প্রকল্পভিত্তিক এফএ বিবরণ)</span>
            </h2>
            <p className="text-xs text-slate-400">
              Live Field Assistant deployment across authorized projects. Click any project to filter the attendance roster below.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Link
              to="/admin/projects"
              className="text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 px-3 py-1 rounded-full flex items-center gap-1.5 transition-all shadow-2xs cursor-pointer"
              title="Add or configure projects and work locations"
            >
              <Briefcase className="w-3.5 h-3.5" />
              <span>Manage Projects</span>
            </Link>
            <Link
              to="/admin/employees?action=bulk-upload"
              className="text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-200 px-3 py-1 rounded-full flex items-center gap-1.5 transition-all shadow-2xs cursor-pointer"
              title="Bulk upload Field Assistants to projects"
            >
              <UploadCloud className="w-3.5 h-3.5 text-emerald-600" />
              <span>Bulk Upload FAs</span>
            </Link>
            {selectedProjectFilter && (
              <button
                type="button"
                onClick={() => setSelectedProjectFilter(null)}
                className="text-xs font-black text-emerald-800 bg-emerald-100 hover:bg-emerald-200 border border-emerald-300 px-3 py-1 rounded-full flex items-center gap-1.5 transition-all shadow-2xs cursor-pointer"
              >
                <X className="w-3 h-3" />
                <span>Clear Filter ({selectedProjectFilter})</span>
              </button>
            )}
            <span className="text-xs font-black px-3 py-1 rounded-full bg-slate-100 text-slate-800 border border-slate-200">
              {projectSummaries.length} Registered Projects
            </span>
          </div>
        </div>

        {projectSummaries.length === 0 ? (
          <div className="text-center py-8 text-slate-400 text-sm">
            No projects registered yet. Go to <Link to="/admin/employees" className="text-emerald-600 font-bold underline">Management</Link> to create project sites.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {projectSummaries.map((p) => {
              const isSelected = selectedProjectFilter?.toLowerCase() === p.name.toLowerCase();
              return (
                <div
                  key={p.id}
                  onClick={() => setSelectedProjectFilter(isSelected ? null : p.name)}
                  className={`p-4 rounded-2xl border cursor-pointer transition-all shadow-2xs space-y-3 ${
                    isSelected
                      ? 'bg-emerald-50/80 border-emerald-500 ring-2 ring-emerald-400 shadow-md'
                      : 'border-slate-200/80 bg-slate-50/50 hover:bg-emerald-50/30 hover:border-emerald-300'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="font-black text-sm text-slate-900 truncate">
                      {p.name}
                    </div>
                    <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-slate-200 text-slate-800 font-mono">
                      {p.code}
                    </span>
                  </div>

                  {(p.district || p.division) && (
                    <div className="flex items-center gap-1 text-[11px] text-slate-500">
                      <MapPin className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      <span className="truncate">
                        {p.district ? p.district : p.division} {p.upazila ? `• ${p.upazila}` : ''}
                      </span>
                    </div>
                  )}

                  <div className="flex items-baseline gap-1.5 pt-1">
                    <span className="text-2xl font-black font-mono text-emerald-700">
                      {p.total_fas}
                    </span>
                    <span className="text-xs font-bold text-slate-500">
                      {p.total_fas === 1 ? 'Field Assistant' : 'Field Assistants'}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-[11px] pt-2 border-t border-slate-200/60">
                    <span className="font-bold text-emerald-700 flex items-center gap-1">
                      {p.on_duty_count > 0 && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping"></span>}
                      {p.on_duty_count} On Duty
                    </span>
                    <span className="text-slate-500 font-medium">
                      {p.present_count} Present
                    </span>
                  </div>

                  <div className="pt-1">
                    <div
                      className={`w-full py-1 px-2.5 rounded-xl text-[11px] font-bold text-center transition-all ${
                        isSelected
                          ? 'bg-emerald-600 text-white'
                          : 'bg-white border border-slate-200 text-slate-600 hover:border-emerald-300 hover:text-emerald-700'
                      }`}
                    >
                      {isSelected ? '✓ Filtering Roster' : 'Click to Filter Roster'}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ========================================================= */}
      {/* TODAY'S LIVE ATTENDANCE FEED TABLE WITH FILTER TABS       */}
      {/* ========================================================= */}
      <div id="attendance-roster-section" className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <span>Today's Attendance Roster</span>
              <span className="text-xs text-slate-400 font-normal">
                ({displayedRecords.length} {selectedProjectFilter ? `in ${selectedProjectFilter}` : 'shown'})
              </span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Authoritative real-time attendance timestamps and genuine GPS punch locations
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Filter Tabs */}
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-2xl border border-slate-200">
              <button
                type="button"
                onClick={() => setStatusTab('ALL')}
                className={`px-3 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  statusTab === 'ALL'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                All ({tabCounts.all})
              </button>
              <button
                type="button"
                onClick={() => setStatusTab('ON_DUTY')}
                className={`px-3 py-1 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                  statusTab === 'ON_DUTY'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'text-emerald-800 hover:bg-emerald-50'
                }`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                <span>On Duty ({tabCounts.on_duty})</span>
              </button>
              <button
                type="button"
                onClick={() => setStatusTab('COMPLETED')}
                className={`px-3 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  statusTab === 'COMPLETED'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Finished ({tabCounts.completed})
              </button>
              <button
                type="button"
                onClick={() => setStatusTab('ABSENT')}
                className={`px-3 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  statusTab === 'ABSENT'
                    ? 'bg-rose-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Absent ({tabCounts.absent})
              </button>
            </div>

            <button
              type="button"
              onClick={() => handleOpenResetDutyModal(undefined, 'All Field Assistants', true)}
              className="text-xs font-bold text-rose-700 hover:text-rose-800 flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 border border-rose-200 transition-all cursor-pointer shadow-2xs"
              title="Reset today's attendance sessions for all field assistants"
            >
              <RotateCcw className="w-3.5 h-3.5 text-rose-600" />
              <span>Reset All Today</span>
            </button>

            <Link
              to="/admin/daily"
              className="text-xs font-bold text-emerald-600 hover:text-emerald-700 flex items-center gap-1 px-3 py-1.5 rounded-xl hover:bg-emerald-50 border border-transparent hover:border-emerald-200 transition-all"
            >
              Export <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>

        {/* Active Filter Indicator Chips Strip */}
        {(selectedProjectFilter || statusTab !== 'ALL') && (
          <div className="px-6 py-2.5 bg-emerald-50/70 border-b border-emerald-100 flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold text-emerald-950 flex items-center gap-1">
                <Filter className="w-3.5 h-3.5 text-emerald-600" />
                <span>Active Filters:</span>
              </span>

              {selectedProjectFilter && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white text-slate-800 border border-emerald-300 font-bold shadow-2xs">
                  <Briefcase className="w-3 h-3 text-blue-600" />
                  <span>Project: {selectedProjectFilter}</span>
                  <button
                    type="button"
                    onClick={() => setSelectedProjectFilter(null)}
                    className="text-slate-400 hover:text-slate-700 ml-0.5 cursor-pointer"
                    title="Clear project filter"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}

              {statusTab !== 'ALL' && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white text-slate-800 border border-emerald-300 font-bold shadow-2xs">
                  <span>Status: {statusTab === 'ON_DUTY' ? 'On Duty' : statusTab === 'COMPLETED' ? 'Finished Shift' : 'Absent'}</span>
                  <button
                    type="button"
                    onClick={() => setStatusTab('ALL')}
                    className="text-slate-400 hover:text-slate-700 ml-0.5 cursor-pointer"
                    title="Clear status filter"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}

              <span className="text-slate-500 font-medium">
                (Showing {displayedRecords.length} of {dailyData?.records.length || 0} assistants)
              </span>
            </div>

            <button
              type="button"
              onClick={() => {
                setSelectedProjectFilter(null);
                setStatusTab('ALL');
              }}
              className="text-xs font-bold text-emerald-700 hover:text-emerald-900 underline flex items-center gap-1 cursor-pointer"
            >
              <span>Reset all filters</span>
            </button>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-100">
            <thead className="bg-slate-50 text-[11px] font-bold text-slate-500 uppercase tracking-wider text-left">
              <tr>
                <th className="py-3.5 px-6">Field Assistant</th>
                <th className="py-3.5 px-6">Assigned Project</th>
                <th className="py-3.5 px-6">Check In & Real-Time Location</th>
                <th className="py-3.5 px-6">Check Out & Real-Time Location</th>
                <th className="py-3.5 px-6">Working Hours</th>
                <th className="py-3.5 px-6">Status</th>
                <th className="py-3.5 px-6 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {displayedRecords.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400 text-sm">
                    No field assistants found matching this filter.
                  </td>
                </tr>
              ) : (
                displayedRecords.map((r) => {
                  const onDuty = isOnDuty(r);
                  return (
                    <tr
                      key={r.employee_id}
                      className={`hover:bg-slate-50/80 transition-colors ${
                        onDuty ? 'bg-emerald-50/30' : ''
                      }`}
                    >
                      <td className="py-3.5 px-6 font-semibold text-slate-900">
                        <div className="flex items-center gap-2">
                          {onDuty && <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span>}
                          <div>
                            <div className="font-bold text-slate-900">{r.employee_name}</div>
                            <div className="text-xs text-slate-400 font-mono">
                              {r.employee_id} • {r.department}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Assigned Project Site */}
                      <td className="py-3.5 px-6">
                        {r.project ? (
                          <div className="space-y-1">
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-bold">
                              <FolderGit2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                              <span>{r.project}</span>
                            </span>
                            {(r.district || r.upazila) && (
                              <div className="text-[11px] text-slate-400">
                                {r.district} {r.upazila ? `(${r.upazila})` : ''}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400 italic">No project</span>
                        )}
                      </td>

                      {/* Check In & Real Location Address */}
                      <td className="py-3.5 px-6">
                        {r.check_in !== '--' ? (
                          <div className="space-y-0.5">
                            <div className="font-mono font-bold text-slate-900 text-xs">
                              {r.check_in}
                            </div>
                            {r.check_in_address ? (
                              <div className="text-[11px] text-slate-600 font-medium flex items-center gap-1">
                                <MapPin className="w-3 h-3 text-emerald-600 shrink-0" />
                                <span className="truncate max-w-xs">{r.check_in_address}</span>
                              </div>
                            ) : r.check_in_latitude ? (
                              <div className="text-[10px] text-slate-400 font-mono">
                                GPS: {r.check_in_latitude}, {r.check_in_longitude}
                              </div>
                            ) : null}
                          </div>
                        ) : (
                          <span className="text-slate-400 font-mono text-xs">--</span>
                        )}
                      </td>

                      {/* Check Out & Real Location Address */}
                      <td className="py-3.5 px-6">
                        {r.check_out !== '--' ? (
                          <div className="space-y-0.5">
                            <div className="font-mono font-bold text-slate-900 text-xs">
                              {r.check_out}
                            </div>
                            {r.check_out_address ? (
                              <div className="text-[11px] text-slate-600 font-medium flex items-center gap-1">
                                <MapPin className="w-3 h-3 text-blue-600 shrink-0" />
                                <span className="truncate max-w-xs">{r.check_out_address}</span>
                              </div>
                            ) : r.check_out_latitude ? (
                              <div className="text-[10px] text-slate-400 font-mono">
                                GPS: {r.check_out_latitude}, {r.check_out_longitude}
                              </div>
                            ) : null}
                          </div>
                        ) : onDuty ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                            In Progress (On Duty)
                          </span>
                        ) : (
                          <span className="text-slate-400 font-mono text-xs">--</span>
                        )}
                      </td>

                      {/* Duration */}
                      <td className="py-3.5 px-6 font-mono font-bold text-slate-800 text-xs">
                        {r.duration}
                      </td>

                      {/* Status */}
                      <td className="py-3.5 px-6">
                        {onDuty ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-black bg-emerald-100 text-emerald-800 border border-emerald-300 shadow-2xs animate-pulse">
                            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                            On Duty
                          </span>
                        ) : (
                          <StatusBadge status={r.status} />
                        )}
                      </td>

                      {/* Actions: Reset Duty & Password */}
                      <td className="py-3.5 px-6 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleOpenResetDutyModal(r.employee_id, r.employee_name, false)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-rose-50 text-slate-700 hover:text-rose-700 text-xs font-bold transition-all border border-slate-200 hover:border-rose-300 cursor-pointer"
                            title={`Reset today's duty for ${r.employee_name}`}
                          >
                            <RotateCcw className="w-3.5 h-3.5 text-rose-500" />
                            <span>Reset Duty</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleOpenResetModal(r.employee_id)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-amber-100 text-slate-700 hover:text-amber-900 text-xs font-bold transition-all border border-slate-200 hover:border-amber-300 cursor-pointer"
                            title={`Reset password for ${r.employee_name}`}
                          >
                            <KeyRound className="w-3.5 h-3.5 text-amber-600" />
                            <span>Password</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Password Reset Modal Dialog */}
      {showResetModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-100 space-y-5 animate-in fade-in zoom-in duration-200">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-amber-500 text-white flex items-center justify-center shadow-xs">
                  <KeyRound className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-black text-slate-900 text-base">Reset Field Assistant Password</h3>
                  <p className="text-xs text-slate-400">Set a new login password for assistant</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowResetModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {resetError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-800 text-xs font-medium">
                {resetError}
              </div>
            )}

            {resetSuccess ? (
              <div className="space-y-4">
                <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl space-y-2">
                  <div className="flex items-center gap-2 text-emerald-800 font-black text-sm">
                    <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                    <span>Password Updated Successfully!</span>
                  </div>
                  <p className="text-xs text-emerald-700">
                    The password for <strong>{resetSuccess.empName}</strong> has been updated.
                  </p>

                  <div className="mt-3 p-3 bg-white rounded-xl border border-emerald-200 space-y-1 font-mono text-xs text-slate-800">
                    <div><strong>Username:</strong> {resetSuccess.username}</div>
                    <div><strong>New Password:</strong> <span className="font-bold text-amber-700">{resetSuccess.passwordText}</span></div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleCopyCredentials}
                    className="flex-1 py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black flex items-center justify-center gap-2 shadow-xs transition-all"
                  >
                    {copied ? (
                      <>
                        <Check className="w-4 h-4" />
                        <span>Credentials Copied!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-4 h-4" />
                        <span>Copy Login Credentials</span>
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowResetModal(false)}
                    className="py-2.5 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-all"
                  >
                    Done
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleExecuteResetPassword} className="space-y-4">
                {/* Select Field Assistant */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Select Field Assistant
                  </label>
                  <select
                    value={resetEmpId}
                    onChange={(e) => setResetEmpId(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    {employees.map((emp) => (
                      <option key={emp.employee_id} value={emp.employee_id}>
                        {emp.full_name} ({emp.employee_id}) — User: {emp.username || emp.employee_id.toLowerCase()}
                      </option>
                    ))}
                  </select>
                </div>

                {/* New Password Input */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-bold text-slate-700">
                      New Password
                    </label>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={generateRandomPassword}
                        className="text-[11px] font-bold text-amber-600 hover:text-amber-700 flex items-center gap-1"
                      >
                        <Sparkles className="w-3 h-3" />
                        <span>Generate Random</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setNewPassword('password123');
                          setShowPasswordText(true);
                        }}
                        className="text-[11px] font-bold text-slate-500 hover:text-slate-700"
                      >
                        Use 'password123'
                      </button>
                    </div>
                  </div>

                  <div className="relative">
                    <input
                      type={showPasswordText ? 'text' : 'password'}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Enter new password (min. 6 chars)"
                      className="w-full px-3.5 py-2.5 pr-10 rounded-xl border border-slate-200 text-xs font-mono text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPasswordText(!showPasswordText)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      {showPasswordText ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Submit & Cancel Buttons */}
                <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setShowResetModal(false)}
                    className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs font-bold transition-all"
                  >
                    Cancel
                  </button>

                  <button
                    type="submit"
                    disabled={resetSubmitting}
                    className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white text-xs font-black shadow-xs flex items-center gap-1.5 transition-all"
                  >
                    <Lock className="w-3.5 h-3.5" />
                    <span>{resetSubmitting ? 'Updating...' : 'Confirm & Reset'}</span>
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Reset Duty Confirmation Modal */}
      {resetDutyTarget?.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-100 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2 text-rose-600">
                <RotateCcw className="w-5 h-5" />
                <h3 className="font-bold text-slate-900 text-base">
                  {resetDutyTarget.isAll ? "Reset All Field Assistants' Duty" : `Reset Duty for ${resetDutyTarget.employeeName}`}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setResetDutyTarget(null)}
                className="text-slate-400 hover:text-slate-600 rounded-lg p-1 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <p className="text-xs text-slate-600 leading-relaxed">
                {resetDutyTarget.isAll ? (
                  <>
                    Are you sure you want to <strong>reset today's duty for ALL field assistants</strong>?
                    This will clear today's attendance sessions, allowing all staff to check in afresh.
                  </>
                ) : (
                  <>
                    Are you sure you want to reset today's duty for <strong>{resetDutyTarget.employeeName}</strong>?
                    This will clear their punch record for today so they can check in again.
                  </>
                )}
              </p>
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-[11px] text-amber-800">
                <strong>Audit Note:</strong> An immutable audit log entry will be permanently appended for this action.
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setResetDutyTarget(null)}
                className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs font-bold transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={resetDutySubmitting}
                onClick={handleConfirmResetDuty}
                className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white text-xs font-black shadow-xs flex items-center gap-1.5 transition-all cursor-pointer"
              >
                <RotateCcw className={`w-3.5 h-3.5 ${resetDutySubmitting ? 'animate-spin' : ''}`} />
                <span>{resetDutySubmitting ? 'Resetting...' : 'Confirm Reset'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
