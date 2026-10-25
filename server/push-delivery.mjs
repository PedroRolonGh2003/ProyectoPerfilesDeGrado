import crypto from 'node:crypto'

export const PUSH_TTL = 7 * 24 * 60 * 60
const excerpt = (value, length) => {
  const characters = Array.from(String(value ?? '').replace(/\s+/g, ' ').trim())
  return characters.length > length ? characters.slice(0, length - 1).join('') + '…' : characters.join('')
}

// A delivery is accepted by a push provider, not necessarily received by a phone.
// Locks serialize sending with logout and changes of subscription owner.
export async function deliverPendingPush({ pool, send, limit = 40 }) {
  const claimed = await pool.query(`
    WITH candidates AS (
      SELECT id FROM titulacion.entregas_notificaciones_push
      WHERE (estado = 'PENDIENTE' AND disponible_desde <= now())
         OR (estado = 'PROCESANDO' AND actualizada_en < now() - interval '5 minutes')
      ORDER BY creado_en LIMIT $1 FOR UPDATE SKIP LOCKED
    )
    UPDATE titulacion.entregas_notificaciones_push d
    SET estado = 'PROCESANDO', intentos = intentos + 1, actualizada_en = now()
    FROM candidates c WHERE d.id = c.id
    RETURNING d.id, d.suscripcion_id`, [Math.min(Math.max(limit, 1), 100)])
  let delivered = 0
  for (let start = 0; start < claimed.rows.length; start += 5) {
    await Promise.all(claimed.rows.slice(start, start + 5).map(async (job) => {
      const client = await pool.connect()
      try {
        await client.query('BEGIN')
        const subscription = (await client.query(`SELECT * FROM titulacion.suscripciones_push WHERE id = $1 FOR UPDATE`, [job.suscripcion_id])).rows[0]
        const delivery = (await client.query(`
          SELECT d.*, n.usuario_id, n.titulo, n.mensaje, n.creada_en, u.activo AS usuario_activo
          FROM titulacion.entregas_notificaciones_push d
          JOIN titulacion.notificaciones n ON n.id = d.notificacion_id
          JOIN titulacion.usuarios u ON u.id = n.usuario_id
          WHERE d.id = $1 AND d.estado = 'PROCESANDO' FOR UPDATE OF d`, [job.id])).rows[0]
        if (!delivery) { await client.query('COMMIT'); return }
        const ttl = Math.min(PUSH_TTL, Math.floor((new Date(delivery.creada_en).getTime() + PUSH_TTL * 1000 - Date.now()) / 1000))
        if (!subscription?.activa || subscription.usuario_id !== delivery.usuario_id || !delivery.usuario_activo || ttl <= 0) {
          await client.query(`UPDATE titulacion.entregas_notificaciones_push SET estado = 'CANCELADO', ultimo_error = 'Dispositivo desvinculado, cuenta inactiva o aviso vencido.', actualizada_en = now() WHERE id = $1`, [job.id])
        } else {
          try {
            await send({ endpoint: subscription.endpoint, keys: { p256dh: subscription.clave_p256dh, auth: subscription.clave_auth } },
              JSON.stringify({
                notificationId: delivery.notificacion_id,
                userId: delivery.usuario_id,
                title: excerpt(delivery.titulo, 100),
                body: excerpt(delivery.mensaje, 240),
              }),
              { TTL: ttl, urgency: 'normal', timeout: 10000, topic: crypto.createHash('sha256').update(delivery.notificacion_id).digest('base64url').slice(0, 32) })
            await client.query(`UPDATE titulacion.entregas_notificaciones_push SET estado = 'ENVIADO', enviado_en = now(), actualizada_en = now(), ultimo_error = NULL WHERE id = $1`, [job.id])
            await client.query(`UPDATE titulacion.suscripciones_push SET ultimo_envio_exitoso_en = now(), ultimo_error = NULL WHERE id = $1`, [subscription.id])
            delivered += 1
          } catch (error) {
            // Never persist provider response bodies: they can contain endpoint credentials.
            const status = Number(error?.statusCode) || 0
            const message = status ? `Servicio push: HTTP ${status}` : 'No fue posible contactar con el servicio push.'
            if (status === 404 || status === 410) {
              await client.query(`UPDATE titulacion.suscripciones_push SET activa = false, ultimo_error = $2, actualizada_en = now() WHERE id = $1`, [subscription.id, message])
              await client.query(`UPDATE titulacion.entregas_notificaciones_push SET estado = 'CANCELADO', ultimo_error = $2, actualizada_en = now() WHERE suscripcion_id = $1 AND estado IN ('PENDIENTE','PROCESANDO')`, [subscription.id, message])
            } else {
              await client.query(`UPDATE titulacion.entregas_notificaciones_push SET estado = CASE WHEN intentos >= 10 THEN 'ERROR' ELSE 'PENDIENTE' END,
                disponible_desde = now() + interval '1 minute' * LEAST(power(2, LEAST(intentos, 6)), 60), ultimo_error = $2, actualizada_en = now() WHERE id = $1`, [job.id, message])
            }
          }
        }
        await client.query('COMMIT')
      } catch (error) {
        await client.query('ROLLBACK').catch(() => undefined)
        throw error
      } finally { client.release() }
    }))
  }
  return delivered
}
