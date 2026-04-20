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

    // Budget Schatten-Simulation (Optimistisch)
    let testCycle = JSON.parse(JSON.stringify(active));
    if (!testCycle.logs) testCycle.logs = {};

    let todayStrB = toIsoString(new Date());
    // Wenn heute noch ungeloggt ist, tragen wir heimlich eine Pause ein.
    // Dadurch sabotiert die "Geisel-Regel" nicht den zukünftigen Puffer.
    if (!testCycle.logs[todayStrB] || testCycle.logs[todayStrB].type === undefined) {
        testCycle.logs[todayStrB] = { type: 'pause', s: 0, a: 0, m: 0, note: "Budget-Phantom", isSimulated: true };
    }

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
            simDate.setDate(simDate.getDate() + 4); // Effizienz-Sprung
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

function simulateCycle(cycle) {
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

        let initialDebtTotal = baseVal + sAdd + aAdd + comboAdd;
        let smallTxt = isBaseSmall ? " (Kleiner Tag)" : " (Standardtag)";
        let basePenaltyStr = `Initiale Schuld: ${initialDebtTotal} Tage (Basis: ${baseVal}${smallTxt}, Stress: ${sAdd}, Alk: ${aAdd}, Kombi: ${comboAdd})`;

        let debt = initialDebtTotal;
        let totalDebtEver = debt;
        let totalTDaysEver = baseT;
        let state = 'BEWAEHRUNG';

        let currentBlockTargetBew = isBaseSmall ? (baseT * 2) : (baseT * 3);
        let currentBlockServed = 0;
        let bewTimer = currentBlockTargetBew - currentBlockServed;

        let withheldBonus = 0;
        let hasPaidPauschaleThisCluster = true;
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
        let cLogs = cycle.logs || {};
        let lastRealDayStr = (cLogs[todayStr] && typeof cLogs[todayStr] === 'object' && cLogs[todayStr].type !== undefined && !cLogs[todayStr].isSimulated) ? todayStr : yesterdayStr;

        let dStr, log, isLogged, isFuture, isPast, isToday, isLogSmall, iBase, iS, iA, iC, pauschale, penalty, canPayout, pStr, isPhantom;

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
            } else if (log && log.type === 'ausrutscher') {
                activeAusrutscherDays = log.t - 1;
                totalTDaysEver += log.t;

                isLogSmall = log.isSmall === true;
                iBase = isLogSmall ? (log.t * 2) : (log.t * 3);
                expectedBaseDebt += iBase;

                iS = log.t < 4 ? (log.s===1 ? 1 : log.s===2 ? 2 : 0) : Math.ceil(iBase * (log.s===1 ? 0.1 : log.s===2 ? 0.25 : 0));
                iA = log.t < 4 ? (log.a===1 ? 1 : log.a===2 ? 2 : 0) : Math.ceil(iBase * (log.a===1 ? 0.1 : log.a===2 ? 0.25 : 0));
                iC = (log.s===2 && log.a===2) ? 1 : 0;

                pauschale = hasPaidPauschaleThisCluster ? 0 : 1;
                penalty = iBase + iS + iA + iC + pauschale;

                debt += penalty;
                totalDebtEver += penalty;
                state = 'BEWAEHRUNG';

                if (!hasPaidPauschaleThisCluster) {
                    currentBlockTargetBew = isLogSmall ? (log.t * 2) : (log.t * 3);
                    currentBlockServed = 0;
                    hasPaidPauschaleThisCluster = true;
                } else {
                    currentBlockTargetBew += isLogSmall ? (log.t * 2) : (log.t * 3);
                }

                bewTimer = currentBlockTargetBew - currentBlockServed;

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
                            // Die saubere Logik: Darf der Bonus ausgezahlt werden?
                            canPayout = isPast || (isToday && isLogged) || isFuture || isSandbox || isPhantom;

                            // Strikte Geisel-Regel: HEUTE ungeloggt -> Kein Bonus für die Dashboard-Simulation
                            if (isToday && !isLogged && !isSandbox && !isPhantom) {
                                canPayout = false;
                                history.bonusDict[dStr] = `🎁 Bonus bereit (Log heute fehlt!)`;
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

                            // V14.0 FIX: IMMER in die Tiefe Regeneration wechseln, egal ob Bonus ausgezahlt oder verwehrt!
                            history.r.push(...currentBewDays);
                            currentBewDays = [];
                            withheldBonus = 0;
                            state = 'REGEN';
                            hasPaidPauschaleThisCluster = false;
                            currentBlockTargetBew = 0;
                            currentBlockServed = 0;
                        }
                    } else {
                        // Tiefe Regeneration (1.0x Speed)
                        debt -= 1.0;
                        if (debt < 0) debt = 0;
                        history.r.push(new Date(simDate));
                    }

                    if (debt <= 0 && !finalDebtZeroDate) {
                        finalDebtZeroDate = new Date(simDate);
                    }
                } else {
                    if (isPast || isToday || isSandbox || isFuture) {
                        history.n.push(new Date(simDate));
                    }
                }
            }

            if (dStr === lastRealDayStr && cycle.status === 'active') {
                dashState = { debt, totalDebtEver, state, bewTimer, gotBonusToday: (isToday) ? gotBonusForToday : false, pendingBonus: false };
            }

            // UI-Trigger für das Dashboard
            if (isToday && !isLogged && cycle.status === 'active') {
                if (state === 'BEWAEHRUNG' && bewTimer <= 0) {
                    if (dashState) {
                        dashState.pendingBonus = true;
                    }
                }
            }

            simDate.setDate(simDate.getDate() + 1);
        }

        if (currentBewDays.length > 0) {
            history.b.push(...currentBewDays);
        }

        if (!dashState && cycle.status === 'active') {
            let initialBewTimer = isBaseSmall ? (baseT * 2) : (baseT * 3);
            dashState = { debt: initialDebtTotal, totalDebtEver: initialDebtTotal, state: 'BEWAEHRUNG', bewTimer: initialBewTimer, gotBonusToday: false, pendingBonus: false };
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
            dashState: dashState,
            nirvanaStreak: history.n.length,
            initialDebtTotal: initialDebtTotal,
            basePenaltyStr: basePenaltyStr,
            mFreeGoal: totalTDaysEver * 2,
            mFreeCurrent: mFreeCurrent
        };
    } catch(err) {
        return { failed: true, cycleId: cycle ? cycle.id : 'unknown', errorMessage: err.message };
    }
}