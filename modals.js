// ==========================================
// modals.js - Popups, Forms & User Interaction
// (Benötigt Variablen/Helfer aus data.js und engine.js)
// ==========================================

// --- Basis Modal Logik ---
function closeModal(id) { 
    const m = document.getElementById(id);
    if (m) {
        m.classList.remove('active'); 
    }
}

function customAlert(msg, callback) { 
    safeText('alert-message', msg); 
    const m = document.getElementById('modal-alert');
    if (m) m.classList.add('active'); 
    
    const b = document.getElementById('alert-ok-btn'); 
    if (b) {
        b.onclick = () => { 
            closeModal('modal-alert'); 
            if (callback) callback(); 
        }; 
    }
}

let pendingConfirmAction = null; 
function customConfirm(msg, action) { 
    safeText('confirm-message', msg); 
    pendingConfirmAction = action; 
    const m = document.getElementById('modal-confirm');
    if (m) m.classList.add('active'); 
}

function executeConfirm() { 
    closeModal('modal-confirm'); 
    if (pendingConfirmAction) { 
        pendingConfirmAction(); 
        pendingConfirmAction = null; 
    } 
}

// --- Target & Budget Modals ---
function openTargetModal() { 
    let active = getActiveCycle(); 
    if (!active) return; 
    safeSetVal('target-input-date', active.targetETA || ""); 
    const m = document.getElementById('modal-target');
    if (m) m.classList.add('active'); 
}

function saveTargetETA() { 
    let active = getActiveCycle(); 
    if (!active) return; 
    
    let d = safeVal('target-input-date'); 
    if (!d) return customAlert("Bitte wähle ein Datum aus."); 
    
    active.targetETA = d; 
    closeModal('modal-target'); 
    saveData(); 
}

function clearTargetETA() { 
    let active = getActiveCycle(); 
    if (active) {
        delete active.targetETA; 
    }
    closeModal('modal-target'); 
    saveData(); 
}

window.deleteArchivedCycle = function(id) {
    customConfirm("Möchtest du diesen historischen Zyklus wirklich unwiderruflich löschen?", () => {
        const app = getApp();
        if (app && Array.isArray(app.cycles)) {
            app.cycles = app.cycles.filter(c => c.id !== id);
            saveData();
            customAlert("Zyklus erfolgreich gelöscht!");
        }
    });
};

// --- Sandbox Modals & Interaction ---
function openSandbox() {
    if (isSandbox) return; 
    const app = getApp(); 
    if (!app || !app.cycles || app.cycles.length === 0) {
        return customAlert("Du musst erst einen echten Zyklus anlegen, bevor du simulieren kannst.");
    }
    
    isSandbox = true; 
    sandboxData = JSON.parse(JSON.stringify(appData)); 
    document.body.classList.add('sandbox-mode'); 
    safeDisplay('sandbox-banner', 'block');
    
    if(typeof runAllSimulations === 'function') runAllSimulations(); 
    if(typeof switchTab === 'function') switchTab('historie'); 
}

function resetSandbox() { 
    if (!isSandbox) return; 
    sandboxData = JSON.parse(JSON.stringify(appData)); 
    clearSandboxForm(); 
    if(typeof runAllSimulations === 'function') runAllSimulations(); 
    customAlert("Labor auf realen Stand zurückgesetzt."); 
}

function clearSandboxForm() { 
    safeSetVal('sim-a-date', ''); 
    safeSetVal('sim-a-t', '1'); 
    safeSetVal('sim-a-s', '0'); 
    safeSetVal('sim-a-a', '0'); 
    safeSetVal('sim-a-m', '0'); 
    safeProp('sim-a-small', 'checked', false);
}

function closeSandbox() { 
    if (!isSandbox) return; 
    isSandbox = false; 
    sandboxData = null; 
    document.body.classList.remove('sandbox-mode'); 
    safeDisplay('sandbox-banner', 'none'); 
    clearSandboxForm(); 
    if(typeof populateBaseForm === 'function') populateBaseForm(); 
    if(typeof runAllSimulations === 'function') runAllSimulations(); 
    if(typeof switchTab === 'function') switchTab('dashboard'); 
}

