import React from 'react'
import { Box } from '@chakra-ui/react'
import {
  GREEN, WHITE, GRAY200, GRAY500, GRAY600,
} from '@/theme/tokens'

// ── Shared segmented tab button ───────────────────────────────────────────────
// Used by UserProfile and PublicProfile tab bars.
// Provides proper ARIA tab semantics: role="tab", aria-selected, aria-controls.
// Wrap a group of TabBtns in <Box role="tablist">.
// Wrap each tab panel in <Box role="tabpanel" id={`panel-${tabKey}`} aria-labelledby={`tab-${tabKey}`}>.
export function TabBtn({
  tabKey,
  active,
  label,
  count,
  onClick,
  icon,
}: {
  tabKey: string
  active: boolean
  label: string
  count?: number
  onClick: () => void
  icon?: React.ReactNode
}) {
  return (
    <Box
      as="button"
      role="tab"
      id={`tab-${tabKey}`}
      aria-selected={active}
      aria-controls={`panel-${tabKey}`}
      onClick={onClick}
      px="12px"
      py="7px"
      borderRadius="999px"
      fontSize="12px"
      fontWeight={active ? 700 : 500}
      display="inline-flex"
      alignItems="center"
      gap="5px"
      style={{
        background: active ? GREEN : 'transparent',
        color: active ? WHITE : GRAY600,
        border: 'none',
        cursor: 'pointer',
        transition: 'background 0.12s, color 0.12s',
        whiteSpace: 'nowrap',
        flexShrink: 0,
      }}
    >
      {icon}
      {label}
      {count != null && (
        <Box
          px="5px"
          py="1px"
          borderRadius="999px"
          fontSize="10px"
          fontWeight={700}
          style={{
            background: active ? 'rgba(255,255,255,0.25)' : GRAY200,
            color: active ? WHITE : GRAY500,
            minWidth: '18px',
            textAlign: 'center',
          }}
        >
          {count}
        </Box>
      )}
    </Box>
  )
}

export default TabBtn
