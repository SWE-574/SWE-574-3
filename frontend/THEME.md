# Frontend Design System

This document is the single source of truth for design decisions in the SWE-574-3 frontend.
Always consult this before adding new colours, spacing values, or typography overrides.

---

## 0. Design Philosophy

### What is Hive?

Hive is a **time-banking platform** — people exchange skills and services using time as the currency.
Someone teaches guitar for an hour; someone else fixes a bike for an hour. No money changes hands.
The product sits at the intersection of a **local marketplace**, a **community directory**, and a **messaging app**.

### Core design principles

**1. Calm confidence, not flashy**  
The UI should feel like a well-designed productivity tool — clean, structured, uncluttered.
No gradients that scream, no animations that distract. Subtle depth (soft shadows, 1px borders) creates hierarchy without noise.

**2. Content first**  
Service cards, user profiles, and conversations are the product. Chrome — navbars, sidebars, toolbars — exists only to serve the content. Reduce it whenever possible.

**3. Purposeful colour**  
Colour carries meaning, not decoration:
- **Green** → brand identity, trust, positive actions (confirm, accept, submit)
- **Amber** → Offers (someone giving their time — warm, generous)
- **Blue** → Needs (someone asking for help — calm, open)
- **Red** → Errors and destructive actions only
- **Gray scale** → Everything structural (backgrounds, borders, secondary text)

**4. Two-panel layout as the default mental model**  
Most pages follow a left sidebar + right content pattern — the same model users know from email clients and chat apps. This reduces cognitive load: navigation on the left, action on the right.

**5. Cards as the primary unit of information**  
Every piece of content lives in a card (`WHITE` background, `GRAY200` border, subtle shadow).
The entire page body is itself a card — visually lifted off the `GRAY50` page background.
This "card-in-card" pattern creates a clear depth hierarchy: page → panel → item.

**6. Responsive without compromise**  
On desktop the sidebar is always visible. On mobile it becomes a drawer.
The service grid collapses from 3 columns → 2 → 1. Cards never overflow or clip.
Typography and spacing scale down gracefully — never just "squished desktop".

### Visual personality

| Attribute     | Value                                               |
|---------------|-----------------------------------------------------|
| Tone          | Professional, trustworthy, approachable             |
| Density       | Medium — readable but information-rich              |
| Motion        | Minimal — only hover lifts and fade-ins             |
| Borders       | Everywhere. 1px `GRAY200`. No borderless flat look. |
| Shadows       | Soft (`rgba(0,0,0,0.06–0.10)`). Never hard or dark. |
| Border radius | 8–16px on cards, 6–8px on inputs, `full` on pills   |
| Font          | Inter — neutral, highly legible, modern sans-serif  |

### Page-level colour usage

```
Page background         → GRAY50   (off-white, never pure white)
Main container/card     → WHITE    with GRAY200 border + soft shadow
Sidebar / panel divider → WHITE    with right border GRAY200
Input backgrounds       → WHITE    (filled) or GRAY50 (subtle)
Section headers in forms→ GRAY50   with bottom border GRAY200
```

---

## 1. Colour Tokens (`src/theme/tokens.ts`)

Import named exports — never hardcode hex values inline.

```ts
import { GREEN, GRAY200, WHITE } from '@/theme/tokens'
```

### Brand

| Token       | Value     | Usage                                      |
|-------------|-----------|--------------------------------------------|
| `GREEN`     | `#2D5C4E` | Primary brand colour — buttons, links, active states |
| `GREEN_LT`  | `#F0FDF4` | Light tint for green backgrounds, hover fills |
| `GREEN_MD`  | `#D1FAE5` | Mid tint — badges, pills on green accent areas |
| `GREEN_DARK`| `#1A3A30` | Dark green shade for restrained brand gradients |
| `YELLOW`    | `#F8C84A` | Navbar logo accent, star ratings, highlights |

### Accent — Offer (warm)

| Token       | Value     | Usage                           |
|-------------|-----------|---------------------------------|
| `AMBER`     | `#D97706` | Offer badges, warm CTAs         |
| `AMBER_LT`  | `#FFFBEB` | Offer card background tint      |

### Accent — Need (cool)

| Token      | Value     | Usage                          |
|------------|-----------|--------------------------------|
| `BLUE`     | `#1D4ED8` | Need badges, cool CTAs         |
| `BLUE_LT`  | `#EFF6FF` | Need card background tint      |

### Accent — Tags / misc

| Token        | Value     | Usage                          |
|--------------|-----------|--------------------------------|
| `TEAL`       | `#0D9488` | Secondary avatar/accent colour |
| `ORANGE`     | `#EA580C` | Warm secondary accent colour   |
| `PURPLE`     | `#7C3AED` | Tag pills, secondary actions   |
| `PURPLE_LT`  | `#F3E8FF` | Tag pill background tint       |

### Semantic

| Token     | Value     | Usage                                    |
|-----------|-----------|------------------------------------------|
| `RED`     | `#DC2626` | Errors, destructive actions, form errors |
| `RED_LT`  | `#FEF2F2` | Error background tint                    |

### Neutrals

| Token     | Value     | Tailwind equivalent | Common usage                    |
|-----------|-----------|---------------------|---------------------------------|
| `WHITE`   | `#FFFFFF` | —                   | Card/panel backgrounds          |
| `GRAY50`  | `#F9FAFB` | gray-50             | Page background                 |
| `GRAY100` | `#F3F4F6` | gray-100            | Subtle dividers, input fills    |
| `GRAY200` | `#E5E7EB` | gray-200            | Borders, separators             |
| `GRAY300` | `#D1D5DB` | gray-300            | Disabled borders                |
| `GRAY400` | `#9CA3AF` | gray-400            | Placeholder text, icons         |
| `GRAY500` | `#6B7280` | gray-500            | Secondary text                  |
| `GRAY600` | `#4B5563` | gray-600            | Body text                       |
| `GRAY700` | `#374151` | gray-700            | Subheadings                     |
| `GRAY800` | `#1F2937` | gray-800            | Headings                        |
| `GRAY900` | `#111827` | gray-900            | Primary text, high-contrast UI  |

