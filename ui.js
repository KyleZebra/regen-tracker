// ==========================================
// ui.js - User Interface, Rendering & Navigation
// ==========================================

// --- Navigation & View-Logic ---
function switchTab(tabId) {
    document.querySelectorAll('.tab-btn').forEach(b => {
        if (b.dataset.tab === tabId) {
            b.classList.add('active');
        } else {
            b.classList.remove('active');
        }
    });
    
    document.querySelectorAll('.tab-content').forEach(c => {
        if (c.id === 'tab-' + tabId) {
            c.classList.add('active');
        } else {
            c.classList.remove('active');
        }
    });
    
    updateUI();
}

function renderMemoryEcho() {
    const app = getApp();
    if (!app || !app.cycles) return;

    let candAus = [];
    let candPau = [];

    app.cycles.forEach(c => {
        if (c.logs) {
            Object.entries(c.logs).forEach(([date, log]) => {
                if (log.note && log.note.trim().length > 0) {
                    if (log.type === 'ausrutscher') candAus.push({ date, note: log.note, type: log.type });
                    else if (log.type === 'pause') candPau.push({ date, note: log.note, type: log.type });
                }
            });
        }
    });

    const echoContainer = document.getElementById('arch-echo');
    if (!echoContainer) return;

    if (candAus.length === 0 && candPau.length === 0) {
        echoContainer.style.display = 'none';
        return;
    }

    // Zufallsgenerator an den heutigen Tag koppeln
    const seed = new Date().toDateString();
    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
        hash = ((hash << 5) - hash) + seed.charCodeAt(i);
        hash |= 0;
    }
    hash = Math.abs(hash);

    let html = '<div class="outlook-title" style="color: #2c3e50; margin-bottom: 15px;">💭 Tägliches Erinnerungsecho</div>';
    html += '<div style="display:flex; flex-direction:column; gap:10px; margin-bottom: 15px;">';

    // Roter Kasten (Rauchen)
    if (candAus.length > 0) {
        const echoAus = candAus[hash % candAus.length];
        const dObj = parseLocal(echoAus.date);
        const dStr = dObj ? dObj.toLocaleDateString('de-DE', { day: '2-digit', month: 'long', year: 'numeric' }) : echoAus.date;
        html += `
        <div style="background: #fff5f5; border-left: 4px solid var(--danger); padding: 12px; border-radius: 8px;">
            <div style="font-size: 0.75rem; font-weight: 800; color: var(--danger); margin-bottom: 5px;">🔴 RAUCHEN (${dStr})</div>
            <div style="font-style: italic; color: var(--text-main); font-size: 0.9rem;">"${escapeHTML(echoAus.note)}"</div>
        </div>`;
    }

    // Grüner Kasten (Pause)
    if (candPau.length > 0) {
        const echoPau = candPau[(hash + 1) % candPau.length]; // +1 für andere Verschiebung
        const dObj = parseLocal(echoPau.date);
        const dStr = dObj ? dObj.toLocaleDateString('de-DE', { day: '2-digit', month: 'long', year: 'numeric' }) : echoPau.date;
        html += `
        <div style="background: #f0fdf4; border-left: 4px solid var(--btn-calc); padding: 12px; border-radius: 8px;">
            <div style="font-size: 0.75rem; font-weight: 800; color: var(--btn-calc); margin-bottom: 5px;">🟢 PAUSE (${dStr})</div>
            <div style="font-style: italic; color: var(--text-main); font-size: 0.9rem;">"${escapeHTML(echoPau.note)}"</div>
        </div>`;
    }

    html += '</div>';
    html += `<button class="btn-tool" style="width:100%; border: 1px solid #bdc3c7; background: #fdfdfd; font-weight: bold;" onclick="if(typeof openArchiveDiary==='function') openArchiveDiary()">📚 Gesamtes Tagebuch lesen</button>`;

    // Neutrales Styling für die Box selbst
    echoContainer.style.background = '#fcfcfc';
    echoContainer.style.borderLeft = 'none';
    echoContainer.style.padding = '15px';
    echoContainer.style.border = '1px solid #e0e0e0';

    echoContainer.innerHTML = html;
    echoContainer.style.display = 'block';
}

function toggleDiary() { 
    try {
        const d = document.getElementById('diary-container'); 
        if(!d) return;
        const isHidden = (d.style.display === 'none' || d.style.display === '');
        if (isHidden) { 
            d.style.display = 'block'; 
            if(typeof renderDiaryList === 'function') renderDiaryList(); 
        } else { 
            d.style.display = 'none'; 
        } 
    } catch (e) {
        console.error("toggleDiary error:", e);
    }
}

// --- Form Management (Aktuell-Tab) ---
function calcBaseT() { 
    const s = parseLocal(safeVal('base-start')); 
    const e = parseLocal(safeVal('base-end')); 
    
    if (s && e && !isNaN(s.getTime()) && !isNaN(e.getTime())) { 
        safeSetVal('base-t', Math.max(0, diffDays(s, e) + 1)); 
    } else { 
        safeSetVal('base-t', ""); 
    } 
}

function populateBaseForm() {
    const active = getActiveCycle(); 
    if (!active || !active.base) return;
    
    safeSetVal('base-start', active.base.start || ""); 
    safeSetVal('base-end', active.base.end || ""); 
    safeSetVal('base-t', active.base.tDays || "");
    safeProp('base-small', 'checked', active.base.isSmall || false);
    safeSetVal('base-s', active.base.sLevel || 0); 
    safeSetVal('base-a', active.base.aLevel || 0); 
    safeSetVal('base-m', active.base.mLevel || 0);
    
    // Befüllt das neue, statische Feld für den Aufschlag (Extrem-Fallback auf 0)
    let safeSurcharge = active.manualSurcharge !== undefined && active.manualSurcharge !== null ? active.manualSurcharge : 0;
    if (document.getElementById('manual-surcharge-input')) {
        safeSetVal('manual-surcharge-input', safeSurcharge);
    }
    
    let lock = active.base.isOpen;
    
    if (isSandbox) { 
        const rAct = appData.cycles.find(c => c.status === 'active'); 
        if (active.id === rAct?.id && rAct && activeSimResult && activeSimResult.dashState?.debt > 0) {
            lock = true; 
        }
    }
    
    safeProp('base-start', 'readOnly', lock); 
    safeProp('base-end', 'readOnly', lock); 
    safeProp('base-small', 'disabled', lock);
    safeProp('base-s', 'disabled', lock); 
    safeProp('base-a', 'disabled', lock); 
    safeProp('base-m', 'disabled', lock);
    
    if (active.base.isOpen) {
        safeDisplay('open-base-warning', 'block');
        safeHTML('open-base-warning', "⚠️ Initiale Konsumphase ist noch offen! Drücke auf 'Pause', um sie abzuschließen.");
    } else {
        safeDisplay('open-base-warning', 'none');
    }
}

function saveBase(force = false) {
    const s = safeVal('base-start');
    const e = safeVal('base-end');
    const t = parseInt(safeVal('base-t'));
    
    if (!s || !e || isNaN(t)) { 
        if(force) customAlert("Bitte Start und Ende eintragen."); 
        return; 
    }
    if (t < 1 || s > e) { 
        if(force) customAlert("Startdatum darf nicht nach Enddatum liegen."); 
        return; 
    }
    if (t > 21) { 
        if(typeof customAlert === 'function') customAlert("Initiale Konsumphase von mehr als 3 Wochen ist blockiert, um die Simulation zu schützen."); 
        return; 
    }
    
    let active = getActiveCycle(); 
    if (!active) { 
        active = { id: Date.now(), status: 'active', logs: {}, base: {} }; 
        getApp().cycles.push(active); 
    }
    
    if (!active.base) active.base = {}; 
    active.base.start = s; 
    active.base.end = e; 
    active.base.tDays = t;
    
    if (!active.base.isOpen) { 
        const baseSmallCheckbox = document.getElementById('base-small');
        active.base.isSmall = baseSmallCheckbox ? baseSmallCheckbox.checked : false;
        active.base.sLevel = parseInt(safeVal('base-s')) || 0; 
        active.base.aLevel = parseInt(safeVal('base-a')) || 0; 
        active.base.mLevel = parseInt(safeVal('base-m')) || 0; 
    }
    
    if (active.base.isOpen === undefined) active.base.isOpen = false;
    
    if (force) saveData();
}

function populateMonthlyNote() {
    const active = getActiveCycle();
    if (!active) return;
    const today = new Date();
    const mKey = toIsoString(today).substring(0, 7);
    const monthName = today.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });
    
    safeHTML('monthly-notes-title', `📝 Gedanken zum Monat: ${monthName}`);
    
    if (active.monthlyNotes && active.monthlyNotes[mKey]) {
        // Fallback auf alte "erk"-Daten, falls vorhanden, für einen nahtlosen Übergang
        const val = active.monthlyNotes[mKey].note !== undefined ? active.monthlyNotes[mKey].note : (active.monthlyNotes[mKey].erk || "");
        safeSetVal('current-month-note', val);
    } else {
        safeSetVal('current-month-note', "");
    }
}

function saveCurrentMonthlyNote(btn) {
    const active = getActiveCycle();
    if (!active) return;
    if (!active.monthlyNotes) active.monthlyNotes = {};
    
    const today = new Date();
    const mKey = toIsoString(today).substring(0, 7);
    const noteVal = (safeVal('current-month-note') || "").trim();
    
    if (!active.monthlyNotes[mKey]) active.monthlyNotes[mKey] = {};
    active.monthlyNotes[mKey].note = noteVal;
    
    saveData(true); 
    
    const msg = document.getElementById('monthly-note-saved-msg');
    if (msg) {
        msg.style.display = 'inline-block';
        setTimeout(() => msg.style.display = 'none', 2000);
    }
}

function saveManualSurcharge() {
    const active = getActiveCycle();
    if (!active) return;
    
    let val = parseInt(safeVal('manual-surcharge-input')) || 0;
    if (val < 0) val = 0; 
    
    active.manualSurcharge = val;
    
    // FIX V20.2: "true" (silent mode) entfernt. 
    // saveData() stößt nun die Engine-Simulation (runAllSimulations) an, 
    // welche am Ende wiederum ganz automatisch updateUI() aufruft!
    saveData(); 
}

// --- Main Update Entry ---
function updateUI() {
    safeText('app-version-display', APP_VERSION); // Schreibt die Version ins HTML-Span
	const active = getActiveCycle();
    safeDisplay('dashboard-main', active ? 'block' : 'none');
    safeDisplay('setup-warning', active ? 'none' : 'block');
    
    // FIX V19.10: Notiz-Feld im Aktuell-Tab verstecken, wenn kein Zyklus aktiv ist
    safeDisplay('monthly-notes-card', active ? 'block' : 'none');
    
    if (active) { 
        populateBaseForm(); 
        if (typeof populateMonthlyNote === 'function') populateMonthlyNote(); // FIX V19.9: Befüllt das Notizfeld
        try { if(typeof renderDashboard === 'function') renderDashboard(); } catch(e) { console.error("Render Dashboard Error", e); }
        try { if(typeof renderHistorie === 'function') renderHistorie(); } catch(e) { console.error("Render Historie Error", e); }
    }
    try { if(typeof renderArchiv === 'function') renderArchiv(); } catch(e) { console.error("Render Archiv Error", e); }
    try { if(typeof renderSandboxManager === 'function') renderSandboxManager(); } catch(e) { /* Optional */ }
}

