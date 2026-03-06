import { useState, useEffect } from 'react'
import { Box, Flex, Text, Button, VStack } from '@chakra-ui/react'
import {
  FiHome, FiUsers, FiAlertCircle, FiMessageSquare, FiMessageCircle, FiActivity, FiMenu, FiX,
} from 'react-icons/fi'
import { GREEN, GREEN_LT, GRAY500, GRAY700, WHITE, GRAY100 } from '@/theme/tokens'

export type AdminTab = 'dashboard' | 'users' | 'reports' | 'comments' | 'moderation' | 'audit'

interface AdminSidebarProps {
  activeTab: AdminTab
  onTabChange: (tab: AdminTab) => void
}

const navItems: Array<{ tab: AdminTab; label: string; icon: React.ReactNode }> = [
  { tab: 'dashboard', label: 'Dashboard', icon: <FiHome size={20} /> },
  { tab: 'users', label: 'User Management', icon: <FiUsers size={20} /> },
  { tab: 'reports', label: 'Reports & Flags', icon: <FiAlertCircle size={20} /> },
  { tab: 'comments', label: 'Comments', icon: <FiMessageSquare size={20} /> },
  { tab: 'moderation', label: 'Forum Topics', icon: <FiMessageCircle size={20} /> },
  { tab: 'audit', label: 'Audit Logs', icon: <FiActivity size={20} /> },
]

const MOBILE_BREAKPOINT = 768

const getSavedCollapsed = (): boolean => {
  if (typeof window === 'undefined') return false
  const saved = window.localStorage.getItem('adminSidebarCollapsed')
  if (!saved) return false

  try {
    return Boolean(JSON.parse(saved))
  } catch {
    return false
  }
}

const getIsMobileViewport = (): boolean => {
  if (typeof window === 'undefined') return false
  return window.innerWidth < MOBILE_BREAKPOINT
}

const AdminSidebar = ({ activeTab, onTabChange }: AdminSidebarProps) => {
  const [isMobile, setIsMobile] = useState(() => getIsMobileViewport())
  const [isCollapsed, setIsCollapsed] = useState(() => {
    if (getIsMobileViewport()) return true
    return getSavedCollapsed()
  })

  useEffect(() => {
    // Keep viewport state in sync and enforce mobile-first collapsed behavior.
    const checkMobile = () => {
      const mobile = getIsMobileViewport()
      setIsMobile(mobile)

      if (mobile) {
        setIsCollapsed(true)
      } else {
        setIsCollapsed(getSavedCollapsed())
      }
    }

    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  const handleToggleCollapse = () => {
    const newState = !isCollapsed
    setIsCollapsed(newState)
    window.localStorage.setItem('adminSidebarCollapsed', JSON.stringify(newState))
  }

  const sidebarWidth = isCollapsed ? '80px' : '240px'
  const showLabels = !isCollapsed

  return (
    <Flex direction="column" h="100vh" w={sidebarWidth} bg={WHITE} borderRight={`1px solid ${GRAY100}`} transition="width 0.2s" p={0}>
      {/* Header with collapse toggle */}
      <Flex align="center" justify="space-between" p={4} borderBottom={`1px solid ${GRAY100}`}>
        {showLabels && <Text fontSize="sm" fontWeight={700} color={GRAY700}>Admin Menu</Text>}
        {isMobile && (
          <Button
            size="sm"
            variant="ghost"
            onClick={handleToggleCollapse}
            aria-label="Toggle sidebar"
          >
            {isCollapsed ? <FiMenu size={20} /> : <FiX size={20} />}
          </Button>
        )}
        {!isMobile && (
          <Button size="sm" variant="ghost" onClick={handleToggleCollapse} aria-label="Toggle sidebar">
            {isCollapsed ? '→' : '←'}
          </Button>
        )}
      </Flex>

      {/* Navigation items */}
      <VStack gap={1} p={2} overflowY="auto" flex={1}>
        {navItems.map((item) => {
          const isActive = activeTab === item.tab
          return (
            <Button
              key={item.tab}
              w="full"
              justifyContent={showLabels ? 'flex-start' : 'center'}
              bg={isActive ? GREEN : 'transparent'}
              color={isActive ? WHITE : GRAY700}
              _hover={{
                bg: isActive ? GREEN : GREEN_LT,
                textDecoration: 'none',
              }}
              onClick={() => onTabChange(item.tab)}
              fontSize="sm"
              fontWeight={600}
              py={6}
              px={3}
              gap={3}
              borderRadius="8px"
              title={showLabels ? '' : item.label}
            >
              <Flex align="center" gap={3} w="full">
                <Box flexShrink={0}>{item.icon}</Box>
                {showLabels && <Text>{item.label}</Text>}
              </Flex>
            </Button>
          )
        })}
      </VStack>

      {/* Footer info */}
      {showLabels && (
        <Box p={3} borderTop={`1px solid ${GRAY100}`} bg={GREEN_LT} borderRadius="0 0 8px 0">
          <Text fontSize="xs" color={GREEN} fontWeight={600}>
            Moderation Tools
          </Text>
          <Text fontSize="xs" color={GRAY500} mt={1}>
            Use with care. All actions are logged.
          </Text>
        </Box>
      )}
    </Flex>
  )
}

export default AdminSidebar
