/* ============================================================
   DATOS SINTÉTICOS · Consola Marley
   Todo es ficticio y reproducible (semilla fija). Las proporciones
   siguen el caso: 1.150 puntos Horeca, 1.260 OCS, 68% Horeca en RM,
   OTIF 92%, 2,8 reclamos por 100 pedidos, 31 h de respuesta técnica,
   tickets con máquina identificada en 75% de los casos, piloto de 8 Horeca + 6 OCS.
   ============================================================ */
(function () {
  // --- generador aleatorio con semilla: mismos datos en cada carga ---
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const rnd = mulberry32(20260914);
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
  const entre = (a, b) => a + Math.floor(rnd() * (b - a + 1));
  const DIA = 86400000;

  // fecha fija para que la demo sea estable
  const HOY = new Date('2026-09-14T10:00:00');
  const hace = (dias) => new Date(HOY.getTime() - dias * DIA);

  // --- RUT chileno con dígito verificador válido (ficticio) ---
  function rut() {
    const cuerpo = entre(76000000, 77999999);
    let s = 0, m = 2, n = cuerpo;
    while (n > 0) { s += (n % 10) * m; n = Math.floor(n / 10); m = m === 7 ? 2 : m + 1; }
    const dv = 11 - (s % 11);
    const d = dv === 11 ? '0' : dv === 10 ? 'K' : String(dv);
    return cuerpo.toLocaleString('es-CL') + '-' + d;
  }

  const NOMBRES = ['Camila', 'Diego', 'Valentina', 'Matías', 'Fernanda', 'Tomás', 'Javiera', 'Ignacio',
    'Catalina', 'Sebastián', 'Constanza', 'Felipe', 'Antonia', 'Nicolás', 'Isidora', 'Benjamín'];
  const APELLIDOS = ['Rojas', 'Muñoz', 'Soto', 'Contreras', 'Silva', 'Martínez', 'Sepúlveda', 'Morales',
    'Fuentes', 'Castillo', 'Pizarro', 'Vergara', 'Tapia', 'Araya', 'Carrasco', 'Espinoza'];
  const persona = () => pick(NOMBRES) + ' ' + pick(APELLIDOS);
  const fono = () => '+56 9 ' + entre(4000, 9999) + ' ' + entre(1000, 9999);

  const PREF_HORECA = ['Café', 'Cafetería', 'Barista', 'Tostaduría', 'Bistró', 'Hotel', 'Restobar'];
  const LUGARES = ['del Parque', 'Alameda', 'Bellavista', 'Lastarria', 'Italia', 'Brasil', 'Costanera',
    'Plaza', 'Estación', 'Puerto', 'Cerro Alegre', 'Los Leones', 'Manquehue', 'Pocuro', 'Suecia'];
  const PREF_OCS = ['Minera', 'Constructora', 'Logística', 'Clínica', 'Estudio', 'Holding', 'Inmobiliaria'];
  const MARCAS_OCS = ['Andes', 'Pacífico', 'Cordillera', 'Austral', 'Atacama', 'Aconcagua', 'Elqui', 'Loa'];

  // regiones con su peso y la promesa de entrega del caso (48 h RM, 72–96 h regiones)
  const REG_HORECA = [
    { r: 'RM', p: 0.68, comunas: ['Santiago', 'Providencia', 'Las Condes', 'Ñuñoa', 'Vitacura', 'Maipú', 'La Florida'], horas: 48 },
    { r: 'Valparaíso', p: 0.12, comunas: ['Valparaíso', 'Viña del Mar', 'Quilpué'], horas: 72 },
    { r: 'Biobío', p: 0.08, comunas: ['Concepción', 'Talcahuano', 'Los Ángeles'], horas: 72 },
    { r: 'Otras', p: 0.12, comunas: ['La Serena', 'Rancagua', 'Talca', 'Temuco', 'Puerto Montt'], horas: 96 },
  ];
  const REG_OCS = [
    { r: 'RM', p: 0.62, comunas: ['Santiago', 'Providencia', 'Las Condes', 'Huechuraba', 'Pudahuel'], horas: 48 },
    { r: 'Norte', p: 0.18, comunas: ['Antofagasta', 'Calama', 'Iquique', 'Copiapó'], horas: 96 },
    { r: 'Centro-sur', p: 0.20, comunas: ['Rancagua', 'Talca', 'Concepción', 'Temuco'], horas: 72 },
  ];
  function region(tabla) {
    let x = rnd(), acc = 0;
    for (const t of tabla) { acc += t.p; if (x <= acc) return t; }
    return tabla[tabla.length - 1];
  }

  // catálogo con precio de lista por kg (ficticio); cada cuenta tiene su descuento de contrato
  const PRODUCTOS = [
    { sku: 'GR-OL-1K', nombre: 'Grano One Love · 1 kg', lista: 21900 },
    { sku: 'GR-BS-1K', nombre: 'Grano Buffalo Soldier · 1 kg', lista: 22900 },
    { sku: 'GR-GU-1K', nombre: 'Grano Get Up Stand Up · 1 kg', lista: 20900 },
    { sku: 'GR-LU-1K', nombre: 'Grano Lively Up · 1 kg', lista: 23900 },
    { sku: 'KT-LMP', nombre: 'Kit de limpieza de máquina', lista: 8900 },
  ];

  const puntos = [], pedidos = [], incidencias = [];
  let nPed = 1, nInc = 1;

  function crearPunto(i, canal) {
    const reg = region(canal === 'Horeca' ? REG_HORECA : REG_OCS);
    const nombre = canal === 'Horeca'
      ? pick(PREF_HORECA) + ' ' + pick(LUGARES)
      : pick(PREF_OCS) + ' ' + pick(MARCAS_OCS);
    return {
      id: 'P-' + String(i).padStart(4, '0'),
      nombre, canal,
      region: reg.r, comuna: pick(reg.comunas), horasPromesa: reg.horas,
      rut: rut(), contacto: persona(), telefono: fono(),
      maquina: 'MQ-' + entre(10000, 99999),
      intervalo: canal === 'Horeca' ? entre(24, 36) : entre(12, 20),   // días entre pedidos
      descuento: entre(5, 15) / 100,
      piloto: false,
      fichaCompleta: rnd() < 0.26,          // [C] 26 de cada 100 cuentas con ficha completa
      productosHabituales: [pick(PRODUCTOS.slice(0, 4)).sku],
    };
  }

  function historial(p, forzarSilencio) {
    // pedidos de los últimos 180 días según el intervalo habitual del punto
    let d = 180 - entre(0, p.intervalo);
    const silencio = p.esDemo ? false : (forzarSilencio || rnd() < 0.10);
    const corte = silencio ? p.intervalo * (1.3 + rnd() * 1.2) : 0;
    while (d > corte) {
      const kg = p.canal === 'Horeca' ? entre(6, 15) : entre(3, 8);
      const sku = p.productosHabituales[0];
      const prod = PRODUCTOS.find((x) => x.sku === sku);
      const precio = Math.round(prod.lista * (1 - p.descuento));
      const fecha = hace(d);
      const tarde = rnd() < 0.08;                                 // OTIF 92%
      pedidos.push({
        id: 'PD-' + String(nPed++).padStart(5, '0'), punto: p.id, fecha,
        items: [{ sku, nombre: prod.nombre, kg, precio }], total: kg * precio,
        canalPedido: p.piloto && d < 75 ? 'WhatsApp' : (rnd() < 0.18 ? 'Digital' : pick(['Ejecutivo', 'Correo', 'Mensajería'])),
        estado: 'Entregado',
        comprometida: new Date(fecha.getTime() + p.horasPromesa * 3600000),
        aTiempo: !tarde,
      });
      if (rnd() < 0.028) incidencias.push({ id: 'IN-' + nInc++, punto: p.id, tipo: 'Reclamo', fecha: hace(Math.max(d - 2, 1)), detalle: 'Pedido incompleto' });
      d -= Math.round(p.intervalo * (0.8 + rnd() * 0.45));
    }
    // fallas de máquina y quiebres
    const nFallas = rnd() < 0.35 ? entre(1, 2) : 0;
    for (let k = 0; k < nFallas; k++) incidencias.push({ id: 'IN-' + nInc++, punto: p.id, tipo: 'Falla de máquina', fecha: hace(entre(3, 170)), detalle: 'No calienta / no muele', horasRespuesta: entre(8, 60) });
    if (p.canal === 'OCS' && rnd() < 0.2) incidencias.push({ id: 'IN-' + nInc++, punto: p.id, tipo: 'Quiebre de stock', fecha: hace(entre(3, 90)), detalle: 'Sin café en la máquina' });
  }

  // --- red: 1.150 Horeca + 1.260 OCS ---
  let i = 1;
  for (let k = 0; k < 1150; k++) puntos.push(crearPunto(i++, 'Horeca'));
  for (let k = 0; k < 1260; k++) puntos.push(crearPunto(i++, 'OCS'));

  // --- piloto: 8 Horeca + 6 OCS (máximo que permite el caso), fichas completas ---
  const piloto = [...puntos.filter((p) => p.canal === 'Horeca' && p.region === 'RM').slice(0, 8),
                  ...puntos.filter((p) => p.canal === 'OCS' && p.region === 'RM').slice(0, 6)];
  piloto.forEach((p) => { p.piloto = true; p.fichaCompleta = true; });
  puntos.forEach((p) => { p.operador = 'Marley directo'; });
  puntos.filter((p) => p.canal === 'OCS' && !p.piloto).slice(0, 310).forEach((p) => { p.operador = 'XYZ SPA'; });

  // el piloto lleva nombres, comunas y contactos fijos: se ven en la demo y no pueden repetirse
  const PILOTO_H = [['Café Lastarria', 'Santiago'], ['Tostaduría Bellavista', 'Providencia'], ['Cafetería Los Leones', 'Providencia'],
    ['Bistró Italia', 'Ñuñoa'], ['Barista Manquehue', 'Las Condes'], ['Café Brasil', 'Santiago'], ['Hotel Costanera', 'Providencia'], ['Restobar Suecia', 'Providencia']];
  const PILOTO_O = ['Minera Aconcagua', 'Clínica Pacífico', 'Logística Austral', 'Constructora Andes', 'Inmobiliaria Atacama', 'Holding Cordillera'];
  const CONTACTOS = ['Camila Rojas', 'Diego Muñoz', 'Valentina Soto', 'Matías Contreras', 'Fernanda Silva', 'Tomás Martínez', 'Javiera Sepúlveda',
    'Ignacio Morales', 'Catalina Fuentes', 'Sebastián Castillo', 'Constanza Pizarro', 'Felipe Vergara', 'Antonia Tapia', 'Nicolás Araya'];
  piloto.forEach((p, k) => {
    if (k < 8) { p.nombre = PILOTO_H[k][0]; p.comuna = PILOTO_H[k][1]; } else { p.nombre = PILOTO_O[k - 8]; }
    p.contacto = CONTACTOS[k];
  });
  // en el resto de la red, un nombre repetido se distingue por comuna (y por número si aún choca)
  const usados = new Set(piloto.map((p) => p.nombre));
  puntos.filter((p) => !p.piloto).forEach((p) => {
    let n = p.nombre;
    if (usados.has(n)) { n = p.nombre + ' ' + p.comuna; let k = 2; while (usados.has(n)) n = p.nombre + ' ' + p.comuna + ' ' + k++; }
    usados.add(n); p.nombre = n;
  });

  // el local protagonista de la demo de WhatsApp
  const demo = piloto[0];
  Object.assign(demo, { nombre: 'Café Lastarria', comuna: 'Santiago', contacto: 'Camila Rojas', intervalo: 30, descuento: 0.1, esDemo: true });

  puntos.forEach((p) => historial(p, p.piloto && (p === piloto[5] || p === piloto[11])));

  // el protagonista parte en verde con dos entregas tardías recientes (+2): una falla lo sube a amarillo
  for (let k = incidencias.length - 1; k >= 0; k--) if (incidencias[k].punto === demo.id) incidencias.splice(k, 1);
  const pedDemo = pedidos.filter((x) => x.punto === demo.id);
  pedDemo.forEach((x) => { x.aTiempo = true; });
  const ultDemo = pedDemo[pedDemo.length - 1];
  ultDemo.fecha = hace(12);
  ultDemo.comprometida = new Date(ultDemo.fecha.getTime() + demo.horasPromesa * 3600000);
  pedDemo.slice(-2).forEach((x) => { x.aTiempo = false; });

  // ============================================================
  //  DESPACHOS Y SERVICIO TÉCNICO
  //  Semilla aparte: agregar esto no mueve ningún dato generado arriba.
  // ============================================================
  const rnd2 = mulberry32(914);
  const entre2 = (a, b) => a + Math.floor(rnd2() * (b - a + 1));
  const HORA = 3600000;
  const porId = Object.fromEntries(puntos.map((p) => [p.id, p]));

  // despachos: cada pedido llega dentro de su promesa (OTIF 92%) o con 4 a 40 h de atraso.
  // Si a la hora de corte todavía no llega, queda abierto: en preparación o en camino (atrasado si pasó su hora).
  pedidos.forEach((x) => {
    const promesa = porId[x.punto].horasPromesa;
    x.fecha = new Date(x.fecha.getTime() + entre2(-3, 6) * HORA);            // entre 07:00 y 16:00
    x.comprometida = new Date(x.fecha.getTime() + promesa * HORA);
    const llega = x.aTiempo ? promesa * (0.55 + rnd2() * 0.4) : promesa + entre2(4, 40);
    const h = (HOY - x.fecha) / HORA;
    if (h >= llega) { x.entrega = new Date(x.fecha.getTime() + llega * HORA); return; }
    x.entrega = null;
    x.estado = h < promesa * 0.4 ? 'Confirmado' : 'En camino';
  });

  // servicio técnico: tipo de falla, visitas, repuesto y horas hasta dejar la máquina operativa
  const FALLAS = ['No calienta', 'No muele', 'Pierde agua', 'Baja presión', 'Error electrónico'];
  const falla = () => FALLAS[Math.floor(rnd2() * FALLAS.length)];
  const identifica = (p) => p.piloto || rnd2() < 0.75;              // [C] hoy el ticket identifica la máquina en 75% de los casos
  incidencias.filter((i) => i.tipo === 'Falla de máquina').forEach((i) => {
    Object.assign(i, { detalle: falla(), visitas: rnd2() < 0.76 ? 1 : 2, repuesto: rnd2() < 0.2, maquinaIdentificada: identifica(porId[i.punto]) });
    i.horasResolucion = i.horasRespuesta + entre2(2, 20) + (i.visitas > 1 ? entre2(20, 48) : 0) + (i.repuesto ? entre2(24, 72) : 0);
    if ((HOY - i.fecha) / HORA >= i.horasResolucion) { i.estado = 'Resuelto'; return; }
    i.estado = i.repuesto ? 'Esperando repuesto' : 'Visita agendada';
    i.horasResolucion = null;
  });

  // tickets abiertos recientes · respuesta = horas hasta que un técnico toma el caso
  function ticketAbierto(p, horas, respuesta) {
    const esperando = horas < respuesta;
    incidencias.push({ id: 'IN-' + nInc++, punto: p.id, tipo: 'Falla de máquina', fecha: new Date(HOY.getTime() - horas * HORA),
      detalle: falla(), horasRespuesta: esperando ? null : respuesta, horasResolucion: null, visitas: 0, repuesto: false,
      maquinaIdentificada: identifica(p), estado: esperando ? 'Sin técnico asignado' : 'Visita agendada' });
  }
  puntos.forEach((p) => { if (!p.esDemo && rnd2() < 0.012) ticketAbierto(p, entre2(2, 56), entre2(8, 60)); });
  ticketAbierto(piloto[1], 38, 45);     // Tostaduría Bellavista: 38 h sin técnico, sobre la línea base de 31 h
  ticketAbierto(piloto[12], 20, 9);     // Inmobiliaria Atacama: técnico asignado, visita agendada

  // mantención preventiva: días desde la última visita a cada máquina
  puntos.forEach((p) => { p.ultimaMantencion = new Date(HOY.getTime() - (p.esDemo ? 34 : entre2(5, p.piloto ? 110 : 220)) * DIA); });

  // pedidos abiertos del piloto que entraron por WhatsApp: la bandeja tiene movimiento (Hotel Costanera viene atrasado)
  [[2, 'En camino', 1, true], [3, 'Confirmado', 0.03, true], [9, 'En camino', 1, true], [6, 'En camino', 3, false]].forEach(([k, estado, dias, aTiempo]) => {
    const pt = piloto[k];
    const ult = pedidos.filter((x) => x.punto === pt.id).pop();
    const fecha = hace(dias);
    pedidos.push({ id: 'PD-' + String(nPed++).padStart(5, '0'), punto: pt.id, fecha, items: [{ ...ult.items[0] }],
      total: ult.total, canalPedido: 'WhatsApp', estado, comprometida: new Date(fecha.getTime() + pt.horasPromesa * 3600000), aTiempo, entrega: null });
  });

  // ============================================================
  //  AGENDA DE REPARTOS Y MANTENCIONES (sólo piloto: requiere WhatsApp)
  //  Marley escribe primero cuando se acerca la fecha. El cliente elige día y franja,
  //  recibe un recordatorio el día anterior y puede confirmar, reagendar o cancelar.
  //  Semilla aparte para no mover los datos generados arriba.
  // ============================================================
  const rnd3 = mulberry32(1409);
  const CICLO_MANT = 90;                                            // [S] mantención preventiva cada 90 días
  const AVISO_DIAS = 5;                                             // [S] el aviso sale 5 días antes de la fecha estimada
  const FRANJAS = ['09:00–12:00', '12:00–15:00', '15:00–18:00'];   // [S] franjas ilustrativas
  const aLas = (d, h) => { const x = new Date(d); x.setHours(h, 0, 0, 0); return x; };
  const masDias = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  const habil = (d) => { let x = aLas(d, 0); while (x.getDay() === 0 || x.getDay() === 6) x = masDias(x, 1); return x; };
  const HOY0 = aLas(HOY, 0);
  const antesDeHoy = (d) => new Date(Math.min(d.getTime(), HOY.getTime() - HORA));
  const agenda = [];

  let kR = 0, kM = 0;                                               // los resultados se reparten sólo entre avisos ya enviados
  function agendar(p, tipo, estimada, k, base) {
    const franja = FRANJAS[k % 3];
    const a = { id: 'AG-' + String(agenda.length + 1).padStart(3, '0'), tipo, punto: p.id, franja, propuesta: habil(estimada),
      aviso: aLas(masDias(estimada, -AVISO_DIAS), 10), fecha: habil(estimada), estado: 'Por avisar', eventos: [], pedido: null };
    agenda.push(a);
    if (a.aviso > HOY) return;                                        // el aviso todavía no sale
    a.eventos.push({ t: a.aviso, que: 'aviso' });
    const resultado = tipo === 'Reparto' ? RES_REPARTO[kR++ % RES_REPARTO.length] : RES_MANT[kM++ % RES_MANT.length];
    if (resultado === 'Por confirmar') { a.estado = 'Por confirmar'; return; }
    a.fecha = habil(masDias(estimada, k % 2));                         // el cliente toma el día propuesto o el siguiente
    a.eventos.push({ t: antesDeHoy(new Date(a.aviso.getTime() + (1 + (k % 4)) * HORA)), que: 'programo' });
    a.estado = 'Confirmado';
    if (resultado === 'Reagendado') {
      a.antes = a.fecha; a.fecha = habil(masDias(a.antes, 2)); a.estado = 'Reagendado';
      a.eventos.push({ t: antesDeHoy(aLas(masDias(a.antes, -1), 18)), que: 'reagendo' });
    } else if (resultado === 'Cancelado') {
      a.estado = 'Cancelado'; a.nuevoAviso = habil(masDias(a.fecha, 7));
      a.eventos.push({ t: antesDeHoy(aLas(masDias(a.fecha, -1), 12)), que: 'cancelo' });
      return;
    }
    const recordatorio = aLas(masDias(a.fecha, -1), 17);
    if (recordatorio < HOY) a.eventos.push({ t: recordatorio, que: 'recordatorio' });
    if (tipo === 'Reparto') {
      const esHoy = a.fecha.getTime() === HOY0.getTime();              // el reparto de hoy ya salió a ruta
      pedidos.push({ id: 'PD-' + String(nPed++).padStart(5, '0'), punto: p.id, fecha: a.eventos[1].t, items: [{ ...base.items[0] }], total: base.total,
        canalPedido: 'WhatsApp', estado: esHoy ? 'En camino' : 'Programado', franja, comprometida: aLas(a.fecha, Number(franja.slice(6, 8))),
        aTiempo: true, entrega: null, agenda: a.id, coordinacion: a.estado === 'Reagendado' ? 'Reagendado por el cliente' : 'Programado por el cliente' });
      a.pedido = pedidos[pedidos.length - 1].id;
    }
  }

  // repartos: fecha estimada = último pedido + intervalo del local · mantenciones: última + 90 días
  const RES_REPARTO = ['Confirmado', 'Reagendado', 'Cancelado', 'Confirmado', 'Por confirmar', 'Confirmado'];
  const RES_MANT = ['Confirmado', 'Reagendado', 'Por confirmar', 'Confirmado'];
  let kr = 0, km = 0;
  piloto.forEach((p) => {
    if (p.esDemo) return;
    const suyos = pedidos.filter((x) => x.punto === p.id);
    const ult = suyos[suyos.length - 1];
    const estimada = aLas(masDias(ult.fecha, p.intervalo), 0);
    const dias = Math.round((estimada - HOY0) / DIA);
    // hasta 0,25 veces su intervalo de atraso todavía no es silencio: se le propone uno de los próximos días hábiles
    if (!suyos.some((x) => x.estado !== 'Entregado') && dias >= -Math.floor(p.intervalo * 0.25) && dias <= 14)
      agendar(p, 'Reparto', dias < 0 ? masDias(HOY0, 1 + (kr % 3)) : estimada, kr++, ult);
    const vence = aLas(masDias(p.ultimaMantencion, CICLO_MANT), 0);
    if (Math.round((vence - HOY0) / DIA) <= 14) agendar(p, 'Mantención', vence < HOY0 ? masDias(HOY0, 1 + (km % 6)) : vence, km++);
  });

  // cómo se coordinó cada entrega pasada del piloto por WhatsApp (el resto de la red no tiene agenda)
  pedidos.forEach((x) => {
    if (x.estado !== 'Entregado' || x.canalPedido !== 'WhatsApp') return;
    x.coordinacion = rnd3() < 0.65 ? (rnd3() < 0.15 ? 'Reagendado por el cliente' : 'Programado por el cliente') : 'Pedido directo';
  });

  window.MARLEY = { HOY, DIA, CICLO_MANT, PRODUCTOS, puntos, pedidos, incidencias, agenda, demoId: demo.id, sintetico: true };
})();
