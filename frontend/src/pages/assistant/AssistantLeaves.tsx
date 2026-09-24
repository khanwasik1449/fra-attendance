import React, { useState, useEffect } from 'react';
import { apiClient, extractErrorMessage } from '../../lib/api';
import { LeaveRequest, Holiday, LeaveType } from '../../types';
import { StatusBadge } from '../../components/StatusBadge';
import {
  CalendarDays,
  Plus,
  Clock,
  CheckCircle2,
  AlertCircle,
  X,
  Sparkles,
  Calendar
} from 'lucide-react';

export const AssistantLeaves: React.FC = () => {
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  // Form State
  const [leaveType, setLeaveType] = useState<LeaveType>('CASUAL');
  const [startDate, setStartDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
  const [endDate, setEndDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
  const [reason, setReason] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const [formFeedback, setFormFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const calculateDays = (start: string, end: string) => {
    if (!start || !end) return 0;
    const s = new Date(start);
    const e = new Date(end);
    if (s > e) return 0;
    const diffTime = Math.abs(e.getTime() - s.getTime());
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
  };

  const fetchLeaves = async () => {
    setLoading(true);
    try {
      const [leaveRes, holRes] = await Promise.all([
        apiClient.get('/leaves/my-leaves/'),
        apiClient.get('/leaves/holidays/')
      ]);
      const leaveData = Array.isArray(leaveRes.data)
        ? leaveRes.data
        : (leaveRes.data?.results || []);
      const holData = Array.isArray(holRes.data)
        ? holRes.data
        : (holRes.data?.results || []);

      setRequests(leaveData);
      setHolidays(holData);
    } catch (err) {
      console.error('Failed to load leaves/holidays:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLeaves();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormFeedback(null);

    if (startDate > endDate) {
      setFormFeedback({ type: 'error', message: 'End date cannot be earlier than start date.' });
      return;
    }
    if (!reason.trim()) {
      setFormFeedback({ type: 'error', message: 'Please provide a justification for this leave.' });
      return;
    }

    setSubmitting(true);
    try {
      const res = await apiClient.post('/leaves/apply/', {
        leave_type: leaveType,
        start_date: startDate,
        end_date: endDate,
        reason: reason.trim()
      });
      setFormFeedback({ type: 'success', message: res.data.detail });
      setReason('');
      await fetchLeaves();
      setTimeout(() => {
        setModalOpen(false);
        setFormFeedback(null);
      }, 1500);
    } catch (err) {
      setFormFeedback({ type: 'error', message: extractErrorMessage(err) });
    } finally {
      setSubmitting(false);
    }
  };

  const filteredRequests = (Array.isArray(requests) ? requests : []).filter((r) => {
    if (statusFilter === 'ALL') return true;
    return r.status === statusFilter;
  });

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-black text-slate-900 flex items-center gap-2">
            <CalendarDays className="w-6 h-6 text-emerald-600" />
            Leave & Holiday Management
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Submit time off requests and track official organizational holidays
          </p>
        </div>
        <button
          onClick={() => {
            setFormFeedback(null);
            setModalOpen(true);
          }}
          className="h-11 px-5 rounded-xl text-sm font-bold text-slate-950 bg-emerald-400 hover:bg-emerald-300 active:scale-95 transition-all shadow-md shadow-emerald-400/20 flex items-center justify-center gap-2"
        >
          <Plus className="w-4 h-4 text-slate-950" />
          Apply for Leave
        </button>
      </div>

      {/* Official Company Holidays Banner */}
      {Array.isArray(holidays) && holidays.length > 0 && (
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-2xl p-4 border border-blue-200">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-blue-800 mb-2">
            <Sparkles className="w-4 h-4 text-blue-600" />
            Official Upcoming Holidays
          </div>
          <div className="flex flex-wrap gap-2">
            {holidays.map((h) => (
              <div
                key={h.id}
                className="bg-white px-3 py-1.5 rounded-xl border border-blue-200 text-xs shadow-sm flex items-center gap-2"
              >
                <Calendar className="w-3.5 h-3.5 text-blue-600" />
                <span className="font-bold text-slate-800">{h.name}</span>
                <span className="text-slate-500 text-[11px] font-mono">({h.date})</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Status Filter Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {['ALL', 'PENDING', 'APPROVED', 'REJECTED'].map((st) => (
          <button
            key={st}
            onClick={() => setStatusFilter(st)}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
              statusFilter === st
                ? 'bg-slate-900 text-white shadow'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            {st === 'ALL' ? 'All Leaves' : st}
          </button>
        ))}
      </div>

      {/* Leave Requests List */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500"></div>
        </div>
      ) : filteredRequests.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 text-center border border-slate-200 text-slate-400">
          <CalendarDays className="w-12 h-12 mx-auto stroke-1 text-slate-300 mb-2" />
          <p className="text-sm font-semibold text-slate-600">No leave requests found</p>
          <p className="text-xs text-slate-400 mt-0.5">Click "Apply for Leave" above to submit a new request</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredRequests.map((req) => (
            <div
              key={req.id}
              className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm space-y-3 relative hover:border-slate-300 transition-colors"
            >
              <div className="flex items-start justify-between">
                <div>
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                    {req.leave_type_display}
                  </span>
                  <div className="text-base font-extrabold text-slate-900 mt-0.5 flex items-center gap-2">
                    <span>{req.start_date}</span>
                    <span className="text-slate-400 text-xs">to</span>
                    <span>{req.end_date}</span>
                  </div>
                </div>
                <StatusBadge status={req.status} />
              </div>

              <div className="flex items-center gap-3 text-xs text-slate-500">
                <span className="font-semibold text-emerald-800 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
                  {req.total_days} {req.total_days === 1 ? 'day' : 'days'}
                </span>
                <span>•</span>
                <span>Applied: {new Date(req.created_at).toLocaleDateString()}</span>
              </div>

              <div className="text-xs text-slate-700 bg-slate-50 p-3 rounded-xl border border-slate-100 italic">
                "{req.reason}"
              </div>

              {req.admin_remarks && (
                <div className="text-xs text-slate-600 pt-1 border-t border-slate-100 flex items-start gap-1.5">
                  <span className="font-bold text-slate-700">Admin Remarks:</span>
                  <span>{req.admin_remarks}</span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Apply for Leave Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-5 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h2 className="text-lg font-black text-slate-900 flex items-center gap-2">
                <CalendarDays className="w-5 h-5 text-emerald-600" />
                Apply for Leave
              </h2>
              <button
                onClick={() => setModalOpen(false)}
                className="p-1 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {formFeedback && (
              <div
                className={`p-3.5 rounded-xl border text-xs font-medium flex items-center gap-2 ${
                  formFeedback.type === 'success'
                    ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                    : 'bg-rose-50 border-rose-300 text-rose-900'
                }`}
              >
                {formFeedback.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                )}
                <span>{formFeedback.message}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Leave Type
                </label>
                <select
                  value={leaveType}
                  onChange={(e) => setLeaveType(e.target.value as LeaveType)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
                >
                  <option value="CASUAL">Casual Leave</option>
                  <option value="SICK">Sick Leave</option>
                  <option value="EMERGENCY">Emergency Leave</option>
                  <option value="EARNED">Earned / Annual Leave</option>
                  <option value="MATERNITY">Maternity / Paternity Leave</option>
                  <option value="OTHER">Other</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Start Date
                  </label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    End Date
                  </label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    required
                  />
                </div>
              </div>

              {/* Live Duration Calculation */}
              <div className="bg-emerald-50 border border-emerald-200 p-3 rounded-xl text-xs text-emerald-900 flex items-center justify-between font-medium">
                <span>Calculated Duration:</span>
                <strong className="text-emerald-950 text-sm font-black">
                  {calculateDays(startDate, endDate)} Calendar Day(s)
                </strong>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Reason for Leave
                </label>
                <textarea
                  rows={3}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Explain why you are taking leave (required)..."
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  required
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="flex-1 py-3 rounded-xl font-bold text-xs text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 py-3 rounded-xl font-bold text-xs text-slate-950 bg-emerald-400 hover:bg-emerald-300 active:scale-95 transition-all shadow-md shadow-emerald-400/20 disabled:opacity-50"
                >
                  {submitting ? 'Submitting...' : 'Submit Request'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
