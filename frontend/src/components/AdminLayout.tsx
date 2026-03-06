import React, { type ReactNode } from 'react'
import { Box } from '@chakra-ui/react'
import AdminSidebar, { type AdminTab } from '@/components/AdminSidebar'
import { GRAY50, GRAY200 } from '@/theme/tokens'

interface AdminLayoutProps {
  children: ReactNode
  activeTab: AdminTab
  onTabChange: (tab: AdminTab) => void
}

const AdminLayout = ({ children, activeTab, onTabChange }: AdminLayoutProps) => {
  return (
    /* Matches DashboardPage outer structure exactly */
    <Box bg={GRAY50} h="calc(100vh - 64px)" overflow="hidden" py={{ base: 0, md: '8px' }} px={{ base: 0, md: '12px' }}>
      <Box
        maxW="1440px" mx="auto"
        h={{ base: 'calc(100vh - 64px)', md: 'calc(100vh - 88px)' }}
        borderRadius={{ base: 0, md: '20px' }}
        boxShadow={{ base: 'none', md: '0 4px 24px rgba(0,0,0,0.08)' }}
        border={{ base: 'none', md: `1px solid ${GRAY200}` }}
        display="flex"
        overflow="hidden"
        position="relative"
      >
        {/* Sidebar */}
        <AdminSidebar activeTab={activeTab} onTabChange={onTabChange} />

        {/* Main content */}
        <Box
          flex={1} overflowY="auto" overflowX="hidden" bg={GRAY50}
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' } as React.CSSProperties}
        >
          {children}
        </Box>
      </Box>
    </Box>
  )
}

export default AdminLayout
