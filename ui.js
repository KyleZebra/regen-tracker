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
    const d = document.getElementById('diary-container'); 
    if(!d) return;
    const isHidden = (d.style.display === 'none' || d.style.display === '');
    if (isHidden) { 
        d.style.display = 'block'; 
        renderDiaryList(); 
    } else { 
        d.style.display = 'none'; 
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
        active.base.isSmall = document.getElementById('base-small')?.checked || false;
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
        try { renderDashboard(); } catch(e) { console.error("Render Dashboard Error", e); }
        try { renderHistorie(); } catch(e) { console.error("Render Historie Error", e); }
    }
    try { renderArchiv(); } catch(e) { console.error("Render Archiv Error", e); }
}

// --- Specific Renderers ---
function renderDashboard() {
    const res = activeSimResult; 
    const activeCycle = getActiveCycle();
    
    if(!res || !res.dashState || !activeCycle || res.failed) {
        safeText('dash-status-badge', "Warte auf Startdatum...");
        safeProp('dash-status-badge', 'className', 'status-badge status-open');
        return;
    }
    
    const ds = res.dashState; 
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    safeText('dash-today-date', "Heute: " + new Date().toLocaleDateString('de-DE', options));
    
    let displayDebt = ds.debt || 0;
    let progress = (displayDebt > 0 && ds.totalDebtEver > 0) ? Math.max(0, Math.min(100, 100 - (displayDebt / ds.totalDebtEver * 100))) : 100;
    
    const ring = document.getElementById('dash-ring'); 
    if(ring) { 
        ring.setAttribute('stroke-dasharray', `${progress}, 100`); 
        ring.classList.remove('regen', 'bewaehrung', 'nirvana'); 
    }
    
    const pTxt = document.getElementById('dash-percent'); 
    if(pTxt) pTxt.textContent = Math.round(progress) + '%'; 
    
    let fDebt = Number.isInteger(Math.round(displayDebt * 10) / 10) ? Math.round(displayDebt * 10) / 10 : (Math.round(displayDebt * 10) / 10).toFixed(1).replace('.', ',');

    if (res.isOpen) {
        safeProp('dash-status-badge', 'className', 'status-badge status-open'); 
        safeText('dash-status-badge', "Konsumphase Aktiv");
        safeText('dash-days-left', `Dauer: ${res.history.t.length}d`); 
        safeText('dash-target-date', "Pausiere zum Start");
        safeText('dash-sub', "Die initiale T-Phase wächst, bis du pausierst."); 
    } else if (displayDebt <= 0) {
        safeProp('dash-status-badge', 'className', 'status-badge status-done'); 
        safeText('dash-status-badge', "Nirwana Level-Up");
        if(ring) ring.classList.add('nirvana'); 
        safeText('dash-days-left', `Streak: ${res.nirvanaStreak} Tage`); 
        safeText('dash-target-date', "Regeneration abgeschlossen");
        safeText('dash-sub', "Du bist im tiefen Nirwana.");
    } else if (ds.pendingBonus) {
        // V14.0 Treuhand UI State
        safeProp('dash-status-badge', 'className', 'status-badge status-bewaehrung'); 
        safeText('dash-status-badge', "🎁 Bonus bereit!");
        if(ring) ring.classList.add('bewaehrung'); 
        safeText('dash-days-left', `Schulden: ${fDebt} Tage`); 
        safeText('dash-target-date', `Ziel: ${res.finalEnd.toLocaleDateString('de-DE')}`);
        safeText('dash-sub', "Logge heute eine Pause, um den Bonus einzulösen!"); 
    } else if (ds.state === 'BEWAEHRUNG') {
        safeProp('dash-status-badge', 'className', 'status-badge status-bewaehrung'); 
        safeText('dash-status-badge', "Bewährungsphase");
        if(ring) ring.classList.add('bewaehrung'); 
        safeText('dash-days-left', `Schulden: ${fDebt} Tage`); 
        safeText('dash-target-date', `Ziel: ${res.finalEnd.toLocaleDateString('de-DE')}`);
        safeText('dash-sub', `Regeneration: 0,5x. Noch ${ds.bewTimer} Tag(e) bis zum Bonus.`); 
    } else {
        safeProp('dash-status-badge', 'className', 'status-badge status-regen'); 
        safeText('dash-status-badge', "Tiefe Regeneration");
        if(ring) ring.classList.add('regen'); 
        safeText('dash-days-left', `Schulden: ${fDebt} Tage`); 
        safeText('dash-target-date', `Ziel: ${res.finalEnd.toLocaleDateString('de-DE')}`);
        safeText('dash-sub', "Du regenerierst mit 1,0x Geschwindigkeit."); 
    }

    if (!isSandbox && !res.isOpen) {
        safeDisplay('dash-budget-box', 'block');
        if (activeCycle.targetETA) {
            safeDisplay('budget-content-active', 'block'); 
            safeDisplay('budget-content-empty', 'none');
            safeText('budget-target-date', parseLocal(activeCycle.targetETA)?.toLocaleDateString('de-DE') || "");
            
            let bRes = calculateBudget(activeCycle.targetETA);
            const amt = document.getElementById('budget-amount');
            if (amt) {
                amt.textContent = bRes.over ? `-${Math.abs(bRes.budget)}` : (bRes.budget >= 50 ? "50+" : bRes.budget);
                amt.style.color = bRes.over ? 'var(--danger)' : '#2c3e50';
            }
        } else {
            safeDisplay('budget-content-active', 'none'); 
            safeDisplay('budget-content-empty', 'block'); 
        }
    }
}

