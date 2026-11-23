import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Compass,
  MapPin,
  Building2,
  ExternalLink,
  Briefcase,
  Search,
  Filter,
  CheckCircle2,
  ShieldCheck,
  TrendingUp,
  Sparkles,
  Layers,
  ArrowUpRight,
  Globe,
  Clock,
  Send,
  Check,
  BookmarkCheck,
  ChevronRight,
  RefreshCw,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Minimize2,
  X,
  Award,
  ChevronDown,
  Bookmark,
  Heart,
  Share2,
  SlidersHorizontal,
} from 'lucide-react';
import {
  startupService,
  type StartupItem,
  type StartupJobItem,
  type StartupMapDataResponse,
  type StartupMapHub,
  type StateDetailResponse,
  type StudentJobApplicationRow,
  type WatchlistRecord,
} from '../../../services/startupService';
import { useAuth } from '../../../context/AuthContext';

// ---------------------------------------------------------------------------
// Geographic Projection & Coordinate Utilities
// ---------------------------------------------------------------------------

const SVG_WIDTH = 800;
const SVG_HEIGHT = 920;
const PADDING = 35;
const LNG_MIN = 68.0;
const LNG_MAX = 97.5;
const LAT_MIN = 6.5;
const LAT_MAX = 37.5;

function projectGeo(lng: number, lat: number): { x: number; y: number } {
  const x = PADDING + ((lng - LNG_MIN) / (LNG_MAX - LNG_MIN)) * (SVG_WIDTH - 2 * PADDING);
  const y = PADDING + ((LAT_MAX - lat) / (LAT_MAX - LAT_MIN)) * (SVG_HEIGHT - 2 * PADDING);
  return { x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 };
}

function ringToSvgPath(ring: [number, number][]): string {
  if (!ring || ring.length === 0) return '';
  return (
    ring
      .map((pt, i) => {
        const { x, y } = projectGeo(pt[0], pt[1]);
        return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
      })
      .join(' ') + ' Z'
  );
}

