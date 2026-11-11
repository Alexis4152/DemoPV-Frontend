# Changelog — DemoPV Frontend

Cambios del portal. Los del servidor están en el `CHANGELOG.md` de DemoPV-Backend.
Los números entre paréntesis son las secciones de la matriz `Pruebas aprobacion DemoPV (version 4).xlsx`.
Cada versión lleva su fecha; la más reciente va primero.

## [2.0.6] — 2026-11-10

Rama `feature/cobro-rapido`. Solo frontend.

### Cambios

- **Cobro rápido en el POS:** en efectivo hay botones de billetes: "Exacto" y el total redondeado hacia arriba a 10, 50, 100, 500 y 1000 (p. ej. $137 → 140, 150, 200, 500, 1000). "Sumar billetes" cambia los botones a +$20…+$1,000 para cuando pagan con varios billetes. El campo "Otro monto" sigue para cualquier otra cantidad.
- **Método de pago con botones:** Efectivo, Tarjeta y Transferencia son 3 botones en vez de una lista. Después de cada venta regresa a Efectivo.
- **Panel de cobro reordenado:** total grande arriba, luego método, billetes y cambio, y el botón Cobrar. Por concepto y Anticipo quedan debajo de Cobrar. Ticket, cliente y correo van plegados en "Más opciones" (se abre solo si alguno tiene error). El tipo de ticket se recuerda entre ventas.
- **Sin pantalla de "Venta registrada":** al cobrar sale un aviso arriba del carrito con folio, recibido, cambio, "Reimprimir" y el aviso de stock mínimo. No bloquea el POS: se quita al agregar el primer producto de la siguiente venta o con la ✕, y el lector de códigos funciona mientras está visible.

### Despliegue

- No necesita backend nuevo. Se puede publicar sola sobre la 2.0.5.

## [2.0.5] — 2026-11-09

Sin commit todavía.

### Cambios

- **Descontar viene marcado:** en Entregar y en Cobrar, lo sobre pedido con piezas suficientes trae marcada la casilla de descontar del inventario (para no descontar, se desmarca). En Ver productos las leyendas dicen "sobre pedido, sin descontar del inventario" y "por pedido, no maneja inventario", igual que en Movimientos.
- **Precio en oferta por producto:** en Ofertas, cada producto elegido tiene su campo "Precio oferta" (obligatorio) y muestra su precio oficial. En el POS la columna Precio muestra el de la oferta con el oficial tachado, y no deja pasar del límite de promociones por venta (avisa y el botón + se bloquea). El precio en oferta tiene que ser menor al precio oficial (ni igual ni mayor).
- **Sin leyenda de retención:** la tienda en línea ya no dice cuánto se retiene si el cliente cancela un apartado con anticipo.

### Despliegue

- Publicar junto con el backend 2.0.5: Ofertas usa el campo nuevo `productPrices`.

## [2.0.0] — 2026-11-09

Commit `c07f47f`. Cambios del 2026-10-28 (commit `e31e483`) al 2026-11-09.

**Estado de validación:** de 312 casos en la matriz, 212 están OK, 99 pendientes, 1 no aplica y ninguno en falla. La sección 32 ya está validada; 34 y 35 van a medias, y 33, 36, 37, 38 y 39 aún no se validan en pantalla.

### Correcciones críticas

- **Ventas con total negativo (1):** el POS valida descuentos e impuestos, y muestra el motivo del rechazo.

### Correcciones graves

- **Cancelar y devolver (2):** Ventas muestra Cancelar en un turno abierto y Devolver en uno cerrado. Las ventas devueltas llevan insignia y su detalle dice quién, cuándo y el motivo.
- **Anticipos en Ventas (5):** anticipos y abonos ya no muestran Cancelar ni Devolver, y enlazan a su apartado.
- **Cobro final de un apartado (6):** cancelar pide confirmación y avisa que el apartado vuelve a quedar activo.

### Correcciones medias

- **Avisos de descuento (16):** un solo aviso, sin repetirse mientras se teclea.
- **Texto largo (2):** un motivo sin espacios hace salto de línea y ya no genera barra horizontal.
- **Venta por concepto (31):** errores bajo cada campo para nombre, cantidad, precio, peso y total.
- **Devolución de apartado (30):** si se rebasan el monto y los días, el modal muestra los dos avisos y no deja registrar.
- **Ver pagos:** se carga al pasar el mouse y se guarda mientras no cambie el apartado, para abrir más rápido.

### Funcionalidades nuevas

**Ventas y POS**
- **Motivo de cancelación y devolución (2, 9):** modal con motivo y selector por producto: Regresa, Merma o No regresó.
- **Subtablas (28, 29):** los productos se abren dentro de la tabla, sin modal, y las ventas enlazan con su apartado.
- **Filtro "Devuelta" (3).**
- **Productos sobre pedido (35):** un producto sin piezas suficientes se agrega marcado "Sobre pedido". Mientras esté en el carrito, no deja cobrar una venta normal.

