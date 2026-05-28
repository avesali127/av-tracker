import { useState, useEffect, useCallback, useRef } from "react";
import { BarChart, Bar, LineChart, Line, ComposedChart, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, PieChart, Pie, Cell } from "recharts";

const BK = "#111111", RED = "#E8001D", GREEN = "#00A878", BLUE = "#1A3C8F";
const GREY = "#6B7280", LGREY = "#F4F6F9", BORDER = "#E2E8F0", WHITE = "#ffffff";
const ORANGE = "#F59E0B", PURPLE = "#7C3AED";
const PIE_COLORS = [BK, BLUE, GREEN, PURPLE, ORANGE, RED];

const INITIAL_POSITIONS = [
  { id: 1, name: "Barrick Mining", ticker: "GOLD", avgPrice: 43.784, currentPrice: 41.68, qty: 76, currency: "USD", market: "24H", alertHigh: 44.00, alertLow: 38.00, target: 44.00, stopLoss: 38.00, notes: "Watch $44 resistance. MFI recovering." },
  { id: 2, name: "Blackstone Group", ticker: "BX", avgPrice: 117.9, currentPrice: 118.0, qty: 30, currency: "USD", market: "24H", alertHigh: 125.00, alertLow: 113.00, target: 125.00, stopLoss: 113.00, notes: "Small gain. Hold for breakout." },
  { id: 3, name: "Intel Corp", ticker: "INTC", avgPrice: 112.6, currentPrice: 123.0, qty: 11, currency: "USD", market: "24H", alertHigh: 130.00, alertLow: 115.00, target: 130.00, stopLoss: 115.00, notes: "Strong performer. Trail stop up." },
  { id: 4, name: "Prescient Therapeutics", ticker: "PTX.AX", avgPrice: 0.0905, currentPrice: 0.0780, qty: 48000, currency: "AUD", market: "ASX", alertHigh: 0.10, alertLow: 0.07, target: 0.12, stopLoss: 0.07, notes: "Speculative. High risk, small cap." },
  { id: 5, name: "SPDR Gold Shares", ticker: "GLD", avgPrice: 422.077, currentPrice: 411.8, qty: 10, currency: "USD", market: "24H", alertHigh: 430.00, alertLow: 405.00, target: 430.00, stopLoss: 405.00, notes: "Gold hedge." },
  { id: 6, name: "Wisetech Global", ticker: "WTC.AX", avgPrice: 36.69, currentPrice: 36.93, qty: 95, currency: "AUD", market: "ASX", alertHigh: 37.50, alertLow: 35.50, target: 38.00, stopLoss: 35.50, notes: "Day trade. Watch MFI." },
];

const MONTHLY = [
  { month: "Jan", profit: 420, trades: 8 },
  { month: "Feb", profit: -180, trades: 6 },
  { month: "Mar", profit: 650, trades: 11 },
  { month: "Apr", profit: -320, trades: 9 },
  { month: "May", profit: -621, trades: 14 },
];

const EMPTY_FORM = { name: "", ticker: "", avgPrice: "", currentPrice: "", qty: "", currency: "USD", market: "24H", alertHigh: "", alertLow: "", target: "", stopLoss: "", notes: "" };
const TWELVE_H = 12 * 60 * 60 * 1000;

async function fetchYahoo(ticker, endpoint = "query1") {
  try {
    const r = await fetch(`https://${endpoint}.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=5d`, { cache: "no-store" });
    if (!r.ok) throw 0;
    const d = await r.json();
    const meta = d?.chart?.result?.[0]?.meta;
    const quotes = d?.chart?.result?.[0]?.indicators?.quote?.[0];
    if (!meta?.regularMarketPrice) throw 0;
    const vol = meta.regularMarketVolume || 0;
    const avgVol = quotes?.volume ? Math.round(quotes.volume.filter(Boolean).reduce((a, b) => a + b, 0) / quotes.volume.filter(Boolean).length) : 0;
    return { price: meta.regularMarketPrice, prev: meta.previousClose, vol, avgVol, source: "Yahoo" };
  } catch { return null; }
}

async function fetchBest(ticker) {
  return await fetchYahoo(ticker, "query1") ?? await fetchYahoo(ticker, "query2");
}

function getInstitutionalSignal(data) {
  if (!data || !data.vol || !data.avgVol) return null;
  const ratio = data.vol / data.avgVol;
  const priceChange = data.prev ? ((data.price - data.prev) / data.prev * 100) : 0;
  if (ratio >= 3 && priceChange > 1.5)  return { type: "INST_BUY",  label: "🏦 Institutional BUY",  color: GREEN,  bg: "#E8F8F2", detail: `Volume ${ratio.toFixed(1)}x avg — institutions accumulating`, strength: "STRONG" };
  if (ratio >= 3 && priceChange < -1.5) return { type: "INST_SELL", label: "🏦 Institutional SELL", color: RED,    bg: "#FFF0F2", detail: `Volume ${ratio.toFixed(1)}x avg — institutions distributing`, strength: "STRONG" };
  if (ratio >= 2 && priceChange > 0.5)  return { type: "ACCUM",     label: "📈 Accumulation",       color: GREEN,  bg: "#E8F8F2", detail: `Volume ${ratio.toFixed(1)}x avg — smart money entering`, strength: "MODERATE" };
  if (ratio >= 2 && priceChange < -0.5) return { type: "DIST",      label: "📉 Distribution",       color: ORANGE, bg: "#FFF9E6", detail: `Volume ${ratio.toFixed(1)}x avg — smart money exiting`, strength: "MODERATE" };
  if (ratio >= 1.5)                     return { type: "ELEVATED",  label: "👀 Elevated Volume",    color: BLUE,   bg: "#EFF6FF", detail: `Volume ${ratio.toFixed(1)}x avg — worth watching`, strength: "WATCH" };
  if (ratio < 0.5)                      return { type: "LOW_VOL",   label: "😴 Low Volume",         color: GREY,   bg: LGREY,     detail: "Below avg volume — no institutional interest", strength: "NONE" };
  return { type: "NORMAL", label: "✅ Normal Volume", color: GREY, bg: LGREY, detail: `Volume ${ratio.toFixed(1)}x avg — typical trading`, strength: "NORMAL" };
}