function renderHistorie() {
    const res = activeSimResult; 
    if(!res || res.failed) return;
    
    const active = getActiveCycle(); 
    safeDisplay('historie-output', 'block');
    
    const aufschlag = res.totalDebtEver - res.expectedBaseDebt;
    
    safeHTML('bilanz-container', `
        <div style="font-weight:bold; color:#2c3e50; margin-bottom: 10px;">📊 Gesamtbilanz dieses Zyklus</div>
        <div class="stat-grid" style="margin-bottom: 1rem;">
            <div class="stat-box"><div>${res.totalTDaysEver}</div><div class="stat-label">T-Tage</div></div>
            <div class="stat-box"><div>${res.expectedBaseDebt}</div><div class="stat-label">Basis</div></div>
            <div class="stat-box"><div style="color:var(--danger)">+${aufschlag}</div><div class="stat-label">Aufschlag</div></div>
            <div class="stat-box"><div style="color:var(--nirvana-blue)">${res.totalDebtEver}</div><div class="stat-label">Gesamt</div></div>
        </div>
    `);

    const todayStr = new Date().toDateString(); 
    let calHtml = "<table><thead><tr><th>Mo</th><th>Di</th><th>Mi</th><th>Do</th><th>Fr</th><th>Sa</th><th>So</th></tr></thead><tbody><tr>";
    
    // Einfaches Rendering (Ausschnitt aus der Engine-Historie)
    const allDates = [...res.history.t, ...res.history.a, ...res.history.b, ...res.history.r, ...res.history.n];
    if (allDates.length === 0) return;
    
    const minDate = new Date(Math.min(...allDates.map(d => d.getTime())));
    let current = new Date(minDate.getFullYear(), minDate.getMonth(), 1);
    let startDay = current.getDay() === 0 ? 6 : current.getDay() - 1;
    for (let i = 0; i < startDay; i++) calHtml += "<td></td>";

    while (current <= res.finalEnd || current.getMonth() === minDate.getMonth()) {
        const dStr = current.toDateString(); 
        const isoDStr = toIsoString(current); 
        let tagClass = "";
        let tagText = "";

        if (res.history.t.some(d => d.toDateString() === dStr)) { tagClass = "tday"; tagText="1. Konsum"; }
        else if (res.history.a.some(d => d.toDateString() === dStr)) { tagClass = "ausrutscher"; tagText="Rauchen"; }
        else if (res.history.b.some(d => d.toDateString() === dStr)) { tagClass = "bewaehrung"; tagText="Bewährung"; }
        else if (res.history.r.some(d => d.toDateString() === dStr)) { tagClass = "regen"; tagText="Regen."; }
        else if (res.history.n.some(d => d.toDateString() === dStr)) { tagClass = "nirvana"; tagText="Nirwana"; }

        if (res.history.bonusDict && res.history.bonusDict[isoDStr]) tagText += " 🎁";

        calHtml += `<td class="${dStr === todayStr ? 'today-highlight' : ''}">
            <span class="date-num">${current.getDate()}.</span>
            ${tagText ? `<span class="tag ${tagClass}">${tagText}</span>` : ''}
        </td>`;
        
        if (current.getDay() === 0) calHtml += "</tr><tr>";
        current.setDate(current.getDate() + 1);
        if (current > res.finalEnd && current.getDate() === 1) break; 
    }
    calHtml += "</tr></tbody></table>"; 
    safeHTML("calendar", calHtml);
}

