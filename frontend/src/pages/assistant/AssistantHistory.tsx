import React, { useState, useEffect } from 'react';
import { apiClient, extractErrorMessage } from '../../lib/api';
import { Attendance } from '../../types';
import { StatusBadge } from '../../components/StatusBadge';
import { Calendar, ChevronLeft, ChevronRight, Clock, Filter, AlertCircle, MapPin } from 'lucide-react';
import { Link } from 'react-router-dom';

export const AssistantHistory: React.FC = () => {
  const [attendances, setAttendances] = useState<Attendance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const today = new Date();
  const [month, setMonth] = useState<number>(today.getMonth() + 1);
  const [year, setYear] = useState<number>(today.getFullYear());

  const fetchHistory = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.get('/attendance/my-history/', {
        params: { month, year },
      });
      setAttendances(res.data.results || res.data);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, [month, year]);

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const handlePrevMonth = () => {
    if (month === 1) {
      setMonth(12);
      setYear(year - 1);
    } else {
      setMonth(month - 1);
    }
  };

  const handleNextMonth = () => {
    if (month === 12) {
      setMonth(1);
      setYear(year + 1);
    } else {
      setMonth(month + 1);
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-black text-slate-900">Attendance History</h1>
          <p className="text-xs text-slate-500">Your personal verified attendance records</p>
        </div>
        <Link
          to="/assistant"
          className="text-xs font-semibold text-emerald-600 hover:text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-200"
        >
          ← Back to Today
        </Link>
      </div>

      {/* Month Selector Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
        <button
          onClick={handlePrevMonth}
          className="p-2 rounded-lg hover:bg-slate-100 text-slate-600 transition-colors"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div className="text-center font-bold text-slate-800 text-base flex items-center gap-2">
          <Calendar className="w-4 h-4 text-emerald-600" />
          <span>{monthNames[month - 1]} {year}</span>
        </div>
        <button
          onClick={handleNextMonth}
          className="p-2 rounded-lg hover:bg-slate-100 text-slate-600 transition-colors"
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-red-500" />
          {error}
        </div>
      )}

      {/* Records List */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500"></div>
        </div>
      ) : attendances.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-2xl border border-slate-200 text-slate-400 text-sm">
          No attendance records found for {monthNames[month - 1]} {year}.
        </div>
      ) : (
        <div className="space-y-3">
          {attendances.map((att) => (
            <div
              key={att.id}
              className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between gap-3 hover:border-slate-300 transition-colors"
            >
              <div className="space-y-1">
                <div className="text-xs font-bold text-slate-900 flex items-center gap-2">
                  <span>{new Date(att.attendance_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                  <StatusBadge status={att.status} type={att.attendance_type} />
                </div>
                <div className="text-xs text-slate-500 flex items-center gap-3">
                  <span>In: <strong className="text-slate-700">{att.check_in_display || '--'}</strong></span>
                  <span>Out: <strong className="text-slate-700">{att.check_out_display || '--'}</strong></span>
                </div>
                {(att.check_in_address || att.check_in_latitude) && (
                  <div className="text-[11px] text-slate-600 flex items-center gap-1.5 flex-wrap pt-0.5">
                    <MapPin className="w-3 h-3 text-emerald-600 shrink-0" />
                    <span>{att.check_in_address || `${att.check_in_latitude}, ${att.check_in_longitude}`}</span>
                    {att.check_in_latitude && (
                      <a
                        href={`https://www.google.com/maps?q=${att.check_in_latitude},${att.check_in_longitude}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:underline font-semibold"
                      >
                        (Map)
                      </a>
                    )}
                  </div>
                )}
                {att.admin_remarks && (
                  <div className="text-[11px] text-slate-400 italic">
                    Note: {att.admin_remarks}
                  </div>
                )}
              </div>

              <div className="text-right">
                <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  Duration
                </div>
                <div className="text-base font-extrabold text-slate-800 font-mono">
                  {att.working_duration_display || '--'}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