**Apartados y anticipos**
- **Ver pagos (8):** desglose de cobros con estado, total, pagado y lo que falta.
- **Abonos (18):** modal de cobro con Liquidar o Abonar.
- **Columna Folio (20):** ordenable.
- **Devolver un apartado completado (10):** modal con motivo, resumen y qué pasó con cada producto.
- **Inventario por revisar (11):** aviso con contador, filtro y modal de revisión.
- **Motivo de la devolución (5, 17, 23):** "Cambió de opinión" o "Defectuoso"; esta última solo para administrador o supervisor.
- **Anticipo mínimo (23):** se muestra y valida en el modal de anticipo.
- **Pago completo (34):** al capturar el total, avisa cómo se divide y que el apartado queda pagado y por entregar. Solo imprime el ticket de la liquidación.
- **Inventario en el anticipo (35):** "Descontar ahora" o "Sobre pedido" por producto.
- **Liquidar con sobre pedido (35):** se marca qué productos salen del inventario y se muestran las piezas disponibles.
- **Pagado · por entregar (34, 35):** estado nuevo en Apartados, con botón Entregar donde se marca qué sale del inventario. La columna Entrega muestra cuándo se entregó, Movimientos de inventario tiene el filtro "Apartado entregado", y la tienda en línea lo muestra como "Pagado, por entregar".
- **Registrar anticipo:** en Inventario también aparecen los productos por pedido, sin botones y con la leyenda "Por pedido: no maneja inventario".
- **Liquidar o completar:** el modal lista todos los productos que se entregan, como en Entregar: lo que ya salió del inventario con ✓ ("al registrar el anticipo" o "al confirmar"), lo por pedido con "no maneja inventario" y lo sobre pedido con su casilla para descontar.
- **Entregas parciales (38):** el modal Entregar tiene una casilla por producto (todo marcado por omisión) y, en lo sobre pedido, si se descuenta del inventario. Lo ya entregado aparece bloqueado con su fecha. La fila muestra "Entregado 1 de 3" mientras falte algo. Al devolver, lo que no se entregó aparece aparte como "siguen en la tienda y regresan al inventario" y solo se pregunta por lo que sí se llevó.
- **Movimientos de inventario:** filtro nuevo "Abono". El color de la etiqueta sigue al cambio de stock (rojo si salió, verde si entró, gris si es informativo) y la cantidad 0 se ve en gris.
- **Columnas de Apartados:** se quitó la columna Ventas; las ventas (Anticipo, Abono, Liquidación · Venta #N) están en Ver pagos. La subtabla de productos tiene la columna Entregado (fecha y quién, "Pendiente" o "No se entregó") y Qué pasó muestra también la fecha y quién lo decidió.
- **Pagado en apartados completados:** muestra el total pagado, no solo el anticipo.
- **Acciones de Apartados:** cada fila muestra siempre Ver productos y Ver pagos (deshabilitado si no hay cobros); Cobrar, Cancelar y Devolver aparecen solo cuando aplican. El menú "+" agrupa Confirmar, Revisar inventario, Entregar, Reimprimir ticket y Ver ticket digital, con un punto ámbar si hay algo pendiente.
- **Tickets del apartado:** al reimprimir, si hay varios (anticipo, abonos, liquidación) se elige cuál. "Ver ticket digital" muestra el PDF en pantalla y permite enviarlo por correo o imprimirlo. En Historial de ventas es un botón más en cada venta.

**Corte de caja**
- **Movimientos del turno (4, 27, 32):** la tabla se renombró y ahora une movimientos de efectivo, ventas canceladas, devoluciones con tarjeta o transferencia y lo registrado antes de abrir. Lo que no cambia el esperado va en gris.
- **Productos en la tabla (16):** "Ver productos" abre el detalle y qué pasó con cada uno.
- **Cancelaciones de otra persona (4):** aviso y fila resaltada.
- **Traspaso de caja (27):** las devoluciones informativas se muestran como lista.
- **Apertura con excedente (32):** se captura primero el fondo. Si es menor a lo que quedó, permite registrar gastos o retiros con el modal de caja cerrada; lo que no se registre queda como diferencia al confirmar.
- **Destino "Otro" (32):** disponible en retiros del turno, con caja cerrada y al resolver diferencias.
- **Lista de personas al abrir (32):** solo cajeros, administradores y supervisores.

**Otros**
- **Inicio (16):** "Devoluciones de hoy" y neto después de devoluciones.
- **Datos de la tienda (22, 23, 36):** límites de devolución del cajero, anticipo mínimo y hora del reporte diario de inventario.
- **Tienda en línea (16, 17):** muestra la regla de retención, y la consulta por teléfono solo da fecha y estado.

### Despliegue

- Publicar junto con el backend: el portal usa endpoints y campos nuevos.
- Tras desplegar, recargar el portal en las cajas.

### Pendientes conocidos

- **Cantidad con pocas piezas:** los botones + y − y la cantidad escrita se detienen en el stock. Para pasar de ahí, hay que agregar el producto otra vez desde el buscador o catálogo, o marcarlo "Sobre pedido" en el modal de anticipo.
- **Conteo ciego:** se puede deducir desde Ventas y los totales del turno.
- **Por decidir:** el resto de las decisiones abiertas está en el changelog del backend.