// --- Historical Modal ---
let histRowCount = 0;

function openHistoricalModal() { 
    safeSetVal('hist-base-start',''); 
    safeSetVal('hist-base-end',''); 
    safeSetVal('hist-base-t',''); 
    safeProp('hist-base-small','checked', false);
    safeSetVal('hist-base-s','0'); 
    safeSetVal('hist-base-a','0'); 
    safeSetVal('hist-base-m','0'); 
    
    safeHTML('hist-logs-container',''); 
    histRowCount = 0; 
    addHistLogRow(); 
    
    const m = document.getElementById('modal-historical'); 
    if(m) m.classList.add('active'); 
}

function calcHistBaseT() { 
    const s = parseLocal(safeVal('hist-base-start'));
    const e = parseLocal(safeVal('hist-base-end')); 
    
    if (s && e && !isNaN(s.getTime()) && !isNaN(e.getTime())) {
        safeSetVal('hist-base-t', Math.max(0, diffDays(s, e)+1)); 
    } else {
        safeSetVal('hist-base-t', ""); 
    }
}

function addHistLogRow() { 
    histRowCount++; 
    const rId = `hist-row-${histRowCount}`; 
    const h = `
        <div id="${rId}" style="background:#f9f9f9; padding:15px 10px 10px; border-radius:8px; position:relative; border:1px solid #e8daef; margin-bottom:8px;">
            <span style="position:absolute; top:5px; right:10px; color:var(--danger); font-weight:bold; cursor:pointer; font-size:1.2rem; line-height:1;" onclick="document.getElementById('${rId}').remove()">&times;</span>
            
            <div class="form-group-full" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0;">
                <div style="flex:1;">
                    <label>Datum (1 Tag)</label>
                    <input type="date" class="hist-row-date" style="width:100%;">
                </div>
                <div style="margin-left:15px; padding-top:20px;">
                    <label class="checkbox-wrapper">
                        <input type="checkbox" class="hist-row-small">
                        <span>Kleiner Tag</span>
                    </label>
                </div>
            </div>
            
            <div class="form-grid" style="margin-top:10px; gap:8px;">
                <div><label>Stress</label><select class="hist-row-s"><option value="0">Kein</option><option value="1">Moderat</option><option value="2">Hoch</option></select></div>
                <div><label>Alkohol</label><select class="hist-row-a"><option value="0">Kein</option><option value="1">Moderat</option><option value="2">Hoch</option></select></div>
                <div><label>Masturbation</label><select class="hist-row-m"><option value="0">Kein</option><option value="3">Einmal</option><option value="1">Moderat</option><option value="2">Hoch</option></select></div>
            </div>
        </div>`; 
    const c = document.getElementById('hist-logs-container'); 
    if (c) c.insertAdjacentHTML('beforeend', h); 
}

