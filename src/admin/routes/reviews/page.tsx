import { defineRouteConfig } from "@medusajs/admin-sdk"
import { Photo, Star } from "@medusajs/icons"
import {
  Badge,
  Button,
  Checkbox,
  Container,
  Heading,
  Input,
  Prompt,
  Select,
  Table,
  Tabs,
  Text,
  toast,
} from "@medusajs/ui"
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { Link, useSearchParams } from "react-router-dom"
import { CreditFooter } from "../../components/credit-footer"
import { ReviewDrawer } from "../../components/review-drawer"
import { Loading } from "../../components/states"
import { Stars } from "../../components/stars"
import { StatusBadge } from "../../components/status-badge"
import {
  batchReviews,
  CONFIG_KEY,
  formatDateTime,
  getConfig,
  getStats,
  KEY,
  lang,
  listRequests,
  listReviews,
  REQUESTS_KEY,
  REVIEWS_KEY,
  type ReviewFilters,
  type ReviewStatus,
  scheduleRequest,
  sendRequest,
  STATS_KEY,
} from "../../lib/api"

const PAGE_SIZE = 20

const ReviewsPage = () => {
  const { t } = useTranslation()
  const [params, setParams] = useSearchParams()
  const tab = params.get("tab") === "requests" ? "requests" : "reviews"
  const setTab = (v: string) => {
    const next = new URLSearchParams(params)
    if (v === "requests") next.set("tab", "requests")
    else next.delete("tab")
    setParams(next, { replace: true })
  }

  return (
    <div className="flex flex-col gap-y-3">
      <Tabs value={tab} onValueChange={setTab}>
        <Container className="divide-y divide-ui-border-base p-0 overflow-hidden">
          {/* Header */}
          <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-4">
            <div>
              <Heading level="h1" className="text-ui-fg-base text-lg font-semibold">
                {t("reviews.title")}
              </Heading>
              <Text size="small" className="text-ui-fg-subtle mt-0.5">
                {t("reviews.description")}
              </Text>
            </div>
            <Tabs.List className="border border-ui-border-base bg-ui-bg-subtle p-0.5 rounded-lg">
              <Tabs.Trigger value="reviews" className="px-3 py-1.5 text-xs font-medium">
                {t("reviews.tabs.reviews")}
              </Tabs.Trigger>
              <Tabs.Trigger value="requests" className="px-3 py-1.5 text-xs font-medium">
                {t("reviews.tabs.requests")}
              </Tabs.Trigger>
            </Tabs.List>
          </div>

          <Tabs.Content value="reviews">
            <ReviewsTab />
          </Tabs.Content>
          <Tabs.Content value="requests">
            <RequestsTab />
          </Tabs.Content>
        </Container>
      </Tabs>
      <CreditFooter />
    </div>
  )
}

