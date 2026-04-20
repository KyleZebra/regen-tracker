// ==========================================
// ui.js - Vollständiges Interface & Rendering (V14.0)
// ==========================================

// --- Navigation & Basis-Funktionen ---
function switchTab(tabId) {
    document.querySelectorAll('.tab-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.tab === tabId);
    });
    document.querySelectorAll('.tab-content').forEach(c => {
        c.classList.toggle('active', c.id === 'tab-' + tabId);
    });
    updateUI();
}

function toggleDiary() {
    const d = document.getElementById('diary-container');
    if (!d) return;
    const isHidden = (d.style.display === 'none' || d.style.display === '');
    d.style.display = isHidden ? 'block' : 'none';
    if (isHidden) renderDiaryList();
}

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
    const lock = active.base.isOpen;
    ['base-start', 'base-end'].forEach(id => safeProp(id, 'readOnly', lock));
    ['base-small', 'base-s', 'base-a', 'base-m'].forEach(id => safeProp(id, 'disabled', lock));
    safeDisplay('open-base-warning', lock ? 'block' : 'none');
    if (lock) safeHTML('open-base-warning', "⚠️ Initiale Konsumphase ist noch offen! Drücke auf 'Pause', um sie abzuschließen.");
}

function saveBase(force = false) {
    const s = safeVal('base-start'), e = safeVal('base-end'), t = parseInt(safeVal('base-t'));
    if (!s || !e || isNaN(t)) { if (force) customAlert("Bitte Start und Ende eintragen."); return; }
    let active = getActiveCycle();
    if (!active) { active = { id: Date.now(), status: 'active', logs: {}, base: {} }; getApp().cycles.push(active); }
    active.base.start = s; active.base.end = e; active.base.tDays = t;
    if (!active.base.isOpen) {
        active.base.isSmall = document.getElementById('base-small')?.checked || false;
        active.base.sLevel = parseInt(safeVal('base-s')) || 0;
        active.base.aLevel = parseInt(safeVal('base-a')) || 0;
        active.base.mLevel = parseInt(safeVal('base-m')) || 0;
    }
    if (force) saveData();
}

function updateUI() {
    const active = getActiveCycle();
    safeDisplay('dashboard-main', active ? 'block' : 'none');
    safeDisplay('setup-warning', active ? 'none' : 'block');
    if (active) {
        populateBaseForm();
        renderDashboard();
        renderHistorie();
    }
    renderArchiv();
}