// --- Dashboard & Vorschau ---
function renderDashboard() {
    const res = activeSimResult; 
    const activeCycle = getActiveCycle();
    
    if(!res || !res.dashState || !activeCycle || res.failed) {
        safeText('dash-status-badge', "Warte auf Startdatum...");
        safeProp('dash-status-badge', 'className', 'status-badge status-open');
        safeText('dash-sub', "Bitte trage im 'Aktuell'-Tab deine initiale Phase ein.");
        safeText('dash-percent', "-");
        safeText('dash-days-left', "Start ausstehend");
        safeText('dash-target-date', "Ziel: Unbekannt");
       safeDisplay('dash-progress', 'none');
        safeDisplay('dash-budget-box', 'none');
        safeDisplay('dash-outlook', 'none');
        safeDisplay('dash-echo-badge', 'none'); // FIX: Exakte ID getroffen
        return;
    }
    
    const ds = res.dashState; 
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    safeText('dash-today-date', "Heute: " + new Date().toLocaleDateString('de-DE', options));
    
    let displayDebt = ds.debt || 0;
    let progress = displayDebt > 0 && ds.totalDebtEver > 0 ? Math.max(0, Math.min(100, 100 - (displayDebt / ds.totalDebtEver * 100))) : 100;
    
    const ring = document.getElementById('dash-ring'); 
    if(ring) { 
        ring.setAttribute('stroke-dasharray', `${progress}, 100`); 
        ring.classList.remove('regen', 'bewaehrung', 'nirvana', 'nirvana-deep', 'nirvana-gold', 'nirvana-obsidian', 'open'); 
    }
    
    const pTxt = document.getElementById('dash-percent'); 
    if(pTxt) { 
        pTxt.textContent = Math.round(progress) + '%'; 
        // FIX: Wir löschen alle spezifischen Klassen hart, da die Variable hier noch nicht existiert
        pTxt.classList.remove('nirvana', 'nirvana-deep', 'nirvana-gold', 'nirvana-obsidian'); 
    }
    
    safeProp('dash-streak', 'className', 'streak-badge');
    
    // FIX V24: Dynamische Anzeige für offene Echo-Ladungen
    const dashEcho = document.getElementById('dash-echo-badge');
    if (res.hasNirvanaEcho) {
        if (ds.activeReboundCharges > 0) {
            safeHTML('dash-echo-badge', `🌠 Super-Pause bereit! (${ds.activeReboundCharges}/2 Ladungen)`);
            if (dashEcho) {
                dashEcho.style.display = 'inline-block';
                dashEcho.style.fontWeight = '800';
                dashEcho.style.border = '2px solid #8e44ad';
            }
        } else {
            safeHTML('dash-echo-badge', `🌠 Nirwana-Echo für Zyklus entsperrt`);
            if (dashEcho) {
                dashEcho.style.display = 'inline-block';
                dashEcho.style.fontWeight = 'normal';
                dashEcho.style.border = '1px solid #d2b4de';
            }
        }
    } else {
        safeDisplay('dash-echo-badge', 'none');
    }

    if (ds.totalDebtEver > 0 && displayDebt > 0 && !res.isOpen) {
        let g = Math.round((ds.totalDebtEver - displayDebt) * 10) / 10;
        let tStr = Math.round(ds.totalDebtEver * 10) / 10;
        safeText('dash-progress', `Tag ${Number.isInteger(g) ? g : g.toFixed(1).replace('.',',')} von ${Number.isInteger(tStr) ? tStr : tStr.toFixed(1).replace('.',',')} geschafft`); 
        safeDisplay('dash-progress', 'inline-block');
    } else {
        safeDisplay('dash-progress', 'none'); 
    }

    let fDebt = Number.isInteger(Math.round(displayDebt * 10) / 10) ? Math.round(displayDebt * 10) / 10 : (Math.round(displayDebt * 10) / 10).toFixed(1).replace('.', ',');

    if (res.isOpen) {
        safeProp('dash-status-badge', 'className', 'status-badge status-open'); 
        safeText('dash-status-badge', "Konsumphase Aktiv");
        if(ring) {
            ring.classList.add('open');
            ring.setAttribute('stroke-dasharray', `100, 100`); 
        }
        safeText('dash-percent', res.history.t.length); 
        safeText('dash-ring-label', "TAG");
        safeText('dash-days-left', "Initiale Phase"); 
        safeText('dash-target-date', "Wartet auf Pause...");
        safeText('dash-sub', "Jeder Tag erhöht deine Basis-Schuld."); 
        safeDisplay('dash-streak', 'none');
    } else if (displayDebt <= 0) {
        let isNirvanaEstablished = res.nirvanaStreak > 0;
        
        if (!isNirvanaEstablished && !ds.pendingNirvana) {
            // Phase 1: Tag X (Abend) - Schulden getilgt, Nirwana startet morgen
            safeProp('dash-status-badge', 'className', 'status-badge status-regen'); 
            safeText('dash-status-badge', "Regeneration 100%");
            if(ring) { 
                ring.classList.remove('bewaehrung', 'nirvana');
                ring.classList.add('regen'); 
                ring.setAttribute('stroke-dasharray', `100, 100`); 
            }
            if(pTxt) { pTxt.classList.remove('nirvana'); pTxt.textContent = '100%'; }
            safeText('dash-percent', "100%"); 
            safeText('dash-ring-label', "ABGESCHLOSSEN");
            safeText('dash-days-left', `Schulden: 0 Tage`); 
            safeText('dash-target-date', `Ziel erreicht!`);
            safeText('dash-sub', "Fantastisch! Ab morgen beginnst du mit deiner blauen Nirwana-Streak."); 
            safeDisplay('dash-streak', 'none');

        } else if (!isNirvanaEstablished && ds.pendingNirvana) {
            // Phase 2: Tag X+1 (Morgen) - Erster echter Tag auf 0, wartet aufs Loggen
            safeProp('dash-status-badge', 'className', 'status-badge status-regen'); 
            safeText('dash-status-badge', "Nirwana bereit");
            if(ring) { 
                ring.classList.remove('bewaehrung', 'nirvana');
                ring.classList.add('regen'); 
                ring.setAttribute('stroke-dasharray', `100, 100`); 
            }
            if(pTxt) { pTxt.classList.remove('nirvana'); pTxt.textContent = '100%'; }
            safeText('dash-percent', "100%"); 
            safeText('dash-ring-label', "STARTBEREIT");
            safeText('dash-days-left', `Schulden: 0 Tage`); 
            safeText('dash-target-date', `Ziel erreicht!`);
            safeText('dash-sub', "Logge den heutigen Tag, um das blaue Nirwana feierlich zu betreten!"); 
            safeDisplay('dash-streak', 'none');

        } else {
            // Phase 3 & 4: Etabliertes Nirwana (Ab Tag X+1 abends und alle Folgetage)
            // Engmaschiges Netz nach Nutzerwunsch
            let miles = [7, 14, 21, 28, 30, 35, 42, 49, 56, 60, 63, 70, 77, 84, 90, 120, 150, 180, 210, 240, 270, 300, 330, 365, 730, 1095, 1460, 1825, 9999];
            
            // FIX V18.7: Meilenstein-Erkennung am exakten Tag
            let isMilestoneDay = miles.includes(res.nirvanaStreak) && res.nirvanaStreak > 0;
            
            let nextM = miles.find(m => res.nirvanaStreak < m) || 9999;
            let prevM = [...miles].reverse().find(m => res.nirvanaStreak >= m) || 0;
            
            // Wenn heute der Meilenstein erreicht wurde, frieren wir das Ziel ein (Ring bleibt 100% voll)
            if (isMilestoneDay) {
                nextM = res.nirvanaStreak;
                prevM = [...miles].reverse().find(m => m < res.nirvanaStreak) || 0;
            }
            
            // --- Farbevolution Logik ---
            let nirvanaClass = 'nirvana';
            if (res.nirvanaStreak >= 365) nirvanaClass = 'nirvana-obsidian';
            else if (res.nirvanaStreak >= 90) nirvanaClass = 'nirvana-gold';
            else if (res.nirvanaStreak >= 30) nirvanaClass = 'nirvana-deep';
            
            let nirvanaProgress = nextM !== 9999 ? ((res.nirvanaStreak - prevM) / (nextM - prevM)) * 100 : 100;
            if (nirvanaProgress > 100) nirvanaProgress = 100;
            
            let s = res.nirvanaStreak;
            let mStr = "";
            if (s >= 30) { 
                let mo = Math.floor(s/30); 
                let w = Math.floor((s%30)/7); 
                let d = (s%30)%7; 
                let p = []; 
                p.push(`${mo} Monat${mo!==1?'e':''}`); 
                if(w>0) p.push(`${w} Woche${w!==1?'n':''}`); 
                if(d>0) p.push(`${d} Tag${d!==1?'e':''}`); 
                mStr = p.join(', '); 
            } else if (s >= 7) { 
                let w = Math.floor(s/7); 
                let d = s%7; 
                let p = []; 
                p.push(`${w} Woche${w!==1?'n':''}`); 
                if(d>0) p.push(`${d} Tag${d!==1?'e':''}`); 
                mStr = p.join(', '); 
            } else { 
                mStr = `${s} Tag${s!==1?'e':''}`; 
            }

            // Automatisches Konfetti (Nur am Abend des erreichten Tages)
            if (isMilestoneDay && !isSandbox && !ds.pendingNirvana) {
                setTimeout(() => {
                    const mKey = 'milestone_celebration_' + res.nirvanaStreak;
                    if (!sessionStorage.getItem(mKey) && typeof confetti === 'function') {
                        confetti({
                            particleCount: 200,
                            spread: 120,
                            origin: { y: 0.4 },
                            colors: ['#f1c40f', '#f39c12', '#2ecc71', '#3498db'],
                            zIndex: 9999
                        });
                        sessionStorage.setItem(mKey, 'true');
                    }
                }, 400);
            }
            
            let ringLabelText = isMilestoneDay ? "ERREICHT" : "ZUM ZIEL";
            let nextGoalText = isMilestoneDay ? "🎉 Meilenstein erreicht!" : `Nächstes Ziel: ${nextM} Tage`;
            
            if (ds.pendingNirvana) {
                // Phase 4: Morgen im Nirwana (Wartet auf Log)
                safeProp('dash-status-badge', 'className', 'status-badge status-done'); 
                safeText('dash-status-badge', "Logge deinen Tag");
                if(ring) { 
                    ring.classList.add(nirvanaClass); 
                    ring.setAttribute('stroke-dasharray', `${nirvanaProgress}, 100`); 
                    ring.style.filter = "none"; // Alten, fehlerhaften Filter vom Kreis löschen
                    
                    // FIX V18.9: Den weichen Schatten auf das übergeordnete SVG anwenden, damit er nicht abgeschnitten wird!
                    let svgParent = ring.closest('svg');
                    if (svgParent) {
                        if (isMilestoneDay) svgParent.style.filter = "drop-shadow(0px 0px 6px rgba(241, 196, 15, 0.9))";
                        else svgParent.style.filter = "none";
                    }
                }
                if(pTxt) pTxt.classList.add(nirvanaClass); 
                safeText('dash-percent', Math.round(nirvanaProgress) + '%'); 
                safeText('dash-ring-label', ringLabelText);
                safeText('dash-days-left', nextGoalText); 
                safeText('dash-target-date', `Bisher: ${mStr}`);
                safeText('dash-sub', "Bestätige den heutigen Tag als clean, um deine Streak zu erhöhen!"); 
                safeDisplay('dash-streak', 'inline-block'); 
                const sb = document.getElementById('dash-streak'); 
                if(sb) { 
                    sb.classList.add('nirvana'); 
                    sb.textContent = `💎 ${res.nirvanaStreak} Tage Clean-Streak`; 
                }
            } else {
                // Phase 3: Abend im Nirwana (Geloggt)
                safeProp('dash-status-badge', 'className', 'status-badge status-done'); 
                safeText('dash-status-badge', isMilestoneDay ? "Meilenstein!" : "Nirwana Level-Up");
                if(ring) { 
                    ring.classList.add(nirvanaClass); 
                    ring.setAttribute('stroke-dasharray', `${nirvanaProgress}, 100`); 
                    ring.style.filter = "none"; // Alten, fehlerhaften Filter vom Kreis löschen
                    
                    // FIX V18.9: Den weichen Schatten auf das übergeordnete SVG anwenden, damit er nicht abgeschnitten wird!
                    let svgParent = ring.closest('svg');
                    if (svgParent) {
                        if (isMilestoneDay) svgParent.style.filter = "drop-shadow(0px 0px 6px rgba(241, 196, 15, 0.9))";
                        else svgParent.style.filter = "none";
                    }
                }
                if(pTxt) pTxt.classList.add(nirvanaClass); 
                safeText('dash-percent', Math.round(nirvanaProgress) + '%'); 
                safeText('dash-ring-label', ringLabelText);
                safeText('dash-days-left', nextGoalText); 
                safeText('dash-target-date', `Bisher: ${mStr}`);
                safeText('dash-sub', isSandbox ? "Du bist in der Simulation clean." : (isMilestoneDay ? "Du hast ein großes Ziel erreicht. Genieße den Moment!" : "Regeneration abgeschlossen."));
                safeDisplay('dash-streak', 'inline-block'); 
                const sb = document.getElementById('dash-streak'); 
                if(sb) { 
                    sb.classList.add('nirvana'); 
                    sb.textContent = `💎 ${res.nirvanaStreak} Tage Clean-Streak`; 
                }
            }
        }
    } else if (ds.pendingBonus) {
        safeProp('dash-status-badge', 'className', 'status-badge status-bewaehrung'); 
        safeText('dash-status-badge', "🎁 Bonus bereit!");
        if(ring) ring.classList.add('bewaehrung'); 
        safeText('dash-ring-label', "BEWÄHRUNG");
        safeText('dash-days-left', `Schulden: ${fDebt} Tage`); 
        safeText('dash-target-date', `Ziel: ${res.finalEnd.toLocaleDateString('de-DE')}`);
        safeText('dash-sub', "Logge den heutigen Tag als Pause, um die Belohnung einzulösen!"); 
        safeDisplay('dash-streak', 'none');
    } else if (ds.state === 'BEWAEHRUNG') {
        safeProp('dash-status-badge', 'className', 'status-badge status-bewaehrung'); 
        safeText('dash-status-badge', "Bewährungsphase");
        if(ring) ring.classList.add('bewaehrung'); 
        safeText('dash-ring-label', "REGENERATION");
        safeText('dash-days-left', `Schulden: ${fDebt} Tage`); 
        safeText('dash-target-date', `Ziel: ${res.finalEnd.toLocaleDateString('de-DE')}`);
        safeText('dash-sub', `Regeneration: 0,5x. Halte noch ${ds.bewTimer} Tag(e) durch für den Bonus!`); 
        safeDisplay('dash-streak', 'none');
    } else {
        safeProp('dash-status-badge', 'className', 'status-badge status-regen'); 
        safeText('dash-status-badge', "Tiefe Regeneration");
        if(ring) ring.classList.add('regen'); 
        safeText('dash-ring-label', "REGENERATION");
        safeText('dash-days-left', `Schulden: ${fDebt} Tage`); 
        safeText('dash-target-date', `Ziel: ${res.finalEnd.toLocaleDateString('de-DE')}`);
        
        // FIX V24: Dynamischer Subtext für die Regenerationsgeschwindigkeit
        if (res.hasNirvanaEcho && ds.activeReboundCharges > 0) {
            safeText('dash-sub', `🌠 Du regenerierst durch das Echo mit 2,0x Geschwindigkeit!`);
        } else {
            safeText('dash-sub', "Du regenerierst mit 1,0x Geschwindigkeit."); 
        }
        
        safeDisplay('dash-streak', 'none');
    }

    if (!isSandbox && !res.isOpen) {
        safeDisplay('dash-budget-box', 'block');
        
        if (activeCycle.targetETA) {
            safeDisplay('budget-content-active', 'block'); 
            safeDisplay('budget-content-empty', 'none');
            
            const tD = parseLocal(activeCycle.targetETA);
            if (tD) {
                safeText('budget-target-date', tD.toLocaleDateString('de-DE'));
                
                let bRes = { budget: 0, over: false };
                if (typeof calculateBudget === 'function') {
                    bRes = calculateBudget(activeCycle.targetETA);
                }
                const box = document.getElementById('dash-budget-box');
                const amt = document.getElementById('budget-amount');
                const sub = document.getElementById('budget-subtext');
                
                if (bRes.over) {
                    if (box) { box.style.borderColor = 'var(--danger)'; box.style.backgroundColor = '#fff5f5'; }
                    if (amt) { amt.style.color = 'var(--danger)'; amt.textContent = `-${Math.abs(bRes.budget)}`; }
                    if (sub) { sub.style.color = 'var(--danger)'; sub.textContent = "Tage im Verzug (Ziel gerissen)"; }
                } else {
                    if (box) { box.style.borderColor = '#9b59b6'; box.style.backgroundColor = '#fdfafb'; }
                    if (amt) { amt.style.color = '#2c3e50'; amt.textContent = bRes.budget >= 50 ? "50+" : bRes.budget; }
                    if (sub) { sub.style.color = '#7f8c8d'; sub.textContent = "Verfügbare T-Tage (Standard)"; }
                }
            }
        } else { 
            safeDisplay('budget-content-active', 'none'); 
            safeDisplay('budget-content-empty', 'block'); 
            const box = document.getElementById('dash-budget-box'); 
            if (box) { 
                box.style.borderColor = '#9b59b6'; 
                box.style.backgroundColor = '#fdfafb'; 
            } 
        }
    } else {
        safeDisplay('dash-budget-box', 'none');
    }

    // FIX V31: Anzeige für den Ausgleich des letzten Konsums
    const compBox = document.getElementById('dash-compensation-box');
    if (!isSandbox && !res.isOpen && ds.lastEventAdded !== undefined) {
        let regenSince = ds.lastEventPeakDebt - displayDebt;
        let balance = regenSince - ds.lastEventAdded;
        
        let dObj = parseLocal(ds.lastEventDateStr);
        let dateLabel = dObj ? dObj.toLocaleDateString('de-DE', {day: '2-digit', month: '2-digit'}) : ds.lastEventDateStr;
        let fmt = v => Number.isInteger(Math.round(v*10)/10) ? Math.round(v*10)/10 : (Math.round(v*10)/10).toFixed(1).replace('.', ',');
        
        if (balance >= 0) {
            let surplusText = balance > 0 ? ` (+ ${fmt(balance)}Tage Altschuld)` : '';
            safeHTML('dash-compensation-box', `
                <div class="outlook-title" style="color: #27ae60;">✅ Ausgleich abgeschlossen!</div>
                <div style="font-size: 0.85rem; color: #555;">
                    Die <strong>${fmt(ds.lastEventAdded)} Tage Schuld</strong> vom letzten Rauchtag (${dateLabel}) sind komplett abgearbeitet${surplusText}.
                </div>
            `);
            if (compBox) { compBox.style.display = 'block'; compBox.style.borderColor = '#c3e6cb'; compBox.style.background = '#f0fdf4'; }
        } else {
            safeHTML('dash-compensation-box', `
                <div class="outlook-title" style="color: #e74c3c;">⏳ Ausgleich in Arbeit...</div>
                <div style="font-size: 0.85rem; color: #555;">
                    Vom letzten Rauchtag (${dateLabel}) sind noch <strong>${fmt(Math.abs(balance))} von ${fmt(ds.lastEventAdded)} Tagen</strong> Schuld offen.
                </div>
            `);
            if (compBox) { compBox.style.display = 'block'; compBox.style.borderColor = '#f5c6cb'; compBox.style.background = '#fff5f5'; }
        }
    } else {
        if (compBox) compBox.style.display = 'none';
    }

    const todayStr = toIsoString(new Date());
    const isLoggedToday = activeCycle.logs && activeCycle.logs[todayStr] && activeCycle.logs[todayStr].type !== undefined;
    
    if (!isSandbox && !isLoggedToday && !res.isOpen && displayDebt > 0 && typeof simulateCycle === 'function') {
        let cloneA = JSON.parse(JSON.stringify(activeCycle)); 
        if(!cloneA.logs) cloneA.logs = {}; 
        cloneA.logs[todayStr] = { type: 'pause', s:0, a:0, m:0, mood:0, note:'Phantom', isSimulated: true }; 
        let resA = simulateCycle(cloneA);

        let cloneB = JSON.parse(JSON.stringify(activeCycle)); 
        if(!cloneB.logs) cloneB.logs = {}; 
        cloneB.logs[todayStr] = { type: 'ausrutscher', t:1, isSmall: false, s:0, a:0, m:0, mood:0, note:'Phantom', isSimulated: true }; 
        let resB = simulateCycle(cloneB);

        if (resA && !resA.failed && resB && !resB.failed && resA.dashState && resB.dashState) {
            let dA = Math.round(resA.dashState.debt * 10) / 10;
            let dB = Math.round(resB.dashState.debt * 10) / 10;
            
            let strA = Number.isInteger(dA) ? dA : dA.toFixed(1).replace('.', ',');
            let strB = Number.isInteger(dB) ? dB : dB.toFixed(1).replace('.', ',');
            
            // FIX V26.2: Doppelte Absicherung für den Text-Boost
            let pauseLabel = (res.hasNirvanaEcho && ds.activeReboundCharges > 0) ? "🟢 Bei Pause <span style='color:#8e44ad;font-size:0.8rem;'>(🌠 -2.0 Boost)</span>:" : "🟢 Bei Pause:";
            
            safeHTML('dash-outlook', `
                <div class="outlook-title">📊 Tagesausblick für heute</div>
                <div class="outlook-row good">
                    <span class="outlook-label">${pauseLabel}</span>
                    <span class="outlook-value">Schuld sinkt auf ${strA} (Ziel: ${resA.finalEnd.toLocaleDateString('de-DE')})</span>
                </div>
                <div class="outlook-row bad">
                    <span class="outlook-label">🔴 Bei Rauchen:</span>
                    <span class="outlook-value">Schuld steigt auf ${strB} (Ziel: ${resB.finalEnd.toLocaleDateString('de-DE')})</span>
                </div>
            `);
            safeDisplay('dash-outlook', 'block');
        } else {
            safeDisplay('dash-outlook', 'none');
        }
        
    // --- NEU: Der statische Ausblick für das Nirwana ---
    } else if (!isSandbox && !isLoggedToday && !res.isOpen && displayDebt <= 0) {
        safeHTML('dash-outlook', `
            <div class="outlook-title">📊 Tagesausblick für heute</div>
            <div class="outlook-row good">
                <span class="outlook-label">🟢 Bei Pause:</span>
                <span class="outlook-value">Dein Nirwana-Streak wächst weiter!</span>
            </div>
            <div class="outlook-row bad">
                <span class="outlook-label">🔴 Bei Rauchen:</span>
                <span class="outlook-value">Startet neuen Zyklus (Min. 3 Tage Schuld)</span>
            </div>
        `);
        safeDisplay('dash-outlook', 'block');
        
    // --- NEU: Dynamischer Ausblick für die offene Initialphase ---
    } else if (!isSandbox && !isLoggedToday && res.isOpen && typeof simulateCycle === 'function') {
        
        // Klon A: Du pausierst heute -> Phase wird geschlossen
        let cloneA = JSON.parse(JSON.stringify(activeCycle));
        if(!cloneA.logs) cloneA.logs = {};
        cloneA.logs[todayStr] = { type: 'pause', s:0, a:0, m:0, mood:0, note:'Phantom', isSimulated: true };
        cloneA.base.isOpen = false; 
        let resA = simulateCycle(cloneA);

        // Klon B: Du rauchst heute -> Phase wird um 1 Tag verlängert
        let cloneB = JSON.parse(JSON.stringify(activeCycle));
        cloneB.base.end = todayStr;
        cloneB.base.tDays += 1;
        let resB = simulateCycle(cloneB);

        if (resA && !resA.failed && resB && !resB.failed && resA.dashState) {
            let dA = Math.round(resA.dashState.debt * 10) / 10;
            let strA = Number.isInteger(dA) ? dA : dA.toFixed(1).replace('.', ',');

            safeHTML('dash-outlook', `
                <div class="outlook-title">📊 Tagesausblick für heute</div>
                <div class="outlook-row good">
                    <span class="outlook-label">🟢 Bei Pause:</span>
                    <span class="outlook-value">Phase beendet! Start-Schuld: ${strA} Tage</span>
                </div>
                <div class="outlook-row bad">
                    <span class="outlook-label">🔴 Bei Rauchen:</span>
                    <span class="outlook-value">Phase verlängert sich auf Tag ${resB.history.t.length}</span>
                </div>
            `);
            safeDisplay('dash-outlook', 'block');
        } else {
            safeDisplay('dash-outlook', 'none');
        }

    } else {
        safeDisplay('dash-outlook', 'none');
    }

    if (isLoggedToday && !isSandbox) { 
        safeDisplay('daily-action-area', 'none'); 
        safeDisplay('daily-done-area', 'block'); 
    } else { 
        safeDisplay('daily-action-area', 'block'); 
        safeDisplay('daily-done-area', 'none'); 
    }
    
    if (!isSandbox && ds.gotBonusToday && typeof triggerBonusConfetti === 'function') {
        triggerBonusConfetti();
    }
}