---

## 2. Chakra UI Theme (`src/theme/index.ts`)

The Chakra system is created in `src/theme/index.ts` and passed to `<ChakraProvider>` in `main.tsx`.

### Registered Chakra colour palettes

These can be used via the `colorPalette` prop or `{colors.brand.*}` token references.

**`brand.yellow`** — `50` → `900`  
Primary yellow scale based on `#F8C84A`.

**`brand.green`** — `50` → `900`  
Primary green scale based on `#2D5C4E`.

### Semantic tokens

| Token            | Light value               | Notes                      |
|------------------|---------------------------|----------------------------|
| `primary`        | `brand.yellow.500`        | Main action colour         |
| `secondary`      | `brand.green.500`         | Secondary action colour    |
| `text.primary`   | `#1A202C`                 | Default body text          |
| `text.secondary` | `#4A5568`                 | Subdued body text          |
| `text.light`     | `#718096`                 | Captions, metadata         |

### Border radius scale

| Token  | Value    |
|--------|----------|
| `sm`   | 0.125rem |
| `md`   | 0.375rem |
| `lg`   | 0.5rem   |
| `xl`   | 0.75rem  |
| `2xl`  | 1rem     |
| `3xl`  | 1.5rem   |
| `full` | 9999px   |

### Typography

Both `heading` and `body` use:

```
'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif
```

---

## 3. Layout Patterns

### Page shell

Every authenticated page wraps its content in the same shell:

```tsx
<Box bg={GRAY50} minH="calc(100vh - 64px)" py={{ base: 0, md: '16px' }} px={{ base: 0, md: '16px' }}>
  <Box
    maxW="1400px" mx="auto"
    borderRadius={{ base: 0, md: '20px' }}
    boxShadow={{ base: 'none', md: '0 4px 24px rgba(0,0,0,0.08)' }}
    border={{ base: 'none', md: `1px solid ${GRAY200}` }}
    overflow="hidden"
  >
    {/* page content */}
  </Box>
</Box>
```

### Two-panel layout (Dashboard, Chat)

```
┌──────────────────────────────────────────────┐
│  Navbar  (64px, full width)                  │
├────────────┬─────────────────────────────────┤
│  Sidebar   │  Main panel                     │
│  268px     │  flex: 1                        │
│  (hidden   │  overflow-y: auto               │
│  on mobile)│                                 │
└────────────┴─────────────────────────────────┘
```

- Sidebar width: `268px` (constant `SIDEBAR_W`).
- On mobile (`base`): sidebar slides in as an absolute overlay with a backdrop.
- Main panel: `<Flex direction="column" flex={1} overflow="hidden" minW={0}>`.

### Card / panel surface

```tsx
<Box bg={WHITE} borderRadius="12px" border={`1px solid ${GRAY200}`} boxShadow="0 1px 4px rgba(0,0,0,0.06)">
```

Hover lift effect on interactive cards:

```tsx
transition="transform 0.15s, box-shadow 0.15s"
_hover={{ transform: 'translateY(-2px)', boxShadow: '0 4px 16px rgba(0,0,0,0.10)' }}
```

---

## 4. Typography Scale (used in practice)

| Use               | `fontSize` | `fontWeight` | `color`   |
|-------------------|------------|--------------|-----------|
| Page heading      | `xl`       | `700`        | `GRAY800` |
| Section heading   | `md`       | `600`        | `GRAY700` |
| Card title        | `sm`       | `600`        | `GRAY800` |
| Body / label      | `sm`       | `400`        | `GRAY600` |
| Caption / meta    | `xs`       | `400`        | `GRAY500` |
| Tiny label / pill | `xs`       | `500`        | varies    |

---

## 5. Icon Library

Icons are from **`react-icons/fi`** (Feather Icons). Import pattern:

```ts
import { FiSearch, FiMapPin, FiClock } from 'react-icons/fi'
```

---

## 6. Spacing Conventions

| Purpose                        | Value              |
|--------------------------------|--------------------|
| Page horizontal padding        | `16px` (desktop), `12px` (mobile) |
| Section vertical gap           | `16px – 24px`      |
| Card internal padding          | `16px`             |
| Form field gap                 | `12px`             |
| Inline icon–text gap           | `6px – 8px`        |
| Navbar height                  | `64px`             |

---

## 7. Service Type Colour Map

| Type    | Badge colour | Background | Primary token |
|---------|-------------|------------|---------------|
| `Offer` | `AMBER`     | `AMBER_LT` | warm gradient |
| `Need`  | `BLUE`      | `BLUE_LT`  | cool gradient |

Gradient pattern for card headers:

```ts
// Offer
background: `linear-gradient(135deg, ${AMBER_LT} 0%, #FEF3C7 100%)`

// Need
background: `linear-gradient(135deg, ${BLUE_LT} 0%, #DBEAFE 100%)`
```

---

## 8. Toast Notifications

Use **Sonner** exclusively. Never use Chakra UI toasts.

```ts
import { toast } from 'sonner'

toast.success('Saved!')
toast.error('Something went wrong.')
```

---

## 9. Adding New Tokens

1. Add the value to `src/theme/tokens.ts` with an inline comment indicating the Tailwind/CSS equivalent.
2. If it belongs to a Chakra palette, register it in `src/theme/index.ts` as well.
3. Update the tables in this file.
