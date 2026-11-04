/* ============================================================
   screensaver.js — Apple TV–style screen saver.

   "aerial" type (the default): Apple's real Aerial videos
   (js/aerials.js), streamed live, with a crossfade between two
   videos and the place name at the bottom left — just like on Apple TV.
   By day, daytime videos are preferred; at night, night ones.
   If the videos don't start (no network…), it falls back to the "art"
   type: the apps' artwork slowly scrolling by, and it tries again the
   next time.
   "dark" type: a clock on a black background.
   Any key exits the screen saver without triggering an action.
   ============================================================ */
(function (global) {
    "use strict";

    var APL = global.APL, sys = APL.sys;
    var root, layers, vids, labelEl, timeEl;
    var active = false, lastInput = Date.now(), slideTimer = null, watchdog = null;
    var idx = 0, cur = 0, vcur = 0, tries = 0, history = [];
    var MAX_TRIES = 3;

    function el(tag, cls) { var e = document.createElement(tag); e.className = cls; return e; }

    function buildDom() {
        root = el("div", "saver");
        layers = [el("div", "saver__img"), el("div", "saver__img")];
        layers.forEach(function (l) { root.appendChild(l); });
        vids = [el("video", "saver__video"), el("video", "saver__video")];
        vids.forEach(function (v) {
            v.muted = true; v.setAttribute("muted", ""); v.setAttribute("playsinline", "");
            v.preload = "auto";
            root.appendChild(v);
        });
        root.appendChild(el("div", "saver__shade"));
        timeEl = el("div", "saver__time");
        labelEl = el("div", "saver__label");
        root.appendChild(timeEl); root.appendChild(labelEl);
        document.body.appendChild(root);
    }

    function clock() {
        var d = new Date(), h = d.getHours(), m = String(d.getMinutes()).padStart(2, "0");
        timeEl.textContent = sys.pref("clock24") ? String(h).padStart(2, "0") + ":" + m : ((h % 12) || 12) + ":" + m;
    }

    function showLabel(text) {
        labelEl.classList.remove("is-shown");
        labelEl.textContent = text || "";
        if (!text) return;
        setTimeout(function () { labelEl.classList.add("is-shown"); }, 1800);
        setTimeout(function () { labelEl.classList.remove("is-shown"); }, 9000);
    }

    /* ---------- Aerial videos ---------- */
    function pickAerial() {
        var off = sys.pref("aerialHidden");
        var list = (global.APL_AERIALS || []).filter(function (a) { return off.indexOf(a[1]) === -1 && off.indexOf(a[0]) === -1; });
        if (!list.length) return null;
        var h = new Date().getHours(), night = h < 7 || h >= 20;
        var pool = list.filter(function (a) {
            var tod = a[2];
            return (night ? tod === "night" : tod !== "night") && history.indexOf(a[3]) === -1;
        });
        if (!pool.length) { history = []; pool = list; }
        var a = pool[Math.floor(Math.random() * pool.length)];
        history.push(a[3]); if (history.length > 30) history.shift();
        return a;
    }

    /* A video that doesn't come: the next one. After several failures, the artwork. */
    function aerialFailed() {
        clearTimeout(watchdog);
        if (!active) return;
        if (++tries < MAX_TRIES) { nextAerial(); return; }
        stopVideos();
        startArt();
    }

    function nextAerial() {
        var a = pickAerial();
        if (!a) { startArt(); return; }
        var next = vids[1 - vcur], prev = vids[vcur];
        clearTimeout(watchdog);
        // No picture after 15 s (slow network, format refused): try another video.
        watchdog = setTimeout(aerialFailed, 15000);
        next.onplaying = function () {
            clearTimeout(watchdog);
            tries = 0;
            next.classList.add("is-on");
            prev.classList.remove("is-on");
            setTimeout(function () { try { prev.pause(); prev.removeAttribute("src"); prev.load(); } catch (e) {} }, 2600);
            vcur = 1 - vcur;
            showLabel(APL.t(a[0]));
        };
        next.onended = function () { if (active) nextAerial(); };
        // The 4K in HEVC, otherwise the same video in 1080p. The screen decodes only one 4K at a time: during
        // the crossfade, the old one stops on its last frame while the new one plays.
        var sources = [a[3], a[4]].filter(Boolean);
        next.onerror = function () {
            sources.shift();
            if (!sources.length || !active) { aerialFailed(); return; }
            next.src = http(sources[0]);
            try { var again = next.play(); if (again && again.catch) again.catch(function () {}); } catch (e) {}
        };
        next.src = http(sources[0]);
        try { var p = next.play(); if (p && p.catch) p.catch(function () {}); } catch (e) {}
    }

    /* Over http: over https, Apple's certificate is recognized neither by the screen nor by a browser, and
       no video starts. These are public videos, with no account or personal data. */
    function http(url) { return url.replace(/^https:/, "http:"); }

    function stopVideos() {
        clearTimeout(watchdog);
        (vids || []).forEach(function (v) {
            v.onplaying = v.onended = v.onerror = null;
            v.classList.remove("is-on");
            try { v.pause(); v.removeAttribute("src"); v.load(); } catch (e) {}
        });
    }

    /* ---------- app artwork ---------- */
    function slides() {
        var list = ((APL.allApps && APL.allApps()) || []).filter(function (a) { return a.bg; });
        return list.length ? list : [{ name: "APL Launcher", bg: null }];
    }

    function nextArt() {
        clock();
        var list = slides(), s = list[idx % list.length]; idx++;
        var nextLayer = layers[1 - cur];
        nextLayer.style.backgroundImage = s.bg ? "url('" + s.bg + "')" : "none";
        nextLayer.classList.remove("is-on", "is-pan-a", "is-pan-b");
        void nextLayer.offsetWidth;
        nextLayer.classList.add("is-on", idx % 2 ? "is-pan-a" : "is-pan-b");
        layers[cur].classList.remove("is-on");
        cur = 1 - cur;
        showLabel(s.name);
    }

    function startArt() {
        clearInterval(slideTimer);
        root.classList.remove("is-video");
        nextArt();
        slideTimer = setInterval(nextArt, 14000);
    }

    /* ---------- start / stop ---------- */
    function start() {
        if (active) return;
        if (!root) buildDom();
        active = true;
        root.classList.toggle("no-motion", !!sys.pref("reduceMotion"));
        root.classList.add("is-active");
        clock();
        var style = sys.pref("screensaverStyle");
        root.classList.toggle("is-dark", style === "dark");
        root.classList.toggle("is-clock", style === "clock");
        if (style === "dark") return;
        if (style === "aerial" && !sys.PREVIEW_NO_VIDEO) {
            root.classList.add("is-video");
            tries = 0;
            nextAerial();
        } else {
            startArt();
        }
    }

    function stop() {
        if (!active) return;
        active = false;
        clearInterval(slideTimer);
        stopVideos();
        layers.forEach(function (l) { l.classList.remove("is-on"); });
        root.classList.remove("is-active", "is-video");
        lastInput = Date.now();
    }

    // Any key: resets the idle time; if the screen saver is running, exits it without acting.
    APL.addHotkey(function () {
        lastInput = Date.now();
        if (active) { stop(); return true; }
        return false;
    });

    setInterval(function () {
        var delay = sys.pref("screensaverDelay");
        if (!active && delay && document.visibilityState !== "hidden" && Date.now() - lastInput > delay * 60000) start();
        if (active) clock();
    }, 10000);

    document.addEventListener("visibilitychange", function () {
        if (document.visibilityState === "hidden") stop();
        else lastInput = Date.now();          // back from an app: the idle time starts now, not from the last key here
    });
    // Home, and the launcher's other requests, come as an app control rather than a key: they count as input too
    global.addEventListener("appcontrol", function () { lastInput = Date.now(); });

    APL.screensaver = { start: start, stop: stop, isActive: function () { return active; } };
})(window);
