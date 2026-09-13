# Consola Marley · prototipo

Prototipo funcional de la consola B2B propuesta para el food service de Marley Coffee Chile, desarrollado para el **Desafío Marley Coffee** del Taller Aplicado de Marketing III (TMA1103) de Ingeniería en Marketing Digital, Duoc UC · 2026.

**Ver el prototipo:** https://alejog1302.github.io/marley-consola/

> Todos los datos son **sintéticos**: se generan con una semilla fija y siguen las proporciones del documento del desafío. Ningún local, persona, RUT, pedido ni ticket corresponde a clientes reales de Marley Coffee.

## Qué muestra

La consola es para el equipo de Marley. El cliente no aprende ningún sistema nuevo: sigue usando WhatsApp, ahora automatizado.

| Sección | Qué responde |
|---|---|
| Resumen | Cómo está la red hoy: semáforo de riesgo, prioridades, operación y riesgo por zona |
| Hoy | A quién llamar y por qué, con las acciones Llamé, Agendé visita y Resuelto |
| Locales y ficha | Qué le pasa a cada local: identidad, motivos del color, contrato y agenda |
| Conversaciones | El WhatsApp de cada local: pedidos, aviso de fecha de reparto, recordatorios y reagendamientos |
| Pedidos | Qué entró y en qué estado está |
| Despachos | Calendario de repartos y mantenciones, por despachar, en ruta e historial |
| Servicio técnico | Tickets por horas sin técnico, tiempo de reparación y salud del parque de máquinas |
| Reglas | Cómo decide el semáforo, con pesos y umbrales editables |
| Integraciones | Qué recibe y qué devuelve la consola al CRM, al ERP, a WhatsApp y a los terceros |

El selector superior cambia todas las vistas entre el **piloto** (8 locales Horeca y 6 OCS) y la **red completa** (2.410 locales).

## Cómo abrirlo en local

No necesita instalación ni servidor: basta con abrir `index.html` en el navegador.

## Estructura

```
index.html      estructura de la página
css/app.css     estilos
js/data.js      datos sintéticos reproducibles (semilla fija)
js/rules.js     motor del semáforo: reglas explicables con pesos
js/app.js       interfaz: rutas, vistas y eventos
```
