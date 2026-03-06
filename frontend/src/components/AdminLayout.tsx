import { type ReactNode } from 'react'
import { Flex, Box } from '@chakra-ui/react'
import AdminSidebar, { type AdminTab } from '@/components/AdminSidebar'

interface AdminLayoutProps {
  children: ReactNode
  activeTab: AdminTab
  onTabChange: (tab: AdminTab) => void
}

const AdminLayout = ({ children, activeTab, onTabChange }: AdminLayoutProps) => {
  return (
    <Flex h="100vh" w="100%" overflow="hidden">
      {/* Fixed sidebar */}
      <AdminSidebar activeTab={activeTab} onTabChange={onTabChange} />

      {/* Main content area */}
      <Box flex={1} overflowY="auto" overflowX="hidden" bg="#FAFAFA">
        {children}
      </Box>
    </Flex>
  )
}

export default AdminLayout
