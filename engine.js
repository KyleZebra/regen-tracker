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
            a: 0,
            m: 0,
            mood: 0,
            note: "Budget-Test",
            isSimulated: true,
            isSmall: false 
        };

        let res = simulateCycle(testCycle);

        if (res && !res.failed && res.finalEnd <= targetDate) {
            budget++;
            simDate.setDate(simDate.getDate() + 4); 
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

        let baseT = cycle.base.tDays || 1;
        let isBaseSmall = cycle.base.isSmall === true;

        let baseVal = isBaseSmall ? (baseT * 2) : (baseT * 3);
        let expectedBaseDebt = baseVal;

        let sAdd = 0, aAdd = 0;
        if (baseT < 4) {
            sAdd = (cycle.base.sLevel === 1 ? 1 : cycle.base.sLevel === 2 ? 2 : 0);
            aAdd = (cycle.base.aLevel === 1 ? 1 : cycle.base.aLevel === 2 ? 2 : 0);
        } else {
            sAdd = Math.ceil(baseVal * (cycle.base.sLevel === 1 ? 0.1 : cycle.base.sLevel === 2 ? 0.25 : 0));
            aAdd = Math.ceil(baseVal * (cycle.base.aLevel === 1 ? 0.1 : cycle.base.aLevel === 2 ? 0.25 : 0));
        }
        let comboAdd = (cycle.base.sLevel === 2 && cycle.base.aLevel === 2) ? 1 : 0;

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
                    // Echo zündet, wenn es Nüchternheit gab und diese >= den Rauchtagen war!
                    if (prevSmoked > 0 && prevNirvana >= prevSmoked) {
                        hasNirvanaEcho = true;
                    }
                }
            }
        }

        let initialDebtTotal = baseVal + sAdd + aAdd + comboAdd;
        let smallTxt = isBaseSmall ? " (Kleiner Tag)" : " (Standardtag)";
        let basePenaltyStr = `Initiale Schuld: ${initialDebtTotal} Tage (Basis: ${baseVal}${smallTxt}, Stress: ${sAdd}, Alk: ${aAdd}, Kombi: ${comboAdd})`;

        let debt = initialDebtTotal + manualSurcharge;
        let totalDebtEver = debt;
        let totalTDaysEver = baseT;

        // FIX V22: Kleine Tage generieren 0 Bewährung.
        let currentBlockTargetBew = isBaseSmall ? 0 : 3;
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
        let history = { t: [], r: [], b: [], a: [], n: [], logDetails: [], penaltyDict: {}, bonusDict: {} };

        let cBase = parseLocal(cycle.base.start);
        let endBase = parseLocal(cycle.base.end);
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
        
        // FIX V23: Charge-System für das mehrtägige Nirwana-Echo
        let reboundCharges = 0;
        let currentAusrutscherIsSmall = false;

        while ((debt > 0 || toIsoString(simDate) <= endSimLimit) && safety < 25000) {
            safety++;
            dStr = toIsoString(simDate);
            log = cLogs[dStr];
            isFuture = dStr > todayStr;
            isPast = dStr < todayStr;
            isToday = dStr === todayStr;
            isLogged = log && typeof log === 'object' && log.type !== undefined;
            isPhantom = log && log.isSimulated === true;

            if (activeAusrutscherDays > 0) {
                history.a.push(new Date(simDate));
                activeAusrutscherDays--;
                
                // Echo-Ladungen jeden Tag des Ausrutschers frisch halten (NUR wenn Echo aktiv ist!)
                if (currentAusrutscherIsSmall && hasNirvanaEcho) reboundCharges = 2;
                else reboundCharges = 0;
                
            } else if (log && log.type === 'ausrutscher') {
                activeAusrutscherDays = log.t - 1;
                totalTDaysEver += log.t;

                currentAusrutscherIsSmall = log.isSmall === true;
                isLogSmall = currentAusrutscherIsSmall;
                
                // Echo-Ladungen beim initialen Log setzen (NUR wenn Echo aktiv ist!)
                if (currentAusrutscherIsSmall && hasNirvanaEcho) reboundCharges = 2;
                else reboundCharges = 0;
                iBase = isLogSmall ? (log.t * 2) : (log.t * 3);
                expectedBaseDebt += iBase;

                iS = log.t < 4 ? (log.s===1 ? 1 : log.s===2 ? 2 : 0) : Math.ceil(iBase * (log.s===1 ? 0.1 : log.s===2 ? 0.25 : 0));
                iA = log.t < 4 ? (log.a===1 ? 1 : log.a===2 ? 2 : 0) : Math.ceil(iBase * (log.a===1 ? 0.1 : log.a===2 ? 0.25 : 0));
                iC = (log.s===2 && log.a===2) ? 1 : 0;

                pauschale = hasPaidPauschaleThisCluster ? 0 : 1;
                penalty = iBase + iS + iA + iC + pauschale;

                debt += penalty;
                totalDebtEver += penalty;

                finalDebtZeroDate = null;

                if (!hasPaidPauschaleThisCluster) {
                    currentBlockTargetBew = isLogSmall ? 0 : (log.t * 3);
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
                    history.logDetails.push({ date: dStr, p: penalty, t: log.t, b: iBase, s: iS, a: iA, f: pauschale });
                    let smallInfo = isLogSmall ? " (Kleiner Tag)" : " (Standardtag)";
                    pStr = `+${penalty} Tage`;
                    history.penaltyDict[dStr] = pauschale > 0 ? pStr + ` (inkl. Setup)${smallInfo}` : pStr + ` (Stottern)${smallInfo}`;
                }

                history.a.push(new Date(simDate));
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
                dashState = { debt, totalDebtEver, state, bewTimer, gotBonusToday: (isToday) ? gotBonusForToday : false, pendingBonus: false, activeReboundCharges: reboundCharges };
            }

            if (isToday && !isLogged && cycle.status === 'active') {
                if (todayBonusPending && dashState) {
                    dashState.pendingBonus = true;
                }
                if (todayNirvanaPending && dashState) {
                    dashState.pendingNirvana = true;
                }
            }

            // (Alte yesterdayWasSmallAusrutscher-Logik komplett entfernt)

            simDate.setDate(simDate.getDate() + 1);
        }

        if (currentBewDays.length > 0) {
            history.b.push(...currentBewDays);
        }

        if (!dashState && cycle.status === 'active') {
            let initialBewTimer = isBaseSmall ? 0 : 3;
            let initialState = isBaseSmall ? 'REGEN' : 'BEWAEHRUNG';
            dashState = { debt: initialDebtTotal + manualSurcharge, totalDebtEver: initialDebtTotal + manualSurcharge, state: initialState, bewTimer: initialBewTimer, gotBonusToday: false, pendingBonus: false, activeReboundCharges: 0 };
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