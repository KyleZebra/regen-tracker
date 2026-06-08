// ==========================================
// data.js - State Management & Core Helpers
// ==========================================

const APP_VERSION = '20.1 (ManPlus)';

// --- Defensive DOM Helpers ---
const safeVal = (id) => { 
    const e = document.getElementById(id); 
    return e ? e.value : null; 
};
const safeSetVal = (id, val) => { 
    const e = document.getElementById(id); 
    if (e) e.value = val; 
};
const safeText = (id, text) => { 
    const e = document.getElementById(id); 
    if (e) e.textContent = text; 
};
const safeHTML = (id, html) => { 
    const e = document.getElementById(id); 
    if (e) e.innerHTML = html; 
};
const safeDisplay = (id, display) => { 
    const e = document.getElementById(id); 
    if (e) e.style.display = display; 
};
const safeProp = (id, prop, val) => { 
    const e = document.getElementById(id); 
    if (e) e[prop] = val; 
};

// --- Global State ---
let appData = { version: APP_VERSION, cycles: [], breatheLogs: {} };
let isSandbox = false; 
let sandboxData = null;

let globalSimResults = []; 
let activeSimResult = null; 
let lastRenderDateStr = null;

let currentCleanWindow = 'all'; // 'all', 'cycle', 30, 60, 90

// --- State Getters ---
const getApp = () => {
    return isSandbox ? sandboxData : appData;
};

const getActiveCycle = () => { 
    const app = getApp(); 
    if (!app || !Array.isArray(app.cycles)) return undefined; 
    return app.cycles.find(c => c.status === 'active'); 
};

// --- String & Date Helpers ---
const escapeHTML = str => {
    if (!str) return "";
    return str.replace(/[&<>'"]/g, tag => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'}[tag]));
};

const parseLocal = (dateStr) => { 
    if (!dateStr || typeof dateStr !== 'string' || dateStr.indexOf('-') === -1) return null; 
    const parts = dateStr.split('-'); 
    return new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10)); 
};

const toIsoString = (date) => { 
    if (!date || isNaN(date.getFullYear())) return "1970-01-01";
    const y = date.getFullYear(); 
    const m = String(date.getMonth() + 1).padStart(2, '0'); 
    const d = String(date.getDate()).padStart(2, '0'); 
    return `${y}-${m}-${d}`; 
};

const addDays = (date, days) => { 
    if (!date || isNaN(date.getTime())) return new Date(); 
    const r = new Date(date); 
    r.setDate(r.getDate() + days); 
    return r; 
};

const diffDays = (d1, d2) => {
    return Math.round((d2 - d1) / (24 * 60 * 60 * 1000));
};