// --- Dashboard & Vorschau ---
function renderDashboard() {
    const res = activeSimResult, activeCycle = getActiveCycle();
    if (!res || !res.dashState || !activeCycle) return;
    const ds = res.dashState;
    safeText('dash-today-date', "Heute: " + new Date().toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' }));
    
    // Ring & Progress
    let progress = (ds.debt > 0 && ds.totalDebtEver > 0) ? Math.max(0, Math.min(100, 100 - (ds.debt / ds.totalDebtEver * 100))) : 100;
    const ring = document.getElementById('dash-ring');
    if (ring) {
        ring.setAttribute('stroke-dasharray', `${progress}, 100`);
        ring.className.baseVal = "circle " + (ds.debt <= 0 ? 'nirvana' : (ds.state === 'BEWAEHRUNG' ? 'bewaehrung' : 'regen'));
    }
    safeText('dash-percent', Math.round(progress) + '%');

    // Status Badge & Texte
    if (res.isOpen) {
        safeProp('dash-status-badge', 'className', 'status-badge status-open');
        safeText('dash-status-badge', "Konsumphase Aktiv");
        safeText('dash-sub', "Die initiale Phase wächst, bis du pausierst.");
    } else if (ds.debt <= 0) {
        safeProp('dash-status-badge', 'className', 'status-badge status-done');
        safeText('dash-status-badge', "Nirwana Level-Up");
        safeText('dash-sub', "Du bist regeneriert.");
    } else {
        safeProp('dash-status-badge', 'className', 'status-badge ' + (ds.pendingBonus ? 'status-bewaehrung' : (ds.state === 'BEWAEHRUNG' ? 'status-bewaehrung' : 'status-regen')));
        safeText('dash-status-badge', ds.pendingBonus ? "🎁 Bonus bereit!" : (ds.state === 'BEWAEHRUNG' ? "Bewährungsphase" : "Tiefe Regeneration"));
        safeText('dash-sub', ds.pendingBonus ? "Logge heute eine Pause für den Bonus!" : (ds.state === 'BEWAEHRUNG' ? `0,5x Speed. Noch ${ds.bewTimer} Tage bis zum Bonus.` : "1,0x Speed aktiv."));
    }
    safeText('dash-days-left', res.isOpen ? `${res.history.t.length} Tage Dauer` : `Schulden: ${ds.debt.toFixed(1).replace('.', ',')} Tage`);
    safeText('dash-target-date', res.isOpen ? "Pausiere zum Start" : `Ziel: ${res.finalEnd.toLocaleDateString('de-DE')}`);

    // TAGESAUSBLICK (Die reparierte Vorschau)
    const todayStr = toIsoString(new Date());
    const isLoggedToday = activeCycle.logs && activeCycle.logs[todayStr] && activeCycle.logs[todayStr].type !== undefined;
    if (!isSandbox && !isLoggedToday && !res.isOpen && ds.debt > 0) {
        let cloneA = JSON.parse(JSON.stringify(activeCycle));
        cloneA.logs[todayStr] = { type: 'pause', s: 0, a: 0, m: 0, isSimulated: true };
        let resA = simulateCycle(cloneA);
        let cloneB = JSON.parse(JSON.stringify(activeCycle));
        cloneB.logs[todayStr] = { type: 'ausrutscher', t: 1, s: 0, a: 0, m: 0, isSmall: false, isSimulated: true };
        let resB = simulateCycle(cloneB);

        if (resA && resB) {
            safeHTML('dash-outlook', `
                <div class="outlook-title">📊 Tagesausblick für heute</div>
                <div class="outlook-row good"><span>🟢 Bei Pause:</span> <strong>Ziel: ${resA.finalEnd.toLocaleDateString('de-DE')}</strong></div>
                <div class="outlook-row bad"><span>🔴 Bei Rauchen:</span> <strong>Ziel: ${resB.finalEnd.toLocaleDateString('de-DE')}</strong></div>
            `);
            safeDisplay('dash-outlook', 'block');
        }
    } else { safeDisplay('dash-outlook', 'none'); }

    // Budget Box
    if (!isSandbox && !res.isOpen && activeCycle.targetETA) {
        let bRes = calculateBudget(activeCycle.targetETA);
        safeDisplay('dash-budget-box', 'block');
        safeDisplay('budget-content-active', 'block');
        safeDisplay('budget-content-empty', 'none');
        safeText('budget-target-date', parseLocal(activeCycle.targetETA).toLocaleDateString('de-DE'));
        const amt = document.getElementById('budget-amount');
        amt.textContent = bRes.over ? `-${Math.abs(bRes.budget)}` : (bRes.budget >= 50 ? "50+" : bRes.budget);
        amt.style.color = bRes.over ? 'var(--danger)' : '#2c3e50';
    } else if (!isSandbox && !res.isOpen) {
        safeDisplay('dash-budget-box', 'block');
        safeDisplay('budget-content-active', 'none');
        safeDisplay('budget-content-empty', 'block');
    }

    if (isLoggedToday) { safeDisplay('daily-action-area', 'none'); safeDisplay('daily-done-area', 'block'); }
    else { safeDisplay('daily-action-area', 'block'); safeDisplay('daily-done-area', 'none'); }
}

// --- Historie & Kalender ---
function renderHistorie() {
    const res = activeSimResult; if (!res || res.failed) return;
    const aufschlag = (res.totalDebtEver - res.expectedBaseDebt).toFixed(1).replace('.', ',');
    safeHTML('bilanz-container', `
        <div style="font-weight:bold; margin-bottom:10px;">📊 Gesamtbilanz dieses Zyklus</div>
        <div class="stat-grid">
            <div class="stat-box"><div>${res.totalTDaysEver}</div><div class="stat-label">T-Tage</div></div>
            <div class="stat-box"><div>${res.expectedBaseDebt}</div><div class="stat-label">Basis</div></div>
            <div class="stat-box"><div style="color:var(--danger)">+${aufschlag}</div><div class="stat-label">Aufschlag</div></div>
            <div class="stat-box"><div style="color:var(--nirvana-blue)">${res.totalDebtEver.toFixed(1).replace('.',',')}</div><div class="stat-label">Gesamt</div></div>
        </div>
    `);
    renderCalendar(res);
}

function renderCalendar(res) {
    const active = getActiveCycle();
    const allDates = [...res.history.t, ...res.history.a, ...res.history.b, ...res.history.r, ...res.history.n];
    if (allDates.length === 0) return;
    const minDate = new Date(Math.min(...allDates.map(d => d.getTime())));
    let current = new Date(minDate.getFullYear(), minDate.getMonth(), 1);
    let html = "<table><thead><tr><th>Mo</th><th>Di</th><th>Mi</th><th>Do</th><th>Fr</th><th>Sa</th><th>So</th></tr></thead><tbody><tr>";
    let startDay = current.getDay() === 0 ? 6 : current.getDay() - 1;
    for (let i = 0; i < startDay; i++) html += "<td></td>";
    while (current <= res.finalEnd || current.getDate() !== 1) {
        const dStr = current.toDateString(), iso = toIsoString(current);
        let cls = "", txt = "";
        if (res.history.t.some(d => d.toDateString() === dStr)) { cls = "tday"; txt = "Start"; }
        else if (res.history.a.some(d => d.toDateString() === dStr)) { cls = "ausrutscher"; txt = "Rauchen"; }
        else if (res.history.b.some(d => d.toDateString() === dStr)) { cls = "bewaehrung"; txt = "Bewähr."; }
        else if (res.history.r.some(d => d.toDateString() === dStr)) { cls = "regen"; txt = "Regen."; }
        else if (res.history.n.some(d => d.toDateString() === dStr)) { cls = "nirvana"; txt = "Nirvana"; }
        if (res.history.bonusDict[iso]) txt += " 🎁";
        html += `<td class="${dStr === new Date().toDateString() ? 'today-highlight' : ''}"><span class="date-num">${current.getDate()}.</span>${txt ? `<span class="tag ${cls}">${txt}</span>` : ''}</td>`;
        if (current.getDay() === 0) html += "</tr><tr>";
        current.setDate(current.getDate() + 1);
        if (current > res.finalEnd && current.getDate() === 1) break;
    }
    safeHTML('calendar', html + "</tr></tbody></table>");
}

// --- Tagebuch (Wiederhergestellt mit Gruppen) ---
function renderDiaryList() {
    const active = getActiveCycle(); if (!active || !active.base.start) return;
    const moodEmojis = ["", "😞", "🙁", "😐", "🙂", "🤩"];
    let curr = parseLocal(active.base.start), today = new Date(), items = [];
    while (toIsoString(curr) <= toIsoString(today)) {
        let iso = toIsoString(curr), log = active.logs[iso], isBase = (iso >= active.base.start && iso <= active.base.end);
        items.push({ iso, date: new Date(curr), log, isBase, mKey: iso.substring(0, 7) });
        curr.setDate(curr.getDate() + 1);
    }
    items.reverse();
    let grouped = {};
    items.forEach(it => { if (!grouped[it.mKey]) grouped[it.mKey] = []; grouped[it.mKey].push(it); });
    let html = "";
    for (let mKey in grouped) {
        let mDate = parseLocal(mKey + "-01");
        html += `<details class="diary-month-group" open><summary class="diary-month-title">${mDate.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' })}</summary><div class="diary-month-content">`;
        grouped[mKey].forEach(it => {
            const mood = (it.log && it.log.mood > 0) ? moodEmojis[it.log.mood] : "➖";
            const badge = it.isBase ? '<span class="diary-badge badge-base">Basis</span>' : (it.log?.type === 'ausrutscher' ? '<span class="diary-badge badge-aus">Rauchen</span>' : '<span class="diary-badge badge-pause">Pause</span>');
            html += `<div class="diary-item"><div><div class="diary-date">${it.date.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit' })}</div>${badge}<div class="diary-meta">Mood: ${mood} | S:${it.log?.s || 0} A:${it.log?.a || 0} M:${it.log?.m || 0}</div>${it.log?.note ? `<div class="diary-note">${it.log.note}</div>` : ''}</div><button class="diary-edit-btn" onclick="openDiaryEdit('${it.iso}')">Edit</button></div>`;
        });
        const notes = active.monthlyNotes?.[mKey] || { erk: '', dtx: '' };
        html += `<div style="margin-top:10px; padding:10px; border-top:1px dashed #eee;"><label>Erkenntnisse:</label><textarea id="note-erk-${mKey}">${notes.erk}</textarea><button class="btn-tool" onclick="saveMonthlyNotes('${mKey}', this)">Speichern</button></div></div></details>`;
    }
    safeHTML('diary-list-content', html);
}

// --- Archiv & Statistik (Wiederhergestellt) ---
function renderArchiv() {
    const today = toIsoString(new Date());
    let totalDays = 0, pauseDays = 0, maxNirvana = 0, totalBreatheMin = 0, highStressResilience = 0, allAusrutscherDates = [];
    
    appData.cycles.forEach(c => {
        const res = globalSimResults.find(r => r.cycleId === c.id); if (!res || res.failed) return;
        res.history.n.forEach(d => { if (toIsoString(d) < today) totalDays++; }); // Vereinfachte Zählung für Bericht
        // Hier werden alle Statistiken berechnet (Clean-Quote, etc.)
        // Da die Engine die Historie liefert, summieren wir die Längen der Arrays
        pauseDays += res.history.r.filter(d => toIsoString(d) < today).length + res.history.n.filter(d => toIsoString(d) < today).length;
        totalDays += res.history.t.length + res.history.a.length + res.history.b.length + res.history.r.length + res.history.n.length;
    });

    safeText('stat-clean-quote', totalDays > 0 ? Math.round((pauseDays / totalDays) * 100) + '%' : '0%');
    safeText('stat-total-days', totalDays);
    
    // Archiv Karten
    let archHtml = "";
    appData.cycles.filter(c => c.status === 'archived').reverse().forEach(c => {
        archHtml += `<div class="archive-card"><div class="archive-header">Zyklus: ${c.base.start}</div><div class="archive-stats">Dauer: ${c.base.tDays} Tage | Basis-Schuld: ${c.base.sLevel}/${c.base.aLevel}</div></div>`;
    });
    safeHTML('archive-container', archHtml || "<p>Noch keine abgeschlossenen Zyklen.</p>");
}

function saveMonthlyNotes(mKey, btn) {
    const active = getActiveCycle(); if(!active) return;
    if(!active.monthlyNotes) active.monthlyNotes = {};
    active.monthlyNotes[mKey] = { erk: document.getElementById(`note-erk-${mKey}`).value, dtx: '' };
    saveData(true);
}