function renderDiaryList() {
    const active = getActiveCycle(); 
    if(!active || !active.base.start) return;
    
    let html = "";
    const items = [];
    let curr = parseLocal(active.base.start);
    const todayStr = toIsoString(new Date());

    while (toIsoString(curr) <= todayStr) {
        let dStr = toIsoString(curr);
        let log = (active.logs || {})[dStr];
        let isBase = (dStr >= active.base.start && dStr <= active.base.end);
        
        items.push({ dStr, date: new Date(curr), log, isBase });
        curr.setDate(curr.getDate() + 1);
    }

    items.reverse().forEach(item => {
        const dateFmt = item.date.toLocaleDateString('de-DE', {weekday: 'short', day: '2-digit', month: '2-digit'});
        let meta = item.isBase ? `S:${active.base.sLevel} A:${active.base.aLevel} M:${active.base.mLevel}` : (item.log ? `S:${item.log.s} A:${item.log.a} M:${item.log.m}` : "Kein Eintrag");
        
        html += `<div class="diary-item">
            <div><strong>${dateFmt}</strong> - ${item.isBase ? 'Basis' : (item.log?.type || 'Pause')}</div>
            <div class="diary-meta">${meta}</div>
            <button class="diary-edit-btn" onclick="openDiaryEdit('${item.dStr}')">Edit</button>
        </div>`;
    });
    safeHTML('diary-list-content', html);
}

function renderArchiv() {
    const archived = appData.cycles.filter(c => c.status === 'archived');
    let html = "";
    archived.reverse().forEach(c => {
        html += `<div class="archive-card">
            <div class="archive-header">Zyklus ${c.base.start}</div>
            <div class="archive-stats">Dauer: ${c.base.tDays} Tage | Basis: ${c.base.sLevel}/${c.base.aLevel}/${c.base.mLevel}</div>
        </div>`;
    });
    safeHTML('archive-container', html || "<p>Keine archivierten Zyklen.</p>");
    
    // Debug Monitor
    safeHTML('debug-container', `<div style="font-size:0.7rem; color:gray;">System: V${appData.version} | Cycles: ${appData.cycles.length}</div>`);
}

// --- Visual Effects ---
function triggerBonusConfetti() {
    if (typeof confetti === 'function') {
        confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
    } else {
        // Fallback native
        const colors = ['#f1c40f', '#2ecc71', '#3498db'];
        for (let i = 0; i < 50; i++) {
            let c = document.createElement('div');
            c.style.cssText = `position:fixed;width:8px;height:8px;background:${colors[i%3]};top:-10px;left:${Math.random()*100}vw;z-index:10000;`;
            document.body.appendChild(c);
            c.animate([{transform:'translateY(0)'},{transform:`translateY(100vh) rotate(${Math.random()*360}deg)`}], {duration: 2000+Math.random()*2000});
            setTimeout(() => c.remove(), 4000);
        }
    }
}