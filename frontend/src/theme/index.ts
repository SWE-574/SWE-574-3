import { createSystem, defaultConfig, defineConfig } from '@chakra-ui/react'

const config = defineConfig({
  theme: {
    tokens: {
      colors: {
        brand: {
          yellow: {
            50:  { value: '#FFF9E6' },
            100: { value: '#FFEFB8' },
            200: { value: '#FFE58A' },
            300: { value: '#FFDB5C' },
            400: { value: '#FFD12E' },
            500: { value: '#F8C84A' },
            600: { value: '#E0B23D' },
            700: { value: '#C89C30' },
            800: { value: '#B08623' },
            900: { value: '#987016' },
          },
          green: {
            50:  { value: '#E8F2ED' },
            100: { value: '#C5DDCE' },
            200: { value: '#A1C8AF' },
            300: { value: '#7EB390' },
            400: { value: '#5A9E71' },
            500: { value: '#2D5C4E' },
            600: { value: '#254C40' },
            700: { value: '#1D3C32' },
            800: { value: '#152C24' },
            900: { value: '#0D1C16' },
          },
        },
        background: {
          light:  { value: '#FFFFFF' },
          dark:   { value: '#1A202C' },
          cream:  { value: '#FFF9E6' },
        },
      },
      fonts: {
        heading: { value: `'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif` },
        body:    { value: `'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif` },
      },
      radii: {
        none: { value: '0' },
        sm:   { value: '0.125rem' },
        base: { value: '0.25rem' },
        md:   { value: '0.375rem' },
        lg:   { value: '0.5rem' },
        xl:   { value: '0.75rem' },
        '2xl': { value: '1rem' },
        '3xl': { value: '1.5rem' },
        full: { value: '9999px' },
      },
    },
    semanticTokens: {
      colors: {
        primary: {
          default: { value: '{colors.brand.yellow.500}' },
          _dark:   { value: '{colors.brand.yellow.400}' },
        },
        secondary: {
          default: { value: '{colors.brand.green.500}' },
          _dark:   { value: '{colors.brand.green.400}' },
        },
        'text.primary': {
          default: { value: '#1A202C' },
          _dark:   { value: '#F7FAFC' },
        },
        'text.secondary': {
          default: { value: '#4A5568' },
          _dark:   { value: '#A0AEC0' },
        },
        'text.light': {
          default: { value: '#718096' },
          _dark:   { value: '#718096' },
        },
      },
    },
  },
})

const system = createSystem(defaultConfig, config)

export default system