const ReviewsTab = () => {
  const { t, i18n } = useTranslation()
  const l = lang(i18n.language)
  const qc = useQueryClient()
  const [params, setParams] = useSearchParams()

  const filters: ReviewFilters = {
    status: (params.get("status") as ReviewStatus) || undefined,
    product_id: params.get("product_id") ?? undefined,
    order_id: params.get("order_id") ?? undefined,
    rating: params.get("rating") ? Number(params.get("rating")) : undefined,
    has_images: params.get("photos") === "1" ? true : undefined,
    q: params.get("q") ?? undefined,
    order: params.get("sort") ?? undefined,
  }

  const [search, setSearch] = useState(filters.q ?? "")
  const [offset, setOffset] = useState(0)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [open, setOpen] = useState<string | null>(params.get("review"))
  const [confirmDelete, setConfirmDelete] = useState(false)

  const setFilter = (k: string, v: string | null) => {
    const next = new URLSearchParams(params)
    if (v) next.set(k, v)
    else next.delete(k)
    setParams(next, { replace: true })
    setOffset(0)
    setSelected(new Set())
  }

  useEffect(() => {
    const h = setTimeout(
      () => (search !== (filters.q ?? "") ? setFilter("q", search.trim() || null) : undefined),
      350
    )
    return () => clearTimeout(h)
  }, [search])

  const { data: config } = useQuery({ queryKey: CONFIG_KEY, queryFn: getConfig, staleTime: Infinity })
  const { data: stats } = useQuery({
    queryKey: [...STATS_KEY, filters.product_id],
    queryFn: () => getStats(filters.product_id),
    refetchInterval: 30_000,
  })
  const { data, isLoading, isError } = useQuery({
    queryKey: [...REVIEWS_KEY, "list", filters, offset],
    queryFn: () => listReviews(filters, offset, PAGE_SIZE),
    placeholderData: keepPreviousData,
    refetchInterval: 30_000,
  })

  const rows = data?.reviews ?? []
  const count = data?.count ?? 0
  const allOnPage = rows.length > 0 && rows.every((r) => selected.has(r.id))

  const bulk = useMutation({
    mutationFn: (body: { status?: "approved" | "rejected"; delete?: boolean }) =>
      batchReviews({ ids: [...selected], ...body }),
    onSuccess: (_r, body) => {
      toast.success(
        body.delete
          ? t("reviews.toast.deletedMany", { count: selected.size })
          : t(`reviews.toast.${body.status}Many`, { count: selected.size })
      )
      setSelected(new Set())
      qc.invalidateQueries({ queryKey: KEY })
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })

  const STATUS_ITEMS = [
    { key: "all", label: t("reviews.summary.all") },
    { key: "pending", label: t("reviews.summary.pending"), countColor: "orange" },
    { key: "approved", label: t("reviews.summary.approved"), countColor: "green" },
    { key: "rejected", label: t("reviews.summary.rejected"), countColor: "grey" },
  ] as const

  return (
    <div className="divide-y divide-ui-border-base">
      {/* Sleek status pill filter */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-3 bg-ui-bg-subtle/40">
        <div className="inline-flex items-center gap-1 p-1 bg-ui-bg-subtle rounded-lg border border-ui-border-base">
          {STATUS_ITEMS.map((item) => {
            const isActive = item.key === "all" ? !filters.status : filters.status === item.key
            const countVal = item.key === "all" ? stats?.total ?? 0 : stats?.[item.key] ?? 0
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => setFilter("status", item.key === "all" || filters.status === item.key ? null : item.key)}
                className={`inline-flex items-center gap-2 px-3 py-1 rounded-md text-xs font-medium transition-all ${
                  isActive
                    ? "bg-ui-bg-base text-ui-fg-base shadow-borders-base font-semibold"
                    : "text-ui-fg-subtle hover:text-ui-fg-base hover:bg-ui-bg-base/60"
                }`}
              >
                <span>{item.label}</span>
                <span
                  className={`px-1.5 py-0.2 rounded-full text-[11px] font-mono leading-tight ${
                    item.key === "pending" && countVal > 0
                      ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 font-semibold"
                      : isActive
                        ? "bg-ui-bg-subtle text-ui-fg-subtle"
                        : "text-ui-fg-muted"
                  }`}
                >
                  {countVal}
                </span>
              </button>
            )
          })}
        </div>

        {config?.auto_approve && (
          <Badge size="2xsmall" color="blue">
            {t("reviews.autoApproveOn")}
          </Badge>
        )}
      </div>

      {/* Filter toolbar */}
      <div className="flex flex-wrap items-center gap-2 px-6 py-3">
        <Input
          size="small"
          type="search"
          placeholder={t("reviews.search")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full sm:w-60"
        />
        <Select
          size="small"
          value={filters.rating ? String(filters.rating) : "all"}
          onValueChange={(v) => setFilter("rating", v === "all" ? null : v)}
        >
          <Select.Trigger className="w-32">
            <Select.Value />
          </Select.Trigger>
          <Select.Content>
            <Select.Item value="all">{t("reviews.filters.anyRating")}</Select.Item>
            {[5, 4, 3, 2, 1].map((n) => (
              <Select.Item key={n} value={String(n)}>
                {t("reviews.filters.stars", { count: n })}
              </Select.Item>
            ))}
          </Select.Content>
        </Select>

        <Select
          size="small"
          value={filters.has_images ? "1" : "all"}
          onValueChange={(v) => setFilter("photos", v === "all" ? null : v)}
        >
          <Select.Trigger className="w-40">
            <Select.Value />
          </Select.Trigger>
          <Select.Content>
            <Select.Item value="all">{t("reviews.filters.withOrWithoutPhotos")}</Select.Item>
            <Select.Item value="1">{t("reviews.filters.withPhotos")}</Select.Item>
          </Select.Content>
        </Select>

        <Select
          size="small"
          value={filters.order ?? "-created_at"}
          onValueChange={(v) => setFilter("sort", v === "-created_at" ? null : v)}
        >
          <Select.Trigger className="w-36">
            <Select.Value />
          </Select.Trigger>
          <Select.Content>
            <Select.Item value="-created_at">{t("reviews.sort.newest")}</Select.Item>
            <Select.Item value="created_at">{t("reviews.sort.oldest")}</Select.Item>
            <Select.Item value="-rating">{t("reviews.sort.highest")}</Select.Item>
            <Select.Item value="rating">{t("reviews.sort.lowest")}</Select.Item>
          </Select.Content>
        </Select>

        {(filters.product_id || filters.order_id) && (
          <Button
            size="small"
            variant="secondary"
            onClick={() => {
              setFilter("product_id", null)
              setFilter("order_id", null)
            }}
          >
            {filters.product_id ? t("reviews.filters.clearProduct") : t("reviews.filters.clearOrder")}
          </Button>
        )}
      </div>

      {/* Bulk actions bar */}
      {selected.size > 0 && (
        <div className="bg-ui-bg-subtle border-y border-ui-border-base flex flex-wrap items-center justify-between gap-2 px-6 py-2.5">
          <Text size="small" weight="plus" className="text-ui-fg-base">
            {t("reviews.selected", { count: selected.size })}
          </Text>
          <div className="flex items-center gap-2">
            <Button
              size="small"
              isLoading={bulk.isPending}
              onClick={() => bulk.mutate({ status: "approved" })}
            >
              {t("reviews.actions.approve")}
            </Button>
            <Button
              size="small"
              variant="secondary"
              isLoading={bulk.isPending}
              onClick={() => bulk.mutate({ status: "rejected" })}
            >
              {t("reviews.actions.reject")}
            </Button>
            <Button
              size="small"
              variant="danger"
              onClick={() => setConfirmDelete(true)}
            >
              {t("reviews.actions.delete")}
            </Button>
            <Button
              size="small"
              variant="transparent"
              onClick={() => setSelected(new Set())}
            >
              {t("reviews.actions.clearSelection")}
            </Button>
          </div>
        </div>
      )}

      {/* Main Reviews Table */}
      {isLoading ? (
        <Loading />
      ) : isError ? (
        <div className="px-6 py-12 text-center text-ui-fg-error">
          <Text>{t("reviews.loadError")}</Text>
        </div>
      ) : rows.length === 0 ? (
        <div className="px-6 py-12 text-center text-ui-fg-subtle">
          <Text>{t("reviews.empty")}</Text>
        </div>
      ) : (
        <Table>
          <Table.Header>
            <Table.Row>
              <Table.HeaderCell className="w-12 pl-6">
                <Checkbox
                  checked={allOnPage}
                  onCheckedChange={() => setSelected(allOnPage ? new Set() : new Set(rows.map((r) => r.id)))}
                />
              </Table.HeaderCell>
              <Table.HeaderCell className="w-28">Status</Table.HeaderCell>
              <Table.HeaderCell className="w-28">Rating</Table.HeaderCell>
              <Table.HeaderCell>Review</Table.HeaderCell>
              <Table.HeaderCell className="w-44">Product</Table.HeaderCell>
              <Table.HeaderCell className="w-36">Customer</Table.HeaderCell>
              <Table.HeaderCell className="w-32 pr-6 text-right">Date</Table.HeaderCell>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {rows.map((r) => (
              <Table.Row
                key={r.id}
                className="cursor-pointer transition-colors hover:bg-ui-bg-base-hover"
                onClick={() => setOpen(r.id)}
              >
                <Table.Cell className="w-12 pl-6" onClick={(e) => e.stopPropagation()}>
                  <Checkbox checked={selected.has(r.id)} onCheckedChange={() => toggle(r.id)} />
                </Table.Cell>
                <Table.Cell>
                  <StatusBadge status={r.status} />
                </Table.Cell>
                <Table.Cell>
                  <div className="flex items-center gap-1.5">
                    <Stars rating={r.rating} />
                    {r.images.length > 0 && (
                      <span className="inline-flex items-center gap-0.5 text-ui-fg-muted" title={`${r.images.length} photos`}>
                        <Photo width={13} height={13} />
                        <span className="text-[11px] font-mono">{r.images.length}</span>
                      </span>
                    )}
                  </div>
                </Table.Cell>
                <Table.Cell>
                  <div className="flex flex-col gap-0.5 max-w-lg py-1">
                    {r.title && (
                      <Text size="small" weight="plus" className="text-ui-fg-base truncate">
                        {r.title}
                      </Text>
                    )}
                    <Text size="small" className="text-ui-fg-subtle line-clamp-1">
                      {r.body}
                    </Text>
                    {r.reply && (
                      <div className="mt-1 flex items-center gap-1.5">
                        <Badge size="2xsmall" color="grey">{t("reviews.replied")}</Badge>
                        <span className="text-[11px] text-ui-fg-muted line-clamp-1 italic">
                          "{r.reply.body}"
                        </span>
                      </div>
                    )}
                  </div>
                </Table.Cell>
                <Table.Cell>
                  <Text size="small" className="text-ui-fg-base truncate max-w-[170px]" title={r.product_title ?? r.product_id}>
                    {r.product_title ?? r.product_id}
                  </Text>
                </Table.Cell>
                <Table.Cell>
                  <div className="flex flex-col">
                    <Text size="small" weight="plus" className="text-ui-fg-base">
                      {r.display_name}
                    </Text>
                    {r.email && (
                      <Text size="xsmall" className="text-ui-fg-muted truncate max-w-[140px]">
                        {r.email}
                      </Text>
                    )}
                  </div>
                </Table.Cell>
                <Table.Cell className="pr-6 text-right">
                  <Text size="xsmall" className="text-ui-fg-muted whitespace-nowrap">
                    {formatDateTime(r.created_at, l)}
                  </Text>
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table>
      )}

      {/* Pagination */}
      <Table.Pagination
        count={count}
        pageSize={PAGE_SIZE}
        pageIndex={Math.floor(offset / PAGE_SIZE)}
        pageCount={Math.ceil(count / PAGE_SIZE) || 1}
        canPreviousPage={offset > 0}
        canNextPage={offset + PAGE_SIZE < count}
        previousPage={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
        nextPage={() => setOffset(offset + PAGE_SIZE)}
      />

      <ReviewDrawer id={open} onClose={() => setOpen(null)} />
      <Prompt open={confirmDelete} onOpenChange={setConfirmDelete}>
        <Prompt.Content>
          <Prompt.Header>
            <Prompt.Title>{t("reviews.confirmDelete.title")}</Prompt.Title>
            <Prompt.Description>{t("reviews.confirmDelete.body", { count: selected.size })}</Prompt.Description>
          </Prompt.Header>
          <Prompt.Footer>
            <Prompt.Cancel>{t("reviews.actions.cancel")}</Prompt.Cancel>
            <Prompt.Action onClick={() => bulk.mutate({ delete: true })}>{t("reviews.actions.delete")}</Prompt.Action>
          </Prompt.Footer>
        </Prompt.Content>
      </Prompt>
    </div>
  )
}

const SENDABLE = new Set(["scheduled", "sent", "failed", "expired", "skipped"])

const RequestsTab = () => {
  const { t, i18n } = useTranslation()
  const l = lang(i18n.language)
  const qc = useQueryClient()
  const [status, setStatus] = useState("all")
  const [offset, setOffset] = useState(0)
  const [orderId, setOrderId] = useState("")

  const { data: config } = useQuery({ queryKey: CONFIG_KEY, queryFn: getConfig, staleTime: Infinity })
  const { data, isLoading } = useQuery({
    queryKey: [...REQUESTS_KEY, status, offset],
    queryFn: () => listRequests({ status: status === "all" ? undefined : status }, offset, PAGE_SIZE),
    placeholderData: keepPreviousData,
    refetchInterval: 30_000,
  })

  const rows = data?.review_requests ?? []
  const count = data?.count ?? 0
  const onError = (e: Error) => toast.error(e.message)

  const send = useMutation({
    mutationFn: (id: string) => sendRequest(id),
    onSuccess: (r) => {
      toast[r.summary.sent ? "success" : "warning"](
        t(`reviews.requests.sendResult.${r.summary.sent ? "sent" : r.summary.skipped ? "skipped" : "failed"}`)
      )
      qc.invalidateQueries({ queryKey: REQUESTS_KEY })
    },
    onError,
  })

  const schedule = useMutation({
    mutationFn: (sendNow: boolean) => scheduleRequest(orderId.trim(), sendNow),
    onSuccess: (r) => {
      toast[r.status === "scheduled" || r.status === "exists" ? "success" : "warning"](
        t(`reviews.requests.scheduleResult.${r.status}`, { defaultValue: r.status })
      )
      setOrderId("")
      qc.invalidateQueries({ queryKey: REQUESTS_KEY })
    },
    onError,
  })

  const rr = config?.review_requests

  return (
    <div className="divide-y divide-ui-border-base">
      {/* Config Banner */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-6 py-3 bg-ui-bg-subtle/40">
        <Text size="small" className="text-ui-fg-subtle">
          {rr ? t("reviews.requests.settings", { trigger: t(`reviews.requests.trigger.${rr.trigger}`), days: rr.delay_days, ttl: rr.token_ttl_days }) : ""}
          {rr && rr.rules > 0 ? ` ${t("reviews.requests.rules", { count: rr.rules })}` : ""}
        </Text>
        <div className="flex items-center gap-2">
          {rr && !rr.enabled && <Badge size="2xsmall" color="grey">{t("reviews.requests.disabled")}</Badge>}
          {rr && rr.enabled && !rr.link_url_configured && <Badge size="2xsmall" color="red">{t("reviews.requests.noLinkUrl")}</Badge>}
        </div>
      </div>

      {/* Action Toolbar */}
      <div className="flex flex-col gap-2 px-6 py-3 sm:flex-row sm:items-center">
        <Input
          size="small"
          placeholder={t("reviews.requests.orderIdPlaceholder")}
          value={orderId}
          onChange={(e) => setOrderId(e.target.value)}
          className="w-full sm:w-64"
        />
        <Button
          size="small"
          variant="secondary"
          disabled={!orderId.trim()}
          isLoading={schedule.isPending}
          onClick={() => schedule.mutate(false)}
        >
          {t("reviews.requests.schedule")}
        </Button>
        <Button
          size="small"
          variant="secondary"
          disabled={!orderId.trim()}
          isLoading={schedule.isPending}
          onClick={() => schedule.mutate(true)}
        >
          {t("reviews.requests.scheduleAndSend")}
        </Button>

        <div className="sm:ml-auto w-full sm:w-48">
          <Select value={status} onValueChange={(v) => (setStatus(v), setOffset(0))} size="small">
            <Select.Trigger>
              <Select.Value />
            </Select.Trigger>
            <Select.Content>
              <Select.Item value="all">{t("reviews.requests.allStatuses")}</Select.Item>
              {["scheduled", "sent", "used", "expired", "skipped", "failed", "opted_out"].map((s) => (
                <Select.Item key={s} value={s}>
                  {t(`reviews.requestStatus.${s}`)}
                </Select.Item>
              ))}
            </Select.Content>
          </Select>
        </div>
      </div>

      {/* Requests Table */}
      {isLoading ? (
        <Loading />
      ) : rows.length === 0 ? (
        <div className="px-6 py-12 text-center text-ui-fg-subtle">
          <Text>{t("reviews.requests.empty")}</Text>
        </div>
      ) : (
        <Table>
          <Table.Header>
            <Table.Row>
              <Table.HeaderCell className="w-28 pl-6">Status</Table.HeaderCell>
              <Table.HeaderCell>Recipient</Table.HeaderCell>
              <Table.HeaderCell>Order</Table.HeaderCell>
              <Table.HeaderCell>Trigger</Table.HeaderCell>
              <Table.HeaderCell>Timeline</Table.HeaderCell>
              <Table.HeaderCell className="pr-6 text-right">Actions</Table.HeaderCell>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {rows.map((r) => (
              <Table.Row key={r.id}>
                <Table.Cell className="pl-6">
                  <StatusBadge status={r.status} kind="request" />
                </Table.Cell>
                <Table.Cell>
                  <Text size="small" weight="plus" className="text-ui-fg-base">
                    {r.email}
                  </Text>
                  {r.last_error && <Text size="xsmall" className="text-ui-fg-error">{r.last_error}</Text>}
                </Table.Cell>
                <Table.Cell>
                  <Link to={`/orders/${r.order_id}`} className="txt-compact-small text-ui-fg-interactive hover:underline">
                    {r.order_id}
                  </Link>
                </Table.Cell>
                <Table.Cell>
                  <Text size="xsmall" className="text-ui-fg-muted">
                    {t(`reviews.requests.trigger.${r.trigger}`, { defaultValue: r.trigger })} +{r.delay_days}d
                  </Text>
                </Table.Cell>
                <Table.Cell>
                  <div className="flex flex-col text-xs text-ui-fg-muted">
                    <span>{t("reviews.requests.scheduledAt", { date: formatDateTime(r.scheduled_at, l) })}</span>
                    {r.sent_at && <span>{t("reviews.requests.sentAt", { date: formatDateTime(r.sent_at, l) })}</span>}
                  </div>
                </Table.Cell>
                <Table.Cell className="pr-6 text-right">
                  {SENDABLE.has(r.status) && (
                    <Button
                      size="small"
                      variant="secondary"
                      isLoading={send.isPending && send.variables === r.id}
                      onClick={() => send.mutate(r.id)}
                    >
                      {r.status === "sent" ? t("reviews.requests.resend") : t("reviews.requests.sendNow")}
                    </Button>
                  )}
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table>
      )}

      {/* Pagination */}
      <Table.Pagination
        count={count}
        pageSize={PAGE_SIZE}
        pageIndex={Math.floor(offset / PAGE_SIZE)}
        pageCount={Math.ceil(count / PAGE_SIZE) || 1}
        canPreviousPage={offset > 0}
        canNextPage={offset + PAGE_SIZE < count}
        previousPage={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
        nextPage={() => setOffset(offset + PAGE_SIZE)}
      />
    </div>
  )
}

export const config = defineRouteConfig({
  label: "Reviews",
  icon: Star,
})

export const handle = {
  breadcrumb: () => <Breadcrumb />,
}

const Breadcrumb = () => {
  const { t } = useTranslation()
  return <>{t("reviews.label")}</>
}

export default ReviewsPage