function renderHistorie() {
    const res = activeSimResult; 
    
    // FIX V26: Visueller Error-Monitor statt stillem Ausblenden!
    if(!res || res.failed) { 
        safeDisplay('historie-output', 'block'); 
        safeDisplay('export-card', 'none'); // Versteckt nur den Kalender
        safeHTML('bilanz-container', `
            <div style="background:#fadbd8; color:#c0392b; padding:15px; border-radius:8px; margin-top:15px; font-weight:bold; border-left: 4px solid #c0392b;">
                🚨 Engine-Blockade: ${res ? res.errorMessage : 'Simulation konnte nicht gestartet werden. Bitte prüfe das Start- und Enddatum!'}
            </div>
        `);
        return; 
    }
    
    const active = getActiveCycle(); 
    safeDisplay('historie-output', 'block');
    safeDisplay('export-card', 'block');
    
    const totalT = res.totalTDaysEver || 0; 
    const totalRegenDebt = res.totalDebtEver || 0; 
    const expectedBaseDebt = res.expectedBaseDebt || 0;
    const manualS = res.manualSurcharge || 0;
    const systemAufschlag = totalRegenDebt - expectedBaseDebt - manualS;
    
    // FIX V26.4: Berechnung der kleinen und großen Tage für den aktuellen Zyklus
    let currentSmallSmoked = 0;
    let currentActiveDaysLeft = 0;
    let currentActiveIsSmall = false;

    let currentSmokedDatesStr = [...res.history.t, ...res.history.a].map(d => toIsoString(d)).sort();
    currentSmokedDatesStr.forEach(dStr => {
        let isBase = (active.base && active.base.start && dStr >= active.base.start && dStr <= active.base.end);
        if (isBase) {
            if (active.base.isSmall) currentSmallSmoked++;
        } else {
            let log = (active.logs || {})[dStr];
            if (currentActiveDaysLeft > 0) {
                if (currentActiveIsSmall) currentSmallSmoked++;
                currentActiveDaysLeft--;
            } else if (log && log.type === 'ausrutscher') {
                currentActiveIsSmall = log.isSmall === true;
                currentActiveDaysLeft = (log.t || 1) - 1;
                if (currentActiveIsSmall) currentSmallSmoked++;
            }
        }
    });
    let currentLargeSmoked = totalT - currentSmallSmoked;
    
    // FIX V26.4: Aufsplittung der Bilanz in 7 Felder (Gesamtschuld spannt über 2 Spalten)
    let html = `
    <div style="margin-top:0.5rem; font-weight:bold; color:#2c3e50; margin-bottom: 10px;">📊 Gesamtbilanz dieses Zyklus</div>
    <div class="stat-grid" style="margin-bottom: 1rem; grid-template-columns: 1fr 1fr;">
        <div class="stat-box" style="padding: 10px;"><div class="stat-val" style="font-size: 1.4rem;">${totalT}</div><div class="stat-label" style="font-size: 0.65rem;">T-Tage</div></div>
        <div class="stat-box" style="padding: 10px;"><div class="stat-val" style="font-size: 1.4rem;">${expectedBaseDebt}</div><div class="stat-label" style="font-size: 0.65rem;">Basis Schuld</div></div>
        <div class="stat-box" style="padding: 10px;"><div class="stat-val" style="font-size: 1.4rem; color: #e67e22;">${currentSmallSmoked}</div><div class="stat-label" style="font-size: 0.65rem;">Davon Klein</div></div>
        <div class="stat-box" style="padding: 10px;"><div class="stat-val" style="font-size: 1.4rem; color: #c0392b;">${currentLargeSmoked}</div><div class="stat-label" style="font-size: 0.65rem;">Davon Groß</div></div>
        <div class="stat-box" style="padding: 10px;"><div class="stat-val danger" style="font-size: 1.4rem; color: var(--danger);">+${systemAufschlag}</div><div class="stat-label" style="font-size: 0.65rem;">System-Strafe</div></div>
        <div class="stat-box" style="padding: 10px;"><div class="stat-val" style="font-size: 1.4rem; color: #8e44ad;">+${manualS}</div><div class="stat-label" style="font-size: 0.65rem;">Manuell</div></div>
        <div class="stat-box" style="padding: 10px; grid-column: span 2;"><div class="stat-val blue" style="font-size: 1.4rem; color: var(--nirvana-blue);">${totalRegenDebt}</div><div class="stat-label" style="font-size: 0.65rem;">Gesamtschuld</div></div>
    </div>`;
    
    // --- NEU: Schatten-Rechner für das Regen-o-Meter ---
    if (!res.isOpen && active && active.base && active.base.end) {
        let regenM = 0;
        let regenA = 0;
        
        // 1. Startwerte anhand der Basisphase ermitteln
        let baseEnd = parseLocal(active.base.end);
        let baseStart = parseLocal(active.base.start);
        let baseDays = diffDays(baseStart, baseEnd) + 1;
        
        regenM = baseDays * 2; 
        
        // Typ-Sicherheit & Neues Strafmaß für die Startphase
            let baseAlk = parseInt(active.base.aLevel) || 0;
            if (baseAlk === 1) regenA = 2; // Moderat
            else if (baseAlk === 2) regenA = 5; // Hoch (Erhöht auf 5)
        
        // 2. Kalender vom Tag nach der Basisphase bis heute durchblättern
        let simDate = addDays(baseEnd, 1);
        let todayDate = new Date();
        todayDate.setHours(0,0,0,0);
        
        while (simDate <= todayDate) {
            let dStr = toIsoString(simDate);
            
            // Täglicher Abbau (Becher leert sich)
            let mDecayed = false;
            if (regenM > 0) { 
                regenM--; 
                mDecayed = true; 
            }
            if (regenA > 0) regenA--;
            
            // Heutigen Log auf Strafen prüfen (Becher füllt sich)
            let log = (active.logs || {})[dStr];
            if (log && log.type !== undefined && !log.isSimulated) {
                // FIX: Typ-Sicherheit (Strings in echte Zahlen umwandeln)
                let mVal = parseInt(log.m) || 0;
                let aVal = parseInt(log.a) || 0;

                // Der +1 Trick ist hier bereits eingerechnet!
                if (mVal === 1) regenM += 2;
                else if (mVal === 2) regenM += 3;
                else if (mVal === 3 && mDecayed) regenM += 1; // Der Gefrier-Effekt
                
                if (aVal === 1) regenA += 3;
                else if (aVal === 2) regenA += 5; // NEU: Starker Alk erhöht um 5 Tage!
            }
            
            simDate = addDays(simDate, 1);
        }

        // 3. Regen-o-Meter HTML anfügen (Ersetzt die alte Anzeige)
        let colorM = regenM === 0 ? '#155724' : '#721c24';
        let colorA = regenA === 0 ? '#155724' : '#721c24';
        let bgM = regenM === 0 ? '#d4edda' : '#fadbd8';
        let bgA = regenA === 0 ? '#d4edda' : '#fadbd8';
        let borderM = regenM === 0 ? '#c3e6cb' : '#f5c6cb';
        let borderA = regenA === 0 ? '#c3e6cb' : '#f5c6cb';

        html += `
        <div style="margin-top: 15px; padding: 15px; background: #fff; border: 1px solid #e0e0e0; border-radius: 12px; box-shadow: var(--shadow);">
            <div style="font-weight: 800; font-size: 1.1rem; color: #2c3e50; margin-bottom: 5px; text-align: center;">💧 Regen-o-Meter</div>
            <div style="font-size: 0.8rem; color: #7f8c8d; text-align: center; margin-bottom: 15px;">Kurzzeit-Regeneration (Empfohlene Pause)</div>
            <div class="stat-grid" style="margin-bottom: 0;">
                <div class="stat-box" style="background: ${bgM}; border-color: ${borderM}; padding: 10px;">
                    <div class="stat-val" style="color: ${colorM}; font-size: 1.4rem;">${regenM} <span style="font-size:0.8rem;">${regenM === 1 ? 'Tag' : 'Tage'}</span></div>
                    <div class="stat-label" style="color: ${colorM}; font-size: 0.7rem;">Dopamin (M)</div>
                </div>
                <div class="stat-box" style="background: ${bgA}; border-color: ${borderA}; padding: 10px;">
                    <div class="stat-val" style="color: ${colorA}; font-size: 1.4rem;">${regenA} <span style="font-size:0.8rem;">${regenA === 1 ? 'Tag' : 'Tage'}</span></div>
                    <div class="stat-label" style="color: ${colorA}; font-size: 0.7rem;">Detox (Alk)</div>
                </div>
            </div>
        </div>
        `;
    }
    
    safeHTML('bilanz-container', html);

    const allDates = [...res.history.t, ...res.history.a, ...res.history.b, ...res.history.r, ...res.history.n]; 
    if (allDates.length === 0) return;
    
    const minDate = new Date(Math.min(...allDates.map(d => d.getTime())));
    let rawMaxDate = new Date(Math.max(...allDates.map(d => d.getTime())));
    
    if (active && active.targetETA) { 
        const targetObj = parseLocal(active.targetETA); 
        if (targetObj > rawMaxDate) rawMaxDate = targetObj; 
    }
    
    let current = new Date(minDate.getFullYear(), minDate.getMonth(), 1);
    const realEnd = new Date(rawMaxDate.getFullYear(), rawMaxDate.getMonth() + 1, 0);
    const todayStr = new Date().toDateString(); 
    const targetStrCheck = (active && active.targetETA) ? parseLocal(active.targetETA)?.toDateString() : null;

    let calHtml = "<table><thead><tr><th>Mo</th><th>Di</th><th>Mi</th><th>Do</th><th>Fr</th><th>Sa</th><th>So</th></tr></thead><tbody><tr>";
    
    let startDay = current.getDay() === 0 ? 6 : current.getDay() - 1;
    for (let i = 0; i < startDay; i++) {
        calHtml += "<td></td>";
    }

    while (current <= realEnd) {
      const dStr = current.toDateString(); 
      const isoDStr = toIsoString(current); 
      let log = (active.logs || {})[isoDStr];
      let tagClass = "";
      let tagText = ""; 
      let isTodayClass = (dStr === todayStr) ? "today-highlight" : "";

      if (res.history.t.some(d => d.toDateString() === dStr)) { 
          if (active && active.base && active.base.isSmall) {
              tagClass = "tday-small"; tagText="1. Konsum (Kl.)"; 
          } else {
              tagClass = "tday"; tagText="1. Konsum"; 
          }
      } else if (res.history.a.some(d => d.toDateString() === dStr)) { 
          if (log && log.isSmall) {
              tagClass = "ausrutscher-small"; tagText="Rauchen (Kl.)"; 
          } else {
              tagClass = "ausrutscher"; tagText="weiteres Rauchen"; 
          }
      } else if (res.history.b.some(d => d.toDateString() === dStr)) {
          tagClass = "bewaehrung"; tagText="Bewährung"; 
      } else if (res.history.r.some(d => d.toDateString() === dStr)) { 
          tagClass = "regen"; tagText="Regen."; 
      } else if (res.history.n.some(d => d.toDateString() === dStr)) { 
          tagClass = "nirvana"; tagText="Nirwana"; 
      }
      
      if (log && log.note) {
          tagText += (tagText ? " " : "") + "📝";
      }
      
      if (targetStrCheck && dStr === targetStrCheck) { 
          tagText += (tagText ? " " : "") + "🏁 Ziel"; 
          tagClass += " target-flag"; 
      }

      // V13.1 Kalender-Bonus Rendering
      if (res.history.bonusDict && res.history.bonusDict[isoDStr]) {
          tagText += (tagText ? " " : "") + "🎁 Bonus";
          tagClass += " bonus-drop";
      }

      calHtml += `<td class="active-month ${isTodayClass}"><span class="date-num">${current.getDate()}.</span>${tagText ? `<span class="tag ${tagClass}">${tagText.trim()}</span>` : ''}</td>`;
      
      if (current.getDay() === 0 && current < realEnd) {
          calHtml += "</tr><tr>"; 
      }
      current.setDate(current.getDate() + 1);
    }
    
    if (current.getDay() !== 1) { 
        let endPad = current.getDay() === 0 ? 0 : 8 - current.getDay(); 
        for (let i=0; i<endPad; i++) {
            calHtml += "<td></td>"; 
        }
    }
    calHtml += "</tr></tbody></table>"; 
    safeHTML("calendar", calHtml);
}

