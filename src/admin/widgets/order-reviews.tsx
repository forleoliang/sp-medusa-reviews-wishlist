import { defineWidgetConfig } from "@medusajs/admin-sdk"
import type { AdminOrder, DetailWidgetProps } from "@medusajs/framework/types"
import { Button, Container, Heading, Text, toast } from "@medusajs/ui"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { Link } from "react-router-dom"
import { Stars } from "../components/stars"
import { StatusBadge } from "../components/status-badge"
import { CONFIG_KEY, formatDateTime, getConfig, KEY, lang, listRequests, listReviews, REQUESTS_KEY, REVIEWS_KEY, scheduleRequest, sendRequest } from "../lib/api"

const SENDABLE = new Set(["scheduled", "sent", "failed", "expired", "skipped"])

/** Order page: the order's reviews and its review-request e-mail (status, send now). */
const OrderReviewsWidget = ({ data: order }: DetailWidgetProps<AdminOrder>) => {
  const { t, i18n } = useTranslation()
  const l = lang(i18n.language)
  const qc = useQueryClient()
  const { data: config } = useQuery({ queryKey: CONFIG_KEY, queryFn: getConfig, staleTime: Infinity })
  const { data: reviews } = useQuery({ queryKey: [...REVIEWS_KEY, "order", order.id], queryFn: () => listReviews({ order_id: order.id }, 0, 50) })
  const { data: requests } = useQuery({ queryKey: [...REQUESTS_KEY, "order", order.id], queryFn: () => listRequests({ order_id: order.id }, 0, 1) })
  const request = requests?.review_requests?.[0]
  const onError = (e: Error) => toast.error(e.message)
  const done = (sent: number, skipped: number) => {
    toast[sent ? "success" : "warning"](t(`reviews.requests.sendResult.${sent ? "sent" : skipped ? "skipped" : "failed"}`))
    qc.invalidateQueries({ queryKey: KEY })
  }
  const send = useMutation({ mutationFn: () => sendRequest(request!.id), onSuccess: (r) => done(r.summary.sent, r.summary.skipped), onError })
  const schedule = useMutation({
    mutationFn: () => scheduleRequest(order.id, true),
    onSuccess: (r) => (r.summary ? done(r.summary.sent, r.summary.skipped) : (toast.warning(t(`reviews.requests.scheduleResult.${r.status}`, { defaultValue: r.status })), qc.invalidateQueries({ queryKey: KEY }))),
    onError,
  })
  if (!reviews || !requests) return null
  const rows = reviews.reviews
  const enabled = config?.review_requests.enabled !== false

  return (
    <Container className="divide-y divide-ui-border-base p-0 overflow-hidden">
      <div className="px-6 py-4">
        <Heading level="h2" className="text-base font-semibold">{t("reviews.widget.order.title")}</Heading>
      </div>

      {rows.length === 0 ? (
        <div className="px-6 py-4">
          <Text size="small" className="text-ui-fg-subtle">{t("reviews.widget.order.none")}</Text>
        </div>
      ) : (
        <div className="divide-y divide-ui-border-base/50">
          {rows.map((r) => (
            <div key={r.id} className="flex flex-col gap-1.5 px-6 py-3.5 hover:bg-ui-bg-subtle/30 transition-colors">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Stars rating={r.rating} />
                <StatusBadge status={r.status} />
              </div>
              {r.title && (
                <Text size="small" weight="plus" className="text-ui-fg-base">
                  {r.title}
                </Text>
              )}
              <Text size="small" className="line-clamp-2 text-ui-fg-subtle leading-relaxed">
                {r.body}
              </Text>
              <Text size="xsmall" className="text-ui-fg-muted">
                {r.product_title ?? r.product_id} · {formatDateTime(r.created_at, l)}
              </Text>
            </div>
          ))}
        </div>
      )}

      {rows.length > 0 && (
        <div className="px-6 py-3 bg-ui-bg-subtle/30">
          <Button size="small" variant="secondary" asChild className="w-full justify-center">
            <Link to={`/reviews?order_id=${order.id}`}>{t("reviews.widget.order.open")}</Link>
          </Button>
        </div>
      )}

      <div className="flex flex-col gap-3 px-6 py-4">
        <Text size="small" weight="plus" className="text-ui-fg-base">
          {t("reviews.widget.order.request")}
        </Text>
        {request ? (
          <div className="flex flex-col gap-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <StatusBadge status={request.status} kind="request" />
              <Text size="xsmall" className="text-ui-fg-muted font-mono">
                {request.sent_at ? t("reviews.requests.sentAt", { date: formatDateTime(request.sent_at, l) }) : t("reviews.requests.scheduledAt", { date: formatDateTime(request.scheduled_at, l) })}
              </Text>
            </div>
            {request.last_error && <Text size="xsmall" className="text-ui-fg-error">{request.last_error}</Text>}
            {SENDABLE.has(request.status) && (
              <Button size="small" variant="secondary" isLoading={send.isPending} onClick={() => send.mutate()} className="w-full justify-center">
                {request.status === "sent" ? t("reviews.requests.resend") : t("reviews.requests.sendNow")}
              </Button>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <Text size="xsmall" className="text-ui-fg-muted">{enabled ? t("reviews.widget.order.noRequest") : t("reviews.requests.disabled")}</Text>
            <Button size="small" variant="secondary" isLoading={schedule.isPending} onClick={() => schedule.mutate()} className="w-full justify-center">
              {t("reviews.widget.order.sendRequest")}
            </Button>
          </div>
        )}
      </div>
    </Container>
  )
}

export const config = defineWidgetConfig({ zone: "order.details.side.after" })

export default OrderReviewsWidget