function saveHistorical() {
    const s = safeVal('hist-base-start');
    const e = safeVal('hist-base-end');
    const t = parseInt(safeVal('hist-base-t'));
    const sL = parseInt(safeVal('hist-base-s')) || 0;
    const aL = parseInt(safeVal('hist-base-a')) || 0;
    const mL = parseInt(safeVal('hist-base-m')) || 0;
    const baseSmall = document.getElementById('hist-base-small')?.checked || false;
    
    if (!s || !e || isNaN(t)) return customAlert("Basisphase unvollständig."); 
    if (t < 1 || s > e) return customAlert("Ungültige Basisphase."); 
    if (t > 21) return customAlert("Basisphase > 21 Tage blockiert."); 
    if (s >= toIsoString(new Date())) return customAlert("Historische Zyklen müssen in der Vergangenheit liegen.");
    
    const app = getApp(); 
    if (!app || !Array.isArray(app.cycles)) return;
    
    if (app.cycles.some(c => c.base && c.base.start && c.base.end && s <= c.base.end && e >= c.base.start)) {
        return customAlert("Zeitraum überschneidet sich mit existierendem Zyklus.");
    }
    
    let logsToSave = {};
    let rowsValid = true;
    let overlapError = false;
    
    document.querySelectorAll('#hist-logs-container > div').forEach(row => {
        let dateEl = row.querySelector('.hist-row-date'); 
        if (!dateEl) return; 
        
        let dStr = dateEl.value;
        if (dStr) { 
            if (dStr >= toIsoString(new Date())) rowsValid = false; 
            if (dStr >= s && dStr <= e) overlapError = true; 
            
            logsToSave[dStr] = { 
                type: 'ausrutscher', 
                t: 1, 
                isSmall: row.querySelector('.hist-row-small')?.checked || false,
                s: parseInt(row.querySelector('.hist-row-s').value) || 0, 
                a: parseInt(row.querySelector('.hist-row-a').value) || 0, 
                m: parseInt(row.querySelector('.hist-row-m').value) || 0, 
                mood: 0, 
                note: "Historischer Nachtrag" 
            }; 
        }
    });
    
    if (!rowsValid) return customAlert("Rauchen-Datum darf nicht in der Zukunft liegen."); 
    if (overlapError) return customAlert("Rauchen darf sich nicht mit Basisphase überschneiden.");
    
    app.cycles.push({ 
        id: Date.now(), 
        status: 'archived', 
        base: { start: s, end: e, tDays: t, isSmall: baseSmall, sLevel: sL, aLevel: aL, mLevel: mL, isOpen: false }, 
        logs: logsToSave 
    });
    
    closeModal('modal-historical'); 
    saveData(); 
    customAlert("Historischer Zyklus ins Archiv integriert!"); 
    if(typeof switchTab === 'function') switchTab('archiv');
}

// --- Today Modals (Pause & Ausrutscher) ---
function openPauseModal() { 
    safeSetVal('modal-p-date', toIsoString(new Date())); 
    safeSetVal('modal-p-s', 0); 
    safeSetVal('modal-p-a', 0); 
    safeSetVal('modal-p-m', 0); 
    safeSetVal('modal-p-mood', 0); 
    safeSetVal('modal-p-note', ""); 
    const m = document.getElementById('modal-pause'); 
    if (m) m.classList.add('active'); 
}

function submitPause() {
    const dStr = safeVal('modal-p-date');
    const s = parseInt(safeVal('modal-p-s')) || 0;
    const a = parseInt(safeVal('modal-p-a')) || 0;
    const m = parseInt(safeVal('modal-p-m')) || 0;
    const mood = parseInt(safeVal('modal-p-mood')) || 0;
    const note = (safeVal('modal-p-note') || "").trim();
    const todayStr = toIsoString(new Date());
    
    if (!isSandbox && dStr > todayStr) return customAlert("Keine Logs in Zukunft möglich!");
    
    const active = getActiveCycle(); 
    if (!active) return customAlert("Kein aktiver Zyklus gefunden!");
    
    if (active.base && active.base.isOpen && dStr > active.base.end) {
        active.base.isOpen = false;
    }
    
    if (!active.logs) active.logs = {}; 
    active.logs[dStr] = { type: 'pause', s: s, a: a, m: m, mood: mood, note: note }; 
    
    closeModal('modal-pause'); 
    saveData();
}

function editToday() { 
    try {
        openDiaryEdit(toIsoString(new Date())); 
    } catch (e) {
        console.error("editToday Error:", e);
    }
}

function openAusrutscherModal(isPast = false) { 
    safeSetVal('modal-a-t', 1); 
    safeProp('modal-a-small', 'checked', false);
    safeSetVal('modal-a-s', 0); 
    safeSetVal('modal-a-a', 0); 
    safeSetVal('modal-a-m', 0); 
    safeSetVal('modal-a-mood', 0); 
    safeSetVal('modal-a-note', ""); 
    safeSetVal('modal-a-date', isPast ? "" : toIsoString(new Date())); 
    const modal = document.getElementById('modal-ausrutscher'); 
    if (modal) modal.classList.add('active'); 
}

