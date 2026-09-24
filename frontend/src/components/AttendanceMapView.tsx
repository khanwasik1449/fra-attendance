import React, { useEffect, useRef, useState, useMemo } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { DailyReportRecord, Project, DistrictWiseSummaryResponse, DistrictSummaryItem } from '../types';
import { BANGLADESH_DIVISIONS, getDistrictsForDivision, getDistrictCenter } from '../data/bangladeshGeo';
import {
  MapPin,
  Building2,
  Navigation,
  AlertTriangle,
  CheckCircle2,
  Maximize2,
  Compass,
  Layers,
  Search,
  ArrowUpRight,
  RefreshCw,
  Users,
  Grid,
  ShieldAlert,
  ChevronRight,
  Sparkles,
  Minimize2,
  Scan
} from 'lucide-react';

// Strict Geographic Bounding Box for Bangladesh (from Saint Martin's in South to Tetulia in North)
export const BANGLADESH_BOUNDS: L.LatLngBoundsLiteral = [
  [20.55, 88.01], // South-West
  [26.65, 92.68], // North-East
];

// Strict pan/zoom boundary locking navigation to Bangladesh only
export const BANGLADESH_MAX_BOUNDS: L.LatLngBoundsLiteral = [
  [20.10, 87.50], // South-West limit
  [27.10, 93.30], // North-East limit
];

interface AttendanceMapViewProps {
  records: DailyReportRecord[];
  projects?: Project[];
  districtSummary?: DistrictWiseSummaryResponse | null;
  selectedDate?: string;
  onRefresh?: () => void;
  initialDistrictOnly?: boolean;
  highlightedDistrict?: string | null;
  onDistrictSelect?: (districtName: string | null) => void;
}