function geometryToSvgPath(geometry: any): string {
  if (!geometry || !geometry.coordinates) return '';
  if (geometry.type === 'Polygon') {
    return geometry.coordinates.map(ringToSvgPath).join(' ');
  } else if (geometry.type === 'MultiPolygon') {
    return geometry.coordinates.flatMap((poly: any) => poly.map(ringToSvgPath)).join(' ');
  }
  return '';
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const StartupMapPage: React.FC = () => {
  const { user } = useAuth();

  // Navigation & View state
  const [activeTab, setActiveTab] = useState<'atlas' | 'directory' | 'watchlist'>('atlas');
  const [loading, setLoading] = useState<boolean>(true);
  const [geoLoading, setGeoLoading] = useState<boolean>(true);

  // Data
  const [geoFeatures, setGeoFeatures] = useState<any[]>([]);
  const [startups, setStartups] = useState<StartupItem[]>([]);
  const [mapData, setMapData] = useState<StartupMapDataResponse | null>(null);
  const [recommendations, setRecommendations] = useState<StartupItem[]>([]);
  const [myWatchlist, setMyWatchlist] = useState<WatchlistRecord[]>([]);
  const [myApplications, setMyApplications] = useState<StudentJobApplicationRow[]>([]);

  // Selection & Slide-over State
  const [selectedStateName, setSelectedStateName] = useState<string | null>(null);
  const [stateDetail, setStateDetail] = useState<StateDetailResponse | null>(null);
  const [stateDetailLoading, setStateDetailLoading] = useState<boolean>(false);
  const [selectedStartup, setSelectedStartup] = useState<StartupItem | null>(null);
  const [activeHub, setActiveHub] = useState<StartupMapHub | null>(null);
  const [hoveredState, setHoveredState] = useState<{ name: string; count: number; x: number; y: number } | null>(null);

  // Map Navigation & Zoom
  const [zoom, setZoom] = useState<number>(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState<boolean>(false);
  const [startPan, setStartPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const mapContainerRef = useRef<HTMLDivElement>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedSector, setSelectedSector] = useState<string>('all');
  const [selectedClassification, setSelectedClassification] = useState<string>('all');
  const [selectedVerification, setSelectedVerification] = useState<string>('all');
  const [dpiitFilter, setDpiitFilter] = useState<string>('all');
  const [internshipOnly, setInternshipOnly] = useState<boolean>(false);
  const [fresherOnly, setFresherOnly] = useState<boolean>(false);
  const [openRolesOnly, setOpenRolesOnly] = useState<boolean>(false);

  // Feedback notifications
  const [toastMessage, setToastMessage] = useState<{ type: 'success' | 'info' | 'error'; text: string } | null>(null);
  const [applyingJobId, setApplyingJobId] = useState<string | null>(null);

  // Initial Data Load
  useEffect(() => {
    loadAtlasData();
    loadGeoJson();
  }, []);

  const showToast = (text: string, type: 'success' | 'info' | 'error' = 'success') => {
    setToastMessage({ type, text });
    setTimeout(() => setToastMessage(null), 3500);
  };

  const loadGeoJson = async () => {
    try {
      setGeoLoading(true);
      const res = await fetch(`${import.meta.env.BASE_URL}data/geo/india_states_web.geojson`);
      if (res.ok) {
        const data = await res.json();
        setGeoFeatures(data.features || []);
      }
    } catch (err) {
      console.error('Failed to load India states GeoJSON:', err);
    } finally {
      setGeoLoading(false);
    }
  };

  const loadAtlasData = async () => {
    try {
      setLoading(true);
      const [allStartups, mData, recs, wl, apps] = await Promise.all([
        startupService.listStartups(),
        startupService.getMapData(),
        startupService.getRecommendations().catch(() => []),
        startupService.getMyWatchlist().catch(() => []),
        startupService.getMyApplications().catch(() => []),
      ]);
      setStartups(allStartups);
      setMapData(mData);
      setRecommendations(recs);
      setMyWatchlist(wl);
      setMyApplications(apps);

      if (mData?.hubs?.length) {
        const top = [...mData.hubs].sort((a, b) => b.startup_count - a.startup_count)[0];
        setActiveHub(top);
      }
    } catch (err) {
      console.error('Failed to load startup data:', err);
      showToast('Error loading startup intelligence.', 'error');
    } finally {
      setLoading(false);
    }
  };

  // State selection handler
  const handleSelectState = async (stateName: string) => {
    setSelectedStateName(stateName);
    setStateDetailLoading(true);
    try {
      const detail = await startupService.getStateDetail(stateName);
      setStateDetail(detail);
    } catch (err) {
      console.error('Error fetching state detail:', err);
    } finally {
      setStateDetailLoading(false);
    }
  };

  // Watchlist toggle handler
  const handleToggleWatchlist = async (startup: StartupItem, expressInterest: boolean = false) => {
    try {
      const res = await startupService.toggleWatchlist(startup.startup_id, expressInterest);
      showToast(res.message, res.is_saved ? 'success' : 'info');

      // Update local state
      setStartups((prev) =>
        prev.map((s) => (s.startup_id === startup.startup_id ? { ...s, is_saved_watchlist: res.is_saved } : s))
      );
      if (selectedStartup && selectedStartup.startup_id === startup.startup_id) {
        setSelectedStartup({ ...selectedStartup, is_saved_watchlist: res.is_saved });
      }

      // Refresh watchlist
      const updatedWl = await startupService.getMyWatchlist().catch(() => []);
      setMyWatchlist(updatedWl);
    } catch (err: any) {
      showToast(err.message || 'Please sign in to save startups to your watchlist.', 'error');
    }
  };

  // Application tracking
  const handleApplyToJob = async (job: StartupJobItem) => {
    try {
      setApplyingJobId(job.job_id);
      const res = await startupService.applyToJob(job.job_id, 'Applied via Placement Intelligence Atlas');
      if (res.apply_url) {
        window.open(res.apply_url, '_blank', 'noopener,noreferrer');
        showToast(`Redirecting to ${job.company_name} careers portal...`, 'success');
      }
      const updatedApps = await startupService.getMyApplications().catch(() => []);
      setMyApplications(updatedApps);
    } catch (err: any) {
      showToast('Could not register application click.', 'error');
    } finally {
      setApplyingJobId(null);
    }
  };

  // Zoom / Pan handlers
  const handleZoomIn = () => setZoom((z) => Math.min(z + 0.35, 4.0));
  const handleZoomOut = () => setZoom((z) => Math.max(z - 0.35, 0.8));
  const handleResetZoom = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setSelectedStateName(null);
    setStateDetail(null);
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsPanning(true);
    setStartPan({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isPanning) return;
    setPan({ x: e.clientX - startPan.x, y: e.clientY - startPan.y });
  };

  const handleMouseUp = () => setIsPanning(false);

  // Fullscreen toggle
  const toggleFullscreen = () => {
    if (!mapContainerRef.current) return;
    if (!document.fullscreenElement) {
      mapContainerRef.current.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  };

  // Computed state count map
  const stateCounts = useMemo(() => {
    const map: Record<string, number> = {};
    startups.forEach((s) => {
      const st = s.hq_state;
      map[st] = (map[st] || 0) + 1;
      if (st.toLowerCase() === 'delhi' || st.toLowerCase() === 'new delhi') {
        map['NCT of Delhi'] = (map['NCT of Delhi'] || 0) + 1;
      }
    });
    return map;
  }, [startups]);

  // Filtered startups for directory
  const filteredStartups = useMemo(() => {
    return startups.filter((s) => {
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchName = s.name.toLowerCase().includes(q) || Boolean(s.legal_name && s.legal_name.toLowerCase().includes(q));
        const matchDesc = s.description.toLowerCase().includes(q);
        const matchSector = s.sector.toLowerCase().includes(q);
        const matchCity = s.hq_city.toLowerCase().includes(q);
        const matchTech = s.tech_stack?.some((t) => t.toLowerCase().includes(q));
        if (!matchName && !matchDesc && !matchSector && !matchCity && !matchTech) return false;
      }
      if (selectedSector !== 'all' && s.sector.toLowerCase() !== selectedSector.toLowerCase()) return false;
      if (selectedClassification !== 'all' && s.company_classification !== selectedClassification) return false;
      if (selectedVerification !== 'all' && s.verification_status !== selectedVerification) return false;
      if (dpiitFilter === 'recognised' && !s.dpiit_recognized) return false;
      if (dpiitFilter === 'not_recognised' && s.dpiit_recognized) return false;
      if (internshipOnly && !s.internship_available) return false;
      if (fresherOnly && !s.fresher_hiring) return false;
      if (openRolesOnly && s.hiring_status !== 'OPEN_ROLES_VERIFIED') return false;
      return true;
    });
  }, [
    startups,
    searchQuery,
    selectedSector,
    selectedClassification,
    selectedVerification,
    dpiitFilter,
    internshipOnly,
    fresherOnly,
    openRolesOnly,
  ]);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 pb-16">
      {/* Toast Notification */}
      {toastMessage && (
        <div
          className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 px-5 py-3 rounded-xl shadow-xl text-sm font-medium transition-all ${
            toastMessage.type === 'success'
              ? 'bg-emerald-900 text-emerald-100 border border-emerald-700'
              : toastMessage.type === 'error'
              ? 'bg-rose-900 text-rose-100 border border-rose-700'
              : 'bg-slate-900 text-slate-100 border border-slate-700'
          }`}
        >
          <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
          <span>{toastMessage.text}</span>
        </div>
      )}

      {/* Hero Header */}
      <div className="bg-gradient-to-b from-orange-50/70 via-white to-slate-50 border-b border-orange-100/60 pt-8 pb-6 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-orange-100/80 text-orange-800 text-xs font-semibold tracking-wide uppercase mb-3">
                <Compass className="w-3.5 h-3.5 text-orange-600" />
                <span>Geospatial Career Intelligence</span>
              </div>
              <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
                India Startup &amp; Tech Opportunity Atlas
              </h1>
              <p className="mt-2 text-base text-slate-600 max-w-3xl leading-relaxed">
                Discover verified technology companies, deep-tech pioneers, bootstrapped powerhouses, and high-growth
                startups across all 28 Indian States and 8 Union Territories.
              </p>
            </div>

            {/* Quick Stats Pill */}
            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
              <div className="bg-white border border-slate-200 rounded-xl px-4 py-2.5 shadow-sm text-center">
                <span className="block text-2xl font-black text-slate-900">{mapData?.total_startups || startups.length}</span>
                <span className="text-xs font-medium text-slate-500">Tech Companies</span>
              </div>
              <div className="bg-white border border-emerald-200 rounded-xl px-4 py-2.5 shadow-sm text-center">
                <span className="block text-2xl font-black text-emerald-600">{mapData?.total_hiring || 12}</span>
                <span className="text-xs font-medium text-emerald-700">Actively Hiring</span>
              </div>
              <div className="bg-white border border-orange-200 rounded-xl px-4 py-2.5 shadow-sm text-center">
                <span className="block text-2xl font-black text-orange-600">{mapData?.hubs?.length || 8}</span>
                <span className="text-xs font-medium text-orange-700">Metro Tech Hubs</span>
              </div>
            </div>
          </div>

          {/* Tab Navigation */}
          <div className="mt-8 flex items-center justify-between border-b border-slate-200">
            <div className="flex gap-2 sm:gap-6">
              <button
                onClick={() => setActiveTab('atlas')}
                className={`flex items-center gap-2 pb-3.5 px-2 text-sm font-semibold border-b-2 transition-colors ${
                  activeTab === 'atlas'
                    ? 'border-orange-600 text-orange-600'
                    : 'border-transparent text-slate-600 hover:text-slate-900'
                }`}
              >
                <Compass className="w-4 h-4" />
                <span>Interactive Atlas Map</span>
              </button>
              <button
                onClick={() => setActiveTab('directory')}
                className={`flex items-center gap-2 pb-3.5 px-2 text-sm font-semibold border-b-2 transition-colors ${
                  activeTab === 'directory'
                    ? 'border-orange-600 text-orange-600'
                    : 'border-transparent text-slate-600 hover:text-slate-900'
                }`}
              >
                <Building2 className="w-4 h-4" />
                <span>Multi-Source Directory</span>
                <span className="ml-1.5 px-2 py-0.5 text-xs bg-slate-100 text-slate-700 rounded-full font-medium">
                  {filteredStartups.length}
                </span>
              </button>
              <button
                onClick={() => setActiveTab('watchlist')}
                className={`flex items-center gap-2 pb-3.5 px-2 text-sm font-semibold border-b-2 transition-colors ${
                  activeTab === 'watchlist'
                    ? 'border-orange-600 text-orange-600'
                    : 'border-transparent text-slate-600 hover:text-slate-900'
                }`}
              >
                <BookmarkCheck className="w-4 h-4" />
                <span>My Saved &amp; Applications</span>
                {myWatchlist.length > 0 && (
                  <span className="ml-1.5 px-2 py-0.5 text-xs bg-orange-100 text-orange-800 rounded-full font-semibold">
                    {myWatchlist.length}
                  </span>
                )}
              </button>
            </div>

            {/* Quick State Jump */}
            {activeTab === 'atlas' && (
              <div className="hidden sm:flex items-center gap-2 pb-2">
                <span className="text-xs text-slate-500 font-medium">Jump to State:</span>
                <select
                  value={selectedStateName || ''}
                  onChange={(e) => e.target.value && handleSelectState(e.target.value)}
                  className="text-xs bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-500"
                >
                  <option value="">Select an Indian State...</option>
                  {geoFeatures.map((f: any) => {
                    const sName = f.properties.state_name;
                    const c = stateCounts[sName] || 0;
                    return (
                      <option key={sName} value={sName}>
                        {sName} {c > 0 ? `(${c} companies)` : ''}
                      </option>
                    );
                  })}
                </select>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main Content Body */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6">
        {/* =================================================================== */}
        {/* TAB 1: INTERACTIVE ATLAS MAP */}
        {/* =================================================================== */}
        {activeTab === 'atlas' && (
          <div className="space-y-6">
            {/* Map Container Card */}
            <div
              ref={mapContainerRef}
              className={`relative bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden ${
                isFullscreen ? 'fixed inset-0 z-50 rounded-none' : 'h-[720px]'
              }`}
            >
              {/* Map Floating Controls */}
              <div className="absolute top-4 left-4 z-20 flex flex-col gap-2 bg-white/95 backdrop-blur-sm p-1.5 rounded-xl border border-slate-200 shadow-md">
                <button
                  onClick={handleZoomIn}
                  title="Zoom In"
                  className="p-2 text-slate-700 hover:text-orange-600 hover:bg-orange-50 rounded-lg transition-colors"
                >
                  <ZoomIn className="w-5 h-5" />
                </button>
                <button
                  onClick={handleZoomOut}
                  title="Zoom Out"
                  className="p-2 text-slate-700 hover:text-orange-600 hover:bg-orange-50 rounded-lg transition-colors"
                >
                  <ZoomOut className="w-5 h-5" />
                </button>
                <button
                  onClick={handleResetZoom}
                  title="Reset View"
                  className="p-2 text-slate-700 hover:text-orange-600 hover:bg-orange-50 rounded-lg transition-colors text-xs font-bold"
                >
                  1x
                </button>
                <div className="h-px bg-slate-200 my-0.5" />
                <button
                  onClick={toggleFullscreen}
                  title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
                  className="p-2 text-slate-700 hover:text-orange-600 hover:bg-orange-50 rounded-lg transition-colors"
                >
                  {isFullscreen ? <Minimize2 className="w-5 h-5" /> : <Maximize2 className="w-5 h-5" />}
                </button>
              </div>

              {/* Map Legend Overlay */}
              <div className="absolute bottom-4 left-4 z-20 bg-white/95 backdrop-blur-sm px-4 py-3 rounded-xl border border-slate-200 shadow-md max-w-xs text-xs space-y-1.5">
                <div className="font-semibold text-slate-900 flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-orange-600" />
                  <span>Survey of India Official Administrative Boundaries</span>
                </div>
                <div className="text-slate-500 leading-snug">
                  Click any state polygon to open the State Intelligence Panel with district &amp; tech stack distributions.
                </div>
                <div className="flex items-center gap-3 pt-1 text-[11px] text-slate-600">
                  <span className="flex items-center gap-1">
                    <span className="w-3 h-3 rounded-full bg-orange-500 inline-block" /> High Density Hub
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-3 h-3 rounded-full bg-orange-200 inline-block" /> Emerging State
                  </span>
                </div>
              </div>

              {/* Hover Tooltip */}
              {hoveredState && (
                <div
                  className="pointer-events-none absolute z-30 bg-slate-900/95 text-white px-3 py-2 rounded-lg shadow-xl text-xs font-medium"
                  style={{ left: hoveredState.x + 12, top: hoveredState.y - 36 }}
                >
                  <div className="font-bold text-orange-300">{hoveredState.name}</div>
                  <div className="text-slate-300">
                    {hoveredState.count > 0 ? `${hoveredState.count} Tech Companies Headquartered` : 'Ecosystem Tracking'}
                  </div>
                </div>
              )}

              {/* Interactive SVG Map */}
              <div
                className="w-full h-full cursor-grab active:cursor-grabbing bg-gradient-to-b from-sky-50/20 via-white to-amber-50/20 flex items-center justify-center overflow-hidden"
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
              >
                {geoLoading ? (
                  <div className="flex flex-col items-center gap-3 text-slate-500">
                    <RefreshCw className="w-8 h-8 animate-spin text-orange-600" />
                    <span className="text-sm font-medium">Loading Authentic Indian Administrative Map...</span>
                  </div>
                ) : (
                  <svg
                    viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
                    className="w-full h-full max-h-full transition-transform duration-75 select-none"
                    style={{
                      transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                      transformOrigin: 'center center',
                    }}
                  >
                    {/* Background Graticule */}
                    <g opacity="0.15">
                      <line x1="100" y1="0" x2="100" y2={SVG_HEIGHT} stroke="#94a3b8" strokeDasharray="4 4" />
                      <line x1="300" y1="0" x2="300" y2={SVG_HEIGHT} stroke="#94a3b8" strokeDasharray="4 4" />
                      <line x1="500" y1="0" x2="500" y2={SVG_HEIGHT} stroke="#94a3b8" strokeDasharray="4 4" />
                      <line x1="700" y1="0" x2="700" y2={SVG_HEIGHT} stroke="#94a3b8" strokeDasharray="4 4" />
                      <line x1="0" y1="200" x2={SVG_WIDTH} y2="200" stroke="#94a3b8" strokeDasharray="4 4" />
                      <line x1="0" y1="450" x2={SVG_WIDTH} y2="450" stroke="#94a3b8" strokeDasharray="4 4" />
                      <line x1="0" y1="700" x2={SVG_WIDTH} y2="700" stroke="#94a3b8" strokeDasharray="4 4" />
                    </g>

                    {/* Official State / UT Boundary Polygons */}
                    <g className="states-layer">
                      {geoFeatures.map((feat: any, idx: number) => {
                        const stateName = feat.properties.state_name;
                        const count = stateCounts[stateName] || 0;
                        const isSelected = selectedStateName?.toLowerCase() === stateName.toLowerCase();
                        const pathD = geometryToSvgPath(feat.geometry);

                        let fill = '#f8fafc';
                        let stroke = '#cbd5e1';

                        if (count > 4) {
                          fill = isSelected ? '#ffedd5' : '#fed7aa';
                          stroke = '#ea580c';
                        } else if (count > 0) {
                          fill = isSelected ? '#ffedd5' : '#ffedd5';
                          stroke = '#f97316';
                        } else if (isSelected) {
                          fill = '#ffedd5';
                          stroke = '#ea580c';
                        }

                        return (
                          <path
                            key={feat.properties.state_name || idx}
                            d={pathD}
                            fill={fill}
                            stroke={stroke}
                            strokeWidth={isSelected ? 2.5 : 1.2}
                            strokeLinejoin="round"
                            className="cursor-pointer transition-all duration-200 hover:fill-orange-200 hover:stroke-orange-600"
                            onMouseEnter={(e) => {
                              const rect = (e.currentTarget.ownerSVGElement?.parentElement as HTMLElement).getBoundingClientRect();
                              setHoveredState({
                                name: stateName,
                                count,
                                x: e.clientX - rect.left,
                                y: e.clientY - rect.top,
                              });
                            }}
                            onMouseMove={(e) => {
                              if (!hoveredState) return;
                              const rect = (e.currentTarget.ownerSVGElement?.parentElement as HTMLElement).getBoundingClientRect();
                              setHoveredState({
                                name: stateName,
                                count,
                                x: e.clientX - rect.left,
                                y: e.clientY - rect.top,
                              });
                            }}
                            onMouseLeave={() => setHoveredState(null)}
                            onClick={() => handleSelectState(stateName)}
                          />
                        );
                      })}
                    </g>

                    {/* Metro City Hub Markers */}
                    <g className="hubs-layer">
                      {mapData?.hubs?.map((hub) => {
                        const pt = projectGeo(hub.lng, hub.lat);
                        const isTop = hub.startup_count >= 3;
                        return (
                          <g
                            key={`${hub.city}-${hub.state}`}
                            transform={`translate(${pt.x}, ${pt.y})`}
                            className="cursor-pointer group"
                            onClick={() => {
                              setActiveHub(hub);
                              handleSelectState(hub.state);
                            }}
                          >
                            {isTop && (
                              <circle r="16" fill="#f97316" opacity="0.25" className="animate-ping" />
                            )}
                            <circle
                              r={isTop ? 10 : 7}
                              fill="#ea580c"
                              stroke="#ffffff"
                              strokeWidth="2.5"
                              className="group-hover:scale-125 transition-transform"
                            />
                            <circle r={isTop ? 4 : 3} fill="#ffffff" />
                            <text
                              x="14"
                              y="4"
                              fontSize="11"
                              fontWeight="bold"
                              fill="#0f172a"
                              className="pointer-events-none drop-shadow-sm select-none"
                            >
                              {hub.city} ({hub.startup_count})
                            </text>
                          </g>
                        );
                      })}
                    </g>
                  </svg>
                )}
              </div>

              {/* Slide-over State Intelligence Drawer */}
              {selectedStateName && (
                <div className="absolute top-0 right-0 h-full w-full sm:w-[440px] bg-white border-l border-slate-200 shadow-2xl z-40 flex flex-col overflow-hidden animate-in slide-in-from-right duration-300">
                  {/* Drawer Header */}
                  <div className="p-5 border-b border-slate-200 bg-gradient-to-r from-orange-50/80 to-white flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-orange-700">
                        <MapPin className="w-3.5 h-3.5" />
                        <span>State Opportunity Intelligence</span>
                      </div>
                      <h3 className="text-xl font-bold text-slate-900 mt-1">{selectedStateName}</h3>
                    </div>
                    <button
                      onClick={() => {
                        setSelectedStateName(null);
                        setStateDetail(null);
                      }}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>

                  {/* Drawer Content */}
                  <div className="flex-1 overflow-y-auto p-5 space-y-6">
                    {stateDetailLoading ? (
                      <div className="py-20 flex flex-col items-center justify-center text-slate-400">
                        <RefreshCw className="w-8 h-8 animate-spin text-orange-600 mb-2" />
                        <span className="text-sm">Fetching state metrics...</span>
                      </div>
                    ) : (
                      <>
                        {/* High-Level Numbers */}
                        <div className="grid grid-cols-3 gap-3">
                          <div className="p-3 rounded-xl bg-orange-50 border border-orange-100 text-center">
                            <span className="block text-xl font-extrabold text-orange-700">
                              {stateDetail?.total_companies || 0}
                            </span>
                            <span className="text-[11px] font-medium text-orange-900">Total Companies</span>
                          </div>
                          <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-100 text-center">
                            <span className="block text-xl font-extrabold text-emerald-700">
                              {stateDetail?.actively_hiring || 0}
                            </span>
                            <span className="text-[11px] font-medium text-emerald-900">Actively Hiring</span>
                          </div>
                          <div className="p-3 rounded-xl bg-blue-50 border border-blue-100 text-center">
                            <span className="block text-xl font-extrabold text-blue-700">
                              {stateDetail?.dpiit_recognized_count || 0}
                            </span>
                            <span className="text-[11px] font-medium text-blue-900">DPIIT Verified</span>
                          </div>
                        </div>

                        {/* Top Districts / Hubs */}
                        {stateDetail?.districts && stateDetail.districts.length > 0 && (
                          <div>
                            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2.5">
                              District Ecosystem Distribution
                            </h4>
                            <div className="space-y-1.5">
                              {stateDetail.districts.map((d) => (
                                <div
                                  key={d.district}
                                  className="flex items-center justify-between text-xs py-1.5 px-3 rounded-lg bg-slate-50 border border-slate-100"
                                >
                                  <span className="font-medium text-slate-700">{d.district}</span>
                                  <span className="font-bold text-orange-600">{d.count} companies</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Dominant Tech Stacks */}
                        {stateDetail?.tech_stack_distribution && stateDetail.tech_stack_distribution.length > 0 && (
                          <div>
                            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2.5">
                              In-Demand Tech Stacks in {selectedStateName}
                            </h4>
                            <div className="flex flex-wrap gap-1.5">
                              {stateDetail.tech_stack_distribution.map((t) => (
                                <span
                                  key={t.tech}
                                  className="px-2.5 py-1 text-xs rounded-md bg-white border border-slate-200 text-slate-700 font-medium"
                                >
                                  {t.tech} <span className="text-slate-400 font-normal">({t.count})</span>
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Companies Headquartered */}
                        <div>
                          <div className="flex items-center justify-between mb-3">
                            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                              Headquartered Companies ({stateDetail?.companies.length || 0})
                            </h4>
                          </div>

                          {stateDetail?.companies && stateDetail.companies.length > 0 ? (
                            <div className="space-y-3">
                              {stateDetail.companies.map((c) => (
                                <div
                                  key={c.startup_id}
                                  className="p-3.5 rounded-xl border border-slate-200 hover:border-orange-300 hover:shadow-sm transition-all bg-white"
                                >
                                  <div className="flex items-start justify-between gap-3">
                                    <div className="flex items-center gap-3">
                                      <img
                                        src={c.logo_url}
                                        alt={c.name}
                                        className="w-10 h-10 rounded-lg object-cover border border-slate-100"
                                      />
                                      <div>
                                        <h5 className="font-bold text-slate-900 text-sm">{c.name}</h5>
                                        <p className="text-xs text-slate-500">
                                          {c.city} • {c.sector}
                                        </p>
                                      </div>
                                    </div>
                                    {c.hiring_status === 'OPEN_ROLES_VERIFIED' && (
                                      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-800 shrink-0">
                                        Hiring
                                      </span>
                                    )}
                                  </div>

                                  <div className="mt-2.5 flex flex-wrap gap-1">
                                    <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-700">
                                      {c.company_classification.replace('_', ' ')}
                                    </span>
                                    {c.tech_stack?.slice(0, 3).map((t) => (
                                      <span
                                        key={t}
                                        className="px-1.5 py-0.5 rounded text-[10px] bg-orange-50 text-orange-700"
                                      >
                                        {t}
                                      </span>
                                    ))}
                                  </div>

                                  <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between">
                                    <button
                                      onClick={async () => {
                                        const full = await startupService.getStartupDetail(c.startup_id);
                                        setSelectedStartup(full);
                                      }}
                                      className="text-xs font-semibold text-orange-600 hover:text-orange-700 flex items-center gap-1"
                                    >
                                      <span>View Verified Roles</span>
                                      <ChevronRight className="w-3.5 h-3.5" />
                                    </button>
                                    <a
                                      href={c.careers_url}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="text-xs text-slate-400 hover:text-slate-600 flex items-center gap-1"
                                    >
                                      <Globe className="w-3 h-3" />
                                      <span>Careers</span>
                                    </a>
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="p-6 text-center text-slate-400 text-xs border border-dashed border-slate-200 rounded-xl">
                              No companies actively listed in this state directory yet. More are being verified.
                            </div>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Featured Recommendations */}
            {recommendations.length > 0 && (
              <div className="bg-gradient-to-r from-orange-50/50 via-white to-amber-50/40 rounded-2xl p-6 border border-orange-100/80 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-orange-600" />
                    <h3 className="text-base font-bold text-slate-900">
                      Personalized Startup Matches for Your Verified Profile
                    </h3>
                  </div>
                  <span className="text-xs font-semibold text-orange-700 bg-orange-100 px-2.5 py-0.5 rounded-full">
                    Skill-Verified AI Matching
                  </span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {recommendations.slice(0, 3).map((s) => (
                    <div
                      key={s.startup_id}
                      className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm hover:border-orange-300 transition-all cursor-pointer"
                      onClick={() => setSelectedStartup(s)}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3">
                          <img src={s.logo_url} alt={s.name} className="w-10 h-10 rounded-lg object-cover" />
                          <div>
                            <h4 className="font-bold text-slate-900 text-sm">{s.name}</h4>
                            <span className="text-xs text-slate-500">
                              {s.hq_city}, {s.hq_state}
                            </span>
                          </div>
                        </div>
                        {s.match_score && (
                          <span className="px-2 py-0.5 rounded-md text-xs font-bold bg-orange-50 text-orange-700 border border-orange-200">
                            {s.match_score}% Match
                          </span>
                        )}
                      </div>
                      <p className="mt-2 text-xs text-slate-600 line-clamp-2">{s.description}</p>
                      {s.match_reasons && s.match_reasons.length > 0 && (
                        <div className="mt-2 text-[11px] text-emerald-700 font-medium flex items-center gap-1">
                          <Check className="w-3.5 h-3.5 shrink-0" />
                          <span className="truncate">{s.match_reasons[0]}</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* =================================================================== */}
        {/* TAB 2: MULTI-SOURCE TECH DIRECTORY */}
        {/* =================================================================== */}
        {activeTab === 'directory' && (
          <div className="space-y-6">
            {/* Filter Bar */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 absolute left-3.5 top-3.5 text-slate-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search by company name, technology (Python, CUDA, Go), sector, or city..."
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:bg-white transition-all"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery('')}
                      className="absolute right-3 top-3 text-slate-400 hover:text-slate-600"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>

                <select
                  value={selectedSector}
                  onChange={(e) => setSelectedSector(e.target.value)}
                  className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-orange-500"
                >
                  <option value="all">All Sectors</option>
                  <option value="DeepTech">DeepTech &amp; AI</option>
                  <option value="SaaS">SaaS &amp; Enterprise</option>
                  <option value="Fintech">Fintech</option>
                  <option value="SpaceTech">SpaceTech</option>
                  <option value="CleanTech">CleanTech</option>
                  <option value="Logistics">Logistics</option>
                  <option value="EdTech">EdTech</option>
                  <option value="HealthTech">HealthTech</option>
                  <option value="MediaTech">MediaTech</option>
                </select>

                <select
                  value={selectedClassification}
                  onChange={(e) => setSelectedClassification(e.target.value)}
                  className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-orange-500"
                >
                  <option value="all">All Classifications</option>
                  <option value="STARTUP">Startup (High-Growth)</option>
                  <option value="PRODUCT_COMPANY">Product Company</option>
                  <option value="ESTABLISHED_TECH">Established Tech Leader</option>
                  <option value="EMERGING_VENTURE">Emerging Venture</option>
                </select>
              </div>

              {/* Secondary Filter Chips */}
              <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-slate-100 text-xs">
                <span className="text-slate-400 font-medium">Quick Toggles:</span>

                <button
                  onClick={() => setOpenRolesOnly(!openRolesOnly)}
                  className={`px-3 py-1.5 rounded-lg border font-medium transition-colors flex items-center gap-1.5 ${
                    openRolesOnly
                      ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                      : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <Briefcase className="w-3.5 h-3.5" />
                  <span>Actively Hiring Only</span>
                </button>

                <button
                  onClick={() => setInternshipOnly(!internshipOnly)}
                  className={`px-3 py-1.5 rounded-lg border font-medium transition-colors flex items-center gap-1.5 ${
                    internshipOnly
                      ? 'bg-orange-50 border-orange-300 text-orange-800'
                      : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Internships Available</span>
                </button>

                <button
                  onClick={() => setFresherOnly(!fresherOnly)}
                  className={`px-3 py-1.5 rounded-lg border font-medium transition-colors flex items-center gap-1.5 ${
                    fresherOnly
                      ? 'bg-blue-50 border-blue-300 text-blue-800'
                      : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Fresher-Friendly (0-1 Yrs)</span>
                </button>

                <button
                  onClick={() =>
                    setDpiitFilter(dpiitFilter === 'recognised' ? 'all' : 'recognised')
                  }
                  className={`px-3 py-1.5 rounded-lg border font-medium transition-colors flex items-center gap-1.5 ${
                    dpiitFilter === 'recognised'
                      ? 'bg-purple-50 border-purple-300 text-purple-800'
                      : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>DPIIT-Recognised Only</span>
                </button>
              </div>
            </div>

            {/* Companies Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {filteredStartups.map((s) => (
                <div
                  key={s.startup_id}
                  className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm hover:shadow-md hover:border-orange-200 transition-all flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <img
                          src={s.logo_url}
                          alt={s.name}
                          className="w-12 h-12 rounded-xl object-cover border border-slate-100 shadow-xs"
                        />
                        <div>
                          <h3 className="font-bold text-slate-900 text-base leading-snug">{s.name}</h3>
                          <p className="text-xs text-slate-500 font-medium">
                            {s.hq_city}, {s.hq_state}
                          </p>
                        </div>
                      </div>

                      <button
                        onClick={() => handleToggleWatchlist(s)}
                        title={s.is_saved_watchlist ? 'Remove from Watchlist' : 'Save to Watchlist'}
                        className={`p-2 rounded-lg border transition-colors ${
                          s.is_saved_watchlist
                            ? 'bg-orange-50 border-orange-200 text-orange-600'
                            : 'bg-white border-slate-200 text-slate-400 hover:text-slate-600'
                        }`}
                      >
                        <Bookmark className="w-4 h-4 fill-current" />
                      </button>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-1.5 text-[11px]">
                      <span className="px-2 py-0.5 rounded-md font-semibold bg-indigo-50 text-indigo-700 border border-indigo-100">
                        {(s.company_classification || 'STARTUP').replace('_', ' ')}
                      </span>
                      {s.dpiit_recognized && (
                        <span className="px-2 py-0.5 rounded-md font-semibold bg-emerald-50 text-emerald-700 border border-emerald-100 flex items-center gap-1">
                          <Check className="w-3 h-3" /> DPIIT
                        </span>
                      )}
                      <span className="px-2 py-0.5 rounded-md font-medium bg-slate-100 text-slate-700">
                        {s.sector}
                      </span>
                    </div>

                    <p className="mt-3 text-xs text-slate-600 leading-relaxed line-clamp-3">{s.description}</p>

                    {s.tech_stack && s.tech_stack.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-1">
                        {s.tech_stack.slice(0, 4).map((tech) => (
                          <span
                            key={tech}
                            className="px-2 py-0.5 text-[10px] bg-slate-50 text-slate-600 border border-slate-100 rounded"
                          >
                            {tech}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="mt-5 pt-3.5 border-t border-slate-100 flex items-center justify-between">
                    <div>
                      <span className="text-[11px] font-semibold text-slate-500 block">Stage / Valuation</span>
                      <span className="text-xs font-bold text-slate-800">{s.funding_stage || 'Privately Held'}</span>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setSelectedStartup(s)}
                        className="px-3.5 py-1.5 rounded-lg bg-orange-600 hover:bg-orange-700 text-white text-xs font-semibold shadow-xs transition-colors flex items-center gap-1"
                      >
                        <span>Explore</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {filteredStartups.length === 0 && (
              <div className="bg-white p-12 rounded-2xl border border-slate-200 text-center">
                <Compass className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                <h4 className="text-base font-bold text-slate-900">No matching tech companies found</h4>
                <p className="text-xs text-slate-500 mt-1">Try adjusting your filters or search keywords.</p>
              </div>
            )}
          </div>
        )}

        {/* =================================================================== */}
        {/* TAB 3: MY WATCHLIST & APPLICATIONS */}
        {/* =================================================================== */}
        {activeTab === 'watchlist' && (
          <div className="space-y-6">
            {/* Watchlist Section */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-lg font-bold text-slate-900">Target Tech Companies Watchlist</h3>
                  <p className="text-xs text-slate-500">
                    Companies you have marked for campus recruitment, direct hiring, or project alignment.
                  </p>
                </div>
                <span className="px-3 py-1 rounded-full text-xs font-semibold bg-orange-100 text-orange-800">
                  {myWatchlist.length} Saved
                </span>
              </div>

              {myWatchlist.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {myWatchlist.map((w) => (
                    <div
                      key={w.startup_id}
                      className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 flex flex-col justify-between"
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <h4 className="font-bold text-slate-900 text-sm">{w.name}</h4>
                          <span className="text-xs text-slate-500">
                            {w.hq_city}, {w.hq_state}
                          </span>
                        </div>
                        <button
                          onClick={async () => {
                            const found = startups.find((s) => s.startup_id === w.startup_id);
                            if (found) await handleToggleWatchlist(found);
                          }}
                          className="text-xs text-rose-500 hover:text-rose-700 font-medium"
                        >
                          Remove
                        </button>
                      </div>

                      <div className="mt-3 flex items-center justify-between pt-2 border-t border-slate-200/60 text-xs">
                        <span className="text-slate-500">Role Interest: {w.preferred_role || 'General SWE'}</span>
                        <a
                          href={w.careers_url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-orange-600 font-semibold hover:underline flex items-center gap-1"
                        >
                          Careers <ArrowUpRight className="w-3 h-3" />
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-8 text-center text-slate-400 text-xs border border-dashed border-slate-200 rounded-xl">
                  You haven't saved any startups to your watchlist yet. Browse the Atlas or Directory to target
                  companies.
                </div>
              )}
            </div>

            {/* Applications Tracker */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-lg font-bold text-slate-900">Direct Application Tracker</h3>
                  <p className="text-xs text-slate-500">Track roles you have applied for via official startup portals.</p>
                </div>
                <span className="px-3 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">
                  {myApplications.length} Tracked
                </span>
              </div>

              {myApplications.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 border-y border-slate-200 text-slate-500 font-semibold uppercase">
                      <tr>
                        <th className="py-2.5 px-3">Role &amp; Company</th>
                        <th className="py-2.5 px-3">Location</th>
                        <th className="py-2.5 px-3">Status</th>
                        <th className="py-2.5 px-3">Applied On</th>
                        <th className="py-2.5 px-3 text-right">Destination</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {myApplications.map((app) => (
                        <tr key={app.id || app.job_id} className="hover:bg-slate-50/50">
                          <td className="py-3 px-3">
                            <span className="font-bold text-slate-900 block">{app.job_title}</span>
                            <span className="text-slate-500">{app.company_name}</span>
                          </td>
                          <td className="py-3 px-3 text-slate-600">{app.location}</td>
                          <td className="py-3 px-3">
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-100 text-blue-800">
                              {app.status}
                            </span>
                          </td>
                          <td className="py-3 px-3 text-slate-500">
                            {new Date(app.applied_at).toLocaleDateString()}
                          </td>
                          <td className="py-3 px-3 text-right">
                            <a
                              href={app.apply_url}
                              target="_blank"
                              rel="noreferrer"
                              className="text-orange-600 font-semibold hover:underline inline-flex items-center gap-1"
                            >
                              Portal <ExternalLink className="w-3 h-3" />
                            </a>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="p-8 text-center text-slate-400 text-xs border border-dashed border-slate-200 rounded-xl">
                  No applications tracked yet. Click "Apply via Careers Portal" on any startup job opening to track it
                  here.
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* =================================================================== */}
      {/* COMPANY DETAIL MODAL */}
      {/* =================================================================== */}
      {selectedStartup && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="p-6 border-b border-slate-200 bg-gradient-to-r from-orange-50/70 to-white flex items-start justify-between">
              <div className="flex items-center gap-4">
                <img
                  src={selectedStartup.logo_url}
                  alt={selectedStartup.name}
                  className="w-14 h-14 rounded-2xl object-cover border border-slate-200 shadow-sm"
                />
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-xl font-extrabold text-slate-900">{selectedStartup.name}</h2>
                    {selectedStartup.dpiit_recognized && (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 flex items-center gap-1">
                        <Check className="w-3 h-3" /> DPIIT
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 font-medium mt-0.5">
                    {selectedStartup.legal_name || selectedStartup.name} • Est. {selectedStartup.founding_year || '2016'}
                  </p>
                  <p className="text-xs text-slate-600 mt-1">
                    {selectedStartup.hq_city}, {selectedStartup.hq_state} (
                    {selectedStartup.location_precision?.replace('_', ' ') || 'Verified City'})
                  </p>
                </div>
              </div>

              <button
                onClick={() => setSelectedStartup(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Scroll Body */}
            <div className="p-6 overflow-y-auto space-y-6">
              {/* Classification & Metadata Badges */}
              <div className="flex flex-wrap gap-2 text-xs">
                <span className="px-2.5 py-1 rounded-lg font-semibold bg-indigo-50 text-indigo-700 border border-indigo-100">
                  Classification: {(selectedStartup.company_classification || 'STARTUP').replace('_', ' ')}
                </span>
                <span className="px-2.5 py-1 rounded-lg font-semibold bg-emerald-50 text-emerald-700 border border-emerald-100">
                  Verification: {(selectedStartup.verification_status || 'GOVERNMENT_VERIFIED').replace('_', ' ')}
                </span>
                <span className="px-2.5 py-1 rounded-lg font-semibold bg-orange-50 text-orange-700 border border-orange-100">
                  Stage: {selectedStartup.funding_stage}
                </span>
              </div>

              {/* Description */}
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">About Company</h4>
                <p className="text-sm text-slate-700 leading-relaxed">{selectedStartup.description}</p>
              </div>

              {/* Technologies */}
              {selectedStartup.tech_stack && selectedStartup.tech_stack.length > 0 && (
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                    Verified Tech Stack &amp; Engineering Core
                  </h4>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedStartup.tech_stack.map((t) => (
                      <span
                        key={t}
                        className="px-2.5 py-1 text-xs rounded-lg bg-slate-100 text-slate-800 font-medium"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Active Jobs Section */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    Open Engineering Roles ({selectedStartup.jobs?.length || selectedStartup.open_jobs_count || 0})
                  </h4>
                  {selectedStartup.hiring_status === 'OPEN_ROLES_VERIFIED' && (
                    <span className="inline-flex items-center gap-1.5 text-xs text-emerald-700 font-semibold">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                      Live Verified Openings
                    </span>
                  )}
                </div>

                {selectedStartup.jobs && selectedStartup.jobs.length > 0 ? (
                  <div className="space-y-3">
                    {selectedStartup.jobs.map((job) => (
                      <div
                        key={job.job_id}
                        className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 hover:bg-white hover:border-orange-300 transition-all space-y-2"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <h5 className="font-bold text-slate-900 text-sm">{job.title}</h5>
                            <div className="flex items-center gap-2 text-xs text-slate-500 mt-0.5">
                              <span>{job.location}</span> • <span>{job.work_mode}</span> • <span>{job.experience_level}</span>
                            </div>
                          </div>
                          <span className="px-2.5 py-1 text-xs font-bold text-emerald-800 bg-emerald-100 rounded-lg shrink-0">
                            {job.salary}
                          </span>
                        </div>

                        {/* Skills */}
                        <div className="flex flex-wrap gap-1 pt-1">
                          {job.required_skills?.map((sk) => (
                            <span key={sk} className="px-2 py-0.5 rounded text-[10px] bg-white border border-slate-200 text-slate-700">
                              {sk}
                            </span>
                          ))}
                        </div>

                        {/* Apply Action */}
                        <div className="pt-2 flex justify-end">
                          <button
                            onClick={() => handleApplyToJob(job)}
                            disabled={applyingJobId === job.job_id}
                            className="px-3.5 py-1.5 rounded-lg bg-orange-600 hover:bg-orange-700 text-white text-xs font-semibold shadow-xs transition-colors flex items-center gap-1.5"
                          >
                            <span>Apply via Official Careers</span>
                            <ArrowUpRight className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-6 text-center text-slate-400 text-xs border border-dashed border-slate-200 rounded-xl">
                    No active job requisitions listed directly. Check the official company careers portal below.
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
              <button
                onClick={() => handleToggleWatchlist(selectedStartup, true)}
                className="px-4 py-2 rounded-xl border border-orange-200 text-orange-700 hover:bg-orange-100/60 text-xs font-bold transition-colors flex items-center gap-1.5"
              >
                <Heart className="w-4 h-4 fill-current text-orange-500" />
                <span>Express Recruitment Interest</span>
              </button>

              <div className="flex items-center gap-2">
                <a
                  href={selectedStartup.careers_url}
                  target="_blank"
                  rel="noreferrer"
                  className="px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold hover:bg-slate-800 transition-colors flex items-center gap-1.5 shadow-sm"
                >
                  <span>Visit Careers Portal</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