function submitAusrutscher() {
    const dStr = safeVal('modal-a-date');
    const t = parseInt(safeVal('modal-a-t')) || 1;
    const isSmall = document.getElementById('modal-a-small')?.checked || false;
    const s = parseInt(safeVal('modal-a-s')) || 0;
    const a = parseInt(safeVal('modal-a-a')) || 0;
    const m = parseInt(safeVal('modal-a-m')) || 0;
    const mood = parseInt(safeVal('modal-a-mood')) || 0;
    const note = (safeVal('modal-a-note') || "").trim();
    const todayStr = toIsoString(new Date());
    
    if (!dStr) return customAlert("Datum fehlt!"); 
    if (t > 21) return customAlert("Konsumphase > 3 Wochen blockiert."); 
    if (!isSandbox && dStr > todayStr) return customAlert("Keine Logs in der Zukunft möglich!");
    
    let active = getActiveCycle(); 
    if (!active) return customAlert("Kein aktiver Zyklus gefunden!");
    
    if (activeSimResult && activeSimResult.dashState && activeSimResult.dashState.debt <= 0) {
        if (dStr > toIsoString(activeSimResult.finalEnd)) {
            active.status = 'archived';
            const newEndStr = toIsoString(addDays(parseLocal(dStr), t-1));
            const newCycle = { 
                id: Date.now(), 
                status: 'active', 
                base: { start: dStr, end: newEndStr, tDays: t, isSmall: isSmall, sLevel: s, aLevel: a, mLevel: m, isOpen: true }, 
                logs: {} 
            };
            if (mood > 0 || note !== "") {
                newCycle.logs[dStr] = { type: 'ausrutscher', t: t, isSmall: isSmall, s: s, a: a, m: m, mood: mood, note: note };
            }
            const app = getApp(); 
            if (app && Array.isArray(app.cycles)) app.cycles.push(newCycle); 
            closeModal('modal-ausrutscher'); 
            saveData(); 
            return;
        }
    }
    
    if (active.base && active.base.start && dStr >= active.base.start && dStr <= active.base.end) { 
        if (!active.base.isOpen) return customAlert("Datum liegt in bereits geschlossener Basis-Phase."); 
    }
    
    if (active.base && active.base.isOpen) {
        const expectedNext = toIsoString(addDays(parseLocal(active.base.end), 1));
        if (dStr === expectedNext) { 
            active.base.end = toIsoString(addDays(parseLocal(dStr), t-1)); 
            active.base.tDays += t; 
            
            if (!isSmall) active.base.isSmall = false; 
            
            active.base.sLevel = Math.max(active.base.sLevel || 0, s); 
            active.base.aLevel = Math.max(active.base.aLevel || 0, a); 
            active.base.mLevel = Math.max(active.base.mLevel || 0, m); 
            closeModal('modal-ausrutscher'); 
            saveData(); 
            return; 
        } else if (dStr > expectedNext) {
            active.base.isOpen = false; 
        }
    }
    
    if (!active.logs) active.logs = {}; 
    active.logs[dStr] = { type: 'ausrutscher', t: t, isSmall: isSmall, s: s, a: a, m: m, mood: mood, note: note }; 
    
    closeModal('modal-ausrutscher'); 
    saveData();
}