function getRecommendation(pos, liveData) {
  const signal = getInstitutionalSignal(liveData);
  const pct = pos.avgPrice ? ((pos.currentPrice - pos.avgPrice) / pos.avgPrice * 100) : 0;
  const prog = pos.target && pos.stopLoss ? ((pos.currentPrice - pos.stopLoss) / (pos.target - pos.stopLoss) * 100) : 50;
  const nearStop = pos.stopLoss && pos.currentPrice <= pos.stopLoss * 1.02;
  const nearTarget = pos.target && pos.currentPrice >= pos.target * 0.98;
  if (nearStop && signal?.type === "INST_SELL") return { action: "🔴 SELL NOW", color: RED, bg: "#FFF0F2", reason: "Price near stop loss AND institutional selling detected. Exit immediately." };
  if (nearStop) return { action: "⚠️ CONSIDER SELLING", color: ORANGE, bg: "#FFF9E6", reason: "Price within 2% of stop loss. Be ready to exit." };
  if (nearTarget && signal?.type === "INST_BUY") return { action: "🎯 HOLD / TRAIL STOP", color: GREEN, bg: "#E8F8F2", reason: "Near target with institutional buying. Move stop loss up and let it run." };
  if (nearTarget) return { action: "🎯 TAKE PROFIT", color: GREEN, bg: "#E8F8F2", reason: "Price near your target. Consider taking partial or full profit." };
  if (signal?.type === "INST_BUY" && pct < 0) return { action: "💚 HOLD / ADD", color: GREEN, bg: "#E8F8F2", reason: "Institutions buying while you're in a loss. Strong recovery signal." };
  if (signal?.type === "INST_SELL" && pct > 0) return { action: "🟡 PROTECT GAINS", color: ORANGE, bg: "#FFF9E6", reason: "Institutional selling while you're in profit. Tighten stop loss." };
  if (signal?.type === "ACCUM") return { action: "💚 HOLD", color: GREEN, bg: "#E8F8F2", reason: "Smart money accumulating. Continue holding." };
  if (signal?.type === "DIST" && pct > 0) return { action: "🟡 WATCH CLOSELY", color: ORANGE, bg: "#FFF9E6", reason: "Distribution detected. Monitor for exit signal." };
  if (prog > 80) return { action: "🎯 TRAIL STOP", color: GREEN, bg: "#E8F8F2", reason: "Strong progress toward target. Move stop loss up to protect gains." };
  return { action: "✅ HOLD", color: BLUE, bg: "#EFF6FF", reason: "No major signals. Stick to your plan." };
}

const save = (k, v) => { try { sessionStorage.setItem(k, JSON.stringify(v)); } catch {} };
const load = (k) => { try { const r = sessionStorage.getItem(k); return r ? JSON.parse(r) : null; } catch { return null; } };

