import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.8'

type ReservationRecord = {
  id: string
  first_name: string
  last_name: string
  phone: string
  email: string | null
  guests: number
  date: string
  time: string
  status: 'pending' | 'confirmed' | 'cancelled' | 'completed'
  occasion: string | null
  special_requests: string | null
  notification_received_sent_at?: string | null
  notification_confirmed_sent_at?: string | null
  notification_cancelled_sent_at?: string | null
  notification_received_processing_at?: string | null
  notification_confirmed_processing_at?: string | null
  notification_cancelled_processing_at?: string | null
}

type WebhookPayload = {
  type: 'INSERT' | 'UPDATE' | 'DELETE'
  table: string
  schema: string
  record: ReservationRecord | null
  old_record: ReservationRecord | null
}

type NotificationEvent = 'received' | 'confirmed' | 'cancelled'

type EnvConfig = {
  resendApiKey: string
  resendFromEmail: string
  restaurantName: string
  restaurantPhone: string
  restaurantContactEmail: string
  webhookSecret: string
  supabaseUrl: string
  serviceRoleKey: string
}

let adminClient: ReturnType<typeof createClient> | null = null

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function formatReservationDate(date: string) {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(`${date}T12:00:00`))
}

function getEnvConfig(): EnvConfig {
  return {
    resendApiKey: Deno.env.get('RESEND_API_KEY') ?? '',
    resendFromEmail: Deno.env.get('RESEND_FROM_EMAIL') ?? '',
    restaurantName: Deno.env.get('RESTAURANT_NAME') ?? 'Restaurant Montreal',
    restaurantPhone: Deno.env.get('RESTAURANT_PHONE') ?? '',
    restaurantContactEmail: Deno.env.get('RESTAURANT_CONTACT_EMAIL') ?? '',
    webhookSecret: Deno.env.get('RESERVATION_WEBHOOK_SECRET') ?? '',
    supabaseUrl: Deno.env.get('SUPABASE_URL') ?? '',
    serviceRoleKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  }
}

function getMissingEnv(config: EnvConfig) {
  return [
    ['RESEND_API_KEY', config.resendApiKey],
    ['RESEND_FROM_EMAIL', config.resendFromEmail],
    ['RESERVATION_WEBHOOK_SECRET', config.webhookSecret],
    ['SUPABASE_URL', config.supabaseUrl],
    ['SUPABASE_SERVICE_ROLE_KEY', config.serviceRoleKey],
  ]
    .filter(([, value]) => !value)
    .map(([name]) => name)
}