function renderDiaryList() {
    try {
        const active = getActiveCycle(); 
        if(!active || !active.base || !active.base.start) return;
        
        let curr = parseLocal(active.base.start); 
        if(!curr || isNaN(curr.getTime())) return;

        const todayStr = toIsoString(new Date());
        let endStr = isSandbox ? (activeSimResult && activeSimResult.finalEnd ? toIsoString(activeSimResult.finalEnd) : todayStr) : todayStr;
        
        const moodEmojis = ["", "😞", "🙁", "😐", "🙂", "🤩"]; 
        const sLevels = ['Kein', 'Moderat', 'Hoch']; 
        const aLevels = ['Kein', 'Moderat', 'Hoch']; 
        const mLevels = ['Kein', 'Moderat', 'Hoch', 'Einmal'];
        let items = [];

        while (toIsoString(curr) <= endStr) {
            let dStr = toIsoString(curr); 
            let log = (active.logs || {})[dStr]; 
            let isBaseDay = (dStr >= active.base.start && dStr <= active.base.end);
            let formattedDate = curr.toLocaleDateString('de-DE', {weekday: 'short', day: '2-digit', month: '2-digit'}); 
            let monthYear = curr.toLocaleDateString('de-DE', {month: 'long', year: 'numeric'});
            let mKey = `${curr.getFullYear()}-${String(curr.getMonth()+1).padStart(2,'0')}`;
            
            const app = getApp();
            let brLog = app.breatheLogs ? app.breatheLogs[dStr] : null;
            let breatheCount = 0;
            if (typeof brLog === 'number') breatheCount = brLog;
            else if (brLog && typeof brLog === 'object') breatheCount = brLog.count || 0;
            
            if (isBaseDay) { 
                items.push({dStr, formattedDate, monthYear, mKey, log: log || {}, isImplicit: false, isBase: true, breatheCount}); 
                if (log && log.type === 'ausrutscher' && log.t > 1) { curr.setDate(curr.getDate() + log.t - 1); }
            } else if (log) { 
                items.push({dStr, formattedDate, monthYear, mKey, log, isImplicit: false, isBase: false, breatheCount}); 
                if (log.type === 'ausrutscher' && log.t > 1) { curr.setDate(curr.getDate() + log.t - 1); } 
            } else if (dStr <= todayStr) { 
                items.push({dStr, formattedDate, monthYear, mKey, log: null, isImplicit: true, isBase: false, breatheCount}); 
            }
            curr.setDate(curr.getDate() + 1);
        }
        
        items.reverse(); 
        let grouped = {}; 
        items.forEach(item => { 
            if(!grouped[item.mKey]) grouped[item.mKey] = { title: item.monthYear, items: [] }; 
            grouped[item.mKey].items.push(item); 
        });

        let recentMoods = items.filter(i => (!i.isImplicit || i.isBase) && i.log && i.log.mood > 0).slice(0, 7); 
        let trendHtml = "";
        if (recentMoods.length > 0) { 
            let avg = (recentMoods.reduce((sum, i) => sum + parseInt(i.log.mood), 0) / recentMoods.length).toFixed(1); 
            let trendIcon = avg >= 3.5 ? "↗️ (Positiv)" : (avg <= 2.5 ? "↘️ (Kritisch)" : "➡️ (Stabil)"); 
            trendHtml = `<div style="font-size: 0.85rem; background: #e8f6f3; color: #16a085; padding: 8px 12px; border-radius: 8px; margin-bottom: 15px; font-weight: bold; text-align: center;">📈 Stimmungstendenz (letzte Einträge): Ø ${avg} ${trendIcon}</div>`; 
        }

        let html = trendHtml; 
        let isFirst = true; 
        const h = activeSimResult?.history;

        for (let mKey in grouped) {
            let g = grouped[mKey];
            html += `<details class="diary-month-group" ${isFirst ? 'open' : ''}><summary class="diary-month-title">${g.title} <span class="diary-count">${g.items.length} Einträge</span></summary><div class="diary-month-content">`;
            
            g.items.forEach(item => {
                let badge = "", meta = "", noteStr = (item.log && item.log.note) ? `<div class="diary-note">${escapeHTML(item.log.note)}</div>` : "";
                let moodStr = (item.log && item.log.mood > 0) ? moodEmojis[item.log.mood] : "➖";
                let breatheStr = item.breatheCount > 0 ? `<span style="color:#2980b9; font-weight:900; margin-left:8px;">🧘‍♂️ ${item.breatheCount}x</span>` : "";
                
                let penaltyStr = (h && h.penaltyDict && h.penaltyDict[item.dStr]) ? `<div class="diary-meta" style="color: #c0392b; font-weight: bold; font-size: 0.75rem;">${h.penaltyDict[item.dStr]}</div>` : "";
                let bonusStr = (h && h.bonusDict && h.bonusDict[item.dStr]) ? `<div class="diary-meta" style="color: #27ae60; font-weight: bold; font-size: 0.75rem;">${h.bonusDict[item.dStr]}</div>` : "";
                let basePenalty = "";
                
                if (item.isBase) { 
                    let isLastBaseDay = item.dStr === active.base.end; 
                    let isTodayWhenOpen = active.base.isOpen && item.dStr === todayStr; 
                    if (isLastBaseDay || isTodayWhenOpen) { 
                        basePenalty = `<div class="diary-meta" style="color: #8e44ad; font-weight: bold; font-size: 0.75rem;">${activeSimResult ? activeSimResult.basePenaltyStr : ''}</div>`; 
                    } 
                }
                
                if (item.isBase) { 
                    let smallText = active.base.isSmall ? ' (Kleiner Tag)' : ' (Standardtag)';
                    badge = `<span class="diary-badge badge-base">⭐ Basis-Phase</span>`; 
                    meta = `S:${sLevels[active.base.sLevel||0]} | A:${aLevels[active.base.aLevel||0]} | M:${mLevels[active.base.mLevel||0]} | Mood: ${moodStr}${breatheStr} <span style="font-weight:bold; color:#f39c12;">${smallText}</span>`; 
                } else if (!item.isImplicit) { 
                    if (item.log.type === 'ausrutscher') {
                        let smallText = item.log.isSmall ? ' (Kleiner Tag)' : ' (Standardtag)';
                        badge = `<span class="diary-badge badge-aus">🔴 Rauchen (${item.log.t}d)</span>`; 
                        meta = `S:${sLevels[item.log.s||0]} | A:${aLevels[item.log.a||0]} | M:${mLevels[item.log.m||0]} | Mood: ${moodStr}${breatheStr} <span style="font-weight:bold; color:#c0392b;">${smallText}</span>`; 
                    } else {
                        badge = `<span class="diary-badge badge-pause">🟢 Pause</span>`; 
                        meta = `S:${sLevels[item.log.s||0]} | A:${aLevels[item.log.a||0]} | M:${mLevels[item.log.m||0]} | Mood: ${moodStr}${breatheStr}`; 
                    }
                } else { 
                    badge = `<span class="diary-badge badge-pause" style="background:#e9ecef; color:#666;">⚪ Pause (Auto)</span>`; 
                    meta = `Kein Eintrag${breatheStr}`; 
                }
                
                html += `<div class="diary-item" style="${item.isImplicit && item.breatheCount === 0 ? 'opacity: 0.7;' : ''}">
                    <div style="flex:1;"><div class="diary-date">${item.formattedDate}</div>${badge}<div class="diary-meta">${meta}</div>${basePenalty}${penaltyStr}${bonusStr}${noteStr}</div><button class="diary-edit-btn" onclick="if(typeof openDiaryEdit==='function')openDiaryEdit('${item.dStr}')">Edit</button></div>`;
            });
                        
            // FIX V19.9: Alte In-Modal Textfelder entfernt
            html += `</div></details>`; 
            isFirst = false;
        }
        safeHTML('diary-list-content', html || "<div style='text-align:center; padding: 20px; color: #7f8c8d;'>Noch keine Einträge vorhanden.</div>");
    } catch(e) {
        console.error("Diary render error", e);
    }
}

