import React, { useState, useEffect } from 'react';
import { apiClient, extractErrorMessage } from '../../lib/api';
import { LeaveRequest, Holiday } from '../../types';
import { StatusBadge } from '../../components/StatusBadge';
import {
  CalendarDays,
  CheckCircle2,
  XCircle,
  Clock,
  AlertCircle,
  X,
  Search,
  Filter,
  Plus,
  Trash2,
  Calendar,
  Sparkles
} from 'lucide-react';

export const AdminLeaves: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'REQUESTS' | 'HOLIDAYS'>('REQUESTS');

  // Requests State
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [loadingRequests, setLoadingRequests] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Review Modal State
  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<LeaveRequest | null>(null);
  const [reviewAction, setReviewAction] = useState<'APPROVE' | 'REJECT'>('APPROVE');
  const [adminRemarks, setAdminRemarks] = useState('');
  const [reviewing, setReviewing] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Holidays State
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [loadingHolidays, setLoadingHolidays] = useState(true);
  const [holidayModalOpen, setHolidayModalOpen] = useState(false);
  const [holidayName, setHolidayName] = useState('');
  const [holidayDate, setHolidayDate] = useState('');
  const [holidayDesc, setHolidayDesc] = useState('');
  const [holidayRecurring, setHolidayRecurring] = useState(false);
  const [savingHoliday, setSavingHoliday] = useState(false);

  const fetchRequests = async () => {
    setLoadingRequests(true);
    try {
      const res = await apiClient.get('/leaves/admin/requests/');
      const data = Array.isArray(res.data) ? res.data : (res.data?.results || []);
      setRequests(data);
    } catch (err) {
      setFeedback({ type: 'error', message: extractErrorMessage(err) });
    } finally {
      setLoadingRequests(false);
    }
  };

  const fetchHolidays = async () => {
    setLoadingHolidays(true);
    try {
      const res = await apiClient.get('/leaves/holidays/');
      const data = Array.isArray(res.data) ? res.data : (res.data?.results || []);
      setHolidays(data);
    } catch (err) {
      setFeedback({ type: 'error', message: extractErrorMessage(err) });
    } finally {
      setLoadingHolidays(false);
    }
  };

  useEffect(() => {
    fetchRequests();
    fetchHolidays();
  }, []);

  const openReviewModal = (req: LeaveRequest, action: 'APPROVE' | 'REJECT') => {
    setSelectedRequest(req);
    setReviewAction(action);
    setAdminRemarks('');
    setReviewModalOpen(true);
  };

  const handleReviewSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRequest) return;

    setReviewing(true);
    setFeedback(null);

    try {
      const endpoint = `/leaves/admin/requests/${selectedRequest.id}/${reviewAction === 'APPROVE' ? 'approve' : 'reject'}/`;
      const res = await apiClient.post(endpoint, {
        admin_remarks: adminRemarks.trim()
      });
      setFeedback({ type: 'success', message: res.data.detail });
      setReviewModalOpen(false);
      await fetchRequests();
    } catch (err) {
      setFeedback({ type: 'error', message: extractErrorMessage(err) });
    } finally {
      setReviewing(false);
    }
  };

  const handleCreateHoliday = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!holidayName || !holidayDate) return;

    setSavingHoliday(true);
    setFeedback(null);

    try {
      await apiClient.post('/leaves/holidays/', {
        name: holidayName.trim(),
        date: holidayDate,
        description: holidayDesc.trim(),
        is_recurring: holidayRecurring
      });
      setFeedback({ type: 'success', message: `Added official holiday: ${holidayName}` });
      setHolidayName('');
      setHolidayDate('');
      setHolidayDesc('');
      setHolidayRecurring(false);
      setHolidayModalOpen(false);
      await fetchHolidays();
    } catch (err) {
      setFeedback({ type: 'error', message: extractErrorMessage(err) });
    } finally {
      setSavingHoliday(false);
    }
  };

  const handleDeleteHoliday = async (id: number, name: string) => {
    if (!confirm(`Are you sure you want to delete the holiday "${name}"?`)) return;

    try {
      await apiClient.delete(`/leaves/holidays/${id}/`);
      setFeedback({ type: 'success', message: `Deleted holiday: ${name}` });
      await fetchHolidays();
    } catch (err) {
      setFeedback({ type: 'error', message: extractErrorMessage(err) });
    }
  };

  const filteredRequests = (Array.isArray(requests) ? requests : []).filter((r) => {
    if (statusFilter !== 'ALL' && r.status !== statusFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const matchEmp = r.employee_name?.toLowerCase().includes(q) || r.employee_id?.toLowerCase().includes(q);
      const matchType = r.leave_type_display?.toLowerCase().includes(q);
      if (!matchEmp && !matchType) return false;
    }
    return true;
  });

  const pendingCount = (Array.isArray(requests) ? requests : []).filter((r) => r.status === 'PENDING').length;
  const holidaysCount = (Array.isArray(holidays) ? holidays : []).length;

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 flex items-center gap-2.5">
            <CalendarDays className="w-7 h-7 text-emerald-600" />
            Leaves & Holiday Governance
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Review field assistant leave applications and manage organizational holiday schedules
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200">
          <button
            onClick={() => setActiveTab('REQUESTS')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${
              activeTab === 'REQUESTS'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Leave Requests ({pendingCount} Pending)
          </button>
          <button
            onClick={() => setActiveTab('HOLIDAYS')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${
              activeTab === 'HOLIDAYS'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Official Holidays ({holidaysCount})
          </button>
        </div>
      </div>

      {/* Global Feedback Banner */}
      {feedback && (
        <div
          className={`p-4 rounded-xl border text-sm font-medium flex items-start gap-3 shadow-sm ${
            feedback.type === 'success'
              ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
              : 'bg-rose-50 border-rose-300 text-rose-900'
          }`}
        >
          {feedback.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
          ) : (
            <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
          )}
          <div className="flex-1">{feedback.message}</div>
          <button onClick={() => setFeedback(null)} className="text-slate-400 hover:text-slate-600">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* TAB 1: LEAVE REQUESTS */}
      {activeTab === 'REQUESTS' && (
        <div className="space-y-4">
          {/* Filters Bar */}
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-200 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Status:</span>
              {['ALL', 'PENDING', 'APPROVED', 'REJECTED'].map((st) => (
                <button
                  key={st}
                  onClick={() => setStatusFilter(st)}
                  className={`px-3 py-1 rounded-xl text-xs font-bold transition-all ${
                    statusFilter === st
                      ? 'bg-slate-900 text-white shadow'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {st === 'ALL' ? 'All' : st}
                </button>
              ))}
            </div>

            <div className="relative min-w-[240px]">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search assistant or ID..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-1.5 rounded-xl border border-slate-300 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
              />
            </div>
          </div>

          {/* Table */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            {loadingRequests ? (
              <div className="flex items-center justify-center py-16">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500"></div>
              </div>
            ) : filteredRequests.length === 0 ? (
              <div className="py-16 text-center text-slate-400">
                <CalendarDays className="w-12 h-12 mx-auto stroke-1 text-slate-300 mb-2" />
                <p className="text-sm font-semibold text-slate-600">No leave requests found</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider">
                      <th className="py-3 px-4">Employee</th>
                      <th className="py-3 px-4">Type</th>
                      <th className="py-3 px-4">Date Range</th>
                      <th className="py-3 px-4">Days</th>
                      <th className="py-3 px-4">Reason</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4">Reviewer</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium">
                    {filteredRequests.map((r) => (
                      <tr key={r.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3.5 px-4">
                          <div className="font-bold text-slate-900">{r.employee_name}</div>
                          <div className="text-[11px] text-slate-400 font-mono">{r.employee_id}</div>
                        </td>
                        <td className="py-3.5 px-4 font-semibold text-slate-700">
                          {r.leave_type_display}
                        </td>
                        <td className="py-3.5 px-4 font-mono">
                          {r.start_date} <span className="text-slate-400">→</span> {r.end_date}
                        </td>
                        <td className="py-3.5 px-4">
                          <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 font-bold border border-emerald-200">
                            {r.total_days}d
                          </span>
                        </td>
                        <td className="py-3.5 px-4 max-w-xs truncate text-slate-600" title={r.reason}>
                          {r.reason}
                        </td>
                        <td className="py-3.5 px-4">
                          <StatusBadge status={r.status} />
                        </td>
                        <td className="py-3.5 px-4 text-slate-500">
                          {r.reviewed_by_username ? (
                            <div>
                              <span className="font-semibold text-slate-800">{r.reviewed_by_username}</span>
                              {r.admin_remarks && (
                                <div className="text-[10px] text-slate-400 italic truncate max-w-[120px]" title={r.admin_remarks}>
                                  "{r.admin_remarks}"
                                </div>
                              )}
                            </div>
                          ) : (
                            <span className="text-slate-400">--</span>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-right whitespace-nowrap">
                          {r.status === 'PENDING' ? (
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                onClick={() => openReviewModal(r, 'APPROVE')}
                                className="px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 font-bold transition-all"
                              >
                                Approve
                              </button>
                              <button
                                onClick={() => openReviewModal(r, 'REJECT')}
                                className="px-3 py-1.5 rounded-lg bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200 font-bold transition-all"
                              >
                                Reject
                              </button>
                            </div>
                          ) : (
                            <span className="text-[11px] text-slate-400 italic">Resolved</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: OFFICIAL HOLIDAYS */}
      {activeTab === 'HOLIDAYS' && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-200 flex items-center justify-between">
            <div className="text-xs text-slate-500">
              Official company holidays automatically excuse active field assistants from absences during reports.
            </div>
            <button
              onClick={() => setHolidayModalOpen(true)}
              className="h-10 px-4 rounded-xl text-xs font-bold text-slate-950 bg-emerald-400 hover:bg-emerald-300 transition-all flex items-center gap-2 shadow-sm"
            >
              <Plus className="w-4 h-4" />
              Add Official Holiday
            </button>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            {loadingHolidays ? (
              <div className="flex items-center justify-center py-16">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500"></div>
              </div>
            ) : holidays.length === 0 ? (
              <div className="py-16 text-center text-slate-400">
                <Calendar className="w-12 h-12 mx-auto stroke-1 text-slate-300 mb-2" />
                <p className="text-sm font-semibold text-slate-600">No holidays scheduled yet</p>
                <p className="text-xs text-slate-400 mt-1">Click "Add Official Holiday" to register government or company off-days</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider">
                      <th className="py-3 px-4">Holiday Name</th>
                      <th className="py-3 px-4">Calendar Date</th>
                      <th className="py-3 px-4">Description</th>
                      <th className="py-3 px-4">Recurrence</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium">
                    {holidays.map((h) => (
                      <tr key={h.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3.5 px-4 font-bold text-slate-900 flex items-center gap-2">
                          <Sparkles className="w-4 h-4 text-blue-500 shrink-0" />
                          {h.name}
                        </td>
                        <td className="py-3.5 px-4 font-mono font-bold text-blue-700">
                          {h.date}
                        </td>
                        <td className="py-3.5 px-4 text-slate-500">
                          {h.description || '--'}
                        </td>
                        <td className="py-3.5 px-4">
                          {h.is_recurring ? (
                            <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-700 text-[10px] font-bold border border-blue-200">
                              Annual
                            </span>
                          ) : (
                            <span className="text-slate-400 text-[11px]">One-time</span>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          <button
                            onClick={() => handleDeleteHoliday(h.id, h.name)}
                            className="p-1.5 rounded-lg text-rose-500 hover:text-rose-700 hover:bg-rose-50 transition-colors"
                            title="Delete Holiday"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Review Leave Request Modal */}
      {reviewModalOpen && selectedRequest && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h2 className="text-lg font-black text-slate-900">
                {reviewAction === 'APPROVE' ? 'Approve Leave Request' : 'Reject Leave Request'}
              </h2>
              <button onClick={() => setReviewModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-100 text-xs space-y-1.5">
              <div className="flex justify-between">
                <span className="text-slate-500">Employee:</span>
                <strong className="text-slate-800">{selectedRequest.employee_name} ({selectedRequest.employee_id})</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Duration:</span>
                <strong className="text-slate-800">{selectedRequest.start_date} to {selectedRequest.end_date} ({selectedRequest.total_days} days)</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Leave Type:</span>
                <strong className="text-slate-800">{selectedRequest.leave_type_display}</strong>
              </div>
              <div className="pt-1 text-slate-600 italic">
                "{selectedRequest.reason}"
              </div>
            </div>

            <form onSubmit={handleReviewSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Admin Remarks / Reason
                </label>
                <textarea
                  rows={3}
                  value={adminRemarks}
                  onChange={(e) => setAdminRemarks(e.target.value)}
                  placeholder="Optional notes regarding approval/rejection..."
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setReviewModalOpen(false)}
                  className="flex-1 py-2.5 rounded-xl font-bold text-xs text-slate-600 bg-slate-100 hover:bg-slate-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={reviewing}
                  className={`flex-1 py-2.5 rounded-xl font-bold text-xs text-white shadow transition-all ${
                    reviewAction === 'APPROVE'
                      ? 'bg-emerald-600 hover:bg-emerald-500'
                      : 'bg-rose-600 hover:bg-rose-500'
                  } disabled:opacity-50`}
                >
                  {reviewing ? 'Processing...' : reviewAction === 'APPROVE' ? 'Confirm Approval' : 'Confirm Rejection'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Holiday Modal */}
      {holidayModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h2 className="text-lg font-black text-slate-900 flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-blue-600" />
                Add Official Holiday
              </h2>
              <button onClick={() => setHolidayModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateHoliday} className="space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Holiday Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. Independence Day"
                  value={holidayName}
                  onChange={(e) => setHolidayName(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Calendar Date
                </label>
                <input
                  type="date"
                  value={holidayDate}
                  onChange={(e) => setHolidayDate(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Description
                </label>
                <input
                  type="text"
                  placeholder="Optional context or notes"
                  value={holidayDesc}
                  onChange={(e) => setHolidayDesc(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="recur"
                  checked={holidayRecurring}
                  onChange={(e) => setHolidayRecurring(e.target.checked)}
                  className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 h-4 w-4"
                />
                <label htmlFor="recur" className="text-xs font-medium text-slate-700">
                  Annual recurring holiday (repeats every year)
                </label>
              </div>

              <div className="flex gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setHolidayModalOpen(false)}
                  className="flex-1 py-2.5 rounded-xl font-bold text-xs text-slate-600 bg-slate-100 hover:bg-slate-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingHoliday}
                  className="flex-1 py-2.5 rounded-xl font-bold text-xs text-slate-950 bg-emerald-400 hover:bg-emerald-300 shadow transition-all disabled:opacity-50"
                >
                  {savingHoliday ? 'Saving...' : 'Add Holiday'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