// --- Data Management (Database Interface) ---
function loadData() {
    const saved = localStorage.getItem('regenAppData_v6') || localStorage.getItem('regenAppData_v5');
    if (saved) {
        try { 
            let data = JSON.parse(saved); 
            if (data && typeof data === 'object') {
                if (data.version) {
					appData = data;
					appData.version = APP_VERSION; // Stellt sicher, dass die geladenen Daten immer die aktuelle Version anzeigen
					} else if (data.base) { 
                    appData = { 
                        version: 14.0, 
                        cycles: [{ id: Date.now(), status: 'active', base: data.base, logs: data.logs || {} }], 
                        breatheLogs: {} 
                    }; 
                }
                
                if (appData.cycles && Array.isArray(appData.cycles)) {
                    appData.cycles = appData.cycles.filter(c => c && c.base && c.base.start); 
                    appData.cycles.forEach(c => { 
                        if (c.base.mLevel === undefined) c.base.mLevel = 0; 
                        if (c.base.isSmall === undefined) c.base.isSmall = false; 
                        
                        if (!c.logs) c.logs = {}; 
                        Object.values(c.logs).forEach(l => {
                            if (l && typeof l === 'object') {
                                if (l.m === undefined) l.m = 0;
                                if (l.isSmall === undefined) l.isSmall = false; 
                            }
                        }); 
                        if (!c.monthlyNotes) c.monthlyNotes = {}; 
                    });
                }
            }
        } catch(e) { 
            console.error("Load error", e); 
        }
    }
    
    appData.cycles = Array.isArray(appData.cycles) ? appData.cycles : []; 
    appData.breatheLogs = appData.breatheLogs || {}; 
    const active = getActiveCycle();
    
    if (!active) {
        safeDisplay('setup-warning', 'block');
        
        if (appData.cycles.length > 0) {
            safeHTML('setup-warning', `
                <h3>Bereit für einen neuen Zyklus? 🚀</h3>
                <p>Dein letzter Zyklus ist abgeschlossen. Du findest deine Historie im Archiv.</p>
                <div style="display: flex; gap: 10px; justify-content: center; flex-wrap: wrap; margin-top: 15px;">
                    <button class="btn-tool" style="background:var(--header-bg); border:none; color:white;" onclick="switchTab('historie')">✏️ Neuen Zyklus starten</button>
                    <button class="btn-tool" onclick="document.getElementById('fileInput').click()">📂 Backup importieren</button>
                </div>
            `);
        } else {
            safeHTML('setup-warning', `
                <h3>Willkommen bei ReTrack! 👋</h3>
                <p>Lege deinen ersten Zyklus an oder lade ein bestehendes Backup.</p>
                <div style="display: flex; gap: 10px; justify-content: center; flex-wrap: wrap; margin-top: 15px;">
                    <button class="btn-tool" style="background:var(--header-bg); border:none; color:white;" onclick="switchTab('historie')">✏️ Ersten Zyklus starten</button>
                    <button class="btn-tool" onclick="document.getElementById('fileInput').click()">📂 Backup importieren</button>
                </div>
            `);
        }
        
        safeDisplay('dashboard-main', 'none'); 
        safeDisplay('base-form-card', 'block');
    } else {
        safeDisplay('setup-warning', 'none'); 
        safeDisplay('dashboard-main', 'block');
        
        if (active.base && active.base.isOpen && active.base.end) {
            const todayStr = toIsoString(new Date());
            const expectedNext = toIsoString(addDays(parseLocal(active.base.end), 1));
            
            // V14.0 FIX: Close only if today is STRICTLY GREATER than the expected next day.
            if (todayStr > expectedNext) { 
                if (!active.logs) active.logs = {}; 
                if (!active.logs[expectedNext] || active.logs[expectedNext].type !== 'ausrutscher') { 
                    active.base.isOpen = false; 
                    saveData(true); 
                } 
            }
        }
        
        // These functions will be defined in other files (ui.js / engine.js)
        if (typeof populateBaseForm === 'function') populateBaseForm(); 
        if (typeof runAllSimulations === 'function') runAllSimulations();
    }
}

function saveData(silent = false) { 
    const app = getApp();
    if (app && Array.isArray(app.cycles)) {
        app.cycles.sort((a, b) => {
            const startA = (a.base && a.base.start) ? a.base.start : "9999";
            const startB = (b.base && b.base.start) ? b.base.start : "9999";
            return startA.localeCompare(startB);
        });
    }
    
    if (!isSandbox) {
        localStorage.setItem('regenAppData_v6', JSON.stringify(appData)); 
    }
    
    if (!silent && typeof runAllSimulations === 'function') {
        runAllSimulations(); 
    }
}

function hardReset() { 
    if (isSandbox) {
        if (typeof customAlert === 'function') customAlert("Im Simulations-Modus kannst du keinen Hard-Reset durchführen.");
        return;
    }
    if (typeof customConfirm === 'function') {
        customConfirm("ACHTUNG: Möchtest du wirklich ALLE Daten unwiderruflich löschen?", () => { 
            localStorage.removeItem('regenAppData_v5'); 
            localStorage.removeItem('regenAppData_v6'); 
            window.location.reload(); 
        });
    }
}

// --- Init Event Listener ---
document.addEventListener("DOMContentLoaded", () => { 
    lastRenderDateStr = toIsoString(new Date()); 
    loadData(); 
    const t = sessionStorage.getItem('retrack_target_tab'); 
    if (t && typeof switchTab === 'function') { 
        sessionStorage.removeItem('retrack_target_tab'); 
        switchTab(t); 
    }
});

document.addEventListener("visibilitychange", () => { 
    if (document.visibilityState === 'hidden' && typeof abortBreathe === 'function' && typeof isBreatheActive !== 'undefined' && isBreatheActive) {
        abortBreathe(); 
    }
    if (document.visibilityState === 'visible' && !isSandbox) { 
        // Ensure we only reload data if we aren't in a breathe session
        if (typeof isBreatheActive === 'undefined' || !isBreatheActive) {
            const nowStr = toIsoString(new Date()); 
            if (nowStr !== lastRenderDateStr) { 
                lastRenderDateStr = nowStr; 
                loadData(); 
            }
        }
    }
});