function getAdminClient(config: EnvConfig) {
  if (!adminClient) {
    adminClient = createClient(config.supabaseUrl, config.serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  }

  return adminClient
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function eventSentColumn(event: NotificationEvent) {
  if (event === 'received') return 'notification_received_sent_at'
  if (event === 'confirmed') return 'notification_confirmed_sent_at'
  return 'notification_cancelled_sent_at'
}

function eventProcessingColumn(event: NotificationEvent) {
  if (event === 'received') return 'notification_received_processing_at'
  if (event === 'confirmed') return 'notification_confirmed_processing_at'
  return 'notification_cancelled_processing_at'
}

function detectNotificationEvent(payload: WebhookPayload): NotificationEvent | null {
  if (!payload.record) return null

  if (payload.type === 'INSERT') {
    return 'received'
  }

  if (payload.type === 'UPDATE' && payload.old_record?.status !== payload.record.status) {
    if (payload.record.status === 'confirmed') return 'confirmed'
    if (payload.record.status === 'cancelled') return 'cancelled'
  }

  return null
}

function buildEmailContent(record: ReservationRecord, event: NotificationEvent, config: EnvConfig) {
  const guestLabel = `${record.guests} guest${record.guests > 1 ? 's' : ''}`
  const fullName = `${record.first_name} ${record.last_name}`.trim()
  const safeRestaurantName = escapeHtml(config.restaurantName)
  const safeFullName = escapeHtml(fullName)
  const safeDate = escapeHtml(formatReservationDate(record.date))
  const safeTime = escapeHtml(record.time)
  const safeGuestLabel = escapeHtml(guestLabel)

  const eventConfig = {
    received: {
      subject: `${config.restaurantName} reservation received`,
      title: 'Reservation received',
      badge: 'Pending',
      status: 'Pending review',
      accent: '#C9A84C',
      message:
        'Thank you for your reservation. Your request has been received and is currently pending confirmation from our team.',
    },
    confirmed: {
      subject: `${config.restaurantName} reservation confirmed`,
      title: 'Reservation confirmed',
      badge: 'Confirmed',
      status: 'Confirmed',
      accent: '#4E8F62',
      message:
        'Your table is confirmed. We look forward to welcoming you for a memorable dining experience.',
    },
    cancelled: {
      subject: `${config.restaurantName} reservation cancelled`,
      title: 'Reservation cancelled',
      badge: 'Cancelled',
      status: 'Cancelled',
      accent: '#B45252',
      message:
        'Your reservation has been cancelled. If this was unexpected, please contact the restaurant directly.',
    },
  }[event]

  const safeMessage = escapeHtml(eventConfig.message)
  const safeStatus = escapeHtml(eventConfig.status)
  const supportLines = [config.restaurantPhone, config.restaurantContactEmail]
    .filter(Boolean)
    .map((value) => escapeHtml(value))
    .join(' · ')
  const supportHtml = supportLines
    ? `<p style="margin:16px 0 0;font-size:13px;line-height:1.8;color:#bda98d;">Contact: ${supportLines}</p>`
    : ''

  const html = `
    <div style="margin:0;padding:24px;background:#140907;font-family:Arial,sans-serif;color:#f8f2e6;">
      <div style="max-width:640px;margin:0 auto;background:linear-gradient(180deg,#2d0f0f 0%,#1a0c0c 100%);border:1px solid #5a2620;border-radius:18px;overflow:hidden;">
        <div style="padding:32px 32px 20px;border-bottom:1px solid rgba(201,168,76,0.22);">
          <div style="font-size:12px;letter-spacing:0.25em;text-transform:uppercase;color:#c9a84c;margin-bottom:12px;">${safeRestaurantName}</div>
          <div style="font-family:Georgia,serif;font-size:32px;line-height:1.1;margin-bottom:12px;color:#f8f2e6;">${escapeHtml(eventConfig.title)}</div>
          <div style="display:inline-block;padding:8px 14px;border-radius:999px;background:${eventConfig.accent};color:#fff;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;">${escapeHtml(eventConfig.badge)}</div>
        </div>
        <div style="padding:32px;">
          <p style="margin:0 0 16px;font-size:16px;line-height:1.7;color:#f8f2e6;">Dear ${safeFullName},</p>
          <p style="margin:0 0 24px;font-size:15px;line-height:1.8;color:#eadfc6;">${safeMessage}</p>
          <div style="background:#160b0a;border:1px solid rgba(201,168,76,0.25);border-radius:14px;padding:22px;">
            <div style="font-size:12px;letter-spacing:0.22em;text-transform:uppercase;color:#c9a84c;margin-bottom:16px;">Reservation details</div>
            <table role="presentation" style="width:100%;border-collapse:collapse;">
              <tr>
                <td style="padding:10px 0;border-bottom:1px solid rgba(248,242,230,0.08);font-size:13px;color:#bda98d;">Guest</td>
                <td style="padding:10px 0;border-bottom:1px solid rgba(248,242,230,0.08);font-size:15px;color:#f8f2e6;text-align:right;">${safeFullName}</td>
              </tr>
              <tr>
                <td style="padding:10px 0;border-bottom:1px solid rgba(248,242,230,0.08);font-size:13px;color:#bda98d;">Date</td>
                <td style="padding:10px 0;border-bottom:1px solid rgba(248,242,230,0.08);font-size:15px;color:#f8f2e6;text-align:right;">${safeDate}</td>
              </tr>
              <tr>
                <td style="padding:10px 0;border-bottom:1px solid rgba(248,242,230,0.08);font-size:13px;color:#bda98d;">Time</td>
                <td style="padding:10px 0;border-bottom:1px solid rgba(248,242,230,0.08);font-size:15px;color:#f8f2e6;text-align:right;">${safeTime}</td>
              </tr>
              <tr>
                <td style="padding:10px 0;border-bottom:1px solid rgba(248,242,230,0.08);font-size:13px;color:#bda98d;">Status</td>
                <td style="padding:10px 0;border-bottom:1px solid rgba(248,242,230,0.08);font-size:15px;color:#f8f2e6;text-align:right;">${safeStatus}</td>
              </tr>
              <tr>
                <td style="padding:10px 0;font-size:13px;color:#bda98d;">Guests</td>
                <td style="padding:10px 0;font-size:15px;color:#f8f2e6;text-align:right;">${safeGuestLabel}</td>
              </tr>
            </table>
          </div>
          <p style="margin:24px 0 0;font-size:14px;line-height:1.8;color:#bda98d;">
            If you need to change this booking, please contact ${safeRestaurantName} directly.
          </p>
          ${supportHtml}
        </div>
      </div>
    </div>
  `

  const text = [
    `${config.restaurantName}`,
    `${eventConfig.title}`,
    '',
    `Dear ${fullName},`,
    eventConfig.message,
    '',
    `Date: ${formatReservationDate(record.date)}`,
    `Time: ${record.time}`,
    `Status: ${eventConfig.status}`,
    `Guests: ${guestLabel}`,
    ...(config.restaurantPhone ? [`Phone: ${config.restaurantPhone}`] : []),
    ...(config.restaurantContactEmail ? [`Email: ${config.restaurantContactEmail}`] : []),
  ].join('\n')

  return {
    subject: eventConfig.subject,
    html,
    text,
  }
}

async function sendEmail(
  to: string,
  subject: string,
  html: string,
  text: string,
  config: EnvConfig,
) {
  const replyTo = config.restaurantContactEmail || undefined
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.resendApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: config.resendFromEmail,
      to: [to],
      subject,
      html,
      text,
      ...(replyTo ? { reply_to: replyTo } : {}),
    }),
  })

  const data = await response.json()
  if (!response.ok) {
    const message = data?.message || data?.error || 'Failed to send email'
    throw new Error(message)
  }

  return data
}