export const AttendanceMapView: React.FC<AttendanceMapViewProps> = ({
  records,
  projects = [],
  districtSummary,
  selectedDate,
  onRefresh,
  initialDistrictOnly = true,
  highlightedDistrict,
  onDistrictSelect
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const districtMarkersLayerRef = useRef<L.LayerGroup | null>(null);
  const punchMarkersLayerRef = useRef<L.LayerGroup | null>(null);
  const siteCirclesLayerRef = useRef<L.LayerGroup | null>(null);
  const districtMarkersMapRef = useRef<Record<string, L.Marker>>({});

  // Inject beacon ping animation style
  useEffect(() => {
    const styleId = 'fams-map-beacon-style';
    if (!document.getElementById(styleId)) {
      const style = document.createElement('style');
      style.id = styleId;
      style.textContent = `
        @keyframes fams-beacon-ping {
          0% { transform: translate(-50%, -50%) scale(0.7); opacity: 0.9; }
          60% { transform: translate(-50%, -50%) scale(1.6); opacity: 0.35; }
          100% { transform: translate(-50%, -50%) scale(2.4); opacity: 0; }
        }
        .fams-beacon-wave {
          position: absolute;
          top: 50%;
          left: 50%;
          width: 44px;
          height: 44px;
          border-radius: 9999px;
          border: 3px solid #fbbf24;
          background: rgba(251, 191, 36, 0.4);
          animation: fams-beacon-ping 1.5s cubic-bezier(0, 0, 0.2, 1) infinite;
          pointer-events: none;
          z-index: -1;
        }
      `;
      document.head.appendChild(style);
    }
  }, []);

  // Default to DISTRICT_ONLY as requested: "Show district wise total fa's only"
  const [viewMode, setViewMode] = useState<'DISTRICT_ONLY' | 'PUNCH_PINS'>(
    initialDistrictOnly ? 'DISTRICT_ONLY' : 'PUNCH_PINS'
  );
  const [selectedDistrict, setSelectedDistrict] = useState<string>('');
  const [selectedDistrictItem, setSelectedDistrictItem] = useState<DistrictSummaryItem | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSites, setShowSites] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Compute fallback district summary from records if not provided
  const computedDistrictItems: DistrictSummaryItem[] = useMemo(() => {
    if (districtSummary && districtSummary.districts && districtSummary.districts.length > 0) {
      return districtSummary.districts;
    }

    const distMap: Record<string, DistrictSummaryItem> = {};
    records.forEach(r => {
      const dist = (r.district || '').trim();
      if (!dist) return;

      const distKey = dist.charAt(0).toUpperCase() + dist.slice(1);
      if (!distMap[distKey]) {
        const center = getDistrictCenter(distKey) || { lat: 23.8103, lon: 90.4125 };
        distMap[distKey] = {
          district: distKey,
          division: r.division || '',
          lat: center.lat,
          lon: center.lon,
          total_fas: 0,
          present_count: 0,
          late_count: 0,
          absent_count: 0,
          violation_count: 0,
          employees: [],
          upazilas: []
        };
      }

      distMap[distKey].total_fas += 1;
      if (r.status === 'PRESENT') distMap[distKey].present_count += 1;
      else if (r.status === 'LATE') distMap[distKey].late_count += 1;
      else distMap[distKey].absent_count += 1;

      if (r.check_in_is_geofence_violation) distMap[distKey].violation_count += 1;
      if (r.upazila && !distMap[distKey].upazilas.includes(r.upazila)) {
        distMap[distKey].upazilas.push(r.upazila);
      }

      distMap[distKey].employees.push({
        id: 0,
        employee_id: r.employee_id,
        full_name: r.employee_name,
        designation: r.designation,
        department: r.department,
        project: r.project || '',
        upazila: r.upazila || '',
        phone: '',
        status: r.status,
        check_in: r.check_in,
        check_out: r.check_out,
        punch_address: r.check_in_address,
        is_violation: !!r.check_in_is_geofence_violation,
      });
    });

    return Object.values(distMap).sort((a, b) => b.total_fas - a.total_fas);
  }, [records, districtSummary]);

  const totalFAsAcrossDistricts = useMemo(() => {
    return computedDistrictItems.reduce((sum, d) => sum + d.total_fas, 0);
  }, [computedDistrictItems]);

  // Initialize Leaflet Map
  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (!mapInstanceRef.current) {
      // Center of Bangladesh with strict bounds locking
      const map = L.map(mapContainerRef.current, {
        center: [23.6850, 90.3563],
        zoom: 7,
        minZoom: 6,
        maxZoom: 18,
        maxBounds: BANGLADESH_MAX_BOUNDS,
        maxBoundsViscosity: 1.0,
        zoomControl: true,
      });

      // Fit full Bangladesh country boundaries into screen immediately
      map.fitBounds(BANGLADESH_BOUNDS, { padding: [15, 15] });

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19,
      }).addTo(map);

      districtMarkersLayerRef.current = L.layerGroup().addTo(map);
      punchMarkersLayerRef.current = L.layerGroup().addTo(map);
      siteCirclesLayerRef.current = L.layerGroup().addTo(map);

      mapInstanceRef.current = map;
    }

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  // Render Markers according to viewMode
  useEffect(() => {
    const map = mapInstanceRef.current;
    const distLayer = districtMarkersLayerRef.current;
    const punchLayer = punchMarkersLayerRef.current;
    const siteLayer = siteCirclesLayerRef.current;
    if (!map || !distLayer || !punchLayer || !siteLayer) return;

    distLayer.clearLayers();
    punchLayer.clearLayers();
    siteLayer.clearLayers();

    const bounds: L.LatLngExpression[] = [];

    // MODE 1: DISTRICT-WISE TOTAL FAS ONLY
    if (viewMode === 'DISTRICT_ONLY') {
      districtMarkersMapRef.current = {};
      computedDistrictItems.forEach(d => {
        if (!d.lat || !d.lon) return;
        bounds.push([d.lat, d.lon]);

        const count = d.total_fas;
        const activeCount = d.present_count + d.late_count;
        const isHighlighted =
          (highlightedDistrict && highlightedDistrict.toLowerCase() === d.district.toLowerCase()) ||
          (selectedDistrictItem && selectedDistrictItem.district.toLowerCase() === d.district.toLowerCase());

        // Custom District Badge Marker showing District Name & Total FA count
        const districtIcon = L.divIcon({
          className: 'district-fa-marker',
          html: `
            <div style="
              display: flex;
              flex-direction: column;
              align-items: center;
              position: relative;
              cursor: pointer;
              filter: ${isHighlighted
                ? 'drop-shadow(0 0 18px rgba(245, 158, 11, 0.95)) drop-shadow(0 8px 24px rgba(0,0,0,0.4))'
                : 'drop-shadow(0 6px 14px rgba(0,0,0,0.25))'};
              transform: ${isHighlighted ? 'scale(1.22)' : 'scale(1)'};
              transition: transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
            ">
              ${isHighlighted ? '<div class="fams-beacon-wave"></div>' : ''}
              <div style="
                background: ${isHighlighted
                  ? 'linear-gradient(135deg, #d97706 0%, #b45309 100%)'
                  : 'linear-gradient(135deg, #059669 0%, #047857 100%)'};
                color: white;
                border: ${isHighlighted ? '3px solid #fef08a' : '2.5px solid white'};
                border-radius: 9999px;
                padding: ${isHighlighted ? '5px 12px' : '4px 10px'};
                font-family: system-ui, sans-serif;
                font-weight: 800;
                font-size: 11px;
                display: flex;
                align-items: center;
                gap: 6px;
                white-space: nowrap;
              ">
                <span style="font-size: ${isHighlighted ? '13px' : '12px'};">${isHighlighted ? '⭐' : '📍'}</span>
                <span>${d.district}</span>
                <span style="
                  background: white;
                  color: ${isHighlighted ? '#92400e' : '#065f46'};
                  border-radius: 9999px;
                  padding: 1px 7px;
                  font-size: 11px;
                  font-weight: 900;
                ">${count} ${count === 1 ? 'FA' : 'FAs'}</span>
              </div>
              <div style="
                width: 0;
                height: 0;
                border-left: 6px solid transparent;
                border-right: 6px solid transparent;
                border-top: 7px solid ${isHighlighted ? '#b45309' : '#047857'};
                margin-top: -1px;
              "></div>
            </div>
          `,
          iconSize: [120, 36],
          iconAnchor: [60, 34],
          popupAnchor: [0, -32],
        });

        const marker = L.marker([d.lat, d.lon], {
          icon: districtIcon,
          zIndexOffset: isHighlighted ? 2000 : 100
        });
        districtMarkersMapRef.current[d.district.toLowerCase()] = marker;

        // Popup with complete district breakdown
        const empListHtml = d.employees.slice(0, 8).map(e => `
          <div style="display: flex; align-items: center; justify-content: space-between; padding: 4px 0; border-bottom: 1px solid #f1f5f9; font-size: 11px;">
            <div>
              <strong style="color: #0f172a;">${e.full_name}</strong>
              <span style="color: #64748b; font-family: monospace;"> (${e.employee_id})</span>
              ${e.upazila ? `<div style="color: #059669; font-size: 10px;">• Upazila: ${e.upazila}</div>` : ''}
            </div>
            <span style="
              padding: 2px 6px;
              border-radius: 6px;
              font-size: 9px;
              font-weight: bold;
              background: ${e.status === 'PRESENT' ? '#ecfdf5; color: #065f46;' : e.status === 'LATE' ? '#fffbeb; color: #92400e;' : '#f1f5f9; color: #64748b;'}
            ">
              ${e.status}
            </span>
          </div>
        `).join('');

        marker.bindPopup(`
          <div style="font-family: system-ui, sans-serif; padding: 4px; min-width: 250px;">
            <div style="display: flex; items-center; justify-content: space-between; border-bottom: 2px solid #e2e8f0; padding-bottom: 6px;">
              <div>
                <div style="font-size: 15px; font-weight: 900; color: #0f172a;">${d.district} District</div>
                <div style="font-size: 11px; color: #64748b; font-weight: 600;">${d.division} Division</div>
              </div>
              <div style="
                background: #059669;
                color: white;
                padding: 4px 10px;
                border-radius: 12px;
                font-size: 13px;
                font-weight: 900;
                text-align: center;
              ">
                ${d.total_fas} ${d.total_fas === 1 ? 'FA' : 'FAs'}
              </div>
            </div>

            <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; margin-top: 8px; text-align: center;">
              <div style="background: #ecfdf5; padding: 4px; border-radius: 8px;">
                <div style="font-size: 9px; color: #047857; font-weight: bold;">PRESENT</div>
                <div style="font-size: 13px; font-weight: 900; color: #065f46;">${d.present_count}</div>
              </div>
              <div style="background: #fffbeb; padding: 4px; border-radius: 8px;">
                <div style="font-size: 9px; color: #b45309; font-weight: bold;">LATE</div>
                <div style="font-size: 13px; font-weight: 900; color: #92400e;">${d.late_count}</div>
              </div>
              <div style="background: #f8fafc; padding: 4px; border-radius: 8px;">
                <div style="font-size: 9px; color: #64748b; font-weight: bold;">ABSENT</div>
                <div style="font-size: 13px; font-weight: 900; color: #334155;">${d.absent_count}</div>
              </div>
            </div>

            ${d.upazilas.length > 0 ? `
              <div style="font-size: 11px; color: #475569; margin-top: 8px; line-height: 1.3;">
                <strong>Upazilas:</strong> ${d.upazilas.join(', ')}
              </div>
            ` : ''}

            <div style="margin-top: 8px; font-size: 11px; font-weight: 800; color: #334155;">
              Assigned Field Assistants (${d.employees.length}):
            </div>
            <div style="max-height: 150px; overflow-y: auto; margin-top: 4px;">
              ${empListHtml}
            </div>

            <div style="margin-top: 8px; padding-top: 6px; border-top: 1px solid #f1f5f9; display: flex; justify-content: space-between; align-items: center;">
              <span style="font-size: 10px; color: #94a3b8; font-family: monospace;">Center: ${d.lat.toFixed(4)}, ${d.lon.toFixed(4)}</span>
              <a href="https://www.google.com/maps?q=${d.lat},${d.lon}" target="_blank" rel="noopener noreferrer" style="font-size: 11px; font-weight: bold; color: #2563eb; text-decoration: none;">
                District Map ↗
              </a>
            </div>
          </div>
        `);

        marker.on('click', () => {
          handleFlyToDistrict(d);
        });

        distLayer.addLayer(marker);

        // Circular halo around district center (radiant when highlighted)
        const halo = L.circle([d.lat, d.lon], {
          radius: isHighlighted ? 18000 : 12000,
          color: isHighlighted ? '#f59e0b' : '#059669',
          fillColor: isHighlighted ? '#fbbf24' : '#10b981',
          fillOpacity: isHighlighted ? 0.35 : 0.12,
          weight: isHighlighted ? 2.5 : 1,
        });
        distLayer.addLayer(halo);
      });
    }

    // MODE 2: INDIVIDUAL PUNCH PINS
    if (viewMode === 'PUNCH_PINS') {
      records.forEach(rec => {
        if (rec.check_in_latitude && rec.check_in_longitude) {
          const lat = rec.check_in_latitude;
          const lon = rec.check_in_longitude;
          bounds.push([lat, lon]);

          const isViolation = rec.check_in_is_geofence_violation;
          const isLate = rec.status === 'LATE';
          const markerBg = isViolation ? '#e11d48' : isLate ? '#d97706' : '#059669';

          const icon = L.divIcon({
            className: 'punch-marker',
            html: `
              <div style="
                width: 30px;
                height: 30px;
                border-radius: 50%;
                background-color: ${markerBg};
                border: 2px solid white;
                box-shadow: 0 4px 10px rgba(0,0,0,0.3);
                display: flex;
                align-items: center;
                justify-content: center;
                color: white;
                font-weight: 800;
                font-size: 10px;
              ">
                ${rec.employee_id.replace('FA-', '')}
              </div>
            `,
            iconSize: [30, 30],
            iconAnchor: [15, 15],
            popupAnchor: [0, -16],
          });

          const m = L.marker([lat, lon], { icon });
          m.bindPopup(`
            <div style="font-family: system-ui, sans-serif; padding: 4px;">
              <div style="font-weight: bold; font-size: 13px;">${rec.employee_name} (${rec.employee_id})</div>
              <div style="font-size: 11px; color: #64748b;">Assigned District: ${rec.district || 'None'}</div>
              <div style="font-size: 11px; margin-top: 4px;">Check-In: <strong>${rec.check_in}</strong></div>
              ${rec.check_in_address ? `<div style="font-size: 11px; color: #334155; margin-top: 2px;">📍 ${rec.check_in_address}</div>` : ''}
            </div>
          `);
          punchLayer.addLayer(m);
        }
      });
    }

    // When not focused on a specific district, always fit full Bangladesh into screen
    if (!selectedDistrict && !highlightedDistrict) {
      try {
        map.fitBounds(BANGLADESH_BOUNDS, { padding: [15, 15] });
      } catch (e) {
        console.error('Error fitting Bangladesh bounds:', e);
      }
    }
  }, [computedDistrictItems, records, viewMode, showSites, selectedDistrict, highlightedDistrict]);

  const handleFlyToDistrict = (d: DistrictSummaryItem) => {
    setSelectedDistrictItem(d);
    setSelectedDistrict(d.district);
    if (onDistrictSelect) {
      onDistrictSelect(d.district);
    }
    const map = mapInstanceRef.current;
    if (!map) return;
    map.flyTo([d.lat, d.lon], 10, { duration: 1.2 });
    const m = districtMarkersMapRef.current[d.district.toLowerCase()];
    if (m) {
      setTimeout(() => {
        m.openPopup();
      }, 600);
    }
  };

  useEffect(() => {
    if (!highlightedDistrict) return;
    const d = computedDistrictItems.find(
      item => item.district.toLowerCase() === highlightedDistrict.toLowerCase()
    );
    if (d) {
      handleFlyToDistrict(d);
    }
  }, [highlightedDistrict, computedDistrictItems]);

  const handleResetBangladesh = () => {
    const map = mapInstanceRef.current;
    if (!map) return;
    map.fitBounds(BANGLADESH_BOUNDS, { padding: [15, 15] });
    setSelectedDistrict('');
    setSelectedDistrictItem(null);
    if (onDistrictSelect) {
      onDistrictSelect(null);
    }
  };

  // Re-fit Bangladesh and invalidate size when screen/window resizes
  useEffect(() => {
    const handleResize = () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.invalidateSize();
        if (!selectedDistrict && !highlightedDistrict) {
          mapInstanceRef.current.fitBounds(BANGLADESH_BOUNDS, { padding: [15, 15] });
        }
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [selectedDistrict, highlightedDistrict]);

  // Handle Fullscreen toggle re-render
  useEffect(() => {
    if (mapInstanceRef.current) {
      const timer = setTimeout(() => {
        mapInstanceRef.current?.invalidateSize();
        if (!selectedDistrict && !highlightedDistrict) {
          mapInstanceRef.current?.fitBounds(BANGLADESH_BOUNDS, { padding: [15, 15] });
        }
      }, 200);
      return () => clearTimeout(timer);
    }
  }, [isFullscreen, selectedDistrict, highlightedDistrict]);

  return (
    <div className={`transition-all duration-200 ${
      isFullscreen
        ? 'fixed inset-0 z-[9999] h-screen w-screen p-3 bg-slate-950/80 backdrop-blur-sm'
        : 'bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden flex flex-col'
    }`}>
      <div className={`w-full flex flex-col ${isFullscreen ? 'h-full bg-white rounded-2xl overflow-hidden shadow-2xl' : ''}`}>
        {/* Map Control Toolbar */}
        <div className="p-4 bg-slate-50 border-b border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shadow-xs">
              <Compass className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-black text-slate-900 flex items-center gap-2">
                <span>District-Wise Field Assistant Distribution</span>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-emerald-100 text-emerald-800 border border-emerald-300">
                  {computedDistrictItems.length} Districts Covered
                </span>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-100 text-blue-800 border border-blue-300">
                  {totalFAsAcrossDistricts} Total FAs
                </span>
              </h2>
              <p className="text-xs text-slate-500">
                Focused strictly on Bangladesh national boundaries with district-wise FA density
              </p>
            </div>
          </div>

          {/* View Mode and Controls */}
          <div className="flex flex-wrap items-center gap-2">
            {/* View Mode Toggle: District-Wise Totals vs Individual Pins */}
            <div className="inline-flex rounded-xl bg-slate-200/80 p-1 text-xs font-bold">
              <button
                onClick={() => setViewMode('DISTRICT_ONLY')}
                className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
                  viewMode === 'DISTRICT_ONLY'
                    ? 'bg-emerald-600 text-white shadow-xs font-black'
                    : 'text-slate-700 hover:text-slate-900'
                }`}
              >
                <Grid className="w-3.5 h-3.5" />
                <span>District-Wise Totals Only</span>
              </button>
              <button
                onClick={() => setViewMode('PUNCH_PINS')}
                className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
                  viewMode === 'PUNCH_PINS'
                    ? 'bg-white text-slate-900 shadow-xs font-black'
                    : 'text-slate-700 hover:text-slate-900'
                }`}
              >
                <MapPin className="w-3.5 h-3.5" />
                <span>Individual Punch Pins</span>
              </button>
            </div>

            {/* Focus Bangladesh Button */}
            <button
              onClick={handleResetBangladesh}
              className="px-3 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 text-xs font-black text-emerald-900 flex items-center gap-1.5 shadow-2xs transition-all"
              title="Fit full Bangladesh in screen"
            >
              <Scan className="w-3.5 h-3.5 text-emerald-700" />
              <span>🇧🇩 Focus Bangladesh</span>
            </button>

            {/* Fit Screen / Fullscreen Toggle */}
            <button
              onClick={() => setIsFullscreen(!isFullscreen)}
              className="px-3 py-1.5 rounded-xl bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 shadow-2xs flex items-center gap-1.5 text-xs font-bold transition-all"
              title={isFullscreen ? "Exit Fullscreen" : "Fit Full Screen"}
            >
              {isFullscreen ? (
                <>
                  <Minimize2 className="w-3.5 h-3.5 text-slate-700" />
                  <span className="hidden sm:inline">Exit Fullscreen</span>
                </>
              ) : (
                <>
                  <Maximize2 className="w-3.5 h-3.5 text-slate-700" />
                  <span className="hidden sm:inline">Fit Screen</span>
                </>
              )}
            </button>

            {onRefresh && (
              <button
                onClick={onRefresh}
                title="Refresh attendance feed"
                className="p-1.5 rounded-xl bg-white border border-slate-200 text-slate-600 hover:bg-slate-100 shadow-2xs"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Main Canvas + District Summary Sidebar */}
        <div className={`grid grid-cols-1 lg:grid-cols-4 relative transition-all duration-300 ${
          isFullscreen
            ? 'flex-1 h-full'
            : 'h-[620px] lg:h-[calc(100vh-230px)] min-h-[520px] max-h-[760px]'
        }`}>
          {/* Leaflet Map Canvas */}
          <div className="lg:col-span-3 h-full relative z-0">
            <div ref={mapContainerRef} className="w-full h-full" />

          {/* Legend Overlay */}
          <div className="absolute bottom-4 left-4 z-[400] bg-white/95 backdrop-blur-sm p-3 rounded-2xl border border-slate-200 shadow-md text-xs space-y-1.5">
            <div className="font-bold text-slate-800 text-[10px] uppercase tracking-wider mb-1">
              {viewMode === 'DISTRICT_ONLY' ? 'District-Wise Total FAs Map' : 'Individual Punch Pins'}
            </div>
            {viewMode === 'DISTRICT_ONLY' ? (
              <div className="space-y-1 text-slate-600">
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-600"></span>
                  <span>District Center Badge shows <strong>Total FAs assigned</strong></span>
                </div>
                <div className="text-[10px] text-slate-400">Click any district badge to view full roster of FAs</div>
              </div>
            ) : (
              <div className="space-y-1">
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-600"></span>
                  <span>Checked In (On Time)</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-600"></span>
                  <span>Late Arrival</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-rose-600"></span>
                  <span>Geofence Violation</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* District-Wise Total Roster Sidebar */}
        <div className="lg:col-span-1 h-full border-l border-slate-200 bg-slate-50 flex flex-col overflow-hidden">
          <div className="p-3 border-b border-slate-200 bg-white flex items-center justify-between">
            <div className="font-bold text-xs text-slate-800 flex items-center gap-1.5">
              <Users className="w-4 h-4 text-emerald-600" />
              <span>District Breakdown</span>
            </div>
            <span className="text-[11px] font-bold text-slate-500 font-mono">
              {totalFAsAcrossDistricts} FAs total
            </span>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-slate-100 p-2 space-y-1.5">
            {computedDistrictItems.length === 0 ? (
              <div className="text-center py-12 text-slate-400 text-xs px-4">
                No assistants assigned to districts yet.
              </div>
            ) : (
              computedDistrictItems.map((d) => {
                const isSelected =
                  (selectedDistrictItem && selectedDistrictItem.district.toLowerCase() === d.district.toLowerCase()) ||
                  (highlightedDistrict && highlightedDistrict.toLowerCase() === d.district.toLowerCase());
                return (
                  <div
                    key={d.district}
                    onClick={() => handleFlyToDistrict(d)}
                    className={`p-3 rounded-2xl cursor-pointer transition-all border ${
                      isSelected
                        ? 'bg-amber-50/90 border-amber-400 ring-2 ring-amber-300 shadow-sm'
                        : 'bg-white border-slate-200/80 hover:border-emerald-200 hover:shadow-xs'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="font-black text-sm text-slate-900 flex items-center gap-1.5">
                        {isSelected && <Sparkles className="w-3.5 h-3.5 text-amber-600" />}
                        <span>{d.district}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        {isSelected && (
                          <span className="px-2 py-0.5 rounded-full text-[9px] font-black bg-amber-200 text-amber-900 uppercase">
                            Focus
                          </span>
                        )}
                        <span className={`px-2.5 py-0.5 rounded-full text-xs font-black text-white shadow-2xs ${
                          isSelected ? 'bg-amber-600' : 'bg-emerald-600'
                        }`}>
                          {d.total_fas} {d.total_fas === 1 ? 'FA' : 'FAs'}
                        </span>
                      </div>
                    </div>

                    <div className="text-[11px] text-slate-400 font-medium mt-0.5">
                      {d.division} Division
                    </div>

                    <div className="flex items-center gap-2 mt-2 pt-2 border-t border-slate-100 text-[11px]">
                      <span className="font-bold text-emerald-700">
                        {d.present_count + d.late_count} Active
                      </span>
                      <span className="text-slate-300">•</span>
                      <span className="text-slate-500">
                        {d.absent_count} Inactive
                      </span>
                      {d.violation_count > 0 && (
                        <>
                          <span className="text-slate-300">•</span>
                          <span className="font-bold text-rose-600">
                            {d.violation_count} Violation
                          </span>
                        </>
                      )}
                    </div>

                    {d.upazilas.length > 0 && (
                      <div className="text-[10px] text-slate-500 mt-1 truncate">
                        Upazilas: {d.upazilas.join(', ')}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          <div className="p-2.5 border-t border-slate-200 bg-white text-[10px] text-slate-400 text-center">
            Click any district card to focus the map on its center
          </div>
        </div>
      </div>
    </div>
  </div>
);
};