// --- Simulator Modals ---
function submitFutureSim() {
    const dStr = safeVal('sim-a-date');
    const t = parseInt(safeVal('sim-a-t')) || 1;
    const isSmall = document.getElementById('sim-a-small')?.checked || false;
    const s = parseInt(safeVal('sim-a-s')) || 0;
    const a = parseInt(safeVal('sim-a-a')) || 0;
    const m = parseInt(safeVal('sim-a-m')) || 0;
    const todayStr = toIsoString(new Date());
    
    if (!dStr) return customAlert("Bitte ein Datum wählen."); 
    if (t > 21) return customAlert("Maximal 21 Tage am Stück."); 
    if (dStr <= todayStr) return customAlert("Für vergangene Einträge bitte den Heute-Tab nutzen.");
    
    let active = getActiveCycle(); 
    if (!active) return customAlert("Kein aktiver Zyklus gefunden!");
    
    if (activeSimResult && activeSimResult.dashState && activeSimResult.dashState.debt <= 0) {
        if (dStr > toIsoString(activeSimResult.finalEnd)) {
            active.status = 'archived';
            const newEndStr = toIsoString(addDays(parseLocal(dStr), t-1));
            const newCycle = { 
                id: Date.now(), 
                status: 'active', 
                base: { start: dStr, end: newEndStr, tDays: t, isSmall: isSmall, sLevel: s, aLevel: a, mLevel: m, isOpen: true }, 
                logs: {} 
            };
            newCycle.logs[dStr] = { type: 'ausrutscher', t: t, isSmall: isSmall, s: s, a: a, m: m, mood: 0, note: "🔮 Zukunft", isSimulated: true };
            getApp().cycles.push(newCycle); 
            saveData(); 
            customAlert("Zukunft berechnet! Ein neuer Zyklus wurde gestartet."); 
            return;
        }
    }
    
    if (!active.logs) active.logs = {}; 
    active.logs[dStr] = { type: 'ausrutscher', t: t, isSmall: isSmall, s: s, a: a, m: m, mood: 0, note: "🔮 Zukunft", isSimulated: true }; 
    saveData(); 
    customAlert("Zukunft berechnet! Siehe Kalender.");
}

function deleteSimulation(dStr) { 
    const active = getActiveCycle(); 
    if (active && active.logs && active.logs[dStr]) { 
        delete active.logs[dStr]; 
        saveData(); 
    } 
}

// --- Diary Edit Modals ---
function openDiaryEdit(dateStr) {
    try {
        const active = getActiveCycle(); 
        if(!active || !active.base) return;

        const isBase = (dateStr >= active.base.start && dateStr <= active.base.end);
        
        const pl = parseLocal(dateStr);
        if(pl) safeHTML('edit-day-title', `✏️ Tag bearbeiten: <span style="color:var(--accent)">${pl.toLocaleDateString('de-DE')}</span>`);
        
        safeSetVal('edit-day-date', dateStr); 
        safeSetVal('edit-is-base', isBase ? "1" : "0");
        
        const log = (active.logs || {})[dateStr] || {}; 
        
        if (isBase) {
            safeSetVal('edit-day-type', 'ausrutscher');
            safeSetVal('edit-day-t', active.base.tDays || 1); 
            safeProp('edit-day-small', 'checked', active.base.isSmall || false);
            safeSetVal('edit-day-s', active.base.sLevel || 0); 
            safeSetVal('edit-day-a', active.base.aLevel || 0); 
            safeSetVal('edit-day-m', active.base.mLevel || 0);
        } else {
            safeSetVal('edit-day-type', log.type || 'pause');
            safeSetVal('edit-day-t', log.t || 1); 
            safeProp('edit-day-small', 'checked', log.isSmall || false);
            safeSetVal('edit-day-s', log.s || 0); 
            safeSetVal('edit-day-a', log.a || 0); 
            safeSetVal('edit-day-m', log.m || 0);
        }
        
        safeSetVal('edit-day-mood', log.mood || 0); 
        safeSetVal('edit-day-note', log.note || "");
        
        safeProp('edit-day-type', 'disabled', isBase); 
        safeProp('edit-day-t', 'disabled', isBase); 
        safeProp('edit-day-small', 'disabled', isBase);
        safeProp('edit-day-s', 'disabled', isBase); 
        safeProp('edit-day-a', 'disabled', isBase);
        safeProp('edit-day-m', 'disabled', isBase);
        
        toggleEditFields(); 
        const m = document.getElementById('modal-edit-day'); 
        if(m) m.classList.add('active');
    } catch(e) {
        console.error("openDiaryEdit error:", e);
    }
}

