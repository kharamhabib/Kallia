/*
 * Kallia — widget de chamada para o Chatwoot.
 * Carregue no Chatwoot (super_admin > app_config > internal), no campo de scripts:
 *   <script src="https://SEU-KALLIA/widget.js" data-api-key="SUA_API_KEY"></script>
 * Injeta um ícone de telefone ao lado das ações da conversa; ao clicar,
 * abre um painel flutuante e liga para o contato via WhatsApp (WebRTC).
 *
 * SEGURANÇA: a API key fica visível no HTML para qualquer agente logado no
 * Chatwoot. Recomenda-se usar uma instalação com acesso restrito por domínio
 * (KALLIA_CORS_ORIGINS) e HTTPS obrigatório. A conexão de eventos (SSE) usa
 * tickets de uso único — a key nunca aparece na URL.
 */
(function () {
  "use strict";

  // Previne carregamento duplicado do widget
  if (window.__KALLIA_WIDGET_LOADED__) {
    console.log("[Kallia] Widget já carregado nesta página.");
    return;
  }
  window.__KALLIA_WIDGET_LOADED__ = true;

  var script = document.currentScript;
  if (!script) {
    script = document.querySelector('script[src*="widget.js"], script[src*="widget.min.js"]');
    if (!script) {
      var scripts = document.getElementsByTagName("script");
      for (var i = 0; i < scripts.length; i++) {
        if (scripts[i].src && (scripts[i].src.indexOf("/widget.js") > -1 || scripts[i].src.indexOf("/widget.min.js") > -1)) {
          script = scripts[i];
          break;
        }
      }
    }
  }

  var BASE = (window.KALLIA_BASE_URL) || (script && script.getAttribute("data-url")) || (script && script.src ? new URL(script.src).origin : window.location.origin);
  var KEY = (window.KALLIA_API_KEY) || (script && script.getAttribute("data-api-key")) || "";
  var ANCHOR = (window.KALLIA_ANCHOR) || (script && script.getAttribute("data-anchor")) || "";

  console.log("[Kallia] Inicializando widget...", { base: BASE, hasKey: Boolean(KEY), anchor: ANCHOR });

  var PHONE_SVG =
    '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/></svg>';
  var ICON_PHONE =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/></svg>';
  var ICON_PHONE_OFF =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2A19.79 19.79 0 0 1 3.07 8.94a2 2 0 0 1 2-2.18h3"/><line x1="23" y1="1" x2="1" y2="23"/></svg>';
  var ICON_MIC =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/></svg>';
  var ICON_MIC_OFF =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="1" y1="1" x2="23" y2="23"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"/><line x1="12" y1="19" x2="12" y2="23"/></svg>';
  var ICON_WARN =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>';
  var ICON_SPARKLES =
    '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/><path d="m5 3 1 2.5L8.5 6 6 7 5 9.5 4 7 1.5 6 4 5.5Z"/><path d="m19 17 1 2.5 2.5.5-2.5 1-1 2.5-1-2.5-2.5-1 2.5-1Z"/></svg>';
  var ICON_SPARKLES_SMALL =
    '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="color:#d97706;"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg>';

  function api(path, opts) {
    opts = opts || {};
    var headers = { "Content-Type": "application/json" };
    if (KEY) {
      headers["X-API-Key"] = KEY;
      headers["X-Connection-API-Key"] = KEY;
    }
    return fetch(BASE + path, {
      method: opts.method || "GET",
      headers: headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    }).then(function (r) {
      if (!r.ok) {
        return r.json().catch(function () { return {}; }).then(function (errBody) {
          var msg = (errBody && errBody.error) || (path + " " + r.status);
          throw new Error(msg);
        });
      }
      return r.json();
    });
  }

  // ---------- estilos ----------
  var style = document.createElement("style");
  style.id = "kallia-widget-styles";
  style.textContent =
    "#kallia-btn{display:inline-flex;align-items:center;justify-content:center;cursor:pointer;color:#687076;transition:all .15s ease}" +
    "#kallia-btn:hover{color:#11181c;background:#f1f3f5}" +
    "#kallia-btn.kallia-floating-btn{position:fixed;bottom:24px;right:24px;width:48px;height:48px;border-radius:50%;background:#30a46c;color:#fff;box-shadow:0 8px 24px rgba(48,164,108,.35);z-index:99998;border:none}" +
    "#kallia-btn.kallia-floating-btn:hover{transform:scale(1.05);filter:brightness(1.05)}" +
    "#kallia-panel{position:fixed;bottom:20px;right:20px;width:296px;background:#fff;color:#11181c;border:1px solid #dfe3e6;border-radius:12px;box-shadow:0 12px 32px rgba(17,24,28,.12);z-index:99999;font-family:'Inter','InterDisplay',-apple-system,system-ui,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;overflow:hidden;-webkit-font-smoothing:antialiased}" +
    "#kallia-panel .cw-h{display:flex;align-items:center;gap:8px;padding:12px 14px;border-bottom:1px solid #eceef0;font-size:14px;font-weight:600;color:#11181c;letter-spacing:-.01em}" +
    "#kallia-panel .cw-dot{width:7px;height:7px;border-radius:50%;background:#2781F6;flex:none}" +
    "#kallia-panel .cw-h-t{flex:1}" +
    "#kallia-panel .cw-x{cursor:pointer;background:none;border:0;color:#889096;font-size:20px;line-height:1;padding:0;width:24px;height:24px;border-radius:6px;display:inline-flex;align-items:center;justify-content:center;transition:background .12s,color .12s}" +
    "#kallia-panel .cw-x:hover{background:#f1f3f5;color:#11181c}" +
    "#kallia-panel .cw-b{padding:22px 16px 24px;text-align:center}" +
    "#kallia-panel .cw-name{font-weight:600;font-size:15px;color:#11181c;letter-spacing:-.01em}" +
    "#kallia-panel .cw-sub{font-size:13px;color:#687076;margin-top:3px;font-variant-numeric:tabular-nums}" +
    "#kallia-panel .cw-st{font-size:12px;font-weight:500;color:#687076;margin-top:14px;min-height:16px;font-variant-numeric:tabular-nums;letter-spacing:.01em}" +
    "#kallia-panel .cw-act{margin-top:18px;border:0;border-radius:50%;width:54px;height:54px;cursor:pointer;color:#fff;display:inline-flex;align-items:center;justify-content:center;transition:filter .15s,transform .08s}" +
    "#kallia-panel .cw-act:hover{filter:brightness(.95)}" +
    "#kallia-panel .cw-act:active{transform:scale(.95)}" +
    "#kallia-panel .cw-act svg{width:22px;height:22px}" +
    "#kallia-panel .cw-call{background:#30a46c;box-shadow:0 4px 12px rgba(48,164,108,.32)}" +
    "#kallia-panel .cw-hang{background:#e5484d;box-shadow:0 4px 12px rgba(229,72,77,.3)}" +
    "#kallia-panel .cw-row{display:flex;gap:16px;justify-content:center;align-items:center}" +
    "#kallia-panel .cw-mute{background:#f1f3f5;color:#687076;width:46px;height:46px;box-shadow:none}" +
    "#kallia-panel .cw-mute:hover{background:#e6e8eb;filter:none}" +
    "#kallia-panel .cw-mute.on{background:#e5484d;color:#fff}" +
    "#kallia-panel .cw-mute svg{width:19px;height:19px}" +
    "#kallia-panel .cw-warn{width:44px;height:44px;margin:0 auto 12px;border-radius:50%;background:#fff7c2;color:#9e6c00;display:flex;align-items:center;justify-content:center}" +
    "#kallia-panel .cw-warn svg{width:24px;height:24px}";
  if (!document.getElementById("kallia-widget-styles")) {
    document.head.appendChild(style);
  }

  // ---------- estado ----------
  var call = null; // {pc, mic, callId, session, t0, timer, answered, isServerAI}
  var incoming = null; // chamada recebida pendente {sessionId, callId, peer}
  var globalES = null; // SSE persistente p/ detectar chamadas recebidas
  var ringCtx = null, ringTimer = null;

  function playRing() {
    stopRing();
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ringCtx = new AC();
      var beep = function () {
        if (!ringCtx) return;
        var o = ringCtx.createOscillator(), g = ringCtx.createGain();
        o.type = "sine";
        o.frequency.value = 480;
        o.connect(g);
        g.connect(ringCtx.destination);
        var t = ringCtx.currentTime;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.18, t + 0.05);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
        o.start(t);
        o.stop(t + 0.95);
      };
      beep();
      ringTimer = setInterval(beep, 2500);
    } catch (e) {}
  }

  function stopRing() {
    if (ringTimer) { clearInterval(ringTimer); ringTimer = null; }
    if (ringCtx) { try { ringCtx.close(); } catch (e) {} ringCtx = null; }
  }

  function el(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }

  function closePanel() {
    if (call) hangup();
    else if (incoming) rejectIncoming();
    stopRing();
    var p = document.getElementById("kallia-panel");
    if (p) p.remove();
  }

  function panel() {
    var p = document.getElementById("kallia-panel");
    if (p) return p;
    p = el("div");
    p.id = "kallia-panel";
    p.setAttribute("role", "dialog");
    p.setAttribute("aria-label", "Chamada WhatsApp");
    document.body.appendChild(p);
    return p;
  }

  // Esc fecha o painel somente fora de chamada ativa (nunca derruba uma ligação)
  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape") return;
    var p = document.getElementById("kallia-panel");
    if (!p) return;
    if (call && call.answered) return;
    closePanel();
  });

  function render(state) {
    var p = panel();
    var head =
      '<div class="cw-h"><span class="cw-dot"></span><span class="cw-h-t">Chamada</span><span class="cw-x" id="kallia-close">&times;</span></div>';
    var body = "";
    if (state.loading) {
      body = '<div class="cw-b"><div class="cw-sub">Identificando contato…</div></div>';
    } else if (state.warn) {
      body =
        '<div class="cw-b"><div class="cw-warn">' + ICON_WARN + "</div>" +
        '<div class="cw-name">Caixa sem WhatsApp</div>' +
        '<div class="cw-sub" style="margin-top:6px;line-height:1.45">' + esc(state.warn) + "</div></div>";
    } else if (state.error) {
      body = '<div class="cw-b"><div class="cw-sub" style="color:#e5484d">' + esc(state.error) + "</div></div>";
    } else if (state.inCall) {
      body =
        '<div class="cw-b"><div class="cw-name">' + esc(state.name) + "</div>" +
        '<div class="cw-sub">' + esc(state.phone) + "</div>" +
        '<div class="cw-st" id="kallia-st">' + esc(state.status || "") + "</div>" +
        '<div id="kallia-transcript" aria-live="polite" style="margin-top:12px; max-height:100px; overflow-y:auto; font-size:12px; text-align:left; border:1px solid #eceef0; border-radius:8px; padding:8px; background:#f8f9fa; color:#4f565b; display:none; flex-direction:column; gap:6px; font-family:inherit;"></div>' +
        '<div class="cw-row" style="margin-top:14px;">' +
        (state.isServerAI
          ? '<div style="display:inline-flex; align-items:center; justify-content:center; gap:6px; font-size:12px; font-weight:600; color:#d97706; background:#fef3c7; padding:6px 12px; border-radius:20px; border:1px solid #fde68a;">' + ICON_SPARKLES_SMALL + " IA no Servidor</div>"
          : '<button class="cw-act cw-mute" id="kallia-mute" title="Mudo" aria-label="Mudo">' + ICON_MIC + "</button>") +
        '<button class="cw-act cw-hang" id="kallia-hang" title="Encerrar" aria-label="Encerrar chamada">' + ICON_PHONE_OFF + "</button></div>" +
        (state.isServerAI ? "" : '<audio id="kallia-audio" autoplay playsinline style="display: block; width: 0; height: 0; opacity: 0; pointer-events: none;"></audio>') +
        "</div>";
    } else if (state.incoming) {
      body =
        '<div class="cw-b"><div class="cw-name">Chamada recebida</div>' +
        '<div class="cw-sub">' + esc(state.phone) + "</div>" +
        '<div class="cw-st" id="kallia-st">Tocando…</div>' +
        '<div class="cw-row" style="margin-top:18px;">' +
        '<button class="cw-act cw-call" id="kallia-answer" title="Atender" aria-label="Atender chamada">' + ICON_PHONE + "</button>" +
        (state.hasAI
          ? '<button class="cw-act cw-ai-answer" id="kallia-ai-answer" title="Atender com IA" aria-label="Atender com IA" style="background: linear-gradient(135deg, #f59e0b, #d97706); box-shadow: 0 4px 12px rgba(217,119,6,.32);">' + ICON_SPARKLES + "</button>"
          : "") +
        '<button class="cw-act cw-hang" id="kallia-reject" title="Recusar" aria-label="Recusar chamada">' + ICON_PHONE_OFF + "</button></div>" +
        '<audio id="kallia-audio" autoplay playsinline style="display: block; width: 0; height: 0; opacity: 0; pointer-events: none;"></audio></div>';
    } else {
      body =
        '<div class="cw-b"><div class="cw-name">' + esc(state.name) + "</div>" +
        '<div class="cw-sub">' + esc(state.phone) + "</div>" +
        '<div class="cw-row" style="margin-top:18px;">' +
        '<button class="cw-act cw-call" id="kallia-start" title="Ligar" aria-label="Ligar">' + ICON_PHONE + "</button>" +
        (state.hasAI
          ? '<button class="cw-act cw-ai-start" id="kallia-ai-start" title="Ligar com IA" aria-label="Ligar com IA" style="background: linear-gradient(135deg, #f59e0b, #d97706); box-shadow: 0 4px 12px rgba(217,119,6,.32);">' + ICON_SPARKLES + "</button>"
          : "") +
        "</div></div>";
    }
    p.innerHTML = head + body;
    p.querySelector("#kallia-close").onclick = closePanel;
    if (p.querySelector("#kallia-start"))
      p.querySelector("#kallia-start").onclick = function () {
        startCall(state, false);
      };
    if (p.querySelector("#kallia-ai-start"))
      p.querySelector("#kallia-ai-start").onclick = function () {
        startCall(state, true);
      };
    if (p.querySelector("#kallia-answer")) p.querySelector("#kallia-answer").onclick = function () { acceptIncoming(false); };
    if (p.querySelector("#kallia-ai-answer")) p.querySelector("#kallia-ai-answer").onclick = function () { acceptIncoming(true); };
    if (p.querySelector("#kallia-reject")) p.querySelector("#kallia-reject").onclick = rejectIncoming;
    if (p.querySelector("#kallia-hang")) p.querySelector("#kallia-hang").onclick = hangup;
    if (p.querySelector("#kallia-mute"))
      p.querySelector("#kallia-mute").onclick = function () {
        toggleMute(this);
      };
  }

  function esc(s) {
    return (s || "").replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function setStatus(t) {
    var s = document.getElementById("kallia-st");
    if (s) s.textContent = t;
  }

  function addTranscript(speaker, text) {
    var tBox = document.getElementById("kallia-transcript");
    if (!tBox) return;
    tBox.style.display = "flex";
    
    var lastLine = tBox.lastElementChild;
    var label = speaker === "ai" ? "IA" : "Cliente";
    
    if (lastLine && lastLine.getAttribute("data-speaker") === speaker) {
      var textNode = lastLine.querySelector(".trans-text");
      if (textNode) {
        textNode.textContent += text;
      } else {
        lastLine.innerHTML += esc(text);
      }
    } else {
      var line = el("div");
      line.style.marginBottom = "4px";
      line.setAttribute("data-speaker", speaker);
      
      var color = speaker === "ai" ? "#d97706" : "#2781F6";
      line.innerHTML = '<strong style="color:' + color + '">' + label + ':</strong> <span class="trans-text">' + esc(text) + '</span>';
      tBox.appendChild(line);
    }
    
    tBox.scrollTop = tBox.scrollHeight;
  }

  function interruptTranscript() {
    var tBox = document.getElementById("kallia-transcript");
    if (!tBox) return;
    var lastLine = tBox.lastElementChild;
    if (lastLine && lastLine.getAttribute("data-speaker") === "ai") {
      var textNode = lastLine.querySelector(".trans-text");
      if (textNode && !textNode.textContent.endsWith("...")) {
        textNode.textContent = textNode.textContent.trim() + "...";
      }
      lastLine.removeAttribute("data-speaker");
    }
  }

  function iceComplete(pc) {
    return new Promise(function (res, rej) {
      if (pc.iceGatheringState === "complete") return res();
      var timer = setTimeout(function () {
        cleanup();
        rej(new Error("timeout na coleta ICE"));
      }, 10000);
      var onState = function () {
        if (pc.iceGatheringState === "complete") {
          cleanup();
          res();
        }
      };
      var cleanup = function () {
        clearTimeout(timer);
        pc.removeEventListener("icegatheringstatechange", onState);
      };
      pc.addEventListener("icegatheringstatechange", onState);
    });
  }

  function micErrorMessage(e) {
    if (e && (e.name === "NotAllowedError" || e.name === "SecurityError")) {
      return "Permissão de microfone negada. Libere o microfone no ícone de cadeado do navegador e tente de novo.";
    }
    if (e && e.name === "NotFoundError") {
      return "Nenhum microfone encontrado neste computador.";
    }
    return "Erro: " + ((e && e.message) || e);
  }

  async function startCall(state, isAI) {
    var isServerAI = isAI && state.serverSideAI;
    render({ inCall: true, name: state.name, phone: state.phone, status: isServerAI ? "IA conectando…" : "Conectando…", isServerAI: isServerAI });
    try {
      var mic = null, pc = null;
      var remoteStream = null;

      if (!isServerAI) {
        mic = await navigator.mediaDevices.getUserMedia({ audio: true });
        pc = new RTCPeerConnection({ iceServers: [] });
        remoteStream = new MediaStream();
        var tracks = mic.getAudioTracks();
        if (tracks.length > 0) {
          tracks.forEach(function (t) {
            pc.addTrack(t, mic);
          });
        } else {
          pc.addTransceiver("audio", { direction: "recvonly" });
        }
        pc.ontrack = function (ev) {
          var a = document.getElementById("kallia-audio");
          if (a) {
            if (a.srcObject !== remoteStream) {
              a.srcObject = remoteStream;
            }
            if (ev.track) {
              var existing = remoteStream.getTracks();
              var found = false;
              for (var i = 0; i < existing.length; i++) {
                if (existing[i].id === ev.track.id) {
                  found = true;
                  break;
                }
              }
              if (!found) {
                remoteStream.addTrack(ev.track);
              }
            }
            a.play().catch(function (err) {
              console.error("[Kallia] erro ao reproduzir áudio:", err);
            });
          }
        };
      }

      var r = await api("/api/sessions/" + state.session + "/calls", {
        method: "POST",
        body: { phone: state.phone, duration_ms: 300000, record: false, ai: isAI },
      });
      var callId = r.call.callId;

      if (!isServerAI && pc) {
        var offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        await iceComplete(pc);
        var ans = await api("/api/sessions/" + state.session + "/calls/" + callId + "/webrtc", {
          method: "POST",
          body: { sdp_offer: pc.localDescription.sdp },
        });
        await pc.setRemoteDescription({ type: "answer", sdp: ans.sdp_answer });
      }

      call = {
        pc: pc,
        mic: mic,
        callId: callId,
        session: state.session,
        t0: null,
        timer: null,
        es: null,
        answered: false,
        isServerAI: isServerAI
      };

      setStatus(isServerAI ? "Chamando com IA…" : "Chamando…");

      if (!isServerAI && pc) {
        pc.onconnectionstatechange = function () {
          if (pc.connectionState === "failed") setStatus("Falha na conexão");
        };
      }
      connectEvents();
    } catch (e) {
      if (pc) { try { pc.close(); } catch (_) {} }
      if (mic) {
        try {
          mic.getTracks().forEach(function (t) { t.stop(); });
        } catch (_) {}
      }
      setStatus(micErrorMessage(e));
    }
  }

  function fetchEventTicket() {
    return api("/api/events/ticket", { method: "POST" })
      .then(function (d) {
        return d.ticket;
      });
  }

  var esRetry = 0;
  var esTimer = null;

  function connectEvents() {
    if (!BASE || globalES || esTimer) return;
    esTimer = setTimeout(function () {
      esTimer = null;
      openEvents();
    }, esRetry === 0 ? 0 : Math.min(30000, 1000 * Math.pow(2, esRetry)));
  }

  function openEvents() {
    fetchEventTicket()
      .then(function (ticket) {
        var url = BASE + "/api/events?ticket=" + encodeURIComponent(ticket);
        try {
          var es = new EventSource(url);
          globalES = es;
          es.onopen = function () {
            esRetry = 0;
            console.log("[Kallia] EventSource conectado");
          };
          es.onmessage = function (ev) {
            var msg;
            try { msg = JSON.parse(ev.data); } catch (e) { return; }
            handleEvent(msg);
          };
          es.onerror = function () {
            try { es.close(); } catch (e) {}
            if (globalES === es) globalES = null;
            esRetry += 1;
            connectEvents();
          };
        } catch (e) {
          console.error("[Kallia] Erro ao instanciar EventSource:", e);
          esRetry += 1;
          connectEvents();
        }
      })
      .catch(function (e) {
        console.error("[Kallia] Falha ao obter ticket SSE:", e);
        esRetry += 1;
        esTimer = setTimeout(openEvents, Math.min(30000, 1000 * Math.pow(2, esRetry)));
      });
  }

  function handleEvent(msg) {
    var msgCallId = msg.callId || msg.id;
    if (call && msgCallId === call.callId) {
      if (msg.type === "call-ended" || msg.status === "ended") hangup();
      else if (msg.type === "call-status") {
        if (msg.status === "connected") markAnswered();
        else if (!call.answered) setStatus(call.isServerAI ? "Chamando com IA…" : "Chamando…");
      }
      else if (msg.type === "ai-transcript") {
        addTranscript(msg.speaker, msg.text);
      }
      else if (msg.type === "ai-interrupted") {
        interruptTranscript();
      }
      return;
    }

    if (incoming && msgCallId === incoming.callId) {
      if (msg.type === "incoming-claimed" || msg.type === "call-status") {
        var owner = msg.owner;
        var isConnected = msg.status === "connected" || (msg.type === "incoming-claimed" && owner);
        
        if (isConnected) {
          if (owner === "__server__") {
            var inc = incoming;
            incoming = null;
            stopRing();
            render({ inCall: true, name: resolved ? resolved.name : "IA no Servidor", phone: inc.peer.split("@")[0], status: "IA em chamada", isServerAI: true });
            call = {
              pc: null,
              mic: null,
              callId: inc.callId,
              session: inc.sessionId,
              t0: Date.now(),
              timer: null,
              es: null,
              answered: true,
              isServerAI: true
            };
            call.timer = setInterval(tick, 1000);
          } else {
            incoming = null;
            stopRing();
            var p = document.getElementById("kallia-panel");
            if (p) p.remove();
          }
          return;
        }
      }

      if (msg.type === "call-ended" || msg.status === "ended") {
        incoming = null;
        stopRing();
        var p2 = document.getElementById("kallia-panel");
        if (p2) p2.remove();
        return;
      }
    }

    if (msg.type === "incoming") {
      if (call) return;
      if (incoming && incoming.callId === msgCallId) return;
      incoming = { sessionId: msg.sessionId, callId: msgCallId, peer: msg.peer || "" };
      
      render({ incoming: true, phone: msg.peer.split("@")[0], hasAI: false });
      playRing();
      
      Promise.all([
        api("/api/sessions/" + msg.sessionId + "/contacts/" + encodeURIComponent(msg.peer)).catch(function() { return null; }),
        api("/api/sessions/" + msg.sessionId + "/ai-config").catch(function() { return null; })
      ]).then(function(results) {
        var contactInfo = results[0];
        var aiRes = results[1];
        
        var contactName = (contactInfo && contactInfo.name) || msg.peer;
        if (contactName.indexOf("@") > -1) {
          contactName = contactName.split("@")[0];
        }
        
        var hasAI = aiRes && aiRes.enabled && aiRes.aiConfig && aiRes.aiConfig.serverSideAI;
        
        resolved = {
          session: msg.sessionId,
          phone: (contactInfo && contactInfo.phone) || msg.peer.split("@")[0],
          name: contactName,
          hasAI: hasAI,
          serverSideAI: hasAI
        };
        
        render({ incoming: true, name: contactName, phone: resolved.phone, hasAI: hasAI });
      });
      return;
    }
  }

  async function acceptIncoming(isAI) {
    var inc = incoming;
    if (!inc) return;
    incoming = null;
    stopRing();
    var isServerAI = isAI && resolved && resolved.serverSideAI;
    render({ inCall: true, name: resolved ? resolved.name : "Chamada recebida", phone: resolved ? resolved.phone : inc.peer, status: isServerAI ? "IA conectando…" : "Conectando…", isServerAI: isServerAI });
    call = {
      pc: null,
      mic: null,
      callId: inc.callId,
      session: inc.sessionId,
      t0: null,
      timer: null,
      es: null,
      answered: false,
      isServerAI: isServerAI
    };
    try {
      var mic = null, pc = null;
      await api("/api/sessions/" + inc.sessionId + "/calls/" + inc.callId + "/accept", {
        method: "POST",
        body: { ai: isAI },
      });

      var remoteStream = null;

      if (!isServerAI) {
        mic = await navigator.mediaDevices.getUserMedia({ audio: true });
        pc = new RTCPeerConnection({ iceServers: [] });
        remoteStream = new MediaStream();
        var tracks = mic.getAudioTracks();
        if (tracks.length > 0) {
          tracks.forEach(function (t) {
            pc.addTrack(t, mic);
          });
        } else {
          pc.addTransceiver("audio", { direction: "recvonly" });
        }
        pc.ontrack = function (ev) {
          var a = document.getElementById("kallia-audio");
          if (a) {
            if (a.srcObject !== remoteStream) {
              a.srcObject = remoteStream;
            }
            if (ev.track) {
              var existing = remoteStream.getTracks();
              var found = false;
              for (var i = 0; i < existing.length; i++) {
                if (existing[i].id === ev.track.id) {
                  found = true;
                  break;
                }
              }
              if (!found) {
                remoteStream.addTrack(ev.track);
              }
            }
            a.play().catch(function (err) {
              console.error("[Kallia] erro ao reproduzir áudio:", err);
            });
          }
        };
        var offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        await iceComplete(pc);
        var ans = await api("/api/sessions/" + inc.sessionId + "/calls/" + inc.callId + "/webrtc", {
          method: "POST",
          body: { sdp_offer: pc.localDescription.sdp },
        });
        await pc.setRemoteDescription({ type: "answer", sdp: ans.sdp_answer });
        
        if (call && call.callId === inc.callId) {
          call.pc = pc;
          call.mic = mic;
        }
      }

      if (call && call.callId === inc.callId && !call.answered) {
        markAnswered();
      }
    } catch (e) {
      if (pc) { try { pc.close(); } catch (_) {} }
      if (mic) {
        try {
          mic.getTracks().forEach(function (t) { t.stop(); });
        } catch (_) {}
      }
      setStatus(micErrorMessage(e));
      try { await api("/api/sessions/" + inc.sessionId + "/calls/" + inc.callId, { method: "DELETE" }); } catch (_) {}
    }
  }

  function rejectIncoming() {
    var inc = incoming;
    incoming = null;
    stopRing();
    if (inc) api("/api/sessions/" + inc.sessionId + "/calls/" + inc.callId + "/reject", { method: "POST", body: {} }).catch(function () {});
    var p = document.getElementById("kallia-panel");
    if (p) p.remove();
  }

  function markAnswered() {
    if (!call || call.answered) return;
    stopRing();
    call.answered = true;
    call.t0 = Date.now();
    setStatus(call.isServerAI ? "IA em chamada" : "Em chamada");
    call.timer = setInterval(tick, 1000);
  }

  function tick() {
    if (!call || !call.t0) return;
    var s = Math.floor((Date.now() - call.t0) / 1000);
    var mm = String(Math.floor(s / 60)).padStart(2, "0");
    var ss = String(s % 60).padStart(2, "0");
    var st = document.getElementById("kallia-st");
    if (st && st.textContent.indexOf("Erro") < 0) st.textContent = mm + ":" + ss;
  }

  function toggleMute(btn) {
    if (!call) return;
    var tracks = call.mic.getAudioTracks();
    var on = tracks.length && tracks[0].enabled;
    tracks.forEach(function (t) {
      t.enabled = !on;
    });
    btn.innerHTML = on ? ICON_MIC_OFF : ICON_MIC;
    btn.classList.toggle("on", on);
    btn.title = on ? "Ativar microfone" : "Mudo";
  }

  function hangup() {
    if (!call) return;
    var c = call;
    call = null;
    if (c.timer) clearInterval(c.timer);
    if (c.es) try { c.es.close(); } catch (e) {}
    api("/api/sessions/" + c.session + "/calls/" + c.callId, { method: "DELETE" }).catch(function () {});
    if (!c.isServerAI) {
      try {
        c.mic.getTracks().forEach(function (t) {
          t.stop();
        });
      } catch (e) {}
      try {
        c.pc.close();
      } catch (e) {}
    }
    closePanel();
  }

  var currentConvKey = null; 
  var callable = false; 
  var resolved = null; 

  function convKey() {
    var full = location.pathname + location.hash;
    var acc = full.match(/accounts\/(\d+)/);
    var conv = full.match(/conversations\/(\d+)/);
    return acc && conv ? acc[1] + "/" + conv[1] : null;
  }

  function refreshBinding() {
    connectEvents();
    var key = convKey();
    if (key === currentConvKey && callable) return; 
    currentConvKey = key;
    callable = false;
    resolved = null;
    
    if (!key) {
      var b = document.getElementById("kallia-btn");
      if (b) b.remove();
      return;
    }

    var parts = key.split("/");
    console.log("[Kallia] Buscando contexto da conversa Chatwoot:", { accountId: parts[0], conversationId: parts[1] });
    
    api("/api/chatwoot/resolve?account_id=" + parts[0] + "&conversation_id=" + parts[1])
      .then(function (info) {
        if (convKey() !== key) return; 
        console.log("[Kallia] Conversa resolvida com sucesso:", info);
        resolved = { session: info.session_id, phone: info.phone, name: info.name || info.phone, hasAI: false, serverSideAI: false };
        callable = true;
        api("/api/sessions/" + info.session_id + "/ai-config")
          .then(function (aiRes) {
            if (aiRes && aiRes.enabled) {
              resolved.hasAI = true;
              resolved.serverSideAI = aiRes.aiConfig && aiRes.aiConfig.serverSideAI;
            }
            ensureButton();
          })
          .catch(function () {
            ensureButton();
          });
      })
      .catch(function (err) {
        console.warn("[Kallia] Não foi possível resolver conversa para WhatsApp:", err && err.message);
        if (convKey() !== key) return;
        callable = false;
        var x = document.getElementById("kallia-btn");
        if (x) x.remove();
      });
  }

  var WARN_MSG =
    "Esta conversa não pertence à caixa de entrada conectada ao WhatsApp. " +
    "Abra uma conversa da caixa conectada para ligar. " +
    "(Se o ícone apareceu aqui por engano, é cache do Chatwoot — atualize a página.)";

  function onCall() {
    connectEvents();
    console.log("[Kallia] Clique no botão de ligar");
    if (resolved) {
      render({ session: resolved.session, phone: resolved.phone, name: resolved.name, hasAI: resolved.hasAI && resolved.serverSideAI, serverSideAI: resolved.serverSideAI });
      return;
    }
    var key = convKey();
    if (!key) {
      render({ warn: "Abra uma conversa para ligar." });
      return;
    }
    render({ loading: true });
    var parts = key.split("/");
    api("/api/chatwoot/resolve?account_id=" + parts[0] + "&conversation_id=" + parts[1])
      .then(function (info) {
        resolved = { session: info.session_id, phone: info.phone, name: info.name || info.phone, hasAI: false, serverSideAI: false };
        callable = true;
        api("/api/sessions/" + info.session_id + "/ai-config")
          .then(function (aiRes) {
            if (aiRes && aiRes.enabled) {
              resolved.hasAI = true;
              resolved.serverSideAI = aiRes.aiConfig && aiRes.aiConfig.serverSideAI;
            }
            render({ session: resolved.session, phone: resolved.phone, name: resolved.name, hasAI: resolved.hasAI && resolved.serverSideAI, serverSideAI: resolved.serverSideAI });
          })
          .catch(function () {
            render({ session: resolved.session, phone: resolved.phone, name: resolved.name, hasAI: false, serverSideAI: false });
          });
      })
      .catch(function () {
        callable = false;
        render({ warn: WARN_MSG });
      });
  }

  function findActionsContainer() {
    if (ANCHOR) {
      var a = document.querySelector(ANCHOR);
      if (a) return { container: a, sibling: a.querySelector("button") || a, isFloating: false };
    }

    // Estratégia 1: Seletores conhecidos do Chatwoot (v2, v3, v4)
    var selectors = [
      ".conversation-header .actions",
      ".conversation--header-actions",
      "header .actions",
      "header [class*='actions']",
      "div[data-testid='conversation-header'] div[class*='actions']",
      ".conversation-header [class*='button-group']",
      "header div.flex.items-center",
      ".conversation--header div.flex",
      "main header div.flex",
      "#conversation-wrap header div.flex"
    ];

    for (var s = 0; s < selectors.length; s++) {
      var cont = document.querySelector(selectors[s]);
      if (cont && cont.offsetWidth > 0 && cont.offsetHeight > 0) {
        var firstBtn = cont.querySelector("button");
        return { container: cont, sibling: firstBtn || cont, isFloating: false };
      }
    }

    // Estratégia 2: Busca por botões de ação na barra superior (Resolve, Snooze, More)
    var btns = document.querySelectorAll("button");
    for (var i = 0; i < btns.length; i++) {
      var b = btns[i];
      var r = b.getBoundingClientRect();
      if (r.width >= 24 && r.width <= 50 && r.height >= 24 && r.height <= 50 && r.top < 150) {
        var p = b.parentElement;
        if (p) {
          var sib = p.querySelectorAll(":scope > button");
          if (sib.length >= 1 && sib.length <= 8) {
            return { container: p, sibling: b, isFloating: false };
          }
        }
      }
    }

    // Estratégia 3: Fallback para botão flutuante se não encontrar cabeçalho
    return { container: document.body, sibling: null, isFloating: true };
  }

  function ensureButton() {
    if (!callable || !convKey()) {
      var old = document.getElementById("kallia-btn");
      if (old) old.remove();
      return;
    }
    if (document.getElementById("kallia-btn")) return;
    
    var found = findActionsContainer();
    if (!found || !found.container) return;
    if (found.container.querySelector("#kallia-btn")) return;

    var btn = document.createElement("button");
    btn.id = "kallia-btn";
    btn.type = "button";
    btn.title = "Ligar pelo WhatsApp (Kallia)";
    
    if (found.isFloating) {
      btn.className = "kallia-floating-btn";
      btn.innerHTML = PHONE_SVG;
    } else {
      btn.className = found.sibling && found.sibling.className
        ? found.sibling.className
        : "inline-flex items-center justify-center h-8 w-8 p-0 rounded-lg";
      btn.innerHTML = PHONE_SVG;
    }

    btn.onclick = function (e) {
      e.preventDefault();
      e.stopPropagation();
      onCall();
    };

    if (found.isFloating) {
      document.body.appendChild(btn);
    } else {
      found.container.appendChild(btn);
    }
    console.log("[Kallia] Ícone de chamada injetado com sucesso! isFloating:", found.isFloating);
  }

  var obs = new MutationObserver(function () {
    scheduleBindingRefresh();
  });
  obs.observe(document.body, { childList: true, subtree: true });

  var bindingTimer = null;
  function scheduleBindingRefresh() {
    if (bindingTimer) return;
    bindingTimer = setTimeout(function () {
      bindingTimer = null;
      refreshBinding();
      ensureButton();
    }, 400);
  }

  var tries = 0;
  (function retry() {
    refreshBinding();
    ensureButton();
    if (++tries < 30) setTimeout(retry, 1000);
  })();

  connectEvents();
  console.log("[Kallia] Widget carregado e pronto.");
})();
