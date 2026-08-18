// ==========================================
// engine.js - Core Mathematics & Simulation
// (Benötigt Variablen aus data.js)
// ==========================================

function calculateBudget(targetETAStr) {
    let active = getActiveCycle();
    if (!active || !activeSimResult || activeSimResult.failed) {
        return { budget: 0, over: false };
    }

    let targetDate = parseLocal(targetETAStr);
    if (!targetDate || isNaN(targetDate.getTime())) {
        return { budget: 0, over: false };
    }

    // Budget Simulation - STRENG (ohne Phantom-Log für heute!)
    let testCycle = JSON.parse(JSON.stringify(active));
    if (!testCycle.logs) testCycle.logs = {};
    
    // Konfiguration für den ausgewählten Phantom-Log
    let bType = active.budgetType || "standard";
    let pIsSmall = false, pIsActive = false, pA = 0, jumpDays = 4;
    
    if (bType === "small-active") { pIsSmall = true; pIsActive = true; jumpDays = 2; }
    else if (bType === "small") { pIsSmall = true; pIsActive = false; jumpDays = 3; }
    else if (bType === "standard") { pIsSmall = false; pIsActive = false; jumpDays = 4; }
    else if (bType === "heavy") { pIsSmall = false; pIsActive = false; pA = 1; jumpDays = 5; } // Moderater Alk = +1 Strafe

    let resCheck = simulateCycle(testCycle);
    let currentEnd = resCheck && !resCheck.failed ? new Date(resCheck.finalEnd) : new Date(activeSimResult.finalEnd);

    if (currentEnd > targetDate) {
        return { budget: diffDays(targetDate, currentEnd), over: true };
    }

    let budget = 0;
    let safety = 0;
    let simDate = new Date();
    simDate.setDate(simDate.getDate() + 1);

    while (budget < 50 && safety < 150) {
        safety++;
        let testDateStr = toIsoString(simDate);

        if (testCycle.logs[testDateStr] !== undefined) {
            simDate.setDate(simDate.getDate() + 1);
            continue;
        }

        testCycle.logs[testDateStr] = {
            type: 'ausrutscher',
            t: 1,
            s: 0,
            a: pA,
            m: 0,
            mood: 0,
            note: "Budget-Test",
            isSimulated: true,
            isSmall: pIsSmall,
            isActive: pIsActive
        };

        let res = simulateCycle(testCycle);

        if (res && !res.failed && res.finalEnd <= targetDate) {
            budget++;
            // Der dynamische Sprung verhindert, dass die Phantom-Tage als Ketten-Rauchen zusammengefasst werden
            simDate.setDate(simDate.getDate() + jumpDays); 
        } else {
            break;
        }
    }
    return { budget: budget, over: false };
}

function runAllSimulations() {
    try {
        const app = getApp();
        globalSimResults = (app.cycles || []).map(cycle => simulateCycle(cycle));

        let activeIdx = (app.cycles || []).findIndex(c => c.status === 'active');
        activeSimResult = activeIdx !== -1 ? globalSimResults[activeIdx] : null;

        if (typeof updateUI === 'function') {
            updateUI();
        }
    } catch (e) {
        console.error("Simulation crash", e);
    }
}