function renderArchiv() {
    const archContainer = document.getElementById('archive-container'); 
    if(!archContainer) return;
    
    const archived = (getApp().cycles || []).filter(c => c.status === 'archived'); 
    archContainer.innerHTML = "";

    const todayStr = toIsoString(new Date());
    const isPast = d => toIsoString(d) < todayStr;
    
    let pastDaysTracked = 0; 
    let maxNirvana = 0;
    let totalAusrutscher = 0; 
    let highStressAusrutscher = 0; 
    let sumAusrutscherDays = 0;
    let cyclesWithNirvana = 0; 
    let totalNirvanaDays = 0; 
    let totalMilestones = 0; 
    let highStressResilienceCount = 0; 
    let archiveMonths = {}; 
    let allPastAusrutscherDates = [];
    
    // --- NEUE ZÄHLER FÜR DAS KLICK-FENSTER ---
    let winTracked = 0;
    let winSmoked = 0;
    let winSmallSmoked = 0; // NEU
    let winPause = 0;
    let winTriple = 0;
    let win25 = 0;

    // Engmaschiges Meilenstein-Raster (Wochen, Monate, Jahre)
    const milestonesArr = [7, 14, 21, 28, 30, 35, 42, 49, 56, 60, 63, 70, 77, 84, 90, 120, 150, 180, 210, 240, 270, 300, 330, 365, 730, 1095, 1460, 1825];

    (getApp().cycles || []).forEach((cycle) => {
        const res = globalSimResults.find(r => r && r.cycleId === cycle.id); 
        if(!res || res.failed) return; 
        
        let allDays = [...res.history.t, ...res.history.a, ...res.history.b, ...res.history.r, ...res.history.n];
            let uniqueDays = [...new Set(allDays.map(d => toIsoString(d)))].filter(d => d <= todayStr).sort();

            // FIX V26.3: Tracking für mehrtägige Ausrutscher-Logs initialisieren
            let activeAusrutscherDays = 0;
            let activeIsSmall = false;

            uniqueDays.forEach(dStr => {
                let todayStr = toIsoString(new Date());

                // 1. Zukunft rigoros aussperren (Geister-Tage)
                if (dStr > todayStr) return;

                let mKey = dStr.substring(0, 7); 
                if(!archiveMonths[mKey]) archiveMonths[mKey] = { tDays:0, aDays:0, mDays:0, erk:[], dtx:[], note:[] };
                
                let isBase = (cycle.base && cycle.base.start && dStr >= cycle.base.start && dStr <= cycle.base.end);
                let log = (cycle.logs || {})[dStr] || {};
                
                // FIX V26.3: Auch Folgetage eines Ausrutschers (ohne eigenen Log) als Konsum erkennen
                let isConsumption = false;
                let isSmallConsumption = false;

                if (isBase) {
                    isConsumption = true;
                    isSmallConsumption = (cycle.base.isSmall === true);
                } else {
                    if (activeAusrutscherDays > 0) {
                        isConsumption = true;
                        isSmallConsumption = activeIsSmall;
                        activeAusrutscherDays--;
                    } else if (log.type === 'ausrutscher') {
                        isConsumption = true;
                        isSmallConsumption = (log.isSmall === true);
                        activeIsSmall = isSmallConsumption;
                        activeAusrutscherDays = (log.t || 1) - 1;
                    }
                }

                // FIX V18.6: HEUTE ignorieren, solange kein Rückfall passiert ist!
                // Ein cleander Tag gilt erst morgen als abgeschlossen und "getrackt".
                if (dStr === todayStr && !isConsumption) return;

            if(isConsumption) {
                archiveMonths[mKey].tDays++;
            }
            
            let currentAlc = parseInt(isBase ? (cycle.base.aLevel||0) : (log.a || 0)) || 0;
            let currentM = parseInt(isBase ? (cycle.base.mLevel||0) : (log.m || 0)) || 0;
            
            if(currentAlc > 0) archiveMonths[mKey].aDays++;
            if(currentM > 0) archiveMonths[mKey].mDays++;
            
            if(log.erk) archiveMonths[mKey].erk.push(log.erk);
            if(log.dtx) archiveMonths[mKey].dtx.push(log.dtx);

            // --- Synchronisierte Fenster-Logik ---
            let isInWindow = false;
            if (currentCleanWindow === 'all') {
                isInWindow = true;
            } else if (currentCleanWindow === 'cycle') {
                if (cycle.status === 'active') isInWindow = true;
            } else {
                // Da 'Heute' nun oben sauber rausgefiltert wird, können wir das Limit wieder mathematisch exakt auf 30/60/90 Tage setzen!
                const limit = toIsoString(addDays(new Date(), -currentCleanWindow));
                if (dStr >= limit) isInWindow = true;
            }


            if (isInWindow) {
                winTracked++;
                if (isConsumption) {
                    winSmoked++;
                    if (isSmallConsumption) winSmallSmoked++; // NEU
                } else {
                    winPause++;
                    if (currentAlc === 0 && currentM === 0) winTriple++;
                    if (currentAlc === 0 && (currentM === 0 || currentM === 3)) win25++;
                }
            }
        });

        if(cycle.monthlyNotes) {
            Object.keys(cycle.monthlyNotes).forEach(mKey => { 
                if(!archiveMonths[mKey]) archiveMonths[mKey] = { tDays:0, aDays:0, mDays:0, erk:[], dtx:[], note:[] }; 
                if(cycle.monthlyNotes[mKey].erk) archiveMonths[mKey].erk.push(cycle.monthlyNotes[mKey].erk); 
                if(cycle.monthlyNotes[mKey].dtx) archiveMonths[mKey].dtx.push(cycle.monthlyNotes[mKey].dtx); 
                if(cycle.monthlyNotes[mKey].note) archiveMonths[mKey].note.push(cycle.monthlyNotes[mKey].note); 
            });
        }
        
        const pastT = res.history.t.filter(isPast); 
        const pastA = res.history.a.filter(isPast);
        const pastB = res.history.b.filter(isPast); 
        const pastR = res.history.r.filter(isPast); 
        const pastN = res.history.n.filter(isPast);
        
        pastDaysTracked += (pastT.length + pastA.length + pastB.length + pastR.length + pastN.length); 

        let currentStreak = 0; 
        for (let i=0; i<pastN.length; i++) { 
            if (i===0 || diffDays(pastN[i-1], pastN[i]) === 1) {
                currentStreak++; 
            } else { 
                maxNirvana = Math.max(maxNirvana, currentStreak); 
                currentStreak = 1; 
            } 
        }
        maxNirvana = Math.max(maxNirvana, currentStreak);
        
        if ((res.nirvanaStreak || 0) > 0) { 
            cyclesWithNirvana++; 
            totalNirvanaDays += res.nirvanaStreak; 
            totalMilestones += milestonesArr.filter(m => res.nirvanaStreak >= m).length; 
        }
        
        if (cycle.base?.start && cycle.base.start < todayStr) {
            totalAusrutscher++; 
            if(cycle.base.sLevel === 2) highStressAusrutscher++;
            
            let baseD = parseLocal(cycle.base.start);
            let baseEnd = parseLocal(cycle.base.end);
            if (baseD && baseEnd) { 
                while (baseD <= baseEnd && toIsoString(baseD) < todayStr) { 
                    sumAusrutscherDays++; 
                    allPastAusrutscherDates.push(toIsoString(baseD)); 
                    baseD.setDate(baseD.getDate() + 1); 
                } 
            }
        }
        
        Object.entries(cycle.logs || {}).forEach(([dStr, log]) => {
            if (dStr >= todayStr) return; 
            if (log.type === 'pause' && log.s === 2) highStressResilienceCount++;
            if (cycle.base?.start && dStr >= cycle.base.start && dStr <= cycle.base.end) return;
            
            if (log.type === 'ausrutscher') {
                totalAusrutscher++; 
                if(log.s === 2) highStressAusrutscher++; 
                let logD = parseLocal(dStr);
                if(logD) { 
                    for(let i=0; i<log.t; i++) { 
                        let curDStr = toIsoString(logD); 
                        if (curDStr < todayStr) { 
                            sumAusrutscherDays++; 
                            allPastAusrutscherDates.push(curDStr); 
                        } 
                        logD.setDate(logD.getDate() + 1); 
                    } 
                }
            }
        });
    });

    const avgAus = totalAusrutscher > 0 ? (sumAusrutscherDays / totalAusrutscher).toFixed(1) : 0;
    let avgNirvana = cyclesWithNirvana > 0 ? Math.round(totalNirvanaDays / cyclesWithNirvana) : 0;

    // --- Die neuen synchronisierten Fenster-Werte ---
    const winQuote = winTracked > 0 ? Math.round((winPause / winTracked) * 100) : 0;
    const winRatio = winSmoked > 0 ? (winPause / winSmoked).toFixed(1).replace('.', ',') : winPause;
    
    const winLargeSmoked = winSmoked - winSmallSmoked;
    const winSlRatio = winLargeSmoked > 0 ? (winSmallSmoked / winLargeSmoked).toFixed(1).replace('.', ',') + ':1' : winSmallSmoked + ':0';

    // -- Rotierbares Stat-Grid --
    safeText('stat-clean-quote', winQuote + '%');
    safeText('stat-clean-ratio', `1:${winRatio}`);
    safeText('stat-triple-clean', winTriple); 
    safeText('stat-25-clean', win25); 
    safeText('stat-clean-days', winPause); // NEU: Tage ohne Rauchen
    safeText('stat-smoked-days', winSmoked); 
    safeText('stat-small-smoked', winSmallSmoked); 
    safeText('stat-total-days', winTracked); // FIX: Jetzt dynamisch durch Klick!
    safeText('stat-large-smoked', winLargeSmoked); // NEU
    safeText('stat-small-large-ratio', winSlRatio); // NEU
    
    // -- 4er Nirwana Grid --
    safeText('stat-max-nirvana', maxNirvana); 
    safeText('stat-total-nirvana', totalNirvanaDays); // NEU: Gesamte Nirwana Tage
    safeText('stat-avg-nirvana', avgNirvana);
    safeText('stat-total-milestones', totalMilestones);

    // --- Beschriftungen für alle Klick-Boxen synchronisieren ---
    let labelTxt = "";
    if (currentCleanWindow === 'all') labelTxt = "All-Time";
    else if (currentCleanWindow === 'cycle') labelTxt = "Zyklus";
    else labelTxt = currentCleanWindow + "d";
    
    document.querySelectorAll('.win-label').forEach(el => el.textContent = labelTxt);

    let totalBreatheSessions = 0;
    let totalBreatheMinutes = 0;
    
    if (getApp().breatheLogs) {
        Object.values(getApp().breatheLogs).forEach(log => { 
            if (typeof log === 'number') { 
                totalBreatheSessions += log; 
                totalBreatheMinutes += (log * 3); 
            } else if (log && typeof log === 'object') { 
                totalBreatheSessions += (log.count || 0); 
                totalBreatheMinutes += (log.minutes || 0); 
            } 
        });
    }
    
    safeText('stat-breathe-total', totalBreatheSessions); 
    safeText('stat-breathe-time', Math.round(totalBreatheMinutes)); 
    safeText('stat-breathe-avg-time', totalBreatheSessions > 0 ? Math.round(totalBreatheMinutes / totalBreatheSessions) : 0); 
    safeText('stat-breathe-avg', pastDaysTracked > 0 ? (totalBreatheSessions / (pastDaysTracked / 7)).toFixed(1) : 0);

    let insights = []; 
    allPastAusrutscherDates.sort();
    
    if (highStressResilienceCount > 0) {
        insights.push(`<li>🛡️ <strong>Stress-Resilienz:</strong> Du hast bereits <strong>${highStressResilienceCount} extrem stressige Tage</strong> erfolgreich ohne Konsum gemeistert.</li>`);
    }
    
    let blocks = [];
    if (allPastAusrutscherDates.length > 0) {
        let currentBlock = { start: allPastAusrutscherDates[0], end: allPastAusrutscherDates[0], count: 1 };
        for (let i = 1; i < allPastAusrutscherDates.length; i++) {
            let prevD = parseLocal(currentBlock.end);
            let currD = parseLocal(allPastAusrutscherDates[i]);
            if (diffDays(prevD, currD) === 1) { 
                currentBlock.end = allPastAusrutscherDates[i]; 
                currentBlock.count++; 
            } else if (diffDays(prevD, currD) > 1) { 
                blocks.push(currentBlock); 
                currentBlock = { start: allPastAusrutscherDates[i], end: allPastAusrutscherDates[i], count: 1 }; 
            }
        }
        blocks.push(currentBlock);
        
        if (blocks.slice(-3).length > 0 && blocks.slice(-3).every(b => b.count === 1) && blocks.length > 1) {
            insights.push(`<li>💪 <strong>Starke Impulskontrolle:</strong> Deine letzten Rückfälle waren isolierte Einzeltage.</li>`);
        }
        
        let distances = []; 
        for(let i=0; i<blocks.length-1; i++) {
            distances.push(diffDays(parseLocal(blocks[i].end), parseLocal(blocks[i+1].start)) - 1);
        }
        
        if (distances.length >= 3) {
            let avgFirst = distances.slice(0, Math.floor(distances.length/2)).reduce((a,b)=>a+b,0) / Math.floor(distances.length/2);
            let avgSecond = distances.slice(Math.floor(distances.length/2)).reduce((a,b)=>a+b,0) / Math.ceil(distances.length/2);
            if (avgSecond > avgFirst + 2) {
                insights.push(`<li>📈 <strong>Positiver Trend:</strong> Abstände zwischen Konsumphasen wachsen! (Von Ø ${Math.round(avgFirst)} auf Ø ${Math.round(avgSecond)} Tage clean).</li>`);
            }
        }
    }
    
    const monthNames = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
    let completedMonths = Object.keys(archiveMonths).filter(k => k < todayStr.substring(0, 7));
    if(completedMonths.length > 0) {
        let bestMKey = completedMonths.reduce((a, b) => archiveMonths[a].tDays < archiveMonths[b].tDays ? a : b);
        let parts = bestMKey.split('-');
        insights.push(`<li>🏆 <strong>Rekord-Monat:</strong> Dein bester abgeschlossener Monat war der <strong>${monthNames[parseInt(parts[1])-1]} ${parts[0]}</strong> mit nur ${archiveMonths[bestMKey].tDays} Konsumtagen.</li>`);
    }
    
    if (allPastAusrutscherDates.length > 0) {
        let dayCounts = [0,0,0,0,0,0,0]; 
        allPastAusrutscherDates.forEach(dStr => dayCounts[parseLocal(dStr).getDay()]++);
        let maxIndex = dayCounts.indexOf(Math.max(...dayCounts));
        if (Math.round((Math.max(...dayCounts) / allPastAusrutscherDates.length) * 100) > 20) {
            insights.push(`<li>💡 <strong>Fokus-Tipp:</strong> An einem <strong>${['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'][maxIndex]}</strong> fällt dir der Verzicht historisch am schwersten.</li>`); 
        }
    }
    
    if(insights.length > 0) {
        safeHTML('trigger-list', insights.slice(0, 4).join(""));
    } else {
        safeHTML('trigger-list', "<li>Sammle noch ein paar Tage Daten, damit dein Coach erste Trends und Erfolge für dich berechnen kann!</li>");
    }

    if (archived.length === 0) {
        archContainer.insertAdjacentHTML('beforeend', "<p style='color:#7f8c8d; text-align:center;'>Noch keine Zyklen abgeschlossen.</p>"); 
    } else {
        // --- FIX V26.6: Dynamischer Triple-Balken-Graph für die letzten 10 Zyklen ---
        let chartBars = [];
        let maxRatio = 1; // Mindest-Skalierung für Clean-Ratio
        let maxSlRatio = 1; // Mindest-Skalierung für Klein:Groß-Ratio
        let maxNirvanaChart = 1; // Mindest-Skalierung für Nirwana
        
        // Letzte 10 Zyklen isolieren (chronologisch von alt nach neu für den Graphen)
        archived.slice(-10).forEach(cycle => {
            const res = globalSimResults.find(r => r && r.cycleId === cycle.id);
            if (!res || res.failed) return;
            
            const smokedDays = res.history.t.length + res.history.a.length;
            const cleanDays = res.history.b.length + res.history.r.length + res.history.n.length;
            const ratio = smokedDays > 0 ? (cleanDays / smokedDays) : cleanDays;
            
            // Berechnung: Klein vs Groß für das Diagramm
            let cycleSmallSmoked = 0;
            let cardActiveDaysLeft = 0;
            let cardActiveIsSmall = false;

            let smokedDatesStr = [...res.history.t, ...res.history.a].map(d => toIsoString(d)).sort();
            smokedDatesStr.forEach(dStr => {
                let isBase = (cycle.base && cycle.base.start && dStr >= cycle.base.start && dStr <= cycle.base.end);
                if (isBase) {
                    if (cycle.base.isSmall) cycleSmallSmoked++;
                } else {
                    let log = (cycle.logs || {})[dStr];
                    if (cardActiveDaysLeft > 0) {
                        if (cardActiveIsSmall) cycleSmallSmoked++;
                        cardActiveDaysLeft--;
                    } else if (log && log.type === 'ausrutscher') {
                        cardActiveIsSmall = log.isSmall === true;
                        cardActiveDaysLeft = (log.t || 1) - 1;
                        if (cardActiveIsSmall) cycleSmallSmoked++;
                    }
                }
            });
            let cycleLargeSmoked = smokedDays - cycleSmallSmoked;
            let slRatio = cycleLargeSmoked > 0 ? (cycleSmallSmoked / cycleLargeSmoked) : cycleSmallSmoked;
            
            const nirvanaDays = res.history.n.length;

            if (ratio > maxRatio) maxRatio = ratio;
            if (slRatio > maxSlRatio) maxSlRatio = slRatio;
            if (nirvanaDays > maxNirvanaChart) maxNirvanaChart = nirvanaDays;
            
            // Kompatibilitätssicherer Abruf des Startdatums
            let dateLabel = (cycle.base && cycle.base.start) ? parseLocal(cycle.base.start).toLocaleDateString('de-DE', {month:'2-digit', year:'2-digit'}) : '?';
            chartBars.push({ ratio, slRatio, nirvanaDays, label: dateLabel });
        });

        if (chartBars.length > 0) {
            let barsHtml = chartBars.map(b => {
                // Grüner Balken (Clean vs. Rauchen)
                let h1 = maxRatio > 0 ? (b.ratio / maxRatio) * 100 : 0;
                let valStr1 = Number.isInteger(b.ratio) ? b.ratio : b.ratio.toFixed(1).replace('.', ',');
                
                // Violetter Balken (Klein vs. Groß)
                let h2 = maxSlRatio > 0 ? (b.slRatio / maxSlRatio) * 100 : 0;
                let valStr2 = Number.isInteger(b.slRatio) ? b.slRatio : b.slRatio.toFixed(1).replace('.', ',');

                // Blauer Balken (Nirwana)
                let h3 = maxNirvanaChart > 0 ? (b.nirvanaDays / maxNirvanaChart) * 100 : 0;
                let valStr3 = b.nirvanaDays;

                return `
                <div style="display:flex; flex-direction:column; align-items:center; flex:1; margin:0 1px;">
                    <div style="display:flex; justify-content:space-around; width:100%; font-size:0.55rem; color:#7f8c8d; margin-bottom:4px; font-weight:800; gap:1px;">
                        <span style="color:var(--btn-calc);">${valStr1}</span>
                        <span style="color:#8e44ad;">${valStr2}</span>
                        <span style="color:var(--nirvana-blue);">${valStr3}</span>
                    </div>
                    <div style="width:100%; max-width:38px; height:80px; background:transparent; display:flex; align-items:flex-end; gap:2px; justify-content:center;">
                        <div style="width:10px; height:${h1}%; background:var(--btn-calc); border-radius:3px 3px 0 0; transition: height 0.5s ease-out; box-shadow: 0 0 5px rgba(39, 174, 96, 0.3);" title="Clean : Rauchen (${valStr1}:1)"></div>
                        <div style="width:10px; height:${h2}%; background:#8e44ad; border-radius:3px 3px 0 0; transition: height 0.5s ease-out; box-shadow: 0 0 5px rgba(142, 68, 173, 0.3);" title="Klein : Groß (${valStr2}:1)"></div>
                        <div style="width:10px; height:${h3}%; background:var(--nirvana-blue); border-radius:3px 3px 0 0; transition: height 0.5s ease-out; box-shadow: 0 0 5px rgba(52, 152, 219, 0.3);" title="Nirwana Tage (${valStr3})"></div>
                    </div>
                    <div style="font-size:0.55rem; color:#95a5a6; margin-top:8px;">${b.label}</div>
                </div>`;
            }).join('');

            archContainer.insertAdjacentHTML('beforeend', `
            <div class="archive-card" style="margin-bottom: 25px; padding-bottom: 15px; border-left: none; border-top: 4px solid var(--btn-calc);">
                <div class="archive-title" style="margin-bottom: 15px; font-size: 0.95rem; color: #2c3e50; text-align: center;">📈 Verhältnis-Trends (Letzte ${chartBars.length} Zyklen)</div>
                <div style="font-size:0.65rem; color:#7f8c8d; text-align:center; margin-bottom:15px; line-height: 1.6; display:flex; flex-wrap:wrap; justify-content:center; gap:8px;">
                    <span style="color:var(--btn-calc); font-weight:bold;">🟩 Clean-Ratio</span>
                    <span style="color:#8e44ad; font-weight:bold;">🟪 Klein-Ratio</span>
                    <span style="color:var(--nirvana-blue); font-weight:bold;">🟦 Nirwana-Tage</span>
                </div>
                <div style="display:flex; align-items:flex-end; justify-content:space-around; height:120px;">
                    ${barsHtml}
                </div>
            </div>`);
        }
        // --- Ende Graph ---

        [...archived].reverse().forEach(cycle => {
            const res = globalSimResults.find(r => r && r.cycleId === cycle.id); 
            
            if(!res || res.failed) {
                const card = document.createElement('div'); 
                card.className = 'archive-card'; 
                card.style.borderLeftColor = 'var(--danger)'; 
                card.style.backgroundColor = '#fff5f5';
                card.innerHTML = `
                    <div class="archive-header">
                        <div class="archive-title" style="color:var(--danger);">⚠️ Simulation ${!res?"fehlt (null)":"abgestürzt"}</div>
                        <div style="display:flex; align-items:center; gap:10px;">
                            <button class="btn-tool" style="padding:4px 8px; border:1px solid var(--danger); color:var(--danger); min-width:auto;" onclick="if(typeof deleteArchivedCycle==='function')deleteArchivedCycle(${cycle.id})" title="Zyklus löschen">🗑️</button>
                        </div>
                    </div>
                    <div class="archive-stats" style="grid-template-columns: 1fr;">
                        <div><strong>ID:</strong> ${cycle.id} | <strong>Start:</strong> ${cycle.base?.start||'Unbekannt'} | <strong>Ende:</strong> ${cycle.base?.end||'Unbekannt'}</div>
                        <div style="color:var(--danger); font-size:0.85rem; margin-top:5px;">Dieser Zyklus wurde gespeichert, aber die Zeitachsen-Berechnung schlug fehl:<br><br>${!res?"Die Engine hat für diesen Zyklus kein Ergebnis zurückgegeben.":`<strong>${res.errorName}:</strong> ${res.errorMessage}`}</div>
                    </div>`;
                archContainer.appendChild(card); 
                return; 
            }
            
            if(!cycle.base?.start) return; 
            
            const allArchDates = [...res.history.t, ...res.history.a, ...res.history.b, ...res.history.r, ...res.history.n];
            
            // --- Mathematische Aufbereitung der exakten Zyklus-Stats ---
            const totalDays = allArchDates.length;
            const smokedDays = res.history.t.length + res.history.a.length;
            const cleanDays = res.history.b.length + res.history.r.length + res.history.n.length;
            
            // FIX V26.3: Klein vs Groß für diesen Zyklus (inkl. mehrtägiger Logs) iterieren
            let cycleSmallSmoked = 0;
            let cardActiveDaysLeft = 0;
            let cardActiveIsSmall = false;

            let smokedDatesStr = [...res.history.t, ...res.history.a].map(d => toIsoString(d)).sort();
            smokedDatesStr.forEach(dStr => {
                let isBase = (cycle.base && cycle.base.start && dStr >= cycle.base.start && dStr <= cycle.base.end);
                if (isBase) {
                    if (cycle.base.isSmall) cycleSmallSmoked++;
                } else {
                    let log = (cycle.logs || {})[dStr];
                    if (cardActiveDaysLeft > 0) {
                        if (cardActiveIsSmall) cycleSmallSmoked++;
                        cardActiveDaysLeft--;
                    } else if (log && log.type === 'ausrutscher') {
                        cardActiveIsSmall = log.isSmall === true;
                        cardActiveDaysLeft = (log.t || 1) - 1;
                        if (cardActiveIsSmall) cycleSmallSmoked++;
                    }
                }
            });
            let cycleLargeSmoked = smokedDays - cycleSmallSmoked;
            let cycleSlRatio = cycleLargeSmoked > 0 ? (cycleSmallSmoked / cycleLargeSmoked).toFixed(1).replace('.', ',') + ':1' : cycleSmallSmoked + ':0';

            const baseDebt = res.expectedBaseDebt || 0;
            const surcharge = (res.totalDebtEver || 0) - baseDebt;
            
            const nirvanaDays = res.history.n.length;
            const ratio = smokedDays > 0 ? (cleanDays / smokedDays).toFixed(1).replace('.', ',') : cleanDays;
            
            let echoBadge = (smokedDays > 0 && nirvanaDays >= smokedDays) ? `<span style="background:#f5eef8; color:#8e44ad; font-size:0.7rem; padding:3px 8px; border-radius:12px; font-weight:800; border:1px solid #d2b4de; margin-left:8px;">🌠 Echo verdient</span>` : "";
            
            const card = document.createElement('div'); 
            card.className = 'archive-card';
            card.innerHTML = `
                <div class="archive-header">
                    <div class="archive-title" style="display:flex; align-items:center; flex-wrap:wrap; gap:5px;">Zyklus: ${parseLocal(cycle.base.start).toLocaleDateString('de-DE', {day:'2-digit', month:'short', year:'numeric'})} – ${allArchDates.length>0 ? allArchDates[allArchDates.length-1].toLocaleDateString('de-DE', {day:'2-digit', month:'short'}) : "Unbekannt"} ${echoBadge}</div>
                    <div style="display:flex; align-items:center; gap:10px;">
                        <div class="archive-badge">${totalDays} Tage Total</div>
                        <button class="btn-tool" style="padding:4px 8px; border:1px solid var(--danger); color:var(--danger); min-width:auto;" onclick="if(typeof deleteArchivedCycle==='function')deleteArchivedCycle(${cycle.id})" title="Zyklus löschen">🗑️</button>
                    </div>
                </div>
                <div class="archive-stats" style="grid-template-columns: 1fr 1fr; gap: 8px; padding-top: 5px;">
                    <div><strong>Dauer:</strong> ${totalDays} Tage</div>
                    <div><strong>Nirwana:</strong> ${nirvanaDays} Tage</div>
                    
                    <div><strong>Geraucht:</strong> <span style="color:var(--danger); font-weight:bold;">${smokedDays} Tage</span></div>
                    <div><strong>Clean:</strong> <span style="color:var(--btn-calc); font-weight:bold;">${cleanDays} Tage</span></div>
                    
                    <div><strong>Davon Klein:</strong> <span style="color:#e67e22;">${cycleSmallSmoked} Tage</span></div>
                    <div><strong>Davon Groß:</strong> <span style="color:#c0392b;">${cycleLargeSmoked} Tage</span></div>

                    <div><strong>Basis-Schuld:</strong> ${baseDebt} Tage</div>
                    <div><strong>Aufschlag:</strong> <span style="color:var(--danger);">+${surcharge} Tage</span></div>
                    
                    <div style="grid-column: span 2; border-top: 1px solid rgba(0,0,0,0.1); padding-top: 8px; margin-top: 4px;">
                        <strong>Verhältnis (Rauchen : Clean):</strong> 1 : ${ratio} <br>
                        <strong style="color:#8e44ad;">Verhältnis (Klein : Groß):</strong> ${cycleSlRatio}
                    </div>
                </div>`;
            archContainer.appendChild(card);
        });
    }
    
    let archMonthsHtml = '<h3 style="margin-top:3rem; margin-bottom:1rem; border-bottom:2px solid #fcf3cf; padding-bottom:10px; color:#7f8c8d;">📅 Kalendarischer Jahres-Rückblick</h3>';
    let mKeys = Object.keys(archiveMonths).sort().reverse();
    
    if(mKeys.length === 0) {
        archMonthsHtml += '<p style="color:#7f8c8d; text-align:center;">Noch keine Kalenderdaten vorhanden.</p>';
    } else {
        mKeys.forEach(mKey => {
            let parts = mKey.split('-');
            let data = archiveMonths[mKey];
            let daysInMonth = new Date(parts[0], parts[1], 0).getDate();
            let textsHtml = '';
            
            // FIX V19.9: Kombinierter Output für neue Notizen (mit Absatz-Erhalt durch pre-wrap)
            if(data.note && data.note.length > 0) {
                textsHtml += `<div style="margin-top:15px; font-size:0.85rem;"><strong>📝 Gedanken zum Monat:</strong><br><div style="color:#2c3e50; padding:10px; background:#f4f6f7; border-radius:8px; margin-top:5px; white-space:pre-wrap; line-height:1.5;">${data.note.join('\n\n---\n\n')}</div></div>`;
            }
            // Legacy Support für alte Einträge
            if(data.erk && data.erk.length > 0) {
                textsHtml += `<div style="margin-top:10px; font-size:0.85rem;"><strong>💡 Erkenntnisse (Alt):</strong><br><div style="color:#555; font-style:italic; padding-left:10px; border-left:2px solid #f1c40f; margin-top:5px; white-space:pre-wrap;">${data.erk.join('\n\n---\n\n')}</div></div>`;
            }
            if(data.dtx && data.dtx.length > 0) {
                textsHtml += `<div style="margin-top:10px; font-size:0.85rem;"><strong>🌿 DTX-Gedanken (Alt):</strong><br><div style="color:#555; font-style:italic; padding-left:10px; border-left:2px solid #27ae60; margin-top:5px; white-space:pre-wrap;">${data.dtx.join('\n\n---\n\n')}</div></div>`;
            }
            
            // NEU: Die umgedrehte Mathematik (100 - X) für die Füllung der Balken
            // T-Tage ist jetzt Grün (#27ae60), je mehr cleane Tage, desto voller.
            
            let hasNotes = textsHtml.trim() !== '';
            
            archMonthsHtml += `
            <div class="archive-card" style="border-left-color: #8e44ad; background: #fff; padding: 0;">
                <details style="width: 100%;">
                    <summary style="padding: 15px; cursor: ${hasNotes ? 'pointer' : 'default'}; list-style: none; outline: none;" ${!hasNotes ? 'onclick="return false;"' : ''}>
                        <div class="archive-header" style="border-bottom:none; margin-bottom:0; display:flex; justify-content:space-between; align-items:center; width:100%;">
                            <div class="archive-title" style="color:#8e44ad;">${monthNames[parseInt(parts[1])-1]} ${parts[0]}</div>
                            ${hasNotes ? '<span style="font-size: 0.75rem; background: #f4f6f7; padding: 4px 10px; border-radius: 12px; color: #7f8c8d; border: 1px solid #eee; font-weight:bold;">Notizen 🔽</span>' : ''}
                        </div>
                        <div class="archive-stats" style="grid-template-columns: 1fr 1fr 1fr; background:#fdfafb; padding:10px; border-radius:8px; margin-top:10px;">
                            <div>
                                <strong style="color:var(--danger);">🔴 ${data.tDays}</strong> T-Tage
                                <div style="height:4px; background:#eee; border-radius:2px; margin-top:4px;" title="Clean-Quote">
                                    <div style="width:${Math.max(0, 100 - (data.tDays / daysInMonth) * 100)}%; height:100%; background:#27ae60; border-radius:2px;"></div>
                                </div>
                            </div>
                            <div>
                                <strong>🍷 ${data.aDays}</strong> Alk.-Tage
                                <div style="height:4px; background:#eee; border-radius:2px; margin-top:4px;" title="Alkfrei-Quote">
                                    <div style="width:${Math.max(0, 100 - (data.aDays / daysInMonth) * 100)}%; height:100%; background:#8e44ad; border-radius:2px;"></div>
                                </div>
                            </div>
                            <div>
                                <strong>✊ ${data.mDays}</strong> M-Tage
                                <div style="height:4px; background:#eee; border-radius:2px; margin-top:4px;" title="M-frei-Quote">
                                    <div style="width:${Math.max(0, 100 - (data.mDays / daysInMonth) * 100)}%; height:100%; background:#f39c12; border-radius:2px;"></div>
                                </div>
                            </div>
                        </div>
                    </summary>
                    ${hasNotes ? `<div style="padding: 0 15px 15px 15px; border-top: 1px dashed #eee;">${textsHtml}</div>` : ''}
                </details>
            </div>`;
        });
    }
    safeHTML('archive-months-container', archMonthsHtml);

    let debugIds = (getApp().cycles || []).map(c=>c.id).join(', ');
    let debugRes = globalSimResults.map(r => r ? (r.failed ? '[FAILED: ' + r.cycleId + ']' : r.cycleId) : '[NULL]').join(', ');
    
    safeHTML('debug-container', `
    <details style="background:#fff3cd; border:1px solid #ffeeba; padding:10px; font-size:0.85rem; border-radius:8px; color:#856404; margin-bottom: 20px;">
        <summary style="font-weight:bold; cursor:pointer;">🛠️ System-Diagnose (Debug Monitor)</summary>
        <div style="margin-top: 10px;">
            <strong>Zyklen im Speicher:</strong> ${(getApp().cycles || []).length}<br>
            <strong>Archivierte Zyklen (UI):</strong> ${archived.length}<br>
            <strong>Simulations-Ergebnisse:</strong> ${globalSimResults.length} Elemente<br><br>
            <strong>Gespeicherte Cycle-IDs:</strong><br>
            ${debugIds}<br><br>
            <strong>Erfolgreiche Res-IDs:</strong><br>
            ${debugRes}
        </div>
    </details>`);

    // --- Erinnerungsecho im Archiv aktualisieren ---
    if (typeof renderMemoryEcho === 'function') renderMemoryEcho();
}
// --- Gamification & Effekte ---
function triggerBonusConfetti() {
    const todayStr = toIsoString(new Date());
    const key = 'bonusShown_' + todayStr;
    
    // Prüfen, ob das Konfetti heute schon gefeuert wurde
    if (sessionStorage.getItem(key)) return;
    
    // Wenn die Bibliothek geladen ist, feuern!
    if (typeof confetti === 'function') {
        confetti({
            particleCount: 150,      // Anzahl der Schnipsel
            spread: 100,             // Streuung
            origin: { y: 0.6 },      // Startpunkt (etwas unterhalb der Mitte)
            colors: ['#2ecc71', '#f1c40f', '#3498db', '#e74c3c'], 
            zIndex: 9999             // Über allen anderen Elementen
        });
        
        // Im Zwischenspeicher merken, dass wir heute schon gefeiert haben
        sessionStorage.setItem(key, 'true');
    } else {
        console.warn("Konfetti-Bibliothek konnte nicht geladen werden.");
    }
}
// --- Statistik-Interaktion ---
function cycleCleanWindow() {
    const states = ['all', 'cycle', 30, 60, 90];
    let idx = states.indexOf(currentCleanWindow);
    currentCleanWindow = states[(idx + 1) % states.length];
    renderArchiv();
}