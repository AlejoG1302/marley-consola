/* ============================================================
   CONSOLA MARLEY · interfaz
   Rutas: #/resumen · #/hoy · #/locales · #/local/ID · #/conversaciones/ID ·
          #/pedidos · #/reglas · #/integraciones
   Todo se dibuja desde window.MARLEY (datos sintéticos + motor del semáforo).
   ============================================================ */
(function () {
  const M = window.MARLEY;
  const lateral = document.getElementById('lateral');
  const barra = document.getElementById('barra');
  const vista = document.getElementById('vista');

  // ---------------- utilidades de formato ----------------
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = (n) => Math.round(n).toLocaleString('es-CL');
  const clp = (n) => '$' + num(n);
  const pct = (x, d = 0) => (x * 100).toFixed(d).replace('.', ',') + '%';
  const fecha = (d) => d.toLocaleDateString('es-CL', { day: 'numeric', month: 'short' });
  const fechaLarga = (d) => d.toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' });
  const hora = (d) => d.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', hour12: false });
  const esHoy = (d) => d.toDateString() === M.HOY.toDateString();
  const cuando = (d) => (esHoy(d) ? hora(d) : fecha(d));
  const hace = (d) => { const n = M.diasDesde(d); return n <= 0 ? 'hoy' : n === 1 ? 'ayer' : 'hace ' + n + ' días'; };
  const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const recorta = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
  const iniciales = (s) => s.split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase();

  // ---------------- estado (se recuerda entre recargas) ----------------
  const store = {
    get(k, def) { try { const v = localStorage.getItem('marley.' + k); return v ? JSON.parse(v) : def; } catch (e) { return def; } },
    set(k, v) { try { localStorage.setItem('marley.' + k, JSON.stringify(v)); } catch (e) { /* sin almacenamiento: la demo sigue igual */ } },
  };
  const PESOS_BASE = {
    reglas: Object.fromEntries(Object.entries(M.reglas).map(([k, r]) => [k, r.peso])),
    umbrales: { ...M.umbrales },
  };
  function aplicarPesos(p) {
    Object.entries(p.reglas || {}).forEach(([k, v]) => { if (M.reglas[k]) M.reglas[k].peso = v; });
    Object.assign(M.umbrales, p.umbrales || {});
  }
  const guardados = store.get('pesos', null);
  if (guardados) aplicarPesos(guardados);

  const S = {
    alcance: store.get('alcance', 'piloto'),                // 'piloto' | 'red'
    acciones: store.get('acciones', {}),                    // idPunto → { tipo }
    filtros: { canal: '', region: '', color: '', q: '', pagina: 0 },
    fped: { estado: '', canal: '', pagina: 0 },
    tabDesp: 'calendario',                                   // calendario | por-despachar | en-ruta | historial
    filtroAg: 'todo',                                        // todo | Reparto | Mantención
  };

  // ---------------- semáforo con caché por render ----------------
  let cacheEv = {}, cacheConv = {}, K = null;
  const ev = (id) => cacheEv[id] || (cacheEv[id] = M.evaluar(id));
  const invalidar = () => { cacheEv = {}; cacheConv = {}; };
  const enAlcance = (p) => (S.alcance === 'piloto' ? p.piloto : true);
  // en la red completa, un local con ficha incompleta no se puede evaluar: es la ceguera hecha visible
  const evaluable = (p) => S.alcance === 'piloto' || p.fichaCompleta;
  const colorDe = (p) => (evaluable(p) ? ev(p.id).color : 'gris');
  const ETIQ = { rojo: 'Rojo', amarillo: 'Amarillo', verde: 'Verde', gris: 'No evaluable' };
  const RANGO = { rojo: 0, amarillo: 1, verde: 2, gris: 3 };
  const COLOR_HEX = { rojo: 'var(--bad)', amarillo: 'var(--warn)', verde: 'var(--ok)', gris: 'var(--gris)' };
  const DIGITAL = new Set(['WhatsApp', 'Digital']);
  const HORA = 3600000;
  const horasDesde = (d) => (M.HOY - d) / HORA;
  const enHoras = (d, h) => new Date(d.getTime() + h * HORA);
  const duracion = (h) => (h < 48 ? Math.round(h) + ' h' : Math.round(h / 24) + ' días');
  const esAtrasado = (x) => (x.estado === 'Confirmado' || x.estado === 'En camino') && x.comprometida <= M.HOY;
  const esFalla = (i) => i.tipo === 'Falla de máquina';
  const ticketAbierto = (i) => esFalla(i) && i.estado !== 'Resuelto';
  const PLAZO_TEC = 31;    // ponytail: la línea base del caso (31 h) hace de plazo; reemplazar por el SLA que defina Marley
  const CICLO_MANT = M.CICLO_MANT;   // [S] mantención preventiva cada 90 días (viene de los datos)
  const DIAS_SEM = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
  const diaCorto = (d) => DIAS_SEM[d.getDay()] + ' ' + d.getDate();
  const franjaTexto = (f) => f.replace('–', ' y las ');
  const diaSemana = (d) => d.toLocaleDateString('es-CL', { weekday: 'long' });                          // 'jueves'
  const diaLargo = (d) => diaSemana(d) + ' ' + d.getDate();                                             // 'jueves 17'
  const horaDicha = (f) => 'Entre ' + [f.slice(0, 2), f.slice(6, 8)].map((h) => (+h > 12 ? h - 12 : +h)).join(' y ');   // '12:00–15:00' → 'Entre 12 y 3'
  // agenda de repartos y mantenciones por local (sólo existe en el piloto, porque requiere WhatsApp)
  const agendaDe = {};
  M.agenda.forEach((a) => { (agendaDe[a.punto] = agendaDe[a.punto] || []).push(a); });
  const ICONO_AG = { Reparto: '🚚', Mantención: '🔧' };
  const proxMant = (p) => (agendaDe[p.id] || []).find((a) => a.tipo === 'Mantención' && (a.estado === 'Confirmado' || a.estado === 'Reagendado'));
  function textoAgenda(a) {
    return {
      Confirmado: 'Confirmado por el cliente', Reagendado: '↻ Reagendado desde ' + (a.antes ? diaCorto(a.antes) : ''),
      'Por confirmar': 'Esperando respuesta', Cancelado: 'Cancelado · nuevo aviso ' + (a.nuevoAviso ? diaCorto(a.nuevoAviso) : ''),
      'Por avisar': 'Fecha estimada · aviso ' + diaCorto(a.aviso),
    }[a.estado];
  }
  const mantVencida = (p) => M.diasDesde(p.ultimaMantencion) > CICLO_MANT;
  const marcaTarde = (x) => (x.estado === 'Entregado' ? (x.aTiempo ? '' : ' <span class="tarde">tarde</span>') : esAtrasado(x) ? ' <span class="tarde">atrasado</span>' : '');
  const ordenar = (lista) => lista.slice().sort((a, b) => RANGO[colorDe(a)] - RANGO[colorDe(b)] || ev(b.id).puntaje - ev(a.id).puntaje);
  function chip(p) {
    const c = colorDe(p);
    return `<span class="sem sem-${c}"><i></i>${c === 'gris' ? 'No evaluable' : ETIQ[c] + ' · ' + ev(p.id).puntaje + ' pts'}</span>`;
  }

  // motivo principal en una línea
  const plural = (n, uno, varios) => n + ' ' + (n === 1 ? uno : varios);
  const CORTO = {
    silencio: (m) => m.detalle,
    silencioLargo: (m) => m.detalle,
    falla: (m) => plural(m.veces, 'falla de máquina', 'fallas de máquina') + ' en 60 días',
    tardia: (m) => plural(m.veces, 'entrega tardía', 'entregas tardías') + ' en 90 días',
    reclamo: (m) => plural(m.veces, 'reclamo', 'reclamos') + ' en 90 días',
    quiebre: (m) => plural(m.veces, 'quiebre de stock', 'quiebres de stock') + ' en 90 días',
    respuestaLenta: (m) => plural(m.veces, 'ticket', 'tickets') + ' con respuesta sobre 31 h',
  };
  // de qué módulo de la consola sale cada señal (se muestra en Reglas)
  const ORIGEN = {
    silencio: 'Pedidos', silencioLargo: 'Pedidos', falla: 'Servicio técnico', tardia: 'Despachos',
    reclamo: 'WhatsApp', quiebre: 'Despachos', respuestaLenta: 'Servicio técnico',
  };
  const motivosOrdenados = (p) => ev(p.id).motivos.slice().sort((a, b) => b.peso - a.peso);
  function motivoCorto(p) {
    if (!evaluable(p)) return 'Ficha incompleta: no se puede evaluar';
    const ms = motivosOrdenados(p);
    if (!ms.length) return 'Sin señales de riesgo';
    return CORTO[ms[0].clave](ms[0]) + (ms.length > 1 ? ' · +' + (ms.length - 1) + ' señal' + (ms.length > 2 ? 'es' : '') : '');
  }

  // ---------------- indicadores ----------------
  function kpis() {
    if (K) return K;
    const pts = M.puntos.filter(enAlcance);
    const ocs = pts.filter((p) => p.canal === 'OCS');
    const evals = pts.filter(evaluable);
    const cuenta = { rojo: 0, amarillo: 0, verde: 0 };
    evals.forEach((p) => { cuenta[ev(p.id).color]++; });
    const riesgo = ordenar(evals.filter((p) => ev(p.id).color !== 'verde'));
    const d90 = (x) => M.diasDesde(x.fecha) <= 90;
    const todos = pts.flatMap((p) => M.pedidosDe[p.id]);
    const ped90 = todos.filter(d90);
    const entregados = ped90.filter((x) => x.estado === 'Entregado');
    const inc90 = pts.flatMap((p) => M.incidenciasDe[p.id].filter(d90));
    const tickets = inc90.filter((i) => i.horasRespuesta);
    return (K = {
      pts, total: pts.length, cuenta, gris: pts.length - evals.length, riesgo,
      pendientes: riesgo.filter((p) => !S.acciones[p.id]).length,
      gestionadas: riesgo.length ? riesgo.filter((p) => S.acciones[p.id]).length / riesgo.length : 0,
      abiertos: todos.filter((x) => x.estado !== 'Entregado').length,
      digital: ped90.filter((x) => DIGITAL.has(x.canalPedido)).length / (ped90.length || 1),
      nPed: ped90.length,
      otif: entregados.filter((x) => x.aTiempo).length / (entregados.length || 1),
      reclamos: (inc90.filter((i) => i.tipo === 'Reclamo').length / (ped90.length || 1)) * 100,
      respuesta: tickets.length ? tickets.reduce((a, i) => a + i.horasRespuesta, 0) / tickets.length : 0,
      quiebres: ocs.length ? ocs.filter((p) => M.incidenciasDe[p.id].some((i) => i.tipo === 'Quiebre de stock' && M.diasDesde(i.fecha) <= 30)).length / ocs.length : 0,
      nOcs: ocs.length,
      atrasados: todos.filter(esAtrasado).length,
      ticketsAbiertos: pts.reduce((n, p) => n + M.incidenciasDe[p.id].filter(ticketAbierto).length, 0),
    });
  }

  // ---------------- conversaciones sintéticas del piloto ----------------
  const momento = (base, h, m) => { const d = new Date(base); d.setHours(h, m, 0, 0); return d; };
  function conversacion(p) {
    if (cacheConv[p.id]) return cacheConv[p.id];
    const nombre = p.contacto.split(' ')[0];
    const msgs = [];
    const ped = M.pedidosDe[p.id].filter((x) => !x.agenda);   // lo agendado se conversa en el bloque de agenda
    const ult = ped[ped.length - 1];
    if (ult) {
      const it = ult.items[0];
      const prod = it.nombre.replace(' · 1 kg', '');
      msgs.push({ de: 'cliente', t: enHoras(ult.fecha, -0.05), txt: 'Hola, ¿me mandan lo de siempre?' });
      msgs.push({ de: 'bot', t: enHoras(ult.fecha, -0.04), txt: `Hola ${nombre} 👋 Tu último pedido fue ${it.kg} kg de ${prod} a ${clp(it.precio)} el kilo, el precio de tu contrato. ¿Lo repetimos?`, botones: ['Sí, repetir', 'Cambiar cantidad'] });
      msgs.push({ de: 'cliente', t: enHoras(ult.fecha, -0.02), txt: 'Sí, repetir' });
      msgs.push({ de: 'bot', t: ult.fecha, txt: `Listo ✅ Pedido ${ult.id} por ${clp(ult.total)}. Llega a más tardar el ${fechaLarga(ult.comprometida)}. Te mandé el detalle a tu correo.` });
      if (esAtrasado(ult)) {
        msgs.push({ de: 'bot', proactivo: true, t: momento(M.HOY, 8, 30), txt: `Hola ${nombre}, tu pedido ${ult.id} viene con atraso 🙏 Llega hoy entre las 11:00 y las 13:00. Te escribimos apenas se entregue.` });
      } else if (ult.estado !== 'Entregado') {
        msgs.push({ de: 'cliente', t: momento(M.HOY, 9, 40), txt: '¿A qué hora llega?' });
        msgs.push({ de: 'bot', t: momento(M.HOY, 9, 40), txt: ult.estado === 'En camino' ? `Tu pedido ${ult.id} va en camino 🚚 Llega hoy entre las 11:00 y las 13:00.` : `Tu pedido ${ult.id} está confirmado y sale mañana a primera hora.` });
      }
    }
    const falla = M.incidenciasDe[p.id].filter((i) => esFalla(i) && M.diasDesde(i.fecha) <= 60).sort((a, b) => b.fecha - a.fecha)[0];
    if (falla) {
      msgs.push({ de: 'cliente', t: falla.fecha, txt: DICE_FALLA[falla.detalle] });
      msgs.push({ de: 'bot', t: enHoras(falla.fecha, 0.02), txt: `Lo siento, ${nombre}. Abrí el ticket ${falla.id} para tu máquina ${p.maquina}. Te aviso apenas un técnico tome el caso.` });
      if (falla.horasRespuesta != null) msgs.push({ de: 'bot', t: enHoras(falla.fecha, falla.horasRespuesta), txt: `Un técnico tomó tu ticket ${falla.id} y agendó la visita a tu local 🔧` });
      if (falla.estado === 'Resuelto') msgs.push({ de: 'bot', t: enHoras(falla.fecha, falla.horasResolucion), txt: `Tu máquina ${p.maquina} quedó operativa ✅ ¿Cómo estuvo la visita?`, botones: ['👍 Bien', '👎 Mal'] });
    }
    const e = M.evaluar(p.id);
    let sinRespuesta = false;
    if (e.motivos.some((m) => m.clave.indexOf('silencio') === 0)) {
      msgs.push({ de: 'bot', proactivo: true, t: momento(M.HOY, 9, 0), txt: `Hola ${nombre}, han pasado ${e.sinPedir} días desde tu último pedido. ¿Te mandamos lo de siempre?`, botones: ['Sí, enviar', 'Todavía no'] });
      sinRespuesta = true;
    }
    // agenda: aviso de Marley, programación del cliente, recordatorio y cambios
    (agendaDe[p.id] || []).forEach((a) => {
      const rep = a.tipo === 'Reparto';
      a.eventos.forEach((e) => {
        const luego = enHoras(e.t, 0.02);
        if (e.que === 'aviso') {
          msgs.push({ de: 'bot', proactivo: true, t: e.t, txt: rep
            ? `Hola ${nombre} 👋 Se acerca tu fecha de reparto. ¿Te gustaría programar tu pedido de siempre?`
            : `Hola ${nombre} 👋 A tu máquina ${p.maquina} le toca su mantención preventiva. ¿Qué día te acomoda que vaya el técnico?` });
        } else if (e.que === 'programo') {
          // el cliente conversa como persona: pregunta por un día y el bot le pide el horario
          const f = a.antes || a.fecha;
          msgs.push({ de: 'cliente', t: e.t, txt: rep ? `Sí, ¿tienen despacho el ${diaSemana(f)}?` : `¿Puede venir el ${diaSemana(f)}?` });
          msgs.push({ de: 'bot', t: enHoras(e.t, 0.01), txt: 'Sí, ¿en qué horario te acomoda?' });
          msgs.push({ de: 'cliente', t: enHoras(e.t, 0.03), txt: horaDicha(a.franja) });
          msgs.push({ de: 'bot', t: enHoras(e.t, 0.04), txt: `Listo ✅ ${rep ? 'Tu pedido llega' : 'El técnico va'} el ${diaLargo(f)} entre las ${franjaTexto(a.franja)}. Si te surge un imprevisto, me avisas y lo cambiamos.` });
        } else if (e.que === 'reagendo') {
          // Marley no elige la nueva fecha: pregunta y reagenda según la disponibilidad del cliente
          msgs.push({ de: 'cliente', t: e.t, txt: 'Tuve un imprevisto y ese día no voy a estar en el local, ¿lo podemos mover?' });
          msgs.push({ de: 'bot', t: enHoras(e.t, 0.02), txt: 'Sin problema. Coméntame cuándo puedes para reagendarlo.' });
          msgs.push({ de: 'cliente', t: enHoras(e.t, 0.05), txt: `El ${diaLargo(a.fecha)}, a la misma hora` });
          msgs.push({ de: 'bot', t: enHoras(e.t, 0.06), txt: `Listo ✅ Quedó reagendado para el ${diaLargo(a.fecha)} entre las ${franjaTexto(a.franja)}.` });
        } else if (e.que === 'cancelo') {
          msgs.push({ de: 'cliente', t: e.t, txt: 'Todavía me queda café, mejor lo cancelamos por ahora' });
          msgs.push({ de: 'bot', t: luego, txt: `Listo, lo cancelé. Te vuelvo a escribir el ${fechaLarga(a.nuevoAviso)}.` });
        } else if (e.que === 'recordatorio') {
          msgs.push({ de: 'bot', proactivo: true, t: e.t, txt: `Recordatorio: mañana ${rep ? 'llega tu pedido' : 'va el técnico'} entre las ${franjaTexto(a.franja)}. ¿Sigue bien?`, botones: ['Confirmar', 'Reagendar', 'Cancelar'] });
          msgs.push({ de: 'cliente', t: enHoras(e.t, 0.3), txt: 'Sí, perfecto' });
        }
      });
      if (a.estado === 'Por confirmar') sinRespuesta = true;
    });
    msgs.sort((a, b) => a.t - b.t);
    return (cacheConv[p.id] = { msgs, sinRespuesta, ultimo: msgs[msgs.length - 1] });
  }

  // ---------------- marco: lateral y barra superior ----------------
  const I = {
    resumen: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/></svg>',
    hoy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
    locales: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 21h18M5 21V8l7-5 7 5v13"/><path d="M9 21v-6h6v6"/></svg>',
    conversaciones: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1.1-4.6A8 8 0 1 1 21 12z"/></svg>',
    pedidos: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 7h16l-1.5 12.5a2 2 0 0 1-2 1.5h-9a2 2 0 0 1-2-1.5z"/><path d="M9 7a3 3 0 0 1 6 0"/></svg>',
    reglas: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/></svg>',
    integraciones: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 7V3M15 7V3"/><path d="M6 7h12v4a6 6 0 0 1-12 0z"/><path d="M12 17v4"/></svg>',
    despachos: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h11v10H3zM14 10h4l3 3v3h-7"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="18" r="2"/></svg>',
    tecnico: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4z"/></svg>',
  };
  // un texto suelto en la lista es el rótulo de un grupo
  const NAV = [['resumen', 'Resumen'], ['hoy', 'Hoy'], ['locales', 'Locales'], ['conversaciones', 'Conversaciones'],
    'Operación', ['pedidos', 'Pedidos'], ['despachos', 'Despachos'], ['tecnico', 'Servicio técnico'],
    'Sistema', ['reglas', 'Reglas'], ['integraciones', 'Integraciones']];
  const TITULOS = {
    resumen: ['Resumen', 'El estado de la red hoy'],
    hoy: ['Hoy', 'A quién hay que llamar, y por qué'],
    locales: ['Locales', 'Todos los clientes, con su semáforo'],
    local: ['Ficha del local', 'Todo lo que pasa con un local, en un solo lugar'],
    conversaciones: ['Conversaciones', 'El WhatsApp de los locales, en un solo lugar'],
    pedidos: ['Pedidos', 'Lo que entra por el chat, hasta la entrega'],
    despachos: ['Despachos', 'Qué está por salir, qué va en ruta y qué agendaron los clientes'],
    tecnico: ['Servicio técnico', 'Tickets abiertos, salud de las máquinas y medición de las reparaciones'],
    reglas: ['Reglas del semáforo', 'Cómo decide el sistema qué local está en riesgo'],
    integraciones: ['Integraciones', 'Con qué se conecta la consola y qué datos van y vienen'],
  };

  function pintarLateral(ruta) {
    const k = kpis();
    const activo = ruta === 'local' ? 'locales' : ruta;
    const sinResp = S.alcance === 'piloto' ? M.puntos.filter((p) => p.piloto && conversacion(p).sinRespuesta).length : 0;
    lateral.innerHTML = `
      <div class="marca"><div class="logo">MARLEY</div><span class="sub">Consola B2B · food service</span></div>
      <nav>${NAV.map((item) => {
        if (typeof item === 'string') return `<span class="nav-grupo">${item}</span>`;
        const [r, l] = item;
        const badge = { hoy: k.pendientes, conversaciones: sinResp, despachos: k.atrasados, tecnico: k.ticketsAbiertos }[r];
        return `<a href="#/${r}" class="${activo === r ? 'on' : ''}">${I[r]}<span>${l}</span>${badge ? `<em class="badge">${num(badge)}</em>` : ''}</a>`;
      }).join('')}</nav>
      <div class="side-pie"><span class="sint">Datos sintéticos</span><p>Prototipo · Desafío Marley Coffee. Corte al ${fechaLarga(M.HOY)}.</p></div>`;
  }

  function pintarBarra(ruta) {
    const [t, d] = TITULOS[ruta] || TITULOS.resumen;
    barra.innerHTML = `
      <div><h1>${t}</h1><p class="desc">${d}</p></div>
      <div class="alcance">${[['piloto', 'Piloto · 14 locales'], ['red', 'Red completa · ' + num(M.puntos.length)]]
        .map(([v, l]) => `<button data-alcance="${v}" class="${S.alcance === v ? 'on' : ''}">${l}</button>`).join('')}</div>
      <input class="buscar" data-buscar placeholder="Buscar local, RUT o máquina" value="${esc(S.filtros.q)}">`;
  }

  // ================================================================
  //  RESUMEN
  // ================================================================
  function tarjetaOp(titulo, valor, ref, href, d) {
    // cada cifra dice contra qué se compara y adónde lleva: un número suelto no se puede leer
    const cuerpo = `<h3>${titulo}</h3><div class="op-valor">${valor}</div>${d ? `<div class="op-dif d-${d.estado}">${d.txt}</div>` : ''}<div class="op-ref">${ref}</div>${href ? '<span class="op-ver">Ver el detalle →</span>' : ''}`;
    return href ? `<a class="card card-link" href="${href}">${cuerpo}</a>` : `<article class="card">${cuerpo}</article>`;
  }

  // compara un indicador con su referencia y dice si está mejor o peor que ella
  function dif(v, ref, dec, unidad, mejorEsMenor, refTxt) {
    if (v == null || !isFinite(v)) return null;
    const n = (x) => x.toFixed(dec).replace('.', ',');
    const r = refTxt || n(ref);
    const d = v - ref;
    if (Math.abs(d) < Math.pow(10, -dec) / 2) return { estado: 'bien', txt: `Igual que la referencia ${r}` };
    const peor = mejorEsMenor ? d > 0 : d < 0;
    return { estado: peor ? 'mal' : 'bien', txt: `${d > 0 ? '▲' : '▼'} ${n(Math.abs(d))} ${unidad} ${d > 0 ? 'sobre' : 'bajo'} la referencia ${r}` };
  }

  function graficoCanales(pts) {
    const CAN = [['WhatsApp', 'var(--verde-marca)'], ['Digital', '#A9BC7A'], ['Ejecutivo', 'var(--tinta)'], ['Correo', '#8C877D'], ['Mensajería', '#D2CCBF']];
    const meses = [];
    for (let m = 5; m >= 0; m--) {
      const ini = new Date(M.HOY.getFullYear(), M.HOY.getMonth() - m, 1);
      const fin = new Date(M.HOY.getFullYear(), M.HOY.getMonth() - m + 1, 1);
      const c = {}; let tot = 0;
      pts.forEach((p) => M.pedidosDe[p.id].forEach((x) => { if (x.fecha >= ini && x.fecha < fin) { c[x.canalPedido] = (c[x.canalPedido] || 0) + 1; tot++; } }));
      meses.push({ etq: ini.toLocaleDateString('es-CL', { month: 'short' }).replace('.', ''), c, tot });
    }
    return `<div class="barras">${meses.map((m) => `<div class="col"><div class="pila">${CAN.map(([k, col]) => {
      const v = m.tot ? (m.c[k] || 0) / m.tot : 0;
      return v ? `<i style="height:${v * 100}%;background:${col}" title="${k}: ${pct(v)}"></i>` : '';
    }).join('')}</div><span>${m.etq}</span><small>${num(m.tot)} ped.</small></div>`).join('')}</div>
    <div class="leyenda">${CAN.map(([k, col]) => `<span><i style="background:${col}"></i>${k}</span>`).join('')}</div>`;
  }

  function riesgoPorZona(pts) {
    const z = {};
    pts.forEach((p) => {
      const clave = p.canal + ' · ' + p.region;
      const r = z[clave] || (z[clave] = { canal: p.canal, rojo: 0, amarillo: 0, verde: 0, gris: 0, tot: 0 });
      r[colorDe(p)]++; r.tot++;
    });
    const filas = Object.entries(z).sort((a, b) => a[1].canal.localeCompare(b[1].canal) || b[1].tot - a[1].tot);
    return `<table class="reg"><thead><tr><th>Canal · zona</th><th class="num">Locales</th><th>Semáforo</th><th class="num">En riesgo</th></tr></thead><tbody>${filas.map(([k, r]) => `
      <tr><td>${k}</td><td class="num">${num(r.tot)}</td>
      <td><div class="reg-barra">${['rojo', 'amarillo', 'verde', 'gris'].map((c) => (r[c] ? `<i style="width:${(r[c] / r.tot) * 100}%;background:${COLOR_HEX[c]}" title="${ETIQ[c]}: ${r[c]}"></i>` : '')).join('')}</div></td>
      <td class="num">${num(r.rojo + r.amarillo)}</td></tr>`).join('')}</tbody></table>`;
  }

  // titular del Resumen: qué hay que hacer hoy, no solo cuántos locales hay de cada color
  function bloqueEstado(k, piloto) {
    const porAtender = k.cuenta.rojo + k.cuenta.amarillo;
    const estado = k.cuenta.rojo ? 'mal' : porAtender ? 'medio' : 'bien';
    const titular = k.cuenta.rojo
      ? `Hay ${num(porAtender)} ${porAtender === 1 ? 'local que atender' : 'locales que atender'} hoy`
      : porAtender
        ? `Hay ${num(porAtender)} ${porAtender === 1 ? 'local en observación' : 'locales en observación'}`
        : 'La red está sana hoy';
    const evaluables = k.total - k.gris;
    const detalle = [
      k.cuenta.rojo ? `<b>${num(k.cuenta.rojo)}</b> en rojo` : '',
      k.cuenta.amarillo ? `<b>${num(k.cuenta.amarillo)}</b> en amarillo` : '',
      `<b>${num(k.cuenta.verde)}</b> en verde`,
    ].filter(Boolean).join(' · ');
    return `<section class="card estado e-${estado}">
      <div class="estado-txt">
        <span class="estado-etq">Estado de la red · ${piloto ? 'piloto' : 'red completa'}</span>
        <h2>${titular}</h2>
        <p>${detalle}, sobre ${num(evaluables)} locales evaluables${k.pendientes
          ? ` · <b>${num(k.pendientes)}</b> sin acción registrada`
          : ' · todas las alertas gestionadas'}${!piloto && k.gris ? ` · ${num(k.gris)} sin ficha para evaluar` : ''}.</p>
      </div>
      <div class="estado-acc">
        <a class="btn" href="#/hoy">${k.pendientes ? `Atender ${num(k.pendientes)} pendientes` : 'Ver la cola de hoy'}</a>
        <span class="estado-escala">Verde 0–${M.umbrales.amarillo - 1} pts · Amarillo ${M.umbrales.amarillo}–${M.umbrales.rojo - 1} · Rojo ${M.umbrales.rojo}+ · <a href="#/reglas">cómo se calcula</a></span>
      </div>
    </section>`;
  }

  function vResumen() {
    const k = kpis();
    const piloto = S.alcance === 'piloto';
    return `
    ${bloqueEstado(k, piloto)}
    <section class="grid g-sem">
      <article class="card">
        <h3>Semáforo hoy · ${piloto ? 'piloto' : 'red completa'}</h3>
        <div class="sem-cifras">
          ${['rojo', 'amarillo', 'verde'].map((c) => `<a href="#/locales" data-filtrar-color="${c}" class="sem-cifra c-${c}"><span>${num(k.cuenta[c])}</span><small>${ETIQ[c]}</small></a>`).join('')}
          ${piloto ? '' : `<a href="#/locales" data-filtrar-color="gris" class="sem-cifra c-gris"><span>${num(k.gris)}</span><small>No evaluables</small></a>`}
        </div>
        <div class="sem-barra">${['rojo', 'amarillo', 'verde'].map((c) => `<i style="width:${(k.cuenta[c] / k.total) * 100}%;background:${COLOR_HEX[c]}"></i>`).join('')}${piloto ? '' : `<i style="width:${(k.gris / k.total) * 100}%;background:var(--gris)"></i>`}</div>
        ${piloto
          ? '<p class="nota">Los 14 locales del piloto tienen ficha completa y piden por WhatsApp: todos se pueden evaluar.</p>'
          : `<p class="aviso"><b>${pct(k.gris / k.total)} de los locales no se puede evaluar</b>: su ficha está incompleta. No hay forma de saber si se están yendo. Solo ${num(k.total - k.gris)} locales tienen datos suficientes.</p>`}
        <div class="mini-kpis">
          <div><b>${num(k.total)}</b><span>Locales</span></div>
          <div><b>${num(k.pendientes)}</b><span>Alertas pendientes</span></div>
          <div><b>${num(k.abiertos)}</b><span>Pedidos abiertos</span></div>
          <div><b>${pct(k.digital)}</b><span>Pedidos digitales · 90 días</span></div>
        </div>
      </article>
      <article class="card">
        <h3>Prioridad de hoy</h3>
        <ul class="top-riesgo">${k.riesgo.slice(0, 3).map((p) => `<li><a href="#/local/${p.id}">${esc(p.nombre)}</a>${chip(p)}<span class="m">${esc(motivoCorto(p))}</span></li>`).join('') || '<li class="vacio">Sin locales en riesgo</li>'}</ul>
        <a class="btn" href="#/hoy">Ver la cola de hoy · ${num(k.pendientes)} pendientes</a>
      </article>
    </section>

    <h2 class="seccion">Operación <span>últimos 90 días · ${num(k.nPed)} pedidos</span></h2>
    <section class="grid g-op">
      ${tarjetaOp('Cumplimiento OTIF', pct(k.otif), `Referencia <b>92%</b> · meta <b>96%</b> · sobre ${num(k.nPed)} pedidos`, '#/despachos', dif(k.otif * 100, 92, 1, 'pts', false, '92%'))}
      ${tarjetaOp('Reclamos por 100 pedidos', k.reclamos.toFixed(1).replace('.', ','), `Referencia <b>2,8</b> · sobre ${num(k.nPed)} pedidos`, '#/tecnico', dif(k.reclamos, 2.8, 1, 'reclamos', true))}
      ${tarjetaOp('Primera respuesta técnica', k.respuesta ? Math.round(k.respuesta) + ' h' : '—', 'Referencia <b>31 h</b> promedio', '#/tecnico', k.respuesta ? dif(k.respuesta, 31, 0, 'h', true, '31 h') : null)}
      ${tarjetaOp('Quiebres de stock OCS · 30 días', k.nOcs ? pct(k.quiebres, 1) : '—', `Referencia <b>6,8%</b> mensual · meta <b>−30%</b> · sobre ${num(k.nOcs)} locales OCS`, '#/despachos', k.nOcs ? dif(k.quiebres * 100, 6.8, 1, 'pts', true, '6,8%') : null)}
    </section>

    <section class="grid g-graf">
      <article class="card"><h3>Cómo llegan los pedidos · últimos 6 meses</h3>${graficoCanales(k.pts)}
        <p class="nota">${piloto ? 'El piloto pasa a pedir por WhatsApp desde julio: el mismo canal que ya usaban, ahora registrado.' : 'En la red, la mayoría de los pedidos sigue entrando por ejecutivo, correo o mensajería, sin quedar registrado.'}</p></article>
      <article class="card"><h3>Riesgo por canal y zona</h3><div class="tabla-wrap">${riesgoPorZona(k.pts)}</div></article>
    </section>`;
  }

  // ================================================================
  //  HOY
  // ================================================================
  const TIPOS = { llame: 'Llamé', visita: 'Agendé visita', resuelto: 'Resuelto' };
  function botonesAccion(p) {
    return Object.entries(TIPOS).map(([t, l]) => `<button class="btn-sec" data-registrar="${p.id}" data-tipo="${t}">${l}</button>`).join('');
  }
  function tarjetaHoy(p) {
    const a = S.acciones[p.id];
    return `<article class="card tarea borde-${colorDe(p)} ${a ? 'hecha' : ''}">
      <header><a class="nombre" href="#/local/${p.id}">${esc(p.nombre)}</a>${chip(p)}</header>
      <p class="meta">${p.canal} · ${esc(p.comuna)} · ${esc(p.contacto)} · ${p.telefono}</p>
      <ul class="motivos">${motivosOrdenados(p).map((m) => `<li><b>+${m.peso}</b>${esc(CORTO[m.clave](m))}</li>`).join('')}</ul>
      <footer>${a
        ? `<span class="hecho">✓ ${TIPOS[a.tipo]} · hoy</span><button class="link" data-deshacer="${p.id}">Deshacer</button>`
        : botonesAccion(p) + (p.piloto ? `<a class="link" href="#/conversaciones/${p.id}">Abrir chat</a>` : '')}</footer>
    </article>`;
  }
  function vHoy() {
    const k = kpis();
    const pend = k.riesgo.filter((p) => !S.acciones[p.id]);
    const hechos = k.riesgo.filter((p) => S.acciones[p.id]);
    const LIM = 24;
    return `
    <div class="intro">
      <p>Locales en amarillo o rojo, del más urgente al menos urgente. ${S.alcance === 'red' ? 'En la red completa solo aparecen los locales con ficha completa: el resto no genera alertas porque no se puede evaluar.' : 'Lo que registres queda en la ficha del local y viaja al CRM.'}</p>
      <div class="resumen-mini"><b>${num(pend.length)}</b> pendientes · <b>${num(hechos.length)}</b> gestionados · <b>${pct(k.gestionadas)}</b> de las alertas atendidas</div>
    </div>
    <section class="cola">${pend.slice(0, LIM).map(tarjetaHoy).join('') || '<div class="card vacio">No quedan alertas pendientes.</div>'}</section>
    ${pend.length > LIM ? `<p class="mas">y ${num(pend.length - LIM)} locales más en la cola</p>` : ''}
    ${hechos.length ? `<h2 class="seccion">Gestionados hoy</h2><section class="cola">${hechos.slice(0, LIM).map(tarjetaHoy).join('')}</section>` : ''}`;
  }

  // ================================================================
  //  LOCALES
  // ================================================================
  const opciones = (valor, lista) => lista.map(([v, l]) => `<option value="${v}" ${valor === v ? 'selected' : ''}>${l}</option>`).join('');
  function vLocales() {
    const f = S.filtros;
    const base = M.puntos.filter(enAlcance);
    let lista = base;
    if (f.canal) lista = lista.filter((p) => p.canal === f.canal);
    if (f.region) lista = lista.filter((p) => p.region === f.region);
    if (f.color) lista = lista.filter((p) => colorDe(p) === f.color);
    if (f.q) { const q = norm(f.q); lista = lista.filter((p) => norm([p.nombre, p.id, p.rut, p.maquina, p.contacto, p.comuna].join(' ')).includes(q)); }
    lista = ordenar(lista);
    const POR = 40;
    const paginas = Math.max(1, Math.ceil(lista.length / POR));
    f.pagina = Math.min(f.pagina, paginas - 1);
    const vis = lista.slice(f.pagina * POR, (f.pagina + 1) * POR);
    const regiones = [...new Set(base.map((p) => p.region))].sort();
    const colores = [['rojo', 'Rojo'], ['amarillo', 'Amarillo'], ['verde', 'Verde']].concat(S.alcance === 'red' ? [['gris', 'No evaluable']] : []);
    const red = S.alcance === 'red';
    return `
    <div class="filtros">
      <select data-filtro="canal">${opciones(f.canal, [['', 'Todos los canales'], ['Horeca', 'Horeca'], ['OCS', 'OCS']])}</select>
      <select data-filtro="region">${opciones(f.region, [['', 'Todas las zonas']].concat(regiones.map((r) => [r, r])))}</select>
      <select data-filtro="color">${opciones(f.color, [['', 'Todos los colores']].concat(colores))}</select>
      <input data-filtro="q" placeholder="Nombre, RUT, máquina o contacto" value="${esc(f.q)}">
      <span class="cuenta">${num(lista.length)} locales</span>
    </div>
    <div class="card tabla-wrap" style="padding:6px 8px">
      <table>
        <thead><tr><th>Local</th><th>Canal</th><th>Zona</th><th>Operación</th><th>Semáforo</th><th>Por qué</th><th class="num">Sin pedir</th><th class="num">Último pedido</th><th>Ficha</th></tr></thead>
        <tbody>${vis.map((p) => {
          const e = ev(p.id);
          return `<tr data-href="#/local/${p.id}" class="${evaluable(p) ? '' : 'fila-gris'}">
            <td><span class="nombre-local">${esc(p.nombre)}</span><small>${p.id} · ${esc(p.contacto)}</small></td>
            <td>${p.canal}${red && p.piloto ? '<span class="tag">Piloto</span>' : ''}</td>
            <td>${esc(p.comuna)}<small>${p.region}</small></td>
            <td>${p.operador === 'XYZ SPA' ? '<span class="tag tag-ter" style="margin:0">XYZ SPA</span>' : 'Directo'}</td>
            <td>${chip(p)}</td>
            <td>${esc(motivoCorto(p))}</td>
            <td class="num">${e.sinPedir} d<small>pide cada ${p.intervalo}</small></td>
            <td class="num">${e.ultimo ? clp(e.ultimo.total) : '—'}<small>${e.ultimo ? hace(e.ultimo.fecha) : ''}</small></td>
            <td>${p.fichaCompleta ? '✓ Completa' : '<span style="color:var(--bad)">Incompleta</span>'}</td>
          </tr>`;
        }).join('') || '<tr><td colspan="9" class="vacio">Ningún local coincide con el filtro.</td></tr>'}</tbody>
      </table>
    </div>
    ${paginas > 1 ? `<div class="paginas"><button class="btn-sec" data-pagina="-1" ${f.pagina === 0 ? 'disabled' : ''}>← Anterior</button><span>Página ${f.pagina + 1} de ${num(paginas)}</span><button class="btn-sec" data-pagina="1" ${f.pagina >= paginas - 1 ? 'disabled' : ''}>Siguiente →</button></div>` : ''}`;
  }

  // ================================================================
  //  FICHA DEL LOCAL
  // ================================================================
  function evento(v) {
    const x = v.x;
    if (v.tipo === 'pedido') {
      const cumplimiento = x.estado === 'Entregado' ? (x.aTiempo ? ' · a tiempo' : ' · fuera de promesa') : '';
      return `<li class="ev ${x.aTiempo ? '' : 'ev-tarde'}"><time>${fecha(x.fecha)}</time><div><b>Pedido ${x.id}</b> · ${x.items[0].kg} kg · ${clp(x.total)}<small>${x.canalPedido} · ${x.estado}${cumplimiento}</small></div></li>`;
    }
    const tec = !esFalla(x) ? '' : x.estado === 'Resuelto' ? ` · respuesta en ${x.horasRespuesta} h · operativa en ${duracion(x.horasResolucion)}` : ' · ' + x.estado;
    return `<li class="ev ev-inc"><time>${fecha(x.fecha)}</time><div><b>${x.tipo}</b> · ${x.id}<small>${esc(x.detalle)}${tec}</small></div></li>`;
  }
  function estadoChip(x) {
    const cls = { 'En camino': 'e-camino', Confirmado: 'e-confirmado', Entregado: 'e-entregado', Programado: 'e-programado' }[x.estado] || '';
    return `<span class="estado ${cls}">${x.estado}</span>`;
  }
  function vLocal(id) {
    const p = M.porId[id];
    if (!p) return '<div class="card vacio">Local no encontrado.</div>';
    const e = ev(p.id);
    const ped = M.pedidosDe[p.id];
    const ult = ped[ped.length - 1];
    const a = S.acciones[p.id];
    const eventos = ped.slice(-10).map((x) => ({ t: x.fecha, tipo: 'pedido', x }))
      .concat(M.incidenciasDe[p.id].map((x) => ({ t: x.fecha, tipo: 'inc', x })))
      .sort((m, n) => n.t - m.t).slice(0, 12);
    return `
    <a class="volver" href="#/locales">← Locales</a>
    <header class="card ficha-cab">
      <div>
        <h2>${esc(p.nombre)}</h2>
        <p class="meta">${p.canal} · ${esc(p.comuna)}, ${p.region} · ${p.id}${p.piloto ? '<span class="tag">Piloto</span>' : ''}${p.operador === 'XYZ SPA' ? '<span class="tag tag-ter">Operado por XYZ SPA</span>' : ''}</p>
      </div>
      <div>${chip(p)}</div>
      <div class="ficha-acc">${p.piloto ? `<a class="btn" href="#/conversaciones/${p.id}">Abrir conversación</a>` : ''}</div>
    </header>
    ${evaluable(p) ? '' : '<div class="alerta">Ficha incompleta: faltan canal, ubicación, tamaño o potencial. El semáforo de este local no es confiable y por eso no genera alertas.</div>'}
    <section class="grid g-ficha">
      <article class="card">
        <h3>Identidad del local</h3>
        <dl class="datos">
          <dt>RUT</dt><dd>${p.rut}</dd>
          <dt>Máquina</dt><dd>${p.maquina}</dd>
          <dt>Mantención</dt><dd>hace ${M.diasDesde(p.ultimaMantencion)} días${mantVencida(p) ? ' · <span class="tarde">vencida</span>' : ''}</dd>
          <dt>Agenda</dt><dd>${(agendaDe[p.id] || []).filter((a) => a.estado !== 'Cancelado').map((a) => `${ICONO_AG[a.tipo]} ${a.tipo} ${diaCorto(a.fecha)} · ${a.franja}<small>${textoAgenda(a)}</small>`).join('') || '—'}</dd>
          <dt>Contacto</dt><dd>${esc(p.contacto)}</dd>
          <dt>Teléfono</dt><dd>${p.telefono}</dd>
          <dt>Operación</dt><dd>${p.operador}</dd>
          <dt>Promesa de entrega</dt><dd>${p.horasPromesa} horas</dd>
          <dt>Pide cada</dt><dd>${p.intervalo} días</dd>
          <dt>Último pedido</dt><dd>${ult ? hace(ult.fecha) + ' · ' + clp(ult.total) : '—'}</dd>
          <dt>Ficha</dt><dd>${p.fichaCompleta ? 'Completa' : 'Incompleta'}</dd>
        </dl>
      </article>
      <article class="card">
        <h3>Por qué está en este color</h3>
        ${e.motivos.length ? `<ul class="porque">${motivosOrdenados(p).map((m) => `<li><span class="peso">+${m.peso}</span><div><b>${esc(m.etiqueta)}</b><small>${esc(m.detalle)}</small></div></li>`).join('')}</ul>` : '<p class="nota" style="margin:0">Sin señales de riesgo en los últimos 90 días.</p>'}
        <div class="escala">Total <b>${e.puntaje} pts</b> · amarillo desde ${M.umbrales.amarillo} · rojo desde ${M.umbrales.rojo}</div>
        ${a ? `<p class="hecho">✓ ${TIPOS[a.tipo]} · hoy</p>` : e.color !== 'verde' && evaluable(p) ? `<div class="acc">${botonesAccion(p)}</div>` : ''}
      </article>
      <article class="card">
        <h3>Condiciones de su contrato</h3>
        <table class="mini">
          <thead><tr><th>Producto</th><th class="num">Lista</th><th class="num">Contrato</th></tr></thead>
          <tbody>${M.PRODUCTOS.map((x) => `<tr class="${p.productosHabituales.includes(x.sku) ? 'habitual' : ''}"><td>${esc(x.nombre)}</td><td class="num">${clp(x.lista)}</td><td class="num">${clp(x.lista * (1 - p.descuento))}</td></tr>`).join('')}</tbody>
        </table>
        <p class="nota">Descuento de contrato ${pct(p.descuento)}. En verde, su producto habitual: es el que ofrece el bot cuando pide «lo de siempre».</p>
      </article>
    </section>
    <section class="grid g-ficha2">
      <article class="card"><h3>Línea de tiempo</h3><ol class="linea">${eventos.map(evento).join('')}</ol></article>
      <article class="card"><h3>Pedidos</h3><div class="tabla-wrap"><table>
        <thead><tr><th>Pedido</th><th>Fecha</th><th>Canal</th><th class="num">Kg</th><th class="num">Total</th><th>Estado</th></tr></thead>
        <tbody>${ped.slice(-8).reverse().map((x) => `<tr><td>${x.id}</td><td>${fecha(x.fecha)}</td><td>${x.canalPedido}</td><td class="num">${x.items[0].kg}</td><td class="num">${clp(x.total)}</td><td>${estadoChip(x)}${marcaTarde(x)}</td></tr>`).join('')}</tbody>
      </table></div></article>
    </section>`;
  }

  // ================================================================
  //  CONVERSACIONES
  // ================================================================
  function hilo(msgs) {
    let dia = '';
    return msgs.map((m) => {
      const d = m.t.toDateString();
      const sep = d !== dia ? `<div class="dia">${esHoy(m.t) ? 'Hoy' : fechaLarga(m.t)}</div>` : '';
      dia = d;
      return sep + `<div class="msg ${m.de}${m.proactivo ? ' proactivo' : ''}">${m.de === 'bot' ? `<span class="quien">${m.proactivo ? 'Bot · mensaje automático' : 'Bot Marley'}</span>` : ''}${esc(m.txt)}${
        m.botones ? `<div class="botones">${m.botones.map((b) => `<span>${esc(b)}</span>`).join('')}</div>` : ''}<time>${hora(m.t)}</time></div>`;
    }).join('');
  }
  function vConversaciones(id) {
    if (S.alcance === 'red') {
      return `<div class="card vacio-grande"><h2>La red completa no tiene conversaciones registradas</h2>
        <p>Hoy la reposición de la red se gestiona por ejecutivo, correo o mensajería, sin quedar en ningún sistema. Solo los 14 locales del piloto piden por el WhatsApp conectado a la consola.</p>
        <button class="btn" data-alcance="piloto">Ver el piloto</button></div>`;
    }
    const lista = M.puntos.filter((p) => p.piloto).map((p) => ({ p, c: conversacion(p) })).sort((a, b) => b.c.ultimo.t - a.c.ultimo.t);
    const sel = lista.find((x) => x.p.id === id) || lista[0];
    const p = sel.p;
    const ult = M.pedidosDe[p.id][M.pedidosDe[p.id].length - 1];
    return `<div class="conv">
      <aside class="card conv-lista">${lista.map(({ p: q, c }) => `
        <a class="conv-item ${q.id === p.id ? 'on' : ''}" href="#/conversaciones/${q.id}">
          <div class="conv-top"><b>${esc(q.nombre)}</b><time>${cuando(c.ultimo.t)}</time></div>
          <div class="conv-bot"><span>${esc(recorta(c.ultimo.txt, 60))}</span>${c.sinRespuesta ? '<i class="punto-nuevo" title="Sin respuesta"></i>' : ''}</div>
        </a>`).join('')}</aside>
      <section class="card conv-hilo">
        <header class="hilo-cab"><div class="avatar">${iniciales(p.nombre)}</div><div><b>${esc(p.nombre)}</b><small>${esc(p.contacto)} · ${p.telefono}</small></div><span class="canal-wa">WhatsApp · atiende el bot</span></header>
        <div class="chat" id="chat">${hilo(sel.c.msgs)}</div>
        <footer class="hilo-pie"><input disabled placeholder="Responde el bot. El ejecutivo puede tomar la conversación cuando quiera."><button class="btn-sec" type="button">Tomar conversación</button></footer>
      </section>
      <aside class="card conv-ficha">
        ${chip(p)}
        <h4>${esc(p.nombre)}</h4>
        <p class="meta">${p.canal} · ${esc(p.comuna)} · máquina ${p.maquina}</p>
        <h3>Por qué</h3>
        <ul class="motivos">${motivosOrdenados(p).map((m) => `<li><b>+${m.peso}</b>${esc(CORTO[m.clave](m))}</li>`).join('') || '<li>Sin señales de riesgo</li>'}</ul>
        <h3>Último pedido</h3>
        <p class="meta">${ult ? `${ult.id} · ${ult.items[0].kg} kg · ${clp(ult.total)} · ${estadoChip(ult)}` : '—'}</p>
        <a class="btn" href="#/local/${p.id}">Ver ficha completa</a>
      </aside>
    </div>`;
  }

  // ================================================================
  //  PEDIDOS
  // ================================================================
  function vPedidos() {
    const f = S.fped;
    const ids = new Set(M.puntos.filter(enAlcance).map((p) => p.id));
    const base = M.pedidos.filter((x) => ids.has(x.punto) && M.diasDesde(x.fecha) <= 45);
    const abiertos = base.filter((x) => x.estado !== 'Entregado').length;
    const entregados = base.filter((x) => x.estado === 'Entregado');
    const otif = entregados.filter((x) => x.aTiempo).length / (entregados.length || 1);
    const digital = base.filter((x) => DIGITAL.has(x.canalPedido)).length / (base.length || 1);
    let lista = base;
    if (f.estado) lista = lista.filter((x) => x.estado === f.estado);
    if (f.canal) lista = lista.filter((x) => x.canalPedido === f.canal);
    lista = lista.slice().sort((a, b) => b.fecha - a.fecha);
    const POR = 50;
    const paginas = Math.max(1, Math.ceil(lista.length / POR));
    f.pagina = Math.min(f.pagina, paginas - 1);
    const vis = lista.slice(f.pagina * POR, (f.pagina + 1) * POR);
    return `
    <section class="franja">
      ${tarjetaOp('Pedidos · 45 días', num(base.length), 'en el alcance seleccionado')}
      ${tarjetaOp('Abiertos', num(abiertos), 'programados, por despachar o en ruta')}
      ${tarjetaOp('Cumplimiento OTIF', pct(otif), 'Referencia <b>92%</b> · meta <b>96%</b>')}
      ${tarjetaOp('Pedidos digitales', pct(digital), 'WhatsApp o flujo digital')}
    </section>
    <div class="filtros">
      <select data-fped="estado">${opciones(f.estado, [['', 'Todos los estados'], ['Programado', 'Programado'], ['Confirmado', 'Confirmado'], ['En camino', 'En camino'], ['Entregado', 'Entregado']])}</select>
      <select data-fped="canal">${opciones(f.canal, [['', 'Todos los canales'], ['WhatsApp', 'WhatsApp'], ['Digital', 'Digital'], ['Ejecutivo', 'Ejecutivo'], ['Correo', 'Correo'], ['Mensajería', 'Mensajería']])}</select>
      <span class="cuenta">${num(lista.length)} pedidos</span>
    </div>
    <div class="card tabla-wrap" style="padding:6px 8px"><table>
      <thead><tr><th>Pedido</th><th>Local</th><th>Fecha</th><th>Canal</th><th>Detalle</th><th class="num">Total</th><th>Comprometida</th><th>Estado</th></tr></thead>
      <tbody>${vis.map((x) => {
        const p = M.porId[x.punto];
        return `<tr data-href="#/local/${p.id}">
          <td>${x.id}</td><td><span class="nombre-local">${esc(p.nombre)}</span><small>${p.canal} · ${esc(p.comuna)}</small></td>
          <td>${fecha(x.fecha)}</td><td>${x.canalPedido}</td><td>${x.items[0].kg} kg · ${esc(x.items[0].nombre.replace(' · 1 kg', ''))}</td>
          <td class="num">${clp(x.total)}</td><td>${fecha(x.comprometida)}</td>
          <td>${estadoChip(x)}${marcaTarde(x)}</td></tr>`;
      }).join('') || '<tr><td colspan="8" class="vacio">Sin pedidos para este filtro.</td></tr>'}</tbody>
    </table></div>
    ${paginas > 1 ? `<div class="paginas"><button class="btn-sec" data-pagped="-1" ${f.pagina === 0 ? 'disabled' : ''}>← Anterior</button><span>Página ${f.pagina + 1} de ${num(paginas)}</span><button class="btn-sec" data-pagped="1" ${f.pagina >= paginas - 1 ? 'disabled' : ''}>Siguiente →</button></div>` : ''}`;
  }

  // ================================================================
  //  DESPACHOS · mapa de estados y agenda de visitas
  //  No planifica rutas ni flota: muestra qué está por salir, qué va en ruta,
  //  qué se entregó y qué repartos y mantenciones agendaron los clientes.
  // ================================================================
  const AG_CLASE = { Confirmado: 'ag-ok', Reagendado: 'ag-re', 'Por confirmar': 'ag-pend', Cancelado: 'ag-can', 'Por avisar': 'ag-est' };
  const diaDe = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const coordino = (x) => x.coordinacion || (x.canalPedido === 'WhatsApp' ? 'Pedido directo' : 'Sin agenda');
  const recordatorioDe = (a) => { const r = new Date(a.fecha); r.setDate(r.getDate() - 1); r.setHours(17, 0, 0, 0); return r; };
  const celdaLocal = (p) => `<td><span class="nombre-local">${esc(p.nombre)}</span><small>${p.canal} · ${esc(p.comuna)}</small></td>`;
  function tablaDesp(cols, filas, vacio, total, lim) {
    return `<div class="card tabla-wrap" style="padding:6px 8px"><table class="tabla-id"><thead><tr>${cols.map((c) => `<th>${c}</th>`).join('')}</tr></thead>
      <tbody>${filas.join('') || `<tr><td colspan="${cols.length}" class="vacio">${vacio}</td></tr>`}</tbody></table></div>
      ${total > lim ? `<p class="mas">y ${num(total - lim)} más</p>` : ''}`;
  }

  function calendario(piloto, abiertos) {
    // dos semanas hábiles desde el lunes de esta semana
    const lunes = diaDe(M.HOY); lunes.setDate(lunes.getDate() - ((lunes.getDay() + 6) % 7));
    const dias = [];
    for (let i = 0; i < 12; i++) { const d = new Date(lunes); d.setDate(lunes.getDate() + i); if (d.getDay() % 6) dias.push(d); }
    const hoy = diaDe(M.HOY).getTime();
    const sueltos = abiertos.filter((x) => !x.agenda);      // pedidos sin día acordado con el cliente
    return `<div class="cal">${dias.map((d) => {
      const t = d.getTime();
      const mismoDia = (f) => diaDe(f).getTime() === t;
      let cuerpo = '';
      if (piloto) {
        cuerpo = M.agenda.filter((a) => mismoDia(a.fecha) && (S.filtroAg === 'todo' || a.tipo === S.filtroAg)).map((a) => {
          const p = M.porId[a.punto];
          return `<a class="ag ${AG_CLASE[a.estado]}" href="#/local/${p.id}"><b>${ICONO_AG[a.tipo]} ${esc(p.nombre)}</b><span>${a.franja} · ${textoAgenda(a)}</span></a>`;
        }).join('') + (S.filtroAg === 'Mantención' ? '' : sueltos.filter((x) => mismoDia(x.comprometida)).map((x) => {
          const p = M.porId[x.punto];
          return `<a class="ag ag-ruta" href="#/local/${p.id}"><b>🚚 ${esc(p.nombre)}</b><span>${x.estado === 'En camino' ? 'En ruta' : 'Por despachar'} · pedido sin agenda</span></a>`;
        }).join(''));
      } else {
        const n = sueltos.filter((x) => mismoDia(x.comprometida)).length;
        if (n) cuerpo = `<div class="cal-cuenta">${num(n)}</div><span class="cal-nota">repartos por fecha de promesa, sin franja acordada</span>`;
      }
      return `<div class="cal-dia${t === hoy ? ' hoy' : t < hoy ? ' pasado' : ''}"><h5>${diaCorto(d)}${t === hoy ? ' · hoy' : ''}</h5>${cuerpo || '<span class="cal-nota">—</span>'}</div>`;
    }).join('')}</div>`;
  }

  function vDespachos() {
    const k = kpis();
    const piloto = S.alcance === 'piloto';
    const ped = k.pts.flatMap((p) => M.pedidosDe[p.id]);
    const porDespachar = ped.filter((x) => x.estado === 'Confirmado' || x.estado === 'Programado').sort((a, b) => a.comprometida - b.comprometida);
    const enRuta = ped.filter((x) => x.estado === 'En camino').sort((a, b) => esAtrasado(b) - esAtrasado(a) || a.comprometida - b.comprometida);
    const historial = ped.filter((x) => x.estado === 'Entregado' && M.diasDesde(x.entrega) <= 30).sort((a, b) => b.entrega - a.entrega);
    const hoy = diaDe(M.HOY).getTime();
    const agenda = piloto ? M.agenda : [];
    const proximas = agenda.filter((a) => (a.estado === 'Confirmado' || a.estado === 'Reagendado') && a.fecha.getTime() >= hoy && a.fecha.getTime() < hoy + 14 * M.DIA);
    const LIM = 40;
    const tab = S.tabDesp;
    const TABS = [['calendario', 'Calendario', piloto ? proximas.length : porDespachar.length + enRuta.length],
      ['por-despachar', 'Por despachar', porDespachar.length], ['en-ruta', 'En ruta', enRuta.length], ['historial', 'Historial · 30 días', historial.length]];

    let contenido;
    if (tab === 'por-despachar') {
      contenido = tablaDesp(['Pedido', 'Local', 'Sale para', 'Cómo se coordinó', 'Recordatorio', 'Estado'], porDespachar.slice(0, LIM).map((x) => {
        const p = M.porId[x.punto];
        const ag = x.agenda && M.agenda.find((a) => a.id === x.agenda);
        const rec = ag ? recordatorioDe(ag) : null;
        return `<tr data-href="#/local/${p.id}"><td>${x.id}</td>${celdaLocal(p)}
          <td>${ag ? `${diaCorto(ag.fecha)} · ${fecha(ag.fecha)}<small>${ag.franja}</small>` : `${fecha(x.comprometida)}<small>fecha de promesa · ${p.region}</small>`}</td>
          <td>${coordino(x)}</td>
          <td>${rec ? (rec < M.HOY ? '✓ Enviado' : `Sale ${diaCorto(rec)} · 17:00`) : '<span class="suave">—</span>'}</td>
          <td>${estadoChip(x)}</td></tr>`;
      }), 'No hay pedidos por despachar.', porDespachar.length, LIM);
    } else if (tab === 'en-ruta') {
      contenido = tablaDesp(['Pedido', 'Local', 'Llega', 'Plazo', 'Aviso al cliente'], enRuta.slice(0, LIM).map((x) => {
        const p = M.porId[x.punto];
        const atr = esAtrasado(x);
        const h = Math.abs(x.comprometida - M.HOY) / HORA;
        const plazo = atr ? `<span class="plazo p-mal">${h < 1 ? 'Vence ahora' : 'Atrasado ' + duracion(h)}</span>` : `<span class="plazo ${h < 12 ? 'p-alerta' : 'p-ok'}">Quedan ${duracion(h)}</span>`;
        const aviso = !p.piloto ? '<span class="suave">Sin aviso</span>' : atr ? '✓ WhatsApp · avisó el atraso' : '✓ WhatsApp · sigue su pedido';
        return `<tr data-href="#/local/${p.id}" class="${atr ? 'fila-mal' : ''}"><td>${x.id}</td>${celdaLocal(p)}
          <td>${fecha(x.comprometida)}<small>${x.franja || hora(x.comprometida)}</small></td><td>${plazo}</td><td>${aviso}</td></tr>`;
      }), 'No hay pedidos en ruta.', enRuta.length, LIM);
    } else if (tab === 'historial') {
      const ok = historial.length ? historial.filter((x) => x.aTiempo).length / historial.length : 0;
      contenido = tablaDesp(['Pedido', 'Local', 'Fecha acordada', 'Entregado', 'Resultado', 'Cómo se coordinó'], historial.slice(0, LIM).map((x) => {
        const p = M.porId[x.punto];
        return `<tr data-href="#/local/${p.id}"><td>${x.id}</td>${celdaLocal(p)}
          <td>${fecha(x.comprometida)}<small>${hora(x.comprometida)}</small></td><td>${fecha(x.entrega)}<small>${hora(x.entrega)}</small></td>
          <td>${x.aTiempo ? '<span class="plazo p-ok">A tiempo</span>' : `<span class="plazo p-mal">Tarde · ${duracion((x.entrega - x.comprometida) / HORA)}</span>`}</td>
          <td>${coordino(x)}</td></tr>`;
      }), 'Sin entregas en los últimos 30 días.', historial.length, LIM)
        + `<p class="nota">Entregas a tiempo en estos 30 días: <b>${pct(ok)}</b> · referencia 92%, meta 96%.</p>`;
    } else {
      contenido = (piloto ? `<div class="filtros"><div class="seg">${[['todo', 'Todo'], ['Reparto', '🚚 Repartos'], ['Mantención', '🔧 Mantenciones']].map(([v, l]) =>
          `<button data-filtro-ag="${v}" class="${S.filtroAg === v ? 'on' : ''}">${l}</button>`).join('')}</div>
          <span class="cuenta">${plural(agenda.filter((a) => a.estado === 'Por confirmar').length, 'aviso esperando respuesta', 'avisos esperando respuesta')}</span></div>` : '')
        + calendario(piloto, porDespachar.concat(enRuta))
        + (piloto ? `<div class="leyenda">${[['#EEF5EC', 'var(--ok)', 'Confirmado por el cliente'], ['#E8F0F8', '#2F6DA3', 'Reagendado'], ['#FDF6DE', 'var(--warn)', 'Esperando respuesta'],
          ['#F1EFEA', 'var(--gris)', 'Cancelado'], ['transparent', 'var(--gris)', 'Fecha estimada, aviso por salir'], ['#F3F1EC', 'var(--tinta)', 'Pedido sin agenda']]
          .map(([bg, c, l]) => `<span><i style="background:${bg};border-left:3px solid ${c};width:14px"></i>${l}</span>`).join('')}</div>` : '');
    }

    return `
    <div class="intro"><p>${piloto
      ? 'Marley escribe primero: cuando se acerca la fecha de reparto o de mantención, el cliente elige día y franja según su disponibilidad. El día anterior recibe un recordatorio y puede confirmar, reagendar o cancelar, así la visita llega cuando hay alguien para recibirla.'
      : 'Fuera del piloto no hay agenda: el pedido sale por fecha de promesa y el cliente no tiene cómo avisar que ese día no estará en el local.'}</p></div>
    <section class="franja">
      ${tarjetaOp('Por despachar', num(porDespachar.length), piloto ? 'programados por el cliente o confirmados' : 'confirmados, todavía en bodega')}
      ${tarjetaOp('En ruta', num(enRuta.length), `<b>${num(enRuta.filter(esAtrasado).length)}</b> con atraso`)}
      ${tarjetaOp('Agenda · próximos 14 días', piloto ? num(proximas.length) : '—', piloto ? `${num(proximas.filter((a) => a.tipo === 'Reparto').length)} repartos · ${num(proximas.filter((a) => a.tipo === 'Mantención').length)} mantenciones` : 'sin agenda fuera del piloto')}
      ${tarjetaOp('Cambios avisados', piloto ? num(agenda.filter((a) => a.estado === 'Reagendado' || a.estado === 'Cancelado').length) : '—', piloto ? 'reagendados o cancelados antes de la visita' : 'sin canal para reagendar')}
    </section>
    <div class="tabs">${TABS.map(([v, l, n]) => `<button data-tab-desp="${v}" class="${tab === v ? 'on' : ''}">${l}<em>${num(n)}</em></button>`).join('')}</div>
    ${contenido}`;
  }

  // ================================================================
  //  SERVICIO TÉCNICO
  // ================================================================
  const prom = (arr, f) => (arr.length ? arr.reduce((a, x) => a + f(x), 0) / arr.length : 0);
  const ESTADO_TEC = { 'Sin técnico asignado': 'e-confirmado', 'Visita agendada': 'e-camino', 'Esperando repuesto': 'e-futuro' };
  const DICE_FALLA = {
    'No calienta': 'La máquina no está calentando 😩', 'No muele': 'La máquina no está moliendo 😩', 'Pierde agua': 'La máquina está botando agua por abajo',
    'Baja presión': 'El café sale aguado, como sin presión', 'Error electrónico': 'La pantalla de la máquina muestra un error y no deja preparar',
  };
  function vTecnico() {
    const k = kpis();
    const piloto = S.alcance === 'piloto';
    const tickets = k.pts.flatMap((p) => M.incidenciasDe[p.id]).filter(esFalla);
    const espera = (i) => (i.horasRespuesta == null ? horasDesde(i.fecha) : null);   // horas sin técnico
    const abiertos = tickets.filter(ticketAbierto).sort((a, b) => (espera(b) ?? -1) - (espera(a) ?? -1) || a.fecha - b.fecha);
    const fuera = abiertos.filter((i) => espera(i) > PLAZO_TEC).length;
    const d90 = tickets.filter((i) => M.diasDesde(i.fecha) <= 90);
    const resueltos = d90.filter((i) => i.estado === 'Resuelto');
    const conRespuesta = d90.filter((i) => i.horasRespuesta != null);
    const d180 = tickets.filter((i) => M.diasDesde(i.fecha) <= 180);
    // reclamos y quiebres: no son tickets técnicos, pero alimentan el semáforo y hay que poder verlos
    const otras = k.pts.flatMap((p) => M.incidenciasDe[p.id])
      .filter((i) => !esFalla(i) && M.diasDesde(i.fecha) <= 90)
      .sort((a, b) => b.fecha - a.fecha);
    const LIM = 30;

    // salud del parque: una máquina por local, fallas de los últimos 6 meses
    const fallasDe = (p) => M.incidenciasDe[p.id].filter((i) => esFalla(i) && M.diasDesde(i.fecha) <= 180);
    const parque = { sin: 0, una: 0, varias: 0 };
    const criticas = [];
    k.pts.forEach((p) => {
      const f = fallasDe(p);
      parque[f.length === 0 ? 'sin' : f.length === 1 ? 'una' : 'varias']++;
      if (f.length) criticas.push({ p, n: f.length, u: f.reduce((u, i) => (i.fecha > u.fecha ? i : u)) });
    });
    criticas.sort((a, b) => b.n - a.n || b.u.fecha - a.u.fecha);
    const conFalla = parque.una + parque.varias;
    const identificadas = d180.length ? d180.filter((i) => i.maquinaIdentificada).length / d180.length : 1;

    // medición mensual: promedio de los tickets abiertos cada mes
    const meses = [];
    for (let m = 5; m >= 0; m--) {
      const ini = new Date(M.HOY.getFullYear(), M.HOY.getMonth() - m, 1), fin = new Date(M.HOY.getFullYear(), M.HOY.getMonth() - m + 1, 1);
      const t = tickets.filter((i) => i.fecha >= ini && i.fecha < fin);
      const r = t.filter((i) => i.horasRespuesta != null), c = t.filter((i) => i.estado === 'Resuelto');
      meses.push({ etq: ini.toLocaleDateString('es-CL', { month: 'short' }).replace('.', ''), n: t.length,
        resp: r.length ? prom(r, (i) => i.horasRespuesta) : null, resol: c.length ? prom(c, (i) => i.horasResolucion) : null });
    }
    const tope = Math.max(60, ...meses.map((m) => m.resol || 0)) * 1.15;
    const barraH = (h, color) => (h == null ? '<i></i>' : `<i style="height:${(h / tope) * 100}%;background:${color}"><em>${Math.round(h)}</em></i>`);

    const tipos = {};
    d180.forEach((i) => { (tipos[i.detalle] = tipos[i.detalle] || []).push(i); });

    return `
    <div class="intro"><p>Cuando un local reporta una falla, el ticket se abre con la máquina y el local identificados. El técnico lo cierra desde su celular con la causa y el repuesto que usó: así se mide cuánto tarda la máquina en volver a funcionar, no solo la primera respuesta.</p></div>
    <section class="franja">
      ${tarjetaOp('Tickets abiertos', num(abiertos.length), `<b>${num(fuera)}</b> sin técnico hace más de ${PLAZO_TEC} h`)}
      ${tarjetaOp('Primera respuesta · 90 días', conRespuesta.length ? Math.round(prom(conRespuesta, (i) => i.horasRespuesta)) + ' h' : '—', 'Referencia <b>31 h</b> promedio')}
      ${tarjetaOp('Reparación · 90 días', resueltos.length ? duracion(prom(resueltos, (i) => i.horasResolucion)) : '—', 'desde el aviso hasta que vuelve a funcionar')}
      ${tarjetaOp('Primera visita · 90 días', resueltos.length ? pct(resueltos.filter((i) => i.visitas === 1).length / resueltos.length) : '—', 'resueltas sin volver al local')}
    </section>

    <h2 class="seccion">Tickets abiertos <span>primero los que llevan más tiempo sin técnico</span></h2>
    <div class="card tabla-wrap" style="padding:6px 8px"><table class="tabla-id">
      <thead><tr><th>Ticket</th><th>Local</th><th>Máquina</th><th>Falla</th><th>Abierto hace</th><th>Primera respuesta</th><th>Estado</th></tr></thead>
      <tbody>${abiertos.slice(0, LIM).map((i) => {
        const p = M.porId[i.punto];
        const e = espera(i);
        const resp = e == null ? `<span class="plazo ${i.horasRespuesta > PLAZO_TEC ? 'p-alerta' : 'p-ok'}">Respondió en ${i.horasRespuesta} h</span>`
          : e > PLAZO_TEC ? `<span class="plazo p-mal">Sin técnico · ${duracion(e)}</span>`
          : `<span class="plazo p-alerta">Sin técnico · quedan ${Math.ceil(PLAZO_TEC - e)} h</span>`;
        return `<tr data-href="#/local/${p.id}" class="${e > PLAZO_TEC ? 'fila-mal' : ''}">
          <td>${i.id}</td>
          <td><span class="nombre-local">${esc(p.nombre)}</span><small>${p.canal} · ${esc(p.comuna)}</small></td>
          <td>${i.maquinaIdentificada ? p.maquina : '<span class="tarde">Sin identificar</span>'}</td>
          <td>${esc(i.detalle)}</td>
          <td>${duracion(horasDesde(i.fecha))}<small>${fecha(i.fecha)} · ${hora(i.fecha)}</small></td>
          <td>${resp}</td>
          <td><span class="estado ${ESTADO_TEC[i.estado]}">${i.estado}</span></td></tr>`;
      }).join('') || '<tr><td colspan="7" class="vacio">No hay tickets abiertos.</td></tr>'}</tbody>
    </table></div>
    ${abiertos.length > LIM ? `<p class="mas">y ${num(abiertos.length - LIM)} tickets más</p>` : ''}

    <h2 class="seccion">Reclamos y quiebres <span>últimos 90 días · ${num(otras.length)} incidencias · ${k.reclamos.toFixed(1).replace('.', ',')} reclamos por 100 pedidos</span></h2>
    <div class="card tabla-wrap" style="padding:6px 8px"><table class="tabla-id">
      <thead><tr><th>Incidencia</th><th>Local</th><th>Tipo</th><th>Detalle</th><th>Cuándo</th></tr></thead>
      <tbody>${otras.slice(0, LIM).map((i) => {
        const p = M.porId[i.punto];
        return `<tr data-href="#/local/${p.id}">
          <td>${i.id}</td>
          <td><span class="nombre-local">${esc(p.nombre)}</span><small>${p.canal} · ${esc(p.comuna)}</small></td>
          <td>${i.tipo}</td>
          <td>${esc(i.detalle)}</td>
          <td>${fecha(i.fecha)}<small>hace ${num(M.diasDesde(i.fecha))} días</small></td></tr>`;
      }).join('') || '<tr><td colspan="5" class="vacio">Sin reclamos ni quiebres en los últimos 90 días.</td></tr>'}</tbody>
    </table></div>
    ${otras.length > LIM ? `<p class="mas">y ${num(otras.length - LIM)} incidencias más</p>` : ''}

    <section class="grid g-graf">
      <article class="card"><h3>Medición mensual · últimos 6 meses</h3>
        <div class="graf-area">
          <i class="graf-ref ref2" style="bottom:${(PLAZO_TEC / tope) * 100}%"></i>
          ${meses.map((m) => `<div class="gcol doble">${barraH(m.resp, 'var(--tinta)')}${barraH(m.resol, 'var(--verde-marca)')}</div>`).join('')}
        </div>
        <div class="graf-x">${meses.map((m) => `<span>${m.etq}<small>${m.n} tickets</small></span>`).join('')}</div>
        <div class="leyenda"><span><i style="background:var(--tinta)"></i>Primera respuesta (h)</span><span><i style="background:var(--verde-marca)"></i>Máquina operativa (h)</span><span><i class="l-linea ref2"></i>Línea base 31 h</span></div>
      </article>
      <article class="card"><h3>Salud del parque · ${num(k.total)} máquinas</h3>
        <div class="sem-barra">${[['sin', 'var(--ok)'], ['una', 'var(--warn)'], ['varias', 'var(--bad)']].map(([c, col]) => `<i style="width:${(parque[c] / k.total) * 100}%;background:${col}"></i>`).join('')}</div>
        <div class="leyenda" style="margin-top:8px"><span><i style="background:var(--ok)"></i>Sin fallas · ${num(parque.sin)}</span><span><i style="background:var(--warn)"></i>Una falla · ${num(parque.una)}</span><span><i style="background:var(--bad)"></i>Dos o más · ${num(parque.varias)}</span><span>últimos 6 meses</span></div>
        <div class="mini-kpis">
          <div><b>${conFalla ? pct(parque.varias / conFalla) : '—'}</b><span>Volvieron a fallar</span></div>
          <div><b>${pct(k.pts.filter((p) => !mantVencida(p)).length / k.total)}</b><span>Mantención al día · cada ${CICLO_MANT} días</span></div>
          <div><b>${pct(identificadas)}</b><span>Tickets con máquina identificada · base 75%</span></div>
          <div><b>${num(Math.round((d180.length / k.total) * 100))}</b><span>Fallas por cada 100 máquinas</span></div>
        </div>
        <p class="nota">${piloto ? 'En el piloto, el ticket se abre desde WhatsApp con el número de máquina: ninguno queda sin identificar. Cinco días antes de que venza la mantención, el bot ofrece días y franjas para agendarla.' : 'Fuera del piloto, 1 de cada 4 tickets no dice qué máquina falló: no se puede saber si es la misma que ya había fallado.'}</p>
      </article>
    </section>

    <section class="grid g-graf">
      <article class="card"><h3>Máquinas que más fallan · 6 meses</h3><div class="tabla-wrap"><table class="reg">
        <thead><tr><th>Máquina</th><th class="num">Fallas</th><th>Última falla</th><th>Mantención</th><th>Semáforo</th></tr></thead>
        <tbody>${criticas.slice(0, 8).map(({ p, n, u }) => `<tr data-href="#/local/${p.id}">
          <td><b>${p.maquina}</b><small>${esc(p.nombre)}</small></td><td class="num">${n}</td>
          <td>${esc(u.detalle)}<small>${hace(u.fecha)}</small></td>
          <td>${mantVencida(p) ? '<span class="tarde">Vencida</span>' : 'Al día'}<small>${proxMant(p) ? 'agendada ' + diaCorto(proxMant(p).fecha) : 'hace ' + M.diasDesde(p.ultimaMantencion) + ' días'}</small></td>
          <td>${chip(p)}</td></tr>`).join('') || '<tr><td colspan="5" class="vacio">Ninguna máquina con fallas.</td></tr>'}</tbody></table></div>
        <p class="nota">La máquina que falla seguido es un local en riesgo: cada falla suma al semáforo.</p>
      </article>
      <article class="card"><h3>Por tipo de falla · 6 meses</h3><div class="tabla-wrap"><table class="reg">
        <thead><tr><th>Falla</th><th class="num">Tickets</th><th class="num">1.ª respuesta</th><th class="num">Operativa en</th><th class="num">1.ª visita</th></tr></thead>
        <tbody>${Object.entries(tipos).sort((a, b) => b[1].length - a[1].length).map(([t, l]) => {
          const r = l.filter((i) => i.horasRespuesta != null), c = l.filter((i) => i.estado === 'Resuelto');
          return `<tr><td>${t}</td><td class="num">${num(l.length)}</td>
            <td class="num">${r.length ? Math.round(prom(r, (i) => i.horasRespuesta)) + ' h' : '—'}</td>
            <td class="num">${c.length ? duracion(prom(c, (i) => i.horasResolucion)) : '—'}</td>
            <td class="num">${c.length ? pct(c.filter((i) => i.visitas === 1).length / c.length) : '—'}</td></tr>`;
        }).join('') || '<tr><td colspan="5" class="vacio">Sin tickets en el período.</td></tr>'}</tbody></table></div>
        <p class="nota">«Operativa en»: horas desde el aviso hasta que la máquina vuelve a funcionar. «1.ª visita»: se resolvió sin volver.</p>
      </article>
    </section>`;
  }

  // ================================================================
  //  REGLAS
  // ================================================================
  function vReglas() {
    const piloto = M.puntos.filter((p) => p.piloto);
    const red = M.puntos.filter((p) => p.fichaCompleta);      // en la red solo se evalúa lo que tiene ficha
    const U = M.umbrales;
    const conteo = (pts, clave) => pts.filter((p) => ev(p.id).motivos.some((m) => m.clave === clave)).length;
    const dist = (pts) => { const c = { rojo: 0, amarillo: 0, verde: 0 }; pts.forEach((p) => { c[ev(p.id).color]++; }); return c; };
    const barraDist = (titulo, pts) => {
      const c = dist(pts);
      return `<div class="dist"><b>${titulo} · ${num(pts.length)} locales</b>
        <div class="sem-barra" style="margin:0 0 6px">${['rojo', 'amarillo', 'verde'].map((k) => `<i style="width:${(c[k] / pts.length) * 100}%;background:${COLOR_HEX[k]}"></i>`).join('')}</div>
        <span class="nota" style="margin:0">${num(c.rojo)} rojo · ${num(c.amarillo)} amarillo · ${num(c.verde)} verde</span></div>`;
    };
    // ejemplo: el local del piloto con más señales activas
    const ej = piloto.slice().sort((a, b) => ev(b.id).motivos.length - ev(a.id).motivos.length || ev(b.id).puntaje - ev(a.id).puntaje)[0];
    const ee = ev(ej.id);
    const hayAmarillo = U.rojo > U.amarillo;
    return `
    <section class="grid g-como">
      <article class="card">
        <h3>Cómo funciona</h3>
        <ol class="pasos">
          <li><b>1</b><div><strong>Detecta señales</strong><span>En los pedidos, las entregas, los tickets técnicos y los reclamos de cada local.</span></div></li>
          <li><b>2</b><div><strong>Cada señal suma puntos</strong><span>Las más graves suman más: dejar de pedir pesa más que una entrega tardía.</span></div></li>
          <li><b>3</b><div><strong>La suma define el color</strong><span>Los amarillos y rojos entran a la cola de Hoy.</span></div></li>
        </ol>
        <div class="escala-vis">
          <div class="tramo t-verde" style="flex:${Math.max(1, U.amarillo)}"><b>Verde</b><span>0 a ${U.amarillo - 1} pts</span></div>
          ${hayAmarillo ? `<div class="tramo t-amarillo" style="flex:${U.rojo - U.amarillo}"><b>Amarillo</b><span>${U.amarillo} a ${U.rojo - 1} pts</span></div>` : ''}
          <div class="tramo t-rojo" style="flex:3"><b>Rojo</b><span>${U.rojo} pts o más</span></div>
        </div>
      </article>
      <article class="card">
        <h3>Un ejemplo del piloto</h3>
        <p class="ej-nombre"><a href="#/local/${ej.id}">${esc(ej.nombre)}</a>${chip(ej)}</p>
        <ul class="porque">${motivosOrdenados(ej).map((m) => `<li><span class="peso">+${m.peso}</span><div><b>${esc(m.etiqueta)}</b><small>${esc(m.detalle)} · sale de ${ORIGEN[m.clave]}</small></div></li>`).join('')}</ul>
        <div class="ej-total">Suma <b>${ee.puntaje} puntos</b> → queda en <b>${ETIQ[ee.color].toLowerCase()}</b>${ee.color !== 'verde' ? ' y entra a la cola de Hoy' : ''}.</div>
      </article>
    </section>

    <h2 class="seccion">Ajustar las reglas <span>cambia un número y todos los locales se recalculan al instante</span></h2>
    <section class="grid g-reglas">
      <article class="card reglas"><div class="tabla-wrap"><table>
        <thead><tr><th>Señal</th><th>Sale de</th><th class="num">Suma</th><th class="num">Piloto</th><th class="num">Red evaluable</th></tr></thead>
        <tbody>${Object.entries(M.reglas).map(([k, r]) => `<tr><td>${esc(r.etiqueta)}</td><td><span class="origen">${ORIGEN[k]}</span></td>
          <td class="num"><input type="number" min="0" max="10" step="1" data-peso="${k}" value="${r.peso}"></td>
          <td class="num">${num(conteo(piloto, k))}</td><td class="num">${num(conteo(red, k))}</td></tr>`).join('')}</tbody>
      </table></div>
      <p class="nota">«Piloto» y «Red evaluable» cuentan cuántos locales tienen hoy esa señal activa.</p></article>
      <article class="card reglas"><h3>Umbrales</h3>
        <dl class="datos" style="margin-bottom:18px">
          <dt>Amarillo desde</dt><dd><input type="number" min="1" max="30" data-umbral="amarillo" value="${U.amarillo}"> pts</dd>
          <dt>Rojo desde</dt><dd><input type="number" min="1" max="30" data-umbral="rojo" value="${U.rojo}"> pts</dd>
        </dl>
        <h3>Resultado</h3>
        ${barraDist('Piloto', piloto)}
        ${barraDist('Red evaluable', red)}
        <button class="btn-sec" data-restablecer>Restablecer valores</button>
      </article>
    </section>`;
  }

  // ================================================================
  //  INTEGRACIONES
  // ================================================================
  const INTEG = [
    { id: 'wa', nombre: 'WhatsApp Business', rol: 'El canal del cliente', estado: 'Piloto', clase: 'e-activo', lado: 'canal',
      dinamica: 'El cliente escribe como siempre. El bot reconoce el local por su número, le ofrece su pedido habitual con los precios de su contrato y pasa la conversación a un ejecutivo cuando hace falta. Cuando se acerca la fecha de reparto o de mantención, escribe primero para que el cliente la agende.',
      entra: ['Mensajes del cliente', 'Día y franja elegidos', 'Reagendamientos y cancelaciones', 'Reportes de falla', 'Respuestas a encuestas de un toque'],
      sale: ['Aviso de fecha de reparto y de mantención', 'Recordatorio del día anterior', 'Confirmación del pedido', 'Estado y aviso de atraso', 'Número de ticket'],
      ritmo: 'En tiempo real', nota: 'Solo escribe a quien aceptó recibir mensajes, y ese consentimiento queda registrado.' },
    { id: 'crm', nombre: 'CRM comercial', rol: 'Cuentas y equipo comercial', estado: 'Piloto', clase: 'e-activo', lado: 'marley',
      dinamica: 'La consola completa la ficha que hoy está a medias y le devuelve al CRM lo que pasó con cada local, para que el equipo comercial trabaje sobre un solo registro.',
      entra: ['Razón social y RUT', 'Contacto y ejecutivo asignado', 'Condiciones comerciales', 'Oportunidades abiertas'],
      sale: ['Identificador de local y máquina', 'Canal, ubicación, tamaño y potencial', 'Color del semáforo', 'Acciones registradas', 'Fecha del último pedido'],
      ritmo: 'Todos los días, y al momento de registrar una acción' },
    { id: 'erp', nombre: 'ERP', rol: 'Pedidos, facturación e inventario', estado: 'Piloto', clase: 'e-activo', lado: 'marley',
      dinamica: 'Un pedido confirmado por WhatsApp entra al ERP como cualquier otro pedido, pero ya viene con su local identificado. La factura la sigue emitiendo el ERP, y la consola le devuelve la fecha real de entrega.',
      entra: ['Historial de pedidos y facturas', 'Precios de lista y descuentos de contrato', 'Stock disponible'],
      sale: ['Pedido confirmado con su local', 'Fecha real de entrega'],
      ritmo: 'Al confirmar un pedido y cada vez que cambia su estado' },
    { id: 'ter', nombre: 'Operadores terceros', rol: 'XYZ SPA y otros · 840 locales', estado: 'Por acordar', clase: 'e-pend', lado: 'canal',
      dinamica: 'Cada operador sube una planilla mensual con un formato mínimo acordado. La consola la revisa y cruza cada fila con su local.',
      entra: ['Identificador de local y RUT', 'Fecha', 'Producto y cantidad'],
      sale: ['Resultado de la revisión', 'Filas cruzadas y filas con error'],
      ritmo: 'Una vez al mes, al subir el archivo' },
    { id: 'tel', nombre: 'Telemetría de máquinas', rol: 'Consumo real en cada local', estado: 'Futuro', clase: 'e-futuro', lado: 'canal', futuro: true,
      dinamica: 'Si las máquinas pueden enviar datos, se conectan como una fuente más, sin cambiar el resto del sistema. El consumo real reemplaza la estimación que hoy se hace con el ritmo de pedidos.',
      entra: ['Tazas servidas', 'Nivel de café', 'Alertas de la máquina'],
      sale: [],
      ritmo: 'Depende de verificar qué máquinas del parque lo permiten' },
  ];
  function vIntegraciones() {
    const boton = (x) => `<button class="hub-item ${x.futuro ? 'futuro' : ''}" data-scroll="${x.id}"><b>${x.nombre}</b><span>${x.rol}</span></button>`;
    return `
    <div class="intro"><p>La consola no reemplaza el CRM ni el ERP: los conecta. Despachos y servicio técnico se gestionan dentro de la consola, junto a los pedidos y las conversaciones de cada local.</p></div>
    <section class="card hub">
      <div class="hub-col"><h4>Sistemas de Marley</h4>${INTEG.filter((x) => x.lado === 'marley').map(boton).join('')}</div>
      <div class="hub-flecha" aria-hidden="true">⇄</div>
      <div class="hub-centro">
        <div class="logo">MARLEY</div><b>Consola</b>
        <span>Locales · semáforo · conversaciones · pedidos · despachos · servicio técnico</span>
        <em>Llave común: RUT + número de máquina</em>
      </div>
      <div class="hub-flecha" aria-hidden="true">⇄</div>
      <div class="hub-col"><h4>Canales y terceros</h4>${INTEG.filter((x) => x.lado === 'canal').map(boton).join('')}</div>
    </section>
    <section class="grid g-integ">${INTEG.map((x) => `
      <article class="card integ ${x.futuro ? 'futuro' : ''}" id="integ-${x.id}">
        <header><div><h4>${x.nombre}</h4><small>${x.rol}</small></div><span class="estado ${x.clase}">${x.estado}</span></header>
        <p class="dinamica">${x.dinamica}</p>
        <div class="flujos">
          <div><h5>Lo que la consola recibe</h5><ul class="chips">${x.entra.map((c) => `<li>${c}</li>`).join('')}</ul></div>
          ${x.sale.length ? `<div class="sale"><h5>Lo que la consola devuelve</h5><ul class="chips">${x.sale.map((c) => `<li>${c}</li>`).join('')}</ul></div>` : ''}
        </div>
        <footer><span>⟳ ${x.ritmo}</span>${x.nota ? `<span>${x.nota}</span>` : ''}</footer>
      </article>`).join('')}
    </section>`;
  }

  // ================================================================
  //  ROUTER Y EVENTOS
  // ================================================================
  const VISTAS = { resumen: vResumen, hoy: vHoy, locales: vLocales, local: vLocal, conversaciones: vConversaciones, pedidos: vPedidos, despachos: vDespachos, tecnico: vTecnico, reglas: vReglas, integraciones: vIntegraciones };
  function ruta() {
    const [r, arg] = (location.hash.replace(/^#\/?/, '') || 'resumen').split('/');
    return VISTAS[r] ? [r, arg] : ['resumen'];
  }
  function render(mantenerScroll) {
    K = null;
    const [r, arg] = ruta();
    pintarLateral(r);
    pintarBarra(r);
    vista.innerHTML = VISTAS[r](arg);
    if (!mantenerScroll) window.scrollTo(0, 0);
    const chat = document.getElementById('chat');
    if (chat) chat.scrollTop = chat.scrollHeight;
  }

  function guardarPesos() {
    store.set('pesos', { reglas: Object.fromEntries(Object.entries(M.reglas).map(([k, r]) => [k, r.peso])), umbrales: { ...M.umbrales } });
    invalidar();
    render(true);
  }

  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-alcance],[data-registrar],[data-deshacer],[data-pagina],[data-pagped],[data-filtrar-color],[data-restablecer],[data-scroll],[data-tab-desp],[data-filtro-ag],tr[data-href]');
    if (!t) return;
    const d = t.dataset;
    if (d.alcance) {
      S.alcance = d.alcance; store.set('alcance', S.alcance);
      S.filtros.pagina = 0; S.fped.pagina = 0;
      if (S.alcance === 'piloto' && S.filtros.color === 'gris') S.filtros.color = '';
      render(true);
    } else if (d.registrar) {
      S.acciones[d.registrar] = { tipo: d.tipo }; store.set('acciones', S.acciones); render(true);
    } else if (d.deshacer) {
      delete S.acciones[d.deshacer]; store.set('acciones', S.acciones); render(true);
    } else if (d.pagina) {
      S.filtros.pagina = Math.max(0, S.filtros.pagina + Number(d.pagina)); render();
    } else if (d.pagped) {
      S.fped.pagina = Math.max(0, S.fped.pagina + Number(d.pagped)); render();
    } else if (d.filtrarColor !== undefined) {
      // el enlace navega a #/locales; antes dejamos listo el filtro
      S.filtros = { canal: '', region: '', color: d.filtrarColor, q: '', pagina: 0 };
    } else if (d.restablecer !== undefined) {
      aplicarPesos(PESOS_BASE); store.set('pesos', null); invalidar(); render(true);
    } else if (d.scroll) {
      const destino = document.getElementById('integ-' + d.scroll);
      if (destino) destino.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else if (d.tabDesp) {
      S.tabDesp = d.tabDesp; render(true);
    } else if (d.filtroAg) {
      S.filtroAg = d.filtroAg; render(true);
    } else if (t.matches('tr[data-href]')) {
      location.hash = d.href;
    }
  });

  document.addEventListener('change', (e) => {
    const d = e.target.dataset;
    if (d.filtro) { S.filtros[d.filtro] = e.target.value; S.filtros.pagina = 0; render(true); }
    else if (d.fped) { S.fped[d.fped] = e.target.value; S.fped.pagina = 0; render(true); }
    else if (d.peso) { M.reglas[d.peso].peso = Math.max(0, Number(e.target.value) || 0); guardarPesos(); }
    else if (d.umbral) { M.umbrales[d.umbral] = Math.max(1, Number(e.target.value) || 1); guardarPesos(); }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || !e.target.matches('[data-buscar]')) return;
    S.filtros = { canal: '', region: '', color: '', q: e.target.value.trim(), pagina: 0 };
    if (ruta()[0] === 'locales') render(); else location.hash = '#/locales';
  });

  window.addEventListener('hashchange', () => render());
  render();
})();