export default function AVTracker() {
  const [positions, setPositions] = useState(() => load("av_pos") ?? INITIAL_POSITIONS);
  const [liveData, setLiveData] = useState({});
  const [activeTab, setActiveTab] = useState("dashboard");
  const [showAdd, setShowAdd] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [expandedId, setExpandedId] = useState(null);
  const [confirmRemove, setConfirmRemove] = useState(null);
  const [fetchState, setFetchState] = useState("idle");
  const [lastUpdated, setLastUpdated] = useState(null);
  const [nextRefresh, setNextRefresh] = useState(null);
  const posRef = useRef(positions);
  posRef.current = positions;

  const refreshPrices = useCallback(async (force = false) => {
    if (!force) {
      const cached = load("av_cache");
      if (cached && Date.now() - cached.ts < TWELVE_H) {
        setLiveData(cached.data);
        setLastUpdated({ time: new Date(cached.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }), cached: true });
        setNextRefresh(new Date(cached.ts + TWELVE_H).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
        setFetchState("done");
        return;
      }
    }
    setFetchState("fetching");
    const results = {};
    await Promise.all(posRef.current.map(async pos => {
      const d = await fetchBest(pos.ticker);
      if (d) results[pos.ticker] = d;
    }));
    if (Object.keys(results).length > 0) {
      const now = Date.now();
      save("av_cache", { ts: now, data: results });
      setPositions(prev => {
        const updated = prev.map(p => results[p.ticker] ? { ...p, currentPrice: results[p.ticker].price } : p);
        save("av_pos", updated);
        return updated;
      });
      setLiveData(results);
      setLastUpdated({ time: new Date(now).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }), cached: false });
      setNextRefresh(new Date(now + TWELVE_H).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
      setFetchState("done");
    } else {
      setFetchState("error");
    }
  }, []);

  useEffect(() => {
    refreshPrices(false);
    const t = setInterval(() => { const c = load("av_cache"); if (!c || Date.now() - c.ts >= TWELVE_H) refreshPrices(false); }, 60000);
    return () => clearInterval(t);
  }, []);

  const pnl = p => (p.currentPrice - p.avgPrice) * p.qty;
  const pnlPct = p => ((p.currentPrice - p.avgPrice) / p.avgPrice * 100);
  const totalPnL = positions.reduce((s, p) => s + pnl(p), 0);
  const winners = positions.filter(p => pnl(p) > 0).length;
  const winRate = positions.length ? Math.round((winners / positions.length) * 100) : 0;
  const totalVal = positions.reduce((s, p) => s + p.currentPrice * p.qty, 0);
  const sym = p => p.currency === "AUD" ? "A$" : "$";

  const savePos = (updated) => { setPositions(updated); save("av_pos", updated); };
  const openEdit = pos => { setForm({ ...pos, avgPrice: String(pos.avgPrice), currentPrice: String(pos.currentPrice), qty: String(pos.qty), alertHigh: String(pos.alertHigh || ""), alertLow: String(pos.alertLow || ""), target: String(pos.target || ""), stopLoss: String(pos.stopLoss || ""), notes: pos.notes || "" }); setEditId(pos.id); setShowAdd(true); };
  const saveForm = () => {
    const p = { ...form, avgPrice: parseFloat(form.avgPrice), currentPrice: parseFloat(form.currentPrice || form.avgPrice), qty: parseInt(form.qty), alertHigh: parseFloat(form.alertHigh) || null, alertLow: parseFloat(form.alertLow) || null, target: parseFloat(form.target) || null, stopLoss: parseFloat(form.stopLoss) || null };
    if (!p.name || !p.ticker || isNaN(p.avgPrice) || isNaN(p.qty)) return;
    const updated = editId ? positions.map(pos => pos.id === editId ? { ...pos, ...p } : pos) : [...positions, { ...p, id: Date.now() }];
    savePos(updated); setForm(EMPTY_FORM); setShowAdd(false); setEditId(null);
    setTimeout(() => refreshPrices(true), 400);
  };
  const removePos = id => { savePos(positions.filter(p => p.id !== id)); setConfirmRemove(null); };
  const progToTarget = pos => { if (!pos.target || !pos.stopLoss) return 50; return Math.min(100, Math.max(0, ((pos.currentPrice - pos.stopLoss) / (pos.target - pos.stopLoss)) * 100)); };

  const allAlerts = positions.flatMap(pos => {
    const alerts = [];
    const d = liveData[pos.ticker];
    const signal = getInstitutionalSignal(d);
    const s = sym(pos);
    if (signal?.strength === "STRONG") alerts.push({ pos, type: "inst", signal, label: signal.label, detail: signal.detail, color: signal.color, bg: signal.bg });
    if (pos.alertHigh && pos.currentPrice >= pos.alertHigh) alerts.push({ pos, type: "price", label: `🔔 ${pos.ticker.replace(".AX","")} hit HIGH alert`, detail: `Price ${s}${pos.currentPrice.toFixed(3)} >= ${s}${pos.alertHigh}`, color: GREEN, bg: "#E8F8F2" });
    if (pos.alertLow && pos.currentPrice <= pos.alertLow) alerts.push({ pos, type: "price", label: `🔔 ${pos.ticker.replace(".AX","")} hit LOW alert`, detail: `Price ${s}${pos.currentPrice.toFixed(3)} <= ${s}${pos.alertLow}`, color: RED, bg: "#FFF0F2" });
    if (pos.stopLoss && pos.currentPrice <= pos.stopLoss * 1.02) alerts.push({ pos, type: "stop", label: `Stop ${pos.ticker.replace(".AX","")} near STOP LOSS`, detail: `Price ${s}${pos.currentPrice.toFixed(3)} stop at ${s}${pos.stopLoss}`, color: RED, bg: "#FFF0F2" });
    return alerts;
  });

  const fetchDot = fetchState === "fetching" ? ORANGE : fetchState === "done" ? GREEN : fetchState === "error" ? RED : GREY;
  const fetchLabel = fetchState === "fetching" ? "Fetching live data" : fetchState === "error" ? "Using last known prices" : lastUpdated ? `${lastUpdated.cached ? "Cached" : "Live"} ${lastUpdated.time}` : "Connecting";

  const FInput = ({ label, fkey, col }) => (
    <div style={{ gridColumn: col === 2 ? "span 2" : "span 1" }}>
      <div style={{ fontSize: 13, color: GREY, marginBottom: 6, fontWeight: 700, textTransform: "uppercase" }}>{label}</div>
      <input value={form[fkey]} onChange={e => setForm({ ...form, [fkey]: e.target.value })}
        style={{ width: "100%", background: LGREY, border: `2px solid ${BORDER}`, borderRadius: 10, padding: "12px 14px", color: BK, fontSize: 16, fontFamily: "inherit", outline: "none", boxSizing: "border-box", fontWeight: 600 }} />
    </div>
  );

  const tabs = [
    { key: "dashboard", icon: "🏠", label: "Home" },
    { key: "positions", icon: "📊", label: "Positions" },
    { key: "alerts", icon: "🔔", label: "Alerts" },
    { key: "trends", icon: "📈", label: "Trends" },
  ];

  return (
    <div style={{ minHeight: "100vh", background: WHITE, color: BK, fontFamily: "'Helvetica Neue', Arial, sans-serif", maxWidth: 480, margin: "0 auto" }}>
      <div style={{ background: WHITE, borderBottom: `3px solid ${BK}`, padding: "0 18px", position: "sticky", top: 0, zIndex: 40, boxShadow: "0 2px 12px rgba(0,0,0,.08)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 0 10px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ background: BK, color: WHITE, fontWeight: 900, fontSize: 20, width: 46, height: 46, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 4px 12px rgba(0,0,0,.25)" }}>AV</div>
            <div>
              <div style={{ fontSize: 22, fontWeight: 900, color: BK, lineHeight: 1 }}>My Trades</div>
              <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 3 }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: fetchDot, animation: fetchState === "fetching" ? "pulse 1s infinite" : "none" }} />
                <div style={{ fontSize: 11, color: GREY, fontWeight: 600 }}>{fetchLabel}</div>
              </div>
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 11, color: GREY, fontWeight: 700, textTransform: "uppercase" }}>Account Value</div>
            <div style={{ fontSize: 24, fontWeight: 900, color: BK }}>A$24,418</div>
            <div style={{ fontSize: 16, fontWeight: 900, color: totalPnL >= 0 ? GREEN : RED }}>{totalPnL >= 0 ? "+" : ""}${totalPnL.toFixed(2)}</div>
          </div>
        </div>
        {nextRefresh && (
          <div style={{ background: LGREY, borderRadius: 8, padding: "6px 12px", marginBottom: 10, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 12, color: GREY, fontWeight: 600 }}>Next refresh: <strong style={{ color: BK }}>{nextRefresh}</strong></span>
            <button onClick={() => refreshPrices(true)} disabled={fetchState === "fetching"} style={{ background: BK, color: WHITE, border: "none", borderRadius: 6, padding: "4px 12px", fontSize: 12, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>Refresh</button>
          </div>
        )}
        <div style={{ display: "flex", background: LGREY, borderRadius: 12, marginBottom: 12, overflow: "hidden" }}>
          {[{ l: "Available", v: "A$112.95", c: BK }, { l: "Positions", v: positions.length, c: BK }, { l: "Win Rate", v: `${winRate}%`, c: winRate >= 50 ? GREEN : RED }, { l: "P&L", v: `${totalPnL >= 0 ? "+" : ""}$${Math.abs(totalPnL).toFixed(0)}`, c: totalPnL >= 0 ? GREEN : RED }].map((s, i) => (
            <div key={i} style={{ flex: 1, textAlign: "center", padding: "10px 4px", borderRight: i < 3 ? `1px solid ${BORDER}` : "none" }}>
              <div style={{ fontSize: 10, color: GREY, textTransform: "uppercase", fontWeight: 700 }}>{s.l}</div>
              <div style={{ fontSize: 16, fontWeight: 900, color: s.c, marginTop: 2 }}>{s.v}</div>
            </div>
          ))}
        </div>
        <div style={{ display: "flex" }}>
          {tabs.map(t => (
            <button key={t.key} onClick={() => setActiveTab(t.key)} style={{ flex: 1, padding: "9px 2px", border: "none", cursor: "pointer", fontSize: 10, fontWeight: 800, textTransform: "uppercase", fontFamily: "inherit", background: "transparent", color: activeTab === t.key ? BK : GREY, borderBottom: activeTab === t.key ? `3px solid ${BK}` : "3px solid transparent" }}>
              <div style={{ fontSize: 16, marginBottom: 2 }}>{t.icon}</div>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ padding: "16px 14px 110px" }}>
        {activeTab === "dashboard" && (
          <div>
            {allAlerts.length > 0 && (
              <div style={{ background: "#FFF0F2", border: `2px solid ${RED}`, borderRadius: 12, padding: "14px 16px", marginBottom: 16 }}>
                <div style={{ fontSize: 16, fontWeight: 900, color: RED, marginBottom: 10 }}>🚨 {allAlerts.length} Active Alert{allAlerts.length > 1 ? "s" : ""}</div>
                {allAlerts.slice(0, 3).map((a, i) => (
                  <div key={i} style={{ background: a.bg, border: `1px solid ${a.color}33`, borderRadius: 8, padding: "8px 12px", marginBottom: 6 }}>
                    <div style={{ fontSize: 14, fontWeight: 800, color: a.color }}>{a.label}</div>
                    <div style={{ fontSize: 12, color: GREY, marginTop: 2 }}>{a.detail}</div>
                  </div>
                ))}
              </div>
            )}
            <div style={{ background: WHITE, border: `2px solid ${BORDER}`, borderRadius: 14, padding: 16, marginBottom: 14, boxShadow: "0 2px 10px rgba(0,0,0,.06)" }}>
              <div style={{ fontSize: 18, fontWeight: 900, color: BK, marginBottom: 12 }}>🏦 Institutional Signals</div>
              {positions.map(pos => {
                const d = liveData[pos.ticker];
                const signal = getInstitutionalSignal(d);
                const rec = getRecommendation(pos, d);
                const volRatio = d?.avgVol ? (d.vol / d.avgVol) : null;
                return (
                  <div key={pos.id} style={{ background: signal?.bg || LGREY, border: `1px solid ${signal?.color || BORDER}33`, borderRadius: 10, padding: "12px 14px", marginBottom: 10 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                      <div>
                        <div style={{ fontSize: 18, fontWeight: 900, color: BK }}>{pos.ticker.replace(".AX", "")}</div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: signal?.color || GREY }}>{signal?.label || "Loading"}</div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        {d?.vol ? (
                          <div>
                            <div style={{ fontSize: 11, color: GREY, fontWeight: 700, textTransform: "uppercase" }}>Volume</div>
                            <div style={{ fontSize: 16, fontWeight: 900, color: BK }}>{d.vol >= 1e6 ? `${(d.vol/1e6).toFixed(1)}M` : `${(d.vol/1e3).toFixed(0)}K`}</div>
                            {volRatio && <div style={{ fontSize: 12, fontWeight: 700, color: volRatio >= 2 ? RED : volRatio >= 1.5 ? ORANGE : GREEN }}>{volRatio.toFixed(1)}x avg</div>}
                          </div>
                        ) : <div style={{ fontSize: 12, color: GREY }}>Fetching</div>}
                      </div>
                    </div>
                    {d?.vol && d?.avgVol && (
                      <div style={{ marginBottom: 8 }}>
                        <div style={{ background: BORDER, borderRadius: 6, height: 10, overflow: "hidden" }}>
                          <div style={{ width: `${Math.min(100, (d.vol / d.avgVol) * 50)}%`, height: "100%", background: volRatio >= 2 ? RED : volRatio >= 1.5 ? ORANGE : GREEN, borderRadius: 6 }} />
                        </div>
                      </div>
                    )}
                    <div style={{ background: rec.bg, border: `1px solid ${rec.color}44`, borderRadius: 8, padding: "8px 12px" }}>
                      <div style={{ fontSize: 14, fontWeight: 900, color: rec.color }}>{rec.action}</div>
                      <div style={{ fontSize: 12, color: GREY, marginTop: 2, lineHeight: 1.4 }}>{rec.reason}</div>
                    </div>
                  </div>
                );
              })}
            </div>
            <div style={{ background: WHITE, border: `2px solid ${BORDER}`, borderRadius: 14, padding: 16, boxShadow: "0 2px 10px rgba(0,0,0,.06)" }}>
              <div style={{ fontSize: 18, fontWeight: 900, color: BK, marginBottom: 12 }}>📊 Monthly P&L</div>
              <ResponsiveContainer width="100%" height={150}>
                <BarChart data={MONTHLY} barSize={32}>
                  <CartesianGrid strokeDasharray="3 3" stroke={BORDER} vertical={false} />
                  <XAxis dataKey="month" tick={{ fill: GREY, fontSize: 13, fontWeight: 700 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: GREY, fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip />
                  <ReferenceLine y={0} stroke={BORDER} strokeWidth={2} />
                  <Bar dataKey="profit" radius={[5, 5, 0, 0]}>{MONTHLY.map((e, i) => <Cell key={i} fill={e.profit >= 0 ? GREEN : RED} />)}</Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {activeTab === "positions" && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div style={{ fontSize: 22, fontWeight: 900, color: BK }}>Positions ({positions.length})</div>
              <button onClick={() => { setForm(EMPTY_FORM); setEditId(null); setShowAdd(true); }} style={{ background: BK, color: WHITE, border: "none", borderRadius: 10, padding: "12px 22px", fontSize: 17, fontWeight: 900, cursor: "pointer", fontFamily: "inherit" }}>+ Add</button>
            </div>
            {showAdd && (
              <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", zIndex: 100, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
                <div style={{ background: WHITE, borderRadius: "20px 20px 0 0", padding: 22, width: "100%", maxWidth: 480, maxHeight: "92vh", overflowY: "auto" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                    <div style={{ fontSize: 22, fontWeight: 900 }}>{editId ? "Edit" : "New Position"}</div>
                    <button onClick={() => { setShowAdd(false); setEditId(null); }} style={{ background: LGREY, border: "none", color: GREY, fontSize: 22, cursor: "pointer", borderRadius: 8, width: 38, height: 38, display: "flex", alignItems: "center", justifyContent: "center" }}>X</button>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    <FInput label="Stock Name" fkey="name" col={2} />
                    <FInput label="Ticker" fkey="ticker" />
                    <FInput label="Quantity" fkey="qty" />
                    <FInput label="Buy Price" fkey="avgPrice" />
                    <FInput label="Current Price" fkey="currentPrice" />
                    <FInput label="Target" fkey="target" />
                    <FInput label="Stop Loss" fkey="stopLoss" />
                    <FInput label="Alert High" fkey="alertHigh" />
                    <FInput label="Alert Low" fkey="alertLow" />
                    <div>
                      <div style={{ fontSize: 13, color: GREY, marginBottom: 6, fontWeight: 700, textTransform: "uppercase" }}>Currency</div>
                      <select value={form.currency} onChange={e => setForm({ ...form, currency: e.target.value })} style={{ width: "100%", background: LGREY, border: `2px solid ${BORDER}`, borderRadius: 10, padding: "12px 14px", color: BK, fontSize: 16, fontFamily: "inherit", fontWeight: 600 }}>
                        <option>USD</option><option>AUD</option>
                      </select>
                    </div>
                    <div>
                      <div style={{ fontSize: 13, color: GREY, marginBottom: 6, fontWeight: 700, textTransform: "uppercase" }}>Market</div>
                      <select value={form.market} onChange={e => setForm({ ...form, market: e.target.value })} style={{ width: "100%", background: LGREY, border: `2px solid ${BORDER}`, borderRadius: 10, padding: "12px 14px", color: BK, fontSize: 16, fontFamily: "inherit", fontWeight: 600 }}>
                        <option value="24H">24H</option><option value="ASX">ASX</option><option value="NYSE">NYSE</option><option value="NASDAQ">NASDAQ</option>
                      </select>
                    </div>
                    <div style={{ gridColumn: "span 2" }}>
                      <div style={{ fontSize: 13, color: GREY, marginBottom: 6, fontWeight: 700, textTransform: "uppercase" }}>Notes</div>
                      <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={3} style={{ width: "100%", background: LGREY, border: `2px solid ${BORDER}`, borderRadius: 10, padding: "12px 14px", color: BK, fontSize: 15, fontFamily: "inherit", outline: "none", resize: "none", boxSizing: "border-box" }} />
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 12, marginTop: 16 }}>
                    <button onClick={saveForm} style={{ flex: 1, background: BK, color: WHITE, border: "none", borderRadius: 12, padding: 16, fontSize: 18, fontWeight: 900, cursor: "pointer", fontFamily: "inherit" }}>{editId ? "Save" : "Add"}</button>
                    <button onClick={() => { setShowAdd(false); setEditId(null); }} style={{ flex: 1, background: LGREY, color: GREY, border: "none", borderRadius: 12, padding: 16, fontSize: 18, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
                  </div>
                </div>
              </div>
            )}
            {confirmRemove && (
              <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
                <div style={{ background: WHITE, border: `3px solid ${RED}`, borderRadius: 18, padding: 28, maxWidth: 340, width: "100%", textAlign: "center" }}>
                  <div style={{ fontSize: 44, marginBottom: 10 }}>🗑️</div>
                  <div style={{ fontSize: 24, fontWeight: 900, marginBottom: 8 }}>Remove Position?</div>
                  <div style={{ fontSize: 16, color: GREY, marginBottom: 24 }}>Remove <strong>{positions.find(p => p.id === confirmRemove)?.ticker?.replace(".AX", "")}</strong>?</div>
                  <div style={{ display: "flex", gap: 12 }}>
                    <button onClick={() => removePos(confirmRemove)} style={{ flex: 1, background: RED, color: WHITE, border: "none", borderRadius: 10, padding: 14, fontSize: 17, fontWeight: 900, cursor: "pointer", fontFamily: "inherit" }}>Remove</button>
                    <button onClick={() => setConfirmRemove(null)} style={{ flex: 1, background: LGREY, color: GREY, border: "none", borderRadius: 10, padding: 14, fontSize: 17, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
                  </div>
                </div>
              </div>
            )}
            {positions.map(pos => {
              const pl = pnl(pos), pct = pnlPct(pos);
              const expanded = expandedId === pos.id;
              const prog = progToTarget(pos);
              const s = sym(pos);
              const d = liveData[pos.ticker];
              const signal = getInstitutionalSignal(d);
              const rec = getRecommendation(pos, d);
              const volRatio = d?.avgVol ? (d.vol / d.avgVol) : null;
              return (
                <div key={pos.id} style={{ background: WHITE, border: `2px solid ${pl >= 0 ? "#C6F0E0" : "#FFD6DB"}`, borderLeft: `5px solid ${pl >= 0 ? GREEN : RED}`, borderRadius: 14, marginBottom: 14, overflow: "hidden", boxShadow: "0 2px 12px rgba(0,0,0,.07)" }}>
                  <div onClick={() => setExpandedId(expanded ? null : pos.id)} style={{ padding: "16px 18px", cursor: "pointer" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
                          <span style={{ fontSize: 24, fontWeight: 900, color: BK }}>{pos.ticker.replace(".AX", "")}</span>
                          <span style={{ fontSize: 12, background: LGREY, color: BLUE, padding: "3px 8px", borderRadius: 6, fontWeight: 800 }}>{pos.market}</span>
                          {signal && signal.strength !== "NORMAL" && signal.strength !== "NONE" && (
                            <span style={{ fontSize: 11, background: signal.bg, color: signal.color, padding: "2px 8px", borderRadius: 6, fontWeight: 800 }}>{signal.label}</span>
                          )}
                        </div>
                        <div style={{ fontSize: 14, color: GREY, fontWeight: 600, marginBottom: 4 }}>{pos.name}</div>
                        <div style={{ fontSize: 16, color: BK, fontWeight: 800 }}>{pos.qty.toLocaleString()} x {s}{pos.currentPrice.toFixed(3)}</div>
                        {volRatio && <div style={{ fontSize: 13, fontWeight: 700, color: volRatio >= 2 ? RED : volRatio >= 1.5 ? ORANGE : GREY, marginTop: 2 }}>Vol: {volRatio.toFixed(1)}x avg</div>}
                      </div>
                      <div style={{ textAlign: "right", minWidth: 110 }}>
                        <div style={{ fontSize: 26, fontWeight: 900, color: pl >= 0 ? GREEN : RED, lineHeight: 1.1 }}>{pl >= 0 ? "+" : ""}{s}{Math.abs(pl).toFixed(2)}</div>
                        <div style={{ fontSize: 16, fontWeight: 800, color: pl >= 0 ? GREEN : RED }}>{pct >= 0 ? "+" : ""}{pct.toFixed(2)}%</div>
                        <div style={{ fontSize: 13, color: GREY, marginTop: 4 }}>{expanded ? "▲" : "▼"}</div>
                      </div>
                    </div>
                    <div style={{ background: rec.bg, border: `1px solid ${rec.color}33`, borderRadius: 8, padding: "6px 10px", marginTop: 8 }}>
                      <span style={{ fontSize: 13, fontWeight: 900, color: rec.color }}>{rec.action}</span>
                      <span style={{ fontSize: 12, color: GREY, marginLeft: 8 }}>{rec.reason}</span>
                    </div>
                  </div>
                  {expanded && (
                    <div style={{ borderTop: `2px solid ${BORDER}`, padding: "16px 18px", background: LGREY }}>
                      {d?.vol && (
                        <div style={{ background: signal?.bg || WHITE, border: `2px solid ${signal?.color || BORDER}33`, borderRadius: 10, padding: "12px 14px", marginBottom: 14 }}>
                          <div style={{ fontSize: 14, fontWeight: 900, color: BK, marginBottom: 8 }}>Volume Analysis</div>
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 10 }}>
                            {[{ l: "Today", v: d.vol >= 1e6 ? `${(d.vol/1e6).toFixed(1)}M` : `${(d.vol/1e3).toFixed(0)}K` }, { l: "5D Avg", v: d.avgVol >= 1e6 ? `${(d.avgVol/1e6).toFixed(1)}M` : `${(d.avgVol/1e3).toFixed(0)}K` }, { l: "Ratio", v: `${volRatio?.toFixed(1) || "-"}x` }].map((item, i) => (
                              <div key={i} style={{ background: WHITE, borderRadius: 8, padding: "8px 10px", textAlign: "center" }}>
                                <div style={{ fontSize: 10, color: GREY, textTransform: "uppercase", fontWeight: 700 }}>{item.l}</div>
                                <div style={{ fontSize: 18, fontWeight: 900, color: BK, marginTop: 2 }}>{item.v}</div>
                              </div>
                            ))}
                          </div>
                          <div style={{ fontSize: 13, color: signal?.color || GREY, fontWeight: 700 }}>{signal?.detail}</div>
                        </div>
                      )}
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 14 }}>
                        {[{ l: "Avg Price", v: `${s}${pos.avgPrice.toFixed(3)}` }, { l: "Current", v: `${s}${pos.currentPrice.toFixed(3)}` }, { l: "Value", v: `${s}${(pos.currentPrice * pos.qty).toFixed(0)}` }].map((item, i) => (
                          <div key={i} style={{ background: WHITE, borderRadius: 10, padding: "10px 12px", textAlign: "center", border: `1px solid ${BORDER}` }}>
                            <div style={{ fontSize: 11, color: GREY, textTransform: "uppercase", fontWeight: 700 }}>{item.l}</div>
                            <div style={{ fontSize: 17, color: BK, fontWeight: 900, marginTop: 3 }}>{item.v}</div>
                          </div>
                        ))}
                      </div>
                      {pos.target && pos.stopLoss && (
                        <div style={{ marginBottom: 14 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                            <span style={{ fontSize: 14, color: RED, fontWeight: 800 }}>Stop {s}{pos.stopLoss}</span>
                            <span style={{ fontSize: 13, color: GREY, fontWeight: 600 }}>{prog.toFixed(0)}% to target</span>
                            <span style={{ fontSize: 14, color: GREEN, fontWeight: 800 }}>Target {s}{pos.target}</span>
                          </div>
                          <div style={{ background: BORDER, borderRadius: 8, height: 12, overflow: "hidden" }}>
                            <div style={{ width: `${prog}%`, height: "100%", background: prog > 66 ? GREEN : prog > 33 ? BK : RED, borderRadius: 8 }} />
                          </div>
                        </div>
                      )}
                      {(pos.alertHigh || pos.alertLow) && (
                        <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
                          {pos.alertHigh && <div style={{ flex: 1, background: "#E8F8F2", border: `2px solid ${GREEN}44`, borderRadius: 10, padding: "10px 12px" }}><div style={{ fontSize: 12, color: GREEN, fontWeight: 800 }}>HIGH ALERT</div><div style={{ fontSize: 20, color: BK, fontWeight: 900 }}>{s}{pos.alertHigh}</div></div>}
                          {pos.alertLow && <div style={{ flex: 1, background: "#FFF0F2", border: `2px solid ${RED}44`, borderRadius: 10, padding: "10px 12px" }}><div style={{ fontSize: 12, color: RED, fontWeight: 800 }}>LOW ALERT</div><div style={{ fontSize: 20, color: BK, fontWeight: 900 }}>{s}{pos.alertLow}</div></div>}
                        </div>
                      )}
                      {pos.notes && (
                        <div style={{ background: "#FFFBF0", border: "2px solid #F59E0B44", borderRadius: 10, padding: "12px 14px", marginBottom: 14 }}>
                          <div style={{ fontSize: 12, color: "#B45309", fontWeight: 800, textTransform: "uppercase", marginBottom: 4 }}>Notes</div>
                          <div style={{ fontSize: 16, color: BK, lineHeight: 1.5 }}>{pos.notes}</div>
                        </div>
                      )}
                      <div style={{ display: "flex", gap: 10 }}>
                        <button onClick={() => openEdit(pos)} style={{ flex: 1, background: BK, color: WHITE, border: "none", borderRadius: 10, padding: 13, fontSize: 17, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>Edit</button>
                        <button onClick={() => setConfirmRemove(pos.id)} style={{ flex: 1, background: "#FFF0F2", color: RED, border: `2px solid ${RED}33`, borderRadius: 10, padding: 13, fontSize: 17, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>Remove</button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {activeTab === "alerts" && (
          <div>
            <div style={{ fontSize: 24, fontWeight: 900, color: BK, marginBottom: 18 }}>All Alerts</div>
            {allAlerts.length === 0 ? (
              <div style={{ background: LGREY, borderRadius: 14, padding: 30, textAlign: "center" }}>
                <div style={{ fontSize: 40, marginBottom: 10 }}>✅</div>
                <div style={{ fontSize: 20, fontWeight: 900, color: BK }}>All Clear</div>
                <div style={{ fontSize: 15, color: GREY, marginTop: 6 }}>No active alerts right now</div>
              </div>
            ) : allAlerts.map((a, i) => (
              <div key={i} style={{ background: a.bg, border: `2px solid ${a.color}44`, borderLeft: `4px solid ${a.color}`, borderRadius: 12, padding: "14px 16px", marginBottom: 12 }}>
                <div style={{ fontSize: 17, fontWeight: 900, color: a.color }}>{a.label}</div>
                <div style={{ fontSize: 14, color: GREY, marginTop: 4 }}>{a.detail}</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: BK, marginTop: 6 }}>{a.pos.ticker.replace(".AX", "")} · {sym(a.pos)}{a.pos.currentPrice.toFixed(3)}</div>
              </div>
            ))}
            <div style={{ fontSize: 20, fontWeight: 900, color: BK, marginBottom: 14, marginTop: 20 }}>Price Alert Status</div>
            {positions.map(pos => {
              const s = sym(pos);
              const toHigh = pos.alertHigh ? ((pos.alertHigh - pos.currentPrice) / pos.currentPrice * 100) : null;
              const toLow = pos.alertLow ? ((pos.currentPrice - pos.alertLow) / pos.currentPrice * 100) : null;
              return (
                <div key={pos.id} style={{ background: WHITE, border: `2px solid ${BORDER}`, borderRadius: 12, padding: "14px 16px", marginBottom: 10 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
                    <div><div style={{ fontSize: 20, fontWeight: 900, color: BK }}>{pos.ticker.replace(".AX", "")}</div><div style={{ fontSize: 13, color: GREY }}>{pos.name}</div></div>
                    <div style={{ textAlign: "right" }}><div style={{ fontSize: 11, color: GREY, fontWeight: 700, textTransform: "uppercase" }}>Price</div><div style={{ fontSize: 20, fontWeight: 900, color: BK }}>{s}{pos.currentPrice.toFixed(3)}</div></div>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    {[{ l: "High Alert", v: pos.alertHigh ? `${s}${pos.alertHigh}` : "-", sub: toHigh !== null ? `+${toHigh.toFixed(1)}% away` : "", c: GREEN, bg: "#E8F8F2" }, { l: "Low Alert", v: pos.alertLow ? `${s}${pos.alertLow}` : "-", sub: toLow !== null ? `-${toLow.toFixed(1)}% away` : "", c: RED, bg: "#FFF0F2" }, { l: "Target", v: pos.target ? `${s}${pos.target}` : "-", sub: "", c: BK, bg: LGREY }, { l: "Stop Loss", v: pos.stopLoss ? `${s}${pos.stopLoss}` : "-", sub: "", c: BK, bg: LGREY }].map((item, i) => (
                      <div key={i} style={{ background: item.bg, borderRadius: 8, padding: "10px 12px" }}>
                        <div style={{ fontSize: 12, color: item.c, fontWeight: 800, textTransform: "uppercase" }}>{item.l}</div>
                        <div style={{ fontSize: 20, fontWeight: 900, color: BK }}>{item.v}</div>
                        {item.sub && <div style={{ fontSize: 12, color: item.c, fontWeight: 700 }}>{item.sub}</div>}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {activeTab === "trends" && (
          <div>
            <div style={{ fontSize: 24, fontWeight: 900, color: BK, marginBottom: 16 }}>Trends</div>
            <div style={{ background: WHITE, border: `2px solid ${BORDER}`, borderRadius: 14, padding: "18px 14px", marginBottom: 14, boxShadow: "0 2px 10px rgba(0,0,0,.06)" }}>
              <div style={{ fontSize: 18, fontWeight: 900, color: BK, marginBottom: 14 }}>Monthly P&L</div>
              <ResponsiveContainer width="100%" height={170}>
                <BarChart data={MONTHLY} barSize={34}>
                  <CartesianGrid strokeDasharray="3 3" stroke={BORDER} vertical={false} />
                  <XAxis dataKey="month" tick={{ fill: GREY, fontSize: 13, fontWeight: 700 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: GREY, fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip />
                  <ReferenceLine y={0} stroke={BORDER} strokeWidth={2} />
                  <Bar dataKey="profit" radius={[5, 5, 0, 0]}>{MONTHLY.map((_, i) => <Cell key={i} fill={_.profit >= 0 ? GREEN : RED} />)}</Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div style={{ background: WHITE, border: `2px solid ${BORDER}`, borderRadius: 14, padding: "18px 14px", marginBottom: 14, boxShadow: "0 2px 10px rgba(0,0,0,.06)" }}>
              <div style={{ fontSize: 18, fontWeight: 900, color: BK, marginBottom: 14 }}>Cumulative P&L</div>
              <ResponsiveContainer width="100%" height={150}>
                <LineChart data={[{ m: "Jan", v: 420 }, { m: "Feb", v: 240 }, { m: "Mar", v: 890 }, { m: "Apr", v: 570 }, { m: "May", v: -51 }]}>
                  <CartesianGrid strokeDasharray="3 3" stroke={BORDER} />
                  <XAxis dataKey="m" tick={{ fill: GREY, fontSize: 13, fontWeight: 700 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: GREY, fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip />
                  <ReferenceLine y={0} stroke={RED} strokeDasharray="5 5" strokeWidth={2} />
                  <Line type="monotone" dataKey="v" stroke={BK} strokeWidth={3} dot={{ fill: BK, r: 5, strokeWidth: 0 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div style={{ background: WHITE, border: `2px solid ${BORDER}`, borderRadius: 14, padding: "18px 14px", marginBottom: 14, boxShadow: "0 2px 10px rgba(0,0,0,.06)" }}>
              <div style={{ fontSize: 18, fontWeight: 900, color: BK, marginBottom: 14 }}>Portfolio Allocation</div>
              <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                <PieChart width={130} height={130}>
                  <Pie data={positions.map(p => ({ name: p.ticker, value: Math.abs(p.currentPrice * p.qty) }))} cx={60} cy={60} innerRadius={36} outerRadius={58} dataKey="value" strokeWidth={0}>
                    {positions.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                </PieChart>
                <div style={{ flex: 1 }}>
                  {positions.map((p, i) => (
                    <div key={p.id} style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}><div style={{ width: 12, height: 12, borderRadius: 3, background: PIE_COLORS[i % PIE_COLORS.length] }} /><span style={{ fontSize: 16, fontWeight: 700, color: BK }}>{p.ticker.replace(".AX", "")}</span></div>
                      <span style={{ fontSize: 15, color: GREY, fontWeight: 700 }}>{((p.currentPrice * p.qty / totalVal) * 100).toFixed(1)}%</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div style={{ background: WHITE, border: `2px solid ${BORDER}`, borderRadius: 14, padding: 18, boxShadow: "0 2px 10px rgba(0,0,0,.06)" }}>
              <div style={{ fontSize: 18, fontWeight: 900, color: BK, marginBottom: 14 }}>2026 Summary</div>
              {[{ l: "Best Month", v: "+$650", c: GREEN, s: "March" }, { l: "Worst Month", v: "-$621", c: RED, s: "May (current)" }, { l: "Win Rate", v: `${winRate}%`, c: winRate >= 50 ? GREEN : RED, s: `${winners} of ${positions.length} positions` }, { l: "Total Open P&L", v: `${totalPnL >= 0 ? "+" : ""}$${totalPnL.toFixed(2)}`, c: totalPnL >= 0 ? GREEN : RED, s: "All positions" }].map((s, i, arr) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 0", borderBottom: i < arr.length - 1 ? `1px solid ${BORDER}` : "none" }}>
                  <div><div style={{ fontSize: 18, color: BK, fontWeight: 800 }}>{s.l}</div><div style={{ fontSize: 13, color: GREY, fontWeight: 600 }}>{s.s}</div></div>
                  <div style={{ fontSize: 26, fontWeight: 900, color: s.c }}>{s.v}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div style={{ position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)", width: "100%", maxWidth: 480, background: WHITE, borderTop: `3px solid ${BK}`, display: "flex", zIndex: 50, boxShadow: "0 -4px 20px rgba(0,0,0,.1)" }}>
        {tabs.map(item => (
          <button key={item.key} onClick={() => setActiveTab(item.key)} style={{ flex: 1, padding: "10px 4px 13px", border: "none", background: "transparent", cursor: "pointer", fontFamily: "inherit", borderTop: activeTab === item.key ? `3px solid ${BK}` : "3px solid transparent", marginTop: -3, position: "relative" }}>
            <div style={{ fontSize: 20 }}>{item.icon}</div>
            <div style={{ fontSize: 10, textTransform: "uppercase", fontWeight: 800, marginTop: 2, color: activeTab === item.key ? BK : GREY }}>{item.label}</div>
            {item.key === "alerts" && allAlerts.length > 0 && (
              <div style={{ position: "absolute", top: 8, right: "18%", background: RED, color: WHITE, borderRadius: "50%", width: 18, height: 18, fontSize: 11, fontWeight: 900, display: "flex", alignItems: "center", justifyContent: "center" }}>{allAlerts.length}</div>
            )}
          </button>
        ))}
      </div>
      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}`}</style>
    </div>
  );
}