function toggleEditFields() { 
    const type = safeVal('edit-day-type'); 
    const isBase = safeVal('edit-is-base') === "1"; 
    safeDisplay('edit-t-wrapper', (type === 'ausrutscher' && !isBase) ? 'flex' : 'none'); 
}

function submitEditDay() {
    const active = getActiveCycle(); 
    if(!active) return;

    const dStr = safeVal('edit-day-date'); 
    const isBase = safeVal('edit-is-base') === "1"; 
    const mood = parseInt(safeVal('edit-day-mood')) || 0; 
    const note = (safeVal('edit-day-note') || "").trim();
    const type = safeVal('edit-day-type'); 
    const t = parseInt(safeVal('edit-day-t')) || 1; 
    const isSmall = document.getElementById('edit-day-small')?.checked || false;

    if (type === 'ausrutscher' && !isBase && t > 21) {
        customAlert("Eine initiale Konsumphase von mehr als drei Wochen überlastet die Simulation.");
        return;
    }
    
    if (!active.logs) active.logs = {};

    if (isBase) { 
        const existing = active.logs[dStr] || { type: 'ausrutscher', t: 1, isSmall: active.base.isSmall, s: active.base.sLevel, a: active.base.aLevel, m: active.base.mLevel }; 
        active.logs[dStr] = { ...existing, mood, note };
    } else {
        const s = parseInt(safeVal('edit-day-s')) || 0; 
        const a = parseInt(safeVal('edit-day-a')) || 0;
        const m = parseInt(safeVal('edit-day-m')) || 0;
        
        if (type === 'ausrutscher') { 
            active.logs[dStr] = { type: 'ausrutscher', t, isSmall, s, a, m, mood, note }; 
        } else { 
            active.logs[dStr] = { type: 'pause', s, a, m, mood, note }; 
        }
    }
    
    if (dStr === toIsoString(new Date())) sessionStorage.removeItem('bonusShown_' + dStr);

    closeModal('modal-edit-day'); 
    saveData(); 
    if(document.getElementById('diary-container')?.style.display === 'block' && typeof renderDiaryList === 'function') {
        renderDiaryList();
    }
}

function deleteEditDay() {
    const active = getActiveCycle(); 
    if(!active) return;

    const dStr = safeVal('edit-day-date');
    closeModal('modal-edit-day'); 

    if (active.base && active.base.start === dStr && getApp().cycles.length > 1) {
        let hasRealLogs = Object.keys(active.logs || {}).some(k => active.logs[k].type === 'pause' || active.logs[k].type === 'ausrutscher');
        if (!hasRealLogs) {
            customConfirm("Möchtest du diesen neu gestarteten Zyklus komplett löschen und deinen alten Zyklus aus dem Archiv zurückholen?", () => { 
                const app = getApp();
                if(app && Array.isArray(app.cycles)) app.cycles.pop(); 
                const prev = app.cycles[app.cycles.length - 1];
                if(prev) prev.status = 'active'; 
                
                if (dStr === toIsoString(new Date())) sessionStorage.removeItem('bonusShown_' + dStr);
                
                saveData(); 
                if(document.getElementById('diary-container')?.style.display === 'block' && typeof renderDiaryList === 'function') {
                    renderDiaryList();
                }
            }); 
            return;
        } else { 
            customAlert("Dieser Zyklus hat bereits weitere Einträge. Du kannst das Startdatum nicht löschen. Ändere stattdessen die Start-Parameter im 'Aktuell'-Tab."); 
            return; 
        }
    }
    
    if (active.logs && active.logs[dStr]) { 
        customConfirm("Eintrag unwiderruflich löschen?", () => { 
            delete active.logs[dStr]; 
            
            if (dStr === toIsoString(new Date())) sessionStorage.removeItem('bonusShown_' + dStr);
            
            saveData(); 
            if(document.getElementById('diary-container')?.style.display === 'block' && typeof renderDiaryList === 'function') {
                renderDiaryList();
            }
        });
    } else { 
        customAlert("An diesem Tag gibt es keinen spezifischen Eintrag zum Löschen."); 
    }
}