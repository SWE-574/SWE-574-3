import { YELLOW, GREEN } from '@/theme/tokens'

export const Logo = ({ size = 32 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path 
      d="M20 2L35.5885 11V29L20 38L4.41154 29V11L20 2Z" 
      fill="#FFFFFF" 
      stroke={GREEN} 
      strokeWidth="2.5" 
      strokeLinejoin="round" 
    />
    <path 
      d="M20 9L29.5263 14.5V25.5L20 31L10.4737 25.5V14.5L20 9Z" 
      fill={GREEN} 
    />
    <path 
      d="M20 15L24.3301 17.5V22.5L20 25L15.6699 22.5V17.5L20 15Z" 
      fill={YELLOW} 
    />
  </svg>
)
