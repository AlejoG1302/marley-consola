/* ============================================================
   MOTOR DEL SEMÁFORO · "Punto de Ebullición"
   Reglas explicables: cada señal suma puntos y el total define el color.
   Nada de caja negra: cada punto muestra qué sumó y por qué.
   ============================================================ */
(function () {
  const M = window.MARLEY;
  const DIA = M.DIA;

  // pesos y umbrales editables desde la pantalla "Reglas"
  M.reglas = {
    silencio:       { etiqueta: 'No pidió en su intervalo habitual',            peso: 3 },
    silencioLargo:  { etiqueta: 'Lleva 1,5 veces su intervalo sin pedir',       peso: 5 },
    falla:          { etiqueta: 'Falla de máquina · últimos 60 días',           peso: 2 },
    tardia:         { etiqueta: 'Entrega fuera de promesa · últimos 90 días',   peso: 1 },
    reclamo:        { etiqueta: 'Reclamo · últimos 90 días',                    peso: 2 },
    quiebre:        { etiqueta: 'Quiebre de stock · últimos 90 días',           peso: 2 },
    respuestaLenta: { etiqueta: 'Respuesta técnica sobre 31 h',                 peso: 1 },
  };
  M.umbrales = { amarillo: 4, rojo: 7 };

  // --- índices por punto (2.410 puntos × 20.000 pedidos no se recorren a lo bruto) ---
  function indexar() {
    M.porId = {}; M.pedidosDe = {}; M.incidenciasDe = {};
    M.puntos.forEach((p) => { M.porId[p.id] = p; M.pedidosDe[p.id] = []; M.incidenciasDe[p.id] = []; });
    M.pedidos.forEach((x) => M.pedidosDe[x.punto].push(x));
    M.incidencias.forEach((x) => M.incidenciasDe[x.punto].push(x));
    Object.values(M.pedidosDe).forEach((l) => l.sort((a, b) => a.fecha - b.fecha));
  }

  const diasDesde = (fecha) => Math.floor((M.HOY - fecha) / DIA);

  // --- evalúa un punto: puntaje, color y los motivos que lo explican ---
  function evaluar(id) {
    const p = M.porId[id];
    const ped = M.pedidosDe[id];
    const inc = M.incidenciasDe[id];
    const R = M.reglas;
    const motivos = [];
    const suma = (clave, veces, detalle) => {
      if (veces > 0) motivos.push({ clave, etiqueta: R[clave].etiqueta, peso: R[clave].peso * veces, veces, detalle });
    };

    const ultimo = ped[ped.length - 1];
    const sinPedir = ultimo ? diasDesde(ultimo.fecha) : 999;
    if (sinPedir > p.intervalo * 1.5) suma('silencioLargo', 1, sinPedir + ' días sin pedir · pide cada ' + p.intervalo);
    else if (sinPedir > p.intervalo * 1.25) suma('silencio', 1, sinPedir + ' días sin pedir · pide cada ' + p.intervalo);

    const en = (lista, dias) => lista.filter((x) => diasDesde(x.fecha) <= dias);
    const fallas = en(inc, 60).filter((x) => x.tipo === 'Falla de máquina');
    suma('falla', fallas.length, fallas.length + ' en 60 días');
    const tardias = en(ped, 90).filter((x) => !x.aTiempo && x.comprometida <= M.HOY);   // un pedido abierto cuenta recién cuando pasa su hora
    suma('tardia', tardias.length, tardias.length + ' de ' + en(ped, 90).length + ' pedidos');
    const reclamos = en(inc, 90).filter((x) => x.tipo === 'Reclamo');
    suma('reclamo', reclamos.length, reclamos.length + ' en 90 días');
    const quiebres = en(inc, 90).filter((x) => x.tipo === 'Quiebre de stock');
    suma('quiebre', quiebres.length, quiebres.length + ' en 90 días');
    // un ticket todavía sin técnico también cuenta: se miden las horas que lleva esperando
    const lentas = en(inc, 90).filter((x) => x.tipo === 'Falla de máquina' && (x.horasRespuesta ?? (M.HOY - x.fecha) / 3600000) > 31);
    suma('respuestaLenta', lentas.length, lentas.length + ' tickets sobre 31 h');

    const puntaje = motivos.reduce((a, m) => a + m.peso, 0);
    const color = puntaje >= M.umbrales.rojo ? 'rojo' : puntaje >= M.umbrales.amarillo ? 'amarillo' : 'verde';
    return { id, puntaje, color, motivos, sinPedir, ultimo };
  }

  // --- cambios en vivo (la demo de WhatsApp los usa) ---
  function agregarPedido(pedido) { M.pedidos.push(pedido); M.pedidosDe[pedido.punto].push(pedido); }
  function agregarIncidencia(inc) { M.incidencias.push(inc); M.incidenciasDe[inc.punto].push(inc); }

  indexar();
  Object.assign(M, { indexar, evaluar, agregarPedido, agregarIncidencia, diasDesde });
})();
