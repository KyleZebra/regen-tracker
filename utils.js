// ==========================================
// utils.js - Modules, Export/Import & PWA
// (Benötigt Variablen/Helfer aus data.js, engine.js, ui.js)
// ==========================================

// --- EXPORT & IMPORT ---
function exportData() {
    let exportObj = JSON.parse(JSON.stringify(getApp())); 
    if (isSandbox) exportObj.isSandbox = true;
    const blob = new Blob([JSON.stringify(exportObj, null, 2)], {type: "application/json"});
    const link = document.createElement('a'); 
    link.href = URL.createObjectURL(blob); 
    link.download = isSandbox ? "lifetracker_simulation.json" : "lifetracker_backup.json"; 
    link.click();
}

function importData(input) {
    const file = input.files[0]; 
    if (!file) return; 
    const reader = new FileReader();
    
    reader.onload = function(e) {
        try {
            let data = JSON.parse(e.target.result);
            
            if (!data || typeof data !== 'object' || (!data.cycles && !data.base && data.tDays === undefined)) {
                throw new Error("Ungültiges Dateiformat. Keine App-Daten gefunden.");
            }
            if (data.cycles && !Array.isArray(data.cycles)) {
                throw new Error("Ungültiges Dateiformat. Zyklen müssen eine Liste sein.");
            }

            if (!isSandbox && data.isSandbox) { 
                input.value = ''; 
                if(typeof customAlert === 'function') return customAlert("Achtung: Dies ist eine Simulations-Datei. Du kannst sie nur im Labor laden!"); 
                return;
            }
            
            if (isSandbox) { 
                sandboxData = data; 
                if(typeof runAllSimulations === 'function') runAllSimulations(); 
                input.value = ''; 
                if(typeof customAlert === 'function') customAlert("Simulation erfolgreich in die Sandbox geladen!");
            } else {
                if (data.version >= 5) { 
                    data.version = 13.1; 
                    appData = data; 
                } else if (data.base && !data.cycles) { 
                    appData = { version: 13.1, cycles: [{ id: Date.now(), status: 'active', base: data.base, logs: data.logs || {} }], breatheLogs: {} };
                } else if (data.tDays !== undefined && !data.base) {
                    let base = { start: data.startDate, end: data.endDate, tDays: parseInt(data.tDays)||0, sLevel: parseInt(data.stress)||0, aLevel: parseInt(data.alcohol)||0, mLevel: 0, isOpen: false };
                    let logs = {}; 
                    if(data.interruptions) { data.interruptions.forEach(int => { logs[int.start] = { type: 'ausrutscher', t: parseInt(int.t)||1, s: parseInt(int.s)||0, a: parseInt(int.a)||0, m: 0 }; }); }
                    appData = { version: 13.1, cycles: [{ id: Date.now(), status: 'active', base: base, logs: logs }], breatheLogs: {} };
                } else { 
                    appData = data; 
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
                
                appData.cycles = Array.isArray(appData.cycles) ? appData.cycles : []; 
                appData.breatheLogs = appData.breatheLogs || {};
                
                if(typeof saveData === 'function') saveData(true); 
                const hasActive = appData.cycles.some(c => c.status === 'active'); 
                if (!hasActive && appData.cycles.length > 0) { sessionStorage.setItem('retrack_target_tab', 'archiv'); }
                
                if(typeof customAlert === 'function') {
                    customAlert("Daten erfolgreich geladen! Die Seite wird nun aktualisiert.", () => { 
                        input.value = ''; 
                        if (!isSandbox) window.location.href = window.location.href.split('?')[0]; 
                    });
                }
            }
        } catch(err) { 
            input.value = ''; 
            if(typeof customAlert === 'function') customAlert("Fehler beim Laden: " + err.message || err); 
        }
    };
    reader.onerror = function() { 
        input.value = ''; 
        if(typeof customAlert === 'function') customAlert("Fehler beim Lesen der Datei auf dem Gerät."); 
    };
    reader.readAsText(file); 
}

function downloadICS() {
    if(!activeSimResult) return; 
    const res = activeSimResult; 
    const activeCycle = getActiveCycle();
    
    if (!activeCycle || !activeCycle.base || !activeCycle.base.start) {
        if(typeof customAlert === 'function') return customAlert("Kein aktiver Zyklus zum Exportieren gefunden.");
        return;
    }
    
    const sLevels = ['Kein', 'Moderat', 'Hoch']; 
    const aLevels = ['Kein', 'Moderat', 'Hoch'];
    const mLevels = ['Kein', 'Moderat', 'Hoch'];
    
    let desc = isSandbox ? `ReTrack SIMULATION\n\n` : `ReTrack V13.1\n\n`;
    desc += `--- Basis-Phase ---\n`;
    desc += `Start: ${parseLocal(activeCycle.base.start).toLocaleDateString('de-DE')}\n`;
    desc += `Ende: ${parseLocal(activeCycle.base.end).toLocaleDateString('de-DE')}\n`;
    desc += `Dauer: ${activeCycle.base.tDays}d ${activeCycle.base.isSmall ? '(Kleiner Tag)' : ''}\n`;
    desc += `Stress (Max): ${sLevels[activeCycle.base.sLevel]}\n`;
    desc += `Alkohol (Max): ${aLevels[activeCycle.base.aLevel]}\n`;
    desc += `Masturbation (M): ${mLevels[activeCycle.base.mLevel || 0]}\n`;
    desc += `${res.basePenaltyStr}\n`;
    
    if(res.history.logDetails.length > 0) {
        desc += `\n--- Rauchen / Logs ---\n`;
        const sortedLogs = [...res.history.logDetails].sort((a,b) => parseLocal(a.date) - parseLocal(b.date));
        sortedLogs.forEach(l => {
            let origLog = (activeCycle.logs || {})[l.date] || {};
            let detailStr = res.history.penaltyDict[l.date] || `Strafe: +${l.p} Tage`;
            let smallTxt = origLog.isSmall ? ' (Kleiner Tag)' : '';
            desc += `[${parseLocal(l.date).toLocaleDateString('de-DE')}] Dauer: ${l.t}d${smallTxt} | S: ${sLevels[l.s]} | A: ${aLevels[l.a]} | M: ${mLevels[origLog.m || 0]} -> ${detailStr}\n`;
        });
    }

    const totalT = res.totalTDaysEver; 
    const totalRegenDebt = res.totalDebtEver; 
    const expectedBaseDebtICS = res.expectedBaseDebt || 0;
    const aufschlag = totalRegenDebt - expectedBaseDebtICS;
    
    desc += `\n--- Gesamtbilanz ---\n`;
    desc += `T-Tage (Konsum) gesamt: ${totalT}\n`; 
    desc += `Basis Schuld gesamt: ${expectedBaseDebtICS} Tage\n`;
    desc += `Zusätzlicher Aufschlag: +${aufschlag} Tage\n`;
    desc += `Regenerationsschuld gesamt: ${totalRegenDebt} Tage\n`;
    desc += `\nEmpfohlene M-freie Tage: ${res.mFreeGoal}\n`;
    desc += `Ziel: ${res.finalEnd.toLocaleDateString('de-DE')}\n`;

    if (activeCycle.monthlyNotes && Object.keys(activeCycle.monthlyNotes).length > 0) {
        desc += `\n--- Monats-Notizen ---\n`;
        const monthNames = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
        Object.keys(activeCycle.monthlyNotes).sort().forEach(mKey => {
            let parts = mKey.split('-');
            let mName = `${monthNames[parseInt(parts[1])-1]} ${parts[0]}`;
            let notes = activeCycle.monthlyNotes[mKey];
            if (notes.erk || notes.dtx) {
                desc += `${mName}:\n`;
                if (notes.erk) desc += ` Erkenntnisse: ${notes.erk.replace(/\n/g, ' ')}\n`;
                if (notes.dtx) desc += ` DTX: ${notes.dtx.replace(/\n/g, ' ')}\n`;
            }
        });
    }

    const exportDates = [...res.history.b, ...res.history.r].sort((a,b) => a-b);
    if(exportDates.length === 0) {
        if(typeof customAlert === 'function') return customAlert("Keine Erholungstage zum Exportieren gefunden.");
        return;
    }
    
    const start = exportDates[0]; 
    const end = addDays(exportDates[exportDates.length - 1], 1); 
    const formatDate = d => `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;
    
    const ics = `BEGIN:VCALENDAR\nVERSION:2.0\nBEGIN:VEVENT\nUID:${Date.now()}@regenrechner\nDTSTAMP:${formatDate(new Date())}T000000Z\nDTSTART;VALUE=DATE:${formatDate(start)}\nDTEND;VALUE=DATE:${formatDate(end)}\nSUMMARY:${isSandbox ? 'Simulation:' : ''} Regenerationsphase (${exportDates.length} Tage)\nDESCRIPTION:${desc.replace(/\n/g, '\\n')}\nEND:VEVENT\nEND:VCALENDAR`;
    const blob = new Blob([ics], { type: "text/calendar" }); 
    const link = document.createElement("a"); 
    link.href = URL.createObjectURL(blob); 
    link.download = isSandbox ? "simulation.ics" : "regeneration.ics"; 
    link.click();
}

function exportDiaryTxt() {
    const activeCycle = getActiveCycle();
    if (!activeCycle || !activeCycle.base || !activeCycle.base.start) {
        if(typeof customAlert === 'function') return customAlert("Kein aktiver Zyklus zum Exportieren gefunden.");
        return;
    }

    let txt = isSandbox ? `ReTrack SIMULATION TAGEBUCH\n\n` : `ReTrack TAGEBUCH\n\n`;

    let curr = parseLocal(activeCycle.base.start);
    const todayStr = toIsoString(new Date());
    let endStr = isSandbox ? (activeSimResult && activeSimResult.finalEnd ? toIsoString(activeSimResult.finalEnd) : todayStr) : todayStr;

    const sLevels = ['S:0', 'S:1', 'S:2'];
    const aLevels = ['A:0', 'A:1', 'A:2'];
    const mLevels = ['M:0', 'M:1', 'M:2'];
    const moodEmojis = ["➖", "😞", "🙁", "😐", "🙂", "🤩"];

    while (toIsoString(curr) <= endStr) {
        let dStr = toIsoString(curr);
        let log = (activeCycle.logs || {})[dStr];
        let isBaseDay = (dStr >= activeCycle.base.start && dStr <= activeCycle.base.end);
        let formattedDate = curr.toLocaleDateString('de-DE', {weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric'});

        if (isBaseDay || log) {
            let note = (log && log.note) ? log.note : "";
            let mood = (log && log.mood > 0) ? log.mood : 0;
            let moodStr = mood > 0 ? moodEmojis[mood] : "➖";

            let typeStr = "";
            let metaStr = "";

            if (isBaseDay) {
                typeStr = activeCycle.base.isSmall ? "Basis-Phase (Klein)" : "Basis-Phase";
                metaStr = `S:${sLevels[activeCycle.base.sLevel||0]} | A:${aLevels[activeCycle.base.aLevel||0]} | M:${mLevels[activeCycle.base.mLevel||0]} | Mood: ${moodStr}`;
            } else {
                if (log.type === 'ausrutscher') {
                    typeStr = log.isSmall ? `Rauchen (${log.t}d, Klein)` : `Rauchen (${log.t}d)`;
                } else {
                    typeStr = "Pause";
                }
                metaStr = `${sLevels[log.s||0]} | ${aLevels[log.a||0]} | ${mLevels[log.m||0]} | Mood: ${moodStr}`;
            }

            txt += `${formattedDate} | ${typeStr} | ${metaStr}\n`;
            if (note) {
                txt += `Notiz: ${note}\n`;
            }
            txt += `--------------------------------------------------\n`;
        }
        curr.setDate(curr.getDate() + 1);
    }

    const blob = new Blob([txt], { type: "text/plain;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = isSandbox ? "simulation_tagebuch.txt" : "tagebuch.txt";
    link.click();
}

function downloadImage() {
    if (typeof html2canvas === 'undefined') {
        console.error("html2canvas is not loaded");
        if(typeof customAlert === 'function') customAlert("Fehler: Bildexport-Bibliothek nicht geladen.");
        return;
    }
    const exportCard = document.getElementById("export-card"); 
    if(!exportCard) return;
    const wrapper = exportCard.querySelector('.calendar-wrapper');
    const oldOverflow = wrapper.style.overflowX; 
    const oldWidth = exportCard.style.width;
    
    wrapper.style.overflowX = 'visible'; 
    exportCard.style.width = wrapper.scrollWidth + 40 + 'px'; 
    
    html2canvas(exportCard, { scale: 2, backgroundColor: isSandbox ? "#f5eef8" : "#ffffff" }).then(canvas => {
        wrapper.style.overflowX = oldOverflow; 
        exportCard.style.width = oldWidth;
        const link = document.createElement("a"); 
        link.download = isSandbox ? "simulation_zyklus.png" : "aktueller_zyklus.png"; 
        link.href = canvas.toDataURL("image/png"); 
        link.click();
    });
}

// --- BREATHE MODULE ---
let isBreatheActive = false; 
let brAnimationId = null; 
let brStartTime = 0; 
let brTotalDuration = 0; 
let brCurrentPhase = -1; 
let brWakeLock = null; 
let audioCtx = null;

function openBreatheOverlay() { 
    if (isBreatheActive) return; 
    safeDisplay('breathe-overlay', 'flex'); 
    safeDisplay('br-setup', 'block'); 
    safeDisplay('br-active', 'none'); 
    safeDisplay('br-done', 'none'); 
    
    safeSetVal('br-duration', 3); 
    safeText('br-duration-display', '3');
}

async function requestWakeLock() { 
    try { if ('wakeLock' in navigator) brWakeLock = await navigator.wakeLock.request('screen'); } catch (err) {} 
}

function releaseWakeLock() { 
    if (brWakeLock !== null) { brWakeLock.release(); brWakeLock = null; } 
}

function initAudio() { 
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)(); 
    if (audioCtx.state === 'suspended') audioCtx.resume(); 
}

function playPhaseSound(phase) {
    if (!audioCtx) return; 
    const osc = audioCtx.createOscillator(); 
    const gain = audioCtx.createGain(); 
    osc.connect(gain); 
    gain.connect(audioCtx.destination); 
    const now = audioCtx.currentTime;
    
    if (phase === 0) { 
        osc.type = 'sine'; 
        osc.frequency.setValueAtTime(261.63, now); 
        osc.frequency.linearRampToValueAtTime(329.63, now + 4); 
        gain.gain.setValueAtTime(0, now); 
        gain.gain.linearRampToValueAtTime(0.3, now + 1); 
        gain.gain.setValueAtTime(0.3, now + 3); 
        gain.gain.linearRampToValueAtTime(0, now + 4); 
        osc.start(now); 
        osc.stop(now + 4);
    } else if (phase === 1) { 
        osc.type = 'triangle'; 
        osc.frequency.setValueAtTime(659.25, now); 
        gain.gain.setValueAtTime(0, now); 
        gain.gain.linearRampToValueAtTime(0.15, now + 0.05); 
        gain.gain.exponentialRampToValueAtTime(0.001, now + 2); 
        osc.start(now); 
        osc.stop(now + 2);
    } else if (phase === 2) { 
        osc.type = 'sine'; 
        osc.frequency.setValueAtTime(329.63, now); 
        osc.frequency.linearRampToValueAtTime(196.00, now + 4); 
        gain.gain.setValueAtTime(0, now); 
        gain.gain.linearRampToValueAtTime(0.3, now + 1); 
        gain.gain.setValueAtTime(0.3, now + 3); 
        gain.gain.linearRampToValueAtTime(0, now + 4); 
        osc.start(now); 
        osc.stop(now + 4);
    } else if (phase === 3) { 
        osc.type = 'triangle'; 
        osc.frequency.setValueAtTime(440.00, now); 
        gain.gain.setValueAtTime(0, now); 
        gain.gain.linearRampToValueAtTime(0.2, now + 0.05); 
        gain.gain.exponentialRampToValueAtTime(0.001, now + 1.5); 
        osc.start(now); 
        osc.stop(now + 1.5); 
    }
}

function startBreathe() {
    const minutes = parseInt(safeVal('br-duration')); 
    if (isNaN(minutes) || minutes < 1 || minutes > 60) {
        if(typeof customAlert === 'function') return customAlert("Bitte eine Dauer zwischen 1 und 60 Minuten wählen.");
        return;
    }
    
    brTotalDuration = minutes * 60 * 1000; 
    isBreatheActive = true; 
    brStartTime = 0; 
    brCurrentPhase = -1;
    
    safeDisplay('br-setup', 'none'); 
    safeDisplay('br-active', 'flex');
    
    initAudio(); 
    requestWakeLock(); 
    brAnimationId = requestAnimationFrame(breatheLoop);
}

function breatheLoop(timestamp) {
    if (!isBreatheActive) return; 
    if (!brStartTime) brStartTime = timestamp;
    
    const elapsed = timestamp - brStartTime; 
    const timeLeft = brTotalDuration - elapsed;
    
    if (timeLeft <= 0) { finishBreathe(); return; }
    
    const secsLeft = Math.ceil(timeLeft / 1000); 
    const m = String(Math.floor(secsLeft / 60)).padStart(2, '0'); 
    const s = String(secsLeft % 60).padStart(2, '0'); 
    safeText('br-timer', `${m}:${s}`);
    
    const cycleTime = elapsed % 16000; 
    let phase = Math.floor(cycleTime / 4000); 
    let phaseProgress = (cycleTime % 4000) / 4000; 
    
    if (phase !== brCurrentPhase) {
        brCurrentPhase = phase; 
        playPhaseSound(phase); 
        const textEl = document.getElementById('br-text');
        if (textEl) {
            if (phase === 0) { textEl.textContent = "Einatmen"; textEl.style.color = "#ecf0f1"; } 
            else if (phase === 1) { textEl.textContent = "Halten"; textEl.style.color = "#f1c40f"; } 
            else if (phase === 2) { textEl.textContent = "Ausatmen"; textEl.style.color = "#ecf0f1"; } 
            else if (phase === 3) { textEl.textContent = "Halten"; textEl.style.color = "#95a5a6"; }
        }
    }
    
    const circle = document.getElementById('br-circle'); 
    let scale = 1;
    
    if (phase === 0) { 
        const ease = phaseProgress < 0.5 ? 2 * phaseProgress * phaseProgress : 1 - Math.pow(-2 * phaseProgress + 2, 2) / 2; 
        scale = 1 + ease * 1.8; 
    } else if (phase === 1) { 
        scale = 2.8; 
    } else if (phase === 2) { 
        const ease = phaseProgress < 0.5 ? 2 * phaseProgress * phaseProgress : 1 - Math.pow(-2 * phaseProgress + 2, 2) / 2; 
        scale = 2.8 - ease * 1.8; 
    } else if (phase === 3) { 
        scale = 1; 
    }
    
    if(circle) circle.style.transform = `scale(${scale})`; 
    brAnimationId = requestAnimationFrame(breatheLoop);
}

function finishBreathe() {
    isBreatheActive = false; 
    cancelAnimationFrame(brAnimationId); 
    releaseWakeLock();
    
    if (audioCtx) { 
        const now = audioCtx.currentTime; 
        const osc = audioCtx.createOscillator(); 
        const gain = audioCtx.createGain(); 
        osc.connect(gain); 
        gain.connect(audioCtx.destination); 
        osc.type = 'sine'; 
        osc.frequency.setValueAtTime(440, now); 
        osc.frequency.setValueAtTime(523.25, now + 1); 
        gain.gain.setValueAtTime(0, now); 
        gain.gain.linearRampToValueAtTime(0.3, now + 0.1); 
        gain.gain.exponentialRampToValueAtTime(0.001, now + 3); 
        osc.start(now); 
        osc.stop(now + 3); 
    }
    
    safeDisplay('br-active', 'none'); 
    safeDisplay('br-done', 'block');
    
    const todayStr = toIsoString(new Date()); 
    if (!appData.breatheLogs) appData.breatheLogs = {}; 
    
    let currentLog = appData.breatheLogs[todayStr];
    if (typeof currentLog === 'number') {
        currentLog = { count: currentLog, minutes: currentLog * 3 };
    } else if (!currentLog) {
        currentLog = { count: 0, minutes: 0 };
    }
    
    currentLog.count += 1;
    currentLog.minutes += Math.round(brTotalDuration / 60000); 
    
    appData.breatheLogs[todayStr] = currentLog;
    
    localStorage.setItem('regenAppData_v6', JSON.stringify(appData)); 
    
    if (isSandbox && sandboxData) { 
        sandboxData.breatheLogs = JSON.parse(JSON.stringify(appData.breatheLogs)); 
    }
    
    if(typeof updateUI === 'function') updateUI(); 
    if (document.getElementById('diary-container')?.style.display === 'block') { 
        if(typeof renderDiaryList === 'function') renderDiaryList(); 
    }
}

function abortBreathe() { 
    isBreatheActive = false; 
    if (brAnimationId) cancelAnimationFrame(brAnimationId); 
    releaseWakeLock(); 
    safeDisplay('breathe-overlay', 'none'); 
}

// --- SW UPDATE LOGIC ---
let newWorker; 
function applyPwaUpdate() { 
    if (newWorker) newWorker.postMessage({ action: 'skipWaiting' }); 
}

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js').then(reg => {
            reg.addEventListener('updatefound', () => { 
                newWorker = reg.installing; 
                newWorker.addEventListener('statechange', () => { 
                    if (newWorker.state === 'installed' && navigator.serviceWorker.controller) { 
                        safeDisplay('update-banner', 'block'); 
                    } 
                }); 
            });
        }).catch(err => console.error('Service Worker Fehler', err));
        
        let refreshing; 
        navigator.serviceWorker.addEventListener('controllerchange', () => { 
            if (refreshing) return; 
            refreshing = true; 
            window.location.reload(); 
        });
    });
}