async function claimNotification(recordId: string, event: NotificationEvent, config: EnvConfig) {
  const sentColumn = eventSentColumn(event)
  const processingColumn = eventProcessingColumn(event)
  const now = new Date().toISOString()
  const client = getAdminClient(config)

  const { data, error } = await client
    .from('reservations')
    .update({
      [processingColumn]: now,
      notification_last_attempt_at: now,
      notification_last_error: null,
    })
    .eq('id', recordId)
    .is(sentColumn, null)
    .is(processingColumn, null)
    .select('id')
    .maybeSingle()

  if (error) {
    throw error
  }

  return Boolean(data)
}

async function finalizeNotification(
  recordId: string,
  event: NotificationEvent,
  config: EnvConfig,
  errorMessage?: string,
) {
  const sentColumn = eventSentColumn(event)
  const processingColumn = eventProcessingColumn(event)
  const updates: Record<string, string | null> = {
    [processingColumn]: null,
    notification_last_attempt_at: new Date().toISOString(),
    notification_last_error: errorMessage ?? null,
  }

  if (!errorMessage) {
    updates[sentColumn] = new Date().toISOString()
  }

  const { error } = await getAdminClient(config)
    .from('reservations')
    .update(updates)
    .eq('id', recordId)

  if (error) {
    console.error('Failed to update notification fields', error)
  }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405)
  }

  const config = getEnvConfig()
  const missingEnv = getMissingEnv(config)
  if (missingEnv.length > 0) {
    return jsonResponse(
      { error: `Missing required environment variables: ${missingEnv.join(', ')}` },
      500,
    )
  }

  const incomingSecret = req.headers.get('x-webhook-secret')
  if (incomingSecret !== config.webhookSecret) {
    return jsonResponse({ error: 'Unauthorized webhook request' }, 401)
  }

  const payload = (await req.json()) as WebhookPayload
  const record = payload.record
  if (!record) {
    return jsonResponse({ skipped: true, reason: 'No reservation record in payload' })
  }

  const event = detectNotificationEvent(payload)
  if (!event) {
    return jsonResponse({ skipped: true, reason: 'No notification needed for this database event' })
  }

  if (!record.email) {
    await finalizeNotification(
      record.id,
      event,
      config,
      'Skipped email delivery because the reservation has no email address.',
    )
    return jsonResponse({ skipped: true, reason: 'Reservation does not include an email address' })
  }

  const wasClaimed = await claimNotification(record.id, event, config)
  if (!wasClaimed) {
    return jsonResponse({
      skipped: true,
      reason: 'Notification already sent or currently being processed for this event',
    })
  }

  try {
    const { subject, html, text } = buildEmailContent(record, event, config)
    const resendResult = await sendEmail(record.email, subject, html, text, config)
    await finalizeNotification(record.id, event, config)

    return jsonResponse({
      success: true,
      event,
      reservation_id: record.id,
      resend: resendResult,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown email error'
    await finalizeNotification(record.id, event, config, message)
    console.error('Reservation email failed', { event, reservationId: record.id, message })
    return jsonResponse({ error: message }, 500)
  }
})
