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
  const [loading, setLoading] = useState(false)
  const [users, setUsers] = useState<UserSummary[]>([])

  useEffect(() => {
    if (!isOpen || !listKind || !userId) {
      setUsers([])
      return
    }
    const ac = new AbortController()
    setLoading(true)
    const req =
      listKind === 'followers'
        ? userAPI.getFollowers(userId, ac.signal)
        : userAPI.getFollowing(userId, ac.signal)
    req
      .then(setUsers)
      .catch((err) => {
        toast.error(getErrorMessage(err, 'Could not load list.'))
        setUsers([])
      })
      .finally(() => setLoading(false))
    return () => ac.abort()
  }, [isOpen, listKind, userId])

  if (!isOpen || !listKind || !userId) return null

  const title = listKind === 'followers' ? 'Followers' : 'Following'
  const items = users.map((u) => {
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

  // ~5 satır yüksekliği; daha fazla kullanıcıda liste içinde kaydırma
  const listMaxHeight = 'min(300px, calc(80vh - 140px))'

  return (
    <MultiUseDetailsModal
      isOpen
      title={title}
      subtitle={!loading ? `${users.length} ${listKind === 'followers' ? 'followers' : 'following'}` : undefined}
      items={items}
      onClose={onClose}
      loading={loading}
      emptyMessage="No users to show."
      listMaxHeight={listMaxHeight}
    />
  )
}
