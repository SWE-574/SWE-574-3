import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import MultiUseDetailsModal from '@/components/MultiUseDetailsModal'
import { userAPI } from '@/services/userAPI'
import { getErrorMessage } from '@/services/api'
import type { UserSummary } from '@/types'

export type FollowListKind = 'followers' | 'following'

export default function FollowListModal({
  isOpen,
  listKind,
  userId,
  onClose,
}: {
  isOpen: boolean
  listKind: FollowListKind | null
  userId: string | null
  onClose: () => void
}) {
  const navigate = useNavigate()
  // null = loading/not-yet-fetched, [] = done (possibly empty)
  const [users, setUsers] = useState<UserSummary[] | null>(null)
  const loading = users === null

  useEffect(() => {
    if (!isOpen || !listKind || !userId) return
    const ac = new AbortController()
    const req =
      listKind === 'followers'
        ? userAPI.getFollowers(userId, ac.signal)
        : userAPI.getFollowing(userId, ac.signal)
    req
      .then(setUsers)
      .catch((err) => {
        if ((err as { name?: string }).name === 'CanceledError') return
        toast.error(getErrorMessage(err, 'Could not load list.'))
        setUsers([])
      })
    return () => {
      ac.abort()
      setUsers(null)
    }
  }, [isOpen, listKind, userId])

  if (!isOpen || !listKind || !userId) return null

  const title = listKind === 'followers' ? 'Followers' : 'Following'
  const items = (users ?? []).map((u) => {
    const name = `${u.first_name || ''} ${u.last_name || ''}`.trim() || u.email || 'User'
    return {
      id: u.id,
      title: name,
      avatarUrl: u.avatar_url ?? null,
      onClick: () => {
        onClose()
        navigate(`/public-profile/${u.id}`)
      },
    }
  })

  // Cap list height to ~5 rows; longer lists scroll inside the modal
  const listMaxHeight = 'min(300px, calc(80vh - 140px))'

  return (
    <MultiUseDetailsModal
      isOpen
      title={title}
      subtitle={loading ? undefined : `${users.length} ${listKind === 'followers' ? 'followers' : 'following'}`}
      items={items}
      onClose={onClose}
      loading={loading}
      emptyMessage="No users to show."
      listMaxHeight={listMaxHeight}
    />
  )
}
