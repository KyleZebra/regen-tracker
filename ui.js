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

function saveMonthlyNotes(mKey, btn) {
    const active = getActiveCycle();
    if(!active) return;
    if(!active.monthlyNotes) active.monthlyNotes = {};
    
    const erkVal = (safeVal(`note-erk-${mKey}`) || "").trim();
    const dtxVal = (safeVal(`note-dtx-${mKey}`) || "").trim();
    
    active.monthlyNotes[mKey] = { erk: erkVal, dtx: dtxVal };
    saveData(true); 
    
    if(btn && btn.nextElementSibling) {
        const msg = btn.nextElementSibling;
        msg.style.display = 'inline-block';
        setTimeout(() => msg.style.display = 'none', 2000);
    }
}

// --- Main Update Entry ---
function updateUI() {
    const active = getActiveCycle();
    safeDisplay('dashboard-main', active ? 'block' : 'none');
    safeDisplay('setup-warning', active ? 'none' : 'block');
    
    if (active) { 
        populateBaseForm(); 
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
        ring.classList.remove('regen', 'bewaehrung', 'nirvana'); 
    }
    
    const pTxt = document.getElementById('dash-percent'); 
    if(pTxt) { 
        pTxt.textContent = Math.round(progress) + '%'; 
        pTxt.classList.remove('nirvana'); 
    }
    
    safeProp('dash-streak', 'className', 'streak-badge');

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
        if(ring) ring.setAttribute('stroke-dasharray', `0, 100`); 
        safeText('dash-percent', "!"); 
        safeText('dash-ring-label', "OFFEN");
        safeText('dash-days-left', `Dauer: ${res.history.t.length}d`); 
        safeText('dash-target-date', "Pausiere zum Start");
        safeText('dash-sub', "Die initiale T-Phase wächst, bis du pausierst."); 
        safeDisplay('dash-streak', 'none');
    } else if (displayDebt <= 0) {
        let miles = [7, 14, 21, 30, 60, 90, 180, 365, 730, 9999];
        let nextM = miles.find(m => res.nirvanaStreak < m) || 9999;
        let prevM = [...miles].reverse().find(m => res.nirvanaStreak >= m) || 0;
        let nirvanaProgress = nextM !== 9999 ? ((res.nirvanaStreak - prevM) / (nextM - prevM)) * 100 : 100;
        
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
        
        safeProp('dash-status-badge', 'className', 'status-badge status-done'); 
        safeText('dash-status-badge', "Nirwana Level-Up");
        if(ring) { 
            ring.classList.add('nirvana'); 
            ring.setAttribute('stroke-dasharray', `${nirvanaProgress}, 100`); 
        }
        if(pTxt) pTxt.classList.add('nirvana'); 
        safeText('dash-percent', Math.round(nirvanaProgress) + '%'); 
        safeText('dash-ring-label', "ZUM ZIEL");
        safeText('dash-days-left', `Nächstes Ziel: ${nextM} Tage`); 
        safeText('dash-target-date', `Bisher: ${mStr}`);
        safeText('dash-sub', isSandbox ? "Du bist in der Simulation clean." : "Regeneration abgeschlossen.");
        safeDisplay('dash-streak', 'inline-block'); 
        const sb = document.getElementById('dash-streak'); 
        if(sb) { 
            sb.classList.add('nirvana'); 
            sb.textContent = `💎 ${res.nirvanaStreak} Tage Clean-Streak`; 
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
        safeText('dash-sub', "Du regenerierst mit 1,0x Geschwindigkeit."); 
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
            
            safeHTML('dash-outlook', `
                <div class="outlook-title">📊 Tagesausblick für heute</div>
                <div class="outlook-row good">
                    <span class="outlook-label">🟢 Bei Pause:</span>
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
    if(!res || res.failed) { 
        safeDisplay('historie-output', 'none'); 
        return; 
    }
    
    const active = getActiveCycle(); 
    safeDisplay('historie-output', 'block');
    
    const totalT = res.totalTDaysEver || 0; 
    const totalRegenDebt = res.totalDebtEver || 0; 
    const expectedBaseDebt = res.expectedBaseDebt || 0;
    const aufschlag = totalRegenDebt - expectedBaseDebt;
    
    let html = `
    <div style="margin-top:0.5rem; font-weight:bold; color:#2c3e50; margin-bottom: 10px;">📊 Gesamtbilanz dieses Zyklus</div>
    <div class="stat-grid" style="margin-bottom: 1rem;">
        <div class="stat-box" style="padding: 10px;"><div class="stat-val" style="font-size: 1.4rem;">${totalT}</div><div class="stat-label" style="font-size: 0.65rem;">T-Tage</div></div>
        <div class="stat-box" style="padding: 10px;"><div class="stat-val" style="font-size: 1.4rem;">${expectedBaseDebt}</div><div class="stat-label" style="font-size: 0.65rem;">Basis Schuld</div></div>
        <div class="stat-box" style="padding: 10px;"><div class="stat-val danger" style="font-size: 1.4rem; color: var(--danger);">+${aufschlag}</div><div class="stat-label" style="font-size: 0.65rem;">Aufschlag</div></div>
        <div class="stat-box" style="padding: 10px;"><div class="stat-val blue" style="font-size: 1.4rem; color: var(--nirvana-blue);">${totalRegenDebt}</div><div class="stat-label" style="font-size: 0.65rem;">Gesamtschuld</div></div>
    </div>`;
    
    if (res.mFreeGoal > 0 && !res.isOpen) {
        let mProgress = Math.min(100, (res.mFreeCurrent / res.mFreeGoal) * 100);
        html += `
        <div style="margin-top: 15px; padding: 15px; background: #fdfafb; border: 1px solid #e8daef; border-radius: 12px; text-align: center;">
            <div style="font-weight: 800; color: #8e44ad; margin-bottom: 5px;">M-freie Regeneration</div>
            <div style="background: #eee; height: 12px; border-radius: 6px; overflow: hidden; margin-bottom: 5px;">
                <div style="background: #9b59b6; width: ${mProgress}%; height: 100%; transition: width 0.5s ease;"></div>
            </div>
            <div style="font-size: 0.85rem; font-weight: bold; color: #555;">${res.mFreeCurrent} von ${res.mFreeGoal} Tagen erreicht ${res.mFreeCurrent >= res.mFreeGoal ? '✅' : ''}</div>
        </div>
        `;
    } else if (!res.isOpen) {
        html += `<div style="margin-top:10px; padding:10px; background:#e8f6f3; border-radius:8px; color:#16a085; font-weight:bold; text-align:center;">Empfohlene M-freie Tage: ${res.mFreeGoal || 0}</div>`;
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
          tagClass = "tday"; tagText="1. Konsum"; 
      } else if (res.history.a.some(d => d.toDateString() === dStr)) { 
          tagClass = "ausrutscher"; tagText="weiteres Rauchen"; 
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
        const mLevels = ['Kein', 'Moderat', 'Hoch'];
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
            
            let activeNotes = (active.monthlyNotes || {})[mKey] || {erk: '', dtx: ''};
            html += `<div style="margin-top:15px; padding-top:15px; border-top:2px dashed #eee;">
                  <label>💡 Erkenntnisse in diesem Monat:</label>
                  <textarea id="note-erk-${mKey}" rows="3" placeholder="Deine Erkenntnisse...">${escapeHTML(activeNotes.erk)}</textarea>
                  <label style="margin-top:10px;">🌿 Gedanken zur Entgiftung (DTX):</label>
                  <textarea id="note-dtx-${mKey}" rows="3" placeholder="Deine DTX-Gedanken...">${escapeHTML(activeNotes.dtx)}</textarea>
                  <div style="display:flex; align-items:center; gap:10px; margin-top:10px;">
                      <button class="btn-tool" style="padding:8px 15px; min-width:auto;" onclick="if(typeof saveMonthlyNotes==='function')saveMonthlyNotes('${mKey}', this)">💾 Speichern</button>
                      <span style="display:none; color:#27ae60; font-weight:bold; font-size:0.85rem;">✅ Gespeichert</span>
                  </div>
            </div>`;
            
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
    let pastPauseDays = 0; 
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
    const milestonesArr = [7, 14, 21, 30, 60, 90, 180, 365, 730];

    (getApp().cycles || []).forEach((cycle) => {
        const res = globalSimResults.find(r => r && r.cycleId === cycle.id); 
        if(!res || res.failed) return; 
        
        let allDays = [...res.history.t, ...res.history.a, ...res.history.b, ...res.history.r, ...res.history.n];
        let uniqueDays = [...new Set(allDays.map(d => toIsoString(d)))].filter(d => d <= todayStr).sort();

        uniqueDays.forEach(dStr => {
            let mKey = dStr.substring(0, 7); 
            if(!archiveMonths[mKey]) archiveMonths[mKey] = { tDays:0, aDays:0, mDays:0, erk:[], dtx:[] };
            
            if(res.history.t.some(d => toIsoString(d)===dStr) || res.history.a.some(d => toIsoString(d)===dStr)) {
                archiveMonths[mKey].tDays++;
            }
            
            let isBase = (cycle.base?.start && dStr >= cycle.base.start && dStr <= cycle.base.end);
            let log = (cycle.logs || {})[dStr] || {};
            
            if((isBase ? (cycle.base.aLevel||0) : (log.a || 0)) > 0) archiveMonths[mKey].aDays++;
            if((isBase ? (cycle.base.mLevel||0) : (log.m || 0)) > 0) archiveMonths[mKey].mDays++;
        });

        if(cycle.monthlyNotes) {
            Object.keys(cycle.monthlyNotes).forEach(mKey => { 
                if(!archiveMonths[mKey]) archiveMonths[mKey] = { tDays:0, aDays:0, mDays:0, erk:[], dtx:[] }; 
                if(cycle.monthlyNotes[mKey].erk) archiveMonths[mKey].erk.push(cycle.monthlyNotes[mKey].erk); 
                if(cycle.monthlyNotes[mKey].dtx) archiveMonths[mKey].dtx.push(cycle.monthlyNotes[mKey].dtx); 
            });
        }
        
        const pastT = res.history.t.filter(isPast); 
        const pastA = res.history.a.filter(isPast);
        const pastB = res.history.b.filter(isPast); 
        const pastR = res.history.r.filter(isPast); 
        const pastN = res.history.n.filter(isPast);
        
        pastDaysTracked += (pastT.length + pastA.length + pastB.length + pastR.length + pastN.length); 
        pastPauseDays += (pastB.length + pastR.length + pastN.length);

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

    const cleanQuote = pastDaysTracked > 0 ? Math.round((pastPauseDays / pastDaysTracked) * 100) : 0;
    const avgAus = totalAusrutscher > 0 ? (sumAusrutscherDays / totalAusrutscher).toFixed(1) : 0;
    let avgNirvana = cyclesWithNirvana > 0 ? Math.round(totalNirvanaDays / cyclesWithNirvana) : 0;

    safeText('stat-clean-quote', cleanQuote + '%'); 
    safeText('stat-max-nirvana', maxNirvana); 
    safeText('stat-total-days', pastDaysTracked); 
    safeText('stat-avg-ausrutscher', avgAus);
    safeText('stat-avg-nirvana', avgNirvana);
    safeText('stat-total-milestones', totalMilestones);

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
            const card = document.createElement('div'); 
            card.className = 'archive-card';
            card.innerHTML = `
                <div class="archive-header">
                    <div class="archive-title">Zyklus: ${parseLocal(cycle.base.start).toLocaleDateString('de-DE', {day:'2-digit', month:'short', year:'numeric'})} – ${allArchDates.length>0 ? allArchDates[allArchDates.length-1].toLocaleDateString('de-DE', {day:'2-digit', month:'short'}) : "Unbekannt"}</div>
                    <div style="display:flex; align-items:center; gap:10px;">
                        <div class="archive-badge">${allArchDates.length} Tage Total</div>
                        <button class="btn-tool" style="padding:4px 8px; border:1px solid var(--danger); color:var(--danger); min-width:auto;" onclick="if(typeof deleteArchivedCycle==='function')deleteArchivedCycle(${cycle.id})" title="Zyklus löschen">🗑️</button>
                    </div>
                </div>
                <div class="archive-stats">
                    <div><strong>Start-Konsum:</strong> ${cycle.base.tDays} Tage</div>
                    <div><strong>Rauchen in Phase:</strong> ${Object.values(cycle.logs || {}).filter(l=>l.type==='ausrutscher').length}</div>
                    <div><strong>Regenerationsdauer:</strong> ${res.history.b.length + res.history.r.length} Tage</div>
                    <div><strong>Nirwana-Streak danach:</strong> ${res.nirvanaStreak} Tage</div>
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
            
            if(data.erk.length > 0) {
                textsHtml += `<div style="margin-top:10px; font-size:0.85rem;"><strong>💡 Erkenntnisse:</strong><br><div style="color:#555; font-style:italic; padding-left:10px; border-left:2px solid #f1c40f; margin-top:5px;">${data.erk.join('<hr style="margin:8px 0; border:0; border-top:1px dashed #eee;">')}</div></div>`;
            }
            if(data.dtx.length > 0) {
                textsHtml += `<div style="margin-top:10px; font-size:0.85rem;"><strong>🌿 DTX-Gedanken:</strong><br><div style="color:#555; font-style:italic; padding-left:10px; border-left:2px solid #27ae60; margin-top:5px;">${data.dtx.join('<hr style="margin:8px 0; border:0; border-top:1px dashed #eee;">')}</div></div>`;
            }
            
            // NEU: Die umgedrehte Mathematik (100 - X) für die Füllung der Balken
            // T-Tage ist jetzt Grün (#27ae60), je mehr cleane Tage, desto voller.
            archMonthsHtml += `
            <div class="archive-card" style="border-left-color: #8e44ad; background: #fff;">
                <div class="archive-header" style="border-bottom:none; margin-bottom:0;">
                    <div class="archive-title" style="color:#8e44ad;">${monthNames[parseInt(parts[1])-1]} ${parts[0]}</div>
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
                ${textsHtml}
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
}