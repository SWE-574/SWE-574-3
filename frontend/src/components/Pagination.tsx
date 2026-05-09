import { Box, Flex } from '@chakra-ui/react'
import { FiChevronLeft, FiChevronRight } from 'react-icons/fi'
import { GRAY200, GRAY400, GRAY600, GRAY700, GREEN, WHITE } from '@/theme/tokens'

export interface PaginationProps {
  currentPage: number
  totalPages: number
  onChange: (page: number) => void
}

function buildRange(current: number, total: number): (number | 'ellipsis')[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1)
  }
  const pages: (number | 'ellipsis')[] = [1]
  const left = Math.max(2, current - 1)
  const right = Math.min(total - 1, current + 1)
  if (left > 2) pages.push('ellipsis')
  for (let p = left; p <= right; p++) pages.push(p)
  if (right < total - 1) pages.push('ellipsis')
  pages.push(total)
  return pages
}

export function Pagination({ currentPage, totalPages, onChange }: PaginationProps) {
  if (totalPages <= 1) return null
  const pages = buildRange(currentPage, totalPages)
  const canPrev = currentPage > 1
  const canNext = currentPage < totalPages

  return (
    <Flex justify="center" align="center" gap="6px" py="20px" wrap="wrap">
      <PageBtn
        ariaLabel="Previous page"
        disabled={!canPrev}
        onClick={() => canPrev && onChange(currentPage - 1)}
      >
        <FiChevronLeft size={14} />
      </PageBtn>
      {pages.map((p, i) =>
        p === 'ellipsis' ? (
          <Box
            key={`e-${i}`}
            px="6px"
            color={GRAY400}
            fontSize="13px"
            userSelect="none"
          >
            …
          </Box>
        ) : (
          <PageBtn
            key={p}
            active={p === currentPage}
            ariaLabel={`Page ${p}`}
            onClick={() => onChange(p)}
          >
            {p}
          </PageBtn>
        ),
      )}
      <PageBtn
        ariaLabel="Next page"
        disabled={!canNext}
        onClick={() => canNext && onChange(currentPage + 1)}
      >
        <FiChevronRight size={14} />
      </PageBtn>
    </Flex>
  )
}

interface PageBtnProps {
  children: React.ReactNode
  ariaLabel: string
  active?: boolean
  disabled?: boolean
  onClick?: () => void
}

function PageBtn({ children, ariaLabel, active, disabled, onClick }: PageBtnProps) {
  return (
    <Box
      as="button"
      aria-label={ariaLabel}
      aria-current={active ? 'page' : undefined}
      aria-disabled={disabled || undefined}
      onClick={disabled ? undefined : onClick}
      minW="32px"
      h="32px"
      px="10px"
      borderRadius="8px"
      border={`1px solid ${active ? GREEN : GRAY200}`}
      bg={active ? GREEN : WHITE}
      color={active ? WHITE : disabled ? GRAY400 : GRAY700}
      fontSize="13px"
      fontWeight={active ? 700 : 500}
      display="flex"
      alignItems="center"
      justifyContent="center"
      transition="background 0.12s, border-color 0.12s, color 0.12s"
      style={{
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.6 : 1,
      }}
      _hover={
        disabled || active
          ? {}
          : { bg: '#F9FAFB', borderColor: GRAY400, color: GRAY600 }
      }
    >
      {children}
    </Box>
  )
}

export default Pagination
