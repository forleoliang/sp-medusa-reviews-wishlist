import { ArrowUpRightOnBox, Trash } from "@medusajs/icons"
import {
  Badge,
  Button,
  Drawer,
  Prompt,
  Text,
  Textarea,
  toast,
} from "@medusajs/ui"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { Link } from "react-router-dom"
import {
  deleteReply,
  deleteReview,
  formatDateTime,
  getReview,
  KEY,
  lang,
  moderateReview,
  photoUrl,
  replyReview,
  REVIEWS_KEY,
} from "../lib/api"
import { Loading } from "./states"
import { Stars } from "./stars"
import { StatusBadge } from "./status-badge"

/** Full review for moderation: text, photos (pending ones streamed privately), approve / reject / delete, public reply. */
export const ReviewDrawer = ({
  id,
  onClose,
}: {
  id: string | null
  onClose: () => void
}) => {
  const { t, i18n } = useTranslation()
  const l = lang(i18n.language)
  const qc = useQueryClient()
  const { data, isLoading } = useQuery({
    queryKey: [...REVIEWS_KEY, "one", id],
    queryFn: () => getReview(id as string),
    enabled: !!id,
  })
  const review = data?.review
  const [reason, setReason] = useState("")
  const [reply, setReply] = useState("")
  const [confirmDelete, setConfirmDelete] = useState(false)

  useEffect(() => {
    setReply(review?.reply?.body ?? "")
    setReason(review?.reject_reason ?? "")
  }, [review?.id, review?.reply?.body, review?.reject_reason])

  const refresh = () => qc.invalidateQueries({ queryKey: KEY })
  const onError = (e: Error) => toast.error(e.message)

  const moderate = useMutation({
    mutationFn: (status: "approved" | "rejected") =>
      moderateReview(
        id as string,
        status,
        status === "rejected" ? reason.trim() || undefined : undefined
      ),
    onSuccess: (r) => {
      toast.success(t(`reviews.toast.${r.review.status}`))
      refresh()
    },
    onError,
  })

  const remove = useMutation({
    mutationFn: () => deleteReview(id as string),
    onSuccess: () => {
      toast.success(t("reviews.toast.deleted"))
      refresh()
      onClose()
    },
    onError,
  })

  const saveReply = useMutation({
    mutationFn: () => replyReview(id as string, reply.trim()),
    onSuccess: () => {
      toast.success(t("reviews.toast.replied"))
      refresh()
    },
    onError,
  })

  const removeReply = useMutation({
    mutationFn: () => deleteReply(id as string),
    onSuccess: () => {
      toast.success(t("reviews.toast.replyRemoved"))
      refresh()
    },
    onError,
  })

  return (
    <Drawer open={!!id} onOpenChange={(open) => !open && onClose()}>
      <Drawer.Content className="max-w-lg">
        <Drawer.Header>
          <Drawer.Title className="text-base font-semibold">{t("reviews.drawer.title")}</Drawer.Title>
        </Drawer.Header>

        <Drawer.Body className="flex flex-col gap-y-6 overflow-y-auto px-6 py-5">
          {isLoading || !review ? (
            <Loading />
          ) : (
            <>
              {/* Review Overview Card */}
              <div className="p-4 rounded-xl border border-ui-border-base bg-ui-bg-subtle/50 flex flex-col gap-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Stars rating={review.rating} size={16} />
                    <span className="text-xs font-mono font-semibold text-ui-fg-base">
                      {review.rating}.0 / 5
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <StatusBadge status={review.status} />
                    {review.verified && (
                      <Badge size="2xsmall" color="green">
                        {t("reviews.verified")}
                      </Badge>
                    )}
                    {review.source !== "store" && (
                      <Badge size="2xsmall" color="grey">
                        {t("reviews.source", { source: review.source })}
                      </Badge>
                    )}
                  </div>
                </div>

                {review.title && (
                  <Text size="base" weight="plus" className="text-ui-fg-base">
                    {review.title}
                  </Text>
                )}

                <Text size="small" className="whitespace-pre-wrap leading-relaxed text-ui-fg-subtle">
                  {review.body}
                </Text>

                <div className="pt-2 border-t border-ui-border-base/60 flex flex-wrap items-center justify-between gap-1 text-[11px] text-ui-fg-muted">
                  <span>{review.display_name} {review.email ? `(${review.email})` : ""}</span>
                  <span>{formatDateTime(review.created_at, l)}</span>
                </div>
              </div>

              {/* Linked Product & Order */}
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-lg border border-ui-border-base bg-ui-bg-subtle flex flex-col gap-1">
                  <Text size="xsmall" className="text-ui-fg-muted font-medium">Product</Text>
                  <Link
                    to={`/products/${review.product_id}`}
                    className="txt-compact-small flex items-center gap-1.5 text-ui-fg-interactive hover:underline truncate"
                  >
                    <ArrowUpRightOnBox width={14} height={14} className="shrink-0" />
                    <span className="truncate">{review.product_title ?? review.product_id}</span>
                  </Link>
                </div>
                <div className="p-3 rounded-lg border border-ui-border-base bg-ui-bg-subtle flex flex-col gap-1">
                  <Text size="xsmall" className="text-ui-fg-muted font-medium">Order</Text>
                  <Link
                    to={`/orders/${review.order_id}`}
                    className="txt-compact-small flex items-center gap-1.5 text-ui-fg-interactive hover:underline truncate"
                  >
                    <ArrowUpRightOnBox width={14} height={14} className="shrink-0" />
                    <span className="truncate">{review.order_display_id ? `#${review.order_display_id}` : review.order_id}</span>
                  </Link>
                </div>
              </div>

              {/* Customer Photos */}
              {review.images.length > 0 && (
                <div className="flex flex-col gap-2">
                  <Text size="small" weight="plus" className="text-ui-fg-base">
                    {t("reviews.drawer.photos", { count: review.images.length })}
                  </Text>
                  <div className="grid grid-cols-3 gap-2.5">
                    {review.images.map((img) =>
                      !img.available ? (
                        <div
                          key={img.id}
                          className="flex aspect-square items-center justify-center rounded-lg border border-dashed border-ui-border-base bg-ui-bg-subtle p-2 text-center"
                        >
                          <Text size="xsmall" className="text-ui-fg-muted">
                            {t("reviews.drawer.deletedPhoto")}
                          </Text>
                        </div>
                      ) : (
                        <a
                          key={img.id}
                          href={photoUrl(review.id, img.id)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="group relative block aspect-square overflow-hidden rounded-lg border border-ui-border-base bg-ui-bg-subtle"
                        >
                          <img
                            src={photoUrl(review.id, img.id)}
                            alt=""
                            className="h-full w-full object-cover transition-transform group-hover:scale-105"
                            loading="lazy"
                          />
                          {!img.published && (
                            <span className="absolute bottom-1.5 left-1.5">
                              <Badge size="2xsmall" color="orange">
                                {t("reviews.drawer.private")}
                              </Badge>
                            </span>
                          )}
                        </a>
                      )
                    )}
                  </div>
                  {review.images.some((i) => i.available && !i.published) && (
                    <Text size="xsmall" className="text-ui-fg-muted">
                      {t("reviews.drawer.photosHint")}
                    </Text>
                  )}
                </div>
              )}

              {/* Moderation Notes / History */}
              {review.status === "rejected" && review.reject_reason && (
                <div className="p-3 rounded-lg border border-red-200 dark:border-red-900/50 bg-red-50/50 dark:bg-red-950/20">
                  <Text size="xsmall" className="text-red-700 dark:text-red-300">
                    {t("reviews.drawer.rejectedWith", { reason: review.reject_reason })}
                  </Text>
                </div>
              )}

              {review.moderated_by && (
                <Text size="xsmall" className="text-ui-fg-muted">
                  {t("reviews.drawer.moderatedAt", {
                    date: formatDateTime(review.approved_at ?? review.rejected_at, l),
                  })}
                </Text>
              )}

              {/* Moderation Actions Box */}
              <div className="p-4 rounded-xl border border-ui-border-base bg-ui-bg-subtle/30 flex flex-col gap-3">
                <Text size="small" weight="plus" className="text-ui-fg-base">
                  {t("reviews.drawer.moderation")}
                </Text>
                <Textarea
                  rows={2}
                  placeholder={t("reviews.drawer.rejectReason")}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  maxLength={500}
                  className="bg-ui-bg-base"
                />
                <div className="flex flex-wrap items-center gap-2">
                  {review.status !== "approved" && (
                    <Button
                      size="small"
                      isLoading={moderate.isPending}
                      onClick={() => moderate.mutate("approved")}
                    >
                      {t("reviews.actions.approve")}
                    </Button>
                  )}
                  {review.status !== "rejected" && (
                    <Button
                      size="small"
                      variant="secondary"
                      isLoading={moderate.isPending}
                      onClick={() => moderate.mutate("rejected")}
                    >
                      {t("reviews.actions.reject")}
                    </Button>
                  )}
                  <Button
                    size="small"
                    variant="danger"
                    onClick={() => setConfirmDelete(true)}
                    className="ml-auto"
                  >
                    <Trash width={14} height={14} />
                    <span>{t("reviews.actions.delete")}</span>
                  </Button>
                </div>
              </div>

              {/* Store Reply Box */}
              <div className="p-4 rounded-xl border border-ui-border-base bg-ui-bg-subtle/30 flex flex-col gap-3">
                <div>
                  <Text size="small" weight="plus" className="text-ui-fg-base">
                    {t("reviews.drawer.reply")}
                  </Text>
                  <Text size="xsmall" className="text-ui-fg-muted mt-0.5">
                    {t("reviews.drawer.replyHint")}
                  </Text>
                </div>
                <Textarea
                  rows={3}
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  maxLength={5000}
                  className="bg-ui-bg-base"
                />
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Button
                      size="small"
                      disabled={!reply.trim() || reply.trim() === (review.reply?.body ?? "")}
                      isLoading={saveReply.isPending}
                      onClick={() => saveReply.mutate()}
                    >
                      {t("reviews.actions.saveReply")}
                    </Button>
                    {review.reply && (
                      <Button
                        size="small"
                        variant="transparent"
                        isLoading={removeReply.isPending}
                        onClick={() => removeReply.mutate()}
                      >
                        {t("reviews.actions.removeReply")}
                      </Button>
                    )}
                  </div>
                  {review.reply && (
                    <Text size="xsmall" className="text-ui-fg-muted">
                      {review.reply.author_name ?? ""} · {formatDateTime(review.reply.updated_at ?? review.reply.created_at, l)}
                    </Text>
                  )}
                </div>
              </div>
            </>
          )}
        </Drawer.Body>

        <Drawer.Footer>
          <Button variant="secondary" size="small" onClick={onClose}>
            {t("reviews.actions.close")}
          </Button>
        </Drawer.Footer>
      </Drawer.Content>

      <Prompt open={confirmDelete} onOpenChange={setConfirmDelete}>
        <Prompt.Content>
          <Prompt.Header>
            <Prompt.Title>{t("reviews.confirmDelete.title")}</Prompt.Title>
            <Prompt.Description>{t("reviews.confirmDelete.body", { count: 1 })}</Prompt.Description>
          </Prompt.Header>
          <Prompt.Footer>
            <Prompt.Cancel>{t("reviews.actions.cancel")}</Prompt.Cancel>
            <Prompt.Action onClick={() => remove.mutate()}>
              {t("reviews.actions.delete")}
            </Prompt.Action>
          </Prompt.Footer>
        </Prompt.Content>
      </Prompt>
    </Drawer>
  )
}