// FIX V22: Skip-Parameter hinzugefügt für das Nirwana-Echo
function simulateCycle(cycle, skipEchoCheck = false) {
    try {
        if (!cycle || !cycle.base || !cycle.base.start || !cycle.base.end) {
            return { failed: true, cycleId: cycle ? cycle.id : 'unknown', errorMessage: "Daten unvollständig." };
        }

        // FIX V40: Isolvenz-Erkennung
        let isInsolvency = cycle.base.isInsolvency === true;
        let baseT = isInsolvency ? 0 : (cycle.base.tDays || 1);
        let isBaseSmall = cycle.base.isSmall === true;
        let isBaseActive = cycle.base.isActive === true; // NEU

        let baseVal = isInsolvency ? 21 : (isBaseSmall ? (baseT * 2) : (baseT * 3));
        let expectedBaseDebt = baseVal;

        let sAdd = 0, aAdd = 0, comboAdd = 0;
        if (!isInsolvency) {
            if (baseT < 4) {
                sAdd = (cycle.base.sLevel === 1 ? 1 : cycle.base.sLevel === 2 ? 2 : 0);
                aAdd = (cycle.base.aLevel === 1 ? 1 : cycle.base.aLevel === 2 ? 2 : 0);
            } else {
                sAdd = Math.ceil(baseVal * (cycle.base.sLevel === 1 ? 0.1 : cycle.base.sLevel === 2 ? 0.25 : 0));
                aAdd = Math.ceil(baseVal * (cycle.base.aLevel === 1 ? 0.1 : cycle.base.aLevel === 2 ? 0.25 : 0));
            }
            comboAdd = (cycle.base.sLevel === 2 && cycle.base.aLevel === 2) ? 1 : 0;
        }

        // FIX V25.1: Extrem robuste Absicherung des manuellen Aufschlags
        let manualSurcharge = 0;
        if (cycle && cycle.manualSurcharge !== undefined && cycle.manualSurcharge !== null) {
            manualSurcharge = parseInt(cycle.manualSurcharge);
            if (isNaN(manualSurcharge) || manualSurcharge < 0) manualSurcharge = 0;
        }

        // FIX V22: Nirwana-Echo aus dem vorherigen Zyklus ermitteln
        let hasNirvanaEcho = false;
        if (!skipEchoCheck) {
            let app = getApp();
            let cycleIndex = app.cycles.findIndex(c => c.id === cycle.id);
            if (cycleIndex > 0) {
                let prevCycle = app.cycles[cycleIndex - 1];
                let prevRes = simulateCycle(prevCycle, true); // true = Verhindert Endlosschleife
                if (prevRes && !prevRes.failed) {
                    let prevSmoked = prevRes.history.t.length + prevRes.history.a.length;
                    let prevNirvana = prevRes.history.n.length;
                    // FIX V44.1: Das Echo zündet auch bei makellosen Zyklen (z.B. nach Insolvenz)
                    if (prevNirvana > 0 && prevNirvana >= prevSmoked) {
                        hasNirvanaEcho = true;
                    }
                }
            }
        }

        let totalActiveDiscountEver = 0; // NEU: Kumulierter Reporting-Wert für den Aktivbonus
        
        let initialDebtTotal = baseVal + sAdd + aAdd + comboAdd;
        let activeDiscount = 0;
        let appliedBaseDiscount = 0;
        
        // FIX V44: Aktiv-Rabatt für die Basisphase (1 Tag Rabatt pro Basis-Tag)
        if (!isInsolvency && isBaseActive) {
            activeDiscount = baseT; 
            let grossInitialDebt = initialDebtTotal;
            // Die Schuld für die gesamte Basis-Phase darf nie kleiner werden als die Anzahl der Konsumtage
            initialDebtTotal = Math.max(baseT, initialDebtTotal - activeDiscount);
            appliedBaseDiscount = grossInitialDebt - initialDebtTotal;
            totalActiveDiscountEver += appliedBaseDiscount;
        }
        
        let smallTxt = isBaseSmall ? " (Kleiner Tag)" : " (Standardtag)";
        let activeTxt = isBaseActive ? " 🏃‍♂️" : "";
        let activeBonusStr = appliedBaseDiscount > 0 ? `, Aktivbonus enthalten: -${appliedBaseDiscount}` : "";
        let basePenaltyStr = isInsolvency ? `Initiale Schuld: 21 Tage (Insolvenz-Neustart)` : `Initiale Schuld: ${initialDebtTotal} Tage netto (Basis: ${baseVal}${smallTxt}${activeTxt}, Stress: ${sAdd}, Alk: ${aAdd}, Kombi: ${comboAdd}${activeBonusStr})`;

        let debt = initialDebtTotal + manualSurcharge;
        let totalDebtEver = debt;
        let totalTDaysEver = baseT;

        // FIX V40: Insolvenz generiert (wie kleine Tage) sofort den Start ins Nirwana/Regeneration
        let currentBlockTargetBew = (isBaseSmall || isInsolvency) ? 0 : 3;
        let currentBlockServed = 0;
        let bewTimer = currentBlockTargetBew - currentBlockServed;
        
        let state = bewTimer > 0 ? 'BEWAEHRUNG' : 'REGEN';
        let withheldBonus = 0;
        let hasPaidPauschaleThisCluster = bewTimer > 0;
        let currentBewDays = [];

        let pEnd = parseLocal(cycle.base.end);
        if (!pEnd || isNaN(pEnd.getTime())) {
            return { failed: true, cycleId: cycle.id, errorMessage: `Ungültiges Enddatum` };
        }

        let simDate = new Date(pEnd);
        simDate.setDate(simDate.getDate() + 1);

        let todayObj = new Date();
        let todayStr = toIsoString(todayObj);
        let yesterdayStr = toIsoString(addDays(todayObj, -1));

        let app = getApp();
        let cycleIndex = app.cycles.findIndex(c => c.id === cycle.id);
        let nextCycle = cycleIndex !== -1 ? app.cycles[cycleIndex + 1] : null;

        let endSimLimit = todayStr;
        if (nextCycle && nextCycle.base && nextCycle.base.start) {
            let nxStart = parseLocal(nextCycle.base.start);
            if (nxStart && !isNaN(nxStart.getTime())) {
                endSimLimit = toIsoString(addDays(nxStart, -1));
            }
        } else {
            let logsStr = Object.keys(cycle.logs || {}).sort();
            if (logsStr.length > 0 && logsStr[logsStr.length - 1] > endSimLimit) {
                let maxSim = logsStr[logsStr.length - 1];
                if (isSandbox || (cycle.logs[maxSim] && cycle.logs[maxSim].isSimulated)) {
                    endSimLimit = maxSim;
                }
            }
        }

        let activeAusrutscherDays = 0;
        // FIX V66: Tägliches Kassenbuch für das Diagramm
        let history = { t: [], r: [], b: [], a: [], n: [], logDetails: [], penaltyDict: {}, bonusDict: {}, dailyDebt: {} };

        // --- NEU: Langzeit-Ampel State (Initialisierung) ---
        let tlState = { window28: [], cleanStreak: 0, daysSinceLongPause: 0, isStickyRed: false, color: 'GRÜN' };
        
        let cBase = parseLocal(cycle.base.start);
        let endBase = parseLocal(cycle.base.end);
        
        // Die initiale Basis-Phase wird vorab als Konsum in die Ampel geladen
        if (cBase && endBase && !isNaN(cBase.getTime())) {
            let tempD = new Date(cBase);
            while (tempD <= endBase) {
                tlState.window28.push(true);
                if (tlState.window28.length > 28) tlState.window28.shift();
                tlState.cleanStreak = 0;
                tlState.daysSinceLongPause++;
                
                let konsum28 = tlState.window28.filter(x => x).length;
                let maxSer = 0, curSer = 0;
                for (let x of tlState.window28) { if (x) { curSer++; maxSer = Math.max(maxSer, curSer); } else { curSer = 0; } }
                
                let colA = konsum28 >= 9 ? 'ROT' : (konsum28 >= 5 ? 'GELB' : 'GRÜN');
                let colB = maxSer >= 4 ? 'ROT' : (maxSer >= 2 ? 'GELB' : 'GRÜN');
                let colC = tlState.daysSinceLongPause >= 85 ? 'ROT' : (tlState.daysSinceLongPause >= 43 ? 'GELB' : 'GRÜN');
                
                if (colA === 'ROT' || colB === 'ROT' || colC === 'ROT') tlState.isStickyRed = true;
                
                tempD.setDate(tempD.getDate() + 1);
            }
        }

        if (!cBase || isNaN(cBase.getTime())) {
            return { failed: true, cycleId: cycle.id, errorMessage: `Ungültiges Startdatum` };
        }

        if (cBase && endBase) {
            while (cBase <= endBase) {
                history.t.push(new Date(cBase));
                cBase.setDate(cBase.getDate() + 1);
            }
        }

        let safety = 0;
        let dashState = null;
        let finalDebtZeroDate = null;
        let gotBonusForToday = false;
        let todayBonusPending = false; 
        let todayNirvanaPending = false; // NEU: Flag für das ausstehende Nirwana
        let cLogs = cycle.logs || {};
        
        // FIX V26.1: Fehlende Deklaration wiederhergestellt (Behebt den Absturz der Engine)
        let lastRealDayStr = (cLogs[todayStr] && typeof cLogs[todayStr] === 'object' && cLogs[todayStr].type !== undefined) ? todayStr : yesterdayStr;

        let dStr, log, isLogged, isFuture, isPast, isToday, isLogSmall, iBase, iS, iA, iC, pauschale, penalty, canPayout, pStr, isPhantom;
        
        // FIX V35: Tracker für die letzten 3 Events (mit Absoluter Regeneration als Anker)
        let recentEvents = [{
            date: cycle.base.end || toIsoString(new Date()),
            added: initialDebtTotal + manualSurcharge,
            regenAtEvent: 0
        }];

        // FIX V44: Charge-System für das Nirwana-Echo (Zündet jetzt auch korrekt für die initiale Basis-Phase!)
        let reboundCharges = (hasNirvanaEcho && isBaseSmall) ? 2 : 0;
        let currentAusrutscherIsSmall = isBaseSmall;

        // FIX V40.2: Archivierte Zyklen dürfen niemals in die Zukunft "fabulieren" (nur der aktive Zyklus darf das)
        while ((toIsoString(simDate) <= endSimLimit || (cycle.status === 'active' && debt > 0)) && safety < 25000) {
            safety++;
            dStr = toIsoString(simDate);
            log = cLogs[dStr];
            isFuture = dStr > todayStr;
            isPast = dStr < todayStr;
            isToday = dStr === todayStr;
            isLogged = log && typeof log === 'object' && log.type !== undefined;
            isPhantom = log && log.isSimulated === true;

            // --- NEU: Langzeit-Ampel tägliches Update ---
            let isConsumptionDay = false;
            if (activeAusrutscherDays > 0 || (log && log.type === 'ausrutscher')) isConsumptionDay = true;
            
            tlState.window28.push(isConsumptionDay);
            if (tlState.window28.length > 28) tlState.window28.shift();
            
            if (!isConsumptionDay) {
                tlState.cleanStreak++;
                if (tlState.cleanStreak >= 14) {
                    tlState.daysSinceLongPause = 0;
                    tlState.isStickyRed = false; // Sticky ROT aufheben!
                } else {
                    tlState.daysSinceLongPause++;
                }
            } else {
                tlState.cleanStreak = 0;
                tlState.daysSinceLongPause++;
            }
            
            let konsum28 = tlState.window28.filter(x => x).length;
            let maxSer = 0, curSer = 0;
            for (let x of tlState.window28) { if (x) { curSer++; maxSer = Math.max(maxSer, curSer); } else { curSer = 0; } }
            
            let colA = konsum28 >= 9 ? 'ROT' : (konsum28 >= 5 ? 'GELB' : 'GRÜN');
            let colB = maxSer >= 4 ? 'ROT' : (maxSer >= 2 ? 'GELB' : 'GRÜN');
            let colC = tlState.daysSinceLongPause >= 85 ? 'ROT' : (tlState.daysSinceLongPause >= 43 ? 'GELB' : 'GRÜN');
            
            let rawColor = 'GRÜN';
            if (colA === 'ROT' || colB === 'ROT' || colC === 'ROT') rawColor = 'ROT';
            else if (colA === 'GELB' || colB === 'GELB' || colC === 'GELB') rawColor = 'GELB';
            
            if (rawColor === 'ROT') tlState.isStickyRed = true;
            tlState.color = tlState.isStickyRed ? 'ROT' : rawColor;
            // --- ENDE Ampel Update ---

            if (activeAusrutscherDays > 0) {
                history.a.push(new Date(simDate));
                activeAusrutscherDays--;
                
                // Echo-Ladungen beim initialen Log setzen (NUR wenn Echo aktiv ist!)
                if (currentAusrutscherIsSmall && hasNirvanaEcho) reboundCharges = 2;
                else reboundCharges = 0;
                
                // --- NEU: Ampel-Sanktionen anwenden ---
                let appliedSmall = isLogSmall;
                let appliedActive = isLogActive;
                if (tlState.color === 'GELB' || tlState.color === 'ROT') {
                    appliedSmall = false; // Rabatt gesperrt
                    appliedActive = false; // Rabatt gesperrt
                }

                iBase = appliedSmall ? (log.t * 2) : (log.t * 3);
                expectedBaseDebt += iBase;

                iS = log.t < 4 ? (log.s===1 ? 1 : log.s===2 ? 2 : 0) : Math.ceil(iBase * (log.s===1 ? 0.1 : log.s===2 ? 0.25 : 0));
                iA = log.t < 4 ? (log.a===1 ? 1 : log.a===2 ? 2 : 0) : Math.ceil(iBase * (log.a===1 ? 0.1 : log.a===2 ? 0.25 : 0));
                iC = (log.s===2 && log.a===2) ? 1 : 0;

                pauschale = hasPaidPauschaleThisCluster ? 0 : 1;
                penalty = iBase + iS + iA + iC + pauschale;
                
                // FIX V44: Aktiv-Rabatt für das Log
                let logActiveDiscount = 0;
                let actualLogDiscount = 0;
                if (appliedActive) {
                    logActiveDiscount = log.t;
                    let grossPenalty = penalty;
                    penalty = Math.max(log.t, penalty - logActiveDiscount);
                    actualLogDiscount = grossPenalty - penalty;
                    totalActiveDiscountEver += actualLogDiscount;
                }
                
                // Der rote x2 Multiplikator
                if (tlState.color === 'ROT') {
                    penalty *= 2; 
                }

                debt += penalty;
                totalDebtEver += penalty;

                // FIX V35: Absolute Regeneration als unbestechlichen Anker im Array festhalten
                recentEvents.unshift({ date: dStr, added: penalty, regenAtEvent: (totalDebtEver - debt) });
                if (recentEvents.length > 3) recentEvents.pop();

                finalDebtZeroDate = null;

                if (!hasPaidPauschaleThisCluster) {
                    currentBlockTargetBew = isLogSmall ? 0 : (log.t * 3); // Bewährung ignoriert Ampel für Konsistenz
                    currentBlockServed = 0;
                    hasPaidPauschaleThisCluster = true;
                } else {
                    currentBlockTargetBew += isLogSmall ? 0 : (log.t * 3);
                }

                bewTimer = currentBlockTargetBew - currentBlockServed;

                // FIX V22: Wenn Bewährung 0 ist, direkt in REGEN schalten! (Und Pauschale wieder scharfschalten)
                if (bewTimer <= 0) {
                    state = 'REGEN';
                    hasPaidPauschaleThisCluster = false; // Bei Ketten-Konsum greift morgen sofort die +1 Pauschale!
                    currentBlockTargetBew = 0;
                    currentBlockServed = 0;
                } else {
                    state = 'BEWAEHRUNG';
                }

                if (currentBewDays.length > 0) {
                    history.b.push(...currentBewDays);
                    currentBewDays = [];
                }
                withheldBonus = 0;

                if (!isPhantom) {
                    history.logDetails.push({ date: dStr, p: penalty, t: log.t, b: iBase, s: iS, a: iA, f: pauschale, active: appliedActive });
                    let smallInfo = isLogSmall ? (appliedSmall ? " (Kleiner Tag)" : " (Kl. Tag ignoriert)") : " (Standardtag)";
                    let activeInfo = isLogActive ? (appliedActive ? ` 🏃‍♂️ (Aktivbonus enthalten: -${actualLogDiscount})` : " 🏃‍♂️ (Aktiv ignoriert)") : "";
                    let tlInfo = tlState.color === 'ROT' ? ' 🔴x2' : (tlState.color === 'GELB' ? ' 🟡Kein Rabatt' : '');
                    pStr = actualLogDiscount > 0 ? `+${penalty} Tage netto` : `+${penalty} Tage`;
                    history.penaltyDict[dStr] = pauschale > 0 ? pStr + ` (inkl. Setup)${smallInfo}${activeInfo}${tlInfo}` : pStr + ` (Stottern)${smallInfo}${activeInfo}${tlInfo}`;
                }
            } else {
                if (debt > 0) {
                    if (state === 'BEWAEHRUNG') {
                        debt -= 0.5;
                        withheldBonus += 0.5;
                        bewTimer--;
                        currentBlockServed++;
                        currentBewDays.push(new Date(simDate));

                        if (bewTimer <= 0) {
                            canPayout = isPast || (isToday && isLogged) || isFuture || isSandbox || isPhantom;

                            // Die Strikte Geisel-Regel
                            if (isToday && !isLogged && !isSandbox && !isPhantom) {
                                canPayout = false;
                                history.bonusDict[dStr] = `🎁 Bonus bereit (Log heute fehlt!)`;
                                todayBonusPending = true;
                            }

                            if (canPayout) {
                                debt -= withheldBonus;
                                if (debt < 0) debt = 0;

                                if (isToday && isLogged && !isPhantom) {
                                    gotBonusForToday = true;
                                }

                                if (withheldBonus > 0 && !isPhantom) {
                                    history.bonusDict[dStr] = `🎉 Bonus: -${withheldBonus}`;
                                }
                            }
                                
                            // OPTISCHE TRENNUNG: Tage in der Zukunft bleiben strikt orange!
                            // Nur wenn die Auszahlung genehmigt ist UND das Ereignis in der echten 
                            // Gegenwart/Vergangenheit liegt, wird es grün.
                            if (canPayout && !isFuture) {
                                history.r.push(...currentBewDays);
                            } else {
                                history.b.push(...currentBewDays);
                            }

                            currentBewDays = [];
                            withheldBonus = 0;
                            state = 'REGEN';
                            hasPaidPauschaleThisCluster = false;
                            currentBlockTargetBew = 0;
                            currentBlockServed = 0;
                        }
                    } else { // state === 'REGEN'
                        let reduction = 1.0;
                        
                        // FIX V25.1: Mehrstufiges Nirwana-Echo (Verbraucht offene Ladungen mit Zähler)
                        if (hasNirvanaEcho && reboundCharges > 0) {
                            reduction = 2.0;
                            let chargeNum = 3 - reboundCharges; // Wird zu 1 oder 2
                            reboundCharges--;
                            if (!isPhantom) {
                                history.bonusDict[dStr] = `🌠 Nirwana-Echo (Ladung ${chargeNum}/2): -2.0 Tage`;
                            }
                        }

                        debt -= reduction;
                        if (debt < 0) debt = 0;
                        history.r.push(new Date(simDate));
                    }

                    if (debt <= 0 && !finalDebtZeroDate) {
                        finalDebtZeroDate = new Date(simDate);
                    }
               } else {
                    if (isPast || (isToday && isLogged) || isSandbox || isFuture || isPhantom) {
                        history.n.push(new Date(simDate));
                    } else if (isToday && !isLogged) {
                        // NEU: Optische Schranke. Heute bleibt grün, bis geloggt wird!
                        history.r.push(new Date(simDate));
                        todayNirvanaPending = true;
                    }
                }
            }

            if (dStr === lastRealDayStr && cycle.status === 'active') {
                dashState = { debt, totalDebtEver, state, bewTimer, gotBonusToday: (isToday) ? gotBonusForToday : false, pendingBonus: false, activeReboundCharges: reboundCharges, recentEvents: JSON.parse(JSON.stringify(recentEvents)), tlState: JSON.parse(JSON.stringify(tlState)) };
            }

            if (isToday && !isLogged && cycle.status === 'active') {
                if (todayBonusPending && dashState) {
                    dashState.pendingBonus = true;
                }
                if (todayNirvanaPending && dashState) {
                    dashState.pendingNirvana = true;
                }
            }

            // FIX V66: Den Schuldenstand dieses Tages im Kassenbuch verewigen
            history.dailyDebt[dStr] = debt;

            simDate.setDate(simDate.getDate() + 1);
        }

        if (currentBewDays.length > 0) {
            history.b.push(...currentBewDays);
        }

        if (!dashState && cycle.status === 'active') {
            // FIX V40.1: Insolvenz-Prüfung im Fallback des Dashboards ergänzt!
            let initialBewTimer = (isBaseSmall || isInsolvency) ? 0 : 3;
            let initialState = (isBaseSmall || isInsolvency) ? 'REGEN' : 'BEWAEHRUNG';
            dashState = { debt: initialDebtTotal + manualSurcharge, totalDebtEver: initialDebtTotal + manualSurcharge, state: initialState, bewTimer: initialBewTimer, gotBonusToday: false, pendingBonus: false, activeReboundCharges: 0, recentEvents: JSON.parse(JSON.stringify(recentEvents)), tlState: JSON.parse(JSON.stringify(tlState)) };
        }

        let mFreeCurrent = 0;
        [...history.b, ...history.r, ...history.n].forEach(d => {
            let checkStr = toIsoString(d);
            if (checkStr < todayStr || (checkStr === todayStr && cLogs[todayStr] && cLogs[todayStr].type !== undefined)) {
                if ((cLogs[checkStr]?.m || 0) === 0) mFreeCurrent++;
            }
        });

        return {
            cycleId: cycle.id,
            status: cycle.status,
            isOpen: cycle.base.isOpen,
            history: history,
            finalEnd: finalDebtZeroDate || addDays(simDate, -1),
            totalTDaysEver: totalTDaysEver,
            totalDebtEver: totalDebtEver,
            expectedBaseDebt: expectedBaseDebt,
            manualSurcharge: manualSurcharge, // FIX V20.1: Exportiert für UI
            totalActiveDiscountEver: totalActiveDiscountEver, // NEU: Exportiert für Reporting
            dashState: dashState,
            nirvanaStreak: history.n.length,
            initialDebtTotal: initialDebtTotal,
            basePenaltyStr: basePenaltyStr,
            mFreeGoal: totalTDaysEver * 2,
            mFreeCurrent: mFreeCurrent,
            hasNirvanaEcho: hasNirvanaEcho // FIX V22: Export für Dashboard-UI
        };
    } catch(err) {
        return { failed: true, cycleId: cycle ? cycle.id : 'unknown', errorMessage: err.message };
    }
}